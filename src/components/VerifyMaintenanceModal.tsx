/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  X, 
  ShieldCheck, 
  AlertTriangle, 
  FileCheck2,
  Camera,
  Plus
} from 'lucide-react';
import { 
  InspectionRecord, 
  MaintenanceProgressUpdate, 
  ConveyorCondition, 
  MaintenanceVerification,
  InspectionPhoto,
  toComponentSlug
} from '../types/conveyor';
import {
  DEFAULT_WORKSPACE_ID,
  buildPhotoStoragePath,
  compressImageFile,
  uploadBlobToFirebaseStorage,
} from '../services/photoStorage';

interface VerifyMaintenanceModalProps {
  inspection: InspectionRecord;
  maintenanceUpdate: MaintenanceProgressUpdate;
  currentUser: any;
  onClose: () => void;
  onVerify: (updateId: string, data: MaintenanceVerification) => Promise<any>;
}

export const VerifyMaintenanceModal: React.FC<VerifyMaintenanceModalProps> = ({
  inspection,
  maintenanceUpdate,
  currentUser,
  onClose,
  onVerify,
}) => {
  const [verifiedCondition, setVerifiedCondition] = useState<ConveyorCondition>(
    maintenanceUpdate.currentCondition || 'good'
  );
  const [verificationNotes, setVerificationNotes] = useState('');
  const [supervisorName, setSupervisorName] = useState(
    currentUser?.displayName || 'Lead Mechanical Supervisor'
  );
  const [verificationPhotos, setVerificationPhotos] = useState<InspectionPhoto[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleUploadVerificationPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      const photoId = `v-photo-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const storagePath = buildPhotoStoragePath({
        workspaceId: DEFAULT_WORKSPACE_ID,
        sessionId: inspection.id,
        componentName: maintenanceUpdate.componentName,
        photoId,
        category: 'VERIFICATION',
        maintenanceUpdateId: maintenanceUpdate.id,
      });
      try {
        const compressed = await compressImageFile(file);
        const photo: InspectionPhoto = {
          id: photoId,
          photoId,
          url: compressed.previewUrl,
          caption: `Verification — ${maintenanceUpdate.componentName}`,
          timestamp: new Date().toISOString(),
          workspaceId: DEFAULT_WORKSPACE_ID,
          inspectionSessionId: inspection.id,
          componentReportId: maintenanceUpdate.componentReportId,
          maintenanceUpdateId: maintenanceUpdate.id,
          verificationId: maintenanceUpdate.id,
          assetId: inspection.assetId,
          componentName: maintenanceUpdate.componentName,
          componentId: toComponentSlug(maintenanceUpdate.componentName),
          photoCategory: 'VERIFICATION',
          classificationStatus: 'assigned',
          storagePath,
          originalFilename: compressed.originalFilename,
          contentType: compressed.contentType,
          fileSize: compressed.fileSize,
          uploadedBy: supervisorName.trim(),
          uploadedById: currentUser?.uid || 'sup-eng-01',
          uploadStatus: currentUser ? 'uploading' : 'uploaded',
        };
        setVerificationPhotos((prev) => [...prev, photo]);

        if (currentUser) {
          try {
            const res = await uploadBlobToFirebaseStorage({
              blob: compressed.blob,
              storagePath,
              contentType: compressed.contentType,
            });
            setVerificationPhotos((prev) =>
              prev.map((p) => (p.id === photoId ? { ...p, url: res.downloadUrl, uploadStatus: 'uploaded' } : p))
            );
          } catch (err: any) {
            setVerificationPhotos((prev) =>
              prev.map((p) => (p.id === photoId ? { ...p, uploadStatus: 'failed', uploadError: err?.message } : p))
            );
          }
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'Failed to process verification photo.');
      }
    }
    e.target.value = '';
  };

  const handleConfirmVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationNotes.trim()) {
      setErrorMessage('Please provide verification sign-off notes (e.g. results of operational test run).');
      return;
    }
    if (verificationPhotos.some((p) => p.uploadStatus === 'uploading')) {
      setErrorMessage('Please wait for verification photo uploads to complete.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const verificationPayload: MaintenanceVerification = {
        isVerified: true,
        verifiedBy: supervisorName.trim(),
        verifiedById: currentUser?.uid || 'sup-eng-01',
        verifiedAt: new Date().toISOString(),
        verifiedCondition,
        verificationNotes: verificationNotes.trim(),
        verificationPhotos: verificationPhotos.length > 0 ? verificationPhotos : undefined,
      };

      await onVerify(maintenanceUpdate.id, verificationPayload);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Failed to complete supervisor certification.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-65 flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-xl w-full my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-emerald-50/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-emerald-600 text-white flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-mono text-emerald-800 font-semibold">
                FORMAL CERTIFICATION & RECERTIFICATION
              </div>
              <h2 className="text-base font-bold font-display text-slate-900">
                Certify & Verify Corrective Repair
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleConfirmVerification} className="p-5 sm:p-6 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Dual Invariant Comparison Box */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-mono text-[11px]">IMMUTABLE ORIGINAL FINDING</span>
              <span className="font-mono text-rose-700 font-bold uppercase bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-[10px]">
                {inspection.overallCondition}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-mono text-[11px]">TECHNICIAN REPORTED CONDITION</span>
              <span className="font-mono text-blue-700 font-bold uppercase bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-[10px]">
                {maintenanceUpdate.currentCondition}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-200 text-slate-600">
              <p className="line-clamp-2 italic">
                "{maintenanceUpdate.actionTaken}"
              </p>
              <div className="text-[11px] text-slate-400 font-mono mt-1">
                Performed by {maintenanceUpdate.technicianName} ({maintenanceUpdate.technicianOrg})
              </div>
            </div>
          </div>

          {/* Final Certified Condition Choice */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-semibold text-slate-800">
                Supervisor Certified Operational Condition
              </label>
              <span className="text-[11px] font-mono text-slate-500">
                Target: <strong>{maintenanceUpdate.componentName}</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['good', 'fair', 'worn', 'damaged'] as ConveyorCondition[]).map((c) => {
                const isSelected = verifiedCondition === c;
                let activeStyle = 'bg-emerald-700 text-white border-emerald-700 font-bold shadow-xs';
                if (c === 'fair') activeStyle = 'bg-blue-700 text-white border-blue-700 font-bold shadow-xs';
                if (c === 'worn') activeStyle = 'bg-amber-600 text-white border-amber-600 font-bold shadow-xs';
                if (c === 'damaged') activeStyle = 'bg-rose-700 text-white border-rose-700 font-bold shadow-xs';

                return (
                  <label
                    key={c}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-md border text-xs cursor-pointer capitalize font-mono transition-colors ${
                      isSelected
                        ? activeStyle
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="certCondition"
                      value={c}
                      checked={isSelected}
                      onChange={() => setVerifiedCondition(c)}
                      className="sr-only"
                    />
                    <span>{c.toUpperCase()}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              Certification will update the current condition of <strong>{maintenanceUpdate.componentName}</strong> to <strong className="font-mono text-slate-900">{verifiedCondition.toUpperCase()}</strong>. The original audit finding (<strong className="font-mono text-rose-700">{inspection.overallCondition.toUpperCase()}</strong>) remains permanently immutable in the audit trail.
            </p>
          </div>

          {/* Verification Notes */}
          <div>
            <label className="block font-semibold text-slate-800 mb-1">
              Supervisor Verification & Live Test Run Notes
            </label>
            <textarea
              rows={3}
              value={verificationNotes}
              onChange={(e) => setVerificationNotes(e.target.value)}
              placeholder="e.g. Conducted 30-minute unloaded belt test run followed by full load ore test. Cold patch bonded securely with zero edge curling. Belt tracking centered."
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              required
            />
          </div>

          {/* Supervisor Identity */}
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Authorizing Supervisor Name & Role
            </label>
            <input
              type="text"
              value={supervisorName}
              onChange={(e) => setSupervisorName(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-800"
              required
            />
          </div>

          {/* Optional Verification Evidence Photo */}
          <div className="pt-2 border-t border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-emerald-700" />
                <span>Optional Verification Photo Evidence</span>
              </label>
              <label className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-900 cursor-pointer flex items-center gap-1 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded">
                <Plus className="w-3 h-3" />
                <span>Attach Verification Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => void handleUploadVerificationPhoto(e)}
                  className="sr-only"
                />
              </label>
            </div>
            {verificationPhotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {verificationPhotos.map((vp, idx) => (
                  <div key={vp.id} className="relative rounded border border-emerald-200 overflow-hidden aspect-4/3 bg-slate-100">
                    <img src={vp.url} alt={vp.caption} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setVerificationPhotos((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 p-1 bg-slate-900/70 text-white rounded hover:bg-rose-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded shadow-xs flex items-center gap-1.5"
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Certifying...' : 'Certify & Close Repair'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
