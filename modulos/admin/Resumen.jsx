import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  Bell,
  Bike,
  Building2,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Megaphone,
  ReceiptText,
  Star,
  Store,
  WalletCards,
  XCircle,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import SuperAdminSectionShell from "./ContenedorSeccion";
import SuperAdminStatCard from "./TarjetaIndicador";
import { useAdminRealtime } from "./useAdminRealtime";

const DASHBOARD_REALTIME_TABLES = [
  "businesses",
  "business_info",
  "subscriptions",
  "payment_records",
  "promotions",
  "business_plan_change_requests",
  "business_notifications",
  "billing_plan_periods",
  "billing_plan_features",
  "public_courier_applications",
  "public_courier_topups",
];

const countQuery = async (
  table,
  configure = (query) => query,
  column = "id",
) => {
  let query = supabase
    .from(table)
    .select(column, { count: "exact", head: true });
  query = configure(query);
  const { count, error } = await query;
  return { value: error ? null : count || 0, error };
};

const paidTotalQuery = async (
  table,
  amountColumn,
  statusColumn,
  startOfMonth,
  endOfMonth,
) => {
  const pageSize = 500;
  let offset = 0;
  let total = 0;

  while (true) {
    let query = supabase
      .from(table)
      .select(amountColumn)
      .eq(statusColumn, "paid")
      .order("id", { ascending: true });
    if (startOfMonth) query = query.gte("paid_at", startOfMonth);
    if (endOfMonth) query = query.lt("paid_at", endOfMonth);
    query = query.range(offset, offset + pageSize - 1);
    const { data, error } = await query;

    if (error) return { value: null, error };

    const rows = data || [];
    total += rows.reduce((sum, row) => sum + Number(row[amountColumn] || 0), 0);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return { value: total, error: null };
};

const SuperAdminDashboardOverview = ({ total, active, inactive }) =>
  total === undefined ? (
    <SuperAdminDashboardData />
  ) : (
    <Stats total={total} active={active} inactive={inactive} />
  );

const SuperAdminDashboardData = () => {
  const [metrics, setMetrics] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const scheduleRefresh = useCallback(
    () => setRefreshKey((current) => current + 1),
    [],
  );

  useAdminRealtime(DASHBOARD_REALTIME_TABLES, scheduleRefresh);

  useEffect(() => {
    let isMounted = true;

    const loadMetrics = async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthStartIso = monthStart.toISOString();
      const nextMonthStart = new Date(
        monthStart.getFullYear(),
        monthStart.getMonth() + 1,
        1,
      );
      const nextMonthStartIso = nextMonthStart.toISOString();
      const nowIso = new Date().toISOString();
      const nextWeekIso = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const [
        businesses,
        activeBusinesses,
        newBusinesses,
        businessInfo,
        ratedBusinesses,
        courierEnabledBusinesses,
        totalSubscriptions,
        activeSubscriptions,
        pendingSubscriptions,
        expiredSubscriptions,
        suspendedSubscriptions,
        cancelledSubscriptions,
        expiringSubscriptions,
        totalSubscriptionPayments,
        pendingPayments,
        paidPayments,
        failedPayments,
        rejectedPayments,
        refundedPayments,
        totalPromotions,
        pendingPromotions,
        paidPromotions,
        activePromotions,
        totalPlanChangeRequests,
        awaitingPaymentPlanChanges,
        pendingReviewPlanChanges,
        scheduledPlanChanges,
        totalBusinessNotifications,
        unreadBusinessNotifications,
        unresolvedBusinessNotifications,
        activeBillingPeriods,
        activePlanFeatures,
        totalCourierApplications,
        pendingCourierApplications,
        totalCourierTopups,
        pendingCourierTopups,
        subscriptionsRevenue,
        promotionsRevenue,
        subscriptionsRevenueAllTime,
        promotionsRevenueAllTime,
      ] = await Promise.all([
        countQuery("businesses"),
        countQuery("businesses", (query) => query.eq("is_active", true)),
        countQuery("businesses", (query) =>
          query.gte("created_at", monthStartIso),
        ),
        countQuery("business_info", undefined, "business_id"),
        countQuery(
          "business_info",
          (query) => query.gt("rating_count", 0),
          "business_id",
        ),
        countQuery(
          "business_info",
          (query) => query.eq("public_courier_enabled", true),
          "business_id",
        ),
        countQuery("subscriptions"),
        countQuery("subscriptions", (query) => query.eq("status", "active")),
        countQuery("subscriptions", (query) => query.eq("status", "pending")),
        countQuery("subscriptions", (query) => query.eq("status", "expired")),
        countQuery("subscriptions", (query) => query.eq("status", "suspended")),
        countQuery("subscriptions", (query) => query.eq("status", "cancelled")),
        countQuery("subscriptions", (query) =>
          query
            .eq("status", "active")
            .gte("ends_at", nowIso)
            .lte("ends_at", nextWeekIso),
        ),
        countQuery("payment_records"),
        countQuery("payment_records", (query) => query.eq("status", "pending")),
        countQuery("payment_records", (query) =>
          query
            .eq("status", "paid")
            .gte("paid_at", monthStartIso)
            .lt("paid_at", nextMonthStartIso),
        ),
        countQuery("payment_records", (query) => query.eq("status", "failed")),
        countQuery("payment_records", (query) =>
          query.eq("status", "rejected"),
        ),
        countQuery("payment_records", (query) =>
          query.eq("status", "refunded"),
        ),
        countQuery("promotions"),
        countQuery("promotions", (query) =>
          query.eq("payment_status", "pending"),
        ),
        countQuery("promotions", (query) =>
          query
            .eq("payment_status", "paid")
            .gte("paid_at", monthStartIso)
            .lt("paid_at", nextMonthStartIso),
        ),
        countQuery("promotions", (query) =>
          query.eq("payment_status", "paid").eq("is_active", true),
        ),
        countQuery("business_plan_change_requests"),
        countQuery("business_plan_change_requests", (query) =>
          query.eq("status", "awaiting_payment"),
        ),
        countQuery("business_plan_change_requests", (query) =>
          query.eq("status", "pending_review"),
        ),
        countQuery("business_plan_change_requests", (query) =>
          query.not("scheduled_subscription_id", "is", null),
        ),
        countQuery("business_notifications"),
        countQuery("business_notifications", (query) =>
          query.is("read_at", null),
        ),
        countQuery("business_notifications", (query) =>
          query.is("resolved_at", null),
        ),
        countQuery("billing_plan_periods", (query) =>
          query.eq("is_active", true).eq("plan_is_active", true),
        ),
        countQuery("billing_plan_features", (query) =>
          query.eq("is_active", true),
        ),
        countQuery("public_courier_applications", undefined, "user_id"),
        countQuery(
          "public_courier_applications",
          (query) => query.eq("status", "pending"),
          "user_id",
        ),
        countQuery("public_courier_topups"),
        countQuery("public_courier_topups", (query) =>
          query.eq("status", "pending"),
        ),
        paidTotalQuery(
          "payment_records",
          "amount",
          "status",
          monthStartIso,
          nextMonthStartIso,
        ),
        paidTotalQuery(
          "promotions",
          "total_amount",
          "payment_status",
          monthStartIso,
          nextMonthStartIso,
        ),
        paidTotalQuery("payment_records", "amount", "status"),
        paidTotalQuery("promotions", "total_amount", "payment_status"),
      ]);

      if (!isMounted) return;
      setMetrics({
        businesses: businesses.value,
        activeBusinesses: activeBusinesses.value,
        inactiveBusinesses:
          businesses.value === null || activeBusinesses.value === null
            ? null
            : Math.max(0, businesses.value - activeBusinesses.value),
        newBusinesses: newBusinesses.value,
        businessInfo: businessInfo.value,
        ratedBusinesses: ratedBusinesses.value,
        courierEnabledBusinesses: courierEnabledBusinesses.value,
        totalSubscriptions: totalSubscriptions.value,
        activeSubscriptions: activeSubscriptions.value,
        pendingSubscriptions: pendingSubscriptions.value,
        expiredSubscriptions: expiredSubscriptions.value,
        suspendedSubscriptions: suspendedSubscriptions.value,
        cancelledSubscriptions: cancelledSubscriptions.value,
        expiringSubscriptions: expiringSubscriptions.value,
        totalSubscriptionPayments: totalSubscriptionPayments.value,
        pendingPayments: pendingPayments.value,
        paidPayments: paidPayments.value,
        failedPayments: failedPayments.value,
        rejectedPayments: rejectedPayments.value,
        refundedPayments: refundedPayments.value,
        totalPromotions: totalPromotions.value,
        pendingPromotions: pendingPromotions.value,
        paidPromotions: paidPromotions.value,
        activePromotions: activePromotions.value,
        totalPlanChangeRequests: totalPlanChangeRequests.value,
        awaitingPaymentPlanChanges: awaitingPaymentPlanChanges.value,
        pendingReviewPlanChanges: pendingReviewPlanChanges.value,
        scheduledPlanChanges: scheduledPlanChanges.value,
        totalBusinessNotifications: totalBusinessNotifications.value,
        unreadBusinessNotifications: unreadBusinessNotifications.value,
        unresolvedBusinessNotifications: unresolvedBusinessNotifications.value,
        activeBillingPeriods: activeBillingPeriods.value,
        activePlanFeatures: activePlanFeatures.value,
        totalCourierApplications: totalCourierApplications.value,
        pendingCourierApplications: pendingCourierApplications.value,
        totalCourierTopups: totalCourierTopups.value,
        pendingCourierTopups: pendingCourierTopups.value,
        monthlyRevenue:
          subscriptionsRevenue.value === null ||
          promotionsRevenue.value === null
            ? null
            : subscriptionsRevenue.value + promotionsRevenue.value,
        totalRevenue:
          subscriptionsRevenueAllTime.value === null ||
          promotionsRevenueAllTime.value === null
            ? null
            : subscriptionsRevenueAllTime.value +
              promotionsRevenueAllTime.value,
        hasErrors: [
          businesses,
          activeBusinesses,
          newBusinesses,
          businessInfo,
          ratedBusinesses,
          courierEnabledBusinesses,
          totalSubscriptions,
          activeSubscriptions,
          pendingSubscriptions,
          expiredSubscriptions,
          suspendedSubscriptions,
          cancelledSubscriptions,
          expiringSubscriptions,
          totalSubscriptionPayments,
          pendingPayments,
          paidPayments,
          failedPayments,
          rejectedPayments,
          refundedPayments,
          totalPromotions,
          pendingPromotions,
          paidPromotions,
          activePromotions,
          totalPlanChangeRequests,
          awaitingPaymentPlanChanges,
          pendingReviewPlanChanges,
          scheduledPlanChanges,
          totalBusinessNotifications,
          unreadBusinessNotifications,
          unresolvedBusinessNotifications,
          activeBillingPeriods,
          activePlanFeatures,
          totalCourierApplications,
          pendingCourierApplications,
          totalCourierTopups,
          pendingCourierTopups,
          subscriptionsRevenue,
          promotionsRevenue,
          subscriptionsRevenueAllTime,
          promotionsRevenueAllTime,
        ].some((metric) => metric.error),
      });
    };

    loadMetrics();
    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  if (!metrics) {
    return (
      <SuperAdminSectionShell title="Resumen" badge="Administración">
        <p className="text-sm text-neutral-400">Cargando resumen...</p>
      </SuperAdminSectionShell>
    );
  }

  return (
    <SuperAdminSectionShell
      title="Resumen"
      subtitle="Vista general de negocios, ingresos, suscripciones y operación de Gloto."
      badge="Administración"
    >
      {metrics.hasErrors && (
        <p className="text-sm text-amber-300">
          Algunos indicadores no pudieron cargarse; se muestran como —.
        </p>
      )}
      <MetricGroup
        title="Negocios"
        items={[
          {
            label: "Total",
            value: metrics.businesses,
            icon: Building2,
            color: "#a78bfa",
          },
          {
            label: "Activos",
            value: metrics.activeBusinesses,
            icon: CheckCircle2,
            color: "#34d399",
          },
          {
            label: "Inactivos",
            value: metrics.inactiveBusinesses,
            icon: XCircle,
            color: "#f87171",
          },
          {
            label: "Nuevos este mes",
            value: metrics.newBusinesses,
            icon: CalendarPlus,
            color: "#38bdf8",
          },
          {
            label: "Con información",
            value: metrics.businessInfo,
            icon: Store,
            color: "#818cf8",
          },
          {
            label: "Con calificaciones",
            value: metrics.ratedBusinesses,
            icon: Star,
            color: "#fbbf24",
          },
          {
            label: "Domicilio público activo",
            value: metrics.courierEnabledBusinesses,
            icon: Bike,
            color: "#22d3ee",
          },
        ]}
      />
      <MetricGroup
        title="Suscripciones"
        items={[
          {
            label: "Total",
            value: metrics.totalSubscriptions,
            icon: Store,
            color: "#a78bfa",
          },
          {
            label: "Activas",
            value: metrics.activeSubscriptions,
            icon: BadgeCheck,
            color: "#34d399",
          },
          {
            label: "Pendientes",
            value: metrics.pendingSubscriptions,
            icon: Clock3,
            color: "#fbbf24",
          },
          {
            label: "Vencidas",
            value: metrics.expiredSubscriptions,
            icon: XCircle,
            color: "#f87171",
          },
          {
            label: "Suspendidas",
            value: metrics.suspendedSubscriptions,
            icon: Store,
            color: "#fb923c",
          },
          {
            label: "Canceladas",
            value: metrics.cancelledSubscriptions,
            icon: XCircle,
            color: "#a3a3a3",
          },
          {
            label: "Vencen en 7 días",
            value: metrics.expiringSubscriptions,
            icon: CalendarClock,
            color: "#fb923c",
          },
        ]}
      />
      <MetricGroup
        title="Pagos"
        items={[
          {
            label: "Pagos registrados",
            value: metrics.totalSubscriptionPayments,
            icon: ReceiptText,
            color: "#a78bfa",
          },
          {
            label: "Pagos pendientes",
            value: metrics.pendingPayments,
            icon: WalletCards,
            color: "#fbbf24",
          },
          {
            label: "Pagos este mes",
            value: metrics.paidPayments,
            icon: ReceiptText,
            color: "#38bdf8",
          },
          {
            label: "Pagos fallidos",
            value: metrics.failedPayments,
            icon: XCircle,
            color: "#f87171",
          },
          {
            label: "Pagos rechazados",
            value: metrics.rejectedPayments,
            icon: XCircle,
            color: "#fb7185",
          },
          {
            label: "Pagos reembolsados",
            value: metrics.refundedPayments,
            icon: WalletCards,
            color: "#a3a3a3",
          },
          {
            label: "Recaudo histórico",
            value: formatCurrency(metrics.totalRevenue),
            icon: CircleDollarSign,
            color: "#34d399",
          },
          {
            label: "Recaudo del mes",
            value: formatCurrency(metrics.monthlyRevenue),
            icon: CircleDollarSign,
            color: "#22c55e",
          },
        ]}
      />
      <MetricGroup
        title="Marketplace y promociones"
        items={[
          {
            label: "Promociones registradas",
            value: metrics.totalPromotions,
            icon: Megaphone,
            color: "#a78bfa",
          },
          {
            label: "Promociones pendientes",
            value: metrics.pendingPromotions,
            icon: Clock3,
            color: "#fb923c",
          },
          {
            label: "Promociones activas",
            value: metrics.activePromotions,
            icon: Megaphone,
            color: "#a78bfa",
          },
          {
            label: "Promociones pagadas este mes",
            value: metrics.paidPromotions,
            icon: CheckCircle2,
            color: "#34d399",
          },
        ]}
      />
      <MetricGroup
        title="Cambios de plan"
        items={[
          {
            label: "Solicitudes registradas",
            value: metrics.totalPlanChangeRequests,
            icon: Store,
            color: "#a78bfa",
          },
          {
            label: "Esperando pago",
            value: metrics.awaitingPaymentPlanChanges,
            icon: Clock3,
            color: "#fbbf24",
          },
          {
            label: "En revisión",
            value: metrics.pendingReviewPlanChanges,
            icon: Clock3,
            color: "#38bdf8",
          },
          {
            label: "Cambios programados",
            value: metrics.scheduledPlanChanges,
            icon: CalendarClock,
            color: "#34d399",
          },
        ]}
      />
      <MetricGroup
        title="Domiciliarios públicos"
        items={[
          {
            label: "Solicitudes de domiciliario",
            value: metrics.totalCourierApplications,
            icon: Bike,
            color: "#38bdf8",
          },
          {
            label: "Solicitudes pendientes",
            value: metrics.pendingCourierApplications,
            icon: Clock3,
            color: "#fbbf24",
          },
          {
            label: "Recargas registradas",
            value: metrics.totalCourierTopups,
            icon: WalletCards,
            color: "#a78bfa",
          },
          {
            label: "Recargas pendientes",
            value: metrics.pendingCourierTopups,
            icon: Clock3,
            color: "#fb923c",
          },
        ]}
      />
      <MetricGroup
        title="Alertas y planes"
        items={[
          {
            label: "Notificaciones de negocios",
            value: metrics.totalBusinessNotifications,
            icon: Bell,
            color: "#a78bfa",
          },
          {
            label: "Notificaciones sin leer",
            value: metrics.unreadBusinessNotifications,
            icon: Bell,
            color: "#fbbf24",
          },
          {
            label: "Notificaciones sin resolver",
            value: metrics.unresolvedBusinessNotifications,
            icon: Bell,
            color: "#f87171",
          },
          {
            label: "Periodos de plan activos",
            value: metrics.activeBillingPeriods,
            icon: CreditCard,
            color: "#34d399",
          },
          {
            label: "Características habilitadas",
            value: metrics.activePlanFeatures,
            icon: BadgeCheck,
            color: "#38bdf8",
          },
        ]}
      />
    </SuperAdminSectionShell>
  );
};

const MetricGroup = ({ title, items }) => (
  <section className="space-y-3">
    <h3 className="text-xs font-black uppercase tracking-[0.16em] text-neutral-400">
      {title}
    </h3>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {items.map(({ label, value, icon: Icon, color }) => (
        <article
          key={label}
          className="min-w-0 rounded-xl border border-white/10 bg-neutral-900 p-3 sm:p-4"
        >
          <div className="flex items-center gap-2 text-neutral-400">
            <Icon size={15} style={{ color }} />
            <span className="truncate text-[10px] font-bold uppercase tracking-tight sm:text-xs">
              {label}
            </span>
          </div>
          <p className="mt-2 break-words text-xl font-extrabold text-white sm:text-2xl">
            {value === null ? "—" : value}
          </p>
        </article>
      ))}
    </div>
  </section>
);

const formatCurrency = (amount) =>
  amount === null
    ? null
    : new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(amount);

const Stats = ({ total, active, inactive }) => (
  <div id="resumen" className="flex flex-wrap gap-3">
    <SuperAdminStatCard
      icon={Building2}
      label="Total"
      value={total}
      color="#a78bfa"
    />
    <SuperAdminStatCard
      icon={CheckCircle2}
      label="Activas"
      value={active}
      color="#34d399"
    />
    <SuperAdminStatCard
      icon={XCircle}
      label="Inactivas"
      value={inactive}
      color="#f87171"
    />
  </div>
);

export default SuperAdminDashboardOverview;
