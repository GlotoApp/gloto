import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  Flame,
  CheckCircle2,
  RotateCcw,
  ChevronRight,
  Monitor,
  Hash,
  Printer,
  FileText,
  Volume2,
  X,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import { useAuth } from "../../src/components/AuthContext";

const normalizeDeliveryType = (order) => {
  const metadataMethod = order.metadata?.metodoEntrega;
  const type = String(
    metadataMethod || order.order_type || "pickup",
  ).toLowerCase();

  if (["delivery", "domicilio"].includes(type)) return "delivery";
  if (["pickup", "recoger"].includes(type)) return "pickup";
  if (["table", "mesa"].includes(type)) return "table";
  if (["point", "punto", "en_punto", "in_point"].includes(type)) return "point";
  return "table";
};

const normalizeKitchenStatus = (status) => {
  if (
    ["pending", "confirmed", "nuevos", "pendiente", "confirmado"].includes(
      status,
    )
  ) {
    return "nuevos";
  }
  if (["preparing", "preparando"].includes(status)) return "preparando";
  if (["ready", "complete", "completado", "listo"].includes(status)) {
    return "listo";
  }
  return null;
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

const formatOption = (option) => {
  const label = getOptionLabel(option);
  const extraPrice =
    typeof option === "object" ? Number(option.precio_extra || 0) : 0;
  return extraPrice > 0
    ? `${label} (+$${new Intl.NumberFormat("es-CO", {
        maximumFractionDigits: 0,
      }).format(extraPrice)})`
    : label;
};

const mapOrderToKitchen = (order, optionPricesByProduct = {}) => ({
  id: order.order_number || order.id,
  databaseId: order.id,
  cliente: order.customer_name || "Consumidor Final",
  mesa: order.mesa || order.punto || order.metadata?.puntoRetiro || "-",
  minutos: Math.max(
    0,
    Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000),
  ),
  estado: normalizeKitchenStatus(
    String(order.status || "pending").toLowerCase(),
  ),
  tipoEntrega: normalizeDeliveryType(order),
  prioridad: "normal",
  notasGenerales: order.notes || "",
  items: (order.order_items || []).map((item) => ({
    databaseId: item.id,
    batchId: item.order_batch_id || "legacy",
    batchSequence: Number(item.order_batches?.sequence_number || 0),
    qty: Number(item.quantity) || 0,
    delivered: Boolean(item.kitchen_dispatched),
    name: item.product_name || item.name || "Producto",
    cat: item.category || "",
    nota: item.notes || "",
    opciones: Array.isArray(item.options) ? item.options : [],
    initPrice: Number(item.init_price ?? item.price ?? item.unit_price ?? 0),
    price: Number(item.unit_price ?? item.price ?? item.init_price ?? 0),
  })),
});

export default function KitchenPanel() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [timeUpdate, setTimeUpdate] = useState(0);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundModalOpen, setSoundModalOpen] = useState(false);
  const soundEnabledRef = useRef(false);
  const businessIdRef = useRef(null);
  const despachandoIds = useRef(new Set());
  const audioContextRef = useRef(null);
  const knownOrderIdsRef = useRef(new Set());
  const initializedOrdersRef = useRef(false);
  const recargaRealtimeRef = useRef(null);

  const deliveryLabels = {
    table: { label: "Mesa", icon: "table_bar", color: "emerald" },
    pickup: { label: "Recoger", icon: "takeout_dining", color: "amber" },
    delivery: { label: "Domicilio", icon: "local_shipping", color: "fuchsia" },
    point: { label: "En Punto", icon: "location_on", color: "blue" },
  };

  const colorMap = {
    emerald: {
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
      text: "text-emerald-400",
      dot: "bg-emerald-400",
    },
    amber: {
      bg: "bg-amber-500/10",
      border: "border-amber-500/25",
      text: "text-amber-400",
      dot: "bg-amber-400",
    },
    fuchsia: {
      bg: "bg-fuchsia-500/10",
      border: "border-fuchsia-500/25",
      text: "text-fuchsia-400",
      dot: "bg-fuchsia-400",
    },
    blue: {
      bg: "bg-blue-500/10",
      border: "border-blue-500/30",
      text: "text-blue-400",
      dot: "bg-blue-400",
    },
    violet: {
      bg: "bg-violet-500/10",
      border: "border-violet-500/30",
      text: "text-violet-400",
      dot: "bg-violet-400",
    },
  };

  const [filtros, setFiltros] = useState({
    pickup: true,
    point: true,
    table: true,
    delivery: true,
  });

  const [ordenes, setOrdenes] = useState([]);
  const [pendingActionByOrder, setPendingActionByOrder] = useState({});

  const reproducirAlerta = () => {
    if (typeof window === "undefined") return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    const audioContext = audioContextRef.current || new AudioContext();
    audioContextRef.current = audioContext;

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    const ahora = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 820;
    gain.gain.setValueAtTime(0.0001, ahora);
    gain.gain.exponentialRampToValueAtTime(1, ahora + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ahora + 0.2);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(ahora);
    oscillator.stop(ahora + 0.21);
  };

  const probarSonido = () => {
    reproducirAlerta();
  };

  const cambiarSonido = () => {
    const nextValue = !soundEnabledRef.current;
    soundEnabledRef.current = nextValue;
    setSoundEnabled(nextValue);

    guardarPreferenciaSonido(nextValue);
  };

  const guardarPreferenciaSonido = async (enabled) => {
    if (!businessIdRef.current) return;

    const { error } = await supabase
      .from("businesses")
      .update({ sound_enabled: enabled })
      .eq("id", businessIdRef.current);

    if (error) {
      console.error("Error guardando preferencia de sonido:", error);
    }
  };

  const cargarOrdenes = async () => {
    if (!user?.id) {
      setOrdenes([]);
      setLoadingOrders(false);
      return;
    }

    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || !profile?.business_id) {
        setOrdenes([]);
        return;
      }
      businessIdRef.current = profile.business_id;

      const { data: business, error: businessError } = await supabase
        .from("businesses")
        .select("sound_enabled")
        .eq("id", profile.business_id)
        .maybeSingle();

      if (businessError) {
        console.error("Error cargando preferencia de sonido:", businessError);
      } else if (typeof business?.sound_enabled === "boolean") {
        soundEnabledRef.current = business.sound_enabled;
        setSoundEnabled(business.sound_enabled);
      }

      const { data, error } = await supabase
        .from("orders")
        .select(
          "*, order_items(*, order_batches(id, sequence_number, created_at))",
        )
        .eq("business_id", profile.business_id)
        .eq("is_reservation", false)
        .in("status", ["pending", "confirmed", "preparing", "complete"])
        .order("created_at", { ascending: true });

      if (error) throw error;
      const kitchenOrders = (data || []).filter((order) => {
        if (order.order_type !== "table") return true;
        if (order.table_status === null || order.table_status === undefined) {
          return true;
        }
        const tableStatus = String(order.table_status).trim().toLowerCase();
        return (
          tableStatus !== "" &&
          tableStatus !== "clean" &&
          tableStatus !== "limpia" &&
          tableStatus !== "cerrada"
        );
      });
      const productIds = [
        ...new Set(
          kitchenOrders.flatMap((order) =>
            (order.order_items || [])
              .map((item) => item.product_id)
              .filter(Boolean),
          ),
        ),
      ];
      const optionPricesByProduct = {};
      if (productIds.length > 0) {
        const { data: optionItems, error: optionItemsError } = await supabase
          .from("products_items")
          .select("*")
          .in("product_id", productIds);

        if (optionItemsError) {
          console.error(
            "Error cargando precios de variables:",
            optionItemsError,
          );
        }

        (optionItems || []).forEach((option) => {
          const productId = option.product_id;
          const name = String(
            option.name || option.nombre || option.option_name || "",
          )
            .trim()
            .toLowerCase();
          if (!productId || !name) return;
          optionPricesByProduct[productId] ||= {};
          optionPricesByProduct[productId][name] = Number(
            option.precio_extra ??
              option.price_extra ??
              option.extra_price ??
              option.price ??
              0,
          );
        });
      }
      const nuevosPedidos = kitchenOrders.filter((order) => {
        const status = String(order.status || "").toLowerCase();
        return (
          ["pending", "confirmed"].includes(status) &&
          !knownOrderIdsRef.current.has(order.id)
        );
      });
      const orderIds = new Set(kitchenOrders.map((order) => order.id));
      knownOrderIdsRef.current = orderIds;
      if (
        initializedOrdersRef.current &&
        nuevosPedidos.length > 0 &&
        soundEnabledRef.current
      ) {
        reproducirAlerta();
      }
      initializedOrdersRef.current = true;
      setOrdenes(
        kitchenOrders
          .map((order) => mapOrderToKitchen(order, optionPricesByProduct))
          .filter(
            (order) =>
              order.estado && !despachandoIds.current.has(order.databaseId),
          ),
      );
    } catch (error) {
      console.error("Error cargando órdenes de cocina:", error);
      setOrdenes([]);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    cargarOrdenes();
    return undefined;
  }, [user]);

  useEffect(() => {
    if (!user?.id) return undefined;

    let canalPedidos;
    let cancelado = false;

    const suscribirPedidos = async () => {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .maybeSingle();

      if (error || !profile?.business_id || cancelado) return;

      canalPedidos = supabase
        .channel(`cocina-pedidos-${profile.business_id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders",
            filter: `business_id=eq.${profile.business_id}`,
          },
          () => {
            if (recargaRealtimeRef.current) {
              clearTimeout(recargaRealtimeRef.current);
            }

            recargaRealtimeRef.current = setTimeout(() => {
              recargaRealtimeRef.current = null;
              cargarOrdenes();
            }, 300);
          },
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error("Realtime de cocina no disponible:", status);
          }
        });
    };

    suscribirPedidos();

    return () => {
      cancelado = true;
      if (recargaRealtimeRef.current) {
        clearTimeout(recargaRealtimeRef.current);
        recargaRealtimeRef.current = null;
      }
      if (canalPedidos) supabase.removeChannel(canalPedidos);
    };
  }, [user]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeUpdate((t) => t + 1);
      setOrdenes((prevOrdenes) =>
        prevOrdenes.map((o) => ({
          ...o,
          minutos: o.minutos + 1,
        })),
      );
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const moverEstado = async (id, nuevoEstado) => {
    const order = ordenes.find((item) => item.id === id);
    if (!order || pendingActionByOrder[id]) return;

    const databaseStatusByKitchenStatus = {
      nuevos: "pending",
      preparando: "preparing",
      listo: "complete",
    };
    const databaseStatus = databaseStatusByKitchenStatus[nuevoEstado];
    const ordenEstados = ["nuevos", "preparando", "listo"];
    const direction =
      ordenEstados.indexOf(nuevoEstado) > ordenEstados.indexOf(order?.estado)
        ? "forward"
        : "backward";

    if (!databaseStatus) return;

    setPendingActionByOrder((prev) => ({
      ...prev,
      [id]: direction,
    }));

    const { error } = await supabase
      .from("orders")
      .update({ status: databaseStatus, updated_at: new Date().toISOString() })
      .eq("id", order?.databaseId);

    if (error) {
      console.error("Error actualizando estado de cocina:", error);
      setPendingActionByOrder((prev) => {
        const siguiente = { ...prev };
        delete siguiente[id];
        return siguiente;
      });
      await cargarOrdenes();
      return;
    }

    setPendingActionByOrder((prev) => {
      const siguiente = { ...prev };
      delete siguiente[id];
      return siguiente;
    });

    await cargarOrdenes();
  };

  const despacharOrden = async (id) => {
    const order = ordenes.find((item) => item.id === id);
    if (!order?.databaseId || despachandoIds.current.has(order.databaseId))
      return;

    const pendingItems = order.items.filter((item) => !item.delivered);
    if (pendingItems.length === 0) return;

    despachandoIds.current.add(order.databaseId);
    setOrdenes((prev) => prev.filter((item) => item.id !== id));

    const { data: updatedItems, error: itemError } = await supabase
      .from("order_items")
      .update({ kitchen_dispatched: true })
      .eq("order_id", order.databaseId)
      .eq("kitchen_dispatched", false)
      .select("id, kitchen_dispatched");

    if (
      itemError ||
      !updatedItems ||
      updatedItems.length !== pendingItems.length ||
      updatedItems.some((item) => item.kitchen_dispatched !== true)
    ) {
      console.error(
        "Error verificando despacho de items de cocina:",
        itemError || updatedItems,
      );
      despachandoIds.current.delete(order.databaseId);
      await cargarOrdenes();
      return;
    }

    const batchIds = [
      ...new Set(
        pendingItems
          .map((item) => item.batchId)
          .filter((batchId) => batchId && batchId !== "legacy"),
      ),
    ];
    let batchError = null;
    if (batchIds.length > 0) {
      const result = await supabase
        .from("order_batches")
        .update({ dispatched_at: new Date().toISOString() })
        .in("id", batchIds);
      batchError = result.error;
    }

    if (batchError) {
      console.error("Error cerrando comandas de cocina:", batchError);
      despachandoIds.current.delete(order.databaseId);
      await cargarOrdenes();
      return;
    }

    const { error: orderError } = await supabase
      .from("orders")
      .update({
        status: "dispatched",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order?.databaseId);

    if (orderError) {
      console.error("Error despachando orden de cocina:", orderError);
      despachandoIds.current.delete(order.databaseId);
      await cargarOrdenes();
    } else {
      despachandoIds.current.delete(order.databaseId);
    }
  };

  const toggleFiltro = (tipo) => {
    setFiltros((prev) => ({
      ...prev,
      [tipo]: !prev[tipo],
    }));
  };

  const ordenesFiltradasPorTipo = ordenes.filter((o) => {
    return filtros[o.tipoEntrega] || false;
  });

  const columnas = [
    {
      id: "nuevos",
      label: "Nuevos",
      icon: Clock,
      color: "from-blue-600 to-blue-500",
      bgBase: "bg-blue-500/5",
    },
    {
      id: "preparando",
      label: "En Proceso",
      icon: Flame,
      color: "from-orange-600 to-orange-500",
      bgBase: "bg-orange-500/5",
    },
    {
      id: "listo",
      label: "Completado",
      icon: CheckCircle2,
      color: "from-emerald-600 to-emerald-500",
      bgBase: "bg-emerald-500/5",
    },
  ];

  const cantidadPorEstado = (estado) =>
    ordenesFiltradasPorTipo.filter((orden) => orden.estado === estado).length;

  return (
    <div className="h-screen bg-background text-slate-100 flex flex-col overflow-hidden font-sans">
      <header className="p-3 md:p-4 bg-background relative z-10">
        <div className="max-w-[1800px] mx-auto flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 ">
          {/* Branding Compacto & KPIs Tácticos */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-8 flex-1">
            <div className="flex w-full items-center justify-between gap-3">
              <h1 className="text-2xl font-black tracking-tighter">Cocina</h1>
              <button
                type="button"
                onClick={() => setSoundModalOpen(true)}
                title="Configurar sonido"
                aria-label="Configurar sonido"
                className={`flex items-center justify-center gap-1.5 p-2.5 md:px-3 md:py-2 rounded-xl border font-black text-[10px] uppercase tracking-wide transition-all whitespace-nowrap ${
                  soundEnabled
                    ? "border-none text-success  hover:bg-success/10"
                    : "border-none text-white/40 hover:text-white hover:bg-white/30 "
                }`}
              >
                <Volume2 size={17} />
                <span className="hidden md:inline">Sonido</span>
              </button>
            </div>
          </div>

          {/* Filtros de Métodos de Entrega */}
          <div className="flex items-center justify-center gap-1.5 w-full md:w-auto overflow-x-auto no-scrollbar py-1 md:py-0">
            {Object.entries(deliveryLabels).map(([key, data]) => {
              const c = colorMap[data.color];
              const active = filtros[key];
              return (
                <button
                  key={key}
                  onClick={() => toggleFiltro(key)}
                  className={`flex items-center justify-center gap-0 md:gap-1.5 p-2.5 md:px-4 md:py-2.5 rounded-[25px] border font-black text-[10px] uppercase tracking-wide transition-all duration-200 whitespace-nowrap ${
                    active
                      ? `${c.bg} ${c.border} ${c.text}`
                      : "bg-white/[0.02] border-white/[0.06] text-white/20"
                  }`}
                >
                  <span className="material-symbols-outlined text-lg md:text-xl leading-none">
                    {data.icon}
                  </span>
                  <span className="hidden md:inline">{data.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {soundModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setSoundModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sound-modal-title"
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#141414] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300">
                  <Volume2 size={19} />
                </div>
                <div>
                  <h2
                    id="sound-modal-title"
                    className="text-lg font-black text-white"
                  >
                    Sonido de Cocina
                  </h2>
                  <p className="mt-1 text-xs text-white/45">
                    Configura las alertas de nuevos pedidos.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSoundModalOpen(false)}
                aria-label="Cerrar configuración de sonido"
                className="flex items-center justify-center rounded-xl p-2 text-white/50 hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 px-5 py-5">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">
                Preferencia del negocio
              </p>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div>
                  <p className="text-sm font-bold text-white">
                    Alertas automáticas
                  </p>
                  <p className="mt-1 text-xs text-white/45">
                    {soundEnabled
                      ? "Sonará cuando llegue un pedido nuevo"
                      : "No se reproducirán alertas automáticas"}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={soundEnabled}
                  onClick={cambiarSonido}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                    soundEnabled ? "bg-sky-500" : "bg-white/15"
                  }`}
                >
                  <span
                    className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      soundEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="border-t border-white/10 pt-4">
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/35">
                  Comprobación
                </p>
                <button
                  type="button"
                  onClick={probarSonido}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-black text-sky-300 transition-colors hover:bg-sky-500/20"
                >
                  <Volume2 size={17} />
                  Probar sonido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="relative flex-1 overflow-hidden">
        {loadingOrders && (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background">
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="h-2 w-2 animate-pulse rounded-full bg-blue-400"
                style={{ animationDelay: `${dot * 150}ms` }}
              />
            ))}
          </div>
        )}
        <div
          className={`flex h-full transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] md:grid md:grid-cols-3 md:gap-px md:bg-white/5 ${
            activeTab === 0
              ? "translate-x-0"
              : activeTab === 1
                ? "-translate-x-full md:translate-x-0"
                : "-translate-x-[200%] md:translate-x-0"
          }`}
        >
          {columnas.map((col, idx) => (
            <section
              key={col.id}
              className={`flex flex-col bg-[#080808] ${col.bgBase} w-full min-w-full md:min-w-0 min-h-0 overflow-hidden`}
            >
              <div className="p-1 border-b border-white/5 relative">
                <div
                  className={`absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r ${col.color}`}
                ></div>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg text-white/80">
                    <col.icon size={18} />
                  </div>
                  <div>
                    <h2 className="uppercase text-1xl font-black tabular-nums leading-none">
                      {col.label} / {cantidadPorEstado(col.id)}
                    </h2>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32 md:pb-8 cocina-scrollbar">
                <AnimatePresence initial={false} mode="sync">
                  {ordenesFiltradasPorTipo
                    .filter((o) => o.estado === col.id)
                    .sort((a, b) => b.minutos - a.minutos)
                    .map((o) => (
                      <TicketCard
                        key={o.id}
                        orden={o}
                        labelData={deliveryLabels[o.tipoEntrega]}
                        colorData={
                          colorMap[deliveryLabels[o.tipoEntrega]?.color]
                        }
                        pendingDirection={pendingActionByOrder[o.id] || null}
                        onNext={() => {
                          const nextState =
                            col.id === "nuevos"
                              ? "preparando"
                              : col.id === "preparando"
                                ? "listo"
                                : null;
                          if (nextState && !pendingActionByOrder[o.id]) {
                            moverEstado(o.id, nextState);
                          } else if (
                            !nextState &&
                            !pendingActionByOrder[o.id]
                          ) {
                            despacharOrden(o.id);
                          }
                        }}
                        onPrev={() => {
                          const prevState =
                            col.id === "preparando" ? "nuevos" : "preparando";
                          if (!pendingActionByOrder[o.id]) {
                            moverEstado(o.id, prevState);
                          }
                        }}
                        type={col.id}
                      />
                    ))}
                  {cantidadPorEstado(col.id) === 0 && (
                    <p className="pt-16 text-center text-xl font-semibold text-white/15 upercase tracking-wide">
                      vacío
                    </p>
                  )}
                </AnimatePresence>
              </div>
            </section>
          ))}
        </div>

        {/* Tab bar flotante en móvil - Centrado en el área de contenido */}
        <div className="fixed left-20 right-0 bottom-0 z-20 md:hidden flex items-end justify-center p-4 pb-6 pointer-events-none">
          <div className="flex items-center gap-4 bg-[#111]/95 backdrop-blur-lg  rounded-4xl px-2 py-2 shadow-2xl pointer-events-auto">
            {columnas.map((col, idx) => (
              <button
                key={col.id}
                onClick={() => setActiveTab(idx)}
                className={`relative p-2.5 rounded-3xl transition-all duration-200 ${
                  activeTab === idx
                    ? "bg-primary-container/20 text-primary-container"
                    : "text-slate-600 hover:text-slate-400"
                }`}
              >
                {cantidadPorEstado(col.id) > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-[10px] font-black leading-5 text-white text-center shadow-lg shadow-red-950/50">
                    {cantidadPorEstado(col.id)}
                  </span>
                )}
                <col.icon
                  size={20}
                  strokeWidth={activeTab === idx ? 2.5 : 1.8}
                />
              </button>
            ))}
          </div>
        </div>
      </main>

      {/* Gradiente de transición opcional */}
      <div className="fixed left-20 right-0 bottom-0 h-32 bg-gradient-to-t from-background/80 to-transparent pointer-events-none md:hidden z-10"></div>
    </div>
  );
}

const TicketCard = ({
  orden,
  labelData,
  colorData,
  onNext,
  onPrev,
  type,
  pendingDirection = null,
}) => {
  const isForwardLoading = pendingDirection === "forward";
  const isBackwardLoading = pendingDirection === "backward";
  const handlePrint = () => {
    const escaparHtml = (value) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    const formatoPrecio = (value) =>
      new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
      }).format(Number(value) || 0);
    const totalOrden = orden.items.reduce(
      (total, item) =>
        total + (Number(item.price) || 0) * (Number(item.qty) || 0),
      0,
    );
    const itemsHtml = orden.items
      .map((item) => {
        const opciones = (item.opciones || [])
          .map(
            (opcion) =>
              `<div class="option">+ ${escaparHtml(formatOption(opcion))}</div>`,
          )
          .join("");
        const instrucciones = item.nota
          ? `<div class="instruction">Instrucción: ${escaparHtml(item.nota)}</div>`
          : "";
        const subtotal = (Number(item.price) || 0) * (Number(item.qty) || 0);

        return `<tr>
        <td class="quantity">${escaparHtml(item.qty)}</td>
        <td class="product">
          <div class="product-name">${escaparHtml(item.name)}</div>
          ${opciones}
          ${instrucciones}
        </td>
        <td class="price">${formatoPrecio(subtotal)}</td>
      </tr>`;
      })
      .join("");

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Comanda ${orden.id}</title>
          <style>
            body { font-family: 'Courier New', monospace; width: 80mm; margin: 0; padding: 8mm; background: white; color: black; }
            .logo-space { height: 24mm; border: 1px dashed #999; display: flex; align-items: center; justify-content: center; color: #999; font-size: 10px; margin-bottom: 8px; }
            .header { text-align: center; border-bottom: 2px solid black; padding-bottom: 8px; margin-bottom: 10px; }
            .order-id { font-size: 24px; font-weight: bold; margin: 6px 0; }
            .order-info { font-size: 13px; margin: 3px 0; }
            .customer { font-size: 16px; font-weight: bold; margin: 5px 0; }
            .notes-block { border: 1px dashed black; padding: 6px; margin: 10px 0; font-size: 11px; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; }
            th { text-align: left; padding: 5px 3px; border-bottom: 2px solid black; font-weight: bold; font-size: 10px; }
            td { padding: 7px 3px; border-bottom: 1px solid #ddd; vertical-align: top; font-size: 11px; }
            .quantity { width: 12%; font-size: 22px; font-weight: bold; }
            .product { width: 58%; }
            .product-name { font-weight: bold; }
            .option, .instruction { font-size: 10px; margin-top: 3px; }
            .option { color: #245b75; }
            .instruction { color: #795500; font-weight: bold; }
            .price { width: 30%; text-align: right; font-weight: bold; white-space: nowrap; }
            .total { text-align: right; font-size: 15px; font-weight: bold; border-top: 2px solid black; padding-top: 8px; }
            .footer { text-align: center; margin-top: 15px; font-size: 11px; border-top: 2px solid black; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="logo-space">LOGO DEL NEGOCIO</div>
          <div class="header">
            <div class="order-id">PEDIDO #${escaparHtml(orden.id)}</div>
            <div class="customer">${escaparHtml(orden.cliente)}</div>
            <div class="order-info"><strong>${escaparHtml(labelData?.label || "Mesa")}</strong></div>
            ${orden.tipoEntrega === "table" && orden.mesa !== "-" ? `<div class="order-info"><strong>${escaparHtml(orden.mesa)}</strong></div>` : ""}
          </div>
          ${orden.notasGenerales ? `<div class="notes-block"><strong>OBSERVACIONES GENERALES:</strong><br>${escaparHtml(orden.notasGenerales)}</div>` : ""}
          <table>
            <thead><tr><th>CANT.</th><th>PRODUCTO</th><th>PRECIO</th></tr></thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          <div class="total">TOTAL: ${formatoPrecio(totalOrden)}</div>
          <div class="footer">
            <p>------- HECHO CON SISTEMA GLOTO -------</p>
            <p>------- FIN DE LA COMANDA -------</p>
          </div>
        </body>
      </html>
    `;

    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    iframe.onload = () => {
      iframe.contentWindow.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 100);
    };
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{
        opacity: { duration: 0.12 },
      }}
      className={`bg-[#0F0F0F] rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 border border-white/10`}
    >
      <div className="p-4">
        {/* Encabezado del Ticket */}
        <div className="flex justify-between items-center gap-3 mb-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`inline-flex max-w-full text-[14px] font-black uppercase px-2 py-0.5 rounded-xl border ${
                  colorData?.bg || "bg-white/5"
                } ${colorData?.border || "border-white/10"} ${
                  colorData?.text || "text-slate-500"
                }`}
              >
                {labelData?.label || "Mesa"}
                {orden.tipoEntrega === "table" && orden.mesa !== "-" && (
                  <span className="ml-1"> {orden.mesa}</span>
                )}
              </span>
              <p className="text-xs font-mono font-semibold text-white/50 truncate">
                #{orden.id}
              </p>
            </div>
            <h3 className="text-1xl font-black tracking-tight leading-tight truncate text-white pl-1">
              {orden.cliente}
            </h3>
          </div>

          <div className="flex items-center gap-2 self-center">
            <button
              onClick={handlePrint}
              className="flex items-center justify-center p-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-slate-500 hover:text-slate-300 transition-all border border-white/5"
              title="Imprimir comanda"
            >
              <Printer size={14} />
            </button>
          </div>
        </div>

        {/* NOTAS GENERALES DE LA ORDEN (Si existen) */}
        {orden.notasGenerales && (
          <div className="mb-3 p-2 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-start gap-2">
            <FileText
              size={12}
              className="text-amber-400 mt-0.5 flex-shrink-0"
            />
            <p className="text-[10px] text-amber-300/90 font-medium leading-normal">
              <span className="font-bold uppercase text-[10px] tracking-wider text-amber-400 block mb-0.5">
                {orden.notasGenerales}
              </span>
            </p>
          </div>
        )}

        {/* Listado de Productos */}
        <div className="space-y-2.5 mb-5 border-t border-b border-white/5 py-3">
          {(() => {
            const renderItem = (item, quantity, key, delivered = false) => {
              const initialPrice = Number(item.initPrice ?? item.price ?? 0);
              const displayAmount = initialPrice * Number(quantity || 0);

              return (
                <div
                  key={key}
                  className={`w-full text-left flex items-start gap-3 rounded-xl px-2.5 py-2 ${
                    delivered
                      ? "bg-white/[0.03] opacity-60"
                      : "bg-sky-500/[0.08] border border-sky-400/20"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`text-3xl font-black font-mono ${
                            delivered
                              ? "text-white/55 line-through"
                              : "text-white"
                          }`}
                        >
                          {quantity}
                        </span>
                        <p
                          className={`text-sm font-bold uppercase truncate ${
                            delivered
                              ? "text-white/55 line-through decoration-white/80 decoration-2"
                              : "text-white"
                          }`}
                        >
                          {item.name}
                        </p>
                      </div>

                      {initialPrice !== undefined && (
                        <span
                          className={`text-base font-black font-mono tracking-tight px-1.5 py-0.5 flex-shrink-0 ${
                            delivered
                              ? "text-white/45 line-through"
                              : "text-sky-200"
                          }`}
                        >
                          {new Intl.NumberFormat("es-CO", {
                            maximumFractionDigits: 0,
                          }).format(displayAmount)}
                        </span>
                      )}
                    </div>

                    {item.opciones?.length > 0 && (
                      <div className="mt-1 pl-5 space-y-0.5">
                        {item.opciones.map((opcion, optionIndex) => (
                          <p
                            key={`${key}-opcion-${optionIndex}`}
                            className={`text-[16px] font-mono ${
                              delivered
                                ? "text-sky-300/45 line-through"
                                : "text-sky-300/90"
                            }`}
                          >
                            • {formatOption(opcion)}
                          </p>
                        ))}
                      </div>
                    )}

                    {item.nota && (
                      <p
                        className={`text-[16px] font-mono mt-0.5 pl-5 ${
                          delivered
                            ? "text-yellow-300/45 line-through"
                            : "text-yellow-300/90"
                        }`}
                      >
                        *{item.nota}*
                      </p>
                    )}
                  </div>
                </div>
              );
            };

            const batches = Object.values(
              orden.items.reduce((groups, item) => {
                const key = item.batchId || "legacy";
                if (!groups[key]) {
                  groups[key] = {
                    sequence: item.batchSequence || Number.MAX_SAFE_INTEGER,
                    items: [],
                  };
                }
                groups[key].items.push(item);
                return groups;
              }, {}),
            ).sort((a, b) => b.sequence - a.sequence);

            return (
              <>
                {batches.map((batch, batchIndex) => {
                  const deliveredItems = batch.items.filter(
                    (item) => item.delivered,
                  );
                  const pendingItems = batch.items.filter(
                    (item) => !item.delivered,
                  );
                  return (
                    <div
                      key={`batch-${batchIndex}`}
                      className={`space-y-2 ${batchIndex > 0 ? "border-t border-sky-400/25 pt-3 mt-4" : ""}`}
                    >
                      {pendingItems.map((item, index) =>
                        renderItem(
                          item,
                          item.qty,
                          `pending-${batchIndex}-${index}`,
                        ),
                      )}
                      {deliveredItems.map((item, index) =>
                        renderItem(
                          item,
                          item.qty,
                          `delivered-${batchIndex}-${index}`,
                          true,
                        ),
                      )}
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>

        {/* Acciones de Flujo */}
        <div className="flex gap-2">
          {type !== "nuevos" && (
            <button
              onClick={onPrev}
              disabled={isBackwardLoading}
              className={`p-3 rounded-xl border transition-colors ${
                isBackwardLoading
                  ? "bg-white/[0.08] border-white/10 text-slate-500 cursor-not-allowed"
                  : "bg-white/5 hover:bg-white/10 text-slate-500 border-white/5"
              }`}
            >
              <span
                className={`inline-flex ${
                  isBackwardLoading
                    ? "animate-[spin_0.8s_linear_infinite_reverse]"
                    : ""
                }`}
              >
                <RotateCcw size={16} />
              </span>
            </button>
          )}
          <button
            onClick={onNext}
            disabled={isForwardLoading}
            className={`flex-1 py-3.5 rounded-xl font-black uppercase text-[10px] tracking-[0.1em] flex items-center justify-center gap-2 transition-all ${
              isForwardLoading
                ? "bg-white/[0.08] text-white/45 cursor-not-allowed"
                : type === "nuevos"
                  ? "bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/10"
                  : type === "preparando"
                    ? "bg-orange-600 hover:bg-orange-500"
                    : "bg-emerald-600 hover:bg-emerald-500"
            }`}
          >
            {isForwardLoading ? (
              <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            ) : (
              <>
                <span>
                  {type === "nuevos"
                    ? "INICIAR"
                    : type === "preparando"
                      ? "LISTO"
                      : "DESPACHAR"}
                </span>
                <ChevronRight size={14} strokeWidth={3} />
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
};
