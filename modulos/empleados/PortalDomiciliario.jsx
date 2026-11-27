import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bike,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  Clock3,
  Eye,
  EyeOff,
  Globe2,
  History,
  Info,
  LoaderCircle,
  LocateFixed,
  MessageCircle,
  MapPin,
  MapPinned,
  Menu,
  PackageCheck,
  Phone,
  Power,
  RefreshCw,
  Route,
  Search,
  ShieldAlert,
  Store,
  Trash2,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../src/components/AuthContext";
import { supabase } from "../../src/lib/supabaseClient";
import PortalDomiciliarioMap from "./PortalDomiciliarioMap";
import PortalDomiciliarioSidebar from "./PortalDomiciliarioSidebar";
import {
  enableCourierPushNotifications,
  getCourierPushSubscription,
  supportsCourierPushNotifications,
  syncCourierPushSubscription,
} from "../../src/lib/courierPushNotifications";

const formatMoney = (amount) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);

const normalizeColombianWhatsappNumber = (value) => {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");
  if (!digits) return "";
  return digits.startsWith("57") ? digits : `57${digits}`;
};

const locationErrorMessage = (error) =>
  error?.code === "PGRST202" &&
  error?.message?.includes("set_domiciliario_live_location")
    ? "Aplica la migración 132 de Supabase para activar el seguimiento privado de ubicación."
    : error?.message || "No se pudo actualizar tu ubicación.";

const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Fecha no disponible";

const courierWorkSessionKey = (userId) =>
  `gloto:courier-work-session:${userId}`;

const courierDailyStatsKey = (userId) =>
  `gloto:courier-daily-stats:${userId}`;

const courierProfilePhotoCacheName = "gloto-courier-profile-photos-v1";

const loadCourierProfilePhotoUrl = async (photoPath) => {
  let photoCache = null;
  let cacheKey = null;

  if (typeof window !== "undefined" && "caches" in window) {
    try {
      photoCache = await window.caches.open(courierProfilePhotoCacheName);
      cacheKey = new Request(
        `${window.location.origin}/__gloto-cache/courier-profile-photo?path=${encodeURIComponent(photoPath)}`,
      );
      const cachedResponse = await photoCache.match(cacheKey);
      if (cachedResponse) {
        return URL.createObjectURL(await cachedResponse.blob());
      }
    } catch (error) {
      console.error("No se pudo leer la caché de la foto del domiciliario:", error);
      photoCache = null;
      cacheKey = null;
    }
  }

  const { data, error } = await supabase.storage
    .from("courier-application-documents")
    .createSignedUrl(photoPath, 60 * 60);
  if (error) throw error;
  if (!data?.signedUrl) {
    throw new Error("No se recibió la URL de la foto del perfil.");
  }
  if (!photoCache || !cacheKey) return data.signedUrl;

  try {
    const response = await fetch(data.signedUrl);
    if (!response.ok) {
      throw new Error(`No se pudo descargar la foto (HTTP ${response.status}).`);
    }
    const photoBlob = await response.blob();
    try {
      await photoCache.put(
        cacheKey,
        new Response(photoBlob, {
          headers: { "Content-Type": photoBlob.type },
        }),
      );
    } catch (error) {
      console.error("No se pudo guardar la foto del domiciliario en caché:", error);
    }
    return URL.createObjectURL(photoBlob);
  } catch (error) {
    console.error(
      "No se pudo cargar la foto para guardarla en caché; se usará la URL firmada:",
      error,
    );
    return data.signedUrl;
  }
};

const playCourierOrderArrivalSound = (audioContext) => {
  const notes = [880, 1174, 1568, 1174, 880, 1174, 1568];
  const now = audioContext.currentTime;

  notes.forEach((frequency, index) => {
    const startAt = now + index * 0.36;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.52);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.54);
  });
};

const getLocalDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const createEmptyDailyStats = (dateKey = getLocalDateKey()) => ({
  dateKey,
  completedOrders: [],
});

const readCourierDailyStats = (userId) => {
  const empty = createEmptyDailyStats();
  if (!userId) return empty;
  try {
    const stored = localStorage.getItem(courierDailyStatsKey(userId));
    if (!stored) return empty;
    const stats = JSON.parse(stored);
    if (stats?.dateKey !== empty.dateKey) return empty;
    return {
      ...empty,
      completedOrders: Array.isArray(stats.completedOrders)
        ? stats.completedOrders.filter(
            (order) => order?.id && ["private", "public"].includes(order.source),
          )
        : [],
    };
  } catch (error) {
    console.error("No se pudieron leer las métricas diarias del domiciliario:", error);
    return empty;
  }
};

const getLocalDayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
};

const readCourierWorkSession = (userId) => {
  if (!userId) return null;
  try {
    const stored = sessionStorage.getItem(courierWorkSessionKey(userId));
    if (!stored) return null;
    const session = JSON.parse(stored);
    if (
      typeof session?.startedAt !== "string" ||
      !Number.isFinite(new Date(session.startedAt).getTime())
    ) {
      return null;
    }
    return {
      startedAt: session.startedAt,
      endedAt:
        typeof session.endedAt === "string" &&
        Number.isFinite(new Date(session.endedAt).getTime())
          ? session.endedAt
          : null,
      completedOrderIds: Array.isArray(session.completedOrderIds)
        ? session.completedOrderIds
        : [],
      grossEarnings: Number.isFinite(Number(session.grossEarnings))
        ? Number(session.grossEarnings)
        : 0,
    };
  } catch (error) {
    console.error("No se pudo leer la jornada activa del domiciliario:", error);
    return null;
  }
};

const getGeneralDeliveryArea = (address) => {
  const addressParts = String(address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return addressParts.length > 1
    ? addressParts.slice(1).join(", ")
    : "Zona no disponible";
};

const getCourierOrderKey = (order) =>
  `${order.courier_mode || "private"}:${order.order_id}`;

const sortCourierOrdersByAge = (orders) =>
  [...orders].sort((a, b) => {
    const aCreatedAt = Date.parse(a.created_at || "");
    const bCreatedAt = Date.parse(b.created_at || "");
    const aTime = Number.isFinite(aCreatedAt) ? aCreatedAt : 0;
    const bTime = Number.isFinite(bCreatedAt) ? bCreatedAt : 0;
    return aTime - bTime;
  });

const getDistanceBetweenCoordinatesKm = (fromLatitude, fromLongitude, toLatitude, toLongitude) => {
  const coordinates = [
    fromLatitude,
    fromLongitude,
    toLatitude,
    toLongitude,
  ];
  if (
    coordinates.some(
      (coordinate) =>
        coordinate == null ||
        coordinate === "" ||
        !Number.isFinite(Number(coordinate)),
    )
  ) {
    return null;
  }

  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(Number(toLatitude) - Number(fromLatitude));
  const longitudeDelta = radians(Number(toLongitude) - Number(fromLongitude));
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(Number(fromLatitude))) *
      Math.cos(radians(Number(toLatitude))) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getPickupToCustomerDistanceKm = (order) => {
  const pickupDistance = getDistanceBetweenCoordinatesKm(
    order.pickup_latitude,
    order.pickup_longitude,
    order.destination_latitude,
    order.destination_longitude,
  );
  if (pickupDistance != null && pickupDistance > 0) return pickupDistance;

  const serverDistance = Number(order.distance_km);
  return order.distance_km != null &&
    order.distance_km !== "" &&
    Number.isFinite(serverDistance) &&
    serverDistance > 0
    ? serverDistance
    : null;
};

const getOrderDistanceKm = (order, location) => {
  const serverDistance = Number(order.distance_km);
  const hasServerDistance =
    order.distance_km != null &&
    order.distance_km !== "" &&
    Number.isFinite(serverDistance);
  if (order.courier_mode === "public") {
    return getPickupToCustomerDistanceKm(order);
  }

  const hasCurrentLocation =
    location?.latitude != null &&
    location?.longitude != null &&
    Number.isFinite(Number(location.latitude)) &&
    Number.isFinite(Number(location.longitude));
  const hasDestination =
    order.destination_latitude != null &&
    order.destination_longitude != null &&
    Number.isFinite(Number(order.destination_latitude)) &&
    Number.isFinite(Number(order.destination_longitude));
  if (order.courier_mode === "public" || !hasCurrentLocation || !hasDestination) {
    return hasServerDistance ? serverDistance : null;
  }
  const latitude = Number(order.destination_latitude);
  const longitude = Number(order.destination_longitude);
  const currentLatitude = Number(location?.latitude);
  const currentLongitude = Number(location?.longitude);
  return getDistanceBetweenCoordinatesKm(
    currentLatitude,
    currentLongitude,
    latitude,
    longitude,
  );
};

const getDistanceBetweenPointsKm = (start, end) => {
  const coordinates = [
    start?.latitude,
    start?.longitude,
    end?.latitude,
    end?.longitude,
  ];
  if (
    coordinates.some(
      (coordinate) => coordinate == null || !Number.isFinite(Number(coordinate)),
    )
  ) {
    return null;
  }
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitude = radians(Number(end.latitude) - Number(start.latitude));
  const longitude = radians(Number(end.longitude) - Number(start.longitude));
  const startLatitude = radians(Number(start.latitude));
  const endLatitude = radians(Number(end.latitude));
  const a =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const statusLabel = {
  available: "Disponible",
  assigned: "Asignado",
  picked_up: "En camino",
  delivered: "Entregado",
};

const applicationStatus = {
  pending: "En revisión",
  approved: "Aprobada",
  rejected: "No aprobada",
  suspended: "Suspendida",
};

const COURIER_OFFER_PREVIEW_MS = 10000;
const PUBLIC_COURIER_OFFER_PREVIEW_MS = 15000;
const COURIER_ORDER_REFRESH_INTERVAL_MS = 3000;

const getLocation = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este dispositivo no permite compartir la ubicación."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
        }),
      (error) => {
        const messages = {
          1: "Permite el acceso a tu ubicación para continuar.",
          2: "No fue posible obtener tu ubicación. Intenta de nuevo.",
          3: "La solicitud de ubicación tardó demasiado. Intenta de nuevo.",
        };
        reject(new Error(messages[error.code] || "No se pudo obtener tu ubicación."));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });

const PortalDomiciliario = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [section, setSection] = useState("orders");
  const [mode, setMode] = useState("private");
  const [storeOrdersExpanded, setStoreOrdersExpanded] = useState(true);
  const [summary, setSummary] = useState(null);
  const [workSession, setWorkSession] = useState(() =>
    readCourierWorkSession(user?.id),
  );
  const workSessionRef = useRef(workSession);
  const [dailyWalletDeductions, setDailyWalletDeductions] = useState(0);
  const [dailyStats, setDailyStats] = useState(() =>
    readCourierDailyStats(user?.id),
  );
  const dailyStatsRef = useRef(dailyStats);
  const [activityError, setActivityError] = useState("");
  const [activityLoading, setActivityLoading] = useState(false);
  const [privateBusinessLogo, setPrivateBusinessLogo] = useState({
    businessId: null,
    logoUrl: "",
  });
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  const [orders, setOrders] = useState([]);
  const [hotZones, setHotZones] = useState([]);
  const [hotZoneError, setHotZoneError] = useState("");
  const [previewOrderIds, setPreviewOrderIds] = useState([]);
  const seenOfferIdsRef = useRef(new Set());
  const offerBaselineReadyRef = useRef(false);
  const [history, setHistory] = useState([]);
  const [historySearch, setHistorySearch] = useState("");
  const [historySourceFilter, setHistorySourceFilter] = useState("all");
  const [historyDatePreset, setHistoryDatePreset] = useState("all");
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");
  const [ledger, setLedger] = useState([]);
  const [topups, setTopups] = useState([]);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const refreshPromiseRef = useRef(null);
  const refreshAgainRef = useRef(false);
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [verificationPrompt, setVerificationPrompt] = useState(null);
  const [verificationCode, setVerificationCode] = useState(["", "", "", ""]);
  const verificationCodeInputRefs = useRef([]);
  const verificationSubmissionRef = useRef(false);
  const [swipeResetRequest, setSwipeResetRequest] = useState(0);
  const [savingPhone, setSavingPhone] = useState(false);
  const [savingCedula, setSavingCedula] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountConfirmation, setDeleteAccountConfirmation] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [unlinkStoreOpen, setUnlinkStoreOpen] = useState(false);
  const [unlinkingStore, setUnlinkingStore] = useState(false);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [sourcePreferences, setSourcePreferences] = useState(null);
  const sourcePreferencesLoadedRef = useRef(false);
  const [mapLocation, setMapLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("paused");
  const [realtimeStatus, setRealtimeStatus] = useState("connecting");
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [fullName, setFullName] = useState(
    user?.user_metadata?.full_name || "",
  );
  const [phone, setPhone] = useState(user?.user_metadata?.phone || "");
  const [courierCedula, setCourierCedula] = useState("");
  const [savedCourierCedula, setSavedCourierCedula] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [profilePhotoError, setProfilePhotoError] = useState("");
  const [topupAmount, setTopupAmount] = useState("");
  const [topupProof, setTopupProof] = useState(null);
  const [courierTopupLinks, setCourierTopupLinks] = useState({});
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityValuesVisible, setActivityValuesVisible] = useState(false);
  const [orderSoundError, setOrderSoundError] = useState("");
  const orderAudioContextRef = useRef(null);
  const [courierPushSupported] = useState(supportsCourierPushNotifications);
  const [courierPushActive, setCourierPushActive] = useState(false);
  const [courierPushBusy, setCourierPushBusy] = useState(false);
  const [courierPushError, setCourierPushError] = useState("");
  const [courierPushMessage, setCourierPushMessage] = useState("");
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installMessage, setInstallMessage] = useState("");
  const [appInstalled, setAppInstalled] = useState(false);

  const isPublicApproved = summary?.application_status === "approved";
  const isPublicOnline = Boolean(summary?.is_online);
  const isPrivateOnline = Boolean(summary?.private_is_online);
  const isCourierOnline = isPublicOnline || isPrivateOnline;
  const activeDelivery = orders.find((order) =>
    ["assigned", "picked_up"].includes(order.delivery_status),
  ) || null;
  useEffect(() => {
    let active = true;
    const loadCourierPushSubscription = async () => {
      try {
        const subscription = await getCourierPushSubscription();
        if (!active) return;
        if (subscription) {
          await syncCourierPushSubscription(subscription);
          if (active) setCourierPushActive(true);
        } else {
          setCourierPushActive(false);
        }
      } catch (error) {
        if (!active) return;
        console.error(
          "No se pudo comprobar la suscripción push del domiciliario:",
          error,
        );
        setCourierPushError(
          "No se pudo comprobar si este dispositivo recibirá avisos.",
        );
      }
    };

    loadCourierPushSubscription();
    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    const handleInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleAppInstalled = () => {
      setAppInstalled(true);
      setInstallPrompt(null);
      setInstallMessage("Gloto Domiciliarios quedó instalada.");
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const installCourierApp = async () => {
    setInstallMessage("");
    if (!installPrompt) {
      const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      setInstallMessage(
        isAppleMobile
          ? "En Safari, toca Compartir y luego Añadir a pantalla de inicio."
          : "Abre el menú del navegador y elige Instalar app o Añadir a pantalla de inicio.",
      );
      return;
    }

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      setInstallMessage(
        choice.outcome === "accepted"
          ? "Gloto Domiciliarios se está instalando."
          : "La instalación se canceló. Puedes intentarlo más tarde.",
      );
    } catch (error) {
      console.error("No se pudo abrir la instalación de la app de domiciliarios:", error);
      setInstallMessage("No se pudo iniciar la instalación. Inténtalo desde el menú del navegador.");
    }
  };

  const activateCourierPush = async () => {
    if (courierPushBusy || !courierPushSupported) return;
    setCourierPushBusy(true);
    setCourierPushError("");
    setCourierPushMessage("");
    try {
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission !== "granted") {
        setCourierPushError(
          "Permite las notificaciones de Gloto en la configuración del navegador o del dispositivo.",
        );
        return;
      }

      const registration = await enableCourierPushNotifications();
      setCourierPushActive(true);
      setCourierPushMessage(
        "Este dispositivo recibirá avisos cuando te asignen una nueva oferta y estés conectado.",
      );
      try {
        await registration.showNotification("Avisos de domicilios activados", {
          body: "Recibirás un aviso cuando te asignen una nueva oferta de entrega.",
          tag: "gloto-courier-push-enabled",
          icon: "/gloto-domiciliarios.svg",
          badge: "/gloto-domiciliarios.svg",
        });
      } catch (error) {
        console.error(
          "Push quedó activo, pero no se pudo mostrar el aviso de confirmación:",
          error,
        );
        setCourierPushError(
          "Los avisos quedaron activados, pero el sistema no permitió mostrar el mensaje de confirmación.",
        );
      }
    } catch (error) {
      console.error("No se pudieron activar los avisos push del domiciliario:", error);
      setCourierPushError(
        error instanceof Error
          ? error.message
          : "No se pudieron activar los avisos para domiciliarios.",
      );
    } finally {
      setCourierPushBusy(false);
    }
  };

  const hasActivePublicDelivery = orders.some(
    (order) =>
      order.courier_mode === "public" &&
      ["assigned", "picked_up"].includes(order.delivery_status),
  );
  const currentCourierOffer = useMemo(() => {
    const ordersByKey = new Map(
      orders.map((order) => [getCourierOrderKey(order), order]),
    );
    return (
      previewOrderIds
        .map((offerId) => ordersByKey.get(offerId))
        .find(
          (order) =>
            order?.delivery_status === "available",
        ) || null
    );
  }, [orders, previewOrderIds]);
  const currentPublicOffer =
    currentCourierOffer?.courier_mode === "public"
      ? currentCourierOffer
      : null;
  const ordersForDisplay = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.delivery_status !== "available" ||
          order.courier_mode === "private" ||
          (currentCourierOffer &&
            getCourierOrderKey(order) ===
              getCourierOrderKey(currentCourierOffer)),
      ),
    [currentCourierOffer, orders],
  );
  const publicOrdersForDisplay = useMemo(
    () =>
      ordersForDisplay.filter((order) => order.courier_mode === "public"),
    [ordersForDisplay],
  );
  const otherStoreOrdersForDisplay = useMemo(
    () =>
      ordersForDisplay.filter(
        (order) =>
          order.courier_mode === "private" &&
          order.order_id !== activeDelivery?.order_id,
      ),
    [activeDelivery?.order_id, ordersForDisplay],
  );
  const canUsePrivate = Boolean(summary?.private_business_id);
  const privateStoreAvailable = Boolean(
    canUsePrivate && summary?.private_store_available,
  );
  const privateSourceEnabled =
    privateStoreAvailable && (sourcePreferences?.private ?? true);
  const publicSourceEnabled =
    sourcePreferences?.public ?? isPublicApproved;
  const hasEnabledSources =
    (privateStoreAvailable && privateSourceEnabled) ||
    (isPublicApproved && publicSourceEnabled);
  const balance = Number(summary?.wallet_balance || 0);
  const displayName =
    fullName.trim() ||
    user?.user_metadata?.full_name?.trim() ||
    summary?.full_name?.trim() ||
    "Domiciliario";

  const getOrderAudioContext = useCallback(() => {
    if (typeof window.AudioContext !== "function") {
      setOrderSoundError("Este navegador no admite el sonido de pedidos.");
      return null;
    }

    if (!orderAudioContextRef.current) {
      try {
        orderAudioContextRef.current = new window.AudioContext();
      } catch (error) {
        console.error("No se pudo preparar el sonido de pedidos:", error);
        setOrderSoundError("No se pudo preparar el sonido de pedidos.");
        return null;
      }
    }

    return orderAudioContextRef.current;
  }, []);

  const resumeOrderAudio = useCallback((audioContext, playOnResume = false) => {
    try {
      void audioContext
        .resume()
        .then(() => {
          if (audioContext.state !== "running") return;
          setOrderSoundError("");
          if (playOnResume) playCourierOrderArrivalSound(audioContext);
        })
        .catch((error) => {
          console.error("No se pudo activar el sonido de pedidos:", error);
          setOrderSoundError(
            "No se pudo activar el sonido. Revisa los permisos del navegador.",
          );
        });
    } catch (error) {
      console.error("No se pudo activar el sonido de pedidos:", error);
      setOrderSoundError(
        "No se pudo activar el sonido. Revisa los permisos del navegador.",
      );
    }
  }, []);

  const unlockOrderAudio = useCallback(() => {
    const audioContext = getOrderAudioContext();
    if (audioContext?.state === "suspended") {
      resumeOrderAudio(audioContext);
    }
  }, [getOrderAudioContext, resumeOrderAudio]);

  const ringForNewOrder = useCallback(() => {
    const audioContext = getOrderAudioContext();
    if (!audioContext) return;
    if (audioContext.state === "suspended") {
      resumeOrderAudio(audioContext, true);
      return;
    }
    if (audioContext.state !== "running") {
      setOrderSoundError("El sonido de pedidos no está disponible.");
      return;
    }
    playCourierOrderArrivalSound(audioContext);
  }, [getOrderAudioContext, resumeOrderAudio]);

  useEffect(() => {
    const unlock = () => {
      unlockOrderAudio();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [unlockOrderAudio]);

  const saveWorkSession = useCallback(
    (nextSession) => {
      workSessionRef.current = nextSession;
      setWorkSession(nextSession);
      if (!user?.id) return;
      try {
        const key = courierWorkSessionKey(user.id);
        if (nextSession) {
          sessionStorage.setItem(key, JSON.stringify(nextSession));
        } else {
          sessionStorage.removeItem(key);
        }
      } catch (error) {
        console.error("No se pudo guardar la jornada del domiciliario:", error);
      }
    },
    [user],
  );

  const syncWorkSession = useCallback(
    (online) => {
      if (!user?.id) return;
      if (online) {
        const saved =
          workSessionRef.current || readCourierWorkSession(user.id);
        if (saved && !saved.endedAt) {
          workSessionRef.current = saved;
          setWorkSession(saved);
        } else {
          saveWorkSession({
            startedAt: new Date().toISOString(),
            completedOrderIds: [],
          });
        }
      } else if (workSessionRef.current && !workSessionRef.current.endedAt) {
        saveWorkSession({
          ...workSessionRef.current,
          endedAt: new Date().toISOString(),
        });
      }
    },
    [saveWorkSession, user],
  );

  useEffect(() => {
    if (summaryLoaded) syncWorkSession(isCourierOnline);
  }, [isCourierOnline, summaryLoaded, syncWorkSession]);

  useEffect(() => {
    const businessId = summary?.private_business_id;
    if (!businessId) return undefined;

    let active = true;
    const loadBusinessLogo = async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("logo_url")
        .eq("id", businessId)
        .maybeSingle();
      if (!active) return;
      if (error) {
        console.error("No se pudo cargar el logo de la tienda vinculada:", error);
        setPrivateBusinessLogo({ businessId, logoUrl: "" });
        return;
      }
      setPrivateBusinessLogo({ businessId, logoUrl: data?.logo_url || "" });
    };

    loadBusinessLogo();
    return () => {
      active = false;
    };
  }, [summary?.private_business_id]);

  const recordWorkOrder = useCallback(
    (order) => {
      const current = workSessionRef.current;
      if (!current || current.endedAt || !order?.order_id) return;
      if (current.completedOrderIds.includes(order.order_id)) return;
      saveWorkSession({
        ...current,
        completedOrderIds: [...current.completedOrderIds, order.order_id],
        grossEarnings: current.grossEarnings + (Number(order.delivery_fee) || 0),
      });
    },
    [saveWorkSession],
  );

  const updateDailyStats = useCallback(
    (update) => {
      if (!user?.id) return;
      const today = getLocalDateKey();
      const current =
        dailyStatsRef.current?.dateKey === today
          ? dailyStatsRef.current
          : createEmptyDailyStats(today);
      const next = update(current);
      dailyStatsRef.current = next;
      setDailyStats(next);
      try {
        localStorage.setItem(
          courierDailyStatsKey(user.id),
          JSON.stringify(next),
        );
      } catch (error) {
        console.error("No se pudieron guardar las métricas diarias:", error);
        setErrorMessage("No se pudieron guardar las métricas de hoy.");
      }
    },
    [user?.id],
  );

  const updateOrders = useCallback((nextOrders) => {
    setOrders(nextOrders);

    const availableOrders = nextOrders.filter(
      (order) => order.delivery_status === "available",
    );
    const publicOffers = sortCourierOrdersByAge(
      availableOrders.filter((order) => order.courier_mode === "public"),
    ).slice(0, 1);
    const availableIds = new Set(availableOrders.map(getCourierOrderKey));

    if (!isCourierOnline) {
      availableIds.forEach((id) => seenOfferIdsRef.current.add(id));
      setPreviewOrderIds([]);
      offerBaselineReadyRef.current = false;
      return;
    }

    if (!offerBaselineReadyRef.current) {
      availableIds.forEach((id) => seenOfferIdsRef.current.add(id));
      setPreviewOrderIds(publicOffers.map(getCourierOrderKey));
      offerBaselineReadyRef.current = true;
      return;
    }

    const newOfferIds = availableOrders
      .map(getCourierOrderKey)
      .filter((id) => !seenOfferIdsRef.current.has(id));
    newOfferIds.forEach((id) => seenOfferIdsRef.current.add(id));
    if (newOfferIds.length > 0) ringForNewOrder();

    setPreviewOrderIds(publicOffers.map(getCourierOrderKey));
  }, [isCourierOnline, ringForNewOrder]);

  const syncLiveLocation = useCallback(
    async (location, { publicEnabled = isPublicOnline, privateEnabled = isPrivateOnline } = {}) => {
      setMapLocation(location);
      const updates = [];
      if (publicEnabled) {
        updates.push(
          supabase.rpc("update_public_courier_location", {
            p_latitude: location.latitude,
            p_longitude: location.longitude,
          }),
        );
      }
      if (privateEnabled) {
        const { error: availabilityError } = await supabase.rpc(
          "set_domiciliario_availability",
          { p_is_online: true },
        );
        if (availabilityError) throw availabilityError;
        updates.push(
          supabase.rpc("set_domiciliario_live_location", {
            p_latitude: location.latitude,
            p_longitude: location.longitude,
          }),
        );
      }
      const results = await Promise.all(updates);
      const failed = results.find(({ error }) => error);
      if (failed?.error) throw failed.error;
      setSummary((current) => ({
        ...current,
        ...(publicEnabled
          ? {
              location_latitude: location.latitude,
              location_longitude: location.longitude,
            }
          : {}),
      }));
      setLocationStatus("live");
    },
    [isPrivateOnline, isPublicOnline],
  );

  const loadPrivateStoreAssignment = useCallback(async () => {
    const { data, error } = await supabase
      .from("employees")
      .select("business_id,store_orders_enabled,delivery_available")
      .eq("auth_user_id", user?.id || "")
      .ilike("area", "%domiciliario%")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }, [user?.id]);

  const loadSummary = useCallback(async () => {
    const [
      { data, error },
      { data: profileName, error: profileNameError },
      { data: topupLinksData },
      privateStoreAssignment,
      { data: savedCedula, error: cedulaError },
    ] = await Promise.all([
      supabase.rpc("get_public_courier_portal_summary"),
      supabase.rpc("get_my_courier_profile_name"),
      supabase.from("courier_topup_payment_links").select("amount,payment_url"),
      loadPrivateStoreAssignment(),
      supabase.rpc("get_my_courier_cedula"),
    ]);
    if (error) throw error;
    if (profileNameError) throw profileNameError;
    if (cedulaError) throw cedulaError;
    const summaryData = data
      ? {
          ...data,
          private_business_id: privateStoreAssignment?.business_id || null,
          private_business_name: privateStoreAssignment?.business_id
            ? data.private_business_name
            : null,
          private_store_available: Boolean(
            privateStoreAssignment &&
              privateStoreAssignment.store_orders_enabled !== false,
          ),
          private_is_online: Boolean(
            privateStoreAssignment &&
              privateStoreAssignment.store_orders_enabled !== false &&
              privateStoreAssignment.delivery_available,
          ),
        }
      : null;
    setSummary(summaryData);
    setCourierTopupLinks(
      Object.fromEntries(
        (topupLinksData || []).map((link) => [link.amount, link.payment_url]),
      ),
    );
    if (data?.location_latitude != null && data?.location_longitude != null) {
      setMapLocation({
        latitude: Number(data.location_latitude),
        longitude: Number(data.location_longitude),
      });
    }
    if (!sourcePreferencesLoadedRef.current) {
      const preferenceKey = `gloto:courier-sources:${user?.id}`;
      let preferences;
      try {
        const savedPreferences = localStorage.getItem(preferenceKey);
        if (savedPreferences) {
          const parsed = JSON.parse(savedPreferences);
          if (
            parsed &&
            typeof parsed.private === "boolean" &&
            typeof parsed.public === "boolean"
          ) {
            preferences = parsed;
          }
        }
      } catch (error) {
        console.error("No se pudieron leer las fuentes de pedidos guardadas:", error);
        setErrorMessage("No se pudieron leer tus preferencias de pedidos guardadas.");
      }
      setSourcePreferences(
        preferences || {
          private: Boolean(summaryData?.private_business_id),
          public: summaryData?.application_status === "approved",
        },
      );
      sourcePreferencesLoadedRef.current = true;
    }
    setMode(summaryData?.private_business_id ? "private" : "public");
    const savedName =
      typeof profileName === "string" ? profileName.trim() : "";
    if (savedName) {
      setFullName(savedName);
    } else if (data?.full_name) {
      setFullName(data.full_name);
    } else if (user?.user_metadata?.full_name) {
      setFullName(user.user_metadata.full_name);
    }
    if (data?.phone) setPhone(data.phone);
    const cedulaValue = typeof savedCedula === "string" ? savedCedula : "";
    setCourierCedula((current) => cedulaValue || current);
    setSavedCourierCedula(cedulaValue);
  }, [loadPrivateStoreAssignment, user?.id]);

  const refreshPrivateStoreAssignment = useCallback(async () => {
    const assignment = await loadPrivateStoreAssignment();
    setSummary((current) => {
      if (!current) return current;
      const hasAssignment = Boolean(assignment?.business_id);
      return {
        ...current,
        private_business_id: assignment?.business_id || null,
        private_business_name: hasAssignment
          ? current.private_business_name
          : null,
        private_store_available: Boolean(
          assignment && assignment.store_orders_enabled !== false,
        ),
        private_is_online: Boolean(
          assignment &&
            assignment.store_orders_enabled !== false &&
            assignment.delivery_available,
        ),
      };
    });
  }, [loadPrivateStoreAssignment]);

  const requestOrders = useCallback(async () => {
    const requests = [];
    if (canUsePrivate) {
      requests.push(
        supabase.rpc("get_domiciliario_orders").then((result) => ({
          ...result,
          source: "private",
        })),
      );
    }
    if (isPublicApproved) {
      requests.push(
        supabase.rpc("get_public_courier_map_orders").then((result) => ({
          ...result,
          source: "public",
        })),
      );
    }
    const [results, offerResult] = await Promise.all([
      Promise.all(requests),
      isCourierOnline
        ? supabase.rpc("get_my_courier_order_offer")
        : Promise.resolve({ data: null, error: null }),
    ]);
    const failed = results.find(({ error }) => error);
    if (failed?.error) throw failed.error;
    if (offerResult.error) throw offerResult.error;
    const assignedOffer = offerResult.data;
    const privateOrders = [
      ...(results.find(({ source }) => source === "private")?.data || []),
    ];
    const publicOrders = (
      results.find(({ source }) => source === "public")?.data || []
    ).filter((order) => order.delivery_status !== "available");
    if (assignedOffer?.courier_mode === "private") {
      if (!privateOrders.some((order) => order.order_id === assignedOffer.order_id)) {
        privateOrders.push(assignedOffer);
      }
    } else if (assignedOffer?.courier_mode === "public") {
      publicOrders.push(assignedOffer);
    }
    const privateBusinessIds = [
      ...new Set(
        privateOrders.map((order) => order.business_id).filter(Boolean),
      ),
    ];
    const privateBusinessDetails = new Map();
    if (privateBusinessIds.length > 0) {
      const { data, error } = await supabase
        .from("business_info")
        .select("business_id, whatsapp_phone, latitude, longitude")
        .in("business_id", privateBusinessIds);
      if (error) throw error;
      for (const businessInfo of data || []) {
        privateBusinessDetails.set(businessInfo.business_id, businessInfo);
      }
    }
    const publicOrderDetails = new Map();
    if (publicOrders.length > 0) {
      const { data, error } = await supabase.rpc(
        "get_public_courier_offer_addresses",
        { p_order_ids: publicOrders.map((order) => order.order_id) },
      );
      if (error) throw error;
      for (const details of data || []) {
        publicOrderDetails.set(details.order_id, details);
      }
    }
    return {
      data: [
        { source: "private", data: privateOrders },
        { source: "public", data: publicOrders },
      ].flatMap(({ data, source }) =>
        data.map((order) => {
          const businessInfo = privateBusinessDetails.get(order.business_id);
          return {
            ...order,
            ...(source === "private"
              ? {
                  pickup_phone:
                    businessInfo?.whatsapp_phone || order.pickup_phone || "",
                  pickup_latitude:
                    order.pickup_latitude ?? businessInfo?.latitude,
                  pickup_longitude:
                    order.pickup_longitude ?? businessInfo?.longitude,
                }
              : {}),
            ...(source === "public"
              ? publicOrderDetails.get(order.order_id) || {}
              : {}),
            courier_mode: source,
          };
        }),
      ),
      error: null,
    };
  }, [canUsePrivate, isCourierOnline, isPublicApproved]);

  const loadHistory = useCallback(async () => {
    const sources = ["private", "public"];
    const results = await Promise.all(
      sources.map((source) =>
        supabase.rpc("get_courier_order_history", { p_mode: source }),
      ),
    );
    const failedResult = results.find(({ error }) => error);
    if (failedResult?.error) throw failedResult.error;

    const allOrders = results.flatMap(({ data }, index) =>
      (data || []).map((order) => ({
        ...order,
        courier_mode: order.courier_mode || sources[index],
      })),
    );
    const uniqueOrders = new Map(
      allOrders.map((order) => [
        `${order.courier_mode}:${order.order_id}`,
        order,
      ]),
    );
    setHistory(
      [...uniqueOrders.values()].sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
      ),
    );
  }, []);

  const loadCourierHotZones = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_courier_hot_zones");
    if (error) throw error;
    return data || [];
  }, []);

  const loadWallet = useCallback(async () => {
    const { start, end } = getLocalDayRange();
    const [ledgerResult, topupsResult, dailyLedgerResult] = await Promise.all([
      supabase
        .from("public_courier_ledger")
        .select("id, amount, entry_type, description, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("public_courier_topups")
        .select("id, amount, status, review_notes, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("public_courier_ledger")
        .select("amount")
        .gte("created_at", start)
        .lt("created_at", end),
    ]);
    if (ledgerResult.error) throw ledgerResult.error;
    if (topupsResult.error) throw topupsResult.error;
    if (dailyLedgerResult.error) throw dailyLedgerResult.error;
    setLedger(ledgerResult.data || []);
    setTopups(topupsResult.data || []);
    setDailyWalletDeductions(
      (dailyLedgerResult.data || []).reduce((total, entry) => {
        const amount = Number(entry.amount) || 0;
        return amount < 0 ? total + Math.abs(amount) : total;
      }, 0),
    );
  }, []);

  const refreshDailyWalletDeductions = useCallback(async () => {
    const { start, end } = getLocalDayRange();
    const { data, error } = await supabase
      .from("public_courier_ledger")
      .select("amount")
      .gte("created_at", start)
      .lt("created_at", end);
    if (error) throw error;
    setDailyWalletDeductions(
      (data || []).reduce((total, entry) => {
        const amount = Number(entry.amount) || 0;
        return amount < 0 ? total + Math.abs(amount) : total;
      }, 0),
    );
  }, []);

  const openActivity = async () => {
    setActivityOpen(true);
    setActivityLoading(true);
    setActivityError("");
    try {
      await Promise.all([
        refreshDailyWalletDeductions(),
        loadSummary(),
      ]);
    } catch (error) {
      console.error("No se pudo actualizar el resumen de la jornada:", error);
      setActivityError(
        error.message || "No se pudo actualizar la información de la jornada.",
      );
    } finally {
      setActivityLoading(false);
    }
  };

  useEffect(() => {
    if (!activityOpen || !isCourierOnline) return undefined;
    const timerId = window.setInterval(async () => {
      try {
        await refreshDailyWalletDeductions();
      } catch (error) {
        console.error("No se pudo actualizar el saldo descontado:", error);
        setActivityError(
          error.message || "No se pudieron actualizar los descuentos.",
        );
      }
    }, 15000);
    return () => window.clearInterval(timerId);
  }, [activityOpen, isCourierOnline, refreshDailyWalletDeductions]);

  useEffect(() => {
    let mounted = true;
    const fetchSummary = async () => {
      try {
        await loadSummary();
      } catch (error) {
        if (!mounted) return;
        console.error("No se pudo cargar el resumen del domiciliario:", error);
        setErrorMessage(
          error.message || "No se pudo cargar la información de tu cuenta.",
        );
      } finally {
        if (mounted) setSummaryLoaded(true);
      }
    };
    fetchSummary();
    return () => {
      mounted = false;
    };
  }, [loadSummary]);

  useEffect(() => {
    if (!summaryLoaded || !user?.id) return undefined;
    let active = true;
    const refreshAssignment = async () => {
      try {
        await refreshPrivateStoreAssignment();
      } catch (error) {
        console.error("No se pudo actualizar el vínculo de la tienda:", error);
        if (active) {
          setErrorMessage(
            error.message || "No se pudo actualizar la disponibilidad de la tienda.",
          );
        }
      }
    };
    const channel = supabase
      .channel(`courier-store-assignment:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "employees",
          filter: `auth_user_id=eq.${user.id}`,
        },
        () => {
          refreshAssignment();
        },
      )
      .subscribe((status) => {
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          console.error("Realtime del vínculo de tienda no disponible:", status);
        }
      });
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshAssignment();
    }, 10000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [refreshPrivateStoreAssignment, summaryLoaded, user?.id]);

  useEffect(() => {
    if (
      !summaryLoaded ||
      !isCourierOnline ||
      (!canUsePrivate && !isPublicApproved)
    ) {
      return undefined;
    }

    let active = true;
    let requestPending = false;
    const fetchHotZones = async () => {
      if (requestPending) return;
      requestPending = true;
      try {
        const data = await loadCourierHotZones();
        if (active) {
          setHotZones(data);
          setHotZoneError("");
        }
      } catch (error) {
        if (!active) return;
        console.error("No se pudieron cargar las zonas calientes:", error);
        setHotZoneError("No se pudieron cargar las zonas de alta demanda.");
      } finally {
        requestPending = false;
      }
    };

    fetchHotZones();
    const intervalId = window.setInterval(fetchHotZones, 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [
    canUsePrivate,
    isCourierOnline,
    isPublicApproved,
    loadCourierHotZones,
    summaryLoaded,
  ]);

  useEffect(() => {
    let active = true;
    let profilePhotoObjectUrl = null;
    const authPhotoUrl =
      [
        user?.user_metadata?.avatar_url,
        user?.user_metadata?.picture,
        user?.user_metadata?.photo_url,
      ].find((value) => typeof value === "string" && value.trim()) || "";
    setProfilePhotoUrl(authPhotoUrl);
    setProfilePhotoError("");
      if (!user?.id) return undefined;

    const loadProfilePhoto = async () => {
      let photoLoadStep = "ruta";
      try {
        const { data: photoPath, error: photoPathError } = await supabase.rpc(
          "get_my_courier_profile_photo_path",
        );
        if (photoPathError) throw photoPathError;
        if (!photoPath) {
          if (active && !authPhotoUrl) {
            setProfilePhotoError(
              "Esta cuenta no tiene una foto de perfil vinculada.",
            );
          }
          return;
        }

        photoLoadStep = "enlace";
        const photoUrl = await loadCourierProfilePhotoUrl(photoPath);
        if (photoUrl.startsWith("blob:")) {
          if (active) {
            profilePhotoObjectUrl = photoUrl;
          } else {
            URL.revokeObjectURL(photoUrl);
          }
        }
        if (active) setProfilePhotoUrl(photoUrl);
      } catch (error) {
        if (!active) return;
        console.error("No se pudo cargar la foto del domiciliario:", error);
        const missingPhotoPathFunction =
          error?.code === "PGRST202" ||
          error?.code === "42883" ||
          String(error?.message || "").includes(
            "get_my_courier_profile_photo_path",
          );
        const photoErrorMessage = missingPhotoPathFunction
          ? "Aplica la migración 20261120003200 para habilitar la foto de perfil."
          : photoLoadStep === "enlace"
            ? "No se pudo generar el enlace seguro de la foto. Verifica que la migración 20261120003200 esté aplicada."
            : "No se pudo recuperar la foto asociada a esta cuenta.";
        setProfilePhotoError(
          authPhotoUrl ? "" : photoErrorMessage,
        );
      }
    };

    loadProfilePhoto();
    return () => {
      active = false;
      if (profilePhotoObjectUrl) {
        URL.revokeObjectURL(profilePhotoObjectUrl);
      }
    };
  }, [
    user?.id,
    user?.user_metadata?.avatar_url,
    user?.user_metadata?.picture,
    user?.user_metadata?.photo_url,
  ]);

  useEffect(() => {
    let mounted = true;
    const fetchOrders = async () => {
      try {
        const { data } = await requestOrders();
        if (!mounted) return;
        updateOrders(data || []);
        setErrorMessage("");
      } catch (error) {
        if (!mounted) return;
        console.error("No se pudieron cargar los domicilios:", error);
        setErrorMessage(
          error.message ||
            "No se pudieron cargar los pedidos.",
        );
        setOrders([]);
      } finally {
        if (mounted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    fetchOrders();
    return () => {
      mounted = false;
    };
  }, [requestOrders, updateOrders]);

  useEffect(() => {
    if (!isCourierOnline) return undefined;
    let lastUpdateAt = 0;
    const watchId = navigator.geolocation?.watchPosition(
      async ({ coords }) => {
        const nextLocation = {
          latitude: coords.latitude,
          longitude: coords.longitude,
        };
        setMapLocation(nextLocation);
        if (Date.now() - lastUpdateAt < 45000) return;
        lastUpdateAt = Date.now();
        try {
          await syncLiveLocation(nextLocation);
        } catch (error) {
          console.error("No se pudo sincronizar la ubicación:", error);
          setLocationStatus("error");
          setErrorMessage(locationErrorMessage(error));
        }
      },
      (error) => {
        console.error(
          "No se pudo seguir la ubicación del domiciliario:",
          error,
        );
        setLocationStatus("error");
        setErrorMessage(
          "No podemos actualizar tu ubicación. Revisa los permisos de ubicación del dispositivo.",
        );
      },
      { enableHighAccuracy: false, maximumAge: 20000, timeout: 20000 },
    ) ?? null;
    const heartbeatId = window.setInterval(async () => {
      try {
        const nextLocation = await getLocation();
        await syncLiveLocation(nextLocation);
      } catch (error) {
        console.error("No se pudo renovar la conexión del domiciliario:", error);
        setLocationStatus("error");
        setErrorMessage(
          locationErrorMessage(error),
        );
      }
    }, 60000);
    return () => {
      if (watchId !== null) navigator.geolocation?.clearWatch(watchId);
      window.clearInterval(heartbeatId);
    };
  }, [isCourierOnline, isPrivateOnline, syncLiveLocation]);

  useEffect(() => {
    if (section !== "history" && section !== "wallet") return;
    let mounted = true;
    const fetchSection = async () => {
      try {
        if (section === "history") await loadHistory();
        else await Promise.all([loadWallet(), loadSummary()]);
        if (mounted) setErrorMessage("");
      } catch (error) {
        if (!mounted) return;
        console.error("No se pudo cargar la sección del portal:", error);
        setErrorMessage(
          error.message || "No se pudo cargar esta sección. Intenta de nuevo.",
        );
      } finally {
        if (mounted) setSectionLoading(false);
      }
    };
    fetchSection();
    return () => {
      mounted = false;
    };
  }, [loadHistory, loadWallet, section]);

  const refreshOrders = useCallback(async () => {
    if (refreshPromiseRef.current) {
      refreshAgainRef.current = true;
      return refreshPromiseRef.current;
    }

    setRefreshing(true);
    const refreshPromise = (async () => {
      try {
        do {
          refreshAgainRef.current = false;
          const { data } = await requestOrders();
          updateOrders(data || []);
        } while (refreshAgainRef.current);
        setErrorMessage("");
      } catch (error) {
        console.error("No se pudieron actualizar los domicilios:", error);
        setErrorMessage(error.message || "No se pudieron actualizar los pedidos.");
      } finally {
        refreshAgainRef.current = false;
        refreshPromiseRef.current = null;
        setRefreshing(false);
      }
    })();
    refreshPromiseRef.current = refreshPromise;
    return refreshPromise;
  }, [requestOrders, updateOrders]);

  const finishOrderPreview = useCallback(async (order) => {
    const { error } = await supabase.rpc("skip_my_courier_order_offer", {
      p_order_id: order.order_id,
      p_expired: true,
    });
    if (error) {
      console.error("No se pudo liberar la oferta del domicilio:", error);
      setErrorMessage(error.message || "No se pudo liberar esta oferta.");
      await refreshOrders();
      return false;
    }

    seenOfferIdsRef.current.delete(getCourierOrderKey(order));
    await refreshOrders();
    return true;
  }, [refreshOrders]);

  useEffect(() => {
    if (!isCourierOnline || section !== "orders") return undefined;

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshOrders();
    };
    const refreshWhenOnline = () => refreshOrders();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("online", refreshWhenOnline);

    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("online", refreshWhenOnline);
    };
  }, [isCourierOnline, refreshOrders, section]);

  useEffect(() => {
    if (!isCourierOnline || section !== "orders") {
      return undefined;
    }

    let active = true;
    let debounceId = null;
    const channels = [];
    const subscribedSources = new Set();
    const expectedSources = [
      ...(isPrivateOnline && summary?.private_business_id ? ["private"] : []),
      ...(isPublicOnline ? ["public"] : []),
    ];
    const scheduleRefresh = () => {
      if (debounceId !== null) window.clearTimeout(debounceId);
      debounceId = window.setTimeout(() => {
        debounceId = null;
        if (active) refreshOrders();
      }, 150);
    };
    const subscribeToSignals = (source, filter) => {
      const channel = supabase
        .channel(`courier-order-signals:${user?.id}:${source}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "courier_order_realtime_signals",
            ...(filter ? { filter } : {}),
          },
          scheduleRefresh,
        )
        .subscribe((status) => {
          if (!active) return;
          if (status === "SUBSCRIBED") {
            subscribedSources.add(source);
            if (subscribedSources.size === expectedSources.length) {
              setRealtimeStatus("connected");
            }
            refreshOrders();
            return;
          }
          if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            subscribedSources.delete(source);
            setRealtimeStatus("fallback");
            console.error(
              `Realtime de pedidos no disponible (${source}):`,
              status,
            );
            setErrorMessage(
              "La conexión en tiempo real no está disponible. Seguiremos buscando pedidos automáticamente.",
            );
          }
        });
      channels.push(channel);
    };

    if (isPrivateOnline && summary?.private_business_id) {
      subscribeToSignals(
        "private",
        `business_id=eq.${summary.private_business_id}`,
      );
    }
    if (isPublicOnline) {
      subscribeToSignals("public");
    }

    const intervalId = window.setInterval(
      refreshOrders,
      COURIER_ORDER_REFRESH_INTERVAL_MS,
    );
    return () => {
      active = false;
      window.clearInterval(intervalId);
      if (debounceId !== null) window.clearTimeout(debounceId);
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, [
    isCourierOnline,
    isPrivateOnline,
    isPublicOnline,
    refreshOrders,
    section,
    summary?.private_business_id,
    user?.id,
  ]);

  const runOrderAction = async (
    orderId,
    rpcName,
    status,
    successMessage,
    extraParams = {},
  ) => {
    setActiveOrderId(orderId);
    setErrorMessage("");
    setNotice("");
    try {
      const { data, error } = await supabase.rpc(rpcName, {
        p_order_id: orderId,
        ...(status ? { p_status: status } : {}),
        ...extraParams,
      });
      if (error) throw error;
      if (rpcName === "complete_courier_order_step" && !data?.success) {
        const reasonMessages = {
          invalid_code: "El código no coincide. Verifícalo con el cliente o la tienda.",
          temporarily_locked:
            "Se bloquearon temporalmente los intentos. Espera 15 minutos e inténtalo de nuevo.",
          not_assigned: "Este pedido ya no está asignado a tu cuenta.",
          invalid_step: "El pedido cambió de estado. Actualiza la lista e inténtalo de nuevo.",
          code_unavailable: "El código ya no está disponible para este pedido.",
          order_unavailable: "El pedido ya no está disponible.",
          unauthorized: "Inicia sesión nuevamente para continuar.",
        };
        setErrorMessage(
          reasonMessages[data?.reason] ||
            "No se pudo validar el código del pedido.",
        );
        return false;
      }
      if (status === "delivered") {
        updateOrders(
          orders.filter((order) => order.order_id !== orderId),
        );
      }
      setNotice(successMessage);
      await Promise.all([refreshOrders(), loadSummary()]);
      return true;
    } catch (error) {
      console.error("No se pudo actualizar el domicilio:", error);
      setErrorMessage(error.message || "No se pudo actualizar el domicilio.");
      return false;
    } finally {
      setActiveOrderId(null);
    }
  };

  const claimOrder = async (order) => {
    if (
      activeOrderId ||
      hasActivePublicDelivery ||
      (order.courier_mode === "public" && activeDelivery)
    ) {
      setErrorMessage(
        "Completa tu entrega actual antes de aceptar una oferta pública o de otra fuente.",
      );
      return;
    }
    if (
      order.courier_mode === "public" &&
      getCourierOrderKey(order) !==
        (currentPublicOffer ? getCourierOrderKey(currentPublicOffer) : null)
    ) {
      setErrorMessage(
        "Esta oferta ya no está activa. Espera el siguiente pedido disponible.",
      );
      return;
    }
    await runOrderAction(
      order.order_id,
      order.courier_mode === "private"
        ? "claim_domiciliario_order"
        : "claim_my_courier_order_offer",
      null,
      order.courier_mode === "public"
        ? "Pedido público aceptado. El saldo solo aplica a las entregas públicas."
        : "Pedido de tienda acumulado.",
      order.courier_mode === "public"
        ? { p_courier_mode: order.courier_mode }
        : {},
    );
  };

  const updateOrderStatus = async (order, status, code) => {
    if (!code) {
      setErrorMessage("");
      setVerificationCode(["", "", "", ""]);
      verificationSubmissionRef.current = false;
      setVerificationPrompt({ order, status });
      return false;
    }

    const updated = await runOrderAction(
      order.order_id,
      "complete_courier_order_step",
      status,
      status === "picked_up"
        ? "Marcaste el pedido como recogido."
        : "Marcaste el pedido como entregado.",
      { p_code: code },
    );
    if (updated) setVerificationPrompt(null);
    if (updated) verificationSubmissionRef.current = false;
    if (updated && status === "delivered") {
      recordWorkOrder(order);
      updateDailyStats((current) => {
        const source = order.courier_mode === "public" ? "public" : "private";
        const id = `${source}:${order.order_id}`;
        if (current.completedOrders.some((completed) => completed.id === id)) {
          return current;
        }
        return {
          ...current,
          completedOrders: [
            ...current.completedOrders,
            {
              id,
              source,
              fee: Number(order.delivery_fee) || 0,
              distanceKm: getPickupToCustomerDistanceKm(order),
              completedAt: new Date().toISOString(),
            },
          ],
        };
      });
    }
    return updated;
  };

  const submitVerificationCode = async (digits) => {
    if (!verificationPrompt) return;
    const code = digits.join("");
    if (
      !/^\d{4}$/.test(code) ||
      verificationSubmissionRef.current ||
      activeOrderId === verificationPrompt.order.order_id
    ) {
      return;
    }

    verificationSubmissionRef.current = true;
    const updated = await updateOrderStatus(
      verificationPrompt.order,
      verificationPrompt.status,
      code,
    );
    if (!updated) {
      verificationSubmissionRef.current = false;
      setVerificationCode(["", "", "", ""]);
      verificationCodeInputRefs.current[0]?.focus();
    }
  };

  const activateSource = async (source, location) => {
    if (source === "public") {
      const { error } = await supabase.rpc(
        "set_public_courier_availability",
        {
          p_is_online: true,
          p_latitude: location.latitude,
          p_longitude: location.longitude,
        },
      );
      if (error) throw error;
      return;
    }
    const { error } = await supabase.rpc("set_domiciliario_availability", {
      p_is_online: true,
    });
    if (error) throw error;
  };

  const deactivateSource = async (source) => {
    if (source === "public") {
      const { error } = await supabase.rpc(
        "set_public_courier_availability",
        { p_is_online: false, p_latitude: null, p_longitude: null },
      );
      if (error) throw error;
      return;
    }
    const { error } = await supabase.rpc("set_domiciliario_availability", {
      p_is_online: false,
    });
    if (error) throw error;
    const { error: locationError } = await supabase.rpc(
      "set_domiciliario_live_location",
      { p_latitude: null, p_longitude: null },
    );
    if (locationError) throw locationError;
  };

  const toggleAvailability = async () => {
    unlockOrderAudio();
    setAvailabilityBusy(true);
    setErrorMessage("");
    setNotice("");
    try {
      if (isCourierOnline) {
        const sourcesToDisable = [
          ...(isPublicOnline ? ["public"] : []),
          ...(isPrivateOnline ? ["private"] : []),
        ];
        for (const source of sourcesToDisable) {
          await deactivateSource(source);
        }
        setSummary((current) => ({
          ...current,
          is_online: false,
          private_is_online: false,
          location_latitude: null,
          location_longitude: null,
        }));
        syncWorkSession(false);
        setMapLocation(null);
        setLocationStatus("paused");
        setRealtimeStatus("offline");
        offerBaselineReadyRef.current = false;
        setPreviewOrderIds([]);
      } else {
        if (!hasEnabledSources) {
          setErrorMessage("Activa al menos una fuente: tienda o pedidos públicos.");
          return;
        }
        setLocationStatus("updating");
        const location = await getLocation();
        const sourcesToEnable = [
          ...(canUsePrivate && privateSourceEnabled ? ["private"] : []),
          ...(isPublicApproved && publicSourceEnabled ? ["public"] : []),
        ];
        try {
          for (const source of sourcesToEnable) {
            await activateSource(source, location);
          }
          await syncLiveLocation(location, {
            publicEnabled: sourcesToEnable.includes("public"),
            privateEnabled: sourcesToEnable.includes("private"),
          });
          const { data: currentOrders } = await requestOrders();
          updateOrders(currentOrders || []);
          (currentOrders || [])
            .filter((order) => order.delivery_status === "available")
            .forEach((order) =>
              seenOfferIdsRef.current.add(getCourierOrderKey(order)),
            );
          setPreviewOrderIds(
            sortCourierOrdersByAge(
              (currentOrders || []).filter(
                (order) =>
                  order.courier_mode === "public" &&
                  order.delivery_status === "available",
              ),
            ).map(getCourierOrderKey),
          );
          offerBaselineReadyRef.current = true;
        } catch (locationError) {
          try {
            for (const source of sourcesToEnable) {
              await deactivateSource(source);
            }
          } catch (rollbackError) {
            console.error(
              "No se pudo revertir la conexión después del error de ubicación:",
              rollbackError,
            );
          }
          throw locationError;
        }
        setRealtimeStatus("connecting");
        setSummary((current) => ({
          ...current,
          is_online: sourcesToEnable.includes("public"),
          private_is_online: sourcesToEnable.includes("private"),
          location_latitude: sourcesToEnable.includes("public")
            ? location.latitude
            : null,
          location_longitude: sourcesToEnable.includes("public")
            ? location.longitude
            : null,
        }));
        syncWorkSession(true);
      }
    } catch (error) {
      console.error("No se pudo cambiar la disponibilidad:", error);
      setLocationStatus("error");
      setErrorMessage(
        error?.code === "PGRST202" &&
          error?.message?.includes("set_domiciliario_live_location")
          ? locationErrorMessage(error)
          : error.message || "No se pudo cambiar tu disponibilidad.",
      );
    } finally {
      setAvailabilityBusy(false);
    }
  };

  const toggleSourcePreference = async (source) => {
    const isPublic = source === "public";
    const isEnabled = isPublic ? publicSourceEnabled : privateSourceEnabled;
    setMode(source);
    setAvailabilityBusy(true);
    setErrorMessage("");
    setNotice("");
    try {
      if (isEnabled && (isPublic ? isPublicOnline : isPrivateOnline)) {
        await deactivateSource(source);
        setSummary((current) => ({
          ...current,
          ...(isPublic
            ? {
                is_online: false,
                location_latitude: null,
                location_longitude: null,
              }
            : { private_is_online: false }),
        }));
        const anotherSourceOnline = isPublic
          ? isPrivateOnline
          : isPublicOnline;
        syncWorkSession(anotherSourceOnline);
        if (!anotherSourceOnline) {
          setMapLocation(null);
          setLocationStatus("paused");
        }
      } else if (!isEnabled && isCourierOnline) {
        const location = await getLocation();
        try {
          await activateSource(source, location);
          await syncLiveLocation(location, {
            publicEnabled: isPublic || isPublicOnline,
            privateEnabled: !isPublic || isPrivateOnline,
          });
        } catch (activationError) {
          try {
            await deactivateSource(source);
          } catch (rollbackError) {
            console.error(
              "No se pudo revertir la fuente después del error de ubicación:",
              rollbackError,
            );
          }
          throw activationError;
        }
        setSummary((current) => ({
          ...current,
          ...(isPublic
            ? {
                is_online: true,
                location_latitude: location.latitude,
                location_longitude: location.longitude,
              }
            : { private_is_online: true }),
        }));
        syncWorkSession(true);
      }
      setSourcePreferences((current) => ({
        private: current?.private ?? canUsePrivate,
        public: current?.public ?? isPublicApproved,
        [source]: !isEnabled,
      }));
      const nextPreferences = {
        private: privateSourceEnabled,
        public: publicSourceEnabled,
        [source]: !isEnabled,
      };
      try {
        localStorage.setItem(
          `gloto:courier-sources:${user?.id}`,
          JSON.stringify(nextPreferences),
        );
      } catch (storageError) {
        console.error("No se pudieron guardar las fuentes de pedidos:", storageError);
        setErrorMessage(
          "El cambio se aplicó, pero no se pudo guardar tu preferencia en este dispositivo.",
        );
      }
      setNotice(
        `${isPublic ? "Pedidos públicos" : "Pedidos de tu tienda"} ${
          isEnabled ? "desactivados" : "activados"
        }.`,
      );
    } catch (error) {
      console.error("No se pudo cambiar la fuente de pedidos:", error);
      setLocationStatus("error");
      setErrorMessage(
        error?.code === "PGRST202" &&
          error?.message?.includes("set_domiciliario_live_location")
          ? locationErrorMessage(error)
          : error.message || "No se pudo cambiar la fuente de pedidos.",
      );
    } finally {
      setAvailabilityBusy(false);
    }
  };

  const submitApplication = async (event) => {
    event.preventDefault();
    setBusy(true);
    setErrorMessage("");
    setNotice("");
    try {
      const location = await getLocation();
      const { error } = await supabase.rpc("apply_for_public_courier", {
        p_full_name: displayName.trim(),
        p_phone: phone.trim(),
        p_latitude: location.latitude,
        p_longitude: location.longitude,
      });
      if (error) throw error;
      setNotice("Recibimos tu solicitud. Te avisaremos cuando sea revisada.");
      await loadSummary();
    } catch (error) {
      console.error("No se pudo enviar la solicitud pública:", error);
      setErrorMessage(error.message || "No se pudo enviar la solicitud.");
    } finally {
      setBusy(false);
    }
  };

  const saveCourierPhone = async (event) => {
    event.preventDefault();
    const nextPhone = phone.trim();
    if (nextPhone.length < 7 || nextPhone.length > 30) {
      setErrorMessage("El teléfono debe tener entre 7 y 30 caracteres.");
      return;
    }

    setSavingPhone(true);
    setErrorMessage("");
    setNotice("");
    try {
      const { data, error } = await supabase.rpc("set_my_courier_phone", {
        p_phone: nextPhone,
      });
      if (error) throw error;
      const savedPhone = typeof data === "string" ? data : nextPhone;
      setPhone(savedPhone);
      setSummary((current) =>
        current ? { ...current, phone: savedPhone } : current,
      );
      setNotice("Tu teléfono se guardó correctamente.");
    } catch (error) {
      console.error("No se pudo guardar el teléfono del domiciliario:", error);
      setErrorMessage(error.message || "No se pudo guardar tu teléfono.");
    } finally {
      setSavingPhone(false);
    }
  };

  const saveCourierCedula = async (event) => {
    event.preventDefault();
    const nextCedula = courierCedula.replace(/\D/g, "");
    if (!/^[0-9]{5,15}$/.test(nextCedula)) {
      setErrorMessage("La cédula debe tener entre 5 y 15 dígitos.");
      return;
    }

    setSavingCedula(true);
    setErrorMessage("");
    setNotice("");
    try {
      const { data, error } = await supabase.rpc("set_my_courier_cedula", {
        p_cedula: nextCedula,
      });
      if (error) throw error;
      const savedCedula = typeof data === "string" ? data : nextCedula;
      setCourierCedula(savedCedula);
      setSavedCourierCedula(savedCedula);
      setNotice("Tu cédula se guardó correctamente. Ya pueden vincularte a una tienda.");
    } catch (error) {
      console.error("No se pudo guardar la cédula del domiciliario:", error);
      setErrorMessage(error.message || "No se pudo guardar tu cédula.");
    } finally {
      setSavingCedula(false);
    }
  };

  const submitTopup = async (event) => {
    event.preventDefault();
    if (!topupProof) {
      setErrorMessage("Adjunta el comprobante de la recarga.");
      return;
    }
    const amount = Number(topupAmount);
    if (![5000, 10000, 20000, 30000, 40000, 50000].includes(amount)) {
      setErrorMessage("Selecciona una de las tarifas disponibles de recarga.");
      return;
    }
    setBusy(true);
    setErrorMessage("");
    setNotice("");
    try {
      const safeName = topupProof.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const proofPath = `${user.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("courier-topup-proofs")
        .upload(proofPath, topupProof, { upsert: false });
      if (uploadError) throw uploadError;
      const { error } = await supabase.rpc("submit_public_courier_topup", {
        p_amount: amount,
        p_proof_path: proofPath,
      });
      if (error) throw error;
      setNotice("Comprobante enviado. La recarga aparecerá al ser aprobada.");
      setTopupAmount("");
      setTopupProof(null);
      await Promise.all([loadWallet(), loadSummary()]);
    } catch (error) {
      console.error("No se pudo enviar la solicitud de recarga:", error);
      setErrorMessage(error.message || "No se pudo enviar la recarga.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    if (availabilityBusy) return;
    setAvailabilityBusy(true);
    try {
      const disconnectRequests = [];
      if (isPublicOnline) {
        disconnectRequests.push(
          supabase.rpc("set_public_courier_availability", {
                p_is_online: false,
                p_latitude: null,
                p_longitude: null,
              }),
        );
      }
      if (isPrivateOnline) {
        disconnectRequests.push(
          supabase.rpc("set_domiciliario_availability", {
            p_is_online: false,
          }),
        );
      }
      if (canUsePrivate) {
        disconnectRequests.push(
          supabase.rpc("set_domiciliario_live_location", {
            p_latitude: null,
            p_longitude: null,
          }),
        );
      }
      const disconnectResults = await Promise.all(disconnectRequests);
      const failedDisconnect = disconnectResults.find(({ error }) => error);
      if (failedDisconnect?.error) throw failedDisconnect.error;
      syncWorkSession(false);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate("/domiciliarios/login", { replace: true });
    } catch (error) {
      console.error("No se pudo cerrar la sesión del domiciliario:", error);
      setErrorMessage("No se pudo cerrar la sesión. Intenta de nuevo.");
    } finally {
      setAvailabilityBusy(false);
    }
  };

  const deleteCourierAccount = async (event) => {
    event.preventDefault();
    if (deleteAccountConfirmation !== "ELIMINAR") {
      setErrorMessage('Escribe "ELIMINAR" para confirmar la eliminación de tu cuenta.');
      return;
    }

    setDeletingAccount(true);
    setErrorMessage("");
    try {
      const { data, error } = await supabase.functions.invoke(
        "eliminar-mi-cuenta-domiciliario",
        { body: { confirmation: deleteAccountConfirmation } },
      );
      if (error) {
        let errorMessage = error.message || "No se pudo eliminar tu cuenta.";
        if (error.context && typeof error.context.json === "function") {
          try {
            const response = await error.context.json();
            errorMessage = response?.error || errorMessage;
          } catch (parseError) {
            console.warn("No se pudo leer el error de eliminación de cuenta:", parseError);
          }
        }
        throw new Error(errorMessage);
      }
      if (!data?.success) {
        throw new Error(data?.error || "No se pudo confirmar la eliminación de tu cuenta.");
      }

      sessionStorage.removeItem(courierWorkSessionKey(user.id));
      localStorage.removeItem(courierDailyStatsKey(user.id));
      localStorage.removeItem(`gloto:courier-sources:${user.id}`);
      const { error: signOutError } = await supabase.auth.signOut({
        scope: "local",
      });
      if (signOutError) {
        console.error("La cuenta se eliminó, pero no se pudo cerrar la sesión local:", signOutError);
      }
      navigate("/domiciliarios/login", { replace: true });
    } catch (error) {
      console.error("No se pudo eliminar la cuenta del domiciliario:", error);
      setErrorMessage(error.message || "No se pudo eliminar tu cuenta.");
      setDeletingAccount(false);
    }
  };

  const unlinkMyStore = async () => {
    setUnlinkingStore(true);
    setErrorMessage("");
    setNotice("");
    try {
      const { data, error } = await supabase.rpc(
        "unlink_my_domiciliario_from_store",
      );
      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || "No se pudo completar la desvinculación.");
      }

      const preferences = {
        private: false,
        public: sourcePreferences?.public ?? isPublicApproved,
      };
      setSourcePreferences(preferences);
      setMode("public");
      setSummary((current) =>
        current
          ? {
              ...current,
              private_business_id: null,
              private_business_name: null,
              private_store_available: false,
              private_is_online: false,
            }
          : current,
      );
      try {
        localStorage.setItem(
          `gloto:courier-sources:${user.id}`,
          JSON.stringify(preferences),
        );
      } catch (storageError) {
        console.error("No se pudo guardar la preferencia de pedidos:", storageError);
        setErrorMessage("Te desvinculaste, pero no se pudo guardar tu preferencia local.");
      }
      setUnlinkStoreOpen(false);
      setNotice("Te desvinculaste de la tienda. Tu cuenta de Gloto sigue activa.");
    } catch (error) {
      console.error("No se pudo desvincular al domiciliario de la tienda:", error);
      setErrorMessage(error.message || "No se pudo completar la desvinculación.");
    } finally {
      setUnlinkingStore(false);
    }
  };

  const changeSection = (nextSection) => {
    setSection(nextSection);
    setSectionLoading(nextSection === "history" || nextSection === "wallet");
  };

  const showFullMap =
    section === "orders" &&
    (!summaryLoaded || !summary || canUsePrivate || isPublicApproved) &&
    !(mode === "public" && !isPublicApproved);

  const deliveryStats = useMemo(() => {
    const active = orders.filter((order) =>
      ["assigned", "picked_up"].includes(order.delivery_status),
    ).length;
    return { active, available: orders.length - active };
  }, [orders]);
  const activityStats = useMemo(
    () => ({
      isCurrent: Boolean(isCourierOnline && workSession && !workSession.endedAt),
    }),
    [isCourierOnline, workSession],
  );
  const walletTodayStats = useMemo(() => {
    const todayStats =
      dailyStats.dateKey === getLocalDateKey()
        ? dailyStats
        : createEmptyDailyStats();
    const completedOrders = todayStats.completedOrders;
    return {
      earned: completedOrders.reduce(
        (total, order) => total + (Number(order.fee) || 0),
        0,
      ),
      kilometers: completedOrders.reduce(
        (total, order) => total + (Number(order.distanceKm) || 0),
        0,
      ),
      privateOrders: completedOrders.filter(
        (order) => order.source === "private",
      ).length,
      publicOrders: completedOrders.filter(
        (order) => order.source === "public",
      ).length,
    };
  }, [dailyStats]);
  const filteredHistory = useMemo(() => {
    const query = historySearch.trim().toLocaleLowerCase("es");
    return history.filter((order) => {
      const source = order.courier_mode || "private";
      if (historySourceFilter !== "all" && source !== historySourceFilter) {
        return false;
      }
      if (historyStartDate || historyEndDate) {
        const orderDate = new Date(order.created_at);
        if (!Number.isFinite(orderDate.getTime())) return false;
        const orderDateKey = getLocalDateKey(orderDate);
        if (historyStartDate && orderDateKey < historyStartDate) return false;
        if (historyEndDate && orderDateKey > historyEndDate) return false;
      }
      if (!query) return true;
      const searchable = [
        order.order_id,
        order.business_name,
        order.delivery_address,
        order.delivery_status,
        statusLabel[order.delivery_status],
        source === "public" ? "publico red publica" : "tienda privado",
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("es");
      return searchable.includes(query);
    });
  }, [
    history,
    historyEndDate,
    historySearch,
    historySourceFilter,
    historyStartDate,
  ]);
  const hasHistoryFilters =
    historySearch ||
    historySourceFilter !== "all" ||
    historyDatePreset !== "all";
  const handleHistoryDatePresetChange = (preset) => {
    setHistoryDatePreset(preset);
    if (preset === "all" || preset === "custom") {
      setHistoryStartDate("");
      setHistoryEndDate("");
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (preset === "last7" || preset === "last30") {
      const start = new Date(today);
      start.setDate(start.getDate() - (preset === "last7" ? 6 : 29));
      setHistoryStartDate(getLocalDateKey(start));
      setHistoryEndDate(getLocalDateKey(today));
      return;
    }

    const daysAgo = Number(preset);
    const selectedDay = new Date(today);
    selectedDay.setDate(selectedDay.getDate() - daysAgo);
    const dateKey = getLocalDateKey(selectedDay);
    setHistoryStartDate(dateKey);
    setHistoryEndDate(dateKey);
  };

  return (
    <main className="min-h-screen bg-[#09090f] text-white">
      {!activeDelivery && (
        <PortalDomiciliarioSidebar
          compact={showFullMap}
          isOpen={menuOpen}
          onToggle={() => setMenuOpen((open) => !open)}
          onClose={() => setMenuOpen(false)}
          section={section}
          onSectionChange={changeSection}
          mode={mode}
          onModeChange={(nextMode) => {
            setMode(nextMode);
            setSection("orders");
            setMenuOpen(false);
          }}
          privateOnline={isPrivateOnline}
          privateAvailable={privateStoreAvailable}
          publicOnline={isPublicOnline}
          privateBusinessName={summary?.private_business_name}
          privateBusinessLogo={
            privateBusinessLogo.businessId === summary?.private_business_id
              ? privateBusinessLogo.logoUrl
              : ""
          }
          privateEnabled={privateSourceEnabled}
          publicEnabled={publicSourceEnabled}
          locationStatus={locationStatus}
          availabilityBusy={availabilityBusy}
          onToggleAvailability={toggleSourcePreference}
          courierOnline={isCourierOnline}
          onDisconnect={toggleAvailability}
          canUsePrivate={canUsePrivate}
          canUsePublic={isPublicApproved}
          isPublicApproved={isPublicApproved}
          sessionEarnings={walletTodayStats.earned}
          activityValuesVisible={activityValuesVisible}
          onToggleActivityValues={() =>
            setActivityValuesVisible((visible) => !visible)
          }
          onOpenActivity={openActivity}
          displayName={displayName}
          profilePhotoUrl={profilePhotoUrl}
          onSignOut={signOut}
          courierPushSupported={courierPushSupported}
          courierPushActive={courierPushActive}
          courierPushBusy={courierPushBusy}
          courierPushError={courierPushError}
          courierPushMessage={courierPushMessage}
          onEnableCourierPush={activateCourierPush}
          appInstalled={appInstalled}
          canInstallApp={Boolean(installPrompt)}
          installMessage={installMessage}
          onInstallApp={installCourierApp}
        />
      )}

      {activeDelivery ? (
        <>
          <CourierActiveDelivery
            order={activeDelivery}
            location={
              mapLocation ||
              (summary?.location_latitude != null &&
              summary?.location_longitude != null
                ? {
                    latitude: summary.location_latitude,
                    longitude: summary.location_longitude,
                  }
                : null)
            }
            busy={activeOrderId === activeDelivery.order_id}
            onUpdateStatus={updateOrderStatus}
            errorMessage={errorMessage}
            swipeResetRequest={swipeResetRequest}
            hotZones={hotZones}
            hotZoneError={hotZoneError}
          />
          {activeDelivery.courier_mode === "private" &&
            otherStoreOrdersForDisplay.length > 0 && (
              <section className="mx-auto max-w-7xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
                <button
                  type="button"
                  aria-expanded={storeOrdersExpanded}
                  onClick={() =>
                    setStoreOrdersExpanded((expanded) => !expanded)
                  }
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left"
                >
                  <span className="text-lg font-black">
                    Pedidos acumulados de tu tienda
                    <span className="ml-2 rounded-full bg-primary-container/15 px-2 py-0.5 text-xs text-white">
                      {otherStoreOrdersForDisplay.length}
                    </span>
                  </span>
                  {storeOrdersExpanded ? (
                    <ChevronUp size={18} aria-hidden="true" />
                  ) : (
                    <ChevronDown size={18} aria-hidden="true" />
                  )}
                </button>
                {storeOrdersExpanded && (
                  <>
                    <p className="text-sm text-neutral-400">
                      Puedes aceptar otros pedidos de tu tienda mientras completas tus entregas.
                    </p>
                    {otherStoreOrdersForDisplay.map((order) => (
                      <OrderCard
                        key={order.order_id}
                        order={order}
                        mode="private"
                        busy={activeOrderId === order.order_id}
                        canClaim={
                          order.delivery_status === "available" &&
                          !hasActivePublicDelivery &&
                          activeOrderId === null
                        }
                        onClaim={claimOrder}
                        onUpdateStatus={updateOrderStatus}
                      />
                    ))}
                  </>
                )}
              </section>
            )}
        </>
      ) : (
      <>
      {showFullMap && (
        <CourierMapExperience
          privateEnabled={privateSourceEnabled}
          publicEnabled={publicSourceEnabled}
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((open) => !open)}
          locationStatus={locationStatus}
          online={isCourierOnline}
          realtimeStatus={realtimeStatus}
          location={
            mapLocation ||
            (summary?.location_latitude != null &&
            summary?.location_longitude != null
              ? {
                  latitude: summary.location_latitude,
                  longitude: summary.location_longitude,
                }
              : null)
          }
          publicRadiusKm={summary?.public_radius_km ?? 10}
          searchingPublic={isPublicOnline}
          orders={ordersForDisplay}
          hotZones={hotZones}
          hotZoneError={hotZoneError}
          activeDelivery={activeDelivery}
          previewOrderIds={previewOrderIds}
          storeOrdersExpanded={storeOrdersExpanded}
          onToggleStoreOrders={() =>
            setStoreOrdersExpanded((expanded) => !expanded)
          }
          onFinishOrderPreview={finishOrderPreview}
          activeOrderId={activeOrderId}
          errorMessage={errorMessage}
          availabilityBusy={availabilityBusy}
          onToggleAvailability={toggleAvailability}
          onClaim={claimOrder}
          onUpdateStatus={updateOrderStatus}
        />
      )}

      {!showFullMap && (
      <div className="mx-auto max-w-7xl px-4 pb-12 pt-7 sm:px-6 lg:px-8">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              {section === "orders"
                ? "Inicio"
                : section === "history"
                  ? "Historial de pedidos"
                  : section === "wallet"
                    ? "Mi saldo"
                    : "Mi perfil"}
            </h1>
            {section !== "history" && (
              <p className="mt-2 max-w-2xl text-sm text-neutral-400">
                {section === "orders"
                  ? mode === "public"
                    ? "Recibirás una oferta a la vez dentro de tu zona."
                    : "Gestiona los pedidos disponibles y acumula entregas de tu tienda."
                  : section === "wallet"
                    ? "Consulta movimientos y solicita una recarga."
                    : "Tus datos de acceso y modos de trabajo."}
              </p>
            )}
          </div>
          {section === "orders" && (
            <button
              type="button"
              onClick={refreshOrders}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-bold text-neutral-200 transition hover:bg-white/[0.08] disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : undefined}
              />
              Actualizar
            </button>
          )}
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-3 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200"
          >
            <ShieldAlert size={18} className="mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {notice && section !== "history" && (
          <p
            role="status"
            className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200"
          >
            {notice}
          </p>
        )}
        {orderSoundError && (
          <p
            role="status"
            className="mb-5 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200"
          >
            {orderSoundError}
          </p>
        )}

        {section === "orders" &&
          mode === "public" &&
          !isPublicApproved && (
            <section className="mb-6 overflow-hidden rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-500/[0.14] via-neutral-900 to-neutral-900 p-6 sm:p-8">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-400/15 text-violet-200">
                {summary?.application_status === "pending" ? (
                  <Clock3 size={23} />
                ) : (
                  <Bike size={24} />
                )}
              </div>
              <h2 className="text-xl font-black sm:text-2xl">
                {summary?.application_status === "pending"
                  ? "Tu solicitud está en revisión"
                  : summary?.application_status === "suspended"
                    ? "Tu acceso público está suspendido"
                    : "Activa tus entregas públicas"}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-300">
                {summary?.application_status === "pending"
                  ? "Cuando el equipo de Gloto apruebe tu solicitud, podrás ver pedidos cercanos, tomar entregas y consultar tu saldo."
                  : summary?.application_status === "suspended"
                    ? "Contacta al equipo de Gloto para revisar el estado de tu cuenta."
                    : "Completa tus datos y comparte tu ubicación para enviar la solicitud de acceso a la red pública de domiciliarios."}
              </p>
              {!summary?.application_status ||
              summary.application_status === "rejected" ? (
                <form
                  onSubmit={submitApplication}
                  className="mt-6 grid max-w-3xl gap-3 sm:grid-cols-[1fr_1fr_auto]"
                >
                  <div className="text-xs font-semibold text-neutral-300">
                    Nombre completo
                    <p className="mt-2 flex min-h-[46px] items-center rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-neutral-300">
                      {displayName}
                    </p>
                  </div>
                  <label className="text-xs font-semibold text-neutral-300">
                    Teléfono
                    <input
                      required
                      minLength={7}
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-violet-400/50"
                      placeholder="300 000 0000"
                      type="tel"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={busy}
                    className="self-end rounded-xl bg-violet-500 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-400 disabled:opacity-50 sm:mb-0"
                  >
                    {busy ? "Enviando..." : "Enviar solicitud"}
                  </button>
                  <p className="flex items-center gap-2 text-xs text-neutral-500 sm:col-span-3">
                    <MapPin size={14} />
                    Te pediremos permiso para usar tu ubicación actual.
                  </p>
                </form>
              ) : null}
            </section>
          )}

        {section === "orders" && mode === "public" && isPublicApproved && (
          <section className="mb-6 overflow-hidden rounded-3xl border border-white/[0.08] bg-neutral-900/60 p-3 sm:p-4">
            <PortalDomiciliarioMap
              location={
                mapLocation ||
                (summary?.location_latitude != null &&
                summary?.location_longitude != null
                  ? {
                      latitude: summary.location_latitude,
                      longitude: summary.location_longitude,
                    }
                  : null)
              }
              publicRadiusKm={summary?.public_radius_km ?? 10}
              searching={isPublicOnline}
              orders={orders}
              hotZones={hotZones}
              hotZoneError={hotZoneError}
              online={isPublicOnline}
            />
            <div className="flex flex-col gap-4 px-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-3">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                    isPublicOnline
                      ? "bg-emerald-400/10 text-emerald-300"
                      : "bg-white/[0.06] text-neutral-400"
                  }`}
                >
                  <Power size={20} />
                </span>
                <div>
                  <p className="text-sm font-black">
                    {isPublicOnline
                      ? "Estás recibiendo pedidos"
                      : "Estás desconectado"}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {isPublicOnline
                      ? `Buscando entregas dentro de ${summary?.public_radius_km || 10} km`
                      : "Conéctate cuando estés listo para trabajar"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleAvailability("public")}
                disabled={availabilityBusy}
                className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-6 text-sm font-black transition disabled:cursor-wait disabled:opacity-60 ${
                  isPublicOnline
                    ? "border border-rose-300/20 bg-rose-400/10 text-rose-100 hover:bg-rose-400/15"
                    : "bg-emerald-400 text-emerald-950 shadow-lg shadow-emerald-950/20 hover:bg-emerald-300"
                }`}
              >
                <Power size={17} />
                {availabilityBusy
                  ? "Actualizando..."
                  : isPublicOnline
                    ? "Desconectarme"
                    : "Conectarme"}
              </button>
            </div>
          </section>
        )}

        {section === "orders" &&
          mode === "public" &&
          isPublicApproved &&
          (isPublicOnline ? (
            <>
              {loading ? (
                <LoadingCard label="Buscando pedidos cercanos..." />
              ) : publicOrdersForDisplay.length === 0 ? (
                <EmptyState
                  icon={MapPinned}
                  title="Aún no hay ofertas en tu zona"
                  description="Buscamos pedidos automáticamente dentro de tu zona. Mantente conectado para recibir una oferta a la vez."
                />
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-lg font-black">Pedido entrante</h2>
                    <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200">
                      1 oferta a la vez
                    </span>
                  </div>
                  {publicOrdersForDisplay.map((order) => (
                    <OrderCard
                      key={order.order_id}
                      order={order}
                      mode="public"
                      busy={activeOrderId === order.order_id}
                      canClaim={!activeDelivery && activeOrderId === null}
                      isSelected={selectedOrderId === order.order_id}
                      onSelect={() => setSelectedOrderId(order.order_id)}
                      onClaim={claimOrder}
                      onUpdateStatus={updateOrderStatus}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            publicOrdersForDisplay.length > 0 ? (
              <div className="space-y-4">
                <p className="rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-4 py-3 text-xs text-amber-100">
                  Estás desconectado de nuevas ofertas; aquí siguen tus entregas activas.
                </p>
                {publicOrdersForDisplay.map((order) => (
                  <OrderCard
                    key={order.order_id}
                    order={order}
                    mode="public"
                    busy={activeOrderId === order.order_id}
                    canClaim={!activeDelivery && activeOrderId === null}
                    isSelected={selectedOrderId === order.order_id}
                    onClaim={claimOrder}
                    onUpdateStatus={updateOrderStatus}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Power}
                title="Activa tu disponibilidad"
                description="Cuando te conectes, tu ubicación se compartirá de forma segura y podrás ver los domicilios disponibles cerca de ti."
              />
            )
          ))}

        {section === "orders" &&
          (mode === "private" ||
            (mode === "public" && !isPublicApproved)) && (
          <>
            {mode === "private" && (
              <div className="mb-5 grid gap-3 sm:grid-cols-2">
                <StatCard
                  icon={PackageCheck}
                  label="Pedidos visibles"
                  value={ordersForDisplay.length}
                  color="violet"
                />
                <StatCard
                  icon={Activity}
                  label="Entregas en curso"
                  value={deliveryStats.active}
                  color="emerald"
                />
              </div>
            )}
            {loading ? (
              <LoadingCard label="Cargando pedidos..." />
            ) : ordersForDisplay.length === 0 ? (
              <EmptyState
                icon={PackageCheck}
                title={
                  mode === "public"
                    ? "No hay pedidos cerca por ahora"
                    : "No tienes domicilios pendientes"
                }
                description={
                  mode === "public"
                    ? "Mantén tu ubicación actualizada. Te mostraremos una oferta a la vez dentro del radio de servicio."
                    : "Los nuevos pedidos de tu tienda aparecerán aquí cuando estén listos para entregar."
                }
              />
            ) : (
              <div className="grid gap-4">
                {ordersForDisplay.map((order) => (
                  <OrderCard
                    key={order.order_id}
                    order={order}
                    mode={mode}
                    busy={activeOrderId === order.order_id}
                    canClaim={
                      activeOrderId === null &&
                      (order.courier_mode === "private"
                        ? !hasActivePublicDelivery
                        : !activeDelivery)
                    }
                    onClaim={claimOrder}
                    onUpdateStatus={updateOrderStatus}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {section === "history" && sectionLoading ? (
          <LoadingCard label="Cargando historial..." />
        ) : section === "history" && (
          <div className="space-y-4">
            <section className="rounded-xl border border-white/[0.08] bg-neutral-900/50 p-3">
              <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_190px_190px_auto]">
                <label className="relative block">
                  <span className="sr-only">Buscar pedido</span>
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                  />
                  <input
                    type="search"
                    value={historySearch}
                    onChange={(event) => setHistorySearch(event.target.value)}
                    placeholder="Buscar pedido..."
                    className="h-10 w-full rounded-lg border border-white/[0.08] bg-black/20 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-violet-400/50"
                  />
                </label>
                <label>
                  <span className="sr-only">Tipo de pedido</span>
                  <select
                    value={historySourceFilter}
                    onChange={(event) =>
                      setHistorySourceFilter(event.target.value)
                    }
                    className="h-10 w-full rounded-lg border border-white/[0.08] bg-black/20 px-3 text-sm text-white outline-none focus:border-violet-400/50"
                  >
                    <option value="all">Todos los tipos</option>
                    <option value="private">Pedidos de tienda</option>
                    <option value="public">Pedidos públicos</option>
                  </select>
                </label>
                <label>
                  <span className="sr-only">Periodo</span>
                  <select
                    value={historyDatePreset}
                    onChange={(event) =>
                      handleHistoryDatePresetChange(event.target.value)
                    }
                    className="h-10 w-full rounded-lg border border-white/[0.08] bg-black/20 px-3 text-sm text-white outline-none focus:border-violet-400/50"
                  >
                    <option value="all">Todas las fechas</option>
                    <option value="0">Hoy</option>
                    <option value="1">Ayer</option>
                    <option value="2">Anteayer</option>
                    <option value="3">Hace 3 días</option>
                    <option value="4">Hace 4 días</option>
                    <option value="5">Hace 5 días</option>
                    <option value="6">Hace 6 días</option>
                    <option value="last7">Últimos 7 días</option>
                    <option value="last30">Últimos 30 días</option>
                    <option value="custom">Personalizado</option>
                  </select>
                </label>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <span className="text-xs tabular-nums text-neutral-500">
                    {filteredHistory.length}/{history.length}
                  </span>
                  {hasHistoryFilters && (
                    <button
                      type="button"
                      onClick={() => {
                        setHistorySearch("");
                        setHistorySourceFilter("all");
                        setHistoryDatePreset("all");
                        setHistoryStartDate("");
                        setHistoryEndDate("");
                      }}
                      className="rounded-lg px-2 py-2 text-xs font-semibold text-neutral-400 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>
              {historyDatePreset === "custom" && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label>
                    <span className="sr-only">Desde</span>
                    <input
                      type="date"
                      value={historyStartDate}
                      max={historyEndDate || undefined}
                      onChange={(event) => setHistoryStartDate(event.target.value)}
                      className="h-10 w-full rounded-lg border border-white/[0.08] bg-black/20 px-3 text-sm text-white outline-none focus:border-violet-400/50"
                    />
                  </label>
                  <label>
                    <span className="sr-only">Hasta</span>
                    <input
                      type="date"
                      value={historyEndDate}
                      min={historyStartDate || undefined}
                      onChange={(event) => setHistoryEndDate(event.target.value)}
                      className="h-10 w-full rounded-lg border border-white/[0.08] bg-black/20 px-3 text-sm text-white outline-none focus:border-violet-400/50"
                    />
                  </label>
                </div>
              )}
            </section>

            {history.length === 0 ? (
              <EmptyState
                icon={History}
                title="Aún no tienes entregas en el historial"
                description="Cuando completes pedidos públicos o de tienda, podrás consultarlos aquí."
              />
            ) : filteredHistory.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No encontramos pedidos"
                description="Prueba cambiando los filtros o limpiándolos para ver todo tu historial."
              />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-neutral-900/50">
                <div className="hidden grid-cols-[1.35fr_0.8fr_1fr_1.25fr_0.8fr_0.8fr] gap-4 border-b border-white/[0.07] px-5 py-3 text-[10px] font-black uppercase tracking-wider text-neutral-500 sm:grid">
                  <span>Referencia / tienda</span>
                  <span>Tipo</span>
                  <span>Fecha</span>
                  <span>Zona de entrega</span>
                  <span>Valor domicilio</span>
                  <span>Estado</span>
                </div>
                {filteredHistory.map((order) => {
                  const isPublicOrder = order.courier_mode === "public";
                  return (
                    <div
                      key={`${order.courier_mode || "private"}:${order.order_id}`}
                      className="grid gap-2 border-b border-white/[0.06] px-5 py-4 last:border-0 sm:grid-cols-[1.35fr_0.8fr_1fr_1.25fr_0.8fr_0.8fr] sm:items-center sm:gap-4"
                    >
                      <div>
                        <p className="text-sm font-bold">
                          {order.business_name ||
                            (isPublicOrder ? "Pedido público" : "Pedido de tienda")}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          Pedido #{String(order.order_id || "").slice(0, 8).toUpperCase()}
                        </p>
                      </div>
                      <span
                        className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                          isPublicOrder
                            ? "border-amber-300/20 bg-amber-300/10 text-amber-200"
                            : "border-violet-300/20 bg-violet-300/10 text-violet-200"
                        }`}
                      >
                        {isPublicOrder ? "Público" : "Tienda"}
                      </span>
                      <p className="text-xs text-neutral-400">
                        {formatDate(order.created_at)}
                      </p>
                      <p className="truncate text-xs text-neutral-400">
                        {getGeneralDeliveryArea(order.delivery_address)}
                      </p>
                      <p className="text-xs font-semibold text-emerald-300">
                        {order.delivery_fee != null
                          ? formatMoney(order.delivery_fee)
                          : "No disponible"}
                      </p>
                      <span className="w-fit rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold text-neutral-300">
                        {statusLabel[order.delivery_status] ||
                          order.delivery_status ||
                          "Finalizado"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {section === "wallet" && sectionLoading ? (
          <LoadingCard label="Cargando movimientos..." />
        ) : section === "wallet" && (
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-5">
              <section className="rounded-3xl border border-primary-container/30 bg-gradient-to-br from-primary-container/25 to-neutral-900 p-6">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <CircleDollarSign size={18} />
                  Saldo disponible
                </div>
                <p className="mt-5 text-4xl font-black tracking-tight">
                  {formatMoney(balance)}
                </p>
                <p className="mt-2 text-xs text-neutral-300">
                  El saldo se actualiza cuando se aprueba una recarga o tomas un
                  pedido público.
                </p>
                {Number(summary?.commission_percentage) > 0 && (
                  <p className="mt-2 text-xs text-neutral-300">
                    Comisión de pedidos públicos:{" "}
                    {Number(summary.commission_percentage)}% del costo del
                    domicilio, descontada del saldo al aceptar.
                  </p>
                )}
              </section>
              <form
                onSubmit={submitTopup}
                className="rounded-2xl border border-white/[0.08] bg-neutral-900/60 p-5"
              >
                <h2 className="font-black">Solicitar recarga</h2>
                {summary?.has_pending_topup && (
                  <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.07] px-3 py-2 text-xs text-amber-100">
                    Ya tienes una recarga pendiente de revisión.
                  </p>
                )}
                <div className="mt-4">
                  <p className="text-xs font-semibold text-neutral-300">
                    Valor a recargar (COP)
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {[5000, 10000, 20000, 30000, 40000, 50000].map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => setTopupAmount(String(amount))}
                        className={`rounded-xl border px-2 py-3 text-xs font-black transition ${
                          Number(topupAmount) === amount
                            ? "border-primary-container bg-primary-container/20 text-white"
                            : "border-primary-container/25 bg-primary-container/[0.04] text-white hover:border-primary-container/50 hover:bg-primary-container/[0.12]"
                        }`}
                      >
                        {formatMoney(amount)}
                      </button>
                    ))}
                  </div>
                  {Number(topupAmount) >= 5000 && Number(topupAmount) <= 50000 && (
                    /^https?:\/\//i.test(courierTopupLinks[Number(topupAmount)] || "") ? (
                      <button
                        type="button"
                        onClick={() => window.open(
                          courierTopupLinks[Number(topupAmount)],
                          "_blank",
                          "noopener,noreferrer",
                        )}
                        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary-container px-4 text-sm font-black text-on-primary transition hover:brightness-110"
                      >
                        <CircleDollarSign size={17} />
                        Pagar {formatMoney(Number(topupAmount))}
                      </button>
                    ) : (
                      <p className="mt-3 text-center text-xs text-neutral-500">
                        El enlace de pago para este valor aún no está configurado.
                      </p>
                    )
                  )}
                </div>
                <label className="mt-3 block text-xs font-semibold text-neutral-300">
                  Comprobante (imagen o PDF, máximo 5 MB)
                  <input
                    required
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(event) =>
                      setTopupProof(event.target.files?.[0] || null)
                    }
                    className="mt-2 block w-full text-xs text-neutral-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy || summary?.has_pending_topup}
                  className="mt-4 w-full rounded-xl bg-primary-container px-4 py-3 text-sm font-black text-on-primary transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Enviando..." : "Enviar comprobante"}
                </button>
              </form>
              </div>
              <section className="rounded-2xl border border-white/[0.08] bg-neutral-900/50 p-5">
              <div className="mb-4 flex items-center gap-2">
                <Activity size={18} className="text-primary-container" />
                <h2 className="font-black">Movimientos recientes</h2>
              </div>
              {ledger.length === 0 ? (
                <p className="py-10 text-center text-sm text-neutral-500">
                  Aún no tienes movimientos en tu saldo.
                </p>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {ledger.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-neutral-200">
                          {entry.description || entry.entry_type}
                        </p>
                        <p className="mt-1 text-[11px] text-neutral-500">
                          {formatDate(entry.created_at)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-sm font-black ${
                          Number(entry.amount) >= 0
                            ? "text-primary-container"
                            : "text-rose-300"
                        }`}
                      >
                        {Number(entry.amount) > 0 ? "+" : ""}
                        {formatMoney(entry.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              </section>
              {topups.length > 0 && (
                <section className="rounded-2xl border border-white/[0.08] bg-neutral-900/50 p-5 lg:col-span-2">
                <h2 className="mb-3 font-black">Solicitudes de recarga</h2>
                <div className="divide-y divide-white/[0.06]">
                  {topups.map((topup) => (
                    <div
                      key={topup.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div>
                        <p className="text-sm font-bold">
                          {formatMoney(topup.amount)}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          {formatDate(topup.created_at)}
                        </p>
                      </div>
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-neutral-300">
                        {topup.status === "pending"
                          ? "Pendiente"
                          : topup.status === "approved"
                            ? "Aprobada"
                            : "Rechazada"}
                      </span>
                    </div>
                  ))}
                </div>
                </section>
              )}
          </div>
        )}

        {section === "profile" && (
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <section className="rounded-2xl border border-white/[0.08] bg-neutral-900/60 p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-violet-300/20 bg-violet-400/10 text-violet-200">
                  {profilePhotoUrl ? (
                    <img
                      src={profilePhotoUrl}
                      alt={`Foto de ${displayName}`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={() => {
                        setProfilePhotoUrl("");
                        setProfilePhotoError(
                          "No se pudo mostrar la foto del perfil.",
                        );
                      }}
                      className="h-full w-full object-cover object-top"
                    />
                  ) : (
                    <UserRound size={24} aria-hidden="true" />
                  )}
                </div>
                <div>
                  <h2 className="font-black">Información de la cuenta</h2>
                  <p className="mt-1 text-xs text-neutral-500">
                    Datos de acceso a Gloto
                  </p>
                </div>
              </div>
              {profilePhotoError && (
                <p role="alert" className="mt-3 text-[10px] text-amber-200">
                  {profilePhotoError}
                </p>
              )}
              <ProfileRow label="Nombre completo" value={displayName} />
              <ProfileRow label="Correo de inicio de sesión" value={user?.email} />
              <form
                onSubmit={saveCourierPhone}
                className="border-b border-white/[0.07] py-3"
              >
                <label className="block text-xs font-semibold text-neutral-300">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    Teléfono
                  </span>
                  <input
                    required
                    minLength={7}
                    maxLength={30}
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-violet-400/50"
                    placeholder="300 000 0000"
                  />
                </label>
                <button
                  type="submit"
                  disabled={savingPhone}
                  className="mt-3 rounded-xl bg-violet-500 px-4 py-2.5 text-xs font-black text-white transition hover:bg-violet-400 disabled:cursor-wait disabled:opacity-50"
                >
                  {savingPhone ? "Guardando..." : "Guardar teléfono"}
                </button>
              </form>
              {savedCourierCedula ? (
                <ProfileRow label="Cédula" value={savedCourierCedula} />
              ) : (
                <form
                  onSubmit={saveCourierCedula}
                  className="border-b border-white/[0.07] py-3"
                >
                  <label className="block text-xs font-semibold text-neutral-300">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                      Número de cédula
                    </span>
                    <input
                      required
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={15}
                      value={courierCedula}
                      onChange={(event) =>
                        setCourierCedula(event.target.value.replace(/\D/g, ""))
                      }
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-violet-400/50"
                      placeholder="Solo números"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={savingCedula}
                    className="mt-3 rounded-xl bg-violet-500 px-4 py-2.5 text-xs font-black text-white transition hover:bg-violet-400 disabled:cursor-wait disabled:opacity-50"
                  >
                    {savingCedula ? "Guardando..." : "Guardar cédula"}
                  </button>
                </form>
              )}
              <ProfileRow
                label="Modo privado"
                value={
                  canUsePrivate
                    ? summary?.private_business_name || "Tienda vinculada"
                    : "Sin tienda vinculada"
                }
              />
              {summary?.private_business_id && (
                <div className="mt-4 border-t border-white/[0.07] pt-4">
                  <p className="text-xs leading-5 text-neutral-400">
                    Puedes dejar de recibir pedidos de esta tienda cuando quieras.
                    Tu cuenta pública de Gloto seguirá activa.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage("");
                      setUnlinkStoreOpen(true);
                    }}
                    className="mt-3 rounded-xl border border-rose-400/25 px-4 py-2.5 text-xs font-black text-rose-200 transition hover:bg-rose-400/10"
                  >
                    Desvincularme de la tienda
                  </button>
                </div>
              )}
            </section>
            <section className="rounded-2xl border border-white/[0.08] bg-neutral-900/60 p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-200">
                  <Bike size={20} />
                </span>
                <div>
                  <h2 className="font-black">Red pública</h2>
                  <p className="mt-1 text-xs text-neutral-500">
                    Tu acceso independiente a Gloto
                  </p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between border-b border-white/[0.07] py-3">
                <span className="text-sm text-neutral-400">Estado</span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold text-neutral-200">
                  {applicationStatus[summary?.application_status] ||
                    "Sin solicitud"}
                </span>
              </div>
              <div className="mt-4 flex gap-3 rounded-xl border border-violet-400/15 bg-violet-400/[0.06] p-3 text-xs leading-5 text-neutral-300">
                <Info size={17} className="mt-0.5 shrink-0 text-violet-200" />
                Quitar el acceso a una tienda no elimina tu cuenta de Gloto ni
                tu solicitud para trabajar en la red pública.
              </div>
              {summary?.application_status === "approved" && (
                <div className="mt-4 flex items-center justify-between rounded-xl bg-black/20 p-3">
                  <span className="text-xs text-neutral-400">
                    Saldo público disponible
                  </span>
                  <span className="text-sm font-black text-emerald-300">
                    {formatMoney(balance)}
                  </span>
                </div>
              )}
            </section>
            <section className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.04] p-6 lg:col-span-2">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-black text-rose-100">Eliminar mi cuenta</h2>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-400">
                    Se cerrará tu acceso a Gloto y dejarás de recibir pedidos
                    públicos o de tiendas. Las tiendas pueden conservar su
                    información operativa e historial.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteAccountConfirmation("");
                    setErrorMessage("");
                    setDeleteAccountOpen(true);
                  }}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-rose-400/30 px-4 py-2.5 text-xs font-black text-rose-200 transition hover:bg-rose-400/10"
                >
                  <Trash2 size={15} />
                  Eliminar cuenta
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
      )}
      </>
      )}

      {unlinkStoreOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="unlink-courier-store-title"
            className="w-full max-w-md space-y-4 rounded-2xl border border-rose-400/20 bg-neutral-900 p-5 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-400/10 text-rose-300">
                <Store size={18} />
              </span>
              <div>
                <h2
                  id="unlink-courier-store-title"
                  className="text-lg font-black text-white"
                >
                  ¿Desvincularte de esta tienda?
                </h2>
                <p className="mt-2 text-xs leading-5 text-neutral-400">
                  Dejarás de recibir sus pedidos privados. Tu cuenta pública y
                  tu historial seguirán activos. No podrás desvincularte mientras
                  tengas una entrega en curso.
                </p>
              </div>
            </div>
            {errorMessage && (
              <p role="alert" className="text-xs leading-5 text-rose-300">
                {errorMessage}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setUnlinkStoreOpen(false);
                  setErrorMessage("");
                }}
                disabled={unlinkingStore}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-bold text-neutral-300 transition hover:bg-white/5 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={unlinkMyStore}
                disabled={unlinkingStore}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-rose-500 disabled:cursor-wait disabled:opacity-50"
              >
                {unlinkingStore && (
                  <LoaderCircle size={14} className="animate-spin" />
                )}
                {unlinkingStore ? "Desvinculando..." : "Sí, desvincularme"}
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteAccountOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-courier-account-title"
            onSubmit={deleteCourierAccount}
            className="w-full max-w-md space-y-4 rounded-2xl border border-rose-400/20 bg-neutral-900 p-5 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-400/10 text-rose-300">
                <Trash2 size={18} />
              </span>
              <div>
                <h2
                  id="delete-courier-account-title"
                  className="text-lg font-black text-white"
                >
                  ¿Eliminar tu cuenta?
                </h2>
                <p className="mt-2 text-xs leading-5 text-neutral-400">
                  Esta acción es permanente. Tus vínculos con tiendas y tu
                  acceso a pedidos públicos dejarán de estar activos. Se
                  eliminarán tus solicitudes públicas y sus documentos. Las
                  tiendas pueden conservar su información operativa e historial.
                  No podrás eliminar la cuenta mientras tengas una entrega en
                  curso.
                </p>
              </div>
            </div>
            <label className="block space-y-1.5 text-xs font-semibold text-neutral-300">
              Escribe ELIMINAR para confirmar
              <input
                required
                autoComplete="off"
                value={deleteAccountConfirmation}
                onChange={(event) =>
                  setDeleteAccountConfirmation(event.target.value)
                }
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none focus:border-rose-400"
              />
            </label>
            {errorMessage && (
              <p role="alert" className="text-xs leading-5 text-rose-300">
                {errorMessage}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteAccountOpen(false);
                  setErrorMessage("");
                }}
                disabled={deletingAccount}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-bold text-neutral-300 transition hover:bg-white/5 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  deletingAccount || deleteAccountConfirmation !== "ELIMINAR"
                }
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingAccount && (
                  <LoaderCircle size={14} className="animate-spin" />
                )}
                {deletingAccount ? "Eliminando..." : "Eliminar definitivamente"}
              </button>
            </div>
          </form>
        </div>
      )}

      {activityOpen && (
        <CourierActivityModal
          stats={activityStats}
          todayStats={walletTodayStats}
          balance={balance}
          deductions={dailyWalletDeductions}
          loading={activityLoading}
          error={activityError}
          valuesVisible={activityValuesVisible}
          onToggleValues={() =>
            setActivityValuesVisible((visible) => !visible)
          }
          onClose={() => setActivityOpen(false)}
        />
      )}
      {verificationPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="courier-code-title"
            onSubmit={(event) => {
              event.preventDefault();
              void submitVerificationCode(verificationCode);
            }}
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-5 shadow-2xl"
          >
            <h2
              id="courier-code-title"
              className="text-lg font-black text-white"
            >
              {verificationPrompt.status === "picked_up"
                ? "Confirmar recogida"
                : "Confirmar entrega"}
            </h2>
            <p className="mt-2 text-sm text-neutral-400">
              {verificationPrompt.status === "picked_up"
                ? "Pide el código de 4 dígitos al personal de la tienda."
                : "Pide el código de 4 dígitos al cliente."}
            </p>
            <p
              id="courier-verification-code-label"
              className="mt-4 block text-xs font-bold text-neutral-300"
            >
              Código de verificación (4 dígitos)
            </p>
            <div
              role="group"
              aria-labelledby="courier-verification-code-label"
              aria-describedby={
                errorMessage ? "courier-verification-error" : undefined
              }
              className="mt-2 grid grid-cols-4 gap-3"
            >
              {verificationCode.map((digit, index) => (
                <input
                  key={index}
                  ref={(element) => {
                    verificationCodeInputRefs.current[index] = element;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  pattern="[0-9]*"
                  maxLength={index === 0 ? 4 : 1}
                  disabled={
                    activeOrderId === verificationPrompt.order.order_id
                  }
                  value={digit}
                  onChange={(event) => {
                    const enteredDigits = event.target.value
                      .replace(/\D/g, "")
                      .slice(0, 4);
                    if (!enteredDigits) {
                      setVerificationCode((current) =>
                        current.map((currentDigit, currentIndex) =>
                          currentIndex === index ? "" : currentDigit,
                        ),
                      );
                    } else if (enteredDigits.length > 1) {
                      const nextCode = Array.from(
                        { length: 4 },
                        (_, digitIndex) => enteredDigits[digitIndex] || "",
                      );
                      setVerificationCode(nextCode);
                      void submitVerificationCode(nextCode);
                      verificationCodeInputRefs.current[
                        Math.min(enteredDigits.length, 3)
                      ]?.focus();
                    } else {
                      const nextCode = verificationCode.map(
                        (currentDigit, currentIndex) =>
                          currentIndex === index
                            ? enteredDigits
                            : currentDigit,
                      );
                      setVerificationCode(nextCode);
                      void submitVerificationCode(nextCode);
                      if (index < 3) {
                        verificationCodeInputRefs.current[index + 1]?.focus();
                      }
                    }
                    setErrorMessage("");
                  }}
                  onPaste={(event) => {
                    const pastedDigits = event.clipboardData
                      .getData("text")
                      .replace(/\D/g, "")
                      .slice(0, 4);
                    if (!pastedDigits) return;
                    event.preventDefault();
                    const nextCode = Array.from(
                      { length: 4 },
                      (_, digitIndex) => pastedDigits[digitIndex] || "",
                    );
                    setVerificationCode(nextCode);
                    void submitVerificationCode(nextCode);
                    verificationCodeInputRefs.current[
                      Math.min(pastedDigits.length, 3)
                    ]?.focus();
                    setErrorMessage("");
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Backspace" &&
                      !digit &&
                      index > 0
                    ) {
                      event.preventDefault();
                      setVerificationCode((current) =>
                        current.map((currentDigit, currentIndex) =>
                          currentIndex === index - 1 ? "" : currentDigit,
                        ),
                      );
                      verificationCodeInputRefs.current[index - 1]?.focus();
                    } else if (
                      event.key === "ArrowLeft" &&
                      index > 0
                    ) {
                      verificationCodeInputRefs.current[index - 1]?.focus();
                    } else if (
                      event.key === "ArrowRight" &&
                      index < 3
                    ) {
                      verificationCodeInputRefs.current[index + 1]?.focus();
                    }
                  }}
                  autoFocus={index === 0}
                  aria-label={`Dígito ${index + 1} de 4`}
                  className="h-14 min-w-0 w-full rounded-xl border border-white/10 bg-black/30 text-center font-mono text-3xl font-black text-white outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/20"
                />
              ))}
            </div>
            {errorMessage && (
              <p
                id="courier-verification-error"
                role="alert"
                className="mt-3 rounded-lg border border-rose-300/20 bg-rose-300/[0.08] px-3 py-2 text-sm text-rose-200"
              >
                {errorMessage}
              </p>
            )}
            <div className="mt-5 space-y-3">
              <p
                role="status"
                aria-live="polite"
                className="flex min-h-5 items-center justify-center gap-2 text-center text-xs text-neutral-400"
              >
                {activeOrderId === verificationPrompt.order.order_id ? (
                  <>
                    <LoaderCircle
                      size={14}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                    Validando código...
                  </>
                ) : (
                  "El código se valida al completar los 4 dígitos."
                )}
              </p>
              <button
                type="button"
                onClick={() => {
                  setVerificationPrompt(null);
                  setVerificationCode(["", "", "", ""]);
                  verificationSubmissionRef.current = false;
                  setErrorMessage("");
                  setSwipeResetRequest((current) => current + 1);
                }}
                disabled={activeOrderId === verificationPrompt.order.order_id}
                className="min-h-11 w-full rounded-xl border border-white/10 px-4 text-sm font-bold text-neutral-300 transition hover:bg-white/[0.06] disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
};

const StatCard = ({ icon: Icon, label, value, color }) => (
  <div className="flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-neutral-900/50 p-4">
    <span
      className={`flex h-11 w-11 items-center justify-center rounded-xl ${
        color === "emerald"
          ? "bg-emerald-400/10 text-emerald-300"
          : "bg-violet-400/10 text-violet-300"
      }`}
    >
      <Icon size={20} />
    </span>
    <div>
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  </div>
);

const WalletTodayStat = ({ icon: Icon, label, value, accent }) => {
  const accentClasses = {
    emerald: "bg-emerald-400/10 text-emerald-300",
    blue: "bg-sky-400/10 text-sky-300",
    violet: "bg-violet-400/10 text-violet-300",
    amber: "bg-amber-400/10 text-amber-300",
    rose: "bg-rose-400/10 text-rose-300",
  };
  return (
    <div className="min-w-0 rounded-2xl border border-white/[0.07] bg-black/20 p-3">
      <span
        className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${accentClasses[accent]}`}
      >
        <Icon size={17} />
      </span>
      <p className="text-[11px] font-semibold text-neutral-500">{label}</p>
      <p className="mt-1 truncate text-base font-black text-white">{value}</p>
    </div>
  );
};

const CourierActivityModal = ({
  stats,
  todayStats,
  balance,
  deductions,
  loading,
  error,
  valuesVisible,
  onToggleValues,
  onClose,
}) => {
  const concealedValue = "••••••";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="courier-activity-title"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-neutral-950 p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">
              {stats.isCurrent ? "Jornada en curso" : "Resumen de jornada"}
            </p>
            <h2
              id="courier-activity-title"
              className="mt-1 text-xl font-black text-white"
            >
              Resumen de hoy
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleValues}
              aria-label={
                valuesVisible ? "Ocultar valores" : "Mostrar valores"
              }
              aria-pressed={valuesVisible}
              className="rounded-lg p-2 text-neutral-400 transition hover:bg-white/[0.08] hover:text-white"
            >
              {valuesVisible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar resumen de actividad"
              className="rounded-lg p-2 text-neutral-400 transition hover:bg-white/[0.08] hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <WalletTodayStat
            icon={CircleDollarSign}
            label="Ganado hoy"
            value={
              valuesVisible
                ? formatMoney(todayStats.earned)
                : concealedValue
            }
            accent="emerald"
          />
          <WalletTodayStat
            icon={Route}
            label="Km de domicilio: tienda a cliente"
            value={
              valuesVisible
                ? `${todayStats.kilometers.toFixed(1)} km`
                : concealedValue
            }
            accent="blue"
          />
          <WalletTodayStat
            icon={Store}
            label="Pedidos de tienda"
            value={valuesVisible ? todayStats.privateOrders : concealedValue}
            accent="violet"
          />
          <WalletTodayStat
            icon={Globe2}
            label="Pedidos públicos"
            value={valuesVisible ? todayStats.publicOrders : concealedValue}
            accent="amber"
          />
          <WalletTodayStat
            icon={Wallet}
            label="Saldo disponible"
            value={
              valuesVisible
                ? loading
                  ? (
                    <span
                      role="status"
                      aria-label="Cargando saldo disponible"
                      className="flex h-6 items-center"
                    >
                      <LoaderCircle
                        size={18}
                        className="animate-spin text-sky-300"
                      />
                    </span>
                  )
                  : formatMoney(balance)
                : concealedValue
            }
            accent="blue"
          />
          <WalletTodayStat
            icon={CircleDollarSign}
            label="Descontado hoy"
            value={
              valuesVisible
                ? loading
                  ? (
                    <span
                      role="status"
                      aria-label="Cargando descuentos del día"
                      className="flex h-6 items-center"
                    >
                      <LoaderCircle
                        size={18}
                        className="animate-spin text-rose-300"
                      />
                    </span>
                  )
                  : formatMoney(deductions)
                : concealedValue
            }
            accent="rose"
          />
        </div>
        {error && (
          <p role="alert" className="mt-3 text-xs text-rose-200">
            No se pudo actualizar el resumen de hoy: {error}
          </p>
        )}
      </section>
    </div>
  );
};

const LoadingCard = ({ label }) => (
  <div className="rounded-2xl border border-white/[0.07] bg-neutral-900/50 px-5 py-16 text-center text-sm text-neutral-400">
    <LoaderCircle className="mx-auto mb-3 animate-spin text-violet-300" size={24} />
    {label}
  </div>
);

const EmptyState = ({ icon: Icon, title, description }) => (
  <div className="rounded-2xl border border-dashed border-white/10 bg-neutral-900/30 px-5 py-16 text-center">
    <Icon className="mx-auto text-neutral-600" size={36} />
    <h2 className="mt-4 text-lg font-bold">{title}</h2>
    <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-neutral-500">
      {description}
    </p>
  </div>
);

const ProfileRow = ({ label, value }) => (
  <div className="border-b border-white/[0.07] py-3 last:border-0">
    <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
      {label}
    </p>
    <p className="mt-1 break-all text-sm font-semibold text-neutral-200">
      {value || "No disponible"}
    </p>
  </div>
);

const OrderCard = ({
  order,
  mode,
  location,
  busy,
  canClaim = true,
  isSelected = false,
  compact = false,
  onClaim,
  onUpdateStatus,
}) => {
  const suppliedMapUrl = String(order.linkmaps || "").trim();
  const mapUrl = /^https?:\/\//i.test(suppliedMapUrl)
    ? suppliedMapUrl
    : order.delivery_address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.delivery_address)}`
      : "";
  const isPublicOffer =
    (order.courier_mode || mode) === "public" &&
    order.delivery_status === "available";
  const isPublicOrder = (order.courier_mode || mode) === "public";
  const orderDistance = getOrderDistanceKm(order, location);
  const orderAccent = {
    border: isSelected
      ? "border-primary-container/50"
      : "border-primary-container/25",
    background: isSelected
      ? "bg-primary-container/[0.07]"
      : "bg-primary-container/[0.035]",
    label: "text-white",
    badge: "bg-primary-container/15 text-white",
    action: "bg-primary-container text-on-primary hover:brightness-110",
  };

  if (compact) {
    return (
      <article
        id={`courier-order-${order.order_id}`}
        className={`overflow-hidden rounded-xl border ${orderAccent.border} ${orderAccent.background} transition`}
      >
        <div className="flex items-start gap-3 p-3">
          <CourierBusinessLogo
            src={order.business_logo_url}
            name={order.business_name}
            className="h-10 w-10"
          />
          <div className="min-w-0 flex-1">
            <p className={`truncate text-[11px] font-semibold ${orderAccent.label}`}>
              <span
                className={`mr-1.5 inline-flex rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${orderAccent.badge}`}
              >
                {isPublicOrder ? "Público" : "Tienda"}
              </span>
              {order.business_name || (isPublicOrder ? "Red Gloto" : "Tienda")}
            </p>
            {isPublicOrder ? (
              <div className="mt-1 space-y-1.5">
                <div className="flex min-w-0 items-start gap-2">
                  <CourierPointBadge point="B" />
                  <p className="line-clamp-2 min-w-0 text-sm font-bold leading-5 text-white">
                    {order.delivery_address || "Dirección no disponible"}
                  </p>
                </div>
                <div className="flex min-w-0 items-start gap-2">
                  <CourierPointBadge point="A" />
                  <p className="line-clamp-1 min-w-0 text-[10px] text-neutral-400">
                    {order.pickup_address || "Dirección no disponible"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-sm font-bold leading-5 text-white">
                {order.delivery_address || "Dirección de entrega no disponible"}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">
              Domicilio
            </p>
            <p className="mt-1 text-sm font-black text-white">
              {formatMoney(order.delivery_fee)}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] px-3 py-2.5">
          {orderDistance != null && (
            <p className="text-lg font-black leading-none text-white">
              {orderDistance.toFixed(1)}{" "}
              <span className="text-xs font-bold text-neutral-400">km</span>
            </p>
          )}
          {order.delivery_status === "available" && (
            <button
              type="button"
              onClick={() => onClaim(order)}
              disabled={busy || !canClaim}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${orderAccent.action}`}
            >
              {busy ? "Tomando..." : canClaim ? "Aceptar" : "Ya tienes una entrega"}
            </button>
          )}
          {order.delivery_status === "assigned" && (
            <button
              type="button"
              onClick={() => onUpdateStatus(order, "picked_up")}
              disabled={busy}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${orderAccent.action}`}
            >
              {busy ? "Actualizando..." : "Recogí el pedido"}
            </button>
          )}
          {order.delivery_status === "picked_up" && (
            <button
              type="button"
              onClick={() => onUpdateStatus(order, "delivered")}
              disabled={busy}
              className="rounded-lg bg-primary-container px-3 py-2 text-xs font-bold text-on-primary transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Actualizando..." : "Entregado"}
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <article
      id={`courier-order-${order.order_id}`}
      className={`overflow-hidden rounded-2xl border bg-neutral-900/60 transition ${
        isSelected
          ? "border-amber-300/60 ring-1 ring-amber-300/30"
          : "border-white/[0.08]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.07] p-5 sm:p-6">
        <div>
          <p className="text-xs font-bold text-neutral-400">
            {order.business_name || "Tu tienda"}
          </p>
          <h2 className="mt-1 text-lg font-black">
            Pedido de {order.customer_name || "Cliente"}
          </h2>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-neutral-500">
            <Clock3 size={13} />
            {formatDate(order.created_at)}
          </p>
        </div>
        <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-violet-200">
          {statusLabel[order.delivery_status] || order.delivery_status}
        </span>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
        {isPublicOffer && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] p-3 text-xs leading-5 text-amber-100 sm:col-span-2">
            <Info size={15} className="mt-0.5 shrink-0" />
            El contacto estará disponible al aceptar.
          </p>
        )}
        {isPublicOrder && (
          <div className="flex items-start gap-3 sm:col-span-2">
            {isPublicOrder ? (
              <CourierPointBadge point="A" />
            ) : (
              <MapPin size={17} className="mt-0.5 shrink-0 text-amber-300" />
            )}
            <div>
              <p className="mt-1 text-sm text-neutral-200">
                {order.pickup_address || "Dirección no disponible"}
              </p>
            </div>
          </div>
        )}
        {(isPublicOrder || order.delivery_address) && (
          <div className="flex items-start gap-3 sm:col-span-2">
            {isPublicOrder ? (
              <CourierPointBadge point="B" />
            ) : (
              <MapPin size={17} className="mt-0.5 shrink-0 text-violet-300" />
            )}
            <div>
              {!isPublicOrder && (
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  Dirección de entrega
                </p>
              )}
              <p className="mt-1 text-sm text-neutral-200">
                {order.delivery_address || "Dirección no disponible"}
              </p>
              {!isPublicOffer && order.delivery_instructions && (
                <p className="mt-1 text-xs text-neutral-500">
                  Referencia: {order.delivery_instructions}
                </p>
              )}
            </div>
          </div>
        )}
        {!isPublicOffer && order.customer_phone && (
          <a
            href={`tel:${order.customer_phone}`}
            className="flex items-center gap-2 text-sm text-violet-200 hover:text-violet-100"
          >
            <Phone size={16} />
            {order.customer_phone}
          </a>
        )}
        {orderDistance != null && (
            <p className="text-xs text-neutral-400">
              {orderDistance.toFixed(1)} km
            </p>
          )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.07] bg-black/10 px-5 py-4 sm:px-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            {(order.courier_mode || mode) === "public"
              ? "Pago de entrega pública"
              : "Domicilio de tienda"}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-black text-emerald-300">
            <CircleDollarSign size={16} />
            {formatMoney(order.delivery_fee)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mapUrl && (
            <a
              href={mapUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold text-neutral-200 transition hover:bg-white/5"
            >
              Ver ubicación
            </a>
          )}
          {order.delivery_status === "available" && (
            <button
              type="button"
              onClick={() => onClaim(order)}
              disabled={busy || !canClaim}
              className="rounded-xl bg-violet-500 px-4 py-2.5 text-xs font-black transition hover:bg-violet-400 disabled:opacity-50"
            >
              {busy ? "Tomando..." : canClaim ? "Tomar pedido" : "Ya tienes una entrega"}
            </button>
          )}
          {order.delivery_status === "assigned" && (
            <button
              type="button"
              onClick={() => onUpdateStatus(order, "picked_up")}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-xs font-black transition hover:bg-violet-400 disabled:opacity-50"
            >
              <Bike size={14} />
              {busy ? "Actualizando..." : "Marcar recogido"}
            </button>
          )}
          {order.delivery_status === "picked_up" && (
            <button
              type="button"
              onClick={() => onUpdateStatus(order, "delivered")}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              <Check size={14} />
              {busy ? "Actualizando..." : "Marcar entregado"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
};

const CourierBusinessLogo = ({ src, name, className = "h-10 w-10" }) => {
  const [failedSource, setFailedSource] = useState(null);

  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.06] ${className}`}>
      {src && failedSource !== src ? (
        <img
          src={src}
          alt={`Logo de ${name || "la tienda"}`}
          className="h-full w-full object-cover"
          onError={() => setFailedSource(src)}
        />
      ) : (
        <PackageCheck size={17} className="text-neutral-300" aria-hidden="true" />
      )}
    </span>
  );
};

const CourierPointBadge = ({ point }) => (
  <span
    aria-label={point === "A" ? "Tienda" : "Usuario"}
    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] font-black ${
      point === "A"
        ? "border-neutral-400/30 bg-white/[0.06] text-neutral-300"
        : "border-primary-container/50 bg-primary-container/20 text-violet-200"
    }`}
  >
    {point}
  </span>
);

const SwipeToConfirm = ({ label, busy, onConfirm, onReset }) => {
  const trackRef = useRef(null);
  const activePointerIdRef = useRef(null);
  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const updateProgress = (nextProgress) => {
    const boundedProgress = Math.max(0, Math.min(1, nextProgress));
    progressRef.current = boundedProgress;
    setProgress(boundedProgress);
  };

  const getProgressFromPointer = (clientX) => {
    const track = trackRef.current;
    if (!track) return 0;
    const thumbWidth = 40;
    const availableWidth = Math.max(1, track.clientWidth - thumbWidth);
    const offset = clientX - track.getBoundingClientRect().left - thumbWidth / 2;
    return Math.max(0, Math.min(1, offset / availableWidth));
  };

  const handlePointerDown = (event) => {
    if (busy || submitted) return;
    event.preventDefault();
    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateProgress(getProgressFromPointer(event.clientX));
  };

  const handlePointerMove = (event) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    updateProgress(getProgressFromPointer(event.clientX));
  };

  const handlePointerUp = (event) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    activePointerIdRef.current = null;
    const finalProgress = getProgressFromPointer(event.clientX);
    if (finalProgress >= 0.9) {
      updateProgress(1);
      setSubmitted(true);
      onConfirm();
    } else {
      updateProgress(0);
    }
  };

  const handleKeyDown = (event) => {
    if (busy || submitted) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      updateProgress(progressRef.current + 0.2);
    } else if (event.key === "ArrowLeft" || event.key === "Home") {
      event.preventDefault();
      updateProgress(0);
    } else if (event.key === "End") {
      event.preventDefault();
      updateProgress(1);
    } else if (event.key === "Enter" && progressRef.current >= 1) {
      event.preventDefault();
      setSubmitted(true);
      onConfirm();
    }
  };

  useEffect(() => {
    if (!onReset) return;
    progressRef.current = 0;
    setProgress(0);
    setSubmitted(false);
  }, [onReset]);

  const isPending = busy || submitted;

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label={`Desliza para ${label.toLowerCase()}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-valuetext={isPending ? "Confirmando" : label}
      tabIndex={isPending ? -1 : 0}
      onKeyDown={handleKeyDown}
      className={`relative flex min-h-11 flex-1 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.06] px-12 text-center text-sm font-black text-white ${
        isPending ? "cursor-wait" : "cursor-grab"
      }`}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-primary-container/50 transition-[width] duration-100"
        style={{ width: `${progress * 100}%` }}
      />
      <span className="relative z-10 truncate">
        {busy
          ? "Actualizando..."
          : submitted
            ? "Confirma con el código..."
            : label}
      </span>
      <span
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={(event) => {
          if (activePointerIdRef.current !== event.pointerId) return;
          activePointerIdRef.current = null;
          if (!submitted) updateProgress(0);
        }}
        className={`absolute inset-y-1 left-0 z-20 flex w-10 items-center justify-center rounded-full bg-primary-container text-on-primary shadow-lg ${
          isPending ? "cursor-wait" : "cursor-grab active:cursor-grabbing"
        }`}
        style={{
          left: `${progress * 100}%`,
          transform: `translateX(-${progress * 100}%)`,
          touchAction: "none",
        }}
      >
        {isPending ? (
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          <ChevronRight size={18} aria-hidden="true" />
        )}
      </span>
    </div>
  );
};

const CourierActiveDelivery = ({
  order,
  location,
  busy,
  onUpdateStatus,
  errorMessage,
  swipeResetRequest,
  hotZones,
  hotZoneError,
}) => {
  const [isCardCollapsed, setIsCardCollapsed] = useState(false);
  const [fitRouteRequest, setFitRouteRequest] = useState(0);
  const [swipeErrorResetKey, setSwipeErrorResetKey] = useState(0);
  const isPublic = order.courier_mode === "public";
  const isPickedUp = order.delivery_status === "picked_up";
  const previousErrorRef = useRef(errorMessage);
  useEffect(() => {
    if (errorMessage && errorMessage !== previousErrorRef.current) {
      setSwipeErrorResetKey((current) => current + 1);
    }
    previousErrorRef.current = errorMessage;
  }, [errorMessage]);
  const pickupAddress =
    order.pickup_address || order.business_name || "Ubicación de recogida no registrada";
  const deliveryAddress = order.delivery_address || "Dirección de entrega no disponible";
  const hasPickupCoordinates =
    order.pickup_latitude != null &&
    order.pickup_longitude != null &&
    Number.isFinite(Number(order.pickup_latitude)) &&
    Number.isFinite(Number(order.pickup_longitude));
  const hasDestinationCoordinates =
    order.destination_latitude != null &&
    order.destination_longitude != null &&
    Number.isFinite(Number(order.destination_latitude)) &&
    Number.isFinite(Number(order.destination_longitude));
  const hasCourierCoordinates =
    location?.latitude != null &&
    location?.longitude != null &&
    Number.isFinite(Number(location.latitude)) &&
    Number.isFinite(Number(location.longitude));
  const canCenterRoute =
    hasPickupCoordinates || hasDestinationCoordinates || hasCourierCoordinates;
  const nextStopDistance = getDistanceBetweenPointsKm(
    location,
    isPickedUp
      ? {
          latitude: order.destination_latitude,
          longitude: order.destination_longitude,
        }
      : {
          latitude: order.pickup_latitude,
          longitude: order.pickup_longitude,
        },
  );
  const pickupCoordinates = hasPickupCoordinates
    ? `${order.pickup_latitude},${order.pickup_longitude}`
    : "";
  const destinationCoordinates = hasDestinationCoordinates
    ? `${order.destination_latitude},${order.destination_longitude}`
    : "";
  const stopLocation = isPickedUp
    ? destinationCoordinates || deliveryAddress
    : pickupCoordinates || pickupAddress;
  const stopLocationUrl = stopLocation
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stopLocation)}`
    : "";
  const normalizedPickupWhatsappNumber = normalizeColombianWhatsappNumber(
    order.pickup_phone,
  );
  const pickupWhatsappUrl = normalizedPickupWhatsappNumber
    ? `https://wa.me/${normalizedPickupWhatsappNumber}?text=${encodeURIComponent(
        isPickedUp
          ? `Hola, soy el domiciliario de Gloto. Ya recogí el pedido${order.order_number ? ` #${order.order_number}` : ""} y voy en camino a entregarlo.`
          : "Hola, soy el domiciliario de Gloto. Voy en camino para recoger el pedido.",
      )}`
    : "";
  const normalizedCustomerWhatsappNumber = normalizeColombianWhatsappNumber(
    order.customer_phone,
  );
  const customerWhatsappUrl = normalizedCustomerWhatsappNumber
    ? `https://wa.me/${normalizedCustomerWhatsappNumber}?text=${encodeURIComponent(
        isPickedUp
          ? `Hola${order.customer_name ? ` ${order.customer_name}` : ""}, soy el domiciliario de Gloto. Ya recogí tu pedido${order.order_number ? ` #${order.order_number}` : ""} y voy en camino para entregártelo.`
          : `Hola${order.customer_name ? ` ${order.customer_name}` : ""}, soy el domiciliario de Gloto y te escribo por tu pedido${order.order_number ? ` #${order.order_number}` : ""}.`,
      )}`
    : "";
  const paymentMethod = String(order.payment_method || "No especificado")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

  return (
    <section className="relative h-[100dvh] overflow-hidden bg-[#09090f] text-white">
      <PortalDomiciliarioMap
        fullScreen
        location={location}
        hotZones={hotZones}
        hotZoneError={hotZoneError}
        activeDelivery={order}
        fitRouteRequest={fitRouteRequest}
      />

      <div className="pointer-events-none fixed inset-x-3 bottom-3 z-20 mx-auto max-w-2xl sm:inset-x-6 sm:bottom-5">
        <button
          type="button"
          onClick={() => setFitRouteRequest((request) => request + 1)}
          disabled={!canCenterRoute}
          aria-label="Ver ruta completa en el mapa"
          title="Ver ruta completa en el mapa"
          className="pointer-events-auto absolute -top-14 right-3 grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-neutral-950/95 text-neutral-200 shadow-lg shadow-black/20 backdrop-blur transition hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Route size={26} aria-hidden="true" />
        </button>
        <article className="courier-active-delivery-card pointer-events-auto max-h-[52dvh] overflow-y-auto rounded-2xl border border-white/10 bg-neutral-950/95 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="flex items-center border-b border-white/[0.08]">
          <button
            type="button"
            onClick={() => setIsCardCollapsed((collapsed) => !collapsed)}
            aria-expanded={!isCardCollapsed}
            aria-label={
              isCardCollapsed
                ? "Mostrar detalles del pedido"
                : "Ocultar detalles del pedido"
            }
            className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]"
          >
            <CourierBusinessLogo
              src={order.business_logo_url}
              name={order.business_name}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">
                {order.business_name || (isPublic ? "Pedido público" : "Tienda")}
              </p>
              <p className="text-xs text-neutral-400">
                {isPublic ? "Pedido público" : "Pedido de tienda"}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-white">
                {nextStopDistance == null
                  ? "Distancia no disponible"
                  : `${nextStopDistance < 0.1 ? "<0.1" : nextStopDistance.toFixed(1)} km aprox. hasta ${isPickedUp ? "el cliente" : "la tienda"}`}
              </p>
            </div>
            {isCardCollapsed ? (
              <ChevronUp
                size={19}
                className="ml-1 shrink-0 text-neutral-300"
                aria-hidden="true"
              />
            ) : (
              <ChevronDown
                size={19}
                className="ml-1 shrink-0 text-neutral-300"
                aria-hidden="true"
              />
            )}
          </button>
          {pickupWhatsappUrl && (
            <a
              href={pickupWhatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Escribir a la tienda por WhatsApp"
              title="Escribir a la tienda por WhatsApp"
              className="mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white transition hover:bg-primary-container/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container"
            >
              <MessageCircle size={19} aria-hidden="true" />
            </a>
          )}
          <div className="mr-3 shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              Domicilio
            </p>
            <p className="text-base font-black text-white">
              {formatMoney(order.delivery_fee)}
            </p>
          </div>
        </div>

        {!isCardCollapsed && (
        <div className="space-y-3 px-4 py-3">
          <div className={`flex gap-3 ${isPickedUp ? "opacity-55" : ""}`}>
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary-container text-xs font-black text-on-primary">
              A
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                {isPickedUp ? "Recogido en" : "Recoger en"}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-white">
                {pickupAddress}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary-container text-xs font-black text-on-primary">
              B
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                Entregar a {order.customer_name || "Cliente"}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-white">
                {deliveryAddress}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] pt-3">
            <p className="text-xs text-neutral-400">
              Pago: <span className="font-semibold text-neutral-200">{paymentMethod}</span>
            </p>
            {isPickedUp && customerWhatsappUrl && (
              <a
                href={customerWhatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-container hover:text-white"
              >
                <MessageCircle size={15} aria-hidden="true" />
                Escribir al cliente por WhatsApp
              </a>
            )}
          </div>
          {order.delivery_instructions && (
            <p className="rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-neutral-300">
              Nota: {order.delivery_instructions}
            </p>
          )}
          {errorMessage && (
            <p
              role="alert"
              className="rounded-lg border border-rose-300/20 bg-rose-300/[0.08] px-3 py-2 text-xs text-rose-200"
            >
              {errorMessage}
            </p>
          )}
          <div className="flex gap-2">
            {!isPickedUp && (
              <a
                href={stopLocationUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-white/10 px-3 text-xs font-semibold text-neutral-300 transition hover:bg-white/[0.06] hover:text-white"
              >
                Tienda
              </a>
            )}
            {isPickedUp && stopLocationUrl && (
              <a
                href={stopLocationUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-white/10 px-3 text-xs font-bold text-neutral-200 transition hover:bg-white/[0.06]"
              >
                Ir al cliente
              </a>
            )}
            <SwipeToConfirm
              key={`${order.order_id}:${order.delivery_status}`}
              label={isPickedUp ? "Marcar entregado" : "Recoger pedido"}
              busy={busy}
              onReset={`${swipeResetRequest}:${swipeErrorResetKey}`}
              onConfirm={() =>
                onUpdateStatus(order, isPickedUp ? "delivered" : "picked_up")
              }
            />
          </div>
        </div>
        )}
        </article>
      </div>
    </section>
  );
};

const CourierOfferPreview = ({
  order,
  location,
  onExpire,
  onClaim,
  isBusy,
  canAccept,
  fullSection = false,
}) => {
  const isPublic = order.courier_mode === "public";
  const offerDurationMs = isPublic
    ? PUBLIC_COURIER_OFFER_PREVIEW_MS
    : COURIER_OFFER_PREVIEW_MS;
  const parsedExpiry = Date.parse(order.courier_offer_expires_at || "");
  const deadline = useMemo(
    () =>
      Number.isFinite(parsedExpiry)
        ? parsedExpiry
        : Date.now() + offerDurationMs,
    [offerDurationMs, parsedExpiry],
  );
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, deadline - Date.now()),
  );
  const [isFinishing, setIsFinishing] = useState(false);
  const finishingRef = useRef(false);
  const expireOffer = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setIsFinishing(true);
    const finished = await onExpire(order);
    if (finished === false) {
      finishingRef.current = false;
      setIsFinishing(false);
    }
  }, [onExpire, order]);

  useEffect(() => {
    const updateProgress = () =>
      setRemainingMs(Math.max(0, deadline - Date.now()));
    updateProgress();
    const intervalId = window.setInterval(updateProgress, 100);
    let finishTimeoutId = null;
    const timeoutId = window.setTimeout(
      () => {
        setRemainingMs(0);
        setIsFinishing(true);
        finishTimeoutId = window.setTimeout(expireOffer, 125);
      },
      Math.max(0, deadline - Date.now()),
    );
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
      if (finishTimeoutId !== null) window.clearTimeout(finishTimeoutId);
    };
  }, [deadline, expireOffer]);

  const distance = getOrderDistanceKm(order, location);
  const progress = Math.max(
    0,
    Math.min(1, remainingMs / offerDurationMs),
  );
  const accent = isPublic
    ? {
        border: "border-white/10",
        label: "text-neutral-300",
        badge: "bg-white/[0.06] text-neutral-300",
        action: "bg-primary-container text-white hover:brightness-110",
      }
    : {
        border: "border-violet-300/30",
        label: "text-violet-200",
        badge: "bg-violet-400/15 text-violet-200",
        action: "bg-primary-container text-white hover:brightness-110",
      };

  return (
    <article
      className={
        fullSection
          ? "courier-offer-preview-card w-full overflow-hidden border-t border-white/[0.08] bg-neutral-950/95"
          : `overflow-hidden rounded-2xl border ${accent.border} bg-neutral-950/95 shadow-xl shadow-black/25 backdrop-blur-xl`
      }
    >
      <div aria-hidden="true" className="h-1 bg-white/10">
        <div
          className="h-full origin-left bg-primary-container"
          style={{
            transform: `scaleX(${progress})`,
            transition: "transform 100ms linear",
          }}
        />
      </div>
      {fullSection ? (
        <div className="space-y-3 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center gap-3">
            <CourierBusinessLogo
              src={order.business_logo_url}
              name={order.business_name}
              className="h-11 w-11 sm:h-12 sm:w-12"
            />
            <div className="min-w-0 flex-1">
              <p
                className={`text-[10px] font-bold uppercase tracking-wider ${accent.label}`}
              >
                {isPublic ? "Oferta pública" : "Oferta de tienda"}
              </p>
              <p className="truncate text-base font-bold text-white sm:text-lg">
                {order.business_name || "Entrega cercana"}
              </p>
              <p className="text-xs font-semibold text-neutral-400">
                {distance == null
                  ? "Distancia no disponible"
                  : `${distance.toFixed(1)} km`}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 sm:text-[10px]">
                Domicilio
              </p>
              <p className="text-lg font-black text-violet-300 sm:text-xl">
                {formatMoney(order.delivery_fee)}
              </p>
            </div>
          </div>

          <div className={`grid gap-2 ${isPublic ? "sm:grid-cols-2" : ""}`}>
            <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.035] p-2.5 sm:p-3">
              <div className="flex items-center gap-2">
                <CourierPointBadge point="B" />
                <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                  Dirección de entrega
                </p>
              </div>
              <p className="mt-1.5 text-xs font-semibold leading-4 text-neutral-100 sm:text-sm sm:leading-5">
                {order.delivery_address || "Dirección no disponible"}
              </p>
            </div>
            {isPublic && (
              <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.035] p-2.5 sm:p-3">
                <div className="flex items-center gap-2">
                  <CourierPointBadge point="A" />
                  <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                    Dirección de recogida
                  </p>
                </div>
                <p className="mt-1.5 text-xs font-semibold leading-4 text-neutral-200 sm:text-sm sm:leading-5">
                  {order.pickup_address || "Dirección no disponible"}
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onClaim(order)}
            disabled={isBusy || !canAccept || isFinishing}
            className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-14 sm:text-base ${accent.action}`}
          >
            <Check size={19} strokeWidth={3} aria-hidden="true" />
            {isBusy
              ? "Tomando..."
              : canAccept
                ? "Aceptar"
                : "Entrega en curso"}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 sm:gap-4">
          <CourierBusinessLogo
            src={order.business_logo_url}
            name={order.business_name}
            className="h-12 w-12"
          />
          <div className="min-w-0 flex-1">
            <p className={`truncate text-xs font-semibold ${accent.label}`}>
              <span
                className={`mr-1.5 inline-flex rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${accent.badge}`}
              >
                {isPublic ? "Público" : "Tienda"}
              </span>
              {order.business_name || "Entrega cercana"}
            </p>
            {isPublic ? (
              <div className="mt-1 space-y-1.5">
                <div className="flex min-w-0 items-start gap-2">
                  <CourierPointBadge point="B" />
                  <p className="line-clamp-2 min-w-0 text-sm font-bold leading-5 text-white">
                    {order.delivery_address || "Dirección no disponible"}
                  </p>
                </div>
                <div className="flex min-w-0 items-start gap-2">
                  <CourierPointBadge point="A" />
                  <p className="line-clamp-1 min-w-0 text-[11px] text-neutral-400">
                    {order.pickup_address || "Dirección no disponible"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-white">
                {order.delivery_address || "Dirección de entrega no disponible"}
              </p>
            )}
            <p className="mt-1 text-xs font-semibold text-neutral-200">
              {distance == null
                ? "Distancia no disponible"
                : `${distance.toFixed(1)} km`}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">
              Domicilio
            </p>
            <p className="mt-1 text-sm font-black text-violet-300">
              {formatMoney(order.delivery_fee)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-center">
            <button
              type="button"
              onClick={() => onClaim(order)}
              disabled={isBusy || !canAccept || isFinishing}
              className={`min-h-11 rounded-lg px-4 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${accent.action}`}
            >
              {isBusy
                ? "Tomando..."
                : canAccept
                  ? "Aceptar"
                  : "Entrega en curso"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
};

const CourierMapExperience = ({
  locationStatus,
  menuOpen,
  onToggleMenu,
  online,
  realtimeStatus,
  location,
  publicRadiusKm,
  searchingPublic,
  orders,
  hotZones,
  hotZoneError,
  activeDelivery,
  previewOrderIds,
  storeOrdersExpanded,
  onToggleStoreOrders,
  onFinishOrderPreview,
  activeOrderId,
  errorMessage,
  availabilityBusy,
  onToggleAvailability,
  onClaim,
  onUpdateStatus,
}) => {
  const [recenterRequest, setRecenterRequest] = useState(0);
  const ordersByKey = useMemo(
    () => new Map(orders.map((order) => [getCourierOrderKey(order), order])),
    [orders],
  );
  const accumulatedStoreOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.courier_mode === "private" &&
          order.delivery_status === "available",
      ),
    [orders],
  );
  const previewOrders = useMemo(() => {
    if (activeDelivery || activeOrderId !== null) return [];
    return previewOrderIds
      .map((previewId) => ordersByKey.get(previewId))
      .filter((order) => order?.delivery_status === "available");
  }, [activeDelivery, activeOrderId, ordersByKey, previewOrderIds]);
  const visiblePreviewOrders = useMemo(() => {
    return previewOrders.slice(0, 1);
  }, [previewOrders]);
  const currentOffer = visiblePreviewOrders[0] || null;
  const currentOfferKey = currentOffer
    ? [
        getCourierOrderKey(currentOffer),
        currentOffer.courier_offer_expires_at || currentOffer.courier_mode,
      ].join(":")
    : null;
  const [expiredPreviewKey, setExpiredPreviewKey] = useState(null);

  useEffect(() => {
    if (!currentOffer || !currentOfferKey) return undefined;
    const parsedExpiry = Date.parse(
      currentOffer.courier_offer_expires_at || "",
    );
    const durationMs =
      currentOffer.courier_mode === "public"
        ? PUBLIC_COURIER_OFFER_PREVIEW_MS
        : COURIER_OFFER_PREVIEW_MS;
    const deadline = Number.isFinite(parsedExpiry)
      ? parsedExpiry
      : Date.now() + durationMs;
    const timeoutId = window.setTimeout(
      () => setExpiredPreviewKey(currentOfferKey),
      Math.max(0, deadline - Date.now()),
    );

    return () => window.clearTimeout(timeoutId);
  }, [
    currentOffer?.courier_mode,
    currentOffer?.courier_offer_expires_at,
    currentOfferKey,
  ]);
  const mapPreviewOffer =
    currentOffer && expiredPreviewKey !== currentOfferKey
      ? currentOffer
      : null;

  const mapOrders = useMemo(
    () =>
      activeDelivery
        ? []
        : orders.filter(
            (order) =>
              order.delivery_status === "available" &&
              (order.courier_mode !== "public" ||
                getCourierOrderKey(order) ===
                  (currentOffer
                    ? getCourierOrderKey(currentOffer)
                    : null)),
          ),
    [activeDelivery, currentOffer, orders],
  );

  return (
    <>
      <PortalDomiciliarioMap
        fullScreen
        location={location}
        publicRadiusKm={publicRadiusKm}
        searching={searchingPublic}
        orders={mapOrders}
        hotZones={hotZones}
        hotZoneError={hotZoneError}
        previewOffer={mapPreviewOffer}
        online={online}
        recenterRequest={recenterRequest}
      />

      {errorMessage && (
        <div className="pointer-events-none fixed inset-x-3 top-[68px] z-20 sm:inset-x-6">
          <div
            role="alert"
            className="pointer-events-auto mx-auto max-w-xl rounded-xl border border-rose-300/20 bg-neutral-950/95 px-3 py-2 text-xs text-rose-200 shadow-lg backdrop-blur"
          >
            {errorMessage}
          </div>
        </div>
      )}

      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col items-center"
      >
        {!activeDelivery && (
          <div className="pointer-events-none mb-4 flex w-full max-w-3xl justify-end px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setRecenterRequest((request) => request + 1)}
              disabled={
                !location ||
                location.latitude == null ||
                location.longitude == null
              }
              aria-label="Centrar mapa en mi ubicación"
              title="Centrar mapa en mi ubicación"
              className="pointer-events-auto grid h-11 w-11 place-items-center rounded-2xl border border-primary-container/50 bg-primary-container text-on-primary shadow-lg shadow-primary-container/30 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LocateFixed size={19} strokeWidth={2.4} />
            </button>
          </div>
        )}
        <section
          className="courier-bottom-sheet pointer-events-auto mx-auto w-full max-w-3xl overflow-hidden rounded-t-3xl border border-b-0 border-white/10 bg-neutral-950/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/40 backdrop-blur-xl"
        >
          <div className="mx-auto mb-1 mt-2 h-1 w-10 rounded-full bg-white/20" />
          {online && !activeDelivery && activeOrderId === null && currentOffer ? (
            <CourierOfferPreview
              order={currentOffer}
              location={location}
              onExpire={onFinishOrderPreview}
              onClaim={onClaim}
              isBusy={activeOrderId === currentOffer.order_id}
              canAccept
              fullSection
            />
          ) : (
            <>
              <div className="flex items-center gap-3 px-4 pb-3 pt-2 sm:px-5">
                {!activeDelivery && (
                  <>
                    <button
                      type="button"
                      onClick={onToggleMenu}
                      aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
                      aria-expanded={menuOpen}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-neutral-950/80 text-neutral-200 shadow-lg backdrop-blur-xl transition hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                    >
                      {menuOpen ? <X size={19} /> : <Menu size={19} />}
                    </button>
                    <button
                      type="button"
                      onClick={onToggleAvailability}
                      disabled={online || availabilityBusy || Boolean(activeDelivery)}
                      aria-label={online ? "Buscando pedidos" : "Conectarse"}
                      className={`inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden rounded-2xl border px-5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-default disabled:opacity-80 ${
                        online || availabilityBusy
                          ? "courier-searching-button border-violet-400/20 bg-primary-container/10 text-violet-200"
                          : "border-primary-container bg-primary-container text-white shadow-lg shadow-primary-container/20 hover:brightness-110 active:brightness-95"
                      }`}
                    >
                      <span className="relative z-10 inline-flex items-center justify-center gap-2">
                        {availabilityBusy ? (
                          <LoaderCircle size={16} className="animate-spin" />
                        ) : online ? (
                          <span className="h-2 w-2 rounded-full bg-violet-300" />
                        ) : null}
                        {availabilityBusy
                          ? "Conectando"
                          : online
                            ? "Buscando"
                            : "Conectarse"}
                      </span>
                    </button>
                  </>
                )}
                {activeDelivery && (
                  <p className="flex-1 px-1 text-sm font-semibold text-emerald-200">
                    Pedido en curso
                  </p>
                )}
              </div>
              <span className="sr-only" role="status">
                {locationStatus === "error"
                  ? "Revisa el permiso de ubicación."
                  : locationStatus === "updating"
                    ? "Actualizando ubicación."
                    : locationStatus === "live"
                      ? "Ubicación en vivo."
                      : online
                        ? "Localizando."
                        : "Ubicación pausada."}{" "}
                {online &&
                  (realtimeStatus === "connected"
                    ? "Pedidos en tiempo real conectados."
                    : realtimeStatus === "fallback"
                      ? "Actualización automática activa."
                      : "Conectando pedidos en tiempo real.")}
              </span>

              {activeDelivery ? (
                <div className="max-h-[42dvh] overflow-y-auto border-t border-white/[0.08] p-2.5">
                  <CourierActiveDelivery
                    order={activeDelivery}
                    busy={activeOrderId === activeDelivery.order_id}
                    onUpdateStatus={onUpdateStatus}
                  />
                </div>
              ) : activeOrderId !== null ? (
                <p className="border-t border-white/[0.08] px-4 py-3 text-center text-xs text-neutral-300">
                  Confirmando tu pedido...
                </p>
              ) : null}
            </>
          )}
          {accumulatedStoreOrders.length > 0 && (
            <section className="max-h-[38dvh] overflow-y-auto border-t border-white/[0.08] p-3">
              <button
                type="button"
                aria-expanded={storeOrdersExpanded}
                onClick={onToggleStoreOrders}
                className="mb-2 flex w-full items-center justify-between gap-3 rounded-lg px-1 py-2 text-left"
              >
                <span className="text-sm font-black text-white">
                  Pedidos acumulados de tu tienda
                  <span className="ml-2 rounded-full bg-primary-container/15 px-2.5 py-1 text-[10px] font-bold text-white">
                    {accumulatedStoreOrders.length}
                  </span>
                </span>
                {storeOrdersExpanded ? (
                  <ChevronUp size={18} aria-hidden="true" />
                ) : (
                  <ChevronDown size={18} aria-hidden="true" />
                )}
              </button>
              {storeOrdersExpanded && (
                <div className="space-y-2">
                  {accumulatedStoreOrders.map((order) => (
                    <OrderCard
                      key={order.order_id}
                      order={order}
                      mode="private"
                      location={location}
                      compact
                      busy={activeOrderId === order.order_id}
                      canClaim={!activeDelivery && activeOrderId === null}
                      onClaim={onClaim}
                      onUpdateStatus={onUpdateStatus}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </section>
      </div>
    </>
  );
};

export default PortalDomiciliario;
