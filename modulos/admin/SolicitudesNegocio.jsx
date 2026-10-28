import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Mail, MessageCircle, Store, X } from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import SuperAdminSectionShell from "./ContenedorSeccion";

const whatsappUrl = (phone, message = "") => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  const normalized = digits.startsWith("57") ? digits : `57${digits}`;
  return `https://wa.me/${normalized}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
};

const decisionMessages = {
  approved: (request) =>
    `Hola ${request.owner_name}, ¡tu solicitud para registrar ${request.business_name} fue aceptada en Gloto! El equipo te dará las siguientes instrucciones para continuar con la creación de tu tienda.`,
  rejected: (request) =>
    `Hola ${request.owner_name}, lamentamos informarte que la solicitud de ${request.business_name} para unirse a Gloto no fue aceptada en esta ocasión.`,
};

const openDecisionNotifications = (request, status) => {
  const message = decisionMessages[status](request);
  const whatsapp = whatsappUrl(request.phone, message);
  if (whatsapp) window.open(whatsapp, "_blank", "noopener,noreferrer");
  const subject = status === "approved" ? "Solicitud aceptada en Gloto" : "Respuesta a tu solicitud en Gloto";
  window.location.href = `mailto:${encodeURIComponent(request.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
};

const STATUS_LABELS = {
  pending: "Pendiente",
  approved: "Aceptada",
  rejected: "Rechazada",
};

export default function SolicitudesNegocio() {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("business_join_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (loadError) setError(loadError.message);
    else setRequests(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const updateStatus = async (request, status) => {
    setUpdatingId(request.id);
    setError("");
    const { error: updateError } = await supabase
      .from("business_join_requests")
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      })
      .eq("id", request.id);
    if (updateError) setError(updateError.message);
    else {
      await loadRequests();
      openDecisionNotifications(request, status);
    }
    setUpdatingId(null);
  };

  const filtered = requests.filter((request) => filter === "all" || request.status === filter);
  const counts = requests.reduce((result, request) => ({ ...result, [request.status]: (result[request.status] || 0) + 1 }), {});

  return (
    <SuperAdminSectionShell title="Solicitudes de negocios" subtitle="Revisa las tiendas que quieren unirse a Gloto" badge="Marketplace">
      <div className="mb-5 flex flex-wrap gap-2">
        {[{ value: "pending", label: "Pendientes" }, { value: "approved", label: "Aceptadas" }, { value: "rejected", label: "Rechazadas" }, { value: "all", label: "Todas" }].map((item) => (
          <button key={item.value} type="button" onClick={() => setFilter(item.value)} className={`rounded-xl px-4 py-2 text-xs font-black transition ${filter === item.value ? "bg-violet-500 text-white" : "bg-white/[0.04] text-neutral-400 hover:text-white"}`}>
            {item.label}{item.value !== "all" ? ` (${counts[item.value] || 0})` : ` (${requests.length})`}
          </button>
        ))}
      </div>
      {error && <p className="mb-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
      {loading ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-violet-400" /></div> : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] py-14 text-center"><Store className="mx-auto text-neutral-600" /><p className="mt-3 font-bold text-neutral-300">No hay solicitudes en este estado</p></div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((request) => (
            <article key={request.id} className="rounded-2xl border border-white/[0.08] bg-neutral-950/40 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-lg font-black text-white">{request.business_name}</p><p className="mt-1 text-sm text-violet-300">{request.business_type} · {request.city}</p></div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${request.status === "pending" ? "bg-amber-500/15 text-amber-300" : request.status === "approved" ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>{STATUS_LABELS[request.status]}</span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-neutral-500">Propietario</dt><dd className="font-bold text-neutral-200">{request.owner_name}</dd></div><div><dt className="text-neutral-500">Contacto</dt><dd className="font-bold text-neutral-200">{request.email} · {request.phone}</dd><div className="mt-2 flex flex-wrap gap-2"><a href={`mailto:${request.email}`} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/10 px-3 py-2 text-xs font-black text-sky-300 hover:bg-sky-500/20"><Mail size={15} /> Correo</a>{whatsappUrl(request.phone) && <a href={whatsappUrl(request.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-300 hover:bg-emerald-500/20"><MessageCircle size={15} /> WhatsApp</a>}</div></div><div><dt className="text-neutral-500">Ubicación operativa</dt><dd className="font-bold text-neutral-200">{request.address || "No indicada"} · {request.neighborhood || "Sin barrio"}</dd></div><div><dt className="text-neutral-500">Horario</dt><dd className="text-neutral-200">{request.opening_hours || "No indicado"}</dd></div><div><dt className="text-neutral-500">Domicilios</dt><dd className="text-neutral-200">{request.delivery_available ? "Sí" : "No"}{request.delivery_zones ? ` · ${request.delivery_zones}` : ""}</dd></div><div><dt className="text-neutral-500">Datos comerciales</dt><dd className="text-neutral-200">{request.legal_name || "Sin razón social"} · {request.tax_id || "Sin documento"}</dd></div><div><dt className="text-neutral-500">Catálogo y pagos</dt><dd className="text-neutral-200">~{request.estimated_products || "N/D"} productos · {request.payment_methods || "No indicado"}</dd></div><div className="sm:col-span-2"><dt className="text-neutral-500">Dirección</dt><dd className="text-neutral-200">{request.address || "No indicada"}</dd></div><div className="sm:col-span-2"><dt className="text-neutral-500">Información</dt><dd className="mt-1 whitespace-pre-wrap leading-6 text-neutral-300">{request.description}</dd></div></dl>
              {request.status === "pending" && <div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={updatingId === request.id} onClick={() => updateStatus(request, "approved")} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60"><Check size={17} /> Aceptar solicitud</button><button type="button" disabled={updatingId === request.id} onClick={() => updateStatus(request, "rejected")} className="flex items-center gap-2 rounded-xl bg-red-500/15 px-4 py-2.5 text-sm font-black text-red-300 disabled:opacity-60"><X size={17} /> Rechazar</button></div>}
            </article>
          ))}
        </div>
      )}
    </SuperAdminSectionShell>
  );
}
