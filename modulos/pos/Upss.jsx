import { Home, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Upss() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-white font-sans">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-neutral-900/70 p-8 text-center shadow-2xl shadow-black/30">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/10 text-violet-300 ring-1 ring-violet-500/20">
          <span className="text-3xl font-black">?</span>
        </div>

        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-violet-400">
          Ruta no encontrada
        </p>

        <h1 className="mt-3 text-3xl font-black tracking-tight text-white">
          Upss...
        </h1>

        <p className="mt-3 text-sm leading-6 text-neutral-300">
          La página que buscas no existe o ya no está disponible.
        </p>

        <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4 text-left">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">
            Qué puedes hacer
          </p>
          <ul className="mt-3 space-y-2 text-sm text-neutral-300">
            <li>• Verifica la URL escrita.</li>
            <li>• Vuelve al inicio para continuar navegando.</li>
            <li>• Si el problema persiste, contacta soporte.</li>
          </ul>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-neutral-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-200 transition hover:border-white/20 hover:text-white"
          >
            <ArrowLeft size={14} />
            Volver
          </button>

          <button
            type="button"
            onClick={() => navigate("/pos")}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-violet-200 transition hover:border-violet-400 hover:bg-violet-500/20"
          >
            <Home size={14} />
            Ir al inicio
          </button>
        </div>
      </div>
    </div>
  );
}
