/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  Firestore,
} from 'firebase/firestore';
import {
  ComponentDraftRecord,
  ComponentDraftStatus,
  ComponentInspectionReport,
  ConveyorAsset,
  ConveyorCondition,
  InspectionPhoto,
  InspectionRecord,
  PhotoAuditEvent,
  PriorityLevel,
  buildComponentReportsFromSession,
  deriveSessionStatus,
  reconcileAssetCondition,
  toComponentSlug,
  validatePhotoAssociation,
  validateSessionFinalization,
} from '../types/conveyor';
import {
  DEFAULT_WORKSPACE_ID,
  deduplicatePhotos,
  isCloudUploadedPhoto,
  sanitizePhotoForFirestore,
} from './photoStorage';

export const DEFAULT_INSPECTION_COMPONENTS = [
  'Belt Carcass & Top Cover',
  'Carrying Troughing Idlers',
  'Return Flat Idlers',
  'Head Drive Pulley & Lagging',
  'Tail Take-Up Pulley',
  'Drive Motor & Gearbox',
  'Primary Belt Scraper Cleaner',
  'Skirtboard Rubber Sealing',
];

export function authorizeDraftAccess(
  session: Pick<InspectionRecord, 'id' | 'inspectorId' | 'workspaceId'>,
  actorId: string,
  actorWorkspaceId: string = DEFAULT_WORKSPACE_ID
): void {
  if (!actorId) {
    throw new Error('Authentication required to access or modify an inspection draft.');
  }
  const sessionWorkspace = session.workspaceId || DEFAULT_WORKSPACE_ID;
  if (sessionWorkspace !== actorWorkspaceId) {
    throw new Error(
      `Cross-workspace access denied for draft session ${session.id}.`
    );
  }
  if (session.inspectorId && session.inspectorId !== actorId) {
    throw new Error(
      `Unauthorized: draft session ${session.id} belongs to another inspector.`
    );
  }
}

export function createDraftSessionData(params: {
  sessionId: string;
  asset: ConveyorAsset;
  inspectorName: string;
  inspectorId: string;
  workspaceId?: string;
  componentNames?: string[];
  priority?: PriorityLevel;
  now?: string;
}): InspectionRecord {
  const {
    sessionId,
    asset,
    inspectorName,
    inspectorId,
    workspaceId = DEFAULT_WORKSPACE_ID,
    componentNames = DEFAULT_INSPECTION_COMPONENTS,
    priority = 'low',
    now = new Date().toISOString(),
  } = params;

  const componentDrafts: Record<string, ComponentDraftRecord> = {};
  componentNames.forEach((compName) => {
    componentDrafts[compName] = {
      componentName: compName,
      componentSlug: toComponentSlug(compName),
      status: 'NOT_STARTED',
      photoIds: [],
      version: 0,
    };
  });

  return {
    id: sessionId,
    workspaceId,
    status: 'DRAFT',
    site: asset.location,
    assetId: asset.id,
    assetName: asset.name,
    inspectorName: inspectorName.trim() || 'Inspector',
    inspectorId,
    inspectionDate: now,
    overallCondition: 'good',
    components: {},
    componentCurrentConditions: {},
    componentDrafts,
    componentNotes: {},
    componentRecommendations: {},
    findings: '',
    recommendations: '',
    priority,
    photos: [],
    generalPhotos: [],
    lastSavedAt: now,
    version: 1,
    createdAt: now,
  };
}

export function applyComponentSaveToSession(params: {
  session: InspectionRecord;
  componentName: string;
  componentStatus: Extract<ComponentDraftStatus, 'SAVED' | 'COMPLETED' | 'NOT_APPLICABLE'>;
  condition?: ConveyorCondition;
  observations?: string;
  findings?: string;
  recommendations?: string;
  notApplicableReason?: string;
  componentPhotos: InspectionPhoto[];
  actorName: string;
  actorId: string;
  actorWorkspaceId?: string;
  expectedSessionVersion?: number;
  requireCloudStoragePhotos?: boolean;
  now?: string;
}): {
  updatedSession: InspectionRecord;
  updatedComponentDraft: ComponentDraftRecord;
} {
  const {
    session,
    componentName,
    componentStatus,
    condition,
    observations = '',
    findings = '',
    recommendations = '',
    notApplicableReason = '',
    componentPhotos,
    actorName,
    actorId,
    actorWorkspaceId = DEFAULT_WORKSPACE_ID,
    expectedSessionVersion,
    requireCloudStoragePhotos = false,
    now = new Date().toISOString(),
  } = params;

  authorizeDraftAccess(session, actorId, actorWorkspaceId);

  if (session.status === 'FINALIZED') {
    throw new Error(`Inspection session ${session.id} is already FINALIZED and immutable.`);
  }
  if (session.status === 'CANCELLED') {
    throw new Error(`Inspection session ${session.id} was CANCELLED and cannot be edited.`);
  }
  if (
    expectedSessionVersion !== undefined &&
    session.version !== undefined &&
    expectedSessionVersion !== session.version
  ) {
    throw new Error(
      `Version conflict on ${session.id}: expected v${expectedSessionVersion}, found v${session.version}. Resume latest draft before saving.`
    );
  }

  if (componentStatus === 'NOT_APPLICABLE') {
    if (!notApplicableReason.trim()) {
      throw new Error(`Please provide a reason before marking "${componentName}" as Not Applicable.`);
    }
  } else {
    if (!condition) {
      throw new Error(`Condition rating is required to save "${componentName}".`);
    }
    if ((condition === 'worn' || condition === 'damaged') && !findings.trim() && !observations.trim()) {
      throw new Error(
        `Please enter observations or defect findings for "${componentName}" (${condition.toUpperCase()}) before saving.`
      );
    }
  }

  const validComponentNames =
    Object.keys(session.componentDrafts || {}).length > 0
      ? Object.keys(session.componentDrafts || {})
      : DEFAULT_INSPECTION_COMPONENTS;
  if (!validComponentNames.includes(componentName)) {
    throw new Error(`Component "${componentName}" is not part of session ${session.id}.`);
  }

  // Validate photos for THIS component only (never block on other components' photos)
  for (const photo of componentPhotos) {
    if (photo.uploadStatus === 'uploading') {
      throw new Error(`Photo upload for "${componentName}" is still in progress.`);
    }
    if (photo.uploadStatus === 'failed') {
      throw new Error(`A photo upload for "${componentName}" failed. Retry or remove it before saving.`);
    }
    if (requireCloudStoragePhotos && !isCloudUploadedPhoto(photo)) {
      throw new Error(`Photo "${photo.originalFilename || photo.id}" has not completed cloud upload.`);
    }
    const validation = validatePhotoAssociation(
      {
        ...photo,
        classificationStatus: 'assigned',
        componentName,
      },
      {
        authenticatedUserId: actorId,
        userWorkspaceId: actorWorkspaceId,
        targetWorkspaceId: session.workspaceId || DEFAULT_WORKSPACE_ID,
        targetAssetId: session.assetId,
        sessionAssetId: session.assetId,
        validComponentNames,
        targetReportFinalized: false,
      }
    );
    if (!validation.valid) {
      throw new Error(validation.reason || `Invalid photo metadata on "${componentName}".`);
    }
  }

  const taggedComponentPhotos: InspectionPhoto[] = deduplicatePhotos(
    componentPhotos.map((p) => ({
      ...p,
      photoId: p.photoId || p.id,
      workspaceId: session.workspaceId || actorWorkspaceId,
      inspectionSessionId: session.id,
      assetId: session.assetId,
      componentName,
      componentId: toComponentSlug(componentName),
      photoCategory: 'INSPECTION',
      classificationStatus: 'assigned',
      uploadedBy: p.uploadedBy || actorName,
      uploadedById: p.uploadedById || actorId,
      isFinalized: false,
      createdAt: p.createdAt || p.timestamp || now,
    }))
  );

  // Preserve photos belonging to other components & general/unassigned session photos
  const otherSessionPhotos = (session.photos || []).filter(
    (p) => !(p.classificationStatus === 'assigned' && p.componentName === componentName)
  );
  const mergedSessionPhotos = deduplicatePhotos([...otherSessionPhotos, ...taggedComponentPhotos]);

  const prevDraft = session.componentDrafts?.[componentName];
  const updatedComponentDraft: ComponentDraftRecord = {
    componentName,
    componentSlug: toComponentSlug(componentName),
    status: componentStatus,
    condition: componentStatus === 'NOT_APPLICABLE' ? undefined : condition,
    observations: observations.trim(),
    findings: findings.trim(),
    recommendations: recommendations.trim(),
    notApplicableReason: componentStatus === 'NOT_APPLICABLE' ? notApplicableReason.trim() : '',
    photoIds: taggedComponentPhotos.map((p) => p.id),
    savedAt: now,
    savedBy: actorName,
    savedById: actorId,
    version: (prevDraft?.version || 0) + 1,
  };

  const nextComponentDrafts: Record<string, ComponentDraftRecord> = {
    ...(session.componentDrafts || {}),
    [componentName]: updatedComponentDraft,
  };

  const nextComponents: Record<string, ConveyorCondition> = { ...(session.components || {}) };
  const nextCurrentConditions: Record<string, ConveyorCondition> = {
    ...(session.componentCurrentConditions || {}),
  };
  const nextNotes: Record<string, string> = { ...(session.componentNotes || {}) };
  const nextRecommendations: Record<string, string> = { ...(session.componentRecommendations || {}) };

  if (componentStatus === 'NOT_APPLICABLE') {
    delete nextComponents[componentName];
    delete nextCurrentConditions[componentName];
    delete nextNotes[componentName];
    delete nextRecommendations[componentName];
  } else if (condition) {
    nextComponents[componentName] = condition;
    nextCurrentConditions[componentName] = condition;
    const combinedNote = [observations.trim(), findings.trim()].filter(Boolean).join(' — ');
    if (combinedNote) {
      nextNotes[componentName] = combinedNote;
    } else {
      delete nextNotes[componentName];
    }
    if (recommendations.trim()) {
      nextRecommendations[componentName] = recommendations.trim();
    } else {
      delete nextRecommendations[componentName];
    }
  }

  // Derive worst active component condition for draft preview (excluded from asset until finalized)
  const activeConditions = Object.values(nextComponents);
  let derivedOverall: ConveyorCondition = 'good';
  if (activeConditions.includes('damaged')) derivedOverall = 'damaged';
  else if (activeConditions.includes('worn')) derivedOverall = 'worn';
  else if (activeConditions.includes('fair')) derivedOverall = 'fair';

  const derivedStatus = deriveSessionStatus(nextComponentDrafts, session.status);

  const updatedSession: InspectionRecord = {
    ...session,
    status: derivedStatus,
    overallCondition: derivedOverall,
    components: nextComponents,
    componentCurrentConditions: nextCurrentConditions,
    componentDrafts: nextComponentDrafts,
    componentNotes: nextNotes,
    componentRecommendations: nextRecommendations,
    photos: mergedSessionPhotos,
    generalPhotos: mergedSessionPhotos.filter(
      (p) => p.classificationStatus === 'general_session_evidence'
    ),
    lastSavedAt: now,
    version: (session.version || 1) + 1,
  };

  return {
    updatedSession,
    updatedComponentDraft,
  };
}

export function prepareFinalizedSessionBundle(params: {
  session: InspectionRecord;
  existingReports: ComponentInspectionReport[];
  actorName: string;
  actorId: string;
  actorWorkspaceId?: string;
  overallOverrides?: {
    findings?: string;
    recommendations?: string;
    overallCondition?: ConveyorCondition;
    priority?: PriorityLevel;
    extraSessionPhotos?: InspectionPhoto[];
    inspectorName?: string;
  };
  requireCloudStoragePhotos?: boolean;
  now?: string;
}): {
  finalizedSession: InspectionRecord;
  generatedReports: ComponentInspectionReport[];
  auditEvents: PhotoAuditEvent[];
  wasIdempotentSkip: boolean;
} {
  const {
    session,
    existingReports,
    actorName,
    actorId,
    actorWorkspaceId = DEFAULT_WORKSPACE_ID,
    overallOverrides,
    requireCloudStoragePhotos = false,
    now = new Date().toISOString(),
  } = params;

  authorizeDraftAccess(session, actorId, actorWorkspaceId);

  if (session.status === 'FINALIZED') {
    const existingForSession = existingReports.filter((r) => r.sessionId === session.id);
    return {
      finalizedSession: session,
      generatedReports: existingForSession,
      auditEvents: [],
      wasIdempotentSkip: true,
    };
  }

  const mergedPhotos = overallOverrides?.extraSessionPhotos
    ? deduplicatePhotos([
        ...(session.photos || []).filter(
          (p) => p.classificationStatus === 'assigned'
        ),
        ...overallOverrides.extraSessionPhotos,
      ])
    : deduplicatePhotos(session.photos || []);

  const candidateSession: InspectionRecord = {
    ...session,
    inspectorName: overallOverrides?.inspectorName?.trim() || session.inspectorName,
    findings: overallOverrides?.findings !== undefined ? overallOverrides.findings.trim() : session.findings,
    recommendations:
      overallOverrides?.recommendations !== undefined
        ? overallOverrides.recommendations.trim() || 'No immediate corrective action required.'
        : session.recommendations || 'No immediate corrective action required.',
    overallCondition: overallOverrides?.overallCondition || session.overallCondition,
    priority: overallOverrides?.priority || session.priority,
    photos: mergedPhotos,
  };

  const validation = validateSessionFinalization(candidateSession, {
    requireCloudStoragePhotos,
  });

  if (!validation.valid) {
    throw new Error(validation.errors[0] || 'Inspection session is not ready to finalize.');
  }

  const workspaceId = candidateSession.workspaceId || DEFAULT_WORKSPACE_ID;

  // Validate every attached photo before locking
  const validComponentNames = Object.keys(candidateSession.components || {});
  for (const photo of candidateSession.photos || []) {
    const photoCheck = validatePhotoAssociation(photo, {
      authenticatedUserId: actorId,
      userWorkspaceId: actorWorkspaceId,
      targetWorkspaceId: workspaceId,
      targetAssetId: candidateSession.assetId,
      sessionAssetId: candidateSession.assetId,
      validComponentNames,
      targetReportFinalized: false,
    });
    if (!photoCheck.valid) {
      throw new Error(photoCheck.reason || 'Photo association validation failed during finalization.');
    }
  }

  const {
    reports: generatedReports,
    normalizedSessionPhotos,
    generalPhotos,
    auditEvents,
    wasIdempotentSkip,
  } = buildComponentReportsFromSession({
    sessionId: candidateSession.id,
    inspectionData: candidateSession,
    existingReports,
    now,
    workspaceId,
  });

  // Normalize componentDrafts to lock saved state as COMPLETED where applicable
  const finalizedDrafts: Record<string, ComponentDraftRecord> = {};
  Object.entries(candidateSession.componentDrafts || {}).forEach(([compName, draft]) => {
    finalizedDrafts[compName] = {
      ...draft,
      status: draft.status === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : 'COMPLETED',
    };
  });

  const finalizedSession: InspectionRecord = {
    ...candidateSession,
    status: 'FINALIZED',
    inspectionDate: candidateSession.inspectionDate || now,
    photos: normalizedSessionPhotos,
    generalPhotos,
    componentDrafts: finalizedDrafts,
    componentReportCount: wasIdempotentSkip
      ? existingReports.filter((r) => r.sessionId === candidateSession.id).length
      : generatedReports.length,
    currentCondition: candidateSession.overallCondition,
    componentCurrentConditions: { ...(candidateSession.components || {}) },
    maintenanceStatus:
      candidateSession.overallCondition === 'damaged' ||
      candidateSession.overallCondition === 'worn'
        ? 'diagnosing'
        : undefined,
    lastSavedAt: now,
    finalizedAt: now,
    finalizedBy: actorName,
    finalizedById: actorId,
    version: (candidateSession.version || 1) + 1,
  };

  return {
    finalizedSession,
    generatedReports,
    auditEvents,
    wasIdempotentSkip,
  };
}

/**
 * Strips undefined values cleanly for Firestore serialization.
 */
function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefinedDeep(v)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

export async function saveDraftSessionToFirestore(
  firestore: Firestore,
  draftSession: InspectionRecord
): Promise<void> {
  const sanitized = stripUndefinedDeep({
    ...draftSession,
    photos: (draftSession.photos || []).map(sanitizePhotoForFirestore),
    generalPhotos: (draftSession.generalPhotos || []).map(sanitizePhotoForFirestore),
  });

  await setDoc(doc(firestore, 'inspection_drafts', draftSession.id), {
    ...sanitized,
    serverUpdatedAt: serverTimestamp(),
  });
}

export async function saveComponentDraftTransaction(params: {
  firestore: Firestore;
  sessionFallback: InspectionRecord;
  componentName: string;
  componentStatus: Extract<ComponentDraftStatus, 'SAVED' | 'COMPLETED' | 'NOT_APPLICABLE'>;
  condition?: ConveyorCondition;
  observations?: string;
  findings?: string;
  recommendations?: string;
  notApplicableReason?: string;
  componentPhotos: InspectionPhoto[];
  actorName: string;
  actorId: string;
  expectedSessionVersion?: number;
  requireCloudStoragePhotos?: boolean;
  now?: string;
}): Promise<{
  updatedSession: InspectionRecord;
  updatedComponentDraft: ComponentDraftRecord;
}> {
  const {
    firestore,
    sessionFallback,
    componentName,
    componentStatus,
    condition,
    observations,
    findings,
    recommendations,
    notApplicableReason,
    componentPhotos,
    actorName,
    actorId,
    expectedSessionVersion,
    requireCloudStoragePhotos = true,
    now = new Date().toISOString(),
  } = params;

  const draftRef = doc(firestore, 'inspection_drafts', sessionFallback.id);
  const compDraftRef = doc(
    firestore,
    'inspection_drafts',
    sessionFallback.id,
    'component_drafts',
    toComponentSlug(componentName)
  );

  return runTransaction(firestore, async (tx) => {
    const serverSnap = await tx.get(draftRef);
    const baseSession = serverSnap.exists()
      ? (serverSnap.data() as InspectionRecord)
      : sessionFallback;

    const { updatedSession, updatedComponentDraft } = applyComponentSaveToSession({
      session: baseSession,
      componentName,
      componentStatus,
      condition,
      observations,
      findings,
      recommendations,
      notApplicableReason,
      componentPhotos,
      actorName,
      actorId,
      expectedSessionVersion: serverSnap.exists() ? expectedSessionVersion : undefined,
      requireCloudStoragePhotos,
      now,
    });

    const sanitizedSession = stripUndefinedDeep({
      ...updatedSession,
      photos: (updatedSession.photos || []).map(sanitizePhotoForFirestore),
      generalPhotos: (updatedSession.generalPhotos || []).map(sanitizePhotoForFirestore),
    });

    const sanitizedCompDraft = stripUndefinedDeep(updatedComponentDraft);

    tx.set(draftRef, {
      ...sanitizedSession,
      serverUpdatedAt: serverTimestamp(),
    });
    tx.set(compDraftRef, {
      ...sanitizedCompDraft,
      sessionId: updatedSession.id,
      workspaceId: updatedSession.workspaceId || DEFAULT_WORKSPACE_ID,
      assetId: updatedSession.assetId,
      inspectorId: actorId,
      serverSavedAt: serverTimestamp(),
    });

    return { updatedSession, updatedComponentDraft };
  });
}

export async function finalizeInspectionSessionTransaction(params: {
  firestore: Firestore;
  sessionFallback: InspectionRecord;
  allInspections: InspectionRecord[];
  existingReports: ComponentInspectionReport[];
  actorName: string;
  actorId: string;
  overallOverrides?: {
    findings?: string;
    recommendations?: string;
    overallCondition?: ConveyorCondition;
    priority?: PriorityLevel;
    extraSessionPhotos?: InspectionPhoto[];
    inspectorName?: string;
  };
  requireCloudStoragePhotos?: boolean;
  now?: string;
}): Promise<{
  finalizedSession: InspectionRecord;
  generatedReports: ComponentInspectionReport[];
  auditEvents: PhotoAuditEvent[];
  reconciledAssetCondition: ConveyorCondition;
  wasIdempotentSkip: boolean;
}> {
  const {
    firestore,
    sessionFallback,
    allInspections,
    existingReports,
    actorName,
    actorId,
    overallOverrides,
    requireCloudStoragePhotos = true,
    now = new Date().toISOString(),
  } = params;

  const draftRef = doc(firestore, 'inspection_drafts', sessionFallback.id);
  const inspRef = doc(firestore, 'inspections', sessionFallback.id);
  const assetRef = doc(firestore, 'assets', sessionFallback.assetId);

  return runTransaction(firestore, async (tx) => {
    const [draftSnap, finalizedSnap, assetSnap] = await Promise.all([
      tx.get(draftRef),
      tx.get(inspRef),
      tx.get(assetRef),
    ]);

    if (finalizedSnap.exists()) {
      const existingFinal = finalizedSnap.data() as InspectionRecord;
      const existingAssetCond = assetSnap.exists()
        ? (assetSnap.data() as ConveyorAsset).currentCondition
        : existingFinal.overallCondition;
      return {
        finalizedSession: existingFinal,
        generatedReports: existingReports.filter((r) => r.sessionId === existingFinal.id),
        auditEvents: [],
        reconciledAssetCondition: existingAssetCond,
        wasIdempotentSkip: true,
      };
    }

    const latestDraft = draftSnap.exists()
      ? (draftSnap.data() as InspectionRecord)
      : sessionFallback;

    const bundle = prepareFinalizedSessionBundle({
      session: latestDraft,
      existingReports,
      actorName,
      actorId,
      overallOverrides,
      requireCloudStoragePhotos,
      now,
    });

    const mergedAllInspections = [
      bundle.finalizedSession,
      ...allInspections.filter((i) => i.id !== bundle.finalizedSession.id),
    ];
    const reconciledAssetCondition = reconcileAssetCondition(
      bundle.finalizedSession.assetId,
      mergedAllInspections
    );

    const sanitizedFinalSession = stripUndefinedDeep({
      ...bundle.finalizedSession,
      photos: (bundle.finalizedSession.photos || []).map(sanitizePhotoForFirestore),
      generalPhotos: (bundle.finalizedSession.generalPhotos || []).map(sanitizePhotoForFirestore),
    });

    tx.set(inspRef, {
      ...sanitizedFinalSession,
      serverFinalizedAt: serverTimestamp(),
    });

    // Lock existing draft copy as FINALIZED so no further subcollection edits can pass Firestore rules
    if (draftSnap.exists()) {
      tx.update(draftRef, {
        ...sanitizedFinalSession,
        status: 'FINALIZED',
        finalizedAt: now,
        finalizedBy: actorName,
        finalizedById: actorId,
        serverFinalizedAt: serverTimestamp(),
      });
    }

    bundle.generatedReports.forEach((rep) => {
      tx.set(
        doc(firestore, 'component_reports', rep.id),
        stripUndefinedDeep({
          ...rep,
          photos: rep.photos.map(sanitizePhotoForFirestore),
          serverFinalizedAt: serverTimestamp(),
        })
      );
    });

    (bundle.finalizedSession.photos || []).forEach((photo) => {
      const sanitizedPhoto = stripUndefinedDeep(sanitizePhotoForFirestore(photo));
      tx.set(doc(firestore, 'photo_evidence', sanitizedPhoto.id), sanitizedPhoto);
    });

    bundle.auditEvents.forEach((evt) => {
      tx.set(doc(firestore, 'photo_audit_events', evt.id), stripUndefinedDeep(evt));
    });

    if (assetSnap.exists()) {
      tx.update(assetRef, {
        lastInspectedAt: bundle.finalizedSession.inspectionDate || now,
        currentCondition: reconciledAssetCondition,
        maintenanceStatus:
          bundle.finalizedSession.overallCondition === 'damaged' ||
          bundle.finalizedSession.overallCondition === 'worn'
            ? 'in_progress'
            : 'none',
        updatedAt: now,
      });
    }

    return {
      finalizedSession: bundle.finalizedSession,
      generatedReports: bundle.generatedReports,
      auditEvents: bundle.auditEvents,
      reconciledAssetCondition,
      wasIdempotentSkip: bundle.wasIdempotentSkip,
    };
  });
}

export async function cancelDraftSessionTransaction(params: {
  firestore: Firestore;
  sessionFallback: InspectionRecord;
  actorName: string;
  actorId: string;
  reason?: string;
  now?: string;
}): Promise<InspectionRecord> {
  const {
    firestore,
    sessionFallback,
    actorName,
    actorId,
    reason = 'Cancelled by inspector',
    now = new Date().toISOString(),
  } = params;

  const draftRef = doc(firestore, 'inspection_drafts', sessionFallback.id);

  return runTransaction(firestore, async (tx) => {
    const snap = await tx.get(draftRef);
    const current = snap.exists() ? (snap.data() as InspectionRecord) : sessionFallback;

    authorizeDraftAccess(current, actorId, current.workspaceId || DEFAULT_WORKSPACE_ID);

    if (current.status === 'FINALIZED') {
      throw new Error(`Inspection session ${current.id} is already FINALIZED and cannot be cancelled.`);
    }

    const cancelled: InspectionRecord = {
      ...current,
      status: 'CANCELLED',
      cancelledAt: now,
      cancelledBy: actorName,
      cancelledReason: reason.trim() || 'Cancelled by inspector',
      lastSavedAt: now,
      version: (current.version || 1) + 1,
    };

    tx.set(
      draftRef,
      stripUndefinedDeep({
        ...cancelled,
        photos: (cancelled.photos || []).map(sanitizePhotoForFirestore),
        generalPhotos: (cancelled.generalPhotos || []).map(sanitizePhotoForFirestore),
        serverUpdatedAt: serverTimestamp(),
      })
    );

    return cancelled;
  });
}
