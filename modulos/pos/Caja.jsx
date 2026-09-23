import React, { useEffect, useState, memo } from "react";
import { motion } from "framer-motion";
import {
  XCircle,
  Lock,
  Calculator,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  PlusCircle,
  MinusCircle,
  AlertCircle,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import { useAuth } from "../../src/components/AuthContext";

// ─── HELPERS FORMATO ─────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);

const formatAmountInput = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? Number(digits).toLocaleString("es-CO") : "";
};

const parseAmountInput = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? Number(digits) : 0;
};

const pad = (value) => String(value).padStart(2, "0");

const fechaLocalInput = (fecha = new Date()) =>
  `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;

const horaLocalInput = (fecha = new Date()) =>
  `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`;

const horaConPeriodo = (hora) => {
  if (!hora) return "--";
  const [hours, minutes] = hora.split(":").map(Number);
  const fecha = new Date();
  fecha.setHours(hours, minutes, 0, 0);
  return fecha.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const fechaHoraLocal = (fecha, hora) => {
  if (!fecha || !hora) return null;
  const fechaHora = new Date(`${fecha}T${hora}`);
  return Number.isNaN(fechaHora.getTime()) ? null : fechaHora;
};

const horaFormateada = (fecha) =>
  fecha.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });

const horaActualFormateada = (fecha) =>
  fecha.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const obtenerMetodosPago = (metadata, paymentMethod, total) => {
  const metodoPrincipal = String(paymentMethod || "")
    .trim()
    .toLowerCase();

  if (["efectivo", "tarjeta", "transferencia"].includes(metodoPrincipal)) {
    return [{ metodo: metodoPrincipal, monto: total }];
  }

  let metadataObjeto = metadata;
  if (typeof metadata === "string") {
    try {
      metadataObjeto = JSON.parse(metadata);
    } catch {
      metadataObjeto = null;
    }
  }
  const metodos = Array.isArray(metadataObjeto?.payment_methods)
    ? metadataObjeto.payment_methods
        .map((item) => ({
          metodo: String(item.metodo || "").toLowerCase(),
          monto: Number(item.monto) || 0,
        }))
        .filter((item) => item.metodo && item.monto > 0)
    : [];

  if (metodos.length > 0) return metodos;
  if (paymentMethod) {
    return [{ metodo: String(paymentMethod).toLowerCase(), monto: total }];
  }
  return [];
};

const leerHistorialCierres = () => {
  try {
    const stored = localStorage.getItem("caja_historial_cierres");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// ─── COMPONENTES REUTILIZABLES (ESTILO ÓRDENES) ──────────────────────────────
const KPICard = memo(({ label, value, sub, color, loading = false }) => (
  <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-5 shadow-lg shadow-black/10 hover:border-white/20 hover:-translate-y-0.5 transition-all">
    <p className="text-[8px] text-neutral-500 font-black uppercase tracking-widest mb-2">
      {label}
    </p>
    <p className={`text-xl font-black font-mono ${color}`}>
      {loading ? (
        <span className="inline-block h-6 w-28 animate-pulse rounded-md bg-white/10 align-middle" />
      ) : (
        value
      )}
    </p>
    {loading ? (
      <span className="mt-2 block h-2 w-20 animate-pulse rounded bg-white/10" />
    ) : sub ? (
      <span className="text-[7px] text-neutral-500 font-bold block mt-1 uppercase font-mono">
        {sub}
      </span>
    ) : null}
  </div>
));

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────
export default function Caja() {
  const { user } = useAuth();
  const inicioPredeterminado = new Date();
  inicioPredeterminado.setHours(6, 0, 0, 0);
  const [turnoIniciado, setTurnoIniciado] = useState(false);
  const [nombreCajero, setNombreCajero] = useState("");
  const [cajeros, setCajeros] = useState([]);
  const [horaActual, setHoraActual] = useState(() =>
    horaActualFormateada(new Date()),
  );
  const [shiftId, setShiftId] = useState(null);
  const [businessId, setBusinessId] = useState(null);
  const [aperturaConfirmada, setAperturaConfirmada] = useState(null);
  const [fechaApertura, setFechaApertura] = useState(
    fechaLocalInput(inicioPredeterminado),
  );
  const [horaApertura, setHoraApertura] = useState(
    horaLocalInput(inicioPredeterminado),
  );

  const [transacciones, setTransacciones] = useState([]);
  const [historial, setHistorial] = useState(leerHistorialCierres);
  const [novedades, setNovedades] = useState([]);
  const [mostrarRegistroNovedad, setMostrarRegistroNovedad] = useState(false);
  const [loading, setLoading] = useState(true);
  const [datosCargados, setDatosCargados] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [turnoError, setTurnoError] = useState("");
  const [nuevaNovedad, setNuevaNovedad] = useState({
    tipo: "egreso",
    responsable: "",
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
    const reloj = setInterval(() => {
      setHoraActual(horaActualFormateada(new Date()));
    }, 1000);

    return () => clearInterval(reloj);
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setCajeros([]);
      return;
    }

    const loadCajeros = async () => {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError || !profile?.business_id) return;
      setBusinessId(profile.business_id);

      const { data, error } = await supabase
        .from("employees")
        .select("id,name,area")
        .eq("business_id", profile.business_id)
        .in("area", ["Cajero/a", "Cajero", "Cajera"])
        .order("name", { ascending: true });
      if (!error) setCajeros(data || []);
    };

    loadCajeros();
  }, [user?.id]);

  useEffect(() => {
    localStorage.setItem("caja_historial_cierres", JSON.stringify(historial));
  }, [historial]);

  useEffect(() => {
    if (!turnoIniciado) {
      setTransacciones([]);
      setLoading(false);
      return undefined;
    }

    if (!aperturaConfirmada) {
      setTransacciones([]);
      setLoading(false);
      return undefined;
    }

    if (!businessId) return undefined;

    const start = fechaHoraLocal(
      aperturaConfirmada.fecha,
      aperturaConfirmada.hora,
    );
    let cancelled = false;
    setDatosCargados(false);

    const loadCashData = async () => {
      const end = new Date();
      if (!start || start > end) {
        setTransacciones([]);
        setDatosCargados(true);
        setLoadError("La apertura debe ser anterior a la hora actual.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError("");
      const [{ data, error }, { data: movementData, error: movementError }] =
        await Promise.all([
          supabase
            .from("orders")
            .select(
              "id, order_number, created_at, total, payment_method, payment_status, status, mesa, metadata",
            )
            .gte("created_at", start.toISOString())
            .lte("created_at", end.toISOString())
            .eq("is_reservation", false)
            .not("status", "in", "(cancelled,cancelado)")
            .order("created_at", { ascending: false }),
          supabase
            .from("cash_register_movements")
            .select(
              "id, responsible, concept, movement_type, payment_method, amount, created_at",
            )
            .eq("business_id", businessId)
            .gte("created_at", start.toISOString())
            .lte("created_at", end.toISOString())
            .order("created_at", { ascending: false }),
        ]);

      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
      } else {
        setTransacciones(
          (data || []).map((order) => {
            const total = Number(order.total || 0);
            const paymentStatus = String(
              order.payment_status || "pending",
            ).toLowerCase();
            const metodosPago = obtenerMetodosPago(
              order.metadata,
              order.payment_method,
              total,
            );
            return {
              orderId: order.id,
              id: order.order_number || order.id,
              createdAt: order.created_at,
              hora: new Date(order.created_at).toLocaleTimeString("es-CO", {
                hour: "2-digit",
                minute: "2-digit",
              }),
              mesa: order.mesa || "-",
              metodo: String(
                order.payment_method || "sin especificar",
              ).toLowerCase(),
              total,
              metodosPago,
              montoPagado: metodosPago.reduce(
                (sum, item) => sum + item.monto,
                0,
              ),
              estado: order.status,
              paymentStatus,
            };
          }),
        );
      }
      if (movementError) {
        setLoadError((current) => current || movementError.message);
      } else {
        setNovedades(
          (movementData || []).map((movement) => ({
            id: movement.id,
            tipo: movement.movement_type === "income" ? "ingreso" : "egreso",
            responsable: movement.responsible || "Sin responsable",
            concepto: movement.concept || "Sin concepto",
            monto: Number(movement.amount) || 0,
            metodo: movement.payment_method || "efectivo",
            hora: new Date(movement.created_at).toLocaleTimeString("es-CO", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            persisted: true,
          })),
        );
      }
      setDatosCargados(true);
      setLoading(false);
    };

    loadCashData();
    const refreshId = setInterval(loadCashData, 30000);
    return () => {
      cancelled = true;
      clearInterval(refreshId);
    };
  }, [aperturaConfirmada, businessId, turnoIniciado]);

  // Cálculos de flujo financiero
  const transaccionesValidas = transacciones.filter((t) => t.montoPagado > 0);
  const totalEfectivoVentas = transaccionesValidas.reduce(
    (total, transaction) =>
      total +
      transaction.metodosPago
        .filter((item) => item.metodo === "efectivo")
        .reduce((sum, item) => sum + item.monto, 0),
    0,
  );
  const totalTarjeta = transaccionesValidas.reduce(
    (total, transaction) =>
      total +
      transaction.metodosPago
        .filter((item) => item.metodo === "tarjeta")
        .reduce((sum, item) => sum + item.monto, 0),
    0,
  );
  const totalTransferencia = transaccionesValidas.reduce(
    (total, transaction) =>
      total +
      transaction.metodosPago
        .filter((item) => item.metodo === "transferencia")
        .reduce((sum, item) => sum + item.monto, 0),
    0,
  );

  const totalIngresosManuales = novedades
    .filter((n) => n.tipo === "ingreso")
    .reduce((a, n) => a + n.monto, 0);
  const totalEgresosManuales = novedades
    .filter((n) => n.tipo === "egreso")
    .reduce((a, n) => a + n.monto, 0);

  const totalVentas = transaccionesValidas.reduce(
    (total, transaction) => total + transaction.montoPagado,
    0,
  );
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
    (a, b) => a + parseAmountInput(b),
    0,
  );
  const diferencia = totalConteo - enCajaEsperado;
  const aperturaActual = fechaHoraLocal(fechaApertura, horaApertura);
  const aperturaValida = aperturaActual && aperturaActual <= new Date();
  const cierreVista = new Date();

  const handleIniciarTurno = async () => {
    const inicio = fechaHoraLocal(fechaApertura, horaApertura);
    if (!nombreCajero.trim()) {
      setTurnoError("Selecciona el cajero responsable del cierre.");
      return;
    }
    if (!inicio || inicio > new Date()) {
      setTurnoError(
        "La fecha y hora de apertura deben ser válidas y anteriores a la hora actual.",
      );
      return;
    }

    setTurnoError("");
    setAperturaConfirmada({ fecha: fechaApertura, hora: horaApertura });
    setTurnoIniciado(true);
  };

  const handleActualizarApertura = () => {
    const inicio = fechaHoraLocal(fechaApertura, horaApertura);
    if (!inicio || inicio > new Date()) {
      setTurnoError(
        "La fecha y hora de apertura deben ser válidas y anteriores a la hora actual.",
      );
      return;
    }
    setTurnoError("");
    setMostrarRegistroNovedad(false);
    setAperturaConfirmada({ fecha: fechaApertura, hora: horaApertura });
  };

  const handleConfirmarCierre = async () => {
    const ahora = new Date();
    const inicio = aperturaConfirmada
      ? fechaHoraLocal(aperturaConfirmada.fecha, aperturaConfirmada.hora)
      : null;
    if (
      !turnoIniciado ||
      !nombreCajero.trim() ||
      !inicio ||
      inicio > ahora ||
      (aperturaConfirmada &&
        (aperturaConfirmada.fecha !== fechaApertura ||
          aperturaConfirmada.hora !== horaApertura))
    )
      return;

    if (!user?.id) {
      setTurnoError("No se encontro el usuario autenticado.");
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("business_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile?.business_id) {
      setTurnoError("No se encontro el negocio del usuario.");
      return;
    }

    const shiftPayload = {
      business_id: profile.business_id,
      opened_by: user.id,
      cashier_name: nombreCajero.trim(),
      opened_at: inicio.toISOString(),
      closed_at: ahora.toISOString(),
      status: "closed",
      opening_float: fondoInicial,
      total_sales: totalVentas,
      total_cash: totalEfectivoVentas,
      total_card: totalTarjeta,
      total_transfer: totalTransferencia,
      counted_cash: parseAmountInput(metodosPagoReales.efectivo),
      counted_card: parseAmountInput(metodosPagoReales.tarjeta),
      counted_transfer: parseAmountInput(metodosPagoReales.transferencia),
      expected_cash: enCajaEsperado,
      difference: diferencia,
      orders_count: transaccionesValidas.length,
    };

    const shiftRequest = shiftId
      ? supabase
          .from("cash_register_shifts")
          .update(shiftPayload)
          .eq("id", shiftId)
          .select("id")
          .single()
      : supabase
          .from("cash_register_shifts")
          .insert(shiftPayload)
          .select("id")
          .single();

    const { data: shift, error: shiftError } = await shiftRequest;

    if (shiftError || !shift?.id) {
      setTurnoError(shiftError?.message || "No se pudo guardar el cierre.");
      return;
    }

    const novedadesPendientes = novedades.filter(
      (novedad) => !novedad.persisted,
    );
    const movementInsert = novedadesPendientes.length
      ? supabase.from("cash_register_movements").insert(
          novedadesPendientes.map((novedad) => ({
            business_id: profile.business_id,
            shift_id: shift.id,
            responsible: novedad.responsable.trim(),
            movement_type: novedad.tipo === "ingreso" ? "income" : "expense",
            concept: novedad.concepto.trim(),
            payment_method: novedad.metodo,
            amount: Number(novedad.monto),
            created_by: user.id,
          })),
        )
      : Promise.resolve({ error: null });

    const orderInsert = transaccionesValidas.length
      ? supabase.from("cash_register_shift_orders").insert(
          transaccionesValidas.map((transaction) => ({
            shift_id: shift.id,
            order_id: transaction.orderId,
            order_number: transaction.id,
            order_total: transaction.total,
            payment_method: transaction.metodo,
            order_created_at: transaction.createdAt,
          })),
        )
      : Promise.resolve({ error: null });

    const [movementResult, orderResult] = await Promise.all([
      movementInsert,
      orderInsert,
    ]);

    if (movementResult.error || orderResult.error) {
      setTurnoError(
        movementResult.error?.message ||
          orderResult.error?.message ||
          "El cierre se guardo incompleto.",
      );
      return;
    }

    const nuevoCierre = {
      id: shift.id,
      fecha: fechaLocalInput(ahora),
      fechaApertura: aperturaConfirmada.fecha,
      fechaCierre: fechaLocalInput(ahora),
      horaApertura: aperturaConfirmada.hora,
      horaCierre: horaFormateada(ahora),
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
    setTurnoIniciado(false);
    setShiftId(null);
    setBusinessId(null);
    setAperturaConfirmada(null);
    setNombreCajero("");
    setNovedades([]);
    setMostrarRegistroNovedad(false);
    setMetodosPagoReales({
      efectivo: "",
      transferencia: "",
      tarjeta: "",
    });
  };

  const handleRegistrarNovedad = async () => {
    if (
      !nuevaNovedad.responsable.trim() ||
      !nuevaNovedad.concepto ||
      !nuevaNovedad.monto
    )
      return;

    if (!user?.id) {
      setTurnoError("No se encontro el usuario autenticado.");
      return;
    }

    let activeShiftId = shiftId;
    let activeBusinessId = businessId;
    if (!activeBusinessId) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || !profile?.business_id) {
        setTurnoError("No se encontro el negocio del usuario.");
        return;
      }

      activeBusinessId = profile.business_id;
      setBusinessId(activeBusinessId);
    }

    if (!activeBusinessId) {
      setTurnoError("No se encontro el negocio del usuario.");
      return;
    }

    const ahora = new Date();
    const { error: movementError } = await supabase
      .from("cash_register_movements")
      .insert({
        business_id: activeBusinessId,
        shift_id: activeShiftId,
        responsible: nuevaNovedad.responsable.trim(),
        movement_type: nuevaNovedad.tipo === "ingreso" ? "income" : "expense",
        concept: nuevaNovedad.concepto.trim(),
        payment_method: nuevaNovedad.metodo,
        amount: parseAmountInput(nuevaNovedad.monto),
        created_by: user.id,
      });

    if (movementError) {
      setTurnoError(movementError.message);
      return;
    }

    setTurnoError("");
    setNovedades([
      ...novedades,
      {
        ...nuevaNovedad,
        id: `NOV-${novedades.length + 1}`,
        hora: horaFormateada(ahora),
        monto: parseAmountInput(nuevaNovedad.monto),
        persisted: true,
      },
    ]);
    setNuevaNovedad({
      tipo: "egreso",
      responsable: "",
      concepto: "",
      monto: "",
      metodo: "efectivo",
    });
  };

  const aperturaModificada =
    turnoIniciado &&
    aperturaConfirmada &&
    (aperturaConfirmada.fecha !== fechaApertura ||
      aperturaConfirmada.hora !== horaApertura);
  const cargandoInicial = loading && !datosCargados;

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4 font-sans selection:bg-violet-500/30">
      {/* ════ HEADER ════ */}
      <header className="max-w-7xl mx-auto mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">
            CONTROL DE CAJA
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setMostrarRegistroNovedad((visible) => !visible)}
          className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-600/10 px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-violet-400 transition-all hover:bg-violet-600 hover:text-white"
        >
          <PlusCircle size={14} />
          Registrar novedad
        </button>
      </header>

      {
        <section className="max-w-7xl mx-auto mb-6 bg-neutral-900/60 border border-white/10 rounded-2xl p-5 sm:p-6 space-y-5 shadow-lg shadow-black/10">
          <div>
            <div className="flex items-center gap-2 text-violet-400 mb-2">
              <Lock size={16} />
              <span className="text-[9px] font-black uppercase tracking-widest">
                DATOS DEL CIERRE
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <h2 className="text-xl font-black text-white uppercase tracking-tight">
                {turnoIniciado ? "Cierre en curso" : "Cerrar caja"}
              </h2>
              <div className="flex items-center gap-3">
                <time
                  dateTime={new Date().toISOString()}
                  className="font-mono text-[10px] font-bold uppercase tracking-widest text-neutral-500"
                >
                  {new Date().toLocaleDateString("es-CO")}
                </time>
                <time
                  dateTime={new Date().toISOString()}
                  className="font-mono text-sm font-bold tracking-wider text-violet-300"
                >
                  {horaActual}
                </time>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-white/10">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr] gap-3">
              <label className="text-[8px] font-black text-neutral-500 uppercase tracking-widest mb-1.5 block">
                CAJERO DEL CIERRE
                <select
                  autoFocus
                  value={nombreCajero}
                  onChange={(e) => {
                    setNombreCajero(e.target.value);
                    setTurnoError("");
                  }}
                  className="mt-1 w-full bg-black/40 border border-white/5 rounded-xl py-2.5 px-3 text-[10px] font-mono text-neutral-300 outline-none focus:border-violet-500/40 transition-all uppercase placeholder:text-neutral-700"
                  required
                >
                  <option value="" disabled>
                    {cajeros.length
                      ? "Selecciona un cajero"
                      : "Sin cajeros registrados"}
                  </option>
                  {cajeros.map((cajero) => (
                    <option key={cajero.id} value={cajero.name}>
                      {cajero.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-[8px] font-black text-neutral-500 uppercase">
                DESDE FECHA
                <input
                  type="date"
                  value={fechaApertura}
                  onChange={(e) => {
                    setFechaApertura(e.target.value);
                    setTurnoError("");
                  }}
                  className="mt-1 w-full bg-black/40 border border-white/5 rounded-lg p-2 text-[10px] text-white outline-none focus:border-violet-500/40"
                />
              </label>
              <label className="text-[8px] font-black text-neutral-500 uppercase">
                DESDE HORA
                <input
                  type="time"
                  value={horaApertura}
                  onChange={(e) => {
                    setHoraApertura(e.target.value);
                    setTurnoError("");
                  }}
                  className="mt-1 w-full bg-black/40 border border-white/5 rounded-lg p-2 text-[10px] text-white outline-none focus:border-violet-500/40"
                />
              </label>
            </div>

            {turnoError && (
              <p className="text-[9px] text-red-400 font-mono uppercase">
                {turnoError}
              </p>
            )}

            {loadError && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[9px] text-red-400 font-mono uppercase">
                Error al cargar caja: {loadError}
              </p>
            )}

            <button
              onClick={
                turnoIniciado ? handleActualizarApertura : handleIniciarTurno
              }
              disabled={
                !nombreCajero.trim() ||
                !fechaApertura ||
                !horaApertura ||
                (turnoIniciado && !aperturaModificada)
              }
              className={`w-full rounded-xl border py-3 text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-30 disabled:pointer-events-none ${
                aperturaModificada
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-black"
                  : "border-violet-500/30 bg-violet-600/20 text-violet-400 hover:bg-violet-600 hover:text-white"
              }`}
            >
              {aperturaModificada ? "ACTUALIZAR DATOS" : "CONSULTAR CAJA"}
            </button>
          </div>
        </section>
      }

      {/* ════ CONTENIDO PRINCIPAL ════ */}
      {(turnoIniciado || mostrarRegistroNovedad) && (
        <main className="max-w-7xl mx-auto">
          <div className="space-y-10">
            {/* ── SECCIÓN: RESUMEN GENERAL ── */}
            {
              <motion.div
                key="resumen"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={
                  turnoIniciado
                    ? "space-y-6"
                    : "space-y-6 [&>div:first-child]:hidden [&>div:last-child>div:last-child]:hidden"
                }
              >
                {/* Grid KPIs Modificado */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <KPICard
                    label="TOTAL DE VENTAS"
                    value={fmt(totalVentas)}
                    sub={`${transaccionesValidas.length} órdenes`}
                    color="text-violet-400"
                    loading={cargandoInicial}
                  />
                  <KPICard
                    label="EFECTIVO"
                    value={fmt(totalEfectivoVentas)}
                    sub="En caja"
                    color="text-amber-400"
                    loading={cargandoInicial}
                  />
                  <KPICard
                    label="TARJETA"
                    value={fmt(totalTarjeta)}
                    sub="A cuenta"
                    color="text-blue-400"
                    loading={cargandoInicial}
                  />
                  <KPICard
                    label="TRANSFERENCIA"
                    value={fmt(totalTransferencia)}
                    sub="Bancos / Apps digitales"
                    color="text-emerald-400"
                    loading={cargandoInicial}
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Movimientos Manuales - Ocupa 1 columna en móvil y 1 columna en pantallas grandes */}
                  <div className="relative overflow-hidden bg-neutral-900/60 border border-white/10 rounded-2xl p-5 sm:p-6 shadow-lg shadow-black/10">
                    {cargandoInicial && (
                      <div className="absolute inset-0 z-10 space-y-4 rounded-2xl bg-neutral-900/90 p-6 animate-pulse">
                        <div className="h-3 w-28 rounded bg-white/10" />
                        <div className="h-20 rounded-xl bg-white/5" />
                        <div className="h-3 w-36 rounded bg-white/10" />
                        <div className="h-10 rounded-xl bg-white/5" />
                        <div className="h-10 rounded-xl bg-white/5" />
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-4 text-neutral-400 text-[9px] font-black tracking-widest uppercase">
                      <Receipt size={14} className="text-amber-500" />
                      NOVEDADES
                    </div>

                    {novedades.length === 0 ? (
                      <p className="text-center py-6 text-neutral-600 text-xs font-mono uppercase">
                        Sin novedades registradas
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
                                  {n.responsable || "Sin responsable"} •{" "}
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

                    {mostrarRegistroNovedad && (
                      <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                        onClick={() => setMostrarRegistroNovedad(false)}
                      >
                        <div
                          className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-black uppercase tracking-widest text-white">
                                Nueva novedad
                              </p>
                              <p className="mt-1 text-[8px] uppercase tracking-wider text-neutral-500">
                                Registra un movimiento de caja
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setMostrarRegistroNovedad(false)}
                              className="rounded-lg p-1.5 text-neutral-500 hover:bg-white/5 hover:text-white"
                              aria-label="Cerrar"
                            >
                              <XCircle size={18} />
                            </button>
                          </div>
                          <select
                            value={nuevaNovedad.responsable}
                            onChange={(e) =>
                              setNuevaNovedad({
                                ...nuevaNovedad,
                                responsable: e.target.value,
                              })
                            }
                            className="w-full bg-black/40 border border-white/5 rounded-xl py-2 px-3 text-[10px] font-mono text-neutral-300 outline-none focus:border-violet-500/40 uppercase placeholder:text-neutral-800"
                          >
                            <option value="" disabled>
                              {cajeros.length
                                ? "Selecciona un responsable"
                                : "Sin cajeros registrados"}
                            </option>
                            {cajeros.map((cajero) => (
                              <option key={cajero.id} value={cajero.name}>
                                {cajero.name}
                              </option>
                            ))}
                          </select>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() =>
                                setNuevaNovedad({
                                  ...nuevaNovedad,
                                  tipo: "egreso",
                                })
                              }
                              className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all ${
                                nuevaNovedad.tipo === "egreso"
                                  ? "bg-red-500/10 border-red-500/30 text-red-400"
                                  : "bg-black/20 border-white/5 text-neutral-500"
                              }`}
                            >
                              <MinusCircle size={10} className="inline mr-1" />{" "}
                              SALIDA
                            </button>
                            <button
                              onClick={() =>
                                setNuevaNovedad({
                                  ...nuevaNovedad,
                                  tipo: "ingreso",
                                })
                              }
                              className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all ${
                                nuevaNovedad.tipo === "ingreso"
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                  : "bg-black/20 border-white/5 text-neutral-500"
                              }`}
                            >
                              <PlusCircle size={10} className="inline mr-1" />{" "}
                              ENTRADA
                            </button>
                          </div>
                          <input
                            type="text"
                            placeholder="Concepto"
                            value={nuevaNovedad.concepto}
                            onChange={(e) =>
                              setNuevaNovedad({
                                ...nuevaNovedad,
                                concepto: e.target.value,
                              })
                            }
                            className="w-full bg-black/40 border border-white/5 rounded-xl py-2 px-3 text-[10px] font-mono text-neutral-300 outline-none focus:border-violet-500/40 uppercase placeholder:text-neutral-800"
                          />
                          <div className="grid grid-cols-3 gap-2">
                            {["efectivo", "tarjeta", "transferencia"].map(
                              (metodo) => (
                                <button
                                  key={metodo}
                                  onClick={() =>
                                    setNuevaNovedad({ ...nuevaNovedad, metodo })
                                  }
                                  className={`py-1.5 rounded-lg text-[8px] font-bold uppercase border transition-all ${
                                    nuevaNovedad.metodo === metodo
                                      ? "bg-violet-500/20 border-violet-500/40 text-violet-400"
                                      : "bg-black/20 border-white/5 text-neutral-500"
                                  }`}
                                >
                                  {metodo}
                                </button>
                              ),
                            )}
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="Monto"
                              value={nuevaNovedad.monto}
                              onChange={(e) =>
                                setNuevaNovedad({
                                  ...nuevaNovedad,
                                  monto: formatAmountInput(e.target.value),
                                })
                              }
                              className="min-w-0 flex-1 bg-black/40 border border-white/5 rounded-xl py-2 px-3 text-[10px] font-mono text-white font-bold outline-none focus:border-violet-500/40 placeholder:text-neutral-800"
                            />
                            <button
                              onClick={handleRegistrarNovedad}
                              disabled={
                                !nuevaNovedad.responsable.trim() ||
                                !nuevaNovedad.concepto ||
                                !nuevaNovedad.monto
                              }
                              className="px-4 rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30 hover:bg-violet-600 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all text-[9px] font-black uppercase tracking-wider"
                            >
                              Guardar
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Formulario de Cierre - Se alinea a la derecha en PC y abajo en el Móvil */}
                  <div className="relative overflow-hidden bg-neutral-900/60 border border-white/10 rounded-2xl p-5 sm:p-6 space-y-4 shadow-lg shadow-black/10">
                    {cargandoInicial && (
                      <div className="absolute inset-0 z-10 space-y-4 rounded-2xl bg-neutral-900/90 p-6 animate-pulse">
                        <div className="h-3 w-32 rounded bg-white/10" />
                        <div className="h-3 w-24 rounded bg-white/10" />
                        <div className="h-10 rounded-xl bg-white/5" />
                        <div className="h-3 w-32 rounded bg-white/10" />
                        <div className="h-16 rounded-xl bg-white/5" />
                        <div className="h-16 rounded-xl bg-white/5" />
                        <div className="h-12 rounded-xl bg-white/5" />
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-red-400 text-[9px] font-black tracking-widest uppercase">
                      <Lock size={14} />
                      CIERRE DE CAJA
                    </div>

                    <div className="space-y-3 border-t border-white/5 pt-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[8px] font-black uppercase tracking-[0.18em] text-neutral-500">
                            TURNO ACTIVO
                          </p>
                          <p className="mt-1 text-sm font-black uppercase tracking-tight text-white">
                            {nombreCajero || "Sin cajero seleccionado"}
                          </p>
                        </div>
                        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-emerald-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                          En curso
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5">
                          <p className="text-[7px] font-black uppercase tracking-widest text-neutral-600">
                            Inicio del periodo
                          </p>
                          <p className="mt-1 font-mono text-[10px] font-bold text-neutral-300">
                            {fechaApertura} {horaConPeriodo(horaApertura)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-violet-400/15 bg-violet-400/[0.06] px-3 py-2.5">
                          <p className="text-[7px] font-black uppercase tracking-widest text-violet-300/60">
                            Corte actual
                          </p>
                          <p className="mt-1 font-mono text-[10px] font-bold text-violet-200">
                            {fechaLocalInput(cierreVista)} {horaFormateada(cierreVista)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 border-t border-white/5 pt-4">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-[8px] font-black uppercase tracking-[0.18em] text-neutral-500">
                            CONTEO DEL CIERRE
                          </p>
                          <p className="mt-1 text-[9px] text-neutral-600">
                            Compara lo esperado con lo contado.
                          </p>
                        </div>
                        <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[7px] font-black uppercase tracking-widest text-neutral-500">
                          COP
                        </span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                      {["efectivo", "tarjeta", "transferencia"].map(
                        (method) => {
                          const esperado =
                            method === "efectivo"
                              ? totalEfectivoVentas
                              : method === "tarjeta"
                                ? totalTarjeta
                                : method === "transferencia"
                                  ? totalTransferencia
                                  : 0;
                          const declarado =
                              parseAmountInput(metodosPagoReales[method]);
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
                              className={`grid gap-3 rounded-xl border p-3 transition-all ${colorClase}`}
                            >
                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[8px] font-mono font-bold uppercase text-neutral-300">
                                    {method}
                                  </span>
                                  {diferencia !== 0 && (
                                    <span
                                      className={`text-[7px] font-bold uppercase text-right ${textColor}`}
                                    >
                                      {diferencia > 0 ? "Sobra" : "Falta"}{" "}
                                      {fmt(Math.abs(diferencia))}
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <p className="text-[7px] uppercase tracking-widest text-neutral-600">
                                    Esperado
                                  </p>
                                  <p className="mt-0.5 font-mono text-xs font-bold text-neutral-300">
                                    {fmt(esperado)}
                                  </p>
                                </div>
                              </div>
                              <label className="space-y-1">
                                <span className="text-[7px] uppercase tracking-widest text-neutral-600">
                                  Contado
                                </span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="0"
                                  value={metodosPagoReales[method]}
                                  onChange={(e) =>
                                    setMetodosPagoReales({
                                      ...metodosPagoReales,
                                      [method]: formatAmountInput(e.target.value),
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
                              </label>
                            </div>
                          );
                        },
                      )}
                      </div>
                    </div>

                    <button
                      onClick={handleConfirmarCierre}
                      disabled={
                        !turnoIniciado ||
                        !nombreCajero.trim() ||
                        !aperturaValida ||
                        aperturaModificada
                      }
                      className="w-full mt-2 py-3 rounded-xl border border-red-500/20 bg-red-600/10 text-red-400 hover:bg-red-600 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all text-[9px] font-black uppercase tracking-widest"
                    >
                      Cerrar caja
                    </button>
                  </div>
                </div>
              </motion.div>
            }
          </div>
        </main>
      )}
    </div>
  );
}
