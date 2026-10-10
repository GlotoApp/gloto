import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bike,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  Clock3,
  History,
  Info,
  LoaderCircle,
  LocateFixed,
  MapPin,
  MapPinned,
  PackageCheck,
  Phone,
  Power,
  RefreshCw,
  Route,
  ShieldAlert,
  UserRound,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../src/components/AuthContext";
import { supabase } from "../../src/lib/supabaseClient";
import PortalDomiciliarioMap from "./PortalDomiciliarioMap";
import PortalDomiciliarioSidebar from "./PortalDomiciliarioSidebar";

const formatMoney = (amount) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);

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

const getCourierOrderKey = (order) =>
  `${order.courier_mode || "private"}:${order.order_id}`;

const getOrderDistanceKm = (order, location) => {
  const serverDistance = Number(order.distance_km);
  const hasServerDistance =
    order.distance_km != null &&
    order.distance_km !== "" &&
    Number.isFinite(serverDistance);
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
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(latitude - currentLatitude);
  const longitudeDelta = radians(longitude - currentLongitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(currentLatitude)) *
      Math.cos(radians(latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  const [summary, setSummary] = useState(null);
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  const [orders, setOrders] = useState([]);
  const [previewOrderIds, setPreviewOrderIds] = useState([]);
  const [previewedOrderIds, setPreviewedOrderIds] = useState(() => new Set());
  const seenOfferIdsRef = useRef(new Set());
  const offerBaselineReadyRef = useRef(false);
  const [history, setHistory] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [topups, setTopups] = useState([]);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const refreshPromiseRef = useRef(null);
  const refreshAgainRef = useRef(false);
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [sourcePreferences, setSourcePreferences] = useState(null);
  const sourcePreferencesLoadedRef = useRef(false);
  const [mapLocation, setMapLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("paused");
  const [realtimeStatus, setRealtimeStatus] = useState("connecting");
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [fullName, setFullName] = useState(
    user?.user_metadata?.full_name || user?.user_metadata?.name || "",
  );
  const [phone, setPhone] = useState(user?.user_metadata?.phone || "");
  const [topupAmount, setTopupAmount] = useState("");
  const [topupProof, setTopupProof] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [earningsOpen, setEarningsOpen] = useState(false);
  const [dailyEarnings, setDailyEarnings] = useState(null);
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [earningsError, setEarningsError] = useState("");

  const isPublicApproved = summary?.application_status === "approved";
  const isPublicOnline = Boolean(summary?.is_online);
  const isPrivateOnline = Boolean(summary?.private_is_online);
  const isCourierOnline = isPublicOnline || isPrivateOnline;
  const activeDelivery = orders.find((order) =>
    ["assigned", "picked_up"].includes(order.delivery_status),
  ) || null;
  const canUsePrivate = Boolean(summary?.private_business_id);
  const privateSourceEnabled =
    sourcePreferences?.private ?? canUsePrivate;
  const publicSourceEnabled =
    sourcePreferences?.public ?? isPublicApproved;
  const hasEnabledSources =
    (canUsePrivate && privateSourceEnabled) ||
    (isPublicApproved && publicSourceEnabled);
  const balance = Number(summary?.wallet_balance || 0);
  const displayName =
    summary?.full_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    "Domiciliario";

  const updateOrders = useCallback((nextOrders) => {
    setOrders(nextOrders);

    const availableOrders = nextOrders.filter(
      (order) => order.delivery_status === "available",
    );
    const availableIds = new Set(availableOrders.map(getCourierOrderKey));

    if (!isCourierOnline || !offerBaselineReadyRef.current) {
      availableIds.forEach((id) => seenOfferIdsRef.current.add(id));
      setPreviewOrderIds([]);
      setPreviewedOrderIds(availableIds);
      offerBaselineReadyRef.current = isCourierOnline;
      return;
    }

    const newOfferIds = availableOrders
      .map(getCourierOrderKey)
      .filter((id) => !seenOfferIdsRef.current.has(id));
    newOfferIds.forEach((id) => seenOfferIdsRef.current.add(id));

    setPreviewOrderIds((current) => {
      const queued = current.filter((id) => availableIds.has(id));
      const queuedIds = new Set(queued);
      return [...queued, ...newOfferIds.filter((id) => !queuedIds.has(id))];
    });
    setPreviewedOrderIds((current) => {
      const next = new Set(
        [...current].filter((id) => availableIds.has(id)),
      );
      return next;
    });
  }, [isCourierOnline]);

  const finishOrderPreview = useCallback((orderId) => {
    setPreviewOrderIds((current) => current.filter((id) => id !== orderId));
    setPreviewedOrderIds((current) => new Set(current).add(orderId));
  }, []);

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

  const loadSummary = useCallback(async () => {
    const { data, error } = await supabase.rpc(
      "get_public_courier_portal_summary",
    );
    if (error) throw error;
    setSummary(data || null);
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
          private: Boolean(data?.private_business_id),
          public: data?.application_status === "approved",
        },
      );
      sourcePreferencesLoadedRef.current = true;
    }
    setMode(data?.private_business_id ? "private" : "public");
    if (data?.full_name) setFullName(data.full_name);
    if (data?.phone) setPhone(data.phone);
  }, [user?.id]);

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
    const results = await Promise.all(requests);
    const failed = results.find(({ error }) => error);
    if (failed?.error) throw failed.error;
    return {
      data: results.flatMap(({ data, source }) =>
        (data || []).map((order) => ({ ...order, courier_mode: source })),
      ),
      error: null,
    };
  }, [canUsePrivate, isPublicApproved]);

  const loadHistory = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_courier_order_history", {
      p_mode: mode,
    });
    if (error) throw error;
    setHistory(data || []);
  }, [mode]);

  const loadWallet = useCallback(async () => {
    const [ledgerResult, topupsResult] = await Promise.all([
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
    ]);
    if (ledgerResult.error) throw ledgerResult.error;
    if (topupsResult.error) throw topupsResult.error;
    setLedger(ledgerResult.data || []);
    setTopups(topupsResult.data || []);
  }, []);

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
        else await loadWallet();
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

    const intervalId = window.setInterval(refreshOrders, 30000);
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

  const runOrderAction = async (orderId, rpcName, status, successMessage) => {
    setActiveOrderId(orderId);
    setErrorMessage("");
    setNotice("");
    try {
      const { error } = await supabase.rpc(rpcName, {
        p_order_id: orderId,
        ...(status ? { p_status: status } : {}),
      });
      if (error) throw error;
      if (status === "delivered") {
        updateOrders(
          orders.filter(
            (order) =>
              !(
                order.order_id === orderId &&
                order.courier_mode ===
                  (rpcName === "set_public_courier_order_status"
                    ? "public"
                    : "private")
              ),
          ),
        );
      }
      setNotice(successMessage);
      await Promise.all([refreshOrders(), loadSummary()]);
    } catch (error) {
      console.error("No se pudo actualizar el domicilio:", error);
      setErrorMessage(error.message || "No se pudo actualizar el domicilio.");
    } finally {
      setActiveOrderId(null);
    }
  };

  const claimOrder = (order) => {
    if (activeDelivery || activeOrderId) {
      setErrorMessage(
        "Ya tienes un domicilio activo. Complétalo antes de aceptar otro.",
      );
      return;
    }
    return runOrderAction(
      order.order_id,
      order.courier_mode === "public"
        ? "claim_public_courier_order"
        : "claim_domiciliario_order",
      null,
      order.courier_mode === "public"
        ? "Pedido público aceptado. El saldo solo aplica a las entregas públicas."
        : "Pedido de tienda asignado.",
    );
  };

  const updateOrderStatus = (order, status) =>
    runOrderAction(
      order.order_id,
      order.courier_mode === "public"
        ? "set_public_courier_order_status"
        : "set_domiciliario_order_status",
      status,
      status === "picked_up"
        ? "Marcaste el pedido como recogido."
        : "Marcaste el pedido como entregado.",
    );

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
        setMapLocation(null);
        setLocationStatus("paused");
        setRealtimeStatus("offline");
        offerBaselineReadyRef.current = false;
        setPreviewOrderIds([]);
        setNotice("Quedaste desconectado. Tus fuentes elegidas se conservaron.");
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
        setNotice("Estás activo. Recibirás pedidos de tus fuentes elegidas.");
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
        p_full_name: fullName.trim(),
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

  const submitTopup = async (event) => {
    event.preventDefault();
    if (!topupProof) {
      setErrorMessage("Adjunta el comprobante de la recarga.");
      return;
    }
    const amount = Number(topupAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
      setErrorMessage("Ingresa un valor de recarga válido.");
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

  const openEarnings = async () => {
    setEarningsOpen(true);
    setEarningsLoading(true);
    setEarningsError("");
    try {
      const { data, error } = await supabase.rpc("get_courier_daily_earnings");
      if (error) throw error;
      setDailyEarnings(data?.[0] || null);
    } catch (error) {
      console.error("No se pudo cargar el resumen diario del domiciliario:", error);
      setEarningsError(
        error.message || "No se pudo cargar el resumen de hoy.",
      );
    } finally {
      setEarningsLoading(false);
    }
  };

  const signOut = async () => {
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
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate("/domiciliarios/login", { replace: true });
    } catch (error) {
      console.error("No se pudo cerrar la sesión del domiciliario:", error);
      setErrorMessage("No se pudo cerrar la sesión. Intenta de nuevo.");
    }
  };

  const changeSection = (nextSection) => {
    setSection(nextSection);
    setSectionLoading(nextSection === "history" || nextSection === "wallet");
  };

  const selectMapOrder = (orderId) => {
    setSelectedOrderId(orderId);
    window.setTimeout(() => {
      document
        .getElementById(`courier-order-${orderId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
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
          publicOnline={isPublicOnline}
          privateBusinessName={summary?.private_business_name}
          privateEnabled={privateSourceEnabled}
          publicEnabled={publicSourceEnabled}
          locationStatus={locationStatus}
          availabilityBusy={availabilityBusy}
          onToggleAvailability={toggleSourcePreference}
          canUsePrivate={canUsePrivate}
          canUsePublic={isPublicApproved}
          isPublicApproved={isPublicApproved}
          balance={balance}
          onOpenBalance={openEarnings}
          displayName={displayName}
          onSignOut={signOut}
        />
      )}

      {activeDelivery ? (
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
        />
      ) : (
      <>
      {showFullMap && (
        <CourierMapExperience
          mode={mode}
          privateEnabled={privateSourceEnabled}
          publicEnabled={publicSourceEnabled}
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
          orders={orders}
          activeDelivery={activeDelivery}
          previewOrderIds={previewOrderIds}
          previewedOrderIds={previewedOrderIds}
          onFinishOrderPreview={finishOrderPreview}
          activeOrderId={activeOrderId}
          selectedOrderId={selectedOrderId}
          errorMessage={errorMessage}
          availabilityBusy={availabilityBusy}
          onToggleAvailability={toggleAvailability}
          onSelectOrder={selectMapOrder}
          onClaim={claimOrder}
          onUpdateStatus={updateOrderStatus}
        />
      )}

      {!showFullMap && (
      <div className="mx-auto max-w-7xl px-4 pb-12 pt-7 sm:px-6 lg:px-8">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-violet-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {mode === "public"
                ? "Red pública Gloto"
                : summary?.private_business_name || "Tu tienda"}
            </p>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              {section === "orders"
                ? mode === "public"
                  ? "Pedidos cerca de ti"
                  : "Mis domicilios"
                : section === "history"
                  ? "Historial de pedidos"
                  : section === "wallet"
                    ? "Mi saldo"
                    : "Mi perfil"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-400">
              {section === "orders"
                ? mode === "public"
                  ? "Encuentra entregas disponibles dentro de tu zona."
                  : "Gestiona tus entregas asignadas por tu tienda."
                : section === "history"
                  ? "Consulta tus entregas anteriores y su estado."
                  : section === "wallet"
                    ? "Consulta movimientos y solicita una recarga."
                    : "Tus datos de acceso y modos de trabajo."}
            </p>
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
        {notice && (
          <p
            role="status"
            className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200"
          >
            {notice}
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
                  <label className="text-xs font-semibold text-neutral-300">
                    Nombre completo
                    <input
                      required
                      minLength={3}
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-violet-400/50"
                      placeholder="Tu nombre"
                    />
                  </label>
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
                summary?.location_latitude != null &&
                summary?.location_longitude != null
                  ? {
                      latitude: summary.location_latitude,
                      longitude: summary.location_longitude,
                    }
                  : null
              }
              orders={orders}
              online={isPublicOnline}
              onSelectOrder={selectMapOrder}
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
              ) : orders.filter(
                  (order) => order.delivery_status === "available",
                ).length === 0 ? (
                <EmptyState
                  icon={MapPinned}
                  title={
                    orders.length > 0
                      ? "Estás atendiendo una entrega"
                      : "Aún no hay ofertas en tu zona"
                  }
                  description={
                    orders.length > 0
                      ? "Tu pedido activo aparece marcado en el mapa. Puedes desconectarte de nuevas ofertas sin interrumpir esta entrega."
                      : "Te avisaremos aquí cuando haya nuevos pedidos dentro del radio de servicio. Puedes actualizar la búsqueda cuando quieras."
                  }
                />
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-lg font-black">Ofertas cercanas</h2>
                    <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200">
                      {
                        orders.filter(
                          (order) => order.delivery_status === "available",
                        ).length
                      }{" "}
                      disponibles
                    </span>
                  </div>
                  {orders.map((order) => (
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
            orders.length > 0 ? (
              <div className="space-y-4">
                <p className="rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-4 py-3 text-xs text-amber-100">
                  Estás desconectado de nuevas ofertas; aquí siguen tus entregas activas.
                </p>
                {orders.map((order) => (
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
                  value={orders.length}
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
            ) : orders.length === 0 ? (
              <EmptyState
                icon={PackageCheck}
                title={
                  mode === "public"
                    ? "No hay pedidos cerca por ahora"
                    : "No tienes domicilios pendientes"
                }
                description={
                  mode === "public"
                    ? "Mantén tu ubicación actualizada. Te mostraremos aquí las entregas disponibles dentro del radio de servicio."
                    : "Los nuevos pedidos de tu tienda aparecerán aquí cuando estén listos para entregar."
                }
              />
            ) : (
              <div className="grid gap-4">
                {orders.map((order) => (
                  <OrderCard
                    key={order.order_id}
                    order={order}
                    mode={mode}
                    busy={activeOrderId === order.order_id}
                    canClaim={!activeDelivery && activeOrderId === null}
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
          history.length === 0 ? (
            <EmptyState
              icon={History}
              title="Aún no tienes entregas en el historial"
              description="Cuando completes pedidos, podrás consultarlos aquí."
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-neutral-900/50">
              <div className="hidden grid-cols-[1.5fr_1fr_1fr_1fr] gap-4 border-b border-white/[0.07] px-5 py-3 text-[10px] font-black uppercase tracking-wider text-neutral-500 sm:grid">
                <span>Pedido / tienda</span>
                <span>Fecha</span>
                <span>Destino</span>
                <span>Estado</span>
              </div>
              {history.map((order) => (
                <div
                  key={order.order_id}
                  className="grid gap-2 border-b border-white/[0.06] px-5 py-4 last:border-0 sm:grid-cols-[1.5fr_1fr_1fr_1fr] sm:items-center sm:gap-4"
                >
                  <div>
                    <p className="text-sm font-bold">
                      {order.business_name || "Pedido"}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {order.customer_name || "Cliente"}
                    </p>
                  </div>
                  <p className="text-xs text-neutral-400">
                    {formatDate(order.created_at)}
                  </p>
                  <p className="truncate text-xs text-neutral-400">
                    {order.delivery_address || "Sin dirección"}
                  </p>
                  <span className="w-fit rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold text-neutral-300">
                    {statusLabel[order.delivery_status] ||
                      order.delivery_status ||
                      "Finalizado"}
                  </span>
                </div>
              ))}
            </div>
          )
        )}

        {section === "wallet" && sectionLoading ? (
          <LoadingCard label="Cargando movimientos..." />
        ) : section === "wallet" && (
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-5">
              <section className="rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/[0.16] to-neutral-900 p-6">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-100">
                  <CircleDollarSign size={18} />
                  Saldo disponible
                </div>
                <p className="mt-5 text-4xl font-black tracking-tight">
                  {formatMoney(balance)}
                </p>
                <p className="mt-2 text-xs text-emerald-100/60">
                  El saldo se actualiza cuando se aprueba una recarga o tomas un
                  pedido público.
                </p>
                {Number(summary?.commission_percentage) > 0 && (
                  <p className="mt-2 text-xs text-emerald-100/60">
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
                {summary?.deposit_instructions && (
                  <p className="mt-3 whitespace-pre-line text-xs leading-5 text-neutral-400">
                    {summary.deposit_instructions}
                  </p>
                )}
                <label className="mt-4 block text-xs font-semibold text-neutral-300">
                  Valor a recargar (COP)
                  <input
                    required
                    type="number"
                    min="1"
                    max="10000000"
                    step="1"
                    value={topupAmount}
                    onChange={(event) => setTopupAmount(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none focus:border-emerald-400/40"
                  />
                </label>
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
                  className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Enviando..." : "Enviar comprobante"}
                </button>
              </form>
            </div>
            <section className="rounded-2xl border border-white/[0.08] bg-neutral-900/50 p-5">
              <div className="mb-4 flex items-center gap-2">
                <Activity size={18} className="text-violet-300" />
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
                            ? "text-emerald-300"
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
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-400/10 text-violet-200">
                  <UserRound size={20} />
                </span>
                <div>
                  <h2 className="font-black">Información de la cuenta</h2>
                  <p className="mt-1 text-xs text-neutral-500">
                    Datos de acceso a Gloto
                  </p>
                </div>
              </div>
              <ProfileRow label="Nombre" value={displayName} />
              <ProfileRow label="Correo de inicio de sesión" value={user?.email} />
              <ProfileRow
                label="Teléfono"
                value={summary?.phone || phone || "No registrado"}
              />
              <ProfileRow
                label="Modo privado"
                value={
                  canUsePrivate
                    ? summary?.private_business_name || "Tienda vinculada"
                    : "Sin tienda vinculada"
                }
              />
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
          </div>
        )}
      </div>
      )}
      </>
      )}

      {earningsOpen && (
        <CourierEarningsModal
          balance={balance}
          data={dailyEarnings}
          loading={earningsLoading}
          error={earningsError}
          onClose={() => setEarningsOpen(false)}
        />
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

const CourierEarningsModal = ({ balance, data, loading, error, onClose }) => (
  <div
    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}
  >
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="courier-earnings-title"
      className="w-full max-w-md rounded-3xl border border-white/10 bg-neutral-950 p-5 shadow-2xl sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">
            Resumen de hoy
          </p>
          <h2
            id="courier-earnings-title"
            className="mt-1 text-xl font-black text-white"
          >
            Tus ganancias
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar resumen de ganancias"
          className="rounded-lg p-2 text-neutral-400 transition hover:bg-white/[0.08] hover:text-white"
        >
          <X size={18} />
        </button>
      </div>

      {loading ? (
        <LoadingCard label="Calculando tu resumen de hoy..." />
      ) : error ? (
        <div className="mt-5">
          <p role="alert" className="text-sm text-rose-200">
            {error}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.07] p-4">
            <p className="text-xs font-semibold text-emerald-100/70">
              Ganado en domicilios completados
            </p>
            <p className="mt-2 text-3xl font-black text-emerald-200">
              {formatMoney(data?.gross_earnings)}
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              {Number(data?.completed_deliveries) || 0} domicilios entregados hoy
            </p>
          </div>

          <div className="mt-3 rounded-2xl border border-rose-300/15 bg-rose-300/[0.05] p-4">
            <p className="text-xs font-semibold text-neutral-300">
              Descontado por pedidos públicos
            </p>
            <p className="mt-2 text-xl font-black text-rose-200">
              {formatMoney(data?.public_fees_deducted)}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {Number(data?.public_orders_charged) || 0} tarifas cobradas hoy
            </p>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
            <span className="text-xs font-semibold text-neutral-400">
              Saldo disponible
            </span>
            <span className="text-sm font-black text-white">
              {formatMoney(balance)}
            </span>
          </div>
          <p className="mt-4 text-[11px] leading-5 text-neutral-500">
            Los descuentos corresponden a las tarifas de los pedidos públicos.
            Los pedidos de tu tienda no descuentan de este saldo.
          </p>
        </>
      )}
    </section>
  </div>
);

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

  if (compact) {
    return (
      <article
        id={`courier-order-${order.order_id}`}
        className={`rounded-xl border p-3 transition ${
          isSelected
            ? "border-violet-300/50 bg-violet-300/[0.06]"
            : "border-white/[0.08] bg-white/[0.03]"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span
              className={`mb-1 inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-bold ${
                (order.courier_mode || mode) === "public"
                  ? "bg-emerald-400/10 text-emerald-200"
                  : "bg-violet-400/10 text-violet-200"
              }`}
            >
              {(order.courier_mode || mode) === "public" ? "Público" : "Tienda"}
            </span>
            <p className="truncate text-xs font-semibold text-neutral-300">
              {order.business_name || "Tu tienda"}
            </p>
            <p className="mt-0.5 truncate text-sm font-bold text-white">
              {order.customer_name || (isPublicOffer ? "Pedido cercano" : "Cliente")}
            </p>
            <p className="mt-1 truncate text-[11px] text-neutral-400">
              {order.delivery_address ||
                (isPublicOffer
                  ? order.distance_km != null &&
                    Number.isFinite(Number(order.distance_km))
                    ? `Tienda a ${Number(order.distance_km).toFixed(1)} km`
                    : "Pedido de tienda cercana"
                  : order.distance_km != null &&
                      Number.isFinite(Number(order.distance_km))
                    ? `A ${Number(order.distance_km).toFixed(1)} km`
                    : statusLabel[order.delivery_status] || order.delivery_status)}
            </p>
          </div>
          <p className="shrink-0 text-sm font-bold text-emerald-300">
            {formatMoney(order.delivery_fee)}
          </p>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          {mapUrl ? (
            <a
              href={mapUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-neutral-300 transition hover:text-white"
            >
              Ver ruta
            </a>
          ) : (
            <span />
          )}
          {order.customer_phone && (
            <a
              href={`tel:${order.customer_phone}`}
              className="mr-auto text-xs font-semibold text-neutral-300 transition hover:text-white"
            >
              Llamar
            </a>
          )}
          {order.delivery_status === "available" && (
            <button
              type="button"
              onClick={() => onClaim(order)}
              disabled={busy || !canClaim}
              className="rounded-lg bg-violet-400 px-3 py-2 text-xs font-bold text-neutral-950 transition hover:bg-violet-300 disabled:opacity-50"
            >
              {busy ? "Tomando..." : canClaim ? "Aceptar" : "Ya tienes una entrega"}
            </button>
          )}
          {order.delivery_status === "assigned" && (
            <button
              type="button"
              onClick={() => onUpdateStatus(order, "picked_up")}
              disabled={busy}
              className="rounded-lg bg-violet-400 px-3 py-2 text-xs font-bold text-neutral-950 transition hover:bg-violet-300 disabled:opacity-50"
            >
              {busy ? "Actualizando..." : "Recogí el pedido"}
            </button>
          )}
          {order.delivery_status === "picked_up" && (
            <button
              type="button"
              onClick={() => onUpdateStatus(order, "delivered")}
              disabled={busy}
              className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-neutral-950 transition hover:bg-emerald-300 disabled:opacity-50"
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
            La ubicación del mapa es aproximada. La dirección y los datos de
            contacto se muestran cuando tomes el pedido.
          </p>
        )}
        {order.delivery_address && (
          <div className="flex items-start gap-3 sm:col-span-2">
            <MapPin size={17} className="mt-0.5 shrink-0 text-violet-300" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                Dirección de entrega
              </p>
              <p className="mt-1 text-sm text-neutral-200">
                {order.delivery_address}
              </p>
              {order.delivery_instructions && (
                <p className="mt-1 text-xs text-neutral-500">
                  Referencia: {order.delivery_instructions}
                </p>
              )}
            </div>
          </div>
        )}
        {order.customer_phone && (
          <a
            href={`tel:${order.customer_phone}`}
            className="flex items-center gap-2 text-sm text-violet-200 hover:text-violet-100"
          >
            <Phone size={16} />
            {order.customer_phone}
          </a>
        )}
        {order.distance_km != null &&
          Number.isFinite(Number(order.distance_km)) && (
            <p className="text-xs text-neutral-400">
              A {Number(order.distance_km).toFixed(1)} km en línea recta
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

const CourierAvailabilitySlider = ({
  online,
  busy,
  onToggle,
  className = "",
}) => {
  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const [thumbPosition, setThumbPosition] = useState(null);

  const getThumbPosition = () => {
    const track = trackRef.current;
    if (!track) return 5;
    const thumbSize = 44;
    return online ? Math.max(5, track.clientWidth - thumbSize - 5) : 5;
  };

  const handlePointerDown = (event) => {
    if (busy || event.button !== 0) return;
    const startPosition = getThumbPosition();
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX };
    setThumbPosition(startPosition);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId || !trackRef.current) {
      return;
    }
    const track = trackRef.current.getBoundingClientRect();
    const thumbSize = 44;
    const maxPosition = Math.max(5, track.width - thumbSize - 5);
    const position = Math.min(
      maxPosition,
      Math.max(5, event.clientX - track.left - thumbSize / 2),
    );
    setThumbPosition(position);
  };

  const finishPointer = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setThumbPosition(null);
    const delta = event.clientX - drag.startX;
    const threshold = Math.max(36, (trackRef.current?.clientWidth || 200) * 0.2);
    if ((!online && delta >= threshold) || (online && delta <= -threshold)) {
      onToggle();
    }
  };

  const handleKeyDown = (event) => {
    const shouldToggle =
      (!online && event.key === "ArrowRight") ||
      (online && event.key === "ArrowLeft") ||
      event.key === " " ||
      event.key === "Enter";
    if (!shouldToggle || busy) return;
    event.preventDefault();
    onToggle();
  };

  const isSearching = online && !busy;

  return (
    <div
      ref={trackRef}
      role="switch"
      aria-checked={online}
      aria-disabled={busy}
      aria-label={
        online
          ? "Buscando pedidos. Desliza a la izquierda para desconectarte."
          : "Desliza a la derecha para conectarte."
      }
      tabIndex={busy ? -1 : 0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onKeyDown={handleKeyDown}
      className={`relative flex h-14 w-full touch-pan-y select-none items-center overflow-hidden rounded-full border px-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50 ${
        online
          ? "border-emerald-300/30 bg-emerald-400/15"
          : "border-white/10 bg-white/[0.05]"
      } ${busy ? "cursor-wait opacity-60" : "cursor-grab active:cursor-grabbing"} ${className}`}
    >
      {online ? (
        <ChevronLeft
          size={18}
          className="absolute right-4 text-emerald-100/50"
          aria-hidden="true"
        />
      ) : (
        <ChevronRight
          size={18}
          className="absolute right-4 text-neutral-400"
          aria-hidden="true"
        />
      )}
      <span
        className={`pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-xs font-bold ${
          isSearching ? "animate-pulse text-emerald-100" : "text-neutral-300"
        }`}
      >
        {isSearching && (
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
        )}
        {busy ? "Conectando..." : online ? "Buscando" : "Desliza para encender"}
      </span>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full shadow-lg transition-[left,background-color] duration-150 ${
          online
            ? "bg-emerald-300 text-emerald-950"
            : "bg-neutral-100 text-neutral-900"
        }`}
        style={{
          left:
            thumbPosition == null
              ? online
                ? "calc(100% - 49px)"
                : "5px"
              : `${thumbPosition}px`,
          transition: thumbPosition == null ? undefined : "none",
        }}
      >
        <Power size={17} />
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
}) => {
  const [isCardCollapsed, setIsCardCollapsed] = useState(false);
  const [fitRouteRequest, setFitRouteRequest] = useState(0);
  const isPublic = order.courier_mode === "public";
  const isPickedUp = order.delivery_status === "picked_up";
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
  const mapUrl = (() => {
    const params = new URLSearchParams({
      api: "1",
      origin: pickupCoordinates || pickupAddress,
      destination: destinationCoordinates || deliveryAddress,
    });
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  })();
  const pickupMapUrl = (() => {
    const params = new URLSearchParams({ api: "1" });
    if (
      location?.latitude != null &&
      location?.longitude != null &&
      Number.isFinite(Number(location.latitude)) &&
      Number.isFinite(Number(location.longitude))
    ) {
      params.set("origin", `${location.latitude},${location.longitude}`);
    }
    params.set(
      "destination",
      isPickedUp
        ? destinationCoordinates || deliveryAddress
        : pickupCoordinates || pickupAddress,
    );
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  })();
  const paymentMethod = String(order.payment_method || "No especificado")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

  return (
    <section className="relative h-[100dvh] overflow-hidden bg-[#09090f] text-white">
      <PortalDomiciliarioMap
        fullScreen
        location={location}
        activeDelivery={order}
        fitRouteRequest={fitRouteRequest}
      />

      <article className="courier-active-delivery-card pointer-events-auto fixed inset-x-3 bottom-3 z-20 mx-auto max-h-[52dvh] max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-neutral-950/95 shadow-2xl shadow-black/40 backdrop-blur-xl sm:inset-x-6 sm:bottom-5">
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
              <p className="mt-0.5 text-[11px] font-semibold text-emerald-200">
                {nextStopDistance == null
                  ? "Distancia no disponible"
                  : `${nextStopDistance < 0.1 ? "<0.1" : nextStopDistance.toFixed(1)} km aprox. hasta ${isPickedUp ? "el cliente" : "la tienda"}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                Domicilio
              </p>
              <p className="text-base font-black text-emerald-300">
                {formatMoney(order.delivery_fee)}
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
          <button
            type="button"
            onClick={() => setFitRouteRequest((request) => request + 1)}
            disabled={!canCenterRoute}
            aria-label="Centrar la ruta en el mapa"
            title="Centrar la ruta en el mapa"
            className="mr-3 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-emerald-200 transition hover:border-emerald-300/30 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Route size={19} aria-hidden="true" />
          </button>
        </div>

        {!isCardCollapsed && (
        <div className="space-y-3 px-4 py-3">
          <div className={`flex gap-3 ${isPickedUp ? "opacity-55" : ""}`}>
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-300 text-xs font-black text-neutral-950">
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
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-300 text-xs font-black text-neutral-950">
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
            {order.customer_phone && (
              <a
                href={`tel:${order.customer_phone}`}
                className="text-xs font-semibold text-violet-200 hover:text-violet-100"
              >
                Llamar al cliente
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
                href={pickupMapUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-emerald-300 px-3 text-xs font-bold text-neutral-950 transition hover:bg-emerald-200"
              >
                Ir a la tienda
              </a>
            )}
            {mapUrl && (
              <a
                href={mapUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-white/10 px-3 text-xs font-bold text-neutral-200 transition hover:bg-white/[0.06]"
              >
                {isPickedUp ? "Ir al cliente" : "Ver ruta completa"}
              </a>
            )}
            <button
              type="button"
              onClick={() =>
                onUpdateStatus(order, isPickedUp ? "delivered" : "picked_up")
              }
              disabled={busy}
              className={`min-h-11 flex-1 rounded-xl px-4 text-sm font-black transition disabled:cursor-wait disabled:opacity-50 ${
                isPickedUp
                  ? "bg-emerald-400 text-neutral-950 hover:bg-emerald-300"
                  : "bg-violet-400 text-neutral-950 hover:bg-violet-300"
              }`}
            >
              {busy
                ? "Actualizando..."
                : isPickedUp
                  ? "Marcar entregado"
                  : "Recoger pedido"}
            </button>
          </div>
        </div>
        )}
      </article>
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
}) => {
  const orderKey = getCourierOrderKey(order);

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => onExpire(orderKey),
      15000,
    );
    return () => window.clearTimeout(timeoutId);
  }, [onExpire, orderKey]);

  const isPublic = order.courier_mode === "public";
  const distance = getOrderDistanceKm(order, location);
  const accent = isPublic
    ? {
        border: "border-amber-300/30",
        label: "text-amber-200",
        badge: "bg-amber-300/15 text-amber-100",
        action: "bg-amber-300 text-neutral-950 hover:bg-amber-200",
      }
    : {
        border: "border-violet-300/30",
        label: "text-violet-200",
        badge: "bg-violet-400/15 text-violet-200",
        action: "bg-violet-400 text-neutral-950 hover:bg-violet-300",
      };

  return (
    <article
      className={`overflow-hidden rounded-2xl border ${accent.border} bg-neutral-950/95 shadow-xl shadow-black/25 backdrop-blur-xl`}
    >
      <div className="flex items-center gap-4 px-4 py-3">
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
          <p className="truncate text-sm font-bold text-white">
            {isPublic
              ? "Zona aproximada · dirección al aceptar"
              : order.delivery_address || "Dirección no disponible"}
          </p>
          <p className="mt-1 text-xs font-semibold text-neutral-200">
            {distance == null
              ? "Distancia no disponible"
              : `${distance.toFixed(1)} km aprox. de la tienda`}
          </p>
        </div>
        <p className="shrink-0 text-sm font-black text-emerald-300">
          {formatMoney(order.delivery_fee)}
        </p>
        <button
          type="button"
          onClick={() => onClaim(order)}
          disabled={isBusy || !canAccept}
          className={`min-h-11 shrink-0 rounded-lg px-4 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${accent.action}`}
        >
          {isBusy
            ? "Tomando..."
            : canAccept
              ? "Aceptar"
              : "Entrega en curso"}
        </button>
      </div>
      <div aria-hidden="true" className="h-1 bg-white/10">
        <div
          className={`h-full origin-left ${isPublic ? "bg-amber-300" : "bg-violet-400"}`}
          style={{ animation: "courier-offer-countdown 15s linear forwards" }}
        />
      </div>
    </article>
  );
};

const CourierMapExperience = ({
  mode,
  locationStatus,
  online,
  realtimeStatus,
  location,
  orders,
  activeDelivery,
  previewOrderIds,
  previewedOrderIds,
  onFinishOrderPreview,
  activeOrderId,
  selectedOrderId,
  errorMessage,
  availabilityBusy,
  onToggleAvailability,
  onSelectOrder,
  onClaim,
  onUpdateStatus,
}) => {
  const [ordersExpanded, setOrdersExpanded] = useState(false);
  const [recenterRequest, setRecenterRequest] = useState(0);
  const [previewCapacity, setPreviewCapacity] = useState(() =>
    typeof window === "undefined"
      ? 2
      : Math.max(1, Math.floor((window.innerHeight * 0.38) / 84)),
  );
  const previewOrders = useMemo(() => {
    if (activeDelivery || activeOrderId !== null) return [];
    const ordersByKey = new Map(
      orders.map((order) => [getCourierOrderKey(order), order]),
    );
    return previewOrderIds
      .map((previewId) => ordersByKey.get(previewId))
      .filter((order) => order?.delivery_status === "available");
  }, [activeDelivery, activeOrderId, orders, previewOrderIds]);
  const visiblePreviewOrders = useMemo(
    () => previewOrders.slice(0, previewCapacity),
    [previewCapacity, previewOrders],
  );
  const visiblePreviewOrderIds = useMemo(
    () => new Set(visiblePreviewOrders.map(getCourierOrderKey)),
    [visiblePreviewOrders],
  );
  const visibleOrders = useMemo(
    () => activeDelivery
      ? [activeDelivery]
      : [...orders]
        .filter(
          (order) =>
            order.delivery_status === "available" &&
            previewedOrderIds.has(getCourierOrderKey(order)),
        ),
    [activeDelivery, orders, previewedOrderIds],
  );
  const mapOrders = useMemo(
    () => activeDelivery
      ? []
      : orders.filter(
        (order) =>
          order.delivery_status === "available" &&
          (
            visiblePreviewOrderIds.has(getCourierOrderKey(order)) ||
            previewedOrderIds.has(getCourierOrderKey(order))
          ),
      ),
    [activeDelivery, orders, previewedOrderIds, visiblePreviewOrderIds],
  );
  const selectOrder = (orderId) => {
    setOrdersExpanded(true);
    onSelectOrder(orderId);
  };

  useEffect(() => {
    const updatePreviewCapacity = () => {
      setPreviewCapacity(
        Math.max(1, Math.floor((window.innerHeight * 0.38) / 84)),
      );
    };
    window.addEventListener("resize", updatePreviewCapacity);
    return () => window.removeEventListener("resize", updatePreviewCapacity);
  }, []);

  return (
    <>
      <PortalDomiciliarioMap
        fullScreen
        location={location}
        orders={mapOrders}
        online={online}
        selectedOrderId={selectedOrderId}
        onSelectOrder={selectOrder}
        recenterRequest={recenterRequest}
      />

      {online &&
        !activeDelivery &&
        activeOrderId === null &&
        visiblePreviewOrders.length > 0 && (
        <div
          className={`pointer-events-none fixed inset-x-3 z-20 sm:inset-x-6 ${
            errorMessage ? "top-[112px]" : "top-[72px]"
          }`}
        >
          <div
            aria-label={`${previewOrders.length} ofertas pendientes`}
            className="pointer-events-auto mx-auto flex max-h-[46dvh] max-w-3xl flex-col gap-3 overflow-hidden"
          >
            {visiblePreviewOrders.map((order) => (
              <CourierOfferPreview
                key={getCourierOrderKey(order)}
                order={order}
                location={location}
                onExpire={onFinishOrderPreview}
                onClaim={onClaim}
                isBusy={activeOrderId === order.order_id}
                canAccept={activeDelivery === null && activeOrderId === null}
              />
            ))}
            {previewOrders.length > visiblePreviewOrders.length && (
              <p className="px-2 text-right text-[10px] font-medium text-neutral-300 drop-shadow">
                +{previewOrders.length - visiblePreviewOrders.length} en espera
              </p>
            )}
          </div>
        </div>
      )}

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

      <div className="pointer-events-none fixed inset-x-3 bottom-3 z-20 sm:inset-x-6 sm:bottom-5">
        {!activeDelivery && (
          <div className="pointer-events-auto mx-auto mb-2 flex w-full max-w-xl justify-end">
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
              className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-neutral-950/95 text-emerald-200 shadow-lg shadow-black/30 backdrop-blur-xl transition hover:border-emerald-300/30 hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <LocateFixed size={20} strokeWidth={2.2} />
            </button>
          </div>
        )}
        <div className="pointer-events-auto mx-auto max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/95 shadow-xl shadow-black/30 backdrop-blur-xl">
          <div className="flex items-center gap-2 p-3">
            <CourierAvailabilitySlider
              online={online}
              busy={availabilityBusy}
              onToggle={onToggleAvailability}
              className="min-w-0 flex-1"
            />
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
          </div>

          {activeDelivery ? (
            <>
              <p className="border-t border-white/[0.08] px-4 py-2.5 text-xs font-semibold text-emerald-200">
                Solo puedes llevar un pedido a la vez
              </p>
              <div className="border-t border-white/[0.08] p-2.5">
                <CourierActiveDelivery
                  order={activeDelivery}
                  busy={activeOrderId === activeDelivery.order_id}
                  onUpdateStatus={onUpdateStatus}
                />
              </div>
            </>
          ) : activeOrderId !== null ? (
            <p className="border-t border-white/[0.08] px-4 py-3 text-center text-xs text-neutral-300">
              Confirmando tu pedido...
            </p>
          ) : (visibleOrders.length > 0 || previewOrderIds.length > 0) && (
            <>
              <button
                type="button"
                onClick={() => setOrdersExpanded((expanded) => !expanded)}
                aria-expanded={ordersExpanded}
                className="flex w-full items-center justify-between border-t border-white/[0.08] px-4 py-2.5 text-left text-xs font-semibold text-neutral-300 transition hover:bg-white/[0.04]"
              >
                <span>
                  {ordersExpanded
                    ? "Ocultar pedidos"
                    : `Pedidos acumulados (${visibleOrders.length})`}
                </span>
                {ordersExpanded ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </button>
              {ordersExpanded && (
                <div className="max-h-[32dvh] space-y-2 overflow-y-auto border-t border-white/[0.08] p-2.5">
                  {visibleOrders.length > 0 ? (
                    visibleOrders.map((order) => (
                      <OrderCard
                        key={getCourierOrderKey(order)}
                        order={order}
                        mode={order.courier_mode || mode}
                        busy={activeOrderId === order.order_id}
                        canClaim={activeDelivery === null && activeOrderId === null}
                        isSelected={selectedOrderId === order.order_id}
                        compact
                        onClaim={() => onClaim(order)}
                        onUpdateStatus={(status) => onUpdateStatus(order, status)}
                      />
                    ))
                  ) : (
                    <p className="px-3 py-4 text-center text-xs text-neutral-500">
                      Los pedidos aparecerán aquí al terminar su vista previa.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default PortalDomiciliario;
