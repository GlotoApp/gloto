import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Filter, RefreshCcw, Search, Trash2, X } from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import { useAuth } from "../../src/components/AuthContext";
import SubLoading from "./SubLoading";

const DELETE_REASON_LABELS = {
  cancelled_by_customer: "Pedido cancelado por el cliente",
  duplicate_order: "Orden duplicada",
  entered_in_error: "Orden ingresada por error",
  items_unavailable: "Productos no disponibles",
  payment_issue: "Problema con el pago",
  other: "Otro motivo",
};

const formatMoney = (value) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDateTime = (value) => {
  if (!value) return "Fecha no disponible";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Fecha no disponible"
    : date.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
};

const OrdenesEliminadas = () => {
  const { user } = useAuth();
  const [deletedOrders, setDeletedOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const loadDeletedOrders = useCallback(async () => {
    if (!user?.id) {
      setDeletedOrders([]);
      setIsLoading(false);
      setError("Inicia sesión para consultar el historial.");
      return;
    }

    setIsLoading(true);
    setIsRefreshing(true);
    setError("");
    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id, role")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) throw profileError;

      const allowedRoles = [
        "admin",
        "owner",
        "dueño",
        "dueno",
        "super_admin",
        "superadmin",
      ];
      const role = String(profile?.role || "").toLowerCase();
      const isSuperAdmin = ["super_admin", "superadmin"].includes(role);
      if (
        (!profile?.business_id && !isSuperAdmin) ||
        !allowedRoles.includes(role)
      ) {
        setDeletedOrders([]);
        setError("No tienes permiso para consultar las órdenes eliminadas.");
        return;
      }

      let query = supabase
        .from("deleted_orders")
        .select(
          "id, order_id, business_id, order_number, reason_code, reason_details, order_snapshot, items_snapshot, deleted_by, deleted_at",
        )
        .order("deleted_at", { ascending: false });
      if (!isSuperAdmin) {
        query = query.eq("business_id", profile.business_id);
      }

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      setDeletedOrders(data || []);
    } catch (loadError) {
      console.error("Error cargando las órdenes eliminadas:", loadError);
      setDeletedOrders([]);
      setError(loadError?.message || "No se pudo cargar el historial de órdenes eliminadas.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    let isCurrent = true;
    Promise.resolve().then(() => {
      if (isCurrent) loadDeletedOrders();
    });
    return () => {
      isCurrent = false;
    };
  }, [loadDeletedOrders]);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase("es");
    return deletedOrders.filter((entry) => {
      const order = entry.order_snapshot || {};
      const matchesSearch =
        !normalizedSearch ||
        [
          entry.order_number,
          order.order_number,
          entry.order_id,
          order.customer_name,
          order.customer_phone,
          entry.reason_details,
          ...(Array.isArray(entry.items_snapshot)
            ? entry.items_snapshot.map((item) => item.product_name)
            : []),
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLocaleLowerCase("es").includes(normalizedSearch),
          );
      const matchesReason = !reasonFilter || entry.reason_code === reasonFilter;
      const deletedDate = String(entry.deleted_at || "").slice(0, 10);
      const matchesDateFrom = !dateFrom || deletedDate >= dateFrom;
      const matchesDateTo = !dateTo || deletedDate <= dateTo;
      return matchesSearch && matchesReason && matchesDateFrom && matchesDateTo;
    });
  }, [dateFrom, dateTo, deletedOrders, reasonFilter, searchTerm]);

  const hasActiveFilters = Boolean(
    searchTerm || reasonFilter || dateFrom || dateTo,
  );
  const clearFilters = () => {
    setSearchTerm("");
    setReasonFilter("");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className="min-h-screen bg-background p-4 text-white">
      <main className="mx-auto max-w-7xl space-y-6 pb-20">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-red-300">
              Historial
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight">
              Órdenes eliminadas
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              Consulta las órdenes archivadas, el motivo y su detalle.
            </p>
          </div>
          <button
            type="button"
            onClick={loadDeletedOrders}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-neutral-300 transition hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCcw size={14} className={isRefreshing ? "animate-spin" : ""} />
            Actualizar
          </button>
        </header>

        {!isLoading && !error && (
          <section className="space-y-4 rounded-2xl border border-white/5 bg-neutral-900/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-neutral-300">
                <Filter size={14} className="text-violet-300" />
                Filtrar historial
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-neutral-500">
                  {filteredOrders.length} de {deletedOrders.length} órdenes
                </span>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1 text-xs font-bold text-red-300 transition hover:text-red-200"
                  >
                    <X size={13} />
                    Limpiar filtros
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="relative block">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="N.º de orden, cliente, producto..."
                  aria-label="Buscar en órdenes eliminadas"
                  className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-violet-400/50"
                />
              </label>
              <label>
                <span className="sr-only">Filtrar por motivo</span>
                <select
                  value={reasonFilter}
                  onChange={(event) => setReasonFilter(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400/50"
                >
                  <option value="">Todos los motivos</option>
                  {Object.entries(DELETE_REASON_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="relative block">
                <CalendarDays
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                />
                <span className="sr-only">Desde la fecha</span>
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-violet-400/50"
                />
              </label>
              <label className="relative block">
                <CalendarDays
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                />
                <span className="sr-only">Hasta la fecha</span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-violet-400/50"
                />
              </label>
            </div>
          </section>
        )}

        {isLoading ? (
          <SubLoading label="Cargando órdenes eliminadas" className="py-20" />
        ) : error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-200">
            {error}
          </div>
        ) : deletedOrders.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-neutral-900/40 p-10 text-center">
            <Trash2 className="mx-auto text-neutral-600" size={28} />
            <p className="mt-3 font-bold text-neutral-300">
              No hay órdenes eliminadas
            </p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-neutral-900/40 p-10 text-center">
            <Search className="mx-auto text-neutral-600" size={28} />
            <p className="mt-3 font-bold text-neutral-300">
              No hay órdenes que coincidan con esos filtros
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 text-xs font-bold text-violet-300 hover:text-violet-200"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <section className="space-y-3">
            {filteredOrders.map((entry) => {
              const order = entry.order_snapshot || {};
              const items = Array.isArray(entry.items_snapshot)
                ? entry.items_snapshot
                : [];
              return (
                <details
                  key={entry.id}
                  className="group rounded-2xl border border-white/10 bg-neutral-900/60 p-4 sm:p-5"
                >
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-black text-white">
                        Orden {entry.order_number || order.order_number || entry.order_id}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        Eliminada {formatDateTime(entry.deleted_at)}
                        {order.customer_name ? ` · ${order.customer_name}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-neutral-200">
                        {formatMoney(order.total)}
                      </p>
                      <p className="mt-1 text-xs font-bold text-red-300">
                        {DELETE_REASON_LABELS[entry.reason_code] || entry.reason_code}
                      </p>
                    </div>
                  </summary>
                  <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                    {entry.reason_details && (
                      <p className="text-sm text-neutral-300">
                        <strong className="text-neutral-100">Detalle del motivo: </strong>
                        {entry.reason_details}
                      </p>
                    )}
                    <p className="text-xs text-neutral-500">
                      Cliente: {order.customer_name || "Consumidor final"}
                      {order.customer_phone ? ` · ${order.customer_phone}` : ""}
                    </p>
                    {items.length > 0 && (
                      <div className="space-y-2">
                        {items.map((item, index) => (
                          <div
                            key={item.id || `${item.product_name}-${index}`}
                            className="flex flex-wrap justify-between gap-2 rounded-lg bg-black/20 px-3 py-2 text-sm"
                          >
                            <span className="text-neutral-200">
                              {item.product_name || "Producto"} × {item.quantity}
                            </span>
                            <span className="text-neutral-400">
                              {formatMoney(item.subtotal || Number(item.unit_price || 0) * Number(item.quantity || 0))}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
};

export default OrdenesEliminadas;
