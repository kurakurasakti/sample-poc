/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc,
  writeBatch,
  query,
  where,
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  ConveyorAsset, 
  InspectionRecord, 
  ConveyorCondition, 
  DashboardMetrics, 
  MaintenanceProgressUpdate,
  MaintenanceVerification,
  ComponentInspectionReport,
  ComponentDraftRecord,
  ComponentDraftStatus,
  InspectionPhoto,
  PhotoAuditEvent,
  PriorityLevel,
  getCurrentFindingCondition,
  reconcileAssetCondition,
  buildComponentReportsFromSession,
  migrateLegacyPhotos,
  validatePhotoAssociation,
  isSessionFinalized,
  isDraftInspectionSession,
  toComponentSlug
} from '../types/conveyor';
import { INITIAL_ASSETS, INITIAL_INSPECTIONS, INITIAL_MAINTENANCE_UPDATES, INITIAL_COMPONENT_REPORTS } from '../data/initialSampleData';
import { db, auth, testFirestoreConnection } from './firebase';
import { DEFAULT_WORKSPACE_ID, sanitizePhotoForFirestore } from './photoStorage';
import {
  DEFAULT_INSPECTION_COMPONENTS,
  cancelDraftSessionTransaction,
  createDraftSessionData,
  finalizeInspectionSessionTransaction,
  saveComponentDraftTransaction,
  saveDraftSessionToFirestore,
} from './inspectionDrafts';

const STORAGE_KEY_ASSETS = 'conveyor_tracker_assets_v1';
const STORAGE_KEY_INSPECTIONS = 'conveyor_tracker_inspections_v1';
const STORAGE_KEY_MAINTENANCE = 'conveyor_tracker_maintenance_v1';
const STORAGE_KEY_COMPONENT_REPORTS = 'conveyor_tracker_component_reports_v1';
const STORAGE_KEY_PHOTO_AUDIT = 'conveyor_tracker_photo_audit_v1';

// Sequential ID Generators
export function generateNextAssetId(assets: ConveyorAsset[]): string {
  const currentYear = new Date().getFullYear();
  const prefix = `CV-${currentYear}-`;
  
  let maxNum = 0;
  for (const asset of assets) {
    if (asset.id.startsWith(prefix)) {
      const numPart = parseInt(asset.id.replace(prefix, ''), 10);
      if (!isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    } else {
      const match = asset.id.match(/CV-\d+-(\d+)/);
      if (match) {
        const numPart = parseInt(match[1], 10);
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
        }
      }
    }
  }
  
  const nextNum = maxNum + 1;
  return `${prefix}${String(nextNum).padStart(3, '0')}`;
}

export function generateNextInspectionId(inspections: InspectionRecord[]): string {
  const currentYear = new Date().getFullYear();
  const prefix = `INSP-${currentYear}-`;
  
  let maxNum = 0;
  for (const insp of inspections) {
    if (insp.id.startsWith(prefix)) {
      const numPart = parseInt(insp.id.replace(prefix, ''), 10);
      if (!isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    } else {
      const match = insp.id.match(/INSP-\d+-(\d+)/);
      if (match) {
        const numPart = parseInt(match[1], 10);
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
        }
      }
    }
  }
  
  const nextNum = maxNum + 1;
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

export function generateNextMaintenanceUpdateId(updates: MaintenanceProgressUpdate[]): string {
  const currentYear = new Date().getFullYear();
  const prefix = `MAINT-${currentYear}-`;
  
  let maxNum = 0;
  for (const u of updates) {
    if (u.id.startsWith(prefix)) {
      const numPart = parseInt(u.id.replace(prefix, ''), 10);
      if (!isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    } else {
      const match = u.id.match(/MAINT-\d+-(\d+)/);
      if (match) {
        const numPart = parseInt(match[1], 10);
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
        }
      }
    }
  }
  
  const nextNum = maxNum + 1;
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

// Initial storage hydration
function getInitialAssets(): ConveyorAsset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ASSETS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Could not read cached assets, using defaults');
  }
  return INITIAL_ASSETS;
}

function getInitialInspections(): InspectionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_INSPECTIONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Could not read cached inspections, using defaults');
  }
  return INITIAL_INSPECTIONS;
}

function getInitialMaintenanceUpdates(): MaintenanceProgressUpdate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MAINTENANCE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Could not read cached maintenance updates, using defaults');
  }
  return INITIAL_MAINTENANCE_UPDATES;
}

function getInitialComponentReports(): ComponentInspectionReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_COMPONENT_REPORTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Could not read cached component reports, using defaults');
  }
  return INITIAL_COMPONENT_REPORTS;
}

function getInitialPhotoAuditEvents(): PhotoAuditEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PHOTO_AUDIT);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Could not read cached photo audit events, using defaults');
  }
  return [];
}

export function useConveyorStore() {
  const [assets, setAssets] = useState<ConveyorAsset[]>(getInitialAssets);
  const [inspections, setInspections] = useState<InspectionRecord[]>(getInitialInspections);
  const [draftInspections, setDraftInspections] = useState<InspectionRecord[]>([]);
  const [maintenanceUpdates, setMaintenanceUpdates] = useState<MaintenanceProgressUpdate[]>(getInitialMaintenanceUpdates);
  const [componentReports, setComponentReports] = useState<ComponentInspectionReport[]>(getInitialComponentReports);
  const [photoAuditEvents, setPhotoAuditEvents] = useState<PhotoAuditEvent[]>(getInitialPhotoAuditEvents);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'assets' | 'inspections' | 'new-inspection'>('dashboard');
  const [selectedAssetForInspection, setSelectedAssetForInspection] = useState<ConveyorAsset | null>(null);
  const [activeDraftSession, setActiveDraftSession] = useState<InspectionRecord | null>(null);
  const [selectedInspectionForDetail, setSelectedInspectionForDetail] = useState<InspectionRecord | null>(null);
  const [selectedComponentReportForDetail, setSelectedComponentReportForDetail] = useState<ComponentInspectionReport | null>(null);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline' | 'error'>('synced');
  const [isFirebaseConnected, setIsFirebaseConnected] = useState<boolean>(false);

  // Sync state to local storage on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ASSETS, JSON.stringify(assets));
    } catch (e) {
      console.warn('Failed to cache assets locally');
    }
  }, [assets]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_INSPECTIONS, JSON.stringify(inspections));
    } catch (e) {
      console.warn('Failed to cache inspections locally');
    }
  }, [inspections]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MAINTENANCE, JSON.stringify(maintenanceUpdates));
    } catch (e) {
      console.warn('Failed to cache maintenance updates locally');
    }
  }, [maintenanceUpdates]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_COMPONENT_REPORTS, JSON.stringify(componentReports));
    } catch (e) {
      console.warn('Failed to cache component reports locally');
    }
  }, [componentReports]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PHOTO_AUDIT, JSON.stringify(photoAuditEvents));
    } catch (e) {
      console.warn('Failed to cache photo audit events locally');
    }
  }, [photoAuditEvents]);

  // Idempotent legacy photo migration on startup
  useEffect(() => {
    const result = migrateLegacyPhotos({
      inspections,
      componentReports,
      existingAuditEvents: photoAuditEvents,
      now: new Date().toISOString(),
    });
    if (result.migratedCount > 0 || result.newAuditEvents.length > 0) {
      setInspections(result.inspections);
      setComponentReports(result.componentReports);
      if (result.newAuditEvents.length > 0) {
        setPhotoAuditEvents((prev) => {
          const existingIds = new Set(prev.map((e) => e.id));
          const uniqueNew = result.newAuditEvents.filter((e) => !existingIds.has(e.id));
          return [...uniqueNew, ...prev];
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auth observer + initial Firestore connection probe
  useEffect(() => {
    testFirestoreConnection().then((ok) => {
      if (ok) setIsFirebaseConnected(true);
    });
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Live Listeners
  useEffect(() => {
    let unsubAssets = () => {};
    let unsubInspections = () => {};
    let unsubMaintenance = () => {};
    let unsubComponentReports = () => {};
    let unsubPhotoAudit = () => {};

    try {
      setSyncStatus('syncing');
      
      const assetsColl = collection(db, 'assets');
      unsubAssets = onSnapshot(
        assetsColl,
        (snapshot) => {
          if (!snapshot.empty) {
            const remoteAssets: ConveyorAsset[] = [];
            snapshot.forEach((docSnap) => {
              remoteAssets.push(docSnap.data() as ConveyorAsset);
            });
            setAssets(remoteAssets);
            setIsFirebaseConnected(true);
            setSyncStatus('synced');
          } else {
            setIsFirebaseConnected(true);
            setSyncStatus('synced');
          }
        },
        (error) => {
          console.warn('Firestore assets listener error:', error.message);
          setSyncStatus('offline');
        }
      );

      const inspColl = collection(db, 'inspections');
      unsubInspections = onSnapshot(
        inspColl,
        (snapshot) => {
          if (!snapshot.empty) {
            const remoteInspections: InspectionRecord[] = [];
            snapshot.forEach((docSnap) => {
              remoteInspections.push(docSnap.data() as InspectionRecord);
            });
            remoteInspections.sort((a, b) => new Date(b.inspectionDate).getTime() - new Date(a.inspectionDate).getTime());
            setInspections(remoteInspections);
            setSyncStatus('synced');
          }
        },
        (error) => {
          console.warn('Firestore inspections listener error:', error.message);
          setSyncStatus('offline');
        }
      );

      const maintColl = collection(db, 'maintenance_updates');
      unsubMaintenance = onSnapshot(
        maintColl,
        (snapshot) => {
          if (!snapshot.empty) {
            const remoteMaint: MaintenanceProgressUpdate[] = [];
            snapshot.forEach((docSnap) => {
              remoteMaint.push(docSnap.data() as MaintenanceProgressUpdate);
            });
            remoteMaint.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setMaintenanceUpdates(remoteMaint);
            setSyncStatus('synced');
          }
        },
        (error) => {
          console.warn('Firestore maintenance_updates listener error:', error.message);
        }
      );

      const compRepColl = collection(db, 'component_reports');
      unsubComponentReports = onSnapshot(
        compRepColl,
        (snapshot) => {
          if (!snapshot.empty) {
            const remoteReports: ComponentInspectionReport[] = [];
            snapshot.forEach((docSnap) => {
              remoteReports.push(docSnap.data() as ComponentInspectionReport);
            });
            remoteReports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setComponentReports(remoteReports);
            setSyncStatus('synced');
          }
        },
        (error) => {
          console.warn('Firestore component_reports listener error:', error.message);
        }
      );

      const photoAuditColl = collection(db, 'photo_audit_events');
      unsubPhotoAudit = onSnapshot(
        photoAuditColl,
        (snapshot) => {
          if (!snapshot.empty) {
            const remoteEvents: PhotoAuditEvent[] = [];
            snapshot.forEach((docSnap) => {
              remoteEvents.push(docSnap.data() as PhotoAuditEvent);
            });
            remoteEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setPhotoAuditEvents(remoteEvents);
          }
        },
        (error) => {
          console.warn('Firestore photo_audit_events listener error:', error.message);
        }
      );
    } catch (err) {
      console.warn('Error setting up Firestore listeners:', err);
      setSyncStatus('offline');
    }

    return () => {
      unsubAssets();
      unsubInspections();
      unsubMaintenance();
      unsubComponentReports();
      unsubPhotoAudit();
    };
  }, []);

  // Firestore Live Listener for authenticated user's progressive drafts
  useEffect(() => {
    if (!currentUser?.uid) {
      setDraftInspections([]);
      return;
    }

    const draftsQuery = query(
      collection(db, 'inspection_drafts'),
      where('inspectorId', '==', currentUser.uid)
    );

    const unsubDrafts = onSnapshot(
      draftsQuery,
      (snapshot) => {
        const remoteDrafts: InspectionRecord[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as InspectionRecord;
          if (isDraftInspectionSession(data)) {
            remoteDrafts.push(data);
          }
        });
        remoteDrafts.sort(
          (a, b) =>
            new Date(b.lastSavedAt || b.createdAt).getTime() -
            new Date(a.lastSavedAt || a.createdAt).getTime()
        );
        setDraftInspections(remoteDrafts);
        setActiveDraftSession((prev) =>
          prev ? remoteDrafts.find((d) => d.id === prev.id) || prev : null
        );
      },
      (error) => {
        console.warn('Firestore inspection_drafts listener error:', error.message);
      }
    );

    return () => unsubDrafts();
  }, [currentUser?.uid]);

  // Append a Photo Audit Event locally and sync best-effort to Firestore
  const recordPhotoAuditEvent = useCallback(async (event: PhotoAuditEvent) => {
    setPhotoAuditEvents((prev) => {
      if (prev.some((e) => e.id === event.id)) return prev;
      return [event, ...prev];
    });

    try {
      await setDoc(doc(db, 'photo_audit_events', event.id), event);
    } catch (err) {
      console.warn('Could not sync photo audit event to Firestore:', err);
    }
  }, []);

  // Only finalized inspections feed finalized metrics, audits, and asset health KPIs
  const finalizedInspections = inspections.filter(isSessionFinalized);

  // Compute Dashboard Metrics
  const activeMaintenanceCount = maintenanceUpdates.filter(
    (u) => u.progressStatus === 'in_progress' || u.progressStatus === 'diagnosing' || u.progressStatus === 'parts_pending'
  ).length;

  const pendingVerificationCount = maintenanceUpdates.filter(
    (u) => u.progressStatus === 'completed_pending_verification' && !u.verification?.isVerified
  ).length;

  const verifiedRepairsCount = maintenanceUpdates.filter(
    (u) => u.progressStatus === 'verified_closed' || u.verification?.isVerified
  ).length;

  const metrics: DashboardMetrics = {
    totalAssets: assets.length,
    activeAssets: assets.filter((a) => a.status === 'active').length,
    totalInspections: finalizedInspections.length,
    damagedComponents: assets.filter((a) => a.currentCondition === 'damaged').length,
    wornComponents: assets.filter((a) => a.currentCondition === 'worn').length,
    goodComponents: assets.filter((a) => a.currentCondition === 'good').length,
    activeMaintenanceCount,
    pendingVerificationCount,
    verifiedRepairsCount,
  };

  // Add Conveyor Asset
  const createAsset = useCallback(
    async (assetData: Omit<ConveyorAsset, 'id' | 'createdAt' | 'updatedAt' | 'lastInspectedAt' | 'currentCondition'>) => {
      const newId = generateNextAssetId(assets);
      const now = new Date().toISOString();
      const newAsset: ConveyorAsset = {
        ...assetData,
        id: newId,
        lastInspectedAt: '',
        currentCondition: 'good',
        maintenanceStatus: 'none',
        createdAt: now,
        updatedAt: now,
      };

      setAssets((prev) => [newAsset, ...prev]);

      try {
        setSyncStatus('syncing');
        await setDoc(doc(db, 'assets', newId), newAsset);
        setSyncStatus('synced');
      } catch (err) {
        console.warn('Could not sync asset to Firestore:', err);
        setSyncStatus('offline');
      }

      return newAsset;
    },
    [assets]
  );

  // Update Conveyor Asset
  const updateAsset = useCallback(
    async (id: string, updates: Partial<ConveyorAsset>) => {
      const now = new Date().toISOString();
      setAssets((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...updates, updatedAt: now } : a))
      );

      try {
        setSyncStatus('syncing');
        await updateDoc(doc(db, 'assets', id), {
          ...updates,
          updatedAt: now,
        });
        setSyncStatus('synced');
      } catch (err) {
        console.warn('Could not sync asset update to Firestore:', err);
        setSyncStatus('offline');
      }
    },
    []
  );

  // Toggle Asset Status
  const toggleAssetStatus = useCallback(
    async (id: string) => {
      const target = assets.find((a) => a.id === id);
      if (!target) return;
      const nextStatus = target.status === 'active' ? 'deactivated' : 'active';
      await updateAsset(id, { status: nextStatus });
    },
    [assets, updateAsset]
  );

  // Create a Progressive Inspection Draft Session persisted in Firestore
  const createDraftInspectionSession = useCallback(
    async (params: {
      asset: ConveyorAsset;
      inspectorName?: string;
      sessionId?: string;
      priority?: PriorityLevel;
    }): Promise<InspectionRecord> => {
      const uid = currentUser?.uid || auth.currentUser?.uid;
      if (!uid) {
        throw new Error('Sign in with Google to create and persist an inspection draft session in Firestore.');
      }

      const newId =
        params.sessionId ||
        generateNextInspectionId([...inspections, ...draftInspections]);
      const now = new Date().toISOString();
      const draft = createDraftSessionData({
        sessionId: newId,
        asset: params.asset,
        inspectorName:
          params.inspectorName?.trim() ||
          currentUser?.displayName ||
          currentUser?.email?.split('@')[0] ||
          'Field Inspector',
        inspectorId: uid,
        workspaceId: DEFAULT_WORKSPACE_ID,
        componentNames: DEFAULT_INSPECTION_COMPONENTS,
        priority: params.priority || 'low',
        now,
      });

      setSyncStatus('syncing');
      try {
        await saveDraftSessionToFirestore(db, draft);
        setDraftInspections((prev) => [draft, ...prev.filter((d) => d.id !== draft.id)]);
        setActiveDraftSession(draft);
        setSyncStatus('synced');
        return draft;
      } catch (err: any) {
        setSyncStatus('error');
        throw new Error(
          err?.message || 'Failed to persist inspection draft to Firestore.'
        );
      }
    },
    [currentUser, inspections, draftInspections]
  );

  // Independently Save One Component to Firestore Draft Transaction (non-clobbering, preserves other components & photos)
  const saveComponentDraft = useCallback(
    async (params: {
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
    }): Promise<{
      updatedSession: InspectionRecord;
      updatedComponentDraft: ComponentDraftRecord;
    }> => {
      const uid = currentUser?.uid || auth.currentUser?.uid;
      if (!uid) {
        throw new Error('Sign in with Google required to persist component saves to Firestore.');
      }

      const actorName =
        params.inspectorName?.trim() ||
        currentUser?.displayName ||
        currentUser?.email?.split('@')[0] ||
        params.session.inspectorName ||
        'Field Inspector';

      setSyncStatus('syncing');
      try {
        const result = await saveComponentDraftTransaction({
          firestore: db,
          sessionFallback: params.session,
          componentName: params.componentName,
          componentStatus: params.componentStatus,
          condition: params.condition,
          observations: params.observations,
          findings: params.findings,
          recommendations: params.recommendations,
          notApplicableReason: params.notApplicableReason,
          componentPhotos: params.componentPhotos,
          actorName,
          actorId: uid,
          expectedSessionVersion: params.session.version,
        });

        setDraftInspections((prev) => {
          const exists = prev.some((d) => d.id === result.updatedSession.id);
          return exists
            ? prev.map((d) => (d.id === result.updatedSession.id ? result.updatedSession : d))
            : [result.updatedSession, ...prev];
        });
        setActiveDraftSession(result.updatedSession);
        setSyncStatus('synced');
        return result;
      } catch (err: any) {
        setSyncStatus('error');
        throw new Error(
          err?.message || `Failed to save component "${params.componentName}" to Firestore.`
        );
      }
    },
    [currentUser]
  );

  // Finalize an Inspection Draft Session Idempotently -> Immutable Inspections + Component Reports + Asset Reconciliation
  const finalizeInspectionSession = useCallback(
    async (params: {
      session: InspectionRecord;
      overallOverrides?: {
        findings?: string;
        recommendations?: string;
        overallCondition?: ConveyorCondition;
        priority?: PriorityLevel;
        extraSessionPhotos?: InspectionPhoto[];
        inspectorName?: string;
      };
    }): Promise<InspectionRecord> => {
      const uid = currentUser?.uid || auth.currentUser?.uid;
      if (!uid) {
        throw new Error('Sign in with Google required to finalize and certify inspection sessions in Firestore.');
      }

      const actorName =
        params.overallOverrides?.inspectorName?.trim() ||
        currentUser?.displayName ||
        currentUser?.email?.split('@')[0] ||
        params.session.inspectorName ||
        'Field Inspector';

      setSyncStatus('syncing');
      try {
        const res = await finalizeInspectionSessionTransaction({
          firestore: db,
          sessionFallback: params.session,
          allInspections: inspections,
          existingReports: componentReports,
          actorName,
          actorId: uid,
          overallOverrides: params.overallOverrides,
        });

        setDraftInspections((prev) => prev.filter((d) => d.id !== res.finalizedSession.id));
        setActiveDraftSession(null);

        setInspections((prev) => {
          const filtered = prev.filter((i) => i.id !== res.finalizedSession.id);
          return [res.finalizedSession, ...filtered];
        });

        if (!res.wasIdempotentSkip && res.generatedReports.length > 0) {
          setComponentReports((prev) => {
            const existingIds = new Set(prev.map((r) => r.id));
            return [
              ...res.generatedReports.filter((r) => !existingIds.has(r.id)),
              ...prev,
            ];
          });
        }

        if (res.auditEvents.length > 0) {
          setPhotoAuditEvents((prev) => {
            const existingIds = new Set(prev.map((e) => e.id));
            return [...res.auditEvents.filter((e) => !existingIds.has(e.id)), ...prev];
          });
        }

        setAssets((prev) =>
          prev.map((a) =>
            a.id === res.finalizedSession.assetId
              ? {
                  ...a,
                  lastInspectedAt: res.finalizedSession.inspectionDate || res.finalizedSession.finalizedAt || a.lastInspectedAt,
                  currentCondition: res.reconciledAssetCondition,
                  maintenanceStatus:
                    res.finalizedSession.overallCondition === 'damaged' ||
                    res.finalizedSession.overallCondition === 'worn'
                      ? 'in_progress'
                      : 'none',
                  updatedAt: res.finalizedSession.finalizedAt || new Date().toISOString(),
                }
              : a
          )
        );

        setSyncStatus('synced');
        return res.finalizedSession;
      } catch (err: any) {
        setSyncStatus('error');
        throw new Error(
          err?.message || `Failed to finalize inspection session ${params.session.id}.`
        );
      }
    },
    [currentUser, inspections, componentReports]
  );

  // Cancel Draft Inspection Session
  const cancelDraftInspectionSession = useCallback(
    async (session: InspectionRecord, reason?: string): Promise<void> => {
      const uid = currentUser?.uid || auth.currentUser?.uid;
      if (!uid) {
        throw new Error('Sign in with Google required to cancel a draft session in Firestore.');
      }

      const actorName =
        currentUser?.displayName ||
        currentUser?.email?.split('@')[0] ||
        session.inspectorName ||
        'Field Inspector';

      setSyncStatus('syncing');
      try {
        await cancelDraftSessionTransaction({
          firestore: db,
          sessionFallback: session,
          actorName,
          actorId: uid,
          reason,
        });
        setDraftInspections((prev) => prev.filter((d) => d.id !== session.id));
        setActiveDraftSession((prev) => (prev?.id === session.id ? null : prev));
        setSyncStatus('synced');
      } catch (err: any) {
        setSyncStatus('error');
        throw new Error(err?.message || `Failed to cancel draft session ${session.id}.`);
      }
    },
    [currentUser]
  );

  // Create Inspection Record (Immutability guarantee: findings/overallCondition NEVER overwritten)
  // Deterministically & idempotently generates ComponentInspectionReports with ONLY component-specific INSPECTION photos
  const createInspection = useCallback(
    async (
      inspectionData: Omit<InspectionRecord, 'id' | 'createdAt'>
    ): Promise<InspectionRecord> => {
      const now = new Date().toISOString();
      const newId = generateNextInspectionId([...inspections, ...draftInspections]);
      const workspaceId = inspectionData.workspaceId || DEFAULT_WORKSPACE_ID;

      // Guard: Validate every photo association before finalizing
      const validComponentNames = Object.keys(inspectionData.components || {});
      for (const photo of inspectionData.photos || []) {
        const validation = validatePhotoAssociation(photo, {
          authenticatedUserId: inspectionData.inspectorId || currentUser?.uid || 'local-tech',
          userWorkspaceId: workspaceId,
          targetWorkspaceId: workspaceId,
          targetAssetId: inspectionData.assetId,
          sessionAssetId: inspectionData.assetId,
          validComponentNames,
          targetReportFinalized: false,
        });
        if (!validation.valid) {
          throw new Error(validation.reason || 'Invalid photo association detected.');
        }
      }

      const {
        reports: generatedReports,
        normalizedSessionPhotos,
        generalPhotos,
        auditEvents,
        wasIdempotentSkip,
      } = buildComponentReportsFromSession({
        sessionId: newId,
        inspectionData,
        existingReports: componentReports,
        now,
        workspaceId,
      });

      const resolvedInspectorId = inspectionData.inspectorId || currentUser?.uid || 'local-tech';
      const record: InspectionRecord = {
        ...inspectionData,
        id: newId,
        inspectorId: resolvedInspectorId,
        status: 'FINALIZED',
        finalizedAt: now,
        finalizedBy: inspectionData.inspectorName,
        finalizedById: resolvedInspectorId,
        workspaceId,
        photos: normalizedSessionPhotos,
        generalPhotos,
        componentReportCount: generatedReports.length,
        currentCondition: inspectionData.overallCondition,
        componentCurrentConditions: { ...(inspectionData.components || {}) },
        maintenanceStatus: inspectionData.overallCondition === 'damaged' || inspectionData.overallCondition === 'worn' ? 'diagnosing' : undefined,
        createdAt: now,
      };

      const nextInspections = [record, ...inspections];
      setInspections(nextInspections);
      if (!wasIdempotentSkip && generatedReports.length > 0) {
        setComponentReports((prev) => [...generatedReports, ...prev]);
      }
      if (auditEvents.length > 0) {
        setPhotoAuditEvents((prev) => {
          const existingIds = new Set(prev.map((e) => e.id));
          return [...auditEvents.filter((e) => !existingIds.has(e.id)), ...prev];
        });
      }

      // Reconcile parent asset condition
      const reconciledAssetCondition = reconcileAssetCondition(record.assetId, nextInspections);

      // Automatically update the parent asset's condition & last inspected timestamp
      setAssets((prev) =>
        prev.map((a) =>
          a.id === record.assetId
            ? {
                ...a,
                lastInspectedAt: record.inspectionDate || now,
                currentCondition: reconciledAssetCondition,
                maintenanceStatus: record.overallCondition === 'damaged' || record.overallCondition === 'worn' ? 'in_progress' : 'none',
                updatedAt: now,
              }
            : a
        )
      );

      // Prepare sanitized Firestore payload (never stores raw Base64 raster strings in Firestore)
      const firestoreRecord: InspectionRecord = {
        ...record,
        photos: normalizedSessionPhotos.map(sanitizePhotoForFirestore),
        generalPhotos: generalPhotos.map(sanitizePhotoForFirestore),
      };

      try {
        setSyncStatus('syncing');
        const batch = writeBatch(db);
        batch.set(doc(db, 'inspections', newId), firestoreRecord);
        generatedReports.forEach((rep) => {
          batch.set(doc(db, 'component_reports', rep.id), {
            ...rep,
            photos: rep.photos.map(sanitizePhotoForFirestore),
          });
        });
        normalizedSessionPhotos.forEach((photo) => {
          const sanitized = sanitizePhotoForFirestore(photo);
          batch.set(doc(db, 'photo_evidence', sanitized.id), sanitized);
        });
        auditEvents.forEach((evt) => {
          batch.set(doc(db, 'photo_audit_events', evt.id), evt);
        });
        batch.update(doc(db, 'assets', record.assetId), {
          lastInspectedAt: record.inspectionDate || now,
          currentCondition: reconciledAssetCondition,
          maintenanceStatus: record.overallCondition === 'damaged' || record.overallCondition === 'worn' ? 'in_progress' : 'none',
          updatedAt: now,
        });
        await batch.commit();
        setSyncStatus('synced');
      } catch (err) {
        console.warn('Could not sync inspection batch to Firestore:', err);
        setSyncStatus('offline');
      }

      return record;
    },
    [inspections, draftInspections, componentReports, currentUser]
  );

  // Manual Classification for Unassigned / Legacy Photos
  const classifyLegacyPhoto = useCallback(
    async (
      photoId: string,
      sessionId: string,
      target: { type: 'component'; componentName: string } | { type: 'general' },
      actorName?: string
    ): Promise<void> => {
      const now = new Date().toISOString();
      const session = inspections.find((i) => i.id === sessionId);
      if (!session) {
        throw new Error(`Inspection session ${sessionId} not found.`);
      }

      const targetPhoto = (session.photos || []).find((p) => p.id === photoId);
      if (!targetPhoto) {
        throw new Error(`Photo ${photoId} not found in session ${sessionId}.`);
      }

      // Only unassigned legacy photos or non-finalized photos can be manually reclassified here
      if (targetPhoto.classificationStatus === 'assigned' && targetPhoto.isFinalized) {
        throw new Error('Finalized component-assigned evidence cannot be overwritten or deleted.');
      }

      const workspaceId = session.workspaceId || targetPhoto.workspaceId || DEFAULT_WORKSPACE_ID;
      const actorId = currentUser?.uid || session.inspectorId || 'supervisor';
      const resolvedActor = actorName || currentUser?.displayName || 'Lead Supervisor';

      const validComponentNames = Object.keys(session.components || {});
      const targetReport =
        target.type === 'component'
          ? componentReports.find((r) => r.sessionId === sessionId && r.componentName === target.componentName)
          : undefined;

      if (target.type === 'component' && !validComponentNames.includes(target.componentName)) {
        throw new Error(`Component "${target.componentName}" does not belong to session ${sessionId}.`);
      }

      const validation = validatePhotoAssociation(
        {
          ...targetPhoto,
          uploadedById: targetPhoto.uploadedById || actorId,
          classificationStatus: target.type === 'component' ? 'assigned' : 'general_session_evidence',
          componentName: target.type === 'component' ? target.componentName : undefined,
        },
        {
          authenticatedUserId: targetPhoto.uploadedById || actorId,
          userWorkspaceId: workspaceId,
          targetWorkspaceId: workspaceId,
          targetAssetId: session.assetId,
          sessionAssetId: session.assetId,
          validComponentNames,
          targetReportFinalized: false,
        }
      );

      if (!validation.valid) {
        throw new Error(validation.reason || 'Photo classification rejected.');
      }

      const previousStatus = targetPhoto.classificationStatus || 'unassigned';
      const updatedPhoto: InspectionPhoto = {
        ...targetPhoto,
        photoId: targetPhoto.photoId || targetPhoto.id,
        workspaceId,
        inspectionSessionId: sessionId,
        assetId: session.assetId,
        componentReportId: targetReport?.id,
        componentName: target.type === 'component' ? target.componentName : undefined,
        componentId: target.type === 'component' ? toComponentSlug(target.componentName) : undefined,
        photoCategory: target.type === 'component' ? 'INSPECTION' : 'GENERAL_SESSION_EVIDENCE',
        classificationStatus: target.type === 'component' ? 'assigned' : 'general_session_evidence',
        classifiedBy: resolvedActor,
        classifiedAt: now,
        isFinalized: true,
        uploadStatus: targetPhoto.uploadStatus === 'failed' ? 'failed' : 'finalized',
      };

      const auditEvent: PhotoAuditEvent = {
        id: `AUD-CLS-${Date.now()}-${photoId}`,
        photoId,
        eventType: target.type === 'component' ? 'PHOTO_CLASSIFICATION_CORRECTED' : 'PHOTO_MARKED_GENERAL',
        actorName: resolvedActor,
        actorId,
        workspaceId,
        inspectionSessionId: sessionId,
        componentReportId: targetReport?.id,
        componentName: target.type === 'component' ? target.componentName : undefined,
        assetId: session.assetId,
        previousClassification: previousStatus.toUpperCase(),
        newClassification: target.type === 'component' ? target.componentName : 'GENERAL_SESSION_EVIDENCE',
        details:
          target.type === 'component'
            ? `Unassigned photo ${targetPhoto.originalFilename || photoId} manually classified to ${target.componentName} (${targetReport?.id || sessionId}).`
            : `Unassigned photo ${targetPhoto.originalFilename || photoId} marked as General Session Evidence for ${sessionId}.`,
        timestamp: now,
      };

      const nextPhotos = (session.photos || []).map((p) => (p.id === photoId ? updatedPhoto : p));
      const nextGeneralPhotos = nextPhotos.filter((p) => p.classificationStatus === 'general_session_evidence');

      setInspections((prev) =>
        prev.map((insp) =>
          insp.id === sessionId
            ? { ...insp, photos: nextPhotos, generalPhotos: nextGeneralPhotos }
            : insp
        )
      );

      setSelectedInspectionForDetail((prev) =>
        prev && prev.id === sessionId
          ? { ...prev, photos: nextPhotos, generalPhotos: nextGeneralPhotos }
          : prev
      );

      if (target.type === 'component' && targetReport) {
        const nextReportPhotos = [
          ...(targetReport.photos || []).filter((p) => p.id !== photoId),
          updatedPhoto,
        ];
        const nextPhotoIds = nextReportPhotos.map((p) => p.id);

        setComponentReports((prev) =>
          prev.map((rep) =>
            rep.id === targetReport.id
              ? { ...rep, photos: nextReportPhotos, photoIds: nextPhotoIds, updatedAt: now }
              : rep
          )
        );
        setSelectedComponentReportForDetail((prev) =>
          prev && prev.id === targetReport.id
            ? { ...prev, photos: nextReportPhotos, photoIds: nextPhotoIds, updatedAt: now }
            : prev
        );
      }

      setPhotoAuditEvents((prev) => [auditEvent, ...prev]);

      // Best-effort Firestore sync
      try {
        setSyncStatus('syncing');
        const batch = writeBatch(db);
        batch.update(doc(db, 'inspections', sessionId), {
          photos: nextPhotos.map(sanitizePhotoForFirestore),
          generalPhotos: nextGeneralPhotos.map(sanitizePhotoForFirestore),
        });
        if (target.type === 'component' && targetReport) {
          const updatedRepPhotos = [
            ...(targetReport.photos || []).filter((p) => p.id !== photoId),
            updatedPhoto,
          ].map(sanitizePhotoForFirestore);
          batch.update(doc(db, 'component_reports', targetReport.id), {
            photos: updatedRepPhotos,
            photoIds: updatedRepPhotos.map((p) => p.id),
            updatedAt: now,
          });
        }
        batch.set(doc(db, 'photo_evidence', updatedPhoto.id), sanitizePhotoForFirestore(updatedPhoto));
        batch.set(doc(db, 'photo_audit_events', auditEvent.id), auditEvent);
        await batch.commit();
        setSyncStatus('synced');
      } catch (err) {
        console.warn('Could not sync photo classification to Firestore:', err);
        setSyncStatus('offline');
      }
    },
    [inspections, componentReports, currentUser]
  );

  // Add Corrective Maintenance Progress Update
  const addMaintenanceUpdate = useCallback(
    async (
      updateData: Omit<MaintenanceProgressUpdate, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<MaintenanceProgressUpdate> => {
      const parentInspection = inspections.find((i) => i.id === updateData.inspectionId);
      if (!parentInspection || !isSessionFinalized(parentInspection)) {
        throw new Error('Maintenance work orders cannot be created or updated for unfinished draft inspections.');
      }

      const newId = generateNextMaintenanceUpdateId(maintenanceUpdates);
      const now = new Date().toISOString();
      const workspaceId = DEFAULT_WORKSPACE_ID;

      // Enrich maintenance evidence photos with component & category metadata
      const enrichedPhotos: InspectionPhoto[] = (updateData.evidencePhotos || []).map((photo) => ({
        ...photo,
        photoId: photo.photoId || photo.id,
        workspaceId: photo.workspaceId || workspaceId,
        inspectionSessionId: updateData.inspectionId,
        componentReportId: updateData.componentReportId,
        maintenanceUpdateId: newId,
        assetId: updateData.assetId,
        componentName: updateData.componentName,
        componentId: toComponentSlug(updateData.componentName),
        photoCategory: photo.photoCategory || 'MAINTENANCE_DURING',
        classificationStatus: 'assigned',
        uploadedBy: photo.uploadedBy || updateData.technicianName,
        uploadedById: photo.uploadedById || updateData.technicianId,
        uploadStatus: photo.uploadStatus === 'failed' ? 'failed' : 'finalized',
        isFinalized: true,
        createdAt: photo.createdAt || photo.timestamp || now,
      }));

      const newUpdate: MaintenanceProgressUpdate = {
        ...updateData,
        evidencePhotos: enrichedPhotos,
        id: newId,
        createdAt: now,
        updatedAt: now,
      };

      const maintAuditEvents: PhotoAuditEvent[] = enrichedPhotos.map((p) => ({
        id: `AUD-MNT-${newId}-${p.id}`,
        photoId: p.id,
        eventType: 'PHOTO_ATTACHED_MAINTENANCE',
        actorName: updateData.technicianName,
        actorId: updateData.technicianId,
        workspaceId,
        inspectionSessionId: updateData.inspectionId,
        componentReportId: updateData.componentReportId,
        componentName: updateData.componentName,
        assetId: updateData.assetId,
        newClassification: p.photoCategory || 'MAINTENANCE_DURING',
        details: `Attached maintenance photo (${p.photoCategory}) to ${updateData.componentName} on update ${newId}.`,
        timestamp: now,
      }));

      // 1. Prepend update to chronological list
      setMaintenanceUpdates((prev) => [newUpdate, ...prev]);
      if (maintAuditEvents.length > 0) {
        setPhotoAuditEvents((prev) => [...maintAuditEvents, ...prev]);
      }

      // 2. Update the parent inspection pointers WITHOUT mutating original findings/overallCondition
      setInspections((prev) =>
        prev.map((insp) =>
          insp.id === newUpdate.inspectionId
            ? {
                ...insp,
                maintenanceStatus: newUpdate.progressStatus,
                latestReportedCondition: newUpdate.currentCondition,
              }
            : insp
        )
      );

      // 3. Update the targeted child ComponentInspectionReport
      setComponentReports((prev) =>
        prev.map((rep) =>
          (newUpdate.componentReportId && rep.id === newUpdate.componentReportId) ||
          (rep.sessionId === newUpdate.inspectionId && rep.componentName === newUpdate.componentName)
            ? {
                ...rep,
                maintenanceStatus: newUpdate.progressStatus,
                latestReportedCondition: newUpdate.currentCondition,
                updatedAt: now,
              }
            : rep
        )
      );

      // 4. Update the asset's maintenance timestamps and intermediate condition
      setAssets((prev) =>
        prev.map((asset) =>
          asset.id === newUpdate.assetId
            ? {
                ...asset,
                lastMaintenanceUpdateAt: now,
                maintenanceStatus:
                  newUpdate.progressStatus === 'completed_pending_verification'
                    ? 'pending_verification'
                    : newUpdate.progressStatus === 'verified_closed'
                    ? 'verified_closed'
                    : 'in_progress',
                updatedAt: now,
              }
            : asset
        )
      );

      // 5. Update modals if open
      setSelectedInspectionForDetail((prev) =>
        prev && prev.id === newUpdate.inspectionId
          ? {
              ...prev,
              maintenanceStatus: newUpdate.progressStatus,
              latestReportedCondition: newUpdate.currentCondition,
            }
          : prev
      );

      setSelectedComponentReportForDetail((prev) =>
        prev &&
        ((newUpdate.componentReportId && prev.id === newUpdate.componentReportId) ||
          (prev.sessionId === newUpdate.inspectionId && prev.componentName === newUpdate.componentName))
          ? {
              ...prev,
              maintenanceStatus: newUpdate.progressStatus,
              latestReportedCondition: newUpdate.currentCondition,
              updatedAt: now,
            }
          : prev
      );

      // 6. Cloud Firestore sync
      try {
        setSyncStatus('syncing');
        const batch = writeBatch(db);
        batch.set(doc(db, 'maintenance_updates', newId), {
          ...newUpdate,
          evidencePhotos: enrichedPhotos.map(sanitizePhotoForFirestore),
        });
        enrichedPhotos.forEach((p) => {
          batch.set(doc(db, 'photo_evidence', p.id), sanitizePhotoForFirestore(p));
        });
        maintAuditEvents.forEach((evt) => {
          batch.set(doc(db, 'photo_audit_events', evt.id), evt);
        });
        batch.update(doc(db, 'inspections', newUpdate.inspectionId), {
          maintenanceStatus: newUpdate.progressStatus,
          latestReportedCondition: newUpdate.currentCondition,
        });
        if (newUpdate.componentReportId) {
          batch.update(doc(db, 'component_reports', newUpdate.componentReportId), {
            maintenanceStatus: newUpdate.progressStatus,
            latestReportedCondition: newUpdate.currentCondition,
            updatedAt: now,
          });
        }
        batch.update(doc(db, 'assets', newUpdate.assetId), {
          lastMaintenanceUpdateAt: now,
          maintenanceStatus:
            newUpdate.progressStatus === 'completed_pending_verification'
              ? 'pending_verification'
              : newUpdate.progressStatus === 'verified_closed'
              ? 'verified_closed'
              : 'in_progress',
          updatedAt: now,
        });
        await batch.commit();
        setSyncStatus('synced');
      } catch (err) {
        console.warn('Could not sync maintenance update to Firestore:', err);
        setSyncStatus('offline');
      }

      return newUpdate;
    },
    [maintenanceUpdates, inspections]
  );

  // Supervisor Certify & Verify Completed Repair
  const verifyMaintenanceUpdate = useCallback(
    async (
      updateId: string,
      verificationData: MaintenanceVerification
    ) => {
      const now = new Date().toISOString();
      const targetUpdate = maintenanceUpdates.find((u) => u.id === updateId);
      if (!targetUpdate) return;

      const parentInspection = inspections.find((i) => i.id === targetUpdate.inspectionId);
      const workspaceId = parentInspection?.workspaceId || DEFAULT_WORKSPACE_ID;

      const enrichedVerificationPhotos: InspectionPhoto[] = (verificationData.verificationPhotos || []).map((photo) => ({
        ...photo,
        photoId: photo.photoId || photo.id,
        workspaceId: photo.workspaceId || workspaceId,
        inspectionSessionId: targetUpdate.inspectionId,
        componentReportId: targetUpdate.componentReportId,
        maintenanceUpdateId: updateId,
        verificationId: updateId,
        assetId: targetUpdate.assetId,
        componentName: targetUpdate.componentName,
        componentId: toComponentSlug(targetUpdate.componentName),
        photoCategory: 'VERIFICATION',
        classificationStatus: 'assigned',
        uploadedBy: photo.uploadedBy || verificationData.verifiedBy,
        uploadedById: photo.uploadedById || verificationData.verifiedById,
        uploadStatus: photo.uploadStatus === 'failed' ? 'failed' : 'finalized',
        isFinalized: true,
        createdAt: photo.createdAt || photo.timestamp || now,
      }));

      const enrichedVerification: MaintenanceVerification = {
        ...verificationData,
        verificationPhotos: enrichedVerificationPhotos,
      };

      const verifAuditEvents: PhotoAuditEvent[] = enrichedVerificationPhotos.map((p) => ({
        id: `AUD-VER-${updateId}-${p.id}`,
        photoId: p.id,
        eventType: 'PHOTO_ATTACHED_VERIFICATION',
        actorName: verificationData.verifiedBy,
        actorId: verificationData.verifiedById,
        workspaceId,
        inspectionSessionId: targetUpdate.inspectionId,
        componentReportId: targetUpdate.componentReportId,
        componentName: targetUpdate.componentName,
        assetId: targetUpdate.assetId,
        newClassification: 'VERIFICATION',
        details: `Supervisor verification photo attached for ${targetUpdate.componentName} (${updateId}).`,
        timestamp: now,
      }));

      const updatedUpdate: MaintenanceProgressUpdate = {
        ...targetUpdate,
        progressStatus: 'verified_closed',
        verification: enrichedVerification,
        updatedAt: now,
      };

      // 1. Update component current conditions on inspection
      const initialComp = parentInspection?.componentCurrentConditions || parentInspection?.components || {};
      const updatedComponentConditions: Record<string, ConveyorCondition> = {
        ...initialComp,
        [targetUpdate.componentName]: verificationData.verifiedCondition,
      };

      // 2. Derive updated current operational condition for the inspection finding
      const derivedInspectionCondition = getCurrentFindingCondition({
        overallCondition: parentInspection ? parentInspection.overallCondition : 'good',
        latestVerifiedCondition: verificationData.verifiedCondition,
        componentCurrentConditions: updatedComponentConditions,
      });

      // 3. Update inspections array with certified values
      const nextInspections = inspections.map((insp) =>
        insp.id === targetUpdate.inspectionId
          ? {
              ...insp,
              maintenanceStatus: 'verified_closed' as const,
              latestVerifiedCondition: verificationData.verifiedCondition,
              currentCondition: derivedInspectionCondition,
              componentCurrentConditions: updatedComponentConditions,
              verifiedAt: verificationData.verifiedAt,
              verifiedBy: verificationData.verifiedBy,
            }
          : insp
      );

      // 4. Update child component reports
      const nextComponentReports = componentReports.map((rep) =>
        (targetUpdate.componentReportId && rep.id === targetUpdate.componentReportId) ||
        (rep.sessionId === targetUpdate.inspectionId && rep.componentName === targetUpdate.componentName)
          ? {
              ...rep,
              currentCondition: verificationData.verifiedCondition,
              latestVerifiedCondition: verificationData.verifiedCondition,
              maintenanceStatus: 'verified_closed' as const,
              verifiedBy: verificationData.verifiedBy,
              verifiedAt: verificationData.verifiedAt,
              verificationNotes: verificationData.verificationNotes,
              updatedAt: now,
            }
          : rep
      );
      setComponentReports(nextComponentReports);

      // 5. Reconcile parent Conveyor Asset condition across all component reports and active findings
      const reconciledAssetCondition = reconcileAssetCondition(targetUpdate.assetId, nextInspections);

      const assetPendingUpdates = maintenanceUpdates.filter(
        (u) => u.assetId === targetUpdate.assetId && u.id !== updateId && u.progressStatus !== 'verified_closed'
      );
      const assetMaintenanceStatus = assetPendingUpdates.length > 0 ? 'in_progress' : 'verified_closed';

      const nextAssets = assets.map((asset) =>
        asset.id === targetUpdate.assetId
          ? {
              ...asset,
              currentCondition: reconciledAssetCondition,
              latestVerifiedCondition: verificationData.verifiedCondition,
              maintenanceStatus: assetMaintenanceStatus as any,
              lastMaintenanceUpdateAt: now,
              updatedAt: now,
            }
          : asset
      );

      // Update local and storage state atomically
      setMaintenanceUpdates((prev) =>
        prev.map((u) => (u.id === updateId ? updatedUpdate : u))
      );
      if (verifAuditEvents.length > 0) {
        setPhotoAuditEvents((prev) => [...verifAuditEvents, ...prev]);
      }
      setInspections(nextInspections);
      setAssets(nextAssets);

      // Update currently viewed inspection modal if open
      setSelectedInspectionForDetail((prev) =>
        prev && prev.id === targetUpdate.inspectionId
          ? {
              ...prev,
              maintenanceStatus: 'verified_closed',
              latestVerifiedCondition: verificationData.verifiedCondition,
              currentCondition: derivedInspectionCondition,
              componentCurrentConditions: updatedComponentConditions,
              verifiedAt: verificationData.verifiedAt,
              verifiedBy: verificationData.verifiedBy,
            }
          : prev
      );

      // Update currently viewed component report modal if open
      setSelectedComponentReportForDetail((prev) =>
        prev &&
        ((targetUpdate.componentReportId && prev.id === targetUpdate.componentReportId) ||
          (prev.sessionId === targetUpdate.inspectionId && prev.componentName === targetUpdate.componentName))
          ? {
              ...prev,
              currentCondition: verificationData.verifiedCondition,
              latestVerifiedCondition: verificationData.verifiedCondition,
              maintenanceStatus: 'verified_closed',
              verifiedBy: verificationData.verifiedBy,
              verifiedAt: verificationData.verifiedAt,
              verificationNotes: verificationData.verificationNotes,
              updatedAt: now,
            }
          : prev
      );

      // 6. Cloud Firestore Atomic Batch Write
      try {
        setSyncStatus('syncing');
        const batch = writeBatch(db);

        const maintDocRef = doc(db, 'maintenance_updates', updateId);
        batch.update(maintDocRef, {
          progressStatus: 'verified_closed',
          verification: {
            ...enrichedVerification,
            verificationPhotos: enrichedVerificationPhotos.map(sanitizePhotoForFirestore),
          },
          updatedAt: now,
        });

        enrichedVerificationPhotos.forEach((p) => {
          batch.set(doc(db, 'photo_evidence', p.id), sanitizePhotoForFirestore(p));
        });
        verifAuditEvents.forEach((evt) => {
          batch.set(doc(db, 'photo_audit_events', evt.id), evt);
        });

        const inspDocRef = doc(db, 'inspections', targetUpdate.inspectionId);
        batch.update(inspDocRef, {
          maintenanceStatus: 'verified_closed',
          latestVerifiedCondition: verificationData.verifiedCondition,
          currentCondition: derivedInspectionCondition,
          componentCurrentConditions: updatedComponentConditions,
          verifiedAt: verificationData.verifiedAt,
          verifiedBy: verificationData.verifiedBy,
        });

        if (targetUpdate.componentReportId) {
          const compDocRef = doc(db, 'component_reports', targetUpdate.componentReportId);
          batch.update(compDocRef, {
            currentCondition: verificationData.verifiedCondition,
            latestVerifiedCondition: verificationData.verifiedCondition,
            maintenanceStatus: 'verified_closed',
            verifiedBy: verificationData.verifiedBy,
            verifiedAt: verificationData.verifiedAt,
            verificationNotes: verificationData.verificationNotes,
            updatedAt: now,
          });
        }

        const assetDocRef = doc(db, 'assets', targetUpdate.assetId);
        batch.update(assetDocRef, {
          currentCondition: reconciledAssetCondition,
          latestVerifiedCondition: verificationData.verifiedCondition,
          maintenanceStatus: assetMaintenanceStatus,
          lastMaintenanceUpdateAt: now,
          updatedAt: now,
        });

        await batch.commit();
        setSyncStatus('synced');
      } catch (err) {
        console.warn('Could not sync verification batch to Firestore:', err);
        setSyncStatus('offline');
      }
    },
    [maintenanceUpdates, inspections, assets, componentReports]
  );

  return {
    assets,
    inspections: finalizedInspections,
    draftInspections,
    activeDraftSession,
    setActiveDraftSession,
    componentReports,
    maintenanceUpdates,
    photoAuditEvents,
    metrics,
    currentUser,
    activeTab,
    setActiveTab,
    selectedAssetForInspection,
    setSelectedAssetForInspection,
    selectedInspectionForDetail,
    setSelectedInspectionForDetail,
    selectedComponentReportForDetail,
    setSelectedComponentReportForDetail,
    syncStatus,
    isFirebaseConnected,
    createAsset,
    updateAsset,
    toggleAssetStatus,
    createDraftInspectionSession,
    saveComponentDraft,
    finalizeInspectionSession,
    cancelDraftInspectionSession,
    createInspection,
    classifyLegacyPhoto,
    recordPhotoAuditEvent,
    addMaintenanceUpdate,
    verifyMaintenanceUpdate,
  };
}



