import { useEffect, useState } from "react";
import { Bell, Check, LoaderCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../src/components/AuthContext";
import { getBusinessPushPlanAccess } from "../../src/lib/pushPlanAccess";
import {
  enableOrderPushNotifications,
  getOrderPushSubscription,
  supportsOrderPushNotifications,
} from "../../src/lib/orderPushNotifications";
import { supabase } from "../../src/lib/supabaseClient";

const DEFAULT_SETTINGS = {
  show_widget: true,
  notify_marketplace_orders: true,
  notify_pos_orders: false,
  sound_enabled: true,
  color: "violet",
};

const ORDER_NOTIFICATION_OPTIONS = [
  {
    key: "notify_marketplace_orders",
    title: "Pedidos de clientes",
    description: "Recibir un push cuando llegue un pedido desde Marketplace.",
  },
  {
    key: "notify_pos_orders",
    title: "Pedidos del POS",
    description: "Recibir un push cuando se registre un pedido desde el POS.",
  },
];

export default function NotificacionesPush() {
  const { user } = useAuth();
  const [businessId, setBusinessId] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [planAccess, setPlanAccess] = useState(null);
  const [settingsRowExists, setSettingsRowExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [devicePushSupported, setDevicePushSupported] = useState(false);
  const [devicePushActive, setDevicePushActive] = useState(false);
  const [devicePushLoading, setDevicePushLoading] = useState(true);
  const [devicePushSaving, setDevicePushSaving] = useState(false);
  const [devicePushError, setDevicePushError] = useState("");
  const [devicePushMessage, setDevicePushMessage] = useState("");

  useEffect(() => {
    let active = true;

    const checkDeviceSubscription = async () => {
      const supported = supportsOrderPushNotifications();
      if (!active) return;
      setDevicePushSupported(supported);
      if (!supported) {
        setDevicePushLoading(false);
        return;
      }

      try {
        const subscription = await getOrderPushSubscription();
        if (active) setDevicePushActive(Boolean(subscription));
      } catch (error) {
        if (!active) return;
        console.error(
          "No se pudo consultar la suscripción push de este dispositivo:",
          error,
        );
        setDevicePushError(
          "No se pudo comprobar si este dispositivo tiene push activado.",
        );
      } finally {
        if (active) setDevicePushLoading(false);
      }
    };

    checkDeviceSubscription().catch((error) => {
      if (!active) return;
      console.error(
        "Error consultando la suscripción push de este dispositivo:",
        error,
      );
      setDevicePushError("No se pudo comprobar la suscripción de este dispositivo.");
      setDevicePushLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const activatePushOnDevice = async () => {
    if (
      !planAccess?.settingsAllowed ||
      !devicePushSupported ||
      devicePushSaving
    ) {
      return;
    }

    setDevicePushSaving(true);
    setDevicePushError("");
    setDevicePushMessage("");
    try {
      const permission =
        window.Notification.permission === "granted"
          ? "granted"
          : await window.Notification.requestPermission();
      if (permission !== "granted") {
        setDevicePushError(
          "Permite las notificaciones de Gloto en la configuración del navegador o del dispositivo.",
        );
        return;
      }

      const registration = await enableOrderPushNotifications();
      setDevicePushActive(true);
      setDevicePushMessage("Push quedó activado en este dispositivo.");
      try {
        await registration.showNotification("Notificaciones activadas", {
          body: "Este dispositivo recibirá avisos de pedidos según tus preferencias.",
          tag: "gloto-notifications-enabled",
        });
      } catch (error) {
        console.error(
          "Push quedó activo, pero no se pudo mostrar el aviso de prueba:",
          error,
        );
        setDevicePushError(
          "Push quedó activado, pero no se pudo mostrar el aviso de prueba. Revisa los permisos del sistema.",
        );
      }
    } catch (error) {
      console.error(
        "No se pudo activar push en este dispositivo:",
        error,
      );
      setDevicePushError(
        error instanceof Error
          ? error.message
          : "No se pudo activar push en este dispositivo.",
      );
    } finally {
      setDevicePushSaving(false);
    }
  };

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      if (!user?.id) {
        setBusinessId(null);
        setLoadFailed(true);
        setErrorMessage("Inicia sesión para configurar las notificaciones.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadFailed(false);
      setErrorMessage("");
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!active) return;
      if (profileError || !profile?.business_id) {
        console.error(
          "No se pudo identificar el negocio para las notificaciones push:",
          profileError,
        );
        setLoadFailed(true);
        setErrorMessage("No se pudo cargar la configuración del negocio.");
        setLoading(false);
        return;
      }

      setBusinessId(profile.business_id);
      const [settingsResult, currentPlanAccess] = await Promise.all([
        supabase
          .from("business_popup_settings")
          .select(
            "show_widget, notify_marketplace_orders, notify_pos_orders, sound_enabled, color",
          )
          .eq("business_id", profile.business_id)
          .maybeSingle(),
        getBusinessPushPlanAccess(profile.business_id),
      ]);

      if (!active) return;
      setPlanAccess(currentPlanAccess);
      if (settingsResult.error) {
        console.error(
          "No se pudo cargar la configuración de notificaciones push:",
          settingsResult.error,
        );
        setLoadFailed(true);
        setErrorMessage("No se pudo cargar la configuración de notificaciones.");
      } else {
        setSettings({ ...DEFAULT_SETTINGS, ...settingsResult.data });
        setSettingsRowExists(Boolean(settingsResult.data));
      }
      setLoading(false);
    };

    loadSettings().catch((error) => {
      if (!active) return;
      console.error(
        "Error cargando la configuración de notificaciones push:",
        error,
      );
      setLoadFailed(true);
      setErrorMessage("Ocurrió un error al cargar la configuración.");
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [user?.id]);

  const updateSetting = async (key) => {
    if (!businessId || !planAccess?.ordersAllowed || savingKey) return;

    const value = !settings[key];
    const nextSettings = { ...settings, [key]: value };
    setSettings(nextSettings);
    setSavingKey(key);
    setSavedKey("");
    setErrorMessage("");

    try {
      const query = settingsRowExists
        ? supabase
            .from("business_popup_settings")
            .update({ [key]: value, updated_at: new Date().toISOString() })
            .eq("business_id", businessId)
        : supabase.from("business_popup_settings").insert({
            business_id: businessId,
            [key]: value,
            updated_at: new Date().toISOString(),
          });
      const { error } = await query;
      if (error) throw error;

      setSettingsRowExists(true);
      setSavedKey(key);
      window.dispatchEvent(
        new CustomEvent("gloto:popup-settings-changed", {
          detail: nextSettings,
        }),
      );
      window.setTimeout(() => setSavedKey(""), 2000);
    } catch (error) {
      console.error(
        "No se pudo guardar la configuración de notificaciones push:",
        error,
      );
      setSettings((current) => ({ ...current, [key]: !value }));
      setErrorMessage(
        "No se pudo guardar el cambio. Inténtalo de nuevo.",
      );
    } finally {
      setSavingKey("");
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-6 font-sans text-white sm:px-8 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 border-b border-white/10 pb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-400">
            Configuración
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-black tracking-tight">
            <Bell size={22} className="text-violet-300" />
            Notificaciones push
          </h1>
          <p className="mt-2 text-sm leading-6 text-neutral-400">
            Elige qué pedidos deben generar avisos push en los dispositivos que
            hayan activado las notificaciones de Gloto.
          </p>
        </header>

        <main className="rounded-3xl bg-neutral-900/40 p-4 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-neutral-400">
              <LoaderCircle size={16} className="animate-spin" />
              Cargando preferencias...
            </div>
          ) : loadFailed ? (
            <p
              role="alert"
              className="rounded-xl bg-rose-500/10 p-4 text-sm text-rose-200"
            >
              {errorMessage}
            </p>
          ) : !planAccess?.settingsAllowed ? (
            <section className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-5">
              <h2 className="text-sm font-bold text-white">
                Push disponible en Pro y Premium
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-neutral-300">
                Las notificaciones push de pedidos y los recordatorios del plan
                están disponibles para negocios con Pro o Premium activo. En el
                periodo de gracia solo se envía el recordatorio de vencimiento.
              </p>
              <Link
                to="/pos/planes"
                className="mt-4 inline-flex rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-500"
              >
                Ver planes
              </Link>
            </section>
          ) : (
            <>
              {planAccess.planReminderAllowed && (
                <p className="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-amber-100">
                  Tu plan {planAccess.planName} está en periodo de gracia. Los
                  avisos de pedidos están pausados; el recordatorio de
                  vencimiento puede llegar durante estos días.
                </p>
              )}
              <section className="mb-5 rounded-2xl bg-neutral-900/60 p-4">
                <h2 className="text-sm font-bold text-white">
                  Este dispositivo
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-neutral-400">
                  Activa o revisa la suscripción push de este teléfono o
                  navegador. Cada dispositivo se configura por separado.
                </p>
                {devicePushLoading ? (
                  <div className="mt-4 flex items-center gap-2 text-xs text-neutral-400">
                    <LoaderCircle size={14} className="animate-spin" />
                    Revisando este dispositivo...
                  </div>
                ) : !devicePushSupported ? (
                  <p className="mt-4 text-xs leading-relaxed text-amber-300">
                    Este navegador no admite push o necesita una conexión
                    segura. En iPhone, instala Gloto en la pantalla de inicio y
                    ábrela desde su icono.
                  </p>
                ) : devicePushActive ? (
                  <p className="mt-4 flex items-center gap-2 text-xs text-emerald-300">
                    <Check size={14} />
                    Push está activado en este dispositivo.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={activatePushOnDevice}
                    disabled={devicePushSaving}
                    className="mt-4 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-500 disabled:opacity-50"
                  >
                    {devicePushSaving
                      ? "Activando..."
                      : "Activar push en este dispositivo"}
                  </button>
                )}
                {devicePushError && (
                  <p role="alert" className="mt-3 text-xs text-rose-300">
                    {devicePushError}
                  </p>
                )}
                {devicePushMessage && (
                  <p role="status" className="mt-3 text-xs text-emerald-300">
                    {devicePushMessage}
                  </p>
                )}
              </section>

              <div className="divide-y divide-white/5">
                {ORDER_NOTIFICATION_OPTIONS.map(
                  ({ key, title, description }) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-4 py-5 first:pt-2 last:pb-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-100">
                          {title}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-neutral-400">
                          {description}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings[key]}
                        aria-label={title}
                        disabled={
                          !planAccess.ordersAllowed || Boolean(savingKey)
                        }
                        onClick={() => updateSetting(key)}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                          settings[key] ? "bg-violet-500" : "bg-white/15"
                        }`}
                      >
                        <span
                          className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                            settings[key] ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  ),
                )}
              </div>

              {errorMessage && (
                <p
                  role="alert"
                  className="mt-4 rounded-xl bg-rose-500/10 p-3 text-xs text-rose-200"
                >
                  {errorMessage}
                </p>
              )}
              {savedKey && (
                <p
                  role="status"
                  className="mt-4 flex items-center gap-2 text-xs text-emerald-300"
                >
                  <Check size={14} />
                  Preferencia guardada.
                </p>
              )}
              <p className="mt-5 border-t border-white/5 pt-4 text-xs leading-5 text-neutral-500">
                Esta pantalla configura los tipos de pedido. Cada celular debe
                activar las notificaciones push desde Gloto y permitirlas en el
                navegador o en el sistema.
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
