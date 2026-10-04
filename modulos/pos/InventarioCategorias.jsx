import React, { useEffect, useMemo, useState } from "react";
import { Edit3, Filter, Package, Plus, Search, Trash2, X } from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import { useAuth } from "../../src/components/AuthContext";
import SubLoading from "./SubLoading";

const upper = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

export default function InventarioCategorias() {
  const { user } = useAuth();
  const [businessId, setBusinessId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [itemFilter, setItemFilter] = useState("all");
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const [categoryDeleteConfirm, setCategoryDeleteConfirm] = useState(null);
  const [categoryDeleteLoading, setCategoryDeleteLoading] = useState(false);

  const loadCategories = async (id) => {
    const [categoriesResponse, itemsResponse] = await Promise.all([
      supabase
        .from("inventory_categories")
        .select("id,name")
        .eq("business_id", id)
        .order("name"),
      supabase
        .from("inventory_items")
        .select("category_id")
        .eq("business_id", id),
    ]);
    if (categoriesResponse.error || itemsResponse.error) {
      console.error("Error cargando categorías de inventario:", {
        categoriesError: categoriesResponse.error,
        itemsError: itemsResponse.error,
      });
      return;
    }
    const itemCounts = (itemsResponse.data || []).reduce((counts, item) => {
      if (item.category_id) {
        counts[item.category_id] = (counts[item.category_id] || 0) + 1;
      }
      return counts;
    }, {});
    setCategories(
      (categoriesResponse.data || []).map((category) => ({
        ...category,
        itemCount: itemCounts[category.id] || 0,
      })),
    );
  };

  useEffect(() => {
    const load = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .maybeSingle();
      if (error || !data?.business_id) {
        if (error) console.error("Error cargando el negocio:", error);
        setLoading(false);
        return;
      }
      setBusinessId(data.business_id);
      await loadCategories(data.business_id);
      setLoading(false);
    };
    load();
  }, [user?.id]);

  const saveCategory = async (event) => {
    event.preventDefault();
    const categoryName = upper(name);
    if (!businessId || !categoryName || savingCategory) return;

    setSavingCategory(true);
    setCategoryError("");
    const response = await supabase
      .from("inventory_categories")
      .insert({ business_id: businessId, name: categoryName });

    if (response.error) {
      console.error("Error creando categoría de inventario:", response.error);
      setCategoryError(
        response.error.code === "23505"
          ? "Ya existe una categoría con ese nombre."
          : "No se pudo crear la categoría. Intenta nuevamente.",
      );
      setSavingCategory(false);
      return;
    }
    setName("");
    setCreatingCategory(false);
    setSavingCategory(false);
    await loadCategories(businessId);
  };

  const saveCategoryEdit = async (event) => {
    event.preventDefault();
    const categoryName = upper(editingName);
    if (!businessId || !editing || !categoryName || savingCategory) return;

    setSavingCategory(true);
    setCategoryError("");
    const { error } = await supabase
      .from("inventory_categories")
      .update({ name: categoryName })
      .eq("id", editing.id)
      .eq("business_id", businessId);

    if (error) {
      console.error("Error actualizando categoría de inventario:", error);
      setCategoryError(
        error.code === "23505"
          ? "Ya existe una categoría con ese nombre."
          : "No se pudo actualizar la categoría. Intenta nuevamente.",
      );
      setSavingCategory(false);
      return;
    }

    setEditing(null);
    setEditingName("");
    setSavingCategory(false);
    await loadCategories(businessId);
  };

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return categories.filter((category) => {
      const matchesSearch =
        !query || category.name.toLocaleLowerCase().includes(query);
      const matchesItemFilter =
        itemFilter === "all" ||
        (itemFilter === "with-items" && category.itemCount > 0) ||
        (itemFilter === "empty" && category.itemCount === 0);
      return matchesSearch && matchesItemFilter;
    });
  }, [categories, itemFilter, search]);

  const prepareCategoryDelete = async (category) => {
    if (!businessId) return;
    const { data: items, error: itemsError } = await supabase
      .from("inventory_items")
      .select("id,name,unit,stock")
      .eq("business_id", businessId)
      .eq("category_id", category.id);
    if (itemsError) {
      alert("No se pudieron consultar los insumos de la categoría.");
      return;
    }

    const itemIds = (items || []).map((item) => item.id);
    let products = [];
    if (itemIds.length > 0) {
      const { data: links, error: linksError } = await supabase
        .from("product_ingredients")
        .select("inventory_item_id, products(id,name)")
        .in("inventory_item_id", itemIds);
      if (linksError) {
        alert("No se pudieron consultar los productos vinculados.");
        return;
      }
      products = (links || [])
        .filter((link) => link.products)
        .map((link) => link.products)
        .filter(
          (product, index, allProducts) =>
            allProducts.findIndex((item) => item.id === product.id) === index,
        );
    }

    setCategoryDeleteConfirm({ category, items: items || [], products });
  };

  const deleteCategory = async () => {
    if (!businessId || !categoryDeleteConfirm) return;
    setCategoryDeleteLoading(true);
    const { category } = categoryDeleteConfirm;
    const { error } = await supabase.rpc("delete_inventory_category_cascade", {
      p_category_id: category.id,
    });
    if (error) {
      setCategoryDeleteLoading(false);
      alert(error.message || "No se pudo eliminar la categoría y sus insumos.");
      return;
    }
    setCategoryDeleteLoading(false);
    setCategoryDeleteConfirm(null);
    await loadCategories(businessId);
  };

  return (
    <div className="min-h-screen bg-background p-4 font-sans text-white">
      <div className="mx-auto max-w-7xl space-y-6 pb-20">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Categorías de insumos
            </h1>
            <p className="text-sm text-neutral-500">
              Organiza los insumos y encuentra cada categoría rápidamente.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setName("");
              setCategoryError("");
              setCreatingCategory(true);
            }}
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-xs font-semibold text-white transition-colors hover:bg-violet-500"
          >
            <Plus size={15} /> Crear categoría
          </button>
        </header>
        {loading ? (
          <SubLoading
            label="Cargando categorías"
            className="py-12"
            dotClassName="bg-violet-400"
          />
        ) : (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-neutral-900/30 p-3 sm:flex-row sm:items-center">
              <label className="relative min-w-0 flex-1">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar categoría..."
                  aria-label="Buscar categorías"
                  className="w-full rounded-xl border border-white/5 bg-neutral-950/70 py-2.5 pl-10 pr-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-violet-400/40"
                />
              </label>
              <label className="flex items-center gap-2 text-neutral-500">
                <Filter size={15} aria-hidden="true" />
                <span className="sr-only">Filtrar categorías</span>
                <select
                  value={itemFilter}
                  onChange={(event) => setItemFilter(event.target.value)}
                  aria-label="Filtrar categorías por insumos"
                  className="min-w-44 rounded-xl border border-white/5 bg-neutral-950/70 px-3 py-2.5 text-xs text-neutral-200 outline-none focus:border-violet-400/40"
                >
                  <option value="all">Todas las categorías</option>
                  <option value="with-items">Con insumos</option>
                  <option value="empty">Sin insumos</option>
                </select>
              </label>
            </div>
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>
                {filteredCategories.length} de {categories.length} categorías
              </span>
              {(search || itemFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setItemFilter("all");
                  }}
                  className="font-medium text-violet-300 hover:text-violet-200"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
            {filteredCategories.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredCategories.map((category) => (
                  <div
                    key={category.id}
                    className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-white/5 bg-neutral-900/40 p-4 transition-colors hover:border-white/10 hover:bg-neutral-900/70"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
                        <Package size={18} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {category.name}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {category.itemCount} insumo
                          {category.itemCount === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(category);
                          setEditingName(category.name);
                          setCategoryError("");
                        }}
                        className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-violet-500/10 hover:text-violet-300"
                        aria-label={`Editar ${category.name}`}
                        title="Editar categoría"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => prepareCategoryDelete(category)}
                        className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-red-500/10 hover:text-red-300"
                        aria-label={`Eliminar ${category.name}`}
                        title="Eliminar categoría"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 px-5 py-12 text-center">
                <p className="text-sm font-medium text-neutral-300">
                  {categories.length === 0
                    ? "Aún no hay categorías de insumos."
                    : "No encontramos categorías con esos filtros."}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {categories.length === 0
                    ? "Crea una categoría para empezar a organizar tus insumos."
                    : "Prueba otra búsqueda o limpia los filtros."}
                </p>
              </div>
            )}
          </section>
        )}
      </div>

      {creatingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <form
            onSubmit={saveCategory}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-inventory-category-title"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-5 shadow-2xl sm:p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                  Categoría de insumos
                </p>
                <h2
                  id="create-inventory-category-title"
                  className="mt-1 text-lg font-semibold text-white"
                >
                  Nueva categoría
                </h2>
                <p className="mt-1 text-xs text-neutral-500">
                  Asigna un nombre para organizar tus insumos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreatingCategory(false);
                  setCategoryError("");
                }}
                disabled={savingCategory}
                aria-label="Cerrar creación"
                className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40"
              >
                <X size={17} />
              </button>
            </div>
            <label
              htmlFor="new-inventory-category"
              className="mb-1.5 block text-xs font-medium text-neutral-300"
            >
              Nombre de la categoría
            </label>
            <input
              id="new-inventory-category"
              autoFocus
              value={name}
              onChange={(event) => {
                setName(upper(event.target.value));
                setCategoryError("");
              }}
              placeholder="Ej. Frutas y verduras"
              maxLength={80}
              required
              className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-violet-400/50"
            />
            {categoryError && (
              <p role="alert" className="mt-2 text-xs text-red-300">
                {categoryError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCreatingCategory(false);
                  setCategoryError("");
                }}
                disabled={savingCategory}
                className="rounded-lg border border-white/10 px-4 py-2.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-white/5 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingCategory || !name.trim()}
                className="rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {savingCategory ? "Creando..." : "Crear categoría"}
              </button>
            </div>
          </form>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <form
            onSubmit={saveCategoryEdit}
            className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-5 shadow-2xl sm:p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                  Categoría de insumos
                </p>
                <h2 className="mt-1 text-lg font-semibold text-white">
                  Cambiar nombre
                </h2>
                <p className="mt-1 text-xs text-neutral-500">
                  Los insumos asociados conservarán esta categoría.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setCategoryError("");
                }}
                disabled={savingCategory}
                aria-label="Cerrar edición"
                className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40"
              >
                <X size={17} />
              </button>
            </div>
            <label
              htmlFor="edit-inventory-category"
              className="mb-1.5 block text-xs font-medium text-neutral-300"
            >
              Nombre de la categoría
            </label>
            <input
              id="edit-inventory-category"
              autoFocus
              value={editingName}
              onChange={(event) => {
                setEditingName(upper(event.target.value));
                setCategoryError("");
              }}
              maxLength={80}
              required
              className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-violet-400/50"
            />
            {categoryError && (
              <p role="alert" className="mt-2 text-xs text-red-300">
                {categoryError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setCategoryError("");
                }}
                disabled={savingCategory}
                className="rounded-lg border border-white/10 px-4 py-2.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-white/5 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  savingCategory ||
                  !editingName.trim() ||
                  upper(editingName) === upper(editing.name)
                }
                className="rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {savingCategory ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </form>
        </div>
      )}

      {categoryDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-neutral-900 p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight text-white">
                  Eliminar categoría
                </h2>
                <p className="mt-1 text-xs text-neutral-400">
                  Esta acción eliminará la categoría y sus insumos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCategoryDeleteConfirm(null)}
                disabled={categoryDeleteLoading}
                className="rounded-lg p-1.5 text-neutral-500 hover:bg-white/10 hover:text-white disabled:opacity-40"
                aria-label="Cerrar confirmación"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mb-5 space-y-4 rounded-xl border border-white/10 bg-neutral-950/50 p-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-red-300">
                  Categoría
                </p>
                <p className="mt-1 text-sm font-black text-white">
                  {categoryDeleteConfirm.category.name}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                  Insumos que se eliminarán (
                  {categoryDeleteConfirm.items.length})
                </p>
                <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                  {categoryDeleteConfirm.items.length === 0 ? (
                    <p className="text-xs text-neutral-500">
                      No hay insumos en esta categoría.
                    </p>
                  ) : (
                    categoryDeleteConfirm.items.map((item) => (
                      <p key={item.id} className="text-xs text-neutral-300">
                        {item.name} · {item.stock} {item.unit}
                      </p>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                  Productos afectados ({categoryDeleteConfirm.products.length})
                </p>
                <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                  {categoryDeleteConfirm.products.length === 0 ? (
                    <p className="text-xs text-emerald-400">
                      Ningún producto usa estos insumos.
                    </p>
                  ) : (
                    categoryDeleteConfirm.products.map((product) => (
                      <p
                        key={product.id}
                        className="text-xs font-bold text-amber-300"
                      >
                        {product.name}
                      </p>
                    ))
                  )}
                </div>
              </div>
            </div>

            <p className="mb-5 text-xs leading-5 text-red-300">
              Los vínculos de esos insumos con los productos también se
              eliminarán. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setCategoryDeleteConfirm(null)}
                disabled={categoryDeleteLoading}
                className="flex-1 rounded-lg border border-white/10 bg-neutral-800 px-4 py-3 text-[10px] font-black uppercase text-neutral-300 hover:bg-neutral-700 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={deleteCategory}
                disabled={categoryDeleteLoading}
                className="flex-1 rounded-lg bg-red-500 px-4 py-3 text-[10px] font-black uppercase text-white hover:bg-red-600 disabled:cursor-wait disabled:opacity-50"
              >
                {categoryDeleteLoading ? "Eliminando..." : "Eliminar todo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
