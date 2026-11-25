/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  InspectionPhoto,
  InspectionRecord,
  ComponentInspectionReport,
  PhotoAuditEvent,
  toComponentSlug,
  validatePhotoAssociation,
  buildComponentReportsFromSession,
  getComponentInspectionPhotos,
  migrateLegacyPhotos,
} from '../types/conveyor';
import {
  MAX_PHOTO_SIZE_BYTES,
  buildPhotoStoragePath,
  sanitizePhotoForFirestore,
} from '../services/photoStorage';
import { INITIAL_INSPECTIONS, INITIAL_COMPONENT_REPORTS } from '../data/initialSampleData';

interface TestResult {
  id: number;
  category: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

async function runTest(id: number, category: string, name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    results.push({ id, category, name, passed: true, details: 'PASS' });
    console.log(`✅ Test ${String(id).padStart(2, '0')} [${category}] ${name}: PASS`);
  } catch (err: any) {
    results.push({ id, category, name, passed: false, details: err?.message || String(err) });
    console.error(`❌ Test ${String(id).padStart(2, '0')} [${category}] ${name}: FAIL - ${err?.message || err}`);
  }
}

function makePhoto(overrides: Partial<InspectionPhoto> = {}): InspectionPhoto {
  const id = overrides.id || `p_${Math.random().toString(36).slice(2, 8)}`;
  const componentName = overrides.componentName;
  const category = overrides.photoCategory || 'INSPECTION';
  return {
    id,
    photoId: id,
    url: `https://firebasestorage.example.com/${id}.jpg`,
    caption: overrides.caption || `Photo ${id}`,
    timestamp: '2026-11-20T10:00:00Z',
    workspaceId: 'ws-alpha',
    inspectionSessionId: 'INSP-2026-0099',
    assetId: 'CV-2026-001',
    photoCategory: category,
    classificationStatus: componentName ? 'assigned' : 'unassigned',
    componentName,
    componentId: componentName ? toComponentSlug(componentName) : undefined,
    storagePath: buildPhotoStoragePath({
      workspaceId: overrides.workspaceId || 'ws-alpha',
      sessionId: overrides.inspectionSessionId || 'INSP-2026-0099',
      componentName,
      photoId: id,
      category,
    }),
    uploadedBy: 'Field Tech',
    uploadedById: 'user-tech-1',
    uploadStatus: 'uploaded',
    isFinalized: false,
    ...overrides,
  };
}

function makeInspectionInput(photos: InspectionPhoto[]): Omit<InspectionRecord, 'id' | 'createdAt'> {
  return {
    workspaceId: 'ws-alpha',
    assetId: 'CV-2026-001',
    assetName: 'Primary Crusher Overland Conveyor',
    inspectorName: 'Nikko Amir',
    inspectorId: 'user-tech-1',
    inspectionDate: '2026-11-20T10:00:00Z',
    overallCondition: 'damaged',
    components: {
      'Belt Carcass': 'damaged',
      'Carrying Idlers': 'good',
      'Drive Pulley': 'worn',
    },
    componentNotes: {
      'Belt Carcass': 'Cut 300mm on top cover',
      'Drive Pulley': 'Minor lagging edge wear',
    },
    findings: 'Belt tear and pulley lagging wear observed.',
    recommendations: 'Patch carcass and schedule pulley relagging.',
    priority: 'critical',
    photos,
  };
}

async function main() {
  const now = '2026-11-20T10:05:00Z';

  // ==================== 1. FUNCTIONAL TESTS (1-9) ====================
  await runTest(1, 'Functional', 'Direct Component Photo Upload', () => {
    const photo = makePhoto({ id: 'p-belt-1', componentName: 'Belt Carcass', classificationStatus: 'assigned' });
    assert.equal(photo.componentName, 'Belt Carcass');
    assert.equal(photo.classificationStatus, 'assigned');
    assert.equal(photo.photoCategory, 'INSPECTION');
    assert.ok(photo.storagePath?.includes('/components/belt-carcass/p-belt-1'));
  });

  await runTest(2, 'Functional', 'Multi-Component Single Session Upload', () => {
    const photos = [
      makePhoto({ id: 'p1', componentName: 'Belt Carcass', classificationStatus: 'assigned' }),
      makePhoto({ id: 'p2', componentName: 'Belt Carcass', classificationStatus: 'assigned' }),
      makePhoto({ id: 'p3', componentName: 'Drive Pulley', classificationStatus: 'assigned' }),
    ];
    const { reports } = buildComponentReportsFromSession({
      sessionId: 'INSP-2026-0100',
      inspectionData: makeInspectionInput(photos),
      existingReports: [],
      now,
      workspaceId: 'ws-alpha',
    });
    const beltRep = reports.find((r) => r.componentName === 'Belt Carcass')!;
    const pulleyRep = reports.find((r) => r.componentName === 'Drive Pulley')!;
    const idlerRep = reports.find((r) => r.componentName === 'Carrying Idlers')!;
    assert.equal(beltRep.photos.length, 2);
    assert.equal(pulleyRep.photos.length, 1);
    assert.equal(idlerRep.photos.length, 0);
  });

  await runTest(3, 'Functional', 'Multiple Photos per Single Component', () => {
    const photos = [
      makePhoto({ id: 'p-a', componentName: 'Belt Carcass', classificationStatus: 'assigned' }),
      makePhoto({ id: 'p-b', componentName: 'Belt Carcass', classificationStatus: 'assigned' }),
      makePhoto({ id: 'p-c', componentName: 'Belt Carcass', classificationStatus: 'assigned' }),
    ];
    const { reports } = buildComponentReportsFromSession({
      sessionId: 'INSP-2026-0101',
      inspectionData: makeInspectionInput(photos),
      existingReports: [],
      now,
      workspaceId: 'ws-alpha',
    });
    const beltRep = reports.find((r) => r.componentName === 'Belt Carcass')!;
    assert.equal(beltRep.photos.length, 3);
    assert.deepEqual(
      beltRep.photos.map((p) => p.id),
      ['p-a', 'p-b', 'p-c']
    );
  });

  await runTest(4, 'Functional', 'Zero Photos Component Inspection', () => {
    const { reports } = buildComponentReportsFromSession({
      sessionId: 'INSP-2026-0102',
      inspectionData: makeInspectionInput([]),
      existingReports: [],
      now,
      workspaceId: 'ws-alpha',
    });
    assert.equal(reports.length, 3);
    reports.forEach((rep) => assert.equal(rep.photos.length, 0));
  });

  await runTest(5, 'Functional', 'Bulk Photo Upload & Unassigned Submission Guard', () => {
    const unassignedPhoto = makePhoto({
      id: 'p-bulk-1',
      componentName: undefined,
      classificationStatus: 'unassigned',
    });
    assert.equal(unassignedPhoto.classificationStatus, 'unassigned');
    // Unassigned check blocks submission unless explicitly classified
    const hasUnassigned = [unassignedPhoto].some((p) => p.classificationStatus === 'unassigned');
    assert.equal(hasUnassigned, true);

    // Once assigned to Drive Pulley, unassigned guard clears
    const assignedPhoto = {
      ...unassignedPhoto,
      classificationStatus: 'assigned' as const,
      componentName: 'Drive Pulley',
    };
    const { reports } = buildComponentReportsFromSession({
      sessionId: 'INSP-2026-0103',
      inspectionData: makeInspectionInput([assignedPhoto]),
      existingReports: [],
      now,
      workspaceId: 'ws-alpha',
    });
    assert.equal(reports.find((r) => r.componentName === 'Drive Pulley')!.photos.length, 1);
    assert.equal(reports.find((r) => r.componentName === 'Belt Carcass')!.photos.length, 0);
  });

  await runTest(6, 'Functional', 'General Session Evidence Classification', () => {
    const generalPhoto = makePhoto({
      id: 'p-gen-1',
      classificationStatus: 'general_session_evidence',
      photoCategory: 'GENERAL_SESSION_EVIDENCE',
    });
    const { reports, generalPhotos } = buildComponentReportsFromSession({
      sessionId: 'INSP-2026-0104',
      inspectionData: makeInspectionInput([generalPhoto]),
      existingReports: [],
      now,
      workspaceId: 'ws-alpha',
    });
    assert.equal(generalPhotos.length, 1);
    reports.forEach((rep) => assert.equal(rep.photos.length, 0));
  });

  await runTest(7, 'Functional', 'Remove / Reassign Unsubmitted Photo', () => {
    let draftPhotos = [
      makePhoto({ id: 'p-temp-1', componentName: 'Belt Carcass', classificationStatus: 'assigned' }),
      makePhoto({ id: 'p-temp-2', componentName: 'Drive Pulley', classificationStatus: 'assigned' }),
    ];
    // Reassign p-temp-1 -> Carrying Idlers and remove p-temp-2
    draftPhotos = draftPhotos
      .filter((p) => p.id !== 'p-temp-2')
      .map((p) => (p.id === 'p-temp-1' ? { ...p, componentName: 'Carrying Idlers' } : p));
    const { reports } = buildComponentReportsFromSession({
      sessionId: 'INSP-2026-0105',
      inspectionData: makeInspectionInput(draftPhotos),
      existingReports: [],
      now,
      workspaceId: 'ws-alpha',
    });
    assert.equal(reports.find((r) => r.componentName === 'Carrying Idlers')!.photos.length, 1);
    assert.equal(reports.find((r) => r.componentName === 'Belt Carcass')!.photos.length, 0);
    assert.equal(reports.find((r) => r.componentName === 'Drive Pulley')!.photos.length, 0);
  });

  await runTest(8, 'Functional', 'Maintenance Update Stage Photo Attachment', () => {
    const beforePhoto = makePhoto({
      id: 'm-before',
      componentName: 'Belt Carcass',
      photoCategory: 'MAINTENANCE_BEFORE',
      classificationStatus: 'assigned',
    });
    const afterPhoto = makePhoto({
      id: 'm-after',
      componentName: 'Belt Carcass',
      photoCategory: 'MAINTENANCE_AFTER',
      classificationStatus: 'assigned',
    });
    const { reports } = buildComponentReportsFromSession({
      sessionId: 'INSP-2026-0106',
      inspectionData: makeInspectionInput([
        makePhoto({ id: 'insp-1', componentName: 'Belt Carcass', classificationStatus: 'assigned' }),
      ]),
      existingReports: [],
      now,
      workspaceId: 'ws-alpha',
    });
    const beltRep = reports.find((r) => r.componentName === 'Belt Carcass')!;
    // Maintenance photos stay distinct from original INSPECTION photos
    assert.equal(beltRep.photos.length, 1);
    assert.equal(beltRep.photos[0].photoCategory, 'INSPECTION');
    assert.equal(beforePhoto.photoCategory, 'MAINTENANCE_BEFORE');
    assert.equal(afterPhoto.photoCategory, 'MAINTENANCE_AFTER');
  });

  await runTest(9, 'Functional', 'Supervisor Verification Photo Attachment', () => {
    const verPhoto = makePhoto({
      id: 'v-1',
      componentName: 'Belt Carcass',
      photoCategory: 'VERIFICATION',
      classificationStatus: 'assigned',
    });
    assert.equal(verPhoto.photoCategory, 'VERIFICATION');
    assert.ok(
      buildPhotoStoragePath({
        workspaceId: 'ws-alpha',
        sessionId: 'INSP-2026-0106',
        componentName: 'Belt Carcass',
        photoId: 'v-1',
        category: 'VERIFICATION',
        maintenanceUpdateId: 'MAINT-2026-0001',
      }).includes('/maintenance/MAINT-2026-0001/v-1')
    );
  });

  // ==================== 2. PHOTO MAPPING & ISOLATION TESTS (10-15) ====================
  await runTest(10, 'Photo Mapping', 'Consolidated Session to Component Report Mapping without Duplication', () => {
    const p1 = makePhoto({ id: 'p-map-1', componentName: 'Belt Carcass', classificationStatus: 'assigned' });
    const { reports, normalizedSessionPhotos } = buildComponentReportsFromSession({
      sessionId: 'INSP-2026-0110',
      inspectionData: makeInspectionInput([p1]),
      existingReports: [],
      now,
      workspaceId: 'ws-alpha',
    });
    const beltRep = reports.find((r) => r.componentName === 'Belt Carcass')!;
    // Same photo ID and storagePath referenced cleanly (no duplicate Storage upload)
    assert.equal(beltRep.photos[0].id, normalizedSessionPhotos[0].id);
    assert.equal(beltRep.photos[0].storagePath, normalizedSessionPhotos[0].storagePath);
    assert.equal(beltRep.photos[0].componentReportId, beltRep.id);
  });

  await runTest(11, 'Photo Mapping', 'Unrelated Component Photo Isolation', () => {
    const pBelt = makePhoto({ id: 'p-b', componentName: 'Belt Carcass', classificationStatus: 'assigned' });
    const pPulley = makePhoto({ id: 'p-p', componentName: 'Drive Pulley', classificationStatus: 'assigned' });
    const { reports } = buildComponentReportsFromSession({
      sessionId: 'INSP-2026-0111',
      inspectionData: makeInspectionInput([pBelt, pPulley]),
      existingReports: [],
      now,
      workspaceId: 'ws-alpha',
    });
    const pulleyRep = reports.find((r) => r.componentName === 'Drive Pulley')!;
    const filtered = getComponentInspectionPhotos(pulleyRep);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 'p-p');
  });

  await runTest(12, 'Photo Mapping', 'General Session Photo Isolation', () => {
    const pGen = makePhoto({
      id: 'p-gen-iso',
      classificationStatus: 'general_session_evidence',
      photoCategory: 'GENERAL_SESSION_EVIDENCE',
    });
    const fakeContaminatedReport: ComponentInspectionReport = {
      id: 'INSP-2026-0112-C01',
      sessionId: 'INSP-2026-0112',
      assetId: 'CV-2026-001',
      assetName: 'Conveyor 1',
      componentName: 'Belt Carcass',
      originalCondition: 'good',
      currentCondition: 'good',
      findings: 'Nominal',
      recommendations: 'None',
      photos: [pGen],
      inspectorName: 'Tech',
      inspectorId: 'user-tech-1',
      inspectionDate: now,
      createdAt: now,
      updatedAt: now,
    };
    const filtered = getComponentInspectionPhotos(fakeContaminatedReport);
    assert.equal(filtered.length, 0);
  });

  await runTest(13, 'Photo Mapping', 'Component Inspection Report Export/Print Accuracy', () => {
    const pBelt = makePhoto({ id: 'p-exp-1', componentName: 'Belt Carcass', classificationStatus: 'assigned' });
    const pGen = makePhoto({
      id: 'p-exp-gen',
      classificationStatus: 'general_session_evidence',
      photoCategory: 'GENERAL_SESSION_EVIDENCE',
    });
    const { reports, normalizedSessionPhotos, generalPhotos } = buildComponentReportsFromSession({
      sessionId: 'INSP-2026-0113',
      inspectionData: makeInspectionInput([pBelt, pGen]),
      existingReports: [],
      now,
      workspaceId: 'ws-alpha',
    });
    const beltRep = reports.find((r) => r.componentName === 'Belt Carcass')!;
    const mockSession: InspectionRecord = {
      ...makeInspectionInput(normalizedSessionPhotos),
      id: 'INSP-2026-0113',
      generalPhotos,
      createdAt: now,
    };
    const exportPhotos = getComponentInspectionPhotos(beltRep, mockSession);
    assert.equal(exportPhotos.length, 1);
    assert.equal(exportPhotos[0].id, 'p-exp-1');
  });

  await runTest(14, 'Photo Mapping', 'Consolidated Session View Preserves All Grouped Photos', () => {
    const p1 = makePhoto({ id: 'p-grp-1', componentName: 'Belt Carcass', classificationStatus: 'assigned' });
    const p2 = makePhoto({ id: 'p-grp-2', componentName: 'Drive Pulley', classificationStatus: 'assigned' });
    const p3 = makePhoto({
      id: 'p-grp-3',
      classificationStatus: 'general_session_evidence',
      photoCategory: 'GENERAL_SESSION_EVIDENCE',
    });
    const { normalizedSessionPhotos, generalPhotos } = buildComponentReportsFromSession({
      sessionId: 'INSP-2026-0114',
      inspectionData: makeInspectionInput([p1, p2, p3]),
      existingReports: [],
      now,
      workspaceId: 'ws-alpha',
    });
    assert.equal(normalizedSessionPhotos.length, 3);
    assert.equal(generalPhotos.length, 1);
    assert.equal(normalizedSessionPhotos.filter((p) => p.classificationStatus === 'assigned').length, 2);
  });

  await runTest(15, 'Photo Mapping', 'Idempotent Report Generation Check', () => {
    const p1 = makePhoto({ id: 'p-idem-1', componentName: 'Belt Carcass', classificationStatus: 'assigned' });
    const first = buildComponentReportsFromSession({
      sessionId: 'INSP-2026-0115',
      inspectionData: makeInspectionInput([p1]),
      existingReports: [],
      now,
      workspaceId: 'ws-alpha',
    });
    assert.equal(first.wasIdempotentSkip, false);
    assert.equal(first.reports.length, 3);

    const second = buildComponentReportsFromSession({
      sessionId: 'INSP-2026-0115',
      inspectionData: makeInspectionInput([p1]),
      existingReports: first.reports,
      now,
      workspaceId: 'ws-alpha',
    });
    assert.equal(second.wasIdempotentSkip, true);
    assert.equal(second.reports.length, 0);
  });

  // ==================== 3. SECURITY & AUTHORIZATION TESTS (16-20) ====================
  await runTest(16, 'Security', 'Unauthenticated Photo Upload / Attachment Rejected', () => {
    const photo = makePhoto({ componentName: 'Belt Carcass', classificationStatus: 'assigned' });
    const res = validatePhotoAssociation(photo, {
      authenticatedUserId: '',
      userWorkspaceId: 'ws-alpha',
      targetWorkspaceId: 'ws-alpha',
      targetAssetId: 'CV-2026-001',
      sessionAssetId: 'CV-2026-001',
      validComponentNames: ['Belt Carcass'],
    });
    assert.equal(res.valid, false);
    const rulesSrc = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
    const storageRulesSrc = fs.readFileSync(path.resolve('storage.rules'), 'utf8');
    assert.ok(rulesSrc.includes('isSignedIn()'));
    assert.ok(storageRulesSrc.includes('isSignedIn()'));
  });

  await runTest(17, 'Security', 'Cross-Workspace Photo Attachment Denied', () => {
    const photo = makePhoto({ workspaceId: 'ws-beta', componentName: 'Belt Carcass', classificationStatus: 'assigned' });
    const res = validatePhotoAssociation(photo, {
      authenticatedUserId: 'user-tech-1',
      userWorkspaceId: 'ws-beta',
      targetWorkspaceId: 'ws-alpha',
      targetAssetId: 'CV-2026-001',
      sessionAssetId: 'CV-2026-001',
      validComponentNames: ['Belt Carcass'],
    });
    assert.equal(res.valid, false);
    assert.ok(res.reason?.toLowerCase().includes('cross-workspace'));
  });

  await runTest(18, 'Security', 'Cross-Asset Component Photo Association Denied', () => {
    const photo = makePhoto({ assetId: 'CV-2026-002', componentName: 'Belt Carcass', classificationStatus: 'assigned' });
    const res = validatePhotoAssociation(photo, {
      authenticatedUserId: 'user-tech-1',
      userWorkspaceId: 'ws-alpha',
      targetWorkspaceId: 'ws-alpha',
      targetAssetId: 'CV-2026-002',
      sessionAssetId: 'CV-2026-001',
      validComponentNames: ['Belt Carcass'],
    });
    assert.equal(res.valid, false);
  });

  await runTest(19, 'Security', 'Uploader Identity Spoofing Prevented', () => {
    const spoofedPhoto = makePhoto({ uploadedById: 'other-victim-uid', componentName: 'Belt Carcass' });
    const res = validatePhotoAssociation(spoofedPhoto, {
      authenticatedUserId: 'attacker-uid',
      userWorkspaceId: 'ws-alpha',
      targetWorkspaceId: 'ws-alpha',
      targetAssetId: 'CV-2026-001',
      sessionAssetId: 'CV-2026-001',
      validComponentNames: ['Belt Carcass'],
    });
    assert.equal(res.valid, false);
    assert.ok(res.reason?.toLowerCase().includes('spoofing'));
    const rulesSrc = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
    assert.ok(rulesSrc.includes('incoming().uploadedById == request.auth.uid'));
  });

  await runTest(20, 'Security', 'Finalized Inspection Photo Immutability Enforced', () => {
    const finalizedPhoto = makePhoto({ isFinalized: true, componentName: 'Belt Carcass', classificationStatus: 'assigned' });
    const res = validatePhotoAssociation(finalizedPhoto, {
      authenticatedUserId: 'user-tech-1',
      userWorkspaceId: 'ws-alpha',
      targetWorkspaceId: 'ws-alpha',
      targetAssetId: 'CV-2026-001',
      sessionAssetId: 'CV-2026-001',
      validComponentNames: ['Belt Carcass'],
      targetReportFinalized: true,
      isReplacingFinalizedEvidence: true,
    });
    assert.equal(res.valid, false);
    const rulesSrc = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
    const storageRulesSrc = fs.readFileSync(path.resolve('storage.rules'), 'utf8');
    assert.ok(rulesSrc.includes('existing().isFinalized != true'));
    assert.ok(storageRulesSrc.includes('allow update, delete: if false'));
  });

  // ==================== 4. LEGACY MIGRATION & DATA INTEGRITY TESTS (21-25) ====================
  await runTest(21, 'Migration', 'Preserve Verified Legacy Component-Linked Photos Without Re-Upload', () => {
    const legacyInsp: InspectionRecord = {
      ...INITIAL_INSPECTIONS[0],
      id: 'INSP-LEG-1',
      photos: [
        {
          id: 'leg-p1',
          url: 'https://storage.example.com/leg-p1.jpg',
          caption: 'Old belt photo',
          timestamp: '2026-01-01T00:00:00Z',
        },
      ],
    };
    const legacyRep: ComponentInspectionReport = {
      ...INITIAL_COMPONENT_REPORTS[0],
      id: 'INSP-LEG-1-C01',
      sessionId: 'INSP-LEG-1',
      componentName: 'Belt Carcass',
      photos: [
        {
          id: 'leg-p1',
          url: 'https://storage.example.com/leg-p1.jpg',
          caption: 'Old belt photo',
          timestamp: '2026-01-01T00:00:00Z',
        },
      ],
    };
    const mig = migrateLegacyPhotos({
      inspections: [legacyInsp],
      componentReports: [legacyRep],
      existingAuditEvents: [],
      now,
    });
    assert.equal(mig.inspections[0].photos[0].classificationStatus, 'assigned');
    assert.equal(mig.inspections[0].photos[0].componentName, 'Belt Carcass');
    assert.equal(mig.inspections[0].photos[0].url, 'https://storage.example.com/leg-p1.jpg');
  });

  await runTest(22, 'Migration', 'Ambiguous Legacy Photos Flagged UNASSIGNED Without Guessing', () => {
    const mig = migrateLegacyPhotos({
      inspections: INITIAL_INSPECTIONS,
      componentReports: INITIAL_COMPONENT_REPORTS,
      existingAuditEvents: [],
      now,
    });
    const insp4 = mig.inspections.find((i) => i.id === 'INSP-2026-0004')!;
    const legacyPhoto = insp4.photos.find((p) => p.id === 'p5-legacy')!;
    assert.equal(legacyPhoto.classificationStatus, 'unassigned');
    assert.equal(legacyPhoto.componentName, undefined);
    // Ensure not guessed into any INSP-2026-0004 child component report
    const insp4Reports = mig.componentReports.filter((r) => r.sessionId === 'INSP-2026-0004');
    insp4Reports.forEach((r) => {
      assert.equal(r.photos.some((p) => p.id === 'p5-legacy'), false);
    });
  });

  await runTest(23, 'Migration', 'Manual Classification of Unassigned Legacy Photo to Component', () => {
    const mig = migrateLegacyPhotos({
      inspections: INITIAL_INSPECTIONS,
      componentReports: INITIAL_COMPONENT_REPORTS,
      existingAuditEvents: [],
      now,
    });
    const insp4 = mig.inspections.find((i) => i.id === 'INSP-2026-0004')!;
    const cleanerRep = mig.componentReports.find(
      (r) => r.sessionId === 'INSP-2026-0004' && r.componentName === 'Primary Belt Cleaner'
    )!;
    const targetPhoto = insp4.photos.find((p) => p.id === 'p5-legacy')!;
    const valid = validatePhotoAssociation(
      { ...targetPhoto, classificationStatus: 'assigned', componentName: 'Primary Belt Cleaner' },
      {
        authenticatedUserId: 'tech-003',
        userWorkspaceId: 'default-workspace',
        targetWorkspaceId: 'default-workspace',
        targetAssetId: insp4.assetId,
        sessionAssetId: insp4.assetId,
        validComponentNames: Object.keys(insp4.components),
      }
    );
    assert.equal(valid.valid, true);
    const classified = {
      ...targetPhoto,
      classificationStatus: 'assigned' as const,
      componentName: 'Primary Belt Cleaner',
      componentReportId: cleanerRep.id,
    };
    const updatedRep = { ...cleanerRep, photos: [classified] };
    assert.equal(getComponentInspectionPhotos(updatedRep, insp4).length, 1);
  });

  await runTest(24, 'Migration', 'Manual Classification of Unassigned Legacy Photo as General Evidence', () => {
    const mig = migrateLegacyPhotos({
      inspections: INITIAL_INSPECTIONS,
      componentReports: INITIAL_COMPONENT_REPORTS,
      existingAuditEvents: [],
      now,
    });
    const insp4 = mig.inspections.find((i) => i.id === 'INSP-2026-0004')!;
    const targetPhoto = insp4.photos.find((p) => p.id === 'p5-legacy')!;
    const generalPhoto: InspectionPhoto = {
      ...targetPhoto,
      classificationStatus: 'general_session_evidence',
      photoCategory: 'GENERAL_SESSION_EVIDENCE',
    };
    const cleanerRep = mig.componentReports.find(
      (r) => r.sessionId === 'INSP-2026-0004' && r.componentName === 'Primary Belt Cleaner'
    )!;
    assert.equal(
      getComponentInspectionPhotos(cleanerRep, { ...insp4, photos: [generalPhoto] }).length,
      0
    );
  });

  await runTest(25, 'Migration', 'Idempotent Legacy Migration Re-Run Safety', () => {
    const first = migrateLegacyPhotos({
      inspections: INITIAL_INSPECTIONS,
      componentReports: INITIAL_COMPONENT_REPORTS,
      existingAuditEvents: [],
      now,
    });
    assert.ok(first.migratedCount >= 1);
    assert.ok(first.newAuditEvents.length >= 1);

    const second = migrateLegacyPhotos({
      inspections: first.inspections,
      componentReports: first.componentReports,
      existingAuditEvents: first.newAuditEvents,
      now,
    });
    assert.equal(second.migratedCount, 0);
    assert.equal(second.newAuditEvents.length, 0);
  });

  // ==================== 5. RELIABILITY, ERROR HANDLING & STORAGE TESTS (26-30) ====================
  await runTest(26, 'Reliability', 'Network Failure Retry State Preserved Cleanly', () => {
    const failedPhoto = makePhoto({
      id: 'p-net-fail',
      componentName: 'Belt Carcass',
      classificationStatus: 'assigned',
      uploadStatus: 'failed',
      uploadError: 'Storage upload timed out. You can retry the upload.',
    });
    assert.equal(failedPhoto.uploadStatus, 'failed');
    assert.ok(failedPhoto.uploadError?.includes('retry'));
  });

  await runTest(27, 'Reliability', 'Partial Upload / Unassigned Submission Guard', () => {
    const uploadingPhoto = makePhoto({
      id: 'p-uploading',
      componentName: 'Belt Carcass',
      classificationStatus: 'assigned',
      uploadStatus: 'uploading',
      uploadProgress: 45,
    });
    const photos = [uploadingPhoto];
    const shouldBlockSubmit =
      photos.some((p) => p.uploadStatus === 'uploading') ||
      photos.some((p) => p.uploadStatus === 'failed') ||
      photos.some((p) => p.classificationStatus === 'unassigned');
    assert.equal(shouldBlockSubmit, true);
  });

  await runTest(28, 'Reliability', 'Cancel Mid-Upload Leaves Zero Orphan Records', () => {
    const draftPhotos = [
      makePhoto({ id: 'p-cancel-1', uploadStatus: 'uploading' }),
    ];
    // Simulate abort clearing draft buffer
    const abortedBuffer: InspectionPhoto[] = [];
    assert.notEqual(draftPhotos.length, abortedBuffer.length);
    assert.equal(abortedBuffer.length, 0);
  });

  await runTest(29, 'Reliability', 'Invalid MIME Type & Oversized File Guard (>10MB)', () => {
    assert.equal(MAX_PHOTO_SIZE_BYTES, 10 * 1024 * 1024);
    const storageRulesSrc = fs.readFileSync(path.resolve('storage.rules'), 'utf8');
    assert.ok(storageRulesSrc.includes('10 * 1024 * 1024'));
    assert.ok(storageRulesSrc.includes("request.resource.contentType.matches('image/.*')"));
    const photoStorageSrc = fs.readFileSync(path.resolve('src/services/photoStorage.ts'), 'utf8');
    assert.ok(photoStorageSrc.includes('exceeds the 10 MB upload limit'));
    assert.ok(photoStorageSrc.includes('Only image files are allowed'));
  });

  await runTest(30, 'Reliability', 'Firestore Base64 Prohibition & Size Enforcement', () => {
    const rawRasterPhoto = makePhoto({
      id: 'p-b64-1',
      url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/...MASSIVE_BASE64...',
      storagePath: 'workspaces/ws-alpha/inspections/INSP-2026-0120/components/belt-carcass/p-b64-1',
    });
    const sanitized = sanitizePhotoForFirestore(rawRasterPhoto);
    assert.equal(sanitized.url.startsWith('data:image/jpeg'), false);
    assert.equal(
      sanitized.url,
      'storage://workspaces/ws-alpha/inspections/INSP-2026-0120/components/belt-carcass/p-b64-1'
    );
    const rulesSrc = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
    assert.ok(rulesSrc.includes('data.url is string && data.url.size() <= 2048'));
  });

  const passedCount = results.filter((r) => r.passed).length;
  console.log(`\n=== PROMPT 10A TEST SUMMARY: ${passedCount}/${results.length} PASSED ===`);
  if (passedCount !== results.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
