import React, {
  useCallback,
  useMemo,
  useState,
  useRef,
  useEffect,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Trash2, Pencil, X, Maximize2 } from "lucide-react";
import SplitPaymentModal from "./SplitPaymentModal";
import { printOrderInvoice } from "./OrderInvoice";
import {
  downloadOrderInvoicePdf,
  shareOrderInvoicePdf,
} from "./OrderInvoicePdf";
import { supabase } from "../../src/lib/supabaseClient";
import { useAuth } from "../../src/components/AuthContext";
import DeliveryMap from "./DeliveryMap";

const pasteToField = async (setter, onPasteValue) => {
  if (!navigator?.clipboard) return;
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      if (onPasteValue) onPasteValue(text);
      else setter(text);
    }
  } catch {}
};

const parseMapCoordinates = (value) => {
  let text = String(value ?? "").trim();
  try {
    text = decodeURIComponent(text);
  } catch {}

  const match =
    text.match(/@(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/) ||
    text.match(/!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/i) ||
    text.match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!match) return null;

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  )
    return null;

  return { latitude, longitude };
};

const formatMapCoordinates = ({ latitude, longitude }) =>
  [latitude, longitude]
    .map((coordinate) =>
      Number(coordinate)
        .toFixed(7)
        .replace(/\.?0+$/, ""),
    )
    .join(", ");

const createGoogleMapsLink = ({ latitude, longitude }) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;

const getProductUnitLabel = (product) =>
  String(product?.unit?.name || product?.unit_name || "UNIDAD").trim();

const getProductUnitAbbreviation = (product) => {
  const unitName = getProductUnitLabel(product);
  const normalizedName = unitName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const abbreviations = {
    UNIDAD: "und",
    UNIDADES: "und",
    KILOGRAMO: "kg",
    KILOGRAMOS: "kg",
    KILO: "kg",
    KILOS: "kg",
    GRAMO: "g",
    GRAMOS: "g",
    LIBRA: "lb",
    LIBRAS: "lb",
    LITRO: "L",
    LITROS: "L",
    MILILITRO: "ml",
    MILILITROS: "ml",
    METRO: "m",
    METROS: "m",
    CENTIMETRO: "cm",
    CENTIMETROS: "cm",
    PAQUETE: "paq",
    PAQUETES: "paq",
    CAJA: "cja",
    CAJAS: "cja",
    DOCENA: "doc",
    DOCENAS: "doc",
    PORCION: "porc",
    PORCIONES: "porc",
    PAR: "par",
    PARES: "par",
  };
  return abbreviations[normalizedName] || unitName;
};

const formatStockQuantity = (stock) =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(
    Number(stock) || 0,
  );

const DELIVERY_PLACE_SEARCH_URL = "https://photon.komoot.io/api/";
const DELIVERY_PLACE_REVERSE_URL = "https://photon.komoot.io/reverse";
const DELIVERY_PLACE_MAX_DISTANCE_KM = 15;

const getDeliveryPlaceLabel = (properties = {}) => {
  const streetAddress = [properties.street, properties.housenumber]
    .filter(Boolean)
    .join(" ");
  const primary = streetAddress || properties.name;
  const locality = [
    properties.district,
    properties.suburb,
    properties.city,
    properties.state,
    properties.country,
  ].filter(Boolean);
  return [primary, ...locality]
    .filter(
      (part, index, values) =>
        part &&
        values.findIndex(
          (value) =>
            String(value).toLowerCase() === String(part).toLowerCase(),
        ) === index,
    )
    .join(", ");
};

const getCoordinateDistanceKm = (first, second) => {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(first.latitude)) *
      Math.cos(toRadians(second.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

const TextField = ({
  label,
  value,
  setValue,
  placeholder,
  type = "text",
  inputRef,
  onChange,
  onBlur,
  onPaste,
  onPasteValue,
  onClear,
  size = "sm",
}) => (
  <div>
    <label
      className={`block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant ${size === "compact" ? "mb-0.5" : "mb-1"}`}
    >
      {label}
    </label>
    <div className="relative">
      <input
        ref={inputRef}
        type={type}
        value={value}
        inputMode={type === "number" ? "numeric" : undefined}
        pattern={type === "number" ? "\\d*" : undefined}
        onChange={
          onChange ??
          ((e) => {
            const v = e.target.value;
            if (type === "number") {
              const cleaned = v.replace(/\D/g, "");
              setValue(cleaned);
            } else {
              setValue(v);
            }
          })
        }
        onBlur={onBlur}
        onPaste={onPaste}
        placeholder={placeholder}
        className={`w-full rounded-lg bg-surface pr-10 text-on-surface border-outline focus:outline-none focus:border-primary ${
          size === "md"
            ? "p-2 text-base"
            : size === "compact"
              ? "p-1.5 text-base"
              : "p-2 text-xs"
        }`}
      />
      <span
        role="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (value) {
            setValue("");
            onClear?.();
          } else pasteToField(setValue, onPasteValue);
        }}
        onFocus={() => {
          if (!value) pasteToField(setValue, onPasteValue);
        }}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
      >
        <span className="material-symbols-outlined text-base mt-2">
          {value ? "close" : "content_paste"}
        </span>
      </span>
    </div>
  </div>
);

const formatPrice = (price) => {
  return Math.round(price)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

const formatInteger = (value) => String(value);

const parseDecimalQuantity = (value) => {
  const normalized = String(value ?? "").replace(",", ".");
  if (!/^\d*(\.\d{0,3})?$/.test(normalized)) return null;
  if (!normalized || normalized === ".") return null;
  const quantity = Number(normalized);
  return Number.isFinite(quantity) ? quantity : null;
};

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
    const includedOptions = (group.opciones || []).filter(
      (option) => Number(option.precio_extra || 0) === 0,
    );

    if (group.selectionType === "multiple") {
      selections[group.id] = includedOptions.map((option) => option.id);
    } else {
      const defaultOption = includedOptions[0] || group.opciones?.[0] || null;
      selections[group.id] = defaultOption?.id || null;
    }
  });
  return selections;
};

const getSelectedOptionItems = (product, selections) => {
  if (!product || !product.optionGroups) return [];
  return product.optionGroups.flatMap((group) => {
    const selected = selections[group.id];
    if (group.selectionType === "multiple") {
      return (Array.isArray(selected) ? selected : [])
        .map((optionId) => group.opciones.find((opt) => opt.id === optionId))
        .filter(Boolean);
    }
    const option = group.opciones.find((opt) => opt.id === selected);
    return option ? [option] : [];
  });
};

const getOptionIdsKey = (selectedOptions) =>
  selectedOptions
    .map((opt) => opt.id)
    .filter(Boolean)
    .sort()
    .join("__") || null;

const getOptionNames = (selectedOptions) =>
  selectedOptions.map((opt) => opt.nombre).filter(Boolean);

const getOptionExtraPrice = (selectedOptions) =>
  selectedOptions.reduce((sum, opt) => sum + (opt.precio_extra || 0), 0);

const getInitialCartPrice = (item) => {
  const storedInitialPrice = Number(item?.initPrice || 0);
  if (storedInitialPrice > 0) return storedInitialPrice;

  const finalPrice = Number(item?.price || 0);
  const extraPrice = getOptionExtraPrice(
    Array.isArray(item?.selectedOptions) ? item.selectedOptions : [],
  );
  return Math.max(0, finalPrice - extraPrice);
};

const createCartItemFromSelection = (
  product,
  selectedOptions,
  note,
  qty = 1,
) => {
  const optionIdsKey = getOptionIdsKey(selectedOptions);
  const optionNames = getOptionNames(selectedOptions);
  const extraPrice = getOptionExtraPrice(selectedOptions);
  const cartId = Date.now();

  return {
    ...product,
    id: product.id,
    productId: product.id,
    cartId,
    qty,
    note: note?.trim() || "",
    optionIdsKey,
    optionNames,
    selectedOptions,
    initPrice: Number(product.price || 0),
    price: Number(product.price || 0) + extraPrice,
    name: product.name,
    image_url: product.image_url || product.image || product.imageUrl || "",
  };
};

const numeroALetras = (num) => {
  if (num === 0) return "CERO PESOS";

  const unidades = [
    "",
    "UN",
    "DOS",
    "TRES",
    "CUATRO",
    "CINCO",
    "SEIS",
    "SIETE",
    "OCHO",
    "NUEVE",
  ];
  const decenas = [
    "",
    "DIEZ",
    "VEINTE",
    "TREINTA",
    "CUARENTA",
    "CINCUENTA",
    "SESENTA",
    "SETENTA",
    "OCHENTA",
    "NOVENTA",
  ];
  const especiales = [
    "DIEZ",
    "ONCE",
    "DOCE",
    "TRECE",
    "CATORCE",
    "QUINCE",
    "DIECISEIS",
    "DIECISIETE",
    "DIECIOCHO",
    "DIECINUEVE",
  ];
  const centenas = [
    "",
    "CIENTO",
    "DOSCIENTOS",
    "TRESCIENTOS",
    "CUATROCIENTOS",
    "QUINIENTOS",
    "SEISCIENTOS",
    "SETECIENTOS",
    "OCHOCIENTOS",
    "NOVECIENTOS",
  ];

  const convertirSeccion = (n) => {
    let output = "";
    if (n >= 100) {
      output += (n === 100 ? "CIEN" : centenas[Math.floor(n / 100)]) + " ";
      n %= 100;
    }
    if (n >= 10 && n <= 19) {
      output += especiales[n - 10];
    } else if (n >= 20) {
      const d = Math.floor(n / 10);
      const u = n % 10;
      if (n === 20) output += "VEINTE";
      else if (d === 2) output += "VEINTI" + unidades[u];
      else output += decenas[d] + (u > 0 ? " Y " + unidades[u] : "");
    } else if (n > 0) {
      output += unidades[n];
    }
    return output.trim();
  };

  let n = Math.floor(num);
  let letras = "";

  // Manejo de MILES DE MILLONES (Para el 1.000.000.000)
  if (n >= 1000000000) {
    const milMillones = Math.floor(n / 1000000000);
    letras +=
      milMillones === 1 ? "MIL " : convertirSeccion(milMillones) + " MIL ";
    n %= 1000000000;
  }

  // Manejo de MILLONES
  if (n >= 1000000) {
    const millones = Math.floor(n / 1000000);
    letras +=
      millones === 1 && letras === ""
        ? "UN MILLÓN "
        : convertirSeccion(millones) + " MILLONES ";
    n %= 1000000;
  } else if (letras.includes("MIL") && !letras.includes("MILLONES")) {
    // Si veníamos de miles de millones pero el residuo de millones es 0
    letras += "MILLONES ";
  }

  // Manejo de MILES
  if (n >= 1000) {
    const miles = Math.floor(n / 1000);
    letras += miles === 1 ? "MIL " : convertirSeccion(miles) + " MIL ";
    n %= 1000;
  }

  // Unidades finales
  letras += convertirSeccion(n);

  return `${letras.trim()} PESOS`.replace(/\s+/g, " ");
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

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeWhatsappNumber = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("57")) return digits;
  return `57${digits.replace(/^0+/, "")}`;
};

const normalizePaymentMethod = (value) => {
  const method = String(value || "")
    .trim()
    .toLowerCase();
  const aliases = {
    cash: "efectivo",
    efectivo: "efectivo",
    card: "tarjeta",
    tarjeta: "tarjeta",
    credit_card: "tarjeta",
    transfer: "transferencia",
    transferencia: "transferencia",
    bank_transfer: "transferencia",
    split: "dividir",
    dividido: "dividir",
    dividir: "dividir",
  };
  return aliases[method] || method;
};

const hasUsableProductImage = (value) => {
  const imageUrl = String(value ?? "").trim();
  return imageUrl !== "" && !imageUrl.includes("placehold.co");
};

const POS = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [cart, setCart] = useState([]);
  const [quantityDrafts, setQuantityDrafts] = useState({});
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [removingItems, setRemovingItems] = useState(new Set());
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [showOutOfStockWarning, setShowOutOfStockWarning] = useState(false);
  const [outOfStockProduct, setOutOfStockProduct] = useState(null);
  const [outOfStockMessage, setOutOfStockMessage] = useState("");
  const [outOfStockCartId, setOutOfStockCartId] = useState(null);
  const [pendingOutOfStockQuantity, setPendingOutOfStockQuantity] =
    useState(null);
  const [showOrderSentModal, setShowOrderSentModal] = useState(false);
  const [showTicketLimitNotice, setShowTicketLimitNotice] = useState(false);
  const [showUpdateSuccessModal, setShowUpdateSuccessModal] = useState(false);
  const [showReservationSuccessModal, setShowReservationSuccessModal] =
    useState(false);
  const [createdReservation, setCreatedReservation] = useState(null);
  const [sentOrder, setSentOrder] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [optionModalOpen, setOptionModalOpen] = useState(false);
  const [activeProduct, setActiveProduct] = useState(null);
  const [optionSelections, setOptionSelections] = useState({});
  const [optionNote, setOptionNote] = useState("");
  const [optionQuantity, setOptionQuantity] = useState(1);
  const [optionValidationError, setOptionValidationError] = useState("");
  const [instruction, setInstruction] = useState("");
  const [showInfo, setShowInfo] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobilePanel, setMobilePanel] = useState("products");
  const [toastItems, setToastItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([{ id: "all", name: "Todo" }]);
  const [categoryMap, setCategoryMap] = useState({});
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isProductCatalogReady, setIsProductCatalogReady] = useState(false);
  const [businessId, setBusinessId] = useState(null);
  const [inventoryEnabled, setInventoryEnabled] = useState(false);
  const [deliverySettings, setDeliverySettings] = useState(null);
  const [deliveryClock, setDeliveryClock] = useState(() => new Date());
  const [deliveryBusinessLogoUrl, setDeliveryBusinessLogoUrl] = useState("");
  const [deliveryBusinessDetails, setDeliveryBusinessDetails] = useState({
    name: "",
    address: "",
    phone: "",
  });
  const [isLoadingDeliverySettings, setIsLoadingDeliverySettings] =
    useState(true);
  const [deliverySettingsError, setDeliverySettingsError] = useState("");
  const toastTimers = useRef({});
  const submittingOrderRef = useRef(false);
  const cartScrollRef = useRef(null);
  const cartScrollRefMobile = useRef(null);
  const tableInputRef = useRef(null);
  const optionQuantityInputRef = useRef(null);
  const modalOverlayRef = useRef(null);
  const prevActiveElRef = useRef(null);

  useEffect(() => {
    if (!isModalOpen) return;
    prevActiveElRef.current = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setIsModalOpen(false);
        setActiveProduct(null);
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const ta = document.getElementById("instruction-textarea");
    if (ta) ta.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      try {
        prevActiveElRef.current?.focus?.();
      } catch {}
    };
  }, [isModalOpen]);

  useEffect(() => {
    if (!optionModalOpen) return;
    optionQuantityInputRef.current?.focus();
    optionQuantityInputRef.current?.select();
  }, [optionModalOpen, activeProduct]);

  const fetchCategoriesForBusiness = async (businessId) => {
    setIsLoadingCategories(true);

    if (!businessId) {
      setCategories([{ id: "all", name: "Todo" }]);
      setCategoryMap({});
      setIsLoadingCategories(false);
      return { categories: [{ id: "all", name: "Todo" }], categoryMap: {} };
    }

    try {
      const { data, error } = await supabase
        .from("categories_shop")
        .select("id,name,order_index,created_at")
        .eq("business_id", businessId)
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error cargando categorías:", error);
        return { categories: [{ id: "all", name: "Todo" }], categoryMap: {} };
      }

      const categoryOptions = [
        { id: "all", name: "Todo" },
        ...(data || []).map((item) => ({ id: item.id, name: item.name })),
      ];
      const categoryMapResult = (data || []).reduce((acc, item) => {
        acc[item.id] = item.name;
        return acc;
      }, {});

      setCategories(categoryOptions);
      setCategoryMap(categoryMapResult);
      return { categories: categoryOptions, categoryMap: categoryMapResult };
    } catch (error) {
      console.error("Error cargando categorías:", error);
      return { categories: [{ id: "all", name: "Todo" }], categoryMap: {} };
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const getProductCacheKey = (businessIdKey) =>
    `pos-products-cache-${businessIdKey}`;

  const getDeliverySettingsCacheKey = (businessIdKey) =>
    `pos-delivery-settings-cache-${businessIdKey}`;

  const getDeliveryLogoCacheKey = (businessIdKey) =>
    `pos-delivery-logo-cache-${businessIdKey}`;

  const readDeliveryLogoCache = (businessIdKey) => {
    try {
      return localStorage.getItem(getDeliveryLogoCacheKey(businessIdKey)) || "";
    } catch (error) {
      console.warn("No se pudo leer el logo guardado de la tienda:", error);
      return "";
    }
  };

  const writeDeliveryLogoCache = (businessIdKey, logoUrl) => {
    try {
      if (logoUrl) {
        localStorage.setItem(getDeliveryLogoCacheKey(businessIdKey), logoUrl);
      } else {
        localStorage.removeItem(getDeliveryLogoCacheKey(businessIdKey));
      }
    } catch (error) {
      console.warn("No se pudo guardar el logo de la tienda:", error);
    }
  };

  const readDeliverySettingsCache = (businessIdKey) => {
    try {
      const cached = localStorage.getItem(
        getDeliverySettingsCacheKey(businessIdKey),
      );
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (error) {
      console.warn("No se pudo leer la ubicación guardada de la tienda:", error);
      return null;
    }
  };

  const writeDeliverySettingsCache = (businessIdKey, settings) => {
    try {
      localStorage.setItem(
        getDeliverySettingsCacheKey(businessIdKey),
        JSON.stringify(settings),
      );
    } catch (error) {
      console.warn("No se pudo guardar la ubicación de la tienda:", error);
    }
  };

  const readProductCache = (businessIdKey) => {
    try {
      const cached = localStorage.getItem(getProductCacheKey(businessIdKey));
      if (!cached) return [];
      const parsed = JSON.parse(cached);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("No se pudo leer el caché de productos:", error);
      return [];
    }
  };

  const writeProductCache = (businessIdKey, nextProducts) => {
    try {
      localStorage.setItem(
        getProductCacheKey(businessIdKey),
        JSON.stringify(nextProducts),
      );
    } catch (error) {
      console.warn("No se pudo guardar el caché de productos:", error);
    }
  };

  const fetchProductsForBusiness = async (businessId, categoryMap = {}) => {
    if (!businessId) {
      setProducts([]);
      setIsLoadingProducts(false);
      setIsProductCatalogReady(false);
      return;
    }

    const cachedProducts = readProductCache(businessId);
    setIsProductCatalogReady(false);
    if (cachedProducts.length > 0) {
      setProducts(cachedProducts);
    } else {
      setProducts([]);
    }
    setIsLoadingProducts(true);

    try {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id,name,description,price,stock,image_url,is_active,is_sold_out,category_id,order_index,created_at,unit_id,unit:units(id,name,allows_fraction)",
        )
        .eq("business_id", businessId)
        .eq("is_active", true)
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error cargando productos:", error);
        if (cachedProducts.length > 0) {
          setProducts(cachedProducts);
          setIsProductCatalogReady(
            cachedProducts.every(
              (product) =>
                Array.isArray(product.optionGroups) &&
                typeof product.hasOptionGroups === "boolean",
            ),
          );
        } else {
          setProducts([]);
          setIsProductCatalogReady(false);
        }
        return;
      }

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

      const normalizedProducts = (data || []).map((item) => {
        const groups = optionGroupsByProduct[item.id] || [];
        const productDescription = item.description || item.desc || "";
        return {
          id: item.id,
          productId: item.id,
          name: item.name,
          category: item.category_id || "otros",
          categoryName: categoryMap[item.category_id] || "Otros",
          price: Number(item.price || 0),
          description: productDescription,
          desc: productDescription,
          image_url: item.image_url || item.image || item.imageUrl || "",
          optionGroups: groups,
          hasOptionGroups: groups.length > 0,
          stock: Number(item.stock || 0),
          unit: item.unit || { id: item.unit_id, name: "UNIDAD", allows_fraction: false },
          soldOut: item.is_sold_out || item.is_soldout || false,
          orderIndex: Number(item.order_index || 0),
        };
      });

      setProducts(normalizedProducts);
      writeProductCache(businessId, normalizedProducts);
      setIsProductCatalogReady(true);
    } catch (error) {
      console.error("Error cargando productos:", error);
      if (cachedProducts.length > 0) {
        setProducts(cachedProducts);
        setIsProductCatalogReady(
          cachedProducts.every(
            (product) =>
              Array.isArray(product.optionGroups) &&
              typeof product.hasOptionGroups === "boolean",
          ),
        );
      } else {
        setProducts([]);
        setIsProductCatalogReady(false);
      }
    } finally {
      setIsLoadingProducts(false);
    }
  };

  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.id) {
        setBusinessId(null);
        setInventoryEnabled(false);
        setDeliverySettings(null);
        setDeliveryBusinessLogoUrl("");
        setIsLoadingDeliverySettings(false);
        setProducts([]);
        setIsProductCatalogReady(false);
        setCategories([{ id: "all", name: "Todo" }]);
        setCategoryMap({});
        setIsLoadingCategories(false);
        setIsLoadingProducts(false);
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error cargando perfil:", error);
        setBusinessId(null);
        setInventoryEnabled(false);
        setDeliverySettings(null);
        setDeliveryBusinessLogoUrl("");
        setIsLoadingDeliverySettings(false);
        setProducts([]);
        setIsProductCatalogReady(false);
        setIsLoadingCategories(false);
        setIsLoadingProducts(false);
        return;
      }

      if (!profile?.business_id) {
        setBusinessId(null);
        setInventoryEnabled(false);
        setDeliverySettings(null);
        setDeliveryBusinessLogoUrl("");
        setIsLoadingDeliverySettings(false);
        setProducts([]);
        setIsProductCatalogReady(false);
        setCategories([{ id: "all", name: "Todo" }]);
        setCategoryMap({});
        setIsLoadingCategories(false);
        setIsLoadingProducts(false);
        return;
      }

      const cachedDeliverySettings = readDeliverySettingsCache(
        profile.business_id,
      );
      setDeliverySettings(cachedDeliverySettings);
      setDeliveryBusinessLogoUrl(
        readDeliveryLogoCache(profile.business_id),
      );
      setDeliverySettingsError("");
      setIsLoadingDeliverySettings(!cachedDeliverySettings);
      setBusinessId(profile.business_id);
      const { categoryMap: fetchedCategoryMap } =
        await fetchCategoriesForBusiness(profile.business_id);
      await fetchProductsForBusiness(profile.business_id, fetchedCategoryMap);
    };

    loadProfile();
  }, [user]);

  useEffect(() => {
    if (!businessId) return undefined;

    let cancelled = false;
    const loadPlanAccess = async () => {
      const { data, error } = await supabase.rpc("get_business_plan_access");
      if (cancelled) return;
      if (error) {
        console.error("Error consultando acceso al inventario:", error);
        setInventoryEnabled(true);
        return;
      }
      setInventoryEnabled(Boolean(data?.inventory_enabled));
    };

    loadPlanAccess();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return undefined;

    let cancelled = false;

    const loadDeliverySettings = async () => {
      try {
        const { data, error } = await supabase
          .from("business_info")
          .select(
            "latitude,longitude,address,whatsapp_phone,delivery_fee_per_km,min_delivery_fee,max_delivery_fee,night_delivery_surcharge_enabled,night_delivery_surcharge_start,night_delivery_surcharge_end,night_delivery_surcharge_percent,tip_percent",
          )
          .eq("business_id", businessId)
          .maybeSingle();

        if (cancelled) return;
        if (error) {
          console.error("Error cargando tarifas de domicilio:", error);
          setDeliverySettingsError(
            "No se pudo cargar la configuración de domicilio.",
          );
          setDeliverySettings(
            (current) =>
              current || readDeliverySettingsCache(businessId),
          );
        } else {
          setDeliverySettings(data || null);
          if (data) writeDeliverySettingsCache(businessId, data);
        }
      } catch (error) {
        if (cancelled) return;
        console.error("Error cargando tarifas de domicilio:", error);
        setDeliverySettingsError(
          "No se pudo cargar la configuración de domicilio.",
        );
        setDeliverySettings(
          (current) => current || readDeliverySettingsCache(businessId),
        );
      } finally {
        if (!cancelled) setIsLoadingDeliverySettings(false);
      }
    };

    loadDeliverySettings();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  useEffect(() => {
    if (!deliverySettings?.night_delivery_surcharge_enabled) return undefined;
    const timer = window.setInterval(() => setDeliveryClock(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, [deliverySettings?.night_delivery_surcharge_enabled]);

  useEffect(() => {
    if (!businessId) return undefined;

    let cancelled = false;
    Promise.all([
      supabase
        .from("businesses")
        .select("name,logo_url")
        .eq("id", businessId)
        .maybeSingle(),
      supabase
        .from("business_info")
        .select("address,whatsapp_phone")
        .eq("business_id", businessId)
        .maybeSingle(),
    ])
      .then(([{ data, error }, { data: businessInfo, error: infoError }]) => {
        if (cancelled) return;
        if (error || infoError) {
          console.warn(
            "No se pudieron cargar los datos del negocio para la factura:",
            error || infoError,
          );
        }
        if (error) {
          return;
        }
        const logoUrl = data?.logo_url || "";
        setDeliveryBusinessLogoUrl(logoUrl);
        setDeliveryBusinessDetails({
          name: data?.name || "",
          address: businessInfo?.address || "",
          phone: businessInfo?.whatsapp_phone || "",
        });
        writeDeliveryLogoCache(businessId, logoUrl);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("No se pudieron cargar los datos del negocio:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return undefined;

    const channel = supabase
      .channel(`pos-products-${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "products",
          filter: `business_id=eq.${businessId}`,
        },
        (payload) => {
          const productId = payload.new?.id || payload.old?.id;
          if (!productId) return;

          if (payload.eventType === "DELETE" || !payload.new?.is_active) {
            setProducts((current) =>
              current.filter((product) => product.id !== productId),
            );
            return;
          }

          const nextProduct = payload.new;
          setProducts((current) => {
            const exists = current.some((product) => product.id === productId);
            if (!exists) return current;

            return current.map((product) =>
              product.id === productId
                ? {
                    ...product,
                    name: nextProduct.name,
                    description: nextProduct.description || "",
                    desc: nextProduct.description || "",
                    price: Number(nextProduct.price || 0),
                    stock: Number(nextProduct.stock || 0),
                    image_url: nextProduct.image_url || "",
                    soldOut: Boolean(nextProduct.is_sold_out),
                    orderIndex: Number(nextProduct.order_index || 0),
                  }
                : product,
            );
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId]);

  // Estado para el item que cambia de color
  const [highlightItem, setHighlightItem] = useState(null);
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [address, setAddress] = useState("");
  const [deliveryCoordinatesInput, setDeliveryCoordinatesInput] = useState("");
  const [deliveryPlaceSuggestions, setDeliveryPlaceSuggestions] = useState([]);
  const [isSearchingDeliveryPlaces, setIsSearchingDeliveryPlaces] =
    useState(false);
  const [deliveryPlaceSearchError, setDeliveryPlaceSearchError] = useState("");
  const [deliveryDestination, setDeliveryDestination] = useState(null);
  const deliveryDestinationRef = useRef(null);
  const suppressDeliveryPlaceSearchRef = useRef("");
  const skipReverseGeocodeRef = useRef("");
  const [deliveryRouteDistanceMeters, setDeliveryRouteDistanceMeters] =
    useState(null);
  const [isCalculatingDeliveryRoute, setIsCalculatingDeliveryRoute] =
    useState(false);
  const [deliveryRouteError, setDeliveryRouteError] = useState("");
  const [isDeliveryMapFullscreen, setIsDeliveryMapFullscreen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerNumber, setCustomerNumber] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const [tableOccupancyWarning, setTableOccupancyWarning] = useState(null);
  const [showReservationModal, setShowReservationModal] = useState(false);
  const [reservationData, setReservationData] = useState({
    nombre: "",
    telefono: "",
    fecha: "",
    hora: "",
    personas: "1",
    notas: "",
    mesa: "",
  });
  const [referencePoint, setReferencePoint] = useState("");
  const [locationText, setLocationText] = useState("");
  const [moneyPaid, setMoneyPaid] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [editingOrder, setEditingOrder] = useState(null);
  const [editingSnapshot, setEditingSnapshot] = useState(null);

  useEffect(() => {
    const editMesa = location.state?.mesaEdit;
    if (!editMesa) return;
    setMobilePanel("resumen");

    const nextTable = String(editMesa.mesa || editMesa.numero || "");
    const nextCustomerName = editMesa.customerName || editMesa.nombre || "";
    const nextCustomerPhone = editMesa.customerPhone || editMesa.telefono || "";
    const nextCustomerNumber = editMesa.customerNumber || nextCustomerPhone;
    const orderNotesValue = editMesa.notes || editMesa.nota || "";
    const storedDeliveryMethod = normalizeDeliveryMethod(
      editMesa.deliveryMethod ||
        editMesa.metodoEntrega ||
        editMesa.orderType ||
        editMesa.order_type ||
        "table",
    );
    const storedAddress = editMesa.address || editMesa.delivery_address || "";
    const storedDeliveryLocation = editMesa.deliveryLocation;
    const storedDeliveryDestination =
      (storedDeliveryLocation &&
        parseMapCoordinates(
          `${storedDeliveryLocation.latitude},${storedDeliveryLocation.longitude}`,
        )) ||
      parseMapCoordinates(editMesa.deliveryMapLink) ||
      parseMapCoordinates(storedAddress);
    const editAddress =
      parseMapCoordinates(storedAddress) ? "" : storedAddress;
    const storedReferencePoint =
      editMesa.referencePoint || editMesa.delivery_instructions || "";
    const storedLocationText = editMesa.locationText || editMesa.punto || "";

    let existingPaymentMethods = editMesa.paymentMethods;
    if (typeof existingPaymentMethods === "string") {
      try {
        existingPaymentMethods = JSON.parse(existingPaymentMethods);
      } catch {
        existingPaymentMethods = [];
      }
    }
    existingPaymentMethods = Array.isArray(existingPaymentMethods)
      ? existingPaymentMethods
      : [];
    const metadataPaymentMethods = existingPaymentMethods
      .map((item) => ({
        method: normalizePaymentMethod(item.metodo || item.method),
        amount: Number(item.monto ?? item.amount ?? 0),
      }))
      .filter((item) => item.method);
    const normalizedStoredPaymentMethod = normalizePaymentMethod(
      editMesa.paymentMethod,
    );
    const existingPaymentMethod =
      metadataPaymentMethods.length > 1
        ? "dividir"
        : normalizedStoredPaymentMethod;
    const normalizedExistingPaymentMethods =
      existingPaymentMethod === "dividir"
        ? metadataPaymentMethods
        : existingPaymentMethod
          ? [
              {
                method: existingPaymentMethod,
                amount:
                  metadataPaymentMethods[0]?.amount ||
                  Number(editMesa.total) ||
                  0,
              },
            ]
          : metadataPaymentMethods;
    if (
      existingPaymentMethod === "efectivo" &&
      normalizedExistingPaymentMethods.every((item) => !item.amount)
    ) {
      normalizedExistingPaymentMethods[0] = {
        method: "efectivo",
        amount: Number(editMesa.total) || 0,
      };
    }

    setEditingOrder(editMesa);
    setEditingSnapshot({
      cart: (editMesa.comanda || []).map((item) => ({
        productId: item.productId || item.id,
        qty: Number(item.qty || 1),
        price: Number(item.price || item.precio || 0),
        name: item.name || item.item || "Producto",
        note: item.note || item.notes || "",
        options: item.optionNames || item.options || [],
      })),
      deliveryMethod: storedDeliveryMethod,
      address: editAddress,
      deliveryDestination:
        storedDeliveryMethod === "delivery" ? storedDeliveryDestination : null,
      referencePoint: storedReferencePoint,
      locationText: storedLocationText,
      paymentMethod: existingPaymentMethod,
      moneyPaid:
        existingPaymentMethod === "efectivo"
          ? Number(normalizedExistingPaymentMethods[0]?.amount) || 0
          : 0,
      splitPayments:
        existingPaymentMethod === "dividir"
          ? normalizedExistingPaymentMethods.map((item) => ({
              method: item.method || "",
              amount: Number(item.amount) || 0,
            }))
          : [],
      orderNotes: orderNotesValue,
      customerName: nextCustomerName,
      customerNumber: nextCustomerNumber,
      selectedTable: storedDeliveryMethod === "table" ? nextTable : "",
    });
    setDeliveryMethod(storedDeliveryMethod);
    skipReverseGeocodeRef.current = storedDeliveryDestination
      ? `${storedDeliveryDestination.latitude.toFixed(6)},${storedDeliveryDestination.longitude.toFixed(6)}`
      : "";
    deliveryDestinationRef.current =
      storedDeliveryMethod === "delivery" ? storedDeliveryDestination : null;
    setDeliveryDestination(
      storedDeliveryMethod === "delivery" ? storedDeliveryDestination : null,
    );
    setDeliveryRouteDistanceMeters(null);
    setIsCalculatingDeliveryRoute(
      storedDeliveryMethod === "delivery" && Boolean(storedDeliveryDestination),
    );
    setDeliveryRouteError("");
    setPaymentMethod(existingPaymentMethod);
    setMoneyPaid(
      existingPaymentMethod === "efectivo"
        ? String(normalizedExistingPaymentMethods[0]?.amount || "")
        : "",
    );
    if (existingPaymentMethod === "dividir") {
      setSplitPayments(
        (normalizedExistingPaymentMethods.length
          ? normalizedExistingPaymentMethods
          : [{ method: "", amount: "" }]
        ).map((item) => ({
          method: item.method,
          amount: String(item.amount),
        })),
      );
    }
    setSelectedTable(storedDeliveryMethod === "table" ? nextTable : "");
    setAddress(editAddress);
    setDeliveryCoordinatesInput(
      storedDeliveryDestination
        ? formatMapCoordinates(storedDeliveryDestination)
        : "",
    );
    setReferencePoint(storedReferencePoint);
    setLocationText(storedLocationText);
    setCustomerName(nextCustomerName);
    setCustomerNumber(nextCustomerNumber);
    setOrderNotes(orderNotesValue);
    setReservationData({
      nombre: nextCustomerName,
      telefono: nextCustomerPhone,
      fecha: editMesa.fechaReserva || "",
      hora: editMesa.horaReserva || "",
      personas: String(editMesa.personas || 1),
      notas: orderNotesValue,
      mesa: nextTable,
    });

    if (Array.isArray(editMesa.comanda) && editMesa.comanda.length > 0) {
      setCart(
        editMesa.comanda.map((item, index) => ({
          cartId: item.cartId || item.id || `${item.name || "item"}-${index}`,
          orderItemId: item.orderItemId || item.id || null,
          orderBatchId: item.orderBatchId || null,
          productId: item.productId || item.id || index,
          id: item.productId || item.id || index,
          qty: Number(item.qty || 1),
          pendingQty: 0,
          name: item.name || item.item || "Producto",
          price: Number(item.price || item.precio || 0),
          initPrice: Number(item.initPrice || item.precioInicial || 0),
          note: item.note || item.notes || "",
          notas: item.note || item.notes || "",
          optionNames: item.optionNames || item.options || [],
          selectedOptions: item.selectedOptions || [],
          options: item.selectedOptions || item.options || [],
          unit: item.unit || {
            name: item.unit_name || "UNIDAD",
            allows_fraction: false,
          },
          unit_name: item.unit_name || "UNIDAD",
          image_url: item.image_url || item.image || item.imageUrl || "",
        })),
      );
    }
  }, [location.state]);

  // Las órdenes guardan el product_id; la imagen y la unidad se completan
  // desde el catálogo cuando este termina de cargar.
  useEffect(() => {
    if (!location.state?.mesaEdit || products.length === 0) return;

    setCart((currentCart) =>
      currentCart.map((item) => {
        const product = products.find(
          (catalogProduct) => catalogProduct.id === item.productId,
        );
        const imageUrl =
          product?.image_url || product?.image || product?.imageUrl || "";

        return {
          ...item,
          unit: product?.unit || item.unit,
          unit_name: product?.unit?.name || item.unit_name || "UNIDAD",
          image_url: item.image_url || imageUrl,
        };
      }),
    );
  }, [location.state, products]);

  useEffect(() => {
    if (!location.state?.mesaEdit || products.length === 0) return;

    setCart((currentCart) =>
      currentCart.map((item) => {
        const product = products.find(
          (catalogProduct) => catalogProduct.id === item.productId,
        );
        const basePrice = Number(product?.price || 0);
        const storedPrice = Number(item.price || 0);
        const extraPrice = getOptionExtraPrice(
          Array.isArray(item.selectedOptions) ? item.selectedOptions : [],
        );

        if (basePrice > 0 && storedPrice === basePrice && extraPrice > 0) {
          return { ...item, price: storedPrice + extraPrice };
        }

        return item;
      }),
    );
  }, [location.state, products]);

  const cancelEditingOrder = () => {
    resetAllPOSState(false);
    setEditingOrder(null);
    setEditingSnapshot(null);
    navigate("/pos", { replace: true, state: null });
  };

  const normalizePhoneNumber = (value) => {
    if (!value) return "";
    const cleaned = String(value).replace(/\D/g, "");
    return cleaned;
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

  // Verificar si una mesa está ocupada o reservada en la ventana de bloqueo
  const checkTableOccupancy = async (tableNumber) => {
    if (!tableNumber || !businessId) {
      setTableOccupancyWarning(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, status, table_status, is_reservation, customer_name, fecha_reserva, hora_reserva, personas, created_at",
        )
        .eq("business_id", businessId)
        .eq("order_type", "table")
        .eq("mesa", Number(tableNumber))
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("Error verificando mesa:", error);
        setTableOccupancyWarning(null);
        return;
      }

      const activeStatuses = ["pending", "confirmed", "preparing", "ready"];
      const today = getLocalDateKey();
      const activeOrder = (data || []).find((order) => {
        const hasExplicitTableStatus =
          order.table_status !== null && order.table_status !== undefined;
        const tableStatus = String(order.table_status ?? "")
          .trim()
          .toLowerCase();
        const orderStatus = String(order.status || "")
          .trim()
          .toLowerCase();

        return (
          (Boolean(order.is_reservation) &&
            tableStatus === "reserva" &&
            (!order.fecha_reserva || order.fecha_reserva === today)) ||
          (!order.is_reservation &&
            (tableStatus === "ocupada" ||
              (!hasExplicitTableStatus &&
                activeStatuses.includes(orderStatus))))
        );
      });

      if (!activeOrder) {
        setTableOccupancyWarning(null);
        return;
      }

      if (!activeOrder.is_reservation) {
        const nombre = activeOrder.customer_name || "cliente";
        setTableOccupancyWarning({
          occupied: true,
          message: `⚠️ La mesa está ocupada por ${nombre}. Selecciona otra mesa.`,
        });
        return;
      }

      const fechaReserva = activeOrder.fecha_reserva;
      const horaReserva = activeOrder.hora_reserva;
      const nombre = activeOrder.customer_name || "cliente";

      if (!fechaReserva || !horaReserva) {
        setTableOccupancyWarning({
          occupied: true,
          message: `⚠️ La mesa está reservada para ${nombre}. Selecciona otra mesa.`,
        });
        return;
      }

      const personas = activeOrder.personas || 1;
      const fechaMostrar = new Date(
        `${fechaReserva}T${horaReserva}`,
      ).toLocaleString("es-CO", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      setTableOccupancyWarning({
        occupied: true,
        message: `⚠️ Mesa reservada para ${nombre} el ${fechaMostrar} (${personas} personas). Selecciona otra mesa.`,
      });
    } catch (err) {
      console.error("Error en checkTableOccupancy:", err);
      setTableOccupancyWarning(null);
    }
  };

  const isEditingTableOrder = Boolean(location.state?.mesaEdit);

  // Cuando cambia selectedTable, verificar ocupancia
  useEffect(() => {
    if (selectedTable && deliveryMethod === "table" && !isEditingTableOrder) {
      checkTableOccupancy(selectedTable);
    } else {
      setTableOccupancyWarning(null);
    }
  }, [selectedTable, deliveryMethod, businessId, isEditingTableOrder]);

  // Función para autorellenar campos de entrega
  const autoFillDeliveryFields = () => {
    setCustomerName("Consumidor Final");
    setCustomerNumber("2222222222");
  };

  const [splitPayments, setSplitPayments] = useState([
    { method: "", amount: "" },
  ]);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [numSplits, setNumSplits] = useState(2);

  // Función para inicializar divisiones - Mantiene valores existentes
  const initializeSplits = (count) => {
    setSplitPayments((prevPayments) => {
      if (count > prevPayments.length) {
        // Si aumenta el número, agrega nuevos splits vacíos
        const newSplits = [...prevPayments];
        for (let i = prevPayments.length; i < count; i++) {
          newSplits.push({
            method: "",
            amount: "",
          });
        }
        return newSplits;
      } else if (count < prevPayments.length) {
        // Si disminuye el número, remove los últimos splits
        return prevPayments.slice(0, count);
      }
      // Si el número es igual, no hace nada
      return prevPayments;
    });
    setNumSplits(count);
  };

  // Opciones de pago por método de entrega
  const paymentOptions = {
    pickup: ["efectivo", "tarjeta", "transferencia"],
    table: ["efectivo", "tarjeta", "transferencia"],
    delivery: ["efectivo", "tarjeta", "transferencia"],
    point: ["efectivo", "tarjeta", "transferencia"],
  };

  const deliveryLabels = {
    pickup: { label: "Recoger", icon: "flag" },
    table: { label: "Mesa", icon: "table_bar" },
    delivery: { label: "Domicilio", icon: "local_shipping" },
    point: { label: "En Punto", icon: "location_on" },
  };

  const paymentLabels = {
    efectivo: { label: "Efectivo", icon: "payments" },
    tarjeta: { label: "Tarjeta", icon: "credit_card" },
    transferencia: { label: "Transferencia", icon: "account_balance" },
    dividir: { label: "Dividir", icon: "call_split" }, // El nuevo método
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      searchTerm === "" ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });
  const addToast = (name, type = "success") => {
    const id = Date.now() + Math.random(); // ID único para cada burbuja

    setToastItems((prev) => [...prev, { id, name, type, exiting: false }]);

    setTimeout(() => {
      setToastItems((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
      );

      setTimeout(() => {
        setToastItems((prev) => prev.filter((t) => t.id !== id));
      }, 400);
    }, 2200);
  };

  const addProductToast = (name) => {
    addToast(name, "success");
  };

  const addToCart = (product, skipStockWarning = false) => {
    if (!isProductCatalogReady) {
      addToast("Cargando opciones del producto...", "error");
      return;
    }

    const quantityInCart = cart.reduce(
      (sum, item) =>
        item.productId === product?.id ? sum + Number(item.qty || 0) : sum,
      0,
    );
    const originalQuantityInEdit =
      editingSnapshot?.cart.reduce(
        (sum, item) =>
          item.productId === product?.id ? sum + Number(item.qty || 0) : sum,
        0,
      ) || 0;
    const numericStock = Number(product?.stock);
    const hasFiniteStock =
      inventoryEnabled && Number.isFinite(numericStock);
    const editQuantityLimit =
      isEditingTableOrder && originalQuantityInEdit > 0 && hasFiniteStock
        ? Math.max(0, numericStock + originalQuantityInEdit)
        : null;
    const isOutOfStock =
      product?.soldOut || (hasFiniteStock && numericStock <= 0);

    if (
      editQuantityLimit !== null &&
      quantityInCart >= editQuantityLimit &&
      !isOutOfStock &&
      !skipStockWarning
    ) {
      addToast(
        `Máximo disponible para esta mesa: ${editQuantityLimit} ${product.name}`,
        "error",
      );
      return;
    }

    const exceedsAvailableStock =
      !isEditingTableOrder &&
      hasFiniteStock &&
      quantityInCart >= Math.max(0, numericStock);

    if ((isOutOfStock || exceedsAvailableStock) && !skipStockWarning) {
      setOutOfStockProduct(product);
      setOutOfStockMessage(
        isOutOfStock
          ? inventoryEnabled
            ? "El sistema marca este producto como AGOTADO por su inventario. Aun así, puedes continuar la venta; el faltante quedará registrado en el inventario."
            : "Este producto está marcado manualmente como agotado. Aun así, puedes continuar esta venta desde el POS."
          : `El sistema indica que solo hay ${numericStock} ${getProductUnitLabel(product)} disponibles. Puedes continuar la venta; el excedente quedará registrado como faltante en el inventario.`,
      );
      setOutOfStockCartId(null);
      setPendingOutOfStockQuantity(null);
      setShowOutOfStockWarning(true);
      return;
    }

    if (product?.hasOptionGroups || product?.unit?.allows_fraction) {
      setActiveProduct(product);
      setOptionSelections(initializeOptionSelections(product));
      setOptionNote("");
      setOptionQuantity("1");
      setOptionValidationError("");
      setOptionModalOpen(true);
      return;
    }

    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      addProductToast(product.name);
    }

    setCart((prevCart) => {
      const existingItem = prevCart.find(
        (item) =>
          item.productId === product.id && !item.optionIdsKey && !item.note,
      );

      if (existingItem) {
        // Efectos visuales de resaltado
        setHighlightItem(existingItem.cartId);
        // Scroll automático al item
        setTimeout(() => {
          const element = document.querySelector(
            `[data-cart-id="${existingItem.cartId}"]`,
          );
          if (element && cartScrollRef.current) {
            cartScrollRef.current.scrollTop = element.offsetTop - 100;
          }
          if (element && cartScrollRefMobile.current) {
            cartScrollRefMobile.current.scrollTop = element.offsetTop - 100;
          }
        }, 0);
        setTimeout(() => setHighlightItem(null), 500);

        return prevCart.map((item) =>
          item.cartId === existingItem.cartId
            ? {
                ...item,
                qty: item.qty + 1,
                pendingQty: item.orderItemId
                  ? (item.pendingQty || 0) + 1
                  : item.pendingQty || 0,
              }
            : item,
        );
      }

      // Si es un producto nuevo
      const cartId = Date.now();
      setHighlightItem(cartId);
      // Scroll automático al item nuevo (al final del carrito)
      setTimeout(() => {
        const element = document.querySelector(`[data-cart-id="${cartId}"]`);
        if (element && cartScrollRef.current) {
          cartScrollRef.current.scrollTop = cartScrollRef.current.scrollHeight;
        }
        if (element && cartScrollRefMobile.current) {
          cartScrollRefMobile.current.scrollTop =
            cartScrollRefMobile.current.scrollHeight;
        }
      }, 0);
      setTimeout(() => setHighlightItem(null), 500);

      return [
        ...prevCart,
        {
          ...product,
          productId: product.id,
          cartId,
          qty: 1,
          pendingQty: 0,
          note: "",
          initPrice: Number(product.price || 0),
          image_url:
            product.image_url || product.image || product.imageUrl || "",
        },
      ];
    });
  };

  const continueWithOutOfStockProduct = () => {
    const product = outOfStockProduct;
    const cartId = outOfStockCartId;
    const pendingQuantity = pendingOutOfStockQuantity;
    setShowOutOfStockWarning(false);
    setOutOfStockProduct(null);
    setOutOfStockMessage("");
    setOutOfStockCartId(null);
    setPendingOutOfStockQuantity(null);
    if (cartId) {
      const item = cart.find((currentItem) => currentItem.cartId === cartId);
      if (item) updateQty(cartId, pendingQuantity || item.qty + 1);
    } else if (product) {
      addToCart(product, true);
    }
  };

  const clearCart = () => {
    if (cart.length > 0) {
      setShowConfirmModal(true);
    }
  };

  const openNoteModal = (e, product, existingNote = "") => {
    e.stopPropagation();
    if (product?.cartId) {
      setActiveProduct(product);
      setInstruction(existingNote);
      setIsModalOpen(true);
      return;
    }
    if (product?.hasOptionGroups) {
      setActiveProduct(product);
      setOptionSelections(initializeOptionSelections(product));
      setOptionNote(existingNote);
      setOptionValidationError("");
      setOptionModalOpen(true);
      return;
    }
    setActiveProduct(product);
    setInstruction(existingNote);
    setIsModalOpen(true);
  };

  const confirmOptionSelection = () => {
    if (!activeProduct) return;
    const requestedQuantity = activeProduct.unit?.allows_fraction
      ? parseDecimalQuantity(optionQuantity)
      : Number(optionQuantity);
    if (!requestedQuantity || requestedQuantity <= 0) {
      setOptionValidationError("Ingresa una cantidad válida.");
      return;
    }
    const existingQuantity = cart.reduce(
      (sum, item) =>
        item.productId === activeProduct.id
          ? sum + Number(item.qty || 0)
          : sum,
      0,
    );
    const availableStock = Number(activeProduct.stock);
    if (
      inventoryEnabled &&
      Number.isFinite(availableStock) &&
      existingQuantity + requestedQuantity > availableStock
    ) {
      addToast("Stock insuficiente. Se registrará el faltante.", "warning");
    }
    const selectedOptions = getSelectedOptionItems(
      activeProduct,
      optionSelections,
    );

    const missingRequired = (activeProduct.optionGroups || []).some((group) => {
      if (!group.obligatorio) return false;
      const selected = optionSelections[group.id];
      if (group.selectionType === "multiple") {
        return !Array.isArray(selected) || selected.length === 0;
      }
      return !selected;
    });

    if (missingRequired) {
      setOptionValidationError("Selecciona todas las opciones obligatorias.");
      return;
    }

    const newItem = createCartItemFromSelection(
      activeProduct,
      selectedOptions,
      optionNote,
      requestedQuantity,
    );

    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      addProductToast(newItem.name);
    }

    setCart((prevCart) => {
      const existingItem = prevCart.find(
        (item) =>
          item.productId === newItem.productId &&
          JSON.stringify(item.optionNames || item.options || []) ===
            JSON.stringify(newItem.optionNames || []) &&
          item.note === newItem.note,
      );

      if (existingItem) {
        setHighlightItem(existingItem.cartId);
        setTimeout(() => {
          const element = document.querySelector(
            `[data-cart-id="${existingItem.cartId}"]`,
          );
          if (element && cartScrollRef.current) {
            cartScrollRef.current.scrollTop = element.offsetTop - 100;
          }
          if (element && cartScrollRefMobile.current) {
            cartScrollRefMobile.current.scrollTop = element.offsetTop - 100;
          }
        }, 0);
        setTimeout(() => setHighlightItem(null), 500);

        return prevCart.map((item) =>
          item.cartId === existingItem.cartId
            ? {
                ...item,
                qty: Number(item.qty) + requestedQuantity,
                pendingQty: item.orderItemId
                  ? (item.pendingQty || 0) + requestedQuantity
                  : item.pendingQty || 0,
              }
            : item,
        );
      }

      setHighlightItem(newItem.cartId);
      setTimeout(() => {
        const element = document.querySelector(
          `[data-cart-id="${newItem.cartId}"]`,
        );
        if (element && cartScrollRef.current) {
          cartScrollRef.current.scrollTop = cartScrollRef.current.scrollHeight;
        }
        if (element && cartScrollRefMobile.current) {
          cartScrollRefMobile.current.scrollTop =
            cartScrollRefMobile.current.scrollHeight;
        }
      }, 0);
      setTimeout(() => setHighlightItem(null), 500);

      return [...prevCart, newItem];
    });

    setOptionModalOpen(false);
    setActiveProduct(null);
    setOptionSelections({});
    setOptionNote("");
    setOptionValidationError("");
  };

  const confirmWithNote = () => {
    if (activeProduct.cartId) {
      setCart(
        cart.map((item) =>
          item.cartId === activeProduct.cartId
            ? { ...item, note: instruction }
            : item,
        ),
      );
    } else {
      const cartId = Date.now();
      setCart([
        ...cart,
        { ...activeProduct, cartId, qty: 1, note: instruction },
      ]);
    }
    setIsModalOpen(false);
    setActiveProduct(null);
  };

  const removeFromCart = (cartId) => {
    setRemovingItems((prev) => new Set(prev).add(cartId));
    setTimeout(() => {
      setCart(cart.filter((item) => item.cartId !== cartId));
      setRemovingItems((prev) => {
        const newSet = new Set(prev);
        newSet.delete(cartId);
        return newSet;
      });
    }, 300);
  };

  const updateQty = (cartId, qty) => {
    if (qty === 0) {
      removeFromCart(cartId);
    } else {
      if (qty > cart.find((i) => i.cartId === cartId).qty) {
        setHighlightItem(cartId);
        setTimeout(() => setHighlightItem(null), 500);
      }
      setCart(
        cart.map((item) => {
          if (item.cartId !== cartId) return item;
          if (isEditingTableOrder && item.orderItemId) {
            const historicalQuantity = Math.max(
              0,
              Number(item.qty || 0) - Number(item.pendingQty || 0),
            );
            return {
              ...item,
              qty,
              pendingQty: Math.max(0, qty - historicalQuantity),
            };
          }
          return { ...item, qty };
        }),
      );
    }
  };

  const incrementCartItem = (cartItem) => {
    const quantityStep = cartItem.unit?.allows_fraction ? 0.1 : 1;
    const product = products.find((item) => item.id === cartItem.productId);
    if (!product) {
      if (isEditingTableOrder && cartItem.orderItemId) {
        setCart((prevCart) =>
          prevCart.map((item) =>
            item.cartId === cartItem.cartId
              ? {
                  ...item,
                  qty: Number((Number(item.qty) + quantityStep).toFixed(3)),
                  pendingQty: (item.pendingQty || 0) + quantityStep,
                }
              : item,
          ),
        );
        return;
      }
      updateQty(
        cartItem.cartId,
        Number((Number(cartItem.qty) + quantityStep).toFixed(3)),
      );
      return;
    }

    const originalQuantityInEdit =
      editingSnapshot?.cart.reduce(
        (sum, item) =>
          item.productId === cartItem.productId
            ? sum + Number(item.qty || 0)
            : sum,
        0,
      ) || 0;
    const numericStock = Number(product.stock);
    const isOutOfStock =
      product.soldOut ||
      (inventoryEnabled &&
        Number.isFinite(numericStock) &&
        numericStock <= 0);

    if (isOutOfStock) {
      setOutOfStockProduct(product);
      setOutOfStockCartId(cartItem.cartId);
      setPendingOutOfStockQuantity(null);
      setOutOfStockMessage(
        inventoryEnabled
          ? "El sistema marca este producto como AGOTADO por su inventario. Aun así, puedes continuar la venta; el faltante quedará registrado en el inventario."
          : "Este producto está marcado manualmente como agotado. Aun así, puedes continuar esta venta desde el POS.",
      );
      setShowOutOfStockWarning(true);
      return;
    }

    if (
      inventoryEnabled &&
      isEditingTableOrder &&
      originalQuantityInEdit > 0 &&
      Number.isFinite(numericStock)
    ) {
      const editQuantityLimit = Math.max(
        0,
        numericStock + originalQuantityInEdit,
      );
      if (cartItem.qty >= editQuantityLimit) {
        addToast(
          `Máximo disponible para esta mesa: ${editQuantityLimit} ${product.name}`,
          "error",
        );
        return;
      }
    }

    const exceedsAvailableStock =
      inventoryEnabled &&
      !isEditingTableOrder &&
      Number.isFinite(numericStock) &&
      Number(cartItem.qty) + quantityStep > Math.max(0, numericStock);

    if (isOutOfStock || exceedsAvailableStock) {
      setOutOfStockProduct(product);
      setOutOfStockCartId(cartItem.cartId);
      setPendingOutOfStockQuantity(null);
      setOutOfStockMessage(
        isOutOfStock
          ? "El sistema marca este producto como AGOTADO porque su inventario está en cero o en negativo. Aun así, puedes continuar la venta; el faltante quedará registrado en el inventario."
          : `El sistema indica que solo hay ${numericStock} ${getProductUnitLabel(product)} disponibles. Puedes continuar la venta; el excedente quedará registrado como faltante en el inventario.`,
      );
      setShowOutOfStockWarning(true);
      return;
    }

    // En una edicion, un renglón histórico no debe absorber unidades nuevas:
    // el incremento debe crear otro order_item con kitchen_dispatched=false.
    if (isEditingTableOrder && cartItem.orderItemId) {
      setCart((prevCart) =>
        prevCart.map((item) =>
          item.cartId === cartItem.cartId
            ? {
                ...item,
                qty: Number(item.qty) + quantityStep,
                pendingQty: (item.pendingQty || 0) + quantityStep,
              }
            : item,
        ),
      );
      return;
    }

    updateQty(
      cartItem.cartId,
      Number((Number(cartItem.qty) + quantityStep).toFixed(3)),
    );
  };

  const handleQtyInputChange = (cartId, value) => {
    const currentItem = cart.find((item) => item.cartId === cartId);
    const product = products.find((item) => item.id === currentItem?.productId);
    let qty;
    if (product?.unit?.allows_fraction) {
      const parsedQuantity = parseDecimalQuantity(value);
      if (parsedQuantity === null) return;
      qty = parsedQuantity;
    } else {
      const digits = String(value).replace(/\D/g, "");
      qty = digits ? Math.max(1, Number(digits)) : 1;
    }
    const originalQuantityInEdit =
      editingSnapshot?.cart.reduce(
        (sum, item) =>
          item.productId === currentItem?.productId
            ? sum + Number(item.qty || 0)
            : sum,
        0,
      ) || 0;
    const numericStock = Number(product?.stock);

    if (
      inventoryEnabled &&
      isEditingTableOrder &&
      originalQuantityInEdit > 0 &&
      Number.isFinite(numericStock)
    ) {
      const editQuantityLimit = Math.max(
        0,
        numericStock + originalQuantityInEdit,
      );
      if (qty > editQuantityLimit) {
        setOutOfStockProduct(product);
        setOutOfStockCartId(cartId);
        setPendingOutOfStockQuantity(qty);
        setOutOfStockMessage(
          `La cantidad escrita supera las ${editQuantityLimit} ${getProductUnitLabel(product)} disponibles para esta mesa. El sistema considera agotado el excedente, pero puedes continuar la venta y registrar el faltante en el inventario.`,
        );
        setShowOutOfStockWarning(true);
        return;
      }
    }

    if (isEditingTableOrder && currentItem?.orderItemId) {
      const historicalQuantity = Math.max(
        0,
        Number(currentItem.qty || 0) - Number(currentItem.pendingQty || 0),
      );
      setCart((prevCart) =>
        prevCart.map((item) =>
          item.cartId === cartId
            ? {
                ...item,
                qty,
                pendingQty: Math.max(0, qty - historicalQuantity),
              }
            : item,
        ),
      );
      return;
    }

    updateQty(cartId, product?.unit?.allows_fraction ? qty : Math.max(1, qty));
  };

  const commitQuantityDraft = (cartId) => {
    if (!Object.prototype.hasOwnProperty.call(quantityDrafts, cartId)) return;
    handleQtyInputChange(cartId, quantityDrafts[cartId]);
    setQuantityDrafts((current) => {
      const next = { ...current };
      delete next[cartId];
      return next;
    });
  };

  const handleDeliveryDestinationChange = useCallback((destination) => {
    const currentDestination = deliveryDestinationRef.current;
    const unchanged =
      destination &&
      currentDestination &&
      Math.abs(destination.latitude - currentDestination.latitude) <
        0.0000001 &&
      Math.abs(destination.longitude - currentDestination.longitude) <
        0.0000001;

    if (unchanged) {
      setDeliveryCoordinatesInput(formatMapCoordinates(destination));
      return;
    }

    deliveryDestinationRef.current = destination;
    setDeliveryDestination(destination);
    setDeliveryCoordinatesInput(
      destination ? formatMapCoordinates(destination) : "",
    );
    setDeliveryRouteDistanceMeters(null);
    setDeliveryRouteError("");
    setIsCalculatingDeliveryRoute(Boolean(destination));
  }, []);

  const handleDeliveryChange = (method) => {
    if (deliveryMethod === method) {
      setDeliveryMethod("");
      setIsDeliveryMapFullscreen(false);
      setSelectedTable("");
      setAddress("");
      handleDeliveryDestinationChange(null);
      setReferencePoint("");
      setLocationText("");
      handlePaymentMethodChange("");
      return;
    }

    setDeliveryMethod(method);
    if (method !== "delivery") setIsDeliveryMapFullscreen(false);

    if (method !== "table") {
      setSelectedTable("");
    } else if (!selectedTable && editingOrder?.mesa) {
      setSelectedTable(String(editingOrder.mesa || editingOrder.numero || ""));
    }

    if (method !== "delivery") {
      setAddress("");
      handleDeliveryDestinationChange(null);
    }

    if (method !== "point") {
      setReferencePoint("");
      setLocationText("");
    }
  };

  const handlePaymentMethodChange = (newMethod) => {
    if (paymentMethod === newMethod) {
      setPaymentMethod("");
      setMoneyPaid("");
      setSplitPayments([{ method: "efectivo", amount: "" }]);
    } else {
      // Clear previous payment inputs when switching methods
      if (paymentMethod === "efectivo" && newMethod !== "efectivo") {
        setMoneyPaid("");
      }
      if (paymentMethod === "dividir" && newMethod !== "dividir") {
        setSplitPayments([{ method: "efectivo", amount: "" }]);
      }
      // If switching to dividir, show modal
      if (newMethod === "dividir") {
        initializeSplits(2);
        setShowSplitModal(true);
      }
      setPaymentMethod(newMethod);
    }
  };

  const addPaymentRow = () => {
    setSplitPayments([...splitPayments, { method: "tarjeta", amount: "" }]);
  };

  const updateSplitPayment = (index, field, value) => {
    const newPayments = [...splitPayments];
    newPayments[index][field] = value;
    setSplitPayments(newPayments);
  };

  const removePaymentRow = (index) => {
    setSplitPayments(splitPayments.filter((_, i) => i !== index));
  };

  const deliveryOrigin = useMemo(() => {
    const latitudeText = String(deliverySettings?.latitude ?? "").trim();
    const longitudeText = String(deliverySettings?.longitude ?? "").trim();
    if (!latitudeText || !longitudeText) return null;

    const latitude = Number(latitudeText);
    const longitude = Number(longitudeText);
    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    )
      return null;

    return { latitude, longitude };
  }, [deliverySettings?.latitude, deliverySettings?.longitude]);

  useEffect(() => {
    const query = address.trim();
    if (suppressDeliveryPlaceSearchRef.current === query) {
      suppressDeliveryPlaceSearchRef.current = "";
      setDeliveryPlaceSuggestions([]);
      setDeliveryPlaceSearchError("");
      setIsSearchingDeliveryPlaces(false);
      return undefined;
    }

    if (!query || deliveryDestination) {
      setDeliveryPlaceSuggestions([]);
      setDeliveryPlaceSearchError("");
      setIsSearchingDeliveryPlaces(false);
      return undefined;
    }

    setDeliveryPlaceSuggestions([]);
    if (query.length < 2) {
      setDeliveryPlaceSearchError("");
      setIsSearchingDeliveryPlaces(false);
      return undefined;
    }
    if (isLoadingDeliverySettings) {
      setDeliveryPlaceSearchError("");
      setIsSearchingDeliveryPlaces(true);
      return undefined;
    }
    if (!deliveryOrigin) {
      setDeliveryPlaceSearchError(
        "Configura la ubicación de la tienda para buscar direcciones cercanas.",
      );
      setIsSearchingDeliveryPlaces(false);
      return undefined;
    }

    setDeliveryPlaceSearchError("");
    setIsSearchingDeliveryPlaces(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const createSearchParams = () => {
          const params = new URLSearchParams({ q: query, limit: "50" });
          params.set("lat", String(deliveryOrigin.latitude));
          params.set("lon", String(deliveryOrigin.longitude));
          const latitudeOffset = DELIVERY_PLACE_MAX_DISTANCE_KM / 111;
          const longitudeOffset =
            latitudeOffset /
            Math.max(
              Math.cos((deliveryOrigin.latitude * Math.PI) / 180),
              0.2,
            );
          params.set(
            "bbox",
            [
              deliveryOrigin.longitude - longitudeOffset,
              deliveryOrigin.latitude - latitudeOffset,
              deliveryOrigin.longitude + longitudeOffset,
              deliveryOrigin.latitude + latitudeOffset,
            ].join(","),
          );
          return params;
        };

        const response = await fetch(
          `${DELIVERY_PLACE_SEARCH_URL}?${createSearchParams()}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(
            `La búsqueda de direcciones respondió ${response.status}.`,
          );
        }
        const result = await response.json();
        const suggestions = (result.features || [])
          .map((feature) => {
            const [longitude, latitude] = feature.geometry?.coordinates || [];
            const label = getDeliveryPlaceLabel(feature.properties);
            if (
              !label ||
              !Number.isFinite(latitude) ||
              !Number.isFinite(longitude)
            ) {
              return null;
            }
            return {
              id: feature.properties?.osm_id
                ? `${feature.properties.osm_type || "osm"}-${feature.properties.osm_id}`
                : `${latitude},${longitude},${label}`,
              label,
              latitude,
              longitude,
              distance: getCoordinateDistanceKm(deliveryOrigin, {
                latitude,
                longitude,
              }),
            };
          })
          .filter(
            (suggestion) =>
              suggestion &&
              suggestion.distance <= DELIVERY_PLACE_MAX_DISTANCE_KM,
          );

        suggestions.sort((first, second) => first.distance - second.distance);
        setDeliveryPlaceSuggestions(suggestions);
        if (suggestions.length === 0) {
          setDeliveryPlaceSearchError(
            "No encontramos direcciones cercanas a la tienda. Prueba con otra búsqueda.",
          );
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Error buscando direcciones de domicilio:", error);
          setDeliveryPlaceSuggestions([]);
          setDeliveryPlaceSearchError(
            "No se pudieron cargar sugerencias. Puedes ingresar la dirección manualmente.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearchingDeliveryPlaces(false);
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    address,
    deliveryDestination,
    deliveryOrigin,
    isLoadingDeliverySettings,
  ]);

  useEffect(() => {
    if (!deliveryDestination) return undefined;

    const destinationKey = `${deliveryDestination.latitude.toFixed(6)},${deliveryDestination.longitude.toFixed(6)}`;
    if (skipReverseGeocodeRef.current === destinationKey) {
      skipReverseGeocodeRef.current = "";
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          lat: String(deliveryDestination.latitude),
          lon: String(deliveryDestination.longitude),
        });
        const response = await fetch(
          `${DELIVERY_PLACE_REVERSE_URL}?${params.toString()}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(
            `La búsqueda de la dirección respondió ${response.status}.`,
          );
        }

        const result = await response.json();
        const label = getDeliveryPlaceLabel(result.features?.[0]?.properties);
        if (label) {
          suppressDeliveryPlaceSearchRef.current = label;
          setAddress(label);
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          console.warn("No se pudo obtener la dirección de las coordenadas:", error);
        }
      }
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [deliveryDestination]);

  const deliveryRate = Number(deliverySettings?.delivery_fee_per_km);
  const minimumDeliveryFee = Number(deliverySettings?.min_delivery_fee);
  const maximumDeliveryFee = Number(deliverySettings?.max_delivery_fee);
  const deliveryPricingConfigured =
    deliverySettings?.delivery_fee_per_km !== null &&
    deliverySettings?.delivery_fee_per_km !== undefined &&
    deliverySettings?.min_delivery_fee !== null &&
    deliverySettings?.min_delivery_fee !== undefined &&
    deliverySettings?.max_delivery_fee !== null &&
    deliverySettings?.max_delivery_fee !== undefined &&
    Number.isFinite(deliveryRate) &&
    Number.isFinite(minimumDeliveryFee) &&
    Number.isFinite(maximumDeliveryFee) &&
    minimumDeliveryFee <= maximumDeliveryFee;
  const deliveryDistanceKm =
    deliveryRouteDistanceMeters === null
      ? null
      : Number(deliveryRouteDistanceMeters) / 1000;
  const itemsSubtotal = cart.reduce(
    (sum, item) => sum + item.price * item.qty,
    0,
  );
  const deliveryBaseFee =
    deliveryDistanceKm !== null && deliveryPricingConfigured
      ? Math.round(deliveryDistanceKm * deliveryRate)
      : null;
  const deliveryFeeBeforeRounding =
    deliveryBaseFee === null
      ? null
      : Math.max(minimumDeliveryFee, deliveryBaseFee);
  const roundedDeliveryFee =
    deliveryFeeBeforeRounding === null
      ? null
      : Math.ceil(deliveryFeeBeforeRounding / 100) * 100;
  const deliveryBaseCharge =
    deliveryMethod === "delivery" && roundedDeliveryFee !== null
      ? Math.min(maximumDeliveryFee, roundedDeliveryFee)
      : 0;
  const surchargeStart = String(
    deliverySettings?.night_delivery_surcharge_start || "",
  ).slice(0, 5);
  const surchargeEnd = String(
    deliverySettings?.night_delivery_surcharge_end || "",
  ).slice(0, 5);
  const currentDeliveryTime = `${String(deliveryClock.getHours()).padStart(2, "0")}:${String(deliveryClock.getMinutes()).padStart(2, "0")}`;
  const isNightDeliverySurchargeTime =
    Boolean(deliverySettings?.night_delivery_surcharge_enabled) &&
    Boolean(surchargeStart && surchargeEnd && surchargeStart !== surchargeEnd) &&
    (surchargeStart < surchargeEnd
      ? currentDeliveryTime >= surchargeStart &&
        currentDeliveryTime < surchargeEnd
      : currentDeliveryTime >= surchargeStart ||
        currentDeliveryTime < surchargeEnd);
  const nightSurchargePercent =
    Number(deliverySettings?.night_delivery_surcharge_percent) || 0;
  const nightDeliverySurcharge =
    deliveryMethod === "delivery" &&
    roundedDeliveryFee !== null &&
    isNightDeliverySurchargeTime
      ? Math.ceil(
          Math.round((deliveryBaseCharge * nightSurchargePercent) / 100) / 100,
        ) * 100
      : 0;
  const deliveryFee = deliveryBaseCharge + nightDeliverySurcharge;
  const tipPercent = Number(deliverySettings?.tip_percent) || 0;
  const tipAmount = Math.round((itemsSubtotal * tipPercent) / 100);
  const totalWithoutTip = itemsSubtotal + deliveryFee;
  const total = totalWithoutTip + tipAmount;
  const assignedTotal = splitPayments.reduce(
    (acc, curr) => acc + (parseFloat(curr.amount) || 0),
    0,
  );
  const paidAmount =
    paymentMethod === "efectivo" ? parseFloat(moneyPaid) || 0 : 0;
  const isCashPaymentBelowTotal =
    paymentMethod === "efectivo" &&
    inventoryEnabled &&
    !isEditingTableOrder &&
    total > 0 &&
    paidAmount < total;
  const remaining = paidAmount > 0 ? total - paidAmount : total - assignedTotal;
  const remainingLabel = remaining > 0 ? "Faltante" : "Cambio";
  const remainingDisplay = formatPrice(Math.abs(remaining));
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);

  const currentEditSnapshot = editingSnapshot
    ? {
        cart: cart.map((item) => ({
          productId: item.productId || item.id,
          qty: Number(item.qty || 1),
          price: Number(item.price || 0),
          name: item.name || "Producto",
          note: item.note || "",
          options: item.optionNames || item.options || [],
        })),
        deliveryMethod,
        address,
        deliveryDestination,
        referencePoint,
        locationText,
        paymentMethod,
        moneyPaid: paymentMethod === "efectivo" ? Number(moneyPaid) || 0 : 0,
        splitPayments:
          paymentMethod === "dividir"
            ? splitPayments.map((item) => ({
                method: item.method || "",
                amount: Number(item.amount) || 0,
              }))
            : [],
        orderNotes,
        customerName,
        customerNumber,
        selectedTable,
      }
    : null;
  const hasEditChanges =
    Boolean(editingSnapshot) &&
    JSON.stringify(currentEditSnapshot) !== JSON.stringify(editingSnapshot);

  const getOrderValidationErrors = () => {
    const errors = [];
    if (cart.length === 0) {
      errors.push("Agregar al menos un producto");
    }
    if (!deliveryMethod) {
      errors.push("Seleccionar método de entrega");
    }
    if (!customerName.trim()) {
      errors.push("Ingresar nombre del cliente");
    }
    if (!customerNumber.trim()) {
      errors.push("Ingresar número de cliente");
    }
    if (
      deliveryMethod === "delivery" &&
      !address.trim() &&
      !deliveryDestination
    ) {
      errors.push("Ingresar dirección de entrega");
    }
    if (deliveryMethod === "delivery" && !deliveryOrigin) {
      errors.push(
        "Configurar la ubicación del negocio para calcular el domicilio",
      );
    }
    if (deliveryMethod === "delivery" && !deliveryPricingConfigured) {
      errors.push(
        "Configurar tarifa, mínimo y máximo de domicilio en la tienda",
      );
    }
    if (deliveryMethod === "delivery" && !deliveryDestination) {
      errors.push("Seleccionar el destino en el mapa");
    }
    if (deliveryMethod === "delivery" && isCalculatingDeliveryRoute) {
      errors.push("Esperar a que termine el cálculo de la ruta");
    } else if (deliveryMethod === "delivery" && deliveryRouteError) {
      errors.push("No se pudo calcular la ruta del domicilio");
    } else if (
      deliveryMethod === "delivery" &&
      deliveryDestination &&
      deliveryRouteDistanceMeters === null
    ) {
      errors.push("Seleccionar un destino con ruta disponible");
    }
    if (deliveryMethod === "table" && !selectedTable.trim()) {
      errors.push("Seleccionar número de mesa");
    }
    if (deliveryMethod === "table" && tableOccupancyWarning?.occupied) {
      errors.push("Mesa ocupada - Selecciona otra mesa");
    }
    if (
      deliveryMethod === "point" &&
      !(referencePoint?.trim() || locationText?.trim())
    ) {
      errors.push("Ingresar ubicación de retiro");
    }
    if (!paymentMethod && !isEditingTableOrder) {
      errors.push("Seleccionar método de pago");
    }
    if (
      paymentMethod === "efectivo" &&
      !isEditingTableOrder &&
      total > 0 &&
      paidAmount < total
    ) {
      errors.push(
        paidAmount <= 0
          ? "Ingresar monto recibido para efectivo"
          : "El monto recibido debe ser igual o mayor al total de la orden",
      );
    }
    if (paymentMethod === "dividir" && !splitPayments.some((p) => p.amount)) {
      errors.push("Agregar al menos una división de pago");
    }
    return errors;
  };

  const canSubmitReservation =
    reservationData.nombre.trim() &&
    reservationData.telefono.trim() &&
    reservationData.fecha.trim() &&
    reservationData.hora.trim() &&
    reservationData.personas &&
    Number(reservationData.personas) >= 1;

  // Crear reserva con datos del modal
  const crearReserva = async () => {
    if (!reservationData.nombre.trim()) {
      addToast("Ingresar nombre del cliente", "error");
      return;
    }
    if (!reservationData.telefono.trim()) {
      addToast("Ingresar número del cliente", "error");
      return;
    }
    if (!reservationData.fecha.trim()) {
      addToast("Seleccionar fecha de la reserva", "error");
      return;
    }
    if (!reservationData.hora.trim()) {
      addToast("Seleccionar hora de la reserva", "error");
      return;
    }
    if (!reservationData.personas || Number(reservationData.personas) < 1) {
      addToast("Ingresar cantidad de personas", "error");
      return;
    }
    if (tableOccupancyWarning?.occupied) {
      addToast("Mesa ocupada - Selecciona otra mesa", "error");
      return;
    }

    if (!businessId) return;

    const fechaReserva = reservationData.fecha; // "2026-04-02"
    const horaReserva = reservationData.hora || "00:00"; // "11:33"

    const orderNumber = generarNumeroPedido(reservationData.telefono);
    const trackingToken = generarUuid();

    const orderPayload = {
      business_id: businessId,
      status: "pending",
      total: 0,
      order_number: orderNumber,
      updated_at: new Date().toISOString(),
      scheduled_at: null,
      delivery_address: null,
      delivery_instructions: null,
      delivery_fee: 0,
      tax_amount: 0,
      discount_amount: 0,
      tip_amount: 0,
      payment_method: null,
      payment_status: "pending",
      order_type: "table",
      customer_name: reservationData.nombre || null,
      customer_phone: reservationData.telefono || null,
      currency: "COP",
      mesa: Number(reservationData.mesa),
      table_status: "reserva",
      is_reservation: true,
      punto: null,
      personas: Number(reservationData.personas),
      fecha_reserva: fechaReserva,
      hora_reserva: horaReserva,
      notes: reservationData.notas?.trim() || null,
      metadata: {
        tiendaSlug: null,
        canal: "pos",
        createdFrom: "pos_app",
        metodoEntrega: "mesa",
        tracking_token: trackingToken,
        business_whatsapp: normalizeWhatsappNumber("") || null,
        payment_methods: [],
        cliente: {
          nombre: reservationData.nombre || null,
          telefono: reservationData.telefono || null,
          direccion: null,
          referencia: null,
        },
        puntoRetiro: null,
        reserva_type: "desde_pos",
      },
    };

    try {
      console.log("DEBUG crearReserva - orderPayload:", orderPayload);
      const { error } = await supabase.rpc("create_order", {
        p_order: orderPayload,
        p_items: [],
      });

      if (error) {
        console.error("Error creando reserva:", error);
        addToast("Error al crear la reserva", "error");
        return;
      }

      const reservationInfo = {
        customerName: reservationData.nombre,
        customerPhone: reservationData.telefono,
        table: reservationData.mesa,
        date: fechaReserva,
        time: horaReserva,
        people: reservationData.personas,
        notes: reservationData.notas?.trim() || "",
        orderNumber,
      };

      setCreatedReservation(reservationInfo);
      setShowReservationSuccessModal(true);
      setShowReservationModal(false);
      resetAllPOSState(false);
      setReservationData({
        nombre: "",
        telefono: "",
        fecha: "",
        hora: "",
        personas: "1",
        notas: "",
        mesa: "",
      });
    } catch (err) {
      console.error("Error en crearReserva:", err);
      addToast("Error al crear la reserva", "error");
    }
  };

  // Crear reserva (antigua - se reemplaza por modal)
  const crearReservaOld = async () => {
    if (!selectedTable.trim()) {
      addToast("Seleccionar número de mesa", "error");
      return;
    }
    if (!customerName.trim()) {
      addToast("Ingresar nombre del cliente", "error");
      return;
    }
    if (!customerNumber.trim()) {
      addToast("Ingresar número del cliente", "error");
      return;
    }
    if (tableOccupancyWarning?.occupied) {
      addToast("Mesa ocupada - Selecciona otra mesa", "error");
      return;
    }

    if (!businessId) return;

    const orderNumber = generarNumeroPedido(customerNumber);
    const trackingToken = generarUuid();

    const orderPayload = {
      business_id: businessId,
      status: "pending",
      total: 0, // Reserva sin total
      order_number: orderNumber,
      updated_at: new Date().toISOString(),
      scheduled_at: null,
      delivery_address: null,
      delivery_instructions: null,
      delivery_fee: 0,
      tax_amount: 0,
      discount_amount: 0,
      tip_amount: 0,
      payment_method: null,
      payment_status: "pending",
      order_type: "table",
      customer_name: customerName || null,
      customer_phone: customerNumber || null,
      currency: "COP",
      mesa: Number(selectedTable),
      table_status: "reserva", // ← Estado de RESERVA
      is_reservation: true,
      punto: null,
      notes: orderNotes?.trim() || null,
      metadata: {
        tiendaSlug: null,
        canal: "pos",
        createdFrom: "pos_app",
        metodoEntrega: "mesa",
        tracking_token: trackingToken,
        business_whatsapp: normalizeWhatsappNumber("") || null,
        payment_methods: [],
        cliente: {
          nombre: customerName || null,
          telefono: customerNumber || null,
          direccion: null,
          referencia: null,
        },
        puntoRetiro: null,
        reserva_type: "desde_pos",
      },
    };

    try {
      console.log("DEBUG crearReserva - orderPayload:", orderPayload);
      const { error } = await supabase.rpc("create_order", {
        p_order: orderPayload,
        p_items: [], // Sin items, es solo una reserva
      });

      if (error) {
        console.error("Error creando reserva:", error);
        addToast("Error al crear la reserva", "error");
        return;
      }

      addToast(`✓ Reserva creada para mesa ${selectedTable}`, "success");

      // Limpiar campos de reserva pero mantener mesa seleccionada
      setCart([]);
      setOrderNotes("");
      setCustomerName("");
      setCustomerNumber("");
      setPaymentMethod("");
      setSplitPayments([{ method: "", amount: "" }]);
    } catch (err) {
      console.error("Error en crearReserva:", err);
      addToast("Error al crear la reserva", "error");
    }
  };

  const crearPedidoPOS = async () => {
    if (submittingOrderRef.current) return;
    const validationErrors = getOrderValidationErrors();
    if (validationErrors.length > 0) {
      addToast(validationErrors.join(" · "), "error");
      return;
    }
    if (!businessId || cart.length === 0) return;

    const items = cart.flatMap((item) => {
      const baseItem = {
        id: item.cartId,
        productId: item.productId || item.id,
        nombre: item.name || "Producto",
        precio: Number(item.price || 0),
        initPrice: Number(item.initPrice || 0),
        unit_name: item.unit?.name || item.unit_name || "UNIDAD",
        notas: item.note || "",
        varianteNombre: item.optionNames?.length
          ? item.optionNames.join(" · ")
          : null,
        opciones: Array.isArray(item.selectedOptions)
          ? item.selectedOptions.map((option) => ({
              id: option.id || null,
              nombre: option.nombre || option.name || option.label || "Opción",
              precio_extra: Number(option.precio_extra || 0),
            }))
          : Array.isArray(item.optionNames)
            ? item.optionNames.map((nombre) => ({ nombre, precio_extra: 0 }))
            : [],
      };
      const pendingQty = Number(item.pendingQty || 0);
      const historicalQty = Math.max(0, Number(item.qty || 1) - pendingQty);

      if (item.orderItemId && pendingQty > 0 && historicalQty > 0) {
        return [
          {
            ...baseItem,
            orderItemId: item.orderItemId,
            orderBatchId: item.orderBatchId || null,
            cantidad: historicalQty,
          },
          {
            ...baseItem,
            id: `${item.cartId}-pending`,
            orderItemId: null,
            orderBatchId: null,
            cantidad: pendingQty,
          },
        ];
      }

      return [
        {
          ...baseItem,
          orderItemId: item.orderItemId || null,
          orderBatchId: item.orderBatchId || null,
          cantidad: Number(item.qty || 1),
        },
      ];
    });

    const orderNumber = generarNumeroPedido(customerNumber);
    const trackingToken =
      (isEditingTableOrder && editingOrder?.trackingToken) || generarUuid();
    const deliveryMethodKey =
      deliveryMethod === "delivery"
        ? "domicilio"
        : deliveryMethod === "pickup"
          ? "recoger"
          : deliveryMethod === "table"
            ? "mesa"
            : deliveryMethod === "point"
              ? "punto"
              : null;

    const orderTypeMap = {
      delivery: "delivery",
      pickup: "pickup",
      table: "table",
      point: "dine_in",
    };

    const paymentMethodText =
      paymentMethod === "dividir"
        ? splitPayments
            .filter(
              (item) =>
                (item.method && String(item.method).trim()) ||
                Number(item.amount) > 0,
            )
            .map((item) =>
              (item.method || "desconocido").toString().trim().toLowerCase(),
            )
            .join(", ")
        : paymentMethod
          ? String(paymentMethod).toLowerCase()
          : null;

    const paymentMethodsPayload =
      paymentMethod === "dividir"
        ? splitPayments
            .filter(
              (item) =>
                (item.method && String(item.method).trim()) ||
                Number(item.amount) > 0,
            )
            .map((item) => ({
              metodo: (item.method || "desconocido")
                .toString()
                .trim()
                .toLowerCase(),
              monto: Number(item.amount) || 0,
            }))
        : paymentMethod
          ? [
              {
                metodo: String(paymentMethod).toLowerCase(),
                monto:
                  String(paymentMethod).toLowerCase() === "efectivo"
                    ? Number(moneyPaid) || 0
                    : Number(total) || 0,
              },
            ]
          : [];

    const totalPagado =
      paymentMethod === "efectivo"
        ? Number(moneyPaid) || 0
        : paymentMethod === "dividir"
          ? splitPayments.reduce(
              (sum, item) => sum + (Number(item.amount) || 0),
              0,
            )
          : 0;

    const paymentStatus = totalPagado >= total ? "paid" : "pending";
    const orderStatus = paymentStatus === "paid" ? "confirmed" : "pending";
    const deliveryMapLink =
      deliveryMethod === "delivery" && deliveryDestination
        ? createGoogleMapsLink(deliveryDestination)
        : null;

    const orderPayload = {
      business_id: businessId,
      status: orderStatus,
      total: Number(total) || 0,
      order_number: orderNumber,
      updated_at: new Date().toISOString(),
      scheduled_at: null,
      delivery_address: deliveryMethod === "delivery" ? address || null : null,
      delivery_instructions:
        deliveryMethod === "delivery" ? referencePoint || null : null,
      delivery_fee: deliveryFee,
      tax_amount: 0,
      discount_amount: 0,
      tip_amount: tipAmount,
      payment_method: paymentMethodText || null,
      payment_status: paymentStatus,
      order_type: orderTypeMap[deliveryMethod] || "pickup",
      is_reservation: false,
      customer_name: customerName || null,
      customer_phone: customerNumber || null,
      currency: "COP",
      mesa:
        deliveryMethod === "table"
          ? selectedTable
            ? Number(selectedTable)
            : null
          : null,
      table_status: deliveryMethod === "table" ? "ocupada" : null,
      punto:
        deliveryMethod === "point"
          ? referencePoint?.trim() || locationText?.trim() || null
          : null,
      notes: orderNotes?.trim() || null,
      metadata: {
        tiendaSlug: null,
        canal: "pos",
        createdFrom: "pos_app",
        tip_percent: tipPercent,
        metodoEntrega: deliveryMethodKey,
        tracking_token: trackingToken,
        business_whatsapp: normalizeWhatsappNumber("") || null,
        payment_methods: paymentMethodsPayload,
        cliente: {
          nombre: customerName || null,
          telefono: customerNumber || null,
          direccion: deliveryMethod === "delivery" ? address || null : null,
          referencia: referencePoint || null,
        },
        delivery_location:
          deliveryMethod === "delivery" && deliveryDestination
            ? {
                latitude: deliveryDestination.latitude,
                longitude: deliveryDestination.longitude,
                distance_meters: deliveryRouteDistanceMeters,
              }
            : null,
        linkmaps: deliveryMapLink,
        puntoRetiro: deliveryMethod === "point" ? referencePoint || null : null,
      },
    };

    if (isEditingTableOrder && editingOrder?.orderId) {
      orderPayload.order_number = editingOrder.orderNumber || orderNumber;
      const wasDispatched = ["dispatched", "despachado"].includes(
        String(editingOrder.orderStatus || "").toLowerCase(),
      );
      orderPayload.status =
        deliveryMethod === "table" && wasDispatched
          ? "pending"
          : editingOrder.orderStatus || orderStatus;
      orderPayload.table_status = deliveryMethod === "table" ? "ocupada" : null;
      orderPayload.is_reservation = false;
    }

    const orderItemsPayload = items.map((item) => ({
      order_item_id:
        item.orderItemId && /^[0-9a-f-]{36}$/i.test(item.orderItemId)
          ? item.orderItemId
          : null,
      kitchen_dispatched: false,
      order_batch_id: item.orderBatchId || null,
      product_id: item.productId,
      quantity: item.cantidad,
      unit_price: item.precio,
      init_price: item.initPrice || null,
      subtotal: item.precio * item.cantidad,
      product_name: item.nombre,
      product_sku: item.product_sku || null,
      unit_name: item.unit?.name || item.unit_name || "UNIDAD",
      options: item.opciones || [],
      notes: item.notas || null,
    }));

    submittingOrderRef.current = true;
    setIsSubmittingOrder(true);
    try {
      if (isEditingTableOrder && editingOrder?.orderId) {
        const { error: replaceOrderError } = await supabase.rpc(
          "replace_pos_order_items_with_inventory",
          {
            p_order_id: editingOrder.orderId,
            p_order: orderPayload,
            p_items: orderItemsPayload,
          },
        );

        if (replaceOrderError) throw replaceOrderError;

        const updatedOrderForInvoice = {
          ...orderPayload,
          items,
          orderNumber: orderPayload.order_number,
          trackingToken,
          total,
          paymentMethods: paymentMethodsPayload,
        };
        cancelEditingOrder();
        setSentOrder(updatedOrderForInvoice);
        setShowUpdateSuccessModal(true);
        return;
      }

      // DEBUG: confirmar que `mesa` y `punto` se están incluyendo en el payload
      // Abre la consola del navegador y revisa este log al crear el pedido.
      console.log(
        "DEBUG createOrder - orderPayload.mesa / punto:",
        orderPayload.mesa,
        orderPayload.punto,
        orderPayload,
      );
      const { error } = await supabase.rpc("create_order_with_inventory", {
        p_order: orderPayload,
        p_items: orderItemsPayload,
        p_channel: "pos",
      });

      if (error) {
        console.error("Error guardando orden desde POS:", error);
        if (
          error.message?.includes("TICKET_LIMIT_REACHED") ||
          error.message?.includes("ACTIVE_PLAN_REQUIRED")
        ) {
          setShowTicketLimitNotice(true);
        }
        return;
      }

      const sentOrderPayload = {
        ...orderPayload,
        items,
        orderNumber,
        trackingToken,
        total,
        paymentMethods: paymentMethodsPayload,
      };

      setSentOrder(sentOrderPayload);
      setShowOrderSentModal(true);

      // Clear all input state immediately but preserve the sentOrder and modal
      resetAllPOSState(true);
    } catch (error) {
      console.error("Error guardando orden desde POS:", error);
      if (
        error.message?.includes("TICKET_LIMIT_REACHED") ||
        error.message?.includes("ACTIVE_PLAN_REQUIRED")
      ) {
        setShowTicketLimitNotice(true);
      }
    } finally {
      submittingOrderRef.current = false;
      setIsSubmittingOrder(false);
    }
  };

  const getSentOrderInvoice = (order) => {
    if (!order) return;
    const metadata = order.metadata || {};
    const customer = metadata.cliente || {};
    return {
      numeroFactura: order.orderNumber || order.order_number || "Pedido",
      horaIngreso: new Date(
        order.updated_at || order.created_at || Date.now(),
      ).toLocaleString("es-CO"),
      metodoEntrega: metadata.metodoEntrega || order.order_type,
      cliente: order.customer_name || customer.nombre || "Consumidor final",
      telefono: order.customer_phone || customer.telefono || "",
      deliveryAddress:
        order.delivery_address || customer.direccion || "",
      deliveryInstructions:
        order.delivery_instructions || customer.referencia || "",
      punto: order.punto || metadata.puntoRetiro || "",
      mesa: order.mesa || "",
      deliveryMapLink: metadata.linkmaps || "",
      deliveryLocation: metadata.delivery_location || null,
      deliveryFee: Number(order.delivery_fee || 0),
      tipAmount: Number(order.tip_amount || 0),
      tipPercent: Number(metadata.tip_percent || 0),
      total: Number(order.total || 0),
      metodoPago: order.payment_method || "",
      paymentMethods: order.paymentMethods || metadata.payment_methods || [],
      observaciones: order.notes || "",
      items: (order.items || []).map((item) => ({
        product_name: item.name || item.nombre || "Producto",
        quantity: Number(item.qty ?? item.cantidad ?? 0),
        unit_price: Number(item.price ?? item.precio ?? 0),
        subtotal:
          Number(item.price ?? item.precio ?? 0) *
          Number(item.qty ?? item.cantidad ?? 0),
        unit_name: item.unit?.name || item.unit_name || "",
        options: item.optionNames || item.opciones || item.options || [],
        notes: item.note || item.notas || "",
      })),
    };
  };

  const sentOrderInvoiceBusiness = () => ({
    ...deliveryBusinessDetails,
    logoUrl: deliveryBusinessLogoUrl,
  });

  const handlePrintSentOrder = (order) => {
    const invoiceOrder = getSentOrderInvoice(order);
    if (!invoiceOrder) return;
    printOrderInvoice(invoiceOrder, sentOrderInvoiceBusiness());
  };

  const handleSavePdfSentOrder = async (order) => {
    const invoiceOrder = getSentOrderInvoice(order);
    if (!invoiceOrder) return;
    try {
      await downloadOrderInvoicePdf(invoiceOrder, sentOrderInvoiceBusiness());
    } catch (error) {
      console.error("Error generando el PDF de la factura:", error);
      alert("No se pudo generar el PDF de la factura.");
    }
  };

  const handleShareSentOrder = async (order) => {
    const invoiceOrder = getSentOrderInvoice(order);
    if (!invoiceOrder) return;
    try {
      const result = await shareOrderInvoicePdf(
        invoiceOrder,
        sentOrderInvoiceBusiness(),
      );
      if (result === "downloaded") {
        alert("El PDF quedó descargado y listo para compartir.");
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
      console.error("Error compartiendo el PDF de la factura:", error);
      alert("No se pudo generar o compartir el PDF de la factura.");
    }
  };

  const buildReservationText = (reservation) => {
    if (!reservation) return "";
    return [
      "Reserva confirmada",
      `Cliente: ${reservation.customerName}`,
      `Mesa: ${reservation.table}`,
      `Fecha: ${reservation.date}`,
      `Hora: ${reservation.time}`,
      `Personas: ${reservation.people}`,
      reservation.notes ? `Notas: ${reservation.notes}` : "",
      `Referencia: ${reservation.orderNumber}`,
    ]
      .filter(Boolean)
      .join("\n");
  };

  const handleShareReservation = async () => {
    if (!createdReservation) return;
    const text = buildReservationText(createdReservation);

    if (navigator.share) {
      try {
        await navigator.share({ title: "Reserva confirmada", text });
      } catch (error) {
        if (error?.name !== "AbortError") {
          console.error("Error compartiendo reserva:", error);
        }
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      addToast("Información de reserva copiada", "success");
    } catch (error) {
      console.error("Error copiando reserva:", error);
      addToast("No se pudo compartir la reserva", "error");
    }
  };

  const handleCopyReservation = async () => {
    if (!createdReservation) return;
    try {
      await navigator.clipboard.writeText(
        buildReservationText(createdReservation),
      );
      addToast("Información de reserva copiada", "success");
    } catch (error) {
      console.error("Error copiando reserva:", error);
      addToast("No se pudo copiar la reserva", "error");
    }
  };

  const handleWhatsAppReservation = () => {
    if (!createdReservation) return;
    const phone = normalizeWhatsappNumber(createdReservation.customerPhone);
    if (!phone) {
      addToast("La reserva no tiene un teléfono válido", "error");
      return;
    }

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(
      buildReservationText(createdReservation),
    )}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCloseSentOrderModal = () => {
    // Reset all order-related state to ensure no data persists between orders
    resetAllPOSState(false);
  };

  const resetAllPOSState = (preserveSentOrder = false) => {
    if (!preserveSentOrder) {
      setShowOrderSentModal(false);
      setSentOrder(null);
    }
    setCart([]);
    setQuantityDrafts({});
    setRemovingItems(new Set());
    setShowConfirmModal(false);
    setIsModalOpen(false);
    setOptionModalOpen(false);
    setActiveProduct(null);
    setOptionSelections({});
    setOptionNote("");
    setOptionQuantity(1);
    setOptionValidationError("");
    setInstruction("");
    setShowInfo(null);
    setSearchQuery("");
    setMobilePanel("products");
    setToastItems([]);
    setDeliveryMethod("");
    setIsDeliveryMapFullscreen(false);
    setPaymentMethod("");
    setMoneyPaid("");
    setAddress("");
    handleDeliveryDestinationChange(null);
    setCustomerName("");
    setCustomerNumber("");
    setSelectedTable("");
    setReferencePoint("");
    setLocationText("");
    setOrderNotes("");
    setSplitPayments([{ method: "efectivo", amount: "" }]);
    setHighlightItem(null);
  };

  const activeProductSelectedOptions = getSelectedOptionItems(
    activeProduct,
    optionSelections,
  );
  const activeProductSelectedPrice =
    Number(activeProduct?.price || 0) +
    getOptionExtraPrice(activeProductSelectedOptions);

  {
    /* Componente único de "División de Pago" reutilizable */
  }
  const splitPaymentPreview =
    paymentMethod === "dividir" && splitPayments.some((p) => p.amount) ? (
      <div className="mt-2 animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="rounded-xl  bg-surface-variant/20 px-3.5 py-2.5 my-2">
          <div className="space-y-1.5">
            {/* Header con flex justify-between para colocar el título y el lápiz alineados */}
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-semibold text-on-surface-variant/70 tracking-wide uppercase">
                División de Pago
              </span>
              <button
                onClick={() => setShowSplitModal(true)}
                className="text-on-surface-variant/60 hover:text-primary transition-colors p-1 flex-shrink-0 flex items-center justify-center"
                title="Editar división"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Lista de montos */}
            <div className="space-y-1">
              {splitPayments.map(
                (pay, index) =>
                  pay.amount && (
                    <div
                      key={index}
                      className="flex justify-between items-center text-[10px]"
                    >
                      <span className="text-on-surface-variant font-medium">
                        {pay.method.toUpperCase()}
                      </span>
                      <span className="font-semibold text-on-surface">
                        ${formatPrice(parseFloat(pay.amount) || 0)}
                      </span>
                    </div>
                  ),
              )}
            </div>
          </div>
        </div>
      </div>
    ) : null;

  // Sección única de "Métodos de Pago" reutilizable para desktop y mobile
  const paymentMethodsSection = (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-2">
        <label className="text-[9px] font-black text-neutral-500 uppercase tracking-widest">
          Método de Pago
        </label>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {["efectivo", "tarjeta", "transferencia", "dividir"].map((method) => (
          <button
            key={method}
            onClick={() => handlePaymentMethodChange(method)}
            className={`py-2 lg:py-3 rounded-xl  flex flex-col items-center gap-1 transition-all ${
              paymentMethod === method
                ? "bg-primary-container border-primary shadow-lg shadow-primary-container/40 text-on-surface"
                : "bg-background border-outline text-on-surface-variant hover:border-outline"
            }`}
          >
            <span className="material-symbols-outlined text-base lg:text-lg">
              {paymentLabels[method].icon}
            </span>
            <span className="text-[7px]  font-black uppercase">
              {paymentLabels[method].label}
            </span>
          </button>
        ))}
      </div>
      {paymentMethod === "efectivo" && (
        <div className="mt-2 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="cash-amount-received"
                className="flex min-w-0 items-center gap-2 text-[10px] font-semibold text-neutral-300"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
                  <span className="material-symbols-outlined text-sm">
                    payments
                  </span>
                </span>
                Monto recibido
              </label>
              <div
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border bg-neutral-950 px-3 transition-colors ${
                  isCashPaymentBelowTotal
                    ? "border-red-400/60 focus-within:border-red-400"
                    : "border-white/10 focus-within:border-violet-400/70"
                }`}
              >
                <span className="text-xs font-medium text-neutral-500">
                  $
                </span>
                <input
                  id="cash-amount-received"
                  type="text"
                  inputMode="numeric"
                  aria-invalid={isCashPaymentBelowTotal}
                  value={
                    moneyPaid ? Number(moneyPaid).toLocaleString("es-CO") : ""
                  }
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    setMoneyPaid(val);
                  }}
                  placeholder="0"
                  className={`min-w-0 w-full bg-transparent py-2 text-right text-sm font-bold outline-none placeholder:text-neutral-600 ${
                    isCashPaymentBelowTotal ? "text-red-300" : "text-white"
                  }`}
                />
              </div>
            </div>
            {isCashPaymentBelowTotal && paidAmount > 0 && (
              <p className="mt-1.5 text-right text-[10px] font-medium text-red-300">
                Faltan $ {remainingDisplay} para completar el total
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const deliveryAddressField = (
    <div className="relative z-30">
      <TextField
        label="Dirección"
        value={address}
        setValue={setAddress}
        placeholder="Ingresa la dirección"
        size={isDeliveryMapFullscreen ? "md" : "compact"}
        onChange={(event) => {
          const value = event.target.value;
          setAddress(value);
          if (deliveryDestinationRef.current) {
            handleDeliveryDestinationChange(null);
          }
        }}
        onClear={() => {
          setDeliveryPlaceSuggestions([]);
          setDeliveryPlaceSearchError("");
          handleDeliveryDestinationChange(null);
        }}
      />
      {!deliveryDestination &&
        (address.trim().length === 1 ||
          deliveryPlaceSuggestions.length > 0 ||
          isSearchingDeliveryPlaces ||
          deliveryPlaceSearchError) && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-outline bg-surface shadow-xl"
          role="listbox"
          aria-label="Sugerencias de direcciones"
        >
          {isSearchingDeliveryPlaces && (
            <p className="px-3 py-2 text-xs text-on-surface-variant">
              {isLoadingDeliverySettings
                ? "Cargando ubicación de la tienda..."
                : "Buscando direcciones cercanas..."}
            </p>
          )}
          {address.trim().length === 1 &&
            !isSearchingDeliveryPlaces &&
            !deliveryPlaceSearchError && (
              <p className="px-3 py-2 text-xs text-on-surface-variant">
                Escribe otro carácter para ver sugerencias cercanas.
              </p>
            )}
          {deliveryPlaceSearchError && (
            <p className="px-3 py-2 text-xs text-red-300">
              {deliveryPlaceSearchError}
            </p>
          )}
          {!isSearchingDeliveryPlaces &&
            deliveryPlaceSuggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                role="option"
                aria-selected="false"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  suppressDeliveryPlaceSearchRef.current = suggestion.label;
                  skipReverseGeocodeRef.current = `${suggestion.latitude.toFixed(6)},${suggestion.longitude.toFixed(6)}`;
                  setDeliveryPlaceSuggestions([]);
                  setDeliveryPlaceSearchError("");
                  handleDeliveryDestinationChange({
                    latitude: suggestion.latitude,
                    longitude: suggestion.longitude,
                  });
                  setAddress(suggestion.label);
                }}
                className="block w-full border-b border-outline/40 px-3 py-2 text-left text-xs text-on-surface transition last:border-b-0 hover:bg-surface-hover"
              >
                {suggestion.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );

  const deliveryCoordinatesField = (
    <TextField
      label="Coordenadas o enlace de Google Maps"
      value={deliveryCoordinatesInput}
      setValue={setDeliveryCoordinatesInput}
      placeholder="Pega el enlace o escribe latitud, longitud"
      size={isDeliveryMapFullscreen ? "md" : "compact"}
      onChange={(event) => {
        const value = event.target.value;
        setDeliveryCoordinatesInput(value);
        const coordinates = parseMapCoordinates(value);
        if (coordinates) {
          handleDeliveryDestinationChange(coordinates);
        } else if (deliveryDestinationRef.current) {
          handleDeliveryDestinationChange(null);
          setDeliveryCoordinatesInput(value);
        }
      }}
      onPaste={(event) => {
        const pastedText = event.clipboardData.getData("text");
        const coordinates = parseMapCoordinates(pastedText);
        if (coordinates) {
          event.preventDefault();
          handleDeliveryDestinationChange(coordinates);
        }
      }}
      onPasteValue={(pastedText) => {
        setDeliveryCoordinatesInput(pastedText);
        const coordinates = parseMapCoordinates(pastedText);
        if (coordinates) handleDeliveryDestinationChange(coordinates);
      }}
      onBlur={() => {
        const coordinates = parseMapCoordinates(deliveryCoordinatesInput);
        if (coordinates) handleDeliveryDestinationChange(coordinates);
      }}
      onClear={() => {
        setDeliveryCoordinatesInput("");
        handleDeliveryDestinationChange(null);
      }}
    />
  );

  const deliveryMapContent = (
    <DeliveryMap
      origin={deliveryOrigin}
      destination={deliveryDestination}
      originLogoUrl={deliveryBusinessLogoUrl}
      onDestinationChange={handleDeliveryDestinationChange}
      onRouteChange={setDeliveryRouteDistanceMeters}
      onRoutingChange={setIsCalculatingDeliveryRoute}
      onRouteErrorChange={setDeliveryRouteError}
      fullHeight={isDeliveryMapFullscreen}
      compact={!isDeliveryMapFullscreen}
    />
  );

  const deliveryMapStatus = (
    <>
      {isCalculatingDeliveryRoute && (
        <p className="text-center text-[10px] text-neutral-400">
          Calculando ruta por carretera...
        </p>
      )}
      {deliveryRouteError && (
        <p className="text-center text-[10px] text-red-300">
          {deliveryRouteError}
        </p>
      )}
    </>
  );

  const deliveryCostSummary = (
    <div className="w-full space-y-1 rounded-lg border border-primary-container/30 bg-primary-container/10 p-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-on-surface-variant">
          COSTO FINAL
        </span>
        <span className="text-sm font-black text-primary">
          {deliveryBaseFee === null ? "—" : `$ ${formatPrice(deliveryFee)}`}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-on-surface-variant">
          COSTO BASE
        </span>
        <span className="text-[10px] font-black text-on-surface">
          {deliveryBaseFee === null ? "—" : `$ ${formatPrice(deliveryBaseFee)}`}
        </span>
      </div>
      {nightDeliverySurcharge > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-amber-200">
            RECARGO NOCTURNO ({nightSurchargePercent}%)
          </span>
          <span className="text-[10px] font-black text-amber-100">
            + $ {formatPrice(nightDeliverySurcharge)}
          </span>
        </div>
      )}
      <div className="h-px bg-primary-container/20" />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase text-on-surface-variant">
            Distancia
          </p>
          <p className="text-xs font-black text-on-surface">
            {deliveryRouteDistanceMeters === null
              ? "—"
              : `${Math.round(deliveryRouteDistanceMeters).toLocaleString("es-CO")} m`}
          </p>
        </div>
        <div>
          <p className="text-right text-[10px] font-bold uppercase text-on-surface-variant">
            Kilómetros
          </p>
          <p className="text-right text-xs font-black text-on-surface">
            {deliveryDistanceKm === null
              ? "—"
              : `${deliveryDistanceKm.toFixed(2)} km`}
          </p>
        </div>
      </div>
      {!isLoadingDeliverySettings && !deliveryPricingConfigured && (
        <p className="pt-1 text-[9px] text-amber-200">
          Configura tarifa por kilómetro y límites de domicilio en la tienda.
        </p>
      )}
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] h-screen bg-background font-sans selection:bg-primary-container/30 pb-20 lg:pb-0">
        {isDeliveryMapFullscreen && deliveryMethod === "delivery" && (
          <div className="fixed inset-0 z-[100] flex flex-col gap-3 bg-background p-3 sm:p-5">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-primary">
                  Domicilio
                </p>
                <h2 className="text-base font-black text-white">
                  Seleccionar dirección
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsDeliveryMapFullscreen(false)}
                className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-neutral-300 transition hover:bg-white/10"
                aria-label="Cerrar mapa en pantalla completa"
              >
                <X size={15} /> Cerrar
              </button>
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
              <div className="flex min-h-[220px] flex-[3] md:min-h-0 md:flex-1">
                {deliveryMapContent}
              </div>
              <aside className="flex min-h-0 w-full flex-[2] flex-col gap-3 overflow-y-auto pr-1 md:w-[340px] md:flex-none">
                {deliveryAddressField}
                {deliveryCoordinatesField}
                <TextField
                  label="Punto de Referencia"
                  value={referencePoint}
                  setValue={setReferencePoint}
                  placeholder="Ingresa el punto de referencia"
                  size="md"
                />
                {deliveryMapStatus}
                {deliveryCostSummary}
              </aside>
            </div>
          </div>
        )}
        {isEditingTableOrder && (
          <div className="fixed top-0 left-20 right-0 z-40 flex items-center justify-between gap-3 border-b border-amber-400/20 bg-amber-500/10 px-4 py-2 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setMobilePanel("resumen")}
              className="min-w-0 truncate text-left text-[10px] font-black uppercase tracking-widest text-amber-300"
            >
              Editando mesa {editingOrder?.numero || selectedTable} -{" "}
              {editingOrder?.orderNumber || ""}
            </button>
            <button
              type="button"
              onClick={cancelEditingOrder}
              className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-amber-400/30 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-amber-200 hover:bg-amber-400/10"
            >
              <X className="h-3 w-3" /> Cancelar
            </button>
          </div>
        )}
        {/* Stacked product toasts - mobile only */}
        {/* Contenedor de Toasts con Orden Invertido - Mobile */}
        <div className="fixed top-6 left-0 right-0 z-50 flex flex-col-reverse items-center gap-2 pointer-events-none px-6">
          {toastItems.map((toast) => (
            <div
              key={toast.id}
              className={`flex items-center gap-3 rounded-3xl border px-5 py-3 text-on-surface shadow-xl transition-all duration-400 pointer-events-auto ${
                toast.exiting
                  ? "opacity-0 -translate-y-4 scale-90"
                  : "opacity-100 translate-y-0 scale-100"
              } ${
                toast.type === "warning"
                  ? "border-orange-300/30 bg-orange-500/95 text-white"
                  : toast.type === "error"
                    ? "border-error/20 bg-error/95"
                    : "border-success/20 bg-success/90"
              }`}
              style={{
                animation: !toast.exiting
                  ? "slideInFromTop 0.3s cubic-bezier(0.34,1.56,0.64,1) both"
                  : "",
              }}
            >
              <span className="text-[11px] font-black uppercase tracking-wider">
                {toast.name}
              </span>
              <span className="material-symbols-outlined text-base text-on-surface">
                {toast.type === "warning"
                  ? "warning"
                  : toast.type === "error"
                    ? "error"
                    : "check_circle"}
              </span>
            </div>
          ))}
        </div>
        <style>{`
          @keyframes slideInFromTop {
            from { opacity: 0; transform: translateY(-16px) scale(0.92); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>
        {/* Listado de Productos */}
        <div
          className={`${mobilePanel !== "products" ? "hidden" : "flex"} lg:flex lg:col-span-2 xl:col-span-1 h-full min-h-0 flex-col overflow-hidden`}
        >
          {/* Buscador Inteligente */}
          <div className="z-20 shrink-0 bg-background/90 p-4 pb-0 backdrop-blur-md">
            <h2 className="text-base font-black uppercase tracking-tighter mb-2 ml-2 text-on-surface">
              Productos
            </h2>
            <div className="relative group">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors">
                search
              </span>
              <input
                type="text"
                placeholder="Buscar producto..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSelectedCategory("all");
                }}
                className="w-full bg-surface rounded-2xl py-2 pl-12 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all "
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-sm mt-2">
                    close
                  </span>
                </button>
              )}
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 items-stretch">
            <aside
              aria-label="Categorías de productos"
              className="flex h-full min-h-0 w-24 shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-outline/50 px-2 py-3 custom-sidebar min-[420px]:w-28 sm:w-32 lg:w-36 lg:py-4 xl:w-40"
            >
              {isLoadingCategories
                ? [...Array(4)].map((_, idx) => (
                    <div
                      key={idx}
                      className="h-9 w-full flex-shrink-0 animate-pulse rounded-lg bg-surface"
                    />
                  ))
                : categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      title={cat.name}
                      onClick={() => {
                        setSelectedCategory(cat.id);
                        setSearchTerm("");
                      }}
                      className={`w-full flex-shrink-0 truncate rounded-lg px-2 py-2 text-left text-[9px] font-bold uppercase tracking-wide transition-colors lg:px-3 lg:py-2.5 lg:text-[10px] ${
                        selectedCategory === cat.id
                          ? "bg-primary-container text-on-surface"
                          : "text-on-surface-variant hover:bg-surface hover:text-on-surface"
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
            </aside>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-2 custom-sidebar min-[420px]:p-3 lg:p-4">
            {isLoadingProducts && filteredProducts.length === 0 ? (
                <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:gap-3">
                {[...Array(8)].map((_, idx) => (
                  <div
                    key={idx}
                    className="group relative bg-surface rounded-[1.25rem] p-2 flex flex-col animate-pulse"
                  >
                    <div className="bg-surface-hover/50 rounded-[1rem] h-24 mb-3 border border-outline/[0.03]" />
                    <div className="px-1 flex-1">
                      <div className="h-4 bg-white/10 rounded-full w-3/4 mb-3" />
                      <div className="h-5 bg-white/10 rounded-full w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <span className="material-symbols-outlined text-5xl text-on-surface-variant/40">
                  search_off
                </span>
                <div className="text-center">
                  <p className="text-on-surface-variant font-bold text-sm uppercase tracking-wide">
                    No se encontraron productos
                  </p>
                  <p className="text-on-surface-variant/60 text-xs mt-1">
                    Intenta con otra búsqueda o categoría
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:gap-3">
                {filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    onClick={() => addToCart(product)}
                    aria-disabled={!isProductCatalogReady}
                    className={`group relative flex flex-col rounded-[1.25rem] bg-surface transition-all duration-500 hover:bg-surface-hover/50 hover:border-primary-container/40 active:scale-[0.97] ${
                      isProductCatalogReady
                        ? "cursor-pointer"
                        : "cursor-wait opacity-80"
                    }`}
                  >
                    {(inventoryEnabled || product.soldOut) && (
                      <div
                        className={`absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded-full text-white text-[10px] font-bold uppercase tracking-wider ${
                          product.soldOut ||
                          (inventoryEnabled && Number(product.stock) <= 0)
                            ? "bg-red-600"
                            : "bg-green-600"
                        }`}
                      >
                        {product.soldOut
                          ? "Agotado"
                          : inventoryEnabled
                            ? `Stock: ${formatStockQuantity(product.stock)} ${getProductUnitAbbreviation(product)}`
                            : "Disponible"}
                      </div>
                    )}
                    {/* Botón Info - Elevado con Glassmorphism */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowInfo(
                          showInfo === product.id ? null : product.id,
                        );
                      }}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 bg-primary-container/50 text-primary border-primary/30 hover:bg-primary-container hover:text-on-surface z-10"
                    >
                      <span className="material-symbols-outlined text-sm">
                        info
                      </span>
                    </button>

                    {/* Contenedor del icono image */}
                    <div className="bg-surface-hover/50 rounded-t-[1rem] h-24 flex items-center justify-center border border-outline/[0.03] overflow-hidden relative">
                      {hasUsableProductImage(product.image_url) ? (
                        <>
                          <div className="absolute inset-0 bg-gradient-to-br from-primary-container/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="h-full w-full object-cover"
                          />
                        </>
                      ) : (
                        <div
                          className="flex h-full w-full items-center justify-center bg-neutral-200 px-3"
                          aria-label={product.name}
                        >
                          <span className="truncate text-center text-lg text-neutral-500">
                            {product.name}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Información de Producto */}
                    <div className="px-2 pt-1">
                      <p className="font-bold text-on-surface text-sm group-hover:text-primary transition-colors">
                        {product.name}
                      </p>

                      <div className="flex items-center justify-between gap-1 pb-2">
                        <p className="text-primary font-black text-sm tracking-tight">
                          $ {formatPrice(product.price)} /{" "}
                          {product.unit?.name || "UNIDAD"}
                        </p>
                        <button
                          onClick={(e) => openNoteModal(e, product)}
                          className="w-5 h-5 flex items-center justify-center text-on-surface-variant hover:text-primary-container transition-colors "
                        >
                          <span className="material-symbols-outlined text-xl">
                            add_notes
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Info button only (modal rendered globally) */}
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>
        </div>
        {/* Modal centrado para descripción de producto */}
        {showInfo &&
          (() => {
            const prod =
              products.find((p) => p.id === showInfo) ||
              filteredProducts.find((p) => p.id === showInfo) ||
              null;

            if (!prod) return null;

            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div
                  className="absolute inset-0 bg-black/60"
                  onClick={() => setShowInfo(null)}
                />

                <div
                  onClick={(e) => e.stopPropagation()}
                  className="relative z-10 w-full max-w-3xl bg-surface/95 backdrop-blur-md rounded-2xl p-6 overflow-auto max-h-[80vh]"
                >
                  <button
                    onClick={() => setShowInfo(null)}
                    className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-on-surface bg-background/20 hover:bg-background/40 rounded-full transition-all"
                    aria-label="Cerrar"
                  >
                    <X className="h-5 w-5" />
                  </button>

                  <p className="text-xs font-bold text-primary uppercase tracking-widest mb-2">
                    Descripción
                  </p>
                  <p className="text-sm text-on-surface leading-relaxed italic">
                    {prod.desc}
                  </p>
                </div>
              </div>
            );
          })()}

        {/* Barra de Método de Entrega Vertical */}
        <div
          className={`${mobilePanel !== "datos" ? "hidden" : "block"} lg:block bg-background border-l border-outline p-3 w-full h-full overflow-y-auto custom-sidebar`}
        >
          <h2 className="text-base font-black uppercase tracking-tighter mb-3 ml-1 text-on-surface">
            Método de Entrega
          </h2>

          {/* Botones en Grid Indestructible */}
          <div className="grid grid-cols-4 gap-1 w-full sm:gap-1.5">
            {Object.entries(deliveryLabels).map(([key, { label, icon }]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleDeliveryChange(key)}
                className={`group relative min-h-10 w-full overflow-hidden rounded-lg p-1 text-[8px] font-bold uppercase tracking-wide transition-all duration-300 flex flex-col items-center justify-center gap-0.5 sm:min-h-11 sm:p-1.5 sm:text-[10px] sm:tracking-wider ${
        deliveryMethod === key
          ? "bg-primary-container text-on-surface border-primary shadow-lg shadow-primary-container/20"
          : "bg-surface/100 border-outline text-on-surface-variant hover:border-outline hover:text-on-surface"
      }`}
              >
                {/* Brillo táctico */}
                {deliveryMethod === key && (
                  <div className="absolute inset-0  to-transparent pointer-events-none" />
                )}

                {/* Icono */}
                <span
                  className={`material-symbols-outlined text-sm transition-transform duration-300 flex-shrink-0 sm:text-base ${
                    deliveryMethod === key
                      ? "scale-110"
                      : "group-hover:scale-110"
                  }`}
                >
                  {icon}
                </span>

                {/* Texto - Quitamos flex-1 y text-left para que el justify-center del padre mande */}
                <span className="max-w-full truncate leading-none">{label}</span>
              </button>
            ))}
          </div>

          {/* Inputs adicionales según método de entrega */}
          {deliveryMethod === "pickup" && (
            <div className="mt-2 space-y-1.5">
              <button
                onClick={autoFillDeliveryFields}
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-primary/50 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-primary transition-all hover:border-primary hover:bg-primary/10"
              >
                <span className="material-symbols-outlined text-xs">
                  auto_fix_high
                </span>
                Autorellenar
              </button>
              <TextField
                label="Nombre"
                value={customerName}
                setValue={setCustomerName}
                placeholder="Ingresa el nombre"
                size="compact"
              />
              <TextField
                label="Número"
                value={customerNumber}
                setValue={setCustomerNumber}
                placeholder="Ingresa el número"
                type="number"
                size="compact"
                onChange={(e) =>
                  setCustomerNumber(normalizePhoneNumber(e.target.value))
                }
              />
            </div>
          )}

          {deliveryMethod === "table" && (
            <div className="mt-2 space-y-1.5">
              <button
                onClick={autoFillDeliveryFields}
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-primary/50 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-primary transition-all hover:border-primary hover:bg-primary/10"
              >
                <span className="material-symbols-outlined text-xs">
                  auto_fix_high
                </span>
                Autorellenar
              </button>
              <TextField
                label="Nombre"
                value={customerName}
                setValue={setCustomerName}
                placeholder="Ingresa el nombre"
                size="compact"
              />
              <TextField
                label="Número"
                value={customerNumber}
                setValue={setCustomerNumber}
                placeholder="Ingresa el número"
                type="number"
                size="compact"
                onChange={(e) =>
                  setCustomerNumber(normalizePhoneNumber(e.target.value))
                }
              />
              <div>
                <TextField
                  label="Mesa"
                  value={selectedTable}
                  setValue={setSelectedTable}
                  placeholder="Número de mesa"
                  type="number"
                  size="compact"
                  inputRef={tableInputRef}
                />
                {tableOccupancyWarning?.occupied && (
                  <div className="mt-2 p-3 rounded-lg bg-red-500/15 border border-red-500/50 animate-in fade-in slide-in-from-top-2 duration-300">
                    <p className="text-xs font-bold text-red-600 leading-relaxed">
                      {tableOccupancyWarning.message}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-5 gap-1 mt-2">
                  {Array.from({ length: 9 }, (_, i) => i + 1).map((num) => (
                    <button
                      key={num}
                      onClick={() => setSelectedTable(num.toString())}
                      className={`p-2 rounded-lg font-bold text-xs  transition-all ${
                        selectedTable === num.toString()
                          ? "bg-primary-container text-on-surface border-primary"
                          : "bg-surface border-outline text-on-surface-variant hover:border-outline"
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    onClick={() => tableInputRef.current?.focus()}
                    className=" rounded-lg font-bold text-xs transition-all bg-primary-container/20  text-primary hover:bg-primary-container hover:text-on-surface hover:border-primary"
                    title="Agregar mesa con número mayor a 9"
                  >
                    <span className="material-symbols-outlined text-base">
                      add
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {deliveryMethod === "delivery" && (
            <div className="mt-2 space-y-1.5">
              <button
                onClick={autoFillDeliveryFields}
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-primary/50 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-primary transition-all hover:border-primary hover:bg-primary/10"
              >
                <span className="material-symbols-outlined text-xs">
                  auto_fix_high
                </span>
                Autorellenar
              </button>
              <TextField
                label="Nombre"
                value={customerName}
                setValue={setCustomerName}
                placeholder="Ingresa el nombre"
                size="compact"
              />
              <TextField
                label="Número"
                value={customerNumber}
                setValue={setCustomerNumber}
                placeholder="Ingresa el número"
                type="number"
                size="compact"
                onChange={(e) =>
                  setCustomerNumber(normalizePhoneNumber(e.target.value))
                }
              />
              {deliveryAddressField}
              {deliveryCoordinatesField}
              <TextField
                label="Punto de Referencia"
                value={referencePoint}
                setValue={setReferencePoint}
                placeholder="Ingresa el punto de referencia"
                size={isDeliveryMapFullscreen ? "md" : "compact"}
              />

              {!isDeliveryMapFullscreen && (
                <div className="relative">
                  {deliveryMapContent}
                  <button
                    type="button"
                    onClick={() => setIsDeliveryMapFullscreen(true)}
                    className="absolute bottom-2 right-2 z-20 flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-neutral-950/90 text-white shadow-lg transition hover:bg-neutral-800"
                    aria-label="Mostrar mapa en pantalla completa"
                    title="Mostrar mapa en pantalla completa"
                  >
                    <Maximize2 size={15} />
                  </button>
                </div>
              )}
              {!isDeliveryMapFullscreen && deliveryMapStatus}
              {!isDeliveryMapFullscreen && deliveryCostSummary}
            </div>
          )}

          {deliveryMethod === "point" && (
            <div className="mt-2 space-y-1.5">
              <button
                onClick={autoFillDeliveryFields}
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-primary/50 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-primary transition-all hover:border-primary hover:bg-primary/10"
              >
                <span className="material-symbols-outlined text-xs">
                  auto_fix_high
                </span>
                Autorellenar
              </button>
              <TextField
                label="Nombre"
                value={customerName}
                setValue={setCustomerName}
                placeholder="Ingresa el nombre"
                size="compact"
              />
              <TextField
                label="Número"
                value={customerNumber}
                setValue={setCustomerNumber}
                placeholder="Ingresa el número"
                type="number"
                size="compact"
                onChange={(e) =>
                  setCustomerNumber(normalizePhoneNumber(e.target.value))
                }
              />
              <TextField
                label="Ubicación"
                value={locationText}
                setValue={setLocationText}
                placeholder="Ingresa la ubicación"
                size="compact"
              />
            </div>
          )}
        </div>

        {/* Carrito Lateral - Contenedor Principal (DESKTOP) */}
        <div className="bg-background border-l border-outline hidden lg:flex flex-col h-screen overflow-hidden">
          {/* Header: Título y Acción de Limpiar */}
          <div className="p-4 pb-2 flex justify-between items-center flex-shrink-0">
            <h2 className="text-base font-black uppercase tracking-tighter text-on-surface">
              Resumen
            </h2>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="group flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-all"
              >
                <span className="material-symbols-outlined text-sm text-neutral-500 group-hover:text-red-500">
                  delete_sweep
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 group-hover:text-red-500">
                  Vaciar
                </span>
              </button>
            )}
          </div>

          {/* Lista de Productos - Scrollable */}
          <div
            ref={cartScrollRef}
            className="flex-1 min-h-0 overflow-y-auto px-4 custom-sidebar py-4"
          >
            {cart.map((item) => (
              <div
                key={item.cartId}
                data-cart-id={item.cartId}
                className={`relative border transition-all duration-300 rounded-2xl p-2 mb-2 ${
                  removingItems.has(item.cartId)
                    ? "opacity-0 scale-95 -translate-x-4"
                    : highlightItem === item.cartId
                      ? "bg-violet-600 border-violet-400 shadow-[0_8px_20px_rgba(139,92,246,0.15)] scale-[1.02] z-20"
                      : "bg-neutral-900/40 border-white/5 z-10 hover:border-white/10"
                }`}
              >
                <div className="flex gap-3  min-w-0">
                  {/* Miniatura / Imagen real del producto */}
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden ${
                      highlightItem === item.cartId
                        ? "bg-white/20 border-white/20"
                        : "bg-neutral-800 border-white/5"
                    }`}
                  >
                    {(item.image_url || item.image || item.imageUrl)?.trim() ? (
                      <img
                        src={item.image_url || item.image || item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="flex h-full w-full items-center justify-center bg-neutral-700/70 px-1"
                        aria-label={item.name}
                      >
                        <span className="truncate text-center text-[8px] font-black text-neutral-400/80">
                          {item.name}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-[12px] uppercase tracking-tight text-white leading-tight truncate">
                          {item.name}
                        </p>
                        <p className="font-black text-[12px] text-white">
                          $ {formatPrice(getInitialCartPrice(item))}
                        </p>
                      </div>

                      <button
                        onClick={() => removeFromCart(item.cartId)}
                        className="opacity-40 hover:opacity-100 hover:text-red-500 transition-all flex-shrink-0 flex"
                        aria-label="Eliminar producto"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {item.selectedOptions && item.selectedOptions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.selectedOptions.map((opt, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] font-bold text-violet-300 bg-violet-500/10 px-2 py-0.5 rounded-full"
                      >
                        {opt.nombre}
                        {opt.precio_extra > 0
                          ? ` (+$${formatPrice(opt.precio_extra)})`
                          : ""}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 mt-2">
                  <div
                    className={`flex items-center gap-2 rounded-full px-4 py-1 flex-shrink-0 ${
                      highlightItem === item.cartId
                        ? "bg-background/20"
                        : "bg-neutral-800/80"
                    }`}
                  >
                    <button
                      onClick={() =>
                        updateQty(
                          item.cartId,
                          Math.max(
                            0,
                            Number(
                              (
                                Number(item.qty) -
                                (item.unit?.allows_fraction ? 0.1 : 1)
                              ).toFixed(3),
                            ),
                          ),
                        )
                      }
                      className="opacity-60 hover:opacity-100 transition-opacity w-2 h-2 flex items-center justify-center rounded-full hover:text-primary-container"
                      aria-label="Disminuir cantidad"
                    >
                      <span className="material-symbols-outlined text-[12px]">
                        remove
                      </span>
                    </button>
                    <input
                      type="text"
                      inputMode={
                        item.unit?.allows_fraction ? "decimal" : "numeric"
                      }
                      value={
                        quantityDrafts[item.cartId] ??
                        formatInteger(item.qty)
                      }
                      onFocus={() =>
                        item.unit?.allows_fraction &&
                        setQuantityDrafts((current) => ({
                          ...current,
                          [item.cartId]: String(item.qty),
                        }))
                      }
                      onChange={(e) =>
                        item.unit?.allows_fraction
                          ? setQuantityDrafts((current) => ({
                              ...current,
                              [item.cartId]: e.target.value,
                            }))
                          : handleQtyInputChange(item.cartId, e.target.value)
                      }
                      onBlur={() => commitQuantityDraft(item.cartId)}
                      className="w-12 bg-transparent text-center text-[11px] font-black text-on-surface outline-none appearance-none"
                      aria-label="Cantidad del producto"
                    />
                    <span className="text-[9px] font-bold text-neutral-400">
                      {item.unit?.name || "UNIDAD"}
                    </span>
                    <button
                      onClick={() => incrementCartItem(item)}
                      className="opacity-60 hover:opacity-100 transition-opacity w-2 h-2 flex items-center justify-center rounded-full hover:text-primary-container"
                      aria-label="Aumentar cantidad"
                    >
                      <span className="material-symbols-outlined text-[12px]">
                        add
                      </span>
                    </button>
                  </div>

                  <p className="font-black text-[12px] text-white">
                    $ {formatPrice(item.price * item.qty)}
                  </p>
                </div>

                {/* Nota del Ítem */}
                <button
                  onClick={(e) => openNoteModal(e, item, item.note)}
                  className={`w-full mt-3 text-left p-1.5 rounded-lg border border-dashed transition-all ${
                    item.note
                      ? "bg-violet-500/10 border-violet-500/30"
                      : "border-white/5 hover:bg-white/5"
                  }`}
                >
                  <p
                    className={`text-[9px] font-medium truncate ${item.note ? "text-violet-300 italic" : "text-neutral-500"}`}
                  >
                    {item.note
                      ? `"${item.note}"`
                      : "+ Agregar instrucción especial"}
                  </p>
                </button>
              </div>
            ))}
          </div>

          {/* Footer: Totales y Pago */}
          <div className="p-4 bg-surface border-t border-outline mt-auto flex-shrink-0 shadow-[0_-15px_30px_rgba(0,0,0,0.5)]">
            {/* Resumen Numérico */}
            <div className="space-y-1 mb-2">
              <div className="flex justify-between items-center opacity-60 m-0">
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  Subtotal
                </span>
                <span className="text-sm font-bold">
                  $ {formatPrice(itemsSubtotal)}
                </span>
              </div>
              {deliveryMethod === "delivery" && deliveryBaseFee !== null && (
                <>
                  <div className="flex justify-between items-center opacity-70">
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                      Domicilio
                    </span>
                    <span className="text-sm font-bold">
                      $ {formatPrice(deliveryBaseCharge)}
                    </span>
                  </div>
                  {nightDeliverySurcharge > 0 && (
                    <div className="flex justify-between items-center text-amber-200">
                      <span className="text-[10px] font-bold uppercase tracking-widest">
                        Recargo nocturno ({nightSurchargePercent}%)
                      </span>
                      <span className="text-sm font-bold">
                        + $ {formatPrice(nightDeliverySurcharge)}
                      </span>
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-between items-center opacity-70">
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  Total sin propina
                </span>
                <span className="text-sm font-bold">
                  $ {formatPrice(totalWithoutTip)}
                </span>
              </div>
              {tipAmount > 0 && (
                <div className="flex justify-between items-center text-emerald-300">
                  <span className="text-[10px] font-bold uppercase tracking-widest">
                    Propina ({tipPercent}%)
                  </span>
                  <span className="text-sm font-bold">
                    + $ {formatPrice(tipAmount)}
                  </span>
                </div>
              )}

              {(paymentMethod === "efectivo" || paymentMethod === "dividir") &&
                (paidAmount > 0 || assignedTotal > 0) && (
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                      {remainingLabel}
                    </span>
                    <span
                      className={`text-lg font-black ${
                        remaining > 0
                          ? "text-red-500"
                          : remaining < 0
                            ? "text-emerald-500"
                            : "text-violet-400"
                      }`}
                    >
                      $ {remainingDisplay}
                    </span>
                  </div>
                )}

              <div className="flex justify-between items-end">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-500">
                  Total a Pagar
                </span>
                <span className="text-2xl font-black text-on-surface tracking-tighter">
                  $ {formatPrice(total)}
                </span>
              </div>
              {/* Lectura de número */}
              {total > 0 && (
                <p className="text-[10px] text-on-surface text-right mt-1 uppercase  tracking-wider">
                  {numeroALetras(total)}
                </p>
              )}
            </div>

            {/* Observaciones Generales */}
            <div className="mb-3">
              <textarea
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="Observaciones generales..."
                className="w-full min-h-[72px] resize-none rounded-2xl border border-outline bg-background px-3 py-3 text-base text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </div>

            {/* Métodos de Pago */}
            {paymentMethodsSection}

            {splitPaymentPreview}

            {/* Botón de Acción Principal */}
            <button
              onClick={crearPedidoPOS}
              disabled={
                isSubmittingOrder ||
                cart.length === 0 ||
                isCashPaymentBelowTotal ||
                (isEditingTableOrder && !hasEditChanges)
              }
              aria-busy={isSubmittingOrder}
              className="w-full bg-primary-container hover:bg-success active:scale-[0.98] text-on-surface font-black py-4 rounded-2xl transition-all uppercase text-[11px] tracking-[0.2em] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmittingOrder ? (
                <>
                  <span className="material-symbols-outlined mr-2 animate-spin align-middle">
                    progress_activity
                  </span>
                  Procesando...
                </>
              ) : isEditingTableOrder ? (
                "Actualizar"
              ) : (
                "Confirmar"
              )}
            </button>
          </div>
        </div>

        {/* Carrito Lateral - Contenedor Principal (MOBILE) */}
        <div
          className={`${mobilePanel !== "resumen" ? "hidden" : "block"} lg:hidden bg-background border-l border-outline flex flex-col h-screen overflow-hidden`}
        >
          {/* Header: Título y Acción de Limpiar */}
          <div className="p-4 pb-2 flex justify-between items-center flex-shrink-0">
            <h2 className="text-base font-black uppercase tracking-tighter text-on-surface">
              Resumen
            </h2>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="group flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-all"
              >
                <span className="material-symbols-outlined text-sm text-neutral-500 group-hover:text-red-500">
                  delete_sweep
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 group-hover:text-red-500">
                  Vaciar
                </span>
              </button>
            )}
          </div>

          {/* Lista de Productos - Scrollable */}
          <div
            ref={cartScrollRefMobile}
            className="flex-1 min-h-0 overflow-y-auto px-4 custom-sidebar py-4"
          >
            {cart.map((item) => {
              const isHighlighted = highlightItem === item.cartId;
              const isRemoving = removingItems.has(item.cartId);

              return (
                <div
                  key={item.cartId}
                  data-cart-id={item.cartId}
                  className={`relative border transition-all duration-300 rounded-2xl p-2 mb-2 ${
                    isRemoving
                      ? "opacity-0 scale-95 -translate-x-4"
                      : isHighlighted
                        ? "bg-violet-600 border-violet-400 shadow-[0_8px_20px_rgba(139,92,246,0.15)] scale-[1.02] z-20"
                        : "bg-neutral-900/40 border-white/5 z-10 hover:border-white/10"
                  }`}
                >
                  <div className="flex gap-3 min-w-0">
                    {/* Miniatura / Imagen real del producto */}
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden ${
                        isHighlighted
                          ? "bg-white/20 border-white/20"
                          : "bg-neutral-800 border-white/5"
                      }`}
                    >
                      {(
                        item.image_url ||
                        item.image ||
                        item.imageUrl
                      )?.trim() ? (
                        <img
                          src={item.image_url || item.image || item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className="flex h-full w-full items-center justify-center bg-neutral-700/70 px-1"
                          aria-label={item.name}
                        >
                          <span className="truncate text-center text-[8px] font-black text-neutral-400/80">
                            {item.name}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-[12px] uppercase tracking-tight text-white leading-tight truncate">
                            {item.name}
                          </p>
                          <p className="font-black text-[12px] text-white">
                            $ {formatPrice(getInitialCartPrice(item))}
                          </p>
                        </div>

                        <button
                          onClick={() => removeFromCart(item.cartId)}
                          className="opacity-40 hover:opacity-100 hover:text-red-500 transition-all flex-shrink-0 flex"
                          aria-label="Eliminar producto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {item.selectedOptions && item.selectedOptions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {item.selectedOptions.map((opt, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] font-bold text-violet-300 bg-violet-500/10 px-2 py-0.5 rounded-full"
                        >
                          {opt.nombre}
                          {opt.precio_extra > 0
                            ? ` (+$${formatPrice(opt.precio_extra)})`
                            : ""}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 mt-2">
                    <div
                      className={`flex items-center gap-2 rounded-full px-4 py-1 flex-shrink-0 ${
                        isHighlighted ? "bg-background/20" : "bg-neutral-800/80"
                      }`}
                    >
                      <button
                        onClick={() =>
                          updateQty(
                            item.cartId,
                            Math.max(
                              0,
                              Number(
                                (
                                  Number(item.qty) -
                                  (item.unit?.allows_fraction ? 0.1 : 1)
                                ).toFixed(3),
                              ),
                            ),
                          )
                        }
                        className="opacity-60 hover:opacity-100 transition-opacity w-2 h-2 flex items-center justify-center rounded-full hover:text-primary-container"
                        aria-label="Disminuir cantidad"
                      >
                        <span className="material-symbols-outlined text-[12px]">
                          remove
                        </span>
                      </button>
                      <input
                        type="text"
                        inputMode={
                          item.unit?.allows_fraction ? "decimal" : "numeric"
                        }
                        value={
                          quantityDrafts[item.cartId] ?? formatInteger(item.qty)
                        }
                        onFocus={() =>
                          item.unit?.allows_fraction &&
                          setQuantityDrafts((current) => ({
                            ...current,
                            [item.cartId]: String(item.qty),
                          }))
                        }
                        onChange={(e) =>
                          item.unit?.allows_fraction
                            ? setQuantityDrafts((current) => ({
                                ...current,
                                [item.cartId]: e.target.value,
                              }))
                            : handleQtyInputChange(item.cartId, e.target.value)
                        }
                        onBlur={() => commitQuantityDraft(item.cartId)}
                        className="w-12 bg-transparent text-center text-[11px] font-black text-on-surface outline-none appearance-none"
                        aria-label="Cantidad del producto"
                      />
                      <span className="text-[9px] font-bold text-neutral-400">
                        {item.unit?.name || "UNIDAD"}
                      </span>
                      <button
                        onClick={() => incrementCartItem(item)}
                        className="opacity-60 hover:opacity-100 transition-opacity w-2 h-2 flex items-center justify-center rounded-full hover:text-primary-container"
                        aria-label="Aumentar cantidad"
                      >
                        <span className="material-symbols-outlined text-[12px]">
                          add
                        </span>
                      </button>
                    </div>

                    <p className="font-black text-[12px] text-white">
                      $ {formatPrice(item.price * item.qty)}
                    </p>
                  </div>

                  {/* Nota del Ítem */}
                  <button
                    onClick={(e) => openNoteModal(e, item, item.note)}
                    className={`w-full mt-3 text-left p-1.5 rounded-lg border border-dashed transition-all ${
                      item.note
                        ? "bg-violet-500/10 border-violet-500/30"
                        : "border-white/5 hover:bg-white/5"
                    }`}
                  >
                    <p
                      className={`text-[9px] font-medium truncate ${
                        item.note
                          ? "text-violet-300 italic"
                          : "text-neutral-500"
                      }`}
                    >
                      {item.note
                        ? `"${item.note}"`
                        : "+ Agregar instrucción especial"}
                    </p>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Footer: Totales y Pago */}
          <div className="p-4 bg-surface border-t border-outline mt-auto flex-shrink-0 mb-20 shadow-[0_-15px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[50%] custom-sidebar">
            {/* Resumen Numérico */}
            <div className="space-y-1 mb-2">
              <div className="flex justify-between items-center opacity-60 m-0">
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  Subtotal
                </span>
                <span className="text-sm font-bold">
                  $ {formatPrice(itemsSubtotal)}
                </span>
              </div>
              {deliveryMethod === "delivery" && deliveryBaseFee !== null && (
                <>
                  <div className="flex justify-between items-center opacity-70">
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                      Domicilio
                    </span>
                    <span className="text-sm font-bold">
                      $ {formatPrice(deliveryBaseCharge)}
                    </span>
                  </div>
                  {nightDeliverySurcharge > 0 && (
                    <div className="flex justify-between items-center text-amber-200">
                      <span className="text-[10px] font-bold uppercase tracking-widest">
                        Recargo nocturno ({nightSurchargePercent}%)
                      </span>
                      <span className="text-sm font-bold">
                        + $ {formatPrice(nightDeliverySurcharge)}
                      </span>
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-between items-center opacity-70">
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  Total sin propina
                </span>
                <span className="text-sm font-bold">
                  $ {formatPrice(totalWithoutTip)}
                </span>
              </div>
              {tipAmount > 0 && (
                <div className="flex justify-between items-center text-emerald-300">
                  <span className="text-[10px] font-bold uppercase tracking-widest">
                    Propina ({tipPercent}%)
                  </span>
                  <span className="text-sm font-bold">
                    + $ {formatPrice(tipAmount)}
                  </span>
                </div>
              )}

              {(paymentMethod === "efectivo" || paymentMethod === "dividir") &&
                (paidAmount > 0 || assignedTotal > 0) && (
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                      {remainingLabel}
                    </span>
                    <span
                      className={`text-lg font-black ${
                        remaining > 0
                          ? "text-red-500"
                          : remaining < 0
                            ? "text-emerald-500"
                            : "text-violet-400"
                      }`}
                    >
                      $ {remainingDisplay}
                    </span>
                  </div>
                )}

              <div className="flex justify-between items-end">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-500">
                  Total a Pagar
                </span>
                <span className="text-2xl font-black text-on-surface tracking-tighter">
                  $ {formatPrice(total)}
                </span>
              </div>
              {/* Lectura de número */}
              {total > 0 && (
                <p className="text-[10px]  text-on-surface text-right mt-1 uppercase tracking-wider">
                  {numeroALetras(total)}
                </p>
              )}
            </div>

            {/* Observaciones Generales */}
            <div className="mb-3">
              <textarea
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="Observaciones generales..."
                className="w-full min-h-[72px] resize-none rounded-2xl border border-outline bg-background px-3 py-3 text-base text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </div>

            {/* Métodos de Pago */}
            {paymentMethodsSection}

            {/* Preview de División de Pagos */}
            {splitPaymentPreview}

            {/* Botón de Acción Principal */}
            <button
              onClick={crearPedidoPOS}
              disabled={
                isSubmittingOrder ||
                cart.length === 0 ||
                isCashPaymentBelowTotal ||
                (isEditingTableOrder && !hasEditChanges)
              }
              aria-busy={isSubmittingOrder}
              className="w-full bg-primary-container hover:bg-success active:scale-[0.98] text-on-surface font-black py-3 rounded-2xl transition-all uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-primary-container/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmittingOrder ? (
                <>
                  <span className="material-symbols-outlined mr-2 animate-spin align-middle">
                    progress_activity
                  </span>
                  Procesando...
                </>
              ) : isEditingTableOrder ? (
                "Actualizar"
              ) : (
                "Confirmar"
              )}
            </button>
          </div>
        </div>

        <div className="lg:hidden fixed bottom-0 left-20 right-0 z-40 bg-background/80 backdrop-blur-md border-l border-outline px-4 py-3 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: "products", icon: "shopping_bag", label: "Productos" },
              { key: "datos", icon: "inventory", label: "Datos" },
              { key: "resumen", icon: "shopping_cart", label: "Resumen" },
            ].map(({ key, icon, label }) => {
              const isActive = mobilePanel === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMobilePanel(key)}
                  className={`relative flex flex-col items-center justify-center  rounded-xl py-2 transition-all duration-200 active:scale-95 ${
                    isActive
                      ? "bg-primary-container text-on-surface shadow-lg shadow-primary-container/20"
                      : "bg-on-surface/5 text-on-surface-variant hover:bg-on-surface/10"
                  }`}
                >
                  {/* Contenedor del Icono + Badge */}
                  <div className="relative">
                    <span
                      className={`material-symbols-outlined text-[22px] transition-transform ${isActive ? "scale-110" : ""}`}
                    >
                      {icon}
                    </span>

                    {/* Badge Flotante Estilizado */}
                    {key === "resumen" && totalItems > 0 && (
                      <span
                        className="absolute -top-1 -right-2.5 min-w-[18px] h-[18px] rounded-full bg-red-600 text-[9px] font-black text-white flex items-center justify-center leading-none"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <span className="mt-[0.5px] mr-[1px]">
                          {totalItems}
                        </span>
                      </span>
                    )}
                  </div>

                  <span className="text-[9px] font-black uppercase tracking-widest text-on-surface">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="relative isolate bg-surface  rounded-[25px] w-full max-w-md p-6 md:p-7 shadow-2xl shadow-background/60 animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden">
              {/* Header compacto */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-primary font-label-caps text-lg font-black uppercase tracking-[0.15em] truncate">
                    {activeProduct?.name || "Producto"}
                  </p>
                  <h3 className="text-on-surface font-h2 font-black text-xs uppercase italic tracking-tight">
                    Instrucciones
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    setActiveProduct(null);
                  }}
                  className="text-on-surface-variant hover:text-on-surface"
                  aria-label="Cerrar instrucciones"
                >
                  <span className="material-symbols-outlined text-xl">
                    close
                  </span>
                </button>
              </div>

              {/* Textarea */}
              <div className="relative w-full mb-6">
                <textarea
                  autoFocus
                  id="instruction-textarea"
                  className="w-full bg-background border border-outline rounded-lg p-4 text-on-surface text-base placeholder:text-on-surface-variant/40 outline-none min-h-[140px] resize-none transition-all duration-300 focus:border-primary focus:ring-1 focus:ring-primary/20"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="Añade una instrucción especial (opcional)"
                />
              </div>

              {/* Footer: acción principal sólo */}
              <div className="mt-auto pt-3 border-t border-white/6">
                <button
                  onClick={confirmWithNote}
                  className="w-full rounded-[1.5rem] bg-primary-container px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-on-primary transition-colors duration-200 hover:bg-success"
                >
                  {activeProduct?.cartId ? "Guardar" : "Añadir"}
                </button>
              </div>
            </div>
          </div>
        )}
        {optionModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-0 lg:p-6">
            <div className="relative flex h-full w-full max-w-full flex-col overflow-hidden rounded-none bg-surface text-on-surface shadow-[0_30px_80px_rgba(0,0,0,0.55)] lg:h-auto lg:max-h-[90vh] lg:max-w-2xl lg:rounded-[2rem]">
              <div className="flex items-start justify-between gap-4 px-4 py-4 lg:px-6 lg:py-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/5 overflow-hidden">
                    {activeProduct?.image_url?.trim() ? (
                      <img
                        src={activeProduct.image_url}
                        alt={activeProduct.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div
                        className="flex h-full w-full items-center justify-center bg-neutral-700/70 px-2"
                        aria-label={activeProduct?.name}
                      >
                        <span className="truncate text-center text-2xl font-black text-neutral-400/80">
                          {activeProduct?.name}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold tracking-tight text-on-surface truncate">
                      {activeProduct?.name || "Seleccionar opciones"}
                    </h3>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setOptionModalOpen(false);
                    setActiveProduct(null);
                    setOptionSelections({});
                    setOptionNote("");
                    setOptionValidationError("");
                  }}
                  className="text-on-surface-variant hover:text-on-surface"
                  aria-label="Cerrar opciones"
                >
                  <span className="material-symbols-outlined text-xl">
                    close
                  </span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-6 lg:py-5">
                {(activeProduct?.description ||
                  activeProduct?.desc ||
                  activeProduct?.descripcion) && (
                  <div className="mb-4 text-sm leading-6 text-on-surface-variant">
                    {activeProduct.description ||
                      activeProduct.desc ||
                      activeProduct.descripcion}
                  </div>
                )}
                {(activeProduct?.optionGroups || []).map((group) => {
                  const selected = optionSelections[group.id];
                  return (
                    <div
                      key={group.id}
                      className="border-b border-white/10 pb-5 pt-5 last:border-b-0 last:pb-0"
                    >
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-on-surface">
                            {group.nombre}
                          </p>
                          {group.obligatorio ? (
                            <span className="rounded-full bg-red-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-red-300">
                              Obligatorio
                            </span>
                          ) : null}
                          <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">
                            {group.selectionType === "multiple"
                              ? "Elige varias"
                              : "Elige una"}
                          </span>
                        </div>
                        {group.descripcion ? (
                          <p className="text-xs leading-5 text-on-surface-variant">
                            {group.descripcion}
                          </p>
                        ) : null}
                      </div>
                      <div className="mt-4 grid gap-2">
                        {group.opciones.map((option) => {
                          const isSelected =
                            group.selectionType === "multiple"
                              ? Array.isArray(selected) &&
                                selected.includes(option.id)
                              : selected === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => {
                                setOptionSelections((prev) => {
                                  const next = { ...prev };
                                  if (group.selectionType === "multiple") {
                                    const current = Array.isArray(
                                      prev[group.id],
                                    )
                                      ? prev[group.id]
                                      : [];
                                    if (current.includes(option.id)) {
                                      next[group.id] = current.filter(
                                        (id) => id !== option.id,
                                      );
                                    } else {
                                      next[group.id] = [...current, option.id];
                                    }
                                  } else {
                                    next[group.id] = option.id;
                                  }
                                  return next;
                                });
                              }}
                              className={`w-full rounded-[1.5rem] px-4 py-4 text-left transition ${
                                isSelected
                                  ? "text-on-surface bg-primary-container/50"
                                  : "bg-white/5 text-on-surface-variant hover:bg-white/10"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <span
                                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[12px] transition-colors ${
                                      isSelected
                                        ? "border-primary-container bg-primary-container text-white"
                                        : "border-white/20 bg-white/5 text-transparent"
                                    }`}
                                  >
                                    {isSelected ? (
                                      <span className="material-symbols-outlined leading-none text-white">
                                        check
                                      </span>
                                    ) : null}
                                  </span>
                                  <p className="text-sm font-medium line-clamp-1">
                                    {option.nombre}
                                  </p>
                                </div>
                                {option.precio_extra ? (
                                  <p className="text-sm text-on-surface-variant">
                                    +$ {formatPrice(option.precio_extra)}
                                  </p>
                                ) : (
                                  <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">
                                    Incluido
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                <div className="mt-5">
                  <label className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-on-surface-variant mb-2">
                    Nota de producto
                  </label>
                  <textarea
                    value={optionNote}
                    onChange={(e) => setOptionNote(e.target.value)}
                    className="w-full min-h-[110px] rounded-[1.5rem] border border-white/10 bg-background/90 p-4 text-base text-on-surface outline-none resize-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                    placeholder="Añade una instrucción especial (opcional)"
                  />
                </div>
                {optionValidationError ? (
                  <p className="mt-3 text-sm font-semibold text-error">
                    {optionValidationError}
                  </p>
                ) : null}
              </div>

              <div className="border-t border-white/10 bg-surface px-4 py-4 lg:px-6 lg:py-5">
                <div className="flex flex-row flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex items-center justify-between gap-1 rounded-full bg-white/5 px-4 py-2 text-sm font-semibold text-on-surface">
                    <button
                      type="button"
                      onClick={() =>
                        setOptionQuantity((previous) =>
                          String(
                            Math.max(
                              activeProduct?.unit?.allows_fraction ? 0.1 : 1,
                              (parseDecimalQuantity(previous) ??
                                Number(previous) ??
                                0) -
                                (activeProduct?.unit?.allows_fraction
                                  ? 0.1
                                  : 1),
                            ).toFixed(
                              activeProduct?.unit?.allows_fraction ? 1 : 0,
                            ),
                          ),
                        )
                      }
                      className=" rounded-md text-on-surface-variant hover:text-on-surface transition-colors text-2xl font-bold"
                    >
                      -
                    </button>
                    <input
                      ref={optionQuantityInputRef}
                      type="text"
                      inputMode={
                        activeProduct?.unit?.allows_fraction
                          ? "decimal"
                          : "numeric"
                      }
                      value={optionQuantity}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (activeProduct?.unit?.allows_fraction) {
                          if (/^\d*([,.]\d{0,3})?$/.test(value)) {
                            setOptionQuantity(value);
                          }
                        } else {
                          const digits = value.replace(/\D/g, "");
                          setOptionQuantity(digits || "1");
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          confirmOptionSelection();
                        }
                      }}
                      className="w-12 bg-transparent text-center text-[16px] font-semibold text-on-surface outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const step = activeProduct?.unit?.allows_fraction
                          ? 0.1
                          : 1;
                        const current =
                          parseDecimalQuantity(optionQuantity) ??
                          Number(optionQuantity) ??
                          0;
                        setOptionQuantity(
                          String(Number((current + step).toFixed(3))),
                        );
                      }}
                      className="rounded-md text-on-surface-variant hover:text-on-surface transition-colors text-2xl font-bold"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={confirmOptionSelection}
                    className="flex-1 rounded-[1.5rem] bg-primary-container px-4 py-3 text-sm font-semibold uppercase  text-on-primary transition-colors duration-200 hover:bg-success"
                  >
                    Agregar • ${" "}
                    {formatPrice(
                      activeProductSelectedPrice *
                        (parseDecimalQuantity(optionQuantity) || 0),
                    )}
                    {activeProduct?.unit?.allows_fraction
                      ? ` · ${activeProduct.unit.name}`
                      : ""}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showTicketLimitNotice && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ticket-limit-title"
            className="w-full max-w-md rounded-2xl border border-violet-400/30 bg-surface p-6 shadow-2xl"
          >
            <h2
              id="ticket-limit-title"
              className="text-lg font-black uppercase text-on-surface"
            >
              Límite de tickets alcanzado
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
              Tu plan llegó al máximo de tickets del ciclo. Las órdenes y el
              historial siguen disponibles; cambia a un plan superior para
              continuar creando ventas.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowTicketLimitNotice(false)}
                className="flex-1 rounded-xl border border-outline px-4 py-3 text-xs font-black uppercase tracking-widest text-on-surface-variant hover:text-on-surface"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowTicketLimitNotice(false);
                  navigate("/pos/planes");
                }}
                className="flex-1 rounded-xl bg-violet-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-violet-500"
              >
                Ver planes
              </button>
            </div>
          </section>
        </div>
      )}

      {showOutOfStockWarning && outOfStockProduct && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-orange-400/30 bg-surface p-6 shadow-2xl">
            <div className="mb-4 flex items-start gap-3">
              <span className="material-symbols-outlined text-3xl text-orange-300">
                warning
              </span>
              <div>
                <h3 className="text-lg font-black uppercase text-on-surface">
                  Producto agotado
                </h3>
                <p className="mt-1 text-sm font-bold text-on-surface">
                  {outOfStockProduct.name}
                </p>
              </div>
            </div>
            <p className="mb-6 text-sm leading-relaxed text-on-surface-variant">
              {outOfStockMessage}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowOutOfStockWarning(false);
                  setOutOfStockProduct(null);
                  setOutOfStockMessage("");
                  setOutOfStockCartId(null);
                  setPendingOutOfStockQuantity(null);
                }}
                className="flex-1 rounded-xl border border-outline bg-background px-4 py-3 text-xs font-black uppercase tracking-widest text-on-surface-variant hover:text-on-surface"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={continueWithOutOfStockProduct}
                className="flex-1 rounded-xl bg-orange-500 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-orange-400"
              >
                Continuar venta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación para limpiar carrito */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-background bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-surface border border-outline rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-on-surface text-lg font-bold mb-4">
              ¿Estas seguro?
            </h3>
            <p className="text-on-surface-variant mb-6">
              ¿Estás seguro de que quieres eliminar todos los productos?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setCart([]);
                  setShowConfirmModal(false);
                }}
                className="flex-1 bg-error hover:bg-error/80 text-on-surface font-bold py-2 rounded-lg transition-colors"
              >
                Sí, limpiar
              </button>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 bg-surface-hover hover:bg-surface text-on-surface font-bold py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {showOrderSentModal && sentOrder && (
        <div className="fixed inset-0 bg-background bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-outline rounded-lg p-8 max-w-md w-full mx-4 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-full bg-success/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-success text-5xl">
                  check
                </span>
              </div>
              <h3 className="text-on-surface text-2xl font-bold">Enviado</h3>
              <p className="text-on-surface-variant">Se envió correctamente.</p>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => handleShareSentOrder(sentOrder)}
                className="flex items-center justify-center gap-3 py-3 px-6 bg-surface border border-outline hover:bg-surface-hover text-on-surface font-bold rounded-2xl shadow-sm hover:shadow-md transition-all text-sm sm:text-base ring-1 ring-transparent focus:ring-offset-2 focus:ring-primary/20"
                aria-label="Compartir pedido"
              >
                <span className="material-symbols-outlined">share</span>
                <span>Compartir</span>
              </button>

              <button
                onClick={() => handleSavePdfSentOrder(sentOrder)}
                className="flex items-center justify-center gap-3 py-3 px-6 bg-surface border border-outline hover:bg-surface-hover text-on-surface font-bold rounded-2xl shadow-sm hover:shadow-md transition-all text-sm sm:text-base ring-1 ring-transparent focus:ring-offset-2 focus:ring-primary/20"
                aria-label="Guardar PDF"
              >
                <span className="material-symbols-outlined">save</span>
                <span>Guardar PDF</span>
              </button>

              <button
                onClick={() => handlePrintSentOrder(sentOrder)}
                className="flex items-center justify-center gap-3 py-3 px-6 bg-primary-container/50 hover:bg-primary-container text-on-primary font-bold rounded-2xl shadow-lg hover:shadow-xl transform hover:transition-all text-sm sm:text-base ring-1 ring-transparent focus:ring-offset-2 focus:ring-primary/40"
                aria-label="Imprimir pedido"
              >
                <span className="material-symbols-outlined">print</span>
                <span>Imprimir</span>
              </button>

              <button
                onClick={handleCloseSentOrderModal}
                className="flex items-center justify-center gap-3 py-3 px-6 bg-primary/20 hover:bg-primary/50 text-on-surface font-bold rounded-2xl shadow-sm hover:shadow-md transition-all text-sm sm:text-base ring-1 ring-transparent focus:ring-offset-2 focus:ring-primary/20"
                aria-label="Cerrar modal"
              >
                <span className="material-symbols-outlined">done</span>
                <span>Listo</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {showUpdateSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-success/30 bg-surface p-8 shadow-2xl">
            <div className="text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/20">
                <span className="material-symbols-outlined text-5xl text-success">
                  check_circle
                </span>
              </div>
              <h3 className="mt-5 text-2xl font-bold text-on-surface">
                Orden actualizada correctamente
              </h3>
              <p className="mt-2 text-on-surface-variant">
                Los cambios de la orden se guardaron correctamente.
              </p>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handleShareSentOrder(sentOrder)}
                className="flex items-center justify-center gap-3 rounded-2xl border border-outline bg-surface px-6 py-3 text-sm font-bold text-on-surface shadow-sm transition-all hover:bg-surface-hover sm:text-base"
                aria-label="Compartir factura"
              >
                <span className="material-symbols-outlined">share</span>
                <span>Compartir</span>
              </button>
              <button
                type="button"
                onClick={() => handleSavePdfSentOrder(sentOrder)}
                className="flex items-center justify-center gap-3 rounded-2xl border border-outline bg-surface px-6 py-3 text-sm font-bold text-on-surface shadow-sm transition-all hover:bg-surface-hover sm:text-base"
                aria-label="Guardar factura en PDF"
              >
                <span className="material-symbols-outlined">save</span>
                <span>Guardar PDF</span>
              </button>
              <button
                type="button"
                onClick={() => handlePrintSentOrder(sentOrder)}
                className="flex items-center justify-center gap-3 rounded-2xl bg-primary-container/50 px-6 py-3 text-sm font-bold text-on-primary shadow-lg transition-all hover:bg-primary-container sm:text-base"
                aria-label="Imprimir factura"
              >
                <span className="material-symbols-outlined">print</span>
                <span>Imprimir</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUpdateSuccessModal(false);
                  setSentOrder(null);
                }}
                className="flex items-center justify-center gap-3 rounded-2xl bg-primary/20 px-6 py-3 text-sm font-bold text-on-surface shadow-sm transition-all hover:bg-primary/50 sm:text-base"
                aria-label="Continuar"
              >
                <span className="material-symbols-outlined">done</span>
                <span>Continuar</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {showReservationSuccessModal && createdReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-blue-400/30 bg-surface p-6 shadow-2xl">
            <div className="text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-blue-500/15">
                <span className="material-symbols-outlined text-5xl text-blue-300">
                  event_available
                </span>
              </div>
              <h3 className="mt-4 text-2xl font-bold text-on-surface">
                Reserva lista
              </h3>
              <p className="mt-2 text-on-surface-variant">
                La reserva se creó correctamente.
              </p>
            </div>

            <div className="mt-5 space-y-2 rounded-xl border border-outline bg-background/50 p-4 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-on-surface-variant">Cliente</span>
                <strong className="text-right text-on-surface">
                  {createdReservation.customerName}
                </strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-on-surface-variant">Teléfono</span>
                <strong className="text-right text-on-surface">
                  {createdReservation.customerPhone}
                </strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-on-surface-variant">Mesa</span>
                <strong className="text-right text-on-surface">
                  {createdReservation.table}
                </strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-on-surface-variant">Fecha y hora</span>
                <strong className="text-right text-on-surface">
                  {createdReservation.date} · {createdReservation.time}
                </strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-on-surface-variant">Personas</span>
                <strong className="text-right text-on-surface">
                  {createdReservation.people}
                </strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-on-surface-variant">Referencia</span>
                <strong className="text-right text-on-surface">
                  {createdReservation.orderNumber}
                </strong>
              </div>
              {createdReservation.notes && (
                <div className="border-t border-outline pt-2 text-on-surface-variant">
                  Notas: {createdReservation.notes}
                </div>
              )}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={handleCopyReservation}
                className="flex items-center justify-center gap-2 rounded-xl border border-outline bg-background px-4 py-3 text-sm font-bold text-on-surface hover:bg-surface-hover"
              >
                <span className="material-symbols-outlined text-base">
                  content_copy
                </span>
                Copiar
              </button>
              <button
                type="button"
                onClick={handleShareReservation}
                className="flex items-center justify-center gap-2 rounded-xl border border-outline bg-background px-4 py-3 text-sm font-bold text-on-surface hover:bg-surface-hover"
              >
                <span className="material-symbols-outlined text-base">
                  share
                </span>
                Compartir
              </button>
              <button
                type="button"
                onClick={handleWhatsAppReservation}
                className="flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-bold text-white hover:bg-green-500"
              >
                <span className="material-symbols-outlined text-base">
                  chat
                </span>
                WhatsApp
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowReservationSuccessModal(false);
                setCreatedReservation(null);
              }}
              className="mt-3 w-full rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant hover:bg-surface-hover hover:text-on-surface"
            >
              Listo
            </button>
          </div>
        </div>
      )}
      {/* Modal de Reserva */}
      {showReservationModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background border border-outline rounded-2xl max-w-md w-full max-h-[88vh] p-6 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300 overflow-hidden">
            <div className="flex items-center justify-between gap-3 mb-4 flex-shrink-0">
              <h2 className="text-xl font-black text-white">Crear Reserva</h2>
              <div className="rounded-full border border-blue-500/50 bg-blue-500/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-blue-300">
                Mesa {reservationData.mesa || selectedTable || "-"}
              </div>
            </div>

            <div className="space-y-4 overflow-y-auto pr-1 flex-1">
              {/* Nombre */}
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                  Nombre del Cliente
                </label>
                <input
                  type="text"
                  value={reservationData.nombre}
                  onChange={(e) =>
                    setReservationData({
                      ...reservationData,
                      nombre: e.target.value,
                    })
                  }
                  placeholder="Ej: Juan Pérez"
                  className={`w-full bg-surface border rounded-lg p-3 text-on-surface focus:outline-none focus:border-primary transition-all ${
                    !reservationData.nombre.trim()
                      ? "border-red-500/40 bg-red-500/5"
                      : "border-outline"
                  }`}
                />
              </div>

              {/* Teléfono */}
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={reservationData.telefono}
                  onChange={(e) =>
                    setReservationData({
                      ...reservationData,
                      telefono: normalizePhoneNumber(e.target.value),
                    })
                  }
                  placeholder="Ej: 3001234567"
                  className={`w-full bg-surface border rounded-lg p-3 text-on-surface focus:outline-none focus:border-primary transition-all ${
                    !reservationData.telefono.trim()
                      ? "border-red-500/40 bg-red-500/5"
                      : "border-outline"
                  }`}
                />
              </div>

              {/* Fecha */}
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                  Fecha de la Reserva
                </label>
                <input
                  type="date"
                  value={reservationData.fecha}
                  onChange={(e) =>
                    setReservationData({
                      ...reservationData,
                      fecha: e.target.value,
                    })
                  }
                  className={`w-full bg-surface border rounded-lg p-3 text-on-surface focus:outline-none focus:border-primary transition-all ${
                    !reservationData.fecha.trim()
                      ? "border-red-500/40 bg-red-500/5"
                      : "border-outline"
                  }`}
                />
              </div>

              {/* Hora */}
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                  Hora de la Reserva
                </label>
                <input
                  type="time"
                  value={reservationData.hora}
                  onChange={(e) =>
                    setReservationData({
                      ...reservationData,
                      hora: e.target.value,
                    })
                  }
                  className={`w-full bg-surface border rounded-lg p-3 text-on-surface focus:outline-none focus:border-primary transition-all ${
                    !reservationData.hora.trim()
                      ? "border-red-500/40 bg-red-500/5"
                      : "border-outline"
                  }`}
                />
              </div>

              {/* Cantidad de Personas */}
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                  Cantidad de Personas
                </label>
                <input
                  type="number"
                  min="1"
                  value={reservationData.personas}
                  onChange={(e) =>
                    setReservationData({
                      ...reservationData,
                      personas: e.target.value,
                    })
                  }
                  placeholder="1"
                  className={`w-full bg-surface border rounded-lg p-3 text-on-surface focus:outline-none focus:border-primary transition-all ${
                    !reservationData.personas ||
                    Number(reservationData.personas) < 1
                      ? "border-red-500/40 bg-red-500/5"
                      : "border-outline"
                  }`}
                />
              </div>

              {/* Notas */}
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                  Notas
                </label>
                <textarea
                  rows="3"
                  value={reservationData.notas}
                  onChange={(e) =>
                    setReservationData({
                      ...reservationData,
                      notas: e.target.value,
                    })
                  }
                  placeholder="Ej: silla de bebé, cumpleañera, ventana, etc."
                  className="w-full bg-surface border border-outline rounded-lg p-3 text-on-surface focus:outline-none focus:border-primary transition-all resize-none"
                />
              </div>
            </div>

            {/* Botones */}
            <div className="flex gap-3 mt-6 flex-shrink-0">
              <button
                onClick={() => setShowReservationModal(false)}
                className="flex-1 py-2.5 px-4 rounded-lg border border-outline text-on-surface-variant hover:text-on-surface hover:bg-surface-variant transition-all font-bold text-sm uppercase tracking-widest"
              >
                Cancelar
              </button>
              <button
                onClick={crearReserva}
                disabled={!canSubmitReservation}
                className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-sm uppercase tracking-widest transition-all ${
                  canSubmitReservation
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "bg-slate-500/30 text-slate-300 cursor-not-allowed opacity-70"
                }`}
              >
                Crear Reserva
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de División de Pagos */}
      <SplitPaymentModal
        isOpen={showSplitModal}
        onClose={() => setShowSplitModal(false)}
        total={total}
        numSplits={numSplits}
        setNumSplits={setNumSplits}
        splitPayments={splitPayments}
        updateSplitPayment={updateSplitPayment}
        initializeSplits={initializeSplits}
        removePaymentRow={removePaymentRow}
      />
    </>
  );
};

export default POS;
