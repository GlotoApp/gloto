import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bike,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Clock3,
  History,
  Info,
  LoaderCircle,
  MapPin,
  MapPinned,
  PackageCheck,
  Phone,
  Power,
  RefreshCw,
  ShieldAlert,
  UserRound,
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
  const [orders, setOrders] = useState([]);
  const [history, setHistory] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [topups, setTopups] = useState([]);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [sourcePreferences, setSourcePreferences] = useState(null);
  const sourcePreferencesLoadedRef = useRef(false);
  const [mapLocation, setMapLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("paused");
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [fullName, setFullName] = useState(
    user?.user_metadata?.full_name || user?.user_metadata?.name || "",
  );
  const [phone, setPhone] = useState(user?.user_metadata?.phone || "");
  const [topupAmount, setTopupAmount] = useState("");
  const [topupProof, setTopupProof] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  const isPublicApproved = summary?.application_status === "approved";
  const isPublicOnline = Boolean(summary?.is_online);
  const isPrivateOnline = Boolean(summary?.private_is_online);
  const isCourierOnline = isPublicOnline || isPrivateOnline;
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
        setOrders(data || []);
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
  }, [requestOrders]);

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
    setRefreshing(true);
    try {
      const { data } = await requestOrders();
      setOrders(data || []);
      setErrorMessage("");
    } catch (error) {
      console.error("No se pudieron actualizar los domicilios:", error);
      setErrorMessage(error.message || "No se pudieron actualizar los pedidos.");
      setOrders([]);
    } finally {
      setRefreshing(false);
    }
  }, [requestOrders]);

  useEffect(() => {
    if (!isCourierOnline || section !== "orders") {
      return undefined;
    }
    const intervalId = window.setInterval(refreshOrders, 30000);
    return () => window.clearInterval(intervalId);
  }, [isCourierOnline, refreshOrders, section]);

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
      setNotice(successMessage);
      await Promise.all([refreshOrders(), loadSummary()]);
    } catch (error) {
      console.error("No se pudo actualizar el domicilio:", error);
      setErrorMessage(error.message || "No se pudo actualizar el domicilio.");
    } finally {
      setActiveOrderId(null);
    }
  };

  const claimOrder = (order) =>
    runOrderAction(
      order.order_id,
      order.courier_mode === "public"
        ? "claim_public_courier_order"
        : "claim_domiciliario_order",
      null,
      order.courier_mode === "public"
        ? "Pedido público aceptado. El saldo solo aplica a las entregas públicas."
        : "Pedido de tienda asignado.",
    );

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
    (canUsePrivate || isPublicApproved) &&
    !(mode === "public" && !isPublicApproved);

  const deliveryStats = useMemo(() => {
    const active = orders.filter((order) =>
      ["assigned", "picked_up"].includes(order.delivery_status),
    ).length;
    return { active, available: orders.length - active };
  }, [orders]);

  return (
    <main className="min-h-screen bg-[#09090f] text-white">
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
        displayName={displayName}
        onSignOut={signOut}
      />

      {showFullMap && (
        <CourierMapExperience
          mode={mode}
          isPublicApproved={isPublicApproved}
          privateOnline={isPrivateOnline}
          publicOnline={isPublicOnline}
          privateEnabled={privateSourceEnabled}
          publicEnabled={publicSourceEnabled}
          online={isCourierOnline}
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
          radiusKm={Math.min(1, Number(summary?.public_radius_km) || 1)}
          orders={orders}
          loading={loading}
          refreshing={refreshing}
          activeOrderId={activeOrderId}
          selectedOrderId={selectedOrderId}
          errorMessage={errorMessage}
          onRefresh={refreshOrders}
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
              radiusKm={summary?.public_radius_km}
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
                  ? "Ubicación aproximada"
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
              disabled={busy}
              className="rounded-lg bg-violet-400 px-3 py-2 text-xs font-bold text-neutral-950 transition hover:bg-violet-300 disabled:opacity-50"
            >
              {busy ? "Tomando..." : "Aceptar"}
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
              disabled={busy}
              className="rounded-xl bg-violet-500 px-4 py-2.5 text-xs font-black transition hover:bg-violet-400 disabled:opacity-50"
            >
              {busy ? "Tomando..." : "Tomar pedido"}
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

const CourierMapExperience = ({
  mode,
  isPublicApproved,
  privateOnline,
  publicOnline,
  locationStatus,
  online,
  location,
  radiusKm,
  orders,
  loading,
  refreshing,
  activeOrderId,
  selectedOrderId,
  errorMessage,
  availabilityBusy,
  onRefresh,
  onToggleAvailability,
  onSelectOrder,
  onClaim,
  onUpdateStatus,
}) => {
  const [ordersExpanded, setOrdersExpanded] = useState(false);
  const visibleOrders = [...orders].sort((left, right) => {
    const leftActive = left.delivery_status === "available" ? 1 : 0;
    const rightActive = right.delivery_status === "available" ? 1 : 0;
    return leftActive - rightActive;
  });
  const selectOrder = (orderId) => {
    setOrdersExpanded(true);
    onSelectOrder(orderId);
  };

  return (
    <>
      <PortalDomiciliarioMap
        fullScreen
        location={location}
        orders={orders}
        radiusKm={radiusKm}
        showRadius={isPublicApproved}
        online={online}
        selectedOrderId={selectedOrderId}
        onSelectOrder={selectOrder}
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

      <div className="pointer-events-none fixed inset-x-3 bottom-3 z-20 sm:inset-x-6 sm:bottom-5">
        <div className="pointer-events-auto mx-auto max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/95 shadow-xl shadow-black/30 backdrop-blur-xl">
          <div className="flex items-center gap-3 p-3">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                online ? "bg-emerald-400" : "bg-neutral-500"
              }`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">
                {online ? "Disponible" : "En pausa"}
              </p>
              <p className="text-[11px] text-neutral-400">
                {locationStatus === "error"
                  ? "Revisa el permiso de ubicación"
                  : locationStatus === "updating"
                    ? "Actualizando ubicación..."
                    : locationStatus === "live"
                      ? `Ubicación en vivo · ${[
                          privateOnline && "Tienda",
                          publicOnline && "Público",
                        ]
                          .filter(Boolean)
                          .join(" · ")}`
                      : online
                        ? "Localizando..."
                      : loading
                        ? "Buscando pedidos..."
                        : "Ubicación pausada"}
              </p>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing || loading}
              aria-label="Actualizar pedidos"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-neutral-300 transition hover:bg-white/[0.08] disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : undefined}
              />
            </button>
            <div className="hidden items-center gap-1.5 sm:flex">
              {privateOnline && (
                <span className="rounded-lg bg-violet-400/10 px-2 py-1.5 text-[10px] font-semibold text-violet-200">
                  Tienda
                </span>
              )}
              {publicOnline && (
                <span className="rounded-lg bg-emerald-400/10 px-2 py-1.5 text-[10px] font-semibold text-emerald-200">
                  Público
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onToggleAvailability}
              disabled={availabilityBusy}
              className={`min-h-10 shrink-0 rounded-xl px-3.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                online
                  ? "border border-rose-300/20 bg-rose-400/10 text-rose-100 hover:bg-rose-400/15"
                  : "bg-emerald-400 text-emerald-950 hover:bg-emerald-300"
              }`}
            >
              {availabilityBusy
                ? "Un momento..."
                : online
                  ? "Desconectarme"
                  : "Conectarme"}
            </button>
          </div>

          {visibleOrders.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setOrdersExpanded((expanded) => !expanded)}
                aria-expanded={ordersExpanded}
                className="flex w-full items-center justify-between border-t border-white/[0.08] px-4 py-2.5 text-left text-xs font-semibold text-neutral-300 transition hover:bg-white/[0.04]"
              >
                <span>
                  {ordersExpanded ? "Ocultar pedidos" : "Ver pedidos"}
                </span>
                {ordersExpanded ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </button>
              {ordersExpanded && (
                <div className="max-h-[32dvh] space-y-2 overflow-y-auto border-t border-white/[0.08] p-2.5">
                  {visibleOrders.map((order) => (
                    <OrderCard
                      key={order.order_id}
                      order={order}
                      mode={order.courier_mode || mode}
                      busy={activeOrderId === order.order_id}
                      isSelected={selectedOrderId === order.order_id}
                      compact
                      onClaim={() => onClaim(order)}
                      onUpdateStatus={(status) => onUpdateStatus(order, status)}
                    />
                  ))}
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
