import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webPush from "npm:web-push@3.6.7";
import {
  getPlanEndTime,
  isProOrPremiumPlan,
} from "../_shared/planAccess.ts";

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

const parseQuantity = (value: unknown) => {
  if (value === null || value === undefined || value === "") return 0;
  const quantity = Number(value);
  return Number.isFinite(quantity) ? quantity : null;
};

const formatQuantity = (quantity: number) =>
  Number.isInteger(quantity)
    ? String(quantity)
    : String(Number(quantity.toFixed(3)));

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
    console.error("El webhook de inventario envió JSON inválido:", error);
    return jsonResponse(400, { error: "El evento no contiene JSON válido." });
  }
  if (!isRecord(event)) {
    return jsonResponse(400, { error: "El evento de producto no es válido." });
  }
  if (
    event.type !== "UPDATE" ||
    event.schema !== "public" ||
    event.table !== "products"
  ) {
    return jsonResponse(202, {
      ignored: true,
      reason: "not-a-product-update",
    });
  }
  if (!isRecord(event.record) || !isRecord(event.old_record)) {
    return jsonResponse(400, { error: "El evento de producto no es válido." });
  }

  const product = event.record;
  const oldProduct = event.old_record;
  const productId = typeof product.id === "string" ? product.id : "";
  const businessId =
    typeof product.business_id === "string" ? product.business_id : "";
  const productName =
    typeof product.name === "string" ? product.name.trim().slice(0, 80) : "";
  if (!productId || !businessId || !productName) {
    return jsonResponse(400, {
      error: "El producto no tiene negocio, identificador o nombre.",
    });
  }
  if (product.is_active === false) {
    return jsonResponse(200, { sent: 0, ignored: "product-inactive" });
  }

  const oldStock = parseQuantity(oldProduct.stock);
  const newStock = parseQuantity(product.stock);
  const oldMinimum = parseQuantity(oldProduct.min_stock);
  const newMinimum = parseQuantity(product.min_stock);
  if (
    oldStock === null ||
    newStock === null ||
    oldMinimum === null ||
    newMinimum === null
  ) {
    return jsonResponse(400, {
      error: "El stock o el mínimo del producto no es numérico.",
    });
  }

  const crossedMinimum =
    newStock < oldStock &&
    oldStock > oldMinimum &&
    newStock <= newMinimum;
  if (!crossedMinimum) {
    return jsonResponse(200, { sent: 0, ignored: "stock-threshold-not-crossed" });
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
    console.error("Falta configurar Supabase o VAPID para los avisos de stock.");
    return jsonResponse(500, {
      error: "El servicio de avisos de stock no está configurado.",
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: currentPlan, error: planError } = await adminClient
    .from("subscriptions")
    .select(
      "plan_code,plan_name,status,ends_at,starts_at,duration_days,created_at",
    )
    .eq("business_id", businessId)
    .in("status", ["active", "expired", "suspended", "cancelled"])
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (planError) {
    console.error("No se pudo validar el plan para avisos de stock:", planError);
    return jsonResponse(500, {
      error: "No se pudo validar el plan del negocio.",
    });
  }

  const planEndTime = currentPlan ? getPlanEndTime(currentPlan) : null;
  if (
    !isProOrPremiumPlan(currentPlan) ||
    currentPlan?.status !== "active" ||
    planEndTime === null ||
    Date.now() >= planEndTime
  ) {
    return jsonResponse(200, {
      sent: 0,
      ignored: "active-pro-or-premium-plan-required",
    });
  }

  const { data: settings, error: settingsError } = await adminClient
    .from("business_popup_settings")
    .select("notify_stock_alerts")
    .eq("business_id", businessId)
    .maybeSingle();
  if (settingsError) {
    console.error("No se pudo leer la preferencia de avisos de stock:", settingsError);
    return jsonResponse(500, {
      error: "No se pudo consultar la preferencia de avisos de stock.",
    });
  }
  if (!settings?.notify_stock_alerts) {
    return jsonResponse(200, {
      sent: 0,
      ignored: "stock-alerts-disabled",
    });
  }

  const { data: business, error: businessError } = await adminClient
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .maybeSingle();
  if (businessError) {
    console.error("No se pudo consultar el negocio para el aviso de stock:", businessError);
    return jsonResponse(500, {
      error: "No se pudo cargar el nombre del negocio.",
    });
  }
  const businessName = String(business?.name || "").trim().slice(0, 80);
  if (!businessName) {
    return jsonResponse(500, {
      error: "El negocio del producto no tiene un nombre configurado.",
    });
  }

  const { data: devices, error: devicesError } = await adminClient
    .from("order_push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("business_id", businessId);
  if (devicesError) {
    console.error("No se pudieron consultar los dispositivos para avisos de stock:", devicesError);
    return jsonResponse(500, {
      error: "No se pudieron consultar las suscripciones push.",
    });
  }
  if (!devices?.length) {
    return jsonResponse(200, { sent: 0, reason: "no-subscribed-devices" });
  }

  try {
    webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  } catch (error) {
    console.error("La configuración VAPID no es válida:", error);
    return jsonResponse(500, { error: "La configuración VAPID no es válida." });
  }

  const unit = String(product.unit || "unidades").trim().slice(0, 20) || "unidades";
  const minimumLabel = `${formatQuantity(newMinimum)} ${unit}`;
  const exhausted = newStock <= 0;
  const payload = JSON.stringify({
    title: exhausted
      ? `Producto agotado (${businessName})`
      : `Stock bajo (${businessName})`,
    body: exhausted
      ? `${productName} se agotó.`
      : `${productName}: quedan ${formatQuantity(newStock)} ${unit}; mínimo configurado: ${minimumLabel}.`,
    tag: `gloto-stock-${productId}-${Date.now()}`,
    url: "/pos/productos",
    icon: "/favicon.png",
    badge: "/favicon.png",
  });

  const results = await Promise.all(
    devices.map(async (device) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: device.endpoint,
            keys: { p256dh: device.p256dh, auth: device.auth },
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
            .eq("endpoint", device.endpoint);
          if (deleteError) {
            console.error("No se pudo quitar una suscripción push vencida:", deleteError);
          }
          return "expired";
        }
        console.error("Falló el envío push del aviso de stock:", error);
        return "failed";
      }
    }),
  );

  const sent = results.filter((result) => result === "sent").length;
  const failed = results.filter((result) => result === "failed").length;
  const expired = results.filter((result) => result === "expired").length;
  return jsonResponse(200, { sent, failed, expired });
});
