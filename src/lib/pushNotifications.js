export const getVapidApplicationServerKey = () => {
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

const isIosDevice = () =>
  typeof navigator !== "undefined" &&
  (/iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const isStandaloneApp = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true);

export const getPushUnsupportedReason = () => {
  if (typeof window === "undefined") {
    return "Las notificaciones push solo se pueden activar desde un navegador.";
  }
  if (!window.isSecureContext) {
    return "Las notificaciones requieren que Gloto esté abierta con una conexión HTTPS segura.";
  }
  if (
    isIosDevice() &&
    !isStandaloneApp()
  ) {
    return "En iPhone o iPad, instala Gloto Domiciliarios en la pantalla de inicio y ábrela desde su icono antes de activar las notificaciones (iOS/iPadOS 16.4 o posterior).";
  }
  if (
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return "Este navegador no admite notificaciones push. Actualiza el navegador o prueba con uno compatible.";
  }
  return "";
};

export const supportsPushNotifications = () =>
  typeof window !== "undefined" &&
  "Notification" in window &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  window.isSecureContext &&
  (!isIosDevice() || isStandaloneApp());

export const getCurrentPushSubscription = async () => {
  if (!supportsPushNotifications()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration?.pushManager.getSubscription() || null;
};

export const getOrCreatePushSubscription = async () => {
  if (!supportsPushNotifications()) {
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

  return { registration, subscription };
};
