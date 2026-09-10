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

const DEFAULT_UNITS = [];
const inputClass =
  "w-full rounded-lg border border-white/10 bg-neutral-800 p-3 text-sm outline-none focus:border-violet-500";
const upper = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900 p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-black uppercase tracking-tighter">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 hover:bg-white/10"
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
  const status =
    item.stock < 0
      ? "crítico"
      : item.stock <= item.minStock
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
    <div className="rounded-2xl border border-white/5 bg-neutral-900/40">
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
        className="w-full cursor-pointer p-4 text-left hover:bg-white/5"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {item.name}
            </p>
            <p className="text-xs text-neutral-500">
              {item.category} · mínimo {item.minStock} {item.unit}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className={`text-sm font-black ${color}`}>
              {item.stock} {item.unit}
            </span>
            <span className={`text-[9px] font-black uppercase ${color}`}>
              {status}
            </span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(item);
              }}
              aria-label={`Editar ${item.name}`}
              className="rounded-lg p-1.5 text-neutral-500 hover:bg-violet-500/10 hover:text-violet-300"
            >
              <Edit2 size={16} />
            </button>
          </div>
        </div>
      </div>
      {open && (
        <div className="space-y-4 border-t border-white/5 p-4">
          <div className="flex items-center justify-center gap-4 rounded-lg bg-neutral-800/40 p-4">
            <button
              type="button"
              onClick={() => setValue(String(numericValue - 1))}
              aria-label="Disminuir stock"
              className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-700 hover:text-red-400"
            >
              <ArrowDownRight size={18} />
            </button>
            <input
              type="number"
              step="any"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-label={`Stock de ${item.name}`}
              className="w-28 rounded-lg border border-white/10 bg-neutral-700 px-3 py-2 text-center text-xl font-black outline-none focus:border-violet-500"
            />
            <button
              type="button"
              onClick={() => setValue(String(numericValue + 1))}
              aria-label="Aumentar stock"
              className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-700 hover:text-emerald-400"
            >
              <ArrowUpRight size={18} />
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-500/20 px-4 py-2.5 text-[10px] font-black uppercase text-red-400 hover:bg-red-500 hover:text-white"
            >
              <Trash2 size={14} /> Eliminar
            </button>
            <button
              type="button"
              disabled={!changed}
              onClick={() => onUpdateStock(item.id, numericValue - item.stock)}
              className="flex-1 rounded-lg bg-violet-500 px-4 py-2.5 text-[10px] font-black uppercase text-white disabled:cursor-not-allowed disabled:opacity-40"
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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [unit, setUnit] = useState("Todos");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: "",
    categoryId: "",
    stock: 0,
    unit: DEFAULT_UNITS[0],
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
        .from("inventory_units")
        .select("name")
        .eq("business_id", profile.business_id),
    ]);
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
        minStock: Number(item.min_stock || 0),
        price: Number(item.price || 0),
      })),
    );
    setCategories(
      (categoryRows.data || [])
        .map((item) => ({ id: item.id, name: upper(item.name) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    setUnits(
      [
        ...new Set((unitRows.data || []).map((item) => upper(item.name))),
      ].sort(),
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
            (unit === "Todos" || item.unit === unit)
          );
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [inventory, search, category, unit],
  );

  const openNew = () => {
    setEditing(null);
    setForm({
      name: "",
      categoryId: categories[0]?.id || "",
      stock: 0,
      unit: units[0],
      minStock: 10,
      price: 0,
    });
    setModal(true);
  };
  const openEdit = (item) => {
    setEditing(item);
    setForm({ ...item, categoryId: item.categoryId || "" });
    setModal(true);
  };

  const saveInventory = async () => {
    if (!businessId || !form.name.trim()) return;
    if (!form.categoryId) {
      alert("Selecciona una categoría para el insumo.");
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

  return (
    <div className="min-h-screen bg-background p-4 font-sans text-white">
      <header className="mx-auto mb-10 max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-black tracking-tighter">Insumos</h1>
          <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-neutral-500">
            {loading
              ? "Cargando inventario..."
              : "Control de existencias y stock de insumos"}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/5 bg-neutral-900/40 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
              Valor de bodega
            </p>
            <p className="mt-2 text-2xl font-black">
              ${totalValue.toLocaleString("de-DE")}
            </p>
          </div>
          <div className="rounded-2xl border border-orange-500/30 bg-neutral-900/40 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
              Stock bajo
            </p>
            <p className="mt-2 text-2xl font-black text-orange-400">
              {lowStock}
            </p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-neutral-900/40 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
              Insumos activos
            </p>
            <p className="mt-2 text-2xl font-black text-violet-400">
              {inventory.length}
            </p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-5 pb-20">
        <div className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-neutral-900/30 p-4 lg:flex-row">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600"
              size={14}
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="BUSCAR INSUMO..."
              className={`${inputClass} pl-10 text-[10px] uppercase`}
            />
          </div>
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
          <select
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            className={inputClass}
          >
            <option value="Todos">Todas las unidades</option>
            {units.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={openNew}
            className="flex items-center justify-center gap-2 rounded-lg bg-violet-500 px-5 py-3 text-[10px] font-black uppercase hover:bg-violet-600"
          >
            <Plus size={14} /> Nuevo insumo
          </button>
        </div>
        <div className="space-y-3">
          {filteredInventory.length === 0 ? (
            <p className="py-16 text-center text-neutral-500">
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
          <div className="space-y-4">
            <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-500">
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
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                Categoría
                <select
                  value={form.categoryId}
                  onChange={(event) =>
                    setForm({ ...form, categoryId: event.target.value })
                  }
                  className={`${inputClass} mt-2`}
                >
                  {categories.map((value) => (
                    <option key={value.id} value={value.id}>
                      {value.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                Unidad
                <select
                  value={form.unit}
                  onChange={(event) =>
                    setForm({ ...form, unit: event.target.value })
                  }
                  className={`${inputClass} mt-2`}
                >
                  {units.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                Stock actual
                <input
                  type="number"
                  step="any"
                  value={form.stock}
                  onChange={(event) =>
                    setForm({ ...form, stock: event.target.value })
                  }
                  className={`${inputClass} mt-2`}
                />
              </label>
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                Stock mínimo
                <input
                  type="number"
                  step="any"
                  value={form.minStock}
                  onChange={(event) =>
                    setForm({ ...form, minStock: event.target.value })
                  }
                  className={`${inputClass} mt-2`}
                />
              </label>
            </div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-500">
              Precio por unidad
              <input
                type="number"
                step="any"
                value={form.price}
                onChange={(event) =>
                  setForm({ ...form, price: event.target.value })
                }
                className={`${inputClass} mt-2`}
              />
            </label>
            <button
              type="button"
              onClick={saveInventory}
              disabled={!form.name.trim()}
              className="w-full rounded-lg bg-violet-500 px-4 py-3 text-[10px] font-black uppercase disabled:opacity-40"
            >
              {editing ? "Actualizar" : "Crear insumo"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
