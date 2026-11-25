/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Layers, Save, AlertCircle } from 'lucide-react';
import { ConveyorAsset, ConveyorType } from '../types/conveyor';

interface AssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (assetData: {
    name: string;
    location: string;
    type: ConveyorType;
    beltWidthMm: number;
    lengthMeters: number;
    speedMps: number;
    status: 'active' | 'deactivated';
  }) => Promise<void>;
  editAsset?: ConveyorAsset | null;
  nextAutoId: string;
}

export const AssetModal: React.FC<AssetModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editAsset,
  nextAutoId,
}) => {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState<ConveyorType>('Belt');
  const [beltWidthMm, setBeltWidthMm] = useState<number>(1200);
  const [lengthMeters, setLengthMeters] = useState<number>(100);
  const [speedMps, setSpeedMps] = useState<number>(2.5);
  const [status, setStatus] = useState<'active' | 'deactivated'>('active');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editAsset) {
      setName(editAsset.name);
      setLocation(editAsset.location);
      setType(editAsset.type);
      setBeltWidthMm(editAsset.beltWidthMm);
      setLengthMeters(editAsset.lengthMeters);
      setSpeedMps(editAsset.speedMps);
      setStatus(editAsset.status);
    } else {
      setName('');
      setLocation('');
      setType('Belt');
      setBeltWidthMm(1200);
      setLengthMeters(100);
      setSpeedMps(2.5);
      setStatus('active');
    }
    setError(null);
  }, [editAsset, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a conveyor name or tag');
      return;
    }
    if (!location.trim()) {
      setError('Please specify the plant location/bay');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onSave({
        name: name.trim(),
        location: location.trim(),
        type,
        beltWidthMm: Number(beltWidthMm) || 1000,
        lengthMeters: Number(lengthMeters) || 50,
        speedMps: Number(speedMps) || 2.0,
        status,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save conveyor asset');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-blue-900 text-white flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-display text-slate-900">
                {editAsset ? `Edit Conveyor ${editAsset.id}` : 'Register New Conveyor Asset'}
              </h3>
              <div className="text-xs text-slate-500 font-mono">
                Asset ID: <span className="font-bold text-slate-900">{editAsset ? editAsset.id : nextAutoId}</span> (Auto-Generated)
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Asset ID info callout */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs flex items-center justify-between">
            <span className="text-slate-600">Sequential System ID:</span>
            <span className="font-mono font-bold text-blue-950 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              {editAsset ? editAsset.id : nextAutoId}
            </span>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Conveyor Line Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Overland Stacker Feed Conveyor 4"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 text-slate-900"
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Plant Location / Section *
            </label>
            <input
              type="text"
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Secondary Crusher - Tower 2B"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 text-slate-900"
            />
          </div>

          {/* Type & Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Conveyor Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ConveyorType)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 text-slate-900 bg-white"
              >
                <option value="Belt">Belt Conveyor</option>
                <option value="Roller">Roller Conveyor</option>
                <option value="Screw">Screw Feeder</option>
                <option value="Overhead">Overhead Trolley</option>
                <option value="Chain Feeder">Chain Feeder</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Operational Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'deactivated')}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 text-slate-900 bg-white"
              >
                <option value="active">Active (In Service)</option>
                <option value="deactivated">Deactivated (Standby / Retired)</option>
              </select>
            </div>
          </div>

          {/* Mechanical Specs: Belt Width, Length, Speed */}
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Belt Width (mm)
              </label>
              <input
                type="number"
                min="300"
                max="3000"
                step="50"
                value={beltWidthMm}
                onChange={(e) => setBeltWidthMm(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Length (m)
              </label>
              <input
                type="number"
                min="5"
                max="5000"
                step="5"
                value={lengthMeters}
                onChange={(e) => setLengthMeters(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Speed (m/s)
              </label>
              <input
                type="number"
                min="0.1"
                max="10.0"
                step="0.1"
                value={speedMps}
                onChange={(e) => setSpeedMps(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 text-slate-900"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 active:bg-blue-950 rounded-md shadow-xs transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Saving...' : editAsset ? 'Update Asset' : 'Save Asset'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
