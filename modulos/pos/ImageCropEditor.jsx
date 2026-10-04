import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const getInitialCrop = (image, type) => {
  const targetRatio = type === "cover" ? 16 / 7 : 1;
  const imageRatio = image.naturalWidth / image.naturalHeight;

  if (imageRatio > targetRatio) {
    const width = targetRatio / imageRatio;
    return { x: (1 - width) / 2, y: 0, width, height: 1 };
  }

  const height = imageRatio / targetRatio;
  return { x: 0, y: (1 - height) / 2, width: 1, height };
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const resizeCrop = (crop, handle, deltaX, deltaY, ratio) => {
  const horizontal = handle.includes("w") ? -1 : handle.includes("e") ? 1 : 0;
  const vertical = handle.includes("n") ? -1 : handle.includes("s") ? 1 : 0;
  const centerX = crop.x + crop.width / 2;
  const centerY = crop.y + crop.height / 2;
  let anchorX;
  let anchorY;
  let maxWidth;
  let widthChange;

  if (horizontal && vertical) {
    anchorX = horizontal > 0 ? crop.x : crop.x + crop.width;
    anchorY = vertical > 0 ? crop.y : crop.y + crop.height;
    maxWidth = Math.min(
      horizontal > 0 ? 1 - anchorX : anchorX,
      (vertical > 0 ? 1 - anchorY : anchorY) * ratio,
    );
    const horizontalChange = horizontal * deltaX;
    const verticalChange = vertical * deltaY * ratio;
    widthChange =
      Math.abs(horizontalChange) >= Math.abs(verticalChange)
        ? horizontalChange
        : verticalChange;
  } else if (horizontal) {
    anchorX = horizontal > 0 ? crop.x : crop.x + crop.width;
    anchorY = centerY;
    maxWidth = Math.min(
      horizontal > 0 ? 1 - anchorX : anchorX,
      Math.min(centerY, 1 - centerY) * 2 * ratio,
    );
    widthChange = horizontal * deltaX;
  } else {
    anchorX = centerX;
    anchorY = vertical > 0 ? crop.y : crop.y + crop.height;
    maxWidth = Math.min(
      Math.min(centerX, 1 - centerX) * 2,
      (vertical > 0 ? 1 - anchorY : anchorY) * ratio,
    );
    widthChange = vertical * deltaY * ratio;
  }

  const width = clamp(
    crop.width + widthChange,
    Math.min(0.04, maxWidth),
    maxWidth,
  );
  const height = width / ratio;
  const x = horizontal
    ? horizontal > 0
      ? anchorX
      : anchorX - width
    : anchorX - width / 2;
  const y = vertical
    ? vertical > 0
      ? anchorY
      : anchorY - height
    : anchorY - height / 2;

  return { x, y, width, height };
};

const HANDLES = [
  ["nw", "Esquina superior izquierda"],
  ["n", "Lado superior"],
  ["ne", "Esquina superior derecha"],
  ["e", "Lado derecho"],
  ["se", "Esquina inferior derecha"],
  ["s", "Lado inferior"],
  ["sw", "Esquina inferior izquierda"],
  ["w", "Lado izquierdo"],
];

const ImageCropEditor = ({
  imageEditor,
  onConfirm,
  onClose,
  saving,
  error,
  confirmLabel = "Recortar y subir",
}) => {
  const [crop, setCrop] = useState(null);
  const [drag, setDrag] = useState(null);
  const [imageRatio, setImageRatio] = useState(1);
  const [imageLoadError, setImageLoadError] = useState("");
  const [processing, setProcessing] = useState(false);
  const stageRef = useRef(null);

  if (!imageEditor) return null;

  const cropRatio =
    (imageEditor.type === "cover" ? 16 / 7 : 1) / imageRatio;

  const startDrag = (event, handle) => {
    event.preventDefault();
    event.stopPropagation();
    if (!crop || !stageRef.current) return;
    stageRef.current.setPointerCapture(event.pointerId);
    setDrag({
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startCrop: crop,
    });
  };

  const moveCrop = (event) => {
    if (!drag || !stageRef.current) return;
    const bounds = stageRef.current.getBoundingClientRect();
    const deltaX = (event.clientX - drag.startX) / bounds.width;
    const deltaY = (event.clientY - drag.startY) / bounds.height;

    if (drag.handle === "move") {
      setCrop({
        ...drag.startCrop,
        x: clamp(drag.startCrop.x + deltaX, 0, 1 - drag.startCrop.width),
        y: clamp(drag.startCrop.y + deltaY, 0, 1 - drag.startCrop.height),
      });
      return;
    }

    setCrop(resizeCrop(drag.startCrop, drag.handle, deltaX, deltaY, cropRatio));
  };

  const handleConfirm = async () => {
    if (!crop || saving || processing || imageLoadError) return;
    setProcessing(true);
    try {
      await onConfirm(crop);
    } finally {
      setProcessing(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="store-image-editor-title"
      className="fixed inset-0 z-[100] flex h-[100dvh] w-screen items-center justify-center overflow-y-auto bg-black/90 p-3 sm:p-6"
    >
      <div className="flex max-h-full w-full max-w-4xl flex-col overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900 p-4 shadow-2xl sm:rounded-3xl sm:p-7">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3
              id="store-image-editor-title"
              className="text-sm font-black uppercase tracking-wider text-white"
            >
              Recortar{" "}
              {imageEditor.type === "cover"
                ? "portada"
                : imageEditor.type === "product"
                  ? "imagen del producto"
                  : "logo"}
            </h3>
            <p className="mt-1 text-xs text-neutral-400">
              Arrastra el marco para encuadrar y sus bordes para ajustar el
              recorte.{" "}
              {imageEditor.type === "cover"
                ? "Se conservará el formato horizontal de la portada."
                : "Se conservará el formato cuadrado."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar editor de imagen"
            className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-white"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-neutral-950 p-2 sm:p-4">
          <div
            ref={stageRef}
            className="relative max-h-[56dvh] max-w-full touch-none select-none"
            style={{
              width: `min(100%, 800px, ${56 * imageRatio}dvh)`,
              aspectRatio: imageRatio,
            }}
            onPointerMove={moveCrop}
            onPointerUp={() => setDrag(null)}
            onPointerCancel={() => setDrag(null)}
          >
            <img
              src={imageEditor.url}
              alt="Imagen para recortar"
              draggable="false"
              className="absolute inset-0 h-full w-full object-fill"
              onLoad={(event) => {
                const image = event.currentTarget;
                if (!image.naturalWidth || !image.naturalHeight) {
                  setImageLoadError("No se pudo leer esta imagen.");
                  return;
                }
                setImageLoadError("");
                setImageRatio(image.naturalWidth / image.naturalHeight);
                setCrop(getInitialCrop(image, imageEditor.type));
              }}
              onError={() =>
                setImageLoadError("No se pudo cargar la imagen seleccionada.")
              }
            />
            {crop && (
              <>
                <div
                  className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                  style={{
                    left: `${crop.x * 100}%`,
                    top: `${crop.y * 100}%`,
                    width: `${crop.width * 100}%`,
                    height: `${crop.height * 100}%`,
                  }}
                >
                  <div className="pointer-events-none absolute inset-x-1/3 inset-y-0 border-x border-white/50" />
                  <div className="pointer-events-none absolute inset-y-1/3 inset-x-0 border-y border-white/50" />
                </div>
                <div
                  role="presentation"
                  onPointerDown={(event) => startDrag(event, "move")}
                  className="absolute cursor-move touch-none"
                  style={{
                    left: `${crop.x * 100}%`,
                    top: `${crop.y * 100}%`,
                    width: `${crop.width * 100}%`,
                    height: `${crop.height * 100}%`,
                  }}
                />
                {HANDLES.map(([handle, label]) => {
                  const horizontal = handle.includes("w")
                    ? crop.x
                    : handle.includes("e")
                      ? crop.x + crop.width
                      : crop.x + crop.width / 2;
                  const vertical = handle.includes("n")
                    ? crop.y
                    : handle.includes("s")
                      ? crop.y + crop.height
                      : crop.y + crop.height / 2;
                  const isCorner = handle.length === 2;
                  const grip = isCorner
                    ? `h-4 w-4 ${
                        handle === "nw"
                          ? "border-l-2 border-t-2"
                          : handle === "ne"
                            ? "border-r-2 border-t-2"
                            : handle === "se"
                              ? "border-b-2 border-r-2"
                              : "border-b-2 border-l-2"
                      }`
                    : handle === "n" || handle === "s"
                      ? "h-0.5 w-5 rounded-full bg-white/90"
                      : "h-5 w-0.5 rounded-full bg-white/90";

                  return (
                    <button
                      key={handle}
                      type="button"
                      aria-label={`Ajustar ${label.toLowerCase()}`}
                      onPointerDown={(event) => startDrag(event, handle)}
                      className={`absolute z-10 flex h-8 w-8 touch-none items-center justify-center border-0 bg-transparent p-0 text-white transition-colors hover:text-violet-300 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400 ${
                        handle === "n" || handle === "s"
                          ? "cursor-ns-resize"
                          : handle === "e" || handle === "w"
                            ? "cursor-ew-resize"
                            : handle === "nw" || handle === "se"
                              ? "cursor-nwse-resize"
                              : "cursor-nesw-resize"
                      }`}
                      style={{
                        left: `${horizontal * 100}%`,
                        top: `${vertical * 100}%`,
                        transform: "translate(-50%, -50%)",
                      }}
                    >
                      <span className={`pointer-events-none block ${grip}`} />
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {(error || imageLoadError) && (
          <p role="alert" className="mt-3 text-xs text-red-400">
            {error || imageLoadError}
          </p>
        )}
        <div className="mt-4 flex flex-col-reverse gap-2 border-t border-white/10 pt-4 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl px-4 py-3 text-xs font-bold text-neutral-400 hover:bg-white/5 sm:w-auto sm:py-2"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || processing || !crop || Boolean(imageLoadError)}
            className="w-full rounded-xl bg-violet-600 px-4 py-3 text-xs font-black text-white disabled:opacity-40 sm:w-auto sm:py-2"
          >
            {processing ? "Preparando imagen..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ImageCropEditor;
