/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  X, 
  Wrench, 
  Camera, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw
} from 'lucide-react';
import { 
  InspectionRecord, 
  MaintenanceActivityType, 
  MaintenanceProgressStatus, 
  ConveyorCondition, 
  PartReplacedItem, 
  InspectionPhoto,
  PhotoCategory,
  toComponentSlug
} from '../types/conveyor';
import {
  DEFAULT_WORKSPACE_ID,
  buildPhotoStoragePath,
  compressImageFile,
  uploadBlobToFirebaseStorage,
} from '../services/photoStorage';

interface MaintenanceUpdateModalProps {
  inspection: InspectionRecord;
  initialComponentName?: string;
  initialComponentReportId?: string;
  currentUser: any;
  onClose: () => void;
  onSubmit: (data: any) => Promise<any>;
}

const ACTIVITY_TYPES: MaintenanceActivityType[] = [
  'Emergency Patch / Cold Vulcanizing',
  'Hot Splicing & Carcass Repair',
  'Idler Roll Replacement',
  'Pulley Lagging Re-Tiling',
  'Mechanical Belt Realignment',
  'Belt Tension & Counterweight Adjustment',
  'Primary Scraper Blade Replacement',
  'Skirtboard Rubber Re-sealing',
  'Motor & Gearbox Servicing',
  'Carryback Cleaning & Spillage Overhaul',
  'Initial Assessment',
  'Post-Repair Certification Verification',
];

export const MaintenanceUpdateModal: React.FC<MaintenanceUpdateModalProps> = ({
  inspection,
  initialComponentName,
  initialComponentReportId,
  currentUser,
  onClose,
  onSubmit,
}) => {
  const [componentName, setComponentName] = useState<string>(
    initialComponentName || Object.keys(inspection.components || {})[0] || 'Conveyor Belt Carcass'
  );
  const [activityType, setActivityType] = useState<MaintenanceActivityType>(
    'Emergency Patch / Cold Vulcanizing'
  );
  const [workDescription, setWorkDescription] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [currentCondition, setCurrentCondition] = useState<ConveyorCondition>(
    inspection.overallCondition === 'damaged' ? 'fair' : 'good'
  );
  const [progressStatus, setProgressStatus] = useState<MaintenanceProgressStatus>('in_progress');
  const [laborHours, setLaborHours] = useState<number>(2.0);
  const [technicianName, setTechnicianName] = useState(
    currentUser?.displayName || 'Maintenance Technician'
  );
  const [technicianOrg, setTechnicianOrg] = useState(
    'Apex Conveyor Maintenance Services'
  );
  const [parts, setParts] = useState<PartReplacedItem[]>([
    { partNumber: '', description: '', quantity: 1 },
  ]);
  const [photos, setPhotos] = useState<InspectionPhoto[]>([]);
  const [photoStage, setPhotoStage] = useState<'MAINTENANCE_BEFORE' | 'MAINTENANCE_DURING' | 'MAINTENANCE_AFTER'>('MAINTENANCE_DURING');
  const [newPhotoCaption, setNewPhotoCaption] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const photoBlobsRef = React.useRef<Record<string, { blob: Blob; contentType: string }>>({});

  const handleAddPart = () => {
    setParts((prev) => [...prev, { partNumber: '', description: '', quantity: 1 }]);
  };

  const handleRemovePart = (index: number) => {
    setParts((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePartChange = (index: number, field: keyof PartReplacedItem, val: any) => {
    setParts((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: val } : item))
    );
  };

  const uploadMaintPhoto = async (photo: InspectionPhoto, blob: Blob, contentType: string) => {
    if (!currentUser) {
      setPhotos((prev) =>
        prev.map((p) => (p.id === photo.id ? { ...p, uploadStatus: 'uploaded', uploadProgress: 100 } : p))
      );
      return;
    }
    try {
      const res = await uploadBlobToFirebaseStorage({
        blob,
        storagePath: photo.storagePath!,
        contentType,
        onProgress: (pct) => {
          setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, uploadProgress: pct } : p)));
        },
      });
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photo.id
            ? { ...p, url: res.downloadUrl, storagePath: res.storagePath, uploadStatus: 'uploaded', uploadProgress: 100, uploadError: undefined }
            : p
        )
      );
    } catch (err: any) {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photo.id
            ? { ...p, uploadStatus: 'failed', uploadError: err?.message || 'Upload failed' }
            : p
        )
      );
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      const photoId = `m-photo-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const stageCategory: PhotoCategory = photoStage;
      const storagePath = buildPhotoStoragePath({
        workspaceId: DEFAULT_WORKSPACE_ID,
        sessionId: inspection.id,
        componentName,
        photoId,
        category: stageCategory,
        maintenanceUpdateId: initialComponentReportId || 'maint',
      });

      try {
        const compressed = await compressImageFile(file);
        photoBlobsRef.current[photoId] = { blob: compressed.blob, contentType: compressed.contentType };
        const newPhoto: InspectionPhoto = {
          id: photoId,
          photoId,
          url: compressed.previewUrl,
          caption: newPhotoCaption.trim() || `${stageCategory.replace('MAINTENANCE_', '')} — ${componentName}`,
          timestamp: new Date().toISOString(),
          workspaceId: DEFAULT_WORKSPACE_ID,
          inspectionSessionId: inspection.id,
          componentReportId: initialComponentReportId,
          assetId: inspection.assetId,
          componentName,
          componentId: toComponentSlug(componentName),
          photoCategory: stageCategory,
          classificationStatus: 'assigned',
          storagePath,
          originalFilename: compressed.originalFilename,
          contentType: compressed.contentType,
          fileSize: compressed.fileSize,
          uploadedBy: technicianName.trim(),
          uploadedById: currentUser?.uid || 'tech-field',
          uploadStatus: 'uploading',
          uploadProgress: 10,
        };
        setPhotos((prev) => [...prev, newPhoto]);
        setNewPhotoCaption('');
        void uploadMaintPhoto(newPhoto, compressed.blob, compressed.contentType);
      } catch (err: any) {
        setErrorMessage(err?.message || 'Failed to compress maintenance photo.');
      }
    }
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workDescription.trim()) {
      setErrorMessage('Please describe the work performed during this maintenance session.');
      return;
    }
    if (!actionTaken.trim()) {
      setErrorMessage('Please specify the concrete action taken.');
      return;
    }
    if (photos.some((p) => p.uploadStatus === 'uploading')) {
      setErrorMessage('Please wait for maintenance photo uploads to complete.');
      return;
    }
    if (photos.some((p) => p.uploadStatus === 'failed')) {
      setErrorMessage('One or more maintenance photo uploads failed. Please retry or remove failed photos.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const validParts = parts.filter((p) => p.description.trim() || p.partNumber.trim());

    try {
      await onSubmit({
        inspectionId: inspection.id,
        componentReportId: initialComponentReportId,
        assetId: inspection.assetId,
        assetName: inspection.assetName,
        componentName,
        initialInspectionCondition: inspection.overallCondition,
        activityType,
        workDescription: workDescription.trim(),
        actionTaken: actionTaken.trim(),
        currentCondition,
        progressStatus,
        partsReplaced: validParts,
        laborHours: Number(laborHours) || 0,
        technicianName: technicianName.trim(),
        technicianOrg: technicianOrg.trim(),
        technicianId: currentUser?.uid || 'tech-field',
        evidencePhotos: photos,
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Failed to submit maintenance progress update.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-2xl w-full my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-blue-900 text-white flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-mono text-slate-500">
                CORRECTIVE MAINTENANCE UPDATE · REF #{inspection.id}
              </div>
              <h2 className="text-base font-bold font-display text-slate-900">
                Log Maintenance Progress: {inspection.assetName}
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

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-800 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Immutable Reference Banner */}
          <div className="p-3 bg-slate-50 rounded border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-slate-500 font-mono text-[11px] block">ORIGINAL AUDIT FINDING (IMMUTABLE)</span>
              <span className="font-semibold text-slate-800">
                Logged as {inspection.overallCondition.toUpperCase()} on{' '}
                {new Date(inspection.inspectionDate).toLocaleDateString()}
              </span>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 uppercase">
              {inspection.overallCondition}
            </span>
          </div>

          {/* Component & Activity Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Target Component Under Repair
              </label>
              <select
                value={componentName}
                onChange={(e) => setComponentName(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-900"
              >
                {Object.keys(inspection.components || {}).map((c) => (
                  <option key={c} value={c}>
                    {c} (Audit: {inspection.components[c]})
                  </option>
                ))}
                <option value="Conveyor Belt Carcass">Conveyor Belt Carcass</option>
                <option value="Head Drive Pulley Lagging">Head Drive Pulley Lagging</option>
                <option value="Return / Carrying Idler">Return / Carrying Idler</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Maintenance Activity Type
              </label>
              <select
                value={activityType}
                onChange={(e) => setActivityType(e.target.value as MaintenanceActivityType)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-900"
              >
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Work Description & Concrete Action Taken */}
          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Work Performed & Diagnostic Observations
              </label>
              <textarea
                rows={2}
                value={workDescription}
                onChange={(e) => setWorkDescription(e.target.value)}
                placeholder="e.g. Cleaned and prepared buffed rubber around carcass laceration. Applied primer and heavy diamond cold patch..."
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-900"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Action Taken Summary
              </label>
              <input
                type="text"
                value={actionTaken}
                onChange={(e) => setActionTaken(e.target.value)}
                placeholder="e.g. Applied cold vulcanizing repair patch and torqued scraper brackets"
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-900"
                required
              />
            </div>
          </div>

          {/* Current Condition & Progress Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded border border-slate-200">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Reported Mechanical Condition Now
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['good', 'fair', 'worn', 'damaged'] as ConveyorCondition[]).map((cond) => (
                  <label
                    key={cond}
                    className={`flex items-center gap-1.5 p-1.5 rounded border text-xs cursor-pointer capitalize font-mono ${
                      currentCondition === cond
                        ? 'bg-blue-900 text-white border-blue-900 font-bold'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="maintCondition"
                      value={cond}
                      checked={currentCondition === cond}
                      onChange={() => setCurrentCondition(cond)}
                      className="sr-only"
                    />
                    <span>{cond}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Maintenance Lifecycle Status
              </label>
              <select
                value={progressStatus}
                onChange={(e) => setProgressStatus(e.target.value as MaintenanceProgressStatus)}
                className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-900"
              >
                <option value="diagnosing">Diagnosing & Assessing Damage</option>
                <option value="parts_pending">Awaiting Replacement Parts</option>
                <option value="in_progress">In Progress (Mechanical Work)</option>
                <option value="completed_pending_verification">
                  Work Completed (Awaiting Supervisor Sign-off)
                </option>
                <option value="verified_closed">Verified & Closed</option>
              </select>
            </div>
          </div>

          {/* Parts Replaced Dynamic List */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-semibold text-slate-700">Parts Replaced / Installed</label>
              <button
                type="button"
                onClick={handleAddPart}
                className="text-[11px] font-semibold text-blue-900 hover:text-blue-700 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>Add Item</span>
              </button>
            </div>

            <div className="space-y-1.5">
              {parts.map((p, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Part # (e.g. IDL-900-E)"
                    value={p.partNumber}
                    onChange={(e) => handlePartChange(idx, 'partNumber', e.target.value)}
                    className="w-32 px-2 py-1 bg-white border border-slate-300 rounded text-slate-800 font-mono text-[11px]"
                  />
                  <input
                    type="text"
                    placeholder="Description (e.g. Return Roll CEMA E)"
                    value={p.description}
                    onChange={(e) => handlePartChange(idx, 'description', e.target.value)}
                    className="flex-1 px-2 py-1 bg-white border border-slate-300 rounded text-slate-800 text-[11px]"
                  />
                  <input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={p.quantity}
                    onChange={(e) => handlePartChange(idx, 'quantity', parseInt(e.target.value) || 1)}
                    className="w-16 px-2 py-1 bg-white border border-slate-300 rounded text-slate-800 font-mono text-[11px]"
                  />
                  {parts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemovePart(idx)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Labor & Technician Attribution */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-200">
            <div>
              <label className="block font-medium text-slate-600 mb-1">Labor (Hours)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={laborHours}
                onChange={(e) => setLaborHours(parseFloat(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-800 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">Technician Name</label>
              <input
                type="text"
                value={technicianName}
                onChange={(e) => setTechnicianName(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-800"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">Service Organization</label>
              <input
                type="text"
                value={technicianOrg}
                onChange={(e) => setTechnicianOrg(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-800"
              />
            </div>
          </div>

          {/* Photo Evidence Upload with Stage Selector */}
          <div className="pt-2 border-t border-slate-200 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-blue-900" />
                <span>Maintenance Work Photo Evidence</span>
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={photoStage}
                  onChange={(e) => setPhotoStage(e.target.value as any)}
                  className="px-2 py-1 text-[11px] bg-white border border-slate-300 rounded text-slate-800"
                >
                  <option value="MAINTENANCE_BEFORE">Before Repair</option>
                  <option value="MAINTENANCE_DURING">During Repair</option>
                  <option value="MAINTENANCE_AFTER">After Repair</option>
                </select>
                <label className="text-[11px] font-semibold text-blue-900 hover:text-blue-700 cursor-pointer flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded">
                  <Plus className="w-3 h-3" />
                  <span>Upload Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => void handlePhotoUpload(e)}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            {photos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 mt-2">
                {photos.map((p, idx) => (
                  <div key={p.id || idx} className="relative group rounded border border-slate-200 overflow-hidden aspect-4/3 bg-slate-100">
                    <img src={p.url} alt="Repair evidence" className="w-full h-full object-cover" />
                    {p.uploadStatus === 'failed' && (
                      <div className="absolute inset-0 bg-rose-950/85 flex flex-col items-center justify-center p-1">
                        <button
                          type="button"
                          onClick={() => {
                            const buf = photoBlobsRef.current[p.id];
                            if (buf) void uploadMaintPhoto(p, buf.blob, buf.contentType);
                          }}
                          className="px-2 py-0.5 bg-white text-rose-900 rounded text-[10px] font-bold flex items-center gap-1"
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                          <span>Retry</span>
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        delete photoBlobsRef.current[p.id];
                        setPhotos((prev) => prev.filter((_, i) => i !== idx));
                      }}
                      className="absolute top-1 right-1 p-1 bg-slate-900/70 text-white rounded hover:bg-rose-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <div className="absolute bottom-0 inset-x-0 bg-slate-900/80 px-1 py-0.5 text-[9px] text-white truncate font-mono">
                      {p.photoCategory?.replace('MAINTENANCE_', '')}: {p.caption}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 italic">No repair progress photos attached yet.</p>
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
              className="px-4 py-1.5 font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded shadow-xs flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Submitting...' : 'Save Maintenance Update'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
