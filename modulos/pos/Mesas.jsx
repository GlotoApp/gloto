import React, { useState, useRef, useEffect, useCallback } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../src/lib/supabaseClient";
import { useAuth } from "../../src/components/AuthContext";
import {
  X,
  RotateCcw,
  CheckCircle2,
  Plus,
  Search,
  ChefHat,
  Minus,
  Edit3,
  Check,
  Users,
  Calendar,
  Phone,
  Mail,
  Clock,
} from "lucide-react";

// ─── Data ─────────────────────────────────────────────────────────────────────
// Los productos se cargan desde Supabase (ver loadProductsFromDB())
// Las mesas se cargan SOLO si tienen órdenes activas

const ESTADO = {
  ocupada: {
    color: "#f97316",
    glow: "#f9731622",
    border: "#f9731665",
    label: "Ocupada",
    pulse: false,
  },
  reserva: {
    color: "#3b82f6",
    glow: "#3b82f622",
    border: "#3b82f665",
    label: "Reserva",
    pulse: true,
  },
  sucio: {
    color: "#ef4444",
    glow: "#ef444422",
    border: "#ef444455",
    label: "Por Limpiar",
    pulse: true,
  },
  "": {
    color: "#6b7280",
    glow: "#6b728010",
    border: "#6b728030",
    label: "Limpia",
    pulse: false,
  },
};

// ─── Utils ────────────────────────────────────────────────────────────────────
const fmt = (n) => `$${Number(n).toLocaleString("es-CO")}`;
const calc = (c) =>
  c.reduce(
    (s, i) =>
      s +
      (Number.isFinite(Number(i.subtotal)) && Number(i.subtotal) > 0
        ? Number(i.subtotal)
        : Number(i.precio || 0) * Number(i.qty || 0)),
    0,
  );

// El estado de la mesa depende únicamente de table_status, no del estado de la orden.
const mapTableStatusToTableState = (tableStatus) =>
  String(tableStatus ?? "")
    .trim()
    .toLowerCase();

const getTableStateFromOrder = (order) => {
  // Un table_status vacio significa mesa limpia. Solo usamos status como
  // respaldo para ordenes antiguas que realmente no tienen ese campo.
  if (order.table_status !== null && order.table_status !== undefined) {
    return mapTableStatusToTableState(order.table_status);
  }

  const orderStatus = String(order.status ?? "")
    .trim()
    .toLowerCase();
  return ["pending", "confirmed", "preparing", "ready"].includes(orderStatus)
    ? "ocupada"
    : "";
};

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatReservationDateTime = (date, time) => {
  if (!date || !time) return "";

  const reservationDate = new Date(`${date}T${time}`);
  if (Number.isNaN(reservationDate.getTime())) return `${date} · ${time}`;

  return reservationDate.toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const getPaymentMethodsFromMetadata = (metadata) => {
  let parsedMetadata = metadata;
  if (typeof parsedMetadata === "string") {
    try {
      parsedMetadata = JSON.parse(parsedMetadata);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsedMetadata?.payment_methods)
    ? parsedMetadata.payment_methods
    : [];
};

const normalizeDeliveryMethod = (value) => {
  const method = String(value ?? "")
    .trim()
    .toLowerCase();

  if (["pickup", "recoger", "takeaway"].includes(method)) return "pickup";
  if (["delivery", "domicilio", "entrega", "envio"].includes(method))
    return "delivery";
  if (["point", "punto", "retiro", "pickup_point"].includes(method))
    return "point";
  if (["table", "mesa"].includes(method)) return "table";

  return "table";
};

const getProductsCacheKey = (businessId) => `pos-products-cache-${businessId}`;

const readProductsCache = (businessId) => {
  try {
    const cached = localStorage.getItem(getProductsCacheKey(businessId));
    const parsed = cached ? JSON.parse(cached) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("No se pudo leer el caché de productos de mesas:", error);
    return [];
  }
};

const writeProductsCache = (businessId, products) => {
  try {
    localStorage.setItem(
      getProductsCacheKey(businessId),
      JSON.stringify(products),
    );
  } catch (error) {
    console.warn("No se pudo guardar el caché de productos de mesas:", error);
  }
};

// Normalizar grupos de opciones (igual que en POS.jsx)
const normalizeOptionGroup = (group, items = []) => {
  const isRequired =
    group.is_required ?? group.es_requerido ?? group.required ?? false;
  const selectionType =
    group.selection_type ?? group.selectionType ?? group.type ?? "single";

  const opciones = (items || [])
    .map((item) => ({
      id: item.id,
      nombre:
        item.nombre ||
        item.name ||
        item.title ||
        item.label ||
        item.option_name ||
        item.option ||
        item.text ||
        item.value ||
        `Opción ${item.id}`,
      precio_extra:
        Number(
          item.precio_extra ??
            item.price ??
            item.price_extra ??
            item.extra_price ??
            0,
        ) || 0,
      obligatorio:
        item.es_opcion_obligatoria ??
        item.mandatory ??
        item.is_mandatory ??
        item.required ??
        item.is_required ??
        false,
      order: Number(item.order_index ?? item.order ?? 0),
    }))
    .sort((a, b) => a.order - b.order);

  return {
    id: group.id,
    nombre: group.name || group.nombre || group.title || `Grupo ${group.id}`,
    descripcion: group.description || group.descripcion || group.hint || "",
    obligatorio: Boolean(isRequired),
    selectionType,
    order: Number(group.order_index ?? group.orderIndex ?? group.order ?? 0),
    opciones,
  };
};

const initializeOptionSelections = (product) => {
  const selections = {};
  (product.optionGroups || []).forEach((group) => {
    const includedOption = (group.opciones || []).find(
      (option) => Number(option.precio_extra || 0) === 0,
    );
    selections[group.id] =
      group.selectionType === "multiple"
        ? (group.opciones || [])
            .filter((option) => Number(option.precio_extra || 0) === 0)
            .map((option) => option.id)
        : includedOption?.id || null;
  });
  return selections;
};

const getSelectedOptions = (product, selections) =>
  (product?.optionGroups || []).flatMap((group) => {
    const selected = selections[group.id];
    if (group.selectionType === "multiple") {
      return (Array.isArray(selected) ? selected : [])
        .map((id) => group.opciones.find((option) => option.id === id))
        .filter(Boolean);
    }
    const option = group.opciones.find((item) => item.id === selected);
    return option ? [option] : [];
  });

const getOptionsExtraPrice = (options) =>
  options.reduce((sum, option) => sum + Number(option.precio_extra || 0), 0);

const getStoredOptionLabel = (option) => {
  if (typeof option === "string") return option;
  if (!option || typeof option !== "object") return "Opción";
  return (
    option.nombre ||
    option.name ||
    option.label ||
    option.option_name ||
    option.title ||
    option.text ||
    option.value ||
    "Opción"
  );
};

const formatStoredOption = (option) => {
  const label = getStoredOptionLabel(option);
  const extraPrice =
    typeof option === "object" ? Number(option.precio_extra || 0) : 0;
  return extraPrice > 0 ? `${label} (+$${fmt(extraPrice).slice(1)})` : label;
};

const normalizeStoredOption = (option, itemId, index) => ({
  id: option?.id || `${itemId}-${index}`,
  nombre: getStoredOptionLabel(option),
  precio_extra:
    typeof option === "object" ? Number(option.precio_extra || 0) : 0,
});

function useTimer(startTime) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!startTime) {
      setT(0);
      return;
    }
    const tick = () => setT(Math.floor((Date.now() - startTime) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);
  const h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    s = t % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ─── Mesa Tile ────────────────────────────────────────────────────────────────
function MesaTile({ mesa, onOpen }) {
  const cfg = ESTADO[mesa.estado];
  const timer = useTimer(mesa.startTime);
  const total = calc(mesa.comanda);
  const isOcc = mesa.estado === "ocupada";
  const isSuc = mesa.estado === "sucio";

  return (
    <button
      onClick={() => onOpen(mesa)}
      className="relative flex flex-col rounded-2xl overflow-hidden transition-transform duration-100 active:scale-[0.95] focus:outline-none text-left"
      style={{
        background: `linear-gradient(145deg, ${cfg.glow}, #0c0c0c)`,
        border: `1.5px solid ${cfg.border}`,
        minHeight: 130,
      }}
    >
      {/* Color bar top */}
      <div
        className="h-[3px] w-full"
        style={{ background: cfg.color, opacity: isOcc ? 1 : 0.4 }}
      />

      {/* Pulse dot */}
      {(isSuc || mesa.estado === "reserva") && (
        <span className="absolute top-3 right-3 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
      )}

      <div className="flex flex-col flex-1 p-3 gap-2">
        {/* Number row */}
        <div className="flex items-start justify-between">
          <span className="text-2xl font-black tracking-tighter text-white leading-none">
            {mesa.numero}
          </span>
          <span
            className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md"
            style={{ background: `${cfg.color}22`, color: cfg.color }}
          >
            {cfg.label}
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 flex flex-col justify-end gap-1">
          {mesa.reserva?.nombre && (
            <span className="truncate text-[10px] font-bold text-slate-300">
              {mesa.reserva.nombre}
            </span>
          )}
          {mesa.estado === "reserva" &&
            (mesa.reserva?.fecha || mesa.reserva?.hora) && (
              <span className="flex items-center gap-1 text-[9px] font-bold text-blue-300">
                <Calendar size={9} />
                {formatReservationDateTime(
                  mesa.reserva.fecha,
                  mesa.reserva.hora,
                ) || `${mesa.reserva.fecha || ""} · ${mesa.reserva.hora || ""}`}
              </span>
            )}
          {mesa.estado === "reserva" && mesa.reserva?.personas > 0 && (
            <span className="flex items-center gap-1 text-[9px] font-bold text-slate-500">
              <Users size={9} />
              {mesa.reserva.personas} persona
              {mesa.reserva.personas !== 1 && "s"}
            </span>
          )}
          {isOcc && (
            <>
              <div className="flex items-center gap-1 text-slate-500">
                <Users size={9} />
                <span className="text-[9px] font-bold">
                  {mesa.personas} persona{mesa.personas !== 1 && "s"}
                </span>
              </div>
              <div className="text-[9px] font-mono text-slate-600 tabular-nums">
                {timer}
              </div>
            </>
          )}
          {isSuc && (
            <span className="text-[9px] font-black text-red-500 uppercase tracking-wide">
              Limpiar
            </span>
          )}
          {mesa.estado === "libre" && (
            <span className="text-[9px] text-slate-700 font-bold">
              Disponible
            </span>
          )}
        </div>

        {/* Total */}
        {isOcc && total > 0 && (
          <div className="text-sm font-black text-white">{fmt(total)}</div>
        )}
      </div>
    </button>
  );
}

// ─── Panel Body ───────────────────────────────────────────────────────────────
function PanelBody({ mesa, onUpdate, onClose, onToast }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("comanda");
  const [personas, setPersonas] = useState(mesa.personas);
  const [showReservaForm, setShowReservaForm] = useState(false);
  const [reservaNombre, setReservaNombre] = useState(
    mesa.reserva?.nombre || "",
  );
  const [reservaTelefono, setReservaTelefono] = useState(
    mesa.reserva?.telefono || "",
  );
  const [reservaEmail, setReservaEmail] = useState(mesa.reserva?.email || "");
  const [reservaHora, setReservaHora] = useState(mesa.reserva?.hora || "");
  const [reservaPersonas, setReservaPersonas] = useState(
    mesa.reserva?.personas || 1,
  );
  const timer = useTimer(mesa.startTime);
  const cfg = ESTADO[mesa.estado];
  const total = calc(mesa.comanda);

  const handleEstado = (s) => {
    if (s === "ocupada") {
      // Ocupada: marcar la mesa como ocupada
      onUpdate({
        ...mesa,
        estado: s,
        startTime: Date.now(),
        personas: mesa.reserva?.personas || Math.max(personas, 1),
      });
      onToast(`✓ Clientes sentados en mesa ${mesa.numero}`);
    } else if (s === "sucio") {
      // Desocupar: mesa termina de comer, ahora está sucia
      onUpdate({
        ...mesa,
        estado: s,
        startTime: null,
        personas: 0,
        comanda: [],
        total: 0,
        nota: "",
      });
      onToast(`Mesa ${mesa.numero} lista para limpiar`);
      onClose();
    } else if (s === "") {
      // Limpia: mesa está limpia y cerrada, lista para próxima orden
      onUpdate({
        ...mesa,
        estado: "",
        startTime: null,
        personas: 0,
        comanda: [],
        total: 0,
        nota: "",
        reserva: {
          nombre: "",
          telefono: "",
          email: "",
          hora: "",
          personas: 0,
          activa: false,
        },
      });
      onToast(`✓ Mesa ${mesa.numero} limpia y lista`);
      onClose();
    }
  };

  const handleCrearReserva = () => {
    if (!reservaNombre || !reservaTelefono || !reservaHora) {
      onToast("⚠️ Completa: nombre, teléfono, hora");
      return;
    }
    onUpdate({
      ...mesa,
      estado: "reserva",
      reserva: {
        nombre: reservaNombre,
        telefono: reservaTelefono,
        email: reservaEmail,
        hora: reservaHora,
        personas: reservaPersonas,
        activa: true,
      },
    });
    setShowReservaForm(false);
    onToast(`✓ Reserva para ${reservaNombre} a las ${reservaHora}`);
  };

  const handleConvertirReservaEnClientes = () => {
    if (mesa.reserva?.activa) {
      handleEstado("ocupada");
    }
  };

  const handleEditarEnPOS = () => {
    const payload = {
      mesa: String(mesa.numero),
      numero: String(mesa.numero),
      estado: mesa.estado,
      orderId: mesa.orderId,
      orderNumber: mesa.orderNumber || "",
      orderStatus: mesa.orderStatus || "",
      tableStatus: mesa.tableStatus || mesa.estado || "",
      isReservation: Boolean(mesa.isReservation),
      total: Number(mesa.total || 0),
      paymentMethod: mesa.paymentMethod || "",
      paymentStatus: mesa.paymentStatus || "pending",
      paymentMethods: Array.isArray(mesa.paymentMethods)
        ? mesa.paymentMethods
        : [],
      customerName: mesa.reserva?.nombre || "",
      customerPhone: mesa.reserva?.telefono || "",
      customerPhoneRaw: mesa.reserva?.telefono || "",
      notes: mesa.nota || mesa.reserva?.notas || "",
      nota: mesa.nota || mesa.reserva?.notas || "",
      deliveryMethod: mesa.deliveryMethod || "table",
      address: mesa.address || "",
      referencePoint: mesa.referencePoint || "",
      locationText: mesa.locationText || "",
      personas: mesa.personas || mesa.reserva?.personas || 1,
      fechaReserva: mesa.reserva?.fecha || "",
      horaReserva: mesa.reserva?.hora || "",
      comanda: (mesa.comanda || []).map((item) => ({
        id: item.id,
        orderItemId: item.id,
        orderBatchId: item.orderBatchId || null,
        cartId: item.id,
        productId: item.productId || item.id,
        qty: Number(item.qty || 1),
        name: item.item,
        price: Number(item.precio || 0),
        note: item.notes || "",
        notes: item.notes || "",
        optionNames: Array.isArray(item.options) ? item.options : [],
        options: Array.isArray(item.options) ? item.options : [],
        selectedOptions: Array.isArray(item.options)
          ? item.options.map((option, index) =>
              normalizeStoredOption(option, item.id, index),
            )
          : [],
      })),
    };

    navigate("/pos", { state: { mesaEdit: payload } });
  };

  return (
    <>
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-white/6 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: cfg.color }}
              />
              <span
                className="text-[9px] font-black uppercase tracking-[0.3em]"
                style={{ color: cfg.color }}
              >
                {cfg.label}
              </span>
              {mesa.estado === "ocupada" && (
                <span className="text-[9px] font-mono text-white/30 bg-white/5 px-2 py-0.5 rounded-full ml-1">
                  {timer}
                </span>
              )}
            </div>
            <h2 className="text-4xl font-black tracking-tighter text-white">
              MESA {mesa.numero}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/8 rounded-xl transition-colors"
          >
            <X size={16} className="text-slate-500" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/6 flex-shrink-0">
        {[
          ["comanda", "Comanda"],
          ["info", "Info"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-3 text-[9px] font-black uppercase tracking-widest transition-all ${tab === id ? "text-white border-b-2 border-blue-500" : "text-slate-600 hover:text-slate-400"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {tab === "comanda" && (
          <div className="p-5 space-y-0.5">
            {mesa.comanda.length === 0 ? (
              <div className="text-center py-14">
                <ChefHat
                  size={28}
                  className="mx-auto mb-3 text-slate-700 opacity-40"
                />
                <p className="text-sm font-bold text-slate-600 mb-3">
                  Comanda vacía
                </p>
                <p className="text-xs text-slate-700">
                  Usa Editar para agregar productos a esta mesa.
                </p>
              </div>
            ) : (
              mesa.comanda.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[minmax(0,1fr)_2rem_5rem] items-center gap-3 py-3 border-b border-white/5"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-start gap-3">
                      <p className="text-sm font-semibold text-slate-200 truncate">
                        {item.item}
                      </p>
                      <p className="text-[10px] text-slate-600 flex-shrink-0">
                        {fmt(item.precioInicial || item.precio)}
                      </p>
                    </div>
                    {item.options?.length > 0 && (
                      <p className="text-[10px] text-blue-400">
                        {item.options.map(formatStoredOption).join(" · ")}
                      </p>
                    )}
                  </div>
                  <span className="text-center text-sm font-black text-white">
                    {item.qty}
                  </span>
                  <span className="text-right text-sm font-black text-white">
                    {fmt(
                      Number(item.subtotal) > 0
                        ? item.subtotal
                        : item.precio * item.qty,
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "info" && (
          <div className="p-5 space-y-3">
            {/* Tarjeta del Cliente Titular con Enlaces de Comunicación Directa */}
            {mesa.reserva?.nombre && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4">
                <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest mb-3">
                  Titular de la Mesa
                </p>

                <div className="space-y-3">
                  {/* Nombre del cliente */}
                  <p className="text-base font-black text-white flex items-center gap-2">
                    {mesa.reserva.nombre}
                  </p>

                  {/* Notas de la reserva */}
                  {mesa.reserva.notas && (
                    <div className="bg-white/3 border border-white/5 rounded-xl p-2.5">
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">
                        Notas
                      </p>
                      <p className="text-xs text-slate-300 whitespace-pre-wrap break-words">
                        {mesa.reserva.notas}
                      </p>
                    </div>
                  )}

                  {/* Acciones para el Teléfono */}
                  {mesa.reserva.telefono && (
                    <div className="flex items-center justify-between bg-white/3 p-2 rounded-xl border border-white/5">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                          Teléfono
                        </span>
                        <span className="text-xs text-slate-300 font-mono">
                          {mesa.reserva.telefono}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {/* Botón WhatsApp */}
                        <a
                          href={`https://wa.me/${mesa.reserva.telefono.replace(/\s+/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="w-8 h-8 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 flex items-center justify-center transition-colors border border-green-500/20"
                          title="Enviar WhatsApp"
                        >
                          <svg
                            className="w-4 h-4 fill-current"
                            viewBox="0 0 24 24"
                          >
                            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.713-1.457L0 24zm6.59-4.846c1.66.986 3.288 1.479 5.357 1.48 5.389 0 9.772-4.385 9.775-9.78.001-2.61-1.01-5.066-2.847-6.906C17.1 2.105 14.633.925 12.013.925c-5.394 0-9.778 4.387-9.78 9.784-.001 2.012.497 3.618 1.442 5.256L2.6 21.066l4.047-1.912zm13.125-6.974c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.074-.297-.15-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.67-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.199 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347z" />
                          </svg>
                        </a>
                        {/* Botón Llamar */}
                        <a
                          href={`tel:${mesa.reserva.telefono}`}
                          className="w-8 h-8 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 flex items-center justify-center transition-colors border border-blue-500/20"
                          title="Llamar por Teléfono"
                        >
                          <Phone size={14} />
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Acciones para el Correo Electrónico */}
                  {mesa.reserva.email && (
                    <div className="flex items-center justify-between bg-white/3 p-2 rounded-xl border border-white/5">
                      <div className="flex flex-col min-w-0 flex-1 mr-2">
                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                          Correo
                        </span>
                        <span className="text-xs text-slate-300 truncate">
                          {mesa.reserva.email}
                        </span>
                      </div>
                      {/* Botón Email */}
                      <a
                        href={`mailto:${mesa.reserva.email}`}
                        className="w-8 h-8 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 flex items-center justify-center transition-colors border border-purple-500/20 shrink-0"
                        title="Enviar Correo"
                      >
                        <Mail size={14} />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Selector del número de personas */}
            <div className="bg-white/3 border border-white/7 rounded-2xl p-4">
              <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-3">
                Modificar Personas en Mesa
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPersonas((p) => Math.max(0, p - 1))}
                  className="w-11 h-11 rounded-full bg-white/8 active:bg-white/20 flex items-center justify-center text-white"
                >
                  <Minus size={14} />
                </button>
                <span className="text-3xl font-black text-white flex-1 text-center">
                  {personas}
                </span>
                <button
                  onClick={() => setPersonas((p) => Math.min(12, p + 1))}
                  className="w-11 h-11 rounded-full bg-white/8 active:bg-white/20 flex items-center justify-center text-white"
                >
                  <Plus size={14} />
                </button>
                <button
                  onClick={() => {
                    onUpdate({ ...mesa, personas });
                    onToast("Actualizado");
                  }}
                  className="w-11 h-11 rounded-full bg-blue-600/25 border border-blue-500/30 text-blue-300 flex items-center justify-center active:scale-95"
                >
                  <Check size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] bg-black/40 border-t border-white/6 flex-shrink-0 space-y-3">
        {mesa.estado === "ocupada" && (
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
              Total
            </span>
            <span className="text-2xl font-black text-white tracking-tighter">
              {fmt(total)}
            </span>
          </div>
        )}
        <div className="flex gap-1.5 flex-wrap">
          {/* BOTÓN 1: Ocupada */}
          <button
            onClick={() => handleEstado("ocupada")}
            className={`px-3 py-1.5 rounded-xl border text-[8px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center gap-1 ${
              mesa.estado === "ocupada" ? "shadow-lg" : "opacity-45"
            }`}
            style={{
              background: mesa.estado === "ocupada" ? "#f9731635" : "#f9731608",
              borderColor: mesa.estado === "ocupada" ? "#f97316" : "#f9731640",
              color: "#f97316",
            }}
          >
            <Users size={9} /> Ocupada
          </button>
          {/* BOTÓN 2: Desocupar (ocupada → sucio) */}
          <button
            onClick={() => handleEstado("sucio")}
            className={`px-3 py-1.5 rounded-xl border text-[8px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center gap-1 ${
              mesa.estado === "sucio" ? "shadow-lg" : "opacity-45"
            }`}
            style={{
              background: mesa.estado === "sucio" ? "#ef444435" : "#ef444408",
              borderColor: mesa.estado === "sucio" ? "#ef4444" : "#ef444440",
              color: "#ef4444",
            }}
          >
            <RotateCcw size={9} /> Desocupar
          </button>
          {/* BOTÓN 3: Limpia (sucio → vacío) */}
          <button
            onClick={() => handleEstado("")}
            className={`px-3 py-1.5 rounded-xl border text-[8px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center gap-1 ${
              mesa.estado === "" ? "shadow-lg" : "opacity-45"
            }`}
            style={{
              background: mesa.estado === "" ? "#22c55e35" : "#22c55e08",
              borderColor: mesa.estado === "" ? "#22c55e" : "#22c55e40",
              color: "#22c55e",
            }}
          >
            <CheckCircle2 size={9} /> Limpia
          </button>
          {mesa.estado === "" && (
            <button
              onClick={() => setShowReservaForm(true)}
              className="px-3 py-1.5 rounded-xl border text-[8px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center gap-1"
              style={{
                background: "#3b82f615",
                borderColor: "#3b82f640",
                color: "#3b82f6",
              }}
            >
              <Calendar size={9} /> Hacer Reserva
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2">
          <button
            onClick={handleEditarEnPOS}
            className="py-4 bg-violet-500/10 border border-violet-500/25 rounded-2xl text-[9px] font-black uppercase tracking-widest text-violet-300 active:scale-95 transition-all flex items-center justify-center gap-1.5"
          >
            <Edit3 size={11} /> Editar
          </button>
        </div>
      </div>

      {/* Modal Reserva */}
      <AnimatePresence>
        {showReservaForm && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
              onClick={() => setShowReservaForm(false)}
            />
            <motion.div
              className="relative bg-[#0c0c0c] border border-white/10 rounded-3xl p-6 max-w-md w-full space-y-4"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <h3 className="text-xl font-black text-white flex items-center gap-2">
                <Calendar size={20} className="text-blue-400" />
                Nueva Reserva
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">
                    Nombre *
                  </label>
                  <input
                    value={reservaNombre}
                    onChange={(e) => setReservaNombre(e.target.value)}
                    placeholder="Nombre del cliente"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/30"
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1">
                    <Phone size={10} /> Teléfono *
                  </label>
                  <input
                    value={reservaTelefono}
                    onChange={(e) => setReservaTelefono(e.target.value)}
                    placeholder="Ej: +57 300 123 4567"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/30"
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1">
                    <Mail size={10} /> Email
                  </label>
                  <input
                    value={reservaEmail}
                    onChange={(e) => setReservaEmail(e.target.value)}
                    placeholder="cliente@email.com"
                    type="email"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/30"
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1">
                    <Clock size={10} /> Hora *
                  </label>
                  <input
                    value={reservaHora}
                    onChange={(e) => setReservaHora(e.target.value)}
                    placeholder="18:30"
                    type="time"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/30"
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1">
                    <Users size={10} /> Personas
                  </label>
                  <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-3">
                    <button
                      onClick={() =>
                        setReservaPersonas(Math.max(1, reservaPersonas - 1))
                      }
                      className="w-8 h-8 rounded-full bg-white/8 active:bg-white/20 flex items-center justify-center"
                    >
                      <Minus size={12} className="text-slate-400" />
                    </button>
                    <span className="flex-1 text-center font-black text-white">
                      {reservaPersonas}
                    </span>
                    <button
                      onClick={() =>
                        setReservaPersonas(Math.min(12, reservaPersonas + 1))
                      }
                      className="w-8 h-8 rounded-full bg-white/8 active:bg-white/20 flex items-center justify-center"
                    >
                      <Plus size={12} className="text-slate-400" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowReservaForm(false)}
                  className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-sm font-black text-slate-300 uppercase tracking-wider active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCrearReserva}
                  className="flex-1 py-3 bg-blue-600 rounded-xl text-sm font-black text-white uppercase tracking-wider active:scale-95 shadow-lg shadow-blue-600/20"
                >
                  Reservar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Panel / Bottom Sheet (responsive) ───────────────────────────────────────
function MesaPanel({ mesa, onClose, onUpdate, onToast, products = [] }) {
  return (
    <AnimatePresence>
      {mesa && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-stretch justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Panel — bottom sheet on mobile, side panel on sm+ */}
          <motion.div
            className="relative z-10 flex flex-col bg-background border-white/8
              w-full sm:w-[400px]
              rounded-t-3xl sm:rounded-none
              max-h-[92dvh] sm:max-h-full sm:h-full
              border-t sm:border-t-0 sm:border-l
              shadow-2xl overflow-hidden"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 38 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.3 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80) onClose();
            }}
            style={{ touchAction: "pan-x" }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0 sm:hidden">
              <div className="w-10 h-1 bg-white/15 rounded-full" />
            </div>
            <PanelBody
              mesa={mesa}
              onUpdate={onUpdate}
              onClose={onClose}
              onToast={onToast}
              products={products}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function MesasPOS() {
  try {
    useOutletContext();
  } catch (_) {}

  const { user } = useAuth();
  const [mesas, setMesas] = useState([]);
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [businessId, setBusinessId] = useState(null);
  const toastRef = useRef(null);

  // Cargar datos de Supabase
  const loadProductsFromDB = useCallback(async (businessIdParam) => {
    if (!businessIdParam) return;

    const cachedProducts = readProductsCache(businessIdParam);
    if (cachedProducts.length > 0) {
      setProducts(cachedProducts);
    }

    try {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id,name,description,price,stock,image_url,is_active,is_sold_out,category_id,order_index,created_at",
        )
        .eq("business_id", businessIdParam)
        .eq("is_active", true)
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error cargando productos:", error);
        setProducts([]);
        return;
      }

      const { data: categoryData, error: categoryError } = await supabase
        .from("categories")
        .select("id,name")
        .eq("business_id", businessIdParam);

      if (categoryError) {
        console.error("Error cargando categorías:", categoryError);
      }

      const categoryNamesById = (categoryData || []).reduce((result, item) => {
        result[item.id] = item.name;
        return result;
      }, {});

      let optionGroupsByProduct = {};
      if ((data || []).length > 0) {
        const productIds = data.map((item) => item.id);
        const [groupsRes, itemsRes] = await Promise.all([
          supabase
            .from("product_option_groups")
            .select("*")
            .in("product_id", productIds)
            .order("order_index", { ascending: true }),
          supabase
            .from("products_items")
            .select("*")
            .in("product_id", productIds)
            .order("order_index", { ascending: true }),
        ]);

        if (itemsRes.error) {
          console.error("Error cargando opciones de producto:", itemsRes.error);
        }
        if (groupsRes.error) {
          console.error("Error cargando grupos de opciones:", groupsRes.error);
        }

        const itemsByGroup = {};
        (itemsRes.data || []).forEach((item) => {
          const groupId = item.option_group_id;
          if (!groupId) return;
          itemsByGroup[groupId] = itemsByGroup[groupId] || [];
          itemsByGroup[groupId].push(item);
        });

        const groupsByProduct = {};
        (groupsRes.data || []).forEach((group) => {
          const productId = group.product_id;
          groupsByProduct[productId] = groupsByProduct[productId] || [];
          groupsByProduct[productId].push(
            normalizeOptionGroup(group, itemsByGroup[group.id] || []),
          );
        });

        optionGroupsByProduct = groupsByProduct;
      }

      const normalizedProducts = (data || []).map((item) => ({
        id: item.id,
        productId: item.id,
        nombre: item.name,
        name: item.name,
        category: item.category_id || "otros",
        categoryName: categoryNamesById[item.category_id] || "Otros",
        precio: Number(item.price || 0),
        price: Number(item.price || 0),
        description: item.description || "",
        image_url: item.image_url || "",
        optionGroups: optionGroupsByProduct[item.id] || [],
        stock: Number(item.stock || 0),
      }));

      setProducts(normalizedProducts);
      writeProductsCache(businessIdParam, normalizedProducts);
    } catch (err) {
      console.error("Error en loadProductsFromDB:", err);
      if (cachedProducts.length === 0) {
        setProducts([]);
      }
    }
  }, []);

  // Cargar datos de Supabase
  const loadMesasFromDB = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Obtener business_id del usuario
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || !profile?.business_id) {
        console.error("Error obteniendo negocio:", profileError);
        setLoading(false);
        return;
      }

      setBusinessId(profile.business_id);

      // Los productos se necesitan al editar; no deben bloquear la carga de mesas.
      loadProductsFromDB(profile.business_id);

      // Cargar órdenes de tipo "mesa". Las órdenes antiguas pueden tener
      // table_status NULL, así que su estado activo se deriva de status.
      const { data: ordenes, error: ordenesError } = await supabase
        .from("orders")
        .select(
          `id, 
          order_number, 
          status, 
          mesa, 
          total, 
          created_at, 
          customer_name, 
          customer_phone, 
          notes,
          table_status,
          payment_method,
          payment_status,
          order_type,
          is_reservation,
          personas,
          fecha_reserva,
          hora_reserva,
          delivery_address,
          delivery_instructions,
          punto,
          metadata,
          order_items(id, order_batch_id, product_id, product_name, quantity, init_price, unit_price, subtotal, options, notes)`,
        )
        .eq("business_id", profile.business_id)
        .eq("order_type", "table")
        .order("created_at", { ascending: false });

      if (ordenesError) {
        console.error("Error cargando órdenes de mesa:", ordenesError);
        setLoading(false);
        return;
      }

      const today = getLocalDateKey();

      // Las reservas caducan visualmente por fecha; las mesas activas no.
      const mesasOrdenes = (ordenes || [])
        .filter((orden) => {
          if (!orden.mesa || !getTableStateFromOrder(orden)) {
            return false;
          }

          const isReservation =
            Boolean(orden.is_reservation) ||
            getTableStateFromOrder(orden) === "reserva";

          return !isReservation || orden.fecha_reserva === today;
        })
        .map((orden) => ({
          id: `order-${orden.id}`,
          orderId: orden.id,
          orderNumber: orden.order_number || "",
          orderStatus: orden.status || "",
          tableStatus: orden.table_status || "",
          isReservation: Boolean(orden.is_reservation),
          numero: String(orden.mesa),
          estado: getTableStateFromOrder(orden),
          paymentMethod: orden.payment_method || "",
          paymentStatus: orden.payment_status || "pending",
          paymentMethods: getPaymentMethodsFromMetadata(orden.metadata),
          deliveryMethod: normalizeDeliveryMethod(
            orden.metadata?.metodoEntrega ||
              orden.order_type ||
              (orden.punto
                ? "point"
                : orden.delivery_address
                  ? "delivery"
                  : "table"),
          ),
          address: orden.delivery_address || "",
          referencePoint: orden.delivery_instructions || "",
          locationText: orden.punto || "",
          personas: Number(orden.personas) || 0,
          fechaReserva: orden.fecha_reserva || "",
          horaReserva: orden.hora_reserva || "",
          startTime: new Date(orden.created_at).getTime(),
          total: parseFloat(orden.total) || 0,
          comanda: (orden.order_items || []).map((item) => ({
            id: item.id,
            orderBatchId: item.order_batch_id || null,
            productId: item.product_id,
            item: item.product_name || "Producto",
            precio: parseFloat(item.unit_price) || 0,
            precioInicial: parseFloat(item.init_price) || 0,
            qty: parseInt(item.quantity) || 1,
            subtotal: parseFloat(item.subtotal) || 0,
            options: item.options || [],
            notes: item.notes || "",
          })),
          nota: orden.notes || "",
          reserva: {
            nombre: orden.customer_name || "",
            telefono: orden.customer_phone || "",
            email: "",
            hora: orden.hora_reserva || "",
            fecha: orden.fecha_reserva || "",
            personas: Number(orden.personas) || 0,
            activa: orden.table_status === "reserva",
            notas: orden.notes || "",
          },
        }))
        // Ordenar por número de mesa
        .sort((a, b) => parseInt(a.numero) - parseInt(b.numero));

      // Solo mostrar mesas con una orden activa o una reserva vigente.
      setMesas(mesasOrdenes);
    } catch (err) {
      console.error("Error en loadMesas:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadMesasFromDB();
  }, [loadMesasFromDB]);

  useEffect(() => {
    const refreshAtDateBoundary = window.setInterval(() => {
      loadMesasFromDB();
    }, 60 * 1000);

    return () => window.clearInterval(refreshAtDateBoundary);
  }, [loadMesasFromDB]);

  // Suscribirse a cambios en órdenes
  useEffect(() => {
    if (!user?.id || !businessId) return;

    const subscription = supabase
      .channel(`orders-mesas-${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `business_id=eq.${businessId}`,
        },
        () => {
          loadMesasFromDB();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [user?.id, businessId, loadMesasFromDB]);

  // Keep panel in sync with state changes
  useEffect(() => {
    if (!selected) return;
    const updated = mesas.find((m) => m.id === selected.id);
    if (updated) setSelected(updated);
    else setSelected(null);
  }, [mesas]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // Actualizar mesa y sincronizar con Supabase
  const updateMesa = useCallback(
    async (updated) => {
      // Una mesa limpia deja de ser una mesa activa y desaparece del tablero.
      if (updated.estado === "") {
        setMesas((prev) => prev.filter((m) => m.id !== updated.id));
        setSelected((current) => (current?.id === updated.id ? null : current));
      } else {
        setMesas((prev) =>
          prev.map((m) => (m.id === updated.id ? updated : m)),
        );
      }

      // Si tiene orderId, actualizar en Supabase
      if (updated.orderId && businessId) {
        try {
          const { error } = await supabase
            .from("orders")
            .update({
              status: updated.estado === "" ? "pending" : updated.orderStatus,
              table_status: updated.estado,
              notes: updated.nota,
              personas: Number(updated.personas) || 0,
              updated_at: new Date().toISOString(),
            })
            .eq("id", updated.orderId)
            .eq("business_id", businessId);

          if (error) {
            console.error("Error actualizando mesa en Supabase:", error);
            showToast("⚠️ Error guardando cambios");
          }
        } catch (err) {
          console.error("Error en updateMesa:", err);
          showToast("⚠️ Error guardando cambios");
        }
      }
    },
    [businessId, showToast],
  );

  const kpis = {
    total: mesas.length,
    ocupadas: mesas.filter((m) => m.estado === "ocupada").length,
    reservas: mesas.filter((m) => m.estado === "reserva").length,
    sucias: mesas.filter((m) => m.estado === "sucio").length,
  };

  const visible = mesas.filter((m) => {
    const matchF = filter === "all" || m.estado === filter;
    const matchS = !search || m.numero.includes(search);
    return matchF && matchS;
  });

  return (
    <div className="min-h-screen bg-background text-white font-sans flex flex-col">
      {/* ── Header ── */}
      <div className="sticky top-0 z-40 bg-background backdrop-blur-xl border-b border-white/6 px-4 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-black tracking-tighter">Mesas</h1>
        </div>

        {/* KPIs con Wrap Optimizado - Mobile First */}
        <div className="flex flex-wrap w-full gap-2 mb-3 overflow-visible py-1.5 px-0.5">
          {[
            {
              id: "all",
              label: "Todas",
              value: kpis.total,
              color: "text-white",
              activeBorder: "border-white/40",
            },
            {
              id: "ocupada",
              label: "Ocupadas",
              value: kpis.ocupadas,
              color: "text-orange-400",
              activeBorder: "border-orange-500/50",
            },
            {
              id: "reserva",
              label: "Reservas",
              value: kpis.reservas,
              color: "text-blue-400",
              activeBorder: "border-blue-500/50",
            },
            {
              id: "sucio",
              label: "Por Limpiar",
              value: kpis.sucias,
              color: "text-red-400",
              activeBorder: "border-red-500/50",
            },
          ].map(({ id, label, value, color, activeBorder }) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`
        relative flex-1 min-w-[70px] flex flex-col items-center justify-center 
        bg-white/3 border rounded-xl py-3 px-2 text-center transition-all active:scale-95
        ${filter === id ? `${activeBorder} bg-white/10` : "border-white/6"}
      `}
            >
              <p className={`text-lg font-black ${color} leading-none`}>
                {value}
              </p>
              <p className="text-[7px] font-black uppercase tracking-widest mt-1 text-slate-500">
                {label}
              </p>

              {filter === id && (
                <motion.div
                  layoutId="filter-dot"
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ backgroundColor: "currentColor" }}
                />
              )}
            </button>
          ))}
        </div>
        {/* Filters + Search simplificado */}
        <div className="flex gap-2 items-center justify-between">
          <div className="flex-1">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
              Filtrando por:{" "}
              <span className="text-white">
                {filter === "all" ? "Todas" : filter}
              </span>
            </p>
          </div>

          <div className="relative flex-shrink-0">
            <Search
              size={11}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar mesa..."
              className="w-40 bg-white/5 border border-white/8 rounded-full pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-700 outline-none focus:border-white/20 transition-all"
            />
          </div>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="flex-1 p-4 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-24">
            {[0, 1, 2].map((dot) => (
              <motion.span
                key={dot}
                className="h-2 w-2 rounded-full bg-blue-400"
                animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1, 0.8] }}
                transition={{
                  duration: 0.9,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: dot * 0.15,
                }}
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-700">
            <Search size={32} className="mb-3 opacity-30" />
            <p className="font-bold text-sm">Sin mesas</p>
          </div>
        ) : (
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            }}
          >
            {visible.map((mesa) => (
              <MesaTile key={mesa.id} mesa={mesa} onOpen={setSelected} />
            ))}
          </div>
        )}
      </div>

      {/* ── Panel ── */}
      <MesaPanel
        mesa={selected}
        onClose={() => setSelected(null)}
        onUpdate={updateMesa}
        onToast={showToast}
        products={products}
      />

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-2.5 bg-white/10 backdrop-blur-xl border border-white/15 rounded-full text-xs font-bold text-white shadow-2xl whitespace-nowrap pointer-events-none"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
