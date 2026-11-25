/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useConveyorStore, generateNextInspectionId } from './services/store';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { AssetList } from './components/AssetList';
import { NewInspectionForm } from './components/NewInspectionForm';
import { InspectionList } from './components/InspectionList';
import { InspectionDetailModal } from './components/InspectionDetailModal';
import { ComponentReportDetailModal } from './components/ComponentReportDetailModal';
import { MaintenanceUpdateModal } from './components/MaintenanceUpdateModal';
import { VerifyMaintenanceModal } from './components/VerifyMaintenanceModal';
import {
  ConveyorAsset,
  InspectionRecord,
  MaintenanceProgressUpdate,
} from './types/conveyor';
import { CheckCircle2 } from 'lucide-react';

export default function App() {
  const {
    assets,
    inspections,
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
    classifyLegacyPhoto,
    addMaintenanceUpdate,
    verifyMaintenanceUpdate,
  } = useConveyorStore();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [inspectionFormKey, setInspectionFormKey] = useState<string>('new-0');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(null);

  // Maintenance Modals
  const [inspectionForMaintenanceUpdate, setInspectionForMaintenanceUpdate] = useState<InspectionRecord | null>(null);
  const [maintenanceComponentTarget, setMaintenanceComponentTarget] = useState<{
    componentName?: string;
    componentReportId?: string;
  } | null>(null);
  const [verificationTarget, setVerificationTarget] = useState<{
    inspection: InspectionRecord;
    update: MaintenanceProgressUpdate;
  } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const handleStartInspection = (asset?: ConveyorAsset) => {
    setActiveDraftSession(null);
    setInspectionFormKey(`new-${Date.now()}`);
    if (asset) {
      setSelectedAssetForInspection(asset);
    } else {
      setSelectedAssetForInspection(assets[0] || null);
    }
    setActiveTab('new-inspection');
  };

  const handleResumeDraft = (draft: InspectionRecord) => {
    setActiveDraftSession(draft);
    setInspectionFormKey(`resume-${draft.id}-${Date.now()}`);
    const matchingAsset = assets.find((a) => a.id === draft.assetId) || null;
    setSelectedAssetForInspection(matchingAsset);
    setActiveTab('new-inspection');
  };

  const handleInspectionSuccess = (record: InspectionRecord) => {
    showToast(`Inspection ${record.id} finalized and component reports generated for ${record.assetName}`);
    setSelectedInspectionForDetail(record);
    setActiveTab('inspections');
  };

  const handleAssetCreated = async (data: any) => {
    const created = await createAsset(data);
    showToast(`Conveyor asset ${created.id} registered`);
  };

  const handleMaintenanceUpdateSubmit = async (data: any) => {
    const res = await addMaintenanceUpdate(data);
    showToast(`Maintenance progress ${res.id} recorded for ${res.assetName}`);
  };

  const handleVerificationSubmit = async (updateId: string, verificationData: any) => {
    await verifyMaintenanceUpdate(updateId, verificationData);
    showToast(`Repair verified & certified by ${verificationData.verifiedBy}`);
  };

  return (
    <div className="flex h-screen bg-slate-100/70 overflow-hidden font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900 text-white text-xs rounded-lg shadow-xl border border-slate-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          if (tab === 'new-inspection') {
            setActiveDraftSession(null);
            setInspectionFormKey(`new-${Date.now()}`);
          }
          setActiveTab(tab);
        }}
        metrics={metrics}
        draftCount={draftInspections.length}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Viewport */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <Header
          activeTab={activeTab}
          onNewInspection={() => handleStartInspection()}
          currentUser={currentUser}
          syncStatus={syncStatus}
          isFirebaseConnected={isFirebaseConnected}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onShowToast={showToast}
        />

        {/* Dynamic Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'dashboard' && (
              <Dashboard
                metrics={metrics}
                assets={assets}
                inspections={inspections}
                draftInspections={draftInspections}
                onNavigateTab={setActiveTab}
                onSelectInspection={setSelectedInspectionForDetail}
                onSelectAssetToInspect={handleStartInspection}
                onResumeDraft={handleResumeDraft}
              />
            )}

            {activeTab === 'assets' && (
              <AssetList
                assets={assets}
                onCreateAsset={handleAssetCreated}
                onUpdateAsset={updateAsset}
                onToggleStatus={toggleAssetStatus}
                onInspectAsset={handleStartInspection}
              />
            )}

            {activeTab === 'inspections' && (
              <InspectionList
                inspections={inspections}
                draftInspections={draftInspections}
                componentReports={componentReports}
                onSelectInspection={setSelectedInspectionForDetail}
                onSelectComponentReport={(rep) => setSelectedComponentReportForDetail(rep)}
                onResumeDraft={handleResumeDraft}
                onCancelDraft={async (draft, reason) => {
                  await cancelDraftInspectionSession(draft, reason);
                  showToast(`Draft ${draft.id} cancelled.`);
                }}
                onNewInspection={() => handleStartInspection()}
              />
            )}

            {activeTab === 'new-inspection' && (
              <NewInspectionForm
                key={inspectionFormKey}
                assets={assets.filter((a) => a.status === 'active')}
                initialSelectedAsset={selectedAssetForInspection}
                initialDraftSession={activeDraftSession}
                currentUser={currentUser}
                nextInspectionId={
                  activeDraftSession?.id ||
                  generateNextInspectionId([...inspections, ...draftInspections])
                }
                onCreateDraftSession={createDraftInspectionSession}
                onSaveComponentDraft={saveComponentDraft}
                onFinalizeDraftSession={finalizeInspectionSession}
                onCancelDraftSession={cancelDraftInspectionSession}
                onCancel={() => {
                  setActiveDraftSession(null);
                  setActiveTab('inspections');
                }}
                onDraftCancelled={(sessionId) => {
                  setActiveDraftSession(null);
                  showToast(`Draft ${sessionId} cancelled.`);
                  setActiveTab('inspections');
                }}
                onSuccess={handleInspectionSuccess}
              />
            )}
          </div>
        </main>
      </div>

      {/* Inspection Detail Modal (Consolidated Session Package) */}
      <InspectionDetailModal
        inspection={selectedInspectionForDetail}
        componentReports={componentReports}
        maintenanceUpdates={maintenanceUpdates}
        photoAuditEvents={photoAuditEvents}
        currentUser={currentUser}
        onClose={() => setSelectedInspectionForDetail(null)}
        onSelectComponentReport={(rep) => setSelectedComponentReportForDetail(rep)}
        onClassifyLegacyPhoto={async (photoId, sessionId, target) => {
          await classifyLegacyPhoto(photoId, sessionId, target);
          showToast('Photo classification updated and audited.');
        }}
        onOpenMaintenanceModal={(insp) => {
          setInspectionForMaintenanceUpdate(insp);
          setMaintenanceComponentTarget(null);
        }}
        onOpenVerifyModal={(insp, update) => setVerificationTarget({ inspection: insp, update })}
      />

      {/* Component Report Detail Modal (Independent Lifecycle View) */}
      <ComponentReportDetailModal
        report={selectedComponentReportForDetail}
        parentSession={inspections.find((i) => i.id === selectedComponentReportForDetail?.sessionId)}
        maintenanceUpdates={maintenanceUpdates}
        currentUser={currentUser}
        onClose={() => setSelectedComponentReportForDetail(null)}
        onOpenMaintenanceModal={(insp, compRep) => {
          setInspectionForMaintenanceUpdate(insp);
          setMaintenanceComponentTarget({
            componentName: compRep.componentName,
            componentReportId: compRep.id,
          });
        }}
        onOpenVerifyModal={(insp, update) => {
          setVerificationTarget({ inspection: insp, update });
        }}
      />

      {/* Corrective Maintenance Progress Form Modal */}
      {inspectionForMaintenanceUpdate && (
        <MaintenanceUpdateModal
          inspection={inspectionForMaintenanceUpdate}
          initialComponentName={maintenanceComponentTarget?.componentName}
          initialComponentReportId={maintenanceComponentTarget?.componentReportId}
          currentUser={currentUser}
          onClose={() => {
            setInspectionForMaintenanceUpdate(null);
            setMaintenanceComponentTarget(null);
          }}
          onSubmit={handleMaintenanceUpdateSubmit}
        />
      )}

      {/* Supervisor Verification Sign-off Modal */}
      {verificationTarget && (
        <VerifyMaintenanceModal
          inspection={verificationTarget.inspection}
          maintenanceUpdate={verificationTarget.update}
          currentUser={currentUser}
          onClose={() => setVerificationTarget(null)}
          onVerify={handleVerificationSubmit}
        />
      )}
    </div>
  );
}
