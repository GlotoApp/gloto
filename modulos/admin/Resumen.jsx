import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Building2,
  CalendarPlus,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Megaphone,
  ReceiptText,
  Store,
  WalletCards,
  XCircle,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import SuperAdminSectionShell from "./ContenedorSeccion";
import SuperAdminStatCard from "./TarjetaIndicador";

const countQuery = async (table, configure = (query) => query) => {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  query = configure(query);
  const { count, error } = await query;
  return { value: error ? null : count || 0, error };
};

const paidTotalQuery = async (
  table,
  amountColumn,
  statusColumn,
  startOfMonth,
) => {
  const pageSize = 500;
  let offset = 0;
  let total = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(amountColumn)
      .eq(statusColumn, "paid")
      .gte("paid_at", startOfMonth)
      .range(offset, offset + pageSize - 1);

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

  useEffect(() => {
    let isMounted = true;

    const loadMetrics = async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthStartIso = monthStart.toISOString();

      const [
        businesses,
        activeBusinesses,
        newBusinesses,
        totalSubscriptions,
        activeSubscriptions,
        pendingSubscriptions,
        expiredSubscriptions,
        suspendedSubscriptions,
        cancelledSubscriptions,
        pendingPayments,
        paidPayments,
        pendingPromotions,
        activePromotions,
        subscriptionsRevenue,
        promotionsRevenue,
      ] = await Promise.all([
        countQuery("businesses"),
        countQuery("businesses", (query) => query.eq("is_active", true)),
        countQuery("businesses", (query) =>
          query.gte("created_at", monthStartIso),
        ),
        countQuery("subscriptions"),
        countQuery("subscriptions", (query) => query.eq("status", "active")),
        countQuery("subscriptions", (query) => query.eq("status", "pending")),
        countQuery("subscriptions", (query) => query.eq("status", "expired")),
        countQuery("subscriptions", (query) => query.eq("status", "suspended")),
        countQuery("subscriptions", (query) => query.eq("status", "cancelled")),
        countQuery("payment_records", (query) => query.eq("status", "pending")),
        countQuery("payment_records", (query) =>
          query.eq("status", "paid").gte("paid_at", monthStartIso),
        ),
        countQuery("promotions", (query) =>
          query.eq("payment_status", "pending"),
        ),
        countQuery("promotions", (query) =>
          query.eq("payment_status", "paid").eq("is_active", true),
        ),
        paidTotalQuery("payment_records", "amount", "status", monthStartIso),
        paidTotalQuery(
          "promotions",
          "total_amount",
          "payment_status",
          monthStartIso,
        ),
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
        totalSubscriptions: totalSubscriptions.value,
        activeSubscriptions: activeSubscriptions.value,
        pendingSubscriptions: pendingSubscriptions.value,
        expiredSubscriptions: expiredSubscriptions.value,
        suspendedSubscriptions: suspendedSubscriptions.value,
        cancelledSubscriptions: cancelledSubscriptions.value,
        pendingPayments: pendingPayments.value,
        paidPayments: paidPayments.value,
        pendingPromotions: pendingPromotions.value,
        activePromotions: activePromotions.value,
        monthlyRevenue:
          subscriptionsRevenue.value === null ||
          promotionsRevenue.value === null
            ? null
            : subscriptionsRevenue.value + promotionsRevenue.value,
        hasErrors: [
          businesses,
          activeBusinesses,
          newBusinesses,
          totalSubscriptions,
          activeSubscriptions,
          pendingSubscriptions,
          expiredSubscriptions,
          suspendedSubscriptions,
          cancelledSubscriptions,
          pendingPayments,
          paidPayments,
          pendingPromotions,
          activePromotions,
          subscriptionsRevenue,
          promotionsRevenue,
        ].some((metric) => metric.error),
      });
    };

    loadMetrics();
    return () => {
      isMounted = false;
    };
  }, []);

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
      subtitle="Indicadores generales de operación, suscripciones y pagos."
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
        ]}
      />
      <MetricGroup
        title="Pagos y marketplace"
        items={[
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
            label: "Recaudo del mes",
            value: formatCurrency(metrics.monthlyRevenue),
            icon: CircleDollarSign,
            color: "#34d399",
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
