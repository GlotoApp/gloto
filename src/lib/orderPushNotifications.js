import { supabase } from "./supabaseClient";
import {
  getCurrentPushSubscription,
  getOrCreatePushSubscription,
  supportsPushNotifications,
} from "./pushNotifications";

export const supportsOrderPushNotifications = supportsPushNotifications;

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
  return getCurrentPushSubscription();
};

export const syncOrderPushSubscription = saveOrderPushSubscription;

export const enableOrderPushNotifications = async () => {
  if (!supportsPushNotifications()) {
    throw new Error(
      "Este navegador no admite notificaciones push o requiere una conexión segura.",
    );
  }
  if (Notification.permission !== "granted") {
    throw new Error("Primero debes permitir las notificaciones del navegador.");
  }

  const { registration, subscription } = await getOrCreatePushSubscription();
  await saveOrderPushSubscription(subscription);
  return registration;
};
