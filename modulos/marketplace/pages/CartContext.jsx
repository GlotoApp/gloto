// CartContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../../src/lib/supabaseClient";

const CartContext = createContext(null);
const CART_STORAGE_KEY = "gloto_marketplace_cart_v1";

const leerCarritoPersistido = () => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const CartProvider = ({ children }) => {
  const carritoPersistido = useMemo(() => leerCarritoPersistido(), []);

  // carrito: { [productoId]: cantidad }
  const [carrito, setCarrito] = useState(carritoPersistido?.carrito || {});
  // Catálogo de productos actualmente "activo" (de la tienda que se está viendo).
  // Carrito.jsx lo necesita para mostrar nombre, precio, emoji, etc.
  const [productos, setProductos] = useState(
    carritoPersistido?.productos || [],
  );
  const [nombreTienda, setNombreTienda] = useState(
    carritoPersistido?.nombreTienda || "",
  );
  const [logoTienda, setLogoTienda] = useState(
    carritoPersistido?.logoTienda || "",
  );
  const [tiendaSlug, setTiendaSlug] = useState(
    carritoPersistido?.tiendaSlug || null,
  );
  const [businessId, setBusinessId] = useState(
    carritoPersistido?.businessId || null,
  );
  const [businessWhatsapp, setBusinessWhatsapp] = useState(
    carritoPersistido?.businessWhatsapp || "",
  );
  const [cartOpen, setCartOpen] = useState(false);
  const [observaciones, setObservaciones] = useState("");
  const [metodoPago, setMetodoPago] = useState([]);
  const [metodoEntrega, setMetodoEntrega] = useState(null); // 'recoger', 'mesa', 'domicilio', 'punto'
  const [datosCliente, setDatosCliente] = useState({
    nombre: "",
    telefono: "",
    mesa: "",
    direccion: "",
    puntoRetiro: "",
  });
  // Pedido ya confirmado, pendiente de seguimiento (cocina → camino → entregado)
  const [pedidoActivo, setPedidoActivo] = useState(null);
  // 'recibido' | 'preparando' | 'camino' | 'entregado'
  const [estadoPedido, setEstadoPedido] = useState("recibido");

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify({
          carrito,
          productos,
          nombreTienda,
          logoTienda,
          tiendaSlug,
          businessId,
          businessWhatsapp,
        }),
      );
    } catch {
      // Si el almacenamiento no está disponible, no rompemos la experiencia.
    }
  }, [
    carrito,
    productos,
    nombreTienda,
    logoTienda,
    tiendaSlug,
    businessId,
    businessWhatsapp,
  ]);

  const agregar = (id) =>
    setCarrito((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));

  const quitar = (id) =>
    setCarrito((prev) => {
      const next = { ...prev };
      if (!next[id]) return prev;
      if (next[id] > 1) next[id]--;
      else delete next[id];
      return next;
    });

  const eliminar = (id) =>
    setCarrito((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const vaciar = () => setCarrito({});

  const vaciarTodo = () => {
    setCarrito({});
    setObservaciones("");
    setMetodoPago([]);
    setMetodoEntrega(null);
    setDatosCliente({
      nombre: "",
      telefono: "",
      mesa: "",
      direccion: "",
      puntoRetiro: "",
    });
  };

  const abrirCarrito = () => setCartOpen(true);
  const cerrarCarrito = () => setCartOpen(false);

  const totalItems = useMemo(
    () => Object.values(carrito).reduce((a, b) => a + b, 0),
    [carrito],
  );

  const totalPrecio = useMemo(
    () =>
      productos.reduce((sum, p) => sum + (carrito[p.id] || 0) * p.precio, 0),
    [productos, carrito],
  );

  const itemsAgotados = useMemo(
    () =>
      productos.filter(
        (producto) =>
          carrito[producto.id] > 0 && producto.isAvailable === false,
      ),
    [productos, carrito],
  );

  const totalPagado = metodoPago.reduce(
    (sum, item) => sum + (Number(item.monto) || 0),
    0,
  );
  const puedeHacerPedido =
    totalItems > 0 &&
    itemsAgotados.length === 0 &&
    metodoPago.length > 0 &&
    totalPagado === totalPrecio;

  const agregarDivision = () => {
    setMetodoPago((prev) => {
      // Si el array está vacío o solo tiene 1 elemento (pago único),
      // forzamos la creación del par inicial con método vacío.
      if (prev.length <= 1) {
        return [
          { id: Date.now(), metodo: "", monto: "" }, // Metodo vacío
          { id: Date.now() + 1, metodo: "", monto: "" }, // Metodo vacío
        ];
      }
      // Si ya estábamos en modo dividir, solo añadimos una fila vacía extra
      return [...prev, { id: Date.now(), metodo: "", monto: "" }];
    });
  };

  const eliminarDivision = (id) => {
    setMetodoPago((prev) => prev.filter((item) => item.id !== id));
  };

  const actualizarDivision = (id, campo, valor) => {
    setMetodoPago((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [campo]: valor } : item)),
    );
  };

  // Hash corto y estable para distinguir notas distintas del mismo producto/variante
  const hashCorto = (str) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h).toString(36);
  };

  // Resuelve la clave (id) que identifica una línea del carrito para un
  // producto dado, según su variante y notas.
  //
  // CLAVE: si no hay variante ni notas, la clave es simplemente el id del
  // producto base — la MISMA clave que usa el botón "+" directo en Shop.jsx
  // (agregar(producto.id)). Esto es lo que mantiene sincronizados el
  // contador de la lista de productos y el contador del detalle: agregar
  // "liso" desde cualquiera de los dos lugares suma sobre la misma línea.
  // Solo cuando el usuario elige una variante o escribe una nota se crea
  // una línea distinta (porque de verdad es un pedido distinto).
  const obtenerItemId = (productoId, variante, notas = "") => {
    const notasLimpias = (notas || "").trim();
    if (!variante && !notasLimpias) return productoId;
    const varianteKey = variante ? variante.id : "base";
    const notasKey = notasLimpias ? hashCorto(notasLimpias.toLowerCase()) : "0";
    return `${productoId}__${varianteKey}__${notasKey}`;
  };

  // Agrega un producto al carrito respetando variante (ej. tamaño) y notas/indicaciones.
  // Crea (o reutiliza) un "producto virtual" en `productos` para no romper la lógica
  // existente de Carrito.jsx, que indexa todo por producto.id.
  const agregarConVariante = ({
    productoBase,
    variante,
    notas = "",
    cantidad = 1,
  }) => {
    const itemId = obtenerItemId(productoBase.id, variante, notas);
    const precioBase = Number(productoBase.precio) || 0;
    const precioExtraTotal = Number(variante?.precioExtra || 0);

    setProductos((prev) => {
      if (prev.some((p) => p.id === itemId)) return prev;
      const opcionesSeleccionadas = Array.isArray(variante?.opciones)
        ? variante.opciones.map((opt) => ({
            id: opt.id,
            nombre: opt.nombre,
            precioExtra: Number(opt.precioExtra) || 0,
          }))
        : variante
          ? [{ nombre: variante.nombre, precioExtra: precioExtraTotal }]
          : [];

      const nuevo = {
        ...productoBase,
        id: itemId,
        productoBaseId: productoBase.id,
        nombre: variante
          ? `${productoBase.nombre} · ${variante.nombre}`
          : productoBase.nombre,
        precioBase,
        precioExtraTotal,
        precio: precioBase + precioExtraTotal,
        varianteNombre: variante?.nombre || null,
        opciones: opcionesSeleccionadas,
        notas: notas.trim(),
      };
      return [...prev, nuevo];
    });

    setCarrito((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] || 0) + cantidad,
    }));
  };

  const generarUuid = () =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });

  const generarNumeroPedido = (telefono = "") => {
    const ahora = new Date();
    const pad = (value, length = 2) => String(value).padStart(length, "0");

    const year = pad(ahora.getFullYear() % 100);
    const month = pad(ahora.getMonth() + 1);
    const day = pad(ahora.getDate());
    const hours = pad(ahora.getHours());
    const minutes = pad(ahora.getMinutes());
    const seconds = pad(ahora.getSeconds());

    const telefonoSoloNumeros = String(telefono).replace(/\D/g, "");
    const ultimosTres = telefonoSoloNumeros.slice(-3).padStart(3, "0");

    return `${year}${month}${day}${hours}${minutes}${seconds}${ultimosTres}`;
  };

  const normalizeWhatsappNumber = (value) => {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("57")) return digits;
    return `57${digits.replace(/^0+/, "")}`;
  };

  // Crea un pedido a partir del carrito actual (snapshot) y lo deja
  // listo para el seguimiento en pantalla.
  const crearPedido = async () => {
    const items = productos
      .filter((p) => carrito[p.id] > 0)
      .map((p) => {
        const baseNombre = String(p.nombre || "").split(" · ")[0];
        return {
          id: p.id,
          productId: p.productoBaseId || p.id,
          nombre: baseNombre,
          cantidad: carrito[p.id],
          precio: p.precio,
          notas: p.notas || "",
          varianteNombre: p.varianteNombre || null,
          opciones: p.varianteNombre
            ? String(p.varianteNombre).split(" · ") || []
            : [],
        };
      });

    const orderNumber = generarNumeroPedido(datosCliente.telefono);
    const deliveryFee = Number(datosCliente.deliveryFee) || 0;
    const tipAmount = Number(datosCliente.propina) || 0;
    const paymentMethod = metodoPago
      .map((item) => (item.metodo || "desconocido").toString().trim())
      .filter(Boolean)
      .map((m) => m.toLowerCase())
      .join(", ");
    const paymentStatus = totalPagado === totalPrecio ? "paid" : "pending";
    const orderStatus = paymentStatus === "paid" ? "confirmed" : "pending";
    const orderTypeMap = {
      domicilio: "delivery",
      recoger: "pickup",
      mesa: "table",
      punto: "dine_in",
    };
    const orderType = orderTypeMap[metodoEntrega] || "pickup";

    const trackingToken = generarUuid();

    const pedido = {
      numero: orderNumber,
      trackingToken,
      fecha: new Date(),
      items,
      total: totalPrecio,
      metodoEntrega,
      metodoPago,
      datosCliente: { ...datosCliente },
      observaciones,
      nombreTienda,
      businessWhatsapp,
    };

    const orderPayload = {
      business_id: businessId,
      status: orderStatus,
      total: totalPrecio,
      order_number: orderNumber,
      updated_at: new Date().toISOString(),
      scheduled_at: null,
      delivery_address: datosCliente.direccion || null,
      delivery_instructions:
        metodoEntrega === "punto"
          ? null
          : datosCliente.referencia || datosCliente.puntoRetiro || null,
      delivery_fee: deliveryFee,
      tax_amount: 0,
      discount_amount: 0,
      tip_amount: tipAmount,
      payment_method: paymentMethod || null,
      payment_status: paymentStatus,
      order_type: orderType,
      customer_name: datosCliente.nombre || null,
      customer_phone: datosCliente.telefono || null,
      currency: "COP",
      mesa:
        metodoEntrega === "mesa"
          ? datosCliente.mesa
            ? Number(datosCliente.mesa)
            : null
          : null,
      punto:
        metodoEntrega === "punto" ? datosCliente.puntoRetiro || null : null,
      notes: observaciones || null,
      metadata: {
        tiendaSlug,
        canal: "marketplace",
        createdFrom: "web_app",
        metodoEntrega,
        tracking_token: trackingToken,
        business_whatsapp: normalizeWhatsappNumber(businessWhatsapp) || null,
        payment_methods: metodoPago
          .filter(
            (item) =>
              (item.metodo && String(item.metodo).trim()) ||
              Number(item.monto) > 0,
          )
          .map((item) => ({
            metodo: (item.metodo || "desconocido")
              .toString()
              .trim()
              .toLowerCase(),
            monto: Number(item.monto) || 0,
          })),
        cliente: {
          nombre: datosCliente.nombre || null,
          telefono: datosCliente.telefono
            ? String(datosCliente.telefono).replace(/\D/g, "")
            : null,
          direccion: datosCliente.direccion || null,
          referencia:
            metodoEntrega === "punto"
              ? null
              : datosCliente.referencia || datosCliente.puntoRetiro || null,
        },
      },
    };

    let savedOrderId = null;
    try {
      // orderItemsPayload va sin `order_id`: la función lo asigna del
      // lado del servidor una vez crea la orden, en la misma transacción.
      const orderItemsPayload = items.map((item) => ({
        product_id: item.productId,
        quantity: item.cantidad,
        unit_price: item.precio,
        subtotal: item.precio * item.cantidad,
        product_name: item.nombre,
        product_sku: item.product_sku || null,
        unit_name: item.unit_name || "unidad",
        options: item.opciones || [],
        notes: item.notas || null,
      }));

      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "create_order_with_inventory",
        {
          p_order: orderPayload,
          p_items: orderItemsPayload,
          p_channel: "shop",
        },
      );

      if (rpcError) {
        console.error("Error guardando orden en Supabase:", rpcError);
        const isUnavailable = rpcError.message?.includes("PRODUCT_UNAVAILABLE");
        throw new Error(
          isUnavailable
            ? "Este producto se agotó mientras estaba en tu carrito."
            : rpcError.message || "No se pudo guardar el pedido en Supabase.",
        );
      }
      savedOrderId = rpcData?.id;
    } catch (error) {
      console.error("Error guardando orden en Supabase:", error);
      throw error;
    }

    // Construir mensaje legible para WhatsApp
    try {
      const fmt = (n) =>
        new Intl.NumberFormat("es-CO", {
          style: "currency",
          currency: "COP",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(n);

      const fecha = pedido.fecha.toLocaleDateString("es-CO");
      const hora = pedido.fecha.toLocaleTimeString("es-CO");

      const tipoLabel =
        pedido.metodoEntrega === "domicilio"
          ? "*DOMICILIO*"
          : pedido.metodoEntrega === "recoger"
            ? "*RECOGER EN TIENDA*"
            : pedido.metodoEntrega === "mesa"
              ? "*MESA*"
              : "*EN PUNTO*";

      const lines = [];
      lines.push(tipoLabel);
      lines.push("");
      lines.push(`*PEDIDO Nº:* ${pedido.numero}`);
      lines.push("");
      lines.push(`*FECHA:* ${fecha}`);
      lines.push(`*HORA:* ${hora}`);
      lines.push("");
      lines.push(`*DATOS DEL USUARIO:*`);
      lines.push(`*NOMBRE:* ${pedido.datosCliente.nombre || "-"}`);
      lines.push(`*TELÉFONO:* ${pedido.datosCliente.telefono || "-"}`);
      lines.push("");

      if (pedido.metodoEntrega === "domicilio") {
        lines.push(`*DIRECCIÓN:* ${pedido.datosCliente.direccion || "-"}`);
        // El campo de punto de referencia en el checkout se llama `referencia`.
        const referencia =
          pedido.datosCliente.referencia || pedido.datosCliente.puntoRetiro;
        if (referencia) lines.push(`*PUNTO DE REFERENCIA:* ${referencia}`);
        lines.push("");
      }

      if (pedido.metodoEntrega === "mesa") {
        lines.push(`*MESA:* ${pedido.datosCliente.mesa || "-"}`);
        lines.push("");
      }

      if (pedido.metodoEntrega === "punto") {
        lines.push(`*PUNTO:* ${pedido.datosCliente.puntoRetiro || "-"}`);
        lines.push("");
      }

      lines.push(`*PRODUCTOS SELECCIONADOS:*`);
      lines.push("");

      pedido.items.forEach((it) => {
        lines.push(
          `*x${it.cantidad} - ${it.nombre} - ${fmt(it.precio)} = ${fmt(
            it.precio * it.cantidad,
          )}*`,
        );

        // Incluir opciones seleccionadas por el usuario (lista vertical)
        if (it.opciones && it.opciones.length > 0) {
          it.opciones.forEach((opt) => {
            lines.push(`• ${opt}`);
          });
        }

        // Incluir indicaciones/notas específicas del producto si existen
        if (it.notas) {
          lines.push(`_${it.notas}_`);
        }

        lines.push("__");
      });

      lines.push("");
      lines.push(`*TOTAL PRODUCTOS:* ${fmt(pedido.total)}`);

      // Si hay costo de delivery en datosCliente (opcional), lo mostramos
      if (pedido.datosCliente.deliveryFee) {
        lines.push(
          `*COSTO DE DOMICILIO:* ${fmt(Number(pedido.datosCliente.deliveryFee) || 0)}`,
        );
      }

      lines.push("");

      // Método(s) de pago
      if (metodoPago && metodoPago.length > 1) {
        lines.push(`*MÉTODO DE PAGO:*`);
        metodoPago.forEach((m) => {
          const montoNum = Number(m.monto) || 0;
          lines.push(`${m.metodo || "-"}: ${fmt(montoNum)}`);
        });
      } else {
        const single =
          metodoPago && metodoPago.length === 1 ? metodoPago[0] : null;
        const singleMetodo = single ? single.metodo || "-" : "-";
        const singleMonto = single
          ? fmt(Number(single.monto) || pedido.total)
          : "-";
        lines.push(`*MÉTODO DE PAGO:* ${singleMetodo}: ${singleMonto}`);
      }
      lines.push("");

      // Propina opcional si existe
      if (pedido.datosCliente.propina) {
        const prop = Number(pedido.datosCliente.propina) || 0;
        lines.push(`*PROPINA VOLUNTARIA:* ${fmt(prop)}`);
        lines.push(`*TOTAL CON PROPINA:* ${fmt(pedido.total + prop)}`);
        lines.push("");
      }

      lines.push(`*OBSERVACIONES:*`);
      lines.push(pedido.observaciones || "__");
      lines.push("");

      // Ubicación en Google Maps si lat/lng disponibles
      if (pedido.datosCliente.lat && pedido.datosCliente.lng) {
        lines.push(`*Ubicación en Google Maps:*`);
        lines.push(
          `https://www.google.com/maps?q=${pedido.datosCliente.lat},${pedido.datosCliente.lng}`,
        );
        lines.push("");
      }

      const trackingLink =
        typeof window !== "undefined"
          ? `${window.location.origin}/marketplace/seguimiento?order=${encodeURIComponent(
              pedido.numero,
            )}&token=${encodeURIComponent(pedido.trackingToken)}`
          : "";

      lines.push(`\n*Rastrea tu pedido:* ${trackingLink}`);
      lines.push("\n\n\n\n*Envía tu pedido aqui --------->*");

      const message = lines.join("\n");
      const whatsappDestino = normalizeWhatsappNumber(businessWhatsapp);

      if (whatsappDestino && typeof window !== "undefined") {
        const url = `https://wa.me/${whatsappDestino}?text=${encodeURIComponent(
          message,
        )}`;
        window.open(url, "_blank");
      }
    } catch (err) {
      // no rompemos el flujo si algo falla al construir/enviar el mensaje
      // (por ejemplo en SSR o navegadores sin window)
      // console.warn(err);
    }

    setPedidoActivo(pedido);
    setEstadoPedido("recibido");
    vaciarTodo();
    setMetodoEntrega(null);

    return pedido;
  };

  // Etapas disponibles por método de entrega. El pedido nunca pasa por "camino"
  // si es recoger/mesa, ni se queda en "listo" si es domicilio.
  const ETAPAS_POR_ENTREGA = {
    recoger: ["recibido", "preparando", "listo_recoger"],
    mesa: ["recibido", "preparando", "listo_entregar"],
    domicilio: ["recibido", "preparando", "camino", "entregado"],
    punto: ["recibido", "preparando", "listo_entregar", "entregado"],
  };

  const avanzarEstadoPedido = () => {
    setEstadoPedido((prev) => {
      const orden =
        ETAPAS_POR_ENTREGA[pedidoActivo?.metodoEntrega] ||
        ETAPAS_POR_ENTREGA.domicilio;
      const i = orden.indexOf(prev);
      if (i === -1 || i === orden.length - 1) return prev;
      return orden[i + 1];
    });
  };

  const finalizarPedido = () => {
    setPedidoActivo(null);
    setEstadoPedido("recibido");
  };

  const actualizarDatoCliente = (campo, valor) =>
    setDatosCliente((prev) => ({ ...prev, [campo]: valor }));

  const puedeConfirmarEntrega = (() => {
    if (!metodoEntrega) return false;
    if (!datosCliente.nombre.trim() || !datosCliente.telefono.trim())
      return false;
    if (metodoEntrega === "mesa" && !datosCliente.mesa.trim()) return false;
    if (metodoEntrega === "domicilio" && !datosCliente.direccion.trim())
      return false;
    if (metodoEntrega === "punto" && !datosCliente.puntoRetiro.trim())
      return false;
    return true;
  })();

  const value = {
    carrito,
    productos,
    setProductos,
    nombreTienda,
    setNombreTienda,
    logoTienda,
    setLogoTienda,
    tiendaSlug,
    setTiendaSlug,
    businessId,
    setBusinessId,
    businessWhatsapp,
    itemsAgotados,
    setBusinessWhatsapp,
    cartOpen,
    abrirCarrito,
    cerrarCarrito,
    agregar,
    quitar,
    eliminar,
    vaciar,
    vaciarTodo,
    observaciones,
    setObservaciones,
    metodoPago,
    agregarDivision,
    eliminarDivision,
    actualizarDivision,
    setMetodoPago,
    puedeHacerPedido,
    totalItems,
    totalPrecio,
    totalPagado,
    metodoEntrega,
    setMetodoEntrega,
    datosCliente,
    setDatosCliente,
    actualizarDatoCliente,
    puedeConfirmarEntrega,
    agregarConVariante,
    obtenerItemId,
    pedidoActivo,
    estadoPedido,
    setEstadoPedido,
    crearPedido,
    avanzarEstadoPedido,
    finalizarPedido,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart debe usarse dentro de un <CartProvider>");
  }
  return ctx;
};
