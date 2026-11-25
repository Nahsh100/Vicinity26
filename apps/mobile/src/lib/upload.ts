import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { MEDIA_LIMITS, type MediaPurpose, type MediaRef } from '@vicinity/shared';
import { api, ApiError } from './api';

export interface PickedFile {
  uri: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  kind: 'IMAGE' | 'VIDEO';
  webFile?: File;
}

/** Opens the library. Must be called from a button press (web requirement). */
export async function pickMedia(opts: { allowVideo?: boolean; multiple?: boolean; limit?: number } = {}): Promise<PickedFile[]> {
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: opts.allowVideo ? ['images', 'videos'] : ['images'],
    allowsMultipleSelection: !!opts.multiple,
    selectionLimit: opts.limit ?? (opts.multiple ? 10 : 1),
    quality: 0.85,
    videoMaxDuration: 60,
  });
  if (r.canceled) return [];
  const out: PickedFile[] = [];
  for (const a of r.assets) {
    const isVideo = a.type === 'video';
    if (!isVideo) {
      // Resize large photos before upload: smaller files upload faster on mobile data.
      const resized = await manipulateAsync(a.uri, (a.width ?? 0) > 1600 ? [{ resize: { width: 1600 } }] : [], {
        compress: 0.8,
        format: SaveFormat.JPEG,
      });
      out.push({ uri: resized.uri, mimeType: 'image/jpeg', size: 0, width: resized.width, height: resized.height, kind: 'IMAGE' });
    } else {
      out.push({ uri: a.uri, mimeType: a.mimeType ?? 'video/mp4', size: a.fileSize ?? 0, width: a.width, height: a.height, kind: 'VIDEO', webFile: a.file });
    }
  }
  return out;
}

async function toBlob(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  return res.blob();
}

/** Registers the upload, PUTs the bytes to the signed URL (R2 or local dev storage), then confirms. */
export async function uploadMedia(file: PickedFile, purpose: MediaPurpose): Promise<MediaRef> {
  const blob = file.webFile ?? (await toBlob(file.uri));
  const size = blob.size || file.size;
  const limit = MEDIA_LIMITS[file.kind].maxBytes;
  if (size > limit) throw new ApiError(`File is too large (max ${Math.round(limit / 1048576)} MB)`, 'FILE_TOO_LARGE', 400);

  const { mediaId, upload } = await api.post<{ mediaId: string; upload: { url: string; method: 'PUT'; headers: Record<string, string> } }>(
    '/media/uploads',
    { kind: file.kind, purpose, mimeType: file.mimeType, sizeBytes: size, width: file.width, height: file.height },
  );
  const res = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: Platform.OS === 'web' ? blob : blob });
  if (!res.ok) throw new ApiError('Upload failed. Try again.', 'UPLOAD_FAILED', res.status);
  return api.post<MediaRef>(`/media/${mediaId}/complete`);
}
