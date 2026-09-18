import React, { useEffect, useState, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  XCircle,
  Lock,
  Calculator,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  History,
  ChevronDown,
  PlusCircle,
  MinusCircle,
  AlertCircle,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";

// ─── HELPERS FORMATO ─────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);

const fmtFecha = (fechaStr) => {
  if (!fechaStr) return "";
  const parts = fechaStr.split("-");
  if (parts.length !== 3) return fechaStr;
  const [y, m, d] = parts;
  const meses = [
    "ENE",
    "FEB",
    "MAR",
    "ABR",
    "MAY",
    "JUN",
    "JUL",
    "AGO",
    "SEP",
    "OCT",
    "NOV",
    "DIC",
  ];
  return `${d} ${meses[parseInt(m, 10) - 1]} ${y}`;
};

// ─── COMPONENTES REUTILIZABLES (ESTILO ÓRDENES) ──────────────────────────────
const DetailBox = ({ label, value, color = "text-neutral-300" }) => (
  <div className="space-y-1">
    <p className="text-[7px] text-neutral-600 font-black uppercase tracking-[0.2em]">
      {label}
    </p>
    <p className={`text-[10px] font-bold uppercase font-mono ${color}`}>
      {value}
    </p>
  </div>
);

const KPICard = memo(({ label, value, sub, color }) => (
  <div className="bg-neutral-900/40 border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-all">
    <p className="text-[8px] text-neutral-600 font-black uppercase tracking-widest mb-2">
      {label}
    </p>
    <p className={`text-xl font-black font-mono ${color}`}>{value}</p>
    {sub && (
      <span className="text-[7px] text-neutral-500 font-bold block mt-1 uppercase font-mono">
        {sub}
      </span>
    )}
  </div>
));

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────
export default function Caja() {
  const [seccion, setSeccion] = useState("resumen");
  const [showNovedad, setShowNovedad] = useState(false);
  const [nombreCajero, setNombreCajero] = useState("");
  const [cierreExpandido, setCierreExpandido] = useState(null);

  const [transacciones, setTransacciones] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [novedades, setNovedades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [nuevaNovedad, setNuevaNovedad] = useState({
    tipo: "egreso",
    concepto: "",
    monto: "",
    metodo: "efectivo",
  });
  const [metodosPagoReales, setMetodosPagoReales] = useState({
    efectivo: "",
    transferencia: "",
    tarjeta: "",
  });

  useEffect(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    let cancelled = false;

    const loadCashData = async () => {
      setLoading(true);
      setLoadError("");
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, created_at, total, payment_method, payment_status, status, mesa",
        )
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString())
        .eq("is_reservation", false)
        .not("status", "in", "(cancelled,cancelado)")
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
      } else {
        setTransacciones(
          (data || []).map((order) => ({
            id: order.order_number || order.id,
            hora: new Date(order.created_at).toLocaleTimeString("es-CO", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            mesa: order.mesa || "-",
            metodo: String(
              order.payment_method || "sin especificar",
            ).toLowerCase(),
            total: Number(order.total || 0),
            estado: order.status,
            paymentStatus: String(
              order.payment_status || "pending",
            ).toLowerCase(),
          })),
        );
      }
      setLoading(false);
    };

    loadCashData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cálculos de flujo financiero
  const transaccionesValidas = transacciones.filter(
    (t) => t.paymentStatus === "paid",
  );
  const totalEfectivoVentas = transaccionesValidas
    .filter((t) => t.metodo === "efectivo")
    .reduce((a, t) => a + t.total, 0);
  const totalTarjeta = transaccionesValidas
    .filter((t) => t.metodo === "tarjeta")
    .reduce((a, t) => a + t.total, 0);
  const totalTransferencia = transaccionesValidas
    .filter((t) => t.metodo === "transferencia")
    .reduce((a, t) => a + t.total, 0);

  const totalIngresosManuales = novedades
    .filter((n) => n.tipo === "ingreso")
    .reduce((a, n) => a + n.monto, 0);
  const totalEgresosManuales = novedades
    .filter((n) => n.tipo === "egreso")
    .reduce((a, n) => a + n.monto, 0);

  const totalVentas = totalEfectivoVentas + totalTarjeta + totalTransferencia;
  // No se inventa una base inicial: hasta persistir una apertura real, es cero.
  const fondoInicial = 0;

  // El esperado físico en caja solo contempla efectivo real + base + movimientos manuales
  const enCajaEsperado =
    fondoInicial +
    totalEfectivoVentas +
    totalIngresosManuales -
    totalEgresosManuales;

  // Suma total de los valores declarados manualmente en el formulario de cierre
  const totalConteo = Object.values(metodosPagoReales).reduce(
    (a, b) => a + (Number(b) || 0),
    0,
  );
  const diferencia = totalConteo - enCajaEsperado;

  const secciones = [
    { id: "resumen", label: "GENERAL", icon: TrendingUp },
    { id: "historial", label: "HISTORIAL", icon: History },
  ];

  const handleConfirmarCierre = () => {
    if (!nombreCajero.trim()) return;
    const fechaHoy = new Date().toISOString().split("T")[0];
    const horaCierre = `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`;

    const nuevoCierre = {
      id: `CIE-${String(historial.length + 4).padStart(3, "0")}`,
      fecha: fechaHoy,
      horaApertura: "06:00",
      horaCierre,
      cajero: nombreCajero,
      fondoInicial,
      totalVentas,
      totalEfectivo: totalEfectivoVentas,
      totalTarjeta,
      totalTransferencia,
      enCaja: enCajaEsperado,
      totalContado: totalConteo,
      diferencia,
      transacciones: transaccionesValidas.length,
    };
    setHistorial([nuevoCierre, ...historial]);
    setNombreCajero("");
    setMetodosPagoReales({
      efectivo: "",
      transferencia: "",
      tarjeta: "",
    });
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4 font-sans selection:bg-violet-500/30">
      {/* ════ HEADER ════ */}
      <header className="max-w-7xl mx-auto mb-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tighter mt-2">
            CONTROL DE CAJA
          </h1>
          {loading && (
            <p className="text-[8px] text-neutral-500 font-mono uppercase mt-1">
              Cargando movimientos reales...
            </p>
          )}
          {loadError && (
            <p className="text-[8px] text-red-400 font-mono uppercase mt-1">
              Error al cargar caja: {loadError}
            </p>
          )}
        </div>

        {seccion === "resumen" && (
          <button
            onClick={() => setShowNovedad(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-violet-500/20 bg-violet-600/10 text-violet-400 hover:bg-violet-600 hover:text-white transition-all text-[9px] font-black uppercase tracking-wider"
          >
            <PlusCircle size={14} />
            REGISTRAR_NOVEDAD
          </button>
        )}
      </header>

      {/* ════ NAVEGACIÓN ════ */}
      <nav className="max-w-7xl mx-auto mb-6 flex bg-neutral-900/30 p-1.5 rounded-2xl border border-white/5 w-fit">
        {secciones.map((s) => (
          <button
            key={s.id}
            onClick={() => setSeccion(s.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${
              seccion === s.id
                ? "bg-neutral-900 text-violet-400 border border-white/5 shadow-md"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            <s.icon size={12} />
            {s.label}
          </button>
        ))}
      </nav>

      {/* ════ CONTENIDO PRINCIPAL ════ */}
      <main className="max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {/* ── SECCIÓN: RESUMEN GENERAL ── */}
          {seccion === "resumen" && (
            <motion.div
              key="resumen"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* Grid KPIs Modificado */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  label="TOTAL_VENTA"
                  value={fmt(totalVentas)}
                  sub={`${transaccionesValidas.length} órdenes`}
                  color="text-violet-400"
                />
                <KPICard
                  label="EFECTIVO_ESPERADO"
                  value={fmt(totalEfectivoVentas)}
                  sub="En caja"
                  color="text-amber-400"
                />
                <KPICard
                  label="TARJETA_ESPERADO"
                  value={fmt(totalTarjeta)}
                  sub="A cuenta"
                  color="text-blue-400"
                />
                <KPICard
                  label="TRANSFERENCIA_ESPERADA"
                  value={fmt(totalTransferencia)}
                  sub="Bancos / Apps digitales"
                  color="text-emerald-400"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Movimientos Manuales - Ocupa 1 columna en móvil y 1 columna en pantallas grandes */}
                <div className="bg-neutral-900/40 border border-white/5 rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-4 text-neutral-400 text-[9px] font-black tracking-widest uppercase">
                    <Receipt size={14} className="text-amber-500" />
                    NOVEDADES
                  </div>

                  {novedades.length === 0 ? (
                    <p className="text-center py-6 text-neutral-600 text-xs font-mono uppercase">
                      SIN REGISTROS DE FLUJO EXTERNO
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {novedades.map((n) => (
                        <div
                          key={n.id}
                          className="flex justify-between items-center p-3 bg-black/30 border border-white/5 rounded-xl"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <div
                              className={`p-1.5 rounded-lg ${n.tipo === "egreso" ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}
                            >
                              {n.tipo === "egreso" ? (
                                <ArrowDownRight size={14} />
                              ) : (
                                <ArrowUpRight size={14} />
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="text-xs font-semibold text-white uppercase tracking-tight">
                                {n.concepto}
                              </p>
                              <p className="text-[8px] text-neutral-500 font-mono">
                                {n.hora} • {n.id} •{" "}
                                <span className="text-violet-400 font-bold uppercase">
                                  {n.metodo || "efectivo"}
                                </span>
                              </p>
                            </div>
                          </div>
                          <span
                            className={`text-xs font-black font-mono whitespace-nowrap ml-2 ${n.tipo === "egreso" ? "text-red-400" : "text-emerald-400"}`}
                          >
                            {n.tipo === "egreso" ? "−" : "+"}
                            {fmt(n.monto)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Formulario de Cierre - Se alinea a la derecha en PC y abajo en el Móvil */}
                <div className="bg-neutral-900/40 border border-white/5 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-2 text-red-400 text-[9px] font-black tracking-widest uppercase">
                    <Lock size={14} />
                    CIERRE_DE_CAJA
                  </div>

                  <div>
                    <label className="text-[8px] font-black text-neutral-500 uppercase tracking-widest ml-1 block mb-1.5">
                      RESPONSABLE_CAJERO
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: JUAN PÉREZ"
                      value={nombreCajero}
                      onChange={(e) => setNombreCajero(e.target.value)}
                      className="w-full bg-neutral-900 border border-white/5 rounded-xl py-2.5 px-3 text-[10px] font-mono text-neutral-300 outline-none focus:border-red-500/40 transition-all uppercase placeholder:text-neutral-700"
                    />
                  </div>

                  <div className="space-y-3 pt-2 border-t border-white/5">
                    <p className="text-[8px] font-black text-neutral-500 uppercase tracking-widest ml-1">
                      VALORES_ESPERADOS
                    </p>
                    {["efectivo", "tarjeta", "transferencia"].map((method) => {
                      const esperado =
                        method === "efectivo"
                          ? totalEfectivoVentas
                          : method === "tarjeta"
                            ? totalTarjeta
                            : method === "transferencia"
                              ? totalTransferencia
                              : 0;
                      const declarado = Number(metodosPagoReales[method]) || 0;
                      const diferencia = declarado - esperado;
                      const colorClase =
                        diferencia > 0
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : diferencia < 0
                            ? "border-red-500/30 bg-red-500/5"
                            : "border-white/5 bg-black/20";
                      const textColor =
                        diferencia > 0
                          ? "text-emerald-400"
                          : diferencia < 0
                            ? "text-red-400"
                            : "text-neutral-500";

                      return (
                        <div
                          key={method}
                          className={`grid grid-cols-1 gap-2 p-3 rounded-xl border transition-all ${colorClase}`}
                        >
                          <div className="flex justify-between items-center">
                            <span className="text-[8px] font-mono font-bold text-neutral-400 uppercase">
                              {method}
                            </span>
                            {diferencia !== 0 && (
                              <span
                                className={`text-[7px] font-bold uppercase text-center ${textColor}`}
                              >
                                {diferencia > 0 ? "Sobra" : "Falta"}{" "}
                                {fmt(Math.abs(diferencia))}
                              </span>
                            )}
                          </div>
                          <input
                            type="number"
                            placeholder="0"
                            value={metodosPagoReales[method]}
                            onChange={(e) =>
                              setMetodosPagoReales({
                                ...metodosPagoReales,
                                [method]: e.target.value,
                              })
                            }
                            className={`w-full bg-neutral-900 text-right border rounded-lg p-1.5 text-[10px] font-mono font-bold outline-none focus:border-white/20 transition-all ${
                              diferencia > 0
                                ? "text-emerald-400 border-emerald-500/50"
                                : diferencia < 0
                                  ? "text-red-400 border-red-500/50"
                                  : "text-white border-white/5"
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <button
                    onClick={handleConfirmarCierre}
                    disabled={!nombreCajero.trim()}
                    className="w-full mt-2 py-3 rounded-xl border border-red-500/20 bg-red-600/10 text-red-400 hover:bg-red-600 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all text-[9px] font-black uppercase tracking-widest"
                  >
                    BLOQUEAR_Y_CERRAR_TURNO
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── SECCIÓN: HISTORIAL DE CIERRES ── */}
          {seccion === "historial" && (
            <motion.div
              key="historial"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="flex justify-between items-center bg-neutral-900/20 border border-white/5 p-4 rounded-xl">
                <p className="text-[9px] font-black font-mono tracking-widest uppercase text-neutral-400">
                  ARCHIVOS_DE_CIERRE_ANTERIORES
                </p>
                <p className="text-[9px] font-mono text-neutral-500">
                  {historial.length} HISTORIC_LOGS
                </p>
              </div>

              {historial.map((cierre) => {
                const isExpanded = cierreExpandido === cierre.id;
                return (
                  <div
                    key={cierre.id}
                    className={`border rounded-2xl transition-all duration-300 ${isExpanded ? "bg-neutral-900/80 border-violet-500/30" : "bg-neutral-900/40 border-white/5 hover:border-white/10"}`}
                  >
                    <button
                      onClick={() =>
                        setCierreExpandido(isExpanded ? null : cierre.id)
                      }
                      className="w-full p-4 text-left grid grid-cols-2 md:grid-cols-12 items-center gap-4"
                    >
                      <div className="col-span-2 md:col-span-4">
                        <p className="text-sm font-semibold text-white font-mono">
                          {cierre.id}
                        </p>
                        <p className="text-xs text-neutral-500 font-mono uppercase">
                          {cierre.cajero} • {cierre.horaApertura}-
                          {cierre.horaCierre}
                        </p>
                      </div>
                      <div className="col-span-1 md:col-span-3">
                        <p className="text-xs text-neutral-500 uppercase tracking-wider">
                          FECHA_LOG
                        </p>
                        <span className="text-xs font-mono font-bold text-neutral-300">
                          {fmtFecha(cierre.fecha)}
                        </span>
                      </div>
                      <div className="col-span-1 md:col-span-3 text-right md:text-left">
                        <p className="text-xs text-neutral-500 uppercase tracking-wider">
                          DIFERENCIA
                        </p>
                        <span
                          className={`text-xs font-bold font-mono ${cierre.diferencia >= 0 ? "text-emerald-400" : "text-red-400"}`}
                        >
                          {cierre.diferencia >= 0 ? "+" : ""}
                          {fmt(cierre.diferencia)}
                        </span>
                      </div>
                      <div className="col-span-2 md:col-span-2 flex justify-end">
                        <motion.div
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          className="p-1.5 bg-white/5 rounded-full text-neutral-500"
                        >
                          <ChevronDown size={14} />
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
                          <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <DetailBox
                              label="Base Inicial"
                              value={fmt(cierre.fondoInicial)}
                            />
                            <DetailBox
                              label="Ventas Sistema"
                              value={fmt(cierre.totalVentas)}
                              color="text-violet-400"
                            />
                            <DetailBox
                              label="Declarado Físico"
                              value={fmt(cierre.totalContado)}
                              color="text-amber-400"
                            />
                            <DetailBox
                              label="Transferencias"
                              value={fmt(cierre.totalTransferencia || 0)}
                              color="text-emerald-400"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ════ MODAL DE NOVEDADES ════ */}
      <AnimatePresence>
        {showNovedad && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setShowNovedad(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4"
            >
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-widest">
                  NUEVO_MOVIMIENTO_MANUAL
                </h3>
                <p className="text-[8px] text-neutral-500 uppercase tracking-wider font-mono">
                  Modificación directa del flujo de arqueo
                </p>
              </div>

              <div className="space-y-3 pt-3 border-t border-white/5">
                <div>
                  <label className="text-[7px] font-black text-neutral-500 uppercase tracking-widest mb-1.5 block">
                    NATURALEZA_FLUJO
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() =>
                        setNuevaNovedad({ ...nuevaNovedad, tipo: "egreso" })
                      }
                      className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all ${
                        nuevaNovedad.tipo === "egreso"
                          ? "bg-red-500/10 border-red-500/30 text-red-400"
                          : "bg-black/20 border-white/5 text-neutral-500"
                      }`}
                    >
                      <MinusCircle size={10} className="inline mr-1" /> SALIDA
                    </button>
                    <button
                      onClick={() =>
                        setNuevaNovedad({ ...nuevaNovedad, tipo: "ingreso" })
                      }
                      className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all ${
                        nuevaNovedad.tipo === "ingreso"
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                          : "bg-black/20 border-white/5 text-neutral-500"
                      }`}
                    >
                      <PlusCircle size={10} className="inline mr-1" /> ENTRADA
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[7px] font-black text-neutral-500 uppercase tracking-widest mb-1 block">
                    CONCEPTO_DESCRIPCIÓN
                  </label>
                  <input
                    type="text"
                    placeholder="E.G. COMPRA_DE_INSUMOS"
                    value={nuevaNovedad.concepto}
                    onChange={(e) =>
                      setNuevaNovedad({
                        ...nuevaNovedad,
                        concepto: e.target.value,
                      })
                    }
                    className="w-full bg-black/40 border border-white/5 rounded-xl py-2 px-3 text-[10px] font-mono text-neutral-300 outline-none focus:border-violet-500/40 uppercase placeholder:text-neutral-800"
                  />
                </div>

                <div>
                  <label className="text-[7px] font-black text-neutral-500 uppercase tracking-widest mb-1 block">
                    MÉTODO_DE_PAGO
                  </label>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {["efectivo", "tarjeta", "transferencia"].map((m) => (
                      <button
                        key={m}
                        onClick={() =>
                          setNuevaNovedad({ ...nuevaNovedad, metodo: m })
                        }
                        className={`py-1.5 rounded-lg text-[8px] font-bold uppercase border transition-all ${
                          nuevaNovedad.metodo === m
                            ? "bg-violet-500/20 border-violet-500/40 text-violet-400"
                            : "bg-black/20 border-white/5 text-neutral-500"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[7px] font-black text-neutral-500 uppercase tracking-widest mb-1 block">
                    MONTO_COP
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={nuevaNovedad.monto}
                    onChange={(e) =>
                      setNuevaNovedad({
                        ...nuevaNovedad,
                        monto: e.target.value,
                      })
                    }
                    className="w-full bg-black/40 border border-white/5 rounded-xl py-2 px-3 text-[10px] font-mono text-white font-bold outline-none focus:border-violet-500/40 placeholder:text-neutral-800"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setShowNovedad(false)}
                    className="flex-1 py-2 rounded-xl border border-white/5 text-neutral-400 text-[9px] font-black uppercase tracking-wider hover:bg-white/5 transition-all"
                  >
                    CANCELAR
                  </button>
                  <button
                    onClick={() => {
                      if (!nuevaNovedad.concepto || !nuevaNovedad.monto) return;
                      const ahora = new Date();
                      const hora = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
                      setNovedades([
                        ...novedades,
                        {
                          ...nuevaNovedad,
                          id: `NOV-${novedades.length + 1}`,
                          hora: hora,
                          monto: Number(nuevaNovedad.monto),
                        },
                      ]);
                      setNuevaNovedad({
                        tipo: "egreso",
                        concepto: "",
                        monto: "",
                        metodo: "efectivo",
                      });
                      setShowNovedad(false);
                    }}
                    className="flex-1 py-2 rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30 text-[9px] font-black uppercase tracking-wider hover:bg-violet-600 hover:text-white transition-all"
                  >
                    REGISTRAR
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
