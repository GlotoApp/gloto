import React, { useEffect, useState } from "react";
import { Edit3, Plus, Trash2, X } from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import { useAuth } from "../../src/components/AuthContext";

const upper = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

export default function InventarioCategorias() {
  const { user } = useAuth();
  const [businessId, setBusinessId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [categoryDeleteConfirm, setCategoryDeleteConfirm] = useState(null);
  const [categoryDeleteLoading, setCategoryDeleteLoading] = useState(false);

  const loadCategories = async (id) => {
    const { data, error } = await supabase
      .from("inventory_categories")
      .select("id,name")
      .eq("business_id", id)
      .order("name");
    if (error) {
      console.error("Error cargando categorías de inventario:", error);
      return;
    }
    setCategories(data || []);
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
      await loadCategories(data.business_id);
      setLoading(false);
    };
    load();
  }, [user?.id]);

  const saveCategory = async (event) => {
    event.preventDefault();
    const categoryName = upper(name);
    if (!businessId || !categoryName) return;

    const response = editing
      ? await supabase
          .from("inventory_categories")
          .update({ name: categoryName })
          .eq("id", editing.id)
          .eq("business_id", businessId)
      : await supabase
          .from("inventory_categories")
          .insert({ business_id: businessId, name: categoryName });

    if (response.error) {
      alert(
        response.error.code === "23505"
          ? "La categoría ya existe."
          : "No se pudo guardar la categoría.",
      );
      return;
    }
    setName("");
    setEditing(null);
    await loadCategories(businessId);
  };

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
        <header className="mb-10 space-y-2">
          <h1 className="text-2xl font-black tracking-tighter">
            Categorías de Inventario
          </h1>
          <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-neutral-500">
            Organiza tus insumos por negocio
          </p>
        </header>
        <form
          onSubmit={saveCategory}
          className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-neutral-900/30 p-4 sm:flex-row"
        >
          <input
            value={name}
            onChange={(event) => setName(upper(event.target.value))}
            placeholder="NOMBRE DE LA CATEGORÍA"
            className="flex-1 rounded-xl border border-white/5 bg-neutral-950 px-4 py-3 text-xs font-bold text-white outline-none focus:border-violet-500/50"
          />
          <button
            type="submit"
            className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-[10px] font-black uppercase text-white hover:bg-violet-500"
          >
            <Plus size={14} /> {editing ? "Actualizar" : "Nueva categoría"}
          </button>
        </form>
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
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between rounded-2xl border border-white/5 bg-neutral-900/40 p-4 transition-all hover:border-white/10 hover:bg-neutral-900/70"
              >
                <span className="text-sm font-black text-white">
                  {category.name}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(category);
                      setName(category.name);
                    }}
                    className="rounded-lg p-2 text-neutral-500 hover:bg-violet-500/10 hover:text-violet-300"
                    aria-label={`Editar ${category.name}`}
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => prepareCategoryDelete(category)}
                    className="rounded-lg p-2 text-neutral-500 hover:bg-red-500/10 hover:text-red-300"
                    aria-label={`Eliminar ${category.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
