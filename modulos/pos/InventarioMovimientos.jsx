import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  RefreshCcw,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import { useAuth } from "../../src/components/AuthContext";
import SubLoading from "./SubLoading";

const formatNumber = (value) =>
  Number(value || 0).toLocaleString("es-CO", { maximumFractionDigits: 3 });
const combineMovements = (...groups) =>
  groups
    .flat()
    .sort(
      (first, second) =>
        new Date(second.created_at).getTime() -
        new Date(first.created_at).getTime(),
    )
    .slice(0, 100);

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
  const [expandedMovements, setExpandedMovements] = useState({});
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const refreshingRef = useRef(false);

  const loadMovements = useCallback(async (id) => {
    setLoadError("");
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
    }

    const rows = data || [];
    const {
      data: productStockRows,
      error: productStockError,
    } = await supabase
      .from("product_stock_movements")
      .select(
        "id,product_name,unit_name,quantity_delta,reason,order_id,created_at",
      )
      .eq("business_id", id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (productStockError) {
      console.error("Error cargando movimientos de stock de productos:", productStockError);
      setLoadError(
        `No se pudieron cargar los movimientos de stock de productos: ${productStockError.message}. Verifica que la migración 108 esté aplicada.`,
      );
    }
    let ordersById = {};
    const productOrderIds = [
      ...new Set((productStockRows || []).map((movement) => movement.order_id).filter(Boolean)),
    ];
    if (productOrderIds.length > 0) {
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("id,order_number")
        .in("id", productOrderIds);
      if (ordersError) {
        console.error("Error cargando órdenes de los movimientos de productos:", ordersError);
        setLoadError(
          `Los movimientos de productos se cargaron, pero no se pudo asociar el número de orden: ${ordersError.message}`,
        );
      } else {
        ordersById = Object.fromEntries(
          (orders || []).map((order) => [order.id, order]),
        );
      }
    }
    setLastUpdated(new Date());
    const formattedProductRows = (productStockRows || []).map((movement) => ({
      ...movement,
      movement_source: "product_stock",
    }));
    const formattedInventoryRows = rows.map((movement) => ({
      ...movement,
      movement_source: "inventory",
    }));
    if (error) {
      setMovements(
        combineMovements(
          formattedProductRows.map((movement) => ({
            ...movement,
            orders: ordersById[movement.order_id] || null,
          })),
        ),
      );
      setLoadError(
        `No se pudieron cargar los movimientos de insumos: ${error.message}`,
      );
      return;
    }
    if (rows.length === 0) {
      setMovements(
        combineMovements(
          formattedProductRows.map((movement) => ({
            ...movement,
            orders: ordersById[movement.order_id] || null,
          })),
        ),
      );
      return;
    }

    const { data: linkRows, error: linkError } = await supabase
      .from("inventory_movements")
      .select("id,movement_type,order_id,order_item_id")
      .in(
        "id",
        rows.map((movement) => movement.id),
      );
    if (linkError) {
      console.error("Error cargando vínculos de movimientos:", linkError);
      setMovements(
        combineMovements(
          formattedInventoryRows,
          formattedProductRows.map((movement) => ({
            ...movement,
            orders: ordersById[movement.order_id] || null,
          })),
        ),
      );
      setLoadError(
        "Los movimientos se cargaron, pero no fue posible obtener el vínculo con las órdenes. Verifica que la migración 007 esté aplicada y vuelve a cargar.",
      );
      return;
    }

    const linksById = Object.fromEntries(
      (linkRows || []).map((row) => [row.id, row]),
    );
    const linkedOrderItemIds = [
      ...new Set(
        (linkRows || [])
          .map((row) => row.order_item_id)
          .filter(Boolean),
      ),
    ];
    let orderItemsById = {};
    if (linkedOrderItemIds.length > 0) {
      const { data: orderItems, error: orderItemsError } = await supabase
        .from("order_items")
        .select("id,product_name,quantity,unit_name,order_id")
        .in("id", linkedOrderItemIds);
      if (orderItemsError) {
        console.error("Error cargando productos de las órdenes:", orderItemsError);
        setLoadError(
          "Los movimientos se cargaron, pero no fue posible mostrar los productos asociados.",
        );
      } else {
        orderItemsById = Object.fromEntries(
          (orderItems || []).map((item) => [item.id, item]),
        );
      }
    }

    const orderIds = [
      ...new Set(
        [
          ...(linkRows || []).map((row) => row.order_id),
          ...Object.values(orderItemsById).map((item) => item.order_id),
        ].filter(Boolean),
      ),
    ];
    if (orderIds.length > 0) {
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("id,order_number")
        .in("id", orderIds);
      if (ordersError) {
        console.error("Error cargando órdenes de los movimientos:", ordersError);
        setLoadError(
          `Los movimientos se cargaron, pero no se pudo asociar el número de orden: ${ordersError.message}`,
        );
      } else {
        ordersById = {
          ...ordersById,
          ...Object.fromEntries(
            (orders || []).map((order) => [order.id, order]),
          ),
        };
      }
    }

    setMovements(
      combineMovements(
        formattedInventoryRows.map((movement) => {
          const link = linksById[movement.id] || {};
          const orderItem = orderItemsById[link.order_item_id];
          return {
            ...movement,
            ...link,
            order_items: orderItem
              ? {
                  ...orderItem,
                  orders: ordersById[orderItem.order_id] || null,
                }
              : null,
          };
        }),
        formattedProductRows.map((movement) => ({
          ...movement,
          orders: ordersById[movement.order_id] || null,
        })),
      ),
    );
  }, []);

  const refreshMovements = useCallback(async (id = businessId) => {
    if (!id || refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await loadMovements(id);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [businessId, loadMovements]);

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .maybeSingle();
      if (error || !data?.business_id) {
        console.error("Error buscando el negocio del usuario:", error);
        setLoadError(
          error?.message || "No se encontró el negocio asociado a tu usuario.",
        );
        setLoading(false);
        return;
      }
      setBusinessId(data.business_id);
      await loadMovements(data.business_id);
      setLoading(false);
    };
    load();
  }, [user?.id]);

  const movementGroups = useMemo(() => {
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

    const filtered = movements.filter((movement) => {
      const delta = Number(movement.quantity_delta || 0);
      const createdAt = new Date(movement.created_at);
      const product = movement.order_items;
      const isProductStockMovement =
        movement.movement_source === "product_stock";
      const name = movement.inventory_items?.name || "";
      const productName = isProductStockMovement
        ? movement.product_name || ""
        : product?.product_name || "";
      const orderNumber =
        movement.orders?.order_number || product?.orders?.order_number || "";
      const matchesSearch =
        !normalizedSearch ||
        name.toLowerCase().includes(normalizedSearch) ||
        productName.toLowerCase().includes(normalizedSearch) ||
        String(orderNumber).toLowerCase().includes(normalizedSearch) ||
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

    const groups = new Map();
    filtered.forEach((movement) => {
      const isProductStockMovement =
        movement.movement_source === "product_stock";
      const isSale =
        !isProductStockMovement && movement.movement_type === "sale";
      const isProductSale =
        isProductStockMovement && movement.reason === "sale";
      const groupKey =
        isProductStockMovement
          ? `product-stock:${movement.id}`
          : isSale && movement.order_item_id
            ? `sale-line:${movement.order_item_id}`
            : isSale && movement.order_id
              ? `sale-order:${movement.order_id}`
              : `movement:${movement.id}`;
      const group = groups.get(groupKey);
      if (group) {
        group.movements.push(movement);
      } else {
        groups.set(groupKey, {
          id: groupKey,
          movements: [movement],
          isSale,
          isProductSale,
          isProductStock: isProductStockMovement,
        });
      }
    });

    return Array.from(groups.values()).map((group) => {
      const first = group.movements[0];
      const delta = group.movements.reduce(
        (sum, movement) => sum + Number(movement.quantity_delta || 0),
        0,
      );
      return {
        ...group,
        delta,
        product: first.order_items || null,
        orderId: first.order_id,
        createdAt: first.created_at,
        reason: first.reason,
      };
    });
  }, [movements, search, movementType, dateFilter, dateFrom, dateTo]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 font-sans text-white">
        <SubLoading
          label="Cargando historial"
          className="min-h-[calc(100vh-2rem)]"
          fullHeight
          dotClassName="bg-violet-400"
        />
      </div>
    );
  }

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
            onClick={() => refreshMovements()}
            disabled={!businessId || refreshing}
            className="rounded-xl p-2 text-violet-300 hover:bg-violet-500/10 disabled:cursor-wait disabled:opacity-50"
            aria-label={refreshing ? "Actualizando historial" : "Actualizar historial"}
            title={refreshing ? "Actualizando..." : "Actualizar historial"}
          >
            <RefreshCcw
              size={16}
              className={refreshing ? "animate-spin" : ""}
            />
          </button>
        </header>
        <p className="mt-[-1.25rem] text-right text-[10px] text-neutral-500">
          {refreshing
            ? "Actualizando movimientos..."
            : lastUpdated
              ? `Actualizado ${lastUpdated.toLocaleTimeString("es-CO")}`
              : "Aún no se ha actualizado"}
        </p>
        {loadError && (
          <p
            role="alert"
            className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200"
          >
            {loadError}
          </p>
        )}
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
          {movementGroups.length === 0 ? (
            <p className="py-12 text-center text-sm text-neutral-500">
              No hay movimientos que coincidan con los filtros.
            </p>
          ) : (
            <div className="space-y-3 p-3 sm:p-4">
              {movementGroups.map((group) => {
                const isEntry = group.delta > 0;
                const expanded = Boolean(expandedMovements[group.id]);
                const singleMovement = group.movements[0];
                const productName = group.isProductStock
                  ? singleMovement.product_name
                  : group.product?.product_name;
                const orderNumber = group.isProductStock
                  ? singleMovement.orders?.order_number
                  : group.product?.orders?.order_number;
                const productQuantity = Number(group.product?.quantity || 0);
                const productUnit = group.isProductStock
                  ? singleMovement.unit_name
                  : group.product?.unit_name || "";
                const title = group.isSale
                  ? productName || "Salida por venta"
                  : group.isProductStock
                    ? productName || "Producto"
                    : singleMovement.inventory_items?.name || "Insumo";
                return (
                  <article
                    key={group.id}
                    className="overflow-hidden rounded-2xl border border-white/5 bg-neutral-900/40 transition-colors hover:border-white/10"
                  >
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() =>
                        setExpandedMovements((current) => ({
                          ...current,
                          [group.id]: !current[group.id],
                        }))
                      }
                      className="flex w-full items-center gap-3 p-4 text-left hover:bg-neutral-900/70"
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
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-white">
                          {title}
                        </span>
                        <span
                          className={`block text-[10px] font-black uppercase tracking-widest ${isEntry ? "text-emerald-400" : "text-red-400"}`}
                        >
                          {isEntry ? "Entrada" : "Salida"}
                          {group.isSale &&
                            ` · Venta${productQuantity ? ` de ${formatNumber(productQuantity)} ${productUnit}` : ""}`}
                          {group.isProductStock &&
                            (group.isProductSale
                              ? " · Venta de producto"
                              : " · Producto")}
                          {group.isProductStock &&
                            singleMovement.reason === "correction" &&
                            " · Corrección de orden"}
                          {group.isProductStock &&
                            singleMovement.reason === "opening_balance" &&
                            " · Saldo inicial"}
                          {orderNumber ? ` · Orden #${orderNumber}` : ""}
                        </span>
                        <span className="block text-[10px] uppercase tracking-widest text-neutral-500">
                          {group.isSale
                            ? `${group.movements.length} insumo${group.movements.length === 1 ? "" : "s"} descontado${group.movements.length === 1 ? "" : "s"}`
                            : group.isProductStock
                              ? singleMovement.reason === "initial_stock"
                                ? "Entrada de stock"
                                : singleMovement.reason === "opening_balance"
                                  ? "Saldo existente al activar historial"
                                  : singleMovement.reason === "stock_added"
                                    ? "Entrada de stock"
                                    : singleMovement.reason === "sale"
                                      ? "Descuento por venta"
                                      : singleMovement.reason === "correction"
                                        ? "Restitución de stock al editar la orden"
                                    : "Ajuste de stock del producto"
                              : group.reason}
                          {" · "}
                          {new Date(group.createdAt).toLocaleString("es-CO")}
                        </span>
                      </span>
                      {!group.isSale && (
                        <span
                          className={`shrink-0 text-sm font-black ${isEntry ? "text-emerald-400" : "text-red-400"}`}
                        >
                          {isEntry ? "+" : ""}
                          {formatNumber(group.delta)}{" "}
                          {group.isProductStock
                            ? productUnit
                            : singleMovement.inventory_items?.unit || ""}
                        </span>
                      )}
                      <ChevronDown
                        size={17}
                        className={`shrink-0 text-neutral-500 transition-transform ${expanded ? "rotate-180" : ""}`}
                      />
                    </button>
                    {expanded && (
                      <div className="space-y-2 border-t border-white/5 bg-black/10 px-4 py-3">
                        {group.movements.map((movement) => {
                          const delta = Number(movement.quantity_delta || 0);
                          return (
                            <div
                              key={movement.id}
                              className="flex items-center justify-between gap-3 text-xs"
                            >
                              <span className="min-w-0 truncate text-neutral-300">
                                {movement.movement_source === "product_stock"
                                  ? `${movement.product_name || "Producto"} · ${
                                      movement.reason === "opening_balance"
                                        ? "Saldo inicial"
                                        : movement.reason === "initial_stock" ||
                                            movement.reason === "stock_added"
                                          ? "Entrada de stock"
                                          : movement.reason === "sale"
                                            ? "Salida por venta"
                                            : movement.reason === "correction"
                                              ? "Corrección de orden"
                                          : movement.reason === "stock_adjustment"
                                            ? "Ajuste de stock"
                                            : "Salida de stock"
                                    }`
                                  : movement.inventory_items?.name || "Insumo"}
                              </span>
                              <span
                                className={`shrink-0 font-bold ${delta > 0 ? "text-emerald-400" : "text-red-400"}`}
                              >
                                {delta > 0 ? "+" : ""}
                                {formatNumber(delta)}{" "}
                                {movement.movement_source === "product_stock"
                                  ? movement.unit_name
                                  : movement.inventory_items?.unit || ""}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
