// SeguimientoPedido.jsx
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  Clock,
  Flame,
  Bike,
  PackageCheck,
  Store,
  User,
  Phone,
  MapPin,
  Armchair,
  Navigation,
  X,
  Star,
} from "lucide-react";
import { supabase } from "../../../src/lib/supabaseClient";
import { useCart } from "./CartContext";

const fmt = (n) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

// Definición de cada posible etapa (icono + textos)
const DEFINICION_ETAPAS = {
  recibido: {
    label: "Pedido recibido",
    desc: "La tienda tiene tu pedido.",
    Icon: Clock,
  },
  preparando: {
    label: "Preparando",
    desc: "Tu pedido se está preparando.",
    Icon: Flame,
  },
  camino: {
    label: "En camino",
    desc: "Tu pedido va en camino.",
    Icon: Bike,
  },
  listo_recoger: {
    label: "Listo para recoger",
    desc: "Ya puedes pasar a recogerlo a la tienda.",
    Icon: Store,
  },
  listo_entregar: {
    label: "Listo para entregar",
    desc: "Tu pedido está listo y será llevado a su lugar.",
    Icon: PackageCheck,
  },
  entregado: {
    label: "Entregado",
    desc: "¡Disfruta tu pedido!",
    Icon: PackageCheck,
  },
};

// Secuencia de etapas según el método de entrega elegido por el cliente.
const ETAPAS_POR_ENTREGA = {
  recoger: ["recibido", "preparando", "listo_recoger"],
  mesa: ["recibido", "preparando", "listo_entregar"],
  domicilio: ["recibido", "preparando", "camino", "entregado"],
  punto: ["recibido", "preparando", "listo_entregar"],
};

const ENTREGA_LABEL = {
  recoger: "Recoger en tienda",
  mesa: "En mesa",
  domicilio: "Domicilio",
  punto: "Punto de encuentro",
};

const ORDER_TYPE_TO_METODO_ENTREGA = {
  delivery: "domicilio",
  pickup: "recoger",
  dine_in: "mesa",
};

const normalizeMetodoEntrega = (orderType, metadataMetodoEntrega) => {
  if (metadataMetodoEntrega) return metadataMetodoEntrega;
  if (!orderType) return "domicilio";
  return ORDER_TYPE_TO_METODO_ENTREGA[orderType] || orderType;
};

const mapOrderStatusToTrackingStatus = (status, metodoEntrega) => {
  if (!status || status === "pending" || status === "confirmed")
    return "recibido";
  if (status === "dispatched" && metodoEntrega === "recoger") {
    return "listo_recoger";
  }
  if (status === "dispatched" && ["mesa", "punto"].includes(metodoEntrega)) {
    return "listo_entregar";
  }
  if (["preparing", "complete", "completado", "dispatched"].includes(status)) {
    return "preparando";
  }
  if (status === "ready") {
    if (metodoEntrega === "domicilio") return "camino";
    if (metodoEntrega === "recoger") return "listo_recoger";
    return "listo_entregar";
  }
  if (status === "delivered") {
    return metodoEntrega === "punto" ? "listo_entregar" : "entregado";
  }
  return "recibido";
};

const SeguimientoPedido = ({ onCerrar }) => {
  const { pedidoActivo, estadoPedido, avanzarEstadoPedido, logoTienda } =
    useCart();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tokenParam = searchParams.get("token");
  const [fetchedPedido, setFetchedPedido] = useState(null);
  const [loadingPedido, setLoadingPedido] = useState(false);
  const [pedidoError, setPedidoError] = useState(null);
  const [calificacionTienda, setCalificacionTienda] = useState(0);
  const [guardandoCalificacion, setGuardandoCalificacion] = useState(false);
  const [calificacionEnviada, setCalificacionEnviada] = useState(false);

  const orderNumber = searchParams.get("order");
  const isRemoteTracking = Boolean(orderNumber && tokenParam);
  const pedido = isRemoteTracking
    ? fetchedPedido || pedidoActivo
    : pedidoActivo || fetchedPedido;

  useEffect(() => {
    if (!pedido) return;

    try {
      const metadataPedido =
        typeof pedido.metadata === "string"
          ? JSON.parse(pedido.metadata)
          : pedido.metadata || {};
      const valorGuardado = Number(metadataPedido?.calificacion?.valor || 0);

      if (valorGuardado > 0) {
        setCalificacionTienda(valorGuardado);
        setCalificacionEnviada(true);
      }
    } catch (error) {
      console.error("Error leyendo la calificación del pedido:", error);
    }
  }, [pedido]);

  useEffect(() => {
    if (!orderNumber || !tokenParam) return;

    const fetchPedido = async () => {
      setLoadingPedido(true);
      setPedidoError(null);
      try {
        // Consulta a través de una función SECURITY DEFINER: es la única
        // vía permitida para que un cliente anónimo lea un pedido, y
        // exige que order_number + token coincidan exactamente.
        const { data, error } = await supabase.rpc("get_order_by_token", {
          p_order_number: orderNumber,
          p_token: tokenParam,
        });

        if (error || !data) {
          setPedidoError(error?.message || "No se encontró el pedido.");
          setFetchedPedido(null);
        } else {
          const metodoEntrega = normalizeMetodoEntrega(
            data.order_type,
            data.metadata?.metodoEntrega,
          );
          const trackingStatus = mapOrderStatusToTrackingStatus(
            data.status,
            metodoEntrega,
          );

          let nombreTienda = data.metadata?.tiendaSlug || data.order_number;
          let slugTienda = data.metadata?.tiendaSlug || "";

          if (data.business_id) {
            const { data: negocioData, error: negocioError } = await supabase
              .from("businesses")
              .select("name, slug")
              .eq("id", data.business_id)
              .maybeSingle();

            if (!negocioError && negocioData?.name) {
              nombreTienda = negocioData.name;
            }

            if (!negocioError && negocioData?.slug) {
              slugTienda = negocioData.slug;
            }
          }

          const orderItems = data.order_items || [];
          const productIds = orderItems
            .map((item) => item.product_id)
            .filter(Boolean);
          let optionPricesByName = {};

          if (productIds.length > 0) {
            const { data: productOptions } = await supabase
              .from("products_items")
              .select("*")
              .in("product_id", productIds);

            (productOptions || []).forEach((option) => {
              const optionName = String(
                option.nombre ||
                  option.name ||
                  option.title ||
                  option.label ||
                  "",
              )
                .trim()
                .toLowerCase();
              if (!optionName) return;
              optionPricesByName[optionName] = Number(
                option.precio_extra ??
                  option.precioExtra ??
                  option.price_extra ??
                  option.extra_price ??
                  option.price ??
                  option.monto ??
                  0,
              );
            });
          }

          const paymentMethodsFromMetadata = data.metadata?.payment_methods;
          const metodoPagoFromMetadata =
            Array.isArray(paymentMethodsFromMetadata) &&
            paymentMethodsFromMetadata.length > 0
              ? paymentMethodsFromMetadata.map((item, index) => ({
                  id: `p${index}`,
                  metodo: item.metodo || item.method || "Desconocido",
                  monto: Number(item.monto) || 0,
                }))
              : [
                  {
                    id: "p0",
                    metodo: data.payment_method || "Desconocido",
                    monto: Number(data.total) || 0,
                  },
                ];

          setFetchedPedido({
            ...data,
            business_id: data.business_id || data.metadata?.business_id || null,
            numero: data.order_number,
            nombreTienda,
            slugTienda,
            businessWhatsapp: data.metadata?.business_whatsapp || "",
            rawStatus: data.status,
            status: trackingStatus,
            metodoEntrega,
            items: orderItems.map((item) => ({
              id: item.id,
              nombre: item.product_name,
              cantidad: item.quantity,
              precio: item.unit_price,
              notas: item.notes || "",
              opciones: (item.options || []).map((option) => {
                if (typeof option !== "string") return option;
                return {
                  nombre: option,
                  precioExtra:
                    optionPricesByName[option.trim().toLowerCase()] || 0,
                };
              }),
            })),
            metodoPago: metodoPagoFromMetadata,
            datosCliente: {
              nombre: data.customer_name || "",
              telefono: data.customer_phone || "",
              direccion: data.delivery_address || "",
              referencia: data.delivery_instructions || "",
              puntoRetiro: "",
              deliveryFee: Number(data.delivery_fee) || 0,
              propina: Number(data.tip_amount) || 0,
            },
            observaciones: data.notes || "",
          });
        }
      } catch (err) {
        setPedidoError("Error al cargar el pedido.");
        setFetchedPedido(null);
      } finally {
        setLoadingPedido(false);
      }
    };

    fetchPedido();
  }, [pedidoActivo, orderNumber]);

  const estadoPedidoActual = isRemoteTracking
    ? pedido?.status || "recibido"
    : pedidoActivo
      ? estadoPedido
      : pedido?.status || "recibido";

  const cerrar = () => {
    if (onCerrar) return onCerrar();

    const slugTienda =
      pedido?.slugTienda || pedido?.metadata?.tiendaSlug || pedido?.slug || "";

    if (slugTienda) {
      navigate(`/marketplace/tienda/${slugTienda}`);
      return;
    }

    navigate("/marketplace");
  };

  // Simulación de avance automático del estado del pedido (demo).
  // En producción, este estado debería actualizarse desde el backend/tienda.
  useEffect(() => {
    if (!pedidoActivo || isRemoteTracking) return;
    const secuencia =
      ETAPAS_POR_ENTREGA[pedidoActivo.metodoEntrega] ||
      ETAPAS_POR_ENTREGA.domicilio;
    if (estadoPedido === secuencia[secuencia.length - 1]) return;
    const t = setTimeout(() => avanzarEstadoPedido(), 9000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoPedido, pedidoActivo, isRemoteTracking]);

  if (loadingPedido) {
    return createPortal(
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#0a0a0a",
          color: "#fff",
          zIndex: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <span>Cargando pedido...</span>
      </div>,
      document.body,
    );
  }

  if (!pedido) {
    return createPortal(
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#0a0a0a",
          color: "#fff",
          zIndex: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", padding: "24px" }}>
          <p style={{ marginBottom: "16px", fontSize: "16px" }}>
            {pedidoError || "No se encontró el pedido."}
          </p>
          <button
            type="button"
            onClick={cerrar}
            style={{
              padding: "12px 20px",
              borderRadius: "999px",
              background: "#7c3aed",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Volver
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  const secuencia =
    ETAPAS_POR_ENTREGA[pedido.metodoEntrega] || ETAPAS_POR_ENTREGA.domicilio;
  const ETAPAS = secuencia.map((id) => ({ id, ...DEFINICION_ETAPAS[id] }));
  const indiceActual = ETAPAS.findIndex((e) => e.id === estadoPedidoActual);
  const esEtapaFinal = indiceActual === ETAPAS.length - 1;
  const { datosCliente, metodoEntrega, metodoPago } = pedido;

  const whatsappDestino = String(pedido?.businessWhatsapp || "").replace(
    /\D/g,
    "",
  );
  const tieneWhatsappDestino = Boolean(whatsappDestino);

  const handleCalificarTienda = async (valor) => {
    if (
      guardandoCalificacion ||
      calificacionEnviada ||
      valor === calificacionTienda
    ) {
      return;
    }

    setGuardandoCalificacion(true);
    setCalificacionTienda(valor);

    const businessId = pedido?.business_id || pedido?.metadata?.business_id;
    const orderId = pedido?.id;

    if (!businessId || !orderId) {
      setGuardandoCalificacion(false);
      return;
    }

    try {
      const metadataActual =
        typeof pedido.metadata === "string"
          ? JSON.parse(pedido.metadata)
          : pedido.metadata || {};

      const metadataActualizado = {
        ...metadataActual,
        calificacion: {
          valor,
          fecha: new Date().toISOString(),
          business_id: businessId,
        },
      };

      const { error: errorOrden } = await supabase
        .from("orders")
        .update({
          metadata: metadataActualizado,
        })
        .eq("id", orderId);

      if (errorOrden) throw errorOrden;

      const { data: infoActual, error: errorLectura } = await supabase
        .from("business_info")
        .select("rating, rating_count")
        .eq("business_id", businessId)
        .maybeSingle();

      const ratingActual = Number(infoActual?.rating || 0);
      const countActual = Number(infoActual?.rating_count || 0);
      const nuevoCount = countActual + 1;
      const nuevaCalificacion =
        countActual === 0
          ? Number(valor).toFixed(1)
          : ((ratingActual * countActual + Number(valor)) / nuevoCount).toFixed(
              1,
            );

      if (!errorLectura && infoActual) {
        await supabase
          .from("business_info")
          .update({
            rating: nuevaCalificacion,
            rating_count: nuevoCount,
            updated_at: new Date().toISOString(),
          })
          .eq("business_id", businessId);
      } else {
        await supabase.from("business_info").upsert(
          {
            business_id: businessId,
            rating: Number(valor).toFixed(1),
            rating_count: 1,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "business_id" },
        );
      }

      setCalificacionEnviada(true);
      setFetchedPedido((prev) =>
        prev
          ? {
              ...prev,
              metadata: metadataActualizado,
            }
          : prev,
      );
    } catch (error) {
      console.error("Error al guardar la calificación:", error);
    } finally {
      setGuardandoCalificacion(false);
    }
  };

  const irAWppTienda = () => {
    if (typeof window === "undefined" || !tieneWhatsappDestino) return;
    window.open(`https://wa.me/${whatsappDestino}`, "_blank");
    cerrar();
  };

  const obtenerPasos = (metodo) => {
    const base = ["Pedido recibido", "Preparando"];

    switch (metodo) {
      case "recoger":
        return [...base, "Listo para recoger"];
      case "mesa":
        return [...base, "Listo para entregar", "Entregado"];
      case "domicilio":
        return [...base, "En camino", "Entregado"];
      case "punto":
        return [...base, "Listo para entregar", "Entregado"];
      default:
        return base;
    }
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0a0a0a",
        color: "#fff",
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          padding: "16px 20px",
          borderBottom: "1px solid #1a1a1a",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={cerrar}
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
          aria-label="Cerrar seguimiento"
        >
          <Store size={18} color="#fff" />
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginLeft: "auto",
          }}
        >
          <div style={{ textAlign: "right", minWidth: 0 }}>
            <h2 style={{ fontSize: "16px", fontWeight: 800, margin: 0 }}>
              PEDIDO Nº: {pedido.numero}
            </h2>
            <p
              style={{
                fontSize: "12px",
                color: "rgba(255,255,255,0.45)",
                margin: 0,
              }}
            >
              {pedido.nombreTienda}
            </p>
          </div>

          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "12px",
              background: "#131313",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {logoTienda ? (
              <img
                src={logoTienda}
                alt={`Logo de ${pedido.nombreTienda}`}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = "/default.png";
                }}
              />
            ) : (
              <Store size={24} style={{ color: "rgba(255,255,255,0.3)" }} />
            )}
          </div>
        </div>
      </div>

      {/* Cuerpo */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px" }}>
        {/* Línea de tiempo */}
        <div style={{ marginBottom: "28px" }}>
          {ETAPAS.map((etapa, i) => {
            const completada = i < indiceActual;
            const activa = i === indiceActual;
            const pendiente = i > indiceActual;
            const Icon = etapa.Icon;

            return (
              <div
                key={etapa.id}
                style={{ display: "flex", gap: "14px", position: "relative" }}
              >
                {/* Columna icono + línea */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: completada
                        ? "rgba(124,58,237,0.18)"
                        : activa
                          ? "#7c3aed"
                          : "#131313",
                      border: pendiente
                        ? "1px solid rgba(255,255,255,0.08)"
                        : "none",
                      boxShadow: activa
                        ? "0 0 0 4px rgba(124,58,237,0.18)"
                        : "none",
                      transition: "all 0.3s",
                    }}
                  >
                    {completada ? (
                      <CheckCircle2 size={18} color="#a78bfa" />
                    ) : (
                      <Icon
                        size={18}
                        color={activa ? "#fff" : "rgba(255,255,255,0.3)"}
                      />
                    )}
                  </div>
                  {i < ETAPAS.length - 1 && (
                    <div
                      style={{
                        width: "2px",
                        flex: 1,
                        minHeight: "32px",
                        background:
                          i < indiceActual
                            ? "#7c3aed"
                            : "rgba(255,255,255,0.08)",
                        margin: "2px 0",
                      }}
                    />
                  )}
                </div>

                {/* Texto */}
                <div style={{ paddingBottom: "28px" }}>
                  <p
                    style={{
                      fontSize: "14px",
                      fontWeight: 800,
                      margin: 0,
                      marginBottom: "2px",
                      color: pendiente ? "rgba(255,255,255,0.35)" : "#fff",
                    }}
                  >
                    {etapa.label}
                  </p>
                  <p
                    style={{
                      fontSize: "12px",
                      margin: 0,
                      color: pendiente
                        ? "rgba(255,255,255,0.25)"
                        : "rgba(255,255,255,0.45)",
                    }}
                  >
                    {activa ? etapa.desc : pendiente ? "Pendiente" : etapa.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Datos de entrega */}
        <div
          style={{
            background: "#131313",
            borderRadius: "16px",
            border: "1px solid rgba(255,255,255,0.06)",
            padding: "16px",
            marginBottom: "16px",
          }}
        >
          <p
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "rgba(255,255,255,0.7)",
              marginBottom: "12px",
            }}
          >
            {ENTREGA_LABEL[metodoEntrega] || "Entrega"}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <User size={14} color="rgba(255,255,255,0.4)" />
              <span style={{ fontSize: "13px" }}>{datosCliente?.nombre}</span>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <Phone size={14} color="rgba(255,255,255,0.4)" />
              <span style={{ fontSize: "13px" }}>{datosCliente?.telefono}</span>
            </div>
            {metodoEntrega === "mesa" && datosCliente?.mesa && (
              <div
                style={{ display: "flex", gap: "8px", alignItems: "center" }}
              >
                <Armchair size={14} color="rgba(255,255,255,0.4)" />
                <span style={{ fontSize: "13px" }}>
                  Mesa {datosCliente.mesa}
                </span>
              </div>
            )}
            {metodoEntrega === "domicilio" && datosCliente?.direccion && (
              <div
                style={{ display: "flex", gap: "8px", alignItems: "center" }}
              >
                <MapPin size={14} color="rgba(255,255,255,0.4)" />
                <span style={{ fontSize: "13px" }}>
                  {datosCliente.direccion}
                </span>
              </div>
            )}
            {metodoEntrega === "domicilio" &&
              (datosCliente?.referencia || datosCliente?.puntoRetiro) && (
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    alignItems: "center",
                    marginTop: "6px",
                  }}
                >
                  <Navigation size={14} color="rgba(255,255,255,0.4)" />
                  <span style={{ fontSize: "13px" }}>
                    {datosCliente.referencia || datosCliente.puntoRetiro}
                  </span>
                </div>
              )}
            {metodoEntrega === "punto" && datosCliente?.puntoRetiro && (
              <div
                style={{ display: "flex", gap: "8px", alignItems: "center" }}
              >
                <Navigation size={14} color="rgba(255,255,255,0.4)" />
                <span style={{ fontSize: "13px" }}>
                  {datosCliente.puntoRetiro}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Resumen del pedido */}
        <div
          style={{
            background: "#131313",
            borderRadius: "16px",
            border: "1px solid rgba(255,255,255,0.06)",
            padding: "16px",
          }}
        >
          <p
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "rgba(255,255,255,0.7)",
              marginBottom: "12px",
            }}
          >
            Tu pedido
          </p>

          {pedido.items.map((it) => (
            <div
              key={it.id}
              style={{
                marginBottom: "10px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "10px",
                  fontSize: "13px",
                }}
              >
                <span style={{ color: "rgba(255,255,255,0.8)" }}>
                  {it.cantidad}× {it.nombre}
                </span>
                <span style={{ fontWeight: 700, flexShrink: 0 }}>
                  {fmt(it.precio * it.cantidad)}
                </span>
              </div>

              {it.opciones && it.opciones.length > 0 && (
                <div
                  style={{
                    marginTop: "8px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  {it.opciones.map((opt, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: "12px",
                        color: "rgba(255,255,255,0.75)",
                        paddingLeft: "6px",
                      }}
                    >
                      •{" "}
                      {typeof opt === "string"
                        ? opt
                        : opt?.nombre || opt?.name || "Opción"}
                      {Number(
                        typeof opt === "string"
                          ? 0
                          : (opt?.precioExtra ??
                              opt?.price_extra ??
                              opt?.extra_price ??
                              0),
                      ) > 0 && (
                        <span style={{ marginLeft: "4px", fontWeight: 700 }}>
                          +
                          {fmt(
                            Number(
                              opt.precioExtra ??
                                opt.price_extra ??
                                opt.extra_price ??
                                0,
                            ),
                          )}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {it.notas && (
                <p
                  style={{
                    fontSize: "11.5px",
                    color: "rgba(255, 255, 255, 0.4)",
                    margin: "3px 0 0",
                    lineHeight: 1.4,
                  }}
                >
                  Indicaciones: "{it.notas}"
                </p>
              )}
            </div>
          ))}

          {pedido.observaciones && (
            <div
              style={{
                marginTop: "12px",
                paddingTop: "12px",
                borderTop: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.5)",
                  marginBottom: "4px",
                }}
              >
                Observaciones generales
              </p>
              <p
                style={{
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.45)",
                  fontStyle: "italic",
                  margin: 0,
                }}
              >
                "{pedido.observaciones}"
              </p>
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "14px",
              paddingTop: "14px",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              fontSize: "14px",
              fontWeight: 800,
            }}
          >
            <span>Total</span>
            <span>{fmt(pedido.total)}</span>
          </div>
        </div>

        {/* Información de pago */}
        <div
          style={{
            background: "#131313",
            borderRadius: "16px",
            border: "1px solid rgba(255,255,255,0.06)",
            padding: "16px",
            marginTop: "16px",
          }}
        >
          <p
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "rgba(255,255,255,0.7)",
              marginBottom: "12px",
            }}
          >
            Método(s) de pago
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {metodoPago && metodoPago.length > 1 ? (
              metodoPago.map((m) => (
                <div
                  key={m.id}
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span style={{ fontSize: "13px" }}>{m.metodo || "-"}</span>
                  <span style={{ fontSize: "13px", fontWeight: 800 }}>
                    {fmt(Number(m.monto) || 0)}
                  </span>
                </div>
              ))
            ) : metodoPago && metodoPago.length === 1 ? (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "13px" }}>
                  {metodoPago[0].metodo || "-"}
                </span>
                <span style={{ fontSize: "13px", fontWeight: 800 }}>
                  {fmt(Number(metodoPago[0].monto) || pedido.total)}
                </span>
              </div>
            ) : (
              <div
                style={{ color: "rgba(255,255,255,0.45)", fontSize: "13px" }}
              >
                No especificado
              </div>
            )}

            {/* Delivery y propina si existen */}
            {Number(pedido.datosCliente?.deliveryFee) > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "13px" }}>Costo de domicilio</span>
                <span style={{ fontSize: "13px", fontWeight: 800 }}>
                  {fmt(Number(pedido.datosCliente.deliveryFee) || 0)}
                </span>
              </div>
            )}

            {Number(pedido.datosCliente?.propina) > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "13px" }}>Propina</span>
                <span style={{ fontSize: "13px", fontWeight: 800 }}>
                  {fmt(Number(pedido.datosCliente.propina) || 0)}
                </span>
              </div>
            )}
          </div>
        </div>

        {!calificacionEnviada ? (
          <div
            style={{
              background: "#131313",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "16px",
              padding: "14px 12px 12px",
              marginTop: "16px",
            }}
          >
            <p
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "rgba(255,255,255,0.7)",
                margin: "0 0 10px",
                textAlign: "center",
              }}
            >
              ¿Cómo calificarías a {pedido?.nombreTienda || "esta tienda"}?
            </p>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                marginBottom: "8px",
              }}
            >
              {[1, 2, 3, 4, 5].map((estrella) => {
                const activa = estrella <= calificacionTienda;

                return (
                  <button
                    key={estrella}
                    type="button"
                    onClick={() => handleCalificarTienda(estrella)}
                    disabled={guardandoCalificacion}
                    aria-label={`Calificar con ${estrella} estrella${estrella > 1 ? "s" : ""}`}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: guardandoCalificacion ? "default" : "pointer",
                      opacity: guardandoCalificacion && !activa ? 0.7 : 1,
                      transition: "transform 0.15s ease",
                    }}
                  >
                    <Star
                      size={28}
                      fill={activa ? "#fbbf24" : "transparent"}
                      stroke={activa ? "#fbbf24" : "rgba(255,255,255,0.35)"}
                      strokeWidth={1.8}
                      style={{
                        transform: activa ? "scale(1.04)" : "scale(1)",
                      }}
                    />
                  </button>
                );
              })}
            </div>

            {calificacionTienda > 0 && (
              <p
                style={{
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.7)",
                  margin: 0,
                  textAlign: "center",
                }}
              >
                {guardandoCalificacion
                  ? "Enviando calificación..."
                  : `Gracias por calificar con ${calificacionTienda}/5`}
              </p>
            )}
          </div>
        ) : (
          <div
            style={{
              background: "#131313",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "16px",
              padding: "16px 12px",
              marginTop: "16px",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontSize: "14px",
                fontWeight: 700,
                color: "rgba(255,255,255,0.9)",
                margin: 0,
              }}
            >
              ¡Gracias por tu calificación!
            </p>
          </div>
        )}
      </div>

      {/* Footer: siempre visible, sin importar en qué paso esté la línea de tiempo */}
      <div
        style={{
          padding: "16px 20px",
          paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
          borderTop: "1px solid #1a1a1a",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={irAWppTienda}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "100px",
            background: "#7c3aed",
            color: "#fff",
            fontWeight: 800,
            fontSize: "14px",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            boxShadow: "0 8px 32px rgba(124,58,237,0.45)",
          }}
        >
          <Store size={18} />
          Comunicarme con la tienda
        </button>
      </div>
    </div>,
    document.body,
  );
};

export default SeguimientoPedido;
