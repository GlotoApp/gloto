import {
  CalendarDays,
  ChevronDown,
  History,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SubLoading from "./SubLoading";

const fmt = (value) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const fmtFecha = (value) => {
  if (!value) return "-";
  const fecha = new Date(`${value}T00:00:00`);
  return fecha.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const fmtHora = (value) => {
  if (!value) return "--";
  const [horas, minutos] = value.split(":").map(Number);
  const fecha = new Date();
  fecha.setHours(horas, minutos, 0, 0);
  return fecha.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const leerCierres = () => {
  try {
    const stored = localStorage.getItem("caja_historial_cierres");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

export default function HistorialCierres() {
  const [cierres, setCierres] = useState(leerCierres);
  const [fechaBusqueda, setFechaBusqueda] = useState("");
  const [expandido, setExpandido] = useState(null);
  const [cierrePendienteEliminar, setCierrePendienteEliminar] = useState(null);
  const [errorEliminar, setErrorEliminar] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 250);
    return () => window.clearTimeout(timer);
  }, []);

  const cierresFiltrados = useMemo(
    () =>
      cierres.filter((cierre) => {
        if (!fechaBusqueda) return true;
        return (cierre.fechaCierre || cierre.fecha) === fechaBusqueda;
      }),
    [cierres, fechaBusqueda],
  );

  const confirmarEliminacion = () => {
    if (!cierrePendienteEliminar) return;
    try {
      const ahora = new Date();
      const registrosEliminados = JSON.parse(
        localStorage.getItem("caja_historial_cierres_eliminados") || "[]",
      );
      const registroEliminacion = {
        id: `${cierrePendienteEliminar.id}-${Date.now()}`,
        datosCierre: cierrePendienteEliminar,
        fechaHoraEliminacion: ahora.toISOString(),
        fechaEliminacion: [
          ahora.getFullYear(),
          String(ahora.getMonth() + 1).padStart(2, "0"),
          String(ahora.getDate()).padStart(2, "0"),
        ].join("-"),
        motivo: "Eliminado desde el historial de cierres.",
      };
      const cierresActualizados = cierres.filter(
        (cierre) => cierre.id !== cierrePendienteEliminar.id,
      );
      localStorage.setItem(
        "caja_historial_cierres_eliminados",
        JSON.stringify([registroEliminacion, ...registrosEliminados]),
      );
      localStorage.setItem(
        "caja_historial_cierres",
        JSON.stringify(cierresActualizados),
      );
      setCierres(cierresActualizados);
      setExpandido(null);
      setCierrePendienteEliminar(null);
      setErrorEliminar("");
    } catch (error) {
      console.error("No se pudo eliminar el cierre del historial:", error);
      setErrorEliminar(
        "No se pudo eliminar el cierre. Intenta nuevamente.",
      );
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white p-4 font-sans selection:bg-violet-500/30">
        <SubLoading
          label="Cargando cierres"
          className="min-h-[calc(100vh-2rem)]"
          fullHeight
          dotClassName="bg-violet-400"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4 font-sans selection:bg-violet-500/30">
      <header className="mx-auto mb-6 max-w-7xl">
        <h1 className="text-2xl font-black tracking-tight text-white">
          Historial de cierres
        </h1>
      </header>

      <main className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-2xl bg-neutral-900/40 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <label className="flex-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              Buscar por fecha de cierre
              <div className="relative mt-1">
                <CalendarDays
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-300"
                />
                <input
                  type="date"
                  value={fechaBusqueda}
                  onChange={(event) => setFechaBusqueda(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-xl bg-neutral-900 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-violet-500/50"
                />
              </div>
            </label>
            {fechaBusqueda && (
              <button
                type="button"
                onClick={() => setFechaBusqueda("")}
                className="min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold text-neutral-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
              >
                Limpiar
              </button>
            )}
          </div>
        </section>

        {cierresFiltrados.length === 0 ? (
          <section className="rounded-2xl bg-neutral-900/40 px-5 py-12 text-center">
            <Search size={28} className="mx-auto mb-3 text-neutral-600" />
            <p className="text-sm font-semibold text-neutral-300">
              {fechaBusqueda
                ? "No hay cierres en esta fecha"
                : "Aun no hay cierres registrados"}
            </p>
          </section>
        ) : (
          <div className="space-y-3">
            {cierresFiltrados.map((cierre) => {
              const abierto = expandido === cierre.id;
              return (
                <section
                  key={cierre.id}
                  className="overflow-hidden rounded-2xl bg-neutral-900/50 transition-colors hover:bg-neutral-900/70"
                >
                  <button
                    type="button"
                    aria-expanded={abierto}
                    onClick={() => setExpandido(abierto ? null : cierre.id)}
                    className="flex w-full flex-col gap-4 rounded-2xl p-4 text-left transition-colors hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/60 sm:flex-row sm:items-center sm:p-5"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-400">
                        <History size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-white">
                          Cierre de caja
                        </p>
                        <p className="mt-1 text-xs text-neutral-400">
                          {cierre.cajero} ·{" "}
                          {fmtFecha(cierre.fechaCierre || cierre.fecha)}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:flex sm:items-center gap-5 sm:gap-8">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                          Ventas
                        </p>
                        <p className="text-base font-bold font-mono text-violet-300">
                          {fmt(cierre.totalVentas)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                          Diferencia
                        </p>
                        <p
                          className={`text-base font-bold font-mono ${cierre.diferencia >= 0 ? "text-emerald-300" : "text-red-300"}`}
                        >
                          {cierre.diferencia >= 0 ? "+" : ""}
                          {fmt(cierre.diferencia)}
                        </p>
                      </div>
                      <ChevronDown
                        size={16}
                        className={`text-neutral-500 transition-transform ${abierto ? "rotate-180" : ""}`}
                      />
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {abierto && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-white/[0.06]"
                      >
                        <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                              Turno
                            </p>
                            <p className="mt-1 text-sm text-neutral-200 font-mono">
                              {fmtFecha(cierre.fechaApertura)} ·{" "}
                              {fmtHora(cierre.horaApertura)} –{" "}
                              {fmtHora(cierre.horaCierre)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                              Efectivo
                            </p>
                            <p className="mt-1 text-sm text-amber-300 font-mono font-bold">
                              {fmt(cierre.totalEfectivo)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                              Tarjeta
                            </p>
                            <p className="mt-1 text-sm text-blue-300 font-mono font-bold">
                              {fmt(cierre.totalTarjeta)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                              Transferencia
                            </p>
                            <p className="mt-1 text-sm text-emerald-300 font-mono font-bold">
                              {fmt(cierre.totalTransferencia)}
                            </p>
                          </div>
                        </div>
                        <div className="flex justify-end px-5 pb-5">
                          <button
                            type="button"
                            onClick={() => {
                              setErrorEliminar("");
                              setCierrePendienteEliminar(cierre);
                            }}
                            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
                          >
                            <Trash2 size={14} />
                            Eliminar cierre
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              );
            })}
          </div>
        )}
      </main>
      {cierrePendienteEliminar && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-close-title"
            className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-neutral-900 p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="delete-close-title"
                  className="text-base font-black text-white"
                >
                  ¿Eliminar este cierre?
                </h2>
                <p className="mt-2 text-sm leading-6 text-neutral-300">
                  El cierre de {cierrePendienteEliminar.cajero} del{" "}
                  {fmtFecha(
                    cierrePendienteEliminar.fechaCierre ||
                      cierrePendienteEliminar.fecha,
                  )}{" "}
                  se quitará del historial y quedará en “Cierres eliminados”.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCierrePendienteEliminar(null);
                  setErrorEliminar("");
                }}
                className="rounded-xl p-2 text-neutral-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
                aria-label="Cancelar eliminación"
              >
                <X size={18} />
              </button>
            </div>
            {errorEliminar && (
              <p role="alert" className="mt-3 text-sm text-red-300">
                {errorEliminar}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCierrePendienteEliminar(null);
                  setErrorEliminar("");
                }}
                className="min-h-10 rounded-xl px-4 py-2.5 text-sm font-semibold text-neutral-300 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarEliminacion}
                className="min-h-10 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
              >
                Sí, eliminar
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
