/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, auth } from './firebase';
import {
  InspectionPhoto,
  PhotoCategory,
  toComponentSlug,
} from '../types/conveyor';

export const DEFAULT_WORKSPACE_ID = 'default-workspace';
export const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

export interface CompressedImageResult {
  blob: Blob;
  previewUrl: string;
  contentType: string;
  fileSize: number;
  originalFilename: string;
}

export function buildPhotoStoragePath(params: {
  workspaceId?: string;
  sessionId: string;
  componentName?: string;
  photoId: string;
  category?: PhotoCategory;
  maintenanceUpdateId?: string;
}): string {
  const ws = (params.workspaceId || DEFAULT_WORKSPACE_ID).replace(/[^a-zA-Z0-9_-]/g, '');
  const session = params.sessionId.replace(/[^a-zA-Z0-9_-]/g, '');
  const safePhotoId = params.photoId.replace(/[^a-zA-Z0-9_.-]/g, '');

  if (
    params.category === 'MAINTENANCE_BEFORE' ||
    params.category === 'MAINTENANCE_DURING' ||
    params.category === 'MAINTENANCE_AFTER' ||
    params.category === 'VERIFICATION'
  ) {
    const maintId = (params.maintenanceUpdateId || 'general').replace(/[^a-zA-Z0-9_-]/g, '');
    return `workspaces/${ws}/inspections/${session}/maintenance/${maintId}/${safePhotoId}`;
  }

  if (params.componentName && params.category !== 'GENERAL_SESSION_EVIDENCE') {
    const compSlug = toComponentSlug(params.componentName);
    return `workspaces/${ws}/inspections/${session}/components/${compSlug}/${safePhotoId}`;
  }

  return `workspaces/${ws}/inspections/${session}/general/${safePhotoId}`;
}

export async function compressImageFile(file: File): Promise<CompressedImageResult> {
  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    throw new Error(`File "${file.name}" exceeds the 10 MB upload limit.`);
  }
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error(`Unsupported file type "${file.type}". Only image files are allowed.`);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read image file "${file.name}".`));
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error(`Failed to decode image "${file.name}".`));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const scale = MAX_WIDTH / Math.max(img.width, MAX_WIDTH);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable for image compression.'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const previewUrl = canvas.toDataURL('image/jpeg', 0.8);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to encode compressed JPEG blob.'));
              return;
            }
            resolve({
              blob,
              previewUrl,
              contentType: 'image/jpeg',
              fileSize: blob.size,
              originalFilename: file.name,
            });
          },
          'image/jpeg',
          0.8
        );
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadBlobToFirebaseStorage(params: {
  blob: Blob;
  storagePath: string;
  contentType: string;
  onProgress?: (pct: number) => void;
  timeoutMs?: number;
}): Promise<{ downloadUrl: string; storagePath: string }> {
  const { blob, storagePath, contentType, onProgress, timeoutMs = 15000 } = params;

  if (!auth.currentUser) {
    throw new Error('Authentication required for cloud Storage upload. Sign in or retry after signing in.');
  }

  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, blob, {
    contentType,
    customMetadata: {
      uploadedById: auth.currentUser.uid,
    },
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          uploadTask.cancel();
        } catch {
          // ignore
        }
        reject(new Error('Storage upload timed out. You can retry the upload.'));
      }
    }, timeoutMs);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.totalBytes > 0 && onProgress) {
          const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          onProgress(pct);
        }
      },
      (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(error?.message || 'Firebase Storage upload failed.'));
        }
      },
      async () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            if (onProgress) onProgress(100);
            resolve({ downloadUrl, storagePath });
          } catch (err: any) {
            reject(new Error(err?.message || 'Failed to obtain download URL after upload.'));
          }
        }
      }
    );
  });
}

/**
 * Ensures Firestore documents never store massive raw Base64 strings.
 * If the photo has a Firebase Storage download URL (https://...) or SVG sample asset,
 * it keeps it directly. If it's a local data:image/jpeg/png pending upload,
 * Firestore stores a lightweight storage reference placeholder while local state keeps the preview.
 */
export function sanitizePhotoForFirestore(photo: InspectionPhoto): InspectionPhoto {
  const { uploadProgress: _progress, ...rest } = photo;
  const isRasterBase64 =
    typeof rest.url === 'string' &&
    rest.url.startsWith('data:image/') &&
    !rest.url.startsWith('data:image/svg+xml');

  if (isRasterBase64 && rest.storagePath) {
    return {
      ...rest,
      url: `storage://${rest.storagePath}`,
    };
  }
  return rest;
}

/**
 * Verifies a photo truly holds a cloud-persisted reference rather than an unuploaded local data preview.
 */
export function isCloudUploadedPhoto(photo: InspectionPhoto): boolean {
  if (photo.uploadStatus !== 'uploaded' && photo.uploadStatus !== 'finalized') {
    return false;
  }
  if (!photo.url) return false;
  if (photo.url.startsWith('data:image/') && !photo.url.startsWith('data:image/svg+xml')) {
    return false;
  }
  return true;
}

/**
 * Deterministically deduplicates photos by photo ID and storagePath so resuming drafts
 * or re-saving components never duplicates already-uploaded photographs.
 */
export function deduplicatePhotos(photos: InspectionPhoto[]): InspectionPhoto[] {
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  const result: InspectionPhoto[] = [];

  for (const photo of photos) {
    const pid = photo.photoId || photo.id;
    if (seenIds.has(pid)) continue;
    if (photo.storagePath && seenPaths.has(photo.storagePath)) continue;
    seenIds.add(pid);
    if (photo.storagePath) seenPaths.add(photo.storagePath);
    result.push(photo);
  }
  return result;
}

