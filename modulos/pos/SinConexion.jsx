import { WifiOff, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

export default function SinConexion({
  visible = true,
  title = "Sin conexión",
  description = "No se puede cargar la información en este momento.",
  retryLabel = "Reintentar",
  onRetry,
  fullHeight = true,
}) {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateStatus = () => setIsOnline(window.navigator.onLine);

    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);

    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  const shouldShow = visible && !isOnline;

  if (!shouldShow) return null;

  return (
    <div
      className={[
        "flex items-center justify-center bg-neutral-950 text-white",
        fullHeight ? "min-h-screen" : "min-h-[320px]",
        "px-4 font-sans",
      ].join(" ")}
    >
      <div className="flex w-full max-w-lg flex-col items-center justify-center rounded-2xl border border-white/10 bg-neutral-900/70 p-8 text-center shadow-2xl shadow-black/30">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-400 ring-1 ring-red-500/20">
          <WifiOff size={28} />
        </div>

        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.28em] text-red-400">
          Estado de red
        </p>

        <h2 className="text-2xl font-black tracking-tight text-white">
          {title}
        </h2>

        <p className="mt-3 text-sm leading-6 text-neutral-300">{description}</p>

        <div className="mt-5 w-full rounded-xl border border-white/10 bg-black/20 p-4 text-left">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">
            Qué puedes hacer ahora
          </p>
          <ul className="mt-3 space-y-2 text-sm text-neutral-300">
            <li>• Verifica que tu Wi‑Fi o datos móviles estén activos.</li>
            <li>• Reintenta la conexión cuando la señal vuelva.</li>
            <li>• Si el problema continúa, contacta al soporte técnico.</li>
          </ul>
        </div>

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-violet-200 transition hover:border-violet-400 hover:bg-violet-500/20"
          >
            <RefreshCw size={14} />
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
