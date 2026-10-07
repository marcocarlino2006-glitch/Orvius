/**
 * Shrink a phone photo before upload: a 12-megapixel shot is 4–8 MB, which is
 * slow on a job site's signal and far more than a job record needs.
 */
export async function shrinkPhoto(file: File, maxSide = 1600, quality = 0.82): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That file isn't a photo this phone can read."));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This phone can't prepare photos.");
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare the photo."))), "image/jpeg", quality),
    );
    if (blob.size > 1_400_000 && maxSide > 1000) return shrinkPhoto(file, Math.round(maxSide * 0.75), 0.72);
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
