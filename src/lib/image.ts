export const MAX_IMAGE_EDGE = 1600;
export const IMAGE_QUALITY = 0.8;

/** Target size keeping aspect ratio with the long edge capped. */
export function fitSize(w: number, h: number, max = MAX_IMAGE_EDGE): { width: number; height: number } {
  const long = Math.max(w, h);
  if (long <= max) return { width: w, height: h };
  const s = max / long;
  return { width: Math.round(w * s), height: Math.round(h * s) };
}

/** Compress an image file: long edge ≤ 1600 px, WebP (JPEG fallback) at ~0.8 quality. GIFs are kept as-is. */
export async function compressImage(file: Blob): Promise<Blob> {
  if (file.type === 'image/gif') return file;
  const bmp = await createImageBitmap(file);
  const { width, height } = fitSize(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const toBlob = (type: string) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, IMAGE_QUALITY));
  const webp = await toBlob('image/webp');
  if (webp && webp.type === 'image/webp') return webp;
  return (await toBlob('image/jpeg')) ?? file;
}
