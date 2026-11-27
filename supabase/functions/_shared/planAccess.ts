export type BusinessSubscription = {
  plan_code?: string | null;
  plan_name?: string | null;
  status?: string | null;
  ends_at?: string | null;
  starts_at?: string | null;
  duration_days?: number | string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const isProOrPremiumPlan = (
  subscription: BusinessSubscription | null,
) => {
  const plan = `${subscription?.plan_code || ""} ${subscription?.plan_name || ""}`
    .trim()
    .toLowerCase();
  return plan.includes("pro") || plan.includes("premium");
};

export const getPlanEndTime = (
  subscription: BusinessSubscription | null,
) => {
  if (!subscription) return null;
  if (subscription.ends_at) {
    const endsAt = new Date(subscription.ends_at).getTime();
    return Number.isFinite(endsAt) ? endsAt : null;
  }
  if (!subscription.starts_at) return null;

  const startsAt = new Date(subscription.starts_at).getTime();
  const durationDays = Number(subscription.duration_days) || 30;
  return Number.isFinite(startsAt)
    ? startsAt + durationDays * DAY_MS
    : null;
};
