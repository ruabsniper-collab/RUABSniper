// Pixel-color sampling for a schedule screenshot -- a second, independent
// signal for a class's campus alongside the room/campus TEXT extraction in
// scheduleOcr.ts. WebReg's own Calendar view colors every class block by
// campus and prints a legend of campus-name chips (in those same colors)
// above the day headers, so matching a block's own color against that
// legend can recognize the campus even when the small room/campus text
// underneath a class doesn't OCR cleanly. Browser-only (canvas) -- there is
// no server-side image processing anywhere in this app.

export type RGB = { r: number; g: number; b: number };

/** Decodes a base64 JPEG (same payload runScheduleOcr takes -- no "data:" prefix) into a canvas for pixel sampling. */
export async function loadImageCanvas(
  base64Jpeg: string,
): Promise<{ ctx: CanvasRenderingContext2D; width: number; height: number }> {
  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Couldn't decode the image for color sampling."));
  });
  img.src = `data:image/jpeg;base64,${base64Jpeg}`;
  await loaded;

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.drawImage(img, 0, 0);
  return { ctx, width: img.naturalWidth, height: img.naturalHeight };
}

/**
 * Average color over a region (an OCR line's own bounding box, in practice)
 * clamped to the canvas bounds. Averaging the whole box rather than trying
 * to dodge the text glyphs inside it is a deliberate simplification -- dark
 * text pixels pull every campus's color toward gray by a roughly similar
 * amount given similar text-to-background coverage, which shouldn't erase
 * the hue difference between WebReg's visually distinct pastel campus
 * colors, and it avoids guessing at chip padding this has no way to know.
 */
export function sampleRegionColor(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number,
): RGB | null {
  const x = Math.max(0, Math.min(Math.round(left), canvasWidth - 1));
  const y = Math.max(0, Math.min(Math.round(top), canvasHeight - 1));
  const w = Math.max(1, Math.min(Math.round(width), canvasWidth - x));
  const h = Math.max(1, Math.min(Math.round(height), canvasHeight - y));

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(x, y, w, h).data;
  } catch {
    return null; // e.g. a tainted canvas -- shouldn't happen for a locally-picked file, but never crash the import over a color hint
  }

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count++;
  }
  if (count === 0) return null;
  return { r: r / count, g: g / count, b: b / count };
}

function colorDistance(a: RGB, b: RGB): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/**
 * Nearest campus in a legend built from this same screenshot, or null if
 * nothing is close enough to trust -- e.g. the sampled region turned out to
 * be plain white/gray (missed the colored cell entirely, or this particular
 * block genuinely isn't color-coded). 60 is a starting guess for "close
 * enough," not something verified against a real screenshot yet.
 */
export function nearestCampusByColor(color: RGB, legend: Map<string, RGB>, maxDistance = 60): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const [campus, legendColor] of legend) {
    const d = colorDistance(color, legendColor);
    if (d < bestDist) {
      bestDist = d;
      best = campus;
    }
  }
  return best != null && bestDist <= maxDistance ? best : null;
}
