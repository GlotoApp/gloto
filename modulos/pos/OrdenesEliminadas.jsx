import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  Filter,
  RefreshCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
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
      <main className="mx-auto max-w-7xl space-y-5 pb-20">
        <header className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-sans text-2xl font-black tracking-tighter">
              Órdenes eliminadas
            </h1>
            <button
              type="button"
              onClick={loadDeletedOrders}
              disabled={isRefreshing}
              title={isRefreshing ? "Actualizando órdenes eliminadas" : "Actualizar órdenes eliminadas"}
              aria-label="Actualizar órdenes eliminadas"
              className="inline-flex items-center justify-center rounded-xl p-2 text-violet-300 transition hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw
                size={14}
                className={isRefreshing ? "animate-spin" : ""}
              />
            </button>
          </div>
          <div className="relative w-full">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600"
              size={14}
            />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por número de orden, cliente o producto..."
              aria-label="Buscar en órdenes eliminadas"
              className="w-full rounded-xl border border-white/5 bg-neutral-900/50 py-3 pl-10 pr-3 text-[10px] font-mono uppercase text-white outline-none transition-all placeholder:text-neutral-700 focus:border-violet-500/40"
            />
          </div>
        </header>

        {!isLoading && !error && (
          <section className="space-y-4 rounded-2xl border border-white/5 bg-neutral-900/40 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-neutral-200">
                <Filter size={14} className="text-violet-300" />
                Filtrar historial
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span aria-live="polite" className="text-xs text-neutral-400">
                  {filteredOrders.length} de {deletedOrders.length} órdenes
                </span>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
                  >
                    <X size={13} />
                    Limpiar filtros
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="ml-1 text-[8px] font-black uppercase tracking-widest text-neutral-600">
                  Motivo
                </span>
                <span className="group relative">
                  <select
                    value={reasonFilter}
                    onChange={(event) => setReasonFilter(event.target.value)}
                    className="w-full cursor-pointer appearance-none rounded-xl border border-white/5 bg-neutral-900 py-2.5 pl-3 pr-10 text-[10px] font-mono uppercase text-neutral-300 outline-none transition-all focus:border-violet-500/40"
                  >
                    <option value="">Todos los registros</option>
                    {Object.entries(DELETE_REASON_LABELS).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                  <ChevronDown
                    size={12}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600"
                  />
                </span>
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="ml-1 text-[8px] font-black uppercase tracking-widest text-neutral-600">
                  Desde
                </span>
                <span className="group relative block">
                  <CalendarDays
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-500/50 transition-colors group-hover:text-violet-500"
                  />
                  <input
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(event) => setDateFrom(event.target.value)}
                    aria-label="Desde la fecha"
                    className="w-full rounded-xl border border-white/5 bg-neutral-900 py-2.5 pl-9 pr-3 text-[10px] font-mono uppercase text-neutral-300 outline-none transition-all focus:border-violet-500/40"
                  />
                </span>
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="ml-1 text-[8px] font-black uppercase tracking-widest text-neutral-600">
                  Hasta
                </span>
                <span className="group relative block">
                  <CalendarDays
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-500/50 transition-colors group-hover:text-violet-500"
                  />
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(event) => setDateTo(event.target.value)}
                    aria-label="Hasta la fecha"
                    className="w-full rounded-xl border border-white/5 bg-neutral-900 py-2.5 pl-9 pr-3 text-[10px] font-mono uppercase text-neutral-300 outline-none transition-all focus:border-violet-500/40"
                  />
                </span>
              </label>
            </div>
          </section>
        )}

        {isLoading ? (
          <SubLoading label="Cargando órdenes eliminadas" className="py-20" />
        ) : error ? (
          <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-200 sm:p-6">
            {error}
          </div>
        ) : deletedOrders.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-neutral-900/40 px-6 py-12 text-center">
            <Trash2 className="mx-auto text-neutral-500" size={28} />
            <p className="mt-3 font-semibold text-neutral-200">
              No hay órdenes eliminadas
            </p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-neutral-900/40 px-6 py-12 text-center">
            <Search className="mx-auto text-neutral-500" size={28} />
            <p className="mt-3 font-semibold text-neutral-200">
              No hay órdenes que coincidan con esos filtros
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 min-h-9 rounded-lg px-3 text-xs font-semibold text-violet-300 transition-colors hover:bg-violet-500/10 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
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
                  className="group rounded-2xl border border-white/10 bg-neutral-900/50 p-4 transition-colors hover:border-white/15 hover:bg-neutral-900/70 open:border-violet-500/30 open:bg-neutral-900/80 sm:p-5"
                >
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60">
                    <div className="min-w-0">
                      <p className="break-all font-mono text-sm font-bold text-white">
                        Orden {entry.order_number || order.order_number || entry.order_id}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        Eliminada {formatDateTime(entry.deleted_at)}
                        {order.customer_name ? ` · ${order.customer_name}` : ""}
                      </p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-base font-bold text-neutral-100">
                        {formatMoney(order.total)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-red-300">
                        {DELETE_REASON_LABELS[entry.reason_code] || entry.reason_code}
                      </p>
                    </div>
                  </summary>
                  <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
                    {entry.reason_details && (
                      <div className="space-y-1 rounded-xl border border-red-500/10 bg-red-500/5 p-3">
                        <p className="text-xs font-semibold text-red-200">
                          Detalle del motivo
                        </p>
                        <p className="break-words text-sm text-neutral-300">
                          {entry.reason_details}
                        </p>
                      </div>
                    )}
                    <p className="text-sm text-neutral-400">
                      Cliente: {order.customer_name || "Consumidor final"}
                      {order.customer_phone ? ` · ${order.customer_phone}` : ""}
                    </p>
                    {items.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                          Productos
                        </p>
                        {items.map((item, index) => (
                          <div
                            key={item.id || `${item.product_name}-${index}`}
                            className="flex flex-wrap justify-between gap-2 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5 text-sm"
                          >
                            <span className="min-w-0 break-words text-neutral-200">
                              {item.product_name || "Producto"} × {item.quantity}
                            </span>
                            <span className="ml-auto whitespace-nowrap font-medium text-neutral-300">
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
