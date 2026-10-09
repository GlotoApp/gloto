import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import SubLoading from "./SubLoading";
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
  GripVertical,
  Search,
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
      [...records]
        .sort(
          (first, second) =>
            Number(first.order_index || 0) - Number(second.order_index || 0) ||
            String(first.created_at || "").localeCompare(
              String(second.created_at || ""),
            ),
        )
        .map((cat, index) => ({
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
  const [sortBy, setSortBy] = useState("order");
  const [draggedCategoryId, setDraggedCategoryId] = useState(null);
  const [dropTargetCategoryId, setDropTargetCategoryId] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const categoryDragRef = useRef(null);

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

  const handleSaveCategory = async () => {
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
        order_index:
          Math.max(
            -1,
            ...categoriesList.map((category) =>
              Number(category.order_index ?? 0),
            ),
          ) + 1,
      });
    }

    const saved = await onUpdateCategories(updated);
    if (saved === false) return;
    setCategoriesList(updated);
    setIsModalOpen(false);
  };

  const handleCategoryDragStart = (event, categoryId) => {
    if (sortBy !== "order" || searchTerm.trim() || savingOrder) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    categoryDragRef.current = {
      categoryId,
      pointerId: event.pointerId,
      original: categoriesList,
      order: categoriesList,
    };
    setDraggedCategoryId(categoryId);
    setDropTargetCategoryId(null);
  };

  const handleCategoryDragMove = (event) => {
    const drag = categoryDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest("[data-category-id]");
    const targetId = target?.getAttribute("data-category-id");
    if (!targetId || targetId === drag.categoryId) {
      setDropTargetCategoryId(null);
      return;
    }
    setDropTargetCategoryId(targetId);

    const sourceIndex = drag.order.findIndex(
      (category) => category.id === drag.categoryId,
    );
    const targetIndex = drag.order.findIndex(
      (category) => String(category.id) === targetId,
    );
    if (sourceIndex < 0 || targetIndex < 0) return;

    const nextOrder = [...drag.order];
    const [movingCategory] = nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, movingCategory);
    drag.order = nextOrder;
    setCategoriesList(nextOrder);
  };

  const handleCategoryDragEnd = async (event) => {
    const drag = categoryDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    categoryDragRef.current = null;
    setDraggedCategoryId(null);
    setDropTargetCategoryId(null);

    if (
      drag.order.every(
        (category, index) => category.id === drag.original[index]?.id,
      )
    ) {
      return;
    }

    const orderedCategories = drag.order.map((category, index) => ({
      ...category,
      order_index: index,
    }));
    setSavingOrder(true);
    const saved = await onUpdateCategories(orderedCategories);
    setCategoriesList(saved === false ? drag.original : orderedCategories);
    setSavingOrder(false);
  };

  const handleCategoryDragCancel = (event) => {
    const drag = categoryDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    categoryDragRef.current = null;
    setDraggedCategoryId(null);
    setDropTargetCategoryId(null);
    setCategoriesList(drag.original);
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
        if (sortBy === "created")
          return String(first.created_at || "").localeCompare(
            String(second.created_at || ""),
          );
        if (sortBy === "order")
          return (
            Number(first.order_index || 0) -
              Number(second.order_index || 0) ||
            String(first.created_at || "").localeCompare(
              String(second.created_at || ""),
            )
          );
        return 0;
      });
  }, [categoriesList, products, searchTerm, sortBy]);

  return (
    <div className="min-h-screen bg-background text-neutral-200 p-4 font-sans">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-sans text-2xl font-black tracking-tighter text-white">
              Categorías
            </h1>
          </div>
          <button
            type="button"
            onClick={handleNewCategory}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-violet-200 transition-colors hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
          >
            <Plus size={14} /> Nueva categoría
          </button>
        </header>

        <div className="grid gap-3 rounded-2xl bg-neutral-900/30 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)]">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="ml-1 text-[8px] font-black uppercase tracking-widest text-neutral-600">
              Buscar
            </span>
            <span className="group relative block">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-500/50 transition-colors group-hover:text-violet-500"
              />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar categoría..."
                className="w-full rounded-xl bg-neutral-900 py-2.5 pl-9 pr-3 text-[10px] font-mono uppercase text-neutral-300 outline-none transition-all placeholder:text-neutral-600 focus:ring-2 focus:ring-violet-500/40"
              />
            </span>
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="ml-1 text-[8px] font-black uppercase tracking-widest text-neutral-600">
              Ordenar por
            </span>
            <span className="group relative block">
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                className="w-full cursor-pointer appearance-none rounded-xl bg-neutral-900 py-2.5 pl-3 pr-9 text-[10px] font-mono uppercase text-neutral-300 outline-none transition-all focus:ring-2 focus:ring-violet-500/40"
              >
                <option value="order">Orden personalizado</option>
                <option value="created">Orden de creación</option>
                <option value="name-asc">Nombre: A-Z</option>
                <option value="name-desc">Nombre: Z-A</option>
                <option value="products-desc">Más productos</option>
                <option value="products-asc">Menos productos</option>
              </select>
              <ChevronDown
                size={12}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600"
              />
            </span>
          </label>
        </div>

        {sortBy === "order" && !searchTerm.trim() && (
          <AnimatePresence mode="wait">
            <motion.div
              key={draggedCategoryId || "drag-hint"}
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className={`flex items-center gap-2 py-1 text-[10px] font-semibold ${
                draggedCategoryId
                  ? "text-violet-200"
                  : "text-neutral-400"
              }`}
              role="status"
              aria-live="polite"
            >
              <GripVertical
                size={14}
                className={
                  draggedCategoryId
                    ? "animate-pulse text-violet-300"
                    : "text-violet-400"
                }
              />
              {draggedCategoryId
                ? `Moviendo ${
                    categoriesList.find(
                      (category) => category.id === draggedCategoryId,
                    )?.name || "categoría"
                  } · suelta para guardar`
                : "Mantén presionado el asa de puntos y arrastra la categoría hasta la posición que quieras. Suelta para guardar el nuevo orden."}
            </motion.div>
          </AnimatePresence>
        )}

        {loading && visibleCategories.length === 0 ? (
          <SubLoading
            label="Cargando categorías"
            className="py-20"
            dotClassName="bg-violet-400"
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 select-none">
            {visibleCategories.map((category) => {
              const associatedProducts = products.filter(
                (p) => p.categoryId === category.id,
              );
              const isExpanded = expandedCategories.has(category.id);
              return (
                <motion.div
                  key={category.id}
                  data-category-id={category.id}
                  layout="position"
                  initial={false}
                  animate={{
                    scale: draggedCategoryId === category.id ? 1.025 : 1,
                    rotate: draggedCategoryId === category.id ? -0.6 : 0,
                    opacity: draggedCategoryId === category.id ? 0.96 : 1,
                    boxShadow:
                      draggedCategoryId === category.id
                        ? "0 18px 45px rgba(124, 58, 237, 0.28)"
                        : "0 0px 0px rgba(0, 0, 0, 0)",
                  }}
                  transition={{
                    layout: { type: "spring", stiffness: 420, damping: 34 },
                    scale: { type: "spring", stiffness: 420, damping: 24 },
                    rotate: { type: "spring", stiffness: 420, damping: 24 },
                    opacity: { duration: 0.16 },
                    boxShadow: { duration: 0.16 },
                  }}
                  className={`relative flex flex-col overflow-hidden rounded-2xl border transition-colors duration-200 ${
                    draggedCategoryId === category.id
                      ? "z-10 border-violet-300/70 bg-neutral-800 ring-2 ring-violet-400/30"
                      : dropTargetCategoryId === String(category.id)
                        ? "border-violet-400/60 bg-violet-500/[0.08] ring-1 ring-violet-400/30"
                        : "border-white/5 bg-neutral-900/40 hover:border-white/10"
                  }`}
                >
                  <div className="flex flex-col w-full">
                    {/* FILA PRINCIPAL */}
                    <div className="flex w-full flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <button
                          type="button"
                          disabled={
                            sortBy !== "order" ||
                            Boolean(searchTerm.trim()) ||
                            savingOrder
                          }
                          onPointerDown={(event) =>
                            handleCategoryDragStart(event, category.id)
                          }
                          onPointerMove={handleCategoryDragMove}
                          onPointerUp={handleCategoryDragEnd}
                          onPointerCancel={handleCategoryDragCancel}
                          className={`inline-flex h-9 w-9 shrink-0 touch-none cursor-grab items-center justify-center rounded-xl transition-all active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 disabled:cursor-not-allowed disabled:opacity-30 ${
                            draggedCategoryId === category.id
                                  ? "scale-105 bg-violet-500/15 text-violet-200 shadow-md shadow-violet-950/30"
                                  : "bg-neutral-950/60 text-neutral-400 hover:bg-violet-500/10 hover:text-violet-200"
                          }`}
                          title="Mantén y arrastra para ordenar"
                          aria-label={`Arrastrar ${category.name} para cambiar su orden`}
                        >
                          <GripVertical
                            size={16}
                            className={
                              draggedCategoryId === category.id
                                ? "animate-pulse"
                                : ""
                            }
                          />
                        </button>
                        <div
                          className={`h-3.5 w-3.5 shrink-0 rounded-full ring-4 ring-white/[0.03] ${
                            colorClasses[category.color].split(" ")[0]
                          } ${colorClasses[category.color].split(" ").slice(3).join(" ")}`}
                        />

                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-sans text-sm font-bold tracking-wide text-white">
                            {category.name}
                          </h3>
                          <span className="mt-1 inline-flex items-center gap-1.5 px-0.5 py-0.5 text-[9px] font-medium text-neutral-400">
                            <ShoppingBag
                              size={11}
                              className="text-violet-300"
                              aria-hidden="true"
                            />
                            {associatedProducts.length}{" "}
                            {associatedProducts.length === 1
                              ? "Producto"
                              : "Productos"}
                          </span>
                        </div>
                      </div>

                      <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
                        <button
                          type="button"
                          onClick={() => toggleExpand(category.id)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-violet-500/10 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-violet-200 transition-colors hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
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
                          type="button"
                          onClick={() =>
                            handleEditCategory(categoriesList.indexOf(category))
                          }
                          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-xl bg-neutral-950/60 text-neutral-300 transition-colors hover:bg-violet-500/10 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
                          title="Editar categoría"
                          aria-label={`Editar categoría ${category.name}`}
                        >
                          <Edit3 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* SUBPANEL DESPLEGABLE DE PRODUCTOS */}
                    {isExpanded && (
                      <div className="space-y-2 bg-black/20 px-4 pb-4 animate-fadeIn">
                        {associatedProducts.length === 0 ? (
                          <p className="py-3 text-center text-xs text-neutral-400">
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
                                className="group flex min-h-12 w-full items-center justify-between gap-4 rounded-xl bg-neutral-900/50 px-3 py-2.5 text-left transition-colors hover:bg-neutral-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
                              >
                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                  <div
                                    className={`h-2 w-2 shrink-0 rounded-full ${
                                      prod.isActive && !prod.isSoldOut
                                        ? "bg-emerald-400 shadow-[0_0_8px_#10b981]"
                                        : "bg-neutral-600"
                                    }`}
                                  />
                                  <span className="truncate text-xs font-semibold tracking-wide text-neutral-200 group-hover:text-white">
                                    {prod.name}
                                  </span>
                                </div>
                                <div className="flex shrink-0 items-center gap-3">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className={`rounded px-1.5 py-0.5 text-[8px] font-black uppercase ${
                                        prod.isActive
                                          ? "bg-emerald-500/10 text-emerald-400"
                                          : "bg-slate-500/10 text-slate-400"
                                      }`}
                                    >
                                      {prod.isActive ? "Activo" : "Archivado"}
                                    </span>
                                    <span
                                      className={`rounded px-1.5 py-0.5 text-[8px] font-black uppercase ${
                                        prod.isSoldOut
                                          ? "bg-red-500/10 text-red-400"
                                          : "bg-sky-500/10 text-sky-400"
                                      }`}
                                    >
                                      {prod.isSoldOut
                                        ? "Agotado"
                                        : "Disponible"}
                                    </span>
                                  </div>
                                  <span className="rounded bg-black/30 px-2 py-0.5 text-[10px] font-mono font-bold text-white">
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
                </motion.div>
              );
            })}
          </div>
        )}

        {/* MODAL AJUSTES GIGANTE */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-2 backdrop-blur-sm sm:p-4">
            <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl">
              {/* Header Modal */}
              <div className="shrink-0 border-b border-white/10">
                <div className="flex items-start justify-between gap-4 px-4 py-4 sm:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="shrink-0 rounded-xl bg-violet-500/10 p-2">
                      <Layers className="h-5 w-5 text-violet-300" />
                    </div>
                    <h2 className="font-sans text-lg font-bold text-white sm:text-xl">
                      {editingIndex !== null
                        ? "Editar Configuración"
                        : "Crear Nueva"}{" "}
                      Categoría
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    aria-label="Cerrar"
                    className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Contenido Modular */}
              <div
                className="flex flex-col gap-6 overflow-y-auto p-4 md:flex-row md:gap-8 md:p-6"
                style={{ maxHeight: "calc(95vh - 160px)" }}
              >
                {/* Panel Izquierdo PREVISUALIZACIÓN */}
                <div className="flex w-full shrink-0 flex-col gap-6 md:w-2/5">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-violet-400" />
                      <label className="text-[8px] font-black uppercase tracking-widest text-neutral-400 sm:text-[9px]">
                        Previsualización
                      </label>
                    </div>
                    <div className="relative flex aspect-video flex-col items-center justify-center rounded-2xl border border-white/5 bg-neutral-950 p-4 text-center md:aspect-square">
                      <div
                        className={`w-16 h-16 rounded-full border-2 border-white/30 mb-4 transition-all duration-300 ${
                          colorClasses[formData.color].split(" ")[0]
                        } ${colorClasses[formData.color].split(" ").slice(3).join(" ")}`}
                      />
                      <span className="max-w-full truncate px-2 text-xs font-bold uppercase tracking-widest text-white">
                        {formData.name || "Nombre de categoría"}
                      </span>
                      <span className="mt-1 text-[9px] font-semibold uppercase tracking-widest text-neutral-400">
                        Color: {formData.color}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Panel Derecho REJILLA DE COLORES SELECCIONABLES */}
                <div className="flex min-w-0 flex-1 flex-col gap-5">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-violet-400" />
                      <label className="text-[8px] font-black uppercase tracking-widest text-neutral-400 sm:text-[9px]">
                        Nombre de categoría
                      </label>
                    </div>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="w-full rounded-xl border border-white/5 bg-neutral-950 px-3 py-2.5 text-[10px] font-mono uppercase text-neutral-200 outline-none transition-all placeholder:text-neutral-600 focus:border-violet-500/40"
                      placeholder="EJ: BARRA CAFE / FRITURAS"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-violet-400" />
                      <label className="text-[8px] font-black uppercase tracking-widest text-neutral-400 sm:text-[9px]">
                        Color de categoría
                      </label>
                    </div>
                    <div className="grid grid-cols-4 gap-2 rounded-xl border border-white/5 bg-neutral-950 p-3 sm:grid-cols-8">
                      {colors.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setFormData({ ...formData, color })}
                          aria-label={`Seleccionar color ${color}`}
                          aria-pressed={formData.color === color}
                          className={`h-9 rounded-lg border transition-all flex items-center justify-center ${
                            formData.color === color
                              ? "scale-[1.03] border-white"
                              : "border-transparent opacity-70 hover:opacity-100"
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
              <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-white/10 bg-neutral-900 px-4 py-4 sm:px-6">
                {editingIndex !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteConfirm(editingIndex);
                      setIsModalOpen(false);
                    }}
                    className="mr-auto inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-red-300 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
                  >
                    <Trash2 size={14} /> Eliminar
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSaveCategory}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet-600 px-5 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
                >
                  <Save size={14} /> Guardar Cambios
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="min-h-10 rounded-xl border border-white/10 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-300 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
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
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
                <div className="w-full max-w-md rounded-2xl border border-red-500/25 bg-neutral-900 p-5 shadow-2xl sm:p-6">
                  <div className="mb-4 flex items-center gap-3 border-b border-white/10 pb-3">
                    <AlertTriangle className="shrink-0 text-red-300" size={22} />
                    <div>
                      <h3 className="font-sans text-lg font-bold text-white">
                        Eliminación en Cascada
                      </h3>
                      <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-red-300">
                        Acción de alto riesgo
                      </p>
                    </div>
                  </div>

                  <p className="mb-4 text-sm leading-relaxed text-neutral-300">
                    ¿Estás seguro de borrar la categoría{" "}
                    <span className="font-bold text-red-300">
                      "{catObj?.name}"
                    </span>
                    ? Esta acción destruirá de manera irreversible los
                    siguientes productos ({associatedProds.length}):
                  </p>

                  <div className="mb-5 max-h-32 space-y-1 overflow-y-auto rounded-xl border border-red-500/10 bg-black/30 p-3">
                    {associatedProds.length === 0 ? (
                      <div className="py-1 text-xs text-neutral-400">
                        Ningún producto se verá afectado.
                      </div>
                    ) : (
                      associatedProds.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-red-500/10 bg-red-500/5 px-2 py-1.5 text-[10px] font-semibold text-neutral-300"
                        >
                          <span className="truncate max-w-[200px]">
                            {p.name}
                          </span>
                          <span className="shrink-0 font-mono text-red-300">
                            ${p.price}
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex flex-col-reverse gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => handleDeleteCategoryFinal(deleteConfirm)}
                      className="min-h-10 flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
                    >
                      Eliminar Todo
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(null)}
                      className="min-h-10 flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-neutral-300 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
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
