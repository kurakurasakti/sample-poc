/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Layers, 
  ClipboardCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ArrowRight, 
  Plus, 
  Camera, 
  Activity,
  ShieldAlert,
  ArrowUpRight,
  Play
} from 'lucide-react';
import {
  ConveyorAsset,
  InspectionRecord,
  DashboardMetrics,
  ConveyorCondition,
  getCurrentFindingCondition,
  isSessionFinalized,
  computeSessionProgress,
} from '../types/conveyor';

interface DashboardProps {
  metrics: DashboardMetrics;
  assets: ConveyorAsset[];
  inspections: InspectionRecord[];
  draftInspections?: InspectionRecord[];
  onNavigateTab: (tab: 'dashboard' | 'assets' | 'inspections' | 'new-inspection') => void;
  onSelectInspection: (record: InspectionRecord) => void;
  onSelectAssetToInspect: (asset: ConveyorAsset) => void;
  onResumeDraft?: (draft: InspectionRecord) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  metrics,
  assets,
  inspections,
  draftInspections = [],
  onNavigateTab,
  onSelectInspection,
  onSelectAssetToInspect,
  onResumeDraft,
}) => {
  // Recent 5 finalized inspections (drafts never leak into finalized recent audits)
  const recentInspections = inspections.filter(isSessionFinalized).slice(0, 5);

  // Damaged conveyor assets
  const damagedAssets = assets.filter((a) => a.currentCondition === 'damaged');

  // Condition styling helper
  const getConditionStyle = (condition: ConveyorCondition) => {
    switch (condition) {
      case 'good':
        return {
          text: 'text-emerald-700',
          bg: 'bg-emerald-50',
          border: 'border-emerald-200',
          label: 'Good / Nominal',
        };
      case 'fair':
        return {
          text: 'text-blue-700',
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          label: 'Fair Condition',
        };
      case 'worn':
        return {
          text: 'text-amber-700',
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          label: 'Worn / Monitor',
        };
      case 'damaged':
        return {
          text: 'text-rose-700',
          bg: 'bg-rose-50',
          border: 'border-rose-200',
          label: 'Damaged / Action',
        };
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Pending inspection';
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
    <div className="space-y-6">
      {/* Welcome & Primary Action Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-500 mb-1">
              <span>FACILITY RELIABILITY CONSOLE</span>
              <span aria-hidden="true">·</span>
              <span>LIVE SYSTEM STATUS</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-display text-slate-900 tracking-tight">
              Conveyor Line Condition Dashboard
            </h1>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">
              Track conveyor belt mechanical integrity, log field inspections with camera evidence, and mitigate belt tears and roller seizures before catastrophic shutdowns.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => onNavigateTab('assets')}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md transition-colors"
            >
              View All Assets
            </button>
            <button
              onClick={() => onNavigateTab('new-inspection')}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-md shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Log Inspection</span>
            </button>
          </div>
        </div>
      </div>

      {/* Critical Damaged Alert Callout (if any) */}
      {damagedAssets.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-rose-900 font-display">
                  Urgent Attention: {damagedAssets.length} Conveyor Asset{damagedAssets.length > 1 ? 's' : ''} Flagged Damaged
                </h3>
                <span className="text-xs text-rose-700 font-mono">Immediate maintenance review required</span>
              </div>
              <p className="text-xs text-rose-700 mt-1">
                Field inspections identified severe component degradation. Check the inspection record for photos and repair recommendations.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {damagedAssets.map((asset) => (
                  <button
                    key={asset.id}
                    onClick={() => onSelectAssetToInspect(asset)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white border border-rose-300 rounded text-xs font-medium text-rose-900 hover:bg-rose-100/60 transition-colors"
                  >
                    <span className="font-mono font-bold text-rose-700">{asset.id}</span>
                    <span className="truncate max-w-[200px]">{asset.name}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-rose-500" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Stat Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Assets */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-mono mb-2">
            <span>REGISTERED ASSETS</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-slate-900">
            {metrics.totalAssets}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
            <span>Active in production</span>
            <span className="font-mono font-semibold text-slate-700">{metrics.activeAssets} operational</span>
          </div>
        </div>

        {/* Total Inspections */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-mono mb-2">
            <span>INSPECTION AUDIT LOGS</span>
            <ClipboardCheck className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-3xl font-bold font-mono text-slate-900">
            {metrics.totalInspections}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
            <span>Compliance history</span>
            <span className="font-mono font-semibold text-blue-700">Audit-ready</span>
          </div>
        </div>

        {/* Active Corrective Repairs & Pending Verification */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-mono mb-2">
            <span>MAINTENANCE PIPELINE</span>
            <Activity className="w-4 h-4 text-blue-900" />
          </div>
          <div className="text-3xl font-bold font-mono text-slate-900">
            {metrics.activeMaintenanceCount}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
            <span>Awaiting verification</span>
            <span className="font-mono font-semibold text-orange-600">
              {metrics.pendingVerificationCount} to certify
            </span>
          </div>
        </div>

        {/* Damaged Components / Critical Alerts */}
        <div className={`rounded-lg p-4 sm:p-5 border ${
          metrics.damagedComponents > 0 
            ? 'bg-rose-50/50 border-rose-200' 
            : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between text-xs font-mono mb-2">
            <span className={metrics.damagedComponents > 0 ? 'text-rose-700' : 'text-slate-500'}>
              DAMAGED COMPONENTS
            </span>
            <AlertTriangle className={`w-4 h-4 ${metrics.damagedComponents > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
          </div>
          <div className={`text-3xl font-bold font-mono ${metrics.damagedComponents > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
            {metrics.damagedComponents}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs pt-2 border-t border-slate-100 text-slate-500">
            <span>Verified closed repairs</span>
            <span className="font-mono font-semibold text-emerald-700">
              {metrics.verifiedRepairsCount} certified
            </span>
          </div>
        </div>
      </div>

      {/* Resume Unfinished Draft Inspections Panel */}
      {draftInspections.length > 0 && (
        <div className="bg-white border border-blue-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="p-4 sm:px-5 border-b border-blue-100 bg-blue-50/50 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold font-display text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-900" />
                <span>Unfinished Draft Inspections ({draftInspections.length})</span>
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Draft findings remain isolated from finalized asset alerts and maintenance triggers until finalized.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('inspections')}
              className="text-xs font-semibold text-blue-900 hover:underline shrink-0"
            >
              Manage All Drafts
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {draftInspections.map((draft) => {
              const progress = computeSessionProgress(draft);
              return (
                <div
                  key={draft.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
                      <span className="font-bold text-blue-900">{draft.id}</span>
                      <span className="px-2 py-0.5 rounded border text-[10px] font-bold uppercase bg-blue-50 text-blue-800 border-blue-200">
                        {(draft.status || 'DRAFT').replace(/_/g, ' ')}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-700 font-semibold">
                        {progress.doneCount} / {progress.totalCount} components
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500">
                        Saved {formatDate(draft.lastSavedAt || draft.createdAt)}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {draft.assetName} <span className="text-xs font-mono font-normal text-slate-500">({draft.assetId} · {draft.site || 'Plant Conveyor'})</span>
                    </div>
                  </div>

                  {onResumeDraft && (
                    <button
                      type="button"
                      onClick={() => onResumeDraft(draft)}
                      className="px-3.5 py-2 text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 rounded-md shadow-xs flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Resume Inspection</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grid: Recent Inspection Records & Asset Status Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans): Recent Inspection Records */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="p-4 sm:px-5 sm:py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold font-display text-slate-900">
                Recent Field Inspections
              </h2>
              <div className="text-xs text-slate-500">
                Chronological logs from plant technicians with condition ratings
              </div>
            </div>

            <button
              onClick={() => onNavigateTab('inspections')}
              className="flex items-center gap-1 text-xs font-semibold text-blue-900 hover:text-blue-700 transition-colors"
            >
              <span>View All Logs</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {recentInspections.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No inspection records logged yet.
              </div>
            ) : (
              recentInspections.map((record) => {
                const currentCond = getCurrentFindingCondition(record);
                const cond = getConditionStyle(currentCond);
                const isVerified = Boolean(record.latestVerifiedCondition);

                return (
                  <div
                    key={record.id}
                    onClick={() => onSelectInspection(record)}
                    className="p-4 hover:bg-slate-50 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mb-1">
                        <span className="font-bold text-slate-900">{record.id}</span>
                        <span aria-hidden="true">·</span>
                        <span>{record.assetId}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatDate(record.inspectionDate)}</span>
                        {isVerified && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                              Verified
                            </span>
                          </>
                        )}
                      </div>

                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {record.assetName}
                      </div>

                      <div className="text-xs text-slate-600 line-clamp-1 mt-0.5">
                        {record.findings}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {record.photos && record.photos.length > 0 && (
                        <div className="flex items-center gap-1 text-xs text-slate-500 font-mono bg-slate-100 px-2 py-1 rounded">
                          <Camera className="w-3.5 h-3.5 text-slate-600" />
                          <span>{record.photos.length} photo{record.photos.length > 1 ? 's' : ''}</span>
                        </div>
                      )}

                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded border font-mono ${cond.bg} ${cond.text} ${cond.border}`}>
                          {cond.label}
                        </span>
                        {record.overallCondition !== currentCond && (
                          <span className="text-[10px] font-mono text-slate-400">
                            Audit: {record.overallCondition.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column (1 span): Conveyor Asset Quick Roster */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold font-display text-slate-900">
                Conveyor Fleet Status
              </h2>
              <div className="text-xs text-slate-500">
                Equipment condition overview
              </div>
            </div>

            <button
              onClick={() => onNavigateTab('assets')}
              className="text-xs font-semibold text-blue-900 hover:text-blue-700"
            >
              Manage
            </button>
          </div>

          <div className="p-4 flex-1 space-y-3">
            {assets.slice(0, 5).map((asset) => {
              const cond = getConditionStyle(asset.currentCondition);
              return (
                <div
                  key={asset.id}
                  className="p-3 rounded-md border border-slate-100 hover:border-slate-300 bg-slate-50/60 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 text-xs mb-1">
                    <span className="font-mono font-bold text-slate-800">{asset.id}</span>
                    <span className={`text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded border ${cond.bg} ${cond.text} ${cond.border}`}>
                      {asset.currentCondition.toUpperCase()}
                    </span>
                  </div>

                  <div className="text-xs font-medium text-slate-900 truncate">
                    {asset.name}
                  </div>

                  <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between font-mono">
                    <span className="truncate">{asset.location}</span>
                    <span>{asset.beltWidthMm}mm · {asset.speedMps}m/s</span>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-end">
                    <button
                      onClick={() => onSelectAssetToInspect(asset)}
                      className="text-[11px] font-medium text-blue-900 hover:text-blue-700 flex items-center gap-1"
                    >
                      <span>New Inspection</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
