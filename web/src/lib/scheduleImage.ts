// Decode and encode the actual pixels: Photos often supplies PNG/WebP files,
// whose bytes must not simply be relabeled as JPEG for the OCR service.
export async function prepareScheduleImage(file: File, signal: AbortSignal): Promise<string> {
  if (file.size > 25_000_000) throw new Error("That image is too large. Crop it to the schedule and try again.");
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => signal.removeEventListener("abort", aborted);
      const aborted = () => { cleanup(); reject(new DOMException("Aborted", "AbortError")); };
      image.onload = () => { cleanup(); resolve(); };
      image.onerror = () => { cleanup(); reject(new Error("Couldn't open that image. Use a PNG or JPEG screenshot from Photos or Files.")); };
      signal.addEventListener("abort", aborted, { once: true });
      if (signal.aborted) return aborted();
      image.src = url;
    });
    signal.throwIfAborted();
    const canvas = document.createElement("canvas");
    // Keep dense grid text readable while bounding memory and upload size.
    let scale = Math.min(1, 2600 / Math.max(image.naturalWidth, image.naturalHeight));
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("The screenshot has no readable image data.");
    for (let attempt = 0; attempt < 6; attempt++) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Couldn't prepare the screenshot. Try reopening the app.");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", attempt === 0 ? 0.94 : 0.85);
      signal.throwIfAborted();
      // Leave headroom below the provider's free 1 MB limit.
      if (data.length * 0.75 <= 900_000) return data.slice(data.indexOf(",") + 1);
      scale *= 0.8;
    }
    throw new Error("Crop the screenshot to just the schedule grid and try again.");
  } finally { image.src = ""; URL.revokeObjectURL(url); }
}
