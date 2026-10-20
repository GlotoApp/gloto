import { useCallback, useEffect, useState } from "react";
import {
  CreditCard,
  ExternalLink,
  Link2,
  RefreshCw,
  Save,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../../src/lib/supabaseClient";
import SuperAdminSectionShell from "./ContenedorSeccion";
import { useAdminRealtime } from "./useAdminRealtime";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-violet-400";

const isValidPaymentUrl = (value) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

export default function LinksPagoSuscripciones() {
  const [periods, setPeriods] = useState([]);
  const [paymentLinks, setPaymentLinks] = useState({});
  const [savedPaymentLinks, setSavedPaymentLinks] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadConfiguration = useCallback(async () => {
    const [periodsResult, linksResult] = await Promise.all([
      supabase
        .from("billing_plan_periods")
        .select(
          "id,plan_code,plan_name,billing_type,plan_display_order,code,label,duration_days,price_amount,minimum_amount,is_active,plan_is_active",
        )
        .order("plan_display_order", { ascending: true }),
      supabase
        .from("billing_plan_payment_links")
        .select("period_id,payment_url"),
    ]);

    if (periodsResult.error || linksResult.error) {
      return { error: periodsResult.error || linksResult.error };
    }

    const loadedLinks = Object.fromEntries(
      (linksResult.data || []).map(({ period_id, payment_url }) => [
        period_id,
        payment_url || "",
      ]),
    );
    return {
      periods: periodsResult.data || [],
      paymentLinks: loadedLinks,
    };
  }, []);

  const hasUnsavedChanges = Object.entries(paymentLinks).some(
    ([periodId, url]) =>
      String(url || "").trim() !==
      String(savedPaymentLinks[periodId] || "").trim(),
  );

  useAdminRealtime(
    ["billing_plan_periods", "billing_plan_payment_links"],
    () => {
      if (!hasUnsavedChanges && !savingCode) {
        setRefreshKey((current) => current + 1);
      }
    },
  );

  useEffect(() => {
    let isMounted = true;
    loadConfiguration()
      .then((result) => {
        if (!isMounted) return;
        setError("");
        if (result.error) {
          console.error(
            "No se pudieron cargar los enlaces de pago:",
            result.error,
          );
          setPeriods([]);
          setPaymentLinks({});
          setSavedPaymentLinks({});
          setError(
            result.error.message ||
              "No se pudo cargar la configuración de pagos por plan.",
          );
        } else {
          setPeriods(result.periods);
          setPaymentLinks(result.paymentLinks);
          setSavedPaymentLinks(result.paymentLinks);
        }
        setLoading(false);
      })
      .catch((loadError) => {
        if (!isMounted) return;
        console.error("No se pudieron cargar los enlaces de pago:", loadError);
        setError(
          loadError?.message ||
            "No se pudo cargar la configuración de pagos por plan.",
        );
        setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [loadConfiguration, refreshKey]);

  const refreshConfiguration = () => {
    setLoading(true);
    setError("");
    setRefreshKey((current) => current + 1);
  };

  const saveLink = async (period) => {
    const paymentUrl = String(paymentLinks[period.id] || "").trim();
    if (paymentUrl && !isValidPaymentUrl(paymentUrl)) {
      setMessage({
        type: "error",
        text: "Ingresa un enlace válido que comience con http:// o https://.",
      });
      return;
    }

    setSavingCode(period.id);
    setMessage(null);
    const result = paymentUrl
      ? await supabase
          .from("billing_plan_payment_links")
          .upsert(
            { period_id: period.id, payment_url: paymentUrl },
            { onConflict: "period_id" },
          )
      : await supabase
          .from("billing_plan_payment_links")
          .delete()
          .eq("period_id", period.id);

    if (result.error) {
      console.error("No se pudo guardar el enlace de pago:", result.error);
      setMessage({
        type: "error",
        text:
          result.error.message ||
          `No se pudo guardar el enlace de ${period.plan_name} (${period.label}).`,
      });
    } else {
      setSavedPaymentLinks((current) => ({
        ...current,
        [period.id]: paymentUrl,
      }));
      setMessage({
        type: "success",
        text: paymentUrl
          ? `Enlace de pago de ${period.plan_name} (${period.label}) guardado.`
          : `Enlace de pago de ${period.plan_name} (${period.label}) eliminado.`,
      });
    }
    setSavingCode("");
  };

  return (
    <SuperAdminSectionShell
      title="Links de pago y QR de pago"
      subtitle="Configura por periodo el enlace de pago en línea. El QR se genera automáticamente para que puedan pagar con tarjeta u otros medios habilitados por el proveedor."
      badge="Suscripciones"
      actions={
        <button
          type="button"
          onClick={refreshConfiguration}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Actualizar
        </button>
      }
    >
      {message && (
        <p
          role={message.type === "error" ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.type === "error"
              ? "border-red-500/20 bg-red-500/10 text-red-200"
              : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {message.text}
        </p>
      )}

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-neutral-900/75 p-10 text-center text-sm text-neutral-400">
          Cargando planes y enlaces...
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-200"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={refreshConfiguration}
            className="mt-3 rounded-lg border border-red-400/20 px-3 py-1.5 font-semibold hover:bg-red-500/10"
          >
            Reintentar
          </button>
        </div>
      ) : periods.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-neutral-900/50 p-10 text-center text-sm text-neutral-400">
          No hay planes configurados.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {periods.map((period) => {
            const url = paymentLinks[period.id] || "";
            const validUrl = isValidPaymentUrl(url);
            const isSaving = savingCode === period.id;

            return (
              <section
                key={period.id}
                className="rounded-2xl border border-white/10 bg-neutral-900/75 p-4 sm:p-5"
              >
                <div className="mb-4 flex items-start gap-3">
                  <span className="rounded-xl bg-violet-500/10 p-2.5 text-violet-300">
                    <CreditCard size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-white">
                      {period.plan_name} · {period.label}
                    </h3>
                    <p className="mt-1 text-xs text-neutral-500">
                      {period.code} · {period.duration_days} días ·{" "}
                      {period.billing_type === "commission"
                        ? "Comisión / valor variable"
                        : "Precio fijo"}{" "}
                      ·{" "}
                      {period.is_active && period.plan_is_active
                        ? "Activo"
                        : "Inactivo"}
                    </p>
                  </div>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    Link de pago
                  </span>
                  <input
                    type="url"
                    value={url}
                    onChange={(event) =>
                      setPaymentLinks((current) => ({
                        ...current,
                        [period.id]: event.target.value,
                      }))
                    }
                    placeholder="https://tu-proveedor.com/pagar"
                    aria-label={`Link de pago para ${period.plan_name}, ${period.label}`}
                    className={inputClass}
                  />
                </label>

                <div className="mt-4 flex flex-col items-center gap-4 rounded-xl border border-white/[0.06] bg-neutral-950/60 p-4 sm:flex-row">
                  <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-lg bg-white p-2">
                    {validUrl ? (
                      <QRCodeSVG
                        value={url.trim()}
                        size={128}
                        bgColor="#ffffff"
                        fgColor="#111111"
                        level="M"
                      />
                    ) : (
                      <p className="px-2 text-center text-xs text-neutral-500">
                        Ingresa un link válido para generar su QR.
                      </p>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-center sm:text-left">
                    <p className="flex items-center justify-center gap-2 text-sm font-semibold text-neutral-200 sm:justify-start">
                      <Link2 size={15} className="text-violet-300" />
                      QR generado desde el link
                    </p>
                    <p className="mt-1 break-all text-xs text-neutral-500">
                      El cliente puede escanearlo o abrir el mismo link desde
                      Mi plan.
                    </p>
                    {validUrl && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-300 transition hover:text-violet-200"
                      >
                        <ExternalLink size={13} />
                        Probar link
                      </a>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => saveLink(period)}
                  disabled={isSaving}
                  className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-bold text-white transition hover:bg-violet-500 disabled:cursor-wait disabled:opacity-60"
                >
                  <Save
                    size={15}
                    className={
                      isSaving ? "animate-pulse" : ""
                    }
                  />
                  Guardar link de {period.plan_name} · {period.label}
                </button>
              </section>
            );
          })}
        </div>
      )}
    </SuperAdminSectionShell>
  );
}
