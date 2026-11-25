/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ComponentInspectionReport,
  ConveyorAsset,
  InspectionPhoto,
  InspectionRecord,
  computeSessionProgress,
  deriveSessionStatus,
  isSessionFinalized,
  reconcileAssetCondition,
  toComponentSlug,
  validateSessionFinalization,
} from '../types/conveyor';
import {
  DEFAULT_WORKSPACE_ID,
  deduplicatePhotos,
  isCloudUploadedPhoto,
  sanitizePhotoForFirestore,
} from '../services/photoStorage';
import {
  DEFAULT_INSPECTION_COMPONENTS,
  applyComponentSaveToSession,
  authorizeDraftAccess,
  createDraftSessionData,
  prepareFinalizedSessionBundle,
} from '../services/inspectionDrafts';

function runTests() {
  let passed = 0;
  function test(name: string, fn: () => void) {
    try {
      fn();
      console.log(`PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`FAIL: ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  const sampleAsset: ConveyorAsset = {
    id: 'CV-2026-001',
    name: 'Primary Crushing Mainline Belt C-101',
    location: 'North Crusher Sector',
    type: 'Belt',
    beltWidthMm: 1400,
    lengthMeters: 280,
    speedMps: 3.2,
    status: 'active',
    lastInspectedAt: '2026-01-10T08:00:00.000Z',
    currentCondition: 'good',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-10T08:00:00.000Z',
  };

  const makeCloudPhoto = (
    id: string,
    sessionId: string,
    componentName: string
  ): InspectionPhoto => ({
    id,
    photoId: id,
    url: `https://firebasestorage.googleapis.com/v0/b/test-bucket/o/${encodeURIComponent(id)}?alt=media`,
    caption: `${componentName} defect photo`,
    timestamp: '2026-11-22T10:00:00.000Z',
    workspaceId: DEFAULT_WORKSPACE_ID,
    inspectionSessionId: sessionId,
    assetId: sampleAsset.id,
    componentName,
    componentId: toComponentSlug(componentName),
    photoCategory: 'INSPECTION',
    classificationStatus: 'assigned',
    storagePath: `workspaces/${DEFAULT_WORKSPACE_ID}/inspections/${sessionId}/components/${toComponentSlug(componentName)}/${id}`,
    originalFilename: `${id}.jpg`,
    contentType: 'image/jpeg',
    fileSize: 102400,
    uploadedBy: 'Alice Inspector',
    uploadedById: 'uid-alice',
    uploadStatus: 'uploaded',
    isFinalized: false,
    createdAt: '2026-11-22T10:00:00.000Z',
  });

  // 1. Create Draft Inspection Session
  let draftSession!: InspectionRecord;
  test('Scenario 1: Create draft inspection session without completing components & exclude from asset condition', () => {
    draftSession = createDraftSessionData({
      sessionId: 'INSP-2026-0901',
      asset: sampleAsset,
      inspectorName: 'Alice Inspector',
      inspectorId: 'uid-alice',
      now: '2026-11-22T09:00:00.000Z',
    });

    assert.equal(draftSession.status, 'DRAFT');
    assert.equal(draftSession.site, sampleAsset.location);
    assert.equal(isSessionFinalized(draftSession), false);

    const progress = computeSessionProgress(draftSession);
    assert.equal(progress.totalCount, DEFAULT_INSPECTION_COMPONENTS.length);
    assert.equal(progress.doneCount, 0);
    assert.equal(progress.notStartedCount, DEFAULT_INSPECTION_COMPONENTS.length);

    // Asset condition must ignore unfinished draft
    const assetCond = reconcileAssetCondition(sampleAsset.id, [draftSession]);
    assert.equal(assetCond, 'good');
  });

  // 2. Save 2 Components Independently
  test('Scenario 2: Save 2 components independently without clobbering other components & isolate draft damage', () => {
    const comp1 = DEFAULT_INSPECTION_COMPONENTS[0]; // Belt Carcass & Top Cover
    const comp2 = DEFAULT_INSPECTION_COMPONENTS[1]; // Carrying Troughing Idlers

    const p1 = makeCloudPhoto('photo_c1_1', draftSession.id, comp1);
    const save1 = applyComponentSaveToSession({
      session: draftSession,
      componentName: comp1,
      componentStatus: 'COMPLETED',
      condition: 'damaged',
      observations: '18cm longitudinal top cover gouge near loading zone.',
      findings: 'Cord exposure visible on 2 plies.',
      recommendations: 'Schedule emergency cold patch splice.',
      componentPhotos: [p1],
      actorName: 'Alice Inspector',
      actorId: 'uid-alice',
      now: '2026-11-22T09:15:00.000Z',
    });

    assert.equal(save1.updatedSession.status, 'IN_PROGRESS');
    assert.equal(save1.updatedComponentDraft.status, 'COMPLETED');
    assert.equal(computeSessionProgress(save1.updatedSession).doneCount, 1);

    // Even with damaged component saved in draft, asset condition reconciliation still ignores unfinalized draft
    assert.equal(reconcileAssetCondition(sampleAsset.id, [save1.updatedSession]), 'good');

    const p2 = makeCloudPhoto('photo_c2_1', draftSession.id, comp2);
    const save2 = applyComponentSaveToSession({
      session: save1.updatedSession,
      componentName: comp2,
      componentStatus: 'SAVED',
      condition: 'good',
      observations: 'Idler rollers spinning freely, zero seizure.',
      componentPhotos: [p2],
      actorName: 'Alice Inspector',
      actorId: 'uid-alice',
      now: '2026-11-22T09:20:00.000Z',
    });

    draftSession = save2.updatedSession;
    assert.equal(draftSession.status, 'IN_PROGRESS');
    assert.equal(computeSessionProgress(draftSession).doneCount, 2);
    // Component 1 preserved completely
    assert.equal(draftSession.componentDrafts?.[comp1].condition, 'damaged');
    assert.equal(draftSession.photos.filter((p) => p.componentName === comp1).length, 1);
    assert.equal(draftSession.photos.filter((p) => p.componentName === comp2).length, 1);
  });

  // 3. Simulated Browser Refresh & Resume without photo duplicates
  test('Scenario 3: Refresh/resume draft preserves saved components and prevents photo duplication', () => {
    const serialized = JSON.stringify(draftSession);
    const resumedSession = JSON.parse(serialized) as InspectionRecord;

    const comp2 = DEFAULT_INSPECTION_COMPONENTS[1];
    const existingP2 = resumedSession.photos.filter((p) => p.componentName === comp2);
    const additionalP2 = makeCloudPhoto('photo_c2_2', resumedSession.id, comp2);

    // Simulate re-saving component 2 with existing photo + new photo + accidental duplicate entry
    const resaved = applyComponentSaveToSession({
      session: resumedSession,
      componentName: comp2,
      componentStatus: 'COMPLETED',
      condition: 'fair',
      observations: 'Updated after second look: minor dust buildup.',
      componentPhotos: [...existingP2, ...existingP2, additionalP2],
      actorName: 'Alice Inspector',
      actorId: 'uid-alice',
      now: '2026-11-22T09:30:00.000Z',
    });

    draftSession = resaved.updatedSession;
    assert.equal(draftSession.photos.filter((p) => p.componentName === comp2).length, 2);
    assert.equal(draftSession.photos.length, 3); // 1 from comp1 + 2 from comp2
    assert.equal(deduplicatePhotos([...draftSession.photos, ...draftSession.photos]).length, 3);
  });

  // 4. Reject unuploaded local preview & allow retry for failed photo upload
  test('Scenario 4: Local preview rejected as cloud uploaded; failed photo blocked then retried cleanly', () => {
    const comp3 = DEFAULT_INSPECTION_COMPONENTS[2];
    const localPreviewPhoto: InspectionPhoto = {
      ...makeCloudPhoto('photo_c3_preview', draftSession.id, comp3),
      url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      uploadStatus: 'failed',
      uploadError: 'Network disconnected',
    };

    assert.equal(isCloudUploadedPhoto(localPreviewPhoto), false);
    assert.equal(
      isCloudUploadedPhoto({ ...localPreviewPhoto, uploadStatus: 'uploaded' }),
      false,
      'Local raster data URL must never be treated as uploaded'
    );

    assert.throws(
      () =>
        applyComponentSaveToSession({
          session: draftSession,
          componentName: comp3,
          componentStatus: 'COMPLETED',
          condition: 'good',
          componentPhotos: [localPreviewPhoto],
          actorName: 'Alice Inspector',
          actorId: 'uid-alice',
        }),
      /failed/i
    );

    // Retry succeeds with Firebase Storage download URL
    const retriedPhoto = makeCloudPhoto('photo_c3_preview', draftSession.id, comp3);
    assert.equal(isCloudUploadedPhoto(retriedPhoto), true);

    const savedAfterRetry = applyComponentSaveToSession({
      session: draftSession,
      componentName: comp3,
      componentStatus: 'COMPLETED',
      condition: 'good',
      observations: 'Return idlers nominal after retry upload.',
      componentPhotos: [retriedPhoto],
      actorName: 'Alice Inspector',
      actorId: 'uid-alice',
      now: '2026-11-22T09:35:00.000Z',
    });
    draftSession = savedAfterRetry.updatedSession;
    assert.equal(draftSession.photos.filter((p) => p.componentName === comp3).length, 1);
  });

  // 5. Block finalization if required components are incomplete or fields missing
  test('Scenario 5: Finalization blocked while components remain NOT_STARTED or missing findings', () => {
    const check = validateSessionFinalization(draftSession);
    assert.equal(check.valid, false);
    assert.ok(check.blockingComponents.length >= 5);

    assert.throws(
      () =>
        prepareFinalizedSessionBundle({
          session: draftSession,
          existingReports: [],
          actorName: 'Alice Inspector',
          actorId: 'uid-alice',
          overallOverrides: { findings: 'Overall summary attempt' },
        }),
      /NOT STARTED|required/i
    );
  });

  // 6. Complete remaining components (including NOT_APPLICABLE) & finalize -> generates reports & reconciles asset
  let finalizedSession!: InspectionRecord;
  let generatedReports: ComponentInspectionReport[] = [];
  test('Scenario 6: Complete remaining components, finalize session, generate component reports, and reconcile asset', () => {
    // Save components 3..6 as COMPLETED ('good') and component 7 as NOT_APPLICABLE
    for (let i = 3; i < DEFAULT_INSPECTION_COMPONENTS.length - 1; i++) {
      const compName = DEFAULT_INSPECTION_COMPONENTS[i];
      const res = applyComponentSaveToSession({
        session: draftSession,
        componentName: compName,
        componentStatus: 'COMPLETED',
        condition: 'good',
        observations: `${compName} inspected and within tolerance.`,
        componentPhotos: [],
        actorName: 'Alice Inspector',
        actorId: 'uid-alice',
        now: '2026-11-22T09:45:00.000Z',
      });
      draftSession = res.updatedSession;
    }

    const lastComp = DEFAULT_INSPECTION_COMPONENTS[DEFAULT_INSPECTION_COMPONENTS.length - 1];
    // Verify N/A requires reason
    assert.throws(
      () =>
        applyComponentSaveToSession({
          session: draftSession,
          componentName: lastComp,
          componentStatus: 'NOT_APPLICABLE',
          notApplicableReason: '',
          componentPhotos: [],
          actorName: 'Alice Inspector',
          actorId: 'uid-alice',
        }),
      /reason/i
    );

    const naSave = applyComponentSaveToSession({
      session: draftSession,
      componentName: lastComp,
      componentStatus: 'NOT_APPLICABLE',
      notApplicableReason: 'Transfer chute uses steel impact plates rather than rubber skirtboard.',
      componentPhotos: [],
      actorName: 'Alice Inspector',
      actorId: 'uid-alice',
      now: '2026-11-22T09:46:00.000Z',
    });
    draftSession = naSave.updatedSession;

    assert.equal(deriveSessionStatus(draftSession.componentDrafts!), 'READY_FOR_REVIEW');

    const bundle = prepareFinalizedSessionBundle({
      session: draftSession,
      existingReports: [],
      actorName: 'Alice Inspector',
      actorId: 'uid-alice',
      overallOverrides: {
        findings: 'Belt carcass gouge requires emergency patch; all other active assemblies nominal.',
        recommendations: 'Execute cold vulcanizing repair on Belt Carcass C-101.',
      },
      requireCloudStoragePhotos: true,
      now: '2026-11-22T10:00:00.000Z',
    });

    assert.equal(bundle.wasIdempotentSkip, false);
    finalizedSession = bundle.finalizedSession;
    generatedReports = bundle.generatedReports;

    assert.equal(finalizedSession.status, 'FINALIZED');
    assert.equal(finalizedSession.finalizedBy, 'Alice Inspector');
    assert.equal(isSessionFinalized(finalizedSession), true);
    // 7 evaluated components (8th was NOT_APPLICABLE)
    assert.equal(generatedReports.length, DEFAULT_INSPECTION_COMPONENTS.length - 1);
    assert.ok(generatedReports.every((r) => r.componentName !== lastComp));

    // Photo mapping preserved accurately without cross-component leakage
    const beltRep = generatedReports.find(
      (r) => r.componentName === DEFAULT_INSPECTION_COMPONENTS[0]
    )!;
    const idlerRep = generatedReports.find(
      (r) => r.componentName === DEFAULT_INSPECTION_COMPONENTS[1]
    )!;
    assert.equal(beltRep.photos.length, 1);
    assert.equal(idlerRep.photos.length, 2);

    // Asset condition reconciles ONLY after finalization
    assert.equal(reconcileAssetCondition(sampleAsset.id, [finalizedSession]), 'damaged');

    // Sanitizer strips raw raster base64 safely
    const sanitized = sanitizePhotoForFirestore({
      ...beltRep.photos[0],
      url: 'data:image/jpeg;base64,/9j/ABC',
    });
    assert.ok(sanitized.url.startsWith('storage://'));
  });

  // 7. Idempotent Finalization prevents duplicate component reports
  test('Scenario 7: Re-finalizing an already finalized session is idempotent with zero duplicate reports', () => {
    const repeat = prepareFinalizedSessionBundle({
      session: finalizedSession,
      existingReports: generatedReports,
      actorName: 'Alice Inspector',
      actorId: 'uid-alice',
      now: '2026-11-22T10:05:00.000Z',
    });
    assert.equal(repeat.wasIdempotentSkip, true);
    assert.equal(repeat.generatedReports.length, generatedReports.length);
    assert.equal(repeat.auditEvents.length, 0);
  });

  // 8. Finalized session immutability & Firestore Rules verification
  test('Scenario 8: Post-finalization edits rejected in application layer and Firestore rules', () => {
    assert.throws(
      () =>
        applyComponentSaveToSession({
          session: finalizedSession,
          componentName: DEFAULT_INSPECTION_COMPONENTS[0],
          componentStatus: 'COMPLETED',
          condition: 'good',
          componentPhotos: [],
          actorName: 'Alice Inspector',
          actorId: 'uid-alice',
        }),
      /FINALIZED and immutable/i
    );

    const rulesContent = fs.readFileSync(
      path.resolve(process.cwd(), 'firestore.rules'),
      'utf-8'
    );
    assert.ok(rulesContent.includes("existing().status != 'FINALIZED'"));
    assert.ok(rulesContent.includes("match /inspection_drafts/{sessionId}"));
    assert.ok(rulesContent.includes("match /component_drafts/{compSlug}"));
    assert.ok(rulesContent.includes("affectedKeys().hasOnly"));
  });

  // 9. Unauthorized User & Cross-Workspace Isolation
  test('Scenario 9: Unauthorized users & cross-workspace actors cannot read/modify drafts', () => {
    const freshDraft = createDraftSessionData({
      sessionId: 'INSP-2026-0902',
      asset: sampleAsset,
      inspectorName: 'Alice Inspector',
      inspectorId: 'uid-alice',
    });

    assert.throws(() => authorizeDraftAccess(freshDraft, ''), /Authentication required/i);
    assert.throws(() => authorizeDraftAccess(freshDraft, 'uid-bob'), /another inspector/i);
    assert.throws(
      () => authorizeDraftAccess(freshDraft, 'uid-alice', 'different-workspace'),
      /Cross-workspace access denied/i
    );
    assert.throws(
      () =>
        applyComponentSaveToSession({
          session: freshDraft,
          componentName: DEFAULT_INSPECTION_COMPONENTS[0],
          componentStatus: 'COMPLETED',
          condition: 'good',
          componentPhotos: [],
          actorName: 'Bob Unauthorized',
          actorId: 'uid-bob',
        }),
      /another inspector/i
    );
  });

  // 10. Optimistic Concurrency Version Check
  test('Scenario 10: Stale draft session version triggers optimistic concurrency conflict', () => {
    const freshDraft = createDraftSessionData({
      sessionId: 'INSP-2026-0903',
      asset: sampleAsset,
      inspectorName: 'Alice Inspector',
      inspectorId: 'uid-alice',
    });
    const savedV2 = applyComponentSaveToSession({
      session: freshDraft,
      componentName: DEFAULT_INSPECTION_COMPONENTS[0],
      componentStatus: 'COMPLETED',
      condition: 'good',
      componentPhotos: [],
      actorName: 'Alice Inspector',
      actorId: 'uid-alice',
      expectedSessionVersion: 1,
    });
    assert.equal(savedV2.updatedSession.version, 2);

    assert.throws(
      () =>
        applyComponentSaveToSession({
          session: savedV2.updatedSession,
          componentName: DEFAULT_INSPECTION_COMPONENTS[1],
          componentStatus: 'COMPLETED',
          condition: 'good',
          componentPhotos: [],
          actorName: 'Alice Inspector',
          actorId: 'uid-alice',
          expectedSessionVersion: 1, // stale version from another tab
        }),
      /Version conflict/i
    );
  });

  // 11. Finalization & Component Save Cloud-Photo Enforcement + Unuploaded Raster Rejection
  test('Scenario 11: Finalization rejects unuploaded raster data URLs and unassigned bulk photos when cloud storage is required', () => {
    const draft = createDraftSessionData({
      sessionId: 'INSP-2026-0904',
      asset: sampleAsset,
      inspectorName: 'Alice Inspector',
      inspectorId: 'uid-alice',
    });
    const unuploadedPhoto: InspectionPhoto = {
      ...makeCloudPhoto('photo_local_only', draft.id, DEFAULT_INSPECTION_COMPONENTS[0]),
      url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      uploadStatus: 'uploaded', // tampered status with raster data URL
    };

    assert.throws(
      () =>
        applyComponentSaveToSession({
          session: draft,
          componentName: DEFAULT_INSPECTION_COMPONENTS[0],
          componentStatus: 'COMPLETED',
          condition: 'good',
          componentPhotos: [unuploadedPhoto],
          actorName: 'Alice Inspector',
          actorId: 'uid-alice',
          requireCloudStoragePhotos: true,
        }),
      /has not completed cloud upload/i
    );

    // Unassigned bulk photo must block finalization
    const unassignedBulk: InspectionPhoto = {
      ...makeCloudPhoto('photo_bulk_unassigned', draft.id, DEFAULT_INSPECTION_COMPONENTS[0]),
      classificationStatus: 'unassigned',
      componentName: undefined,
      componentId: undefined,
    };
    let completeDraft = draft;
    for (let i = 0; i < DEFAULT_INSPECTION_COMPONENTS.length; i++) {
      const res = applyComponentSaveToSession({
        session: completeDraft,
        componentName: DEFAULT_INSPECTION_COMPONENTS[i],
        componentStatus: 'COMPLETED',
        condition: 'good',
        observations: 'Nominal',
        componentPhotos: [],
        actorName: 'Alice Inspector',
        actorId: 'uid-alice',
      });
      completeDraft = res.updatedSession;
    }

    assert.throws(
      () =>
        prepareFinalizedSessionBundle({
          session: { ...completeDraft, photos: [unassignedBulk] },
          existingReports: [],
          actorName: 'Alice Inspector',
          actorId: 'uid-alice',
          overallOverrides: { findings: 'Complete' },
          requireCloudStoragePhotos: true,
        }),
      /assigned to a component or marked General Session Evidence/i
    );
  });

  // 12. Audit & Rules Verification for Hardened Collections and Transaction Defaults
  test('Scenario 12: Transaction defaults enforce cloud photos and Firestore rules lock deletes & terminal states', () => {
    const draftsSvc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/inspectionDrafts.ts'),
      'utf-8'
    );
    assert.ok(draftsSvc.includes('requireCloudStoragePhotos = true'));
    assert.ok(draftsSvc.includes('if (draftSnap.exists())'));

    const rulesContent = fs.readFileSync(
      path.resolve(process.cwd(), 'firestore.rules'),
      'utf-8'
    );
    assert.ok(rulesContent.includes('isValidAsset(incoming())'));
    assert.ok(rulesContent.includes('isValidFinalizedInspection(incoming())'));
    assert.ok(rulesContent.includes('isValidMaintenanceUpdate(incoming())'));
    assert.ok(rulesContent.includes('isValidComponentReport(incoming())'));
    assert.ok(rulesContent.includes("existing().progressStatus != 'verified_closed'"));
    assert.ok(rulesContent.includes('allow delete: if false;'));
  });

  console.log(`\nPrompt 10B Test Suite Complete: ${passed}/12 scenarios passed.`);
}

runTests();
