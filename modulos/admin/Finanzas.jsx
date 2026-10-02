import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  CalendarDays,
  CreditCard,
  Megaphone,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import SuperAdminSectionShell from "./ContenedorSeccion";
import SolicitudesCambioPlan from "./SolicitudesCambioPlan";

const STATUS_LABELS = {
  pending: "Pendiente",
  paid: "Pagado",
  rejected: "Rechazado",
  failed: "Fallido",
  refunded: "Reembolsado",
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const formatDate = (value) => {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Sin fecha"
    : date.toLocaleString("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
      });
};

const normalizePaymentRows = (subscriptionPayments, promotionPayments) =>
  [
    ...(subscriptionPayments || []).map((payment) => ({
      id: `subscription-${payment.id}`,
      sourceId: payment.id,
      businessId: payment.business_id,
      businessName: payment.businesses?.name || "Negocio sin nombre",
      businessSlug: payment.businesses?.slug || "",
      type: "subscription",
      title: payment.subscriptions?.plan_name || "Suscripción",
      planCode: payment.subscriptions?.plan_code || "",
      periodId: payment.subscriptions?.period_id || "",
      period: payment.commission_statement_id
        ? "Comisión del ciclo vencido"
        : payment.subscriptions?.billing_period || "",
      commissionStatementId: payment.commission_statement_id || null,
      commissionStatement: payment.commission_statement || null,
      status: payment.status,
      amount: payment.amount,
      method: payment.payment_method,
      reference: payment.notes,
      supportPath: payment.support_path,
      createdAt: payment.created_at,
      paidAt: payment.paid_at,
    })),
    ...(promotionPayments || []).map((payment) => ({
      id: `promotion-${payment.id}`,
      sourceId: payment.id,
      businessId: payment.business_id,
      businessName: payment.businesses?.name || "Negocio sin nombre",
      businessSlug: payment.businesses?.slug || "",
      type: "promotion",
      title: payment.title || payment.offer_text || "Promoción",
      period: payment.duration_days ? `${payment.duration_days} días` : "",
      durationDays: payment.duration_days,
      status: payment.payment_status,
      amount: payment.total_amount,
      method: "Manual",
      reference: payment.payment_reference || payment.payment_notes,
      supportPath: payment.payment_support_path,
      createdAt: payment.created_at,
      paidAt: payment.paid_at,
    })),
  ].sort(
    (first, second) =>
      new Date(second.paidAt || second.createdAt || 0) -
      new Date(first.paidAt || first.createdAt || 0),
  );

const SuperAdminFinanzasPanel = ({
  initialTypeFilter = "all",
  title = "Finanzas",
  subtitle = "Pagos de suscripciones y promociones de todas las tiendas.",
  badge = "Finanzas",
}) => {
  const [payments, setPayments] = useState([]);
  const [billingPeriods, setBillingPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewingPaymentId, setReviewingPaymentId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(initialTypeFilter);
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    setTypeFilter(initialTypeFilter);
  }, [initialTypeFilter]);

  useEffect(() => {
    let cancelled = false;

    const loadPayments = async () => {
      setLoading(true);
      setLoadError("");

      const [subscriptionResult, promotionResult, periodsResult] =
        await Promise.all([
          supabase
            .from("payment_records")
            .select(
              "id,business_id,subscription_id,commission_statement_id,amount,status,payment_method,support_path,notes,paid_at,created_at,businesses(name,slug),subscriptions(plan_name,plan_code,period_id,billing_period),commission_statement:subscription_commission_statements(cycle_starts_at,cycle_ends_at,order_count,sales_total,commission_rate,commission_total,minimum_amount)",
            )
            .order("created_at", { ascending: false }),
          supabase
            .from("promotions")
            .select(
              "id,business_id,title,offer_text,payment_status,total_amount,payment_reference,payment_notes,payment_support_path,duration_days,paid_at,created_at,businesses(name,slug)",
            )
            .order("created_at", { ascending: false }),
          supabase
            .from("billing_plan_periods")
            .select(
              "id,plan_code,code,label,duration_days,price_amount,commission_rate,minimum_amount,is_active,plan_is_active,display_order",
            )
            .eq("is_active", true)
            .eq("plan_is_active", true)
            .order("display_order", { ascending: true }),
        ]);

      if (cancelled) return;

      const error =
        subscriptionResult.error ||
        promotionResult.error ||
        periodsResult.error;
      if (error) {
        console.error("No se pudo cargar el historial financiero:", error);
        setLoadError(
          "No se pudieron cargar los pagos. Revisa el acceso de Finanzas en Supabase.",
        );
        setPayments([]);
      } else {
        const normalizedPayments = normalizePaymentRows(
          subscriptionResult.data,
          promotionResult.data,
        );
        setPayments(normalizedPayments);
        setBillingPeriods(periodsResult.data || []);
      }
      setLoading(false);
    };

    loadPayments();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const filteredPayments = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");

    return payments.filter((payment) => {
      const paymentDate = (payment.paidAt || payment.createdAt || "").slice(
        0,
        10,
      );
      const matchesSearch =
        !query ||
        payment.businessName.toLocaleLowerCase("es").includes(query) ||
        payment.businessSlug.toLocaleLowerCase("es").includes(query) ||
        payment.title.toLocaleLowerCase("es").includes(query) ||
        String(payment.reference || "")
          .toLocaleLowerCase("es")
          .includes(query);

      return (
        matchesSearch &&
        (typeFilter === "all" || payment.type === typeFilter) &&
        (statusFilter === "all" || payment.status === statusFilter) &&
        (!fromDate || paymentDate >= fromDate) &&
        (!toDate || paymentDate <= toDate)
      );
    });
  }, [payments, search, typeFilter, statusFilter, fromDate, toDate]);

  const metrics = useMemo(() => {
    const paid = filteredPayments.filter(
      (payment) => payment.status === "paid",
    );
    const pending = filteredPayments.filter(
      (payment) => payment.status === "pending",
    );
    return {
      paidAmount: paid.reduce(
        (total, payment) => total + Number(payment.amount || 0),
        0,
      ),
      paidCount: paid.length,
      pendingCount: pending.length,
      visibleCount: filteredPayments.length,
    };
  }, [filteredPayments]);

  const openPaymentSupport = async (path) => {
    if (!path) return;
    const { data, error } = await supabase.storage
      .from("payment-supports")
      .createSignedUrl(path, 300);
    if (error) {
      console.error("No se pudo abrir el comprobante:", error);
      setNotice("No se pudo abrir el comprobante de pago.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const reviewSubscriptionPayment = async (payment, approve) => {
    const periodId = payment.periodId;

    if (approve && !periodId) {
      setNotice("No hay un período activo disponible para renovar este plan.");
      return;
    }

    let reason = "";
    if (!approve) {
      reason = window.prompt("Indica el motivo del rechazo del soporte:") || "";
      if (!reason.trim()) return;
    } else if (
      !window.confirm(
        payment.commissionStatementId
          ? `¿Confirmas el pago de la comisión vencida de ${payment.businessName} por ${formatCurrency(payment.amount)} y activas su siguiente ciclo Premium?`
          : `¿Confirmas el pago de ${payment.businessName} y renuevas su plan por ${payment.period || "el periodo actual"} por ${formatCurrency(payment.amount)}?`,
      )
    ) {
      return;
    }

    setReviewingPaymentId(payment.id);
    setNotice("");
    const { error } = approve
      ? await supabase.rpc("approve_subscription_payment", {
          p_payment_id: payment.sourceId,
          p_period_id: periodId,
        })
      : await supabase.rpc("reject_subscription_payment", {
          p_payment_id: payment.sourceId,
          p_reason: reason.trim(),
        });

    if (error) {
      console.error("No se pudo revisar el pago de suscripción:", error);
      setNotice(error.message || "No se pudo procesar el pago.");
    } else {
      setNotice(
        approve
          ? `Pago confirmado. El plan de ${payment.businessName} fue renovado.`
          : `Pago rechazado. ${payment.businessName} podrá corregir el soporte.`,
      );
      setRefreshKey((current) => current + 1);
    }
    setReviewingPaymentId(null);
  };

  const reviewPromotionPayment = async (payment, approve) => {
    let reason = "";
    if (!approve) {
      reason = window.prompt("Indica el motivo del rechazo del soporte:") || "";
      if (!reason.trim()) return;
    } else if (
      !payment.supportPath ||
      payment.amount == null ||
      !window.confirm(
        `¿Confirmas el pago de la promoción de ${payment.businessName}?`,
      )
    ) {
      return;
    }

    setReviewingPaymentId(payment.id);
    setNotice("");
    const paidAt = new Date();
    const update = approve
      ? {
          payment_status: "paid",
          payment_reference: "confirmed_by_superadmin",
          paid_at: paidAt.toISOString(),
          payment_notes: null,
          is_active: true,
          starts_at: paidAt.toISOString(),
          ends_at: new Date(
            paidAt.getTime() + Number(payment.durationDays || 0) * 86400000,
          ).toISOString(),
        }
      : { payment_status: "failed", payment_notes: reason.trim() };

    const { error } = await supabase
      .from("promotions")
      .update(update)
      .eq("id", payment.sourceId)
      .eq("business_id", payment.businessId)
      .eq("payment_status", "pending");

    if (error) {
      console.error("No se pudo revisar el pago de promoción:", error);
      setNotice(error.message || "No se pudo procesar el pago de promoción.");
    } else {
      setNotice(
        approve
          ? `Pago confirmado. La promoción de ${payment.businessName} fue activada.`
          : `Pago rechazado. ${payment.businessName} podrá reenviar el soporte.`,
      );
      setRefreshKey((current) => current + 1);
    }
    setReviewingPaymentId(null);
  };

  const clearFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setStatusFilter("all");
    setFromDate("");
    setToDate("");
  };

  const hasFilters =
    search ||
    typeFilter !== "all" ||
    statusFilter !== "all" ||
    fromDate ||
    toDate;

  return (
    <SuperAdminSectionShell title={title} subtitle={subtitle} badge={badge}>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-white/10 bg-neutral-900/75 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">
              Cobrado en resultados
            </p>
            <p className="mt-2 text-xl font-bold text-emerald-300">
              {formatCurrency(metrics.paidAmount)}
            </p>
          </article>
          <article className="rounded-xl border border-white/10 bg-neutral-900/75 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">
              Pagos aprobados
            </p>
            <p className="mt-2 text-xl font-bold text-white">
              {metrics.paidCount}
            </p>
          </article>
          <article className="rounded-xl border border-white/10 bg-neutral-900/75 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">
              Pendientes
            </p>
            <p className="mt-2 text-xl font-bold text-amber-300">
              {metrics.pendingCount}
            </p>
          </article>
          <article className="rounded-xl border border-white/10 bg-neutral-900/75 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">
              Movimientos visibles
            </p>
            <p className="mt-2 text-xl font-bold text-white">
              {metrics.visibleCount}
            </p>
          </article>
        </div>

        <section className="space-y-3 rounded-2xl border border-white/10 bg-neutral-900/75 p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-neutral-400">
            <SlidersHorizontal size={14} /> Buscar y filtrar pagos
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.6fr)_repeat(2,minmax(150px,1fr))_repeat(2,minmax(145px,0.8fr))]">
            <label className="relative sm:col-span-2 xl:col-span-1">
              <span className="sr-only">Buscar pagos</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                size={16}
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Negocio, plan, promoción o referencia"
                className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 pl-9 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-violet-400"
              />
            </label>
            {initialTypeFilter === "all" && (
              <label>
                <span className="sr-only">Tipo de pago</span>
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
                >
                  <option value="all">Todos los tipos</option>
                  <option value="subscription">Suscripciones</option>
                  <option value="promotion">Promociones</option>
                </select>
              </label>
            )}
            <label>
              <span className="sr-only">Estado del pago</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
              >
                <option value="all">Todos los estados</option>
                <option value="pending">Pendientes</option>
                <option value="paid">Pagados</option>
                <option value="rejected">Rechazados</option>
                <option value="failed">Fallidos</option>
                <option value="refunded">Reembolsados</option>
              </select>
            </label>
            <label className="relative">
              <span className="sr-only">Desde</span>
              <CalendarDays
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                size={14}
              />
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-neutral-950 py-2.5 pl-9 pr-2 text-sm text-white outline-none focus:border-violet-400"
                aria-label="Desde fecha"
              />
            </label>
            <label className="relative">
              <span className="sr-only">Hasta</span>
              <CalendarDays
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                size={14}
              />
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-neutral-950 py-2.5 pl-9 pr-2 text-sm text-white outline-none focus:border-violet-400"
                aria-label="Hasta fecha"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
            <p className="text-xs text-neutral-500" aria-live="polite">
              {filteredPayments.length} movimientos
            </p>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-semibold text-neutral-300 transition hover:text-white"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </section>

        {loadError && (
          <div
            role="alert"
            className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200"
          >
            {loadError}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="rounded-xl border border-violet-400/20 bg-violet-500/5 px-4 py-3 text-sm text-violet-100"
          >
            {notice}
          </div>
        )}

        {initialTypeFilter !== "promotion" && <SolicitudesCambioPlan />}

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/65">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <h3 className="text-sm font-semibold text-white">
              Historial de pagos
            </h3>
            <span className="text-xs text-neutral-500">
              Fechas de solicitud y confirmación
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-neutral-400">
              Cargando movimientos...
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="p-10 text-center">
              <CreditCard className="mx-auto mb-3 text-neutral-600" size={24} />
              <p className="text-sm font-medium text-neutral-300">
                No hay pagos que coincidan con esos filtros.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {filteredPayments.map((payment) => {
                const isSubscription = payment.type === "subscription";
                const isPending = payment.status === "pending";
                const periodsForPayment = billingPeriods.filter(
                  (period) => period.plan_code === payment.planCode,
                );
                const selectedPeriod = periodsForPayment.find(
                  (period) => period.id === payment.periodId,
                );
                const statusLabel =
                  STATUS_LABELS[payment.status] || payment.status;
                const statusClass =
                  payment.status === "paid"
                    ? "bg-emerald-500/10 text-emerald-300"
                    : payment.status === "pending"
                      ? "bg-amber-500/10 text-amber-300"
                      : "bg-neutral-700/50 text-neutral-300";

                return (
                  <article
                    key={payment.id}
                    className="grid min-h-[78px] gap-3 px-3 py-3 transition hover:bg-white/[0.02] md:grid-cols-[minmax(180px,1.35fr)_minmax(150px,1.05fr)_minmax(90px,0.7fr)_minmax(180px,1fr)_minmax(180px,0.9fr)] md:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold leading-tight text-white">
                        {payment.businessName}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                        {payment.businessSlug || payment.businessId}
                      </p>
                    </div>

                    <div className="flex min-w-0 items-center gap-2">
                      {isSubscription ? (
                        <ShieldCheck
                          className="shrink-0 text-violet-300"
                          size={15}
                        />
                      ) : (
                        <Megaphone
                          className="shrink-0 text-cyan-300"
                          size={15}
                        />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium leading-tight text-neutral-200">
                          {payment.title}
                        </p>
                        <p className="text-[11px] text-neutral-500">
                          {isSubscription ? "Suscripción" : "Promoción"}
                          {payment.period ? ` · ${payment.period}` : ""}
                        </p>
                        {payment.commissionStatement && (
                          <p className="mt-1 text-[10px] leading-relaxed text-neutral-500">
                            {formatDate(payment.commissionStatement.cycle_starts_at)}
                            {" – "}
                            {formatDate(payment.commissionStatement.cycle_ends_at)}
                            {" · "}
                            {payment.commissionStatement.order_count} tickets
                            {" · "}
                            {formatCurrency(payment.commissionStatement.sales_total)} en ventas
                            {" · comisión por ticket: "}
                            {formatCurrency(payment.commissionStatement.commission_total)}
                            {" · mínimo: "}
                            {formatCurrency(payment.commissionStatement.minimum_amount)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="min-w-[84px]">
                      <p className="text-sm font-bold tracking-tight text-white">
                        {formatCurrency(payment.amount)}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <span
                        className={`inline-flex min-w-[96px] justify-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${statusClass}`}
                      >
                        {statusLabel}
                      </span>
                      <p className="mt-1 max-w-[180px] text-left text-[11px] text-neutral-500">
                        {payment.paidAt
                          ? `Pagado ${formatDate(payment.paidAt)}`
                          : `Solicitado ${formatDate(payment.createdAt)}`}
                      </p>
                    </div>

                    <div className="flex min-w-0 w-full max-w-[220px] items-center justify-end gap-1.5 justify-self-end">
                      {payment.supportPath && (
                        <button
                          type="button"
                          onClick={() =>
                            openPaymentSupport(payment.supportPath)
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] font-semibold text-neutral-200 transition hover:border-violet-400/40 hover:text-white"
                        >
                          <ArrowDownToLine size={12} />
                          Comprobante
                        </button>
                      )}
                      {isPending && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              isSubscription
                                ? reviewSubscriptionPayment(payment, false)
                                : reviewPromotionPayment(payment, false)
                            }
                            disabled={reviewingPaymentId === payment.id}
                            className="rounded-lg border border-red-500/20 bg-red-500/5 px-2 py-1.5 text-[10px] font-semibold text-red-200 transition hover:bg-red-500/10 disabled:opacity-50"
                          >
                            Rechazar
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              isSubscription
                                ? reviewSubscriptionPayment(payment, true)
                                : reviewPromotionPayment(payment, true)
                            }
                            disabled={
                              reviewingPaymentId === payment.id ||
                              !payment.supportPath ||
                              (!isSubscription && payment.amount == null) ||
                              (isSubscription &&
                                !selectedPeriod &&
                                !payment.commissionStatementId)
                            }
                            className="rounded-lg bg-emerald-600 px-2 py-1.5 text-[10px] font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            {reviewingPaymentId === payment.id
                              ? "Procesando..."
                              : isSubscription
                                ? payment.commissionStatementId
                                  ? "Confirmar comisión"
                                  : "Confirmar y renovar"
                                : "Confirmar pago"}
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </SuperAdminSectionShell>
  );
};

export default SuperAdminFinanzasPanel;
