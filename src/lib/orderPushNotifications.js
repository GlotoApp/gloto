import { supabase } from "./supabaseClient";

const getVapidApplicationServerKey = () => {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();
  if (!key) {
    throw new Error(
      "Falta configurar la clave pública VAPID para notificaciones push.",
    );
  }
  const base64 = key.replace(/-/g, "+").replace(/_/g, "/");
  const paddedBase64 = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  return Uint8Array.from(
    atob(paddedBase64),
    (character) => character.charCodeAt(0),
  );
};

export const supportsOrderPushNotifications = () =>
  typeof window !== "undefined" &&
  "Notification" in window &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  window.isSecureContext;

const saveOrderPushSubscription = async (subscription) => {
  const keys = subscription.toJSON().keys;
  if (!keys?.p256dh || !keys.auth) {
    throw new Error("El navegador no entregó las claves de la suscripción push.");
  }

  const { error } = await supabase.rpc("register_order_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
  });
  if (error) throw error;
};

export const getOrderPushSubscription = async () => {
  if (!supportsOrderPushNotifications()) return null;

  const registration = await navigator.serviceWorker.getRegistration();
  return registration?.pushManager.getSubscription() || null;
};

export const syncOrderPushSubscription = saveOrderPushSubscription;

export const enableOrderPushNotifications = async () => {
  if (!supportsOrderPushNotifications()) {
    throw new Error(
      "Este navegador no admite notificaciones push o requiere una conexión segura.",
    );
  }
  if (Notification.permission !== "granted") {
    throw new Error("Primero debes permitir las notificaciones del navegador.");
  }

  const registration = await navigator.serviceWorker.register(
    "/service-worker.js",
  );
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: getVapidApplicationServerKey(),
    }));

  await saveOrderPushSubscription(subscription);
  return registration;
};
