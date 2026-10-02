import { useEffect, useState } from "react";
import { ArrowDownToLine } from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";

const formatCurrency = (value) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const SolicitudesCambioPlan = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const loadRequests = async () => {
      const { data, error: queryError } = await supabase
        .from("business_plan_change_requests")
        .select(
          "id,business_id,current_plan_name,requested_plan_name,requested_period_label,billing_type,commission_rate,minimum_amount,quoted_amount,status,payment_support_path,created_at,businesses(name)",
        )
        .in("status", ["awaiting_payment", "pending_review"])
        .order("created_at", { ascending: true });

      if (queryError) {
        console.error(
          "No se pudieron cargar las solicitudes de cambio de plan:",
          queryError,
        );
        setError("No se pudieron cargar las solicitudes de cambio de plan.");
      } else {
        setRequests(data || []);
      }
      setLoading(false);
    };

    loadRequests();
  }, []);

  const openPaymentSupport = async (request) => {
    if (!request.payment_support_path) return;
    const { data, error: storageError } = await supabase.storage
      .from("payment-supports")
      .createSignedUrl(request.payment_support_path, 300);

    if (storageError) {
      console.error("No se pudo abrir el comprobante de cambio de plan:", storageError);
      setError("No se pudo abrir el comprobante de pago.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const reviewRequest = async (request, approve) => {
    let reason = "";
    if (!approve) {
      reason = window.prompt("Indica el motivo del rechazo de la solicitud:") || "";
      if (!reason.trim()) return;
    } else {
      const approvalMessage = request.billing_type === "commission"
        ? `¿Aprobar la solicitud de ${request.businesses?.name || "la tienda"} para Premium · ${request.requested_period_label}? No requiere pago inicial. Iniciará al terminar el periodo vigente y la comisión se cobrará al cierre del ciclo.`
        : `¿Aprobar el cambio de ${request.businesses?.name || "la tienda"} al plan ${request.requested_plan_name} · ${request.requested_period_label} por ${formatCurrency(request.quoted_amount)}? Se activará al terminar el periodo vigente.`;
      if (!window.confirm(approvalMessage)) return;
    }

    setReviewingId(request.id);
    setError("");
    setNotice("");
    const { error: reviewError } = await supabase.rpc(
      "review_business_plan_change_request",
      {
        p_request_id: request.id,
        p_approve: approve,
        p_reason: approve ? null : reason.trim(),
      },
    );

    if (reviewError) {
      console.error("No se pudo revisar el cambio de plan:", reviewError);
      setError(reviewError.message || "No se pudo procesar la solicitud.");
    } else {
      setRequests((current) => current.filter((item) => item.id !== request.id));
      setNotice(
        approve
          ? `Cambio de plan aprobado para ${request.businesses?.name || "la tienda"}. Se activará al finalizar su suscripción actual.`
          : `Solicitud rechazada para ${request.businesses?.name || "la tienda"}.`,
      );
    }
    setReviewingId(null);
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-violet-400/20 bg-neutral-900/65">
      <div className="border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">
          Solicitudes de cambio de plan
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Los cambios aprobados se activan al finalizar el periodo vigente.
        </p>
      </div>

      {error && (
        <p role="alert" className="border-b border-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="border-b border-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </p>
      )}
      {loading ? (
        <p className="p-6 text-center text-sm text-neutral-400">
          Cargando solicitudes...
        </p>
      ) : requests.length === 0 ? (
        <p className="p-6 text-center text-sm text-neutral-400">
          No hay solicitudes de cambio pendientes.
        </p>
      ) : (
        <div className="divide-y divide-white/10">
          {requests.map((request) => (
            <article
              key={request.id}
              className="flex flex-wrap items-center gap-3 px-4 py-4"
            >
              <div className="min-w-[220px] flex-1">
                <p className="text-sm font-semibold text-white">
                  {request.businesses?.name || "Tienda"} ·{" "}
                  {request.current_plan_name || "Sin plan actual"}{" "}
                  <span className="text-neutral-400">
                    → {request.requested_plan_name}
                  </span>
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  {request.requested_period_label} ·{" "}
                  {request.billing_type === "commission"
                    ? `${Number(request.commission_rate || 0).toLocaleString("es-CO")}% por ticket · cobro al cierre del ciclo${request.minimum_amount ? ` · mínimo a cobrar ${formatCurrency(request.minimum_amount)}` : ""}`
                    : formatCurrency(request.quoted_amount)}
                </p>
                <span
                  className={`mt-2 inline-flex rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${
                    request.status === "pending_review"
                      ? "bg-amber-400/10 text-amber-300"
                      : "bg-neutral-700/60 text-neutral-300"
                  }`}
                >
                  {request.status === "pending_review"
                    ? request.billing_type === "commission"
                      ? "Solicitud sin anticipo"
                      : "Comprobante enviado"
                    : "Esperando comprobante"}
                </span>
              </div>
              {request.status === "pending_review" && (
                <>
                  {request.payment_support_path && (
                    <button
                      type="button"
                      onClick={() => openPaymentSupport(request)}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-white/[0.08]"
                    >
                      <ArrowDownToLine size={14} />
                      Ver comprobante
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => reviewRequest(request, false)}
                    disabled={reviewingId === request.id}
                    className="rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2 text-xs font-bold text-rose-200 transition hover:bg-rose-400/10 disabled:opacity-50"
                  >
                    Rechazar
                  </button>
                  <button
                    type="button"
                    onClick={() => reviewRequest(request, true)}
                    disabled={reviewingId === request.id}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {reviewingId === request.id
                      ? "Procesando..."
                      : "Aprobar y programar"}
                  </button>
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default SolicitudesCambioPlan;
