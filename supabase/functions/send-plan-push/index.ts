import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webPush from "npm:web-push@3.6.7";
import {
  getPlanEndTime,
  isProOrPremiumPlan,
  type BusinessSubscription,
} from "../_shared/planAccess.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_PERIOD_DAYS = 3;
const PAGE_SIZE = 500;

type PlanSubscription = BusinessSubscription & {
  id: string;
  business_id: string;
  created_at: string;
};

type PushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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

const hashEndpoint = async (endpoint: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(endpoint),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const loadLatestSubscriptions = async (adminClient: ReturnType<typeof createClient>) => {
  const latestByBusiness = new Map<string, PlanSubscription>();
  let offset = 0;

  while (true) {
    const { data, error } = await adminClient
      .from("subscriptions")
      .select(
        "id,business_id,plan_code,plan_name,status,ends_at,starts_at,duration_days,created_at",
      )
      .in("status", ["active", "expired", "suspended", "cancelled"])
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;

    for (const subscription of (data || []) as PlanSubscription[]) {
      if (!latestByBusiness.has(subscription.business_id)) {
        latestByBusiness.set(subscription.business_id, subscription);
      }
    }

    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return [...latestByBusiness.values()];
};

Deno.serve(async (request: Request) => {
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
    console.error("Falta configurar Supabase o VAPID para los avisos de plan.");
    return jsonResponse(500, {
      error: "El servicio de avisos de plan no está configurado.",
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const staleClaims = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { error: cleanupError } = await adminClient
      .from("business_plan_push_deliveries")
      .delete()
      .is("sent_at", null)
      .lt("created_at", staleClaims);
    if (cleanupError) {
      console.error("No se pudieron limpiar intentos push incompletos:", cleanupError);
      return jsonResponse(500, {
        error: "No se pudieron preparar los avisos de plan.",
      });
    }

    const subscriptions = await loadLatestSubscriptions(adminClient);
    const now = Date.now();
    const graceSubscriptions = subscriptions.flatMap((subscription) => {
      const endTime = getPlanEndTime(subscription);
      if (
        !isProOrPremiumPlan(subscription) ||
        !["active", "expired"].includes(String(subscription.status || "")) ||
        endTime === null ||
        now < endTime ||
        now >= endTime + GRACE_PERIOD_DAYS * DAY_MS
      ) {
        return [];
      }

      const graceDay = Math.floor((now - endTime) / DAY_MS) + 1;
      const daysRemaining = Math.max(
        0,
        Math.ceil((endTime + GRACE_PERIOD_DAYS * DAY_MS - now) / DAY_MS),
      );
      return [{ subscription, endTime, graceDay, daysRemaining }];
    });

    if (graceSubscriptions.length === 0) {
      return jsonResponse(200, {
        businesses: 0,
        sent: 0,
        reason: "no-pro-or-premium-plans-in-grace-period",
      });
    }

    try {
      webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    } catch (error) {
      console.error("La configuración VAPID no es válida:", error);
      return jsonResponse(500, { error: "La configuración VAPID no es válida." });
    }

    let sent = 0;
    let failed = 0;
    let expired = 0;
    let skipped = 0;

    for (const {
      subscription: plan,
      endTime,
      graceDay,
      daysRemaining,
    } of graceSubscriptions) {
      const { data: devices, error: deviceError } = await adminClient
        .from("order_push_subscriptions")
        .select("endpoint,p256dh,auth")
        .eq("business_id", plan.business_id);
      if (deviceError) {
        console.error(
          "No se pudieron consultar dispositivos para avisar del vencimiento:",
          deviceError,
        );
        failed += 1;
        continue;
      }
      if (!devices?.length) {
        skipped += 1;
        continue;
      }

      const planName = String(plan.plan_name || plan.plan_code || "Pro/Premium");
      const expiryDate = new Intl.DateTimeFormat("es-CO", {
        timeZone: "America/Bogota",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(endTime));
      const dayLabel = daysRemaining === 1 ? "día" : "días";
      const payload = JSON.stringify({
        title: `Quedan ${daysRemaining} ${dayLabel} para suspender tu plan`,
        body: `Tu plan ${planName} venció el ${expiryDate}. Estás en el día ${graceDay} después del vencimiento; la tienda se suspenderá al cumplirse 3 días si no renuevas. Revisa Mi plan para enviar el pago.`,
        tag: `gloto-plan-expiry-${plan.id}-day-${graceDay}`,
        url: "/pos/mi-plan",
        icon: "/favicon.png",
        badge: "/favicon.png",
      });

      for (const device of devices as PushSubscription[]) {
        const endpointHash = await hashEndpoint(device.endpoint);
        const { error: claimError } = await adminClient
          .from("business_plan_push_deliveries")
          .insert({
            subscription_id: plan.id,
            business_id: plan.business_id,
            grace_day: graceDay,
            endpoint_hash: endpointHash,
          });
        if (claimError?.code === "23505") {
          skipped += 1;
          continue;
        }
        if (claimError) {
          console.error("No se pudo reservar el aviso diario del plan:", claimError);
          failed += 1;
          continue;
        }

        try {
          await webPush.sendNotification(
            {
              endpoint: device.endpoint,
              keys: { p256dh: device.p256dh, auth: device.auth },
            },
            payload,
            { TTL: 24 * 60 * 60, urgency: "high" },
          );
          const { error: sentError } = await adminClient
            .from("business_plan_push_deliveries")
            .update({ sent_at: new Date().toISOString() })
            .eq("subscription_id", plan.id)
            .eq("grace_day", graceDay)
            .eq("endpoint_hash", endpointHash);
          if (sentError) {
            console.error("No se pudo registrar el aviso de plan enviado:", sentError);
            failed += 1;
          } else {
            sent += 1;
          }
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
              console.error(
                "No se pudo quitar una suscripción push vencida:",
                deleteError,
              );
            }
            expired += 1;
          } else {
            console.error("Falló el envío del aviso de vencimiento:", error);
            failed += 1;
          }
          const { error: releaseError } = await adminClient
            .from("business_plan_push_deliveries")
            .delete()
            .eq("subscription_id", plan.id)
            .eq("grace_day", graceDay)
            .eq("endpoint_hash", endpointHash);
          if (releaseError) {
            console.error("No se pudo liberar el intento de push fallido:", releaseError);
          }
        }
      }
    }

    return jsonResponse(200, {
      businesses: graceSubscriptions.length,
      sent,
      failed,
      expired,
      skipped,
    });
  } catch (error) {
    console.error("No se pudieron procesar los avisos de vencimiento:", error);
    return jsonResponse(500, {
      error: "No se pudieron procesar los avisos de vencimiento.",
    });
  }
});
