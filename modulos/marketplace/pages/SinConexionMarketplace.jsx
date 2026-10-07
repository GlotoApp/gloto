import { RefreshCw, WifiOff } from "lucide-react";

export default function SinConexionMarketplace() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 font-sans text-white">
      <section className="flex w-full max-w-md flex-col items-center rounded-2xl border border-white/10 bg-neutral-900/70 p-8 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/10 text-violet-300">
          <WifiOff size={28} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          ¡Ups! Se perdió la conexión
        </h1>
        <p className="mt-3 text-sm leading-6 text-neutral-300">
          Parece que no hay internet por ahora. Revisa tu conexión y vuelve a
          intentarlo para continuar con tu pedido.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-500"
        >
          <RefreshCw size={16} />
          Intentar de nuevo
        </button>
      </section>
    </main>
  );
}
