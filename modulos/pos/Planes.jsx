import { useEffect, useState } from "react";
import {
  Check,
  Zap,
  Crown,
  Rocket,
  Upload,
  X,
  ShieldCheck,
  CalendarClock,
  ArrowRight,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import SubLoading from "./SubLoading";

const PLAN_ICONS = {
  inicial: Rocket,
  pro: Zap,
  premium: Crown,
};

const PLAN_MODAL_STYLES = {
  inicial: {
    header: "from-neutral-400/15 via-neutral-400/[0.04]",
    glow: "bg-neutral-300/10",
    panelBorder: "border-white/10",
    icon: "border-white/10 bg-white/10 text-neutral-200",
    badge: "bg-white/10 text-neutral-200",
    label: "text-neutral-300",
    price: "border-white/10 bg-white/[0.04]",
    step: "bg-white/10 text-neutral-200",
    primary: "bg-neutral-200 text-neutral-950 shadow-neutral-950/40 hover:bg-white",
  },
  pro: {
    header: "from-violet-600/25 via-violet-500/[0.08]",
    glow: "bg-violet-500/15",
    panelBorder: "border-violet-300/15",
    icon: "border-violet-300/20 bg-violet-400/15 text-violet-200",
    badge: "bg-violet-400/10 text-violet-300",
    label: "text-violet-300",
    price: "border-violet-300/15 bg-violet-400/[0.06]",
    step: "bg-violet-400/15 text-violet-200",
    primary: "bg-violet-600 text-white shadow-violet-950/40 hover:bg-violet-500",
  },
  premium: {
    header: "from-amber-400/20 via-amber-400/[0.06]",
    glow: "bg-amber-400/15",
    panelBorder: "border-amber-300/15",
    icon: "border-amber-300/20 bg-amber-400/15 text-amber-200",
    badge: "bg-amber-400/10 text-amber-300",
    label: "text-amber-300",
    price: "border-amber-300/15 bg-amber-400/[0.06]",
    step: "bg-amber-400/15 text-amber-200",
    primary: "bg-amber-400 text-neutral-950 shadow-amber-950/40 hover:bg-amber-300",
  },
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const Planes = () => {
  const [plans, setPlans] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [features, setFeatures] = useState([]);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [changeRequest, setChangeRequest] = useState(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [selectedSupportFile, setSelectedSupportFile] = useState(null);
  const [supportPreviewUrl, setSupportPreviewUrl] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [businessId, setBusinessId] = useState(null);
  const [subscriptionError, setSubscriptionError] = useState("");
  const [selectedPeriodCode, setSelectedPeriodCode] = useState("quarterly");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedSupportFile) {
      setSupportPreviewUrl("");
      return undefined;
    }

    const previewUrl = URL.createObjectURL(selectedSupportFile);
    setSupportPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [selectedSupportFile]);

  useEffect(() => {
    const loadPlans = async () => {
      const [
        { data: periodData, error: periodError },
        { data: featureData, error: featureError },
        currentSubscription,
      ] = await Promise.all([
        supabase
          .from("billing_plan_periods")
          .select(
            "id,plan_code,plan_name,billing_type,plan_is_active,plan_display_order,code,label,duration_days,price_amount,commission_rate,minimum_amount,display_order",
          )
          .eq("is_active", true)
          .eq("plan_is_active", true)
          .order("display_order", { ascending: true }),
        supabase
          .from("billing_plan_features")
          .select("id,plan_code,feature_text,is_section,display_order")
          .eq("is_active", true)
          .order("display_order", { ascending: true }),
        (async () => {
          const { data: userData, error: userError } =
            await supabase.auth.getUser();
          if (userError) {
            console.error("No se pudo consultar la sesión:", userError);
            setSubscriptionError("No se pudo consultar tu plan actual.");
            return null;
          }

          const userId = userData?.user?.id;
          if (!userId) return null;

          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("business_id")
            .eq("id", userId)
            .maybeSingle();

          if (profileError) {
            console.error(
              "No se pudo consultar el negocio del usuario:",
              profileError,
            );
            setSubscriptionError("No se pudo consultar tu plan actual.");
            return null;
          }

          if (!profile?.business_id) return null;

          setBusinessId(profile.business_id);

          const { data: subscription, error: subscriptionQueryError } =
            await supabase
              .from("subscriptions")
              .select("id,plan_code,plan_name,status,ends_at,period_id,billing_period")
              .eq("business_id", profile.business_id)
              .in("status", ["active", "suspended", "expired"])
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

          if (subscriptionQueryError) {
            console.error(
              "No se pudo consultar la suscripción actual:",
              subscriptionQueryError,
            );
            setSubscriptionError("No se pudo consultar tu plan actual.");
            return null;
          }

          const { data: openRequest, error: requestError } = await supabase
            .from("business_plan_change_requests")
            .select(
              "id,requested_plan_code,requested_plan_name,requested_period_code,requested_period_label,billing_type,duration_days,price_amount,commission_rate,minimum_amount,quoted_amount,status,payment_support_path,review_notes,created_at",
            )
            .in("status", [
              "awaiting_payment",
              "pending_review",
              "approved",
              "rejected",
            ])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (requestError) {
            console.error(
              "No se pudo consultar la solicitud de cambio de plan:",
              requestError,
            );
            setSubscriptionError(
              "No se pudo consultar el estado de tu solicitud de cambio.",
            );
          }

          if (
            subscription?.status === "active" &&
            subscription.ends_at &&
            new Date(subscription.ends_at).getTime() <= Date.now()
          ) {
            return { subscription: null, request: openRequest || null };
          }
          return {
            subscription: subscription || null,
            request: openRequest || null,
          };
        })(),
      ]);

      const activePeriods = periodData || [];
      setCurrentPlan(currentSubscription?.subscription || null);
      setChangeRequest(currentSubscription?.request || null);

      if (periodError) {
        console.error("No se pudieron cargar los períodos de los planes:", periodError);
        setError("No se pudieron cargar los planes.");
      } else {
        const planMap = new Map();
        activePeriods.forEach((period) => {
          if (!planMap.has(period.plan_code)) {
            planMap.set(period.plan_code, {
              id: period.plan_code,
              code: period.plan_code,
              name: period.plan_name,
              billing_type: period.billing_type,
              display_order: period.plan_display_order,
            });
          }
        });
        setPlans(
          Array.from(planMap.values()).sort(
            (first, second) =>
              Number(first.display_order) - Number(second.display_order),
          ),
        );
        setPeriods(activePeriods);
      }

      if (featureError) {
        console.error(
          "No se pudieron cargar las características:",
          featureError,
        );
        setError("No se pudieron cargar las características de los planes.");
      } else {
        setFeatures(featureData || []);
      }
      const currentSubscriptionRow = currentSubscription?.subscription;
      const currentSubscriptionPeriodCode =
        activePeriods.find(
          (period) => period.id === currentSubscriptionRow?.period_id,
        )?.code ||
        (/(trimestral|quarterly|90)/i.test(
          currentSubscriptionRow?.billing_period || "",
        )
          ? "quarterly"
          : /(mensual|monthly|30)/i.test(
                currentSubscriptionRow?.billing_period || "",
              )
            ? "monthly"
            : null);

      if (
        currentSubscriptionPeriodCode &&
        activePeriods.some(
          (period) => period.code === currentSubscriptionPeriodCode,
        )
      ) {
        setSelectedPeriodCode(currentSubscriptionPeriodCode);
      } else if (!activePeriods.some((period) => period.code === "quarterly")) {
        setSelectedPeriodCode("monthly");
      }
      setLoading(false);
    };

    loadPlans();
  }, []);

  const requestPlanChange = (plan, period) => {
    if (!period || !businessId || hasBlockingChangeRequest) return;
    const amount = period.billing_type === "commission"
      ? Number(period.minimum_amount || 0)
      : Number(period.price_amount || 0);
    const amountLabel =
      period.billing_type === "commission"
        ? `${Number(period.commission_rate || 0).toLocaleString("es-CO")}% por ticket${amount > 0 ? ` · mínimo a cobrar ${formatCurrency(amount)}` : ""} · cobro al cierre`
        : formatCurrency(amount);

    setConfirmation({
      type: "request",
      plan,
      period,
      amountLabel,
    });
  };

  const confirmPlanChangeAction = async () => {
    if (confirmation?.type === "request") {
      const { period } = confirmation;
      setRequestBusy(true);
      setRequestMessage("");
      const { data, error: requestError } = await supabase.rpc(
        "request_business_plan_change",
        { p_period_id: period.id },
      );

      if (requestError) {
        console.error("No se pudo crear la solicitud de cambio de plan:", requestError);
        setRequestMessage(
          requestError.message || "No se pudo crear la solicitud de cambio.",
        );
      } else {
        setChangeRequest(data);
        setRequestMessage(
          period.billing_type === "commission"
            ? "Solicitud enviada a nuestro equipo. No hay pago inicial; la comisión se calcula al terminar el ciclo."
            : "Solicitud creada. Adjunta el comprobante para enviarla a revisión.",
        );
      }
      setRequestBusy(false);
    } else if (confirmation?.type === "cancel") {
      if (
        !changeRequest ||
        (changeRequest.status !== "awaiting_payment" &&
          !(changeRequest.status === "pending_review" &&
            changeRequest.billing_type === "commission"))
      ) return;
      setRequestBusy(true);
      const { error: cancelError } = await supabase.rpc(
        "cancel_business_plan_change_request",
        { p_request_id: changeRequest.id },
      );
      if (cancelError) {
        console.error("No se pudo cancelar la solicitud:", cancelError);
        setRequestMessage(cancelError.message || "No se pudo cancelar la solicitud.");
      } else {
        setChangeRequest(null);
        setSelectedSupportFile(null);
        setRequestMessage("Solicitud cancelada.");
      }
      setRequestBusy(false);
    }

    setConfirmation(null);
  };

  const selectChangePayment = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      setRequestMessage("El comprobante debe ser PDF, JPG o PNG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setRequestMessage("El comprobante no puede superar 5 MB.");
      return;
    }

    setRequestMessage("");
    setSelectedSupportFile(file);
  };

  const submitChangePayment = async () => {
    if (!selectedSupportFile || !businessId || !changeRequest) return;

    setRequestBusy(true);
    setRequestMessage("");
    const extension =
      selectedSupportFile.name.split(".").pop()?.toLowerCase() || "bin";
    const supportPath = `${businessId}/plan-change-requests/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("payment-supports")
      .upload(supportPath, selectedSupportFile, { upsert: false });

    if (uploadError) {
      console.error("No se pudo subir el comprobante del cambio:", uploadError);
      setRequestMessage("No se pudo subir el comprobante de pago.");
      setRequestBusy(false);
      return;
    }

    const { data, error: submitError } = await supabase.rpc(
      "submit_business_plan_change_payment",
      {
        p_request_id: changeRequest.id,
        p_support_path: supportPath,
      },
    );

    if (submitError) {
      console.error("No se pudo enviar el comprobante del cambio:", submitError);
      setRequestMessage(
        `El archivo se subió, pero no se pudo enviar: ${submitError.message}`,
      );
    } else {
      setChangeRequest(data);
      setRequestMessage("Comprobante enviado. Nuestro equipo revisará tu solicitud.");
      setSelectedSupportFile(null);
    }
    setRequestBusy(false);
  };

  const cancelPlanChangeRequest = async () => {
    if (
      !changeRequest ||
      (changeRequest.status !== "awaiting_payment" &&
        !(changeRequest.status === "pending_review" &&
          changeRequest.billing_type === "commission"))
    ) return;
    setConfirmation({ type: "cancel" });
  };

  const periodOptions = periods.reduce((options, period) => {
    if (!options.some((option) => option.code === period.code)) {
      options.push(period);
    }
    return options;
  }, []);
  const monthlyOption = periodOptions.find(
    (period) => period.code === "monthly",
  );
  const quarterlyOption = periodOptions.find(
    (period) => period.code === "quarterly",
  );
  const showPeriodSwitch = monthlyOption && quarterlyOption;
  const selectedPeriod = periodOptions.find(
    (period) => period.code === selectedPeriodCode,
  );
  const currentPeriodCode =
    periods.find((period) => period.id === currentPlan?.period_id)?.code ||
    (/(trimestral|quarterly|90)/i.test(currentPlan?.billing_period || "")
      ? "quarterly"
      : /(mensual|monthly|30)/i.test(currentPlan?.billing_period || "")
        ? "monthly"
        : null);
  const hasOpenChangeRequest = ["awaiting_payment", "pending_review"].includes(
    changeRequest?.status,
  );
  const hasScheduledChange =
    changeRequest?.status === "approved" &&
    !(
      currentPlan?.plan_code === changeRequest.requested_plan_code &&
      currentPeriodCode === changeRequest.requested_period_code
    );
  const hasBlockingChangeRequest =
    hasOpenChangeRequest || hasScheduledChange;

  const selectOtherPeriod = () => {
    setSelectedPeriodCode(
      selectedPeriodCode === monthlyOption?.code
        ? quarterlyOption?.code
        : monthlyOption?.code,
    );
  };

  const confirmationPlanStyle =
    confirmation?.type === "request"
      ? PLAN_MODAL_STYLES[confirmation.plan.code] || PLAN_MODAL_STYLES.inicial
      : null;
  const ConfirmationPlanIcon =
    confirmation?.type === "request"
      ? PLAN_ICONS[confirmation.plan.code] || Rocket
      : null;

  return (
    <div className="min-h-screen bg-background px-6 pb-12 pt-24 text-white sm:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-16 text-center">
          <h1 className="mb-4 text-3xl font-black uppercase italic tracking-tighter sm:text-4xl md:text-5xl">
            Impulsa tu <span className="text-violet-500">Negocio</span>
          </h1>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-neutral-400 sm:text-base md:text-lg">
            Encuentra el plan ideal para tu negocio y crece a tu propio ritmo.
          </p>

          {showPeriodSwitch && (
            <div className="mt-10 flex items-center justify-center gap-4">
              <span
                className={`text-[11px] font-black uppercase tracking-widest ${selectedPeriodCode === monthlyOption.code ? "text-white" : "text-neutral-500"}`}
              >
                {monthlyOption.label}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={selectedPeriodCode === quarterlyOption.code}
                aria-label="Cambiar periodo de facturación"
                onClick={selectOtherPeriod}
                className="relative h-6 w-12 rounded-full border border-white/10 bg-neutral-900 p-1 transition-all"
              >
                <span
                  className={`block h-4 w-4 transform rounded-full bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.5)] transition-all duration-300 ${selectedPeriodCode === quarterlyOption.code ? "translate-x-6" : "translate-x-0"}`}
                />
              </button>
              <span
                className={`text-[11px] font-black uppercase tracking-widest ${selectedPeriodCode === quarterlyOption.code ? "text-white" : "text-neutral-500"}`}
              >
                {quarterlyOption.label}
              </span>
            </div>
          )}
        </header>

        {loading ? (
          <SubLoading
            label="Cargando planes"
            className="py-24"
            dotClassName="bg-violet-400"
            fullHeight
          />
        ) : error ? (
          <p className="py-16 text-center text-sm text-rose-300">{error}</p>
        ) : (
          <>
            {subscriptionError && (
              <p className="mb-6 text-center text-xs text-amber-300">
                {subscriptionError}
              </p>
            )}
            {changeRequest &&
              (changeRequest.status !== "approved" || hasScheduledChange) && (
              <section className="mb-8 overflow-hidden rounded-2xl border border-violet-400/20 bg-neutral-900/70 shadow-[0_16px_45px_rgba(0,0,0,0.18)]">
                <div className="relative flex flex-col gap-4 p-5 pr-14 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-400/10 text-violet-300">
                      {changeRequest.status === "awaiting_payment" ? (
                        <Upload size={18} />
                      ) : changeRequest.status === "rejected" ? (
                        <X size={18} />
                      ) : (
                        <ShieldCheck size={18} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-300">
                          {{
                            awaiting_payment: "Solicitud pendiente de pago",
                            pending_review:
                              changeRequest.billing_type === "commission"
                                ? "Solicitud de Premium en revisión"
                                : "Solicitud en revisión",
                            approved: "Cambio de plan aprobado",
                            rejected: "Solicitud rechazada",
                          }[changeRequest.status]}
                        </p>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-neutral-400">
                          {changeRequest.billing_type === "commission"
                            ? "Sin pago inicial"
                            : changeRequest.requested_period_label}
                        </span>
                      </div>
                      <p className="mt-1 text-base font-bold text-white">
                        Plan {changeRequest.requested_plan_name}
                      </p>
                      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-neutral-400">
                        {changeRequest.status === "approved"
                          ? "El cambio se activará al terminar tu periodo vigente."
                          : changeRequest.status === "pending_review"
                            ? changeRequest.billing_type === "commission"
                              ? "Tu plan actual sigue vigente mientras nuestro equipo revisa la solicitud. No hay pago inicial; la comisión se calcula al cierre del ciclo."
                              : "Tu plan actual sigue vigente mientras nuestro equipo revisa el comprobante."
                            : changeRequest.status === "rejected"
                              ? changeRequest.review_notes
                                ? `Motivo del rechazo: ${changeRequest.review_notes}`
                                : "La solicitud fue rechazada."
                              : "Tu plan actual sigue vigente mientras completas la solicitud."}
                      </p>
                      {requestMessage && (
                        <p className="mt-2 text-xs font-medium text-violet-200">
                          {requestMessage}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 rounded-xl border border-white/[0.07] bg-black/20 px-4 py-2.5 sm:text-right">
                    <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-500">
                      {changeRequest.billing_type === "commission"
                        ? `${Number(changeRequest.commission_rate || 0).toLocaleString("es-CO")}% por ticket · cobro al cierre`
                        : "Valor del periodo"}
                    </p>
                    <p className="mt-0.5 text-sm font-black text-white">
                      {changeRequest.billing_type === "commission"
                        ? changeRequest.minimum_amount
                          ? `Mínimo ${formatCurrency(changeRequest.minimum_amount)}`
                          : "Sin anticipo"
                        : formatCurrency(changeRequest.quoted_amount)}
                    </p>
                  </div>
                  {changeRequest.status === "rejected" && (
                    <button
                      type="button"
                      onClick={() => {
                        setChangeRequest(null);
                        setRequestMessage("");
                      }}
                      aria-label="Cerrar notificación de solicitud rechazada"
                      title="Cerrar notificación"
                      className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-white/[0.08] hover:text-white sm:static"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {changeRequest.status === "awaiting_payment" && (
                  <div className="border-t border-white/[0.07] bg-black/10 px-5 py-5 sm:px-6">
                    <div className="mb-4">
                      <p className="text-xs font-bold text-white">
                        Comprobante de pago
                      </p>
                      <p className="mt-1 text-[11px] text-neutral-500">
                        Archivos PDF, JPG o PNG · máximo 5 MB
                      </p>
                    </div>
                    {selectedSupportFile && supportPreviewUrl ? (
                      <div className="grid gap-4 sm:grid-cols-[minmax(180px,240px)_1fr]">
                        <div className="overflow-hidden rounded-xl border border-white/10 bg-neutral-950">
                          {selectedSupportFile.type === "application/pdf" ? (
                            <iframe
                              src={supportPreviewUrl}
                              title={`Vista previa de ${selectedSupportFile.name}`}
                              className="h-36 w-full bg-neutral-900"
                            />
                          ) : (
                            <img
                              src={supportPreviewUrl}
                              alt={`Vista previa de ${selectedSupportFile.name}`}
                              className="h-36 w-full object-contain"
                            />
                          )}
                        </div>
                        <div className="flex min-w-0 flex-col justify-between gap-4">
                          <div className="flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-400/10 text-violet-300">
                              {selectedSupportFile.type === "application/pdf" ? (
                                <FileText size={17} />
                              ) : (
                                <ImageIcon size={17} />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-neutral-200">
                                {selectedSupportFile.name}
                              </p>
                              <p className="mt-0.5 text-[10px] text-neutral-500">
                                {(selectedSupportFile.size / (1024 * 1024)).toFixed(2)} MB · Vista previa lista
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedSupportFile(null)}
                              disabled={requestBusy}
                              aria-label="Quitar comprobante seleccionado"
                              title="Quitar archivo"
                              className="rounded-lg p-2 text-neutral-500 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
                            >
                              <X size={15} />
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2.5 text-[10px] font-bold text-neutral-300 transition hover:bg-white/[0.06] hover:text-white">
                              <Upload size={14} />
                              Cambiar archivo
                              <input
                                type="file"
                                accept="application/pdf,image/jpeg,image/png"
                                className="sr-only"
                                disabled={requestBusy}
                                onChange={selectChangePayment}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={submitChangePayment}
                              disabled={requestBusy}
                              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-wide text-white shadow-lg shadow-violet-950/20 transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <ArrowRight size={14} />
                              {requestBusy ? "Enviando..." : "Enviar comprobante"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelPlanChangeRequest}
                              disabled={requestBusy}
                              className="inline-flex items-center gap-1 rounded-lg px-3 py-2.5 text-[10px] font-bold text-neutral-500 transition hover:bg-rose-400/10 hover:text-rose-300 disabled:opacity-50"
                            >
                              Cancelar solicitud
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-400/10 text-violet-300">
                            <Upload size={18} />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-neutral-200">
                              Selecciona el comprobante para revisarlo
                            </p>
                            <p className="mt-1 text-[10px] text-neutral-500">
                              Podrás ver la vista previa antes de enviarlo.
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-wide text-white shadow-lg shadow-violet-950/20 transition hover:bg-violet-500">
                            <Upload size={14} />
                            Adjuntar archivo
                            <input
                              type="file"
                              accept="application/pdf,image/jpeg,image/png"
                              className="sr-only"
                              disabled={requestBusy}
                              onChange={selectChangePayment}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={cancelPlanChangeRequest}
                            disabled={requestBusy}
                            className="rounded-lg px-3 py-2.5 text-[10px] font-bold text-neutral-500 transition hover:bg-rose-400/10 hover:text-rose-300 disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {changeRequest.status === "pending_review" && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] bg-amber-400/[0.04] px-5 py-3 text-xs text-amber-200/80 sm:px-6">
                    <span className="flex items-center gap-2">
                      <ShieldCheck size={15} className="shrink-0" />
                      Te avisaremos cuando nuestro equipo termine la revisión.
                    </span>
                    {changeRequest.billing_type === "commission" && (
                      <button
                        type="button"
                        onClick={cancelPlanChangeRequest}
                        disabled={requestBusy}
                        className="rounded-lg px-3 py-2 text-[10px] font-bold text-amber-100/70 transition hover:bg-rose-400/10 hover:text-rose-200 disabled:opacity-50"
                      >
                        Cancelar solicitud
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}
            {requestMessage && !changeRequest && (
              <p className="mb-6 text-center text-xs text-violet-200">
                {requestMessage}
              </p>
            )}
            {plans.length === 0 ? (
              <p className="py-16 text-center text-sm text-neutral-400">
                No hay planes activos disponibles.
              </p>
            ) : (
              <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 lg:grid-cols-3 xl:gap-8">
                {plans.map((plan) => {
              const Icon = PLAN_ICONS[plan.code] || Rocket;
                const isCurrentPlan =
                  currentPlan?.plan_code === plan.code &&
                  currentPeriodCode === selectedPeriodCode;
              const highlight = plan.code === "pro";
              const isPremium = plan.code === "premium";
              const isCommission = plan.billing_type === "commission";
              const planPeriod = periods.find(
                (period) =>
                  period.plan_code === plan.code &&
                  period.code === selectedPeriodCode,
              );
              const price = planPeriod?.price_amount;
              const minimum = planPeriod?.minimum_amount;
              const commissionRate = planPeriod?.commission_rate;
              const monthlyPeriod = periods.find(
                (period) =>
                  period.plan_code === plan.code && period.code === "monthly",
              );
              const quarterlyPeriod = periods.find(
                (period) =>
                  period.plan_code === plan.code && period.code === "quarterly",
              );
              const showQuarterlyComparison =
                selectedPeriodCode === "quarterly" &&
                monthlyPeriod &&
                quarterlyPeriod;
              const quarterlySavings = isCommission
                ? Number(monthlyPeriod?.minimum_amount || 0) * 3 -
                  Number(quarterlyPeriod?.minimum_amount || 0)
                : Number(monthlyPeriod?.price_amount || 0) * 3 -
                  Number(quarterlyPeriod?.price_amount || 0);
              const commissionRateSavings = isCommission
                ? Number(monthlyPeriod?.commission_rate || 0) -
                  Number(quarterlyPeriod?.commission_rate || 0)
                : 0;
              const periodLabel =
                planPeriod?.label || selectedPeriod?.label || "";
              const planFeatures = features.filter(
                (feature) => feature.plan_code === plan.code,
              );

              return (
                <article
                  key={plan.id}
                  className={`relative flex min-w-0 flex-col rounded-[2rem] border p-5 transition-all duration-500 hover:scale-[1.01] sm:p-8 ${
                    isPremium
                      ? "border-amber-300/40 bg-amber-400/[0.04] shadow-[0_20px_50px_rgba(245,158,11,0.12)]"
                      : highlight
                        ? "border-violet-500/40 bg-violet-600/[0.03] shadow-[0_20px_50px_rgba(124,58,237,0.1)]"
                        : "border-white/[0.06] bg-white/[0.01]"
                  }`}
                >
                  {(highlight || isPremium) && (
                    <div
                      className={`absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-white ${isPremium ? "bg-amber-500 text-neutral-950" : "bg-violet-600"}`}
                    >
                      {isPremium ? "Más completo" : "Recomendado"}
                    </div>
                  )}

                  <div className="mb-6">
                    <div className="mb-6 flex items-center gap-3">
                      <div
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${isPremium ? "bg-amber-400/15" : highlight ? "bg-violet-600/20" : "bg-white/5"}`}
                      >
                        <Icon
                          className={
                            isPremium
                              ? "text-amber-300"
                              : highlight
                                ? "text-violet-400"
                                : "text-neutral-500"
                          }
                          size={24}
                        />
                      </div>
                      {isCurrentPlan && (
                        <span className="inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-300">
                          {currentPlan.status === "pending"
                            ? "Pendiente"
                            : currentPlan.status === "suspended"
                              ? "Suspendido"
                              : "Plan actual"}
                        </span>
                      )}
                    </div>
                    <h2
                      className={`text-2xl font-black uppercase italic tracking-tight ${isPremium ? "text-amber-100" : ""}`}
                    >
                      {plan.name}
                    </h2>
                  </div>

                  <div className="min-w-0 border-t border-white/5 pt-5 sm:min-h-[85px] sm:pt-6">
                    {isCommission ? (
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span
                            className={`break-words text-4xl font-black italic leading-none tracking-tighter sm:text-5xl ${isPremium ? "text-amber-300" : "text-violet-400"}`}
                          >
                            {commissionRate === null ||
                            commissionRate === undefined
                              ? "-"
                              : `${Number(commissionRate).toLocaleString("es-CO")}%`}
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                            de ventas netas
                          </span>
                        </div>
                        <p className="mt-2 break-words text-[10px] font-black uppercase tracking-wider text-neutral-400">
                          {minimum === null || minimum === undefined
                            ? "Mínimo no configurado"
                            : `Mínimo ${formatCurrency(minimum)} ${periodLabel ? `/ ${periodLabel}` : ""}`}
                        </p>
                      </div>
                    ) : price === null || price === undefined ? (
                      <p className="text-sm text-neutral-400">
                        Precio no configurado para este periodo.
                      </p>
                    ) : (
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="break-words text-3xl font-black italic leading-none tracking-tighter sm:text-4xl">
                            {formatCurrency(price)}
                          </span>
                          {periodLabel && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                              / {periodLabel}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {showQuarterlyComparison &&
                      (isCommission
                        ? commissionRateSavings > 0
                        : quarterlySavings > 0) && (
                      <p
                        className={`mt-3 break-words rounded-lg border px-3 py-2 text-[10px] font-semibold leading-relaxed ${
                          isPremium
                            ? "border-amber-300/15 bg-amber-400/[0.06] text-amber-200"
                            : "border-emerald-300/15 bg-emerald-400/[0.06] text-emerald-200"
                        }`}
                      >
                        {isCommission
                          ? `Ahorras ${commissionRateSavings.toLocaleString("es-CO", {
                              maximumFractionDigits: 2,
                            })}% en comisión`
                          : `Ahorras ${formatCurrency(quarterlySavings)}`}
                      </p>
                    )}
                  </div>

                  <ul className="mb-10 mt-6 flex-1 space-y-3.5 border-t border-white/5 pt-6">
                    {planFeatures.map((feature) => (
                      <li
                        key={feature.id}
                        className={`flex items-start gap-3 text-sm ${
                          feature.is_section
                            ? `mt-2 font-bold ${isPremium ? "text-amber-300" : "text-violet-400"}`
                            : "text-neutral-300"
                        }`}
                      >
                        {!feature.is_section && (
                          <Check
                            size={16}
                            className={`mt-0.5 shrink-0 ${isPremium ? "text-amber-400" : "text-violet-500"}`}
                          />
                        )}
                        <span>{feature.feature_text}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => requestPlanChange(plan, planPeriod)}
                    disabled={
                      !businessId ||
                      !planPeriod ||
                      requestBusy ||
                      hasBlockingChangeRequest ||
                      isCurrentPlan
                    }
                    className={`mt-auto w-full rounded-xl px-4 py-3 text-xs font-black uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      isPremium
                        ? "bg-amber-400 text-neutral-950 hover:bg-amber-300"
                        : highlight
                          ? "bg-violet-600 text-white hover:bg-violet-500"
                          : "border border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                    }`}
                  >
                    {isCurrentPlan
                      ? "Este es tu plan actual"
                      : hasOpenChangeRequest
                        ? "Solicitud pendiente"
                        : hasScheduledChange
                          ? "Cambio programado"
                        : requestBusy
                          ? "Procesando..."
                          : "Quiero este plan"}
                  </button>
                  {requestMessage && !changeRequest && (
                    <p className="mt-2 text-center text-xs text-rose-300">
                      {requestMessage}
                    </p>
                  )}
                </article>
              );
                })}
              </div>
            )}
          </>
        )}
      </div>
      {confirmation && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md"
          onClick={() => !requestBusy && setConfirmation(null)}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="plan-change-confirmation-title"
            className={`my-auto w-full max-w-lg overflow-hidden rounded-3xl border bg-[#111019] shadow-[0_24px_100px_rgba(0,0,0,0.65)] ${confirmationPlanStyle?.panelBorder || "border-rose-300/15"}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`relative overflow-hidden border-b border-white/[0.07] bg-gradient-to-br ${confirmationPlanStyle?.header || "from-rose-500/20 via-rose-500/[0.06]"} to-transparent px-6 pb-6 pt-7 sm:px-8`}>
              <div className={`absolute -right-10 -top-14 h-44 w-44 rounded-full blur-3xl ${confirmationPlanStyle?.glow || "bg-rose-400/10"}`} />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border shadow-lg ${
                    confirmationPlanStyle?.icon || "border-rose-300/20 bg-rose-400/15 text-rose-200"
                  }`}>
                    {confirmation.type === "request" ? (
                      <ConfirmationPlanIcon size={23} />
                    ) : (
                      <X size={22} />
                    )}
                  </div>
                  <div className="pt-0.5">
                    <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${confirmationPlanStyle?.label || "text-rose-300"}`}>
                      {confirmation.type === "request"
                        ? "Tu próximo paso"
                        : "Administrar solicitud"}
                    </p>
                    <h2
                      id="plan-change-confirmation-title"
                      className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl"
                    >
                      {confirmation.type === "request"
                        ? confirmation.period.billing_type === "commission"
                          ? `Solicitar ${confirmation.plan.name}`
                          : `Elige ${confirmation.plan.name}`
                        : "¿Cancelar solicitud?"}
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmation(null)}
                  disabled={requestBusy}
                  aria-label="Cerrar confirmación"
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-neutral-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  <X size={17} />
                </button>
              </div>
            </div>
            <div className="space-y-5 px-6 py-6 sm:px-8">
              {confirmation.type === "request" ? (
                <>
                  <div className={`flex items-center justify-between gap-4 rounded-2xl border p-4 sm:p-5 ${confirmationPlanStyle.price}`}>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-400">
                        {confirmation.period.billing_type === "commission"
                          ? `Ciclo ${confirmation.period.label}`
                          : confirmation.period.label}
                      </p>
                      <p className="mt-1 break-words text-lg font-black text-white sm:text-xl">
                        {confirmation.amountLabel}
                      </p>
                      <p className="mt-1 text-xs text-neutral-400">
                        {confirmation.period.billing_type === "commission"
                          ? "No pagas por adelantado. La comisión se liquida al terminar el ciclo."
                          : "Valor del periodo seleccionado"}
                      </p>
                    </div>
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${confirmationPlanStyle.badge}`}>
                      <ShieldCheck size={21} />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <CalendarClock size={16} className={confirmationPlanStyle.label} />
                      <p className="text-xs font-black uppercase tracking-wider text-neutral-200">
                        ¿Qué pasa después?
                      </p>
                    </div>
                    <ol className="space-y-3">
                      <li className="flex items-start gap-3 text-sm text-neutral-300">
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${confirmationPlanStyle.step}`}>
                          1
                        </span>
                        <span>
                          {confirmation.period.billing_type === "commission"
                            ? "Envías la solicitud sin realizar un pago inicial."
                            : "Confirmas y adjuntas tu comprobante de pago."}
                        </span>
                      </li>
                      <li className="flex items-start gap-3 text-sm text-neutral-300">
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${confirmationPlanStyle.step}`}>
                          2
                        </span>
                        <span>
                          {confirmation.period.billing_type === "commission"
                            ? "Nuestro equipo revisa y autoriza el cambio de plan."
                            : "Nuestro equipo revisa el comprobante."}
                        </span>
                      </li>
                      <li className="flex items-start gap-3 text-sm text-neutral-300">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-[10px] font-black text-emerald-200">
                          3
                        </span>
                        <span>
                          {confirmation.period.billing_type === "commission"
                            ? "Premium inicia al terminar tu ciclo actual; la comisión se calcula al cierre del ciclo Premium."
                            : "Tu plan actual sigue activo; el nuevo inicia al terminar su periodo."}
                        </span>
                      </li>
                    </ol>
                  </div>
                </>
              ) : (
                <p className="text-sm leading-relaxed text-neutral-300">
                  {changeRequest?.billing_type === "commission"
                    ? "La solicitud de cambio a Premium se cancelará. Tu suscripción actual no tendrá cambios y podrás solicitar Premium nuevamente más adelante."
                    : "La solicitud se cancelará y ya no tendrás que enviar el comprobante. Si cambias de opinión, podrás elegir un plan nuevamente."}
                </p>
              )}

              <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmation(null)}
                  disabled={requestBusy}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-xs font-bold text-neutral-300 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
                >
                  {confirmation.type === "request" ? "Ahora no" : "Conservar solicitud"}
                </button>
                <button
                  type="button"
                  onClick={confirmPlanChangeAction}
                  disabled={requestBusy}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-xs font-black shadow-lg transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${
                    confirmation.type === "request"
                      ? confirmationPlanStyle.primary
                      : "bg-rose-600/90 shadow-rose-950/30 hover:bg-rose-500"
                  }`}
                >
                  {requestBusy
                    ? "Procesando..."
                    : confirmation.type === "request"
                      ? confirmation.period.billing_type === "commission"
                        ? "Enviar solicitud"
                        : "Continuar con este plan"
                      : "Sí, cancelar solicitud"}
                  {!requestBusy && confirmation.type === "request" && (
                    <ArrowRight size={15} />
                  )}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default Planes;
