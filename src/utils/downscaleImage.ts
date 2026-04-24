/**
 * Downscale an image to fit within maxDim pixels on the longest side and
 * re-encode as JPEG. Keeps the base64 payload well under the edge function's
 * 4 MB cap while preserving legibility of transaction rows. Returns a data URL.
 */
export async function downscaleImage(file: File, maxDim = 1600, quality = 0.85): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to decode image'));
    el.src = dataUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.drawImage(img, 0, 0, w, h);

  return canvas.toDataURL('image/jpeg', quality);
}
