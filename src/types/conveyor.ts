/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ConveyorCondition = 'good' | 'fair' | 'worn' | 'damaged';

export type AssetStatus = 'active' | 'deactivated';

export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical';

export type ConveyorType = 'Belt' | 'Roller' | 'Screw' | 'Overhead' | 'Chain Feeder';

export type MaintenanceActivityType =
  | 'Initial Assessment'
  | 'Emergency Patch / Cold Vulcanizing'
  | 'Hot Splicing & Carcass Repair'
  | 'Idler Roll Replacement'
  | 'Pulley Lagging Re-Tiling'
  | 'Mechanical Belt Realignment'
  | 'Belt Tension & Counterweight Adjustment'
  | 'Primary Scraper Blade Replacement'
  | 'Skirtboard Rubber Re-sealing'
  | 'Motor & Gearbox Servicing'
  | 'Carryback Cleaning & Spillage Overhaul'
  | 'Post-Repair Certification Verification';

export type MaintenanceProgressStatus =
  | 'diagnosing'
  | 'parts_pending'
  | 'in_progress'
  | 'completed_pending_verification'
  | 'verified_closed';

export interface PartReplacedItem {
  partNumber: string;
  description: string;
  quantity: number;
}

export type PhotoCategory =
  | 'INSPECTION'
  | 'MAINTENANCE_BEFORE'
  | 'MAINTENANCE_DURING'
  | 'MAINTENANCE_AFTER'
  | 'VERIFICATION'
  | 'GENERAL_SESSION_EVIDENCE';

export type PhotoClassificationStatus =
  | 'assigned'
  | 'unassigned'
  | 'general_session_evidence';

export type PhotoUploadStatus = 'uploading' | 'uploaded' | 'failed' | 'finalized';

export type PhotoAuditEventType =
  | 'PHOTO_UPLOADED'
  | 'PHOTO_UPLOAD_FAILED'
  | 'PHOTO_ASSOCIATED_COMPONENT'
  | 'PHOTO_CLASSIFICATION_CORRECTED'
  | 'PHOTO_MARKED_GENERAL'
  | 'PHOTO_ATTACHED_MAINTENANCE'
  | 'PHOTO_ATTACHED_VERIFICATION'
  | 'PHOTO_REMOVED'
  | 'LEGACY_MIGRATION_COMPLETED';

export function toComponentSlug(componentName: string): string {
  return componentName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'component';
}

export interface MaintenanceVerification {
  isVerified: boolean;
  verifiedBy: string;
  verifiedById: string;
  verifiedAt: string;
  verifiedCondition: ConveyorCondition;
  verificationNotes: string;
  verificationPhotos?: InspectionPhoto[];
}

export interface MaintenanceProgressUpdate {
  id: string; // e.g. "MAINT-2026-0001"
  inspectionId: string; // Foreign key linking to the immutable inspection
  componentReportId?: string; // Link to specific component report e.g. "INSP-2026-0001-C01"
  assetId: string;
  assetName: string;
  componentName: string; // Target component, e.g. "Belt Carcass"
  initialInspectionCondition: ConveyorCondition; // IMMUTABLE copy of condition when inspection was first logged
  activityType: MaintenanceActivityType;
  workDescription: string;
  actionTaken: string;
  currentCondition: ConveyorCondition; // Latest reported condition during this maintenance update
  progressStatus: MaintenanceProgressStatus;
  partsReplaced?: PartReplacedItem[];
  laborHours?: number;
  technicianName: string;
  technicianOrg: string;
  technicianId: string;
  evidencePhotos: InspectionPhoto[];
  verification?: MaintenanceVerification;
  createdAt: string;
  updatedAt: string;
}

export interface ComponentInspectionReport {
  id: string; // e.g. "INSP-2026-0001-C01"
  sessionId: string; // e.g. "INSP-2026-0001"
  workspaceId?: string;
  assetId: string;
  assetName: string;
  componentName: string; // e.g. "Belt Carcass & Top Cover"
  componentId?: string;
  componentCategory?: string;
  originalCondition: ConveyorCondition; // IMMUTABLE: condition recorded at original session
  currentCondition: ConveyorCondition; // Current operational condition derived from verifications
  latestReportedCondition?: ConveyorCondition;
  latestVerifiedCondition?: ConveyorCondition;
  maintenanceStatus?: MaintenanceProgressStatus;
  findings: string;
  recommendations: string;
  photos: InspectionPhoto[]; // ONLY component-specific INSPECTION photos
  photoIds?: string[];
  inspectorName: string;
  inspectorId: string;
  inspectionDate: string;
  workOrderId?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  verificationNotes?: string;
  isFinalized?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionComponentState {
  name: string;
  condition: ConveyorCondition;
  notes?: string;
}

export interface InspectionPhoto {
  id: string;
  photoId?: string;
  url: string;
  caption: string;
  timestamp: string;
  workspaceId?: string;
  inspectionSessionId?: string;
  componentReportId?: string;
  assetId?: string;
  componentId?: string;
  componentName?: string;
  photoCategory?: PhotoCategory;
  classificationStatus?: PhotoClassificationStatus;
  storagePath?: string;
  originalFilename?: string;
  contentType?: string;
  fileSize?: number;
  uploadedBy?: string;
  uploadedById?: string;
  uploadedByOrganizationId?: string;
  uploadStatus?: PhotoUploadStatus;
  uploadProgress?: number;
  uploadError?: string;
  maintenanceUpdateId?: string;
  verificationId?: string;
  classifiedBy?: string;
  classifiedAt?: string;
  isFinalized?: boolean;
  createdAt?: string;
}

export interface PhotoAuditEvent {
  id: string;
  photoId: string;
  eventType: PhotoAuditEventType;
  actorName: string;
  actorId: string;
  workspaceId: string;
  inspectionSessionId: string;
  componentReportId?: string;
  componentName?: string;
  assetId?: string;
  previousClassification?: string;
  newClassification?: string;
  details: string;
  timestamp: string;
}

export interface ConveyorAsset {
  id: string; // e.g. "CV-2026-001"
  name: string;
  location: string;
  type: ConveyorType;
  beltWidthMm: number;
  lengthMeters: number;
  speedMps: number;
  status: AssetStatus;
  lastInspectedAt: string;
  currentCondition: ConveyorCondition;
  latestVerifiedCondition?: ConveyorCondition;
  maintenanceStatus?: 'none' | 'in_progress' | 'pending_verification' | 'verified_closed';
  lastMaintenanceUpdateAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type InspectionSessionStatus =
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'READY_FOR_REVIEW'
  | 'FINALIZED'
  | 'CANCELLED';

export type ComponentDraftStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'SAVED'
  | 'COMPLETED'
  | 'NOT_APPLICABLE';

export interface ComponentDraftRecord {
  componentName: string;
  componentSlug: string;
  status: ComponentDraftStatus;
  condition?: ConveyorCondition;
  observations?: string;
  findings?: string;
  recommendations?: string;
  notApplicableReason?: string;
  photoIds: string[];
  savedAt?: string;
  savedBy?: string;
  savedById?: string;
  version: number;
}

export interface InspectionRecord {
  id: string; // e.g. "INSP-2026-0001"
  workspaceId?: string;
  status?: InspectionSessionStatus; // Defaults to 'FINALIZED' for legacy records
  site?: string; // Asset location / plant section
  assetId: string;
  assetName: string;
  inspectorName: string;
  inspectorId: string;
  inspectionDate: string;
  overallCondition: ConveyorCondition; // IMMUTABLE once FINALIZED
  components: Record<string, ConveyorCondition>; // IMMUTABLE once FINALIZED
  componentCurrentConditions?: Record<string, ConveyorCondition>; // Live sub-component operational conditions reflecting verified repairs
  componentDrafts?: Record<string, ComponentDraftRecord>; // Progressive per-component draft state & audit metadata
  componentNotes?: Record<string, string>; // Findings/notes per component
  componentRecommendations?: Record<string, string>; // Recommendations per component
  componentReportCount?: number; // Total count of child component inspection reports
  currentCondition?: ConveyorCondition; // Current operational condition derived from supervisor verifications and active findings
  findings: string; // IMMUTABLE once FINALIZED
  recommendations: string; // IMMUTABLE once FINALIZED
  priority: PriorityLevel;
  photos: InspectionPhoto[]; // IMMUTABLE session photo references once FINALIZED
  generalPhotos?: InspectionPhoto[]; // Explicit session-level general evidence photos
  maintenanceStatus?: MaintenanceProgressStatus;
  latestReportedCondition?: ConveyorCondition;
  latestVerifiedCondition?: ConveyorCondition;
  verifiedAt?: string;
  verifiedBy?: string;
  lastSavedAt?: string;
  finalizedAt?: string;
  finalizedBy?: string;
  finalizedById?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelledReason?: string;
  version?: number;
  createdAt: string;
}

export function isSessionFinalized(inspection: Pick<InspectionRecord, 'status'>): boolean {
  return !inspection.status || inspection.status === 'FINALIZED';
}

export function isDraftInspectionSession(inspection: Pick<InspectionRecord, 'status'>): boolean {
  return (
    inspection.status === 'DRAFT' ||
    inspection.status === 'IN_PROGRESS' ||
    inspection.status === 'READY_FOR_REVIEW'
  );
}

export interface SessionProgressSummary {
  totalCount: number;
  completedCount: number;
  savedCount: number;
  notApplicableCount: number;
  inProgressCount: number;
  notStartedCount: number;
  doneCount: number; // COMPLETED + SAVED + NOT_APPLICABLE
}

export function computeSessionProgress(
  inspection: Pick<InspectionRecord, 'components' | 'componentDrafts'>,
  defaultComponentNames?: string[]
): SessionProgressSummary {
  const draftsMap = inspection.componentDrafts || {};
  const names =
    Object.keys(draftsMap).length > 0
      ? Object.keys(draftsMap)
      : Object.keys(inspection.components || {}).length > 0
      ? Object.keys(inspection.components || {})
      : defaultComponentNames || [];

  let completedCount = 0;
  let savedCount = 0;
  let notApplicableCount = 0;
  let inProgressCount = 0;
  let notStartedCount = 0;

  for (const name of names) {
    const status = draftsMap[name]?.status || 'NOT_STARTED';
    if (status === 'COMPLETED') completedCount++;
    else if (status === 'SAVED') savedCount++;
    else if (status === 'NOT_APPLICABLE') notApplicableCount++;
    else if (status === 'IN_PROGRESS') inProgressCount++;
    else notStartedCount++;
  }

  return {
    totalCount: names.length,
    completedCount,
    savedCount,
    notApplicableCount,
    inProgressCount,
    notStartedCount,
    doneCount: completedCount + savedCount + notApplicableCount,
  };
}

export function deriveSessionStatus(
  componentDrafts: Record<string, ComponentDraftRecord>,
  currentStatus?: InspectionSessionStatus
): InspectionSessionStatus {
  if (currentStatus === 'FINALIZED' || currentStatus === 'CANCELLED') {
    return currentStatus;
  }

  const drafts = Object.values(componentDrafts || {});
  if (drafts.length === 0) return 'DRAFT';

  const allNotStarted = drafts.every((d) => d.status === 'NOT_STARTED');
  if (allNotStarted) return 'DRAFT';

  const allReady = drafts.every(
    (d) => d.status === 'COMPLETED' || d.status === 'SAVED' || d.status === 'NOT_APPLICABLE'
  );
  if (allReady) return 'READY_FOR_REVIEW';

  return 'IN_PROGRESS';
}

export interface FinalizationValidationResult {
  valid: boolean;
  errors: string[];
  blockingComponents: string[];
}

export function validateSessionFinalization(
  session: InspectionRecord,
  options?: { requireCloudStoragePhotos?: boolean; defaultComponentNames?: string[] }
): FinalizationValidationResult {
  const errors: string[] = [];
  const blockingComponents: string[] = [];

  if (session.status === 'FINALIZED') {
    errors.push(`Inspection session ${session.id} is already finalized.`);
    return { valid: false, errors, blockingComponents };
  }
  if (session.status === 'CANCELLED') {
    errors.push(`Cancelled inspection session ${session.id} cannot be finalized.`);
    return { valid: false, errors, blockingComponents };
  }
  if (!session.assetId) {
    errors.push('Target conveyor asset is required.');
  }
  if (!session.findings || !session.findings.trim()) {
    errors.push('Overall inspection findings / observations are required before finalizing.');
  }

  const draftsMap = session.componentDrafts || {};
  const componentNames =
    Object.keys(draftsMap).length > 0
      ? Object.keys(draftsMap)
      : Object.keys(session.components || {}).length > 0
      ? Object.keys(session.components || {})
      : options?.defaultComponentNames || [];

  if (componentNames.length === 0) {
    errors.push('At least one component must be evaluated before finalizing.');
  }

  let evaluatedCount = 0;
  for (const compName of componentNames) {
    const draft = draftsMap[compName];
    const status: ComponentDraftStatus = draft?.status || (session.components?.[compName] ? 'COMPLETED' : 'NOT_STARTED');

    if (status === 'NOT_STARTED' || status === 'IN_PROGRESS') {
      blockingComponents.push(compName);
      errors.push(`Component "${compName}" is ${status.replace('_', ' ')} — save it or mark as Not Applicable.`);
      continue;
    }

    if (status === 'NOT_APPLICABLE') {
      if (!draft?.notApplicableReason || draft.notApplicableReason.trim().length < 3) {
        blockingComponents.push(compName);
        errors.push(`Component "${compName}" is marked Not Applicable and requires a brief reason.`);
      }
      continue;
    }

    evaluatedCount++;
    const cond = draft?.condition || session.components?.[compName];
    if (!cond) {
      blockingComponents.push(compName);
      errors.push(`Component "${compName}" requires a condition rating.`);
    } else if ((cond === 'worn' || cond === 'damaged') && !(draft?.findings || draft?.observations || session.componentNotes?.[compName] || '').trim()) {
      blockingComponents.push(compName);
      errors.push(`Component "${compName}" is rated ${cond.toUpperCase()} and requires specific defect findings before finalizing.`);
    }
  }

  if (componentNames.length > 0 && evaluatedCount === 0) {
    errors.push('At least one component must be inspected (cannot finalize with all components Not Applicable).');
  }

  const photos = session.photos || [];
  const uploading = photos.filter((p) => p.uploadStatus === 'uploading');
  const failed = photos.filter((p) => p.uploadStatus === 'failed');
  const unassigned = photos.filter((p) => p.classificationStatus === 'unassigned');

  if (uploading.length > 0) {
    errors.push(`${uploading.length} photo upload${uploading.length > 1 ? 's are' : ' is'} still in progress.`);
  }
  if (failed.length > 0) {
    errors.push(`${failed.length} photo upload${failed.length > 1 ? 's' : ''} failed — retry or remove before finalizing.`);
  }
  if (unassigned.length > 0) {
    errors.push(`${unassigned.length} bulk photo${unassigned.length > 1 ? 's' : ''} must be assigned to a component or marked General Session Evidence.`);
  }

  if (options?.requireCloudStoragePhotos) {
    const localOnlyPhotos = photos.filter(
      (p) =>
        p.uploadStatus !== 'uploaded' &&
        p.uploadStatus !== 'finalized'
    );
    if (localOnlyPhotos.length > 0) {
      errors.push(`${localOnlyPhotos.length} photo${localOnlyPhotos.length > 1 ? 's are' : ' is'} only previewed locally and must complete cloud upload before finalizing.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    blockingComponents,
  };
}

export interface DashboardMetrics {
  totalAssets: number;
  activeAssets: number;
  totalInspections: number;
  damagedComponents: number;
  wornComponents: number;
  goodComponents: number;
  activeMaintenanceCount: number;
  pendingVerificationCount: number;
  verifiedRepairsCount: number;
}

// Condition severity ranking: higher number = higher risk / worse condition
export const CONDITION_SEVERITY: Record<ConveyorCondition, number> = {
  damaged: 4,
  worn: 3,
  fair: 2,
  good: 1,
};

/**
 * Derives the current operational condition for an inspection finding.
 * Invariant: If certified by a supervisor, current condition reflects the verified state.
 * If unverified, it strictly preserves the original immutable inspection condition.
 */
export function getCurrentFindingCondition(inspection: {
  overallCondition: ConveyorCondition;
  latestVerifiedCondition?: ConveyorCondition;
  currentCondition?: ConveyorCondition;
  componentCurrentConditions?: Record<string, ConveyorCondition>;
}): ConveyorCondition {
  // If component conditions are tracked, worst component severity determines the inspection condition
  if (inspection.componentCurrentConditions && Object.keys(inspection.componentCurrentConditions).length > 0) {
    const conditions = Object.values(inspection.componentCurrentConditions);
    if (conditions.includes('damaged')) return 'damaged';
    if (conditions.includes('worn')) return 'worn';
    if (conditions.includes('fair')) return 'fair';
    return 'good';
  }

  // If explicitly verified by a supervisor, use the latest verified condition
  if (inspection.latestVerifiedCondition) {
    return inspection.latestVerifiedCondition;
  }

  // If currentCondition is already populated
  if (inspection.currentCondition) {
    return inspection.currentCondition;
  }

  // Otherwise, default to immutable original audit condition
  return inspection.overallCondition;
}

/**
 * Reconciles parent Conveyor Asset condition across all relevant inspection findings.
 * Invariant: An unresolved higher-severity finding (e.g. damaged) on another component
 * or inspection MUST NOT be cleared by certification of an unrelated finding.
 */
export function reconcileAssetCondition(
  assetId: string,
  allInspections: InspectionRecord[]
): ConveyorCondition {
  // Strictly exclude unfinished drafts and cancelled sessions from asset condition reconciliation
  const assetInspections = allInspections.filter(
    (insp) => insp.assetId === assetId && isSessionFinalized(insp)
  );
  if (assetInspections.length === 0) return 'good';

  const collectedConditions: ConveyorCondition[] = [];

  for (const insp of assetInspections) {
    if (insp.componentCurrentConditions && Object.keys(insp.componentCurrentConditions).length > 0) {
      collectedConditions.push(...Object.values(insp.componentCurrentConditions));
    } else {
      collectedConditions.push(getCurrentFindingCondition(insp));
    }
  }

  if (collectedConditions.length === 0) return 'good';

  // Severity order: damaged > worn > fair > good
  if (collectedConditions.includes('damaged')) return 'damaged';
  if (collectedConditions.includes('worn')) return 'worn';
  if (collectedConditions.includes('fair')) return 'fair';
  return 'good';
}

/**
 * Reconciles parent Conveyor Asset condition across all active Component Inspection Reports.
 * Follows the strict severity hierarchy: damaged > worn > fair > good.
 */
export function reconcileAssetConditionFromComponentReports(
  assetId: string,
  allReports: ComponentInspectionReport[]
): ConveyorCondition {
  const assetReports = allReports.filter((rep) => rep.assetId === assetId);
  if (assetReports.length === 0) return 'good';

  const conditions = assetReports.map((r) => r.currentCondition || r.originalCondition);
  if (conditions.includes('damaged')) return 'damaged';
  if (conditions.includes('worn')) return 'worn';
  if (conditions.includes('fair')) return 'fair';
  return 'good';
}

export interface PhotoValidationContext {
  authenticatedUserId: string;
  userWorkspaceId: string;
  targetWorkspaceId: string;
  targetAssetId: string;
  sessionAssetId: string;
  validComponentNames: string[];
  targetReportFinalized?: boolean;
  isReplacingFinalizedEvidence?: boolean;
}

export function validatePhotoAssociation(
  photo: InspectionPhoto,
  ctx: PhotoValidationContext
): { valid: boolean; reason?: string } {
  if (!ctx.authenticatedUserId) {
    return { valid: false, reason: 'Unauthenticated user cannot attach evidence.' };
  }
  if (photo.uploadedById && photo.uploadedById !== ctx.authenticatedUserId) {
    return { valid: false, reason: 'Uploader identity spoofing detected: uploadedById does not match authenticated user.' };
  }
  const photoWs = photo.workspaceId || ctx.userWorkspaceId;
  if (photoWs !== ctx.targetWorkspaceId || ctx.userWorkspaceId !== ctx.targetWorkspaceId) {
    return { valid: false, reason: 'Cross-workspace photo attachment denied.' };
  }
  if (photo.assetId && photo.assetId !== ctx.targetAssetId) {
    return { valid: false, reason: 'Photo assetId does not match target asset.' };
  }
  if (ctx.targetAssetId !== ctx.sessionAssetId) {
    return { valid: false, reason: 'Photo cannot be associated with a component belonging to another asset.' };
  }
  if (ctx.isReplacingFinalizedEvidence || (ctx.targetReportFinalized && photo.isFinalized)) {
    return { valid: false, reason: 'Finalized inspection evidence cannot be replaced or deleted.' };
  }
  if (photo.classificationStatus === 'assigned' && photo.componentName) {
    if (!ctx.validComponentNames.includes(photo.componentName)) {
      return { valid: false, reason: `Component "${photo.componentName}" does not exist on this inspection session.` };
    }
  }
  if (photo.storagePath && !photo.storagePath.startsWith(`workspaces/${ctx.targetWorkspaceId}/`)) {
    return { valid: false, reason: 'Unauthorized storage path outside target workspace.' };
  }
  return { valid: true };
}

/**
 * Deterministically and idempotently builds ComponentInspectionReports and maps
 * component-specific INSPECTION photographs without duplicating Storage objects or
 * leaking unrelated component or general photos across reports.
 */
export function buildComponentReportsFromSession(params: {
  sessionId: string;
  inspectionData: Omit<InspectionRecord, 'id' | 'createdAt'>;
  existingReports: ComponentInspectionReport[];
  now: string;
  workspaceId?: string;
}): {
  reports: ComponentInspectionReport[];
  normalizedSessionPhotos: InspectionPhoto[];
  generalPhotos: InspectionPhoto[];
  auditEvents: PhotoAuditEvent[];
  wasIdempotentSkip: boolean;
} {
  const { sessionId, inspectionData, existingReports, now, workspaceId = 'default-workspace' } = params;

  // Idempotency guard: if reports for this sessionId already exist, return empty new list
  const alreadyGenerated = existingReports.filter((r) => r.sessionId === sessionId);
  if (alreadyGenerated.length > 0) {
    return {
      reports: [],
      normalizedSessionPhotos: inspectionData.photos || [],
      generalPhotos: inspectionData.generalPhotos || [],
      auditEvents: [],
      wasIdempotentSkip: true,
    };
  }

  // Exclude components explicitly marked NOT_APPLICABLE from generated defect/component reports
  const componentEntries = Object.entries(inspectionData.components || {}).filter(([compName]) => {
    const draftStatus = inspectionData.componentDrafts?.[compName]?.status;
    return draftStatus !== 'NOT_APPLICABLE';
  });
  const rawPhotos = inspectionData.photos || [];
  const auditEvents: PhotoAuditEvent[] = [];

  const reports: ComponentInspectionReport[] = [];
  const reportIdByComponent: Record<string, string> = {};

  componentEntries.forEach(([compName], index) => {
    const reportId = `${sessionId}-C${String(index + 1).padStart(2, '0')}`;
    reportIdByComponent[compName] = reportId;
  });

  // Normalize photos and explicitly map ONLY by assigned componentName (never infer by order or filename)
  const normalizedSessionPhotos: InspectionPhoto[] = rawPhotos.map((photo) => {
    const isAssigned =
      photo.classificationStatus === 'assigned' &&
      Boolean(photo.componentName) &&
      Boolean(reportIdByComponent[photo.componentName!]);

    const isGeneral =
      photo.classificationStatus === 'general_session_evidence' ||
      photo.photoCategory === 'GENERAL_SESSION_EVIDENCE';

    const resolvedComponentName = isAssigned ? photo.componentName : undefined;
    const resolvedReportId = isAssigned ? reportIdByComponent[resolvedComponentName!] : undefined;
    const resolvedStatus: PhotoClassificationStatus = isAssigned
      ? 'assigned'
      : isGeneral
      ? 'general_session_evidence'
      : 'unassigned';

    const resolvedCategory: PhotoCategory = isAssigned
      ? 'INSPECTION'
      : isGeneral
      ? 'GENERAL_SESSION_EVIDENCE'
      : photo.photoCategory || 'INSPECTION';

    const enriched: InspectionPhoto = {
      ...photo,
      photoId: photo.photoId || photo.id,
      workspaceId: photo.workspaceId || workspaceId,
      inspectionSessionId: sessionId,
      componentReportId: resolvedReportId,
      assetId: inspectionData.assetId,
      componentName: resolvedComponentName,
      componentId: resolvedComponentName ? toComponentSlug(resolvedComponentName) : undefined,
      photoCategory: resolvedCategory,
      classificationStatus: resolvedStatus,
      uploadedBy: photo.uploadedBy || inspectionData.inspectorName,
      uploadedById: photo.uploadedById || inspectionData.inspectorId,
      uploadStatus: 'finalized',
      isFinalized: true,
      createdAt: photo.createdAt || photo.timestamp || now,
    };

    if (isAssigned && resolvedComponentName && resolvedReportId) {
      auditEvents.push({
        id: `AUD-${sessionId}-${enriched.id}`,
        photoId: enriched.id,
        eventType: 'PHOTO_ASSOCIATED_COMPONENT',
        actorName: inspectionData.inspectorName,
        actorId: inspectionData.inspectorId,
        workspaceId,
        inspectionSessionId: sessionId,
        componentReportId: resolvedReportId,
        componentName: resolvedComponentName,
        assetId: inspectionData.assetId,
        newClassification: resolvedComponentName,
        details: `Photo ${enriched.originalFilename || enriched.id} explicitly associated with ${resolvedComponentName} (${resolvedReportId}) during inspection finalization.`,
        timestamp: now,
      });
    } else if (isGeneral) {
      auditEvents.push({
        id: `AUD-${sessionId}-${enriched.id}`,
        photoId: enriched.id,
        eventType: 'PHOTO_MARKED_GENERAL',
        actorName: inspectionData.inspectorName,
        actorId: inspectionData.inspectorId,
        workspaceId,
        inspectionSessionId: sessionId,
        assetId: inspectionData.assetId,
        newClassification: 'GENERAL_SESSION_EVIDENCE',
        details: `Photo ${enriched.originalFilename || enriched.id} retained as General Session Evidence for ${sessionId}.`,
        timestamp: now,
      });
    }

    return enriched;
  });

  componentEntries.forEach(([compName, condition], index) => {
    const reportId = `${sessionId}-C${String(index + 1).padStart(2, '0')}`;
    const draftComp = inspectionData.componentDrafts?.[compName];
    const compNotes =
      [draftComp?.observations, draftComp?.findings, inspectionData.componentNotes?.[compName]]
        .filter((s) => Boolean(s && s.trim()))
        .join(' — ') || '';
    const compRec =
      draftComp?.recommendations || inspectionData.componentRecommendations?.[compName] || '';
    const compFindings = compNotes.trim()
      ? compNotes.trim()
      : inspectionData.findings || `Inspection observation for ${compName}: condition graded as ${condition}.`;
    const compRecommendations = compRec.trim()
      ? compRec.trim()
      : inspectionData.recommendations || 'Continue standard inspection protocol.';

    // Strict component-only photo filtering
    const compPhotos = normalizedSessionPhotos.filter(
      (p) =>
        p.classificationStatus === 'assigned' &&
        p.componentName === compName &&
        p.photoCategory === 'INSPECTION'
    );

    reports.push({
      id: reportId,
      sessionId,
      workspaceId,
      assetId: inspectionData.assetId,
      assetName: inspectionData.assetName,
      componentName: compName,
      componentId: toComponentSlug(compName),
      originalCondition: condition,
      currentCondition: condition,
      maintenanceStatus: condition === 'damaged' || condition === 'worn' ? 'diagnosing' : undefined,
      findings: compFindings,
      recommendations: compRecommendations,
      photos: compPhotos,
      photoIds: compPhotos.map((p) => p.id),
      inspectorName: inspectionData.inspectorName,
      inspectorId: inspectionData.inspectorId,
      inspectionDate: inspectionData.inspectionDate || now,
      isFinalized: true,
      createdAt: now,
      updatedAt: now,
    });
  });

  const generalPhotos = normalizedSessionPhotos.filter(
    (p) => p.classificationStatus === 'general_session_evidence'
  );

  return {
    reports,
    normalizedSessionPhotos,
    generalPhotos,
    auditEvents,
    wasIdempotentSkip: false,
  };
}

/**
 * Filters a component report's inspection photos safely so unrelated or general
 * session photos never leak into the individual component report UI/exports.
 */
export function getComponentInspectionPhotos(
  report: ComponentInspectionReport,
  session?: InspectionRecord
): InspectionPhoto[] {
  const fromReport = (report.photos || []).filter((p) => {
    if (p.classificationStatus === 'general_session_evidence' || p.classificationStatus === 'unassigned') {
      return false;
    }
    if (p.componentName && p.componentName !== report.componentName) {
      return false;
    }
    if (p.componentReportId && p.componentReportId !== report.id) {
      return false;
    }
    return true;
  });

  if (fromReport.length > 0) return fromReport;

  // Fallback check against session photos that explicitly reference this componentReportId or componentName
  if (session?.photos) {
    return session.photos.filter(
      (p) =>
        p.classificationStatus === 'assigned' &&
        (p.componentReportId === report.id || p.componentName === report.componentName) &&
        p.photoCategory !== 'GENERAL_SESSION_EVIDENCE'
    );
  }

  return [];
}

/**
 * Idempotent legacy photo migration:
 * - Preserves photos with verified componentReportId or componentName links.
 * - Marks ambiguous session-level photos without reliable component references as UNASSIGNED.
 * - Never guesses component assignments by filename, order, or timestamp.
 */
export function migrateLegacyPhotos(params: {
  inspections: InspectionRecord[];
  componentReports: ComponentInspectionReport[];
  existingAuditEvents: PhotoAuditEvent[];
  now: string;
}): {
  inspections: InspectionRecord[];
  componentReports: ComponentInspectionReport[];
  newAuditEvents: PhotoAuditEvent[];
  migratedCount: number;
} {
  const { inspections, componentReports, existingAuditEvents, now } = params;
  const newAuditEvents: PhotoAuditEvent[] = [];
  let migratedCount = 0;

  const updatedReports = componentReports.map((r) => ({ ...r, photos: [...(r.photos || [])] }));

  const updatedInspections = inspections.map((insp) => {
    const updatedPhotos = (insp.photos || []).map((photo) => {
      // Already classified / migrated? Keep intact (idempotency)
      if (photo.classificationStatus && photo.inspectionSessionId) {
        return photo;
      }

      // Check if an existing ComponentInspectionReport already explicitly owns this photo ID
      const matchingReport = updatedReports.find(
        (r) =>
          r.sessionId === insp.id &&
          ((photo.componentReportId && r.id === photo.componentReportId) ||
            (photo.componentName && r.componentName === photo.componentName) ||
            r.photos.some((rp) => rp.id === photo.id))
      );

      if (matchingReport) {
        migratedCount++;
        const classifiedPhoto: InspectionPhoto = {
          ...photo,
          photoId: photo.photoId || photo.id,
          workspaceId: photo.workspaceId || insp.workspaceId || 'default-workspace',
          inspectionSessionId: insp.id,
          componentReportId: matchingReport.id,
          assetId: insp.assetId,
          componentName: matchingReport.componentName,
          componentId: toComponentSlug(matchingReport.componentName),
          photoCategory: photo.photoCategory || 'INSPECTION',
          classificationStatus: 'assigned',
          uploadedBy: photo.uploadedBy || insp.inspectorName,
          uploadedById: photo.uploadedById || insp.inspectorId,
          uploadStatus: photo.uploadStatus || 'finalized',
          isFinalized: true,
          createdAt: photo.createdAt || photo.timestamp || insp.createdAt,
        };

        // Ensure the matching report photo also carries the enriched metadata without duplicates
        const idxInReport = matchingReport.photos.findIndex((rp) => rp.id === photo.id);
        if (idxInReport >= 0) {
          matchingReport.photos[idxInReport] = classifiedPhoto;
        } else {
          matchingReport.photos.push(classifiedPhoto);
        }

        return classifiedPhoto;
      }

      // Ambiguous photo: NEVER infer by filename/order/timestamp -> mark UNASSIGNED
      migratedCount++;
      const unassignedPhoto: InspectionPhoto = {
        ...photo,
        photoId: photo.photoId || photo.id,
        workspaceId: photo.workspaceId || insp.workspaceId || 'default-workspace',
        inspectionSessionId: insp.id,
        assetId: insp.assetId,
        photoCategory: 'INSPECTION',
        classificationStatus: 'unassigned',
        uploadedBy: photo.uploadedBy || insp.inspectorName,
        uploadedById: photo.uploadedById || insp.inspectorId,
        uploadStatus: photo.uploadStatus || 'finalized',
        isFinalized: true,
        createdAt: photo.createdAt || photo.timestamp || insp.createdAt,
      };

      const auditId = `AUD-MIG-${insp.id}-${photo.id}`;
      if (!existingAuditEvents.some((e) => e.id === auditId)) {
        newAuditEvents.push({
          id: auditId,
          photoId: photo.id,
          eventType: 'LEGACY_MIGRATION_COMPLETED',
          actorName: 'System Migration',
          actorId: 'system-migration',
          workspaceId: insp.workspaceId || 'default-workspace',
          inspectionSessionId: insp.id,
          assetId: insp.assetId,
          newClassification: 'UNASSIGNED',
          details: `Legacy session photo ${photo.id} lacked explicit component metadata and was safely flagged UNASSIGNED for manual classification.`,
          timestamp: now,
        });
      }

      return unassignedPhoto;
    });

    return {
      ...insp,
      photos: updatedPhotos,
    };
  });

  return {
    inspections: updatedInspections,
    componentReports: updatedReports,
    newAuditEvents,
    migratedCount,
  };
}



