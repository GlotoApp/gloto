import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Edit3,
  Trash2,
  X,
  Save,
  ArrowRight,
  AlertTriangle,
  Layers,
  Check,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
  Info,
} from "lucide-react";

const formatCategoryName = (value) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : "";
};

const CategoriasAdmin = ({
  categories,
  categoryRecords = [],
  products = [],
  businessId,
  loading = false,
  onUpdateCategories,
  onDeleteCategoryCascade,
}) => {
  const navigate = useNavigate();
  const [categoriesList, setCategoriesList] = useState([]);

  useEffect(() => {
    const records = categoryRecords.length
      ? categoryRecords
      : categories.map((name, index) => ({ id: index + 1, name }));

    setCategoriesList(
      records.map((cat, index) => ({
        ...cat,
        name: cat.name,
        color:
          index % 8 === 0
            ? "violet"
            : index % 8 === 1
              ? "blue"
              : index % 8 === 2
                ? "emerald"
                : "amber",
      })),
    );
  }, [categories, categoryRecords]);

  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("created");

  const [formData, setFormData] = useState({
    name: "",
    color: "violet",
  });

  const colors = [
    "violet",
    "blue",
    "cyan",
    "emerald",
    "amber",
    "orange",
    "rose",
    "pink",
    "lime",
    "yellow",
    "red",
    "purple",
    "fuchsia",
    "indigo",
    "teal",
    "slate",
  ];

  const colorClasses = {
    violet:
      "bg-violet-500 text-violet-400 border-violet-400/50 shadow-[0_0_14px_rgba(139,92,246,0.6)] bg-opacity-100",
    blue: "bg-blue-500 text-blue-400 border-blue-400/50 shadow-[0_0_14px_rgba(59,130,246,0.6)] bg-opacity-100",
    cyan: "bg-cyan-400 text-cyan-400 border-cyan-300/50 shadow-[0_0_14px_rgba(34,211,238,0.6)] bg-opacity-100",
    emerald:
      "bg-emerald-500 text-emerald-400 border-emerald-400/50 shadow-[0_0_14px_rgba(16,185,129,0.6)] bg-opacity-100",
    amber:
      "bg-amber-500 text-amber-400 border-amber-400/50 shadow-[0_0_14px_rgba(245,158,11,0.6)] bg-opacity-100",
    orange:
      "bg-orange-500 text-orange-400 border-orange-400/50 shadow-[0_0_14px_rgba(249,115,22,0.6)] bg-opacity-100",
    rose: "bg-rose-500 text-rose-400 border-rose-400/50 shadow-[0_0_14px_rgba(244,63,94,0.6)] bg-opacity-100",
    pink: "bg-pink-500 text-pink-400 border-pink-400/50 shadow-[0_0_14px_rgba(236,72,153,0.6)] bg-opacity-100",
    lime: "bg-lime-400 text-lime-400 border-lime-300/50 shadow-[0_0_14px_rgba(163,230,53,0.6)] bg-opacity-100",
    yellow:
      "bg-yellow-400 text-yellow-300 border-yellow-300/50 shadow-[0_0_14px_rgba(250,204,21,0.7)] bg-opacity-100",
    red: "bg-red-500 text-red-400 border-red-400/50 shadow-[0_0_14px_rgba(239,68,68,0.6)] bg-opacity-100",
    purple:
      "bg-purple-600 text-purple-400 border-purple-400/50 shadow-[0_0_14px_rgba(147,51,234,0.6)] bg-opacity-100",
    fuchsia:
      "bg-fuchsia-500 text-fuchsia-400 border-fuchsia-400/50 shadow-[0_0_14px_rgba(217,70,239,0.6)] bg-opacity-100",
    indigo:
      "bg-indigo-500 text-indigo-400 border-indigo-400/50 shadow-[0_0_14px_rgba(99,102,241,0.6)] bg-opacity-100",
    teal: "bg-teal-400 text-teal-300 border-teal-300/50 shadow-[0_0_14px_rgba(45,212,191,0.6)] bg-opacity-100",
    slate:
      "bg-slate-400 text-slate-300 border-slate-300/50 shadow-[0_0_14px_rgba(148,163,184,0.5)] bg-opacity-100",
  };

  const toggleExpand = (id) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedCategories(newExpanded);
  };

  const handleNewCategory = () => {
    setEditingIndex(null);
    setFormData({ name: "", color: "violet" });
    setIsModalOpen(true);
  };

  const handleEditCategory = (index) => {
    setEditingIndex(index);
    setFormData(categoriesList[index]);
    setIsModalOpen(true);
  };

  const handleSaveCategory = () => {
    const categoryName = formatCategoryName(formData.name);
    if (!categoryName) {
      alert("Completa el nombre de la categoría");
      return;
    }

    let updated = [...categoriesList];
    if (editingIndex !== null) {
      updated[editingIndex] = {
        ...updated[editingIndex],
        ...formData,
        name: categoryName,
      };
    } else {
      updated.push({
        id: crypto.randomUUID(),
        business_id: businessId,
        name: categoryName,
        color: formData.color,
      });
    }

    setCategoriesList(updated);
    setIsModalOpen(false);
    onUpdateCategories(updated);
  };

  const handleDeleteCategoryFinal = (index) => {
    const categoryToDelete = categoriesList[index];
    const updated = categoriesList.filter((_, i) => i !== index);

    setCategoriesList(updated);
    setDeleteConfirm(null);

    if (onDeleteCategoryCascade) {
      onDeleteCategoryCascade(categoryToDelete.id);
    }
  };

  const visibleCategories = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return [...categoriesList]
      .filter((category) =>
        category.name.toLowerCase().includes(normalizedSearch),
      )
      .sort((first, second) => {
        const firstCount = products.filter(
          (product) =>
            product.category?.toLowerCase() === first.name?.toLowerCase(),
        ).length;
        const secondCount = products.filter(
          (product) =>
            product.category?.toLowerCase() === second.name?.toLowerCase(),
        ).length;

        if (sortBy === "products-desc") return secondCount - firstCount;
        if (sortBy === "products-asc") return firstCount - secondCount;
        if (sortBy === "name-asc") return first.name.localeCompare(second.name);
        if (sortBy === "name-desc")
          return second.name.localeCompare(first.name);
        return 0;
      });
  }, [categoriesList, products, searchTerm, sortBy]);

  return (
    <div className="min-h-screen bg-background text-neutral-200 p-4 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* HEADER */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-black tracking-tighter">Categorías</h1>

          <header className="px-2 pt-2 pb-5 border-b border-white/5 flex justify-between">
            <div className="space-y-2 flex items-center">
              <div className="flex items-center gap-4 flex-wrap select-none">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-violet-400">
                    {categoriesList.length} Total
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleNewCategory}
              className="px-4 py-2.5 rounded-xl border text-[9px] font-black uppercase tracking-wider active:scale-95 transition-all flex items-center gap-2 bg-white/[0.03] border-white/[0.08] text-white hover:bg-white/[0.08] hover:border-white/[0.15] self-start md:self-auto"
            >
              <Plus size={12} className="text-violet-400" /> Nueva Categoría
            </button>
          </header>
        </div>

        {/* LISTADO DE CATEGORÍAS */}
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-white/5 bg-neutral-900/30 p-4 sm:flex-row">
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar categoría..."
            className="min-w-0 flex-1 rounded-xl border border-white/5 bg-neutral-950/50 px-3 py-2 text-xs text-white outline-none focus:border-violet-500/50"
          />
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            className="rounded-xl border border-white/5 bg-neutral-950/50 px-3 py-2 text-xs text-neutral-300 outline-none focus:border-violet-500/50"
          >
            <option value="created">Orden de creación</option>
            <option value="name-asc">Nombre: A-Z</option>
            <option value="name-desc">Nombre: Z-A</option>
            <option value="products-desc">Más productos</option>
            <option value="products-asc">Menos productos</option>
          </select>
        </div>

        {loading && visibleCategories.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-20">
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="h-2 w-2 animate-pulse rounded-full bg-blue-400"
                style={{ animationDelay: `${dot * 150}ms` }}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 select-none">
            {visibleCategories.map((category) => {
              const associatedProducts = products.filter(
                (p) => p.categoryId === category.id,
              );
              const isExpanded = expandedCategories.has(category.id);
              return (
                <div
                  key={category.id}
                  className={`flex flex-col rounded-2xl border overflow-hidden transition-all duration-150 ${"bg-neutral-900/40 border-white/5"}`}
                >
                  <div className="flex flex-col w-full">
                    {/* FILA PRINCIPAL */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className={`w-3.5 h-3.5 rounded-full border border-white/20 flex-shrink-0 ${
                            colorClasses[category.color].split(" ")[0]
                          } ${colorClasses[category.color].split(" ").slice(3).join(" ")}`}
                        />

                        <div className="min-w-0">
                          <h3 className="font-black text-sm tracking-wide text-neutral-100 truncate">
                            {category.name}
                          </h3>
                          <span className="text-[9px] font-bold  tracking-widest text-neutral-500 block mt-0.5">
                            {associatedProducts.length}{" "}
                            {associatedProducts.length === 1
                              ? "Producto"
                              : "Productos"}
                          </span>
                        </div>
                      </div>

                      <div className="flex w-full sm:w-auto justify-center sm:justify-end items-center gap-2.5 border-t sm:border-t-0 border-white/5 pt-3 sm:pt-0 flex-shrink-0">
                        <button
                          onClick={() => toggleExpand(category.id)}
                          className="px-3 py-1.5 rounded-lg border border-white/5 bg-neutral-950/40 text-[9px] font-black  tracking-wider text-neutral-400 hover:text-white transition-all flex items-center gap-1.5"
                        >
                          <span>
                            {isExpanded ? "Ocultar" : "Ver productos"}
                          </span>
                          {isExpanded ? (
                            <ChevronUp size={12} />
                          ) : (
                            <ChevronDown size={12} />
                          )}
                        </button>

                        <button
                          onClick={() =>
                            handleEditCategory(categoriesList.indexOf(category))
                          }
                          className="p-2 bg-neutral-800 text-neutral-400 rounded-lg hover:bg-neutral-700 hover:text-violet-400 active:scale-95 transition-all border border-white/5"
                          title="Editar Configuración"
                        >
                          <Edit3 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* SUBPANEL DESPLEGABLE DE PRODUCTOS */}
                    {isExpanded && (
                      <div className="px-4 pb-4 bg-black/30 border-t border-white/5 space-y-2 animate-fadeIn">
                        {associatedProducts.length === 0 ? (
                          <p className="text-[10px] text-neutral-600 uppercase font-bold tracking-wider py-2 italic text-center">
                            No hay productos en esta categoría.
                          </p>
                        ) : (
                          <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 mt-2">
                            {associatedProducts.map((prod) => (
                              <button
                                key={prod.id}
                                type="button"
                                onClick={() =>
                                  navigate("/pos/productos", {
                                    state: { productId: prod.id },
                                  })
                                }
                                aria-label={`Editar ${prod.name} en productos`}
                                className="group flex w-full items-center justify-between gap-4 rounded-xl border border-white/[0.05] bg-neutral-900/50 px-4 py-3 text-left transition-all hover:border-violet-500/30 hover:bg-neutral-800/70"
                              >
                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                  <div
                                    className={`h-2 w-2 shrink-0 rounded-full ${
                                      prod.isActive && !prod.isSoldOut
                                        ? "bg-emerald-400 shadow-[0_0_8px_#10b981]"
                                        : "bg-neutral-600"
                                    }`}
                                  />
                                  <span className="truncate text-[10px] font-black  tracking-wide text-neutral-300 group-hover:text-white">
                                    {prod.name}
                                  </span>
                                </div>
                                <div className="flex shrink-0 items-center gap-3">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className={`rounded border px-1.5 py-0.5 text-[8px] font-black uppercase ${
                                        prod.isActive
                                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                                          : "border-slate-500/20 bg-slate-500/10 text-slate-400"
                                      }`}
                                    >
                                      {prod.isActive ? "Activo" : "Archivado"}
                                    </span>
                                    <span
                                      className={`rounded border px-1.5 py-0.5 text-[8px] font-black uppercase ${
                                        prod.isSoldOut
                                          ? "border-red-500/20 bg-red-500/10 text-red-400"
                                          : "border-sky-500/20 bg-sky-500/10 text-sky-400"
                                      }`}
                                    >
                                      {prod.isSoldOut
                                        ? "Agotado"
                                        : "Disponible"}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono font-black text-white bg-black/40 px-2.5 py-0.5 rounded border border-white/5">
                                    ${prod.price?.toLocaleString("es-CO")}
                                  </span>
                                  <ArrowRight
                                    size={14}
                                    className="text-neutral-600 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-400"
                                    aria-hidden="true"
                                  />
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* MODAL AJUSTES GIGANTE */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/95 backdrop-blur-2xl overflow-y-auto">
            <div className="bg-gradient-to-b from-neutral-800 to-neutral-900 border border-violet-500/20 w-full max-w-5xl rounded-3xl overflow-hidden flex flex-col shadow-2xl shadow-violet-500/10 max-h-[95vh]">
              {/* Header Modal */}
              <div className="relative overflow-hidden flex-shrink-0">
                <div className="absolute inset-0 bg-gradient-to-r from-violet-600/20 via-purple-600/10 to-transparent"></div>
                <div className="relative px-6 py-6 flex justify-between items-start gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-1 rounded-xl flex-shrink-0">
                      <Layers className="w-6 h-6 text-violet-400" />
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white leading-tight">
                      {editingIndex !== null
                        ? "Editar Configuración"
                        : "Crear Nueva"}{" "}
                      Categoría
                    </h2>
                  </div>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="p-2 hover:bg-white/10 rounded-xl transition-all text-neutral-400 hover:text-white"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent"></div>
              </div>

              {/* Contenido Modular */}
              <div
                className="flex flex-col md:flex-row gap-6 md:gap-8 p-6 md:p-8 overflow-y-auto"
                style={{ maxHeight: "calc(95vh - 160px)" }}
              >
                {/* Panel Izquierdo PREVISUALIZACIÓN */}
                <div className="w-full md:w-2/5 flex flex-col gap-6 flex-shrink-0">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-violet-400" />
                      <label className="text-[9px] sm:text-[10px] font-black uppercase text-violet-400 tracking-widest">
                        Previsualización Led
                      </label>
                    </div>
                    <div className="relative rounded-2xl border border-white/5 bg-gradient-to-br from-neutral-900 to-neutral-850 aspect-video md:aspect-square flex flex-col items-center justify-center p-4 text-center shadow-2xl">
                      <div
                        className={`w-16 h-16 rounded-full border-2 border-white/30 mb-4 transition-all duration-300 ${
                          colorClasses[formData.color].split(" ")[0]
                        } ${colorClasses[formData.color].split(" ").slice(3).join(" ")}`}
                      />
                      <span className="text-xs font-black uppercase tracking-widest text-white truncate max-w-full px-2">
                        {formData.name || "Nombre de categoría"}
                      </span>
                      <span className="text-[8px] font-bold uppercase tracking-widest text-neutral-500 mt-1">
                        Color Técnico: {formData.color}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Panel Derecho REJILLA DE COLORES SELECCIONABLES */}
                <div className="flex-1 flex flex-col gap-5 min-w-0">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-violet-400" />
                      <label className="text-[9px] sm:text-[10px] font-black uppercase text-violet-400 tracking-widest">
                        Nombre de categoría
                      </label>
                    </div>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="w-full bg-gradient-to-r from-neutral-700/30 to-neutral-800/30 border border-neutral-600/50 focus:border-violet-500/50 rounded-xl py-3.5 px-4 text-xs font-bold uppercase tracking-widest text-white focus:outline-none transition-all placeholder:text-neutral-700"
                      placeholder="EJ: BARRA CAFE / FRITURAS"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-violet-400" />
                      <label className="text-[9px] sm:text-[10px] font-black uppercase text-neutral-400 tracking-wider">
                        Paleta de Color Técnico asignada
                      </label>
                    </div>
                    <div className="grid grid-cols-8 gap-2 bg-black/40 p-3 rounded-xl border border-white/5">
                      {colors.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setFormData({ ...formData, color })}
                          className={`h-9 rounded-lg border transition-all flex items-center justify-center ${
                            formData.color === color
                              ? "border-white scale-[1.03]"
                              : "border-transparent opacity-40 hover:opacity-100"
                          } ${colorClasses[color].split(" ")[0]} ${
                            colorClasses[color].split(" ")[1]
                          } ${colorClasses[color].split(" ").slice(3).join(" ")}`}
                        >
                          {formData.color === color && (
                            <Check
                              size={16}
                              className="text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Modal */}
              <div className="border-t border-violet-500/10 bg-gradient-to-t from-neutral-900/80 to-transparent px-6 py-4 flex gap-3 justify-end flex-wrap flex-shrink-0">
                {editingIndex !== null && (
                  <button
                    onClick={() => {
                      setDeleteConfirm(editingIndex);
                      setIsModalOpen(false);
                    }}
                    className="px-4 py-2.5 bg-gradient-to-r from-red-500/20 to-red-600/20 border border-red-500/50 text-red-400 hover:border-red-500 rounded-xl font-black uppercase text-[10px] tracking-wider transition-all flex items-center gap-1.5 mr-auto shadow-lg shadow-red-500/10"
                  >
                    <Trash2 size={14} /> Eliminar
                  </button>
                )}

                <button
                  onClick={handleSaveCategory}
                  className="px-6 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-black uppercase text-[10px] tracking-[0.15em] flex items-center gap-2 hover:from-violet-600 transition-all shadow-xl shadow-violet-500/20 active:scale-95"
                >
                  <Save size={14} /> Guardar Cambios
                </button>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 bg-neutral-700/50 border border-neutral-600/50 text-neutral-300 rounded-xl font-black uppercase text-[10px] tracking-wider hover:bg-neutral-700 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL ADVERTENCIA ELIMINAR EN CASCADA */}
        {deleteConfirm !== null &&
          (() => {
            const catObj = categoriesList[deleteConfirm];
            const associatedProds = products.filter(
              (p) => p.categoryId === catObj?.id,
            );

            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
                <div className="bg-neutral-900 border border-red-500/30 w-full max-w-md rounded-3xl p-6 shadow-2xl">
                  <div className="flex items-center gap-3 mb-4 border-b border-white/5 pb-3">
                    <AlertTriangle className="text-red-500" size={24} />
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight text-white">
                        Eliminación en Cascada
                      </h3>
                      <p className="text-[9px] text-red-400 font-bold uppercase tracking-widest">
                        Acción de alto riesgo
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-neutral-400 mb-4 uppercase tracking-wide leading-relaxed">
                    ¿Estás seguro de borrar la categoría{" "}
                    <span className="text-red-400 font-black">
                      "{catObj?.name}"
                    </span>
                    ? Esta acción destruirá de manera irreversible los
                    siguientes productos ({associatedProds.length}):
                  </p>

                  <div className="bg-black/40 border border-red-500/10 rounded-xl p-3 mb-5 max-h-32 overflow-y-auto space-y-1">
                    {associatedProds.length === 0 ? (
                      <div className="text-[9px] text-neutral-500 uppercase font-bold py-1 italic">
                        Ningún producto se verá afectado.
                      </div>
                    ) : (
                      associatedProds.map((p) => (
                        <div
                          key={p.id}
                          className="text-[9px] uppercase font-bold bg-red-500/5 text-neutral-400 py-1.5 px-2 rounded-lg border border-red-500/10 flex justify-between"
                        >
                          <span className="truncate max-w-[200px]">
                            {p.name}
                          </span>
                          <span className="font-mono text-red-400/80">
                            ${p.price}
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleDeleteCategoryFinal(deleteConfirm)}
                      className="flex-1 bg-red-500 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                    >
                      Eliminar Todo
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="flex-1 bg-neutral-800 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest border border-white/10 hover:border-white/20 transition-all text-neutral-400"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
      </div>
    </div>
  );
};

export default CategoriasAdmin;
