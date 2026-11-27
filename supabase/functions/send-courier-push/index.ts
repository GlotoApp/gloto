import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webPush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-gloto-order-push-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CourierPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
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

  let event: unknown;
  try {
    event = await request.json();
  } catch (error) {
    console.error("El webhook de ofertas de domicilio envió JSON inválido:", error);
    return jsonResponse(400, { error: "El evento no contiene JSON válido." });
  }
  if (!isRecord(event)) {
    return jsonResponse(400, { error: "El evento de oferta no es válido." });
  }
  if (
    event.type !== "UPDATE" ||
    event.schema !== "public" ||
    event.table !== "courier_order_dispatches"
  ) {
    return jsonResponse(202, {
      ignored: true,
      reason: "not-a-courier-dispatch-update",
    });
  }
  if (!isRecord(event.record) || !isRecord(event.old_record)) {
    return jsonResponse(400, { error: "El evento de oferta no es válido." });
  }

  const dispatch = event.record;
  const previousDispatch = event.old_record;
  const orderId = typeof dispatch.order_id === "string" ? dispatch.order_id : "";
  const courierUserId =
    typeof dispatch.assigned_courier_id === "string"
      ? dispatch.assigned_courier_id
      : "";
  const previousCourierId =
    typeof previousDispatch.assigned_courier_id === "string"
      ? previousDispatch.assigned_courier_id
      : "";
  if (
    !orderId ||
    !courierUserId ||
    previousCourierId === courierUserId ||
    !["store", "public"].includes(String(dispatch.phase || ""))
  ) {
    return jsonResponse(200, {
      sent: 0,
      ignored: "no-new-active-courier-offer",
    });
  }

  const offerExpiresAt =
    typeof dispatch.offer_expires_at === "string"
      ? Date.parse(dispatch.offer_expires_at)
      : Number.NaN;
  if (!Number.isFinite(offerExpiresAt) || offerExpiresAt <= Date.now()) {
    return jsonResponse(200, { sent: 0, ignored: "offer-expired" });
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
    console.error("Falta configurar Supabase o VAPID para los avisos a domiciliarios.");
    return jsonResponse(500, {
      error: "El servicio de avisos a domiciliarios no está configurado.",
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: currentDispatch, error: dispatchError } = await adminClient
    .from("courier_order_dispatches")
    .select("assigned_courier_id,phase,offer_expires_at")
    .eq("order_id", orderId)
    .maybeSingle();
  if (dispatchError) {
    console.error("No se pudo validar la oferta asignada:", dispatchError);
    return jsonResponse(500, { error: "No se pudo validar la oferta." });
  }
  if (
    currentDispatch?.assigned_courier_id !== courierUserId ||
    !["store", "public"].includes(String(currentDispatch?.phase || "")) ||
    !currentDispatch.offer_expires_at ||
    Date.parse(currentDispatch.offer_expires_at) <= Date.now()
  ) {
    return jsonResponse(200, { sent: 0, ignored: "offer-no-longer-active" });
  }

  const { data: courierProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", courierUserId)
    .maybeSingle();
  if (profileError) {
    console.error("No se pudo validar la cuenta del domiciliario:", profileError);
    return jsonResponse(500, { error: "No se pudo validar el domiciliario." });
  }
  if (String(courierProfile?.role || "").toLowerCase() !== "domiciliario") {
    return jsonResponse(200, { sent: 0, ignored: "not-a-courier-account" });
  }

  const { data: order, error: orderError } = await adminClient
    .from("orders")
    .select("id,business_id,order_number")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) {
    console.error("No se pudo cargar el domicilio asignado:", orderError);
    return jsonResponse(500, { error: "No se pudo cargar el domicilio." });
  }
  if (!order?.business_id) {
    return jsonResponse(200, { sent: 0, ignored: "order-without-business" });
  }

  const { data: business, error: businessError } = await adminClient
    .from("businesses")
    .select("name")
    .eq("id", order.business_id)
    .maybeSingle();
  if (businessError) {
    console.error("No se pudo cargar la tienda del domicilio:", businessError);
    return jsonResponse(500, { error: "No se pudo cargar la tienda." });
  }

  const { data: subscriptions, error: subscriptionsError } = await adminClient
    .from("courier_push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("courier_user_id", courierUserId);
  if (subscriptionsError) {
    console.error("No se pudieron consultar los dispositivos del domiciliario:", subscriptionsError);
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

  const businessName = String(business?.name || "Gloto").trim().slice(0, 60);
  const orderNumber = String(
    order.order_number || order.id.slice(0, 8).toUpperCase(),
  ).slice(0, 40);
  const payload = JSON.stringify({
    title: `Nuevo domicilio · ${businessName}`,
    body: `Tienes una nueva oferta de entrega. Pedido #${orderNumber}.`,
    tag: `gloto-courier-offer-${orderId}`,
    url: "/domiciliarios",
    icon: "/gloto-domiciliarios.svg",
    badge: "/gloto-domiciliarios.svg",
  });

  const results = await Promise.all(
    subscriptions.map(async (subscription: CourierPushSubscription) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
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
            .from("courier_push_subscriptions")
            .delete()
            .eq("endpoint", subscription.endpoint);
          if (deleteError) {
            console.error(
              "No se pudo quitar una suscripción de domiciliario vencida:",
              deleteError,
            );
          }
          return "expired";
        }
        console.error("Falló el envío push al domiciliario:", error);
        return "failed";
      }
    }),
  );

  return jsonResponse(200, {
    sent: results.filter((result) => result === "sent").length,
    failed: results.filter((result) => result === "failed").length,
    expired: results.filter((result) => result === "expired").length,
  });
});
