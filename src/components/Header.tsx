/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Plus, 
  Database, 
  CloudCheck, 
  CloudOff, 
  User as UserIcon, 
  LogIn, 
  LogOut,
  Menu
} from 'lucide-react';
import { User } from 'firebase/auth';
import { loginWithGoogle, logoutUser } from '../services/firebase';

interface HeaderProps {
  activeTab: 'dashboard' | 'assets' | 'inspections' | 'new-inspection';
  onNewInspection: () => void;
  currentUser: User | null;
  syncStatus: 'synced' | 'syncing' | 'offline' | 'error';
  isFirebaseConnected: boolean;
  onOpenMobileMenu: () => void;
  onShowToast?: (text: string, type?: 'success' | 'info') => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onNewInspection,
  currentUser,
  syncStatus,
  isFirebaseConnected,
  onOpenMobileMenu,
  onShowToast,
}) => {
  const getBreadcrumbTitle = () => {
    switch (activeTab) {
      case 'dashboard':
        return 'Overview & Plant Health';
      case 'assets':
        return 'Conveyor Asset Registry';
      case 'inspections':
        return 'Historical Inspection Logs';
      case 'new-inspection':
        return 'Log New Field Inspection';
      default:
        return 'Operations';
    }
  };

  const handleAuthClick = async () => {
    if (currentUser) {
      try {
        await logoutUser();
        onShowToast?.('Signed out successfully', 'info');
      } catch (err) {
        console.warn('Sign out error:', err);
      }
    } else {
      try {
        const user = await loginWithGoogle();
        if (user) {
          onShowToast?.(`Signed in as ${user.displayName || user.email}`, 'success');
        }
      } catch (err: any) {
        if (err?.message) {
          onShowToast?.(err.message, 'info');
        }
      }
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
      {/* Zone 1: Mobile menu toggle & Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 truncate">
          <span className="font-medium text-slate-800">Conveyor Inspection Tracker</span>
          <span aria-hidden="true" className="text-slate-300">/</span>
          <span className="text-slate-600 font-medium truncate">{getBreadcrumbTitle()}</span>
        </div>
      </div>

      {/* Zone 2 & 3: Cloud Sync Indicator, User Auth & Primary CTA */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Sync Status Info */}
        <div 
          className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 font-mono"
          title={isFirebaseConnected ? "Connected to Firestore Database" : "Using offline local storage cache"}
        >
          {syncStatus === 'synced' ? (
            <span className="flex items-center gap-1 text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              <span>Cloud Synced</span>
            </span>
          ) : syncStatus === 'syncing' ? (
            <span className="flex items-center gap-1 text-amber-600">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
              <span>Syncing...</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <span>Local Ready</span>
            </span>
          )}
        </div>

        {/* User Auth Chip */}
        <button
          onClick={handleAuthClick}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md transition-colors whitespace-nowrap"
          title={currentUser ? `Signed in as ${currentUser.displayName || currentUser.email}` : "Sign in with Google"}
        >
          {currentUser ? (
            <>
              {currentUser.photoURL ? (
                <img 
                  src={currentUser.photoURL} 
                  alt={currentUser.displayName || 'Inspector'} 
                  className="w-4 h-4 rounded-full object-cover"
                />
              ) : (
                <UserIcon className="w-3.5 h-3.5 text-slate-600" />
              )}
              <span className="max-w-[120px] truncate">{currentUser.displayName?.split(' ')[0] || 'Inspector'}</span>
              <LogOut className="w-3 h-3 text-slate-400 ml-0.5" />
            </>
          ) : (
            <>
              <LogIn className="w-3.5 h-3.5 text-slate-500" />
              <span>Inspector Sign In</span>
            </>
          )}
        </button>

        {/* Primary CTA */}
        {activeTab !== 'new-inspection' && (
          <button
            onClick={onNewInspection}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 active:bg-blue-950 rounded-md shadow-xs transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>New Inspection</span>
          </button>
        )}
      </div>
    </header>
  );
};
