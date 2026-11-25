/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit2, 
  Power, 
  Layers, 
  ArrowRight, 
  Activity, 
  CheckCircle2, 
  AlertTriangle,
  ClipboardList
} from 'lucide-react';
import { ConveyorAsset, ConveyorCondition, ConveyorType } from '../types/conveyor';
import { AssetModal } from './AssetModal';
import { generateNextAssetId } from '../services/store';

interface AssetListProps {
  assets: ConveyorAsset[];
  onCreateAsset: (data: any) => Promise<any>;
  onUpdateAsset: (id: string, updates: Partial<ConveyorAsset>) => Promise<void>;
  onToggleStatus: (id: string) => Promise<void>;
  onInspectAsset: (asset: ConveyorAsset) => void;
}

export const AssetList: React.FC<AssetListProps> = ({
  assets,
  onCreateAsset,
  onUpdateAsset,
  onToggleStatus,
  onInspectAsset,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'deactivated'>('all');
  const [conditionFilter, setConditionFilter] = useState<'all' | ConveyorCondition>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<ConveyorAsset | null>(null);

  // Filtered Assets
  const filteredAssets = assets.filter((asset) => {
    const matchesSearch =
      asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.location.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || asset.status === statusFilter;
    const matchesCondition = conditionFilter === 'all' || asset.currentCondition === conditionFilter;

    return matchesSearch && matchesStatus && matchesCondition;
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

  const handleEditClick = (asset: ConveyorAsset) => {
    setEditingAsset(asset);
    setIsModalOpen(true);
  };

  const handleCreateClick = () => {
    setEditingAsset(null);
    setIsModalOpen(true);
  };

  const handleSaveModal = async (data: any) => {
    if (editingAsset) {
      await onUpdateAsset(editingAsset.id, data);
    } else {
      await onCreateAsset(data);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Action & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold font-display text-slate-900 tracking-tight">
              Conveyor Asset Registry
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage mechanical specifications, operational status, and equipment records across all plant lines.
            </p>
          </div>

          <button
            onClick={handleCreateClick}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-md shadow-xs transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>New Conveyor Asset</span>
          </button>
        </div>

        {/* Filters and Search Row */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Asset ID (CV-...), name, or plant zone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 text-slate-900 bg-white"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            {/* Status Segmented Control */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 text-xs shrink-0">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Status
              </button>
              <button
                onClick={() => setStatusFilter('active')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  statusFilter === 'active'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Active Only
              </button>
              <button
                onClick={() => setStatusFilter('deactivated')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  statusFilter === 'deactivated'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Deactivated
              </button>
            </div>

            {/* Condition Dropdown Filter */}
            <select
              value={conditionFilter}
              onChange={(e) => setConditionFilter(e.target.value as any)}
              className="px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-900/20 shrink-0"
            >
              <option value="all">All Conditions</option>
              <option value="good">Good Condition</option>
              <option value="fair">Fair Condition</option>
              <option value="worn">Worn Condition</option>
              <option value="damaged">Damaged Condition</option>
            </select>
          </div>
        </div>
      </div>

      {/* Assets Table (Desktop) / Cards (Mobile) */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
        {filteredAssets.length === 0 ? (
          <div className="p-12 text-center">
            <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-slate-800">No conveyor assets match filters</h3>
            <p className="text-xs text-slate-500 mt-1">
              Try adjusting your search criteria or register a new conveyor line.
            </p>
            <button
              onClick={handleCreateClick}
              className="mt-3 px-3.5 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Asset</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-mono">
                  <th className="py-3 px-4 font-semibold">ASSET ID</th>
                  <th className="py-3 px-4 font-semibold">NAME & LOCATION</th>
                  <th className="py-3 px-4 font-semibold">TYPE</th>
                  <th className="py-3 px-4 font-semibold">SPECS (WIDTH/LEN/SPD)</th>
                  <th className="py-3 px-4 font-semibold">CONDITION</th>
                  <th className="py-3 px-4 font-semibold">STATUS</th>
                  <th className="py-3 px-4 font-semibold text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* ID */}
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {asset.id}
                    </td>

                    {/* Name & Location */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{asset.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">{asset.location}</div>
                    </td>

                    {/* Type */}
                    <td className="py-3.5 px-4 text-slate-600 font-medium whitespace-nowrap">
                      {asset.type}
                    </td>

                    {/* Specs */}
                    <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                      <span>{asset.beltWidthMm}mm</span>
                      <span className="text-slate-300 mx-1.5">·</span>
                      <span>{asset.lengthMeters}m</span>
                      <span className="text-slate-300 mx-1.5">·</span>
                      <span>{asset.speedMps}m/s</span>
                    </td>

                    {/* Condition */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${getConditionStyle(asset.currentCondition)}`}>
                        {asset.currentCondition}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <button
                        onClick={() => onToggleStatus(asset.id)}
                        className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded flex items-center gap-1.5 transition-colors ${
                          asset.status === 'active'
                            ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
                            : 'text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-300'
                        }`}
                        title="Click to toggle active / deactivated status"
                      >
                        <Power className="w-3 h-3" />
                        <span>{asset.status === 'active' ? 'ACTIVE' : 'DEACTIVATED'}</span>
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onInspectAsset(asset)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors flex items-center gap-1"
                          title="Record field inspection for this conveyor"
                        >
                          <ClipboardList className="w-3.5 h-3.5" />
                          <span>Inspect</span>
                        </button>

                        <button
                          onClick={() => handleEditClick(asset)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                          title="Edit specifications"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Asset Creation & Editing Drawer Modal */}
      <AssetModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveModal}
        editAsset={editingAsset}
        nextAutoId={generateNextAssetId(assets)}
      />
    </div>
  );
};
