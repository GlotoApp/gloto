const MAX_WEBP_BYTES = 500 * 1024;
const MIN_DIMENSION = 480;
const QUALITY_LEVELS = [0.82, 0.72, 0.62];

const encodeWebP = (canvas, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("No se pudo comprimir la imagen."));
        } else if (blob.type !== "image/webp") {
          reject(new Error("Este navegador no pudo convertir la imagen a WebP."));
        } else {
          resolve(blob);
        }
      },
      "image/webp",
      quality,
    );
  });

export const compressCanvasToWebP = async (
  sourceCanvas,
  maxBytes = MAX_WEBP_BYTES,
) => {
  const outputCanvas = document.createElement("canvas");
  const context = outputCanvas.getContext("2d");
  if (!context) throw new Error("No se pudo preparar la compresión de imagen.");

  const initialScale = Math.min(
    1,
    1400 / Math.max(sourceCanvas.width, sourceCanvas.height),
  );
  let width = Math.max(1, Math.round(sourceCanvas.width * initialScale));
  let height = Math.max(1, Math.round(sourceCanvas.height * initialScale));
  let smallestBlob = null;

  while (true) {
    outputCanvas.width = width;
    outputCanvas.height = height;
    context.drawImage(sourceCanvas, 0, 0, width, height);

    for (const quality of QUALITY_LEVELS) {
      const blob = await encodeWebP(outputCanvas, quality);
      if (!smallestBlob || blob.size < smallestBlob.size) smallestBlob = blob;
      if (blob.size <= maxBytes) return blob;
    }

    if (Math.max(width, height) <= MIN_DIMENSION) return smallestBlob;

    width = Math.max(1, Math.round(width * 0.82));
    height = Math.max(1, Math.round(height * 0.82));
  }
};
