// Shop.jsx
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import {
  Search,
  Share2,
  Star,
  Clock3,
  Bike,
  X,
  MapPin,
  Home,
  ShoppingBag,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { supabase, resolveImageUrl } from "../../../src/lib/supabaseClient";
import { useCart } from "./CartContext";
import Carrito from "./Carrito";
import Checkout from "./Checkout";
import ProductoDetalle from "./ProductoDetalle";
import SeguimientoPedido from "./SeguimientoPedido";

const TIENDA_INFO = {
  nombre: "",
  tipo: "",
  horario: "",
  rating: 0,
  reviews: 0,
  tiempo: "",
  domicilio: "",
  direccion: "",
  descripcion: "",
  logo: "/default.png",
  cover: "/default.png",
};

const fmt = (n) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

const parseMinutes = (value) => {
  if (!value) return null;
  const [hours, minutes] = String(value).split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

const formatHourLabel = (value) => {
  if (!value) return "";

  const [hours, minutes] = String(value).split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;

  const suffix = hours >= 12 ? "PM" : "AM";
  const normalizedHours = hours % 12 === 0 ? 12 : hours % 12;
  return `${normalizedHours}:${String(minutes).padStart(2, "0")} ${suffix}`;
};

const getBusinessHoursStatus = (rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      isOpen: false,
      label: "Cerrado",
      openText: "",
      closeText: "",
      nextOpenText: "",
    };
  }

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayWeekday = ((now.getDay() + 6) % 7) + 1;
  const previousWeekday = todayWeekday === 1 ? 7 : todayWeekday - 1;

  const openRows = rows.filter(
    (row) => row.is_open && row.open_time && row.close_time,
  );

  const activeRow = openRows.find((row) => {
    const rowDay = Number(row.day_of_week);
    const openMinutes = parseMinutes(row.open_time);
    const closeMinutes = parseMinutes(row.close_time);
    const isSameDay = rowDay === todayWeekday;
    const isPreviousDayNextClose =
      row.close_day === "next" && rowDay === previousWeekday;

    if (!isSameDay && !isPreviousDayNextClose) return false;

    if (isSameDay) {
      return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
    }

    return nowMinutes < closeMinutes;
  });

  if (activeRow) {
    return {
      isOpen: true,
      label: "Abierto",
      openText: formatHourLabel(activeRow.open_time),
      closeText: formatHourLabel(activeRow.close_time),
      nextOpenText: formatHourLabel(activeRow.open_time),
    };
  }

  const nextOpenRow = openRows
    .map((row) => ({
      ...row,
      sortDay: Number(row.day_of_week),
      sortMinutes: parseMinutes(row.open_time),
    }))
    .filter((row) => {
      const rowDay = Number(row.day_of_week);
      const openMinutes = parseMinutes(row.open_time);

      if (rowDay === todayWeekday) return openMinutes > nowMinutes;
      if (rowDay > todayWeekday) return true;
      return rowDay < todayWeekday;
    })
    .sort((a, b) => {
      const dayDiff =
        ((Number(a.day_of_week) - todayWeekday + 7) % 7) * 1440 -
        ((Number(b.day_of_week) - todayWeekday + 7) % 7) * 1440;
      return dayDiff + (parseMinutes(a.open_time) - parseMinutes(b.open_time));
    })[0];

  return {
    isOpen: false,
    label: "Cerrado",
    openText: nextOpenRow ? formatHourLabel(nextOpenRow.open_time) : "",
    closeText: "",
    nextOpenText: nextOpenRow ? formatHourLabel(nextOpenRow.open_time) : "",
  };
};

/* ── Cart Portal ── */
const CartPortal = ({ totalItems, totalPrecio, fmt, onOpen, isAnimating }) =>
  createPortal(
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "12px 16px",
        paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
        zIndex: 50,
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#7c3aed",
          borderRadius: "25px",
          padding: "14px 20px",
          border: "none",
          cursor: "pointer",
          boxShadow: isAnimating
            ? "0 10px 36px rgba(124,58,237,0.65)"
            : "0 8px 32px rgba(124,58,237,0.45)",
          transform: isAnimating ? "scale(1.02)" : "scale(1)",
          transition: "transform 0.3s ease, box-shadow 0.3s ease",
        }}
        aria-label="Abrir carrito"
      >
        <span
          style={{
            background: "rgba(0,0,0,0.2)",
            borderRadius: "25px",
            padding: "4px 10px",
            fontSize: "13px",
            fontWeight: 800,
            color: "#fff",
          }}
        >
          {totalItems}
        </span>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: "15px" }}>
          Ver carrito
        </span>
        <span style={{ color: "#fff", fontWeight: 900, fontSize: "15px" }}>
          {fmt(totalPrecio)}
        </span>
      </button>
    </div>,
    document.body,
  );

const CartDropAnimation = ({ product, onComplete }) => {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, 850);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return createPortal(
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        left: "50%",
        top: "32%",
        zIndex: 500,
        pointerEvents: "none",
        animation: "cartDrop 850ms cubic-bezier(0.22, 0.8, 0.32, 1) forwards",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          width: "190px",
          padding: "10px",
          borderRadius: "14px",
          background: "rgba(24,24,24,0.96)",
          border: "1px solid rgba(255,255,255,0.14)",
          boxShadow: "0 14px 36px rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{
            width: "42px",
            height: "42px",
            flexShrink: 0,
            overflow: "hidden",
            borderRadius: "10px",
            background: "#131313",
          }}
        >
          {product.image ? (
            <img
              src={product.image}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: "100%",
                height: "100%",
                color: "#fff",
                fontWeight: 800,
              }}
            >
              {product.nombre?.charAt(0).toUpperCase() || "+"}
            </span>
          )}
        </div>
        <span
          style={{
            overflow: "hidden",
            color: "#fff",
            fontSize: "12px",
            fontWeight: 800,
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {product.nombre}
        </span>
      </div>
    </div>,
    document.body,
  );
};

/* ── Main ── */
const Shop = () => {
  const { slug } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const [catActiva, setCatActiva] = useState("Todos");
  const [tiendaData, setTiendaData] = useState(TIENDA_INFO);
  const [categorias, setCategorias] = useState([]);
  const [productos, setProductosState] = useState([]);
  const [shopBusinessId, setShopBusinessId] = useState(null);
  const [, setAvailabilityByProduct] = useState({});
  const [isLoadingProductos, setIsLoadingProductos] = useState(true);
  const {
    carrito,
    cartOpen,
    abrirCarrito,
    cerrarCarrito,
    agregar,
    quitar,
    totalItems,
    totalPrecio,
    setProductos,
    nombreTienda: nombreTiendaEnCarrito,
    setNombreTienda,
    setLogoTienda,
    tiendaSlug,
    setTiendaSlug,
    businessId,
    setBusinessId,
    businessWhatsapp,
    setBusinessWhatsapp,
    vaciar,
    crearPedido,
    finalizarPedido,
  } = useCart();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [confirmCambioOpen, setConfirmCambioOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [productoDetalle, setProductoDetalle] = useState(null);
  const [seguimientoOpen, setSeguimientoOpen] = useState(false);
  const [cartPulse, setCartPulse] = useState(false);
  const [cartDropProduct, setCartDropProduct] = useState(null);
  const [tiendaAnteriorModal, setTiendaAnteriorModal] = useState("");
  const [tiendaActualModal, setTiendaActualModal] = useState("");
  const [tiendaConProductosModal, setTiendaConProductosModal] = useState("");
  const searchInputRef = useRef(null);
  const filtrosRef = useRef(null);

  const tiendaAnteriorLabel =
    tiendaConProductosModal ||
    tiendaAnteriorModal ||
    nombreTiendaEnCarrito ||
    "tienda anterior";
  const tiendaActualLabel =
    tiendaData?.nombre ||
    tiendaActualModal ||
    (slug
      ? slug.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
      : "tienda actual");

  const mostrarModalCambioTienda = (targetSlug = slug) => {
    if (
      !tiendaSlug ||
      !targetSlug ||
      tiendaSlug === targetSlug ||
      totalItems === 0
    ) {
      return false;
    }

    const tiendaActualNombre =
      tiendaData?.nombre ||
      (targetSlug
        ? targetSlug
            .replace(/-/g, " ")
            .replace(/\b\w/g, (char) => char.toUpperCase())
        : "tienda actual");

    let tiendaAnteriorNombre =
      tiendaConProductosModal ||
      tiendaAnteriorModal ||
      nombreTiendaEnCarrito ||
      "tienda anterior";

    if (tiendaAnteriorNombre === tiendaActualNombre) {
      tiendaAnteriorNombre = "la tienda anterior";
    }

    setTiendaConProductosModal(tiendaAnteriorNombre);
    setTiendaAnteriorModal(tiendaAnteriorNombre);
    setTiendaActualModal(tiendaActualNombre);
    setConfirmCambioOpen(true);
    return true;
  };

  // Obtener datos de la tienda desde Supabase
  useEffect(() => {
    const obtenerTienda = async () => {
      setIsLoadingProductos(true);
      try {
        const obtenerNegocioPorId = async (campo, valor) =>
          supabase
            .from("businesses")
            .select(
              `
              id,
              name,
              slug,
              logo_url,
              cover_url
            `,
            )
            .eq(campo, valor)
            .single();

        let tiendaQuery = await obtenerNegocioPorId("slug", slug);

        if (!tiendaQuery.error && !tiendaQuery.data) {
          tiendaQuery = await obtenerNegocioPorId("name", slug);
        }

        if (tiendaQuery.error) throw tiendaQuery.error;
        const data = tiendaQuery.data;
        if (!data) throw new Error("Tienda no encontrada");

        const businessInfoQuery = supabase
          .from("business_info")
          .select(
            "rating,rating_count,delivery_time_min,delivery_time_max,delivery_fee,free_delivery_min_order,categoria,whatsapp_phone,address",
          )
          .eq("business_id", data.id)
          .single();

        const [
          businessInfoRes,
          categoriasRes,
          productosRes,
          availabilityRes,
          businessHoursRes,
        ] = await Promise.all([
          businessInfoQuery,
          supabase
            .from("categories")
            .select("id,name")
            .eq("business_id", data.id),
          supabase
            .from("products")
            .select(
              "id,name,description,price,stock,image_url,is_active,is_sold_out,category_id,order_index,created_at",
            )
            .eq("business_id", data.id)
            .eq("is_active", true)
            .order("order_index", { ascending: true })
            .order("created_at", { ascending: true }),
          supabase
            .from("product_availability")
            .select("product_id,is_available")
            .eq("business_id", data.id),
          supabase
            .from("business_hours")
            .select(
              "day_of_week, shift_index, is_open, open_time, close_time, close_day",
            )
            .eq("business_id", data.id)
            .order("day_of_week", { ascending: true })
            .order("shift_index", { ascending: true }),
        ]);

        const info = businessInfoRes.error ? {} : businessInfoRes.data || {};
        const rating = info?.rating ? parseFloat(info.rating) : 4.5;
        const reviews = info?.rating_count || 0;
        const deliveryMin = info?.delivery_time_min || 20;
        const deliveryMax = info?.delivery_time_max || 35;
        const deliveryFee = info?.delivery_fee
          ? parseFloat(info.delivery_fee)
          : 2500;
        const categoria = info?.categoria || "Restaurante";
        const direccion = info?.address || "";

        if (categoriasRes.error) {
          console.error("Error al obtener categorías:", categoriasRes.error);
        }
        if (productosRes.error) {
          console.error("Error al obtener productos:", productosRes.error);
        }
        if (availabilityRes.error) {
          console.error(
            "Error al obtener disponibilidad de productos:",
            availabilityRes.error,
          );
        }

        const availabilityMap = (availabilityRes.data || []).reduce(
          (acc, item) => ({ ...acc, [item.product_id]: item.is_available }),
          {},
        );
        const businessHoursStatus = getBusinessHoursStatus(
          businessHoursRes.data || [],
        );
        setAvailabilityByProduct(availabilityMap);
        setShopBusinessId(data.id);

        const categoriasMapeadas = (categoriasRes.data || []).map(
          (categoria) => ({
            id: categoria.id,
            nombre: categoria.name,
            icon: categoria.icon_url,
          }),
        );

        const productosData = productosRes.data || [];
        const productsItemsMap = {};
        const productsGroupsMap = {};
        const itemsByGroup = {};

        const getOptionLabel = (item) =>
          item.nombre ||
          item.name ||
          item.title ||
          item.label ||
          item.option_name ||
          item.option ||
          item.text ||
          item.value ||
          `Opción ${item.id}`;

        const getOptionPrice = (item) =>
          Number(
            item.precio_extra ??
              item.price ??
              item.price_extra ??
              item.extra_price ??
              item.monto ??
              0,
          ) || 0;

        const getOptionMandatory = (item) =>
          item.es_opcion_obligatoria ??
          item.mandatory ??
          item.is_mandatory ??
          item.required ??
          item.is_required ??
          false;

        const getOptionTags = (item) =>
          item.tags ?? item.tag ?? item.categories ?? null;

        const normalizeGroup = (group, itemsForGroup = []) => {
          const isRequired =
            group.is_required ??
            group.es_requerido ??
            group.required ??
            group.isRequired ??
            false;
          const selectionType =
            group.selection_type ??
            group.selectionType ??
            group.type ??
            group.selection ??
            "single";

          return {
            id: group.id,
            name:
              group.name ?? group.nombre ?? group.title ?? `Grupo ${group.id}`,
            nombre:
              group.name ?? group.nombre ?? group.title ?? `Grupo ${group.id}`,
            description:
              group.description ?? group.descripcion ?? group.hint ?? "",
            descripcion:
              group.description ?? group.descripcion ?? group.hint ?? "",
            is_required: Boolean(isRequired),
            es_requerido: Boolean(isRequired),
            selection_type: selectionType,
            selectionType,
            order_index: Number(
              group.order_index ?? group.orderIndex ?? group.order ?? 0,
            ),
            orderIndex: Number(
              group.order_index ?? group.orderIndex ?? group.order ?? 0,
            ),
            opciones: (itemsForGroup || [])
              .map((item) => ({
                ...item,
                nombre: getOptionLabel(item),
                precioExtra: getOptionPrice(item),
                obligatorio: getOptionMandatory(item),
                order: Number(item.order_index ?? item.order ?? 0),
              }))
              .sort((a, b) => (a.order || 0) - (b.order || 0)),
          };
        };

        const mapearProductos = () =>
          productosData.map((producto) => {
            const categoria = categoriasMapeadas.find(
              (cat) => cat.id === producto.category_id,
            );

            const opciones = (productsItemsMap[producto.id] || []).map(
              (item) => ({
                id: item.id,
                nombre: getOptionLabel(item),
                precioExtra: getOptionPrice(item),
                obligatorio: getOptionMandatory(item),
                tags: getOptionTags(item),
              }),
            );

            const grupos = (productsGroupsMap[producto.id] || [])
              .map((group) =>
                normalizeGroup(group, itemsByGroup[group.id] || []),
              )
              .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

            return {
              id: producto.id,
              nombre: producto.name,
              desc: producto.description || "",
              precio: Number(producto.price) || 0,
              stock: producto.stock || 0,
              isSoldOut: producto.is_sold_out || producto.is_soldout || false,
              isAvailable:
                availabilityMap[producto.id] ??
                (Number(producto.stock || 0) > 0 &&
                  !Boolean(producto.is_sold_out || producto.is_soldout)),
              orderIndex: Number(producto.order_index || 0),
              cat: categoria?.nombre || "Otros",
              image: producto.image_url,
              isActive: producto.is_active,
              variantes: opciones,
              product_option_groups: grupos,
              option_groups: grupos,
              groups: grupos,
            };
          });

        const productosMapeados = mapearProductos();

        // Pintar la tienda con los datos críticos sin esperar opciones secundarias.
        setCategorias(categoriasMapeadas);
        setProductosState(productosMapeados);

        if (productosData.length > 0) {
          const productIds = productosData.map((producto) => producto.id);
          Promise.all([
            supabase
              .from("products_items")
              .select("*")
              .in("product_id", productIds),
            supabase
              .from("product_option_groups")
              .select("*")
              .in("product_id", productIds)
              .order("order_index", { ascending: true }),
          ]).then(([itemsRes, groupsRes]) => {
            if (itemsRes.error) {
              console.error(
                "Error al obtener opciones de producto:",
                itemsRes.error,
              );
            } else {
              (itemsRes.data || []).forEach((item) => {
                if (item.option_group_id) {
                  if (!itemsByGroup[item.option_group_id]) {
                    itemsByGroup[item.option_group_id] = [];
                  }
                  itemsByGroup[item.option_group_id].push(item);
                } else {
                  if (!productsItemsMap[item.product_id]) {
                    productsItemsMap[item.product_id] = [];
                  }
                  productsItemsMap[item.product_id].push(item);
                }
              });
            }

            if (groupsRes.error) {
              console.error(
                "Error al obtener grupos de opciones:",
                groupsRes.error,
              );
            } else {
              (groupsRes.data || []).forEach((group) => {
                if (!productsGroupsMap[group.product_id]) {
                  productsGroupsMap[group.product_id] = [];
                }
                productsGroupsMap[group.product_id].push(group);
              });
            }

            const productosConOpciones = mapearProductos();
            setProductosState(productosConOpciones);
            if (!hayCarritoOtraTienda) {
              setProductos(productosConOpciones);
            }
          });
        }

        const primerProductoConImagen =
          productosMapeados.find((producto) => producto.image)?.image || "";

        const portadaUrl =
          data.cover_url || primerProductoConImagen || "/default.png";

        setTiendaData({
          nombre: data.name,
          tipo: categoria,
          isOpen: businessHoursStatus.isOpen,
          horario: businessHoursStatus.isOpen
            ? `Abierto · Abre ${businessHoursStatus.openText} · Cierra ${businessHoursStatus.closeText}`
            : businessHoursStatus.nextOpenText
              ? `Cerrado · Abre ${businessHoursStatus.nextOpenText}`
              : "Cerrado",
          rating,
          reviews,
          tiempo: `${deliveryMin}–${deliveryMax} min`,
          domicilio:
            deliveryFee === 0
              ? "Gratis"
              : `$${deliveryFee.toLocaleString("es-CO")}`,
          direccion,
          descripcion: "",
          logo: data.logo_url || "/default.png",
          cover: portadaUrl || "/default.png",
        });

        setIsLoadingProductos(false);
        Promise.all([
          data.logo_url
            ? resolveImageUrl(data.logo_url)
            : Promise.resolve("/default.png"),
          portadaUrl
            ? resolveImageUrl(portadaUrl)
            : Promise.resolve("/default.png"),
        ]).then(([logo, cover]) => {
          setTiendaData((current) => ({ ...current, logo, cover }));
        });

        const hayCarritoOtraTienda =
          tiendaSlug && tiendaSlug !== slug && totalItemsRef.current > 0;

        if (!hayCarritoOtraTienda) {
          setProductos(productosMapeados);
        }

        const normalizeWhatsappNumber = (value) => {
          const digits = String(value || "").replace(/\D/g, "");
          if (!digits) return "";
          if (digits.startsWith("57")) return digits;
          return `57${digits.replace(/^0+/, "")}`;
        };

        if (!hayCarritoOtraTienda) {
          setNombreTienda(data.name);
          setLogoTienda(data.logo_url || "/default.png");
          setBusinessId(data.id);
          setBusinessWhatsapp(
            normalizeWhatsappNumber(info?.whatsapp_phone || "") || "",
          );
          // Aseguramos también registrar el slug de la tienda en el contexto
          // para que el carrito sepa de qué tienda provienen los productos
          // cuando el usuario agregue items.
          setTiendaSlug(data.slug || slug);
        }
      } catch (error) {
        console.error("Error al obtener tienda:", error);
      } finally {
        setIsLoadingProductos(false);
      }
    };

    if (slug) {
      obtenerTienda();
    }
  }, [slug, setNombreTienda, setLogoTienda, setBusinessWhatsapp]);

  useEffect(() => {
    if (!shopBusinessId) return undefined;

    const channel = supabase
      .channel(`shop-product-availability-${shopBusinessId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "product_availability",
          filter: `business_id=eq.${shopBusinessId}`,
        },
        (payload) => {
          const productId = payload.new?.product_id || payload.old?.product_id;
          if (!productId) return;

          const isAvailable =
            payload.eventType === "DELETE"
              ? false
              : Boolean(payload.new?.is_available);

          setAvailabilityByProduct((current) => ({
            ...current,
            [productId]: isAvailable,
          }));
          const updateAvailability = (current) =>
            current.map((product) =>
              product.id === productId ? { ...product, isAvailable } : product,
            );
          setProductosState(updateAvailability);
          setProductos(updateAvailability);
          setProductoDetalle((current) =>
            current?.id === productId ? { ...current, isAvailable } : current,
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopBusinessId]);

  // Lleva la vista al punto exacto donde la barra de filtros queda fija
  // arriba, mostrando el primer producto del filtro justo debajo.
  // Usamos offsetTop (no scrollIntoView) porque, al ser "sticky", el
  // navegador cree que ya está visible y no mueve el scroll real.
  const scrollASuave = () => {
    const el = filtrosRef.current;
    if (!el) return;
    window.scrollTo({ top: el.offsetTop, behavior: "smooth" });
  };

  // Importante: el scroll se dispara en un useEffect (DESPUÉS de que React
  // ya actualizó el DOM con la nueva categoría), no dentro del onClick.
  // Si se dispara antes, el cambio de tamaño de la lista activa el
  // "scroll anchoring" del navegador, que pelea con nuestra animación y
  // deja al usuario viendo el espacio vacío del filtro anterior.
  //
  // Usamos un contador (filtroTick) en vez de depender de "catActiva"
  // directamente: así el scroll se ejecuta en TODOS los clics, incluso si
  // el usuario toca dos veces la misma categoría (catActiva no cambiaría
  // de valor, pero igual queremos resetear la vista al primer producto).
  const [filtroTick, setFiltroTick] = useState(0);
  useEffect(() => {
    if (filtroTick === 0) return; // evita el scroll al cargar la página
    scrollASuave();
  }, [filtroTick]);

  // Sincroniza con el contexto del carrito para que Carrito.jsx
  // pueda mostrar nombre/precio/imagen de cada producto agregado.
  // Si el carrito ya tenía productos de OTRA tienda, primero se pide
  // confirmación antes de vaciarlo.
  //
  // IMPORTANTE: usamos una ref para leer totalItems en vez de ponerlo
  // como dependencia del efecto. Si totalItems estuviera en el array de
  // dependencias, cada vez que el usuario agrega/quita un producto este
  // efecto se volvería a ejecutar y, al ser la misma tienda, caía en la
  // rama que limpia `productos` — vaciando visualmente el carrito aunque
  // las cantidades siguieran ahí. Con la ref, el efecto solo corre
  // cuando cambia el slug o el tiendaSlug guardado.
  const totalItemsRef = useRef(totalItems);
  const prevTotalItemsRef = useRef(totalItems);

  useEffect(() => {
    totalItemsRef.current = totalItems;
  }, [totalItems]);

  useEffect(() => {
    const wasIncreased = totalItems > prevTotalItemsRef.current;
    prevTotalItemsRef.current = totalItems;

    if (!wasIncreased) return;

    setCartPulse(true);
    const timer = window.setTimeout(() => setCartPulse(false), 350);
    return () => window.clearTimeout(timer);
  }, [totalItems]);

  useEffect(() => {
    if (tiendaSlug && tiendaSlug !== slug && totalItemsRef.current > 0) {
      // Si ya hay carrito en otra tienda, dejamos al usuario navegar
      // libremente en la tienda actual sin forzar el aviso inmediato.
      return;
    }

    setTiendaSlug(slug);
    setTiendaAnteriorModal("");
    setTiendaActualModal("");

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, tiendaSlug]);

  const confirmarCambioTienda = () => {
    vaciar();
    setProductos([]);
    setTiendaSlug(slug);
    setTiendaAnteriorModal("");
    setTiendaActualModal("");
    setConfirmCambioOpen(false);
  };

  const cerrarModalCambioTienda = () => {
    setConfirmCambioOpen(false);
    setTiendaAnteriorModal("");
    setTiendaActualModal("");
  };

  const cancelarCambioTienda = () => {
    setConfirmCambioOpen(false);
    setTiendaAnteriorModal("");
    setTiendaActualModal("");
  };

  // Estilo base para cada bloque "hueso" del skeleton: un degradado que
  // se desliza de izquierda a derecha simulando el efecto de brillo.
  const skeletonBlock = (extra = {}) => ({
    background: "linear-gradient(90deg, #131313 25%, #1c1c1c 37%, #131313 63%)",
    backgroundSize: "400% 100%",
    animation: "shimmer 1.4s ease infinite",
    borderRadius: "6px",
    ...extra,
  });

  const categoriasMenu = ["Todos", ...categorias.map((c) => c.nombre)];

  const productosPorCategoria =
    catActiva === "Todos"
      ? productos
      : productos.filter((p) => p.cat === catActiva);
  const displayedProducts =
    searchQuery.trim() === ""
      ? productosPorCategoria
      : productosPorCategoria.filter((p) => {
          const q = searchQuery.trim().toLowerCase();
          return (
            p.nombre.toLowerCase().includes(q) ||
            (p.desc && p.desc.toLowerCase().includes(q))
          );
        });

  const obtenerCantidadProducto = (producto) => {
    const baseCantidad = carrito[producto.id] || 0;
    const variantesCantidad = Object.entries(carrito).reduce(
      (sum, [key, cantidad]) =>
        key.startsWith(`${producto.id}__`) ? sum + cantidad : sum,
      0,
    );
    return baseCantidad + variantesCantidad;
  };

  const tieneOpciones = (producto) =>
    (Array.isArray(producto.variantes) && producto.variantes.length > 0) ||
    (Array.isArray(producto.option_groups) &&
      producto.option_groups.length > 0) ||
    (Array.isArray(producto.product_option_groups) &&
      producto.product_option_groups.length > 0);

  // IMPORTANTE: ya no volvemos a consultar "products_items" aquí.
  // `producto.variantes` ya viene cargado desde la consulta en bloque
  // que hace `obtenerTienda` (una sola vez, para todos los productos).
  // Antes esta función repetía la consulta por producto individual y,
  // si esa segunda consulta llegaba a devolver un arreglo vacío por
  // cualquier motivo (RLS, timing, etc.), igual abría el modal —
  // y ProductoDetalle.jsx hacía UNA TERCERA consulta que podía volver
  // a pisar los datos buenos con un resultado vacío. Con una sola
  // fuente de verdad se elimina ese punto de falla.
  const abrirDetalleProducto = (producto) => {
    setProductoDetalle(producto);
  };

  const animarProductoAlCarrito = (producto) => {
    setCartDropProduct({ ...producto, animationId: Date.now() });
  };

  // abrirCarrito ahora viene del CartContext (abre <Carrito /> de pantalla completa)

  const shareUrl = window.location.href;

  const handleShare = () => {
    setShareModalOpen(true);
  };

  const handleNativeShare = async () => {
    const shareData = {
      title: tiendaData.nombre,
      text: `Mira este local: ${tiendaData.nombre}`,
      url: shareUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareMessage("Compartido");
      } else {
        await navigator.clipboard.writeText(shareData.url);
        setShareMessage("Enlace copiado");
      }
    } catch {
      setShareMessage("No se pudo compartir");
    }
    setTimeout(() => setShareMessage(""), 2500);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareMessage("Enlace copiado");
    } catch {
      setShareMessage("No se pudo copiar");
    }
    setTimeout(() => setShareMessage(""), 2500);
  };

  useEffect(() => {
    if (searchOpen && searchInputRef.current) searchInputRef.current.focus();
  }, [searchOpen]);

  const TAG_MAP = {
    "Más vendido": "#7c3aed",
    Favorito: "#7c3aed",
    "Ahorra $6k": "#00c448",
    Nuevo: "#38bdf8",
  };

  return (
    <>
      <style>{`
        @keyframes fadeInLista {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes cartDrop {
          0% { top: 32%; opacity: 0; transform: translate(-50%, -50%) scale(1); }
          12% { top: 32%; opacity: 1; transform: translate(-50%, -50%) scale(1); }
          78% { top: calc(100% - 90px); opacity: 1; transform: translate(-50%, -50%) scale(0.62) rotate(3deg); }
          100% { top: calc(100% - 54px); opacity: 0; transform: translate(-50%, -50%) scale(0.18) rotate(-2deg); }
        }
      `}</style>
      <div
        style={{
          background: "#0a0a0a",
          minHeight: "100vh",
          color: "#fff",
          paddingBottom: "calc(88px + env(safe-area-inset-bottom))",
          fontFamily: "'Inter', system-ui, sans-serif",
          // Evita que el navegador "corrija" el scroll automáticamente
          // cuando la lista de productos cambia de tamaño al filtrar.
          overflowAnchor: "none",
        }}
      >
        {/* ── HERO ── */}
        {/* Wrapper sin overflow:hidden para que el logo sobresalga */}
        <div style={{ position: "relative", height: "250px" }}>
          {/* Imagen recortada dentro de su propio div */}
          <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
            {isLoadingProductos ? (
              <div
                style={skeletonBlock({
                  width: "100%",
                  height: "100%",
                  borderRadius: 0,
                })}
              />
            ) : (
              <img
                src={tiendaData.cover || "/default.png"}
                alt={tiendaData.nombre}
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = "/default.png";
                }}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            )}
            {/* Gradiente oscuro */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(10,10,10,0.85) 85%, #0a0a0a 100%)",
              }}
            />
          </div>

          {/* Logo centrado, mitad dentro mitad fuera de la imagen */}
          <div
            style={{
              position: "absolute",
              bottom: "-36px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 10,
            }}
          >
            <div
              style={{
                width: "72px",
                height: "72px",
                borderRadius: "20px",
                background: "#131313",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "36px",
                boxShadow: "0 4px 24px rgba(0,0,0,0.7)",
              }}
            >
              {isLoadingProductos ? (
                <div
                  style={skeletonBlock({
                    width: "100%",
                    height: "100%",
                    borderRadius: "20px",
                  })}
                />
              ) : tiendaData.logo && typeof tiendaData.logo === "string" ? (
                <img
                  src={tiendaData.logo}
                  alt={tiendaData.nombre}
                  onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = "/default.png";
                  }}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: "20px",
                  }}
                />
              ) : (
                "🍔"
              )}
            </div>
          </div>

          {/* Controles top */}
          <div
            style={{
              position: "absolute",
              top: "16px",
              left: "16px",
              right: "16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              zIndex: 5,
            }}
          >
            {isLoadingProductos ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  gap: "10px",
                }}
              >
                <div
                  style={skeletonBlock({
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                  })}
                />
                <div style={{ display: "flex", gap: "10px" }}>
                  <div
                    style={skeletonBlock({
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                    })}
                  />
                  <div
                    style={skeletonBlock({
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                    })}
                  />
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => navigate("/")} // Redirige directamente al home/marketplace
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: "rgba(0,0,0,0.55)",
                    backdropFilter: "blur(10px)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                  aria-label="Ir al inicio"
                >
                  <Home size={18} color="#fff" />
                </button>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setSearchOpen((s) => !s)}
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      background: "rgba(0,0,0,0.55)",
                      backdropFilter: "blur(10px)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                    aria-label="Buscar"
                  >
                    <Search size={17} color="#fff" />
                  </button>
                  <button
                    type="button"
                    onClick={handleShare}
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      background: "rgba(0,0,0,0.55)",
                      backdropFilter: "blur(10px)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                    aria-label="Compartir"
                  >
                    <Share2 size={17} color="#fff" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── INFO DEL LOCAL ── */}
        <div style={{ padding: "48px 20px 0", textAlign: "center" }}>
          {isLoadingProductos ? (
            <>
              <div
                style={skeletonBlock({
                  width: "30%",
                  height: "12px",
                  margin: "0 auto 10px",
                })}
              />
              <div
                style={skeletonBlock({
                  width: "50%",
                  height: "36px",
                  margin: "0 auto 14px",
                })}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: "20px",
                  marginBottom: "16px",
                }}
              >
                <div style={skeletonBlock({ width: "70px", height: "28px" })} />
                <div style={skeletonBlock({ width: "70px", height: "28px" })} />
                <div style={skeletonBlock({ width: "70px", height: "28px" })} />
              </div>
              <div
                style={skeletonBlock({
                  width: "90%",
                  height: "18px",
                  margin: "0 auto 8px",
                  borderRadius: "12px",
                })}
              />
              <div
                style={skeletonBlock({
                  width: "80%",
                  height: "14px",
                  margin: "0 auto",
                  borderRadius: "12px",
                })}
              />
            </>
          ) : (
            <>
              <p
                style={{
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.45)",
                  fontWeight: 500,
                  marginBottom: "6px",
                  letterSpacing: "0.02em",
                }}
              >
                {tiendaData.tipo}
              </p>
              <h1
                style={{
                  fontSize: "26px",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.15,
                  marginBottom: "14px",
                }}
              >
                {tiendaData.nombre}
              </h1>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  marginBottom: "16px",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    background: tiendaData.isOpen ? "#00c448" : "#f43f5e",
                    boxShadow: tiendaData.isOpen
                      ? "0 0 7px #00c448"
                      : "0 0 7px #f43f5e",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#fff",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tiendaData.horario}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "14px",
                  marginBottom: "16px",
                  justifyContent: "center",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "5px" }}
                >
                  <Star size={13} fill="#FFD166" style={{ color: "#FFD166" }} />
                  <span style={{ fontSize: "13px", fontWeight: 700 }}>
                    {tiendaData.rating}
                  </span>
                  <span
                    style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}
                  >
                    ({tiendaData.reviews})
                  </span>
                </div>

                <div
                  style={{ display: "flex", alignItems: "center", gap: "5px" }}
                >
                  <Clock3
                    size={13}
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  />
                  <span
                    style={{
                      fontSize: "13px",
                      color: "rgba(255,255,255,0.7)",
                      fontWeight: 500,
                    }}
                  >
                    {tiendaData.tiempo}
                  </span>
                </div>

                <div
                  style={{ display: "flex", alignItems: "center", gap: "5px" }}
                >
                  <Bike size={13} style={{ color: "rgba(255,255,255,0.5)" }} />
                  <span
                    style={{
                      fontSize: "13px",
                      color: "rgba(255,255,255,0.7)",
                      fontWeight: 500,
                    }}
                  >
                    {tiendaData.domicilio}
                  </span>
                </div>
              </div>

              {tiendaData.direccion && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    flexWrap: "wrap",
                    marginBottom: "20px",
                  }}
                >
                  <MapPin
                    size={11}
                    style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0 }}
                  />
                  <span
                    style={{
                      fontSize: "12px",
                      color: "rgba(255,255,255,0.4)",
                      maxWidth: "190px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tiendaData.direccion}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Divisor */}
        <div style={{ height: "1px", background: "#1a1a1a" }} />

        {/* ── TABS + BÚSQUEDA (sticky) ── */}
        <div
          ref={filtrosRef}
          style={{
            position: "sticky",
            top: 0,
            zIndex: 40,
            background: "rgba(10,10,10,0.96)",
            backdropFilter: "blur(16px)",
            borderBottom: "1px solid #1a1a1a",
            padding: "12px 16px",
          }}
        >
          {/* ── Categorías */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              overflowX: "auto",
              scrollbarWidth: "none",
              marginBottom: searchOpen ? "10px" : "0",
            }}
          >
            {isLoadingProductos
              ? Array.from({ length: 4 }).map((_, idx) => (
                  <div
                    key={`chip-skeleton-${idx}`}
                    style={skeletonBlock({
                      width: idx === 0 ? "56px" : "78px",
                      height: "29px",
                      borderRadius: "100px",
                      flexShrink: 0,
                    })}
                  />
                ))
              : categoriasMenu.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setCatActiva(cat);
                      setSearchQuery("");
                      setFiltroTick((t) => t + 1);
                    }}
                    style={{
                      padding: "7px 16px",
                      borderRadius: "100px",
                      fontSize: "12px",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      // Eliminamos el borde permanentemente
                      border: "none",
                      // El color de fondo es el único indicador visual
                      background: catActiva === cat ? "#7c3aed" : "#1a1a1a",
                      color:
                        catActiva === cat ? "#fff" : "rgba(255,255,255,0.45)",
                      cursor: "pointer",
                      letterSpacing: "0.01em",
                      flexShrink: 0,
                    }}
                  >
                    {cat}
                  </button>
                ))}
          </div>

          {/* Barra de búsqueda */}
          {searchOpen && (
            <div style={{ position: "relative" }}>
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  catActiva === "Todos"
                    ? "Buscar en el menú..."
                    : `Buscar en ${catActiva}...`
                }
                style={{
                  width: "100%",
                  padding: "10px 40px 10px 14px",
                  borderRadius: "25px",
                  background: "#131313",
                  color: "#fff",
                  fontSize: "16px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                aria-label={`Buscar en ${catActiva}`}
              />
              <button
                type="button"
                onClick={() => {
                  if (searchQuery.trim()) {
                    setSearchQuery("");
                    searchInputRef.current?.focus();
                  } else setSearchOpen(false);
                }}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-label="Cerrar búsqueda"
              >
                <X size={15} color="rgba(255,255,255,0.5)" />
              </button>
            </div>
          )}
        </div>

        {/* ── LISTA DE PRODUCTOS ── */}
        {/* minHeight: "100vh" garantiza espacio suficiente debajo del
            último producto, sin importar cuántos queden tras filtrar.
            Sin esto, con pocos resultados la página queda tan corta que
            el navegador no puede desplazarse hasta que la barra de
            filtros llegue arriba (no hay a dónde "scrollear"). */}
        <div
          key={catActiva}
          style={{
            padding: "8px 0",
            minHeight: "100vh",
            animation: "fadeInLista 0.22s ease",
          }}
        >
          {searchQuery.trim() !== "" && (
            <p
              style={{
                fontSize: "12px",
                color: "rgba(255,255,255,0.35)",
                padding: "8px 20px 4px",
              }}
            >
              {displayedProducts.length} resultado(s) para "{searchQuery}"
            </p>
          )}

          {isLoadingProductos ? (
            // ── SKELETON ── mismo layout que la tarjeta real (texto a la
            // izquierda, imagen 88x88 a la derecha) para que no haya salto
            // de tamaño al reemplazar por los productos reales.
            Array.from({ length: 5 }).map((_, idx) => (
              <div
                key={`skeleton-${idx}`}
                style={{
                  display: "flex",
                  gap: "14px",
                  padding: "16px 20px 24px",
                  alignItems: "flex-start",
                  borderBottom:
                    idx < 4 ? "1px solid rgba(255,255,255,0.06)" : "none",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={skeletonBlock({
                      width: "70%",
                      height: "14px",
                      marginBottom: "10px",
                    })}
                  />
                  <div
                    style={skeletonBlock({
                      width: "95%",
                      height: "11px",
                      marginBottom: "6px",
                    })}
                  />
                  <div
                    style={skeletonBlock({
                      width: "60%",
                      height: "11px",
                      marginBottom: "14px",
                    })}
                  />
                  <div
                    style={skeletonBlock({ width: "50px", height: "15px" })}
                  />
                </div>
                <div
                  style={skeletonBlock({
                    width: "88px",
                    height: "88px",
                    borderRadius: "16px",
                    flexShrink: 0,
                  })}
                />
              </div>
            ))
          ) : displayedProducts.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "72px 24px",
                color: "rgba(255,255,255,0.5)",
              }}
            >
              <div
                style={{
                  width: "72px",
                  height: "72px",
                  margin: "0 auto 18px",
                  borderRadius: "50%",
                  background: "rgba(124,58,237,0.12)",
                  border: "1px solid rgba(124,58,237,0.22)",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <ShoppingBag size={30} strokeWidth={1.6} color="#a78bfa" />
              </div>
              <h3
                style={{
                  marginBottom: "8px",
                  color: "#fff",
                  fontSize: "17px",
                  fontWeight: 800,
                }}
              >
                {searchQuery.trim()
                  ? "No encontramos ese producto"
                  : catActiva !== "Todos"
                    ? `No hay productos en ${catActiva}`
                    : "El menú está en preparación"}
              </h3>
              <p
                style={{
                  maxWidth: "280px",
                  margin: "0 auto",
                  color: "rgba(255,255,255,0.45)",
                  fontSize: "12.5px",
                  lineHeight: 1.55,
                }}
              >
                {searchQuery.trim()
                  ? "Prueba con otro nombre o revisa las categorías disponibles."
                  : "Esta tienda todavía no ha publicado productos. Vuelve pronto para descubrir su menú."}
              </p>
            </div>
          ) : (
            displayedProducts.map((p, idx) => {
              const qty = obtenerCantidadProducto(p);
              const tieneOpcionesProducto = tieneOpciones(p);
              const precioExtraMax = Math.max(
                0,
                ...(Array.isArray(p.variantes) ? p.variantes : []).map((item) =>
                  Number(item.precioExtra || 0),
                ),
              );
              const isLast = idx === displayedProducts.length - 1;
              return (
                <div key={p.id}>
                  <div
                    onClick={() => abrirDetalleProducto(p)}
                    style={{
                      display: "flex",
                      gap: "14px",
                      padding: "16px 20px 24px",
                      alignItems: "flex-start",
                      cursor: "pointer",
                    }}
                  >
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {p.tag && (
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: "10px",
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: TAG_MAP[p.tag] || "#7c3aed",
                            marginBottom: "5px",
                          }}
                        >
                          {p.tag}
                        </span>
                      )}
                      {/* badge moved to image overlay to keep product in place */}
                      <h4
                        style={{
                          fontWeight: 700,
                          fontSize: "14px",
                          marginBottom: "4px",
                          lineHeight: 1.3,
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {p.nombre}
                      </h4>
                      <p
                        style={{
                          fontSize: "12px",
                          color: "rgba(255,255,255,0.4)",
                          lineHeight: 1.55,
                          marginBottom: "12px",
                        }}
                      >
                        {p.desc}
                      </p>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: "8px",
                          flexWrap: "wrap",
                          columnGap: "8px",
                          rowGap: "4px",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 800,
                            fontSize: "15px",
                            color: "#fff",
                          }}
                        >
                          {fmt(p.precio)}
                        </span>
                        {precioExtraMax > 0 && (
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: "12px",
                              color: "rgba(255,255,255,0.65)",
                            }}
                          >
                            +{fmt(precioExtraMax)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Imagen + botón superpuesto */}
                    <div
                      style={{
                        position: "relative",
                        flexShrink: 0,
                        width: "88px",
                      }}
                    >
                      {/* Imagen */}
                      <div
                        style={{
                          width: "88px",
                          height: "88px",
                          borderRadius: "16px",
                          background: "#131313",
                          border: "1px solid rgba(255,255,255,0.06)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                          position: "relative",
                        }}
                      >
                        {p.image ? (
                          <img
                            src={p.image}
                            alt={p.nombre}
                            onError={(event) => {
                              event.currentTarget.onerror = null;
                              event.currentTarget.src = "/default.png";
                            }}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        ) : (
                          <span
                            style={{
                              color: "#fff",
                              fontSize: "22px",
                              fontWeight: 700,
                            }}
                          >
                            {p.nombre?.charAt(0).toUpperCase() || "?"}
                          </span>
                        )}

                        {(p.isAvailable === false ||
                          p.isSoldOut ||
                          (typeof p.stock === "number" && p.stock <= 0)) && (
                          <div
                            style={{
                              position: "absolute",
                              top: "6px",
                              left: "6px",
                              padding: "4px 8px",
                              borderRadius: "999px",
                              background: "rgba(229,62,62,0.95)",
                              color: "#fff",
                              fontSize: "11px",
                              fontWeight: 800,
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}
                          >
                            Agotado
                          </div>
                        )}
                      </div>

                      {/* Indicador superpuesto en esquina inferior derecha */}
                      <div
                        style={{
                          position: "absolute",
                          bottom: "-10px",
                          right: "-10px",
                          minWidth: "32px",
                          height: "32px",
                          borderRadius: "50%",
                          background: "#7c3aed",
                          color: "#fff",
                          fontSize: "14px",
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 4px 12px rgba(124,58,237,0.5)",
                          lineHeight: 1,
                          padding: "0 10px",
                          pointerEvents: "none",
                        }}
                      >
                        {qty === 0 ? "+" : qty}
                      </div>
                    </div>
                  </div>

                  {/* Divisor entre items */}
                  {!isLast && (
                    <div
                      style={{
                        height: "1px",
                        background: "#131313",
                        margin: "0 20px",
                      }}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── CARRITO ── */}
      {totalItems > 0 && tiendaSlug === slug && !confirmCambioOpen && (
        <CartPortal
          totalItems={totalItems}
          totalPrecio={totalPrecio}
          fmt={fmt}
          onOpen={abrirCarrito}
          isAnimating={cartPulse}
        />
      )}

      {/* ── MODAL COMPARTIR CON QR ── */}
      {shareModalOpen &&
        createPortal(
          <div
            onClick={() => setShareModalOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(6px)",
              zIndex: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#131313",
                borderRadius: "20px",
                padding: "28px 24px",
                width: "100%",
                maxWidth: "340px",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
                textAlign: "center",
                position: "relative",
              }}
            >
              <button
                type="button"
                onClick={() => setShareModalOpen(false)}
                style={{
                  position: "absolute",
                  top: "12px",
                  right: "12px",
                  width: "30px",
                  height: "30px",
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.06)",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
                aria-label="Cerrar"
              >
                <X size={15} color="#fff" />
              </button>

              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 800,
                  color: "#fff",
                  marginBottom: "4px",
                  letterSpacing: "-0.01em",
                }}
              >
                Compartir {tiendaData.nombre}
              </h3>
              <p
                style={{
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.45)",
                  marginBottom: "20px",
                }}
              >
                Escanea el código o usa el enlace
              </p>

              <div
                style={{
                  display: "inline-flex",
                  padding: "14px",
                  borderRadius: "16px",
                  background: "#fff",
                  marginBottom: "18px",
                }}
              >
                <QRCodeCanvas value={shareUrl} size={180} />
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "#0a0a0a",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "100px",
                  padding: "8px 6px 8px 14px",
                  marginBottom: "14px",
                }}
              >
                <span
                  style={{
                    flex: 1,
                    fontSize: "12px",
                    color: "rgba(255,255,255,0.6)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    textAlign: "left",
                  }}
                >
                  {shareUrl}
                </span>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  style={{
                    flexShrink: 0,
                    padding: "7px 14px",
                    borderRadius: "100px",
                    background: "#7c3aed",
                    color: "#fff",
                    fontSize: "11px",
                    fontWeight: 700,
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Copiar
                </button>
              </div>

              <button
                type="button"
                onClick={handleNativeShare}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "100px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                <Share2 size={15} />
                Más opciones
              </button>
            </div>
          </div>,
          document.body,
        )}

      {/* ── CONFIRMAR CAMBIO DE TIENDA (vacía el carrito) ── */}
      {confirmCambioOpen &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.75)",
              backdropFilter: "blur(6px)",
              zIndex: 300,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
            }}
          >
            <div
              style={{
                background: "#131313",
                borderRadius: "20px",
                padding: "26px 22px",
                width: "100%",
                maxWidth: "320px",
                border: "1px solid rgba(255,255,255,0.08)",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "34px", marginBottom: "10px" }}>🛒</div>
              <h3
                style={{
                  fontSize: "15px",
                  fontWeight: 800,
                  color: "#fff",
                  marginBottom: "8px",
                }}
              >
                ¿Cambiaste de tienda?
              </h3>
              <p
                style={{
                  fontSize: "12.5px",
                  color: "rgba(255,255,255,0.5)",
                  lineHeight: 1.5,
                  marginBottom: "22px",
                }}
              >
                Ya tienes productos de{" "}
                <strong style={{ color: "#fff" }}>{tiendaAnteriorLabel}</strong>{" "}
                en tu carrito. Si quieres agregar productos de{" "}
                <strong style={{ color: "#fff" }}>{tiendaActualLabel}</strong>,
                tendremos que vaciar el carrito anterior para empezar limpio.
              </p>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={cancelarCambioTienda}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "100px",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarCambioTienda}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "100px",
                    background: "#7c3aed",
                    border: "none",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Sí, vaciar
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ── CARRITO (pantalla completa) ── */}
      {cartOpen && (
        <Carrito
          onIrAPagar={() => {
            cerrarCarrito();
            setCheckoutOpen(true);
          }}
        />
      )}

      {/* ── CHECKOUT / MÉTODO DE ENTREGA (pantalla completa) ── */}
      {checkoutOpen && (
        <Checkout
          onVolver={() => {
            setCheckoutOpen(false);
            abrirCarrito();
          }}
          onConfirmar={async () => {
            try {
              const pedido = await crearPedido();
              setCheckoutOpen(false);
              if (pedido) {
                navigate(
                  `/marketplace/seguimiento?order=${encodeURIComponent(
                    pedido.numero,
                  )}&token=${encodeURIComponent(pedido.trackingToken)}`,
                );
              }
            } catch (error) {
              console.error("No se pudo confirmar el pedido:", error);
              setShareMessage(
                "No se pudo guardar el pedido. Intenta nuevamente.",
              );
              window.setTimeout(() => setShareMessage(""), 3500);
            }
          }}
        />
      )}

      {/* ── DETALLE DE PRODUCTO (imagen grande, variantes, indicaciones) ── */}
      {productoDetalle && (
        <ProductoDetalle
          producto={productoDetalle}
          onClose={() => setProductoDetalle(null)}
          onAgregarIntento={() => {
            if (mostrarModalCambioTienda(slug)) {
              return false;
            }
            return true;
          }}
          tiendaNombre={tiendaData?.nombre}
          tiendaLogo={tiendaData?.logo}
          tiendaSlug={slug}
          onAddedToCart={animarProductoAlCarrito}
        />
      )}

      {cartDropProduct && (
        <CartDropAnimation
          key={cartDropProduct.animationId}
          product={cartDropProduct}
          onComplete={() => setCartDropProduct(null)}
        />
      )}

      {/* ── MENSAJE COMPARTIR ── */}
      {shareMessage &&
        createPortal(
          <div
            style={{
              position: "fixed",
              bottom: "96px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 60,
              padding: "10px 20px",
              borderRadius: "100px",
              background: "#222",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 600,
              border: "1px solid rgba(255,255,255,0.1)",
              whiteSpace: "nowrap",
              backdropFilter: "blur(12px)",
            }}
          >
            {shareMessage}
          </div>,
          document.body,
        )}
    </>
  );
};

export default Shop;
