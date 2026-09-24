import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FileUp,
  LoaderCircle,
  Upload,
  WalletCards,
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

const getDaysRemaining = (endsAt) => {
  if (!endsAt) return null;
  return Math.max(
    0,
    Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000),
  );
};

const MAX_SUPPORT_SIZE = 5 * 1024 * 1024;
const ALLOWED_SUPPORT_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const PLAN_DURATION_DAYS = 30;

const getPlanEndDate = (plan) => {
  if (plan?.ends_at) return plan.ends_at;
  if (!plan?.starts_at) return null;

  const endDate = new Date(plan.starts_at);
  endDate.setDate(endDate.getDate() + PLAN_DURATION_DAYS);
  return endDate.toISOString();
};

export default function MiPlan() {
  const [businessId, setBusinessId] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [paymentFile, setPaymentFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

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
    const { data, error } = await supabase
      .from("subscriptions")
      .select(
        "id,plan_name,status,amount,billing_period,starts_at,ends_at,payment_method",
      )
      .eq("business_id", profile.business_id)
      .in("status", ["active", "pending"])
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) setMessage("No se pudo cargar la información del plan.");
    else setSubscription(data);
    setLoading(false);
  };

  useEffect(() => {
    loadSubscription();
  }, []);

  const planEndDate = useMemo(
    () => getPlanEndDate(subscription),
    [subscription?.ends_at, subscription?.starts_at],
  );

  const daysRemaining = useMemo(
    () => getDaysRemaining(planEndDate),
    [planEndDate],
  );

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!businessId || !subscription || !paymentFile) return;

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
    <div className="min-h-screen bg-background px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="border-b border-white/10 pb-5">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-violet-400">
            Finanzas
          </p>
          <h1 className="text-3xl font-black tracking-tight">Mi plan</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Consulta la vigencia, paga tu suscripción y envía el soporte.
          </p>
        </header>

        {message && (
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-3 text-sm text-violet-200">
            {message}
          </div>
        )}

        {!subscription ? (
          <section className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-neutral-400">
            No tienes un plan activo o pendiente asociado a este negocio.
          </section>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-[1.4fr_1fr_1fr]">
              <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">
                      Plan actual
                    </p>
                    <h2 className="mt-2 text-3xl font-black uppercase">
                      {subscription.plan_name}
                    </h2>
                    <p className="mt-2 text-sm text-neutral-300">
                      {formatCurrency(subscription.amount)} /{" "}
                      {subscription.billing_period || "periodo"}
                    </p>
                  </div>
                  <WalletCards className="text-violet-300" size={28} />
                </div>
                <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-300">
                  <CheckCircle2 size={14} /> {subscription.status}
                </span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-neutral-900/50 p-6">
                <CalendarClock className="text-neutral-400" size={24} />
                <p className="mt-5 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                  Vence el
                </p>
                <p className="mt-1 text-lg font-black">
                  {formatDate(planEndDate)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-neutral-900/50 p-6">
                <CreditCard className="text-neutral-400" size={24} />
                <p className="mt-5 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                  Días restantes
                </p>
                <p className="mt-1 text-3xl font-black text-violet-300">
                  {daysRemaining === null ? "-" : daysRemaining}
                </p>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
              <div className="rounded-2xl border border-white/10 bg-neutral-900/50 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-black">Monto a pagar</h2>
                    <p className="mt-1 text-sm text-neutral-400">
                      Plan de {PLAN_DURATION_DAYS} días
                    </p>
                  </div>
                  <CreditCard className="text-violet-300" size={22} />
                </div>
                <p className="mt-5 text-3xl font-black text-violet-300">
                  {formatCurrency(subscription.amount)}
                </p>
                <p className="mt-2 text-xs text-neutral-500">
                  El vencimiento se cuenta por 30 días desde la aprobación del
                  pago.
                </p>
                <div className="mt-5 flex justify-center rounded-xl bg-white p-4">
                  <QRCodeSVG
                    value={`Entidad bancaria genérica | Referencia GLOTO-${businessId} | Monto ${subscription.amount} COP`}
                    size={156}
                    bgColor="#ffffff"
                    fgColor="#111111"
                    level="M"
                  />
                </div>
                <p className="mt-3 text-center text-[10px] font-black uppercase tracking-widest text-neutral-500">
                  QR de referencia bancaria
                </p>
              </div>
              <form
                onSubmit={handleUpload}
                className="rounded-2xl border border-white/10 bg-neutral-900/50 p-5"
              >
                <h2 className="text-lg font-black">Soporte de pago</h2>
                <p className="mt-2 text-sm text-neutral-400">
                  Sube la captura o comprobante para solicitar la validación.
                </p>
                <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/15 px-4 py-3 text-sm text-neutral-300 hover:border-violet-400">
                  <FileUp size={18} className="text-violet-300" />
                  <span className="min-w-0 flex-1 truncate">
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
                <button
                  type="submit"
                  disabled={saving || !paymentFile}
                  className="mt-4 flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-xs font-black uppercase tracking-wider transition hover:bg-violet-500 disabled:opacity-50"
                >
                  {saving ? (
                    <LoaderCircle className="animate-spin" size={15} />
                  ) : (
                    <Upload size={15} />
                  )}{" "}
                  Enviar soporte y solicitar pago
                </button>
                {!paymentFile && (
                  <p className="mt-3 text-xs text-amber-300">
                    Debes subir el soporte antes de solicitar el pago.
                  </p>
                )}
              </form>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
