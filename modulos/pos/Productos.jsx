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
import { supabase } from "../../src/lib/supabaseClient";
import { useAuth } from "../../src/components/AuthContext";

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
  const [businessId, setBusinessId] = useState(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [savingProduct, setSavingProduct] = useState(false);

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

  // ======= NUEVA FUNCIÓN AGREGADA PARA LA ELIMINACIÓN EN CASCADA =======
  const handleDeleteCategoryCascade = async (categoryId) => {
    const category = categoryRecords.find((item) => item.id === categoryId);
    const { data: categoryProducts, error: productsError } = await supabase
      .from("products")
      .select("id")
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
    image: "",
  });
  const [optionGroups, setOptionGroups] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [expandedOptionGroups, setExpandedOptionGroups] = useState(new Set());
  const [availableIngredients, setAvailableIngredients] = useState([]);
  const [selectedIngredients, setSelectedIngredients] = useState([]);
  const [expandedIngredientCategories, setExpandedIngredientCategories] =
    useState(new Set());

  // Estado inicial del catálogo
  const [products, setProducts] = useState([]);

  const mapProduct = (product, categoryMap) => ({
    ...product,
    categoryId: product.category_id || "",
    category: categoryMap[product.category_id] || "Sin categoría",
    price: Number(product.price || 0),
    stock: Number(product.stock || 0),
    orderIndex: Number(product.order_index || 0),
    isActive: product.is_active !== false && product.is_active !== "false",
    isSoldOut: product.is_sold_out === true || product.is_sold_out === "true",
    image: product.image_url || "",
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
        setLoadingProducts(false);
      }

      const [
        { data: categoriesData },
        { data: productsData, error },
        { data: ingredientsData, error: ingredientsError },
        { data: ingredientCategoriesData, error: ingredientCategoriesError },
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
      ]);

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
        });
      }

      setLoadingProducts(false);
    };

    loadProducts();
  }, [user]);

  const groupedIngredients = useMemo(() => {
    return availableIngredients.reduce((groups, ingredient) => {
      const categoryName = ingredient.categoryName || "Sin categoría";
      groups[categoryName] = groups[categoryName] || [];
      groups[categoryName].push(ingredient);
      return groups;
    }, {});
  }, [availableIngredients]);

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
    setFormData({
      name: "",
      categoryId: categoryRecords[0]?.id || "",
      category: categoryRecords[0]?.name || "",
      price: "",
      description: "",
      stock: 0,
      image: "",
    });
    setOptionGroups([]);
    setSelectedIngredients([]);
    setOptionsLoading(false);
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
    }
    setOptionsLoading(false);
  };

  // Abrir modal para editar
  const handleEditProduct = (product) => {
    setEditingId(product.id);
    setFormData({
      name: formatProductName(product.name),
      categoryId: product.categoryId,
      category: product.category,
      price: product.price,
      description: formatSentenceInput(product.description),
      stock: product.stock,
      image: product.image,
    });
    setOptionGroups([]);
    setExpandedOptionGroups(new Set());
    loadProductIngredients(product.id);
    loadProductOptions(product.id);
    setIsModalOpen(true);
  };

  const closeProductModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
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
      return;
    }

    setSelectedIngredients(
      (data || []).map((ingredient) => ({
        inventoryItemId: ingredient.inventory_item_id,
        quantity: Number(ingredient.quantity || 1),
      })),
    );
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

    setSavingProduct(true);
    const payload = {
      name: formatProductNameForStorage(formData.name),
      category_id: formData.categoryId,
      price: Number(formData.price),
      description: formatStoredText(formData.description),
      stock: Number(formData.stock) || 0,
      image_url: formData.image || null,
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
      alert("No se pudo guardar el producto");
    } else {
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
    setProducts((current) =>
      current.filter((product) => !selectedProducts.has(product.id)),
    );
    setSelectedProducts(new Set());
    setBulkPermanentDeleteConfirm(false);
    setBulkActionsOpen(false);
  };

  const categoriesList = ["todos", ...new Set(products.map((p) => p.category))];

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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
          {loadingProducts ? (
            <div className="col-span-full flex items-center justify-center gap-2 py-20">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="h-2 w-2 animate-pulse rounded-full bg-blue-400"
                  style={{ animationDelay: `${dot * 150}ms` }}
                />
              ))}
            </div>
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
                          : !item.isSoldOut
                            ? "bg-emerald-500 text-fff border-emerald-500/30"
                            : "bg-red-500 text-red-fff border-red-500/30"
                      }`}
                    >
                      {!item.isActive
                        ? "Archivado"
                        : !item.isSoldOut
                          ? "Activo"
                          : "Agotado"}
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

                  {/* Stock visible sobre la imagen, en la esquina inferior izquierda */}
                  <div className="absolute bottom-2 left-2 rounded-full border border-white/15 bg-black/75 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur-sm">
                    Stock:{" "}
                    {Number(item.stock || 0) > 99
                      ? "99+"
                      : Number(item.stock || 0)}
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
          <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl overflow-y-auto">
            <div className="min-h-screen w-full bg-neutral-900 overflow-hidden flex flex-col">
              {/* Header Premium - Responsive */}
              <div className="relative overflow-hidden flex-shrink-0">
                <div className="relative mx-auto flex w-full max-w-7xl items-start justify-between gap-3 border-b border-white/10 px-4 py-5 sm:px-8 sm:py-3 md:px-12">
                  <div className="flex items-center gap-2 sm:gap-3 md:gap-4 min-w-0">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/10">
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
                      <h2 className="text-xl font-black uppercase leading-tight tracking-tight text-white sm:text-3xl">
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
              <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-8 md:flex-row md:gap-10 md:p-12">
                {/* Panel Izquierdo: Imagen y Estado */}
                <div className="flex w-full flex-shrink-0 flex-col gap-4 rounded-3xl border border-white/10 bg-black/20 p-4 sm:gap-6 sm:p-6 md:w-[31%]">
                  <div className="border-b border-white/10 pb-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-500">
                      Presentación
                    </p>
                    <p className="mt-1 text-xs text-neutral-400">
                      Imagen, disponibilidad y visibilidad del catálogo.
                    </p>
                  </div>
                  {/* Imagen - Premium */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-[9px] sm:text-[10px] font-black uppercase text-violet-400 tracking-widest">
                        Imagen
                      </label>
                    </div>
                    <div className="relative group cursor-pointer rounded-2xl sm:rounded-3xl overflow-hidden bg-gradient-to-br from-neutral-700 to-neutral-800 border border-violet-500/20 hover:border-violet-500/50 transition-all aspect-square flex items-center justify-center flex-col gap-3 sm:gap-4 text-neutral-500 hover:text-white shadow-xl sm:shadow-2xl shadow-violet-500/5 hover:shadow-violet-500/20">
                      {formData.image ? (
                        <>
                          <img
                            src={formData.image || defaultImg}
                            onError={handleImageError}
                            className="absolute inset-0 w-full h-full object-cover transition-all"
                            alt="Producto"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent group-hover:from-black/40 transition-all" />
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <label className="p-2 sm:p-3 bg-violet-500/30 hover:bg-violet-500/50 border border-violet-400/30 rounded-lg sm:rounded-2xl inline-flex items-center justify-center cursor-pointer transition-all">
                              <Camera
                                size={20}
                                strokeWidth={1}
                                className="sm:w-6 sm:h-6 text-violet-300"
                              />
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  if (e.target.files?.[0]) {
                                    const reader = new FileReader();
                                    reader.onload = (evt) => {
                                      setFormData({
                                        ...formData,
                                        image: evt.target?.result,
                                      });
                                    };
                                    reader.readAsDataURL(e.target.files[0]);
                                  }
                                }}
                              />
                            </label>
                            <button
                              onClick={handleDeleteImage}
                              className="p-2 sm:p-3 bg-red-500/30 hover:bg-red-500/50 border border-red-400/30 rounded-lg sm:rounded-2xl inline-flex items-center justify-center cursor-pointer transition-all"
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
                              PNG • JPG • GIF • WebP
                            </span>
                            <span className="text-[7px] sm:text-[8px] text-neutral-500 block font-semibold">
                              Click para seleccionar
                            </span>
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={(e) => {
                              if (e.target.files?.[0]) {
                                const reader = new FileReader();
                                reader.onload = (evt) => {
                                  setFormData({
                                    ...formData,
                                    image: evt.target?.result,
                                  });
                                };
                                reader.readAsDataURL(e.target.files[0]);
                              }
                            }}
                          />
                        </>
                      )}
                    </div>
                  </div>

                  {/* Estado - Switch Premium */}
                  {editingId && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <label className="text-[9px] sm:text-[10px] font-black uppercase text-violet-400 tracking-widest">
                          Estado
                        </label>
                      </div>
                      <div className="">
                        <div className="grid grid-cols-2 gap-1.5 sm:gap-3">
                          {/* Disponibilidad */}
                          <div className="flex flex-col justify-center items-center gap-1.5">
                            <span className="text-[7px] sm:text-[7px] font-bold text-neutral-500 uppercase tracking-widest ">
                              Disponibilidad
                            </span>
                            <div className="flex items-center gap-3">
                              <span
                                className={`text-[14px] sm:text-xs font-black ${
                                  !products.find((p) => p.id === editingId)
                                    ?.isSoldOut
                                    ? "text-emerald-400"
                                    : "text-red-400"
                                }`}
                              >
                                {products.find((p) => p.id === editingId)
                                  ?.isSoldOut
                                  ? "Agotado"
                                  : "Disponible"}
                              </span>
                              <button
                                onClick={() => handleToggleSoldOut(editingId)}
                                className={`relative inline-flex h-6 sm:h-7 w-10 sm:w-12 items-center rounded-full transition-all cursor-pointer shadow-lg ${
                                  !products.find((p) => p.id === editingId)
                                    ?.isSoldOut
                                    ? "bg-emerald-500 shadow-emerald-500/50"
                                    : "bg-red-500 shadow-red-500/50"
                                }`}
                              >
                                <span
                                  className={`inline-block h-4 sm:h-5 w-4 sm:w-5 transform rounded-full bg-white transition-all shadow-md ${
                                    !products.find((p) => p.id === editingId)
                                      ?.isSoldOut
                                      ? "translate-x-5 sm:translate-x-5.5"
                                      : "translate-x-0.5 sm:translate-x-1"
                                  }`}
                                />
                              </button>
                            </div>
                          </div>

                          {/* Archivado */}
                          <div className="flex flex-col justify-center items-center gap-1.5">
                            <span className="text-[7px] sm:text-[7px] font-bold text-neutral-500 uppercase tracking-widest">
                              Archivado
                            </span>
                            <div className="flex items-center gap-3">
                              <span
                                className={`text-[14px] sm:text-xs font-black ${
                                  products.find((p) => p.id === editingId)
                                    ?.isActive
                                    ? "text-slate-400"
                                    : "text-violet-400"
                                }`}
                              >
                                {products.find((p) => p.id === editingId)
                                  ?.isActive
                                  ? "No"
                                  : "Sí"}
                              </span>
                              <button
                                onClick={() => handleToggleArchived(editingId)}
                                aria-label="Cambiar estado de archivado"
                                className={`relative inline-flex h-6 sm:h-7 w-10 sm:w-12 items-center rounded-full transition-all cursor-pointer shadow-lg ${
                                  products.find((p) => p.id === editingId)
                                    ?.isActive
                                    ? "bg-neutral-700 shadow-neutral-700/40"
                                    : "bg-violet-500 shadow-violet-500/50"
                                }`}
                              >
                                <span
                                  className={`inline-block h-4 sm:h-5 w-4 sm:w-5 transform rounded-full bg-white transition-all shadow-md ${
                                    products.find((p) => p.id === editingId)
                                      ?.isActive
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

                  <div className="space-y-2 border-t border-white/10 pt-4">
                    <label className="text-[9px] font-black uppercase tracking-widest text-emerald-300">
                      Stock del producto
                    </label>
                    <div className="flex items-center justify-center gap-4 rounded-xl bg-neutral-800/40 p-3">
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            stock: Math.max(0, Number(formData.stock || 0) - 1),
                          })
                        }
                        aria-label="Disminuir stock del producto"
                        className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-700 hover:text-red-400"
                      >
                        <ArrowDownRight size={18} />
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={formData.stock}
                        onChange={(e) =>
                          setFormData({ ...formData, stock: e.target.value })
                        }
                        className="w-28 rounded-lg border border-white/10 bg-neutral-700 px-3 py-2 text-center text-xl font-black outline-none focus:border-emerald-500/50"
                        aria-label="Stock del producto"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            stock: Number(formData.stock || 0) + 1,
                          })
                        }
                        aria-label="Aumentar stock del producto"
                        className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-700 hover:text-emerald-400"
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    </div>
                    <p className="text-[9px] text-neutral-500">
                      Unidades disponibles para vender.
                    </p>
                  </div>
                </div>

                {/* Panel Derecho: Formulario */}
                <div className="flex min-w-0 flex-1 flex-col gap-5 sm:gap-7">
                  <div className="border-b border-white/10 pb-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-300">
                      01 · Información principal
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      Nombre, categoría y precio que verá el cliente.
                    </p>
                  </div>
                  {/* Nombre - Premium */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-[9px] sm:text-[10px] font-black uppercase text-violet-400 tracking-widest">
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
                        className="w-full bg-gradient-to-r from-neutral-700/30 to-neutral-800/30 border border-neutral-600/50 group-focus-within:border-violet-500/50 rounded-lg sm:rounded-2xl py-3 sm:py-4 px-4 sm:px-5 text-xs sm:text-sm font-bold tracking-wide focus:outline-none transition-all placeholder:text-neutral-600"
                        placeholder="EJ: BUÑUELO QUESO"
                      />
                    </div>
                  </div>

                  {/* Precio y Categoría */}
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center gap-2">
                        <label className="text-[9px] sm:text-[10px] font-black uppercase text-violet-400 tracking-widest truncate">
                          Precio (COP)
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
                          className="w-full bg-gradient-to-r from-neutral-700/30 to-neutral-800/30 border border-neutral-600/50 group-focus-within:border-violet-500/50 rounded-lg sm:rounded-2xl py-3 sm:py-4 pl-9 sm:pl-11 pr-4 sm:pr-5 text-xs sm:text-sm font-bold uppercase tracking-widest focus:outline-none transition-all placeholder:text-neutral-600"
                          placeholder="3000"
                        />
                      </div>
                    </div>
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center gap-2">
                        <label className="text-[9px] sm:text-[10px] font-black uppercase text-violet-400 tracking-widest truncate">
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
                        className="w-full bg-gradient-to-r from-neutral-700/30 to-neutral-800/30 border border-neutral-600/50 focus:border-violet-500/50 rounded-lg sm:rounded-2xl py-3 sm:py-4 px-4 sm:px-5 text-xs sm:text-sm font-bold uppercase tracking-widest focus:outline-none transition-all"
                      >
                        {categoryRecords.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2">
                      <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-violet-400">
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
                      className="min-h-24 w-full resize-y rounded-lg border border-neutral-600/50 bg-gradient-to-r from-neutral-700/30 to-neutral-800/30 px-4 py-3 text-xs font-bold tracking-wide outline-none transition-all placeholder:text-neutral-600 focus:border-violet-500/50 sm:rounded-2xl sm:px-5 sm:py-4 sm:text-sm"
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

                    <div className="space-y-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4 shadow-[0_12px_40px_rgba(16,185,129,0.05)] sm:p-5">
                      <div>
                        <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-emerald-400">
                          Insumos descontados por unidad
                        </label>
                        <p className="mt-1 text-[10px] text-neutral-500">
                          Selecciona los insumos que consume cada unidad
                          vendida.
                        </p>
                      </div>

                      {availableIngredients.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-white/10 px-4 py-4 text-center text-[10px] text-neutral-500">
                          Primero crea insumos en Inventario.
                        </p>
                      ) : (
                        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                          {Object.entries(groupedIngredients).map(
                            ([categoryName, ingredients]) => {
                              const expanded =
                                expandedIngredientCategories.has(categoryName);
                              const selectedCount = ingredients.filter(
                                (ingredient) =>
                                  selectedIngredients.some(
                                    (item) =>
                                      item.inventoryItemId === ingredient.id,
                                  ),
                              ).length;
                              return (
                                <div
                                  key={categoryName}
                                  className="overflow-hidden rounded-xl border border-white/10 bg-neutral-950/50"
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedIngredientCategories(
                                        (current) => {
                                          const next = new Set(current);
                                          if (next.has(categoryName))
                                            next.delete(categoryName);
                                          else next.add(categoryName);
                                          return next;
                                        },
                                      )
                                    }
                                    className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-white/[0.04]"
                                    aria-expanded={expanded}
                                  >
                                    <span className="flex min-w-0 items-center gap-2">
                                      <ChevronDown
                                        size={15}
                                        className={`shrink-0 text-emerald-300 transition-transform ${expanded ? "rotate-180" : ""}`}
                                      />
                                      <span className="truncate text-xs font-black uppercase tracking-wide text-white">
                                        {categoryName}
                                      </span>
                                    </span>
                                    <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-neutral-500">
                                      {selectedCount > 0
                                        ? `${selectedCount} seleccionado${selectedCount === 1 ? "" : "s"}`
                                        : `${ingredients.length} insumo${ingredients.length === 1 ? "" : "s"}`}
                                    </span>
                                  </button>
                                  {expanded && (
                                    <div className="space-y-2 border-t border-white/5 p-2">
                                      {ingredients.map((ingredient) => {
                                        const selected =
                                          selectedIngredients.find(
                                            (item) =>
                                              item.inventoryItemId ===
                                              ingredient.id,
                                          );
                                        return (
                                          <div
                                            key={ingredient.id}
                                            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                                              selected
                                                ? "border-emerald-500/30 bg-emerald-500/10"
                                                : "border-white/10 bg-neutral-900/60"
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
                                                Cant.
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
                                                  aria-label={`Consumo de ${ingredient.name} por unidad`}
                                                />
                                              </label>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            },
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Opciones y variaciones del producto */}
                  <div className="order-2 space-y-5 border-t border-white/10 pt-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10  pb-4 pt-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <label className="text-[9px] font-black uppercase tracking-widest text-neutral-300 sm:text-[10px]">
                            02 · Variables del producto
                          </label>
                        </div>
                        <p className="mt-1 text-[10px] text-neutral-500">
                          Estás en la sección de variables. Crea opciones que el
                          cliente podrá elegir, como tamaño, sabor o tipo.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={addOptionGroup}
                        className="flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-[9px] font-black uppercase tracking-wide text-violet-300 transition-all hover:bg-violet-500/20 active:scale-95"
                      >
                        <Plus size={13} />
                        Agregar variable
                      </button>
                    </div>

                    {optionsLoading ? (
                      <div className="flex items-center justify-center gap-2 rounded-xl border border-white/5 bg-black/10 px-3 py-5">
                        {[0, 1, 2].map((dot) => (
                          <span
                            key={dot}
                            className="h-2 w-2 animate-pulse rounded-full bg-blue-400"
                            style={{ animationDelay: `${dot * 150}ms` }}
                          />
                        ))}
                      </div>
                    ) : optionGroups.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center">
                        <p className="text-[11px] font-bold text-neutral-400">
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
                            className="overflow-hidden rounded-xl border border-white/10 bg-neutral-950/50"
                          >
                            <div className="flex items-center gap-2 px-3 sm:px-4 hover:bg-white/[0.03]">
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
                                    className={`mt-0.5 shrink-0 text-violet-300 transition-transform ${
                                      expandedOptionGroups.has(group.id)
                                        ? "rotate-90"
                                        : ""
                                    }`}
                                    aria-hidden="true"
                                  />
                                  <span className="min-w-0">
                                    <span className="block truncate text-xs font-black text-white">
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
                              <div className="border-t border-white/5 p-3 sm:p-4">
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
                                      className="w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2.5 text-xs font-bold text-white outline-none transition-all focus:border-violet-500/50"
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
                                      className="h-9 w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-[11px] font-semibold text-white outline-none focus:border-violet-500/50"
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
                                      className="h-9 w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-[11px] font-semibold text-white outline-none focus:border-violet-500/50"
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
              <div className="border-t border-violet-500/10 bg-gradient-to-t from-neutral-900/80 to-transparent px-4 sm:px-6 md:px-8 py-4 sm:py-5 md:py-6 flex gap-2 sm:gap-3 justify-end flex-wrap flex-shrink-0">
                <button
                  onClick={handleSaveProduct}
                  disabled={savingProduct}
                  aria-busy={savingProduct}
                  className="px-4 sm:px-8 py-2.5 sm:py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-lg sm:rounded-xl font-black uppercase text-[9px] sm:text-[10px] tracking-[0.2em] sm:tracking-[0.3em] flex items-center gap-1.5 sm:gap-2 hover:from-violet-600 hover:to-purple-700 transition-all shadow-xl shadow-violet-500/30 active:scale-95 disabled:cursor-wait disabled:opacity-75"
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
                  className="px-4 sm:px-8 py-2.5 sm:py-3 bg-neutral-700/50 border border-neutral-600/50 text-neutral-300 rounded-lg sm:rounded-xl font-black uppercase text-[9px] sm:text-[10px] tracking-[0.2em] sm:tracking-[0.3em] hover:bg-neutral-700 hover:border-neutral-500 transition-all"
                >
                  <span className="hidden sm:inline">Cancelar</span>
                  <span className="sm:hidden">Cerrar</span>
                </button>
              </div>
            </div>
          </div>
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
