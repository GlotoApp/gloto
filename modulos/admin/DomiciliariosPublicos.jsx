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
  Wallet,
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

const formatMoney = (value) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const DomiciliariosPublicos = () => {
  const [activeTab, setActiveTab] = useState("applications");
  const [applications, setApplications] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [topups, setTopups] = useState([]);
  const [topupFilter, setTopupFilter] = useState("pending");
  const [topupsLoading, setTopupsLoading] = useState(false);
  const [topupNotes, setTopupNotes] = useState({});
  const [proofUrls, setProofUrls] = useState({});
  const [courierSettings, setCourierSettings] = useState({
    radiusKm: "1",
    commissionPercentage: "0",
    depositInstructions: "",
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeUserId, setActiveUserId] = useState("");
  const [activeTopupId, setActiveTopupId] = useState("");
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

  const fetchTopups = useCallback(async (statusFilter = topupFilter) => {
    setTopupsLoading(true);
    setErrorMessage("");
    try {
      let query = supabase
        .from("public_courier_topups")
        .select("id, user_id, amount, proof_path, status, review_notes, created_at")
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") query = query.eq("status", statusFilter);

      const { data: requests, error: topupsError } = await query;
      if (topupsError) throw topupsError;
      if (!requests?.length) {
        setTopups([]);
        setProofUrls({});
        return;
      }

      const userIds = [...new Set(requests.map((topup) => topup.user_id))];
      const [{ data: couriers, error: couriersError }, { data: proofs, error: proofsError }] =
        await Promise.all([
          supabase
            .from("public_courier_applications")
            .select("user_id, full_name, phone")
            .in("user_id", userIds),
          supabase.storage
            .from("courier-topup-proofs")
            .createSignedUrls(
              requests.map((topup) => topup.proof_path),
              600,
            ),
        ]);
      if (couriersError) throw couriersError;
      if (proofsError) throw proofsError;

      const couriersById = new Map(
        (couriers || []).map((courier) => [courier.user_id, courier]),
      );
      const signedUrls = new Map(
        (proofs || []).map((proof) => [proof.path, proof.signedUrl]),
      );
      setTopups(
        requests.map((topup) => ({
          ...topup,
          courier: couriersById.get(topup.user_id),
        })),
      );
      setProofUrls(Object.fromEntries(signedUrls));
    } catch (error) {
      console.error("No se pudieron cargar las recargas de domiciliarios:", error);
      setErrorMessage(
        error.message ||
          "No se pudieron cargar las recargas. Verifica el acceso de superadministrador y que el SQL 129 esté aplicado.",
      );
      setTopups([]);
      setProofUrls({});
    } finally {
      setTopupsLoading(false);
    }
  }, [topupFilter]);

  const fetchCourierSettings = useCallback(async () => {
    setSettingsLoading(true);
    setErrorMessage("");
    try {
      const { data, error } = await supabase
        .from("public_courier_settings")
        .select("radius_km, commission_percentage, deposit_instructions")
        .eq("id", true)
        .single();
      if (error) throw error;
      setCourierSettings({
        radiusKm: String(data.radius_km ?? 1),
        commissionPercentage: String(data.commission_percentage ?? 0),
        depositInstructions: data.deposit_instructions || "",
      });
    } catch (error) {
      console.error("No se pudo cargar la configuración de domiciliarios:", error);
      setErrorMessage(
        error.message ||
            "No se pudo cargar la configuración. Verifica que esté aplicada la migración SQL 137.",
      );
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const saveCourierSettings = async (event) => {
    event.preventDefault();
    const radiusKm = Number(courierSettings.radiusKm);
    const commissionPercentage = Number(courierSettings.commissionPercentage);
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 100) {
      setErrorMessage("El radio debe ser mayor a 0 y máximo de 100 km.");
      return;
    }
    if (
      !Number.isFinite(commissionPercentage) ||
      commissionPercentage < 0 ||
      commissionPercentage > 100
    ) {
      setErrorMessage("La comisión debe estar entre 0 % y 100 %.");
      return;
    }

    setSettingsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const { error } = await supabase.rpc(
        "admin_update_public_courier_settings",
        {
          p_radius_km: radiusKm,
          p_commission_percentage: commissionPercentage,
          p_deposit_instructions: courierSettings.depositInstructions,
        },
      );
      if (error) throw error;
      setSuccessMessage("Configuración de domiciliarios guardada.");
      await fetchCourierSettings();
    } catch (error) {
      console.error("No se pudo guardar la configuración de domiciliarios:", error);
      const radiusMigrationPending =
        typeof error.message === "string" &&
        /radio máximo de servicio es 1 km/i.test(error.message);
      setErrorMessage(
        radiusMigrationPending
          ? "Supabase todavía tiene el límite anterior de 1 km. Aplica la migración SQL 137 para guardar radios como 5 km."
          : error.message ||
            "No se pudo guardar la configuración. Verifica que esté aplicada la migración SQL 137.",
      );
    } finally {
      setSettingsSaving(false);
    }
  };

  const reviewTopup = async (topup, approved) => {
    const courierName = topup.courier?.full_name || "este domiciliario";
    const action = approved ? "aprobar" : "rechazar";
    if (
      !window.confirm(
        `¿Confirmas ${action} la recarga de ${formatMoney(topup.amount)} de ${courierName}?`,
      )
    ) {
      return;
    }

    setActiveTopupId(topup.id);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const { error } = await supabase.rpc(
        "admin_review_public_courier_topup",
        {
          p_topup_id: topup.id,
          p_approved: approved,
          p_notes: topupNotes[topup.id]?.trim() || null,
        },
      );
      if (error) throw error;
      setSuccessMessage(
        approved
          ? `Recarga aprobada. Se acreditaron ${formatMoney(topup.amount)} a ${courierName}.`
          : `Recarga de ${courierName} rechazada.`,
      );
      await fetchTopups();
    } catch (error) {
      console.error("No se pudo revisar la recarga del domiciliario:", error);
      setErrorMessage(
        error.message ||
          "No se pudo revisar la recarga. Verifica tu acceso de superadministrador.",
      );
    } finally {
      setActiveTopupId("");
    }
  };

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
          onClick={
            activeTab === "applications"
              ? loadApplications
              : activeTab === "topups"
                ? fetchTopups
                : fetchCourierSettings
          }
          disabled={
            activeTab === "applications"
              ? loading
              : activeTab === "topups"
                ? topupsLoading
                : settingsLoading
          }
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-bold text-neutral-200 transition hover:bg-white/[0.05] disabled:opacity-50"
        >
          <RefreshCw
            size={15}
            className={
              (activeTab === "applications"
                ? loading
                : activeTab === "topups"
                  ? topupsLoading
                  : settingsLoading)
                ? "animate-spin"
                : undefined
            }
          />
          Actualizar
        </button>
      }
    >
      <div className="mb-4 flex gap-2 rounded-xl border border-white/[0.08] bg-neutral-900/60 p-1.5">
        {[
          ["applications", "Solicitudes de acceso"],
          ["topups", "Recargas"],
          ["settings", "Configuración"],
        ].map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setActiveTab(tab);
              if (tab === "topups") fetchTopups();
              if (tab === "settings") fetchCourierSettings();
            }}
            className={`rounded-lg px-4 py-2.5 text-xs font-bold transition ${
              activeTab === tab
                ? "bg-violet-500/20 text-violet-200"
                : "text-neutral-400 hover:bg-white/[0.05] hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "applications" ? (
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
      ) : activeTab === "topups" ? (
        <section className="rounded-2xl border border-white/[0.08] bg-neutral-900/60 p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Wallet size={18} className="text-emerald-300" />
              <h3 className="text-sm font-black">Recargas de domiciliarios</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ["pending", "Pendientes"],
                ["approved", "Aprobadas"],
                ["rejected", "Rechazadas"],
                ["all", "Todas"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setTopupFilter(value);
                    fetchTopups(value);
                  }}
                  className={`rounded-lg px-3 py-2 text-[11px] font-bold transition ${
                    topupFilter === value
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

          {topupsLoading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-neutral-400">
              <LoaderCircle size={18} className="animate-spin" />
              Cargando recargas...
            </div>
          ) : topups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-14 text-center">
              <Wallet size={28} className="mx-auto text-neutral-600" />
              <p className="mt-3 text-sm font-bold text-neutral-300">
                {topupFilter === "pending"
                  ? "No hay recargas pendientes"
                  : "No encontramos recargas para este filtro"}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {topups.map((topup) => {
                const isBusy = activeTopupId === topup.id;
                const proofUrl = proofUrls[topup.proof_path];
                return (
                  <article
                    key={topup.id}
                    className="rounded-2xl border border-white/[0.08] bg-neutral-950/60 p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-black text-white">
                          {topup.courier?.full_name || "Domiciliario"}
                        </h4>
                        {topup.courier?.phone && (
                          <a
                            href={`tel:${topup.courier.phone}`}
                            className="mt-1 inline-block text-xs text-violet-200 hover:text-violet-100"
                          >
                            {topup.courier.phone}
                          </a>
                        )}
                        <p className="mt-2 text-xs text-neutral-400">
                          Solicitada: {formatDate(topup.created_at)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-black text-emerald-300">
                          {formatMoney(topup.amount)}
                        </p>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                          {statusLabels[topup.status] || topup.status}
                        </span>
                      </div>
                    </div>

                    {proofUrl ? (
                      <a
                        href={proofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-neutral-200 transition hover:bg-white/[0.05]"
                      >
                        <ExternalLink size={14} />
                        Ver comprobante
                      </a>
                    ) : (
                      <p className="mt-4 text-xs text-rose-300">
                        No se pudo generar el enlace al comprobante. Actualiza para volver a intentarlo.
                      </p>
                    )}

                    {topup.status === "pending" && (
                      <>
                        <label className="mt-4 block text-[11px] font-bold text-neutral-400">
                          Nota de revisión (opcional)
                          <input
                            value={topupNotes[topup.id] ?? ""}
                            onChange={(event) =>
                              setTopupNotes((current) => ({
                                ...current,
                                [topup.id]: event.target.value,
                              }))
                            }
                            maxLength={500}
                            placeholder="Comentario sobre esta recarga"
                            disabled={isBusy}
                            className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5 text-xs text-white outline-none placeholder:text-neutral-600 focus:border-violet-400/40 disabled:opacity-50"
                          />
                        </label>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => reviewTopup(topup, true)}
                            disabled={isBusy || !proofUrl}
                            className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-black text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Check size={14} />
                            {isBusy ? "Guardando..." : "Confirmar recarga"}
                          </button>
                          <button
                            type="button"
                            onClick={() => reviewTopup(topup, false)}
                            disabled={isBusy}
                            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-rose-300/20 px-3 py-2 text-xs font-bold text-rose-200 transition hover:bg-rose-400/10 disabled:opacity-50"
                          >
                            <X size={14} />
                            Rechazar
                          </button>
                        </div>
                      </>
                    )}
                    {topup.review_notes && topup.status !== "pending" && (
                      <p className="mt-3 rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-neutral-400">
                        Nota: {topup.review_notes}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-2xl border border-white/[0.08] bg-neutral-900/60 p-4 sm:p-5">
          <div className="mb-5">
            <h3 className="text-sm font-black">Configuración de domicilios públicos</h3>
            <p className="mt-1 text-xs text-neutral-400">
              Define el radio en el que los domiciliarios encontrarán tiendas con pedidos públicos y la comisión por domicilio.
            </p>
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

          {settingsLoading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-neutral-400">
              <LoaderCircle size={18} className="animate-spin" />
              Cargando configuración...
            </div>
          ) : (
            <form onSubmit={saveCourierSettings} className="max-w-2xl space-y-4">
              <label className="block text-xs font-bold text-neutral-300">
                Comisión por domicilio (%)
                <div className="relative mt-2">
                  <input
                    required
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={courierSettings.commissionPercentage}
                    onChange={(event) =>
                      setCourierSettings((current) => ({
                        ...current,
                        commissionPercentage: event.target.value,
                      }))
                    }
                    disabled={settingsSaving}
                    className="w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-3 pr-10 text-sm text-white outline-none focus:border-violet-400/40 disabled:opacity-50"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
                    %
                  </span>
                </div>
                <span className="mt-2 block text-[11px] font-normal leading-5 text-neutral-500">
                  Se calcula sobre el valor del domicilio y se descuenta del saldo al aceptar el pedido. Ejemplo: un domicilio de $10.000 con comisión del 10 % descuenta $1.000.
                </span>
              </label>

              <label className="block text-xs font-bold text-neutral-300">
                Radio de búsqueda desde la tienda (km)
                <input
                  required
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={courierSettings.radiusKm}
                  onChange={(event) =>
                    setCourierSettings((current) => ({
                      ...current,
                      radiusKm: event.target.value,
                    }))
                  }
                  disabled={settingsSaving}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-3 text-sm text-white outline-none focus:border-violet-400/40 disabled:opacity-50"
                />
                <span className="mt-2 block text-[11px] font-normal leading-5 text-neutral-500">
                  El radio se mide desde la ubicación de la tienda, no desde el destino del cliente. Puedes configurarlo hasta 100 km.
                </span>
              </label>

              <label className="block text-xs font-bold text-neutral-300">
                Instrucciones para recargar saldo
                <textarea
                  rows={4}
                  maxLength={1000}
                  value={courierSettings.depositInstructions}
                  onChange={(event) =>
                    setCourierSettings((current) => ({
                      ...current,
                      depositInstructions: event.target.value,
                    }))
                  }
                  disabled={settingsSaving}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-3 text-sm text-white outline-none focus:border-violet-400/40 disabled:opacity-50"
                />
              </label>

              <button
                type="submit"
                disabled={settingsSaving}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-xs font-black text-white transition hover:bg-violet-400 disabled:cursor-wait disabled:opacity-50"
              >
                {settingsSaving && (
                  <LoaderCircle size={15} className="animate-spin" />
                )}
                {settingsSaving ? "Guardando..." : "Guardar configuración"}
              </button>
            </form>
          )}
        </section>
      )}
    </SuperAdminSectionShell>
  );
};

export default DomiciliariosPublicos;
