import React, { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, RefreshCcw } from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import { useAuth } from "../../src/components/AuthContext";

const formatNumber = (value) =>
  Number(value || 0).toLocaleString("es-CO", { maximumFractionDigits: 3 });

export default function InventarioMovimientos() {
  const { user } = useAuth();
  const [businessId, setBusinessId] = useState(null);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [movementType, setMovementType] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const loadMovements = async (id) => {
    const { data, error } = await supabase
      .from("inventory_movements")
      .select(
        "id,quantity_delta,reason,notes,created_at,inventory_items(name,unit)",
      )
      .eq("business_id", id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      console.error("Error cargando movimientos:", error);
      return;
    }
    setMovements(data || []);
  };

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .maybeSingle();
      if (error || !data?.business_id) return;
      setBusinessId(data.business_id);
      await loadMovements(data.business_id);
      setLoading(false);
    };
    load();
  }, [user?.id]);

  const filteredMovements = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const sevenDaysAgo = new Date(startOfToday);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const customFrom = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const customTo = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;

    return movements.filter((movement) => {
      const delta = Number(movement.quantity_delta || 0);
      const createdAt = new Date(movement.created_at);
      const name = movement.inventory_items?.name || "";
      const matchesSearch =
        !normalizedSearch ||
        name.toLowerCase().includes(normalizedSearch) ||
        String(movement.reason || "")
          .toLowerCase()
          .includes(normalizedSearch);
      const matchesType =
        movementType === "all" ||
        (movementType === "entry" && delta > 0) ||
        (movementType === "exit" && delta < 0);
      const matchesDate =
        dateFilter === "all" ||
        (dateFilter === "today" && createdAt >= startOfToday) ||
        (dateFilter === "yesterday" &&
          createdAt >= startOfYesterday &&
          createdAt < startOfToday) ||
        (dateFilter === "week" && createdAt >= sevenDaysAgo) ||
        (dateFilter === "custom" &&
          customFrom &&
          customTo &&
          createdAt >= customFrom &&
          createdAt <= customTo);

      return matchesSearch && matchesType && matchesDate;
    });
  }, [movements, search, movementType, dateFilter, dateFrom, dateTo]);

  return (
    <div className="min-h-screen bg-background p-4 font-sans text-white">
      <div className="mx-auto max-w-7xl space-y-6 pb-20">
        <header className="mb-10 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tighter">
              Historial de Inventario
            </h1>
            <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-neutral-500">
              Entradas y salidas de existencias
            </p>
          </div>
          <button
            type="button"
            onClick={() => businessId && loadMovements(businessId)}
            className="rounded-xl p-2 text-violet-300 hover:bg-violet-500/10"
            aria-label="Actualizar historial"
          >
            <RefreshCcw size={16} />
          </button>
        </header>
        <div className="overflow-hidden rounded-2xl border border-white/5 bg-neutral-900/40">
          <div className="grid gap-3 border-b border-white/5 bg-neutral-900/30 p-4 md:grid-cols-[minmax(0,1fr)_180px_180px]">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="BUSCAR INSUMO O MOTIVO..."
              className="w-full rounded-xl border border-white/5 bg-neutral-950/60 px-3 py-2.5 text-[10px] font-mono uppercase text-white outline-none focus:border-violet-500/50"
            />
            <select
              value={movementType}
              onChange={(event) => setMovementType(event.target.value)}
              className="rounded-xl border border-white/5 bg-neutral-950/60 px-3 py-2.5 text-[10px] font-black uppercase text-neutral-300 outline-none focus:border-violet-500/50"
            >
              <option value="all">Todos los movimientos</option>
              <option value="entry">Entradas</option>
              <option value="exit">Salidas</option>
            </select>
            <select
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="rounded-xl border border-white/5 bg-neutral-950/60 px-3 py-2.5 text-[10px] font-black uppercase text-neutral-300 outline-none focus:border-violet-500/50"
            >
              <option value="all">Todas las fechas</option>
              <option value="today">Hoy</option>
              <option value="yesterday">Ayer</option>
              <option value="week">Últimos 7 días</option>
              <option value="custom">Rango personalizado</option>
            </select>
          </div>
          {dateFilter === "custom" && (
            <div className="grid gap-3 border-b border-white/5 px-4 pb-4 sm:grid-cols-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500">
                Desde
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/5 bg-neutral-950/60 px-3 py-2.5 text-xs text-white outline-none focus:border-violet-500/50"
                />
              </label>
              <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500">
                Hasta
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/5 bg-neutral-950/60 px-3 py-2.5 text-xs text-white outline-none focus:border-violet-500/50"
                />
              </label>
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="h-2 w-2 animate-pulse rounded-full bg-blue-400"
                  style={{ animationDelay: `${dot * 150}ms` }}
                />
              ))}
            </div>
          ) : filteredMovements.length === 0 ? (
            <p className="py-12 text-center text-sm text-neutral-500">
              No hay movimientos que coincidan con los filtros.
            </p>
          ) : (
            <div className="space-y-3 p-3 sm:p-4">
              {filteredMovements.map((movement) => {
                const delta = Number(movement.quantity_delta || 0);
                const isEntry = delta > 0;
                return (
                  <div
                    key={movement.id}
                    className="flex items-center gap-3 rounded-2xl border border-white/5 bg-neutral-900/40 p-4 transition-all hover:border-white/10 hover:bg-neutral-900/70"
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isEntry ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}
                    >
                      {isEntry ? (
                        <ArrowUpRight size={17} />
                      ) : (
                        <ArrowDownRight size={17} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-white">
                        {movement.inventory_items?.name || "Insumo"}
                      </p>
                      <p
                        className={`text-[10px] font-black uppercase tracking-widest ${isEntry ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {isEntry ? "Entrada" : "Salida"}
                      </p>
                      <p className="text-[10px] uppercase tracking-widest text-neutral-500">
                        {movement.reason} ·{" "}
                        {new Date(movement.created_at).toLocaleString("es-CO")}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-black ${isEntry ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {isEntry ? "+" : ""}
                      {formatNumber(delta)}{" "}
                      {movement.inventory_items?.unit || ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
