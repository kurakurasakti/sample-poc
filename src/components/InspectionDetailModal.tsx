/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  X, 
  Printer, 
  Camera, 
  Calendar, 
  User, 
  Layers, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ShieldAlert,
  ZoomIn,
  Wrench,
  ShieldCheck,
  ChevronRight,
  Package,
  FileCheck2,
  Building,
  History,
  Image as ImageIcon
} from 'lucide-react';
import { 
  InspectionRecord, 
  ConveyorCondition, 
  MaintenanceProgressUpdate,
  MaintenanceProgressStatus,
  ComponentInspectionReport,
  PhotoAuditEvent,
  InspectionPhoto,
  getCurrentFindingCondition,
  isSessionFinalized
} from '../types/conveyor';

interface InspectionDetailModalProps {
  inspection: InspectionRecord | null;
  componentReports?: ComponentInspectionReport[];
  maintenanceUpdates?: MaintenanceProgressUpdate[];
  photoAuditEvents?: PhotoAuditEvent[];
  currentUser?: any;
  onClose: () => void;
  onOpenMaintenanceModal?: (inspection: InspectionRecord) => void;
  onOpenVerifyModal?: (inspection: InspectionRecord, update: MaintenanceProgressUpdate) => void;
  onSelectComponentReport?: (report: ComponentInspectionReport) => void;
  onClassifyLegacyPhoto?: (
    photoId: string,
    sessionId: string,
    target: { type: 'component'; componentName: string } | { type: 'general' }
  ) => Promise<void>;
}

export const InspectionDetailModal: React.FC<InspectionDetailModalProps> = ({
  inspection,
  componentReports = [],
  maintenanceUpdates = [],
  photoAuditEvents = [],
  currentUser,
  onClose,
  onOpenMaintenanceModal,
  onOpenVerifyModal,
  onSelectComponentReport,
  onClassifyLegacyPhoto,
}) => {
  const [activeLightboxPhoto, setActiveLightboxPhoto] = useState<{ url: string; caption: string } | null>(null);
  const [legacyTargetByPhoto, setLegacyTargetByPhoto] = useState<Record<string, string>>({});
  const [classifyingPhotoId, setClassifyingPhotoId] = useState<string | null>(null);
  const [classificationError, setClassificationError] = useState<string | null>(null);

  if (!inspection) return null;

  // Filter updates and audit events for this inspection
  const relatedUpdates = maintenanceUpdates.filter(
    (u) => u.inspectionId === inspection.id
  );
  const sessionAuditEvents = photoAuditEvents.filter(
    (e) => e.inspectionSessionId === inspection.id
  );

  // Categorize session photos safely
  const allSessionPhotos: InspectionPhoto[] = inspection.photos || [];
  const unassignedPhotos = allSessionPhotos.filter(
    (p) => !p.classificationStatus || p.classificationStatus === 'unassigned'
  );
  const generalPhotos = allSessionPhotos.filter(
    (p) => p.classificationStatus === 'general_session_evidence' || p.photoCategory === 'GENERAL_SESSION_EVIDENCE'
  );
  const assignedPhotosByComponent: Record<string, InspectionPhoto[]> = {};
  allSessionPhotos
    .filter((p) => p.classificationStatus === 'assigned' && p.componentName)
    .forEach((p) => {
      const comp = p.componentName!;
      if (!assignedPhotosByComponent[comp]) assignedPhotosByComponent[comp] = [];
      assignedPhotosByComponent[comp].push(p);
    });

  const handleClassifyClick = async (photoId: string, mode: 'component' | 'general') => {
    if (!onClassifyLegacyPhoto) return;
    setClassificationError(null);
    const chosenComponent = legacyTargetByPhoto[photoId];
    if (mode === 'component' && !chosenComponent) {
      setClassificationError('Please select a target component before assigning this photo.');
      return;
    }
    try {
      setClassifyingPhotoId(photoId);
      await onClassifyLegacyPhoto(
        photoId,
        inspection.id,
        mode === 'component' ? { type: 'component', componentName: chosenComponent } : { type: 'general' }
      );
    } catch (err: any) {
      setClassificationError(err?.message || 'Failed to classify photo.');
    } finally {
      setClassifyingPhotoId(null);
    }
  };

  const getConditionStyle = (condition: ConveyorCondition) => {
    switch (condition) {
      case 'good':
        return {
          badge: 'text-emerald-700 bg-emerald-50 border-emerald-200',
          banner: 'bg-emerald-50 border-emerald-200 text-emerald-900',
          label: 'Good / Nominal Condition',
          icon: CheckCircle2,
        };
      case 'fair':
        return {
          badge: 'text-blue-700 bg-blue-50 border-blue-200',
          banner: 'bg-blue-50 border-blue-200 text-blue-900',
          label: 'Fair / Acceptable Condition',
          icon: CheckCircle2,
        };
      case 'worn':
        return {
          badge: 'text-amber-700 bg-amber-50 border-amber-200',
          banner: 'bg-amber-50 border-amber-200 text-amber-900',
          label: 'Worn / Requires Preventative Action',
          icon: AlertTriangle,
        };
      case 'damaged':
        return {
          badge: 'text-rose-700 bg-rose-50 border-rose-200',
          banner: 'bg-rose-50 border-rose-200 text-rose-900',
          label: 'Damaged / Critical Maintenance Alert',
          icon: ShieldAlert,
        };
    }
  };

  const getProgressStatusBadge = (status: MaintenanceProgressStatus) => {
    switch (status) {
      case 'diagnosing':
        return { text: 'text-purple-700 bg-purple-50 border-purple-200', label: 'Diagnosing' };
      case 'parts_pending':
        return { text: 'text-amber-700 bg-amber-50 border-amber-200', label: 'Parts Pending' };
      case 'in_progress':
        return { text: 'text-blue-700 bg-blue-50 border-blue-200', label: 'Repair In Progress' };
      case 'completed_pending_verification':
        return { text: 'text-orange-700 bg-orange-50 border-orange-200', label: 'Pending Verification' };
      case 'verified_closed':
        return { text: 'text-emerald-700 bg-emerald-50 border-emerald-200', label: 'Verified & Closed' };
      default:
        return { text: 'text-slate-700 bg-slate-50 border-slate-200', label: status };
    }
  };

  const currentCondition = getCurrentFindingCondition(inspection);
  const currentCondStyle = getConditionStyle(currentCondition);
  const auditCondStyle = getConditionStyle(inspection.overallCondition);
  const CurrentStatusIcon = currentCondStyle.icon;
  const isFormallyVerified = Boolean(inspection.latestVerifiedCondition);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-4xl w-full my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
              <span>INSPECTION AUDIT REPORT</span>
              <span aria-hidden="true">·</span>
              <span className="font-bold text-slate-900">{inspection.id}</span>
              <span aria-hidden="true">·</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${currentCondStyle.badge}`}>
                Current: {currentCondition}
              </span>
              {inspection.maintenanceStatus && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getProgressStatusBadge(inspection.maintenanceStatus).text}`}>
                    {getProgressStatusBadge(inspection.maintenanceStatus).label}
                  </span>
                </>
              )}
            </div>
            <h2 className="text-base sm:text-lg font-bold font-display text-slate-900 mt-0.5">
              {inspection.assetName}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded transition-colors"
              title="Print inspection record"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-5 sm:p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Status Banners - Dual Invariant Display */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* 1. CURRENT OPERATIONAL CONDITION (PROPAGATED) */}
            <div className={`p-4 rounded-lg border flex items-start gap-3 ${currentCondStyle.banner}`}>
              <CurrentStatusIcon className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">
                    CURRENT OPERATIONAL CONDITION
                  </span>
                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-white/80 border">
                    {isFormallyVerified ? 'Certified Closed' : `Priority: ${inspection.priority}`}
                  </span>
                </div>
                <div className="text-base font-bold font-display mt-0.5 flex items-center gap-2">
                  <span>{currentCondStyle.label}</span>
                  {isFormallyVerified && (
                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                      Supervisor Verified
                    </span>
                  )}
                </div>
                <p className="text-xs mt-1 opacity-90">
                  {inspection.verifiedBy ? (
                    <>Certified as <strong className="font-semibold uppercase">{inspection.latestVerifiedCondition}</strong> by supervisor <strong>{inspection.verifiedBy}</strong> on {formatDate(inspection.verifiedAt || '')}.</>
                  ) : (
                    <>Active operational status derived from initial field audit. No supervisor recertification completed yet.</>
                  )}
                </p>
              </div>
            </div>

            {/* 2. ORIGINAL AUDIT FINDING (PERMANENTLY IMMUTABLE) */}
            <div className={`p-4 rounded-lg border border-slate-200 bg-slate-50 flex items-start gap-3`}>
              <Clock className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">
                    ORIGINAL AUDIT FINDING (IMMUTABLE)
                  </span>
                  <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${auditCondStyle.badge}`}>
                    Audit: {inspection.overallCondition}
                  </span>
                </div>
                <div className="text-sm font-bold font-display text-slate-800 mt-0.5">
                  Logged as {inspection.overallCondition.toUpperCase()} on {formatDate(inspection.inspectionDate).split(',')[0]}
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Historical baseline recorded by technician <strong>{inspection.inspectorName}</strong>. This record is permanently immutable and cannot be overwritten by repairs.
                </p>
              </div>
            </div>
          </div>

          {/* Action Bar: Log Progress & Certify (Only for Finalized Sessions) */}
          {isSessionFinalized(inspection) ? (
            <div className="p-3 bg-blue-50/60 rounded-lg border border-blue-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-blue-950 font-medium">
                <Wrench className="w-4 h-4 text-blue-900 shrink-0" />
                <span>Corrective Maintenance Management: Record repairs, replacement parts, and technician hours.</span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {onOpenMaintenanceModal && (
                  <button
                    onClick={() => onOpenMaintenanceModal(inspection)}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded shadow-xs flex items-center gap-1.5 transition-colors"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Log Maintenance Progress</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900">
              This inspection session is still in <strong>{inspection.status}</strong> status. Finalize the inspection before initiating corrective maintenance work orders.
            </div>
          )}

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-xs font-mono">
            <div>
              <div className="text-slate-400">EQUIPMENT TAG</div>
              <div className="font-bold text-slate-900 mt-0.5">{inspection.assetId}</div>
            </div>
            <div>
              <div className="text-slate-400">INSPECTOR</div>
              <div className="font-bold text-slate-900 mt-0.5">{inspection.inspectorName}</div>
            </div>
            <div>
              <div className="text-slate-400">INSPECTION DATE</div>
              <div className="font-bold text-slate-900 mt-0.5">{formatDate(inspection.inspectionDate).split(',')[0]}</div>
            </div>
            <div>
              <div className="text-slate-400">PHOTO COUNT</div>
              <div className="font-bold text-slate-900 mt-0.5">{inspection.photos?.length || 0} attached</div>
            </div>
          </div>

          {/* Child Component Inspection Reports Section */}
          {inspection.components && Object.keys(inspection.components).length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold font-display uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-900" />
                  <span>Component Inspection Reports & Independent Lifecycles</span>
                </h3>
                <span className="text-[11px] font-mono text-slate-500">
                  {Object.keys(inspection.components).length} evaluated components
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {Object.entries(inspection.components).map(([compName, auditCond], index) => {
                  const childReport = componentReports.find(
                    (r) => r.sessionId === inspection.id && r.componentName === compName
                  );
                  const currentCompCond = childReport?.currentCondition ||
                    inspection.componentCurrentConditions?.[compName] ||
                    (inspection.latestVerifiedCondition && inspection.components[compName] === inspection.overallCondition
                      ? inspection.latestVerifiedCondition
                      : auditCond);

                  const auditStyle = getConditionStyle(auditCond);
                  const currStyle = getConditionStyle(currentCompCond);
                  const isUpdated = currentCompCond !== auditCond;
                  const statusBadge = childReport?.maintenanceStatus ? getProgressStatusBadge(childReport.maintenanceStatus) : null;

                  const compPhotosCount =
                    (assignedPhotosByComponent[compName]?.length || 0) ||
                    (childReport?.photos?.length || 0);

                  return (
                    <div
                      key={compName}
                      className="p-3 rounded-lg border border-slate-200 bg-white shadow-2xs space-y-2 text-xs hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          {childReport && (
                            <span className="font-mono text-[10px] text-blue-900 font-bold block">
                              {childReport.id}
                            </span>
                          )}
                          <span className="font-bold text-slate-900 text-xs">{compName}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                          <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                            <Camera className="w-2.5 h-2.5" />
                            <span>{compPhotosCount}</span>
                          </span>
                          {statusBadge && (
                            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${statusBadge.text}`}>
                              {statusBadge.label}
                            </span>
                          )}
                          {isUpdated && (
                            <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              Repaired
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-slate-400">Audit:</span>
                          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase ${auditStyle.badge}`}>
                            {auditCond}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-slate-400">Current:</span>
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${currStyle.badge}`}>
                            {currentCompCond}
                          </span>
                        </div>
                      </div>

                      {childReport && onSelectComponentReport && (
                        <button
                          onClick={() => onSelectComponentReport(childReport)}
                          className="w-full mt-1 py-1 text-[11px] font-semibold text-blue-900 bg-blue-50/70 hover:bg-blue-100/80 rounded border border-blue-200 flex items-center justify-center gap-1 transition-colors"
                        >
                          <span>Open Component Report</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Qualitative Findings */}
          <div className="space-y-3">
            <div>
              <h3 className="text-xs font-bold font-display uppercase tracking-wider text-slate-800 mb-1">
                Technician Observations & Findings
              </h3>
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-800 leading-relaxed">
                {inspection.findings}
              </div>
            </div>

            {inspection.recommendations && (
              <div>
                <h3 className="text-xs font-bold font-display uppercase tracking-wider text-slate-800 mb-1">
                  Corrective Recommendations
                </h3>
                <div className="p-3.5 bg-blue-50/60 rounded-lg border border-blue-200 text-xs text-blue-950 leading-relaxed">
                  {inspection.recommendations}
                </div>
              </div>
            )}
          </div>

          {/* Unassigned Legacy Photos Classification Banner */}
          {unassignedPhotos.length > 0 && (
            <div className="p-4 rounded-lg border border-amber-300 bg-amber-50/70 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  <span>Unassigned Legacy Photos — Manual Classification Required ({unassignedPhotos.length})</span>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                  NOT LINKED TO COMPONENT REPORTS
                </span>
              </div>

              <p className="text-xs text-amber-900/90">
                These session photos lacked explicit component metadata. Review and assign each photo to its exact component report or mark it as General Session Evidence.
              </p>

              {classificationError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
                  {classificationError}
                </div>
              )}

              <div className="space-y-2.5">
                {unassignedPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    className="p-3 bg-white rounded-md border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={photo.url}
                        alt={photo.caption}
                        onClick={() => setActiveLightboxPhoto({ url: photo.url, caption: photo.caption })}
                        className="w-16 h-12 object-cover rounded border border-slate-200 cursor-pointer shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {photo.originalFilename || photo.id}
                        </div>
                        <div className="text-[11px] text-slate-600 truncate">
                          {photo.caption}
                        </div>
                      </div>
                    </div>

                    {onClassifyLegacyPhoto && (
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <select
                          value={legacyTargetByPhoto[photo.id] || ''}
                          onChange={(e) =>
                            setLegacyTargetByPhoto((prev) => ({ ...prev, [photo.id]: e.target.value }))
                          }
                          className="px-2 py-1 text-xs border border-slate-300 rounded bg-white text-slate-800"
                        >
                          <option value="">Select Component...</option>
                          {Object.keys(inspection.components || {}).map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={classifyingPhotoId === photo.id}
                          onClick={() => void handleClassifyClick(photo.id, 'component')}
                          className="px-2.5 py-1 text-[11px] font-semibold bg-blue-900 text-white rounded hover:bg-blue-800 disabled:opacity-50"
                        >
                          Assign Component
                        </button>
                        <button
                          type="button"
                          disabled={classifyingPhotoId === photo.id}
                          onClick={() => void handleClassifyClick(photo.id, 'general')}
                          className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 text-slate-800 border border-slate-300 rounded hover:bg-slate-200 disabled:opacity-50"
                        >
                          Mark General
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Consolidated Component-Grouped Field Photo Evidence Gallery (Immutable) */}
          {allSessionPhotos.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold font-display uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-blue-900" />
                  <span>Consolidated Field Photo Evidence Grouped by Component ({allSessionPhotos.length})</span>
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">Immutable Evidence · Click to zoom</span>
              </div>

              {Object.keys(assignedPhotosByComponent).length > 0 && (
                <div className="space-y-3">
                  {Object.entries(assignedPhotosByComponent).map(([compName, compPhotos]) => {
                    const childRep = componentReports.find(
                      (r) => r.sessionId === inspection.id && r.componentName === compName
                    );
                    return (
                      <div key={compName} className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                            <ImageIcon className="w-3.5 h-3.5 text-blue-900" />
                            <span>{compName}</span>
                            {childRep && (
                              <span className="font-mono text-[10px] text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                {childRep.id}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono text-slate-500">
                            {compPhotos.length} photo{compPhotos.length !== 1 ? 's' : ''}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {compPhotos.map((photo, idx) => (
                            <div
                              key={photo.id || idx}
                              onClick={() => setActiveLightboxPhoto({ url: photo.url, caption: photo.caption })}
                              className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-100 aspect-4/3 cursor-pointer"
                            >
                              <img
                                src={photo.url}
                                alt={photo.caption || 'Inspection photo'}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                              <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <ZoomIn className="w-5 h-5 text-white" />
                              </div>
                              {photo.caption && (
                                <div className="absolute bottom-0 inset-x-0 bg-slate-900/80 px-2 py-1 text-[10px] text-white truncate font-mono">
                                  {photo.caption}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* General Session Evidence Section */}
              {generalPhotos.length > 0 && (
                <div className="p-3.5 rounded-lg border border-slate-200 bg-white space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      General Session Evidence (Not Component-Specific)
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {generalPhotos.length} photo{generalPhotos.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {generalPhotos.map((photo, idx) => (
                      <div
                        key={photo.id || idx}
                        onClick={() => setActiveLightboxPhoto({ url: photo.url, caption: photo.caption })}
                        className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-100 aspect-4/3 cursor-pointer"
                      >
                        <img
                          src={photo.url}
                          alt={photo.caption || 'General session photo'}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <ZoomIn className="w-5 h-5 text-white" />
                        </div>
                        {photo.caption && (
                          <div className="absolute bottom-0 inset-x-0 bg-slate-900/80 px-2 py-1 text-[10px] text-white truncate font-mono">
                            {photo.caption}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CHRONOLOGICAL CORRECTIVE MAINTENANCE PROGRESS & CONDITION HISTORY TIMELINE */}
          <div className="pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold font-display uppercase tracking-wider text-slate-900 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-blue-900" />
                  <span>Corrective Maintenance Progress & Audit Trail</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chronological record of repairs, replaced spare parts, technician labor, and supervisor verifications.
                </p>
              </div>

              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200">
                {relatedUpdates.length} Event{relatedUpdates.length !== 1 ? 's' : ''}
              </span>
            </div>

            {relatedUpdates.length === 0 ? (
              <div className="p-6 rounded-lg border border-dashed border-slate-300 text-center bg-slate-50">
                <Wrench className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                <h4 className="text-xs font-bold text-slate-800">No maintenance progress updates recorded yet</h4>
                <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
                  When a technician commences repairs, replaces idlers, or applies vulcanizing patches, log the progress to build the immutable compliance timeline.
                </p>
                {onOpenMaintenanceModal && (
                  <button
                    onClick={() => onOpenMaintenanceModal(inspection)}
                    className="mt-3 px-3 py-1.5 text-xs font-semibold text-blue-900 bg-white border border-blue-300 hover:bg-blue-50 rounded shadow-2xs inline-flex items-center gap-1.5"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Log First Maintenance Activity</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {relatedUpdates.map((update, idx) => {
                  const statusBadge = getProgressStatusBadge(update.progressStatus);
                  const isVerified = update.verification?.isVerified;

                  return (
                    <div
                      key={update.id}
                      className="p-4 rounded-lg border border-slate-200 bg-white shadow-2xs space-y-3"
                    >
                      {/* Update Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-xs text-slate-900">{update.id}</span>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className="text-xs font-semibold text-blue-950">{update.activityType}</span>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className="text-[11px] font-mono text-slate-500">{update.componentName}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${statusBadge.text}`}>
                            {statusBadge.label}
                          </span>
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase bg-slate-100 text-slate-800">
                            Condition: {update.currentCondition}
                          </span>
                        </div>
                      </div>

                      {/* Work Description & Action */}
                      <div className="text-xs space-y-1.5">
                        <div className="text-slate-800 font-medium leading-relaxed">
                          {update.workDescription}
                        </div>
                        <div className="text-slate-600">
                          <strong className="text-slate-700">Action Taken:</strong> {update.actionTaken}
                        </div>
                      </div>

                      {/* Parts Replaced Table (if any) */}
                      {update.partsReplaced && update.partsReplaced.length > 0 && (
                        <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-xs">
                          <div className="font-semibold text-slate-700 flex items-center gap-1 mb-1.5">
                            <Package className="w-3.5 h-3.5 text-slate-500" />
                            <span>Spare Parts Installed:</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {update.partsReplaced.map((part, pIdx) => (
                              <div key={pIdx} className="flex items-center justify-between bg-white px-2 py-1 rounded border border-slate-200 text-[11px]">
                                <span className="font-mono font-bold text-slate-800">{part.partNumber || 'OEM'}</span>
                                <span className="text-slate-600 truncate mx-2">{part.description}</span>
                                <span className="font-mono font-bold text-blue-900 bg-blue-50 px-1.5 rounded">x{part.quantity}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Evidence Photos */}
                      {update.evidencePhotos && update.evidencePhotos.length > 0 && (
                        <div>
                          <div className="text-[11px] font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                            <Camera className="w-3.5 h-3.5 text-blue-900" />
                            <span>Repair Evidence Photos ({update.evidencePhotos.length}):</span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {update.evidencePhotos.map((photo, pIdx) => (
                              <div
                                key={photo.id || pIdx}
                                onClick={() => setActiveLightboxPhoto({ url: photo.url, caption: photo.caption })}
                                className="group relative rounded border border-slate-200 overflow-hidden aspect-4/3 bg-slate-100 cursor-pointer"
                              >
                                <img
                                  src={photo.url}
                                  alt="Evidence photo"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                />
                                {photo.photoCategory && (
                                  <span className="absolute top-1 left-1 px-1 py-0.5 bg-slate-900/80 text-white text-[8px] font-mono rounded">
                                    {photo.photoCategory.replace('MAINTENANCE_', '')}
                                  </span>
                                )}
                                <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <ZoomIn className="w-4 h-4 text-white" />
                                </div>
                                {photo.caption && (
                                  <div className="absolute bottom-0 inset-x-0 bg-slate-900/80 px-1 py-0.5 text-[9px] text-white truncate font-mono">
                                    {photo.caption}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Verification Status Box */}
                      {isVerified ? (
                        <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-xs space-y-2">
                          <div className="flex items-center justify-between font-semibold text-emerald-900 mb-1">
                            <span className="flex items-center gap-1.5">
                              <ShieldCheck className="w-4 h-4 text-emerald-600" />
                              <span>Certified & Verified by Supervisor</span>
                            </span>
                            <span className="font-mono uppercase text-[10px] bg-emerald-100 px-2 py-0.5 rounded text-emerald-800">
                              Certified {update.verification?.verifiedCondition}
                            </span>
                          </div>
                          <p className="text-emerald-800 text-[11px] italic">
                            "{update.verification?.verificationNotes}"
                          </p>
                          {update.verification?.verificationPhotos && update.verification.verificationPhotos.length > 0 && (
                            <div className="flex items-center gap-2 overflow-x-auto pt-1">
                              {update.verification.verificationPhotos.map((vp, vIdx) => (
                                <img
                                  key={vp.id || vIdx}
                                  src={vp.url}
                                  alt={vp.caption || 'Verification photo'}
                                  onClick={() => setActiveLightboxPhoto({ url: vp.url, caption: vp.caption })}
                                  className="w-16 h-12 object-cover rounded border border-emerald-300 cursor-pointer shrink-0"
                                />
                              ))}
                            </div>
                          )}
                          <div className="mt-1.5 pt-1.5 border-t border-emerald-200/60 flex items-center justify-between text-[10px] font-mono text-emerald-700">
                            <span>Supervisor: {update.verification?.verifiedBy}</span>
                            <span>{formatDate(update.verification?.verifiedAt || '')}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2.5 bg-amber-50/60 rounded border border-amber-200 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 text-amber-900">
                            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>Work submitted by technician. Awaiting supervisor certification & live test verification.</span>
                          </div>

                          {onOpenVerifyModal && (
                            <button
                              onClick={() => onOpenVerifyModal(inspection, update)}
                              className="px-3 py-1 font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded shadow-xs text-xs flex items-center gap-1 shrink-0"
                            >
                              <FileCheck2 className="w-3.5 h-3.5" />
                              <span>Certify & Verify</span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Footer Metadata */}
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1 text-slate-600">
                            <User className="w-3 h-3" />
                            <span>{update.technicianName}</span>
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate max-w-[200px] text-slate-500">{update.technicianOrg}</span>
                        </div>
                        <div>
                          <span>Labor: {update.laborHours || 0} hrs</span>
                          <span className="mx-1.5">·</span>
                          <span>{formatDate(update.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Photo Evidence & Classification Audit Trail */}
          {sessionAuditEvents.length > 0 && (
            <div className="pt-4 border-t border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold font-display uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-blue-900" />
                  <span>Photo Evidence & Classification Audit Trail ({sessionAuditEvents.length})</span>
                </h3>
              </div>

              <div className="space-y-1.5">
                {sessionAuditEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-2.5 rounded border border-slate-200 bg-slate-50 text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-blue-900">{evt.eventType}</span>
                        <span className="text-slate-400">·</span>
                        <span className="font-semibold text-slate-700">{evt.actorName}</span>
                      </div>
                      <div className="text-slate-600">{evt.details}</div>
                    </div>
                    <div className="font-mono text-[10px] text-slate-400 shrink-0">
                      {formatDate(evt.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
          <div className="text-slate-500 font-mono">
            Conveyor Reliability CMMS · Architecture V2.1 Baseline
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors"
          >
            Close Report
          </button>
        </div>
      </div>

      {/* Lightbox Zoom Overlay */}
      {activeLightboxPhoto && (
        <div
          className="fixed inset-0 z-70 bg-slate-950/90 flex flex-col items-center justify-center p-4 backdrop-blur-md"
          onClick={() => setActiveLightboxPhoto(null)}
        >
          <button
            onClick={() => setActiveLightboxPhoto(null)}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white bg-slate-800 rounded-full"
          >
            <X className="w-6 h-6" />
          </button>

          <img
            src={activeLightboxPhoto.url}
            alt="Enlarged evidence"
            className="max-w-4xl max-h-[80vh] object-contain rounded-md shadow-2xl"
          />

          <div className="mt-4 text-center text-white">
            <div className="font-semibold text-sm">
              {activeLightboxPhoto.caption}
            </div>
            <div className="text-xs text-slate-400 font-mono mt-1">
              Conveyor {inspection.assetId} · Inspection {inspection.id}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

