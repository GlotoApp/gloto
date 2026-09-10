import React, { useState, useMemo, memo, useEffect, useRef } from "react";
import {
  Search,
  ChevronDown,
  Globe,
  MessageSquare,
  Smartphone,
  Monitor,
  Trash2,
  FileText,
  Printer,
  Calendar as CalendarIcon,
  Filter,
  X,
  Clipboard,
  Edit3,
  ArrowUpDown,
  RefreshCcw,
  LoaderCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../src/lib/supabaseClient";
import { useAuth } from "../../src/components/AuthContext";
import { useNavigate } from "react-router-dom";

// --- CONFIGURACIÓN DE CONSTANTES ---
const ORIGEN_CONFIG = {
  web: { icon: Globe, label: "WEB", color: "text-blue-400 bg-blue-400/10" },
  ai: {
    icon: MessageSquare,
    label: "AI_WA",
    color: "text-green-400 bg-green-400/10",
  },
  app: {
    icon: Smartphone,
    label: "APP",
    color: "text-orange-400 bg-orange-400/10",
  },
  pos: {
    icon: Monitor,
    label: "POS",
    color: "text-neutral-400 bg-neutral-400/10",
  },
};

const METODOS_ENTREGA = [
  { id: "recoger", label: "Recoger" },
  { id: "mesa", label: "En Mesa" },
  { id: "domicilio", label: "Domicilio" },
  { id: "punto", label: "En Punto" },
];

const METODO_ENTREGA_ESTILOS = {
  mesa: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  recoger: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  domicilio: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/25",
  punto: "bg-blue-500/10 text-blue-400 border-blue-500/30",
};

const PERIODOS_FECHA = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "esta_semana", label: "Esta Semana" },
  { id: "ultimos_7", label: "Últimos 7 Días" },
  { id: "ultimos_30", label: "Últimos 30 Días" },
  { id: "este_mes", label: "Este Mes" },
  { id: "mes_anterior", label: "Mes Anterior" },
  { id: "personalizado", label: "Personalizado" },
];

const NOMBRES_MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

// --- COMPONENTE SELECT PERSONALIZADO ---
const TerminalSelect = ({
  label,
  value,
  options,
  onChange,
  onClear,
  icon: Icon,
}) => (
  <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
    <label className="text-[8px] font-black text-neutral-600 uppercase tracking-widest ml-1">
      {label}
    </label>
    <div className="relative group">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-500/50 group-hover:text-violet-500 transition-colors">
        <Icon size={12} />
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-neutral-900 border border-white/5 rounded-xl py-2.5 pl-9 pr-10 text-[10px] font-mono text-neutral-300 appearance-none focus:border-violet-500/40 outline-none transition-all cursor-pointer uppercase"
      >
        <option value="">TODOS_LOS_REGISTROS</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label.toUpperCase()}
          </option>
        ))}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
        {value && (
          <button
            onClick={onClear}
            className="text-neutral-600 hover:text-red-400 transition-colors"
          >
            <X size={12} />
          </button>
        )}
        <ChevronDown
          size={12}
          className="text-neutral-600 pointer-events-none"
        />
      </div>
    </div>
  </div>
);

// --- HELPER: Filtrar por fechas ---
const getDateRange = (period) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  switch (period) {
    case "hoy":
      return { start: today, end: tomorrow };
    case "ayer": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { start: yesterday, end: today };
    }
    case "esta_semana": {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      return { start: weekStart, end: tomorrow };
    }
    case "ultimos_7": {
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 7);
      return { start: sevenDaysAgo, end: tomorrow };
    }
    case "ultimos_30": {
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);
      return { start: thirtyDaysAgo, end: tomorrow };
    }
    case "este_mes": {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: monthStart, end: tomorrow };
    }
    case "mes_anterior": {
      const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: prevMonth, end: thisMonthStart };
    }
    default:
      return { start: null, end: null };
  }
};

// --- COMPONENTE DE BOTÓN REUTILIZABLE ---
const ActionButton = ({ icon: Icon, label, color, onClick }) => (
  <button
    onClick={onClick}
    className={`flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg border transition-all text-[9px] font-black uppercase ${color}`}
  >
    <Icon size={14} /> {label}
  </button>
);

// --- COMPONENTE DE TARJETA ---
const formatMoney = (value) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDateTime = (value) => {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  });
};

const OrderCard = memo(
  ({ orden, onDelete, onInvoice, onPrint, onShare, onEdit, canDelete }) => {
    const [isOpen, setIsOpen] = useState(false);
    const config = ORIGEN_CONFIG[orden.origen || "pos"];
    const Icon = config.icon;

    return (
      <motion.div
        layout
        className={`border rounded-2xl transition-all duration-300 ${
          isOpen
            ? "bg-neutral-900/80 border-violet-500/30 shadow-[0_0_30px_rgba(139,92,246,0.05)]"
            : "bg-neutral-900/40 border-white/5 hover:border-white/10"
        }`}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full p-4 text-left hover:bg-white/5 rounded-2xl transition-colors"
        >
          {/* 📱 MOBILE */}
          <div className="flex flex-col gap-1 lg:hidden">
            <div className="flex justify-between items-start gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {orden.cliente}
                </p>
                <p className="text-xs text-neutral-500 font-mono truncate">
                  {orden.numeroFactura}
                </p>
              </div>
              <p className="text-lg font-bold text-emerald-400 whitespace-nowrap">
                {formatMoney(orden.total)}
              </p>
            </div>
            <div className="flex justify-between items-center text-xs text-neutral-400 ">
              <span
                className={`inline-flex max-w-full items-center rounded-full border px-2 py-1 text-[10px] font-black uppercase ${getDeliveryBadgeClass(orden.metodoEntrega)}`}
              >
                {displayOrderType(orden.metodoEntrega)}
              </span>
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  className="p-1.5 bg-white/5 rounded-full"
                >
                  <ChevronDown size={14} />
                </motion.div>
              </div>
            </div>
          </div>

          {/* 💻 DESKTOP */}
          <div className="hidden lg:grid grid-cols-12 items-center gap-4">
            <div className="col-span-4 min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {orden.cliente}
              </p>
              <p className="text-xs text-neutral-500 font-mono truncate">
                {orden.numeroFactura}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-neutral-500">Entrega</p>
              <p
                className={`inline-flex max-w-full truncate rounded-full border px-2 py-1 text-xs font-bold ${getDeliveryBadgeClass(orden.metodoEntrega)}`}
              >
                {displayOrderType(orden.metodoEntrega)}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-neutral-500">Hora</p>
              <p className="text-sm text-neutral-300 truncate">
                {orden.horaIngreso}
              </p>
            </div>
            <div className="col-span-2 text-right">
              <p className="text-xs text-neutral-500">Total</p>
              <p className="text-lg font-bold text-emerald-400">
                {formatMoney(orden.total)}
              </p>
            </div>
            <div className="col-span-2 flex justify-end items-center gap-2">
              <span
                className={`px-2 py-1 rounded-full text-xs font-semibold ${
                  orden.status === "listo"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : orden.status === "preparando"
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-neutral-500/20 text-neutral-400"
                }`}
              >
                {orden.status}
              </span>
              <motion.div
                animate={{ rotate: isOpen ? 180 : 0 }}
                className="p-2 bg-white/5 rounded-full"
              >
                <ChevronDown size={16} />
              </motion.div>
            </div>
          </div>
        </button>

        {/* EXPAND */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-white/5 bg-black/20"
            >
              <div className="p-4 sm:p-6 space-y-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <DetailBox label="Factura" value={orden.numeroFactura} />
                  <DetailBox label="Hora" value={orden.horaIngreso} />
                  <DetailBox label="Pago" value={orden.metodoPago} />
                  <DetailBox
                    label="Método de entrega"
                    value={
                      orden.metodoEntrega === "punto"
                        ? "En punto"
                        : orden.metodoEntrega === "recoger"
                          ? "Recoger"
                          : orden.metodoEntrega === "domicilio"
                            ? "Domicilio"
                            : orden.metodoEntrega === "mesa"
                              ? "En mesa"
                              : orden.metodoEntrega || "Sin información"
                    }
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <DetailBox label="Cliente" value={orden.cliente} />
                  <DetailBox label="Teléfono" value={orden.telefono} />
                  {orden.deliveryDetails && orden.deliveryDetails.length > 0 ? (
                    <>
                      {orden.deliveryDetails.map((detail, index) => (
                        <DetailBox
                          key={`${detail.label}-${index}`}
                          label={detail.label}
                          value={detail.value}
                        />
                      ))}
                    </>
                  ) : null}
                  <DetailBox label="Total" value={formatMoney(orden.total)} />
                </div>

                {orden.metodoEntrega === "domicilio" && (
                  <div className="flex justify-end">
                    <ActionButton
                      icon={Globe}
                      label="Ver en mapa"
                      color="border-sky-500/20 bg-sky-500/5 text-sky-400 hover:bg-sky-500 hover:text-white"
                      onClick={() => handleOpenMap(orden)}
                    />
                  </div>
                )}

                {orden.items?.length > 0 && (
                  <div className="">
                    <p className="text-[8px] font-black text-primary uppercase tracking-[0.2em] mb-3">
                      Productos
                    </p>
                    <div className="space-y-3">
                      {orden.items.map((item) => (
                        <div
                          key={
                            item.id || `${item.product_name}-${item.quantity}`
                          }
                          className="border border-white/5 rounded-lg p-3 bg-white/3"
                        >
                          <div className="flex justify-between gap-3 mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="text-sm font-semibold text-white truncate">
                                {item.product_name}
                              </p>
                              <span className="text-sm text-neutral-400 font-medium">
                                x{item.quantity}
                              </span>
                            </div>
                            <p className="text-sm font-bold text-emerald-400">
                              {formatMoney(
                                item.subtotal ||
                                  item.unit_price * item.quantity,
                              )}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-neutral-400">
                            <span>
                              Precio c/u: {formatMoney(item.unit_price)}
                            </span>
                          </div>
                          {item.options?.length > 0 && (
                            <div className=" text-[10px] text-neutral-400">
                              Opciones: {item.options.join(", ")}
                            </div>
                          )}
                          {item.notes && (
                            <div className="text-[10px] text-neutral-400">
                              Observaciones: {item.notes}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {orden.observaciones && (
                  <div className="rounded-xl  bg-neutral-950/40 p-3">
                    <p className="text-[8px] font-black text-neutral-600 uppercase tracking-[0.2em] mb-2">
                      Observaciones
                    </p>
                    <p className="text-sm text-neutral-300">
                      {orden.observaciones}
                    </p>
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  {canDelete && (
                    <ActionButton
                      icon={Trash2}
                      label="Eliminar"
                      color="border-red-500/20 bg-red-500/5 text-red-500 hover:bg-red-500 hover:text-white"
                      onClick={() => onDelete(orden)}
                    />
                  )}
                  <ActionButton
                    icon={FileText}
                    label="Factura"
                    color="border-white/10 bg-white/5 text-neutral-400 hover:bg-white/10"
                    onClick={() => onInvoice(orden)}
                  />
                  <ActionButton
                    icon={Edit3}
                    label="Editar"
                    color="border-sky-500/20 bg-sky-500/5 text-sky-400 hover:bg-sky-500 hover:text-white"
                    onClick={() => onEdit(orden)}
                  />
                  <ActionButton
                    icon={Printer}
                    label="Imprimir"
                    color="border-violet-500/20 bg-violet-600/10 text-violet-400 hover:bg-violet-600 hover:text-white"
                    onClick={() => onPrint(orden.id)}
                  />
                  <ActionButton
                    icon={Clipboard}
                    label="Compartir"
                    color="border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500 hover:text-white"
                    onClick={() => onShare(orden)}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  },
);

const DetailBox = ({ label, value, color = "text-neutral-300" }) => (
  <div className="space-y-1">
    <p className="text-[7px] text-neutral-600 font-black uppercase tracking-[0.2em]">
      {label}
    </p>
    <p className={`text-[10px] font-bold uppercase ${color}`}>{value}</p>
  </div>
);

const InvoicePreview = ({ order, onClose, onPrint }) => {
  if (!order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-neutral-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-white">
              Factura
            </h2>
            <p className="mt-1 text-[10px] text-neutral-500">
              Orden {order.numeroFactura}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-xs font-bold text-neutral-400 hover:bg-white/10 hover:text-white"
          >
            Cerrar
          </button>
        </div>

        <div className="overflow-y-auto bg-white p-5 text-black sm:p-8">
          <div className="border-b border-dashed border-black pb-4 text-center">
            <h1 className="text-2xl font-black uppercase tracking-tight">
              Factura
            </h1>
            <p className="mt-1 text-xs font-bold">N.º {order.numeroFactura}</p>
            <p className="text-[11px]">{order.horaIngreso}</p>
          </div>

          <div className="border-b border-dashed border-black py-4 text-[11px] leading-5">
            <p>
              <strong>Cliente:</strong> {order.cliente}
            </p>
            <p>
              <strong>Teléfono:</strong> {order.telefono}
            </p>
            <p>
              <strong>Entrega:</strong> {displayOrderType(order.metodoEntrega)}
            </p>
            {order.mesa && (
              <p>
                <strong>Mesa:</strong> {order.mesa}
              </p>
            )}
            {order.deliveryAddress && (
              <p>
                <strong>Dirección:</strong> {order.deliveryAddress}
              </p>
            )}
            {order.deliveryInstructions && (
              <p>
                <strong>Referencia:</strong> {order.deliveryInstructions}
              </p>
            )}
          </div>

          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-dashed border-black text-left uppercase">
                <th className="py-2">Producto</th>
                <th className="py-2 text-center">Cant.</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-dotted border-black/40 align-top"
                >
                  <td className="py-2 pr-2">
                    <div className="font-bold">{item.product_name}</div>
                    {item.options?.length > 0 && (
                      <div className="text-[10px]">
                        {item.options.join(" · ")}
                      </div>
                    )}
                    {item.notes && (
                      <div className="text-[10px]">Nota: {item.notes}</div>
                    )}
                  </td>
                  <td className="py-2 text-center">{item.quantity}</td>
                  <td className="py-2 text-right font-bold">
                    {formatMoney(
                      item.subtotal || item.unit_price * item.quantity,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-1 border-t border-black pt-4 text-right text-xs">
            <p>
              Subtotal: <strong>{formatMoney(order.total)}</strong>
            </p>
            <p className="text-base font-black">
              TOTAL A PAGAR: {formatMoney(order.total)}
            </p>
          </div>
          <div className="mt-4 border-t border-dashed border-black pt-3 text-[11px]">
            <p>
              <strong>Método de pago:</strong> {order.metodoPago}
            </p>
            {order.observaciones && (
              <p className="mt-2">
                <strong>Observaciones:</strong> {order.observaciones}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-xs font-bold text-neutral-300 hover:bg-white/10"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => onPrint(order)}
            className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-black uppercase text-white hover:bg-violet-500"
          >
            Imprimir factura
          </button>
        </div>
      </div>
    </div>
  );
};

const normalizeStatus = (status) => {
  const key = String(status || "").toLowerCase();
  if (["listo", "ready"].includes(key)) {
    return "listo";
  }
  if (["dispatched", "despachado"].includes(key)) {
    return "despachado";
  }
  if (["delivered", "completado"].includes(key)) {
    return "entregado";
  }
  if (["preparando", "preparing"].includes(key)) {
    return "preparando";
  }
  if (["pending", "pendiente"].includes(key)) {
    return "pendiente";
  }
  if (["confirmed", "confirmado"].includes(key)) {
    return "confirmado";
  }
  if (["cancelled", "cancelado"].includes(key)) {
    return "cancelado";
  }
  return key || "pendiente";
};

const normalizeOrderType = (orderType) => {
  const key = String(orderType || "").toLowerCase();
  if (["delivery", "domicilio"].includes(key)) return "domicilio";
  if (["pickup", "recoger"].includes(key)) return "recoger";
  if (["table", "mesa"].includes(key)) return "mesa";
  if (["point", "punto", "dine_in", "en_punto", "in_point"].includes(key)) {
    return "punto";
  }
  return key || "punto";
};

const displayOrderType = (orderType) => {
  const normalized = normalizeOrderType(orderType);
  const map = {
    punto: "Punto",
    domicilio: "Domicilio",
    mesa: "Mesa",
    recoger: "Recoger",
  };

  return (
    map[normalized] || normalized.charAt(0).toUpperCase() + normalized.slice(1)
  );
};

const getDeliveryBadgeClass = (orderType) =>
  METODO_ENTREGA_ESTILOS[normalizeOrderType(orderType)] ||
  "bg-neutral-500/10 text-neutral-400 border-neutral-500/20";

const getDeliveryDetails = (order = {}) => {
  const method = normalizeOrderType(order.order_type);

  if (method === "recoger") {
    return [];
  }

  if (method === "punto") {
    const puntoValue =
      order.punto ||
      order.point ||
      order.location_name ||
      order.pickup_point_name;
    if (!puntoValue) return [];

    return [{ label: "Punto", value: puntoValue }];
  }

  if (method === "domicilio") {
    const details = [];

    if (order.delivery_address) {
      details.push({ label: "Dirección", value: order.delivery_address });
    }

    if (
      order.delivery_instructions ||
      order.delivery_reference ||
      order.reference
    ) {
      details.push({
        label: "Referencia",
        value:
          order.delivery_instructions ||
          order.delivery_reference ||
          order.reference,
      });
    }

    if (
      order.delivery_fee !== null &&
      order.delivery_fee !== undefined &&
      order.delivery_fee !== ""
    ) {
      details.push({
        label: "Costo de domicilio",
        value: formatMoney(order.delivery_fee),
      });
    } else {
      details.push({
        label: "Costo de domicilio",
        value: "Sin definir",
      });
    }

    details.push({
      label: "Total",
      value: formatMoney(Number(order.total || 0)),
    });

    return details;
  }

  if (method === "mesa") {
    const details = [];

    const mesaValue = order.table_number || order.mesa;
    if (mesaValue) {
      details.push({ label: "Mesa", value: `Mesa ${mesaValue}` });
    }

    const zonaValue = order.table_zone || order.zone || order.area;
    if (zonaValue) {
      details.push({ label: "Zona", value: zonaValue });
    }

    const instruccionesValue =
      order.table_instructions || order.delivery_instructions;
    if (instruccionesValue) {
      details.push({ label: "Instrucciones", value: instruccionesValue });
    }

    return details;
  }

  return [];
};

const normalizePaymentMethod = (paymentMethod) => {
  const key = String(paymentMethod || "").toLowerCase();
  if (["cash", "efectivo"].includes(key)) return "Efectivo";
  if (["card", "tarjeta"].includes(key)) return "Tarjeta";
  if (["transfer", "transferencia"].includes(key)) return "Transferencia";
  if (["split", "dividir", "dividido"].includes(key)) return "Dividido";
  return paymentMethod || "Sin pago";
};

const getOptionLabel = (option) => {
  if (typeof option === "string") return option;
  if (!option || typeof option !== "object") return "Opción";
  return (
    option.name ||
    option.nombre ||
    option.label ||
    option.option_name ||
    option.title ||
    option.text ||
    option.value ||
    "Opción"
  );
};

const mapDatabaseOrderToUi = (order) => {
  const createdAt = order.created_at ? new Date(order.created_at) : new Date();
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const metodoEntrega = normalizeOrderType(order.order_type);
  let metadata = order.metadata || {};
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = {};
    }
  }

  return {
    id: order.id,
    numeroFactura:
      order.order_number || `ORD-${String(order.id).slice(0, 8).toUpperCase()}`,
    tipoEntrega: metodoEntrega,
    metodoEntrega: metodoEntrega,
    detalleEntrega:
      order.delivery_address ||
      order.delivery_instructions ||
      (order.mesa ? `Mesa ${order.mesa}` : "Sin detalle"),
    deliveryDetails: getDeliveryDetails(order),
    total: Number(order.total || 0),
    status: normalizeStatus(order.status),
    databaseStatus: String(order.status || "pending").toLowerCase(),
    origen: "pos",
    cliente: order.customer_name || "Cliente",
    telefono: order.customer_phone || "Sin teléfono",
    mesa: order.mesa || "",
    deliveryAddress: order.delivery_address || "",
    deliveryInstructions: order.delivery_instructions || "",
    punto: order.punto || "",
    paymentMethods: Array.isArray(metadata.payment_methods)
      ? metadata.payment_methods
      : [],
    pago: normalizePaymentMethod(order.payment_method),
    metodoPago: normalizePaymentMethod(order.payment_method),
    horaIngreso: formatDateTime(order.created_at),
    fecha: createdAt.toISOString().slice(0, 10),
    observaciones: order.notes || order.delivery_instructions || "",
    items: items.map((item) => ({
      id: item.id,
      product_id: item.product_id,
      product_name: item.product_name || "Producto",
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
      subtotal: Number(item.subtotal || 0),
      options: Array.isArray(item.options)
        ? item.options.map(getOptionLabel)
        : [],
      notes: item.notes || "",
    })),
  };
};

// --- COMPONENTE PRINCIPAL ---
const Ordenes = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [customDateRange, setCustomDateRange] = useState({
    start: "",
    end: "",
  });
  const [sortBy, setSortBy] = useState("");
  const [ordersPage, setOrdersPage] = useState(0);
  const [hasMoreOrders, setHasMoreOrders] = useState(true);
  const [loadingMoreOrders, setLoadingMoreOrders] = useState(false);
  const [invoiceOrder, setInvoiceOrder] = useState(null);
  const ordersEndRef = useRef(null);
  const businessIdRef = useRef(null);

  const loadBusinessOrders = async () => {
    if (!user?.id) {
      setOrders([]);
      setOrdersError("");
      setLoadingOrders(false);
      return;
    }

    if (refreshing) return;

    setRefreshing(true);
    setLoadingOrders(true);
    setOrdersError("");

    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id, role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || !profile?.business_id) {
        setOrders([]);
        setCanDelete(false);
        setOrdersError(
          profileError?.message ||
            "No se pudo identificar el negocio para cargar las órdenes.",
        );
        setLoadingOrders(false);
        return;
      }

      const isAdminRole = [
        "admin",
        "owner",
        "super_admin",
        "dueño",
        "dueno",
      ].includes(String(profile.role || "").toLowerCase());
      setCanDelete(isAdminRole);

      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("business_id", profile.business_id)
        .eq("is_reservation", false)
        .order("created_at", { ascending: false })
        .range(0, 29);

      if (error) {
        console.error("Error cargando órdenes por negocio:", error);
        setOrders([]);
        setOrdersError(error.message || "No se pudieron cargar las órdenes.");
        return;
      }

      businessIdRef.current = profile.business_id;
      setOrders((data || []).map(mapDatabaseOrderToUi));
      setOrdersPage(0);
      setHasMoreOrders((data || []).length === 30);
    } catch (error) {
      console.error("Error al cargar órdenes:", error);
      setOrders([]);
      setOrdersError(
        error?.message ||
          "No se pudo conectar con Supabase. Revisa tu conexión a internet.",
      );
    } finally {
      setLoadingOrders(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadBusinessOrders();
  }, [user]);

  const loadMoreOrders = async () => {
    if (
      !businessIdRef.current ||
      !hasMoreOrders ||
      loadingMoreOrders ||
      refreshing
    ) {
      return;
    }

    setLoadingMoreOrders(true);
    const nextPage = ordersPage + 1;
    const from = nextPage * 30;
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("business_id", businessIdRef.current)
      .eq("is_reservation", false)
      .order("created_at", { ascending: false })
      .range(from, from + 29);

    if (error) {
      console.error("Error cargando más órdenes:", error);
    } else {
      setOrders((current) => [
        ...current,
        ...(data || []).map(mapDatabaseOrderToUi),
      ]);
      setOrdersPage(nextPage);
      setHasMoreOrders((data || []).length === 30);
    }
    setLoadingMoreOrders(false);
  };

  useEffect(() => {
    const target = ordersEndRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMoreOrders();
      },
      { rootMargin: "240px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [ordersPage, hasMoreOrders, loadingMoreOrders, refreshing]);

  // Estado dinámico: se abre automáticamente el año-mes actual (ej: "2026-05")
  const [openMonths, setOpenMonths] = useState(() => {
    const d = new Date();
    const currentMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { [currentMonthKey]: true };
  });

  // 1. Filtrado, búsqueda y ordenamiento de registros totales
  const filteredOrdenes = useMemo(() => {
    let result = [...orders];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter((o) => {
        const numeroPedido = String(o.numeroFactura || "").toLowerCase();
        const idOrden = String(o.id || "").toLowerCase();
        const cliente = String(o.cliente || "").toLowerCase();
        const detalle = String(o.detalleEntrega || "").toLowerCase();

        return (
          idOrden.includes(term) ||
          numeroPedido.includes(term) ||
          cliente.includes(term) ||
          detalle.includes(term)
        );
      });
    }

    if (deliveryFilter) {
      result = result.filter((o) => o.tipoEntrega === deliveryFilter);
    }

    if (
      dateFilter === "personalizado" &&
      customDateRange.start &&
      customDateRange.end
    ) {
      const start = new Date(customDateRange.start);
      const end = new Date(customDateRange.end);
      end.setHours(23, 59, 59, 999);
      result = result.filter((o) => {
        const orderDate = new Date(o.fecha);
        return orderDate >= start && orderDate <= end;
      });
    } else if (dateFilter && dateFilter !== "personalizado") {
      const { start, end } = getDateRange(dateFilter);
      result = result.filter((o) => {
        const orderDate = new Date(o.fecha);
        return orderDate >= start && orderDate < end;
      });
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case "reciente":
          return new Date(b.fecha) - new Date(a.fecha);
        case "antiguo":
          return new Date(a.fecha) - new Date(b.fecha);
        case "mayor_precio":
          return b.total - a.total;
        case "menor_precio":
          return a.total - b.total;
        case "cliente":
          return a.cliente.localeCompare(b.cliente);
        default:
          return 0;
      }
    });

    return result;
  }, [orders, searchTerm, deliveryFilter, dateFilter, customDateRange, sortBy]);

  // Agrupación jerárquica: año > mes, con lo más reciente primero.
  const groupedOrdersByYear = useMemo(() => {
    const groups = {};
    filteredOrdenes.forEach((orden) => {
      if (!orden.fecha) return;
      const [year, month] = orden.fecha.split("-");
      const yearKey = year;
      const monthKey = `${year}-${month}`;
      if (!groups[yearKey]) groups[yearKey] = {};
      if (!groups[yearKey][monthKey]) groups[yearKey][monthKey] = [];
      groups[yearKey][monthKey].push(orden);
    });
    return groups;
  }, [filteredOrdenes]);

  const toggleMonthAccordion = (monthKey) => {
    setOpenMonths((prev) => ({
      ...prev,
      [monthKey]: !prev[monthKey],
    }));
  };

  const formatMonthSpan = (monthKey) => {
    const [year, month] = monthKey.split("-");
    const monthIndex = parseInt(month, 10) - 1;
    return `${NOMBRES_MESES[monthIndex]} ${year}`.toUpperCase();
  };

  const handleDelete = async (orden) => {
    if (!canDelete) {
      alert("Solo el administrador puede eliminar órdenes.");
      return;
    }

    const nombre = orden.cliente || "Cliente";
    const numeroOrden = orden.numeroFactura || orden.id;
    if (!window.confirm(`¿Eliminar la orden ${numeroOrden} de ${nombre}?`)) {
      return;
    }

    const { error } = await supabase.from("orders").delete().eq("id", orden.id);
    if (error) {
      console.error("Error eliminando orden:", error);
      alert("No se pudo eliminar la orden.");
      return;
    }

    setOrders((current) =>
      current.filter((currentOrder) => currentOrder.id !== orden.id),
    );
  };

  const handlePrint = (orden) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Permite las ventanas emergentes para imprimir la orden.");
      return;
    }

    const escaparHtml = (value) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    const itemsHtml = (orden.items || [])
      .map(
        (item) =>
          `<tr><td>${escaparHtml(item.product_name)}</td><td>${item.quantity}</td><td>${formatMoney(item.subtotal || item.unit_price * item.quantity)}</td></tr>`,
      )
      .join("");

    printWindow.document.write(`
      <html><head><title>Factura ${escaparHtml(orden.numeroFactura)}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{text-align:center}p{margin:6px 0}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f3f3f3}.total{text-align:right;font-size:18px;font-weight:bold;margin-top:20px}</style>
      </head><body>
      <h1>Factura</h1>
      <p><strong>Orden:</strong> ${escaparHtml(orden.numeroFactura)}</p>
      <p><strong>Cliente:</strong> ${escaparHtml(orden.cliente)}</p>
      <p><strong>Entrega:</strong> ${escaparHtml(displayOrderType(orden.metodoEntrega))}</p>
      <p><strong>Pago:</strong> ${escaparHtml(orden.metodoPago)}</p>
      <table><thead><tr><th>Producto</th><th>Cantidad</th><th>Total</th></tr></thead><tbody>${itemsHtml}</tbody></table>
      <p class="total">Total: ${formatMoney(orden.total)}</p>
      </body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleInvoice = (orden) => setInvoiceOrder(orden);

  const handleShare = async (orden) => {
    const text = `Factura ${orden.numeroFactura}\nCliente: ${orden.cliente}\nTotal: ${formatMoney(orden.total)}\nEntrega: ${orden.metodoEntrega}\nPago: ${orden.metodoPago}`;

    try {
      if (navigator?.share) {
        await navigator.share({
          title: `Factura ${orden.numeroFactura}`,
          text,
        });
        return;
      }

      if (navigator?.clipboard) {
        await navigator.clipboard.writeText(text);
        alert("Datos compartidos copiados al portapapeles");
      }
    } catch (error) {
      console.error("Error al compartir:", error);
    }
  };

  const handleEdit = (orden) => {
    const deliveryMethodMap = {
      mesa: "table",
      recoger: "pickup",
      domicilio: "delivery",
      punto: "point",
    };

    navigate("/pos", {
      state: {
        mesaEdit: {
          orderId: orden.id,
          orderNumber: orden.numeroFactura,
          orderStatus: orden.databaseStatus,
          orderType: orden.metodoEntrega,
          mesa: orden.mesa,
          numero: orden.mesa,
          deliveryMethod: deliveryMethodMap[orden.metodoEntrega],
          customerName: orden.cliente,
          customerPhone: orden.telefono,
          paymentMethod: orden.metodoPago,
          paymentMethods: orden.paymentMethods,
          total: orden.total,
          address: orden.deliveryAddress,
          referencePoint: orden.deliveryInstructions,
          locationText: orden.punto,
          notes: orden.observaciones,
          comanda: orden.items.map((item) => ({
            id: item.id,
            productId: item.product_id,
            name: item.product_name,
            qty: item.quantity,
            price: item.unit_price,
            notes: item.notes,
            options: item.options,
          })),
        },
      },
    });
  };

  const handleOpenMap = (orden) => {
    const lat = orden.latitude ?? orden.lat ?? orden.location_lat ?? null;
    const lng = orden.longitude ?? orden.lng ?? orden.location_lng ?? null;

    if (lat !== null && lng !== null) {
      const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}&z=16`;
      window.open(mapsUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (orden.delivery_address) {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(orden.delivery_address)}`;
      window.open(mapsUrl, "_blank", "noopener,noreferrer");
      return;
    }

    alert("Aún no hay coordenadas o dirección válida para este domicilio.");
  };

  return (
    <div className="min-h-screen bg-background text-white p-4 font-sans">
      <header className="max-w-7xl mx-auto mb-10 space-y-10">
        {/* Título y Buscador Dinámico */}
        <div className="flex flex-col gap-3 justify-between mb-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-black tracking-tighter">Órdenes</h1>
            <button
              type="button"
              onClick={loadBusinessOrders}
              disabled={refreshing}
              title={refreshing ? "Actualizando órdenes" : "Actualizar órdenes"}
              className="inline-flex items-center justify-center rounded-xl  p-2 text-violet-300 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw
                size={14}
                className={refreshing ? "animate-spin" : ""}
              />
            </button>
          </div>
          <div className="relative w-full">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600"
              size={14}
            />
            <input
              type="text"
              placeholder="Buscar por nombre o número de pedido..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
              }}
              className="w-full bg-neutral-900/50 border border-white/5 rounded-xl py-3 pl-10 pr-10 text-[10px] font-mono outline-none focus:border-violet-500/40 transition-all uppercase placeholder:text-neutral-700"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center">
              <AnimatePresence mode="wait">
                {searchTerm ? (
                  <motion.button
                    key="clear"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.12 }}
                    onClick={() => {
                      setSearchTerm("");
                    }}
                    className="text-neutral-500 hover:text-red-400 transition-colors p-1"
                    title="Borrar búsqueda"
                  >
                    <X size={14} />
                  </motion.button>
                ) : (
                  <motion.button
                    key="paste"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.12 }}
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        setSearchTerm(text);
                      } catch (err) {
                        console.error(
                          "Error al acceder al portapapeles: ",
                          err,
                        );
                      }
                    }}
                    className="text-neutral-600 hover:text-violet-400 transition-colors p-1"
                    title="Pegar desde el portapapeles"
                  >
                    <Clipboard size={14} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-4 bg-neutral-900/30 p-4 rounded-2xl border border-white/5">
          <TerminalSelect
            label="Ordenar Por"
            value={sortBy}
            options={[
              { id: "reciente", label: "Más Reciente" },
              { id: "antiguo", label: "Más Antiguo" },
              { id: "mayor_precio", label: "Mayor Precio" },
              { id: "menor_precio", label: "Menor Precio" },
              { id: "cliente", label: "Por Cliente" },
            ]}
            onChange={setSortBy}
            onClear={() => setSortBy("reciente")}
            icon={ArrowUpDown}
          />
          <TerminalSelect
            label="Método de Entrega"
            value={deliveryFilter}
            options={METODOS_ENTREGA}
            onChange={(v) => {
              setDeliveryFilter(v);
            }}
            onClear={() => setDeliveryFilter("")}
            icon={Filter}
          />
          <TerminalSelect
            label="Fecha"
            value={dateFilter}
            options={PERIODOS_FECHA}
            onChange={(v) => {
              setDateFilter(v);
            }}
            onClear={() => setDateFilter("")}
            icon={CalendarIcon}
          />

          {dateFilter === "personalizado" && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col w-100 gap-2"
            >
              <div className="flex flex-col gap-1.5">
                <label className="text-[8px] font-black text-neutral-600 uppercase tracking-widest ml-1">
                  Desde
                </label>
                <input
                  type="date"
                  value={customDateRange.start}
                  onChange={(e) =>
                    setCustomDateRange({
                      ...customDateRange,
                      start: e.target.value,
                    })
                  }
                  className="bg-neutral-900 border border-white/5 rounded-xl p-2.5 text-[10px] font-mono text-neutral-300 outline-none focus:border-violet-500/40"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[8px] font-black text-neutral-600 uppercase tracking-widest ml-1">
                  Hasta
                </label>
                <input
                  type="date"
                  value={customDateRange.end}
                  onChange={(e) =>
                    setCustomDateRange({
                      ...customDateRange,
                      end: e.target.value,
                    })
                  }
                  className="bg-neutral-900 border border-white/5 rounded-xl p-2.5 text-[10px] font-mono text-neutral-300 outline-none focus:border-violet-500/40"
                />
              </div>
            </motion.div>
          )}
        </div>
      </header>

      {/* Listado de Órdenes organizado por año y mes */}
      <main className="max-w-7xl mx-auto space-y-4 pb-20">
        {loadingOrders ? (
          <div className="text-center py-20">
            <p className="text-neutral-500 text-lg font-bold">
              Cargando ordenes…
            </p>
          </div>
        ) : ordersError ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-6 py-12 text-center">
            <p className="text-sm font-black uppercase tracking-widest text-amber-300">
              No se pudieron cargar las órdenes
            </p>
            <p className="mx-auto mt-2 max-w-xl text-xs text-neutral-400">
              {ordersError}
            </p>
            <button
              type="button"
              onClick={loadBusinessOrders}
              disabled={refreshing}
              className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-amber-200 hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-50"
            >
              {refreshing ? "Reintentando..." : "Reintentar"}
            </button>
          </div>
        ) : filteredOrdenes.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-neutral-500 text-lg font-bold">
              {searchTerm || deliveryFilter
                ? "No hay órdenes que coincidan"
                : "Sin órdenes"}
            </p>
          </div>
        ) : (
          <>
            {Object.keys(groupedOrdersByYear)
              .sort((a, b) => Number(b) - Number(a))
              .map((yearKey, yearIndex) => {
                const months = groupedOrdersByYear[yearKey];
                const monthKeys = Object.keys(months).sort().reverse();

                return (
                  <section key={yearKey} className="space-y-3">
                    {monthKeys.map((monthKey, monthIndex) => {
                      const isDefaultOpen = yearIndex === 0 && monthIndex === 0;
                      const isOpen = openMonths[monthKey] ?? isDefaultOpen;
                      const monthOrders = months[monthKey];

                      return (
                        <div key={monthKey} className="space-y-3">
                          <button
                            type="button"
                            onClick={() => toggleMonthAccordion(monthKey)}
                            className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-neutral-900/40 px-4 py-3 text-left transition-all hover:bg-neutral-900/80"
                          >
                            <span className="flex items-center gap-3">
                              <span className="rounded-md border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[9px] font-black tracking-widest text-violet-400">
                                {formatMonthSpan(monthKey)}
                              </span>
                              <span className="text-[9px] font-mono text-neutral-500">
                                {monthOrders.length}{" "}
                                {monthOrders.length === 1
                                  ? "REGISTRO"
                                  : "REGISTROS"}
                              </span>
                            </span>
                            <motion.span
                              animate={{ rotate: isOpen ? 180 : 0 }}
                              className="text-neutral-500"
                            >
                              <ChevronDown size={14} />
                            </motion.span>
                          </button>

                          <AnimatePresence initial={false}>
                            {isOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{
                                  duration: 0.25,
                                  ease: "easeInOut",
                                }}
                                className="space-y-3 overflow-hidden pl-1"
                              >
                                {monthOrders.map((orden) => (
                                  <OrderCard
                                    key={orden.id}
                                    orden={orden}
                                    onDelete={handleDelete}
                                    onInvoice={handleInvoice}
                                    onPrint={handlePrint}
                                    onShare={handleShare}
                                    onEdit={handleEdit}
                                    canDelete={canDelete}
                                  />
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </section>
                );
              })}

            <div
              ref={ordersEndRef}
              className="flex min-h-16 items-center justify-center border-t border-white/5 pt-4"
            >
              {loadingMoreOrders ? (
                <span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-neutral-500">
                  <LoaderCircle size={14} className="animate-spin" /> Cargando
                  más órdenes
                </span>
              ) : hasMoreOrders ? (
                <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-700">
                  Desplázate para ver más
                </span>
              ) : (
                <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-700">
                  No hay más órdenes
                </span>
              )}
            </div>
          </>
        )}
      </main>
      <InvoicePreview
        order={invoiceOrder}
        onClose={() => setInvoiceOrder(null)}
        onPrint={handlePrint}
      />
    </div>
  );
};

// --- COMPONENTE KPI CARD ---
const KPICard = memo(({ label, value, color }) => (
  <div className="bg-neutral-900/40 border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-all">
    <p className="text-[8px] text-neutral-600 font-black uppercase tracking-widest mb-2">
      {label}
    </p>
    <p className={`text-2xl font-black ${color}`}>{value}</p>
  </div>
));

export default Ordenes;
