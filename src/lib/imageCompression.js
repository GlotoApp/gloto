const MAX_IMAGE_BYTES = 500 * 1024;
const MIN_DIMENSION = 480;
const QUALITY_LEVELS = [0.82, 0.72, 0.62];

const encodeImage = (canvas, type, quality) =>
  new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });

export const compressCanvasToImage = async (
  sourceCanvas,
  maxBytes = MAX_IMAGE_BYTES,
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
  let outputType = "image/webp";

  while (true) {
    outputCanvas.width = width;
    outputCanvas.height = height;
    context.drawImage(sourceCanvas, 0, 0, width, height);

    for (const quality of QUALITY_LEVELS) {
      let blob;
      try {
        blob = await encodeImage(outputCanvas, outputType, quality);
      } catch (error) {
        if (outputType !== "image/webp") throw error;
        outputType = "image/png";
      }

      if (outputType === "image/webp" && (!blob || blob.type !== outputType)) {
        if (blob && blob.type !== "image/png") {
          throw new Error(
            "El navegador devolvió un formato de imagen no compatible.",
          );
        }
        outputType = "image/png";
      }

      if (!blob || blob.type !== outputType) {
        blob = await encodeImage(outputCanvas, outputType, quality);
      }
      if (!blob || blob.type !== outputType) {
        throw new Error("No se pudo comprimir la imagen en un formato compatible.");
      }

      if (!smallestBlob || blob.size < smallestBlob.size) smallestBlob = blob;
      if (blob.size <= maxBytes) return blob;
    }

    if (Math.max(width, height) <= MIN_DIMENSION) return smallestBlob;

    width = Math.max(1, Math.round(width * 0.82));
    height = Math.max(1, Math.round(height * 0.82));
  }
};
