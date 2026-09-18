import React, { useState } from "react";
import { createPortal } from "react-dom";

const ImageCropEditor = ({
  imageEditor,
  setImageEditor,
  onConfirm,
  saving,
}) => {
  const [dragging, setDragging] = useState(false);

  if (!imageEditor) return null;

  const moveImage = (event) => {
    if (!dragging) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const offsetX = Math.min(
      100,
      Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100),
    );
    const offsetY = Math.min(
      100,
      Math.max(0, ((event.clientY - bounds.top) / bounds.height) * 100),
    );
    setImageEditor((current) => ({ ...current, offsetX, offsetY }));
  };

  const closeEditor = () => {
    URL.revokeObjectURL(imageEditor.url);
    setImageEditor(null);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center bg-black/90 p-0 sm:h-screen sm:p-6">
      <div className="flex h-full max-h-[100dvh] w-full max-w-5xl flex-col overflow-y-auto rounded-none border border-white/10 bg-neutral-900 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:h-[min(92vh,820px)] sm:max-h-none sm:overflow-hidden sm:rounded-3xl sm:p-8">
        <div>
          <h3 className="text-sm font-black uppercase text-white">
            Ajustar {imageEditor.tipo === "logo" ? "logo" : "portada"}
          </h3>
          <p className="mt-1 text-[10px] uppercase text-neutral-500">
            Revisa el encuadre antes de guardarlo
          </p>
        </div>

        <div
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
          }}
          onPointerMove={moveImage}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          onPointerLeave={() => setDragging(false)}
          className={`relative mx-auto flex w-full cursor-grab touch-none select-none items-center justify-center overflow-hidden bg-black active:cursor-grabbing ${imageEditor.tipo === "logo" ? "aspect-square max-h-[52dvh] max-w-lg" : "aspect-video max-h-[52dvh] max-w-4xl"}`}
        >
          <img
            src={imageEditor.url}
            alt="Vista previa editable"
            className="h-full w-full object-cover"
            style={{
              objectPosition: `${imageEditor.offsetX}% ${imageEditor.offsetY}%`,
              transform: `scale(${imageEditor.zoom})`,
            }}
          />
          <div className="pointer-events-none absolute inset-0 opacity-60">
            <div className="absolute left-1/3 top-0 h-full border-l border-white/50" />
            <div className="absolute left-2/3 top-0 h-full border-l border-white/50" />
            <div className="absolute left-0 top-1/3 w-full border-t border-white/50" />
            <div className="absolute left-0 top-2/3 w-full border-t border-white/50" />
            <div className="absolute inset-[16%] border border-white/70" />
          </div>
          <span className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white">
            Arrastra para centrar
          </span>
        </div>

        <label className="mt-4 block text-[10px] font-black uppercase text-neutral-400 sm:mt-5">
          Zoom
          <input
            type="range"
            min="1"
            max="2.5"
            step="0.05"
            value={imageEditor.zoom}
            onChange={(event) =>
              setImageEditor({
                ...imageEditor,
                zoom: Number(event.target.value),
              })
            }
            className="mt-3 min-h-6 w-full accent-violet-500"
          />
        </label>

        <div className="flex flex-col-reverse gap-2 border-t border-white/10 pt-4 mt-4 sm:flex-row sm:justify-end sm:gap-3 sm:mt-5">
          <button
            type="button"
            onClick={closeEditor}
            className="w-full rounded-xl px-4 py-3 text-[10px] font-black uppercase text-neutral-400 hover:bg-white/5 sm:w-auto sm:py-2"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="w-full rounded-xl bg-violet-600 px-4 py-3 text-[10px] font-black uppercase text-white disabled:opacity-40 sm:w-auto sm:py-2"
          >
            {saving ? "Guardando..." : "Usar esta imagen"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ImageCropEditor;
