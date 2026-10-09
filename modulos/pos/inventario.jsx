import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Edit2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import { useAuth } from "../../src/components/AuthContext";
import SubLoading from "./SubLoading";

const DEFAULT_UNITS = ["UNIDAD"];
const inputClass =
  "min-h-10 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 outline-none transition-colors focus:border-violet-400/50 focus:ring-2 focus:ring-violet-500/30";
const upper = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();
const formatQuantity = (value) =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(
    Number(value) || 0,
  );
const getStockStatus = (item) =>
  item.stock < 0 ? "critico" : item.stock <= item.minStock ? "bajo" : "optimo";

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900 p-5 shadow-2xl sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="font-sans text-xl font-bold tracking-tight text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function InventoryCard({ item, onEdit, onDelete, onUpdateStock }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(item.stock));
  const numericValue = Number(value || 0);
  const changed = numericValue !== item.stock;
  const stockStep = item.allowsFraction ? 0.1 : 1;
  const stockStatus = getStockStatus(item);
  const status =
    stockStatus === "critico"
      ? "crítico"
      : stockStatus === "bajo"
        ? "bajo"
        : "óptimo";
  const color =
    item.stock < 0
      ? "text-red-400"
      : item.stock <= item.minStock
        ? "text-orange-400"
        : "text-emerald-400";

  useEffect(() => setValue(String(item.stock)), [item.stock]);

  return (
    <div className="rounded-2xl bg-neutral-900/40 transition-colors hover:bg-neutral-900/60">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((current) => !current);
          }
        }}
        className="w-full cursor-pointer rounded-2xl p-4 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/60"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {item.name}
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              Categoría: {item.category} · mínimo {formatQuantity(item.minStock)} {item.unit}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className={`text-sm font-black ${color}`}>
              {formatQuantity(item.stock)} {item.unit}
            </span>
            <span className={`text-[10px] font-bold uppercase ${color}`}>
              {status}
            </span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(item);
              }}
              aria-label={`Editar ${item.name}`}
              className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-violet-500/10 hover:text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
            >
              <Edit2 size={16} />
            </button>
          </div>
        </div>
      </div>
      {open && (
        <div className="space-y-4 rounded-b-2xl bg-black/20 p-4">
          <div className="flex items-center justify-center gap-3 rounded-lg bg-neutral-800/40 p-4">
            <button
              type="button"
              onClick={() =>
                setValue(String(Number((numericValue - stockStep).toFixed(3))))
              }
              aria-label="Disminuir stock"
              className="rounded-lg p-2 text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
            >
              <ArrowDownRight size={18} />
            </button>
            <input
              type="number"
              step={item.allowsFraction ? "0.001" : "1"}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-label={`Stock de ${item.name}`}
              className={`w-32 appearance-none rounded-xl bg-neutral-800 px-3 py-2 text-center text-xl font-bold tabular-nums outline-none focus:ring-2 focus:ring-violet-500/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                numericValue < 0 ? "text-red-400" : "text-white"
              }`}
            />
            <button
              type="button"
              onClick={() =>
                setValue(String(Number((numericValue + stockStep).toFixed(3))))
              }
              aria-label="Aumentar stock"
              className="rounded-lg p-2 text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
            >
              <ArrowUpRight size={18} />
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-red-500/10 px-4 py-2.5 text-xs font-bold uppercase text-red-300 transition-colors hover:bg-red-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
            >
              <Trash2 size={14} /> Eliminar
            </button>
            <button
              type="button"
              disabled={!changed}
              onClick={() => onUpdateStock(item.id, numericValue - item.stock)}
              className="min-h-10 flex-1 rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-bold uppercase text-white transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Guardar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Inventario() {
  const { user } = useAuth();
  const [businessId, setBusinessId] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState(DEFAULT_UNITS);
  const [unitDescriptions, setUnitDescriptions] = useState({});
  const [fractionalUnits, setFractionalUnits] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [unit, setUnit] = useState("Todos");
  const [stockStatus, setStockStatus] = useState("Todos");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showQuickCategory, setShowQuickCategory] = useState(false);
  const [quickCategoryName, setQuickCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [form, setForm] = useState({
    name: "",
    categoryId: "",
    stock: 0,
    unit: "",
    minStock: 10,
    price: 0,
  });

  const loadInventory = async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("business_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError || !profile?.business_id) {
      setLoading(false);
      return;
    }
    setBusinessId(profile.business_id);
    const [items, categoryRows, unitRows] = await Promise.all([
      supabase
        .from("inventory_items")
        .select("id,name,category_id,stock,unit,min_stock,price")
        .eq("business_id", profile.business_id)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("inventory_categories")
        .select("id,name")
        .eq("business_id", profile.business_id),
      supabase
        .from("units")
        .select("name,description,allows_fraction")
        .eq("is_active", true)
        .order("name"),
    ]);
    if (items.error || categoryRows.error || unitRows.error) {
      const loadError = items.error || categoryRows.error || unitRows.error;
      console.error("Error cargando inventario, categorías o unidades:", loadError);
      alert("No se pudo cargar completamente el inventario. Intenta nuevamente.");
      setLoading(false);
      return;
    }

    const categoryMap = Object.fromEntries(
      (categoryRows.data || []).map((item) => [item.id, upper(item.name)]),
    );
    setInventory(
      (items.data || []).map((item) => ({
        id: item.id,
        name: item.name,
        categoryId: item.category_id || "",
        category: categoryMap[item.category_id] || "Sin categoría",
        stock: Number(item.stock || 0),
        unit: upper(item.unit),
        allowsFraction: Boolean(
          (unitRows.data || []).find(
            (unitRow) => upper(unitRow.name) === upper(item.unit),
          )?.allows_fraction,
        ),
        minStock: Number(item.min_stock || 0),
        price: Number(item.price || 0),
      })),
    );
    setCategories(
      (categoryRows.data || [])
        .map((item) => ({ id: item.id, name: upper(item.name) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    const activeUnits = [
      ...new Set((unitRows.data || []).map((item) => upper(item.name))),
    ].sort();
    setFractionalUnits(
      Object.fromEntries(
        (unitRows.data || []).map((item) => [
          upper(item.name),
          Boolean(item.allows_fraction),
        ]),
      ),
    );
    setUnits(activeUnits);
    setUnitDescriptions(
      Object.fromEntries(
        (unitRows.data || []).map((item) => [
          upper(item.name),
          String(item.description || "").trim(),
        ]),
      ),
    );
    setLoading(false);
  };

  useEffect(() => {
    loadInventory();
  }, [user?.id]);

  const filteredInventory = useMemo(
    () =>
      inventory
        .filter((item) => {
          const text = search.toLowerCase();
          return (
            (!text ||
              item.name.toLowerCase().includes(text) ||
              item.category.toLowerCase().includes(text)) &&
            (category === "Todos" || item.categoryId === category) &&
            (unit === "Todos" || item.unit === unit) &&
            (stockStatus === "Todos" || getStockStatus(item) === stockStatus)
          );
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [inventory, search, category, unit, stockStatus],
  );

  const openNew = () => {
    setEditing(null);
    setShowQuickCategory(false);
    setQuickCategoryName("");
    setForm({
      name: "",
      categoryId: "",
      stock: 0,
      unit: "",
      minStock: 10,
      price: 0,
    });
    setModal(true);
  };
  const openEdit = (item) => {
    setEditing(item);
    setShowQuickCategory(false);
    setQuickCategoryName("");
    setForm({ ...item, categoryId: item.categoryId || "" });
    setModal(true);
  };

  const createQuickCategory = async () => {
    const name = upper(quickCategoryName);
    if (!businessId || !name || creatingCategory) return;

    const existingCategory = categories.find((item) => item.name === name);
    if (existingCategory) {
      setQuickCategoryName("");
      setShowQuickCategory(false);
      alert("La categoría ya existe. Selecciónala en la lista.");
      return;
    }

    setCreatingCategory(true);
    const { data, error } = await supabase
      .from("inventory_categories")
      .insert({ business_id: businessId, name })
      .select("id,name")
      .single();
    setCreatingCategory(false);

    if (error) {
      console.error("Error creando categoría rápida de inventario:", error);
      alert(
        error.code === "23505"
          ? "La categoría ya existe."
          : "No se pudo crear la categoría. Intenta nuevamente.",
      );
      return;
    }

    const newCategory = { id: data.id, name: upper(data.name) };
    setCategories((current) =>
      [...current, newCategory].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setQuickCategoryName("");
    setShowQuickCategory(false);
  };

  const saveInventory = async () => {
    if (!businessId || !form.name.trim()) return;
    if (!form.categoryId) {
      alert("Selecciona una categoría para el insumo.");
      return;
    }
    if (!form.unit) {
      alert("Selecciona una unidad para el insumo.");
      return;
    }
    const desiredStock = Number(form.stock) || 0;
    const payload = {
      business_id: businessId,
      name: upper(form.name),
      category_id: form.categoryId || null,
      stock: editing ? undefined : 0,
      unit: upper(form.unit),
      min_stock: Number(form.minStock) || 0,
      price: Number(form.price) || 0,
      is_active: true,
    };
    const response = editing
      ? await supabase
          .from("inventory_items")
          .update(payload)
          .eq("id", editing.id)
          .eq("business_id", businessId)
          .select()
          .single()
      : await supabase
          .from("inventory_items")
          .insert(payload)
          .select()
          .single();
    if (response.error) {
      alert("No se pudo guardar el insumo.");
      return;
    }
    let saved = response.data;
    const delta = desiredStock - Number(editing?.stock || 0);
    if (delta !== 0) {
      const adjustment = await supabase.rpc("adjust_inventory_stock", {
        p_item_id: saved.id,
        p_quantity_delta: delta,
        p_reason: editing ? "edit_adjustment" : "initial_stock",
        p_notes: "Ajuste desde inventario",
      });
      if (!adjustment.error)
        saved = Array.isArray(adjustment.data)
          ? adjustment.data[0] || saved
          : adjustment.data || saved;
    }
    const mapped = {
      id: saved.id,
      name: saved.name,
      categoryId: saved.category_id || form.categoryId || "",
      category:
        categories.find(
          (category) => category.id === (saved.category_id || form.categoryId),
        )?.name || "Sin categoría",
      stock: Number(saved.stock || 0),
      unit: saved.unit,
      allowsFraction: Boolean(fractionalUnits[upper(saved.unit)]),
      minStock: Number(saved.min_stock || 0),
      price: Number(saved.price || 0),
    };
    setInventory((current) =>
      editing
        ? current.map((item) => (item.id === mapped.id ? mapped : item))
        : [...current, mapped],
    );
    setModal(false);
  };

  const deleteInventory = async (id) => {
    if (
      !businessId ||
      !window.confirm("¿Eliminar este insumo definitivamente?")
    )
      return;
    const { error } = await supabase.rpc("delete_inventory_item_cascade", {
      p_item_id: id,
    });
    if (error) {
      alert(error.message || "No se pudo eliminar el insumo.");
      return;
    }
    setInventory((current) => current.filter((item) => item.id !== id));
  };

  const updateStock = async (id, delta) => {
    const { data, error } = await supabase.rpc("adjust_inventory_stock", {
      p_item_id: id,
      p_quantity_delta: delta,
      p_reason: "manual_adjustment",
      p_notes: "Ajuste manual desde inventario",
    });
    if (error) {
      alert("No se pudo actualizar el stock.");
      return;
    }
    const saved = Array.isArray(data) ? data[0] : data;
    setInventory((current) =>
      current.map((item) =>
        item.id === id ? { ...item, stock: Number(saved?.stock || 0) } : item,
      ),
    );
  };

  const totalValue = inventory.reduce(
    (sum, item) => sum + item.stock * item.price,
    0,
  );
  const lowStock = inventory.filter(
    (item) => item.stock <= item.minStock,
  ).length;
  const selectedUnit = upper(form.unit);
  const selectedUnitAllowsFraction = Boolean(fractionalUnits[selectedUnit]);
  const quantityStep = selectedUnitAllowsFraction ? "0.001" : "1";

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 font-sans text-white">
        <SubLoading
          label="Cargando inventario"
          className="min-h-[calc(100vh-2rem)]"
          fullHeight
          dotClassName="bg-violet-400"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 font-sans text-white">
      <header className="mx-auto mb-6 max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-sans text-2xl font-black tracking-tighter text-white">
            Insumos
          </h1>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-violet-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-violet-200 transition-colors hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
          >
            <Plus size={14} /> Nuevo insumo
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-neutral-900/40 p-4 sm:p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
              Valor de bodega
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-white">
              ${totalValue.toLocaleString("de-DE")}
            </p>
          </div>
          <div className="rounded-2xl bg-neutral-900/40 p-4 sm:p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
              Stock bajo
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-orange-300">
              {lowStock}
            </p>
          </div>
          <div className="rounded-2xl bg-neutral-900/40 p-4 sm:p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
              Insumos activos
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-violet-300">
              {inventory.length}
            </p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-5 pb-20">
        <div className="rounded-2xl bg-neutral-900/30 p-3 sm:p-4">
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(150px,1fr)]">
            <label className="block min-w-0">
              <span className="mb-1.5 block px-1 text-[9px] font-black uppercase tracking-widest text-neutral-400">
                Buscar
              </span>
              <span className="relative block">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-400/70"
                  size={16}
                />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nombre del insumo"
                  className={`${inputClass} pl-10`}
                />
              </span>
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block px-1 text-[9px] font-black uppercase tracking-widest text-neutral-400">
                Categoría
              </span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className={inputClass}
              >
                <option value="Todos">Todas las categorías</option>
                {categories.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block px-1 text-[9px] font-black uppercase tracking-widest text-neutral-400">
                Unidad
              </span>
              <select
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                className={`${inputClass} uppercase`}
              >
                <option value="Todos">Todas las unidades</option>
                {units.map((value) => (
                  <option key={value} value={value}>
                    {unitDescriptions[value]
                      ? `${value} · ${unitDescriptions[value]}`
                      : value}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block px-1 text-[9px] font-black uppercase tracking-widest text-neutral-400">
                Estado del stock
              </span>
              <select
                value={stockStatus}
                onChange={(event) => setStockStatus(event.target.value)}
                className={inputClass}
              >
                <option value="Todos">Todos los estados</option>
                <option value="optimo">Óptimos</option>
                <option value="bajo">Bajos</option>
                <option value="critico">Críticos</option>
              </select>
            </label>
          </div>
        </div>
        <div className="space-y-3">
          {filteredInventory.length === 0 ? (
            <p className="rounded-2xl bg-neutral-900/30 px-5 py-14 text-center text-sm text-neutral-300">
              No hay insumos que coincidan.
            </p>
          ) : (
            filteredInventory.map((item) => (
              <InventoryCard
                key={item.id}
                item={item}
                onEdit={openEdit}
                onDelete={deleteInventory}
                onUpdateStock={updateStock}
              />
            ))
          )}
        </div>
      </main>
      {modal && (
        <Modal
          title={editing ? "Editar insumo" : "Nuevo insumo"}
          onClose={() => setModal(false)}
        >
          <div className="space-y-6">
            <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-300">
              Nombre
              <input
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                className={`${inputClass} mt-2`}
                placeholder="Ej: Harina de maíz"
              />
            </label>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-300">
                <label htmlFor="inventory-category">Categoría</label>
                <select
                  id="inventory-category"
                  value={form.categoryId}
                  onChange={(event) =>
                    setForm({ ...form, categoryId: event.target.value })
                  }
                  className={`${inputClass} mt-2`}
                  required
                >
                  <option value="" disabled>
                    Selecciona una categoría
                  </option>
                  {categories.map((value) => (
                    <option key={value.id} value={value.id}>
                      {value.name}
                    </option>
                  ))}
                </select>
                {!showQuickCategory ? (
                  <button
                    type="button"
                    onClick={() => setShowQuickCategory(true)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-md text-[10px] font-bold normal-case tracking-normal text-violet-300 transition-colors hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
                  >
                    <Plus size={13} /> Crear categoría rápida
                  </button>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <input
                      autoFocus
                      value={quickCategoryName}
                      onChange={(event) =>
                        setQuickCategoryName(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          createQuickCategory();
                        }
                      }}
                      aria-label="Nombre de la nueva categoría"
                      placeholder="Nombre de la categoría"
                      className="min-h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-neutral-950 px-3 py-2 text-sm normal-case tracking-normal text-neutral-100 outline-none focus:border-violet-400/50 focus:ring-2 focus:ring-violet-500/30"
                    />
                    <button
                      type="button"
                      onClick={createQuickCategory}
                      disabled={!quickCategoryName.trim() || creatingCategory}
                      className="min-h-10 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold uppercase text-white transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {creatingCategory ? "..." : "Crear"}
                    </button>
                  </div>
                )}
              </div>
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-300">
                Unidad
                <select
                  value={form.unit}
                  onChange={(event) =>
                    setForm({ ...form, unit: event.target.value })
                  }
                  className={`${inputClass} mt-2 uppercase`}
                  required
                >
                  <option value="" disabled>
                    Selecciona una unidad
                  </option>
                  {[...new Set([
                    ...units,
                    ...(editing?.unit && !units.includes(editing.unit)
                      ? [editing.unit]
                      : []),
                  ])].map((value) => (
                    <option key={value} value={value}>
                      {unitDescriptions[value]
                        ? `${value} · ${unitDescriptions[value]}`
                        : value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-300">
                Existencia actual ({selectedUnit || "UNIDAD"})
                <span className="mt-1 block text-xs font-medium normal-case tracking-normal text-neutral-400">
                  Cantidad disponible expresada en {selectedUnit || "UNIDAD"}.
                </span>
                <input
                  type="number"
                  step={quantityStep}
                  value={form.stock}
                  onChange={(event) =>
                    setForm({ ...form, stock: event.target.value })
                  }
                  className={`${inputClass} mt-2`}
                />
              </label>
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-300">
                Stock mínimo ({selectedUnit || "UNIDAD"})
                <span className="mt-1 block text-xs font-medium normal-case tracking-normal text-neutral-400">
                  Alerta cuando queden esta cantidad o menos.
                </span>
                <input
                  type="number"
                  step={quantityStep}
                  value={form.minStock}
                  onChange={(event) =>
                    setForm({ ...form, minStock: event.target.value })
                  }
                  className={`${inputClass} mt-2`}
                />
              </label>
            </div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-300">
              Costo por {selectedUnit || "UNIDAD"}
              <input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(event) =>
                  setForm({ ...form, price: event.target.value })
                }
                className={`${inputClass} mt-2`}
              />
              <span className="mt-1 block text-xs font-medium normal-case tracking-normal text-neutral-400">
                El stock y su mínimo se registran en {selectedUnit || "UNIDAD"}.
                {selectedUnitAllowsFraction
                  ? " Esta unidad permite cantidades fraccionarias."
                  : " Esta unidad solo admite cantidades enteras."}
              </span>
            </label>
            <button
              type="button"
              onClick={saveInventory}
              disabled={!form.name.trim() || !form.categoryId || !form.unit}
              className="min-h-11 w-full rounded-xl bg-violet-600 px-4 py-3 text-xs font-bold uppercase text-white transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {editing ? "Actualizar" : "Crear insumo"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
