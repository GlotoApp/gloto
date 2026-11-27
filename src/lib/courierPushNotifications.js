import { supabase } from "./supabaseClient";
import {
  getCurrentPushSubscription,
  getOrCreatePushSubscription,
  supportsPushNotifications,
} from "./pushNotifications";

const saveCourierPushSubscription = async (subscription) => {
  const keys = subscription.toJSON().keys;
  if (!keys?.p256dh || !keys.auth) {
    throw new Error("El navegador no entregó las claves de la suscripción push.");
  }

  const { error } = await supabase.rpc("register_courier_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
  });
  if (error) throw error;
};

export const supportsCourierPushNotifications = supportsPushNotifications;

export const getCourierPushSubscription = getCurrentPushSubscription;

export const syncCourierPushSubscription = saveCourierPushSubscription;

export const enableCourierPushNotifications = async () => {
  if (!supportsPushNotifications()) {
    throw new Error(
      "Este navegador no admite notificaciones push o requiere una conexión segura.",
    );
  }
  if (Notification.permission !== "granted") {
    throw new Error("Primero debes permitir las notificaciones del navegador.");
  }

  const { registration, subscription } = await getOrCreatePushSubscription();
  await saveCourierPushSubscription(subscription);
  return registration;
};
