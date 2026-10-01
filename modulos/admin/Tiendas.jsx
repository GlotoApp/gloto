import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  MapPin,
  Phone,
  Search,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import SuperAdminSectionShell from "./ContenedorSeccion";

const formatMoney = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  if (Number.isNaN(amount)) return value;
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
};

const getInitials = (name) =>
  (name || "T")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "T";

const normalizeBusinessData = (
  businesses,
  infoMap,
  subscriptionsMap,
  notificationsMap,
) =>
  businesses.map((business) => {
    const info = infoMap[business.id] || {};
    const subscription = subscriptionsMap[business.id] || null;
    const businessNotifications = notificationsMap[business.id] || [];

    return {
      ...business,
      info,
      subscription,
      notifications: businessNotifications,
      unreadNotifications: businessNotifications.filter(
        (notification) => !notification.read_at,
      ).length,
      planName: subscription?.plan_name || "Sin plan",
      planStatus: subscription?.status || "sin-plan",
      category: info?.category?.name || info?.categoria || "Sin categoría",
      address: info?.address || "Sin dirección",
      phone: info?.whatsapp_phone || "Sin WhatsApp",
      rating: info?.rating ?? null,
    };
  });

const SuperAdminTiendasPanel = ({}) => {
  const navigate = useNavigate();
  const [tiendas, setTiendas] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todas");
  const [filtroPlan, setFiltroPlan] = useState("todos");
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cargarTiendas = async () => {
      try {
        setLoading(true);

        const [
          businessesResult,
          infoResult,
          subscriptionsResult,
          notificationsResult,
        ] = await Promise.all([
          supabase
            .from("businesses")
            .select("id,name,slug,logo_url,cover_url,is_active,created_at")
            .order("created_at", { ascending: false }),
          supabase
            .from("business_info")
            .select(
              "business_id,category_id,categoria,category:categories!business_info_category_id_fkey(name),address,whatsapp_phone,delivery_time_min,delivery_time_max,rating,rating_count,delivery_fee,free_delivery_min_order,currency,tax_rate,latitude,longitude",
            ),
          supabase
            .from("subscriptions")
            .select(
              "business_id,plan_name,status,amount,billing_period,starts_at,ends_at",
            )
            .order("created_at", { ascending: false }),
          supabase
            .from("business_notifications")
            .select(
              "id,business_id,title,notification_type,severity,message,action_path,created_at,read_at,resolved_at",
            )
            .order("created_at", { ascending: false }),
        ]);

        if (businessesResult.error) throw businessesResult.error;
        if (infoResult.error) throw infoResult.error;
        if (subscriptionsResult.error) throw subscriptionsResult.error;
        if (notificationsResult.error) throw notificationsResult.error;

        const infoMap = {};
        for (const info of infoResult.data || []) {
          if (info.business_id) infoMap[info.business_id] = info;
        }

        const subscriptionsMap = {};
        for (const subscription of subscriptionsResult.data || []) {
          if (!subscriptionsMap[subscription.business_id]) {
            subscriptionsMap[subscription.business_id] = subscription;
          }
        }

        const notificationsMap = {};
        for (const notification of notificationsResult.data || []) {
          if (!notificationsMap[notification.business_id]) {
            notificationsMap[notification.business_id] = [];
          }
          notificationsMap[notification.business_id].push(notification);
        }

        const todasLasTiendas = normalizeBusinessData(
          businessesResult.data || [],
          infoMap,
          subscriptionsMap,
          notificationsMap,
        );

        setTiendas(todasLasTiendas);
      } catch (error) {
        console.error("No se pudieron cargar las tiendas:", error);
        setTiendas([]);
      } finally {
        setLoading(false);
      }
    };

    cargarTiendas();
  }, []);

  const tiendasFiltradas = useMemo(() => {
    const query = busqueda.trim().toLowerCase();
    return tiendas.filter((tienda) => {
      const coincideBusqueda =
        !query ||
        tienda.name?.toLowerCase().includes(query) ||
        tienda.slug?.toLowerCase().includes(query) ||
        tienda.category?.toLowerCase().includes(query) ||
        tienda.address?.toLowerCase().includes(query);
      const coincideEstado =
        filtroEstado === "todas" ||
        (filtroEstado === "activas" && tienda.is_active) ||
        (filtroEstado === "inactivas" && !tienda.is_active);
      const coincidePlan =
        filtroPlan === "todos" || tienda.planName === filtroPlan;
      const coincideCategoria =
        filtroCategoria === "todas" || tienda.category === filtroCategoria;

      return (
        coincideBusqueda && coincideEstado && coincidePlan && coincideCategoria
      );
    });
  }, [tiendas, busqueda, filtroEstado, filtroPlan, filtroCategoria]);

  const planesDisponibles = [
    ...new Set(tiendas.map((tienda) => tienda.planName).filter(Boolean)),
  ].sort((first, second) => first.localeCompare(second, "es"));
  const categoriasDisponibles = [
    ...new Set(tiendas.map((tienda) => tienda.category).filter(Boolean)),
  ].sort((first, second) => first.localeCompare(second, "es"));
  const hayFiltrosActivos =
    busqueda.trim() ||
    filtroEstado !== "todas" ||
    filtroPlan !== "todos" ||
    filtroCategoria !== "todas";

  const limpiarFiltros = () => {
    setBusqueda("");
    setFiltroEstado("todas");
    setFiltroPlan("todos");
    setFiltroCategoria("todas");
  };

  const openStoreDetail = (id) => {
    navigate(`/superadmin/tiendas/${id}`);
  };

  return (
    <SuperAdminSectionShell
      title="Tiendas"
      subtitle="Listado completo de negocios del sistema."
      badge="Operación"
      actions={
        <Link
          to="/superadmin-actual"
          className="inline-flex items-center justify-center rounded-xl bg-violet-500 px-3 py-2 text-sm font-bold text-white transition hover:bg-violet-400"
        >
          Abrir gestión
        </Link>
      }
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-white/10 bg-neutral-900/75 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
            <SlidersHorizontal size={14} />
            Buscar y filtrar
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1.6fr)_repeat(3,minmax(145px,1fr))]">
            <label className="relative sm:col-span-2 xl:col-span-1">
              <span className="sr-only">Buscar tiendas</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                size={16}
              />
              <input
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                placeholder="Nombre, slug, categoría o dirección"
                className="w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 pl-9 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-violet-400"
              />
            </label>

            <label>
              <span className="sr-only">Filtrar por estado</span>
              <select
                value={filtroEstado}
                onChange={(event) => setFiltroEstado(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
              >
                <option value="todas">Todos los estados</option>
                <option value="activas">Activas</option>
                <option value="inactivas">Inactivas</option>
              </select>
            </label>

            <label>
              <span className="sr-only">Filtrar por plan</span>
              <select
                value={filtroPlan}
                onChange={(event) => setFiltroPlan(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
              >
                <option value="todos">Todos los planes</option>
                {planesDisponibles.map((plan) => (
                  <option key={plan} value={plan}>
                    {plan}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="sr-only">Filtrar por categoría</span>
              <select
                value={filtroCategoria}
                onChange={(event) => setFiltroCategoria(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
              >
                <option value="todas">Todas las categorías</option>
                {categoriasDisponibles.map((categoria) => (
                  <option key={categoria} value={categoria}>
                    {categoria}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
            <p className="text-xs text-neutral-500" aria-live="polite">
              Mostrando {tiendasFiltradas.length} de {tiendas.length} tiendas
            </p>
            {hayFiltrosActivos && (
              <button
                type="button"
                onClick={limpiarFiltros}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-neutral-300 transition hover:bg-white/5 hover:text-white"
              >
                <X size={13} />
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-neutral-900/75 p-8 text-center text-sm text-neutral-400">
            Cargando tiendas...
          </div>
        ) : tiendasFiltradas.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-neutral-900/75 p-8 text-center text-sm text-neutral-400">
            No hay tiendas que coincidan con la búsqueda.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/60 divide-y divide-white/10">
            {tiendasFiltradas.map((tienda) => {
              const unread = tienda.unreadNotifications || 0;

              return (
                <button
                  key={tienda.id}
                  type="button"
                  onClick={() => openStoreDetail(tienda.id)}
                  className="w-full px-3 py-3 text-left transition hover:bg-white/[0.035] focus-visible:bg-white/[0.035] focus-visible:outline-none md:px-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-950 ring-1 ring-white/10">
                      {tienda.logo_url ? (
                        <img
                          src={tienda.logo_url}
                          alt={tienda.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-sm font-black text-violet-200">
                          {getInitials(tienda.name)}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-bold text-white">
                          {tienda.name}
                        </h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${
                            tienda.is_active
                              ? "bg-emerald-500/10 text-emerald-300"
                              : "bg-red-500/10 text-red-300"
                          }`}
                        >
                          {tienda.is_active ? "Activa" : "Inactiva"}
                        </span>
                      </div>

                      <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-neutral-400">
                        <span className="inline-flex items-center gap-1">
                          <Tag size={12} /> {tienda.category}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Building2 size={12} /> {tienda.slug}
                        </span>
                      </div>

                      <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] text-neutral-400">
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} />{" "}
                          {tienda.address || "Sin dirección"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Phone size={12} /> {tienda.phone || "Sin WhatsApp"}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-violet-500/30 bg-violet-500/8 px-2 py-1 text-[10px] font-bold text-violet-200">
                          {tienda.planName}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-neutral-300">
                          {tienda.notifications?.length || 0} alertas
                        </span>
                        {unread > 0 && (
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-300">
                            {unread} sin leer
                          </span>
                        )}
                      </div>
                    </div>

                    <span className="ml-auto mt-2 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-neutral-300">
                      Ver detalle
                      <ArrowRight size={12} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </SuperAdminSectionShell>
  );
};

export default SuperAdminTiendasPanel;
