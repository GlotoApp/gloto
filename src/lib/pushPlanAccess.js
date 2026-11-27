import { supabase } from "./supabaseClient";

const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_PERIOD_DAYS = 3;

const getPlanEndTimestamp = (subscription) => {
  if (subscription?.ends_at) {
    const timestamp = new Date(subscription.ends_at).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (!subscription?.starts_at) return null;

  const startsAt = new Date(subscription.starts_at).getTime();
  const durationDays = Number(subscription.duration_days) || 30;
  return Number.isFinite(startsAt)
    ? startsAt + durationDays * DAY_MS
    : null;
};

const isProOrPremium = (subscription) => {
  const plan = `${subscription?.plan_code || ""} ${subscription?.plan_name || ""}`
    .trim()
    .toLowerCase();
  return plan.includes("pro") || plan.includes("premium");
};

export const evaluatePushPlanAccess = (subscription, now = Date.now()) => {
  const status = String(subscription?.status || "").toLowerCase();
  const planEnd = getPlanEndTimestamp(subscription);
  const isEligibleTier = isProOrPremium(subscription);
  const hasGracePeriod =
    isEligibleTier &&
    ["active", "expired"].includes(status) &&
    planEnd !== null &&
    now >= planEnd &&
    now < planEnd + GRACE_PERIOD_DAYS * DAY_MS;
  const ordersAllowed =
    isEligibleTier &&
    status === "active" &&
    planEnd !== null &&
    now < planEnd;
  const settingsAllowed = ordersAllowed || hasGracePeriod;

  return {
    planName: subscription?.plan_name || subscription?.plan_code || "",
    isEligibleTier,
    settingsAllowed,
    ordersAllowed,
    planReminderAllowed: hasGracePeriod,
    graceDay: hasGracePeriod
      ? Math.floor((now - planEnd) / DAY_MS) + 1
      : null,
    daysUntilSuspension: hasGracePeriod
      ? Math.max(
          0,
          Math.ceil(
            (planEnd + GRACE_PERIOD_DAYS * DAY_MS - now) / DAY_MS,
          ),
        )
      : null,
  };
};

export const getBusinessPushPlanAccess = async (businessId) => {
  if (!businessId) throw new Error("No se encontró el negocio del usuario.");

  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "plan_code,plan_name,status,ends_at,starts_at,duration_days,created_at",
    )
    .eq("business_id", businessId)
    .in("status", ["active", "expired", "suspended", "cancelled"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return evaluatePushPlanAccess(data);
};
