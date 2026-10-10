import { useCallback, useEffect, useState } from "react";
import {
  Bike,
  Check,
  Clock3,
  ExternalLink,
  LoaderCircle,
  MapPin,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import SuperAdminSectionShell from "./ContenedorSeccion";

const statusLabels = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  suspended: "Suspendida",
};

const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Fecha no disponible";

const DomiciliariosPublicos = () => {
  const [applications, setApplications] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [activeUserId, setActiveUserId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [reviewNotes, setReviewNotes] = useState({});

  const fetchApplications = useCallback(async () => {
    try {
      let query = supabase
        .from("public_courier_applications")
        .select(
          "user_id, full_name, phone, status, location_latitude, location_longitude, location_updated_at, review_notes, created_at",
        )
        .order("created_at", { ascending: false });

      if (filter !== "all") query = query.eq("status", filter);

      const { data, error } = await query;
      if (error) throw error;
      return { data: data || [], error: null };
    } catch (error) {
      console.error("No se pudieron cargar las solicitudes de domiciliarios:", error);
      return { data: [], error };
    }
  }, [filter]);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    const { data, error } = await fetchApplications();
    if (error) {
      setErrorMessage(
        error.message ||
          "No se pudieron cargar las solicitudes. Verifica el acceso de superadministrador y que el SQL 129 esté aplicado.",
      );
    } else {
      setApplications(data);
    }
    setLoading(false);
  }, [fetchApplications]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data, error } = await fetchApplications();
      if (!mounted) return;
      if (error) {
        setErrorMessage(
          error.message ||
            "No se pudieron cargar las solicitudes. Verifica el acceso de superadministrador y que el SQL 129 esté aplicado.",
        );
      } else {
        setErrorMessage("");
        setApplications(data);
      }
      setLoading(false);
    };
    load();
    return () => {
      mounted = false;
    };
  }, [fetchApplications]);

  const reviewApplication = async (application, status) => {
    const confirmation =
      status === "approved"
        ? `¿Aprobar a ${application.full_name} para recibir pedidos públicos?`
        : `¿Rechazar la solicitud de ${application.full_name}?`;
    if (!window.confirm(confirmation)) return;

    setActiveUserId(application.user_id);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const { error } = await supabase.rpc(
        "admin_review_public_courier_application",
        {
          p_user_id: application.user_id,
          p_status: status,
          p_notes: reviewNotes[application.user_id]?.trim() || null,
        },
      );
      if (error) throw error;
      setSuccessMessage(
        status === "approved"
          ? `${application.full_name} ya puede conectarse a la red pública.`
          : `La solicitud de ${application.full_name} fue rechazada.`,
      );
      await loadApplications();
    } catch (error) {
      console.error("No se pudo revisar la solicitud del domiciliario:", error);
      setErrorMessage(
        error.message ||
          "No se pudo actualizar la solicitud. Verifica tu acceso de superadministrador.",
      );
    } finally {
      setActiveUserId("");
    }
  };

  return (
    <SuperAdminSectionShell
      title="Domiciliarios públicos"
      badge="Operación"
      subtitle="Revisa las solicitudes y autoriza quién puede recibir ofertas de entrega de Gloto."
      actions={
        <button
          type="button"
          onClick={loadApplications}
          disabled={loading}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-bold text-neutral-200 transition hover:bg-white/[0.05] disabled:opacity-50"
        >
          <RefreshCw
            size={15}
            className={loading ? "animate-spin" : undefined}
          />
          Actualizar
        </button>
      }
    >
      <section className="rounded-2xl border border-white/[0.08] bg-neutral-900/60 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-violet-300" />
            <h3 className="text-sm font-black">Solicitudes de acceso</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["pending", "Pendientes"],
              ["approved", "Aprobados"],
              ["rejected", "Rechazados"],
              ["all", "Todos"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-lg px-3 py-2 text-[11px] font-bold transition ${
                  filter === value
                    ? "bg-violet-500/20 text-violet-200"
                    : "bg-white/[0.04] text-neutral-400 hover:bg-white/[0.08]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {errorMessage && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200"
          >
            {errorMessage}
          </p>
        )}
        {successMessage && (
          <p
            role="status"
            className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200"
          >
            {successMessage}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-14 text-sm text-neutral-400">
            <LoaderCircle size={18} className="animate-spin" />
            Cargando solicitudes...
          </div>
        ) : applications.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-14 text-center">
            <Bike size={30} className="mx-auto text-neutral-600" />
            <p className="mt-3 text-sm font-bold text-neutral-300">
              {filter === "pending"
                ? "No hay solicitudes pendientes"
                : "No encontramos solicitudes para este filtro"}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Las nuevas solicitudes aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {applications.map((application) => {
              const hasLocation =
                application.location_latitude != null &&
                application.location_longitude != null;
              const mapsUrl = hasLocation
                ? `https://www.google.com/maps?q=${application.location_latitude},${application.location_longitude}`
                : "";
              const isBusy = activeUserId === application.user_id;

              return (
                <article
                  key={application.user_id}
                  className="rounded-2xl border border-white/[0.08] bg-neutral-950/60 p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-400/10 text-violet-200">
                        <Bike size={19} />
                      </span>
                      <div>
                        <h4 className="text-sm font-black text-white">
                          {application.full_name}
                        </h4>
                        <a
                          href={`tel:${application.phone}`}
                          className="mt-1 inline-block text-xs text-violet-200 hover:text-violet-100"
                        >
                          {application.phone}
                        </a>
                        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-neutral-500">
                          <Clock3 size={12} />
                          Solicitud: {formatDate(application.created_at)}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold text-neutral-300">
                      {statusLabels[application.status] || application.status}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {mapsUrl ? (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-300 hover:text-white"
                      >
                        <MapPin size={14} className="text-violet-300" />
                        Ver ubicación de registro
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span className="text-xs text-neutral-500">
                        No compartió ubicación
                      </span>
                    )}
                    {application.location_updated_at && (
                      <span className="text-[10px] text-neutral-500">
                        Ubicación: {formatDate(application.location_updated_at)}
                      </span>
                    )}
                  </div>

                  {(application.status === "pending" ||
                    application.status === "approved") && (
                    <label className="mt-4 block text-[11px] font-bold text-neutral-400">
                      Nota de revisión (opcional)
                      <input
                        value={reviewNotes[application.user_id] ?? ""}
                        onChange={(event) =>
                          setReviewNotes((current) => ({
                            ...current,
                            [application.user_id]: event.target.value,
                          }))
                        }
                        maxLength={500}
                        placeholder="Comentario interno para esta decisión"
                        disabled={isBusy}
                        className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5 text-xs text-white outline-none placeholder:text-neutral-600 focus:border-violet-400/40 disabled:opacity-50"
                      />
                    </label>
                  )}

                  {(application.status === "pending" ||
                    application.status === "approved") && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {application.status === "pending" && (
                        <button
                          type="button"
                          onClick={() =>
                            reviewApplication(application, "approved")
                          }
                          disabled={isBusy}
                          className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-black text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
                        >
                          <Check size={14} />
                          {isBusy ? "Guardando..." : "Aprobar domiciliario"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          reviewApplication(
                            application,
                            application.status === "approved"
                              ? "suspended"
                              : "rejected",
                          )
                        }
                        disabled={isBusy}
                        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-rose-300/20 px-3 py-2 text-xs font-bold text-rose-200 transition hover:bg-rose-400/10 disabled:opacity-50"
                      >
                        <X size={14} />
                        {application.status === "approved"
                          ? "Suspender acceso"
                          : "Rechazar solicitud"}
                      </button>
                    </div>
                  )}

                  {application.review_notes &&
                    application.status !== "pending" && (
                      <p className="mt-3 rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-neutral-400">
                        Nota: {application.review_notes}
                      </p>
                    )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </SuperAdminSectionShell>
  );
};

export default DomiciliariosPublicos;
