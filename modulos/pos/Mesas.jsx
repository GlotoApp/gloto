import { useState, useRef, useEffect, useCallback } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../src/lib/supabaseClient";
import { buildProductOptionGroups } from "../../src/lib/productOptions";
import { getEnabledDeliveryMethods } from "../../src/lib/deliveryMethods";
import { SubLoading } from "./Loading";
import { useAuth } from "../../src/components/AuthContext";
import {
  X,
  RotateCcw,
  Shrink,
  CheckCircle2,
  Plus,
  ChefHat,
  Minus,
  Edit3,
  Check,
  Users,
  Calendar,
  Phone,
  Mail,
  Clock,
  LayoutGrid,
  Pencil,
  Trash2,
  Move,
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
  clean: {
    color: "#6b7280",
    glow: "#6b728010",
    border: "#6b728030",
    label: "Limpia",
    pulse: false,
  },
};

// ─── Utils ────────────────────────────────────────────────────────────────────
const fmt = (n) => `$${Number(n).toLocaleString("es-CO")}`;
const FLOOR_CANVAS_WIDTH = 1600;
const FLOOR_CANVAS_HEIGHT = 1000;
const FLOOR_TABLE_SHAPES = ["round", "square", "rectangle"];
const FLOOR_CHAIR_SIZE = 12;
const FLOOR_CHAIR_GAP = 12;
const FLOOR_CHAIR_OUTSET = FLOOR_CHAIR_GAP + FLOOR_CHAIR_SIZE;
const getFloorChairPositions = (shape, count) => {
  const chairs = Math.max(0, Math.floor(Number(count) || 0));
  if (!chairs) return [];

  const isMobile = window.innerWidth < 640;
  const width = shape === "rectangle" ? (isMobile ? 108 : 128) : isMobile ? 78 : 92;
  const height = shape === "rectangle" ? (isMobile ? 68 : 76) : isMobile ? 78 : 92;

  if (shape === "round") {
    const radius = width / 2 + FLOOR_CHAIR_GAP + FLOOR_CHAIR_SIZE / 2;
    return Array.from({ length: chairs }, (_, index) => {
      const angle = (2 * Math.PI * index) / chairs - Math.PI / 2;
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
    });
  }

  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const edgeOffset = FLOOR_CHAIR_GAP + FLOOR_CHAIR_SIZE / 2;
  const perimeter = 4 * (halfWidth + halfHeight);

  return Array.from({ length: chairs }, (_, index) => {
    let distance = (perimeter * (index + 0.5)) / chairs;
    if (distance < width) {
      return { x: -halfWidth + distance, y: -halfHeight - edgeOffset };
    }
    distance -= width;
    if (distance < height) {
      return { x: halfWidth + edgeOffset, y: -halfHeight + distance };
    }
    distance -= height;
    if (distance < width) {
      return { x: halfWidth - distance, y: halfHeight + edgeOffset };
    }
    distance -= width;
    return { x: -halfWidth - edgeOffset, y: halfHeight - distance };
  });
};
const getFloorTableGuestCount = (table) =>
  Math.max(
    0,
    Math.floor(Number(table.order?.personas ?? table.guest_count) || 0),
  );
const getNextFloorTableShape = (shape) => {
  const currentIndex = FLOOR_TABLE_SHAPES.indexOf(shape);
  return FLOOR_TABLE_SHAPES[(currentIndex + 1) % FLOOR_TABLE_SHAPES.length];
};
const getFloorGridPosition = (index) => {
  const columns = window.innerWidth < 640 ? 3 : 5;
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    position_x: columns === 3 ? 17 + column * 33 : 12 + column * 19,
    position_y: Math.min(90, 20 + row * 24),
  };
};
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
  ["", "clean", "limpia"].includes(
    String(tableStatus ?? "")
      .trim()
      .toLowerCase(),
  )
    ? "clean"
    : String(tableStatus ?? "")
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
  return ["pending", "confirmed", "preparing", "ready", "complete"].includes(
    orderStatus,
  )
    ? "ocupada"
    : "";
};

const isClosedTableOrder = (order) =>
  String(order.table_status ?? "")
    .trim()
    .toLowerCase() === "cerrada";

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
    option.option ||
    option.variant ||
    option.variant_name ||
    option.nombre_opcion ||
    "Opción"
  );
};

const formatStoredOption = (option) => {
  if (typeof option === "string") {
    try {
      const parsedOption = JSON.parse(option);
      if (parsedOption && typeof parsedOption === "object") {
        return formatStoredOption(parsedOption);
      }
    } catch {
      return option.trim() || "Opción";
    }
  }
  const label = getStoredOptionLabel(option);
  const extraPrice =
    typeof option === "object"
      ? Number(
          option.precio_extra ??
            option.price_extra ??
            option.extra_price ??
            option.price ??
            0,
        )
      : 0;
  const group =
    typeof option === "object"
      ? option.grupo || option.grupoNombre || ""
      : "";
  const displayLabel = group ? `${group}: ${label}` : label;
  return extraPrice > 0
    ? `${displayLabel} (+$${fmt(extraPrice).slice(1)})`
    : displayLabel;
};

const getCatalogOption = (products, productId, option) => {
  const optionId = typeof option === "object" ? option?.id : option;
  if (!optionId) return null;
  const product = products.find((item) => item.id === productId);
  const findOption = (groups) => {
    for (const group of groups || []) {
      for (const option of group.opciones || []) {
        if (String(option.id) === String(optionId)) {
          return { ...option, grupo: group.nombre };
        }
        const childOption = findOption(option.grupos || []);
        if (childOption) return childOption;
      }
    }
    return null;
  };
  return findOption(product?.optionGroups || []);
};

const formatOrderOption = (option, products, productId) => {
  const catalogOption = getCatalogOption(products, productId, option);
  return formatStoredOption(catalogOption || option);
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

// ─── Panel Body ───────────────────────────────────────────────────────────────
function PanelBody({
  mesa,
  onUpdate,
  onClose,
  onCloseMesa,
  onToast,
  products = [],
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("comanda");
  const [personas, setPersonas] = useState(mesa.personas);
  const [showReservaForm, setShowReservaForm] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
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
        nota: mesa.nota || "",
      });
      onToast(`Mesa ${mesa.numero} lista para limpiar`);
      onClose();
    } else if (s === "clean") {
      // Limpia: permanece visible hasta que se cierre explícitamente.
      onUpdate({
        ...mesa,
        estado: "clean",
        startTime: null,
        personas: 0,
        nota: mesa.nota || "",
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

  const handleCerrarMesa = () => {
    setShowCloseConfirm(false);
    onCloseMesa(mesa);
    onToast(`Mesa ${mesa.numero} cerrada`);
    onClose();
  };

  const handleEditarEnPOS = () => {
    if (mesa.isFloorTable) {
      navigate("/pos", {
        state: { mesaNueva: String(mesa.numero) },
      });
      return;
    }

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
      deliveryFee: Number(mesa.deliveryFee || 0),
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
        optionNames: Array.isArray(item.options)
          ? item.options.map((option) =>
              formatOrderOption(option, products, item.productId || item.id),
            )
          : [],
        options: Array.isArray(item.options) ? item.options : [],
        selectedOptions: Array.isArray(item.options)
          ? item.options.map((option, index) =>
              normalizeStoredOption(
                getCatalogOption(products, item.productId || item.id, option) ||
                  option,
                item.id,
                index,
              ),
            )
          : [],
      })),
    };

    navigate("/pos", { state: { mesaEdit: payload } });
  };

  return (
    <>
      {/* Header */}
      <div className="flex-shrink-0 border-b border-white/6 px-6 pb-4 pt-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="min-w-0">
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
          <div className="flex items-center gap-1">
            <button
              onClick={onClose}
              className="rounded-xl p-2 transition-colors hover:bg-white/8"
              aria-label="Cerrar panel"
            >
              <X size={16} className="text-slate-500" />
            </button>
          </div>
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
                        {item.options
                          .map((option) =>
                            formatOrderOption(option, products, item.productId),
                          )
                          .join(" · ")}
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
                  onClick={() =>
                    setPersonas((p) =>
                      mesa.isFloorTable
                        ? p + 1
                        : Math.min(12, p + 1),
                    )
                  }
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
            onClick={() => handleEstado("clean")}
            className={`px-3 py-1.5 rounded-xl border text-[8px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center gap-1 ${
              mesa.estado === "clean" ? "shadow-lg" : "opacity-45"
            }`}
            style={{
              background: mesa.estado === "clean" ? "#22c55e35" : "#22c55e08",
              borderColor: mesa.estado === "clean" ? "#22c55e" : "#22c55e40",
              color: "#22c55e",
            }}
          >
            <CheckCircle2 size={9} /> Limpia
          </button>
        </div>
        {total > 0 && (
          <div className="flex items-center justify-between border-y border-white/6 py-3">
            <span className="text-sm font-black uppercase tracking-[0.18em] text-white">
              Total del pedido
            </span>
            <span className="text-2xl font-black tracking-tighter text-white">
              {fmt(total)}
            </span>
          </div>
        )}
        <div
          className={`grid gap-2 ${mesa.estado !== "reserva" ? "grid-cols-2" : "grid-cols-1"}`}
        >
          {mesa.estado !== "reserva" && (
            <button
              onClick={() => setShowCloseConfirm(true)}
              className="flex items-center justify-center gap-1 rounded-2xl border border-red-500/25 bg-red-500/10 py-4 text-[9px] font-black uppercase tracking-widest text-red-300 transition-colors hover:bg-red-500/20 active:scale-95"
            >
              <CheckCircle2 size={11} /> Cerrar mesa
            </button>
          )}
          <button
            onClick={handleEditarEnPOS}
            className="flex items-center justify-center gap-1.5 rounded-2xl border border-violet-500/25 bg-violet-500/10 py-4 text-[9px] font-black uppercase tracking-widest text-violet-300 transition-all active:scale-95"
          >
            <Edit3 size={11} /> Editar
          </button>
        </div>
      </div>

      {showCloseConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setShowCloseConfirm(false)}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#0c0c0c] p-6 shadow-2xl">
            <h3 className="text-lg font-black uppercase text-white">
              ¿Cerrar mesa {mesa.numero}?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              La mesa se cerrará y dejará de estar disponible en el tablero.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowCloseConfirm(false)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-300 hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCerrarMesa}
                className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-red-500"
              >
                Cerrar mesa
              </button>
            </div>
          </div>
        </div>
      )}

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
function MesaPanel({
  mesa,
  onClose,
  onUpdate,
  onCloseMesa,
  onToast,
  products = [],
}) {
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
              onCloseMesa={onCloseMesa}
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
  const navigate = useNavigate();
  const [mesas, setMesas] = useState([]);
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [businessId, setBusinessId] = useState(null);
  const [floorAreas, setFloorAreas] = useState([]);
  const [floorTables, setFloorTables] = useState([]);
  const [activeFloorAreaId, setActiveFloorAreaId] = useState(null);
  const [isEditingFloor, setIsEditingFloor] = useState(false);
  const [floorView, setFloorView] = useState({ zoom: 1, x: 0, y: 0 });
  const [editingAreaId, setEditingAreaId] = useState(null);
  const [areaFormMode, setAreaFormMode] = useState(null);
  const [areaNameDraft, setAreaNameDraft] = useState("");
  const floorRef = useRef(null);
  const floorTablesRef = useRef(floorTables);
  const floorDragRef = useRef(null);
  const floorPanRef = useRef(null);
  const ordersRefreshTimeoutRef = useRef(null);
  const areaRenameSavingRef = useRef(new Set());
  const toastRef = useRef(null);
  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const updateFloorView = (nextView) => {
    setFloorView((current) => {
      const bounds = floorRef.current?.getBoundingClientRect();
      const next = typeof nextView === "function" ? nextView(current) : nextView;
      if (!bounds) return next;
      const maxPanX = Math.max(
        bounds.width / 2,
        (FLOOR_CANVAS_WIDTH * next.zoom - bounds.width) / 2,
      );
      const maxPanY = Math.max(
        bounds.height / 2,
        (FLOOR_CANVAS_HEIGHT * next.zoom - bounds.height) / 2,
      );
      return {
        ...next,
        x: Math.max(-maxPanX, Math.min(maxPanX, next.x)),
        y: Math.max(-maxPanY, Math.min(maxPanY, next.y)),
      };
    });
  };

  const zoomFloor = (amount) => {
    updateFloorView((current) => ({
      ...current,
      zoom: Math.max(0.15, Math.min(2.5, Number((current.zoom + amount).toFixed(2)))),
    }));
  };

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
        .from("categories_shop")
        .select("id,name,order_index,created_at")
        .eq("business_id", businessIdParam)
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true });

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

        const groupsByProduct = {};
        (groupsRes.data || []).forEach((group) => {
          const productId = group.product_id;
          groupsByProduct[productId] = groupsByProduct[productId] || [];
          groupsByProduct[productId].push(group);
        });

        optionGroupsByProduct = Object.fromEntries(
          data.map((product) => [
            product.id,
            buildProductOptionGroups(
              groupsByProduct[product.id] || [],
              (itemsRes.data || []).filter(
                (option) => option.product_id === product.id,
              ),
            ),
          ]),
        );
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
  const loadMesasFromDB = useCallback(async ({ showLoading = true } = {}) => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      if (showLoading) setLoading(true);

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

      const { data: businessInfo, error: businessInfoError } = await supabase
        .from("business_info")
        .select("delivery_methods")
        .eq("business_id", profile.business_id)
        .maybeSingle();

      if (businessInfoError) {
        console.error(
          "Error verificando si la tienda usa mesas:",
          businessInfoError,
        );
        setLoading(false);
        return;
      }
      if (
        !getEnabledDeliveryMethods(businessInfo?.delivery_methods).includes(
          "table",
        )
      ) {
        navigate("/pos", { replace: true });
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
          delivery_fee,
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
          if (!orden.mesa || isClosedTableOrder(orden)) {
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
          deliveryFee: parseFloat(orden.delivery_fee) || 0,
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

      let areas = [];
      const { data: savedAreas, error: areasError } = await supabase
        .from("restaurant_floor_areas")
        .select("id, name, created_at")
        .eq("business_id", profile.business_id)
        .order("created_at", { ascending: true });

      if (areasError) {
        console.error("Error cargando áreas del plano:", areasError);
        setFloorAreas([]);
        setFloorTables([]);
        showToast("No se pudo cargar el plano. Verifica la migración de mesas.");
      } else {
        areas = savedAreas || [];
        if (areas.length === 0) {
          const { data: defaultArea, error: defaultAreaError } = await supabase
            .from("restaurant_floor_areas")
            .insert({ business_id: profile.business_id, name: "Mesas" })
            .select("id, name, created_at")
            .single();

          if (defaultAreaError) {
            console.error("Error creando el área inicial:", defaultAreaError);
            showToast("No se pudo crear el área inicial del plano.");
          } else {
            areas = [defaultArea];
          }
        }

        setFloorAreas(areas);
        setActiveFloorAreaId((current) =>
          areas.some((area) => area.id === current)
            ? current
            : (areas[0]?.id ?? null),
        );

        if (areas.length > 0) {
          const { data: savedTables, error: tablesError } = await supabase
            .from("restaurant_floor_tables")
            .select(
              "id, business_id, area_id, label, position_x, position_y, shape, guest_count",
            )
            .eq("business_id", profile.business_id)
            .order("created_at", { ascending: true });

          if (tablesError) {
            console.error("Error cargando mesas del plano:", tablesError);
            setFloorTables([]);
            showToast("No se pudieron cargar las mesas del plano.");
          } else {
            let tableRows = savedTables || [];
            const knownLabels = new Set(
              tableRows.map((table) => table.label.toLowerCase()),
            );
            const missingLabels = [
              ...new Set(
                mesasOrdenes
                  .map((mesa) => mesa.numero.trim())
                  .filter((label) => label && !knownLabels.has(label.toLowerCase())),
              ),
            ];

            if (missingLabels.length > 0) {
              const defaultArea = areas[0];
              const newTables = missingLabels.map((label, index) => {
                const positionIndex = tableRows.length + index;
                const position = getFloorGridPosition(positionIndex);
                return {
                  business_id: profile.business_id,
                  area_id: defaultArea.id,
                  label,
                  ...position,
                  shape: "round",
                };
              });
              const { data: insertedTables, error: insertTablesError } =
                await supabase
                  .from("restaurant_floor_tables")
                  .insert(newTables)
                  .select(
                    "id, business_id, area_id, label, position_x, position_y, shape",
                  );

              if (insertTablesError) {
                console.error(
                  "Error agregando mesas activas al plano:",
                  insertTablesError,
                );
                showToast("No se pudieron agregar las mesas activas al plano.");
              } else {
                tableRows = [...tableRows, ...(insertedTables || [])];
              }
            }
            setFloorTables(tableRows);
          }
        }
      }

      // Solo mostrar mesas con una orden activa o una reserva vigente.
      setMesas(mesasOrdenes);
    } catch (err) {
      console.error("Error en loadMesas:", err);
    } finally {
      setLoading(false);
    }
  }, [navigate, showToast, user?.id]);

  useEffect(() => {
    loadMesasFromDB();
  }, [loadMesasFromDB]);

  useEffect(() => {
    const refreshAtDateBoundary = window.setInterval(() => {
      loadMesasFromDB({ showLoading: false });
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
          window.clearTimeout(ordersRefreshTimeoutRef.current);
          ordersRefreshTimeoutRef.current = window.setTimeout(() => {
            loadMesasFromDB({ showLoading: false });
          }, 150);
        },
      )
      .subscribe();

    return () => {
      window.clearTimeout(ordersRefreshTimeoutRef.current);
      supabase.removeChannel(subscription);
    };
  }, [user?.id, businessId, loadMesasFromDB]);

  // Keep panel in sync with state changes
  useEffect(() => {
    if (!selected) return;
    const updated = mesas.find((m) => m.id === selected.id);
    if (updated) setSelected(updated);
    else if (!selected.isFloorTable) setSelected(null);
  }, [mesas]);

  // Actualizar mesa y sincronizar con Supabase
  const updateMesa = useCallback(
    async (updated) => {
      if (updated.isFloorTable && updated.floorTableId && businessId) {
        const guestCount = Math.max(
          0,
          Math.floor(Number(updated.personas) || 0),
        );
        setFloorTables((current) =>
          current.map((table) =>
            table.id === updated.floorTableId
              ? { ...table, guest_count: guestCount }
              : table,
          ),
        );
        setSelected((current) =>
          current?.floorTableId === updated.floorTableId
            ? { ...current, personas: guestCount }
            : current,
        );
        const { error } = await supabase
          .from("restaurant_floor_tables")
          .update({ guest_count: guestCount })
          .eq("id", updated.floorTableId)
          .eq("business_id", businessId);
        if (error) {
          console.error("Error guardando las personas de la mesa:", error);
          showToast("No se pudo guardar la cantidad de personas.");
          loadMesasFromDB();
        }
        return;
      }

      setMesas((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));

      // Si tiene orderId, actualizar en Supabase
      if (updated.orderId && businessId) {
        try {
          const { error } = await supabase
            .from("orders")
            .update({
              status:
                updated.estado === "clean"
                  ? updated.orderStatus || "complete"
                  : updated.orderStatus,
              table_status:
                updated.estado === "clean" ? "clean" : updated.estado,
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
    [businessId, loadMesasFromDB, showToast],
  );

  const closeMesa = useCallback(
    async (mesa) => {
      setMesas((prev) => prev.filter((item) => item.id !== mesa.id));
      setSelected((current) => (current?.id === mesa.id ? null : current));

      if (!mesa.orderId || !businessId) return;

      const { error } = await supabase.rpc("close_table_order", {
        p_order_id: mesa.orderId,
        p_business_id: businessId,
      });

      if (error) {
        console.error("Error cerrando mesa en Supabase:", error);
        showToast("⚠️ Error cerrando la mesa");
        loadMesasFromDB();
      }
    },
    [businessId, loadMesasFromDB, showToast],
  );

  const changeFloorTableGuestCount = async (table, change) => {
    const currentCount = getFloorTableGuestCount(table);
    const guestCount = Math.max(0, currentCount + change);
    if (guestCount === currentCount) return;

    if (table.order) {
      await updateMesa({ ...table.order, personas: guestCount });
      return;
    }

    if (!table.id || !businessId) {
      showToast("No se pudo guardar la cantidad de personas de esta mesa.");
      return;
    }

    setFloorTables((current) =>
      current.map((item) =>
        item.id === table.id ? { ...item, guest_count: guestCount } : item,
      ),
    );
    const { error } = await supabase
      .from("restaurant_floor_tables")
      .update({ guest_count: guestCount })
      .eq("id", table.id)
      .eq("business_id", businessId);
    if (error) {
      console.error("Error actualizando personas de la mesa:", error);
      setFloorTables((current) =>
        current.map((item) =>
          item.id === table.id
            ? { ...item, guest_count: currentCount }
            : item,
        ),
      );
      showToast("No se pudo guardar la cantidad de personas.");
    }
  };

  const activeFloorArea = floorAreas.find(
    (area) => area.id === activeFloorAreaId,
  );
  const floorItems = (
    activeFloorArea
      ? floorTables.filter((table) => table.area_id === activeFloorArea.id)
      : []
  ).map((table) => ({
    ...table,
    order: mesas.find((mesa) => mesa.numero === table.label) || null,
  }));
  const displayedFloorItems = floorItems.length
    ? floorItems
    : !activeFloorArea
      ? mesas.map((mesa, index) => ({
          id: `active-${mesa.orderId}`,
          label: mesa.numero,
          area_id: null,
          ...getFloorGridPosition(index),
          shape: "round",
          order: mesa,
        }))
      : [];

  const floorTableLayoutKey = floorTables
    .map((table) => `${table.id}:${table.area_id}:${table.shape}`)
    .join("|");

  const fitFloorToTables = useCallback((tables) => {
    const bounds = floorRef.current?.getBoundingClientRect();
    if (!bounds || tables.length === 0) {
      setFloorView({ zoom: 1, x: 0, y: 0 });
      return;
    }

    const tableBounds = tables.map((table) => {
      const x = (Number(table.position_x) / 100) * FLOOR_CANVAS_WIDTH;
      const y = (Number(table.position_y) / 100) * FLOOR_CANVAS_HEIGHT;
      const halfWidth =
        (table.shape === "rectangle" ? 64 : 46) + FLOOR_CHAIR_OUTSET;
      const halfHeight =
        (table.shape === "rectangle" ? 38 : 46) + FLOOR_CHAIR_OUTSET;
      return {
        minX: x - halfWidth - 92,
        maxX: x + halfWidth,
        minY: y - halfHeight,
        maxY: y + halfHeight,
      };
    });
    const minX = Math.min(...tableBounds.map((table) => table.minX));
    const maxX = Math.max(...tableBounds.map((table) => table.maxX));
    const minY = Math.min(...tableBounds.map((table) => table.minY));
    const maxY = Math.max(...tableBounds.map((table) => table.maxY));
    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);
    const zoom = Math.max(
      0.15,
      Math.min(
        1,
        (bounds.width - 48) / contentWidth,
        (bounds.height - 48) / contentHeight,
      ),
    );

    setFloorView({
      zoom,
      x: -((minX + maxX) / 2 - FLOOR_CANVAS_WIDTH / 2) * zoom,
      y: -((minY + maxY) / 2 - FLOOR_CANVAS_HEIGHT / 2) * zoom,
    });
  }, []);

  useEffect(() => {
    floorTablesRef.current = floorTables;
  }, [floorTables]);

  useEffect(() => {
    if (!activeFloorAreaId || loading) return undefined;

    const fitActiveArea = () => {
      const tables = floorTablesRef.current.filter(
        (table) => table.area_id === activeFloorAreaId,
      );
      fitFloorToTables(tables);
    };
    const animationFrame = window.requestAnimationFrame(fitActiveArea);
    window.addEventListener("resize", fitActiveArea);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", fitActiveArea);
    };
  }, [activeFloorAreaId, floorTableLayoutKey, fitFloorToTables, loading]);

  const handleFloorPointerDown = (event, table) => {
    if (!isEditingFloor) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    floorDragRef.current = {
      id: table.id,
      label: table.label,
      areaId: activeFloorAreaId,
      pointerId: event.pointerId,
      startX: Number(table.position_x),
      startY: Number(table.position_y),
      x: Number(table.position_x),
      y: Number(table.position_y),
      shape: table.shape || "round",
    };
  };

  const handleFloorPanStart = (event) => {
    if (
      event.target.closest("button") ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    floorPanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      viewX: floorView.x,
      viewY: floorView.y,
    };
  };

  const handleFloorPanMove = (event) => {
    const pan = floorPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    updateFloorView({
      ...floorView,
      x: pan.viewX + event.clientX - pan.startX,
      y: pan.viewY + event.clientY - pan.startY,
    });
  };

  const handleFloorPanEnd = (event) => {
    if (floorPanRef.current?.pointerId === event.pointerId) {
      floorPanRef.current = null;
    }
  };

  const handleFloorWheel = (event) => {
    event.preventDefault();
    if (event.target.closest('[aria-label="Herramientas del plano"]')) return;

    const bounds = floorRef.current?.getBoundingClientRect();
    if (!bounds) return;

    const pointerX = event.clientX - bounds.left - bounds.width / 2;
    const pointerY = event.clientY - bounds.top - bounds.height / 2;
    const nextZoom = Math.max(
      0.15,
      Math.min(2.5, floorView.zoom * Math.exp(-event.deltaY * 0.001)),
    );
    const zoomRatio = nextZoom / floorView.zoom;

    updateFloorView({
      zoom: nextZoom,
      x: pointerX - (pointerX - floorView.x) * zoomRatio,
      y: pointerY - (pointerY - floorView.y) * zoomRatio,
    });
  };

  const handleFloorPointerMove = (event) => {
    const drag = floorDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !floorRef.current) return;

    const bounds = floorRef.current.getBoundingClientRect();
    const localX =
      (event.clientX - bounds.left - bounds.width / 2 - floorView.x) /
        floorView.zoom +
      FLOOR_CANVAS_WIDTH / 2;
    const localY =
      (event.clientY - bounds.top - bounds.height / 2 - floorView.y) /
        floorView.zoom +
      FLOOR_CANVAS_HEIGHT / 2;
    const minX =
      ((event.currentTarget.offsetWidth / 2 +
        FLOOR_CHAIR_OUTSET +
        92) /
        floorView.zoom /
        FLOOR_CANVAS_WIDTH) *
      100;
    const minY =
      ((event.currentTarget.offsetHeight / 2 + FLOOR_CHAIR_OUTSET) /
        floorView.zoom /
        FLOOR_CANVAS_HEIGHT) *
      100;
    const maxX =
      100 -
      ((event.currentTarget.offsetWidth / 2 + FLOOR_CHAIR_OUTSET) /
        floorView.zoom /
        FLOOR_CANVAS_WIDTH) *
        100;
    const maxY =
      100 -
      ((event.currentTarget.offsetHeight / 2 + FLOOR_CHAIR_OUTSET) /
        floorView.zoom /
        FLOOR_CANVAS_HEIGHT) *
        100;
    const x = Math.max(
      minX,
      Math.min(maxX, (localX / FLOOR_CANVAS_WIDTH) * 100),
    );
    const y = Math.max(
      minY,
      Math.min(maxY, (localY / FLOOR_CANVAS_HEIGHT) * 100),
    );
    drag.x = x;
    drag.y = y;
    setFloorTables((current) =>
      current.map((table) =>
        table.id === drag.id
          ? { ...table, position_x: x, position_y: y }
          : table,
      ),
    );
  };

  const handleFloorPointerUp = async (event) => {
    const drag = floorDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    floorDragRef.current = null;
    if (drag.x === drag.startX && drag.y === drag.startY) return;

    if (!businessId || !drag.areaId) {
      showToast("El plano no está disponible para guardar cambios.");
      return;
    }

    const { error } = await supabase.from("restaurant_floor_tables").upsert(
      {
        business_id: businessId,
        area_id: drag.areaId,
        label: drag.label,
        position_x: Number(drag.x.toFixed(2)),
        position_y: Number(drag.y.toFixed(2)),
        shape: drag.shape,
      },
      { onConflict: "business_id,label" },
    );

    if (error) {
      console.error("Error guardando la posición de la mesa:", error);
      setFloorTables((current) =>
        current.map((table) =>
          table.id === drag.id
            ? {
                ...table,
                position_x: drag.startX,
                position_y: drag.startY,
              }
            : table,
        ),
      );
      showToast("No se pudo guardar la posición de la mesa.");
    }
  };

  const handleAreaFormSubmit = async (event) => {
    event.preventDefault();
    const name = areaNameDraft.trim();
    if (!name) {
      showToast("Escribe un nombre para el área.");
      return;
    }
    if (!businessId) {
      showToast("No se encontró el negocio para guardar el área.");
      return;
    }

    const { data, error } = await supabase
      .from("restaurant_floor_areas")
      .insert({ business_id: businessId, name })
      .select("id, name, created_at")
      .single();
    if (error) {
      console.error("Error creando el área:", error);
      showToast("No se pudo crear el área. Verifica si el nombre ya existe.");
      return;
    }
    setFloorAreas((current) => [...current, data]);
    setActiveFloorAreaId(data.id);
    showToast(`Área ${name} creada.`);
    setAreaFormMode(null);
    setAreaNameDraft("");
  };

  const startAreaForm = () => {
    setAreaFormMode("new");
    setAreaNameDraft("");
  };

  const startInlineAreaRename = (area) => {
    setActiveFloorAreaId(area.id);
    setEditingAreaId(area.id);
    setAreaNameDraft(area.name);
  };

  const saveInlineAreaRename = async (areaId) => {
    if (areaRenameSavingRef.current.has(areaId)) return;
    const name = areaNameDraft.trim();
    if (!name) {
      showToast("El nombre del área no puede estar vacío.");
      return;
    }
    if (!businessId) {
      showToast("No se encontró el negocio para guardar el área.");
      return;
    }

    const area = floorAreas.find((item) => item.id === areaId);
    if (name === area?.name) {
      setEditingAreaId(null);
      return;
    }

    areaRenameSavingRef.current.add(areaId);
    let data;
    let error;
    try {
      ({ data, error } = await supabase
        .from("restaurant_floor_areas")
        .update({ name })
        .eq("id", areaId)
        .eq("business_id", businessId)
        .select("id, name, created_at")
        .single());
    } catch (saveError) {
      console.error("Error renombrando el área:", saveError);
      showToast("No se pudo guardar el nombre del área.");
      return;
    } finally {
      areaRenameSavingRef.current.delete(areaId);
    }
    if (error) {
      console.error("Error renombrando el área:", error);
      showToast("No se pudo renombrar el área. Verifica si el nombre ya existe.");
      return;
    }
    setFloorAreas((current) =>
      current.map((item) => (item.id === data.id ? data : item)),
    );
    setEditingAreaId(null);
    setAreaNameDraft("");
    showToast("Área actualizada.");
  };

  const handleDeleteArea = async (area) => {
    if (!area || !businessId) return;
    if (!window.confirm(`¿Eliminar el área "${area.name}" y sus mesas?`))
      return;

    const isLastArea = floorAreas.length === 1;
    let replacementArea = null;
    if (isLastArea) {
      const replacementName =
        area.name.trim().toLowerCase() === "mesas" ? "Mesas 2" : "Mesas";
      const { data, error: replacementError } = await supabase
        .from("restaurant_floor_areas")
        .insert({ business_id: businessId, name: replacementName })
        .select("id, name, created_at")
        .single();
      if (replacementError) {
        console.error("Error creando el área de reemplazo:", replacementError);
        showToast("No se pudo preparar el área de reemplazo.");
        return;
      }
      replacementArea = data;
    }

    const { error } = await supabase
      .from("restaurant_floor_areas")
      .delete()
      .eq("id", area.id)
      .eq("business_id", businessId);
    if (error) {
      console.error("Error eliminando el área:", error);
      if (replacementArea) {
        const { error: cleanupError } = await supabase
          .from("restaurant_floor_areas")
          .delete()
          .eq("id", replacementArea.id)
          .eq("business_id", businessId);
        if (cleanupError) {
          console.error("Error limpiando el área de reemplazo:", cleanupError);
        }
      }
      showToast("No se pudo eliminar el área.");
      return;
    }
    const remainingAreas = floorAreas.filter(
      (item) => item.id !== area.id,
    );
    if (replacementArea) remainingAreas.push(replacementArea);
    setFloorAreas(remainingAreas);
    setFloorTables((current) =>
      current.filter((table) => table.area_id !== area.id),
    );
    if (activeFloorAreaId === area.id) {
      setActiveFloorAreaId(remainingAreas[0]?.id || null);
    }
    showToast("Área eliminada.");
  };

  const handleAddFloorTable = async () => {
    if (!businessId || !activeFloorArea) return;
    setIsEditingFloor(true);
    const usedNumbers = [
      ...floorTables.map((table) => Number(table.label)),
      ...mesas.map((mesa) => Number(mesa.numero)),
    ].filter((number) => Number.isInteger(number) && number > 0);
    const label = String(Math.max(0, ...usedNumbers) + 1);
    const tableIndex = floorTables.filter(
      (table) => table.area_id === activeFloorArea.id,
    ).length;
    const position = getFloorGridPosition(tableIndex);
    const { data, error } = await supabase
      .from("restaurant_floor_tables")
      .insert({
        business_id: businessId,
        area_id: activeFloorArea.id,
        label,
        ...position,
        shape: "round",
      })
      .select("id, business_id, area_id, label, position_x, position_y, shape")
      .single();
    if (error) {
      console.error("Error agregando una mesa al plano:", error);
      showToast("No se pudo agregar la mesa.");
      return;
    }
    setFloorTables((current) => [...current, data]);
  };

  const handleDeleteFloorTable = async (event, table) => {
    event.stopPropagation();
    if (table.order) {
      showToast("No puedes eliminar una mesa que tiene un pedido activo.");
      return;
    }
    if (!businessId) return;
    const { error } = await supabase
      .from("restaurant_floor_tables")
      .delete()
      .eq("id", table.id)
      .eq("business_id", businessId);
    if (error) {
      console.error("Error eliminando una mesa del plano:", error);
      showToast("No se pudo eliminar la mesa.");
      return;
    }
    setFloorTables((current) => current.filter((item) => item.id !== table.id));
  };

  const handleCycleFloorTableShape = async (event, table) => {
    event.stopPropagation();
    if (!businessId || !table.id) return;
    const shape = getNextFloorTableShape(table.shape || "round");
    const { error } = await supabase
      .from("restaurant_floor_tables")
      .update({ shape })
      .eq("id", table.id)
      .eq("business_id", businessId);
    if (error) {
      console.error("Error cambiando la forma de la mesa:", error);
      showToast("No se pudo cambiar la forma de la mesa.");
      return;
    }
    setFloorTables((current) =>
      current.map((item) => (item.id === table.id ? { ...item, shape } : item)),
    );
  };

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-background font-sans text-white">
      {/* ── Header ── */}
      <div className="sticky top-0 z-40 flex-shrink-0 border-b border-white/6 bg-background px-4 pt-4 backdrop-blur-xl">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tighter">Mesas</h1>
        </div>

        <div className="flex items-end gap-2 overflow-x-auto">
          <div className="flex min-w-0 items-end gap-1">
            {floorAreas.map((area) => {
              const isRenaming = editingAreaId === area.id;
              return (
                <div
                  key={area.id}
                  className={`group flex shrink-0 items-center justify-between gap-2 border-b-2 px-2 text-xs font-semibold transition-colors ${
                    activeFloorAreaId === area.id
                      ? "border-violet-400 text-white"
                      : "border-transparent text-slate-400 hover:text-white"
                  }`}
                >
                  {isRenaming ? (
                    <input
                      autoFocus
                      maxLength={80}
                      value={areaNameDraft}
                      onChange={(event) => setAreaNameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          saveInlineAreaRename(area.id);
                        } else if (event.key === "Escape") {
                          setEditingAreaId(null);
                          setAreaNameDraft("");
                        }
                      }}
                      aria-label="Nombre del área"
                      className="shrink-0 bg-transparent py-2 text-xs font-semibold text-white outline-none"
                      style={{
                        width: `${Math.max(area.name.length, areaNameDraft.length, 4)}ch`,
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveFloorAreaId(area.id)}
                      onDoubleClick={() => startInlineAreaRename(area)}
                      title="Doble clic para cambiar el nombre"
                      className="py-2 text-left"
                    >
                      {area.name}
                    </button>
                  )}
                  {(isEditingFloor || isRenaming) && (
                    <span>
                      <button
                        type="button"
                        onMouseDown={(event) => {
                          if (isRenaming) event.preventDefault();
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (isRenaming) {
                            saveInlineAreaRename(area.id);
                          } else {
                            handleDeleteArea(area);
                          }
                        }}
                        aria-label={
                          isRenaming
                            ? `Guardar nombre del área ${area.name}`
                            : `Eliminar área ${area.name}`
                        }
                        title={isRenaming ? "Guardar nombre" : "Eliminar área"}
                        className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors focus-visible:outline focus-visible:outline-1 ${
                          isRenaming
                            ? "text-violet-300 hover:bg-violet-500/15 hover:text-violet-200 focus-visible:outline-violet-300"
                            : "text-slate-500 hover:bg-red-500/15 hover:text-red-300 focus-visible:outline-red-300"
                        }`}
                      >
                        {isRenaming ? <Check size={14} /> : <Trash2 size={13} />}
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
            {areaFormMode === "new" && (
              <form
                onSubmit={handleAreaFormSubmit}
                className="flex shrink-0 items-center gap-1 border-b-2 border-violet-400 px-1"
              >
                <input
                  autoFocus
                  maxLength={80}
                  value={areaNameDraft}
                  onChange={(event) => setAreaNameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setAreaFormMode(null);
                      setAreaNameDraft("");
                    }
                  }}
                  aria-label="Nombre de la nueva área"
                  placeholder="Nombre del área"
                  className="w-28 bg-transparent py-2 text-xs font-semibold text-white outline-none placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  aria-label="Guardar nueva área"
                  title="Guardar área"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-violet-300 hover:bg-violet-500/15 hover:text-violet-200"
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAreaFormMode(null);
                    setAreaNameDraft("");
                  }}
                  aria-label="Cancelar nueva área"
                  title="Cancelar"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  <X size={14} />
                </button>
              </form>
            )}
            <button
              type="button"
              onClick={startAreaForm}
              aria-label="Agregar área"
              title="Agregar área"
              className="mb-1 ml-0 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/8 hover:text-white"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

      </div>

      {/* ── Plano ── */}
      <div className="min-h-0 flex-1 overflow-hidden p-0">
        {loading ? (
          <SubLoading
            label="Cargando mesas"
            className="py-24"
            dotClassName="bg-violet-400"
            fullHeight
          />
        ) : (
          <div className="h-full w-full">
            <div
              ref={floorRef}
              className={`relative h-full min-h-0 w-full overflow-hidden border bg-surface ${
                isEditingFloor
                  ? "border-violet-400/30"
                  : "border-outline"
              }`}
              onPointerDown={handleFloorPanStart}
              onPointerMove={handleFloorPanMove}
              onPointerUp={handleFloorPanEnd}
              onPointerCancel={handleFloorPanEnd}
              onWheel={handleFloorWheel}
              style={{
                touchAction: "none",
                backgroundImage:
                  "radial-gradient(circle, rgba(148,163,184,0.16) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            >
              <div
                className="absolute cursor-grab transition-transform duration-200 ease-out active:cursor-grabbing"
                style={{
                  left: "50%",
                  top: "50%",
                  width: FLOOR_CANVAS_WIDTH,
                  height: FLOOR_CANVAS_HEIGHT,
                  marginLeft: -FLOOR_CANVAS_WIDTH / 2,
                  marginTop: -FLOOR_CANVAS_HEIGHT / 2,
                  transform: `translate(${floorView.x}px, ${floorView.y}px) scale(${floorView.zoom})`,
                  transformOrigin: "center",
                }}
              >
              {displayedFloorItems.map((table) => {
                const state = table.order?.estado || "clean";
                const status = ESTADO[state] || ESTADO.clean;
                const isTableOccupied = state === "ocupada";
                const guestCount = isTableOccupied
                  ? getFloorTableGuestCount(table)
                  : 0;
                const shape = FLOOR_TABLE_SHAPES.includes(table.shape)
                  ? table.shape
                  : "round";
                const nextShape = getNextFloorTableShape(shape);
                const shapeLabels = {
                  round: "redonda",
                  square: "cuadrada",
                  rectangle: "rectangular",
                };
                return (
                  <div
                    key={table.id}
                    className="absolute"
                    style={{
                      left: `${table.position_x}%`,
                      top: `${table.position_y}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <div
                      className={`relative ${
                        shape === "rectangle"
                          ? "h-[68px] w-[108px] sm:h-[76px] sm:w-[128px]"
                          : "h-[78px] w-[78px] sm:h-[92px] sm:w-[92px]"
                      }`}
                    >
                      {getFloorChairPositions(
                        shape,
                        guestCount,
                      ).map((seat, index) => (
                        <span
                          key={`${table.id}-seat-${index}`}
                          aria-hidden="true"
                          className="pointer-events-none absolute z-10 rounded-full border border-white/30 bg-neutral-500 shadow-sm"
                          style={{
                            width: FLOOR_CHAIR_SIZE,
                            height: FLOOR_CHAIR_SIZE,
                            left: `calc(50% + ${seat.x}px)`,
                            top: `calc(50% + ${seat.y}px)`,
                            transform: "translate(-50%, -50%)",
                          }}
                        />
                      ))}
                      {isTableOccupied && (
                        <div
                          role="group"
                          aria-label={`Personas en mesa ${table.label}`}
                          className="absolute right-[calc(100%+28px)] top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1 p-1"
                        >
                          <button
                            type="button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              changeFloorTableGuestCount(table, 1);
                            }}
                            aria-label={`Agregar persona a mesa ${table.label}`}
                            className="flex h-6 w-6 items-center justify-center rounded-full text-violet-300 hover:bg-violet-500/15 disabled:opacity-40"
                          >
                            <Plus size={12} />
                          </button>
                          <span
                            aria-label={`${guestCount} personas`}
                            className="min-w-4 text-center text-xs font-bold tabular-nums text-white"
                          >
                            {guestCount}
                          </span>
                          <button
                            type="button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              changeFloorTableGuestCount(table, -1);
                            }}
                            disabled={guestCount <= 0}
                            aria-label={`Quitar persona de mesa ${table.label}`}
                            className="flex h-6 w-6 items-center justify-center rounded-full text-slate-300 hover:bg-white/10 disabled:opacity-40"
                          >
                            <Minus size={12} />
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        onPointerDown={(event) =>
                          handleFloorPointerDown(event, table)
                        }
                        onPointerMove={handleFloorPointerMove}
                        onPointerUp={handleFloorPointerUp}
                        onClick={() => {
                          if (isEditingFloor) return;
                          if (table.order) setSelected(table.order);
                          else
                            setSelected({
                              id: `floor-${table.id}`,
                              floorTableId: table.id,
                              isFloorTable: true,
                              numero: String(table.label),
                              estado: "clean",
                              startTime: null,
                              comanda: [],
                              personas: Number(table.guest_count) || 0,
                              total: 0,
                              reserva: null,
                              nota: "",
                            });
                        }}
                        aria-label={
                          table.order
                            ? `Mesa ${table.label}, ${status.label}`
                            : `Mesa ${table.label}, disponible`
                        }
                        className={`absolute inset-0 flex h-full w-full touch-none flex-col items-center justify-center border-2 shadow-lg transition-[transform,box-shadow] ${
                          isEditingFloor
                            ? "cursor-move ring-2 ring-violet-400/20 active:scale-105"
                            : "cursor-pointer hover:scale-105"
                        } ${
                          shape === "square"
                            ? "rounded-2xl"
                            : shape === "rectangle"
                              ? "rounded-xl"
                              : "rounded-full"
                        }`}
                        style={{
                          background: `linear-gradient(145deg, ${status.glow}, #171717)`,
                          borderColor: status.border,
                          boxShadow: `0 8px 24px ${status.glow}`,
                        }}
                      >
                        <span className="text-xl font-black leading-none text-white">
                          {table.label}
                        </span>
                        <span
                          className="mt-1 max-w-[68px] truncate text-[8px] font-black uppercase tracking-wide sm:max-w-[78px]"
                          style={{ color: status.color }}
                        >
                          {table.order ? status.label : "Disponible"}
                        </span>
                        {table.order?.total > 0 && (
                          <span className="mt-0.5 text-[8px] font-bold text-slate-300">
                            {fmt(table.order.total)}
                          </span>
                        )}
                      </button>
                      {isEditingFloor && table.id && (
                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) =>
                            handleCycleFloorTableShape(event, table)
                          }
                          aria-label={`Cambiar mesa ${table.label} a forma ${shapeLabels[nextShape]}`}
                          title={`Cambiar a mesa ${shapeLabels[nextShape]}`}
                          className="absolute -right-1 -top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-violet-400/30 bg-neutral-900 text-violet-200 shadow-lg hover:bg-violet-500/20"
                        >
                          {nextShape === "square" ? (
                            <span className="h-3 w-3 rounded-sm border border-current" />
                          ) : nextShape === "rectangle" ? (
                            <span className="h-2 w-3.5 rounded-sm border border-current" />
                          ) : (
                            <span className="h-3 w-3 rounded-full border border-current" />
                          )}
                        </button>
                      )}
                      {isEditingFloor && !table.order && table.id && (
                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) =>
                            handleDeleteFloorTable(event, table)
                          }
                          aria-label={`Eliminar mesa ${table.label}`}
                          title={`Eliminar mesa ${table.label}`}
                          className="absolute -left-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-red-400/30 bg-neutral-900 text-red-300 shadow-lg hover:bg-red-500/20"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
              {!displayedFloorItems.length && (
                <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                  <LayoutGrid size={32} className="mb-3 text-slate-600" />
                  <p className="text-sm font-bold text-slate-300">
                    Este espacio aún está vacío
                  </p>
                  <p className="mt-1 max-w-sm text-xs text-slate-500">
                    {isEditingFloor
                      ? "Agrega mesas y arrástralas para crear el plano."
                      : "Activa la edición para agregar mesas o usa el botón Editar plano."}
                  </p>
                </div>
              )}
              <div
                role="group"
                aria-label="Herramientas del plano"
                className="absolute bottom-3 right-3 z-20 flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-neutral-950/90 p-1.5 shadow-xl backdrop-blur"
              >
                <button
                  type="button"
                  onClick={() => setIsEditingFloor((editing) => !editing)}
                  aria-label={
                    isEditingFloor ? "Terminar edición del plano" : "Editar plano"
                  }
                  title={
                    isEditingFloor ? "Terminar edición" : "Editar plano"
                  }
                  className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                    isEditingFloor
                      ? "text-violet-200 hover:bg-violet-500/20"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {isEditingFloor ? <Check size={16} /> : <Pencil size={15} />}
                </button>
                <div className="h-px w-6 bg-white/10" />
                <button
                  type="button"
                  onClick={handleAddFloorTable}
                  disabled={!activeFloorArea}
                  aria-label="Agregar mesa"
                  title="Agregar mesa"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-violet-300 transition-colors hover:bg-violet-500/15 hover:text-violet-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus size={16} />
                </button>
                <div className="h-px w-6 bg-white/10" />
                <button
                  type="button"
                  onClick={() =>
                    fitFloorToTables(
                      floorTables.filter(
                        (table) => table.area_id === activeFloorAreaId,
                      ),
                    )
                  }
                  aria-label="Ajustar todas las mesas a la vista"
                  title="Ajustar todas las mesas a la vista"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-violet-300 hover:bg-violet-500/15 hover:text-violet-200"
                >
                  <Shrink size={16} />
                </button>
                <div className="h-px w-6 bg-white/10" />
                <div className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() => zoomFloor(0.25)}
                    disabled={floorView.zoom >= 2.5}
                    aria-label="Acercar plano"
                    title="Acercar"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Plus size={14} />
                  </button>
                  <span
                    aria-label={`Zoom ${Math.round(floorView.zoom * 100)} por ciento`}
                    className="text-[8px] font-bold tabular-nums text-slate-400"
                  >
                    {Math.round(floorView.zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => zoomFloor(-0.25)}
                    disabled={floorView.zoom <= 0.15}
                    aria-label="Alejar plano"
                    title="Alejar"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Minus size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Panel ── */}
      <MesaPanel
        mesa={selected}
        onClose={() => setSelected(null)}
        onUpdate={updateMesa}
        onCloseMesa={closeMesa}
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
