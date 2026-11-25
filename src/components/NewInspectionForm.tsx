/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Upload,
  Trash2,
  CheckCircle2,
  Layers,
  Save,
  X,
  FileCheck,
  AlertCircle,
  RefreshCw,
  ZoomIn,
  Image as ImageIcon,
  CloudCheck,
  Ban,
  ShieldCheck,
  Clock,
  LogIn,
  ClipboardCheck,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  ConveyorAsset,
  InspectionRecord,
  ConveyorCondition,
  PriorityLevel,
  InspectionPhoto,
  PhotoClassificationStatus,
  ComponentDraftRecord,
  ComponentDraftStatus,
  toComponentSlug,
  computeSessionProgress,
  deriveSessionStatus,
  validateSessionFinalization,
} from '../types/conveyor';
import {
  DEFAULT_WORKSPACE_ID,
  buildPhotoStoragePath,
  compressImageFile,
  deduplicatePhotos,
  uploadBlobToFirebaseStorage,
} from '../services/photoStorage';
import {
  DEFAULT_INSPECTION_COMPONENTS,
  createDraftSessionData,
} from '../services/inspectionDrafts';
import { loginWithGoogle } from '../services/firebase';

interface NewInspectionFormProps {
  assets: ConveyorAsset[];
  initialSelectedAsset: ConveyorAsset | null;
  initialDraftSession?: InspectionRecord | null;
  currentUser: User | null;
  nextInspectionId: string;
  onCreateDraftSession: (params: {
    asset: ConveyorAsset;
    inspectorName?: string;
    sessionId?: string;
    priority?: PriorityLevel;
  }) => Promise<InspectionRecord>;
  onSaveComponentDraft: (params: {
    session: InspectionRecord;
    componentName: string;
    componentStatus: Extract<ComponentDraftStatus, 'SAVED' | 'COMPLETED' | 'NOT_APPLICABLE'>;
    condition?: ConveyorCondition;
    observations?: string;
    findings?: string;
    recommendations?: string;
    notApplicableReason?: string;
    componentPhotos: InspectionPhoto[];
    inspectorName?: string;
  }) => Promise<{
    updatedSession: InspectionRecord;
    updatedComponentDraft: ComponentDraftRecord;
  }>;
  onFinalizeDraftSession: (params: {
    session: InspectionRecord;
    overallOverrides?: {
      findings?: string;
      recommendations?: string;
      overallCondition?: ConveyorCondition;
      priority?: PriorityLevel;
      extraSessionPhotos?: InspectionPhoto[];
      inspectorName?: string;
    };
  }) => Promise<InspectionRecord>;
  onCancelDraftSession: (session: InspectionRecord, reason?: string) => Promise<void>;
  onCancel: () => void;
  onSuccess: (record: InspectionRecord) => void;
  onDraftCancelled?: (sessionId: string) => void;
}

export const NewInspectionForm: React.FC<NewInspectionFormProps> = ({
  assets,
  initialSelectedAsset,
  initialDraftSession = null,
  currentUser,
  nextInspectionId,
  onCreateDraftSession,
  onSaveComponentDraft,
  onFinalizeDraftSession,
  onCancelDraftSession,
  onCancel,
  onSuccess,
  onDraftCancelled,
}) => {
  const [draftSession, setDraftSession] = useState<InspectionRecord | null>(initialDraftSession);
  const [selectedAssetId, setSelectedAssetId] = useState<string>(
    initialDraftSession?.assetId ||
      (initialSelectedAsset ? initialSelectedAsset.id : assets[0]?.id || '')
  );
  const [inspectorName, setInspectorName] = useState(
    initialDraftSession?.inspectorName ||
      currentUser?.displayName ||
      currentUser?.email?.split('@')[0] ||
      'Field Technician'
  );
  const [overallCondition, setOverallCondition] = useState<ConveyorCondition>(
    initialDraftSession?.overallCondition || 'good'
  );
  const [priority, setPriority] = useState<PriorityLevel>(
    initialDraftSession?.priority || 'low'
  );
  const [findings, setFindings] = useState(initialDraftSession?.findings || '');
  const [recommendations, setRecommendations] = useState(
    initialDraftSession?.recommendations || ''
  );
  const [photos, setPhotos] = useState<InspectionPhoto[]>(
    deduplicatePhotos(initialDraftSession?.photos || [])
  );

  // Per-component state hydrated from initialDraftSession or initialized cleanly
  const [componentStatuses, setComponentStatuses] = useState<Record<string, ComponentDraftStatus>>(() => {
    const init: Record<string, ComponentDraftStatus> = {};
    DEFAULT_INSPECTION_COMPONENTS.forEach((c) => {
      init[c] = initialDraftSession?.componentDrafts?.[c]?.status || 'NOT_STARTED';
    });
    return init;
  });

  const [components, setComponents] = useState<Record<string, ConveyorCondition | undefined>>(() => {
    const init: Record<string, ConveyorCondition | undefined> = {};
    DEFAULT_INSPECTION_COMPONENTS.forEach((c) => {
      init[c] =
        initialDraftSession?.componentDrafts?.[c]?.condition ||
        initialDraftSession?.components?.[c];
    });
    return init;
  });

  const [componentObservations, setComponentObservations] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    DEFAULT_INSPECTION_COMPONENTS.forEach((c) => {
      init[c] = initialDraftSession?.componentDrafts?.[c]?.observations || '';
    });
    return init;
  });

  const [componentNotes, setComponentNotes] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    DEFAULT_INSPECTION_COMPONENTS.forEach((c) => {
      init[c] =
        initialDraftSession?.componentDrafts?.[c]?.findings ||
        initialDraftSession?.componentNotes?.[c] ||
        '';
    });
    return init;
  });

  const [componentRecommendations, setComponentRecommendations] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    DEFAULT_INSPECTION_COMPONENTS.forEach((c) => {
      init[c] =
        initialDraftSession?.componentDrafts?.[c]?.recommendations ||
        initialDraftSession?.componentRecommendations?.[c] ||
        '';
    });
    return init;
  });

  const [notApplicableReasons, setNotApplicableReasons] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    DEFAULT_INSPECTION_COMPONENTS.forEach((c) => {
      init[c] = initialDraftSession?.componentDrafts?.[c]?.notApplicableReason || '';
    });
    return init;
  });

  const [componentSavedAt, setComponentSavedAt] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    DEFAULT_INSPECTION_COMPONENTS.forEach((c) => {
      if (initialDraftSession?.componentDrafts?.[c]?.savedAt) {
        init[c] = initialDraftSession.componentDrafts[c].savedAt!;
      }
    });
    return init;
  });

  const [savingComponent, setSavingComponent] = useState<string | null>(null);
  const [componentFeedback, setComponentFeedback] = useState<Record<string, { type: 'success' | 'error'; text: string }>>({});
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancellingDraft, setIsCancellingDraft] = useState(false);
  const [showReviewPanel, setShowReviewPanel] = useState(false);
  const [confirmCancelDraftOpen, setConfirmCancelDraftOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<{ url: string; caption: string } | null>(null);

  const photoBlobsRef = useRef<Record<string, { blob: Blob; contentType: string }>>({});
  const hydratedDraftIdRef = useRef<string | null>(initialDraftSession?.id || null);
  const initializingDraftIdRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);
  const bulkCameraInputRef = useRef<HTMLInputElement>(null);
  const bulkGalleryInputRef = useRef<HTMLInputElement>(null);

  const activeSessionId = draftSession?.id || nextInspectionId;
  const currentAsset = assets.find((a) => a.id === selectedAssetId);

  // Sync inspector name if user signs in mid-session
  useEffect(() => {
    if (currentUser && (inspectorName === 'Field Technician' || !inspectorName.trim())) {
      setInspectorName(currentUser.displayName || currentUser.email?.split('@')[0] || 'Field Inspector');
    }
  }, [currentUser, inspectorName]);

  // Hydrate when switching into a different resumed draft (never clobber in-progress edits on self-created draft)
  useEffect(() => {
    if (!initialDraftSession) return;
    if (
      hydratedDraftIdRef.current === initialDraftSession.id ||
      initializingDraftIdRef.current === initialDraftSession.id
    ) {
      return;
    }
    hydratedDraftIdRef.current = initialDraftSession.id;
    setDraftSession(initialDraftSession);
    setSelectedAssetId(initialDraftSession.assetId);
    setInspectorName(initialDraftSession.inspectorName || 'Field Technician');
    setOverallCondition(initialDraftSession.overallCondition || 'good');
    setPriority(initialDraftSession.priority || 'low');
    setFindings(initialDraftSession.findings || '');
    setRecommendations(initialDraftSession.recommendations || '');
    setPhotos((prev) => {
      // Merge Firestore-resumed photos with any currently uploading local photos without duplicating
      const localActive = prev.filter((p) => p.uploadStatus === 'uploading');
      return deduplicatePhotos([...(initialDraftSession.photos || []), ...localActive]);
    });

    const nextStatuses: Record<string, ComponentDraftStatus> = {};
    const nextConds: Record<string, ConveyorCondition | undefined> = {};
    const nextObs: Record<string, string> = {};
    const nextNotes: Record<string, string> = {};
    const nextRecs: Record<string, string> = {};
    const nextNa: Record<string, string> = {};
    const nextSaved: Record<string, string> = {};

    DEFAULT_INSPECTION_COMPONENTS.forEach((c) => {
      const cd = initialDraftSession.componentDrafts?.[c];
      nextStatuses[c] = cd?.status || 'NOT_STARTED';
      nextConds[c] = cd?.condition || initialDraftSession.components?.[c];
      nextObs[c] = cd?.observations || '';
      nextNotes[c] = cd?.findings || initialDraftSession.componentNotes?.[c] || '';
      nextRecs[c] = cd?.recommendations || initialDraftSession.componentRecommendations?.[c] || '';
      nextNa[c] = cd?.notApplicableReason || '';
      if (cd?.savedAt) nextSaved[c] = cd.savedAt;
    });

    setComponentStatuses(nextStatuses);
    setComponents(nextConds);
    setComponentObservations(nextObs);
    setComponentNotes(nextNotes);
    setComponentRecommendations(nextRecs);
    setNotApplicableReasons(nextNa);
    setComponentSavedAt(nextSaved);
  }, [initialDraftSession?.id]);

  useEffect(() => {
    if (!initialDraftSession && initialSelectedAsset) {
      setSelectedAssetId(initialSelectedAsset.id);
    }
  }, [initialSelectedAsset, initialDraftSession]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const hasUploadingPhotos = photos.some((p) => p.uploadStatus === 'uploading');
  const hasFailedPhotos = photos.some((p) => p.uploadStatus === 'failed');
  const unassignedBulkPhotos = photos.filter((p) => p.classificationStatus === 'unassigned');

  // Build live preview of draft state for progress bars and validation checks
  const liveComponentDrafts: Record<string, ComponentDraftRecord> = {};
  DEFAULT_INSPECTION_COMPONENTS.forEach((c) => {
    liveComponentDrafts[c] = {
      componentName: c,
      componentSlug: toComponentSlug(c),
      status: componentStatuses[c] || 'NOT_STARTED',
      condition: components[c],
      observations: componentObservations[c] || '',
      findings: componentNotes[c] || '',
      recommendations: componentRecommendations[c] || '',
      notApplicableReason: notApplicableReasons[c] || '',
      photoIds: photos
        .filter((p) => p.classificationStatus === 'assigned' && p.componentName === c)
        .map((p) => p.id),
      savedAt: componentSavedAt[c],
      version: draftSession?.componentDrafts?.[c]?.version || 0,
    };
  });

  const liveProgress = computeSessionProgress(
    { components: {}, componentDrafts: liveComponentDrafts },
    DEFAULT_INSPECTION_COMPONENTS
  );
  const liveSessionStatus = deriveSessionStatus(
    liveComponentDrafts,
    draftSession?.status || 'DRAFT'
  );

  const previewSessionForValidation: InspectionRecord = {
    ...(draftSession || {
      id: activeSessionId,
      workspaceId: DEFAULT_WORKSPACE_ID,
      assetId: currentAsset?.id || '',
      assetName: currentAsset?.name || '',
      inspectorName: inspectorName.trim() || 'Inspector',
      inspectorId: currentUser?.uid || '',
      inspectionDate: new Date().toISOString(),
      overallCondition,
      components: {},
      findings,
      recommendations,
      priority,
      photos,
      createdAt: new Date().toISOString(),
    }),
    assetId: currentAsset?.id || draftSession?.assetId || '',
    assetName: currentAsset?.name || draftSession?.assetName || '',
    findings,
    recommendations,
    overallCondition,
    priority,
    photos,
    componentDrafts: liveComponentDrafts,
  };

  const finalizationValidation = validateSessionFinalization(previewSessionForValidation, {
    requireCloudStoragePhotos: Boolean(currentUser),
    defaultComponentNames: DEFAULT_INSPECTION_COMPONENTS,
  });

  const recomputeOverallCondition = (nextComps: Record<string, ConveyorCondition | undefined>) => {
    const vals = Object.values(nextComps).filter(Boolean) as ConveyorCondition[];
    if (vals.includes('damaged')) {
      setOverallCondition('damaged');
      setPriority('critical');
    } else if (vals.includes('worn')) {
      setOverallCondition('worn');
      if (priority === 'low') setPriority('medium');
    } else if (vals.includes('fair')) {
      setOverallCondition('fair');
    } else if (vals.length > 0) {
      setOverallCondition('good');
    }
  };

  const markComponentEdited = (compName: string) => {
    setComponentFeedback((prev) => {
      const next = { ...prev };
      delete next[compName];
      return next;
    });
    setComponentStatuses((prev) => {
      const curr = prev[compName];
      if (curr === 'COMPLETED' || curr === 'SAVED' || curr === 'NOT_STARTED') {
        return { ...prev, [compName]: 'IN_PROGRESS' };
      }
      return prev;
    });
  };

  const handleComponentConditionChange = (componentName: string, condition: ConveyorCondition) => {
    const updated = { ...components, [componentName]: condition };
    setComponents(updated);
    setComponentStatuses((prev) => ({
      ...prev,
      [componentName]: 'IN_PROGRESS',
    }));
    setComponentFeedback((prev) => {
      const next = { ...prev };
      delete next[componentName];
      return next;
    });
    recomputeOverallCondition(updated);
  };

  const handleToggleNotApplicable = (componentName: string) => {
    setComponentFeedback((prev) => {
      const next = { ...prev };
      delete next[componentName];
      return next;
    });
    const isCurrentlyNA = componentStatuses[componentName] === 'NOT_APPLICABLE';
    if (isCurrentlyNA) {
      setComponentStatuses((prev) => ({
        ...prev,
        [componentName]: components[componentName] ? 'IN_PROGRESS' : 'NOT_STARTED',
      }));
    } else {
      setComponentStatuses((prev) => ({
        ...prev,
        [componentName]: 'NOT_APPLICABLE',
      }));
    }
  };

  const ensureDraftSessionCreated = async (): Promise<InspectionRecord> => {
    if (draftSession) return draftSession;
    if (!currentAsset) {
      throw new Error('Select a valid conveyor asset before creating a draft session.');
    }
    initializingDraftIdRef.current = activeSessionId;
    try {
      const created = await onCreateDraftSession({
        asset: currentAsset,
        inspectorName,
        sessionId: activeSessionId,
        priority,
      });
      hydratedDraftIdRef.current = created.id;
      setDraftSession(created);
      return created;
    } finally {
      initializingDraftIdRef.current = null;
    }
  };

  const handleCreateDraftClick = async () => {
    setError(null);
    setStatusBanner(null);
    if (!currentAsset) {
      setError('Please select a conveyor asset first.');
      return;
    }
    try {
      setIsCreatingDraft(true);
      const created = await ensureDraftSessionCreated();
      setStatusBanner(`Draft session ${created.id} created and persisted in Firestore.`);
    } catch (err: any) {
      setError(err?.message || 'Unable to create draft session.');
    } finally {
      setIsCreatingDraft(false);
    }
  };

  const handleSaveSingleComponent = async (componentName: string) => {
    setError(null);
    setComponentFeedback((prev) => {
      const next = { ...prev };
      delete next[componentName];
      return next;
    });

    const compStatus = componentStatuses[componentName];
    const targetSaveStatus: Extract<ComponentDraftStatus, 'SAVED' | 'COMPLETED' | 'NOT_APPLICABLE'> =
      compStatus === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : 'COMPLETED';

    const compPhotos = photos.filter(
      (p) => p.classificationStatus === 'assigned' && p.componentName === componentName
    );

    try {
      setSavingComponent(componentName);
      const session = await ensureDraftSessionCreated();

      const res = await onSaveComponentDraft({
        session,
        componentName,
        componentStatus: targetSaveStatus,
        condition: components[componentName],
        observations: componentObservations[componentName] || '',
        findings: componentNotes[componentName] || '',
        recommendations: componentRecommendations[componentName] || '',
        notApplicableReason: notApplicableReasons[componentName] || '',
        componentPhotos: compPhotos,
        inspectorName,
      });

      setDraftSession(res.updatedSession);
      setComponentStatuses((prev) => ({
        ...prev,
        [componentName]: res.updatedComponentDraft.status,
      }));
      if (res.updatedComponentDraft.savedAt) {
        setComponentSavedAt((prev) => ({
          ...prev,
          [componentName]: res.updatedComponentDraft.savedAt!,
        }));
      }
      setComponentFeedback((prev) => ({
        ...prev,
        [componentName]: {
          type: 'success',
          text: `Saved to Firestore (${res.updatedComponentDraft.status})`,
        },
      }));
      setStatusBanner(
        `Saved ${componentName} (${res.updatedSession.id} · v${res.updatedSession.version}). Safe to inspect another component or resume later.`
      );
    } catch (err: any) {
      const msg = err?.message || `Failed to save ${componentName}.`;
      setComponentFeedback((prev) => ({
        ...prev,
        [componentName]: { type: 'error', text: msg },
      }));
    } finally {
      setSavingComponent(null);
    }
  };

  const executePhotoUpload = async (photo: InspectionPhoto, blob: Blob, contentType: string) => {
    if (cancelledRef.current) return;

    // Never pretend a local preview is uploaded to Firebase Storage when unauthenticated
    if (!currentUser) {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photo.id
            ? {
                ...p,
                uploadStatus: 'failed',
                uploadProgress: 0,
                uploadError: 'Sign in with Google to upload to Cloud Storage, then tap Retry.',
              }
            : p
        )
      );
      return;
    }

    try {
      const result = await uploadBlobToFirebaseStorage({
        blob,
        storagePath: photo.storagePath!,
        contentType,
        onProgress: (pct) => {
          if (cancelledRef.current) return;
          setPhotos((prev) =>
            prev.map((p) => (p.id === photo.id ? { ...p, uploadProgress: pct } : p))
          );
        },
      });
      if (cancelledRef.current) return;
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photo.id
            ? {
                ...p,
                url: result.downloadUrl,
                storagePath: result.storagePath,
                uploadStatus: 'uploaded',
                uploadProgress: 100,
                uploadError: undefined,
              }
            : p
        )
      );
    } catch (err: any) {
      if (cancelledRef.current) return;
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photo.id
            ? {
                ...p,
                uploadStatus: 'failed',
                uploadError: err?.message || 'Upload failed. Tap Retry to re-upload.',
              }
            : p
        )
      );
    }
  };

  const processFilesForTarget = async (
    files: FileList | null,
    targetComponentName?: string
  ) => {
    if (!files || files.length === 0) return;
    setError(null);

    if (targetComponentName) {
      markComponentEdited(targetComponentName);
    }

    const fileArray = Array.from(files);
    for (const file of fileArray) {
      const photoId = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date().toISOString();
      const isAssigned = Boolean(targetComponentName);
      const storagePath = buildPhotoStoragePath({
        workspaceId: DEFAULT_WORKSPACE_ID,
        sessionId: activeSessionId,
        componentName: targetComponentName,
        photoId,
        category: isAssigned ? 'INSPECTION' : 'GENERAL_SESSION_EVIDENCE',
      });

      try {
        const compressed = await compressImageFile(file);
        if (cancelledRef.current) return;

        photoBlobsRef.current[photoId] = {
          blob: compressed.blob,
          contentType: compressed.contentType,
        };

        const newPhoto: InspectionPhoto = {
          id: photoId,
          photoId,
          url: compressed.previewUrl,
          caption: isAssigned
            ? `${targetComponentName} — ${file.name.replace(/\.[^/.]+$/, '')}`
            : file.name.replace(/\.[^/.]+$/, ''),
          timestamp: now,
          workspaceId: DEFAULT_WORKSPACE_ID,
          inspectionSessionId: activeSessionId,
          assetId: currentAsset?.id,
          componentName: targetComponentName,
          componentId: targetComponentName ? toComponentSlug(targetComponentName) : undefined,
          photoCategory: 'INSPECTION',
          classificationStatus: isAssigned ? 'assigned' : 'unassigned',
          storagePath,
          originalFilename: compressed.originalFilename,
          contentType: compressed.contentType,
          fileSize: compressed.fileSize,
          uploadedBy: inspectorName.trim() || 'Field Technician',
          uploadedById: currentUser?.uid || '',
          uploadStatus: 'uploading',
          uploadProgress: 10,
          isFinalized: false,
          createdAt: now,
        };

        setPhotos((prev) => deduplicatePhotos([...prev, newPhoto]));
        void executePhotoUpload(newPhoto, compressed.blob, compressed.contentType);
      } catch (err: any) {
        setError(err?.message || `Failed to process image "${file.name}".`);
      }
    }
  };

  const handleRetryPhotoUpload = (photo: InspectionPhoto) => {
    const cached = photoBlobsRef.current[photo.id];
    if (!cached) {
      setError('Original file buffer unavailable after page reload. Remove and re-select this photo.');
      return;
    }
    setPhotos((prev) =>
      prev.map((p) =>
        p.id === photo.id
          ? {
              ...p,
              uploadedById: currentUser?.uid || p.uploadedById,
              uploadStatus: 'uploading',
              uploadProgress: 10,
              uploadError: undefined,
            }
          : p
      )
    );
    void executePhotoUpload(
      { ...photo, uploadedById: currentUser?.uid || photo.uploadedById },
      cached.blob,
      cached.contentType
    );
  };

  const handleReclassifyBulkPhoto = (photoId: string, selectionValue: string) => {
    setError(null);
    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id !== photoId) return p;

        if (!selectionValue) {
          return {
            ...p,
            classificationStatus: 'unassigned' as PhotoClassificationStatus,
            componentName: undefined,
            componentId: undefined,
            photoCategory: 'INSPECTION',
          };
        }

        if (selectionValue === '__GENERAL__') {
          return {
            ...p,
            classificationStatus: 'general_session_evidence' as PhotoClassificationStatus,
            componentName: undefined,
            componentId: undefined,
            photoCategory: 'GENERAL_SESSION_EVIDENCE',
            storagePath: buildPhotoStoragePath({
              workspaceId: DEFAULT_WORKSPACE_ID,
              sessionId: activeSessionId,
              photoId: p.id,
              category: 'GENERAL_SESSION_EVIDENCE',
            }),
          };
        }

        return {
          ...p,
          classificationStatus: 'assigned' as PhotoClassificationStatus,
          componentName: selectionValue,
          componentId: toComponentSlug(selectionValue),
          photoCategory: 'INSPECTION',
          storagePath: buildPhotoStoragePath({
            workspaceId: DEFAULT_WORKSPACE_ID,
            sessionId: activeSessionId,
            componentName: selectionValue,
            photoId: p.id,
            category: 'INSPECTION',
          }),
        };
      })
    );
    if (selectionValue && selectionValue !== '__GENERAL__') {
      markComponentEdited(selectionValue);
    }
  };

  const removePhoto = (photoId: string, componentName?: string) => {
    delete photoBlobsRef.current[photoId];
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    if (componentName) {
      markComponentEdited(componentName);
    }
  };

  const handleLeaveClick = () => {
    if (hasUploadingPhotos) {
      setConfirmLeaveOpen(true);
    } else {
      cancelledRef.current = true;
      onCancel();
    }
  };

  const handleConfirmCancelDraft = async () => {
    if (!draftSession) {
      onCancel();
      return;
    }
    try {
      setIsCancellingDraft(true);
      setError(null);
      await onCancelDraftSession(draftSession, cancelReason.trim() || 'Cancelled by inspector');
      setConfirmCancelDraftOpen(false);
      if (onDraftCancelled) {
        onDraftCancelled(draftSession.id);
      } else {
        onCancel();
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to cancel draft inspection.');
    } finally {
      setIsCancellingDraft(false);
    }
  };

  const handleFinalizeSubmit = async () => {
    setError(null);
    if (!finalizationValidation.valid) {
      setError(finalizationValidation.errors[0]);
      return;
    }

    try {
      setIsSubmitting(true);
      const session = await ensureDraftSessionCreated();

      // Re-attach bulk/general photos plus latest assigned component photos
      const finalizedRecord = await onFinalizeDraftSession({
        session: {
          ...session,
          componentDrafts: liveComponentDrafts,
          components: Object.fromEntries(
            Object.entries(liveComponentDrafts)
              .filter(([, d]) => d.status !== 'NOT_APPLICABLE' && d.condition)
              .map(([k, d]) => [k, d.condition!])
          ),
          componentNotes,
          componentRecommendations,
          photos,
        },
        overallOverrides: {
          findings: findings.trim(),
          recommendations: recommendations.trim() || 'No immediate corrective action required.',
          overallCondition,
          priority,
          extraSessionPhotos: photos.filter((p) => p.classificationStatus !== 'assigned'),
          inspectorName,
        },
      });

      setShowReviewPanel(false);
      onSuccess(finalizedRecord);
    } catch (err: any) {
      setError(err?.message || 'Failed to finalize inspection session.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const bulkOrGeneralPhotos = photos.filter(
    (p) =>
      p.classificationStatus === 'unassigned' ||
      p.classificationStatus === 'general_session_evidence'
  );

  const getComponentBadgeStyle = (status: ComponentDraftStatus) => {
    switch (status) {
      case 'COMPLETED':
      case 'SAVED':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'IN_PROGRESS':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'NOT_APPLICABLE':
        return 'bg-slate-200 text-slate-700 border-slate-300';
      default:
        return 'bg-slate-100 text-slate-500 border-slate-200';
    }
  };

  const getSessionStatusStyle = (status: string) => {
    switch (status) {
      case 'READY_FOR_REVIEW':
        return 'bg-emerald-50 text-emerald-800 border-emerald-300';
      case 'IN_PROGRESS':
        return 'bg-blue-50 text-blue-800 border-blue-300';
      case 'CANCELLED':
        return 'bg-rose-50 text-rose-800 border-rose-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  const formatTime = (iso?: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Top Header & Progressive Session Status Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-500 mb-1 flex-wrap">
              <span>PROGRESSIVE FIELD INSPECTION</span>
              <span aria-hidden="true">·</span>
              <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${getSessionStatusStyle(liveSessionStatus)}`}>
                {liveSessionStatus.replace(/_/g, ' ')}
              </span>
              {draftSession?.lastSavedAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1 text-emerald-700">
                    <CloudCheck className="w-3.5 h-3.5" />
                    Last synced {formatTime(draftSession.lastSavedAt)}
                  </span>
                </>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-display text-slate-900 tracking-tight">
              {initialDraftSession ? `Resume Inspection ${activeSessionId}` : 'New Progressive Conveyor Inspection'}
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              Inspect components independently, upload component-specific photos, save progress to Firestore at any time, and finalize once complete.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-[11px] text-slate-400 font-mono">SESSION ID</div>
              <div className="text-sm font-mono font-bold text-blue-900">{activeSessionId}</div>
            </div>
            <button
              type="button"
              onClick={handleLeaveClick}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
              title="Back to overview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Component Completion Progress Meter */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-semibold text-slate-800">
                Component Progress: {liveProgress.doneCount} / {liveProgress.totalCount} saved
              </span>
              <span className="text-slate-500">
                {liveProgress.completedCount + liveProgress.savedCount} inspected · {liveProgress.notApplicableCount} N/A · {liveProgress.inProgressCount + liveProgress.notStartedCount} remaining
              </span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div
                className="bg-blue-900 h-full transition-all duration-300"
                style={{
                  width: `${liveProgress.totalCount > 0 ? Math.round((liveProgress.doneCount / liveProgress.totalCount) * 100) : 0}%`,
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!draftSession && (
              <button
                type="button"
                disabled={isCreatingDraft || !currentUser || !currentAsset}
                onClick={() => void handleCreateDraftClick()}
                className="px-3 py-1.5 text-xs font-semibold bg-white border border-blue-900 text-blue-900 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
              >
                {isCreatingDraft ? 'Creating Draft...' : 'Create Draft Session'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowReviewPanel(true)}
              className="px-3.5 py-1.5 text-xs font-semibold bg-blue-900 hover:bg-blue-800 text-white rounded-md shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>Review & Finalize</span>
            </button>
          </div>
        </div>

        {/* Auth Required Notice for Cloud Drafts & Photo Storage */}
        {!currentUser && (
          <div className="p-3.5 rounded-md bg-amber-50 border border-amber-300 text-amber-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                <strong>Sign-In Required for Cloud Saving:</strong> Google authentication is required to persist progressive component drafts to Firestore and upload component photographs to Firebase Storage.
              </span>
            </div>
            <button
              type="button"
              onClick={() => void loginWithGoogle()}
              className="px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded font-semibold flex items-center gap-1.5 shrink-0"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In with Google</span>
            </button>
          </div>
        )}

        {statusBanner && (
          <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{statusBanner}</span>
          </div>
        )}
      </div>

      {/* Inline Mid-Upload Leave Confirmation */}
      {confirmLeaveOpen && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              <strong>Active photo uploads in progress.</strong> Leaving now will abort pending uploads. Saved components remain persisted in Firestore.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmLeaveOpen(false)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded font-medium text-slate-700 hover:bg-slate-50"
            >
              Stay & Finish Uploads
            </button>
            <button
              type="button"
              onClick={() => {
                cancelledRef.current = true;
                photoBlobsRef.current = {};
                onCancel();
              }}
              className="px-3 py-1.5 bg-rose-700 text-white rounded font-semibold hover:bg-rose-800"
            >
              Leave Form
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Section 1: Equipment & Inspector Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold font-display uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">
          <Layers className="w-4 h-4 text-blue-900" />
          <span>1. Target Conveyor Equipment Selection</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Conveyor Asset *
            </label>
            <select
              required
              disabled={Boolean(draftSession)}
              value={selectedAssetId}
              onChange={(e) => setSelectedAssetId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 text-slate-900 bg-white disabled:bg-slate-100 disabled:text-slate-600"
            >
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.id} — {asset.name} ({asset.location})
                </option>
              ))}
            </select>
            {draftSession && (
              <p className="text-[11px] text-slate-400 mt-1">
                Asset locked once draft session {draftSession.id} is initialized.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Inspector Name / Employee ID *
            </label>
            <input
              type="text"
              required
              value={inspectorName}
              onChange={(e) => setInspectorName(e.target.value)}
              placeholder="Technician full name"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 text-slate-900"
            />
          </div>
        </div>

        {currentAsset && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs flex flex-wrap items-center justify-between gap-3 font-mono text-slate-600">
            <div>
              <span className="text-slate-400">Site / Location:</span>{' '}
              <strong className="text-slate-900">{currentAsset.location}</strong>
            </div>
            <div>
              <span className="text-slate-400">Belt Width:</span>{' '}
              <strong className="text-slate-900">{currentAsset.beltWidthMm} mm</strong>
            </div>
            <div>
              <span className="text-slate-400">Length:</span>{' '}
              <strong className="text-slate-900">{currentAsset.lengthMeters} m</strong>
            </div>
            <div>
              <span className="text-slate-400">Speed:</span>{' '}
              <strong className="text-slate-900">{currentAsset.speedMps} m/s</strong>
            </div>
            <div>
              <span className="text-slate-400">Prior Condition:</span>{' '}
              <strong className="uppercase text-slate-900">{currentAsset.currentCondition}</strong>
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Progressive Independent Component Inspection Cards */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2 text-xs font-bold font-display uppercase tracking-wider text-slate-800">
            <CheckCircle2 className="w-4 h-4 text-blue-900" />
            <span>2. Component-by-Component Inspection & Independent Saving</span>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            Save each component independently · Photos upload straight to component storage path
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DEFAULT_INSPECTION_COMPONENTS.map((comp) => {
            const compStatus = componentStatuses[comp] || 'NOT_STARTED';
            const currentVal = components[comp];
            const isNA = compStatus === 'NOT_APPLICABLE';
            const compPhotos = photos.filter(
              (p) => p.classificationStatus === 'assigned' && p.componentName === comp
            );
            const isSavingThis = savingComponent === comp;
            const compHasUploading = compPhotos.some((p) => p.uploadStatus === 'uploading');
            const compHasFailed = compPhotos.some((p) => p.uploadStatus === 'failed');
            const fb = componentFeedback[comp];

            return (
              <div
                key={comp}
                className={`p-4 rounded-lg border flex flex-col justify-between gap-3 transition-colors ${
                  compStatus === 'COMPLETED' || compStatus === 'SAVED'
                    ? 'border-emerald-200 bg-emerald-50/20'
                    : compStatus === 'IN_PROGRESS'
                    ? 'border-amber-200 bg-amber-50/20'
                    : isNA
                    ? 'border-slate-300 bg-slate-100/70'
                    : 'border-slate-200 bg-slate-50/60'
                }`}
              >
                {/* Component Title & Status Badge */}
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">{comp}</span>
                      {componentSavedAt[comp] && (
                        <span className="text-[10px] font-mono text-emerald-700 flex items-center gap-1 mt-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          Saved at {formatTime(componentSavedAt[comp])}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase shrink-0 ${getComponentBadgeStyle(compStatus)}`}
                    >
                      {compStatus.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Condition Selector + N/A Toggle */}
                  <div className="grid grid-cols-5 gap-1">
                    {(['good', 'fair', 'worn', 'damaged'] as ConveyorCondition[]).map((cond) => {
                      const isSelected = !isNA && currentVal === cond;
                      const colors = {
                        good: isSelected
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-slate-600 hover:bg-emerald-50 border-slate-200',
                        fair: isSelected
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-white text-slate-600 hover:bg-blue-50 border-slate-200',
                        worn: isSelected
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-slate-600 hover:bg-amber-50 border-slate-200',
                        damaged: isSelected
                          ? 'bg-rose-700 text-white border-rose-700'
                          : 'bg-white text-slate-600 hover:bg-rose-50 border-slate-200',
                      };

                      return (
                        <button
                          key={cond}
                          type="button"
                          onClick={() => handleComponentConditionChange(comp, cond)}
                          className={`py-1 text-[10px] font-mono font-semibold rounded border uppercase transition-colors ${colors[cond]}`}
                        >
                          {cond}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => handleToggleNotApplicable(comp)}
                      className={`py-1 text-[10px] font-mono font-semibold rounded border uppercase transition-colors ${
                        isNA
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-white text-slate-500 hover:bg-slate-100 border-slate-200'
                      }`}
                    >
                      N/A
                    </button>
                  </div>

                  {/* Component Inputs */}
                  {isNA ? (
                    <div className="space-y-1">
                      <label className="block text-[10px] font-mono font-semibold text-slate-600 uppercase">
                        Reason Not Applicable *
                      </label>
                      <input
                        type="text"
                        placeholder={`Why is ${comp} not applicable?`}
                        value={notApplicableReasons[comp] || ''}
                        onChange={(e) => {
                          setNotApplicableReasons((prev) => ({ ...prev, [comp]: e.target.value }));
                          setComponentFeedback((prev) => {
                            const next = { ...prev };
                            delete next[comp];
                            return next;
                          });
                        }}
                        className="w-full px-2.5 py-1.5 text-[11px] border border-slate-300 rounded bg-white text-slate-800"
                      />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        placeholder="Observations (wear pattern, alignment, sound)..."
                        value={componentObservations[comp] || ''}
                        onChange={(e) => {
                          setComponentObservations((prev) => ({ ...prev, [comp]: e.target.value }));
                          markComponentEdited(comp);
                        }}
                        className="w-full px-2.5 py-1.5 text-[11px] border border-slate-300 rounded bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-900"
                      />
                      <input
                        type="text"
                        placeholder={
                          currentVal === 'worn' || currentVal === 'damaged'
                            ? `Findings for ${comp} (required for ${currentVal})...`
                            : `Findings for ${comp}...`
                        }
                        value={componentNotes[comp] || ''}
                        onChange={(e) => {
                          setComponentNotes((prev) => ({ ...prev, [comp]: e.target.value }));
                          markComponentEdited(comp);
                        }}
                        className="w-full px-2.5 py-1.5 text-[11px] border border-slate-300 rounded bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-900"
                      />
                      <input
                        type="text"
                        placeholder={`Recommendation for ${comp}...`}
                        value={componentRecommendations[comp] || ''}
                        onChange={(e) => {
                          setComponentRecommendations((prev) => ({ ...prev, [comp]: e.target.value }));
                          markComponentEdited(comp);
                        }}
                        className="w-full px-2.5 py-1.5 text-[11px] border border-slate-300 rounded bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-900"
                      />
                    </div>
                  )}

                  {/* Per-Component Photo Evidence */}
                  {!isNA && (
                    <div className="pt-2 border-t border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono font-semibold text-slate-600 flex items-center gap-1">
                          <ImageIcon className="w-3 h-3 text-blue-900" />
                          <span>Photos ({compPhotos.length})</span>
                        </span>

                        <div className="flex items-center gap-1.5">
                          <label className="cursor-pointer px-2 py-1 text-[11px] font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded flex items-center gap-1 transition-colors">
                            <Camera className="w-3 h-3" />
                            <span>Camera</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={(e) => {
                                void processFilesForTarget(e.target.files, comp);
                                e.target.value = '';
                              }}
                              className="sr-only"
                            />
                          </label>
                          <label className="cursor-pointer px-2 py-1 text-[11px] font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded flex items-center gap-1 transition-colors">
                            <Upload className="w-3 h-3" />
                            <span>Upload</span>
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={(e) => {
                                void processFilesForTarget(e.target.files, comp);
                                e.target.value = '';
                              }}
                              className="sr-only"
                            />
                          </label>
                        </div>
                      </div>

                      {compPhotos.length > 0 && (
                        <div className="grid grid-cols-3 gap-1.5">
                          {compPhotos.map((photo) => (
                            <div
                              key={photo.id}
                              className="relative group rounded overflow-hidden border border-slate-300 bg-slate-900 aspect-4/3"
                            >
                              <img
                                src={photo.url}
                                alt={photo.caption}
                                onClick={() => setLightboxPhoto({ url: photo.url, caption: photo.caption })}
                                className="w-full h-full object-cover cursor-pointer"
                              />
                              {(photo.uploadStatus === 'uploaded' || photo.uploadStatus === 'finalized') && (
                                <span className="absolute bottom-1 left-1 px-1 py-0.5 bg-emerald-800/90 text-white text-[8px] font-mono rounded uppercase">
                                  Uploaded
                                </span>
                              )}
                              {photo.uploadStatus === 'uploading' && (
                                <div className="absolute inset-0 bg-slate-950/70 flex flex-col items-center justify-center text-white text-[10px] font-mono p-1">
                                  <span>{photo.uploadProgress || 0}%</span>
                                  <div className="w-full bg-slate-700 h-1 rounded mt-1 overflow-hidden">
                                    <div
                                      className="bg-blue-400 h-full transition-all"
                                      style={{ width: `${photo.uploadProgress || 10}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                              {photo.uploadStatus === 'failed' && (
                                <div className="absolute inset-0 bg-rose-950/85 flex flex-col items-center justify-center p-1 text-center">
                                  <span className="text-[9px] text-rose-100 font-semibold mb-1">
                                    Upload Failed
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleRetryPhotoUpload(photo)}
                                    className="px-1.5 py-0.5 bg-white text-rose-900 rounded text-[9px] font-bold flex items-center gap-0.5"
                                  >
                                    <RefreshCw className="w-2.5 h-2.5" />
                                    <span>Retry</span>
                                  </button>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => removePhoto(photo.id, comp)}
                                className="absolute top-1 right-1 p-1 bg-slate-900/75 text-white rounded hover:bg-rose-600 transition-colors"
                                title="Remove photo"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Component Feedback + Independent Save Component Action */}
                <div className="pt-2 border-t border-slate-200/80 space-y-2">
                  {fb && (
                    <div
                      className={`px-2.5 py-1.5 rounded text-[11px] flex items-center gap-1.5 ${
                        fb.type === 'success'
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                          : 'bg-rose-100 text-rose-900 border border-rose-200'
                      }`}
                    >
                      {fb.type === 'success' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>{fb.text}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-slate-400">
                      {compHasUploading
                        ? 'Waiting for photo upload...'
                        : compHasFailed
                        ? 'Retry/remove failed photo before saving'
                        : isNA
                        ? 'Saves as Not Applicable'
                        : 'Saves directly to session draft'}
                    </span>

                    <button
                      type="button"
                      disabled={isSavingThis || compHasUploading || compHasFailed}
                      onClick={() => void handleSaveSingleComponent(comp)}
                      className="px-3 py-1.5 text-[11px] font-bold text-white bg-blue-900 hover:bg-blue-800 rounded shadow-2xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <Save className="w-3 h-3" />
                      <span>{isSavingThis ? 'Saving...' : 'Save Component'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Overall Condition & Priority */}
        <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-2">
              Overall Conveyor Condition *
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['good', 'fair', 'worn', 'damaged'] as ConveyorCondition[]).map((cond) => {
                const isSelected = overallCondition === cond;
                const borderActive = {
                  good: 'border-emerald-600 bg-emerald-50 text-emerald-900',
                  fair: 'border-blue-600 bg-blue-50 text-blue-900',
                  worn: 'border-amber-600 bg-amber-50 text-amber-900',
                  damaged: 'border-rose-600 bg-rose-50 text-rose-900',
                };

                return (
                  <button
                    key={cond}
                    type="button"
                    onClick={() => setOverallCondition(cond)}
                    className={`p-2.5 rounded-md border text-center transition-all ${
                      isSelected
                        ? `${borderActive[cond]} shadow-xs font-bold`
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs font-mono uppercase">{cond}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-2">
              Maintenance Priority
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['low', 'medium', 'high', 'critical'] as PriorityLevel[]).map((lvl) => {
                const isSelected = priority === lvl;
                const priorityColors = {
                  low: 'border-slate-400 bg-slate-100 text-slate-900',
                  medium: 'border-blue-600 bg-blue-50 text-blue-900',
                  high: 'border-amber-600 bg-amber-50 text-amber-900',
                  critical: 'border-rose-600 bg-rose-50 text-rose-900 font-bold',
                };

                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setPriority(lvl)}
                    className={`p-2.5 rounded-md border text-center transition-all ${
                      isSelected
                        ? `${priorityColors[lvl]} shadow-xs`
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs font-mono uppercase">{lvl}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Bulk / General Session Photos */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2 text-xs font-bold font-display uppercase tracking-wider text-slate-800">
            <Camera className="w-4 h-4 text-blue-900" />
            <span>3. Bulk / General Session Photo Classification ({photos.length} Total Attached)</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Bulk photos start UNASSIGNED until classified
          </span>
        </div>

        <div className="flex flex-wrap gap-3">
          <input
            ref={bulkCameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              void processFilesForTarget(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => bulkCameraInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-md text-xs font-semibold shadow-xs transition-colors"
          >
            <Camera className="w-4 h-4" />
            <span>Take Bulk / Overview Photo</span>
          </button>

          <input
            ref={bulkGalleryInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              void processFilesForTarget(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => bulkGalleryInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-md text-xs font-medium transition-colors"
          >
            <Upload className="w-4 h-4 text-slate-600" />
            <span>Bulk Upload from Device</span>
          </button>
        </div>

        {unassignedBulkPhotos.length > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              <strong>Classification Required:</strong> {unassignedBulkPhotos.length} bulk photo{unassignedBulkPhotos.length > 1 ? 's' : ''} must be assigned to a component or marked as General Session Evidence before finalizing.
            </span>
          </div>
        )}

        {bulkOrGeneralPhotos.length > 0 ? (
          <div className="space-y-2.5 pt-1">
            {bulkOrGeneralPhotos.map((photo) => {
              const currentSelect =
                photo.classificationStatus === 'general_session_evidence'
                  ? '__GENERAL__'
                  : photo.componentName || '';

              return (
                <div
                  key={photo.id}
                  className={`p-3 rounded-md border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    photo.classificationStatus === 'unassigned'
                      ? 'border-amber-300 bg-amber-50/40'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      onClick={() => setLightboxPhoto({ url: photo.url, caption: photo.caption })}
                      className="relative w-16 h-12 rounded overflow-hidden border border-slate-300 bg-slate-900 shrink-0 cursor-pointer"
                    >
                      <img src={photo.url} alt={photo.caption} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-slate-900/30 opacity-0 hover:opacity-100 flex items-center justify-center">
                        <ZoomIn className="w-3.5 h-3.5 text-white" />
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {photo.originalFilename || photo.caption}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {photo.classificationStatus === 'unassigned' ? (
                          <span className="text-amber-700 font-bold">UNASSIGNED</span>
                        ) : (
                          <span className="text-blue-900 font-bold">GENERAL SESSION EVIDENCE</span>
                        )}
                        {photo.uploadStatus === 'uploading' && ` · Uploading ${photo.uploadProgress || 0}%`}
                        {photo.uploadStatus === 'uploaded' && ` · Uploaded`}
                        {photo.uploadStatus === 'failed' && ` · Upload Failed`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={currentSelect}
                      onChange={(e) => handleReclassifyBulkPhoto(photo.id, e.target.value)}
                      className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-900"
                    >
                      <option value="">-- UNASSIGNED (Select Target) --</option>
                      {DEFAULT_INSPECTION_COMPONENTS.map((comp) => (
                        <option key={comp} value={comp}>
                          Component: {comp}
                        </option>
                      ))}
                      <option value="__GENERAL__">General Session Evidence (Asset Overview)</option>
                    </select>

                    {photo.uploadStatus === 'failed' && (
                      <button
                        type="button"
                        onClick={() => handleRetryPhotoUpload(photo)}
                        className="px-2.5 py-1.5 bg-amber-100 text-amber-900 border border-amber-300 rounded text-xs font-semibold flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Retry</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
                      title="Remove photo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4 border border-dashed border-slate-200 rounded-md text-center text-slate-500 text-xs">
            Use the component cards above to attach component-specific evidence directly, or upload bulk / asset-overview photos here for explicit classification.
          </div>
        )}
      </div>

      {/* Section 4: Overall Findings & Recommendations */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold font-display uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">
          <FileCheck className="w-4 h-4 text-blue-900" />
          <span>4. Overall Session Findings & Recommendations</span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Overall Session Findings & Summary *
          </label>
          <textarea
            rows={3}
            value={findings}
            onChange={(e) => setFindings(e.target.value)}
            placeholder="Summarize overall conveyor belt integrity, mechanical observations, and urgent safety defects..."
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 text-slate-900"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Overall Corrective Action Recommendations
          </label>
          <textarea
            rows={2}
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            placeholder="e.g. Schedule replacement of worn idler rolls and cold-patch damaged top cover edge."
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 text-slate-900"
          />
        </div>
      </div>

      {/* Cancel Draft Inline Panel */}
      {confirmCancelDraftOpen && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-rose-900">
            <Ban className="w-4 h-4 text-rose-700" />
            <span>Cancel Draft Inspection {activeSessionId}?</span>
          </div>
          <p className="text-xs text-rose-800">
            Cancelling marks the session CANCELLED and removes it from your active resume queue without generating component reports or altering asset health.
          </p>
          <input
            type="text"
            placeholder="Cancellation reason (optional)..."
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className="w-full px-3 py-1.5 text-xs border border-rose-300 rounded bg-white text-slate-900"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmCancelDraftOpen(false)}
              className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded font-medium text-slate-700"
            >
              Keep Draft
            </button>
            <button
              type="button"
              disabled={isCancellingDraft}
              onClick={() => void handleConfirmCancelDraft()}
              className="px-3 py-1.5 text-xs bg-rose-700 hover:bg-rose-800 text-white rounded font-semibold disabled:opacity-50"
            >
              {isCancellingDraft ? 'Cancelling...' : 'Confirm Cancel Draft'}
            </button>
          </div>
        </div>
      )}

      {/* Form Footer Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleLeaveClick}
            className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
          >
            Save & Exit Later
          </button>
          {draftSession && (
            <button
              type="button"
              onClick={() => setConfirmCancelDraftOpen((v) => !v)}
              className="px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-md transition-colors flex items-center gap-1"
            >
              <Ban className="w-3.5 h-3.5" />
              <span>Cancel Draft</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {hasUploadingPhotos && (
            <span className="text-xs font-mono text-amber-700">Waiting for uploads...</span>
          )}
          <button
            type="button"
            onClick={() => setShowReviewPanel(true)}
            className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 active:bg-blue-950 rounded-md shadow-xs transition-colors font-display"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Review & Finalize Inspection</span>
          </button>
        </div>
      </div>

      {/* Review & Finalize Inspection Modal */}
      {showReviewPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-2xl w-full my-auto overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono text-slate-500 uppercase">
                  FINALIZATION GATE · {activeSessionId}
                </div>
                <h2 className="text-base font-bold font-display text-slate-900">
                  Review & Finalize Inspection Session
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowReviewPanel(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded border border-slate-200 font-mono">
                <div>
                  <div className="text-slate-400 text-[10px]">ASSET</div>
                  <div className="font-bold text-slate-900 truncate">{currentAsset?.name || 'None'}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px]">COMPONENTS SAVED</div>
                  <div className="font-bold text-slate-900">
                    {liveProgress.doneCount} / {liveProgress.totalCount}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px]">OVERALL GRADE</div>
                  <div className="font-bold uppercase text-slate-900">{overallCondition}</div>
                </div>
              </div>

              {!finalizationValidation.valid ? (
                <div className="p-3.5 rounded-md bg-rose-50 border border-rose-200 space-y-1.5 text-rose-900">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
                    <span>Finalization Blocked — Resolve Required Items:</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-1 text-[11px]">
                    {finalizationValidation.errors.map((errMsg, idx) => (
                      <li key={idx}>{errMsg}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="p-3.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>
                    All components, findings, and component-mapped photos pass finalization checks. Finalizing will lock original audit evidence as immutable and generate independent Component Inspection Reports.
                  </span>
                </div>
              )}

              {/* Component Readiness Table */}
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono">
                      <th className="py-2 px-3">COMPONENT</th>
                      <th className="py-2 px-3">STATUS</th>
                      <th className="py-2 px-3">RATING</th>
                      <th className="py-2 px-3 text-right">PHOTOS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {DEFAULT_INSPECTION_COMPONENTS.map((comp) => {
                      const d = liveComponentDrafts[comp];
                      const count = d.photoIds.length;
                      return (
                        <tr key={comp}>
                          <td className="py-2 px-3 font-medium text-slate-900">{comp}</td>
                          <td className="py-2 px-3">
                            <span
                              className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${getComponentBadgeStyle(d.status)}`}
                            >
                              {d.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono uppercase text-slate-700">
                            {d.status === 'NOT_APPLICABLE' ? 'N/A' : d.condition || '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-slate-600">{count}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReviewPanel(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded"
              >
                Back to Inspection
              </button>
              <button
                type="button"
                disabled={isSubmitting || !finalizationValidation.valid || !currentUser}
                onClick={() => void handleFinalizeSubmit()}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isSubmitting ? 'Finalizing Session...' : 'Finalize & Generate Reports'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Preview */}
      {lightboxPhoto && (
        <div
          onClick={() => setLightboxPhoto(null)}
          className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4"
        >
          <div className="max-w-3xl w-full relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLightboxPhoto(null)}
              className="absolute -top-10 right-0 p-2 text-white hover:text-slate-300"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={lightboxPhoto.url}
              alt={lightboxPhoto.caption}
              className="w-full max-h-[80vh] object-contain rounded border border-slate-700"
            />
            {lightboxPhoto.caption && (
              <div className="mt-2 text-center text-xs font-mono text-slate-300">
                {lightboxPhoto.caption}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
