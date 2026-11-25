/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  LayoutDashboard, 
  Layers, 
  ClipboardCheck, 
  FilePlus, 
  AlertTriangle,
  Activity,
  X
} from 'lucide-react';
import { DashboardMetrics } from '../types/conveyor';

interface SidebarProps {
  activeTab: 'dashboard' | 'assets' | 'inspections' | 'new-inspection';
  onSelectTab: (tab: 'dashboard' | 'assets' | 'inspections' | 'new-inspection') => void;
  metrics: DashboardMetrics;
  draftCount?: number;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  metrics,
  draftCount = 0,
  isMobileOpen,
  onCloseMobile,
}) => {
  const navItems = [
    {
      id: 'dashboard' as const,
      label: 'Plant Overview',
      icon: LayoutDashboard,
      badge: metrics.damagedComponents > 0 ? `${metrics.damagedComponents} alerts` : undefined,
      badgeColor: 'text-amber-700 bg-amber-50 border-amber-200',
    },
    {
      id: 'assets' as const,
      label: 'Asset Management',
      icon: Layers,
      counter: metrics.totalAssets,
    },
    {
      id: 'inspections' as const,
      label: 'Inspection Records',
      icon: ClipboardCheck,
      counter: metrics.totalInspections,
      badge: draftCount > 0 ? `${draftCount} draft${draftCount > 1 ? 's' : ''}` : undefined,
    },
    {
      id: 'new-inspection' as const,
      label: 'New Field Inspection',
      icon: FilePlus,
    },
  ];

  const handleNavClick = (tab: 'dashboard' | 'assets' | 'inspections' | 'new-inspection') => {
    onSelectTab(tab);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden backdrop-blur-xs transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-40 w-64 bg-slate-900 text-slate-200 flex flex-col justify-between border-r border-slate-800 transition-transform duration-200 ease-in-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div>
          <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-blue-700 flex items-center justify-center text-white shadow-xs">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <div className="font-display font-bold text-sm text-white tracking-tight leading-none">
                  CONVEYOR TRACKER
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  INDUSTRIAL CMMS
                </div>
              </div>
            </div>

            <button
              onClick={onCloseMobile}
              className="lg:hidden p-1 text-slate-400 hover:text-white rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            <div className="px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
              Core Modules
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-xs font-medium transition-colors text-left ${
                    isActive
                      ? 'bg-blue-800 text-white font-semibold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {item.badge}
                    </span>
                  )}
                  {item.counter !== undefined && (
                    <span className="text-[11px] text-slate-400 font-mono">
                      {item.counter}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Plant Status Footprint Widget */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-slate-400 font-mono">Plant System Health</span>
            <span className={`font-mono text-xs font-semibold ${
              metrics.damagedComponents > 0 ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              {metrics.damagedComponents > 0 ? 'ATTENTION REQUIRED' : 'NOMINAL'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 bg-slate-800/80 rounded border border-slate-700/60">
              <div className="text-[10px] text-slate-400 font-mono">ACTIVE BELTS</div>
              <div className="text-base font-bold text-white font-mono mt-0.5">
                {metrics.activeAssets} <span className="text-[11px] font-normal text-slate-400">/ {metrics.totalAssets}</span>
              </div>
            </div>

            <div className={`p-2 rounded border ${
              metrics.damagedComponents > 0 
                ? 'bg-amber-950/40 border-amber-700/60 text-amber-300' 
                : 'bg-slate-800/80 border-slate-700/60 text-slate-300'
            }`}>
              <div className="text-[10px] text-slate-400 font-mono">DAMAGED</div>
              <div className="text-base font-bold font-mono mt-0.5 flex items-center gap-1">
                {metrics.damagedComponents}
                {metrics.damagedComponents > 0 && (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 text-[10px] text-slate-400 font-mono text-center">
            Conveyor Tracker v1.0 · PWA Ready
          </div>
        </div>
      </aside>
    </>
  );
};
