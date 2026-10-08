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
      <header className="max-w-7xl mx-auto mb-2">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-black tracking-tighter">
                Cierres eliminados
              </h1>
            </div>
          </div>
        </div>

        {/* Buscador por fecha */}
        <div className="mt-6 flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-neutral-400 uppercase tracking-wider font-black block mb-2">
              🔍 Buscar por Fecha de Eliminación
            </label>
            <input
              type="date"
              value={fechaBusqueda}
              onChange={(e) => setFechaBusqueda(e.target.value)}
              className="w-full bg-neutral-900/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-primary-container/50 transition-colors"
            />
          </div>
          {fechaBusqueda && (
            <button
              onClick={() => setFechaBusqueda("")}
              className="px-4 py-2.5 text-xs font-black uppercase tracking-wider bg-neutral-900/40 border border-white/10 rounded-lg text-neutral-400 hover:text-white hover:border-white/20 transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>
      </header>

      {/* ════ CONTENIDO ════ */}
      <main className="max-w-7xl mx-auto">
        {registrosFiltrados.length === 0 ? (
          <div className="bg-neutral-900/40 border border-white/5 rounded-2xl p-12 text-center">
            <Trash2 size={48} className="mx-auto text-neutral-600 mb-4" />
            <p className="text-sm font-mono text-neutral-500 uppercase tracking-widest">
              {fechaBusqueda
                ? "No hay registros para esta fecha"
                : "No hay registros de eliminación"}
            </p>
            <p className="text-xs text-neutral-600 mt-2">
              {fechaBusqueda
                ? "Intenta con otra fecha"
                : "Los cierres que se eliminen aparecerán aquí para auditoría"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Resumen */}
            <div className="bg-neutral-900/20 border border-white/5 p-4 rounded-xl">
                <p className="text-xs font-black tracking-widest uppercase text-neutral-400">
                  Historial de eliminaciones
              </p>
              <p className="text-sm text-neutral-300 mt-2">
                Total de cierres eliminados:{" "}
                <span className="text-red-400 font-bold">
                  {registrosFiltrados.length}
                </span>
                {fechaBusqueda && (
                  <span className="text-neutral-500 text-xs ml-2">
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
                  className={`border rounded-2xl transition-all duration-300 ${
                    isExpanded
                      ? "bg-neutral-900/80 border-red-500/30"
                      : "bg-neutral-900/40 border-white/5 hover:border-white/10"
                  }`}
                >
                  <button
                    onClick={() =>
                      setExpandidoId(isExpanded ? null : registro.id)
                    }
                    className="w-full p-4 text-left grid grid-cols-2 md:grid-cols-12 items-center gap-4"
                  >
                    <div className="col-span-2 md:col-span-3">
                      <div className="flex items-center gap-3">
                        <span className="rounded-xl bg-red-500/10 p-2.5 text-red-300">
                          <Trash2 size={16} />
                        </span>
                        <p className="text-base font-semibold text-red-300">
                          Cierre de caja
                        </p>
                      </div>
                    </div>

                    <div className="col-span-2 md:col-span-3">
                      <p className="text-sm font-semibold text-neutral-200">
                        {cierre.cajero}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {fmtFecha(cierre.fechaCierre || cierre.fecha)}
                      </p>
                    </div>

                    <div className="col-span-2 md:col-span-3">
                      <p className="text-[9px] text-neutral-500 uppercase tracking-wider mb-0.5">
                        Eliminado el
                      </p>
                      <p className="text-xs text-neutral-400">
                        {fmtFechaHora(registro.fechaHoraEliminacion)}
                      </p>
                    </div>

                    {/* Toggle */}
                    <div className="col-span-2 md:col-span-3 flex justify-end">
                      <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        className="p-2 bg-white/5 rounded-full text-neutral-500"
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
                        className="overflow-hidden border-t border-white/5 bg-black/20"
                      >
                        <div className="p-6 space-y-5">
                          {/* Información del Cierre Eliminado */}
                          <div>
                            <p className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-3">
                              📊 Datos del Cierre Eliminado
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="bg-neutral-900/40 rounded-lg p-3">
                                <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-black">
                                  Ventas
                                </p>
                                <p className="text-sm font-semibold text-violet-300 mt-1">
                                  {fmt(cierre.totalVentas)}
                                </p>
                              </div>
                              <div className="bg-neutral-900/40 rounded-lg p-3">
                                <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-black">
                                  Responsable
                                </p>
                                <p className="text-sm font-semibold text-white mt-1">
                                  {cierre.cajero}
                                </p>
                              </div>
                              <div className="bg-neutral-900/40 rounded-lg p-3">
                                <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-black">
                                  Fecha
                                </p>
                                <p className="text-sm font-mono text-neutral-300 mt-1">
                                  {fmtFecha(cierre.fecha)}
                                </p>
                              </div>
                              <div className="bg-neutral-900/40 rounded-lg p-3">
                                <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-black">
                                  Diferencia
                                </p>
                                <p
                                  className={`text-sm font-mono font-bold mt-1 ${
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
                            <p className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-3">
                              💰 Desglose por Método
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="bg-neutral-900/40 rounded-lg p-3 border border-white/5">
                                <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-black mb-2">
                                  Efectivo
                                </p>
                                <p className="text-lg font-black font-mono text-amber-400">
                                  {fmt(cierre.totalEfectivo)}
                                </p>
                              </div>
                              <div className="bg-neutral-900/40 rounded-lg p-3 border border-white/5">
                                <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-black mb-2">
                                  Transferencia
                                </p>
                                <p className="text-lg font-black font-mono text-emerald-400">
                                  {fmt(cierre.totalTransferencia)}
                                </p>
                              </div>
                              <div className="bg-neutral-900/40 rounded-lg p-3 border border-white/5">
                                <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-black mb-2">
                                  Tarjeta
                                </p>
                                <p className="text-lg font-black font-mono text-blue-400">
                                  {fmt(cierre.totalTarjeta)}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Motivo de Eliminación */}
                          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                            <p className="text-xs font-black text-red-400 uppercase tracking-widest mb-2">
                              ⚠️ Motivo de Eliminación
                            </p>
                            <p className="text-sm text-neutral-300 font-mono whitespace-pre-wrap">
                              {registro.motivo}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-neutral-500">
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
