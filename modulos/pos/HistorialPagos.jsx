import React, { useEffect, useState } from "react";
import { CheckCircle2, Clock3, FileText, XCircle } from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";

const formatCurrency = (value) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString("es-CO") : "-";

const STATUS_CONFIG = {
  paid: {
    label: "Pagado",
    icon: CheckCircle2,
    className: "text-emerald-300 bg-emerald-500/10",
  },
  pending: {
    label: "Pendiente",
    icon: Clock3,
    className: "text-amber-300 bg-amber-500/10",
  },
  rejected: {
    label: "Rechazado",
    icon: XCircle,
    className: "text-red-300 bg-red-500/10",
  },
};

export default function HistorialPagos() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadPayments = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        setMessage("Debes iniciar sesión para consultar tus pagos.");
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

      const { data, error } = await supabase
        .from("payment_records")
        .select(
          "id,amount,status,payment_method,support_path,paid_at,created_at,subscriptions(plan_name)",
        )
        .eq("business_id", profile.business_id)
        .order("created_at", { ascending: false });

      if (error) setMessage("No se pudo cargar el historial de pagos.");
      else setPayments(data || []);
      setLoading(false);
    };

    loadPayments();
  }, []);

  return (
    <div className="min-h-screen bg-background px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="border-b border-white/10 pb-5">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-violet-400">
            Finanzas
          </p>
          <h1 className="text-3xl font-black tracking-tight">
            Historial de pagos
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Consulta todos los pagos y soportes enviados por tu negocio.
          </p>
        </header>

        {message && (
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-3 text-sm text-violet-200">
            {message}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm text-neutral-500">
            Cargando historial...
          </div>
        ) : payments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 py-16 text-center text-sm text-neutral-500">
            Aún no hay pagos registrados.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/50">
            <div className="hidden grid-cols-[1.2fr_1fr_1fr_1fr] gap-4 border-b border-white/10 px-5 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-500 md:grid">
              <span>Plan</span>
              <span>Fecha</span>
              <span>Valor</span>
              <span>Estado</span>
            </div>
            <div className="divide-y divide-white/10">
              {payments.map((payment) => {
                const status =
                  STATUS_CONFIG[payment.status] || STATUS_CONFIG.pending;
                const StatusIcon = status.icon;
                return (
                  <article
                    key={payment.id}
                    className="grid gap-3 px-5 py-4 md:grid-cols-[1.2fr_1fr_1fr_1fr] md:items-center md:gap-4"
                  >
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                        Plan
                      </p>
                      <p className="font-bold">
                        {payment.subscriptions?.plan_name || "Suscripción"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500 md:hidden">
                        Fecha
                      </p>
                      <p className="text-sm text-neutral-300">
                        {formatDate(payment.paid_at || payment.created_at)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500 md:hidden">
                        Valor
                      </p>
                      <p className="font-bold">
                        {formatCurrency(payment.amount)}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {payment.payment_method || "-"}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 md:justify-start">
                      <span
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-wider ${status.className}`}
                      >
                        <StatusIcon size={14} /> {status.label}
                      </span>
                      {payment.support_path && (
                        <FileText
                          size={17}
                          className="text-violet-300"
                          aria-label="Tiene soporte"
                        />
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
