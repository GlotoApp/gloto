import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webPush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-gloto-order-push-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const matchesSecret = (provided: string, expected: string) => {
  if (provided.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const expectedSecret = Deno.env.get("ORDER_PUSH_WEBHOOK_SECRET");
  const providedSecret = request.headers.get("x-gloto-order-push-secret");
  if (
    !expectedSecret ||
    !providedSecret ||
    !matchesSecret(providedSecret, expectedSecret)
  ) {
    return jsonResponse(401, { error: "La solicitud no está autorizada." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !vapidPublicKey ||
    !vapidPrivateKey ||
    !vapidSubject
  ) {
    console.error("Falta configurar Supabase o VAPID para el envío push.");
    return jsonResponse(500, {
      error: "El servicio de notificaciones push no está configurado.",
    });
  }

  let event: unknown;
  try {
    event = await request.json();
  } catch (error) {
    console.error("El webhook de pedidos envió JSON inválido:", error);
    return jsonResponse(400, { error: "El evento no contiene JSON válido." });
  }
  if (!isRecord(event) || !isRecord(event.record)) {
    return jsonResponse(400, { error: "El evento de pedido no es válido." });
  }
  if (
    event.type !== "INSERT" ||
    event.schema !== "public" ||
    event.table !== "orders"
  ) {
    return jsonResponse(202, { ignored: true, reason: "not-an-order-insert" });
  }

  const order = event.record;
  const orderId = typeof order.id === "string" ? order.id : "";
  const businessId =
    typeof order.business_id === "string" ? order.business_id : "";
  if (!orderId || !businessId) {
    return jsonResponse(400, { error: "El pedido no tiene negocio o identificador." });
  }
  if (order.is_reservation === true) {
    return jsonResponse(200, { sent: 0, ignored: "reservation" });
  }

  const metadata = isRecord(order.metadata) ? order.metadata : {};
  const channel = String(metadata.canal || "").toLowerCase();
  if (!["marketplace", "pos"].includes(channel)) {
    return jsonResponse(200, { sent: 0, ignored: "unsupported-order-channel" });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: settings, error: settingsError } = await adminClient
    .from("business_popup_settings")
    .select("notify_marketplace_orders,notify_pos_orders")
    .eq("business_id", businessId)
    .maybeSingle();
  if (settingsError) {
    console.error("No se pudieron leer las preferencias de pedidos:", settingsError);
    return jsonResponse(500, {
      error: "No se pudieron consultar las preferencias de notificación.",
    });
  }

  const shouldNotify =
    channel === "marketplace"
      ? settings?.notify_marketplace_orders ?? true
      : settings?.notify_pos_orders ?? false;
  if (!shouldNotify) {
    return jsonResponse(200, { sent: 0, ignored: "business-setting-disabled" });
  }

  const { data: subscriptions, error: subscriptionsError } = await adminClient
    .from("order_push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("business_id", businessId);
  if (subscriptionsError) {
    console.error("No se pudieron consultar las suscripciones push:", subscriptionsError);
    return jsonResponse(500, {
      error: "No se pudieron consultar las suscripciones push.",
    });
  }
  if (!subscriptions?.length) {
    return jsonResponse(200, { sent: 0, reason: "no-subscribed-devices" });
  }

  try {
    webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  } catch (error) {
    console.error("La configuración VAPID no es válida:", error);
    return jsonResponse(500, { error: "La configuración VAPID no es válida." });
  }

  const orderNumber = String(
    order.order_number || orderId.slice(0, 8).toUpperCase(),
  ).slice(0, 40);
  const orderUrl = new URL("/pos/ordenes", "https://gloto.invalid");
  orderUrl.searchParams.set("openOrderId", orderId);
  const payload = JSON.stringify({
    title: "Nuevo pedido recibido",
    body: `Pedido #${orderNumber}. Toca para revisarlo.`,
    tag: `gloto-order-${orderId}`,
    url: `${orderUrl.pathname}${orderUrl.search}`,
    icon: "/favicon.png",
    badge: "/favicon.png",
  });

  const results = await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload,
          { TTL: 60 * 60, urgency: "high" },
        );
        return "sent";
      } catch (error) {
        const statusCode =
          isRecord(error) && typeof error.statusCode === "number"
            ? error.statusCode
            : null;
        if (statusCode === 404 || statusCode === 410) {
          const { error: deleteError } = await adminClient
            .from("order_push_subscriptions")
            .delete()
            .eq("endpoint", subscription.endpoint);
          if (deleteError) {
            console.error("No se pudo quitar una suscripción vencida:", deleteError);
          }
          return "expired";
        }
        console.error("Falló el envío push a un dispositivo:", error);
        return "failed";
      }
    }),
  );

  const sent = results.filter((result) => result === "sent").length;
  const failed = results.filter((result) => result === "failed").length;
  const expired = results.filter((result) => result === "expired").length;
  return jsonResponse(200, { sent, failed, expired });
});
