import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  FileUp,
  LoaderCircle,
  Maximize2,
  X,
  Upload,
  LogOut,
} from "lucide-react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../../src/lib/supabaseClient";
import SubLoading from "./SubLoading";

const formatCurrency = (value) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("es-CO", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "Sin fecha";

const getDaysRemaining = (endsAt, currentTime = Date.now()) => {
  if (!endsAt) return null;
  return Math.max(
    0,
    Math.ceil((new Date(endsAt).getTime() - currentTime) / 86400000),
  );
};

const getStatusLabel = (status) =>
  ({
    active: "Activo",
    pending: "Pendiente",
    suspended: "Suspendido",
    expired: "Vencido",
    cancelled: "Cancelado",
  })[status] || status;

const MAX_SUPPORT_SIZE = 5 * 1024 * 1024;
const ALLOWED_SUPPORT_TYPES = ["application/pdf", "image/jpeg", "image/png"];

const getPlanEndDate = (plan) => {
  if (plan?.ends_at) return plan.ends_at;
  if (!plan?.starts_at) return null;

  const endDate = new Date(plan.starts_at);
  endDate.setDate(endDate.getDate() + (plan.duration_days || 30));
  return endDate.toISOString();
};

export default function MiPlan() {
  const [businessId, setBusinessId] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [planAccess, setPlanAccess] = useState(null);
  const [renewalAmount, setRenewalAmount] = useState(null);
  const [commissionStatement, setCommissionStatement] = useState(null);
  const [latestPayment, setLatestPayment] = useState(null);
  const [paymentQr, setPaymentQr] = useState(null);
  const [paymentFile, setPaymentFile] = useState(null);
  const [paymentPreviewUrl, setPaymentPreviewUrl] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [message, setMessage] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  useEffect(() => {
    const intervalId = window.setInterval(
      () => setCurrentTime(Date.now()),
      60_000,
    );
    return () => window.clearInterval(intervalId);
  }, []);

  const loadSubscription = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      setMessage("Debes iniciar sesión para consultar tu plan.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("business_id")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile?.business_id) {
      setMessage("No se encontró el negocio del usuario.");
      setLoading(false);
      return;
    }

    setBusinessId(profile.business_id);
    setRenewalAmount(null);
    setCommissionStatement(null);
    const { data: planAccessData, error: planAccessError } = await supabase.rpc(
      "get_business_plan_access",
    );
    if (planAccessError) {
      console.error("No se pudo cargar el uso del plan:", planAccessError);
      setMessage("No se pudo consultar el uso de tickets de tu plan.");
    } else {
      setPlanAccess(planAccessData);
    }
    const [{ data, error }, { data: paymentData }, { data: qrData }] =
      await Promise.all([
        supabase
          .from("subscriptions")
          .select(
            "id,plan_code,plan_name,status,amount,billing_period,starts_at,ends_at,payment_method,period_id,duration_days,billing_type,commission_rate,minimum_amount",
          )
          .eq("business_id", profile.business_id)
          .in("status", ["active", "suspended", "expired"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("payment_records")
          .select("id,status,notes,amount,created_at,paid_at")
          .eq("business_id", profile.business_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("payment_qr_codes")
          .select("id,label,storage_path")
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    if (error) {
      console.error("No se pudo cargar la suscripción:", error);
      setMessage("No se pudo cargar la información del plan.");
    } else {
      setSubscription(data);
      if (data?.billing_type === "commission") {
        const { data: statement, error: statementError } = await supabase.rpc(
          "get_or_create_subscription_commission_statement",
          { p_subscription_id: data.id },
        );

        if (statementError) {
          console.error(
            "No se pudo calcular la comisión del ciclo:",
            statementError,
          );
          setMessage("No se pudo calcular el cobro de comisión del ciclo.");
        } else {
          setCommissionStatement(statement);
          if (statement?.is_closed) {
            const amount = Number(statement.amount_due);
            if (Number.isFinite(amount) && amount >= 0) {
              setRenewalAmount(amount);
            } else {
              setMessage("El cobro calculado para el ciclo no es válido.");
            }
          }
        }
      } else if (data?.period_id) {
        const { data: period, error: periodError } = await supabase
          .from("billing_plan_periods")
          .select("plan_code,billing_type,price_amount,minimum_amount")
          .eq("id", data.period_id)
          .eq("plan_code", data.plan_code)
          .eq("is_active", true)
          .eq("plan_is_active", true)
          .maybeSingle();

        if (periodError || !period) {
          console.error(
            "No se pudo consultar el precio de renovación:",
            periodError,
          );
          setMessage(
            "No se pudo consultar el precio actualizado para renovar el plan.",
          );
        } else {
          const amount =
            period.billing_type === "commission"
              ? (period.minimum_amount ?? data.amount)
              : period.price_amount;
          const parsedAmount = Number(amount);
          if (Number.isFinite(parsedAmount) && parsedAmount >= 0) {
            setRenewalAmount(parsedAmount);
          } else {
            setMessage("El precio configurado para renovar no es válido.");
          }
        }
      } else if (data) {
        setMessage("La suscripción no tiene un período de renovación.");
      }
    }
    setLatestPayment(paymentData || null);
    if (qrData?.storage_path) {
      const { data: publicUrlData } = supabase.storage
        .from("payment-qr")
        .getPublicUrl(qrData.storage_path);
      setPaymentQr({ ...qrData, publicUrl: publicUrlData.publicUrl });
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSubscription();
  }, []);

  useEffect(() => {
    if (!paymentFile) {
      setPaymentPreviewUrl("");
      return undefined;
    }

    const previewUrl = URL.createObjectURL(paymentFile);
    setPaymentPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [paymentFile]);

  const planEndDate = useMemo(
    () => getPlanEndDate(subscription),
    [
      subscription?.duration_days,
      subscription?.ends_at,
      subscription?.starts_at,
    ],
  );

  const daysRemaining = useMemo(
    () => getDaysRemaining(planEndDate, currentTime),
    [currentTime, planEndDate],
  );
  const planHasExpired =
    planEndDate !== null && new Date(planEndDate).getTime() <= currentTime;
  const planEndTime = planEndDate ? new Date(planEndDate).getTime() : null;
  const suspensionDeadline =
    planEndTime === null ? null : planEndTime + 3 * 86400000;
  const isInSuspensionGracePeriod =
    ["active", "expired"].includes(subscription?.status) &&
    planEndTime !== null &&
    currentTime >= planEndTime &&
    currentTime < suspensionDeadline;
  const suspensionIsDue =
    ["active", "expired"].includes(subscription?.status) &&
    planEndTime !== null &&
    currentTime >= suspensionDeadline;
  const isSubscriptionSuspended = subscription?.status === "suspended";
  const overdueDays = isInSuspensionGracePeriod
    ? Math.min(3, Math.floor((currentTime - planEndTime) / 86400000) + 1)
    : null;
  const suspensionDaysRemaining = isInSuspensionGracePeriod
    ? Math.max(
        0,
        Math.ceil((suspensionDeadline - currentTime) / 86400000),
      )
    : null;
  const isPaymentOnlyMode =
    Boolean(subscription) &&
    (isSubscriptionSuspended ||
      subscription.status === "expired" ||
      isInSuspensionGracePeriod ||
      suspensionIsDue);

  const validity = useMemo(() => {
    const totalDays = subscription?.duration_days || 30;
    const isActive = subscription?.status === "active";
    const remainingDays = isActive ? (daysRemaining ?? 0) : 0;
    return {
      totalDays,
      remainingDays,
      percent: isActive
        ? Math.min(100, Math.max(0, (remainingDays / totalDays) * 100))
        : 0,
      color:
        !isActive || remainingDays <= totalDays * 0.2
          ? "#fb7185"
          : remainingDays <= totalDays * 0.5
            ? "#fbbf24"
            : "#34d399",
      isActive,
    };
  }, [daysRemaining, subscription?.duration_days, subscription?.status]);

  const isCommissionPlan = subscription?.billing_type === "commission";
  const commissionCycleClosed = commissionStatement?.is_closed === true;
  const showPaymentPanel = isCommissionPlan
    ? commissionCycleClosed && commissionStatement?.status === "due"
    : (subscription?.status === "active" &&
        daysRemaining !== null &&
        daysRemaining <= 5) ||
      ["suspended", "expired"].includes(subscription?.status);

  const handleUpload = async (event) => {
    event.preventDefault();
    if (
      !businessId ||
      !subscription ||
      renewalAmount === null ||
      !paymentFile ||
      latestPayment?.status === "pending"
    )
      return;

    setSaving(true);
    setMessage("");
    const extension = paymentFile.name.split(".").pop()?.toLowerCase() || "bin";
    const filePath = `${businessId}/planes/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("payment-supports")
      .upload(filePath, paymentFile, { upsert: false });

    if (uploadError) {
      setMessage("No se pudo subir el soporte de pago.");
      setSaving(false);
      return;
    }

    const { error: recordError } = isCommissionPlan
      ? (
          await supabase.rpc("submit_subscription_commission_payment", {
            p_statement_id: commissionStatement?.statement_id,
            p_support_path: filePath,
          })
        )
      : await supabase.from("payment_records").insert({
          business_id: businessId,
          subscription_id: subscription.id,
          amount: renewalAmount,
          payment_method: "manual",
          status: "pending",
          support_path: filePath,
        });

    if (recordError) {
      console.error("No se pudo registrar la solicitud de pago:", recordError);
      setMessage(`No se pudo registrar el pago: ${recordError.message}`);
    } else {
      setMessage(
        "Soporte enviado y solicitud de pago registrada. Te avisaremos cuando sea validada.",
      );
    }
    if (!recordError) {
      setShowSuccessModal(true);
      setLatestPayment({ status: "pending" });
      if (isCommissionPlan) {
        setCommissionStatement((current) =>
          current ? { ...current, status: "payment_pending" } : current,
        );
      }
    }
    setPaymentFile(null);
    setFileInputKey((current) => current + 1);
    setSaving(false);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    setMessage("");
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("No se pudo cerrar la sesión:", error);
      setMessage("No se pudo cerrar la sesión. Inténtalo de nuevo.");
      setSigningOut(false);
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_SUPPORT_TYPES.includes(file.type)) {
      setPaymentFile(null);
      setMessage("El soporte debe ser PDF, JPG o PNG.");
      setFileInputKey((current) => current + 1);
      return;
    }

    if (file.size > MAX_SUPPORT_SIZE) {
      setPaymentFile(null);
      setMessage("El soporte no puede superar 5 MB.");
      setFileInputKey((current) => current + 1);
      return;
    }

    setMessage("");
    setPaymentFile(file);
  };

  return (
    <div className="min-h-screen bg-background px-4 py-6 text-white sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-4xl space-y-4 lg:space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-violet-400">
              Finanzas
            </p>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              Mi plan
            </h1>
          </div>
          {isPaymentOnlyMode ? (
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-neutral-300 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-wait disabled:opacity-50"
            >
              <LogOut size={14} />
              {signingOut ? "Cerrando..." : "Cerrar sesión"}
            </button>
          ) : (
            <p className="max-w-xs text-left text-xs leading-5 text-neutral-500 sm:text-right">
              Consulta tu vigencia y envía el soporte de pago.
            </p>
          )}
        </header>

        {loading ? (
          <SubLoading
            label="Cargando tu plan"
            className="py-24"
            dotClassName="bg-violet-400"
            fullHeight
          />
        ) : (
          <>
            {message && (
              <div className="rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-2.5 text-xs text-violet-200">
                {message}
              </div>
            )}

            {isPaymentOnlyMode && (
              <div
                role="alert"
                className="rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3 text-sm text-rose-100"
              >
                <p className="font-black">
                  {isSubscriptionSuspended
                    ? "Tu plan está suspendido"
                    : "Tu ciclo terminó"}
                </p>
                <p className="mt-1 text-xs leading-5 text-rose-100/75">
                  {isInSuspensionGracePeriod
                    ? `Estás en el día ${overdueDays} después del vencimiento. Quedan ${suspensionDaysRemaining} ${
                        suspensionDaysRemaining === 1 ? "día" : "días"
                      } para que se suspenda la tienda. Desde aquí puedes enviar el comprobante de pago.`
                    : isSubscriptionSuspended
                      ? "Envía el comprobante de pago para solicitar la reactivación de tu tienda."
                      : "Envía el comprobante de pago para renovar y reactivar tu tienda."}
                </p>
              </div>
            )}

            {!isPaymentOnlyMode && planAccess?.plan_code && (
              <section className="rounded-xl bg-white/[0.02] p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xs font-black uppercase tracking-wider text-neutral-200">
                      Tickets de este ciclo
                    </h2>
                    <p className="mt-1 text-sm text-neutral-400">
                      {planAccess.ticket_limit === null ||
                      planAccess.ticket_limit === undefined
                        ? `${Number(planAccess.tickets_used || 0).toLocaleString("es-CO")} tickets · sin límite`
                        : `${Number(planAccess.tickets_used || 0).toLocaleString("es-CO")} de ${Number(planAccess.ticket_limit).toLocaleString("es-CO")} tickets usados`}
                    </p>
                  </div>
                  {planAccess.ticket_limit != null &&
                    Number(planAccess.tickets_remaining) === 0 && (
                      <Link
                        to="/pos/planes"
                        className="rounded-lg bg-violet-600 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-violet-500"
                      >
                        Ver planes
                      </Link>
                    )}
                </div>
                {planAccess.ticket_limit != null && (
                  <div
                    className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"
                    role="progressbar"
                    aria-label="Uso de tickets del ciclo"
                    aria-valuemin={0}
                    aria-valuemax={Number(planAccess.ticket_limit)}
                    aria-valuenow={Math.min(
                      Number(planAccess.tickets_used || 0),
                      Number(planAccess.ticket_limit),
                    )}
                  >
                    <div
                      className={`h-full rounded-full transition-all ${
                        Number(planAccess.tickets_remaining) === 0
                          ? "bg-rose-400"
                          : "bg-violet-400"
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          (Number(planAccess.tickets_used || 0) /
                            Number(planAccess.ticket_limit)) *
                            100,
                        )}%`,
                      }}
                    />
                  </div>
                )}
              </section>
            )}

            {latestPayment && latestPayment.status !== "paid" && (
              <div
                className={`rounded-lg px-3 py-2.5 text-xs ${
                  latestPayment.status === "pending"
                    ? "bg-amber-500/10 text-amber-200"
                    : "bg-rose-500/10 text-rose-200"
                }`}
              >
                <strong className="font-black uppercase">
                  {latestPayment.status === "pending"
                    ? "Soporte en revisión"
                    : "Soporte rechazado:"}
                </strong>
                <span className="ml-2 uppercase tracking-widest">
                  {latestPayment.status === "pending"
                    ? "Estamos validando tu comprobante. No envíes otro mientras recibes respuesta."
                    : latestPayment.notes ||
                      "Revisa el comprobante y envía uno nuevo."}
                </span>
              </div>
            )}

            {!subscription ? (
              <section className="rounded-xl border border-dashed border-white/10 px-5 py-12 text-center text-sm text-neutral-400">
                No tienes un plan activo o pendiente asociado a este negocio.
              </section>
            ) : (
              <>
                {!isPaymentOnlyMode && (
                  <section className="rounded-xl bg-white/[0.02] p-5 sm:p-6">
                  <div className="mx-auto max-w-sm text-center">
                    <div className="flex items-center justify-between gap-3 text-left">
                      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                        Plan {subscription.plan_name}
                      </p>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${
                          suspensionIsDue || isInSuspensionGracePeriod
                            ? "bg-rose-500/10 text-rose-300"
                            : validity.isActive
                              ? "bg-emerald-500/10 text-emerald-300"
                              : "bg-rose-500/10 text-rose-300"
                        }`}
                      >
                        <CheckCircle2 size={11} />
                        {isSubscriptionSuspended
                          ? "Plan suspendido"
                          : suspensionIsDue
                          ? "Suspensión pendiente"
                          : isInSuspensionGracePeriod
                            ? "Vencido · periodo de gracia"
                            : getStatusLabel(subscription.status)}
                      </span>
                    </div>
                    <div className="relative mx-auto mt-3 w-full max-w-[280px]">
                      <svg
                        viewBox="0 0 220 140"
                        className="block w-full"
                        aria-hidden="true"
                      >
                        <path
                          d="M 20 112 A 90 90 0 0 1 200 112"
                          fill="none"
                          stroke="rgba(255,255,255,0.2)"
                          strokeWidth="19"
                          strokeLinecap="round"
                          pathLength="100"
                        />
                        {validity.percent > 0 ? (
                          <path
                            d="M 20 112 A 90 90 0 0 1 200 112"
                            fill="none"
                            stroke={validity.color}
                            strokeWidth="19"
                            strokeLinecap="round"
                            pathLength="100"
                            strokeDasharray="100"
                            strokeDashoffset={100 - validity.percent}
                          />
                        ) : (
                          <circle
                            cx="20"
                            cy="112"
                            r="9.5"
                            fill={validity.color}
                          />
                        )}
                      </svg>
                      <div className="absolute inset-x-0 top-[27%] flex flex-col items-center justify-center px-8 text-center">
                        <p
                          className="text-4xl font-black sm:text-5xl"
                          style={{ color: validity.color }}
                        >
                          {isSubscriptionSuspended || suspensionIsDue
                            ? "!"
                            : isInSuspensionGracePeriod
                              ? `-${overdueDays}`
                              : daysRemaining === null
                                ? "-"
                                : validity.remainingDays}
                        </p>
                        <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-neutral-500">
                          {isSubscriptionSuspended
                            ? "Plan suspendido"
                            : suspensionIsDue
                              ? "Suspensión pendiente"
                            : isInSuspensionGracePeriod
                              ? "Días desde vencimiento"
                              : "Días restantes"}
                        </p>
                        {isInSuspensionGracePeriod && (
                          <p className="mt-1 text-[10px] font-bold text-rose-300">
                            {suspensionDaysRemaining}{" "}
                            {suspensionDaysRemaining === 1
                              ? "día restante"
                              : "días restantes"}{" "}
                            para suspensión
                          </p>
                        )}
                        {(suspensionIsDue || isSubscriptionSuspended) && (
                          <p className="mt-1 text-[10px] font-bold text-rose-300">
                            {isSubscriptionSuspended
                              ? "La tienda está suspendida por vencimiento del plan."
                              : "El periodo de gracia terminó; la suspensión está en proceso."}
                          </p>
                        )}
                        <p className="mt-1 text-[10px] text-neutral-500">
                          {isInSuspensionGracePeriod ||
                          suspensionIsDue ||
                          isSubscriptionSuspended
                            ? "Ciclo vencido"
                            : `${validity.totalDays} días · ${
                                subscription.billing_period || "periodo"
                              }`}
                        </p>
                      </div>
                    </div>
                    <p className="mt-4 text-xs text-neutral-500">
                      {planHasExpired ? "Venció el " : "Vence el "}
                      <strong className="font-bold text-neutral-300">
                        {formatDate(planEndDate)}
                      </strong>
                    </p>
                  </div>
                  </section>
                )}

                {!isPaymentOnlyMode &&
                  isCommissionPlan &&
                  commissionStatement &&
                  !commissionCycleClosed && (
                    <section className="rounded-2xl border border-violet-300/15 bg-gradient-to-br from-violet-400/[0.07] via-neutral-900/80 to-neutral-900 p-5 sm:p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-300">
                            Comisión del ciclo en curso
                          </p>
                          <h2 className="mt-1 text-base font-black text-white">
                            El cobro se calcula al terminar tu periodo
                          </h2>
                          <p className="mt-1 text-xs text-neutral-400">
                            Ciclo: {formatDate(commissionStatement.cycle_starts_at)}
                            {" – "}
                            {formatDate(commissionStatement.cycle_ends_at)}
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">
                            Se calcula sobre el total de los tickets creados,
                            incluso si luego se cancelan.
                          </p>
                          <p className="mt-1 text-[11px] font-semibold text-neutral-400">
                            Comisión acumulada ({commissionStatement.commission_rate}% por ticket):{" "}
                            {formatCurrency(commissionStatement.commission_total)}{" "}
                            · Mínimo del ciclo:{" "}
                            {formatCurrency(commissionStatement.minimum_amount)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3 sm:min-w-44 sm:text-right">
                          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-500">
                            Estimado de cobro (comisión o mínimo)
                          </p>
                          <p className="mt-1 text-xl font-black text-violet-300">
                            {formatCurrency(commissionStatement.estimated_amount)}
                          </p>
                          <p className="mt-1 text-[10px] text-neutral-500">
                            {commissionStatement.order_count} tickets · ventas{" "}
                            {formatCurrency(commissionStatement.sales_total)}
                          </p>
                        </div>
                      </div>
                    </section>
                  )}

                {(isPaymentOnlyMode || showPaymentPanel) && (
                  <>
                    <div className="overflow-hidden rounded-2xl border border-rose-300/15 bg-gradient-to-br from-rose-400/[0.08] via-neutral-900/80 to-neutral-900">
                      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-300/15 bg-rose-400/10 text-rose-300">
                            <CreditCard size={19} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-300">
                              {isCommissionPlan
                                ? "Comisión del ciclo vencido"
                                : "Renovación del plan"}
                            </p>
                            <h2 className="mt-1 text-base font-black text-white">
                              Plan {subscription.plan_name}
                            </h2>
                            {!isCommissionPlan && (
                              <p className="mt-1 text-xs font-semibold text-neutral-300">
                                Ciclo que vas a renovar:{" "}
                                <span className="text-white">
                                  {subscription.billing_period || "No especificado"}
                                </span>
                              </p>
                            )}
                            <p className="mt-1 max-w-xl text-xs leading-relaxed text-neutral-400">
                              {isCommissionPlan
                                ? commissionStatement
                                  ? `Ciclo vencido ${formatDate(commissionStatement.cycle_starts_at)} – ${formatDate(commissionStatement.cycle_ends_at)}: ${commissionStatement.order_count} tickets sumaron ${formatCurrency(commissionStatement.sales_total)} en ventas. La comisión del ${commissionStatement.commission_rate}% calculada y redondeada por ticket suma ${formatCurrency(commissionStatement.commission_total)}. Se compara con el mínimo de ${formatCurrency(commissionStatement.minimum_amount)}; el total fijado para pagar es ${formatCurrency(commissionStatement.amount_due)}. Al aprobar el pago, se activa el siguiente ciclo.`
                                  : "No se pudo calcular el valor del ciclo vencido. Intenta actualizar la página o contacta a soporte."
                                : planHasExpired
                                  ? `Tu periodo terminó el ${formatDate(planEndDate)}. Este es el precio para renovar tu plan.`
                                  : subscription.status === "suspended"
                                    ? "Tu plan está suspendido. Este es el precio para solicitar su reactivación."
                                    : `Este es el precio para renovar cuando termine tu periodo actual${planEndDate ? `, el ${formatDate(planEndDate)}` : ""}.`}
                            </p>
                            {!isCommissionPlan && (
                              <p className="mt-2 text-[11px] text-neutral-500">
                                Este cobro corresponde al próximo periodo, no al que ya pagaste.
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3 sm:min-w-40 sm:text-right">
                          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-500">
                            {isCommissionPlan
                              ? "Total a pagar"
                              : "Valor de renovación"}
                          </p>
                          <p
                            className={`mt-1 text-2xl font-black ${
                              showPaymentPanel ? "text-rose-300" : "text-violet-300"
                            }`}
                          >
                            {renewalAmount === null
                              ? "No disponible"
                              : formatCurrency(renewalAmount)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <section className="grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                      <div className="flex flex-col justify-center rounded-xl bg-white/[0.035] p-5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <h2 className="text-base font-black">QR de pago</h2>
                          <CreditCard className="text-violet-300" size={18} />
                        </div>
                        <div className="mx-auto mt-4 flex aspect-square w-full max-w-[220px] items-center justify-center rounded-lg bg-white p-3">
                          {paymentQr?.publicUrl ? (
                            <img
                              src={paymentQr.publicUrl}
                              alt={paymentQr.label || "QR de pago"}
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            renewalAmount === null ? (
                              <p className="text-center text-xs text-neutral-500">
                                No se pudo consultar el valor del cobro.
                              </p>
                            ) : (
                              <QRCodeSVG
                                value={`Entidad bancaria genérica | Referencia GLOTO-${businessId} | Monto ${renewalAmount} COP`}
                                size={156}
                                bgColor="#ffffff"
                                fgColor="#111111"
                                level="M"
                              />
                            )
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowQrModal(true)}
                          className="mx-auto mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wider text-neutral-400 transition hover:bg-white/[0.06] hover:text-white"
                          aria-label="Ver QR en pantalla grande"
                        >
                          <Maximize2 size={14} />
                          Ver en pantalla grande
                        </button>
                      </div>
                      <form
                        onSubmit={handleUpload}
                        className="min-w-0 rounded-xl bg-white/[0.035] p-5"
                      >
                        <h2 className="text-lg font-black">Soporte de pago</h2>
                        <p className="mt-1 text-xs text-neutral-500">
                          JPG, PNG o PDF. Máximo 5 MB.
                        </p>
                        {latestPayment?.status === "pending" ? (
                          <div className="mt-4 rounded-lg bg-amber-500/10 px-3 py-3 text-xs text-amber-200">
                            Tu soporte fue enviado y permanece pendiente de
                            revisión.
                          </div>
                        ) : (
                          <>
                            <div className="relative mt-4 min-w-0">
                              <label className="flex min-w-0 w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/15 px-4 py-3 pr-12 text-sm text-neutral-300 hover:border-violet-400">
                                <FileUp
                                  size={18}
                                  className="shrink-0 text-violet-300"
                                />
                                <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                                  {paymentFile?.name || "Seleccionar archivo"}
                                </span>
                                <input
                                  key={fileInputKey}
                                  type="file"
                                  accept="application/pdf,image/jpeg,image/png"
                                  className="sr-only"
                                  onChange={handleFileChange}
                                />
                              </label>
                              {paymentFile && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPaymentFile(null);
                                    setFileInputKey((current) => current + 1);
                                  }}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-neutral-500 transition hover:bg-white/10 hover:text-white"
                                  aria-label="Cancelar archivo seleccionado"
                                >
                                  <X size={16} />
                                </button>
                              )}
                            </div>
                            {paymentPreviewUrl && paymentFile && (
                              <div className="mt-3 overflow-hidden rounded-lg bg-black/30 p-3">
                                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                                  Vista previa
                                </p>
                                {paymentFile?.type.startsWith("image/") ? (
                                  <img
                                    src={paymentPreviewUrl}
                                    alt="Vista previa del soporte de pago"
                                    className="max-h-64 w-full rounded-lg object-contain"
                                  />
                                ) : (
                                  <div className="flex items-center gap-2 text-sm text-neutral-300">
                                    <FileUp
                                      size={18}
                                      className="text-violet-300"
                                    />
                                    {paymentFile.name}
                                  </div>
                                )}
                              </div>
                            )}
                            <button
                              type="submit"
                              disabled={
                                saving || !paymentFile || renewalAmount === null
                              }
                              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-3 text-xs font-black uppercase tracking-wider transition hover:bg-violet-500 disabled:opacity-50"
                            >
                              {saving ? (
                                <LoaderCircle
                                  className="animate-spin"
                                  size={15}
                                />
                              ) : (
                                <Upload size={15} />
                              )}{" "}
                              Enviar soporte y solicitar pago
                            </button>
                          </>
                        )}
                      </form>
                    </section>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>

      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-emerald-400/20 bg-neutral-950 p-7 text-center shadow-2xl">
            <button
              type="button"
              onClick={() => setShowSuccessModal(false)}
              className="absolute right-4 top-4 rounded-lg p-2 text-neutral-500 hover:bg-white/10 hover:text-white"
              aria-label="Cerrar confirmación"
            >
              <X size={18} />
            </button>
            <CheckCircle2 className="mx-auto text-emerald-300" size={42} />
            <h2 className="mt-4 text-xl font-black">
              Soporte enviado con éxito
            </h2>
            <p className="mt-3 text-sm leading-6 text-neutral-400">
              Recibimos tu comprobante. Nuestro equipo lo revisará y te dará una
              respuesta pronto.
            </p>
            <button
              type="button"
              onClick={() => setShowSuccessModal(false)}
              className="mt-6 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-wider hover:bg-emerald-500"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {showQrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setShowQrModal(false)}
        >
          <div
            className="relative flex aspect-square w-full max-w-lg items-center justify-center rounded-2xl bg-white p-5 shadow-2xl sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="absolute -right-2 -top-2 rounded-full bg-neutral-900 p-2 text-white shadow-lg transition hover:bg-neutral-800"
              aria-label="Cerrar QR ampliado"
            >
              <X size={18} />
            </button>
            {paymentQr?.publicUrl ? (
              <img
                src={paymentQr.publicUrl}
                alt={paymentQr.label || "QR de pago ampliado"}
                className="h-full w-full object-contain"
              />
            ) : (
              renewalAmount === null ? (
                <p className="text-center text-sm text-neutral-500">
                  No se pudo consultar el precio de renovación.
                </p>
              ) : (
                <QRCodeSVG
                  value={`Entidad bancaria genérica | Referencia GLOTO-${businessId} | Monto ${renewalAmount} COP`}
                  className="h-full w-full"
                  bgColor="#ffffff"
                  fgColor="#111111"
                  level="M"
                />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
