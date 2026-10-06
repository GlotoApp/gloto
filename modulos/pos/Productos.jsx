import React, { useState, useMemo, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  Plus,
  Search,
  Edit3,
  Trash2,
  Image as ImageIcon,
  EyeOff,
  Eye,
  Filter,
  CheckCircle2,
  X,
  Save,
  LayoutGrid,
  List,
  Camera,
  Tag,
  AlertTriangle,
  Archive,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
} from "lucide-react";
import Categorias from "./Categorias";
import defaultImg from "../../public/default.png";
import {
  removeStorageObjectIfUnused,
  supabase,
} from "../../src/lib/supabaseClient";
import { useAuth } from "../../src/components/AuthContext";
import ImageCropEditor from "./ImageCropEditor";
import SubLoading from "./SubLoading";

const formatSentenceText = (value) => {
  const text = String(value ?? "").toLowerCase();
  return text.replace(
    /(^\s*|[.!?]\s+)(\S)/g,
    (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`,
  );
};

const formatStoredText = (value) =>
  formatSentenceText(String(value ?? "").trim());

const formatProductName = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(
      /(^|\s)(\S)/g,
      (_, separator, letter) => `${separator}${letter.toUpperCase()}`,
    );

const formatProductNameForStorage = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(
      /(^|\s)(\S)/g,
      (_, separator, letter) => `${separator}${letter.toUpperCase()}`,
    );

const formatStockQuantity = (value) =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(
    Number(value) || 0,
  );

const isProductLowStock = (product) =>
  Number(product.stock) > 0 &&
  Number(product.minStock) > 0 &&
  Number(product.stock) <= Number(product.minStock);

const formatSentenceInput = (value) => {
  return formatSentenceText(value);
};

const getCatalogCacheKey = (businessId) =>
  `productos-catalog-cache-${businessId}`;

const readCatalogCache = (businessId) => {
  try {
    const cached = localStorage.getItem(getCatalogCacheKey(businessId));
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.warn("No se pudo leer el caché del catálogo:", error);
    return null;
  }
};

const writeCatalogCache = (businessId, catalog) => {
  try {
    localStorage.setItem(
      getCatalogCacheKey(businessId),
      JSON.stringify(catalog),
    );
  } catch (error) {
    console.warn("No se pudo guardar el caché del catálogo:", error);
  }
};

const handleImageError = (e) => {
  e.target.onerror = null; // Previene bucles infinitos si la imagen por defecto también falla
  e.target.src = defaultImg;
};

const Productos = ({ section = "productos" }) => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // ========== ESTADO COMPARTIDO ==========
  const [categories, setCategories] = useState([]);
  const [categoryRecords, setCategoryRecords] = useState([]);
  const [units, setUnits] = useState([]);
  const [businessId, setBusinessId] = useState(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [savingProduct, setSavingProduct] = useState(false);
  const [quickCategoryOpen, setQuickCategoryOpen] = useState(false);
  const [quickCategoryName, setQuickCategoryName] = useState("");
  const [savingQuickCategory, setSavingQuickCategory] = useState(false);
  const [updatingStockIds, setUpdatingStockIds] = useState(new Set());

  const handleUpdateCategories = async (newCategories) => {
    const records = newCategories.map((category) => ({
      id: category.id,
      business_id: category.business_id || businessId,
      name: category.name,
    }));
    setCategoryRecords(records);
    setCategories(records.map((category) => category.name));
    const { error } = await supabase.from("categories_shop").upsert(records);
    if (error) console.error("Error guardando categorías:", error);
  };

  const handleQuickCategoryCreate = async () => {
    const name = formatProductNameForStorage(quickCategoryName);
    if (!businessId || !name) {
      alert("Escribe el nombre de la categoría.");
      return;
    }

    const existingCategory = categoryRecords.find(
      (category) => category.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (existingCategory) {
      setFormData((current) => ({
        ...current,
        categoryId: existingCategory.id,
        category: existingCategory.name,
      }));
      setQuickCategoryName("");
      setQuickCategoryOpen(false);
      return;
    }

    setSavingQuickCategory(true);
    const { data, error } = await supabase
      .from("categories_shop")
      .insert({ business_id: businessId, name })
      .select("id,business_id,name")
      .single();

    if (error) {
      console.error("Error creando categoría rápida:", error);
      alert(
        error.code === "23505"
          ? "Ya existe una categoría con ese nombre."
          : "No se pudo crear la categoría. Intenta nuevamente.",
      );
      setSavingQuickCategory(false);
      return;
    }

    const nextCategoryRecords = [...categoryRecords, data].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    setCategoryRecords(nextCategoryRecords);
    setCategories(nextCategoryRecords.map((category) => category.name));
    setFormData((current) => ({
      ...current,
      categoryId: data.id,
      category: data.name,
    }));
    const cachedCatalog = readCatalogCache(businessId);
    if (cachedCatalog) {
      writeCatalogCache(businessId, {
        ...cachedCatalog,
        categories: nextCategoryRecords.map((category) => category.name),
        categoryRecords: nextCategoryRecords,
      });
    }
    setQuickCategoryName("");
    setQuickCategoryOpen(false);
    setSavingQuickCategory(false);
  };

  // ======= NUEVA FUNCIÓN AGREGADA PARA LA ELIMINACIÓN EN CASCADA =======
  const handleDeleteCategoryCascade = async (categoryId) => {
    const category = categoryRecords.find((item) => item.id === categoryId);
    const { data: categoryProducts, error: productsError } = await supabase
      .from("products")
      .select("id,image_url")
      .eq("category_id", categoryId)
      .eq("business_id", businessId);

    if (productsError) {
      console.error(
        "Error consultando productos de la categoría:",
        productsError,
      );
      alert("No se pudieron consultar los productos de la categoría");
      return;
    }

    const productIds = (categoryProducts || []).map((product) => product.id);
    if (productIds.length > 0) {
      const { error: deleteProductsError } = await supabase
        .from("products")
        .delete()
        .in("id", productIds)
        .eq("business_id", businessId);

      if (deleteProductsError) {
        console.error(
          "Error eliminando productos de la categoría:",
          deleteProductsError,
        );
        alert("No se pudieron eliminar los productos de la categoría");
        return;
      }

      await Promise.all(
        (categoryProducts || []).map((product) =>
          removeStorageObjectIfUnused(
            "business-assets",
            product.image_url,
          ).catch((cleanupError) =>
            console.warn(
              "No se pudo limpiar imagen de producto:",
              cleanupError,
            ),
          ),
        ),
      );
    }

    const { error: categoryError } = await supabase
      .from("categories_shop")
      .delete()
      .eq("id", categoryId)
      .eq("business_id", businessId);

    if (categoryError) {
      console.error("Error eliminando categoría:", categoryError);
      alert("No se pudo eliminar la categoría");
      return;
    }

    setProducts((current) =>
      current.filter((product) => product.categoryId !== categoryId),
    );
    setCategoryRecords((current) =>
      current.filter((item) => item.id !== categoryId),
    );
    setCategories((current) =>
      current.filter((categoryName) => categoryName !== category?.name),
    );
    return true;
  };

  // ========== ESTADO PARA PRODUCTOS ==========arepasim
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("todos");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [editingId, setEditingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkPermanentDeleteConfirm, setBulkPermanentDeleteConfirm] =
    useState(false);
  const [sortBy, setSortBy] = useState("order");
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [bulkActionsOpen, setBulkActionsOpen] = useState(false);

  // Estado del formulario
  const [formData, setFormData] = useState({
    name: "",
    categoryId: "",
    category: "",
    price: "",
    description: "",
    stock: 0,
    minStock: 0,
    unitId: "",
    image: "",
  });
  const [initialProductFormSnapshot, setInitialProductFormSnapshot] =
    useState(null);
  const [imageEditor, setImageEditor] = useState(null);
  const [imageEditorError, setImageEditorError] = useState("");
  const [optionGroups, setOptionGroups] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [expandedOptionGroups, setExpandedOptionGroups] = useState(new Set());
  const [availableIngredients, setAvailableIngredients] = useState([]);
  const [selectedIngredients, setSelectedIngredients] = useState([]);
  const [expandedIngredientCategories, setExpandedIngredientCategories] =
    useState(new Set());
  const [inventoryCategories, setInventoryCategories] = useState([]);
  const [quickInventoryForm, setQuickInventoryForm] = useState(null);
  const [quickInventoryCategoryLocked, setQuickInventoryCategoryLocked] =
    useState(false);
  const [quickInventoryCategoryName, setQuickInventoryCategoryName] =
    useState("");
  const [quickInventoryItem, setQuickInventoryItem] = useState({
    name: "",
    categoryId: "",
    unit: "",
    stock: "",
  });
  const [savingQuickInventory, setSavingQuickInventory] = useState(false);
  const [quickInventoryError, setQuickInventoryError] = useState("");

  // Estado inicial del catálogo
  const [products, setProducts] = useState([]);

  useEffect(
    () => () => {
      if (imageEditor?.url) URL.revokeObjectURL(imageEditor.url);
    },
    [imageEditor?.url],
  );

  const mapProduct = (product, categoryMap) => ({
    ...product,
    categoryId: product.category_id || "",
    category: categoryMap[product.category_id] || "Sin categoría",
    price: Number(product.price || 0),
    stock: Number(product.stock || 0),
    minStock: Number(product.min_stock || 0),
    orderIndex: Number(product.order_index || 0),
    isActive: product.is_active !== false && product.is_active !== "false",
    isSoldOut: product.is_sold_out === true || product.is_sold_out === "true",
    image: product.image_url || "",
    unitId: product.unit_id || "",
  });

  useEffect(() => {
    const loadProducts = async () => {
      if (!user?.id) {
        setProducts([]);
        setLoadingProducts(false);
        return;
      }

      setLoadingProducts(true);
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || !profile?.business_id) {
        setProducts([]);
        setLoadingProducts(false);
        return;
      }
      setBusinessId(profile.business_id);

      const cachedCatalog = readCatalogCache(profile.business_id);
      if (
        Array.isArray(cachedCatalog?.categories) &&
        Array.isArray(cachedCatalog?.products)
      ) {
        setCategoryRecords(cachedCatalog.categoryRecords || []);
        setCategories(cachedCatalog.categories);
        setProducts(cachedCatalog.products);
        setAvailableIngredients(cachedCatalog.ingredients || []);
        setInventoryCategories(cachedCatalog.inventoryCategories || []);
        setLoadingProducts(false);
      }

      const [
        { data: categoriesData },
        { data: productsData, error },
        { data: ingredientsData, error: ingredientsError },
        { data: ingredientCategoriesData, error: ingredientCategoriesError },
        { data: unitsData, error: unitsError },
      ] = await Promise.all([
        supabase
          .from("categories_shop")
          .select("id, business_id, name")
          .eq("business_id", profile.business_id),
        supabase
          .from("products")
          .select("*")
          .eq("business_id", profile.business_id)
          .order("order_index", { ascending: true }),
        supabase
          .from("inventory_items")
          .select("id, name, unit, stock, category_id")
          .eq("business_id", profile.business_id)
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("inventory_categories")
          .select("id, name")
          .eq("business_id", profile.business_id)
          .order("name", { ascending: true }),
        supabase
          .from("units")
          .select("id,name,description,allows_fraction,is_active")
          .eq("is_active", true)
          .order("name", { ascending: true }),
      ]);

      if (unitsError) {
        console.error("Error cargando unidades de producto:", unitsError);
        alert("No se pudieron cargar las unidades. Intenta nuevamente.");
      } else {
        setUnits(unitsData || []);
      }

      if (error || ingredientsError || ingredientCategoriesError) {
        console.error(
          "Error cargando productos o insumos:",
          error || ingredientsError || ingredientCategoriesError,
        );
        if (!Array.isArray(cachedCatalog?.products)) {
          setProducts([]);
        }
      } else {
        const records = categoriesData || [];
        const categoryMap = Object.fromEntries(
          records.map((category) => [category.id, category.name]),
        );
        setCategoryRecords(records);
        setCategories(records.map((category) => category.name));
        const normalizedProducts = (productsData || []).map((product) =>
          mapProduct(product, categoryMap),
        );
        setProducts(normalizedProducts);
        const ingredientCategoryMap = Object.fromEntries(
          (ingredientCategoriesData || []).map((category) => [
            category.id,
            category.name,
          ]),
        );
        setInventoryCategories(ingredientCategoriesData || []);
        const normalizedIngredients = (ingredientsData || []).map(
          (ingredient) => ({
            ...ingredient,
            categoryName:
              ingredientCategoryMap[ingredient.category_id] || "Sin categoría",
          }),
        );
        setAvailableIngredients(normalizedIngredients);
        writeCatalogCache(profile.business_id, {
          categories: records.map((category) => category.name),
          categoryRecords: records,
          products: normalizedProducts,
          ingredients: normalizedIngredients,
          inventoryCategories: ingredientCategoriesData || [],
        });
      }

      setLoadingProducts(false);
    };

    loadProducts();
  }, [user]);

  const inventoryIngredientSections = useMemo(() => {
    const sectionsById = new Map();
    const sections = inventoryCategories.map((category) => {
      const section = {
        id: category.id,
        name: category.name,
        ingredients: [],
      };
      sectionsById.set(category.id, section);
      return section;
    });
    const uncategorized = {
      id: "uncategorized",
      name: "Sin categoría",
      ingredients: [],
    };

    availableIngredients.forEach((ingredient) => {
      const section =
        sectionsById.get(ingredient.category_id) || uncategorized;
      section.ingredients.push(ingredient);
    });

    if (uncategorized.ingredients.length > 0) {
      sections.push(uncategorized);
    }

    return sections;
  }, [availableIngredients, inventoryCategories]);
  const selectedIngredientsById = useMemo(
    () =>
      new Map(
        selectedIngredients.map((item) => [item.inventoryItemId, item]),
      ),
    [selectedIngredients],
  );

  const saveInventoryCategoryQuick = async (event) => {
    event.preventDefault();
    const name = String(quickInventoryCategoryName || "")
      .trim()
      .toUpperCase();
    if (!businessId || !name || savingQuickInventory) return;

    const existing = inventoryCategories.find(
      (category) => category.name.trim().toUpperCase() === name,
    );
    if (existing) {
      setExpandedIngredientCategories((current) =>
        new Set(current).add(existing.id),
      );
      setQuickInventoryError("");
      setQuickInventoryForm(null);
      setQuickInventoryCategoryName("");
      return;
    }

    setSavingQuickInventory(true);
    setQuickInventoryError("");
    let result;
    try {
      result = await supabase
        .from("inventory_categories")
        .insert({ business_id: businessId, name })
        .select("id,name")
        .single();
    } catch (error) {
      console.error("Error creando categoría rápida de inventario:", error);
      setQuickInventoryError(
        "No se pudo conectar para crear la categoría. Intenta nuevamente.",
      );
      setSavingQuickInventory(false);
      return;
    }
    const { data, error } = result;

    if (error) {
      console.error("Error creando categoría rápida de inventario:", error);
      setQuickInventoryError(
        error.code === "23505"
          ? "Esa categoría ya existe."
          : "No se pudo crear la categoría. Intenta nuevamente.",
      );
      setSavingQuickInventory(false);
      return;
    }

    const nextCategories = [...inventoryCategories, data].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    setInventoryCategories(nextCategories);
    setExpandedIngredientCategories((current) =>
      new Set(current).add(data.id),
    );
    const cachedCatalog = readCatalogCache(businessId);
    if (cachedCatalog) {
      writeCatalogCache(businessId, {
        ...cachedCatalog,
        inventoryCategories: nextCategories,
      });
    }
    setQuickInventoryCategoryName("");
    setQuickInventoryError("");
    setQuickInventoryCategoryLocked(false);
    setQuickInventoryForm(null);
    setSavingQuickInventory(false);
  };

  const saveInventoryItemQuick = async (event) => {
    event.preventDefault();
    const name = String(quickInventoryItem.name || "")
      .trim()
      .toUpperCase();
    const unit = String(quickInventoryItem.unit || "").trim().toUpperCase();
    const initialStock = Number(quickInventoryItem.stock);
    if (
      !businessId ||
      !name ||
      !quickInventoryItem.categoryId ||
      !unit ||
      quickInventoryItem.stock === "" ||
      !Number.isFinite(initialStock) ||
      initialStock < 0
    ) {
      setQuickInventoryError(
        "Completa el nombre, la categoría, la unidad y un stock válido.",
      );
      return;
    }
    if (savingQuickInventory) return;

    setSavingQuickInventory(true);
    setQuickInventoryError("");
    let result;
    try {
      result = await supabase
        .from("inventory_items")
        .insert({
          business_id: businessId,
          name,
          category_id: quickInventoryItem.categoryId,
          stock: 0,
          unit,
          min_stock: 10,
          price: 0,
          is_active: true,
        })
        .select("id,name,unit,stock,category_id")
        .single();
    } catch (error) {
      console.error("Error creando insumo rápido:", error);
      setQuickInventoryError(
        "No se pudo conectar para crear el insumo. Intenta nuevamente.",
      );
      setSavingQuickInventory(false);
      return;
    }
    const { data, error } = result;

    if (error) {
      console.error("Error creando insumo rápido:", error);
      setQuickInventoryError(
        error.code === "23505"
          ? "Ya existe un insumo con ese nombre."
          : "No se pudo crear el insumo. Intenta nuevamente.",
      );
      setSavingQuickInventory(false);
      return;
    }

    let savedStock = 0;
    if (initialStock > 0) {
      let adjustment;
      try {
        adjustment = await supabase.rpc("adjust_inventory_stock", {
          p_item_id: data.id,
          p_quantity_delta: initialStock,
          p_reason: "initial_stock",
          p_notes: "Stock inicial desde creación rápida de insumo",
        });
      } catch (stockError) {
        console.error("Error registrando stock inicial del insumo:", stockError);
        adjustment = {
          error: new Error("No se pudo registrar el stock inicial."),
        };
      }

      if (adjustment.error) {
        console.error(
          "Error registrando stock inicial del insumo:",
          adjustment.error,
        );
        try {
          const { error: rollbackError } = await supabase.rpc(
            "delete_inventory_item_cascade",
            { p_item_id: data.id },
          );
          if (rollbackError) throw rollbackError;
        } catch (rollbackError) {
          console.error(
            "No se pudo revertir el insumo sin stock inicial:",
            rollbackError,
          );
          setQuickInventoryError(
            "El insumo se creó con stock 0, pero no se pudo registrar ni revertir el stock inicial. Revisa el inventario.",
          );
          setSavingQuickInventory(false);
          return;
        }
        setQuickInventoryError(
          "No se pudo registrar el stock inicial; el insumo no se creó. Intenta nuevamente.",
        );
        setSavingQuickInventory(false);
        return;
      }
      const adjustmentData = Array.isArray(adjustment.data)
        ? adjustment.data[0]
        : adjustment.data;
      savedStock = Number(adjustmentData?.stock ?? initialStock);
    }

    const categoryName =
      inventoryCategories.find(
        (category) => category.id === data.category_id,
      )?.name || "Sin categoría";
    const nextIngredients = [...availableIngredients, {
      ...data,
      stock: savedStock,
      categoryName,
    }].sort((a, b) => a.name.localeCompare(b.name));
    setAvailableIngredients(nextIngredients);
    setExpandedIngredientCategories((current) =>
      new Set(current).add(data.category_id),
    );
    setSelectedIngredients((current) => [
      ...current,
      { inventoryItemId: data.id, quantity: 1 },
    ]);
    const cachedCatalog = readCatalogCache(businessId);
    if (cachedCatalog) {
      writeCatalogCache(businessId, {
        ...cachedCatalog,
        ingredients: nextIngredients,
        inventoryCategories,
      });
    }
    setQuickInventoryItem({
      name: "",
      categoryId: data.category_id,
      unit,
      stock: "",
    });
    setQuickInventoryError("");
    setQuickInventoryForm(null);
    setQuickInventoryCategoryLocked(false);
    setSavingQuickInventory(false);
  };

  const selectedUnit = units.find((unit) => unit.id === formData.unitId);
  const editingProduct = products.find((product) => product.id === editingId);
  const stockStep = selectedUnit?.allows_fraction ? 0.1 : 1;
  const getProductFormSnapshot = (data, groups, ingredients) =>
    JSON.stringify({
      product: {
        name: formatProductNameForStorage(data.name),
        categoryId: data.categoryId || "",
        price: Number(data.price) || 0,
        description: formatStoredText(data.description),
        stock: Number(data.stock) || 0,
        minStock: Number(data.minStock) || 0,
        unitId: data.unitId || "",
        image: data.image || "",
      },
      optionGroups: groups.map((group, index) => ({
        name: formatStoredText(group.name),
        description: formatStoredText(group.description),
        is_required: Boolean(group.is_required),
        selection_type: group.selection_type || "single",
        order_index: index + 1,
        items: group.items.map((item, itemIndex) => ({
          nombre: formatStoredText(item.nombre),
          precio_extra: Number(item.precio_extra) || 0,
          order_index: itemIndex + 1,
        })),
      })),
      selectedIngredients: [...ingredients]
        .map((ingredient) => ({
          inventoryItemId: ingredient.inventoryItemId,
          quantity: Number(ingredient.quantity),
        }))
        .sort((a, b) =>
          a.inventoryItemId.localeCompare(b.inventoryItemId),
        ),
    });
  const hasProductFormChanges =
    initialProductFormSnapshot !== null &&
    getProductFormSnapshot(formData, optionGroups, selectedIngredients) !==
      initialProductFormSnapshot;

  // ========== FUNCIONES PARA PRODUCTOS ==========

  // Filtrar y buscar
  const filteredProducts = useMemo(() => {
    let result = products;

    // Búsqueda
    if (searchQuery) {
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.id.toString().includes(searchQuery),
      );
    }

    // Filtro por categoría
    if (filterCategory !== "todos") {
      result = result.filter((p) => p.category === filterCategory);
    }

    // Filtro por disponibilidad
    if (filterStatus === "activos") {
      result = result.filter((p) => p.isActive && !p.isSoldOut);
    } else if (filterStatus === "agotados") {
      result = result.filter((p) => p.isActive && p.isSoldOut);
    } else if (filterStatus === "archivados") {
      result = result.filter((p) => !p.isActive);
    } else if (filterStatus === "bajo_stock") {
      result = result.filter(
        (p) => p.isActive && !p.isSoldOut && isProductLowStock(p),
      );
    }

    // Ordenar
    result.sort((a, b) => {
      if (sortBy === "order") {
        return (
          a.orderIndex - b.orderIndex ||
          a.category.localeCompare(b.category) ||
          a.name.localeCompare(b.name)
        );
      }
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "price-asc") return a.price - b.price;
      if (sortBy === "price-desc") return b.price - a.price;
      return 0;
    });

    return result;
  }, [products, searchQuery, filterCategory, filterStatus, sortBy]);

  const selectedProductRecords = products.filter((product) =>
    selectedProducts.has(product.id),
  );
  const canActivateSelected = selectedProductRecords.some(
    (product) => product.isActive && product.isSoldOut,
  );
  const canExhaustSelected = selectedProductRecords.some(
    (product) => product.isActive && !product.isSoldOut,
  );
  const canArchiveSelected = selectedProductRecords.some(
    (product) => product.isActive,
  );
  const canUnarchiveSelected = selectedProductRecords.some(
    (product) => !product.isActive,
  );

  // Abrir modal para crear nuevo
  const handleNewProduct = () => {
    setEditingId(null);
    setImageEditor(null);
    setImageEditorError("");
    setQuickInventoryForm(null);
    setQuickInventoryCategoryLocked(false);
    setQuickInventoryError("");
    setQuickCategoryOpen(false);
    setQuickCategoryName("");
    const newFormData = {
      name: "",
      categoryId: categoryRecords[0]?.id || "",
      category: categoryRecords[0]?.name || "",
      price: "",
      description: "",
      stock: 0,
      minStock: 0,
      unitId:
        units.find((unit) => unit.name === "UNIDAD")?.id || units[0]?.id || "",
      image: "",
    };
    setFormData(newFormData);
    setOptionGroups([]);
    setSelectedIngredients([]);
    setOptionsLoading(false);
    setInitialProductFormSnapshot(getProductFormSnapshot(newFormData, [], []));
    setIsModalOpen(true);
  };

  const loadProductOptions = async (productId) => {
    setOptionsLoading(true);
    const [groupsResponse, itemsResponse] = await Promise.all([
      supabase
        .from("product_option_groups")
        .select("*")
        .eq("product_id", productId)
        .order("order_index", { ascending: true }),
      supabase
        .from("products_items")
        .select("*")
        .eq("product_id", productId)
        .order("order_index", { ascending: true }),
    ]);

    if (groupsResponse.error || itemsResponse.error) {
      console.error("Error cargando opciones del producto:", {
        groupsError: groupsResponse.error,
        itemsError: itemsResponse.error,
      });
      setOptionGroups([]);
      setOptionsLoading(false);
      return null;
    } else {
      const itemsByGroup = (itemsResponse.data || []).reduce(
        (grouped, item) => {
          const groupId = item.option_group_id;
          if (!groupId) return grouped;
          grouped[groupId] = grouped[groupId] || [];
          grouped[groupId].push({
            id: item.id,
            nombre: formatSentenceInput(item.nombre || ""),
            precio_extra: Number(item.precio_extra || 0),
            order_index: Number(item.order_index || 0),
          });
          return grouped;
        },
        {},
      );

      const loadedGroups = (groupsResponse.data || []).map((group) => ({
        id: group.id,
        name: formatSentenceInput(group.name || ""),
        description: formatSentenceInput(group.description || ""),
        is_required: Boolean(group.is_required),
        selection_type: group.selection_type || "single",
        order_index: Number(group.order_index || 0),
        items: itemsByGroup[group.id] || [],
      }));
      setOptionGroups(loadedGroups);
      setExpandedOptionGroups(new Set());
      setOptionsLoading(false);
      return loadedGroups;
    }
  };

  // Abrir modal para editar
  const handleEditProduct = (product) => {
    setEditingId(product.id);
    setImageEditor(null);
    setImageEditorError("");
    setQuickInventoryForm(null);
    setQuickInventoryCategoryLocked(false);
    setQuickInventoryError("");
    setQuickCategoryOpen(false);
    setQuickCategoryName("");
    const editFormData = {
      name: formatProductName(product.name),
      categoryId: product.categoryId,
      category: product.category,
      price: product.price,
      description: formatSentenceInput(product.description),
      stock: product.stock,
      minStock: product.minStock,
      unitId:
        product.unit_id ||
        units.find((unit) => unit.name === "UNIDAD")?.id ||
        units[0]?.id ||
        "",
      image: product.image,
    };
    setFormData(editFormData);
    setOptionGroups([]);
    setSelectedIngredients([]);
    setExpandedOptionGroups(new Set());
    setInitialProductFormSnapshot(null);
    Promise.all([
      loadProductIngredients(product.id),
      loadProductOptions(product.id),
    ]).then(([loadedIngredients, loadedGroups]) => {
      if (!loadedIngredients || !loadedGroups) {
        alert(
          "No se pudieron cargar los datos actuales del producto. No podrás guardarlo hasta volver a abrirlo.",
        );
        return;
      }
      setInitialProductFormSnapshot(
        getProductFormSnapshot(editFormData, loadedGroups, loadedIngredients),
      );
    });
    setIsModalOpen(true);
  };

  const closeProductModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setInitialProductFormSnapshot(null);
    setImageEditor(null);
    setImageEditorError("");
    setQuickInventoryForm(null);
    setQuickInventoryCategoryLocked(false);
    setQuickInventoryError("");
    setQuickCategoryOpen(false);
    setQuickCategoryName("");
    navigate(location.pathname, { replace: true, state: null });
  };

  useEffect(() => {
    const productId = location.state?.productId;
    if (!productId || loadingProducts) return;
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    handleEditProduct(product);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, loadingProducts, products, navigate, location.pathname]);

  const createOptionId = () =>
    `option-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const loadProductIngredients = async (productId) => {
    const { data, error } = await supabase
      .from("product_ingredients")
      .select("inventory_item_id, quantity")
      .eq("product_id", productId);

    if (error) {
      console.error("Error cargando insumos del producto:", error);
      setSelectedIngredients([]);
      return null;
    }

    const loadedIngredients = (data || []).map((ingredient) => ({
      inventoryItemId: ingredient.inventory_item_id,
      quantity: Number(ingredient.quantity || 1),
    }));
    setSelectedIngredients(loadedIngredients);
    return loadedIngredients;
  };

  const toggleProductIngredient = (inventoryItemId) => {
    setSelectedIngredients((current) => {
      const exists = current.some(
        (ingredient) => ingredient.inventoryItemId === inventoryItemId,
      );
      return exists
        ? current.filter(
            (ingredient) => ingredient.inventoryItemId !== inventoryItemId,
          )
        : [...current, { inventoryItemId, quantity: 1 }];
    });
  };

  const updateProductIngredientQuantity = (inventoryItemId, quantity) => {
    setSelectedIngredients((current) =>
      current.map((ingredient) =>
        ingredient.inventoryItemId === inventoryItemId
          ? {
              ...ingredient,
              quantity: Math.max(0.001, Number(quantity) || 0.001),
            }
          : ingredient,
      ),
    );
  };

  const saveProductIngredients = async (productId) => {
    const { error: deleteError } = await supabase
      .from("product_ingredients")
      .delete()
      .eq("product_id", productId);
    if (deleteError) throw deleteError;

    if (selectedIngredients.length === 0) return;

    const { error: insertError } = await supabase
      .from("product_ingredients")
      .insert(
        selectedIngredients.map((ingredient) => ({
          product_id: productId,
          inventory_item_id: ingredient.inventoryItemId,
          quantity: ingredient.quantity,
        })),
      );
    if (insertError) throw insertError;
  };

  const addOptionGroup = () => {
    const newGroup = {
      id: createOptionId(),
      name: "",
      description: "",
      is_required: false,
      selection_type: "single",
      order_index: 0,
      items: [],
    };
    setOptionGroups((groups) => [
      ...groups,
      { ...newGroup, order_index: groups.length + 1 },
    ]);
    setExpandedOptionGroups((groups) => new Set([...groups, newGroup.id]));
  };

  const toggleOptionGroup = (groupId) => {
    setExpandedOptionGroups((groups) => {
      const nextGroups = new Set(groups);
      if (nextGroups.has(groupId)) nextGroups.delete(groupId);
      else nextGroups.add(groupId);
      return nextGroups;
    });
  };

  const updateOptionGroup = (groupId, changes) => {
    setOptionGroups((groups) =>
      groups.map((group) =>
        group.id === groupId ? { ...group, ...changes } : group,
      ),
    );
  };

  const removeOptionGroup = (groupId) => {
    setOptionGroups((groups) =>
      groups
        .filter((group) => group.id !== groupId)
        .map((group, index) => ({ ...group, order_index: index + 1 })),
    );
  };

  const confirmRemoveOptionGroup = (groupId, groupName) => {
    const confirmed = window.confirm(
      `¿Seguro que deseas quitar el grupo "${groupName || "sin nombre"}"?`,
    );
    if (confirmed) removeOptionGroup(groupId);
  };

  const addOptionItem = (groupId) => {
    setOptionGroups((groups) =>
      groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              items: [
                ...group.items,
                {
                  id: createOptionId(),
                  nombre: "",
                  precio_extra: 0,
                  order_index: group.items.length + 1,
                },
              ],
            }
          : group,
      ),
    );
  };

  const updateOptionItem = (groupId, itemId, changes) => {
    setOptionGroups((groups) =>
      groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              items: group.items.map((item) =>
                item.id === itemId ? { ...item, ...changes } : item,
              ),
            }
          : group,
      ),
    );
  };

  const removeOptionItem = (groupId, itemId) => {
    setOptionGroups((groups) =>
      groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              items: group.items
                .filter((item) => item.id !== itemId)
                .map((item, index) => ({ ...item, order_index: index + 1 })),
            }
          : group,
      ),
    );
  };

  const saveProductOptions = async (productId) => {
    const { error: deleteItemsError } = await supabase
      .from("products_items")
      .delete()
      .eq("product_id", productId);
    if (deleteItemsError) throw deleteItemsError;

    const { error: deleteGroupsError } = await supabase
      .from("product_option_groups")
      .delete()
      .eq("product_id", productId);
    if (deleteGroupsError) throw deleteGroupsError;

    const groupsToSave = optionGroups.filter((group) => group.name.trim());
    if (groupsToSave.length === 0) return;

    const { data: savedGroups, error: groupsError } = await supabase
      .from("product_option_groups")
      .insert(
        groupsToSave.map((group, index) => ({
          product_id: productId,
          name: formatStoredText(group.name),
          description: formatStoredText(group.description),
          is_required: Boolean(group.is_required),
          selection_type: group.selection_type,
          order_index: index + 1,
        })),
      )
      .select("id, order_index");
    if (groupsError) throw groupsError;

    const itemsToSave = groupsToSave.flatMap((group, groupIndex) =>
      group.items
        .filter((item) => item.nombre.trim())
        .map((item, itemIndex) => ({
          product_id: productId,
          option_group_id: savedGroups[groupIndex].id,
          nombre: formatStoredText(item.nombre),
          precio_extra: Number(item.precio_extra) || 0,
          order_index: itemIndex + 1,
        })),
    );

    if (itemsToSave.length > 0) {
      const { error: itemsError } = await supabase
        .from("products_items")
        .insert(itemsToSave);
      if (itemsError) throw itemsError;
    }
  };

  const handleProductImageFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      alert("La imagen debe ser JPG, PNG o WEBP y pesar máximo 5 MB.");
      return;
    }

    setImageEditorError("");
    setImageEditor({
      file,
      type: "product",
      url: URL.createObjectURL(file),
    });
  };

  const applyProductImageCrop = async (crop) => {
    if (!imageEditor) return;

    try {
      const image = new window.Image();
      image.src = imageEditor.url;
      await image.decode();

      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1024;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo preparar el recorte.");

      context.drawImage(
        image,
        crop.x * image.naturalWidth,
        crop.y * image.naturalHeight,
        crop.width * image.naturalWidth,
        crop.height * image.naturalHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (result) =>
            result
              ? resolve(result)
              : reject(new Error("No se pudo generar la imagen recortada.")),
          "image/webp",
          0.9,
        );
      });
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = () =>
          reject(new Error("No se pudo preparar la imagen del producto."));
        reader.readAsDataURL(blob);
      });

      setFormData((current) => ({ ...current, image: dataUrl }));
      setImageEditor(null);
      setImageEditorError("");
    } catch (error) {
      console.error("Error preparando la imagen del producto:", error);
      setImageEditorError(
        error.message || "No se pudo preparar la imagen del producto.",
      );
    }
  };

  // Guardar producto
  const handleSaveProduct = async () => {
    if (!formData.name || !formData.price) {
      alert("Completa nombre y precio");
      return;
    }

    if (!formData.categoryId) {
      alert("Selecciona una categoría");
      return;
    }
    if (!formData.unitId) {
      alert("Selecciona una unidad de venta");
      return;
    }

    setSavingProduct(true);
    const previousProductImage = editingId
      ? products.find((product) => product.id === editingId)?.image_url ||
        products.find((product) => product.id === editingId)?.image ||
        null
      : null;
    let imageUrl = formData.image || null;
    let uploadedImagePath = null;

    if (imageUrl?.startsWith("data:image/")) {
      const imageBlob = await fetch(imageUrl).then((response) =>
        response.blob(),
      );
      const extension =
        imageBlob.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
      uploadedImagePath = `${businessId}/productos-imagenes/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("business-assets")
        .upload(uploadedImagePath, imageBlob, {
          contentType: imageBlob.type,
          upsert: false,
        });

      if (uploadError) {
        console.error("Error subiendo imagen del producto:", uploadError);
        alert("No se pudo subir la imagen del producto.");
        setSavingProduct(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("business-assets")
        .getPublicUrl(uploadedImagePath);
      imageUrl = publicUrlData.publicUrl;
    }

    const payload = {
      name: formatProductNameForStorage(formData.name),
      category_id: formData.categoryId,
      price: Number(formData.price),
      description: formatStoredText(formData.description),
      stock: Number(formData.stock) || 0,
      min_stock: Number(formData.minStock) || 0,
      unit_id: formData.unitId || null,
      image_url: imageUrl,
    };
    let query;
    if (editingId) {
      query = supabase.from("products").update(payload).eq("id", editingId);
    } else {
      const { data: lastProduct, error: indexError } = await supabase
        .from("products")
        .select("order_index")
        .eq("business_id", businessId)
        .eq("category_id", formData.categoryId)
        .not("order_index", "is", null)
        .order("order_index", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (indexError) {
        console.error("Error obteniendo el último order_index:", indexError);
        alert("No se pudo calcular el orden del producto");
        setSavingProduct(false);
        return;
      }

      const nextOrderIndex = Number(lastProduct?.order_index || 0) + 1;
      query = supabase.from("products").insert({
        ...payload,
        business_id: businessId,
        order_index: nextOrderIndex,
        is_active: true,
        is_sold_out: false,
      });
    }
    const { data, error } = await query.select().single();

    if (error) {
      console.error("Error guardando producto:", error);
      if (uploadedImagePath) {
        await supabase.storage
          .from("business-assets")
          .remove([uploadedImagePath]);
      }
      alert("No se pudo guardar el producto");
    } else {
      if (previousProductImage && previousProductImage !== imageUrl) {
        try {
          await removeStorageObjectIfUnused(
            "business-assets",
            previousProductImage,
          );
        } catch (cleanupError) {
          console.warn("No se pudo limpiar la imagen anterior:", cleanupError);
        }
      }

      try {
        await saveProductOptions(data.id);
        await saveProductIngredients(data.id);
      } catch (optionsError) {
        console.error("Error guardando relaciones del producto:", optionsError);
        alert(
          "El producto se guardó, pero no se pudieron guardar sus opciones o insumos.",
        );
        setSavingProduct(false);
        return;
      }
      const categoryMap = Object.fromEntries(
        categoryRecords.map((category) => [category.id, category.name]),
      );
      const mappedProduct = mapProduct(data, categoryMap);
      setProducts((current) =>
        editingId
          ? current.map((product) =>
              product.id === editingId ? mappedProduct : product,
            )
          : [...current, mappedProduct],
      );
      setIsModalOpen(false);
    }

    setSavingProduct(false);
  };

  // Archivar producto sin romper el historial de pedidos
  const handleDeleteProduct = async (id) => {
    const { error } = await supabase
      .from("products")
      .update({ is_active: false })
      .eq("id", id);
    if (error) {
      console.error("Error archivando producto:", error);
      alert("No se pudo archivar el producto");
      return;
    }
    setProducts((current) =>
      current.map((product) =>
        product.id === id ? { ...product, isActive: false } : product,
      ),
    );
    setDeleteConfirm(null);
  };

  // Eliminar imagen
  const handleDeleteImage = (e) => {
    e.stopPropagation();
    setFormData({ ...formData, image: "" });
  };

  // Toggle disponibilidad
  const handleToggleSoldOut = async (id) => {
    const product = products.find((item) => item.id === id);
    if (!product) return;
    const nextIsSoldOut = !product.isSoldOut;
    const { error } = await supabase
      .from("products")
      .update({ is_sold_out: nextIsSoldOut })
      .eq("id", id);
    if (error) {
      console.error("Error actualizando disponibilidad:", error);
      return;
    }
    setProducts((current) =>
      current.map((item) =>
        item.id === id ? { ...item, isSoldOut: nextIsSoldOut } : item,
      ),
    );
  };

  const handleAdjustStock = async (id, adjustment) => {
    const product = products.find((item) => item.id === id);
    if (!product || !businessId || updatingStockIds.has(id)) return;

    const nextStock = Math.max(0, Number(product.stock || 0) + adjustment);
    if (nextStock === Number(product.stock || 0)) return;

    setUpdatingStockIds((current) => new Set(current).add(id));

    try {
      const { data, error } = await supabase
        .from("products")
        .update({ stock: nextStock })
        .eq("id", id)
        .eq("business_id", businessId)
        .select("id, stock")
        .single();

      if (error) throw error;

      const savedStock = Number(data.stock || 0);
      setProducts((current) =>
        current.map((item) =>
          item.id === id ? { ...item, stock: savedStock } : item,
        ),
      );

      const cachedCatalog = readCatalogCache(businessId);
      if (Array.isArray(cachedCatalog?.products)) {
        writeCatalogCache(businessId, {
          ...cachedCatalog,
          products: cachedCatalog.products.map((item) =>
            item.id === id ? { ...item, stock: savedStock } : item,
          ),
        });
      }
    } catch (error) {
      console.error("Error actualizando stock del producto:", error);
      alert("No se pudo actualizar el stock. Inténtalo de nuevo.");
    } finally {
      setUpdatingStockIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const handleToggleArchived = async (id) => {
    const product = products.find((item) => item.id === id);
    if (!product) return;

    const nextIsActive = !product.isActive;
    const { error } = await supabase
      .from("products")
      .update({ is_active: nextIsActive })
      .eq("id", id);
    if (error) {
      console.error("Error archivando producto:", error);
      return;
    }
    setProducts((current) =>
      current.map((item) =>
        item.id === id ? { ...item, isActive: nextIsActive } : item,
      ),
    );
  };

  // Seleccionar/deseleccionar producto
  const handleSelectProduct = (id) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedProducts(newSelected);
  };

  const handleToggleSelectAllFiltered = () => {
    const filteredIds = filteredProducts.map((product) => product.id);
    const allFilteredSelected =
      filteredIds.length > 0 &&
      filteredIds.every((id) => selectedProducts.has(id));
    const nextSelected = new Set(selectedProducts);

    filteredIds.forEach((id) => {
      if (allFilteredSelected) {
        nextSelected.delete(id);
      } else {
        nextSelected.add(id);
      }
    });

    setSelectedProducts(nextSelected);
  };

  // Cambiar estado en lote
  const handleBulkToggleStatus = async (newStatus) => {
    const ids = [...selectedProducts];
    const { error } = await supabase
      .from("products")
      .update({ is_sold_out: !newStatus })
      .in("id", ids);
    if (error) {
      console.error("Error actualizando productos:", error);
      return;
    }
    setProducts((current) =>
      current.map((product) =>
        selectedProducts.has(product.id)
          ? { ...product, isSoldOut: !newStatus }
          : product,
      ),
    );
    setSelectedProducts(new Set());
    setBulkActionsOpen(false);
  };

  // Archivar productos en lote sin romper el historial de pedidos
  const handleBulkDelete = async () => {
    const ids = [...selectedProducts];
    const { error } = await supabase
      .from("products")
      .update({ is_active: false })
      .in("id", ids);
    if (error) {
      console.error("Error archivando productos:", error);
      return;
    }
    setProducts((current) =>
      current.map((product) =>
        selectedProducts.has(product.id)
          ? { ...product, isActive: false }
          : product,
      ),
    );
    setSelectedProducts(new Set());
    setBulkDeleteConfirm(false);
    setBulkActionsOpen(false);
  };

  const handleBulkUnarchive = async () => {
    const ids = [...selectedProducts];
    const { error } = await supabase
      .from("products")
      .update({ is_active: true })
      .in("id", ids);
    if (error) {
      console.error("Error desarchivando productos:", error);
      alert("No se pudieron desarchivar los productos");
      return;
    }
    setProducts((current) =>
      current.map((product) =>
        selectedProducts.has(product.id)
          ? { ...product, isActive: true }
          : product,
      ),
    );
    setSelectedProducts(new Set());
    setBulkActionsOpen(false);
  };

  const handleBulkPermanentDelete = async () => {
    const ids = [...selectedProducts];
    const { data: productsToDelete, error: productsQueryError } = await supabase
      .from("products")
      .select("id,image_url")
      .in("id", ids);
    if (productsQueryError) {
      console.error(
        "Error consultando imágenes de productos:",
        productsQueryError,
      );
      alert("No se pudieron consultar las imágenes de productos");
      return;
    }

    const { error } = await supabase.from("products").delete().in("id", ids);
    if (error) {
      console.error("Error eliminando productos permanentemente:", error);
      if (error.code === "23503") {
        alert(
          "Algunos productos tienen pedidos asociados y no pueden eliminarse. Usa Archivar para conservar el historial.",
        );
      } else {
        alert("No se pudieron eliminar los productos");
      }
      return;
    }
    await Promise.all(
      (productsToDelete || []).map((product) =>
        removeStorageObjectIfUnused("business-assets", product.image_url).catch(
          (cleanupError) =>
            console.warn(
              "No se pudo limpiar imagen de producto:",
              cleanupError,
            ),
        ),
      ),
    );
    setProducts((current) =>
      current.filter((product) => !selectedProducts.has(product.id)),
    );
    setSelectedProducts(new Set());
    setBulkPermanentDeleteConfirm(false);
    setBulkActionsOpen(false);
  };

  const categoriesList = ["todos", ...new Set(products.map((p) => p.category))];

  const renderQuickInventoryItemForm = (categoryId, categoryName) => {
    if (
      quickInventoryForm !== "item" ||
      !quickInventoryCategoryLocked ||
      quickInventoryItem.categoryId !== categoryId
    ) {
      return null;
    }

    const allowsFraction = units.find(
      (unit) =>
        unit.name.toUpperCase() === quickInventoryItem.unit.toUpperCase(),
    )?.allows_fraction;

    return (
      <form
        onSubmit={saveInventoryItemQuick}
        className="mt-3 space-y-3 rounded-xl border border-white/5 bg-neutral-900/60 p-3"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-black uppercase tracking-wide text-white">
            Nuevo insumo · {categoryName}
          </p>
          <button
            type="button"
            onClick={() => {
              setQuickInventoryForm(null);
              setQuickInventoryCategoryLocked(false);
              setQuickInventoryError("");
            }}
            aria-label="Cancelar creación de insumo"
            className="rounded-md p-1 text-neutral-500 hover:bg-white/10 hover:text-white"
          >
            <X size={15} />
          </button>
        </div>
        <input
          autoFocus
          value={quickInventoryItem.name}
          onChange={(event) =>
            setQuickInventoryItem((current) => ({
              ...current,
              name: event.target.value,
            }))
          }
          placeholder="Nombre del insumo"
          maxLength={100}
          required
          className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-xs text-white outline-none placeholder:text-neutral-600 focus:border-emerald-500/50"
        />
        <p className="text-[9px] font-bold uppercase tracking-wide text-neutral-400">
          Unidad y stock inicial
        </p>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={quickInventoryItem.unit}
            required
            onChange={(event) =>
              setQuickInventoryItem((current) => ({
                ...current,
                unit: event.target.value,
              }))
            }
            className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500/50"
          >
            <option value="">Seleccionar unidad</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.name}>
                {unit.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            step={allowsFraction ? "0.001" : "1"}
            value={quickInventoryItem.stock}
            onChange={(event) =>
              setQuickInventoryItem((current) => ({
                ...current,
                stock: event.target.value,
              }))
            }
            placeholder="Stock inicial"
            required
            aria-label="Stock inicial del insumo"
            className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-xs text-white outline-none placeholder:text-neutral-600 focus:border-emerald-500/50"
          />
        </div>
        {quickInventoryError && (
          <p role="alert" className="text-[10px] text-amber-300">
            {quickInventoryError}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingQuickInventory}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-[9px] font-black uppercase text-white hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-50"
          >
            {savingQuickInventory ? "Guardando..." : "Crear insumo"}
          </button>
        </div>
      </form>
    );
  };

  // ========== RENDERIZADO CONDICIONAL ==========

  if (section === "categorias") {
    return (
      <Categorias
        categories={categories}
        categoryRecords={categoryRecords}
        businessId={businessId}
        products={products} // Envía el array de productos original
        loading={loadingProducts}
        onUpdateCategories={handleUpdateCategories}
        onDeleteCategoryCascade={handleDeleteCategoryCascade} // <--- NUEVO CALLBACK VINCULADO
      />
    );
  }

  // SECCIÓN DE PRODUCTOS
  return (
    <div className="min-h-screen bg-background  text-neutral-200 p-4 md:p-4 font-sans">
      <div className="max-w-7xl mx-auto">
        {/* HEADER DINÁMICO */}
        {/* Título Principal: Con un tracking más elegante y mejor peso */}
        <h1 className="text-2xl font-black tracking-tighter mb-3">Productos</h1>
        <header className="px-0 pt-2 pb-5  flex-shrink-0">
          {/* Fila Superior: Info y Cierre */}
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-2">
              {/* Indicadores de Estado: Ahora más limpios, sutiles y fáciles de leer */}
              <div className="flex items-center gap-3 flex-wrap select-none">
                <div className="flex items-center gap-2 group">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                  <span className="ml-1 text-[8px] font-black uppercase tracking-widest text-neutral-600">
                    {products.length} Total
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
                  <span className="ml-1 text-[8px] font-black uppercase tracking-widest text-neutral-600">
                    <span className="text-emerald-400 font-black">
                      {
                        products.filter((p) => p.isActive && !p.isSoldOut)
                          .length
                      }
                    </span>{" "}
                    Activos
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500/80" />
                  <span className="ml-1 text-[8px] font-black uppercase tracking-widest text-neutral-600">
                    <span className="text-rose-400 font-black">
                      {products.filter((p) => p.isActive && p.isSoldOut).length}
                    </span>{" "}
                    Agotados
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-500/80" />
                  <span className="ml-1 text-[8px] font-black uppercase tracking-widest text-neutral-600">
                    <span className="text-slate-300 font-black">
                      {products.filter((p) => !p.isActive).length}
                    </span>{" "}
                    Archivados
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Fila Inferior: Botonera Estilizada */}
          <div className="flex items-center justify-between gap-2 mt-4 flex-wrap w-full">
            {/* Vista Normal: Botones de Nuevo Item y Seleccionar */}
            {!isSelectionMode && (
              <>
                <button
                  onClick={handleNewProduct}
                  className="px-4 py-2 rounded-lg border text-[9px] font-black uppercase active:scale-95 transition-all flex items-center gap-2 bg-white/[0.03] border-white/[0.08] text-white hover:bg-white/[0.08] hover:border-white/[0.15]"
                >
                  <Plus size={11} className="text-violet-400" /> Nuevo
                </button>

                <button
                  onClick={() => {
                    setIsSelectionMode(!isSelectionMode);
                    setSelectedProducts(new Set());
                  }}
                  className="px-4 py-2 rounded-lg border text-[9px] font-black uppercase active:scale-95 transition-all flex items-center gap-2"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    borderColor: "rgba(255,255,255,0.05)",
                    color: "#9ca3af",
                  }}
                >
                  <CheckCircle2 size={11} />
                  Seleccionar
                </button>
              </>
            )}

            {/* En selección, los controles viven en barras flotantes inferiores. */}
            {isSelectionMode && (
              <>
                <div className="fixed bottom-4 left-4 right-4 md:left-24 md:right-8 z-50 flex items-center gap-2 rounded-2xl border border-white/10 bg-neutral-950/95 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl">
                  <button
                    onClick={handleToggleSelectAllFiltered}
                    aria-pressed={
                      filteredProducts.length > 0 &&
                      filteredProducts.every((product) =>
                        selectedProducts.has(product.id),
                      )
                    }
                    className="min-w-0 flex-1 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2.5 text-center text-[9px] font-black uppercase tracking-wide text-sky-300 active:scale-95 transition-all"
                  >
                    {filteredProducts.length > 0 &&
                    filteredProducts.every((product) =>
                      selectedProducts.has(product.id),
                    )
                      ? "Quitar selección"
                      : "Seleccionar todo"}
                  </button>
                  {selectedProducts.size > 0 && (
                    <button
                      onClick={() => setBulkActionsOpen((open) => !open)}
                      aria-label={`${selectedProducts.size} ${selectedProducts.size === 1 ? "ítem seleccionado" : "ítems seleccionados"}`}
                      className="min-w-0 flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-center text-[9px] font-black uppercase tracking-wide text-amber-300 active:scale-95 transition-all"
                    >
                      Acciones
                      <span className="rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-mono normal-case text-amber-200">
                        {selectedProducts.size}
                      </span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsSelectionMode(false);
                      setSelectedProducts(new Set());
                      setBulkActionsOpen(false);
                    }}
                    className="min-w-0 flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-center text-[9px] font-black uppercase tracking-wide text-emerald-300 active:scale-95 transition-all"
                  >
                    <CheckCircle2 size={12} />
                    Terminado
                  </button>
                </div>

                {bulkActionsOpen && selectedProducts.size > 0 && (
                  <>
                    <button
                      aria-label="Cerrar acciones masivas"
                      onClick={() => setBulkActionsOpen(false)}
                      className="fixed inset-0 z-40 bg-black/30"
                    />
                    <div
                      role="dialog"
                      aria-label="Acciones para productos seleccionados"
                      className="fixed bottom-24 left-4 right-4 md:left-24 md:right-8 z-50 rounded-2xl border border-white/10 bg-neutral-950/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-xl"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                            Acciones masivas
                          </p>
                          <p className="mt-1 text-[11px] text-neutral-600">
                            Aplicar a {selectedProducts.size} seleccionado
                            {selectedProducts.size === 1 ? "" : "s"}
                          </p>
                        </div>
                        <button
                          onClick={() => setBulkActionsOpen(false)}
                          className="rounded-lg p-1.5 text-neutral-500 hover:bg-white/5 hover:text-white"
                          aria-label="Cerrar acciones"
                        >
                          <X size={15} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {canActivateSelected && (
                          <button
                            onClick={() => handleBulkToggleStatus(true)}
                            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-[9px] font-black uppercase tracking-wide text-emerald-300 active:scale-95"
                          >
                            Activar
                          </button>
                        )}
                        {canExhaustSelected && (
                          <button
                            onClick={() => handleBulkToggleStatus(false)}
                            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-3 text-[9px] font-black uppercase tracking-wide text-rose-300 active:scale-95"
                          >
                            Agotar
                          </button>
                        )}
                        {canArchiveSelected && (
                          <button
                            onClick={() => setBulkDeleteConfirm(true)}
                            className="flex items-center justify-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-3 text-[9px] font-black uppercase tracking-wide text-violet-300 active:scale-95"
                          >
                            <Archive size={12} />
                            Archivar
                          </button>
                        )}
                        {canUnarchiveSelected && (
                          <button
                            onClick={handleBulkUnarchive}
                            className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-[9px] font-black uppercase tracking-wide text-emerald-200 active:scale-95"
                          >
                            <Archive size={12} />
                            Desarchivar
                          </button>
                        )}
                        <button
                          onClick={() => setBulkPermanentDeleteConfirm(true)}
                          className="flex items-center justify-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-3 text-[9px] font-black uppercase tracking-wide text-red-300 active:scale-95"
                        >
                          <Trash2 size={12} />
                          Eliminar
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedProducts(new Set());
                          setBulkActionsOpen(false);
                        }}
                        className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[9px] font-black uppercase tracking-wide text-neutral-400 hover:bg-white/[0.06] hover:text-white"
                      >
                        Limpiar selección
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </header>

        {/* BÚSQUEDA TÉCNICA */}
        <div className="bg-neutral-900/30 border border-white/5 p-4 rounded-2xl mb-8 space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1 group">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600 group-focus-within:text-violet-500 transition-colors"
                size={14}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="BUSCAR NOMBRE O CATEGORÍA..."
                className="w-full bg-neutral-900/50 border border-white/5 rounded-xl py-3 pl-10 pr-10 text-[10px] font-mono outline-none focus:border-violet-500/40 transition-all placeholder:text-neutral-700"
              />
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="px-6 py-3 bg-neutral-800 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/5 hover:border-white/20 transition-all"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[8px] font-black text-neutral-600 uppercase tracking-widest ml-1 block mb-2">
                Categoría
              </label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full bg-neutral-900 border border-white/5 rounded-xl py-2.5 px-3 text-[10px] font-mono text-neutral-300 uppercase focus:border-violet-500/40 outline-none transition-all cursor-pointer"
              >
                {categoriesList.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === "todos" ? "Todas" : cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[8px] font-black text-neutral-600 uppercase tracking-widest ml-1 block mb-2">
                Estado
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full bg-neutral-900 border border-white/5 rounded-xl py-2.5 px-3 text-[10px] font-mono text-neutral-300 uppercase focus:border-violet-500/40 outline-none transition-all cursor-pointer"
              >
                <option value="todos">Todos</option>
                <option value="activos">Activos</option>
                <option value="bajo_stock">Bajo stock</option>
                <option value="agotados">Agotados</option>
                <option value="archivados">Archivados</option>
              </select>
            </div>
            <div>
              <label className="text-[8px] font-black text-neutral-600 uppercase tracking-widest ml-1 block mb-2">
                Ordenar
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full bg-neutral-900 border border-white/5 rounded-xl py-2.5 px-3 text-[10px] font-mono text-neutral-300 uppercase focus:border-violet-500/40 outline-none transition-all cursor-pointer"
              >
                <option value="order">Orden del catálogo</option>
                <option value="name">Por Nombre</option>
                <option value="price-asc">Precio: Menor</option>
                <option value="price-desc">Precio: Mayor</option>
              </select>
            </div>
          </div>
        </div>

        {/* CONTENIDO PRINCIPAL */}
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
          {loadingProducts ? (
            <SubLoading
              label="Cargando productos"
              className="col-span-full py-20"
              dotClassName="bg-violet-400"
            />
          ) : filteredProducts.length === 0 ? (
            <div className="col-span-full py-20 text-center">
              <Search size={48} className="mx-auto text-neutral-600 mb-2" />
              <p className="text-sm font-bold uppercase text-neutral-500 tracking-widest">
                No hay productos
              </p>
            </div>
          ) : (
            filteredProducts.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  if (isSelectionMode) {
                    handleSelectProduct(item.id);
                  } else {
                    handleEditProduct(item);
                  }
                }}
                className={`rounded-2xl overflow-hidden border transition-all duration-300 group cursor-pointer hover:shadow-xl hover:shadow-violet-500/10 flex flex-col justify-between h-full ${
                  !item.isActive
                    ? "bg-slate-500/5 border-slate-500/20 hover:border-slate-400/40 hover:bg-slate-500/10"
                    : !item.isSoldOut
                      ? "bg-neutral-900/40 border-white/5 hover:border-violet-500/30 hover:bg-neutral-900/60"
                      : "bg-red-500/5 border-red-500/20 hover:border-red-500/40 hover:bg-red-500/10"
                }`}
              >
                {/* SECCIÓN SUPERIOR: Imagen fija */}
                <div className="relative w-full h-32 sm:h-40 overflow-hidden bg-neutral-800 flex-shrink-0">
                  <img
                    src={item.image || defaultImg} // Si no hay string de imagen, usa el default de inmediato
                    alt={item.name}
                    onError={handleImageError} // Si hay un string pero el enlace está roto, activa el fallback
                    className="w-full h-full object-cover transition-all duration-500 group-hover:scale-105"
                  />
                  {/* Badge Estado Superior Izquierda */}
                  <div className="absolute top-2 left-2">
                    {/* Badge Estado */}
                    <div
                      className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                        !item.isActive
                          ? "bg-slate-500/80 text-slate-100 border-slate-400/30"
                          : item.isSoldOut
                            ? "bg-red-500 text-red-fff border-red-500/30"
                            : isProductLowStock(item)
                              ? "bg-amber-500/20 text-amber-300 border-amber-400/30"
                              : "bg-emerald-500 text-fff border-emerald-500/30"
                      }`}
                    >
                      {!item.isActive
                        ? "Archivado"
                        : item.isSoldOut
                          ? "Agotado"
                          : isProductLowStock(item)
                            ? "Bajo stock"
                            : "Activo"}
                    </div>
                  </div>

                  {/* Checkbox o Botón Archivar Superior Derecha */}
                  <div className="absolute top-2 right-2">
                    {isSelectionMode ? (
                      <input
                        type="checkbox"
                        checked={selectedProducts.has(item.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleSelectProduct(item.id);
                        }}
                        className="w-6 h-6 rounded cursor-pointer accent-violet-500"
                      />
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm(item.id);
                        }}
                        className="p-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors"
                        title="Archivar"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* SECCIÓN INTERMEDIA: Datos del Producto */}
                <div className="p-3 sm:p-4 flex flex-col flex-1 justify-between gap-1">
                  {/* Bloque de Textos */}
                  <div>
                    {/* Categoría */}
                    <span className="text-[9px] sm:text-[10px] font-bold text-violet-400 uppercase tracking-widest block h-3.5 overflow-hidden">
                      {item.category}
                    </span>

                    {/* Título */}
                    <h3 className="font-black text-xs sm:text-sm text-neutral-100 uppercase tracking-wide line-clamp-1 mt-0.5">
                      {item.name}
                    </h3>
                  </div>

                  {/* Bloque de Precio */}
                  <div className="pt-1">
                    <span className="block text-[8px] sm:text-[9px] font-bold text-neutral-500 uppercase tracking-wider leading-none">
                      Precio
                    </span>
                    <p className="font-black text-base sm:text-lg text-white tracking-tight tabular-nums mt-0.5 leading-tight">
                      {item.price.toLocaleString("es-CO", {
                        style: "currency",
                        currency: "COP",
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                    </p>
                  </div>
                </div>

                {/* SECCIÓN INFERIOR: Acciones de estado */}
                <div className="pb-2">
                  <div className="grid grid-cols-1 gap-2 pt-2.5 border-t border-white/5 px-2 sm:grid-cols-2 md:px-3">
                    <div className="col-span-full flex justify-center">
                      {(() => {
                        const productUnit =
                          units.find((unit) => unit.id === item.unitId) ||
                          units.find((unit) => unit.name === "UNIDAD");
                        const unitName = productUnit?.name || "UNIDAD";
                        const stockStep = productUnit?.allows_fraction
                          ? 0.1
                          : 1;
                        const stockLabel = formatStockQuantity(item.stock);

                        return isSelectionMode ? (
                          <div
                            className="flex min-w-16 flex-col items-center rounded-lg border border-white/15 bg-black/75 px-3 py-1 text-white"
                            aria-label={`${unitName}: ${stockLabel}`}
                          >
                            <span className="text-[8px] font-bold uppercase tracking-wider text-neutral-400">
                              {unitName}
                            </span>
                            <span className="text-sm font-black tabular-nums">
                              {Number(item.stock || 0) > 99 ? "99+" : stockLabel}
                            </span>
                          </div>
                        ) : (
                        <div
                          role="group"
                          aria-label={`${item.name}: ${stockLabel} ${unitName}`}
                          title={`${stockLabel} ${unitName}`}
                          className="flex w-full max-w-[267px] items-center justify-center gap-1 rounded-xl bg-neutral-800/40 p-2 sm:gap-2 sm:p-3"
                        >
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleAdjustStock(item.id, -stockStep);
                            }}
                            disabled={
                              updatingStockIds.has(item.id) ||
                              Number(item.stock || 0) <= 0
                            }
                            aria-label={`Disminuir ${unitName} de ${item.name}`}
                            title={`Disminuir ${stockStep} ${unitName}`}
                            className="shrink-0 rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-700 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40 sm:p-2"
                          >
                            <ArrowDownRight
                              size={16}
                              className="sm:h-[18px] sm:w-[18px]"
                            />
                          </button>
                          <span className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0 rounded-lg border border-white/10 bg-neutral-700 px-1 py-2 text-center text-white sm:px-3 sm:py-1">
                            <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider text-neutral-400 sm:text-[9px]">
                              {unitName}
                            </span>
                            <span
                              className={`min-w-0 truncate text-base font-black leading-tight tabular-nums sm:text-lg ${
                                Number(item.stock) < 0
                                  ? "text-red-400"
                                  : "text-white"
                              }`}
                            >
                              {stockLabel}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleAdjustStock(item.id, stockStep);
                            }}
                            disabled={updatingStockIds.has(item.id)}
                            aria-label={`Aumentar ${unitName} de ${item.name}`}
                            title={`Aumentar ${stockStep} ${unitName}`}
                            className="shrink-0 rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-700 hover:text-emerald-400 disabled:cursor-wait disabled:opacity-40 sm:p-2"
                          >
                            <ArrowUpRight
                              size={16}
                              className="sm:h-[18px] sm:w-[18px]"
                            />
                          </button>
                        </div>
                        );
                      })()}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleArchived(item.id);
                      }}
                      aria-label={
                        item.isActive
                          ? "Archivar producto"
                          : "Desarchivar producto"
                      }
                      className={`flex min-h-10 w-full min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[9px] font-bold uppercase tracking-normal leading-none whitespace-nowrap active:scale-95 transition-all ${
                        item.isActive
                          ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                          : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                      }`}
                      title={item.isActive ? "Archivar" : "Desarchivar"}
                    >
                      <Archive size={16} />
                      <span>{item.isActive ? "Archivar" : "Desarchivar"}</span>
                    </button>

                    {/* Cambiar disponibilidad */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSoldOut(item.id);
                      }}
                      aria-label={
                        item.isSoldOut
                          ? "Marcar como disponible"
                          : "Marcar como agotado"
                      }
                      className={`flex min-h-10 w-full min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[9px] font-bold uppercase tracking-normal leading-none whitespace-nowrap transition-colors ${
                        item.isSoldOut ? "bg-red-500" : "bg-emerald-500"
                      }`}
                      title={item.isSoldOut ? "Agotado" : "Disponible"}
                    >
                      <span className="h-2 w-2 rounded-full bg-white" />
                      <span>{item.isSoldOut ? "Agotado" : "Disponible"}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* MODAL DE EDICIÓN / NUEVO PRODUCTO */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-black/95 backdrop-blur-xl">
            <div className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-neutral-900">
              {/* Header Premium - Responsive */}
              <div className="relative overflow-hidden flex-shrink-0">
                <div className="relative mx-auto flex w-full max-w-7xl items-center justify-between gap-3 border-b border-white/5 px-4 py-4 sm:px-6 md:px-8 lg:px-10">
                  <div className="flex items-center gap-2 sm:gap-3 md:gap-4 min-w-0">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-violet-500/10">
                      {editingId ? (
                        <Edit3
                          size={20}
                          className="sm:w-6 sm:h-6 text-violet-400"
                        />
                      ) : (
                        <Plus
                          size={20}
                          className="sm:w-6 sm:h-6 text-violet-400"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-bold leading-tight tracking-tight text-white sm:text-2xl">
                        {editingId ? "Editar" : "Crear"} Producto
                      </h2>
                    </div>
                  </div>
                  <button
                    onClick={closeProductModal}
                    className="p-2 sm:p-3 hover:bg-white/10 rounded-lg sm:rounded-2xl transition-all text-neutral-400 hover:text-white flex-shrink-0"
                  >
                    <X size={24} className="sm:w-7 sm:h-7" />
                  </button>
                </div>
              </div>

              {/* Contenido Principal - Responsive */}
              <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-5 overflow-y-auto p-4 sm:gap-6 sm:p-6 md:flex-row md:items-start md:gap-8 md:p-8 lg:p-10">
                {/* Panel Izquierdo: Imagen y Estado */}
                <div className="flex w-full flex-shrink-0 flex-col gap-5 rounded-2xl border border-white/5 bg-neutral-950/40 p-4 sm:p-5 md:w-[30%] md:max-w-sm">
                  <div className="border-b border-white/5 pb-3">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                      Presentación
                    </p>
                    <p className="mt-1 text-xs text-neutral-400">
                      Imagen, disponibilidad y visibilidad del catálogo.
                    </p>
                  </div>
                  {/* Imagen - Premium */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                        Imagen
                      </label>
                    </div>
                    <div className="group relative flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-neutral-800 text-neutral-400 transition-colors hover:border-white/20 hover:text-white sm:aspect-square">
                      {formData.image ? (
                        <>
                          <img
                            src={formData.image || defaultImg}
                            onError={handleImageError}
                            className="absolute inset-0 w-full h-full object-cover transition-all"
                            alt="Producto"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent group-hover:from-black/40 transition-all" />
                          <div className="absolute inset-x-0 bottom-0 flex flex-row items-center justify-center gap-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 pb-3 pt-10 opacity-100 transition-opacity md:inset-0 md:flex-col md:bg-transparent md:p-0 md:opacity-0 md:group-hover:opacity-100">
                            <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-white/15 bg-neutral-900/80 p-2.5 transition-colors hover:bg-neutral-800">
                              <Camera
                                size={20}
                                strokeWidth={1}
                                className="sm:w-6 sm:h-6 text-violet-300"
                              />
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={handleProductImageFile}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={handleDeleteImage}
                              aria-label="Eliminar imagen del producto"
                              className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-white/15 bg-neutral-900/80 p-2.5 text-neutral-300 transition-colors hover:border-red-400/30 hover:bg-red-500/15 hover:text-red-300"
                              title="Eliminar imagen"
                            >
                              <Trash2
                                size={20}
                                className="sm:w-6 sm:h-6 text-red-300"
                              />
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="relative z-10 text-center">
                            <div className="p-2 sm:p-3 bg-violet-500/20 border border-violet-400/30 rounded-lg sm:rounded-2xl inline-block mb-2 sm:mb-3">
                              <Camera
                                size={24}
                                strokeWidth={1}
                                className="sm:w-8 sm:h-8 text-violet-400"
                              />
                            </div>
                            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] block text-white mb-2">
                              Subir Imagen
                            </span>
                            <span className="text-[7px] sm:text-[8px] text-neutral-400 block mb-2 font-bold">
                              PNG • JPG • WebP
                            </span>
                            <span className="text-[7px] sm:text-[8px] text-neutral-500 block font-semibold">
                              Click para seleccionar
                            </span>
                          </div>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="absolute inset-0 z-20 cursor-pointer opacity-0"
                            onChange={handleProductImageFile}
                          />
                        </>
                      )}
                    </div>
                  </div>

                  {/* Estado - Switch Premium */}
                  {editingId && (
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2">
                        <label className="text-[9px] sm:text-[10px] font-black uppercase text-violet-400 tracking-widest">
                          Estado
                        </label>
                      </div>
                      <div>
                        <div className="grid grid-cols-1 gap-1.5">
                          {/* Disponibilidad */}
                          <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-400">
                              Disponibilidad
                            </span>
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`text-[11px] font-semibold ${
                                  !editingProduct?.isSoldOut
                                    ? "text-emerald-400"
                                    : "text-red-400"
                                }`}
                              >
                                {editingProduct?.isSoldOut
                                  ? "Agotado"
                                  : "Disponible"}
                              </span>
                              <button
                                onClick={() => handleToggleSoldOut(editingId)}
                                className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${
                                  !editingProduct?.isSoldOut
                                    ? "bg-emerald-500"
                                    : "bg-red-500"
                                }`}
                              >
                                <span
                                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                    !editingProduct?.isSoldOut
                                      ? "translate-x-5 sm:translate-x-5.5"
                                      : "translate-x-0.5 sm:translate-x-1"
                                  }`}
                                />
                              </button>
                            </div>
                          </div>

                          {/* Archivado */}
                          <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-400">
                              Archivado
                            </span>
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`text-[11px] font-semibold ${
                                  editingProduct?.isActive
                                    ? "text-slate-400"
                                    : "text-violet-400"
                                }`}
                              >
                                {editingProduct?.isActive
                                  ? "No"
                                  : "Sí"}
                              </span>
                              <button
                                onClick={() => handleToggleArchived(editingId)}
                                aria-label="Cambiar estado de archivado"
                                className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${
                                  editingProduct?.isActive
                                    ? "bg-neutral-700"
                                    : "bg-violet-500"
                                }`}
                              >
                                <span
                                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                    editingProduct?.isActive
                                      ? "translate-x-0.5 sm:translate-x-1"
                                      : "translate-x-5 sm:translate-x-5.5"
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 border-t border-white/5 pt-4">
                    <label className="text-[9px] font-semibold uppercase tracking-wider text-neutral-400">
                      Stock del producto ({selectedUnit?.name || "UNIDAD"})
                    </label>
                    <div className="flex items-center justify-center gap-3 rounded-xl bg-white/[0.03] p-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((current) => ({
                            ...current,
                            stock: Math.max(
                              0,
                              Number(current.stock || 0) - stockStep,
                            ),
                          }))
                        }
                        aria-label="Disminuir stock del producto"
                        className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-white/5 hover:text-red-400"
                      >
                        <ArrowDownRight size={18} />
                      </button>
                      <input
                        type="number"
                        min="0"
                        step={selectedUnit?.allows_fraction ? "0.001" : "1"}
                        value={formData.stock}
                        onChange={(e) =>
                          setFormData({ ...formData, stock: e.target.value })
                        }
                        className={`w-32 appearance-none rounded-lg border border-white/10 bg-neutral-900/70 px-3 py-2 text-center text-lg font-bold tabular-nums outline-none transition focus:border-violet-400/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                          Number(formData.stock) < 0 ? "text-red-400" : "text-white"
                        }`}
                        aria-label="Stock del producto"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((current) => ({
                            ...current,
                            stock: Number(current.stock || 0) + stockStep,
                          }))
                        }
                        aria-label="Aumentar stock del producto"
                        className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-white/5 hover:text-emerald-400"
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    </div>
                    <p className="text-[9px] text-neutral-500">
                      Existencias disponibles en {selectedUnit?.name || "UNIDAD"}.
                    </p>
                  </div>
                  <div className="space-y-2 border-t border-white/5 pt-4">
                    <label
                      htmlFor="product-min-stock"
                      className="text-[9px] font-semibold uppercase tracking-wider text-neutral-400"
                    >
                      Avisar con stock igual o menor a ({selectedUnit?.name || "UNIDAD"})
                    </label>
                    <input
                      id="product-min-stock"
                      type="number"
                      min="0"
                      step="any"
                      value={formData.minStock}
                      onChange={(e) =>
                        setFormData({ ...formData, minStock: e.target.value })
                      }
                      className="w-full rounded-lg border border-white/10 bg-neutral-900/70 px-3 py-2 text-sm font-semibold text-white outline-none transition focus:border-violet-400/50"
                      aria-label="Umbral de stock bajo del producto"
                    />
                    <p className="text-[9px] text-neutral-500">
                      Usa 0 para avisar solo cuando se agote.
                    </p>
                  </div>
                </div>

                {/* Panel Derecho: Formulario */}
                <div className="flex min-w-0 flex-1 flex-col gap-5 sm:gap-6">
                  <div className="border-b border-white/5 pb-3">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                      01 · Información principal
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      Nombre, categoría y precio que verá el cliente.
                    </p>
                  </div>
                  {/* Nombre - Premium */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                        Nombre
                      </label>
                    </div>
                    <div className="relative group">
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            name: formatProductName(e.target.value),
                          })
                        }
                        className="w-full rounded-xl border border-white/10 bg-neutral-800/50 px-4 py-3 text-sm font-medium text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-violet-400/50 focus:bg-neutral-800"
                        placeholder="EJ: BUÑUELO QUESO"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="product-unit"
                      className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400"
                    >
                      Unidad de venta
                    </label>
                    <select
                      id="product-unit"
                      value={formData.unitId}
                      onChange={(event) =>
                        setFormData({
                          ...formData,
                          unitId: event.target.value,
                        })
                      }
                      className="w-full rounded-xl border border-white/10 bg-neutral-800/50 px-3 py-3 text-xs font-medium text-white outline-none transition-colors focus:border-violet-400/50 focus:bg-neutral-800"
                      required
                    >
                      <option value="" disabled>
                        Selecciona una unidad
                      </option>
                      {units.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.description
                            ? `${unit.name} · ${unit.description}`
                            : unit.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-[9px] text-neutral-500">
                      El precio y el stock se registran en esta unidad.
                    </p>
                  </div>

                  {/* Precio y Categoría */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center gap-2">
                        <label className="truncate text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                          Precio (COP / {selectedUnit?.name || "UNIDAD"})
                        </label>
                      </div>
                      <div className="relative group">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 font-bold text-sm">
                          $
                        </span>
                        <input
                          type="text"
                          value={
                            formData.price
                              ? parseInt(formData.price).toLocaleString("es-CO")
                              : ""
                          }
                          onChange={(e) => {
                            const valor = e.target.value.replace(/\D/g, "");
                            setFormData({ ...formData, price: valor });
                          }}
                          className="w-full rounded-xl border border-white/10 bg-neutral-800/50 py-3 pl-9 pr-4 text-sm font-medium tabular-nums text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-violet-400/50 focus:bg-neutral-800"
                          placeholder="3000"
                        />
                      </div>
                    </div>
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center gap-2">
                        <label className="truncate text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                          Categoría
                        </label>
                      </div>
                      <select
                        value={formData.categoryId}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            categoryId: e.target.value,
                            category:
                              categoryRecords.find(
                                (category) => category.id === e.target.value,
                              )?.name || "",
                          })
                        }
                        className="w-full rounded-xl border border-white/10 bg-neutral-800/50 px-3 py-3 text-xs font-medium text-white outline-none transition-colors focus:border-violet-400/50 focus:bg-neutral-800"
                      >
                        <option value="">Selecciona una categoría</option>
                        {categoryRecords.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                      {!quickCategoryOpen ? (
                        <button
                          type="button"
                          onClick={() => setQuickCategoryOpen(true)}
                          className="mt-2 inline-flex items-center gap-1 rounded-md px-1 py-1 text-[10px] font-medium text-violet-300 transition hover:bg-violet-400/10 hover:text-violet-200"
                        >
                          <Plus size={13} />
                          Crear categoría aquí
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
                                handleQuickCategoryCreate();
                              }
                            }}
                            placeholder="Nombre de la categoría"
                            aria-label="Nombre de la nueva categoría"
                            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-neutral-800/70 px-3 py-2 text-xs text-white outline-none transition-colors focus:border-violet-400/50"
                          />
                          <button
                            type="button"
                            disabled={savingQuickCategory}
                            onClick={handleQuickCategoryCreate}
                            className="rounded-lg bg-violet-600 px-3 py-2 text-[10px] font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
                          >
                            {savingQuickCategory ? "..." : "Crear"}
                          </button>
                          <button
                            type="button"
                            disabled={savingQuickCategory}
                            onClick={() => {
                              setQuickCategoryOpen(false);
                              setQuickCategoryName("");
                            }}
                            aria-label="Cancelar creación de categoría"
                            className="rounded-lg border border-white/10 px-2 py-2 text-neutral-400 hover:bg-white/5 disabled:opacity-50"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                        Descripción
                      </label>
                    </div>
                    <textarea
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          description: formatSentenceInput(e.target.value),
                        })
                      }
                      className="min-h-24 w-full resize-y rounded-xl border border-white/10 bg-neutral-800/50 px-4 py-3 text-sm font-medium text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-violet-400/50 focus:bg-neutral-800"
                      placeholder="Descripción del producto..."
                    />
                  </div>

                  <div className="order-3 space-y-5 border-t border-white/10 pt-5">
                    <div className="border-b border-white/10 pb-4 pt-2">
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300">
                        03 · Inventario
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        Stock del producto e insumos que consume.
                      </p>
                    </div>

                    <div className="space-y-4 rounded-2xl border border-white/5 bg-neutral-950/30 p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-xs font-bold text-neutral-100">
                            Consumo de insumos
                          </h3>
                          <p className="mt-1 text-[10px] text-neutral-500">
                            Cantidad que se descuenta por cada{" "}
                            {selectedUnit?.name || "unidad"} vendida.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setQuickInventoryForm("category");
                            setQuickInventoryCategoryLocked(false);
                            setQuickInventoryError("");
                          }}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-emerald-300 transition hover:bg-emerald-400/10 hover:text-emerald-200"
                        >
                          <Plus size={13} />
                          Nueva categoría
                        </button>
                      </div>

                      {quickInventoryForm === "category" && (
                        <form
                          onSubmit={
                            quickInventoryForm === "category"
                              ? saveInventoryCategoryQuick
                              : saveInventoryItemQuick
                          }
                          className="space-y-3 rounded-xl bg-neutral-950/50 p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[10px] font-black uppercase tracking-wide text-white">
                              {quickInventoryForm === "category"
                                ? "Crear categoría de inventario"
                                : "Crear insumo de inventario"}
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setQuickInventoryForm(null);
                                setQuickInventoryCategoryLocked(false);
                                setQuickInventoryError("");
                              }}
                              aria-label="Cancelar creación rápida"
                              className="rounded-md p-1 text-neutral-500 hover:bg-white/10 hover:text-white"
                            >
                              <X size={15} />
                            </button>
                          </div>

                          {quickInventoryForm === "category" ? (
                            <input
                              autoFocus
                              value={quickInventoryCategoryName}
                              onChange={(event) =>
                                setQuickInventoryCategoryName(event.target.value)
                              }
                              placeholder="Nombre de la categoría"
                              maxLength={80}
                              required
                              className="w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2.5 text-xs text-white outline-none placeholder:text-neutral-600 focus:border-emerald-500/50"
                            />
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                              <input
                                autoFocus
                                value={quickInventoryItem.name}
                                onChange={(event) =>
                                  setQuickInventoryItem((current) => ({
                                    ...current,
                                    name: event.target.value,
                                  }))
                                }
                                placeholder="Nombre del insumo"
                                maxLength={100}
                                required
                                className="w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2.5 text-xs text-white outline-none placeholder:text-neutral-600 focus:border-emerald-500/50"
                              />
                              {quickInventoryCategoryLocked ? (
                                <div className="flex min-h-10 items-center rounded-lg bg-neutral-900 px-3 text-xs font-semibold text-neutral-300">
                                  Categoría:{" "}
                                  {inventoryCategories.find(
                                    (category) =>
                                      category.id === quickInventoryItem.categoryId,
                                  )?.name || "Seleccionada"}
                                </div>
                              ) : (
                                <select
                                  value={quickInventoryItem.categoryId}
                                  required
                                  onChange={(event) =>
                                    setQuickInventoryItem((current) => ({
                                      ...current,
                                      categoryId: event.target.value,
                                    }))
                                  }
                                  className="w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500/50"
                                >
                                  <option value="">Seleccionar categoría</option>
                                  {inventoryCategories.map((category) => (
                                    <option key={category.id} value={category.id}>
                                      {category.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                              <select
                                value={quickInventoryItem.unit}
                                required
                                onChange={(event) =>
                                  setQuickInventoryItem((current) => ({
                                    ...current,
                                    unit: event.target.value,
                                  }))
                                }
                                className="w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500/50 sm:col-span-2"
                              >
                                <option value="">Seleccionar unidad</option>
                                {units.map((unit) => (
                                  <option key={unit.id} value={unit.name}>
                                    {unit.name}
                                  </option>
                                ))}
                              </select>
                              <label className="flex flex-col gap-1 text-[9px] font-black uppercase tracking-wide text-neutral-500 sm:col-span-2">
                                Stock inicial
                                <input
                                  type="number"
                                  min="0"
                                  step={
                                    units.find(
                                      (unit) =>
                                        unit.name.toUpperCase() ===
                                        quickInventoryItem.unit.toUpperCase(),
                                    )?.allows_fraction
                                      ? "0.001"
                                      : "1"
                                  }
                                  value={quickInventoryItem.stock}
                                  onChange={(event) =>
                                    setQuickInventoryItem((current) => ({
                                      ...current,
                                      stock: event.target.value,
                                    }))
                                  }
                                  required
                                  className="w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2.5 text-xs font-normal normal-case text-white outline-none focus:border-emerald-500/50"
                                  aria-label="Stock inicial del insumo"
                                />
                              </label>
                            </div>
                          )}

                          {quickInventoryError && (
                            <p role="alert" className="text-[10px] text-amber-300">
                              {quickInventoryError}
                            </p>
                          )}
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setQuickInventoryForm(null);
                                setQuickInventoryCategoryLocked(false);
                                setQuickInventoryError("");
                              }}
                              disabled={savingQuickInventory}
                              className="rounded-lg px-3 py-2 text-[9px] font-bold uppercase text-neutral-400 hover:bg-white/5 disabled:opacity-50"
                            >
                              Cancelar
                            </button>
                            <button
                              type="submit"
                              disabled={savingQuickInventory}
                              className="rounded-lg bg-emerald-600 px-3 py-2 text-[9px] font-black uppercase text-white hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-50"
                            >
                              {savingQuickInventory
                                ? "Guardando..."
                                : quickInventoryForm === "category"
                                  ? "Crear categoría"
                                  : "Crear insumo"}
                            </button>
                          </div>
                        </form>
                      )}

                      <div className="max-h-80 divide-y divide-white/5 overflow-y-auto rounded-xl bg-neutral-950/25 px-2">
                        {inventoryIngredientSections.length === 0 && (
                          <p className="px-4 py-4 text-center text-[10px] text-neutral-500">
                            Aún no hay categorías. Crea una para organizar los insumos.
                          </p>
                        )}
                        {inventoryIngredientSections.map(
                          ({ id: categoryId, name: categoryName, ingredients }) => {
                              const expanded =
                                expandedIngredientCategories.has(categoryId);
                              const selectedCount = ingredients.reduce(
                                (count, ingredient) =>
                                  count +
                                  Number(
                                    selectedIngredientsById.has(ingredient.id),
                                  ),
                                0,
                              );
                              return (
                                <div
                                  key={categoryId}
                                  className="py-1"
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedIngredientCategories(
                                        (current) => {
                                          const next = new Set(current);
                                          if (next.has(categoryId))
                                            next.delete(categoryId);
                                          else next.add(categoryId);
                                          return next;
                                        },
                                      )
                                    }
                                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
                                    aria-expanded={expanded}
                                  >
                                    <span className="flex min-w-0 items-center gap-2">
                                      <ChevronDown
                                        size={14}
                                        className={`shrink-0 text-neutral-500 transition-transform ${expanded ? "rotate-180" : ""}`}
                                      />
                                      <span className="truncate text-xs font-semibold text-neutral-200">
                                        {categoryName}
                                      </span>
                                    </span>
                                    <span
                                      className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium ${
                                        selectedCount > 0
                                          ? "bg-emerald-400/10 text-emerald-300"
                                          : "bg-white/[0.04] text-neutral-500"
                                      }`}
                                    >
                                      {selectedCount > 0
                                        ? `${selectedCount} de ${ingredients.length} seleccionado${selectedCount === 1 ? "" : "s"}`
                                        : `${ingredients.length} insumo${ingredients.length === 1 ? "" : "s"}`}
                                    </span>
                                  </button>
                                  {expanded && (
                                    <div className="space-y-2 px-2 pb-3 pt-1">
                                      <div className="space-y-1.5">
                                        {ingredients.map((ingredient) => {
                                          const selected =
                                            selectedIngredientsById.get(
                                              ingredient.id,
                                            );
                                          return (
                                            <div
                                              key={ingredient.id}
                                              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${
                                                selected
                                                  ? "bg-emerald-400/[0.07]"
                                                  : "bg-white/[0.025]"
                                              }`}
                                            >
                                              <input
                                                type="checkbox"
                                                checked={Boolean(selected)}
                                                onChange={() =>
                                                  toggleProductIngredient(
                                                    ingredient.id,
                                                  )
                                                }
                                                className="h-4 w-4 shrink-0 accent-emerald-500"
                                                aria-label={`Descontar insumo ${ingredient.name}`}
                                              />
                                              <div className="min-w-0 flex-1">
                                                <p className="truncate text-xs font-bold text-white">
                                                  {ingredient.name}
                                                </p>
                                                <p className="text-[9px] uppercase tracking-wide text-neutral-500">
                                                  Stock actual: {ingredient.stock}{" "}
                                                  {ingredient.unit}
                                                </p>
                                              </div>
                                              {selected && (
                                                <label className="flex shrink-0 items-center gap-1.5 text-[9px] font-black uppercase text-neutral-500">
                                                  Cant. {ingredient.unit}
                                                  <input
                                                    type="number"
                                                    min="0.001"
                                                    step="0.001"
                                                    value={selected.quantity}
                                                    onChange={(event) =>
                                                      updateProductIngredientQuantity(
                                                        ingredient.id,
                                                        event.target.value,
                                                      )
                                                    }
                                                    className="w-20 rounded-lg border border-white/10 bg-neutral-900 px-2 py-1.5 text-center text-xs font-bold text-white outline-none focus:border-emerald-500/50"
                                                    aria-label={`Consumo de ${ingredient.name} por cada ${selectedUnit?.name || "unidad"} vendida, en ${ingredient.unit}`}
                                                  />
                                                </label>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                      <div className="mt-2 flex justify-end">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setQuickInventoryForm("item");
                                            setQuickInventoryCategoryLocked(true);
                                            setQuickInventoryError("");
                                            setQuickInventoryItem((current) => ({
                                              ...current,
                                              name: "",
                                              stock: "",
                                              categoryId,
                                              unit:
                                                current.unit ||
                                                units.find(
                                                  (unit) =>
                                                    unit.name.toUpperCase() ===
                                                    "UNIDAD",
                                                )?.name ||
                                                units[0]?.name ||
                                                "",
                                            }));
                                          }}
                                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-emerald-300 transition hover:bg-emerald-400/10 hover:text-emerald-200"
                                        >
                                          <Plus size={13} />
                                          Crear insumo aquí
                                        </button>
                                      </div>
                                      {renderQuickInventoryItemForm(
                                        categoryId,
                                        categoryName,
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                          },
                        )}
                      </div>

                    </div>
                  </div>

                  {/* Opciones y variaciones del producto */}
                  <div className="order-2 space-y-5 border-t border-white/10 pt-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10  pb-4 pt-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <label className="text-[9px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                            02 · Variables del producto
                          </label>
                        </div>
                        <p className="mt-1 text-[10px] text-neutral-500">
                          Opciones que el cliente podrá elegir al comprar.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={addOptionGroup}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-semibold text-violet-300 transition-colors hover:bg-violet-400/10 hover:text-violet-200"
                      >
                        <Plus size={13} />
                        Agregar variable
                      </button>
                    </div>

                    {optionsLoading ? (
                      <div className="flex items-center justify-center gap-2 rounded-xl bg-white/[0.03] px-3 py-5">
                        {[0, 1, 2].map((dot) => (
                          <span
                            key={dot}
                            className="h-2 w-2 animate-pulse rounded-full bg-violet-400"
                            style={{ animationDelay: `${dot * 150}ms` }}
                          />
                        ))}
                      </div>
                    ) : optionGroups.length === 0 ? (
                      <div className="rounded-xl bg-white/[0.025] px-4 py-5 text-center">
                        <p className="text-[11px] font-semibold text-neutral-300">
                          Este producto no tiene opciones todavía.
                        </p>
                        <p className="mt-1 text-[10px] text-neutral-600">
                          Agrega un grupo para crear variaciones seleccionables.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {optionGroups.map((group, groupIndex) => (
                          <div
                            key={group.id}
                            className="overflow-hidden rounded-xl border border-white/5 bg-neutral-950/30"
                          >
                            <div className="flex items-center gap-2 px-3 transition-colors hover:bg-white/[0.03] sm:px-4">
                              <button
                                type="button"
                                onClick={() => toggleOptionGroup(group.id)}
                                className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 text-left transition-colors"
                                aria-expanded={expandedOptionGroups.has(
                                  group.id,
                                )}
                              >
                                <span className="flex min-w-0 items-start gap-2">
                                  <ChevronRight
                                    size={15}
                                    className={`mt-0.5 shrink-0 text-neutral-500 transition-transform ${
                                      expandedOptionGroups.has(group.id)
                                        ? "rotate-90"
                                        : ""
                                    }`}
                                    aria-hidden="true"
                                  />
                                  <span className="min-w-0">
                                    <span className="block truncate text-xs font-semibold text-neutral-100">
                                      {group.name || `Grupo ${groupIndex + 1}`}
                                    </span>
                                    <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-neutral-500">
                                      <span>
                                        {group.items.length}{" "}
                                        {group.items.length === 1
                                          ? "opción"
                                          : "opciones"}
                                      </span>
                                      <span aria-hidden="true">·</span>
                                      <span>
                                        {group.is_required
                                          ? "Obligatorio"
                                          : "Opcional"}
                                      </span>
                                      <span aria-hidden="true">·</span>
                                      <span>
                                        {group.selection_type === "multiple"
                                          ? "Varias opciones"
                                          : "Una opción"}
                                      </span>
                                    </span>
                                  </span>
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  confirmRemoveOptionGroup(group.id, group.name)
                                }
                                className="shrink-0 rounded-lg p-2 text-neutral-500 transition-colors hover:bg-red-500/10 hover:text-red-300"
                                aria-label={`Eliminar grupo ${group.name || groupIndex + 1}`}
                                title="Quitar grupo"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>

                            {expandedOptionGroups.has(group.id) && (
                              <div className="border-t border-white/5 bg-white/[0.01] p-3 sm:p-4">
                                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px] sm:items-center">
                                  <div className="space-y-1.5">
                                    <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-neutral-500 ">
                                      Grupo {groupIndex + 1}
                                    </label>
                                    <input
                                      value={group.name}
                                      onChange={(event) =>
                                        updateOptionGroup(group.id, {
                                          name: formatSentenceInput(
                                            event.target.value,
                                          ),
                                        })
                                      }
                                      placeholder="Ej: Tipo de leche"
                                      className="w-full rounded-lg border border-white/10 bg-neutral-800/60 px-3 py-2.5 text-xs font-medium text-white outline-none transition-colors focus:border-violet-400/50"
                                    />
                                    <p className="text-[9px] leading-4 text-neutral-600">
                                      Ejemplo: Color, Talla, Material o Tipo.
                                    </p>
                                  </div>
                                  <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg text-[10px] font-bold uppercase tracking-wide text-neutral-400 transition-colors justify-self-end">
                                    <input
                                      type="checkbox"
                                      checked={group.is_required}
                                      onChange={(event) =>
                                        updateOptionGroup(group.id, {
                                          is_required: event.target.checked,
                                        })
                                      }
                                      aria-label="Grupo obligatorio"
                                      className="peer sr-only"
                                    />
                                    Obligatorio
                                    <span className="relative inline-flex h-6 w-10 items-center rounded-full bg-neutral-700  transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-violet-400/50 peer-checked:bg-violet-500 peer-checked:shadow-violet-500/50 sm:h-7 sm:w-12 after:inline-block after:h-4 after:w-4 after:translate-x-0.5 after:transform after:rounded-full after:bg-white after:shadow-md after:transition-all peer-checked:after:translate-x-5 sm:after:h-5 sm:after:w-5 sm:after:translate-x-1 sm:peer-checked:after:translate-x-5.5" />
                                  </label>
                                </div>

                                <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px] sm:items-start">
                                  <div>
                                    <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-neutral-500">
                                      Descripción
                                    </label>
                                    <input
                                      value={group.description}
                                      onChange={(event) =>
                                        updateOptionGroup(group.id, {
                                          description: formatSentenceInput(
                                            event.target.value,
                                          ),
                                        })
                                      }
                                      placeholder="Descripción del grupo (opcional)"
                                      className="h-9 w-full rounded-lg border border-white/10 bg-neutral-800/60 px-3 py-2 text-[11px] text-white outline-none transition-colors focus:border-violet-400/50"
                                    />
                                    <p className="mt-1 text-[9px] leading-4 text-neutral-600">
                                      Texto breve que verá el cliente. Ej: Elige
                                      una opción.
                                    </p>
                                  </div>
                                  <div className="space-y-1.5">
                                    <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-neutral-500">
                                      Selección
                                    </label>
                                    <select
                                      value={group.selection_type}
                                      onChange={(event) =>
                                        updateOptionGroup(group.id, {
                                          selection_type: event.target.value,
                                        })
                                      }
                                      className="h-9 w-full rounded-lg border border-white/10 bg-neutral-800/60 px-3 py-2 text-[11px] text-white outline-none transition-colors focus:border-violet-400/50"
                                    >
                                      <option value="single">Una opción</option>
                                      <option value="multiple">
                                        Varias opciones
                                      </option>
                                    </select>
                                    <p className="text-[9px] leading-4 text-neutral-600">
                                      Una opción para elegir una; varias para
                                      combinar.
                                    </p>
                                  </div>
                                </div>

                                <div className="mt-4 space-y-2 border-t border-white/5 pt-3">
                                  {group.items.map((item, itemIndex) => (
                                    <div
                                      key={item.id}
                                      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_162px_32px] sm:items-start"
                                    >
                                      <div className="min-w-0">
                                        <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-neutral-600 sm:hidden">
                                          Opción
                                        </label>
                                        <input
                                          value={item.nombre}
                                          onChange={(event) =>
                                            updateOptionItem(
                                              group.id,
                                              item.id,
                                              {
                                                nombre: formatSentenceInput(
                                                  event.target.value,
                                                ),
                                              },
                                            )
                                          }
                                          placeholder={`Opción ${itemIndex + 1}`}
                                          className="w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-[11px] font-semibold text-white outline-none focus:border-violet-500/50"
                                        />
                                        <p className="mt-1 text-[9px] leading-4 text-neutral-600">
                                          Ej: Rojo, Mediano, Algodón o Premium.
                                        </p>
                                      </div>
                                      <div>
                                        <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-neutral-600 sm:hidden">
                                          Precio extra
                                        </label>
                                        <div className="relative">
                                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-neutral-500">
                                            $
                                          </span>
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            value={
                                              item.precio_extra === ""
                                                ? ""
                                                : Number(
                                                    item.precio_extra || 0,
                                                  ).toLocaleString("es-CO")
                                            }
                                            onChange={(event) =>
                                              updateOptionItem(
                                                group.id,
                                                item.id,
                                                {
                                                  precio_extra:
                                                    event.target.value.replace(
                                                      /\D/g,
                                                      "",
                                                    ),
                                                },
                                              )
                                            }
                                            placeholder="0"
                                            className="w-full rounded-lg border border-white/10 bg-neutral-900 py-2 pl-7 pr-3 text-[11px] font-semibold text-white outline-none focus:border-violet-500/50"
                                          />
                                        </div>
                                        <p className="mt-1 text-[9px] leading-4 text-neutral-600">
                                          Ej: 0 si no cambia el precio, o un
                                          valor adicional.
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          removeOptionItem(group.id, item.id)
                                        }
                                        className="justify-self-end rounded-lg p-2 text-neutral-500 hover:bg-red-500/10 hover:text-red-300"
                                        aria-label={`Eliminar opción ${item.nombre || itemIndex + 1}`}
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => addOptionItem(group.id)}
                                    className="flex items-center gap-1.5 rounded-lg px-1 py-2 text-[9px] font-black uppercase tracking-wide text-violet-300 hover:text-violet-200"
                                  >
                                    <Plus size={13} />
                                    Agregar opción
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer Premium - Responsive */}
              <div className="flex flex-shrink-0 flex-wrap justify-end gap-2 border-t border-white/5 bg-neutral-900/95 px-4 py-3 sm:gap-3 sm:px-6 md:px-8">
                <button
                  onClick={handleSaveProduct}
                  disabled={
                    savingProduct ||
                    optionsLoading ||
                    !hasProductFormChanges
                  }
                  aria-busy={savingProduct}
                  className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-[10px] font-bold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40 sm:px-5"
                >
                  {savingProduct ? (
                    <LoaderCircle
                      size={16}
                      className="animate-spin sm:h-4 sm:w-4"
                      aria-hidden="true"
                    />
                  ) : (
                    <Save size={16} className="sm:w-4 sm:h-4" />
                  )}
                  <span>{savingProduct ? "Guardando..." : "Guardar"}</span>
                </button>
                <button
                  onClick={closeProductModal}
                  className="rounded-lg border border-white/10 px-4 py-2.5 text-[10px] font-semibold text-neutral-300 transition-colors hover:bg-white/5 sm:px-5"
                >
                  <span className="hidden sm:inline">Cancelar</span>
                  <span className="sm:hidden">Cerrar</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {isModalOpen && (
          <ImageCropEditor
            key={imageEditor?.url || "product-image-editor-closed"}
            imageEditor={imageEditor}
            onConfirm={applyProductImageCrop}
            onClose={() => {
              setImageEditor(null);
              setImageEditorError("");
            }}
            saving={savingProduct}
            error={imageEditorError}
            confirmLabel="Usar imagen"
          />
        )}

        {/* MODAL CONFIRMACIÓN ARCHIVAR */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
            <div className="bg-neutral-900 border border-red-500/30 w-full max-w-md rounded-3xl p-8 shadow-2xl">
              <div className="flex items-center gap-3 mb-6">
                <AlertTriangle className="text-red-500" size={28} />
                <h3 className="text-2xl font-black uppercase tracking-tight">
                  Archivar Producto
                </h3>
              </div>

              <p className="text-sm text-neutral-400 mb-8">
                ¿Estás seguro de que deseas archivar este producto? Podrás
                recuperarlo desde el filtro de archivados.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => handleDeleteProduct(deleteConfirm)}
                  className="flex-1 bg-red-500 py-3 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-red-600 transition-all"
                >
                  Archivar
                </button>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 bg-neutral-800 py-3 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] border border-white/10 hover:border-white/20 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL CONFIRMACIÓN ARCHIVAR MASIVO */}
        {bulkDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
            <div className="bg-neutral-900 border border-red-500/30 w-full max-w-md rounded-3xl p-8 shadow-2xl">
              <div className="flex items-center gap-3 mb-6">
                <AlertTriangle className="text-red-500" size={28} />
                <h3 className="text-2xl font-black uppercase tracking-tight">
                  Archivar Productos
                </h3>
              </div>

              <p className="text-sm text-neutral-400 mb-8">
                ¿Estás seguro de que deseas archivar {selectedProducts.size}{" "}
                producto{selectedProducts.size !== 1 ? "s" : ""}? Podrás
                recuperarlos desde el filtro de archivados.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={handleBulkDelete}
                  className="flex-1 bg-red-500 py-3 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-red-600 transition-all"
                >
                  Archivar
                </button>
                <button
                  onClick={() => setBulkDeleteConfirm(false)}
                  className="flex-1 bg-neutral-800 py-3 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] border border-white/10 hover:border-white/20 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {bulkPermanentDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
            <div className="bg-neutral-900 border border-red-500/30 w-full max-w-md rounded-3xl p-8 shadow-2xl">
              <div className="flex items-center gap-3 mb-6">
                <AlertTriangle className="text-red-500" size={28} />
                <h3 className="text-2xl font-black uppercase tracking-tight">
                  Eliminar Productos
                </h3>
              </div>

              <p className="text-sm text-neutral-400 mb-8">
                Esta acción es permanente para {selectedProducts.size} producto
                {selectedProducts.size !== 1 ? "s" : ""}. Los productos con
                pedidos asociados no podrán eliminarse.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={handleBulkPermanentDelete}
                  className="flex-1 bg-red-500 py-3 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-red-600 transition-all"
                >
                  Eliminar
                </button>
                <button
                  onClick={() => setBulkPermanentDeleteConfirm(false)}
                  className="flex-1 bg-neutral-800 py-3 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] border border-white/10 hover:border-white/20 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Productos;
