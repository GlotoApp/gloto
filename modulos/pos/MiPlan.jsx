import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  FileUp,
  LoaderCircle,
  Maximize2,
  X,
  Upload,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../../src/lib/supabaseClient";

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

const formatShortDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("es-CO", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "Sin fecha";

const getDaysRemaining = (endsAt) => {
  if (!endsAt) return null;
  return Math.max(
    0,
    Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000),
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
  const [latestPayment, setLatestPayment] = useState(null);
  const [paymentQr, setPaymentQr] = useState(null);
  const [paymentFile, setPaymentFile] = useState(null);
  const [paymentPreviewUrl, setPaymentPreviewUrl] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

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
    const [{ data, error }, { data: paymentData }, { data: qrData }] =
      await Promise.all([
        supabase
          .from("subscriptions")
          .select(
            "id,plan_name,status,amount,billing_period,starts_at,ends_at,payment_method,plan_id,period_id,duration_days",
          )
          .eq("business_id", profile.business_id)
          .in("status", [
            "active",
            "pending",
            "suspended",
            "expired",
            "cancelled",
          ])
          .order("ends_at", { ascending: false })
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

    if (error) setMessage("No se pudo cargar la información del plan.");
    else setSubscription(data);
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
    () => getDaysRemaining(planEndDate),
    [planEndDate],
  );

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

  const showPaymentPanel =
    (subscription?.status === "active" &&
      daysRemaining !== null &&
      daysRemaining <= 5) ||
    ["suspended", "expired"].includes(subscription?.status);

  const handleUpload = async (event) => {
    event.preventDefault();
    if (
      !businessId ||
      !subscription ||
      !paymentFile ||
      latestPayment?.status === "pending"
    )
      return;

    setSaving(true);
    setMessage("");
    const extension = paymentFile.name.split(".").pop()?.toLowerCase() || "bin";
    const filePath = `${businessId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("payment-supports")
      .upload(filePath, paymentFile, { upsert: false });

    if (uploadError) {
      setMessage("No se pudo subir el soporte de pago.");
      setSaving(false);
      return;
    }

    const { error: recordError } = await supabase
      .from("payment_records")
      .insert({
        business_id: businessId,
        subscription_id: subscription.id,
        amount: subscription.amount,
        payment_method: "manual",
        status: "pending",
        support_path: filePath,
      });

    setMessage(
      recordError
        ? "El archivo se subió, pero no se pudo registrar el pago."
        : "Soporte enviado y solicitud de pago registrada. Te avisaremos cuando sea validada.",
    );
    if (!recordError) setShowSuccessModal(true);
    setPaymentFile(null);
    setFileInputKey((current) => current + 1);
    setSaving(false);
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

  if (loading) {
    return (
      <div className="p-8 text-sm text-neutral-400">Cargando tu plan...</div>
    );
  }

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
          <p className="max-w-xs text-left text-xs leading-5 text-neutral-500 sm:text-right">
            Consulta tu vigencia y envía el soporte de pago.
          </p>
        </header>

        {message && (
          <div className="rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-2.5 text-xs text-violet-200">
            {message}
          </div>
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
            <section className="rounded-xl bg-white/[0.02] p-5 sm:p-6">
              <div className="mx-auto max-w-sm text-center">
                <div className="flex items-center justify-between gap-3 text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                    Plan {subscription.plan_name}
                  </p>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${
                      validity.isActive
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-rose-500/10 text-rose-300"
                    }`}
                  >
                    <CheckCircle2 size={11} />{" "}
                    {getStatusLabel(subscription.status)}
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
                      <circle cx="20" cy="112" r="9.5" fill={validity.color} />
                    )}
                  </svg>
                  <div className="absolute inset-x-0 top-[27%] flex flex-col items-center justify-center px-8 text-center">
                    <p
                      className="text-4xl font-black sm:text-5xl"
                      style={{ color: validity.color }}
                    >
                      {daysRemaining === null ? "-" : validity.remainingDays}
                    </p>
                    <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-neutral-500">
                      Días restantes
                    </p>
                    <p className="mt-1 text-[10px] text-neutral-500">
                      {validity.totalDays} días ·{" "}
                      {subscription.billing_period || "periodo"}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-xs text-neutral-500">
                  Vence el{" "}
                  <strong className="font-bold text-neutral-300">
                    {formatDate(planEndDate)}
                  </strong>
                </p>
              </div>
            </section>

            {showPaymentPanel && (
              <>
                <div className="flex flex-col gap-3 rounded-xl bg-white/[0.035] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <div className="flex items-center gap-3">
                    <CreditCard
                      className={
                        showPaymentPanel ? "text-rose-300" : "text-violet-300"
                      }
                      size={22}
                    />
                    <div>
                      <h2 className="text-base font-black">Monto a pagar</h2>
                      <p className="mt-1 text-sm text-neutral-400">
                        Ciclo facturado:{" "}
                        {formatShortDate(subscription.starts_at)}
                        {" - "}
                        {formatShortDate(subscription.ends_at)}
                      </p>
                    </div>
                  </div>
                  <p
                    className={`text-3xl font-black sm:text-right ${
                      showPaymentPanel ? "text-rose-300" : "text-violet-300"
                    }`}
                  >
                    {formatCurrency(subscription.amount)}
                  </p>
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
                        <QRCodeSVG
                          value={`Entidad bancaria genérica | Referencia GLOTO-${businessId} | Monto ${subscription.amount} COP`}
                          size={156}
                          bgColor="#ffffff"
                          fgColor="#111111"
                          level="M"
                        />
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
                                <FileUp size={18} className="text-violet-300" />
                                {paymentFile.name}
                              </div>
                            )}
                          </div>
                        )}
                        <button
                          type="submit"
                          disabled={saving || !paymentFile}
                          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-3 text-xs font-black uppercase tracking-wider transition hover:bg-violet-500 disabled:opacity-50"
                        >
                          {saving ? (
                            <LoaderCircle className="animate-spin" size={15} />
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
              <QRCodeSVG
                value={`Entidad bancaria genérica | Referencia GLOTO-${businessId} | Monto ${subscription.amount} COP`}
                className="h-full w-full"
                bgColor="#ffffff"
                fgColor="#111111"
                level="M"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
