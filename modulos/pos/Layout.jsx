import { useState, useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bell, Clock, X } from "lucide-react";
import Sidebar from "./Sidebar";
import { Loading, LOADING_DURATION_MS } from "./Loading";
import { supabase } from "../../src/lib/supabaseClient";
import {
  enableOrderPushNotifications,
  getOrderPushSubscription,
  supportsOrderPushNotifications,
  syncOrderPushSubscription,
} from "../../src/lib/orderPushNotifications";
import { getBusinessPushPlanAccess } from "../../src/lib/pushPlanAccess";
import { useAuth } from "../../src/components/AuthContext";

const DEFAULT_POPUP_SETTINGS = {
  show_widget: true,
  notify_marketplace_orders: true,
  notify_pos_orders: false,
  sound_enabled: true,
  color: "violet",
};

const POPUP_COLOR_HEX = {
  violet: "#8b5cf6",
  blue: "#0ea5e9",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
};

const getPopupColor = (color) => {
  const hex = POPUP_COLOR_HEX[color] || color;
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return { hex: POPUP_COLOR_HEX.violet, rgb: "139, 92, 246" };
  const value = match[1];
  return {
    hex: `#${value}`,
    rgb: `${parseInt(value.slice(0, 2), 16)}, ${parseInt(
      value.slice(2, 4),
      16,
    )}, ${parseInt(value.slice(4, 6), 16)}`,
  };
};

const playOrderNotificationSound = (audioContext) => {
  const playTone = () => {
    if (audioContext.state !== "running") return;

    try {
      const startAt = audioContext.currentTime;
      [880, 1174].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const noteStart = startAt + index * 0.18;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, noteStart);
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.65, noteStart + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.16);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(noteStart);
        oscillator.stop(noteStart + 0.17);
      });
    } catch (error) {
      console.error("No se pudo reproducir el sonido del pedido:", error);
    }
  };

  if (audioContext.state === "suspended") {
    audioContext.resume().then(playTone).catch((error) => {
      console.error("No se pudo reactivar el sonido de pedidos:", error);
    });
  } else {
    playTone();
  }
};

// Lógica de carga integrada globalmente en el Layout
const ReadyGate = ({ children }) => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const fontsWait = document.fonts.ready;
    const minWait =
      LOADING_DURATION_MS !== null
        ? new Promise((res) => setTimeout(res, LOADING_DURATION_MS))
        : Promise.resolve();

    Promise.all([minWait, fontsWait]).then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsReady(true));
      });
    });
  }, []);

  if (!isReady) return <Loading />;
  return children;
};

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [hasUnsavedPOSData, setHasUnsavedPOSData] = useState(false);
  const [colorMode, setColorMode] = useState("dark");
  const [inactiveTablesPrompt, setInactiveTablesPrompt] = useState([]);
  const [isClosingInactiveTables, setIsClosingInactiveTables] = useState(false);
  const [isInactiveTablesPreview, setIsInactiveTablesPreview] = useState(false);
  const [browserNotificationPermission, setBrowserNotificationPermission] =
    useState(() =>
      typeof window !== "undefined" && "Notification" in window
        ? window.Notification.permission
        : "unsupported",
    );
  const [notificationPromptOpen, setNotificationPromptOpen] = useState(false);
  const [notificationPromptError, setNotificationPromptError] = useState("");
  const [pushSubscriptionState, setPushSubscriptionState] = useState({
    userId: null,
    supported: false,
    active: false,
    checked: false,
  });
  const [pushPlanAccessState, setPushPlanAccessState] = useState({
    userId: null,
    checked: false,
    access: null,
  });
  const [newOrderToast, setNewOrderToast] = useState(null);
  const [popupSettings, setPopupSettings] = useState(DEFAULT_POPUP_SETTINGS);
  const [orderBellPosition, setOrderBellPosition] = useState(null);
  const notifiedOrderIdsRef = useRef(new Set());
  const newOrderToastTimerRef = useRef(null);
  const notificationAudioContextRef = useRef(null);
  const popupSettingsRef = useRef(DEFAULT_POPUP_SETTINGS);
  const orderBellDragRef = useRef(null);
  const suppressOrderBellClickRef = useRef(false);
  const isSidebarExpanded = isSidebarPinned || isSidebarHovered;
  const isPosRoute = location.pathname === "/pos";
  const isMesasRoute = location.pathname === "/pos/mesas";
  const isKitchenRoute = location.pathname === "/pos/cocina";
  const popupColor = getPopupColor(popupSettings.color);
  const pushSubscriptionActive =
    pushSubscriptionState.userId === user?.id && pushSubscriptionState.active;
  const pushSubscriptionChecked =
    pushSubscriptionState.userId === user?.id && pushSubscriptionState.checked;
  const pushSupported =
    pushSubscriptionState.userId === user?.id && pushSubscriptionState.supported;
  const pushPlanAccess =
    pushPlanAccessState.userId === user?.id && pushPlanAccessState.checked
      ? pushPlanAccessState.access
      : null;
  const pushPlanEligible = Boolean(pushPlanAccess?.settingsAllowed);
  const pushOrdersEligible = Boolean(pushPlanAccess?.ordersAllowed);

  useEffect(() => {
    popupSettingsRef.current = popupSettings;
  }, [popupSettings]);

  useEffect(() => {
    if (!user?.id) {
      setPopupSettings(DEFAULT_POPUP_SETTINGS);
      return undefined;
    }

    let active = true;
    let settingsChannel;
    const loadSettings = async () => {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) {
        console.error("No se pudo identificar el negocio para Pop pup:", profileError);
        return;
      }
      if (!profile?.business_id || !active) return;

      const applySettings = (settings) => {
        const nextSettings = { ...DEFAULT_POPUP_SETTINGS, ...settings };
        setPopupSettings(nextSettings);
        popupSettingsRef.current = nextSettings;
      };
      const { data, error } = await supabase
        .from("business_popup_settings")
        .select(
          "show_widget, notify_marketplace_orders, notify_pos_orders, sound_enabled, color",
        )
        .eq("business_id", profile.business_id)
        .maybeSingle();
      if (error) {
        console.error("No se pudo cargar la configuración de Pop pup:", error);
        return;
      }
      if (!active) return;
      if (data) applySettings(data);

      settingsChannel = supabase
        .channel(`popup-settings-${profile.business_id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "business_popup_settings",
            filter: `business_id=eq.${profile.business_id}`,
          },
          (payload) => {
            if (!active) return;
            applySettings(payload.new || DEFAULT_POPUP_SETTINGS);
          },
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error(
              "No se pudo mantener actualizada la configuración de Pop pup:",
              status,
            );
          }
        });
    };

    const handleSettingsChange = (event) => {
      if (event.detail) {
        const nextSettings = {
          ...popupSettingsRef.current,
          ...event.detail,
        };
        setPopupSettings(nextSettings);
        popupSettingsRef.current = nextSettings;
      }
    };
    window.addEventListener("gloto:popup-settings-changed", handleSettingsChange);
    loadSettings().catch((error) => {
      if (active) {
        console.error("Error cargando la configuración de Pop pup:", error);
      }
    });

    return () => {
      active = false;
      window.removeEventListener(
        "gloto:popup-settings-changed",
        handleSettingsChange,
      );
      if (settingsChannel) supabase.removeChannel(settingsChannel);
    };
  }, [user?.id]);

  const toggleSidebar = () => {
    if (isSidebarPinned || isSidebarHovered) {
      setIsSidebarPinned(false);
      setIsSidebarHovered(false);
    } else {
      setIsSidebarPinned(true);
    }
  };

  const handleSidebarMouseEnter = () => {
    if (
      window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
      !isSidebarPinned &&
      !isPosRoute
    ) {
      setIsSidebarHovered(true);
    }
  };

  const handleSidebarMouseLeave = () => {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      setIsSidebarHovered(false);
    }
  };

  const closeSidebar = () => {
    setIsSidebarPinned(false);
    setIsSidebarHovered(false);
  };
  const sidebarPushesContent = isPosRoute && isSidebarExpanded;

  useEffect(() => {
    if (!user?.id) {
      setOrderBellPosition(null);
      return;
    }

    const positionKey = `gloto-order-bell-position-${user.id}`;
    const clampPosition = (position) => ({
      x: Math.max(8, Math.min(position.x, window.innerWidth - 64)),
      y: Math.max(8, Math.min(position.y, window.innerHeight - 64)),
    });

    try {
      const savedPosition = JSON.parse(
        localStorage.getItem(positionKey) || "null",
      );
      if (
        Number.isFinite(savedPosition?.x) &&
        Number.isFinite(savedPosition?.y)
      ) {
        setOrderBellPosition(clampPosition(savedPosition));
      } else {
        setOrderBellPosition(
          clampPosition({
            x: window.innerWidth - 72,
            y: 104,
          }),
        );
      }
    } catch (error) {
      console.error("No se pudo cargar la posición del aviso de pedidos:", error);
      setOrderBellPosition({
        x: Math.max(8, window.innerWidth - 72),
        y: 104,
      });
    }

    const handleResize = () => {
      setOrderBellPosition((current) =>
        current ? clampPosition(current) : current,
      );
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !orderBellPosition) return;
    try {
      localStorage.setItem(
        `gloto-order-bell-position-${user.id}`,
        JSON.stringify(orderBellPosition),
      );
    } catch (error) {
      console.error("No se pudo guardar la posición del aviso de pedidos:", error);
    }
  }, [orderBellPosition, user?.id]);

  useEffect(() => {
    if (!newOrderToast) return;
    setOrderBellPosition((current) => {
      if (!current) return current;
      const width = Math.min(320, window.innerWidth - 32);
      return {
        ...current,
        x: Math.max(8, Math.min(current.x, window.innerWidth - width - 8)),
      };
    });
  }, [newOrderToast]);

  useEffect(() => {
    if (!popupSettings.show_widget) setNewOrderToast(null);
  }, [popupSettings.show_widget]);

  useEffect(() => {
    const unlockNotificationAudio = () => {
      const AudioContextConstructor =
        window.AudioContext || window.webkitAudioContext;
      if (!AudioContextConstructor) return;

      try {
        notificationAudioContextRef.current ||= new AudioContextConstructor();
        if (notificationAudioContextRef.current.state === "suspended") {
          notificationAudioContextRef.current.resume().catch((error) => {
            console.error("No se pudo habilitar el sonido de pedidos:", error);
          });
        }
      } catch (error) {
        console.error("No se pudo inicializar el sonido de pedidos:", error);
      }
    };

    window.addEventListener("pointerdown", unlockNotificationAudio, {
      once: true,
    });
    window.addEventListener("keydown", unlockNotificationAudio, {
      once: true,
    });
    return () => {
      window.removeEventListener("pointerdown", unlockNotificationAudio);
      window.removeEventListener("keydown", unlockNotificationAudio);
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setPushPlanAccessState({
        userId: null,
        checked: false,
        access: null,
      });
      return () => {
        active = false;
      };
    }

    const supported = supportsOrderPushNotifications();
    setPushPlanAccessState({
      userId: user.id,
      checked: false,
      access: null,
    });
    setPushSubscriptionState({
      userId: user.id,
      supported,
      active: false,
      checked: false,
    });

    const checkPushEligibility = async () => {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile?.business_id) {
        throw new Error("No se encontró el negocio para validar el plan.");
      }

      const planAccess = await getBusinessPushPlanAccess(profile.business_id);
      if (!active) return;
      setPushPlanAccessState({
        userId: user.id,
        checked: true,
        access: planAccess,
      });

      if (supported) {
        setBrowserNotificationPermission(window.Notification.permission);
      } else {
        setBrowserNotificationPermission(
          typeof window !== "undefined" && "Notification" in window
            ? window.Notification.permission
            : "unsupported",
        );
      }

      if (!supported || !planAccess.settingsAllowed) {
        setPushSubscriptionState({
          userId: user.id,
          supported,
          active: false,
          checked: true,
        });
        return;
      }

      let subscriptionActive = false;
      try {
        const subscription = await getOrderPushSubscription();
        if (subscription) {
          await syncOrderPushSubscription(subscription);
          subscriptionActive = true;
        }
      } catch (error) {
        console.error(
          "No se pudo verificar la suscripción push de pedidos:",
          error,
        );
      }
      if (active) {
        setPushSubscriptionState({
          userId: user.id,
          supported: true,
          active: subscriptionActive,
          checked: true,
        });
      }
    };

    checkPushEligibility().catch((error) => {
      if (!active) return;
      console.error("No se pudo validar el plan para notificaciones push:", error);
      setPushPlanAccessState({
        userId: user.id,
        checked: true,
        access: null,
      });
      setPushSubscriptionState({
        userId: user.id,
        supported,
        active: false,
        checked: true,
      });
    });

    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !pushSubscriptionChecked) return undefined;
    if (!pushPlanEligible) {
      Promise.resolve().then(() => setNotificationPromptOpen(false));
      return undefined;
    }
    if (!pushSupported || pushSubscriptionActive) {
      Promise.resolve().then(() => setNotificationPromptOpen(false));
      return undefined;
    }

    const dismissedKey = `gloto-order-notifications-dismissed-${user.id}`;
    let active = true;
    let shouldOpen = true;
    try {
      shouldOpen = localStorage.getItem(dismissedKey) !== "true";
    } catch (error) {
      console.error("No se pudo leer la preferencia de notificaciones:", error);
    }
    Promise.resolve().then(() => {
      if (active) setNotificationPromptOpen(shouldOpen);
    });

    return () => {
      active = false;
    };
  }, [
    popupSettings.notify_marketplace_orders,
    popupSettings.notify_pos_orders,
    pushPlanEligible,
    pushSubscriptionActive,
    pushSubscriptionChecked,
    pushSupported,
    user?.id,
  ]);

  useEffect(() => {
    if (
      !user?.id ||
      typeof window === "undefined"
    ) {
      return undefined;
    }

    let cancelled = false;
    let orderChannel;

    const subscribeToNewOrders = async () => {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error(
          "No se pudo cargar el negocio para las notificaciones de pedidos:",
          profileError,
        );
        return;
      }
      if (!profile?.business_id || cancelled) return;

      orderChannel = supabase
        .channel(`browser-order-notifications-${profile.business_id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "orders",
            filter: `business_id=eq.${profile.business_id}`,
          },
          (payload) => {
            const order = payload.new;
            if (
              payload.eventType !== "INSERT" ||
              !order?.id ||
              order.business_id !== profile.business_id ||
              order.is_reservation === true
            ) {
              return;
            }

            if (isKitchenRoute) return;
            const orderChannelName = String(
              order.metadata?.canal || "",
            ).toLowerCase();
            const currentPopupSettings = popupSettingsRef.current;
            if (
              (orderChannelName === "marketplace" &&
                !currentPopupSettings.notify_marketplace_orders) ||
              (orderChannelName === "pos" &&
                !currentPopupSettings.notify_pos_orders) ||
              !["marketplace", "pos"].includes(orderChannelName)
            ) {
              return;
            }

            const orderId = String(order.id);
            if (notifiedOrderIdsRef.current.has(orderId)) return;

            const isForeground =
              document.visibilityState === "visible" && document.hasFocus();
            const storageKey = `gloto-notified-orders-${profile.business_id}`;
            if (!isForeground) {
              try {
                const previousIds = JSON.parse(
                  localStorage.getItem(storageKey) || "[]",
                );
                if (
                  Array.isArray(previousIds) &&
                  previousIds.includes(orderId)
                ) {
                  notifiedOrderIdsRef.current.add(orderId);
                  return;
                }
                localStorage.setItem(
                  storageKey,
                  JSON.stringify(
                    [
                      ...(Array.isArray(previousIds) ? previousIds : []),
                      orderId,
                    ].slice(-100),
                  ),
                );
              } catch (error) {
                console.error(
                  "No se pudo guardar la deduplicación de notificaciones:",
                  error,
                );
              }
            }

            notifiedOrderIdsRef.current.add(orderId);
            const orderNumber = String(
              order.order_number || String(order.id).slice(0, 8).toUpperCase(),
            ).slice(0, 40);
            if (isForeground) {
              const audioContext = notificationAudioContextRef.current;
              if (currentPopupSettings.sound_enabled && audioContext) {
                playOrderNotificationSound(audioContext);
              }
              if (currentPopupSettings.show_widget) {
                setNewOrderToast({ id: orderId, number: orderNumber });
              }
            }

            if (
              !pushOrdersEligible ||
              pushSubscriptionActive ||
              browserNotificationPermission !== "granted" ||
              !("Notification" in window) ||
              !window.isSecureContext
            ) {
              return;
            }
            if (isForeground) return;

            let notification;
            try {
              notification = new window.Notification("Nuevo pedido recibido", {
                body: `Pedido #${orderNumber}. Toca para revisarlo.`,
                tag: `gloto-order-${orderId}`,
              });
            } catch (error) {
              console.error(
                "No se pudo mostrar la notificación del pedido:",
                error,
              );
              return;
            }
            notification.onclick = () => {
              window.focus();
              navigate("/pos/ordenes", {
                state: { openOrderId: orderId },
              });
              notification.close();
            };
          },
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error(
              "No se pudo mantener la escucha de pedidos para notificaciones:",
              status,
            );
          }
        });
    };

    subscribeToNewOrders().catch((error) => {
      if (!cancelled) {
        console.error(
          "Error configurando las notificaciones de pedidos:",
          error,
        );
      }
    });

    return () => {
      cancelled = true;
      if (orderChannel) supabase.removeChannel(orderChannel);
    };
  }, [
    browserNotificationPermission,
    isKitchenRoute,
    navigate,
    pushOrdersEligible,
    pushSubscriptionActive,
    user?.id,
  ]);

  useEffect(() => {
    if (newOrderToastTimerRef.current) {
      window.clearTimeout(newOrderToastTimerRef.current);
    }
    if (!newOrderToast) return undefined;

    newOrderToastTimerRef.current = window.setTimeout(
      () => setNewOrderToast(null),
      8000,
    );
    return () => {
      if (newOrderToastTimerRef.current) {
        window.clearTimeout(newOrderToastTimerRef.current);
      }
    };
  }, [newOrderToast]);

  const enableBrowserOrderNotifications = async () => {
    if (!pushPlanEligible) {
      setNotificationPromptError(
        "Las notificaciones push están disponibles para planes Pro y Premium.",
      );
      return;
    }
    if (!supportsOrderPushNotifications()) {
      setNotificationPromptError(
        "Este navegador no admite notificaciones push o requiere una conexión segura.",
      );
      return;
    }

    setNotificationPromptError("");
    try {
      const permission =
        window.Notification.permission === "granted"
          ? "granted"
          : await window.Notification.requestPermission();
      setBrowserNotificationPermission(permission);
      if (permission === "granted") {
        const registration = await enableOrderPushNotifications();
        setPushSubscriptionState({
          userId: user.id,
          supported: true,
          active: true,
          checked: true,
        });
        setNotificationPromptOpen(false);
        try {
          await registration.showNotification("Notificaciones activadas", {
            body: "Te avisaremos cuando llegue un pedido nuevo.",
            tag: "gloto-notifications-enabled",
          });
        } catch (error) {
          console.error(
            "La suscripción quedó activa, pero no se pudo mostrar el aviso de prueba:",
            error,
          );
          setNotificationPromptError(
            "La suscripción quedó activa, pero no se pudo mostrar el aviso de prueba. Revisa las notificaciones del sitio y de Windows.",
          );
        }
        try {
          localStorage.removeItem(
            `gloto-order-notifications-dismissed-${user.id}`,
          );
        } catch (error) {
          console.error(
            "No se pudo guardar la preferencia de notificaciones:",
            error,
          );
        }
      } else if (permission === "denied") {
        setNotificationPromptOpen(true);
        setNotificationPromptError(
          "El permiso está bloqueado. Puedes habilitarlo desde la configuración del navegador.",
        );
      }
    } catch (error) {
      console.error("No se pudo solicitar permiso para notificaciones:", error);
      setNotificationPromptError(
        "No se pudo solicitar el permiso. Inténtalo desde la configuración del navegador.",
      );
    }
  };

  const dismissBrowserNotificationPrompt = () => {
    setNotificationPromptOpen(false);
    if (!user?.id) return;
    try {
      localStorage.setItem(
        `gloto-order-notifications-dismissed-${user.id}`,
        "true",
      );
    } catch (error) {
      console.error("No se pudo guardar la preferencia de notificaciones:", error);
    }
  };

  useEffect(() => {
    if (!user?.id) return undefined;

    let cancelled = false;

    const checkInactiveTables = async () => {
      if (new URLSearchParams(window.location.search).get("inactiveTablesPreview") === "1") {
        const now = Date.now();
        setIsInactiveTablesPreview(true);
        setInactiveTablesPrompt([
          { id: "preview-4", numero: "4", lastActivityAt: now - 27 * 60 * 60 * 1000 },
          { id: "preview-8", numero: "8", lastActivityAt: now - 31 * 60 * 60 * 1000 },
          { id: "preview-12", numero: "12", lastActivityAt: now - 49 * 60 * 60 * 1000 },
        ]);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError || !profile?.business_id || cancelled) return;

      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, mesa, table_status, updated_at, created_at")
        .eq("business_id", profile.business_id)
        .eq("order_type", "table")
        .neq("table_status", "cerrada")
        .neq("table_status", "clean");
      if (error || cancelled) return;

      const limit = 12 * 60 * 60 * 1000;
      const now = Date.now();
      const inactiveTables = (orders || []).flatMap((order) => {
        if (!order.mesa) return [];
        const lastActivityAt = new Date(order.updated_at || order.created_at).getTime();
        return Number.isFinite(lastActivityAt) && now - lastActivityAt >= limit
          ? [{ id: order.id, numero: String(order.mesa), lastActivityAt }]
          : [];
      });
      if (!inactiveTables.length) return;

      const promptKey = `gloto-inactive-tables-${profile.business_id}-${new Date().toLocaleDateString("en-CA")}`;
      if (sessionStorage.getItem(promptKey) === "shown") return;
      sessionStorage.setItem(promptKey, "shown");
      setInactiveTablesPrompt(inactiveTables);
    };

    checkInactiveTables();
    const interval = window.setInterval(checkInactiveTables, 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [location.pathname, user?.id]);

  const closeInactiveTables = async () => {
    if (!inactiveTablesPrompt.length) return;
    if (isInactiveTablesPreview) {
      setInactiveTablesPrompt([]);
      return;
    }

    setIsClosingInactiveTables(true);
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("business_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError || !profile?.business_id) {
      setIsClosingInactiveTables(false);
      return;
    }

    const results = await Promise.all(
      [...new Set(inactiveTablesPrompt.map((table) => table.id))]
        .filter((id) => !String(id).startsWith("preview-"))
        .map((orderId) =>
          supabase.rpc("close_table_order", {
            p_order_id: orderId,
            p_business_id: profile.business_id,
          }),
        ),
    );
    if (results.some(({ error }) => error)) {
      console.error("Error cerrando mesas inactivas:", results);
    } else {
      setInactiveTablesPrompt([]);
    }
    setIsClosingInactiveTables(false);
  };

  return (
    <div
      className="pos-theme bg-neutral-950 min-h-screen flex font-manrope selection:bg-violet-500/30 text-white relative overflow-x-hidden"
      data-theme={colorMode}
    >
      <div className="z-50 fixed top-0 left-0 h-screen transition-all duration-300">
        <Sidebar
          isExpanded={isSidebarExpanded}
          overlayClassName={isPosRoute ? "lg:hidden" : ""}
          toggleSidebar={toggleSidebar}
          onMouseEnter={handleSidebarMouseEnter}
          onMouseLeave={handleSidebarMouseLeave}
          onColorModeChange={setColorMode}
          hasUnsavedPOSData={hasUnsavedPOSData}
        />
      </div>

      <main
        className={`flex-1 p-0 ${
          isMesasRoute ? "h-[100dvh] overflow-hidden" : "overflow-y-auto min-h-screen"
        } ml-20 w-[calc(100%-5rem)] transition-all duration-300 ${
          sidebarPushesContent
            ? "lg:ml-64 lg:w-[calc(100%-16rem)]"
            : ""
        }`}
      >
        {/* Aquí la animación protege TODAS las rutas hijas automáticamente */}
        <ReadyGate>
          <Outlet context={{ isSidebarExpanded, setHasUnsavedPOSData }} />
        </ReadyGate>
      </main>

      {orderBellPosition && user?.id && popupSettings.show_widget && (
        <section
          className={`fixed z-[75] touch-none border text-white shadow-lg transition-[width,border-radius,background-color,opacity,box-shadow] duration-300 ${
            newOrderToast
              ? "w-[min(320px,calc(100vw-2rem))] rounded-2xl bg-neutral-900 opacity-100 shadow-2xl"
              : "w-11 rounded-full bg-neutral-950/65 opacity-60 shadow-md hover:opacity-100"
          }`}
          style={{
            left: orderBellPosition.x,
            top: orderBellPosition.y,
            borderColor: `rgba(${popupColor.rgb}, ${newOrderToast ? 0.3 : 0.15})`,
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.target.setPointerCapture(event.pointerId);
            orderBellDragRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              x: orderBellPosition.x,
              y: orderBellPosition.y,
              moved: false,
            };
          }}
          onPointerMove={(event) => {
            const drag = orderBellDragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            const deltaX = event.clientX - drag.startX;
            const deltaY = event.clientY - drag.startY;
            if (Math.abs(deltaX) + Math.abs(deltaY) > 5) drag.moved = true;
            if (!drag.moved) return;
            event.preventDefault();
            const bellWidth = newOrderToast
              ? Math.min(320, window.innerWidth - 32)
              : 44;
            setOrderBellPosition({
              x: Math.max(
                8,
                Math.min(drag.x + deltaX, window.innerWidth - bellWidth - 8),
              ),
              y: Math.max(8, Math.min(drag.y + deltaY, window.innerHeight - 64)),
            });
          }}
          onPointerUp={(event) => {
            const drag = orderBellDragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            suppressOrderBellClickRef.current = drag.moved;
            orderBellDragRef.current = null;
          }}
          onPointerCancel={() => {
            orderBellDragRef.current = null;
            suppressOrderBellClickRef.current = false;
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (suppressOrderBellClickRef.current) {
                suppressOrderBellClickRef.current = false;
                return;
              }
              const orderId = newOrderToast?.id;
              setNewOrderToast(null);
              navigate(
                "/pos/ordenes",
                orderId ? { state: { openOrderId: orderId } } : undefined,
              );
            }}
            aria-label={
              newOrderToast
                ? `Abrir pedido ${newOrderToast.number}`
                : "Abrir órdenes"
            }
            className={`flex min-h-11 w-full items-center gap-3 text-left ${
              newOrderToast ? "p-3 pr-10" : "justify-center"
            } cursor-grab active:cursor-grabbing`}
          >
            <span
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              style={{
                backgroundColor: `rgba(${popupColor.rgb}, ${
                  newOrderToast ? 0.2 : 0.12
                })`,
                color: popupColor.hex,
              }}
            >
              <Bell size={18} />
              {newOrderToast && (
                <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full bg-emerald-400 ring-2 ring-neutral-900" />
              )}
            </span>
            {newOrderToast && (
              <span role="status" aria-live="polite" className="min-w-0 flex-1">
                <span className="block text-sm font-bold">
                  ¡Llegó un nuevo pedido!
                </span>
                <span className="mt-1 block truncate text-xs text-neutral-400">
                  Pedido #{newOrderToast.number} · Toca para ver las órdenes
                </span>
              </span>
            )}
          </button>
          {newOrderToast && (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setNewOrderToast(null);
              }}
              aria-label="Contraer aviso del pedido"
              className="absolute right-2 top-2 rounded-full p-1 text-neutral-500 hover:bg-white/10 hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </section>
      )}

      {pushSubscriptionChecked &&
        user?.id &&
        pushSupported &&
        pushPlanEligible &&
        notificationPromptOpen &&
        (browserNotificationPermission === "default" ||
          (browserNotificationPermission === "granted" &&
            !pushSubscriptionActive) ||
          (browserNotificationPermission === "denied" &&
            notificationPromptOpen)) &&
        (
          <section
            aria-label="Notificaciones de pedidos"
            className="fixed bottom-4 right-4 z-[70] w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-neutral-900 p-4 text-white shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-300">
                <Bell size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold">
                  {pushOrdersEligible
                    ? "No te pierdas ningún pedido"
                    : "Recibe el recordatorio de tu plan"}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-neutral-400">
                  {pushOrdersEligible
                    ? "Activa los avisos push de pedidos y del plan, incluso cuando Gloto no esté abierta."
                    : "Tu plan está en periodo de gracia. Activa push para recibir el recordatorio de vencimiento."}
                </p>
              </div>
              <button
                type="button"
                onClick={dismissBrowserNotificationPrompt}
                aria-label="Cerrar aviso"
                className="rounded-full p-1 text-neutral-400 hover:bg-white/10 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            {notificationPromptError && (
              <p role="alert" className="mt-3 text-xs leading-relaxed text-amber-300">
                {notificationPromptError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={dismissBrowserNotificationPrompt}
                className="rounded-xl px-3 py-2 text-xs font-semibold text-neutral-300 hover:bg-white/5"
              >
                No activar
              </button>
              {browserNotificationPermission !== "denied" ? (
                <button
                  type="button"
                  onClick={enableBrowserOrderNotifications}
                  className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-500"
                >
                  Activar push
                </button>
              ) : (
                <button
                  type="button"
                  onClick={dismissBrowserNotificationPrompt}
                  className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-500"
                >
                  Entendido
                </button>
              )}
            </div>
          </section>
        )}

      {isSidebarExpanded && (
        <div
          className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${
            isPosRoute ? "lg:hidden" : ""
          }`}
          onClick={closeSidebar}
        />
      )}

      {inactiveTablesPrompt.length > 0 && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/20 bg-neutral-950 p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
                <Clock size={22} />
              </div>
              <div>
                <h2 className="text-lg font-black text-white">
                  Mesas abiertas por más de 24 horas
                </h2>
                {isInactiveTablesPreview && (
                  <span className="mt-1 inline-block rounded-full bg-violet-500/15 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-violet-300">
                    Vista previa
                  </span>
                )}
                <p className="mt-1 text-sm leading-relaxed text-slate-400">
                  Hay {inactiveTablesPrompt.length} mesa{inactiveTablesPrompt.length === 1 ? "" : "s"} sin actividad desde hace al menos 12 horas.
                </p>
              </div>
            </div>
            <div className="mt-4 max-h-52 space-y-2 overflow-y-auto rounded-xl border border-white/8 bg-white/[0.02] p-2">
              {inactiveTablesPrompt.map((mesa) => (
                <div key={mesa.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm">
                  <span className="font-bold text-white">Mesa {mesa.numero}</span>
                  <span className="text-xs text-slate-400">
                    {Math.floor(Math.max(0, Date.now() - Number(mesa.lastActivityAt)) / 3600000)} h sin actividad
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setInactiveTablesPrompt([])}
                disabled={isClosingInactiveTables}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-300 disabled:opacity-50"
              >
                Revisar después
              </button>
              <button
                type="button"
                onClick={closeInactiveTables}
                disabled={isClosingInactiveTables}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
              >
                {isClosingInactiveTables && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                {isClosingInactiveTables ? "Cerrando..." : "Cerrar todas"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
