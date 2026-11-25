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
  ArrowLeft
} from 'lucide-react';
import { 
  ComponentInspectionReport,
  InspectionRecord, 
  ConveyorCondition, 
  MaintenanceProgressUpdate,
  MaintenanceProgressStatus,
  getComponentInspectionPhotos
} from '../types/conveyor';

interface ComponentReportDetailModalProps {
  report: ComponentInspectionReport | null;
  parentSession?: InspectionRecord;
  maintenanceUpdates?: MaintenanceProgressUpdate[];
  currentUser?: any;
  onClose: () => void;
  onOpenMaintenanceModal?: (inspection: InspectionRecord, componentReport: ComponentInspectionReport) => void;
  onOpenVerifyModal?: (inspection: InspectionRecord, update: MaintenanceProgressUpdate) => void;
}

export const ComponentReportDetailModal: React.FC<ComponentReportDetailModalProps> = ({
  report,
  parentSession,
  maintenanceUpdates = [],
  currentUser,
  onClose,
  onOpenMaintenanceModal,
  onOpenVerifyModal,
}) => {
  const [activeLightboxPhoto, setActiveLightboxPhoto] = useState<{ url: string; caption: string } | null>(null);

  if (!report) return null;

  const componentInspectionPhotos = getComponentInspectionPhotos(report, parentSession);

  // Filter updates for this component report (or fallback by session ID & componentName)
  const relatedUpdates = maintenanceUpdates.filter(
    (u) =>
      (u.componentReportId && u.componentReportId === report.id) ||
      (u.inspectionId === report.sessionId && u.componentName === report.componentName)
  );

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

  const currentCondStyle = getConditionStyle(report.currentCondition);
  const auditCondStyle = getConditionStyle(report.originalCondition);
  const CurrentStatusIcon = currentCondStyle.icon;
  const isFormallyVerified = Boolean(report.latestVerifiedCondition);

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

  // Find latest update pending verification if any
  const pendingVerificationUpdate = relatedUpdates.find(
    (u) => u.progressStatus === 'completed_pending_verification' && !u.verification?.isVerified
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-4xl w-full my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
              <span className="font-semibold text-blue-900">COMPONENT INSPECTION REPORT</span>
              <span aria-hidden="true">·</span>
              <span className="font-bold text-slate-900">{report.id}</span>
              <span aria-hidden="true">·</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${currentCondStyle.badge}`}>
                Current: {report.currentCondition}
              </span>
              {report.maintenanceStatus && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getProgressStatusBadge(report.maintenanceStatus).text}`}>
                    {getProgressStatusBadge(report.maintenanceStatus).label}
                  </span>
                </>
              )}
            </div>
            <h2 className="text-base sm:text-lg font-bold font-display text-slate-900 mt-0.5 flex items-center gap-2">
              <span>{report.componentName}</span>
              <span className="text-xs font-normal text-slate-500">on {report.assetName} ({report.assetId})</span>
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              title="Print Component Report"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden sm:inline">Print Report</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-md transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 space-y-6 max-h-[82vh] overflow-y-auto">
          {/* Dual Condition Banners */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Banner 1: Live Operational Condition */}
            <div className={`p-4 rounded-lg border ${currentCondStyle.banner} flex items-start gap-3`}>
              <CurrentStatusIcon className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Current Component Condition
                  </span>
                  {isFormallyVerified && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 text-[10px] font-bold text-emerald-800 bg-emerald-100 rounded">
                      <ShieldCheck className="w-3 h-3" /> Certified by Supervisor
                    </span>
                  )}
                </div>
                <div className="text-base font-bold capitalize mt-0.5">
                  {report.currentCondition} Condition
                </div>
                <p className="text-xs opacity-90 mt-1">
                  {report.currentCondition === 'good' && 'Component meets nominal factory tolerances for continuous operational run.'}
                  {report.currentCondition === 'fair' && 'Component displays standard operational wear; monitor during scheduled walks.'}
                  {report.currentCondition === 'worn' && 'Component exhibits accelerated wear; corrective service action required.'}
                  {report.currentCondition === 'damaged' && 'Component flagged with critical defect. Requires immediate repair intervention.'}
                </p>
                {report.verifiedBy && (
                  <div className="text-[11px] font-mono mt-2 pt-2 border-t border-current/15 text-slate-700">
                    Sign-off: {report.verifiedBy} {report.verifiedAt ? `on ${formatDate(report.verifiedAt)}` : ''}
                  </div>
                )}
              </div>
            </div>

            {/* Banner 2: Immutable Audit Record */}
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/80 flex items-start gap-3">
              <FileCheck2 className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Original Field Session Finding (Immutable)
                  </span>
                </div>
                <div className="text-base font-bold capitalize text-slate-900 mt-0.5">
                  Graded: {report.originalCondition}
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Recorded during field session <strong className="font-mono text-slate-800">{report.sessionId}</strong> by inspector <span className="font-semibold text-slate-800">{report.inspectorName}</span>.
                </p>
                <div className="text-[11px] font-mono text-slate-500 mt-2 pt-2 border-t border-slate-200">
                  Audit Date: {formatDate(report.inspectionDate)}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Info Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
            <div>
              <span className="text-slate-500 block font-medium">Target Asset</span>
              <span className="font-bold text-slate-900">{report.assetId}</span>
            </div>
            <div>
              <span className="text-slate-500 block font-medium">Parent Session</span>
              <span className="font-mono font-bold text-blue-900">{report.sessionId}</span>
            </div>
            <div>
              <span className="text-slate-500 block font-medium">Component</span>
              <span className="font-bold text-slate-900">{report.componentName}</span>
            </div>
            <div>
              <span className="text-slate-500 block font-medium">Lifecycle Status</span>
              <span className="font-bold capitalize text-slate-900">
                {report.maintenanceStatus ? report.maintenanceStatus.replace(/_/g, ' ') : 'None'}
              </span>
            </div>
          </div>

          {/* Findings & Recommendations */}
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>Component Inspection Observations & Findings</span>
              </h3>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-800 leading-relaxed whitespace-pre-line font-sans">
                {report.findings}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Recommendations & Maintenance Directives</span>
              </h3>
              <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-md text-xs text-emerald-950 leading-relaxed whitespace-pre-line font-sans">
                {report.recommendations}
              </div>
            </div>
          </div>

          {/* Component-Specific Inspection Photographic Evidence Gallery */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-slate-500" />
              <span>Component Inspection Photographic Evidence ({componentInspectionPhotos.length})</span>
            </h3>
            {componentInspectionPhotos.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {componentInspectionPhotos.map((photo, idx) => (
                  <div
                    key={photo.id || idx}
                    onClick={() => setActiveLightboxPhoto({ url: photo.url, caption: photo.caption })}
                    className="group relative cursor-pointer border border-slate-200 rounded-md overflow-hidden bg-slate-950 aspect-4/3 flex items-center justify-center shadow-2xs"
                  >
                    <img
                      src={photo.url}
                      alt={photo.caption || 'Evidence'}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-200"
                    />
                    <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-white text-xs font-medium">
                      <ZoomIn className="w-4 h-4" />
                      <span>Enlarge</span>
                    </div>
                    {photo.caption && (
                      <div className="absolute bottom-0 inset-x-0 bg-slate-900/80 backdrop-blur-xs text-[10px] text-white px-2 py-1 truncate">
                        {photo.caption}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-md border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-500">
                No component-specific inspection photos were attached for {report.componentName}. Unrelated component and general session photos are excluded from this report.
              </div>
            )}
          </div>

          {/* Corrective Maintenance History & Lifecycle Section */}
          <div className="border-t border-slate-200 pt-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Wrench className="w-4 h-4 text-blue-900" />
                  <span>Corrective Maintenance History for {report.componentName}</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Independent maintenance lifecycle records, work order tracking, and supervisor verification logs.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {pendingVerificationUpdate && onOpenVerifyModal && (
                  <button
                    onClick={() => {
                      const sessionRecord = parentSession || {
                        id: report.sessionId,
                        assetId: report.assetId,
                        assetName: report.assetName,
                        overallCondition: report.originalCondition,
                        findings: report.findings,
                        recommendations: report.recommendations,
                        priority: 'high',
                        photos: report.photos,
                        inspectionDate: report.inspectionDate,
                        inspectorName: report.inspectorName,
                        inspectorId: report.inspectorId,
                        components: { [report.componentName]: report.originalCondition },
                        createdAt: report.createdAt,
                      } as InspectionRecord;
                      onOpenVerifyModal(sessionRecord, pendingVerificationUpdate);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow-xs transition-colors"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Certify & Verify Repair</span>
                  </button>
                )}

                {onOpenMaintenanceModal && (
                  <button
                    onClick={() => {
                      const sessionRecord = parentSession || {
                        id: report.sessionId,
                        assetId: report.assetId,
                        assetName: report.assetName,
                        overallCondition: report.originalCondition,
                        findings: report.findings,
                        recommendations: report.recommendations,
                        priority: 'high',
                        photos: report.photos,
                        inspectionDate: report.inspectionDate,
                        inspectorName: report.inspectorName,
                        inspectorId: report.inspectorId,
                        components: { [report.componentName]: report.originalCondition },
                        createdAt: report.createdAt,
                      } as InspectionRecord;
                      onOpenMaintenanceModal(sessionRecord, report);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-md shadow-xs transition-colors"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Log Maintenance Update</span>
                  </button>
                )}
              </div>
            </div>

            {/* Updates list */}
            {relatedUpdates.length === 0 ? (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 text-center text-xs text-slate-500">
                <Clock className="w-6 h-6 text-slate-400 mx-auto mb-1.5 opacity-60" />
                <p className="font-medium text-slate-700">No corrective maintenance updates logged yet for this component.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Click &ldquo;Log Maintenance Update&rdquo; above to record repairs, parts replaced, and labor hours.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {relatedUpdates.map((update) => {
                  const statusInfo = getProgressStatusBadge(update.progressStatus);
                  const isVerified = Boolean(update.verification?.isVerified);

                  return (
                    <div
                      key={update.id}
                      className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-blue-900">{update.id}</span>
                          <span className="text-slate-300">·</span>
                          <span className="text-xs font-semibold text-slate-800">{update.activityType}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${statusInfo.text}`}>
                            {statusInfo.label}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">
                            {formatDate(update.createdAt)}
                          </span>
                        </div>
                      </div>

                      <div className="text-xs text-slate-700 space-y-1">
                        <div>
                          <strong className="text-slate-900">Work Description: </strong>
                          {update.workDescription}
                        </div>
                        {update.actionTaken && (
                          <div>
                            <strong className="text-slate-900">Action Taken: </strong>
                            {update.actionTaken}
                          </div>
                        )}
                      </div>

                      {/* Parts and Labor */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2.5 rounded border border-slate-200">
                        <div>
                          <span className="text-slate-500 block">Technician Attribution:</span>
                          <span className="font-semibold text-slate-800">
                            {update.technicianName} ({update.technicianOrg || 'Contractor'})
                          </span>
                          {update.laborHours && (
                            <span className="text-slate-500 block mt-0.5">Labor: {update.laborHours} hrs</span>
                          )}
                        </div>
                        <div>
                          <span className="text-slate-500 block">Parts Replaced:</span>
                          {update.partsReplaced && update.partsReplaced.length > 0 ? (
                            <ul className="list-disc list-inside text-slate-800 space-y-0.5 font-mono">
                              {update.partsReplaced.map((part, pIdx) => (
                                <li key={pIdx}>
                                  {part.partNumber} ({part.quantity}x)
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-slate-400 italic">None logged</span>
                          )}
                        </div>
                      </div>

                      {/* Evidence Photos with Stage Badges */}
                      {update.evidencePhotos && update.evidencePhotos.length > 0 && (
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                            Technician Repair Evidence Photos ({update.evidencePhotos.length})
                          </span>
                          <div className="flex items-center gap-2 overflow-x-auto pb-1">
                            {update.evidencePhotos.map((photo, phIdx) => (
                              <div key={photo.id || phIdx} className="relative shrink-0">
                                <img
                                  src={photo.url}
                                  alt={photo.caption || 'Evidence'}
                                  onClick={() => setActiveLightboxPhoto({ url: photo.url, caption: photo.caption })}
                                  className="w-20 h-14 object-cover rounded border border-slate-300 cursor-pointer hover:opacity-90"
                                />
                                {photo.photoCategory && (
                                  <span className="absolute bottom-0.5 left-0.5 px-1 py-0.2 bg-slate-900/80 text-white text-[8px] font-mono rounded">
                                    {photo.photoCategory.replace('MAINTENANCE_', '')}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Supervisor Verification Banner */}
                      {isVerified && update.verification && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-xs text-emerald-950 space-y-2">
                          <div className="flex items-center justify-between font-bold text-emerald-900">
                            <span className="flex items-center gap-1.5">
                              <ShieldCheck className="w-4 h-4 text-emerald-600" />
                              <span>Repair Formally Certified & Closed</span>
                            </span>
                            <span className="font-mono text-[10px] uppercase bg-emerald-200/60 px-2 py-0.5 rounded text-emerald-900">
                              Condition: {update.verification.verifiedCondition}
                            </span>
                          </div>
                          <p className="text-[11px] leading-relaxed">
                            {update.verification.verificationNotes}
                          </p>
                          {update.verification.verificationPhotos && update.verification.verificationPhotos.length > 0 && (
                            <div className="flex items-center gap-2 pt-1 overflow-x-auto">
                              {update.verification.verificationPhotos.map((vp, vIdx) => (
                                <img
                                  key={vp.id || vIdx}
                                  src={vp.url}
                                  alt={vp.caption || 'Verification evidence'}
                                  onClick={() => setActiveLightboxPhoto({ url: vp.url, caption: vp.caption })}
                                  className="w-16 h-12 object-cover rounded border border-emerald-300 cursor-pointer hover:opacity-90 shrink-0"
                                />
                              ))}
                            </div>
                          )}
                          <div className="text-[10px] font-mono text-emerald-800 pt-1 border-t border-emerald-200/60">
                            Certified by: {update.verification.verifiedBy} · {formatDate(update.verification.verifiedAt)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-[11px] font-mono text-slate-400">
            Document: {report.id} · Independent Component Lifecycle
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 transition-colors"
          >
            Close Report
          </button>
        </div>
      </div>

      {/* Lightbox Modal */}
      {activeLightboxPhoto && (
        <div 
          onClick={() => setActiveLightboxPhoto(null)}
          className="fixed inset-0 z-60 bg-slate-950/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm cursor-zoom-out"
        >
          <div className="relative max-w-4xl max-h-[85vh] overflow-hidden rounded-lg bg-black">
            <img 
              src={activeLightboxPhoto.url} 
              alt={activeLightboxPhoto.caption}
              className="max-h-[80vh] w-auto mx-auto object-contain"
            />
            {activeLightboxPhoto.caption && (
              <div className="p-3 bg-slate-900 text-white text-xs text-center border-t border-slate-800">
                {activeLightboxPhoto.caption}
              </div>
            )}
          </div>
          <p className="text-slate-400 text-xs mt-3">Click anywhere to close preview</p>
        </div>
      )}
    </div>
  );
};
