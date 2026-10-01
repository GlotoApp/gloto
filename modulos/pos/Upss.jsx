export default function Upss() {
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

      </div>
    </div>
  );
}
