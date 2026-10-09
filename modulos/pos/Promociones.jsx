import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  CreditCard,
  FileUp,
  Image,
  Megaphone,
  Plus,
  Save,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  removeStorageObjectIfUnused,
  supabase,
} from "../../src/lib/supabaseClient";
import SubLoading from "./SubLoading";

const MAX_SUPPORT_SIZE = 5 * 1024 * 1024;
const ALLOWED_SUPPORT_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const PROMOTION_PACKAGES = [
  { days: 7, label: "1 semana" },
  { days: 14, label: "2 semanas" },
  { days: 21, label: "3 semanas" },
  { days: 30, label: "Mensual" },
];

const INITIAL_FORM = {
  tag: "NUEVO",
  offerText: "",
  coverPath: "",
  durationDays: 7,
};

const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString("es-CO") : "Sin fecha definida";

const formatCurrency = (value) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const Promociones = () => {
  const [businessId, setBusinessId] = useState(null);
  const [businessName, setBusinessName] = useState("");
  const [promotions, setPromotions] = useState([]);
  const [pricing, setPricing] = useState(null);
  const [discountTiers, setDiscountTiers] = useState([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [paymentQr, setPaymentQr] = useState(null);
  const [paymentFile, setPaymentFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [retryingPromotion, setRetryingPromotion] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState("");
  const [renewingPromotion, setRenewingPromotion] = useState(null);
  const [deletingPromotion, setDeletingPromotion] = useState(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadData = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      setMessage("Debes iniciar sesión para gestionar promociones.");
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
    const [
      { data: businessData, error: businessError },
      { data, error },
      { data: qrData },
      { data: pricingData, error: pricingError },
      { data: tierData, error: tierError },
    ] = await Promise.all([
      supabase
        .from("businesses")
        .select("name")
        .eq("id", profile.business_id)
        .maybeSingle(),
      supabase
        .from("promotions")
        .select(
          "id,tag,title,offer_text,cover_path,starts_at,ends_at,payment_status,payment_notes,duration_days,daily_rate,discount_percent,subtotal_amount,discount_amount,total_amount,created_at",
        )
        .eq("business_id", profile.business_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("payment_qr_codes")
        .select("id,label,storage_path")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("promotion_pricing_settings")
        .select("daily_rate")
        .eq("id", true)
        .maybeSingle(),
      supabase
        .from("promotion_discount_tiers")
        .select("id,min_days,discount_percent")
        .eq("is_active", true)
        .order("min_days", { ascending: true }),
    ]);

    if (businessError || !businessData?.name) {
      setMessage("No se pudo cargar el nombre del negocio.");
    } else {
      setBusinessName(businessData.name);
    }
    if (error) setMessage("No se pudieron cargar las promociones.");
    else setPromotions(data || []);
    if (pricingError || tierError || !pricingData) {
      setMessage("No se pudo cargar la tarifa de promociones.");
      setPricing(null);
    } else {
      setPricing(pricingData);
      setDiscountTiers(tierData || []);
    }
    if (qrData?.storage_path) {
      const { data: publicUrlData } = supabase.storage
        .from("payment-qr")
        .getPublicUrl(qrData.storage_path);
      setPaymentQr({ ...qrData, publicUrl: publicUrlData.publicUrl });
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const timerId = window.setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (coverFile) {
      const objectUrl = URL.createObjectURL(coverFile);
      setCoverPreviewUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }

    if (form.coverPath) {
      const { data } = supabase.storage
        .from("business-assets")
        .getPublicUrl(form.coverPath);
      setCoverPreviewUrl(data.publicUrl);
      return undefined;
    }

    setCoverPreviewUrl("");
    return undefined;
  }, [coverFile, form.coverPath]);

  const durationDays = Number(form.durationDays);
  const selectedPackageAvailable =
    PROMOTION_PACKAGES.some((option) => option.days === durationDays) &&
    discountTiers.some((tier) => tier.min_days === durationDays);

  const handleCoverChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setCoverFile(null);
      setMessage("La portada debe ser JPG, PNG o WEBP.");
      return;
    }

    if (file.size > MAX_SUPPORT_SIZE) {
      setCoverFile(null);
      setMessage("La portada no puede superar 5 MB.");
      return;
    }

    setMessage("");
    setCoverFile(file);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (
      !businessId ||
      !businessName.trim() ||
      !form.offerText.trim() ||
      !selectedPackageAvailable ||
      !pricing ||
      !paymentFile
    )
      return;

    setSaving(true);
    setMessage("");
    const previousCoverPath =
      retryingPromotion?.cover_path || renewingPromotion?.cover_path || null;
    const previousSupportPath =
      retryingPromotion?.payment_support_path ||
      renewingPromotion?.payment_support_path ||
      null;
    let coverPath = form.coverPath || null;

    if (coverFile) {
      const coverExtension =
        coverFile.name.split(".").pop()?.toLowerCase() || "jpg";
      coverPath = `${businessId}/promociones/${crypto.randomUUID()}.${coverExtension}`;
      const { error: coverUploadError } = await supabase.storage
        .from("business-assets")
        .upload(coverPath, coverFile, { upsert: false });

      if (coverUploadError) {
        setMessage("No se pudo subir la portada.");
        setSaving(false);
        return;
      }
    }

    const extension = paymentFile.name.split(".").pop()?.toLowerCase() || "bin";
    const filePath = `${businessId}/promotions/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("payment-supports")
      .upload(filePath, paymentFile, { upsert: false });

    if (uploadError) {
      if (coverFile && coverPath) {
        await supabase.storage.from("business-assets").remove([coverPath]);
      }
      setMessage("No se pudo subir el soporte de pago.");
      setSaving(false);
      return;
    }

    let saveError;
    if (retryingPromotion) {
      const { error } = await supabase
        .from("promotions")
        .update({
          title: businessName,
          payment_support_path: filePath,
          payment_status: "pending",
          payment_notes: null,
          is_active: false,
          duration_days: durationDays,
          cover_path: coverPath,
        })
        .eq("id", retryingPromotion.id)
        .eq("business_id", businessId);
      saveError = error;
    } else {
      const { error } = await supabase.from("promotions").insert({
        business_id: businessId,
        tag: form.tag,
        title: businessName,
        offer_text: form.offerText.trim(),
        cover_path: coverPath,
        duration_days: durationDays,
        payment_status: "pending",
        payment_support_path: filePath,
        is_active: false,
      });
      saveError = error;
    }

    if (saveError) {
      console.error("No se pudo guardar la promoción:", saveError);
      await supabase.storage.from("payment-supports").remove([filePath]);
      if (coverFile && coverPath) {
        await supabase.storage.from("business-assets").remove([coverPath]);
      }
      setMessage(
        "El archivo se subió, pero no se pudo registrar la promoción.",
      );
    } else {
      let renewalCleanupMessage = "";
      if (renewingPromotion) {
        const { error: deleteError } = await supabase
          .from("promotions")
          .delete()
          .eq("id", renewingPromotion.id)
          .eq("business_id", businessId);
        if (deleteError) {
          renewalCleanupMessage =
            " La nueva solicitud se envió, pero no se pudo quitar el registro vencido.";
        } else {
          await Promise.all(
            [
              ["business-assets", previousCoverPath],
              ["payment-supports", previousSupportPath],
            ].map(async ([bucket, path]) => {
              if (!path) return;
              try {
                await removeStorageObjectIfUnused(bucket, path);
              } catch (cleanupError) {
                console.warn(
                  "No se pudo limpiar archivo de promoción:",
                  cleanupError,
                );
                renewalCleanupMessage =
                  " La renovación se envió, pero no se pudo limpiar un archivo anterior.";
              }
            }),
          );
        }
      } else if (retryingPromotion) {
        await Promise.all(
          [
            ["business-assets", previousCoverPath],
            ["payment-supports", previousSupportPath],
          ].map(async ([bucket, path]) => {
            if (!path) return;
            try {
              await removeStorageObjectIfUnused(bucket, path);
            } catch (cleanupError) {
              console.warn(
                "No se pudo limpiar archivo anterior:",
                cleanupError,
              );
            }
          }),
        );
      }

      setMessage(
        `${renewingPromotion ? "Renovación enviada" : retryingPromotion ? "Nuevo soporte enviado" : "Promoción creada"}. Quedó pendiente de revisión.${renewalCleanupMessage}`,
      );
      setForm(INITIAL_FORM);
      setPaymentFile(null);
      setCoverFile(null);
      setFileInputKey((current) => current + 1);
      setRetryingPromotion(null);
      setRenewingPromotion(null);
      setIsFormOpen(false);
      await loadData();
    }
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

  const retryPayment = (promotion) => {
    setRetryingPromotion(promotion);
    setRenewingPromotion(null);
    setForm({
      tag: promotion.tag,
      offerText: promotion.offer_text || "",
      coverPath: promotion.cover_path || "",
      durationDays: promotion.duration_days || 7,
    });
    setPaymentFile(null);
    setCoverFile(null);
    setIsFormOpen(true);
  };

  const startRenewal = (promotion) => {
    setRetryingPromotion(null);
    setRenewingPromotion(promotion);
    setForm({
      tag: promotion.tag,
      offerText: promotion.offer_text || "",
      coverPath: promotion.cover_path || "",
      durationDays: promotion.duration_days || 7,
    });
    setPaymentFile(null);
    setCoverFile(null);
    setIsFormOpen(true);
  };

  const deleteExpiredPromotion = async (promotion) => {
    const confirmed = window.confirm(
      `¿Eliminar "${promotion.title || "esta promoción"}" y su portada?`,
    );
    if (!confirmed) return;

    setDeletingPromotion(promotion.id);
    const { error } = await supabase
      .from("promotions")
      .delete()
      .eq("id", promotion.id)
      .eq("business_id", businessId);

    if (error) {
      setMessage(
        "No se pudo eliminar la promoción; sus archivos se conservaron.",
      );
    } else {
      const cleanupResults = await Promise.allSettled([
        promotion.cover_path
          ? removeStorageObjectIfUnused("business-assets", promotion.cover_path)
          : Promise.resolve(),
        promotion.payment_support_path
          ? removeStorageObjectIfUnused(
              "payment-supports",
              promotion.payment_support_path,
            )
          : Promise.resolve(),
      ]);
      const cleanupFailed = cleanupResults.some(
        (result) => result.status === "rejected",
      );
      setPromotions((current) =>
        current.filter((item) => item.id !== promotion.id),
      );
      setMessage(
        cleanupFailed
          ? "La promoción se eliminó, pero no se pudo limpiar uno de sus archivos."
          : "La promoción vencida y sus archivos sin uso fueron eliminados.",
      );
    }
    setDeletingPromotion(null);
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4 pb-1">
          <div>
            <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-violet-400">
              Marketplace
            </p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Promociones</h1>
            <p className="mt-2 max-w-xl text-sm text-neutral-400">
              Crea una propuesta promocional. Solo las promociones con pago
              confirmado aparecen en Home.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setRetryingPromotion(null);
              setRenewingPromotion(null);
              setForm(INITIAL_FORM);
              setPaymentFile(null);
              setCoverFile(null);
              setIsFormOpen((current) => !current);
            }}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-xs font-black uppercase tracking-wider transition hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
          >
            <Plus size={16} /> Nueva promoción
          </button>
        </header>

        {!loading && message && (
          <div className="rounded-xl bg-violet-500/10 px-4 py-3 text-sm leading-5 text-violet-200">
            {message}
          </div>
        )}

        {!loading && isFormOpen && (
          <form
            onSubmit={handleSubmit}
            className="space-y-6 rounded-2xl bg-neutral-900/70 p-5 sm:p-7"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-xs font-bold text-neutral-300">
                Etiqueta
                <select
                  value={form.tag}
                  onChange={(event) =>
                    setForm({ ...form, tag: event.target.value })
                  }
                  className="mt-2 w-full rounded-xl bg-neutral-950 px-3 py-3 text-sm text-white outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  <option>NUEVO</option>
                  <option>PATROCINADO</option>
                  <option>TRENDING</option>
                  <option>OFERTA</option>
                </select>
              </label>
              <label className="text-xs font-bold text-neutral-300 md:col-span-2">
                Texto de la oferta
                <input
                  required
                  value={form.offerText}
                  onChange={(event) =>
                    setForm({ ...form, offerText: event.target.value })
                  }
                  placeholder="Ej. 20% de descuento en bebidas"
                  className="mt-2 w-full rounded-xl bg-neutral-950 px-3 py-3 text-sm text-white outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400"
                />
              </label>
            </div>
            <div className="grid gap-4 rounded-xl bg-neutral-950/70 p-4 sm:grid-cols-[150px_minmax(0,1fr)]">
              <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-white/5 text-neutral-500 sm:aspect-square">
                {coverPreviewUrl ? (
                  <img
                    src={coverPreviewUrl}
                    alt="Vista previa de la portada"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Image size={28} />
                )}
              </div>
              <div className="min-w-0 self-center">
                <p className="text-xs font-bold text-neutral-300">
                  Portada de la promoción (opcional)
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  JPG, PNG o WEBP. Máximo 5 MB.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-neutral-800 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-neutral-700 focus-within:ring-2 focus-within:ring-violet-400">
                    <Image size={15} />
                    {coverFile || form.coverPath
                      ? "Cambiar portada"
                      : "Subir portada"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={handleCoverChange}
                    />
                  </label>
                  {(coverFile || form.coverPath) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCoverFile(null);
                        setForm((current) => ({ ...current, coverPath: "" }));
                      }}
                      className="rounded-lg px-3 py-2 text-xs font-bold text-neutral-400 transition hover:bg-white/10 hover:text-white"
                    >
                      Quitar portada
                    </button>
                  )}
                </div>
              </div>
            </div>
            <section>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-black uppercase tracking-wider">
                  Elige la duración
                </h2>
                <p className="text-xs text-neutral-500">
                  {pricing
                    ? `${formatCurrency(pricing.daily_rate)} por día · máximo 1 mes`
                    : "Tarifas no disponibles"}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {PROMOTION_PACKAGES.map((option) => {
                  const tier = discountTiers.find(
                    (item) => item.min_days === option.days,
                  );
                  const discountPercent = Number(tier?.discount_percent || 0);
                  const subtotal = Math.round(
                    option.days * Number(pricing?.daily_rate || 0),
                  );
                  const discount = Math.round(
                    subtotal * (discountPercent / 100),
                  );
                  const total = subtotal - discount;
                  const isSelected = durationDays === option.days;

                  return (
                    <button
                      key={option.days}
                      type="button"
                      aria-pressed={isSelected}
                      disabled={!pricing || !tier || saving}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          durationDays: option.days,
                        }))
                      }
                      className={`relative flex min-h-40 flex-col items-start rounded-xl p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                        isSelected
                          ? "bg-violet-500/15 ring-1 ring-inset ring-violet-400/70"
                          : "bg-neutral-950 hover:bg-neutral-800"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {discountPercent > 0 && (
                        <span className="absolute right-3 top-3 rounded-full bg-emerald-500/15 px-2 py-1 text-[9px] font-black uppercase text-emerald-300">
                          {discountPercent}% menos
                        </span>
                      )}
                      <span className="text-sm font-black uppercase text-white">
                        {option.label}
                      </span>
                      <span className="mt-1 text-xs text-neutral-500">
                        {option.days} días
                      </span>
                      <span className="mt-5 text-xl font-black text-amber-300">
                        {pricing && tier
                          ? formatCurrency(total)
                          : "No disponible"}
                      </span>
                      <span className="mt-1 text-[11px] text-neutral-400">
                        {discount > 0
                          ? `Ahorras ${formatCurrency(discount)}`
                          : "Sin descuento"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-neutral-500">
                La promoción empieza cuando se aprueba el pago.
              </p>
            </section>
            <div className="grid gap-4 pt-2 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <div className="flex flex-col items-center justify-center rounded-2xl bg-neutral-950/70 p-5 text-center">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black">QR de pago</h2>
                  <CreditCard className="text-violet-300" size={16} />
                </div>
                <div className="mt-3 flex aspect-square w-full max-w-[180px] items-center justify-center rounded-lg bg-white p-3">
                  {paymentQr?.publicUrl ? (
                    <img
                      src={paymentQr.publicUrl}
                      alt={paymentQr.label || "QR de pago"}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <QRCodeSVG
                      value={`Entidad bancaria genérica | Referencia GLOTO-${businessId} | Promoción ${businessName || "nueva"}`}
                      className="h-full w-full"
                      bgColor="#ffffff"
                      fgColor="#111111"
                      level="M"
                    />
                  )}
                </div>
                <p className="mt-3 text-xs text-neutral-500">
                  Realiza el pago y adjunta el comprobante para validación.
                </p>
              </div>
              <div className="rounded-2xl bg-neutral-950/70 p-5">
                <h2 className="text-sm font-black">Soporte de pago</h2>
                <p className="mt-1 text-xs text-neutral-500">
                  JPG, PNG o PDF. Máximo 5 MB.
                </p>
                <div className="relative mt-4 min-w-0">
                  <label className="flex min-w-0 w-full cursor-pointer items-center gap-3 rounded-xl bg-neutral-900 px-4 py-3 pr-12 text-sm text-neutral-200 transition hover:bg-neutral-800 focus-within:ring-2 focus-within:ring-violet-400">
                    <FileUp size={18} className="shrink-0 text-violet-300" />
                    <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                      {paymentFile?.name || "Seleccionar archivo"}
                    </span>
                    <input
                      key={fileInputKey}
                      type="file"
                      accept="application/pdf,image/jpeg,image/png"
                      className="sr-only"
                      required
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
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <p className="text-sm text-neutral-400">
                {retryingPromotion
                  ? "El nuevo soporte se enviará a revisión."
                  : "Adjunta el comprobante para enviar la solicitud de revisión."}
              </p>
              <button
                type="submit"
                disabled={
                  saving ||
                  !pricing ||
                  !selectedPackageAvailable ||
                  !paymentFile
                }
                className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-xs font-black uppercase tracking-wider transition hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-50"
              >
                <Save size={15} />{" "}
                {saving
                  ? "Enviando..."
                  : retryingPromotion
                    ? "Reenviar soporte"
                    : "Enviar solicitud"}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <SubLoading
            label="Cargando promociones"
            className="py-24"
            dotClassName="bg-violet-400"
            fullHeight
          />
        ) : promotions.length === 0 ? (
          <div className="rounded-2xl bg-neutral-900/60 py-16 text-center text-sm text-neutral-400">
            Aún no tienes promociones creadas.
          </div>
        ) : (
          <div className="grid gap-3">
            {promotions.map((promotion) => {
              const isPaid = promotion.payment_status === "paid";
              const isRejected = promotion.payment_status === "failed";
              const isExpired =
                isPaid &&
                promotion.ends_at &&
                new Date(promotion.ends_at).getTime() <= currentTime;
              const coverUrl = promotion.cover_path
                ? supabase.storage
                    .from("business-assets")
                    .getPublicUrl(promotion.cover_path).data.publicUrl
                : "";
              return (
                <article
                  key={promotion.id}
                  className="flex flex-wrap items-center gap-4 rounded-2xl bg-neutral-900/70 p-4 sm:p-5"
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-violet-500/10 text-violet-300">
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Megaphone size={20} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-wider text-violet-300">
                      {promotion.tag}
                    </p>
                    <h2 className="truncate text-base font-black">
                      {promotion.title}
                    </h2>
                    <p className="text-sm text-neutral-400">
                      {promotion.offer_text}
                    </p>
                    {promotion.total_amount != null && (
                      <p className="mt-1 text-xs font-bold text-amber-300">
                        {promotion.duration_days} días · Descuento{" "}
                        {promotion.discount_percent}% · Total{" "}
                        {formatCurrency(promotion.total_amount)}
                      </p>
                    )}
                  </div>
                  <div
                    className={`flex items-center gap-2 rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-wider ${isExpired || isRejected ? "bg-rose-500/10 text-rose-300" : isPaid ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}
                  >
                    {isPaid && !isExpired ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <Clock3 size={14} />
                    )}
                    {isExpired
                      ? "Finalizada"
                      : isPaid
                        ? "Pagada y publicada"
                        : isRejected
                          ? "Soporte rechazado"
                          : "Soporte en revisión"}
                  </div>
                  {isRejected && (
                    <button
                      type="button"
                      onClick={() => retryPayment(promotion)}
                      className="rounded-xl bg-neutral-800 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    >
                      Reenviar soporte
                    </button>
                  )}
                  {isRejected && promotion.payment_notes && (
                    <p className="w-full text-xs text-rose-300">
                      Motivo: {promotion.payment_notes}
                    </p>
                  )}
                  {isExpired && (
                    <div className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-500/[0.07] p-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-amber-200">
                          Tu promoción terminó. ¿Quieres renovarla?
                        </p>
                        <p className="mt-1 text-xs text-neutral-400">
                          Puedes conservar o cambiar la portada y elegir un
                          nuevo paquete.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => startRenewal(promotion)}
                        className="rounded-xl bg-amber-500 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-neutral-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                      >
                        Renovar
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteExpiredPromotion(promotion)}
                        disabled={deletingPromotion === promotion.id}
                        className="rounded-xl bg-neutral-800 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50"
                      >
                        {deletingPromotion === promotion.id
                          ? "Eliminando..."
                          : "No renovar, eliminar"}
                      </button>
                    </div>
                  )}
                  <p className="w-full text-[11px] text-neutral-500">
                    {promotion.starts_at && promotion.ends_at
                      ? `Vigencia: ${formatDateTime(promotion.starts_at)} - ${formatDateTime(promotion.ends_at)}`
                      : `Duración: ${promotion.duration_days || "-"} días · Inicia tras aprobar el pago`}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Promociones;
