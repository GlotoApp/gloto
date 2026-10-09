import { Trash2, ChevronDown, History } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SubLoading from "./SubLoading";

const leerEliminaciones = () => {
  try {
    const stored = localStorage.getItem("caja_historial_cierres_eliminados");
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("No se pudo cargar el historial de cierres eliminados:", error);
    return [];
  }
};

const fmt = (n) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);

const fmtFechaHora = (value) => {
  if (!value) return "—";
  const fecha = new Date(value);
  if (Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const fmtFecha = (fechaStr) => {
  if (!fechaStr) return "—";
  const fecha = new Date(fechaStr + "T00:00:00");
  return fecha.toLocaleDateString("es-CO", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export default function CierresEliminados() {
  const [registroEliminaciones] = useState(leerEliminaciones);
  const [expandidoId, setExpandidoId] = useState(null);
  const [fechaBusqueda, setFechaBusqueda] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 250);
    return () => window.clearTimeout(timer);
  }, []);

  const registrosFiltrados = useMemo(() => {
    return registroEliminaciones.filter((registro) => {
      if (!fechaBusqueda) return true;
      const fechaRegistro =
        registro.fechaEliminacion ||
        String(registro.fechaHoraEliminacion).slice(0, 10);
      return fechaRegistro === fechaBusqueda;
    });
  }, [registroEliminaciones, fechaBusqueda]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-white p-4 font-sans selection:bg-violet-500/30">
        <SubLoading
          label="Cargando cierres eliminados"
          className="min-h-[calc(100vh-2rem)]"
          fullHeight
          dotClassName="bg-violet-400"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-white p-4 font-sans selection:bg-violet-500/30">
      {/* ════ HEADER ════ */}
      <header className="max-w-7xl mx-auto mb-6">
        <h1 className="text-2xl font-black tracking-tight text-white">
          Cierres eliminados
        </h1>
        {/* Buscador por fecha */}
        <div className="mt-5 flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-400">
              Buscar por fecha de eliminación
            </label>
            <input
              type="date"
              value={fechaBusqueda}
              onChange={(e) => setFechaBusqueda(e.target.value)}
              className="min-h-11 w-full rounded-xl bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-violet-500/50"
            />
          </div>
          {fechaBusqueda && (
            <button
              type="button"
              onClick={() => setFechaBusqueda("")}
              className="min-h-11 rounded-xl px-4 py-2.5 text-xs font-bold text-neutral-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
            >
              Limpiar
            </button>
          )}
        </div>
      </header>

      {/* ════ CONTENIDO ════ */}
      <main className="max-w-7xl mx-auto">
        {registrosFiltrados.length === 0 ? (
          <div className="rounded-2xl bg-neutral-900/40 px-5 py-12 text-center">
            <Trash2 size={40} className="mx-auto mb-4 text-neutral-600" />
            <p className="text-sm font-semibold text-neutral-300">
              {fechaBusqueda
                ? "No hay registros para esta fecha"
                : "No hay registros de eliminación"}
            </p>
            <p className="mt-2 text-sm text-neutral-500">
              {fechaBusqueda
                ? "Intenta con otra fecha"
                : "Los cierres que se eliminen aparecerán aquí para auditoría"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Resumen */}
            <div className="rounded-xl bg-neutral-900/30 px-4 py-3">
              <p className="text-sm font-semibold text-neutral-200">
                Historial de eliminaciones
              </p>
              <p className="mt-1 text-sm text-neutral-400">
                Total de cierres eliminados:{" "}
                <span className="font-bold text-red-300">
                  {registrosFiltrados.length}
                </span>
                {fechaBusqueda && (
                  <span className="ml-2 text-xs text-neutral-500">
                    (en {fechaBusqueda})
                  </span>
                )}
              </p>
            </div>

            {/* Lista de eliminaciones */}
            {registrosFiltrados.map((registro) => {
              const isExpanded = expandidoId === registro.id;
              const cierre = registro.datosCierre;

              return (
                <div
                  key={registro.id}
                  className={`overflow-hidden rounded-2xl transition-colors duration-300 ${
                    isExpanded
                      ? "bg-neutral-900/70"
                      : "bg-neutral-900/40 hover:bg-neutral-900/60"
                  }`}
                >
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandidoId(isExpanded ? null : registro.id)
                    }
                    className="grid w-full grid-cols-2 items-center gap-4 rounded-2xl p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/60 md:grid-cols-12"
                  >
                    <div className="col-span-2 md:col-span-3">
                      <div className="flex items-center gap-3">
                        <span className="rounded-xl bg-red-500/10 p-2.5 text-red-300">
                          <Trash2 size={16} />
                        </span>
                        <p className="text-sm font-bold text-red-300">
                          Cierre de caja
                        </p>
                      </div>
                    </div>

                    <div className="col-span-2 md:col-span-3">
                      <p className="text-sm font-semibold text-white">
                        {cierre.cajero}
                      </p>
                      <p className="mt-1 text-sm text-neutral-400">
                        {fmtFecha(cierre.fechaCierre || cierre.fecha)}
                      </p>
                    </div>

                    <div className="col-span-2 md:col-span-3">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                        Eliminado el
                      </p>
                      <p className="text-sm text-neutral-300">
                        {fmtFechaHora(registro.fechaHoraEliminacion)}
                      </p>
                    </div>

                    {/* Toggle */}
                    <div className="col-span-2 md:col-span-3 flex justify-end">
                      <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        className="rounded-full bg-white/5 p-2 text-neutral-400"
                      >
                        <ChevronDown size={16} />
                      </motion.div>
                    </div>
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-white/[0.06] bg-black/10"
                      >
                        <div className="space-y-6 p-5 sm:p-6">
                          {/* Información del Cierre Eliminado */}
                          <div>
                            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-neutral-400">
                              Datos del cierre eliminado
                            </p>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                              <div className="rounded-xl bg-neutral-900/60 p-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                  Ventas
                                </p>
                                <p className="mt-1 text-base font-bold text-violet-300">
                                  {fmt(cierre.totalVentas)}
                                </p>
                              </div>
                              <div className="rounded-xl bg-neutral-900/60 p-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                  Responsable
                                </p>
                                <p className="mt-1 text-sm font-semibold text-white">
                                  {cierre.cajero}
                                </p>
                              </div>
                              <div className="rounded-xl bg-neutral-900/60 p-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                  Fecha
                                </p>
                                <p className="mt-1 text-sm font-mono text-neutral-200">
                                  {fmtFecha(cierre.fecha)}
                                </p>
                              </div>
                              <div className="rounded-xl bg-neutral-900/60 p-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                  Diferencia
                                </p>
                                <p
                                  className={`mt-1 text-base font-mono font-bold ${
                                    cierre.diferencia === 0
                                      ? "text-emerald-400"
                                      : cierre.diferencia > 0
                                        ? "text-blue-400"
                                        : "text-red-400"
                                  }`}
                                >
                                  {fmt(cierre.diferencia)}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Desglose de Métodos */}
                          <div>
                            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-neutral-400">
                              Desglose por método
                            </p>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                              <div className="rounded-xl bg-neutral-900/60 p-3">
                                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                  Efectivo
                                </p>
                                <p className="text-lg font-bold font-mono text-amber-300">
                                  {fmt(cierre.totalEfectivo)}
                                </p>
                              </div>
                              <div className="rounded-xl bg-neutral-900/60 p-3">
                                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                  Transferencia
                                </p>
                                <p className="text-lg font-bold font-mono text-emerald-300">
                                  {fmt(cierre.totalTransferencia)}
                                </p>
                              </div>
                              <div className="rounded-xl bg-neutral-900/60 p-3">
                                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                  Tarjeta
                                </p>
                                <p className="text-lg font-bold font-mono text-blue-300">
                                  {fmt(cierre.totalTarjeta)}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Motivo de Eliminación */}
                          <div className="rounded-xl bg-red-500/[0.07] p-4">
                            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-red-300">
                              Motivo de eliminación
                            </p>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
                              {registro.motivo}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 text-sm text-neutral-400">
                            <History size={14} />
                            Eliminado el{" "}
                            {fmtFechaHora(registro.fechaHoraEliminacion)}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
