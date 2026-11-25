/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  ClipboardCheck, 
  Search, 
  Plus, 
  Camera, 
  User, 
  ChevronRight,
  Layers,
  FileText,
  Clock,
  Play,
  Ban,
} from 'lucide-react';
import { 
  InspectionRecord, 
  ComponentInspectionReport,
  ConveyorCondition, 
  MaintenanceProgressStatus,
  getCurrentFindingCondition,
  computeSessionProgress,
  isSessionFinalized,
} from '../types/conveyor';

interface InspectionListProps {
  inspections: InspectionRecord[];
  draftInspections?: InspectionRecord[];
  componentReports?: ComponentInspectionReport[];
  onSelectInspection: (record: InspectionRecord) => void;
  onSelectComponentReport?: (report: ComponentInspectionReport) => void;
  onResumeDraft?: (draft: InspectionRecord) => void;
  onCancelDraft?: (draft: InspectionRecord, reason?: string) => Promise<void>;
  onNewInspection: () => void;
}

export const InspectionList: React.FC<InspectionListProps> = ({
  inspections,
  draftInspections = [],
  componentReports = [],
  onSelectInspection,
  onSelectComponentReport,
  onResumeDraft,
  onCancelDraft,
  onNewInspection,
}) => {
  const [viewMode, setViewMode] = useState<'sessions' | 'components' | 'drafts'>('sessions');
  const [searchQuery, setSearchQuery] = useState('');
  const [conditionFilter, setConditionFilter] = useState<'all' | ConveyorCondition>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | MaintenanceProgressStatus>('all');
  const [confirmCancelDraftId, setConfirmCancelDraftId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const finalizedSessions = inspections.filter(isSessionFinalized);

  const filteredInspections = finalizedSessions.filter((insp) => {
    const matchesSearch =
      insp.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      insp.assetId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      insp.assetName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      insp.inspectorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      insp.findings.toLowerCase().includes(searchQuery.toLowerCase());

    const currentCondition = getCurrentFindingCondition(insp);
    const matchesCondition =
      conditionFilter === 'all' || currentCondition === conditionFilter;

    const matchesStatus =
      statusFilter === 'all' || insp.maintenanceStatus === statusFilter;

    return matchesSearch && matchesCondition && matchesStatus;
  });

  const filteredDrafts = draftInspections.filter((draft) => {
    const q = searchQuery.toLowerCase();
    return (
      !q ||
      draft.id.toLowerCase().includes(q) ||
      draft.assetId.toLowerCase().includes(q) ||
      draft.assetName.toLowerCase().includes(q) ||
      (draft.site || '').toLowerCase().includes(q) ||
      draft.inspectorName.toLowerCase().includes(q)
    );
  });

  const filteredComponentReports = componentReports.filter((rep) => {
    const matchesSearch =
      rep.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rep.sessionId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rep.assetId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rep.assetName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rep.componentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rep.inspectorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rep.findings.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCondition =
      conditionFilter === 'all' || rep.currentCondition === conditionFilter;

    const matchesStatus =
      statusFilter === 'all' || rep.maintenanceStatus === statusFilter;

    return matchesSearch && matchesCondition && matchesStatus;
  });

  const getConditionStyle = (condition: ConveyorCondition) => {
    switch (condition) {
      case 'good':
        return 'text-emerald-700 bg-emerald-50 border-emerald-200';
      case 'fair':
        return 'text-blue-700 bg-blue-50 border-blue-200';
      case 'worn':
        return 'text-amber-700 bg-amber-50 border-amber-200';
      case 'damaged':
        return 'text-rose-700 bg-rose-50 border-rose-200';
    }
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'text-rose-700 font-bold';
      case 'high':
        return 'text-amber-700 font-semibold';
      case 'medium':
        return 'text-blue-700';
      default:
        return 'text-slate-500';
    }
  };

  const getStatusBadge = (status?: MaintenanceProgressStatus) => {
    switch (status) {
      case 'verified_closed':
        return { label: 'Verified Closed', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'completed_pending_verification':
        return { label: 'Pending Verify', badge: 'bg-orange-50 text-orange-700 border-orange-200' };
      case 'in_progress':
        return { label: 'In Progress', badge: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'parts_pending':
        return { label: 'Parts Pending', badge: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'diagnosing':
        return { label: 'Diagnosing', badge: 'bg-purple-50 text-purple-700 border-purple-200' };
      default:
        return { label: 'None', badge: 'bg-slate-100 text-slate-500 border-slate-200' };
    }
  };

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

  return (
    <div className="space-y-5">
      {/* Header bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold font-display text-slate-900 tracking-tight">
              Conveyor Inspection & Component Reports
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Comprehensive audit trail of consolidated inspection sessions and independent component maintenance lifecycles.
            </p>
          </div>

          <button
            onClick={onNewInspection}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-md shadow-xs transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Log Inspection</span>
          </button>
        </div>

        {/* View Mode Segmented Switcher & Search Bar */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* View Mode Tabs */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 self-start">
            <button
              onClick={() => setViewMode('sessions')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'sessions'
                  ? 'bg-white text-blue-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Inspection Sessions</span>
              <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-slate-200/80 text-slate-700 font-mono">
                {finalizedSessions.length}
              </span>
            </button>

            <button
              onClick={() => setViewMode('drafts')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'drafts'
                  ? 'bg-white text-blue-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Drafts & In-Progress</span>
              <span className={`ml-1 px-1.5 py-0.2 text-[10px] rounded-full font-mono ${
                draftInspections.length > 0
                  ? 'bg-amber-200 text-amber-900 font-bold'
                  : 'bg-slate-200/80 text-slate-700'
              }`}>
                {draftInspections.length}
              </span>
            </button>

            <button
              onClick={() => setViewMode('components')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'components'
                  ? 'bg-white text-blue-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Component Reports</span>
              <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-slate-200/80 text-slate-700 font-mono">
                {componentReports.length}
              </span>
            </button>
          </div>

          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={
                viewMode === 'drafts'
                  ? 'Search drafts by ID, asset, site/location, or inspector...'
                  : viewMode === 'sessions'
                  ? 'Search by Session ID (INSP-...), asset name, or inspector...'
                  : 'Search by Component (Belt, Idler, Pulley), Report ID, or asset...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 text-slate-900 bg-white"
            />
          </div>
        </div>

        {/* Secondary Filter Chips */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Condition:</span>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md border border-slate-200 text-xs overflow-x-auto">
              {(['all', 'damaged', 'worn', 'fair', 'good'] as const).map((filter) => {
                const isActive = conditionFilter === filter;
                return (
                  <button
                    key={filter}
                    onClick={() => setConditionFilter(filter)}
                    className={`px-2.5 py-0.5 rounded text-xs font-medium capitalize whitespace-nowrap transition-colors ${
                      isActive
                        ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {filter}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Status:</span>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md border border-slate-200 text-xs overflow-x-auto">
              {(['all', 'in_progress', 'completed_pending_verification', 'verified_closed'] as const).map((st) => {
                const isActive = statusFilter === st;
                return (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-0.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                      isActive
                        ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st === 'all' ? 'All' : st === 'in_progress' ? 'In Progress' : st === 'completed_pending_verification' ? 'Pending Verify' : 'Verified Closed'}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
        {viewMode === 'sessions' ? (
          /* SESSIONS VIEW */
          filteredInspections.length === 0 ? (
            <div className="p-12 text-center">
              <ClipboardCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-800">No inspection sessions found</h3>
              <p className="text-xs text-slate-500 mt-1">
                Adjust your search keywords or file a new consolidated inspection.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-mono">
                    <th className="py-3 px-4 font-semibold">SESSION ID</th>
                    <th className="py-3 px-4 font-semibold">ASSET TARGET</th>
                    <th className="py-3 px-4 font-semibold">DATE & INSPECTOR</th>
                    <th className="py-3 px-4 font-semibold">CURRENT CONDITION</th>
                    <th className="py-3 px-4 font-semibold">AUDIT BASELINE</th>
                    <th className="py-3 px-4 font-semibold">CHILD REPORTS</th>
                    <th className="py-3 px-4 font-semibold">MAINTENANCE STATUS</th>
                    <th className="py-3 px-4 font-semibold">PRIORITY</th>
                    <th className="py-3 px-4 font-semibold text-right">DETAILS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInspections.map((record) => {
                    const currentCond = getCurrentFindingCondition(record);
                    const isVerified = Boolean(record.latestVerifiedCondition);
                    const childCount = componentReports.filter((r) => r.sessionId === record.id).length ||
                      (record.components ? Object.keys(record.components).length : 0);
                    const statusObj = getStatusBadge(record.maintenanceStatus);

                    return (
                      <tr
                        key={record.id}
                        onClick={() => onSelectInspection(record)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      >
                        {/* ID */}
                        <td className="py-3.5 px-4 font-mono font-bold text-blue-900 whitespace-nowrap">
                          {record.id}
                        </td>

                        {/* Target Asset */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{record.assetName}</div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">{record.assetId}</div>
                        </td>

                        {/* Date & Inspector */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="text-slate-800 font-medium">{formatDate(record.inspectionDate)}</div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <User className="w-3 h-3" />
                            <span>{record.inspectorName}</span>
                          </div>
                        </td>

                        {/* Current Finding Condition */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${getConditionStyle(currentCond)}`}>
                              {currentCond}
                            </span>
                            {isVerified && (
                              <span className="text-[9px] font-mono font-bold px-1 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase">
                                Verified
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Audit Baseline */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="text-[11px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 uppercase">
                            {record.overallCondition}
                          </span>
                        </td>

                        {/* Child Reports Count */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            <Layers className="w-3 h-3 text-blue-900" />
                            <span>{childCount} child reports</span>
                          </span>
                        </td>

                        {/* Maintenance Lifecycle Status */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${statusObj.badge}`}>
                            {statusObj.label}
                          </span>
                        </td>

                        {/* Priority */}
                        <td className="py-3.5 px-4 whitespace-nowrap uppercase font-mono text-[11px]">
                          <span className={getPriorityStyle(record.priority)}>
                            {record.priority}
                          </span>
                        </td>

                        {/* Details action */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-900 group-hover:text-blue-700">
                            <span>View Session</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : viewMode === 'drafts' ? (
          /* DRAFTS & IN-PROGRESS VIEW */
          filteredDrafts.length === 0 ? (
            <div className="p-12 text-center">
              <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-800">No unfinished draft inspections</h3>
              <p className="text-xs text-slate-500 mt-1">
                Start a new field inspection and save components progressively to resume later across browser sessions.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredDrafts.map((draft) => {
                const progress = computeSessionProgress(draft);
                const compEntries = Object.values(draft.componentDrafts || {});
                const isConfirmingCancel = confirmCancelDraftId === draft.id;

                return (
                  <div key={draft.id} className="p-5 hover:bg-slate-50/70 transition-colors space-y-3">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
                          <span className="font-bold text-blue-900">{draft.id}</span>
                          <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${
                            draft.status === 'READY_FOR_REVIEW'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : draft.status === 'IN_PROGRESS'
                              ? 'bg-blue-50 text-blue-800 border-blue-300'
                              : 'bg-slate-100 text-slate-700 border-slate-300'
                          }`}>
                            {(draft.status || 'DRAFT').replace(/_/g, ' ')}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-600">
                            {progress.doneCount} / {progress.totalCount} components saved
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-500">
                            Last saved {formatDate(draft.lastSavedAt || draft.createdAt)}
                          </span>
                        </div>

                        <div className="text-sm font-bold text-slate-900">
                          {draft.assetName} <span className="text-xs font-mono font-normal text-slate-500">({draft.assetId})</span>
                        </div>

                        <div className="text-xs text-slate-600 flex items-center gap-3 flex-wrap">
                          <span>Site / Location: <strong className="text-slate-800">{draft.site || 'Plant Conveyor Line'}</strong></span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400" />
                            <span>{draft.inspectorName}</span>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {onResumeDraft && (
                          <button
                            type="button"
                            onClick={() => onResumeDraft(draft)}
                            className="px-3.5 py-2 text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 rounded-md shadow-xs flex items-center gap-1.5 transition-colors"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>Resume Inspection</span>
                          </button>
                        )}
                        {onCancelDraft && !isConfirmingCancel && (
                          <button
                            type="button"
                            onClick={() => setConfirmCancelDraftId(draft.id)}
                            className="px-3 py-2 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md flex items-center gap-1 transition-colors"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>Cancel Draft</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Per-component status breakdown pills */}
                    {compEntries.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {compEntries.map((cd) => (
                          <span
                            key={cd.componentName}
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                              cd.status === 'COMPLETED' || cd.status === 'SAVED'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : cd.status === 'IN_PROGRESS'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : cd.status === 'NOT_APPLICABLE'
                                ? 'bg-slate-200 text-slate-700 border-slate-300'
                                : 'bg-slate-50 text-slate-500 border-slate-200'
                            }`}
                          >
                            {cd.componentName}: <strong>{cd.status}</strong>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Inline cancel confirmation */}
                    {isConfirmingCancel && onCancelDraft && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-rose-900">
                        <span>Confirm cancelling draft <strong>{draft.id}</strong>? It will remain excluded from finalized audits.</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setConfirmCancelDraftId(null)}
                            className="px-2.5 py-1 bg-white border border-slate-300 rounded text-slate-700 font-medium"
                          >
                            Keep Draft
                          </button>
                          <button
                            type="button"
                            disabled={cancellingId === draft.id}
                            onClick={async () => {
                              setCancellingId(draft.id);
                              try {
                                await onCancelDraft(draft, 'Cancelled from Drafts List');
                                setConfirmCancelDraftId(null);
                              } finally {
                                setCancellingId(null);
                              }
                            }}
                            className="px-2.5 py-1 bg-rose-700 text-white rounded font-semibold disabled:opacity-50"
                          >
                            {cancellingId === draft.id ? 'Cancelling...' : 'Confirm Cancel'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* COMPONENT REPORTS VIEW */
          filteredComponentReports.length === 0 ? (
            <div className="p-12 text-center">
              <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-800">No component reports found</h3>
              <p className="text-xs text-slate-500 mt-1">
                Component reports are generated automatically whenever an inspection is finalized.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-mono">
                    <th className="py-3 px-4 font-semibold">REPORT ID</th>
                    <th className="py-3 px-4 font-semibold">COMPONENT NAME</th>
                    <th className="py-3 px-4 font-semibold">ASSET & SESSION</th>
                    <th className="py-3 px-4 font-semibold">CURRENT CONDITION</th>
                    <th className="py-3 px-4 font-semibold">AUDIT BASELINE</th>
                    <th className="py-3 px-4 font-semibold">MAINTENANCE STATUS</th>
                    <th className="py-3 px-4 font-semibold">PHOTOS</th>
                    <th className="py-3 px-4 font-semibold text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredComponentReports.map((report) => {
                    const statusObj = getStatusBadge(report.maintenanceStatus);
                    const isVerified = Boolean(report.latestVerifiedCondition);

                    return (
                      <tr
                        key={report.id}
                        onClick={() => onSelectComponentReport && onSelectComponentReport(report)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      >
                        {/* Component Report ID */}
                        <td className="py-3.5 px-4 font-mono font-bold text-blue-900 whitespace-nowrap">
                          {report.id}
                        </td>

                        {/* Component Name */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{report.componentName}</div>
                          {report.componentCategory && (
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              {report.componentCategory}
                            </div>
                          )}
                        </td>

                        {/* Asset & Parent Session */}
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-800">{report.assetName}</div>
                          <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                            <span>{report.assetId}</span>
                            <span>·</span>
                            <span className="text-blue-900 font-semibold">{report.sessionId}</span>
                          </div>
                        </td>

                        {/* Current Condition */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${getConditionStyle(report.currentCondition)}`}>
                              {report.currentCondition}
                            </span>
                            {isVerified && (
                              <span className="text-[9px] font-mono font-bold px-1 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase">
                                Verified
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Audit Baseline */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="text-[11px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 uppercase">
                            {report.originalCondition}
                          </span>
                        </td>

                        {/* Maintenance Lifecycle Status */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${statusObj.badge}`}>
                            {statusObj.label}
                          </span>
                        </td>

                        {/* Evidence Photos */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {report.photos && report.photos.length > 0 ? (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-mono">
                              <Camera className="w-3.5 h-3.5 text-blue-900" />
                              <span>{report.photos.length}</span>
                            </div>
                          ) : (
                            <span className="text-slate-300 text-[11px] font-mono">—</span>
                          )}
                        </td>

                        {/* Action */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-900 group-hover:text-blue-700">
                            <span>View Report</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
};
