import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Plus,
  Save,
  Upload,
  X,
} from "lucide-react";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { supabase } from "../../src/lib/supabaseClient";

const SHEETS = {
  categories: "Categorías",
  products: "Productos",
  options: "Opciones",
};
const CLEAR_CELL = "BORRAR";
const EMPTY_SHEETS = {
  categories: [],
  products: [],
  groups: [],
  items: [],
  ingredients: [],
};

const makeRef = (prefix) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() || Date.now()}`;

const toBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLocaleLowerCase("es-CO");
  if (["true", "1", "sí", "si", "activo", "agotado", "requerido"].includes(text))
    return true;
  if (["false", "0", "no", "inactivo", "disponible", "opcional"].includes(text))
    return false;
  return fallback;
};

const normalise = (value) =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase("es-CO");

const sameRows = (first, second, fields) =>
  JSON.stringify(
    first.map((row) => fields.map((field) => row[field] ?? null)),
  ) ===
  JSON.stringify(
    second.map((row) => fields.map((field) => row[field] ?? null)),
  );

const textCell = (value) => (value == null ? "" : String(value));

const productColumns = [
  { key: "name", label: "Nombre *", width: 210 },
  { key: "description", label: "Descripción", width: 280 },
  { key: "price", label: "Precio *", width: 120, type: "number" },
  { key: "category", label: "Categoría *", width: 180 },
  { key: "unit", label: "Unidad de venta *", width: 170 },
  { key: "stock", label: "Stock", width: 110, type: "number" },
  { key: "min_stock", label: "Stock mínimo", width: 120, type: "number" },
  { key: "is_active", label: "Activo", width: 100, type: "boolean" },
  { key: "is_sold_out", label: "Agotado", width: 110, type: "boolean" },
];

const optionHeaders = [
  "ID de producto",
  "Producto",
  "Grupo de opciones",
  "Descripción del grupo",
  "Obligatorio",
  "Tipo de selección",
  "Opción",
  "Precio extra",
  "Orden del grupo",
  "Orden de la opción",
];

const ImportarProductosTienda = ({ businessId, businessName, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSheet, setActiveSheet] = useState("categories");
  const [sheets, setSheets] = useState(EMPTY_SHEETS);
  const [initialSheets, setInitialSheets] = useState(EMPTY_SHEETS);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [categoriesResult, unitsResult, productsResult] = await Promise.all([
          supabase
            .from("categories_shop")
            .select("id,business_id,name,order_index")
            .eq("business_id", businessId)
            .order("order_index", { ascending: true }),
          supabase
            .from("units")
            .select("id,name,is_active,allows_fraction")
            .eq("is_active", true)
            .order("name", { ascending: true }),
          supabase
            .from("products")
            .select("*")
            .eq("business_id", businessId)
            .order("order_index", { ascending: true }),
        ]);

        const failedQuery = [categoriesResult, unitsResult, productsResult].find(
          (result) => result.error,
        );
        if (failedQuery?.error) throw failedQuery.error;

        const products = productsResult.data || [];
        const productIds = products.map((product) => product.id);
        const [optionGroupsResult, optionItemsResult] = productIds.length
          ? await Promise.all([
              supabase
                .from("product_option_groups")
                .select("id,product_id,name,description,is_required,selection_type,order_index")
                .in("product_id", productIds)
                .order("order_index", { ascending: true }),
              supabase
                .from("products_items")
                .select("id,product_id,option_group_id,nombre,precio_extra,order_index")
                .in("product_id", productIds)
                .order("order_index", { ascending: true }),
            ])
          : [
              { data: [], error: null },
              { data: [], error: null },
            ];
        if (optionGroupsResult.error) throw optionGroupsResult.error;
        if (optionItemsResult.error) throw optionItemsResult.error;
        const categoryById = new Map(
          (categoriesResult.data || []).map((category) => [
            category.id,
            category.name,
          ]),
        );
        const unitById = new Map(
          (unitsResult.data || []).map((unit) => [unit.id, unit.name]),
        );
        const productRefById = new Map(products.map((product) => [product.id, product.id]));
        const groupsById = new Map(
          (optionGroupsResult.data || []).map((group) => [
            group.id,
            {
              group_id: group.id,
              group_ref: group.id,
              product_ref: productRefById.get(group.product_id) || "",
              name: group.name || "",
              description: group.description || "",
              is_required: group.is_required === true,
              selection_type: group.selection_type || "single",
              order_index: group.order_index ?? 1,
            },
          ]),
        );
        const productRows = products.map((product, index) => ({
          id: product.id,
          product_ref: product.id,
          product_code: `PROD-${String(index + 1).padStart(3, "0")}`,
          name: product.name || "",
          description: product.description || "",
          price: product.price ?? "",
          category: categoryById.get(product.category_id) || "",
          unit: unitById.get(product.unit_id) || "",
          order_index: product.order_index ?? 0,
          stock: product.stock ?? 0,
          min_stock: product.min_stock ?? 0,
          is_active: product.is_active !== false,
          is_sold_out: product.is_sold_out === true,
          image_url: product.image_url || null,
        }));
        const initial = {
          categories: (categoriesResult.data || []).map((category) => ({
            id: category.id,
            name: category.name || "",
          })),
          products: productRows,
          groups: [...groupsById.values()],
          items: (optionItemsResult.data || [])
            .map((item) => ({
              item_id: item.id,
              group_ref: item.option_group_id,
              name: item.nombre || "",
              extra_price: item.precio_extra ?? 0,
              order_index: item.order_index ?? 1,
            }))
            .filter((item) => groupsById.has(item.group_ref)),
          ingredients: [],
        };
        if (cancelled) return;
        setCategories(categoriesResult.data || []);
        setUnits(unitsResult.data || []);
        setInventoryItems([]);
        setSheets(initial);
        setInitialSheets(initial);
      } catch (loadError) {
        console.error("No se pudo cargar el catálogo para la importación:", loadError);
        if (!cancelled) {
          setError(
            "No se pudo cargar el catálogo de esta tienda. Verifica los permisos y vuelve a intentarlo.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const productByRef = useMemo(
    () =>
      new Map(
        sheets.products.map((product) => [product.product_ref, product]),
      ),
    [sheets.products],
  );
  const groupByRef = useMemo(
    () => new Map(sheets.groups.map((group) => [group.group_ref, group])),
    [sheets.groups],
  );

  const updateRow = (sheet, rowIndex, key, value) => {
    setSheets((current) => ({
      ...current,
      [sheet]: current[sheet].map((row, index) =>
        index === rowIndex ? { ...row, [key]: value } : row,
      ),
    }));
    setNotice("");
  };

  const addRow = (sheet) => {
    const row =
      sheet === "categories"
        ? { id: "", name: "" }
        : sheet === "products"
        ? {
            id: "",
            product_ref: makeRef("NUEVO"),
            name: "",
            description: "",
            price: "",
            category: "",
            unit: units[0]?.name || "",
            order_index: "",
            stock: 0,
            min_stock: 0,
            is_active: true,
            is_sold_out: false,
            image_url: null,
          }
        : sheet === "groups"
          ? {
              group_id: "",
              group_ref: makeRef("GRUPO"),
              product_ref: sheets.products[0]?.product_ref || "",
              name: "",
              description: "",
              is_required: false,
              selection_type: "single",
              order_index:
                sheets.groups.filter(
                  (group) =>
                    group.product_ref === sheets.products[0]?.product_ref,
                ).length + 1,
            }
          : sheet === "items"
            ? {
                item_id: "",
                group_ref: sheets.groups[0]?.group_ref || "",
                name: "",
                extra_price: 0,
                order_index:
                  sheets.items.filter(
                    (item) => item.group_ref === sheets.groups[0]?.group_ref,
                  ).length + 1,
              }
            : {
                product_ref: sheets.products[0]?.product_ref || "",
                inventory_item_id: inventoryItems[0]?.id || "",
                ingredient_name: inventoryItems[0]?.name || "",
                quantity: 1,
              };
    setSheets((current) => ({
      ...current,
      [sheet]: [...current[sheet], row],
    }));
  };

  const deleteRow = (sheet, rowIndex) => {
    const row = sheets[sheet][rowIndex];
    setSheets((current) => ({
      ...current,
      [sheet]: current[sheet].filter((_, index) => index !== rowIndex),
      ...(sheet === "products"
        ? {
            groups: current.groups.filter(
              (group) => group.product_ref !== row.product_ref,
            ),
            items: current.items.filter((item) => {
              const group = current.groups.find(
                (candidate) => candidate.group_ref === item.group_ref,
              );
              return group?.product_ref !== row.product_ref;
            }),
            ingredients: current.ingredients.filter(
              (ingredient) => ingredient.product_ref !== row.product_ref,
            ),
          }
        : {}),
      ...(sheet === "groups"
        ? {
            items: current.items.filter(
              (item) => item.group_ref !== row.group_ref,
            ),
          }
        : {}),
    }));
  };

  const downloadWorkbook = async () => {
    try {
      const XLSX = await import("@e965/xlsx");
      const workbook = XLSX.utils.book_new();
      const productRows = sheets.products.map((row, index) => ({
        "ID de producto":
          row.product_code ||
          (row.id ? `PROD-${String(index + 1).padStart(3, "0")}` : ""),
        "Nombre del producto *": row.name,
        Descripción: row.description,
        "Precio *": row.price,
        "Categoría *": row.category,
        "Unidad de venta *": row.unit,
        Stock: row.stock,
        "Stock mínimo": row.min_stock,
        Activo: row.is_active ? "Sí" : "No",
        Agotado: row.is_sold_out ? "Sí" : "No",
      }));
      const productNameByRef = new Map(
        sheets.products.map((product) => [product.product_ref, product.name]),
      );
      const productCodeByRef = new Map(
        sheets.products.map((product) => [product.product_ref, product.product_code]),
      );
      const optionsRows = sheets.groups.flatMap((group) => {
        const items = sheets.items.filter((item) => item.group_ref === group.group_ref);
        return items.map((item) => ({
          "ID de producto": productCodeByRef.get(group.product_ref) || "",
          Producto: productNameByRef.get(group.product_ref) || "",
          "Grupo de opciones": group.name,
          "Descripción del grupo": group.description,
          Obligatorio: group.is_required ? "Sí" : "No",
          "Tipo de selección":
            group.selection_type === "multiple" ? "Varias opciones" : "Una opción",
          Opción: item.name,
          "Precio extra": item.extra_price,
          "Orden del grupo": group.order_index,
          "Orden de la opción": item.order_index,
        }));
      });
      for (let index = 0; index < 10; index += 1) {
        optionsRows.push(Object.fromEntries(optionHeaders.map((header) => [header, ""])));
      }
      const usedProductRefs = new Set(
        sheets.products.map((product) => product.product_ref),
      );
      for (let index = 1; index <= 10; index += 1) {
        let productRef = `NUEVO-${String(index).padStart(2, "0")}`;
        let suffix = index;
        while (usedProductRefs.has(productRef)) {
          suffix += 1;
          productRef = `NUEVO-${String(suffix).padStart(2, "0")}`;
        }
        usedProductRefs.add(productRef);
        productRows.push({
          "ID de producto": "",
          "Nombre del producto *": "",
          Descripción: "",
          "Precio *": "",
          "Categoría *": "",
          "Unidad de venta *": "",
          Stock: 0,
          "Stock mínimo": 0,
          Activo: "Sí",
          Agotado: "No",
        });
      }
      const productHeaders = [
        "ID de producto",
        "Nombre del producto *",
        "Descripción",
        "Precio *",
        "Categoría *",
        "Unidad de venta *",
        "Stock",
        "Stock mínimo",
        "Activo",
        "Agotado",
      ];
      const addSheet = (name, rows, headers, hiddenHeaders = []) => {
        const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
        worksheet["!cols"] = headers.map((header) => ({
          wch: header.length > 22 ? 25 : 18,
          hidden: hiddenHeaders.includes(header),
        }));
        XLSX.utils.book_append_sheet(workbook, worksheet, name);
      };
      const categoryRows = sheets.categories.map((category) => ({
        "Nombre de categoría *": category.name,
        category_id: category.id,
      }));
      for (let index = 0; index < 10; index += 1) {
        categoryRows.push({ "Nombre de categoría *": "", category_id: "" });
      }
      addSheet(
        SHEETS.categories,
        categoryRows,
        ["Nombre de categoría *", "category_id"],
        ["category_id"],
      );
      addSheet(SHEETS.products, productRows, productHeaders);
      addSheet(SHEETS.options, optionsRows, optionHeaders);

      const workbookBytes = XLSX.write(workbook, {
        type: "array",
        bookType: "xlsx",
      });
      const archive = unzipSync(new Uint8Array(workbookBytes));
      const workbookXml = strFromU8(archive["xl/workbook.xml"]);
      const definedName =
        '<definedName name="ListaCategorias">&apos;Categorías&apos;!$A$2:$A$1000</definedName>';
      archive["xl/workbook.xml"] = strToU8(
        workbookXml.includes("</definedNames>")
          ? workbookXml.replace(
              "</definedNames>",
              `${definedName}</definedNames>`,
            )
          : workbookXml.replace(
              "</workbook>",
              `<definedNames>${definedName}</definedNames></workbook>`,
            ),
      );
      const productsXml = strFromU8(archive["xl/worksheets/sheet2.xml"]);
      const validation =
        '<dataValidations count="1"><dataValidation type="list" allowBlank="1" showErrorMessage="1" showInputMessage="1" sqref="E2:E1000"><formula1>ListaCategorias</formula1></dataValidation></dataValidations>';
      archive["xl/worksheets/sheet2.xml"] = strToU8(
        productsXml.includes("<ignoredErrors>")
          ? productsXml.replace("<ignoredErrors>", `${validation}<ignoredErrors>`)
          : productsXml.replace("</worksheet>", `${validation}</worksheet>`),
      );
      const output = zipSync(archive);
      const blob = new Blob([output], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `productos-${businessName || "tienda"}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice(
        "Plantilla de categorías, productos y opciones opcionales descargada.",
      );
      setError("");
    } catch (exportError) {
      console.error("No se pudo exportar la plantilla Excel:", exportError);
      setError("No se pudo generar el archivo Excel. Intenta de nuevo.");
    }
  };

  const readSheet = (XLSX, workbook, name) => {
    const worksheet = workbook.Sheets[name];
    return worksheet
      ? XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false })
      : null;
  };

  const importWorkbook = async (file) => {
    setError("");
    setNotice("");
    try {
      const XLSX = await import("@e965/xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), {
        cellDates: false,
        raw: false,
      });
      const importedProducts = readSheet(XLSX, workbook, SHEETS.products);
      if (!importedProducts) {
        throw new Error(
          `El archivo debe incluir una hoja llamada "${SHEETS.products}". Descarga la plantilla para obtener el formato correcto.`,
        );
      }

      const importedCategoryRows = readSheet(XLSX, workbook, SHEETS.categories);
      const importedOptionRows = readSheet(XLSX, workbook, SHEETS.options);
      const currentCategoriesById = new Map(
        sheets.categories.filter((category) => category.id).map((category) => [category.id, category]),
      );
      const currentCategoriesByName = new Map(
        sheets.categories.map((category) => [normalise(category.name), category]),
      );
      const importedCategories = importedCategoryRows
        ? importedCategoryRows
            .map((row) => {
              const name = textCell(row["Nombre de categoría *"] ?? row.name).trim();
              if (!name) return null;
              const id = textCell(row.category_id).trim();
              const current =
                (id && currentCategoriesById.get(id)) ||
                currentCategoriesByName.get(normalise(name));
              return { id: current?.id || "", name };
            })
            .filter(Boolean)
        : sheets.categories;
      const importedCategoryNames = new Set();
      importedCategories.forEach((category) => {
        const key = normalise(category.name);
        if (importedCategoryNames.has(key))
          throw new Error(`La categoría "${category.name}" está repetida en la hoja Categorías.`);
        importedCategoryNames.add(key);
      });

      const currentProductsByName = new Map();
      sheets.products.forEach((product) => {
        const key = normalise(product.name);
        if (!currentProductsByName.has(key)) currentProductsByName.set(key, []);
        currentProductsByName.get(key).push(product);
      });
      const importedCodeCounts = new Map();
      importedProducts.forEach((row) => {
        if (!textCell(row["Nombre del producto *"] ?? row.name).trim()) return;
        const code = textCell(row["ID de producto"]).trim();
        if (code) importedCodeCounts.set(code, (importedCodeCounts.get(code) || 0) + 1);
      });
      const importedCodeOccurrences = new Map();
      const assignedProductRefs = new Set();
      const usedProductCodes = new Set([
        ...sheets.products.map((product) => product.product_code).filter(Boolean),
        ...importedCodeCounts.keys(),
      ]);
      let nextProductCodeNumber =
        Math.max(
          0,
          ...[...usedProductCodes].map((code) =>
            Number(code.match(/^PROD-(\d+)$/)?.[1] || 0),
          ),
        ) + 1;
      const createProductCode = () => {
        let code = `PROD-${String(nextProductCodeNumber).padStart(3, "0")}`;
        while (usedProductCodes.has(code)) {
          nextProductCodeNumber += 1;
          code = `PROD-${String(nextProductCodeNumber).padStart(3, "0")}`;
        }
        usedProductCodes.add(code);
        nextProductCodeNumber += 1;
        return code;
      };
      const imported = {
        categories: importedCategories,
        products: importedProducts
          .map((row) => {
            const name = textCell(
              row["Nombre del producto *"] ?? row.name,
            ).trim();
            if (!name) return null;
            const byName = currentProductsByName.get(normalise(name)) || [];
            const productCode = textCell(row["ID de producto"]).trim();
            const codeOccurrence = productCode
              ? (importedCodeOccurrences.get(productCode) || 0) + 1
              : 0;
            if (productCode) importedCodeOccurrences.set(productCode, codeOccurrence);
            const repeatedCode =
              productCode &&
              importedCodeCounts.get(productCode) > 1 &&
              codeOccurrence > 1;
            const codeMatch = productCode
              ? sheets.products.find(
                  (product) => product.product_code === productCode,
                )
              : null;
            const importedId = repeatedCode ? "" : textCell(row.id).trim();
            const idMatch = importedId
              ? sheets.products.find((product) => product.id === importedId)
              : null;
            const legacyProductRef = repeatedCode
              ? ""
              : textCell(row.product_ref).trim();
            const refMatch = legacyProductRef
              ? sheets.products.find(
                  (product) => product.product_ref === legacyProductRef,
                )
              : null;
            const matchedProduct =
              [codeMatch, idMatch, refMatch].find(
                (product) =>
                  product && !assignedProductRefs.has(product.product_ref),
              ) ||
              (!productCode &&
              !importedId &&
              !legacyProductRef &&
              !Object.hasOwn(row, "ID de producto") &&
              byName.length === 1 &&
              !assignedProductRefs.has(byName[0].product_ref)
                ? byName[0]
                : null);
            const id = matchedProduct?.id || importedId;
            let productRef = matchedProduct?.product_ref || legacyProductRef;
            if (!productRef || assignedProductRefs.has(productRef)) {
              productRef = makeRef("NUEVO");
            }
            assignedProductRefs.add(productRef);
            return {
              id,
              product_ref: productRef,
              product_code:
                repeatedCode
                  ? createProductCode()
                  : productCode || matchedProduct?.product_code || "",
              name,
              description: textCell(row["Descripción"] ?? row.description).trim(),
              price: textCell(row["Precio *"] ?? row.price).trim(),
              category: textCell(row["Categoría *"] ?? row.category).trim(),
              unit: textCell(row["Unidad de venta *"] ?? row.unit).trim(),
              stock: textCell(row.Stock ?? row.stock).trim(),
              min_stock: textCell(row["Stock mínimo"] ?? row.min_stock).trim(),
              is_active: toBoolean(row.Activo ?? row.is_active, true),
              is_sold_out: toBoolean(row.Agotado ?? row.is_sold_out, false),
              image_url: null,
            };
          })
          .filter(Boolean),
      };
      if (importedOptionRows) {
        const importedProductsByName = new Map();
        imported.products.forEach((product) => {
          const key = normalise(product.name);
          if (!importedProductsByName.has(key)) importedProductsByName.set(key, []);
          importedProductsByName.get(key).push(product);
        });
        const groupsByKey = new Map();
        const items = [];
        importedOptionRows.forEach((row, index) => {
          const optionName = textCell(row["Opción"]).trim();
          if (!optionName) return;
          const productCode = textCell(row["ID de producto"]).trim();
          const productName = textCell(row.Producto).trim();
          const groupName = textCell(row["Grupo de opciones"]).trim();
          if (!productName || !groupName) {
            throw new Error(
              `Opciones, fila ${index + 2}: completa el producto y el grupo para la opción "${optionName}".`,
            );
          }
          const matchingProducts = productCode
            ? imported.products.filter(
                (product) => product.product_code === productCode,
              )
            : importedProductsByName.get(normalise(productName)) || [];
          if (matchingProducts.length !== 1) {
            throw new Error(
              matchingProducts.length
                ? `Opciones, fila ${index + 2}: el producto "${productCode || productName}" aparece más de una vez y no se puede identificar.`
                : `Opciones, fila ${index + 2}: el producto "${productName}" no aparece en la hoja Productos.`,
            );
          }
          const product = matchingProducts[0];
          const groupKey = `${product.product_ref}|${normalise(groupName)}`;
          let group = groupsByKey.get(groupKey);
          if (!group) {
            const existingGroup = sheets.groups.find(
              (candidate) =>
                candidate.product_ref === product.product_ref &&
                normalise(candidate.name) === normalise(groupName),
            );
            const groupsForProduct = [...groupsByKey.values()].filter(
              (candidate) => candidate.product_ref === product.product_ref,
            );
            group = {
              group_id: existingGroup?.group_id || "",
              group_ref: existingGroup?.group_ref || makeRef("GRUPO"),
              product_ref: product.product_ref,
              name: groupName,
              description: textCell(row["Descripción del grupo"]).trim(),
              is_required: toBoolean(row.Obligatorio, false),
              selection_type:
                normalise(row["Tipo de selección"]) === "multiple" ||
                normalise(row["Tipo de selección"]).includes("varias")
                  ? "multiple"
                  : "single",
              order_index:
                Number(row["Orden del grupo"]) || groupsForProduct.length + 1,
            };
            groupsByKey.set(groupKey, group);
          }
          const existingItems = sheets.items.filter(
            (item) => item.group_ref === group.group_ref,
          );
          items.push({
            item_id:
              existingItems.find(
                (item) => normalise(item.name) === normalise(optionName),
              )?.item_id || "",
            group_ref: group.group_ref,
            name: optionName,
            extra_price: textCell(row["Precio extra"]).trim() || "0",
            order_index:
              Number(row["Orden de la opción"]) ||
              items.filter((item) => item.group_ref === group.group_ref).length + 1,
          });
        });
        imported.groups = [...groupsByKey.values()];
        imported.items = items;
      }
      const existingIds = new Set(sheets.products.map((product) => product.id));
      const importRefs = new Map();
      for (const [index, product] of imported.products.entries()) {
        if (product.id && !existingIds.has(product.id)) {
          throw new Error(
            `El ID "${product.id}" no pertenece a esta tienda. No se importaron cambios.`,
          );
        }
        const rows = importRefs.get(product.product_ref) || [];
        rows.push({ product, rowNumber: index + 2 });
        importRefs.set(product.product_ref, rows);
      }
      const duplicateRefs = [...importRefs.values()].filter(
        (rows) => rows.length > 1,
      );
      if (duplicateRefs.length) {
        throw new Error(
          `Hay productos repetidos en la hoja Productos: ${duplicateRefs
            .map((rows) => {
              const { product } = rows[0];
              const label = product.product_code
                ? `${product.product_code} (${product.name})`
                : product.name;
              return `${label}, filas ${rows
                .map(({ rowNumber }) => rowNumber)
                .join(" y ")}`;
            })
            .join("; ")}. Deja una sola fila por producto.`,
        );
      }

      const changedProductRefs = new Set(
        imported.products.map((product) => product.product_ref),
      );
      const currentProductsById = new Map(
        sheets.products.map((product) => [product.id, product]),
      );
      const currentProductsByRef = new Map(
        sheets.products.map((product) => [product.product_ref, product]),
      );
      const missingIdMatch = imported.products.find(
        (product) =>
          !product.id && currentProductsByRef.has(product.product_ref),
      );
      if (missingIdMatch) {
        throw new Error(
          `La referencia "${missingIdMatch.product_ref}" ya existe. Conserva el ID del producto para poder editarlo.`,
        );
      }
      const mergedProducts = [...sheets.products];
      imported.products.forEach((row) => {
        const current =
          (row.id && currentProductsById.get(row.id)) ||
          currentProductsByRef.get(row.product_ref);
        const next = current
          ? {
              ...current,
              ...row,
              id: current.id,
              product_ref: current.product_ref,
              image_url: current.image_url,
              description:
                row.description === CLEAR_CELL
                  ? ""
                  : row.description || current.description,
              stock:
                row.stock === CLEAR_CELL
                  ? 0
                  : row.stock === ""
                    ? current.stock
                    : row.stock,
              min_stock:
                row.min_stock === CLEAR_CELL
                  ? 0
                  : row.min_stock === ""
                    ? current.min_stock
                    : row.min_stock,
              is_active: toBoolean(row.is_active, current.is_active),
              is_sold_out: toBoolean(row.is_sold_out, current.is_sold_out),
            }
          : row;
        const index = current
          ? mergedProducts.findIndex(
              (product) =>
                (row.id && product.id === row.id) ||
                product.product_ref === row.product_ref,
            )
          : -1;
        if (index >= 0) mergedProducts[index] = next;
        else mergedProducts.push(next);
      });

      let mergedGroups = sheets.groups;
      let mergedItems = sheets.items;
      let mergedIngredients = sheets.ingredients;
      if (imported.groups) {
        const optionProductRefs = new Set(
          imported.groups.map((group) => group.product_ref),
        );
        mergedGroups = [
          ...sheets.groups.filter(
            (row) => !optionProductRefs.has(row.product_ref),
          ),
          ...imported.groups.filter((row) => row.name),
        ];
        const replacedGroupRefs = new Set(
          sheets.groups
            .filter((group) => optionProductRefs.has(group.product_ref))
            .map((group) => group.group_ref),
        );
        const importedGroupRefs = new Set(imported.groups.map((group) => group.group_ref));
        mergedItems = [
          ...sheets.items.filter((row) => !replacedGroupRefs.has(row.group_ref)),
          ...(imported.items || []).filter(
            (row) => importedGroupRefs.has(row.group_ref) && row.name,
          ),
        ];
      }
      if (imported.ingredients) {
        mergedIngredients = [
          ...sheets.ingredients.filter(
            (row) => !changedProductRefs.has(row.product_ref),
          ),
          ...imported.ingredients.filter(
            (row) =>
              changedProductRefs.has(row.product_ref) &&
              (row.inventory_item_id || row.ingredient_name),
          ),
        ];
      }
      setSheets({
        categories: imported.categories,
        products: mergedProducts,
        groups: mergedGroups,
        items: mergedItems,
        ingredients: mergedIngredients,
      });
      setNotice(
        `Se cargaron ${imported.products.length} fila(s) con nombre. Revisa la tabla y pulsa Guardar para aplicar los cambios.`,
      );
    } catch (importError) {
      console.error("No se pudo leer la plantilla de productos:", importError);
      setError(
        importError.message || "No se pudo leer el archivo Excel seleccionado.",
      );
    } finally {
      setFileInputKey((key) => key + 1);
    }
  };

  const validateProducts = () => {
    const rows = sheets.products.filter((product) => product.name.trim());
    const errors = [];
    const categoryNames = new Set();
    sheets.categories.forEach((category, index) => {
      const name = category.name.trim();
      if (!name) return;
      const key = normalise(name);
      if (categoryNames.has(key))
        errors.push(`Categoría ${index + 1}: el nombre está repetido.`);
      categoryNames.add(key);
    });
    const refs = new Set();
    rows.forEach((product, index) => {
      const rowNumber = index + 1;
      if (!product.product_ref) errors.push(`Producto ${rowNumber}: falta product_ref.`);
      if (refs.has(product.product_ref))
        errors.push(`Producto ${rowNumber}: product_ref repetido.`);
      refs.add(product.product_ref);
      if (!product.category?.trim())
        errors.push(`Producto ${rowNumber}: falta categoría.`);
      else if (
        !sheets.categories.some(
          (category) => normalise(category.name) === normalise(product.category),
        )
      ) {
        const removedCategory = initialSheets.categories.find(
          (category) => normalise(category.name) === normalise(product.category),
        );
        errors.push(
          removedCategory
            ? `No puedes eliminar la categoría "${removedCategory.name}" mientras el producto "${product.name}" siga asignado a ella. Reasigna el producto primero.`
            : `Producto ${rowNumber}: la categoría "${product.category}" no está en la hoja Categorías.`,
        );
      }
      if (!product.unit?.trim())
        errors.push(`Producto ${rowNumber}: falta unidad de venta.`);
      const price = Number(product.price);
      if (product.price === "" || !Number.isFinite(price) || price < 0)
        errors.push(`Producto ${rowNumber}: el precio debe ser un número mayor o igual a cero.`);
      for (const field of ["stock", "min_stock"]) {
        const value = Number(product[field]);
        if (
          product[field] !== CLEAR_CELL &&
          (!Number.isFinite(value) || value < 0)
        )
          errors.push(`Producto ${rowNumber}: ${field} debe ser un número no negativo.`);
        const unit = units.find(
          (candidate) => normalise(candidate.name) === normalise(product.unit),
        );
        if (
          product[field] !== CLEAR_CELL &&
          Number.isFinite(value) &&
          unit &&
          !unit.allows_fraction &&
          !Number.isInteger(value)
        )
          errors.push(
            `Producto ${rowNumber}: ${field} no admite decimales para la unidad ${unit.name}.`,
          );
      }
    });
    const productRefs = new Set(rows.map((product) => product.product_ref));
    const seenGroupRefs = new Set();
    const groupOrders = new Set();
    sheets.groups.forEach((group, index) => {
      if (!group.name.trim()) return;
      if (!productRefs.has(group.product_ref))
        errors.push(`Grupo ${index + 1}: referencia de producto no encontrada.`);
      if (!group.group_ref)
        errors.push(`Grupo ${index + 1}: falta group_ref.`);
      if (seenGroupRefs.has(group.group_ref))
        errors.push(`Grupo ${index + 1}: group_ref repetido.`);
      seenGroupRefs.add(group.group_ref);
      if (!["single", "multiple"].includes(group.selection_type))
        errors.push(`Grupo ${index + 1}: selection_type debe ser single o multiple.`);
      const order = Number(group.order_index);
      const orderKey = `${group.product_ref}|${order}`;
      if (!Number.isInteger(order) || order < 1)
        errors.push(`Grupo ${index + 1}: order_index debe ser un entero positivo.`);
      if (groupOrders.has(orderKey))
        errors.push(`Grupo ${index + 1}: order_index repetido para este producto.`);
      groupOrders.add(orderKey);
    });
    const groupRefs = new Set(
      sheets.groups.filter((group) => group.name.trim()).map((group) => group.group_ref),
    );
    const itemOrders = new Set();
    sheets.items.forEach((item, index) => {
      if (!item.name.trim()) return;
      if (!groupRefs.has(item.group_ref))
        errors.push(`Opción ${index + 1}: grupo relacionado no encontrado.`);
      if (!Number.isFinite(Number(item.extra_price)))
        errors.push(`Opción ${index + 1}: extra_price debe ser numérico.`);
      const order = Number(item.order_index);
      const orderKey = `${item.group_ref}|${order}`;
      if (!Number.isInteger(order) || order < 1)
        errors.push(`Opción ${index + 1}: order_index debe ser un entero positivo.`);
      if (itemOrders.has(orderKey))
        errors.push(`Opción ${index + 1}: order_index repetido para este grupo.`);
      itemOrders.add(orderKey);
    });
    const ingredientRefs = new Set();
    sheets.ingredients.forEach((ingredient, index) => {
      if (!ingredient.inventory_item_id && !ingredient.ingredient_name) return;
      if (!productRefs.has(ingredient.product_ref))
        errors.push(`Ingrediente ${index + 1}: referencia de producto no encontrada.`);
      if (
        ingredient.inventory_item_id &&
        !inventoryItems.some((item) => item.id === ingredient.inventory_item_id)
      )
        errors.push(`Ingrediente ${index + 1}: el insumo no pertenece al inventario de esta tienda.`);
      if (
        !ingredient.inventory_item_id &&
        ingredient.ingredient_name &&
        !inventoryItems.some(
          (item) => normalise(item.name) === normalise(ingredient.ingredient_name),
        )
      )
        errors.push(`Ingrediente ${index + 1}: el nombre no coincide con un insumo activo de esta tienda.`);
      const ingredientRef = `${ingredient.product_ref}|${ingredient.inventory_item_id || normalise(ingredient.ingredient_name)}`;
      if (ingredientRefs.has(ingredientRef))
        errors.push(`Ingrediente ${index + 1}: el mismo insumo está repetido para el producto.`);
      ingredientRefs.add(ingredientRef);
      if (!Number.isFinite(Number(ingredient.quantity)) || Number(ingredient.quantity) <= 0)
        errors.push(`Ingrediente ${index + 1}: quantity debe ser mayor que cero.`);
    });
    return { rows, errors };
  };

  const saveProductRelations = async (productId, productRef) => {
    const relatedGroups = sheets.groups.filter(
      (group) => group.product_ref === productRef && group.name.trim(),
    );
    const originalGroups = initialSheets.groups.filter(
      (group) => group.product_ref === productRef,
    );
    const originalGroupRefs = new Set(
      originalGroups.map((group) => group.group_ref),
    );
    const originalItems = initialSheets.items.filter((item) =>
      originalGroupRefs.has(item.group_ref),
    );
    const relatedItems = sheets.items.filter(
      (item) =>
        relatedGroups.some((group) => group.group_ref === item.group_ref) &&
        item.name.trim(),
    );
    const relatedIngredients = sheets.ingredients.filter(
      (ingredient) =>
        ingredient.product_ref === productRef &&
        (ingredient.inventory_item_id || ingredient.ingredient_name),
    );

    const groupIdByRef = new Map();
    for (const [index, group] of relatedGroups.entries()) {
      const payload = {
        product_id: productId,
        name: group.name.trim(),
        description: group.description.trim() || null,
        is_required: toBoolean(group.is_required),
        selection_type: group.selection_type,
        order_index: Number(group.order_index) || index + 1,
      };
      let groupId = group.group_id;
      if (groupId && originalGroups.some((original) => original.group_id === groupId)) {
        const originalGroup = originalGroups.find(
          (original) => original.group_id === groupId,
        );
        if (
          !sameRows(
            [group],
            [originalGroup],
            ["name", "description", "is_required", "selection_type", "order_index"],
          )
        ) {
          const { data: updatedGroup, error: groupError } = await supabase
            .from("product_option_groups")
            .update(payload)
            .eq("id", groupId)
            .eq("product_id", productId)
            .select("id")
            .maybeSingle();
          if (groupError) throw groupError;
          if (!updatedGroup)
            throw new Error("No se encontró el grupo de opciones para actualizar.");
        }
      } else {
        const { data: savedGroup, error: groupError } = await supabase
          .from("product_option_groups")
          .insert(payload)
          .select("id")
          .single();
        if (groupError) throw groupError;
        groupId = savedGroup.id;
      }
      groupIdByRef.set(group.group_ref, groupId);
    }

    const itemIdByRef = new Map();
    for (const [index, item] of relatedItems.entries()) {
      const payload = {
        product_id: productId,
        option_group_id: groupIdByRef.get(item.group_ref),
        nombre: item.name.trim(),
        precio_extra: Number(item.extra_price) || 0,
        order_index: Number(item.order_index) || index + 1,
      };
      let itemId = item.item_id;
      if (itemId && originalItems.some((original) => original.item_id === itemId)) {
        const { data: updatedItem, error: itemError } = await supabase
          .from("products_items")
          .update(payload)
          .eq("id", itemId)
          .eq("product_id", productId)
          .select("id")
          .maybeSingle();
        if (itemError) throw itemError;
        if (!updatedItem)
          throw new Error("No se encontró la opción del producto para actualizar.");
      } else {
        const { data: savedItem, error: itemError } = await supabase
          .from("products_items")
          .insert(payload)
          .select("id")
          .single();
        if (itemError) throw itemError;
        itemId = savedItem.id;
      }
      itemIdByRef.set(`${item.group_ref}|${item.order_index}`, itemId);
    }

    const currentItemIds = relatedItems
      .map((item) => item.item_id)
      .filter((id) => id && originalItems.some((original) => original.item_id === id));
    const removedItemIds = originalItems
      .filter((item) => !currentItemIds.includes(item.item_id))
      .map((item) => item.item_id);
    if (removedItemIds.length) {
      const { error: deleteItemsError } = await supabase
        .from("products_items")
        .delete()
        .eq("product_id", productId)
        .in("id", removedItemIds);
      if (deleteItemsError) throw deleteItemsError;
      const { data: remainingItems, error: verifyItemsError } = await supabase
        .from("products_items")
        .select("id")
        .eq("product_id", productId)
        .in("id", removedItemIds);
      if (verifyItemsError) throw verifyItemsError;
      if (remainingItems?.length)
        throw new Error(
          "No se pudieron eliminar algunas opciones. Verifica los permisos de Supabase.",
        );
    }

    const currentGroupIds = relatedGroups
      .map((group) => group.group_id)
      .filter((id) => id && originalGroups.some((original) => original.group_id === id));
    const removedGroupIds = originalGroups
      .filter((group) => !currentGroupIds.includes(group.group_id))
      .map((group) => group.group_id);
    if (removedGroupIds.length) {
      const { error: deleteGroupsError } = await supabase
        .from("product_option_groups")
        .delete()
        .eq("product_id", productId)
        .in("id", removedGroupIds);
      if (deleteGroupsError) throw deleteGroupsError;
      const { data: remainingGroups, error: verifyGroupsError } = await supabase
        .from("product_option_groups")
        .select("id")
        .eq("product_id", productId)
        .in("id", removedGroupIds);
      if (verifyGroupsError) throw verifyGroupsError;
      if (remainingGroups?.length)
        throw new Error(
          "No se pudieron eliminar algunos grupos de opciones. Verifica los permisos de Supabase.",
        );
    }

    const inventoryIdByName = new Map(
      inventoryItems.map((item) => [normalise(item.name), item.id]),
    );
    const currentIngredients = relatedIngredients.map((ingredient) => ({
      inventory_item_id:
        ingredient.inventory_item_id ||
        inventoryIdByName.get(normalise(ingredient.ingredient_name)),
      quantity: Number(ingredient.quantity),
    }));
    const originalIngredients = initialSheets.ingredients.filter(
      (ingredient) => ingredient.product_ref === productRef,
    );
    for (const ingredient of currentIngredients) {
      const original = originalIngredients.find(
        (item) => item.inventory_item_id === ingredient.inventory_item_id,
      );
      if (original) {
        if (Number(original.quantity) !== ingredient.quantity) {
          const { data: updatedIngredient, error: updateError } = await supabase
            .from("product_ingredients")
            .update({ quantity: ingredient.quantity })
            .eq("product_id", productId)
            .eq("inventory_item_id", ingredient.inventory_item_id)
            .select("inventory_item_id")
            .maybeSingle();
          if (updateError) throw updateError;
          if (!updatedIngredient)
            throw new Error("No se encontró el ingrediente vinculado al producto.");
        }
      } else {
        const { error: insertError } = await supabase
          .from("product_ingredients")
          .insert({
            product_id: productId,
            inventory_item_id: ingredient.inventory_item_id,
            quantity: ingredient.quantity,
          });
        if (insertError) throw insertError;
      }
    }
    const currentIngredientIds = currentIngredients.map(
      (ingredient) => ingredient.inventory_item_id,
    );
    const removedIngredientIds = originalIngredients
      .filter(
        (ingredient) =>
          !currentIngredientIds.includes(ingredient.inventory_item_id),
      )
      .map((ingredient) => ingredient.inventory_item_id);
    if (removedIngredientIds.length) {
      const { error: deleteError } = await supabase
        .from("product_ingredients")
        .delete()
        .eq("product_id", productId)
        .in("inventory_item_id", removedIngredientIds);
      if (deleteError) throw deleteError;
    }
    return { groupIdByRef, itemIdByRef };
  };

  const saveChanges = async () => {
    setError("");
    setNotice("");
    const { rows, errors } = validateProducts();
    if (errors.length) {
      setError(errors.slice(0, 12).join(" "));
      return;
    }
    const hasCategoryNames = sheets.categories.some((category) => category.name.trim());
    if (!rows.length && !hasCategoryNames) {
      setError("Agrega al menos un producto o una categoría antes de guardar.");
      return;
    }
    setSaving(true);
    try {
      const unitMap = new Map(
        units.map((unit) => [normalise(unit.name), unit.id]),
      );
      const invalidUnit = rows.find((row) => !unitMap.has(normalise(row.unit)));
      if (invalidUnit) {
        throw new Error(
          `La unidad "${invalidUnit.unit}" no existe en las unidades de venta disponibles.`,
        );
      }

      const categoryNames = sheets.categories
        .map((category) => category.name.trim())
        .filter(Boolean)
        .reduce((names, name) => {
        if (!names.some((existing) => normalise(existing) === normalise(name)))
          names.push(name);
        return names;
      }, []);
      const categoryMap = new Map(
        categories.map((category) => [normalise(category.name), category]),
      );
      const missingCategories = categoryNames.filter(
        (name) => !categoryMap.has(normalise(name)),
      );
      if (missingCategories.length) {
        const startingOrder =
          Math.max(0, ...categories.map((category) => Number(category.order_index) || 0)) +
          1;
        const { data: createdCategories, error: categoryError } = await supabase
          .from("categories_shop")
          .insert(
            missingCategories.map((name, index) => ({
              business_id: businessId,
              name,
              order_index: startingOrder + index,
            })),
          )
          .select("id,business_id,name,order_index");
        if (categoryError) throw categoryError;
        (createdCategories || []).forEach((category) =>
          categoryMap.set(normalise(category.name), category),
        );
        setCategories((current) => [...current, ...(createdCategories || [])]);
      }
      const currentById = new Map(
        initialSheets.products.map((product) => [product.id, product]),
      );
      const refToProductId = new Map(
        sheets.products
          .filter((product) => product.id)
          .map((product) => [product.product_ref, product.id]),
      );
      const categoryOrder = new Map();
      initialSheets.products.forEach((product) => {
        const categoryId = categories.find(
          (category) => category.name === product.category,
        )?.id;
        if (categoryId)
          categoryOrder.set(
            categoryId,
            Math.max(
              categoryOrder.get(categoryId) || 0,
              Number(product.order_index) || 0,
            ),
          );
      });
      rows.forEach((product) => {
        const categoryId = categoryMap.get(normalise(product.category))?.id;
        if (categoryId && !categoryOrder.has(categoryId))
          categoryOrder.set(categoryId, 0);
      });

      const saveFailures = [];
      const successfullySavedRefs = new Set();
      const pendingInserts = [];
      const pendingUpdates = [];
      for (const [index, row] of rows.entries()) {
        const existing = row.id ? currentById.get(row.id) : null;
        const existingOriginal = existing
          ? initialSheets.products.find((product) => product.id === existing.id)
          : null;
        const payload = {
          name: row.name.trim(),
          description: row.description === CLEAR_CELL ? null : row.description.trim() || null,
          price: Number(row.price),
          category_id: categoryMap.get(normalise(row.category))?.id,
          unit_id: unitMap.get(normalise(row.unit)),
          stock: row.stock === CLEAR_CELL ? 0 : Number(row.stock),
          min_stock: row.min_stock === CLEAR_CELL ? 0 : Number(row.min_stock),
          is_active: toBoolean(row.is_active, true),
          is_sold_out: toBoolean(row.is_sold_out, false),
        };
        if (existing) {
          refToProductId.set(row.product_ref, existing.id);
          if (
            sameRows([row], [existingOriginal], [
              "name",
              "description",
              "price",
              "category",
              "unit",
              "stock",
              "min_stock",
              "is_active",
              "is_sold_out",
            ])
          ) {
            successfullySavedRefs.add(row.product_ref);
          } else {
            pendingUpdates.push({ index, row, existing, payload });
          }
        } else {
          const nextOrder = (categoryOrder.get(payload.category_id) || 0) + 1;
          categoryOrder.set(payload.category_id, nextOrder);
          pendingInserts.push({
            index,
            row,
            payload: {
              ...payload,
              business_id: businessId,
              order_index: nextOrder,
              image_url: null,
            },
          });
        }
      }

      const updateResults = await Promise.all(
        pendingUpdates.map(async ({ index, row, existing, payload }) => {
          const { error: updateError } = await supabase
            .from("products")
            .update(payload)
            .eq("id", existing.id)
            .eq("business_id", businessId);
          if (updateError) return { index, row, error: updateError };

          const { data: persistedProduct, error: verifyError } = await supabase
            .from("products")
            .select(
              "id,name,description,price,category_id,unit_id,stock,min_stock,is_active,is_sold_out",
            )
            .eq("id", existing.id)
            .eq("business_id", businessId)
            .maybeSingle();
          if (verifyError) return { index, row, error: verifyError };
          if (!persistedProduct) {
            return {
              index,
              row,
              error: new Error("No se encontró el producto para actualizar."),
            };
          }

          const numericFields = new Set(["price", "stock", "min_stock"]);
          const changesPersisted = Object.entries(payload).every(
            ([field, expected]) =>
              numericFields.has(field)
                ? Number(persistedProduct[field]) === Number(expected)
                : persistedProduct[field] === expected,
          );
          return {
            index,
            row,
            error: changesPersisted
              ? null
              : new Error(
                  "Supabase no aplicó la actualización. Verifica que la política RLS superadmin_update_products esté aplicada y vuelve a intentarlo.",
                ),
          };
        }),
      );
      updateResults.forEach(({ index, row, error: updateError }) => {
        if (updateError) {
          saveFailures.push(
            `Producto ${index + 1} (${row.name}): ${updateError.message}`,
          );
        } else {
          successfullySavedRefs.add(row.product_ref);
        }
      });

      if (pendingInserts.length) {
        const orderToRef = new Map(
          pendingInserts.map(({ row, payload }) => [
            `${payload.category_id}|${payload.order_index}`,
            row.product_ref,
          ]),
        );
        const { data: createdProducts, error: insertError } = await supabase
          .from("products")
          .insert(pendingInserts.map((item) => item.payload))
          .select("id,category_id,order_index");
        if (insertError) {
          pendingInserts.forEach(({ index, row }) =>
            saveFailures.push(
              `Producto ${index + 1} (${row.name}): ${insertError.message}`,
            ),
          );
        } else {
          const createdRefs = new Set();
          (createdProducts || []).forEach((product) => {
            const ref = orderToRef.get(
              `${product.category_id}|${product.order_index}`,
            );
            if (ref) {
              refToProductId.set(ref, product.id);
              successfullySavedRefs.add(ref);
              createdRefs.add(ref);
            }
          });
          pendingInserts.forEach(({ index, row }) => {
            if (!createdRefs.has(row.product_ref))
              saveFailures.push(
                `Producto ${index + 1} (${row.name}): la base de datos no devolvió su ID.`,
              );
          });
        }
      }

      const removedCategories = initialSheets.categories.filter(
        (category) =>
          category.id &&
          !sheets.categories.some((current) => current.id === category.id),
      );
      const deletedCategoryIds = new Set();
      if (removedCategories.length) {
        const removedIds = removedCategories.map((category) => category.id);
        const { data: productsUsingCategories, error: usageError } =
          await supabase
            .from("products")
            .select("id,name,category_id")
            .eq("business_id", businessId)
            .in("category_id", removedIds);
        if (usageError) throw usageError;

        const usedCategoryIds = new Set(
          (productsUsingCategories || []).map((product) => product.category_id),
        );
        removedCategories.forEach((category) => {
          if (usedCategoryIds.has(category.id)) {
            const productNames = (productsUsingCategories || [])
              .filter((product) => product.category_id === category.id)
              .map((product) => product.name)
              .slice(0, 5);
            saveFailures.push(
              `No se puede eliminar la categoría "${category.name}" porque aún tiene productos${productNames.length ? `: ${productNames.join(", ")}` : ""}. Reasígnalos primero.`,
            );
          }
        });

        const unusedCategoryIds = removedIds.filter(
          (categoryId) => !usedCategoryIds.has(categoryId),
        );
        if (unusedCategoryIds.length) {
          const { error: deleteCategoryError } = await supabase
            .from("categories_shop")
            .delete()
            .eq("business_id", businessId)
            .in("id", unusedCategoryIds)
            .select("id");
          if (deleteCategoryError) {
            saveFailures.push(
              `No se pudieron eliminar algunas categorías: ${deleteCategoryError.message}`,
            );
          } else {
            const { data: remainingCategories, error: remainingError } =
              await supabase
                .from("categories_shop")
                .select("id")
                .eq("business_id", businessId)
                .in("id", unusedCategoryIds);
            if (remainingError) throw remainingError;
            const remainingIds = new Set(
              (remainingCategories || []).map((category) => category.id),
            );
            unusedCategoryIds.forEach((categoryId) => {
              if (remainingIds.has(categoryId)) {
                const category = removedCategories.find(
                  (item) => item.id === categoryId,
                );
                saveFailures.push(
                  `No se pudo eliminar la categoría "${category?.name || categoryId}". Verifica los permisos de Supabase.`,
                );
              } else {
                deletedCategoryIds.add(categoryId);
              }
            });
          }
        }
      }

      const groupFields = [
        "product_ref",
        "group_ref",
        "name",
        "description",
        "is_required",
        "selection_type",
        "order_index",
      ];
      const itemFields = [
        "group_ref",
        "name",
        "extra_price",
        "order_index",
      ];
      const ingredientFields = [
        "product_ref",
        "inventory_item_id",
        "ingredient_name",
        "quantity",
      ];
      const refsToSaveRelations = new Set(
        rows
          .filter((row) => !row.id || !currentById.has(row.id))
          .map((row) => row.product_ref),
      );
      const importedRefs = new Set(
        rows
          .filter((row) => !currentById.has(row.id))
          .map((row) => row.product_ref),
      );
      sheets.groups.forEach((group) => {
        const original = initialSheets.groups.find(
          (item) => item.group_ref === group.group_ref,
        );
        if (!original || !sameRows([group], [original], groupFields))
          refsToSaveRelations.add(group.product_ref);
      });
      initialSheets.groups.forEach((group) => {
        if (!sheets.groups.some((item) => item.group_ref === group.group_ref))
          refsToSaveRelations.add(group.product_ref);
      });
      sheets.items.forEach((item) => {
        const original = initialSheets.items.find(
          (initial) => initial.item_id === item.item_id,
        );
        if (
          !original ||
          !sameRows([item], [original], itemFields)
        ) {
          const group = groupByRef.get(item.group_ref);
          if (group) refsToSaveRelations.add(group.product_ref);
        }
      });
      initialSheets.items.forEach((item) => {
        if (!sheets.items.some((current) => current.item_id === item.item_id)) {
          const group = initialSheets.groups.find(
            (initial) => initial.group_ref === item.group_ref,
          );
          if (group) refsToSaveRelations.add(group.product_ref);
        }
      });
      sheets.ingredients.forEach((ingredient) => {
        const original = initialSheets.ingredients.find(
          (initial) =>
            initial.product_ref === ingredient.product_ref &&
            initial.inventory_item_id === ingredient.inventory_item_id,
        );
        if (
          !original ||
          !sameRows([ingredient], [original], ingredientFields)
        )
          refsToSaveRelations.add(ingredient.product_ref);
      });
      initialSheets.ingredients.forEach((ingredient) => {
        if (
          !sheets.ingredients.some(
            (current) =>
              current.product_ref === ingredient.product_ref &&
              current.inventory_item_id === ingredient.inventory_item_id,
          )
        )
          refsToSaveRelations.add(ingredient.product_ref);
      });
      importedRefs.forEach((ref) => refsToSaveRelations.add(ref));

      const savedGroupIds = new Map();
      const savedItemIds = new Map();
      const successfullySavedRelationRefs = new Set();
      await Promise.all(
        [...refsToSaveRelations].map(async (productRef) => {
          if (!successfullySavedRefs.has(productRef)) return;
          const productId = refToProductId.get(productRef);
          if (!productId) return;
          try {
          const { groupIdByRef, itemIdByRef } = await saveProductRelations(
            productId,
            productRef,
          );
          groupIdByRef.forEach((groupId, groupRef) =>
            savedGroupIds.set(groupRef, groupId),
          );
          itemIdByRef.forEach((itemId, itemRef) =>
            savedItemIds.set(itemRef, itemId),
          );
            successfullySavedRelationRefs.add(productRef);
          } catch (relationError) {
            saveFailures.push(
              `Relaciones del producto ${productRef}: ${relationError.message}`,
            );
          }
        }),
      );

      const updatedRows = sheets.products.map((row) => ({
        ...row,
        ...(refToProductId.has(row.product_ref)
          ? { id: refToProductId.get(row.product_ref) }
          : {}),
      }));
      const saved = {
        ...sheets,
        categories: Array.from(categoryMap.values())
          .filter((category) => !deletedCategoryIds.has(category.id))
          .map((category) => ({ id: category.id, name: category.name })),
        products: updatedRows,
        groups: sheets.groups.map((group) => ({
          ...group,
          ...(savedGroupIds.has(group.group_ref)
            ? { group_id: savedGroupIds.get(group.group_ref) }
            : {}),
        })),
        items: sheets.items.map((item) => ({
          ...item,
          ...(savedItemIds.has(`${item.group_ref}|${item.order_index}`)
            ? {
                item_id: savedItemIds.get(
                  `${item.group_ref}|${item.order_index}`,
                ),
              }
            : {}),
        })),
      };
      setCategories(saved.categories);
      setSheets(saved);
      const savedProductsById = new Map(
        saved.products.filter((product) => product.id).map((product) => [product.id, product]),
      );
      const initialProducts = initialSheets.products.map((product) =>
        successfullySavedRefs.has(product.product_ref)
          ? savedProductsById.get(product.id) || product
          : product,
      );
      const initialProductIds = new Set(initialProducts.map((product) => product.id));
      saved.products.forEach((product) => {
        if (
          successfullySavedRefs.has(product.product_ref) &&
          product.id &&
          !initialProductIds.has(product.id)
        ) {
          initialProducts.push(product);
          initialProductIds.add(product.id);
        }
      });
      let initialGroups = initialSheets.groups;
      let initialItems = initialSheets.items;
      let initialIngredients = initialSheets.ingredients;
      successfullySavedRelationRefs.forEach((productRef) => {
        const oldGroupRefs = initialSheets.groups
          .filter((group) => group.product_ref === productRef)
          .map((group) => group.group_ref);
        const nextGroups = saved.groups.filter(
          (group) => group.product_ref === productRef,
        );
        const allGroupRefs = new Set([
          ...oldGroupRefs,
          ...nextGroups.map((group) => group.group_ref),
        ]);
        initialGroups = [
          ...initialGroups.filter((group) => group.product_ref !== productRef),
          ...nextGroups,
        ];
        initialItems = [
          ...initialItems.filter((item) => !allGroupRefs.has(item.group_ref)),
          ...saved.items.filter((item) => allGroupRefs.has(item.group_ref)),
        ];
        initialIngredients = [
          ...initialIngredients.filter(
            (ingredient) => ingredient.product_ref !== productRef,
          ),
          ...saved.ingredients.filter(
            (ingredient) => ingredient.product_ref === productRef,
          ),
        ];
      });
      setInitialSheets({
        categories: saved.categories,
        products: initialProducts,
        groups: initialGroups,
        items: initialItems,
        ingredients: initialIngredients,
      });
      if (saveFailures.length) {
        setError(
          `Algunos cambios no se guardaron. ${saveFailures.slice(0, 8).join(" ")}`,
        );
      } else {
        setNotice(
          rows.length
            ? `Se guardaron ${successfullySavedRefs.size} producto(s) y las categorías correctamente.`
            : `Se guardaron ${saved.categories.length} categoría(s) correctamente.`,
        );
      }
    } catch (saveError) {
      console.error("No se pudieron guardar los productos de la tienda:", saveError);
      setError(saveError.message || "No se pudieron guardar los cambios.");
    } finally {
      setSaving(false);
    }
  };

  const productsWithName = sheets.products.filter((row) => row.name.trim());

  const renderInput = (sheet, row, rowIndex, column) => {
    const value = row[column.key];
    if (column.readOnly) {
      return (
        <span className="block max-w-[220px] truncate px-2 text-xs text-neutral-500" title={value || ""}>
          {value || "Se asigna al guardar"}
        </span>
      );
    }
    if (column.type === "boolean") {
      return (
        <select
          aria-label={column.label}
          value={String(Boolean(value))}
          onChange={(event) =>
            updateRow(sheet, rowIndex, column.key, event.target.value === "true")
          }
          className="w-full rounded bg-neutral-950 px-2 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-violet-400"
        >
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      );
    }
    if (column.key === "unit") {
      return (
        <select
          value={value || ""}
          onChange={(event) => updateRow(sheet, rowIndex, column.key, event.target.value)}
          className="w-full rounded bg-neutral-950 px-2 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-violet-400"
        >
          <option value="">Elegir…</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.name}>{unit.name}</option>
          ))}
        </select>
      );
    }
    if (column.key === "category") {
      return (
        <input
          list="product-category-options"
          value={value ?? ""}
          onChange={(event) => updateRow(sheet, rowIndex, column.key, event.target.value)}
          className="w-full rounded bg-neutral-950 px-2 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-violet-400"
        />
      );
    }
    return (
      <input
        type={column.type || "text"}
        min={column.type === "number" ? 0 : undefined}
        step={column.key === "stock" || column.key === "min_stock" ? "0.001" : "any"}
        value={value ?? ""}
        onChange={(event) => updateRow(sheet, rowIndex, column.key, event.target.value)}
        className="w-full rounded bg-neutral-950 px-2 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-violet-400"
      />
    );
  };

  const renderTable = (sheet, columns) => (
    <>
      <datalist id="product-category-options">
        {[...new Set(sheets.categories.map((category) => category.name))]
          .filter(Boolean)
          .map((name) => (
          <option key={normalise(name)} value={name} />
        ))}
      </datalist>
      <div className="max-h-[52vh] overflow-auto rounded-xl border border-white/10">
        <table className="min-w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-neutral-900">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={{ minWidth: column.width }}
                  className="border-b border-white/10 px-2 py-3 text-[10px] font-bold uppercase tracking-wide text-neutral-400"
                >
                  {column.label}
                </th>
              ))}
              <th className="sticky right-0 min-w-14 border-b border-white/10 bg-neutral-900 px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {sheets[sheet].map((row, rowIndex) => (
              <tr key={row.product_ref || row.group_ref || row.item_id || rowIndex} className="border-b border-white/[0.06]">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className="border-r border-white/[0.05] p-1"
                  >
                    {renderInput(sheet, row, rowIndex, column)}
                  </td>
                ))}
                <td className="sticky right-0 bg-neutral-950 p-1">
                  <button
                    type="button"
                    onClick={() => deleteRow(sheet, rowIndex)}
                    disabled={sheet === "products" && Boolean(row.id)}
                    title={
                      sheet === "products" && row.id
                        ? "Los productos existentes no se eliminan desde esta tabla"
                        : "Quitar fila"
                    }
                    aria-label={
                      sheet === "products" && row.id
                        ? "Los productos existentes no se eliminan desde esta tabla"
                        : "Quitar fila"
                    }
                    className="rounded-lg p-2 text-neutral-500 hover:bg-rose-500/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <X size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {sheets[sheet].length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="p-8 text-center text-sm text-neutral-500">
                  Esta hoja está vacía. Agrega una fila con el botón superior.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );

  const relationshipColumns = {
    categories: [
      { key: "name", label: "Nombre de categoría *", width: 280 },
    ],
    groups: [
      { key: "product_ref", label: "Producto *", width: 200, type: "product" },
      { key: "name", label: "Nombre del grupo *", width: 180 },
      { key: "description", label: "Descripción", width: 220 },
      { key: "is_required", label: "Obligatorio", width: 120, type: "boolean" },
      { key: "selection_type", label: "Tipo", width: 130, type: "selection" },
      { key: "order_index", label: "Orden", width: 90, type: "number" },
    ],
    items: [
      { key: "group_ref", label: "Grupo *", width: 260, type: "group" },
      { key: "name", label: "Nombre de la opción *", width: 210 },
      { key: "extra_price", label: "Precio extra", width: 130, type: "number" },
      { key: "order_index", label: "Orden", width: 90, type: "number" },
    ],
    ingredients: [
      { key: "product_ref", label: "Producto *", width: 230, type: "product" },
      { key: "inventory_item_id", label: "Insumo *", width: 240, type: "ingredient" },
      { key: "quantity", label: "Cantidad *", width: 120, type: "number" },
    ],
  };

  const renderRelationshipInput = (sheet, row, rowIndex, column) => {
    const value = row[column.key];
    if (column.readOnly || (sheet === "categories" && row.id)) {
      return (
        <span className="block max-w-[280px] truncate px-2 text-xs text-neutral-400" title={value || ""}>
          {value || "Escribe el nombre de la categoría"}
        </span>
      );
    }
    if (column.type === "boolean") {
      return (
        <select
          value={String(Boolean(value))}
          onChange={(event) =>
            updateRow(sheet, rowIndex, column.key, event.target.value === "true")
          }
          className="w-full rounded bg-neutral-950 px-2 py-2 text-xs text-white"
        >
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      );
    }
    if (column.type === "selection") {
      return (
        <select
          value={value || "single"}
          onChange={(event) => updateRow(sheet, rowIndex, column.key, event.target.value)}
          className="w-full rounded bg-neutral-950 px-2 py-2 text-xs text-white"
        >
          <option value="single">Una opción</option>
          <option value="multiple">Varias opciones</option>
        </select>
      );
    }
    if (column.type === "product") {
      return (
        <select
          value={value || ""}
          onChange={(event) => updateRow(sheet, rowIndex, column.key, event.target.value)}
          className="w-full rounded bg-neutral-950 px-2 py-2 text-xs text-white"
        >
          <option value="">Seleccionar producto…</option>
          {productsWithName.map((product) => (
            <option key={product.product_ref} value={product.product_ref}>
              {product.name}
            </option>
          ))}
        </select>
      );
    }
    if (column.type === "group") {
      return (
        <select
          value={value || ""}
          onChange={(event) => updateRow(sheet, rowIndex, column.key, event.target.value)}
          className="w-full rounded bg-neutral-950 px-2 py-2 text-xs text-white"
        >
          <option value="">Seleccionar grupo…</option>
          {sheets.groups.filter((group) => group.name.trim()).map((group) => (
            <option key={group.group_ref} value={group.group_ref}>
              {productByRef.get(group.product_ref)?.name || "Producto"}: {group.name}
            </option>
          ))}
        </select>
      );
    }
    if (column.type === "ingredient") {
      return (
        <select
          value={value || ""}
          onChange={(event) => {
            const selected = inventoryItems.find((item) => item.id === event.target.value);
            updateRow(sheet, rowIndex, "inventory_item_id", selected?.id || "");
            updateRow(sheet, rowIndex, "ingredient_name", selected?.name || "");
          }}
          className="w-full rounded bg-neutral-950 px-2 py-2 text-xs text-white"
        >
          <option value="">Seleccionar insumo…</option>
          {inventoryItems.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      );
    }
    return (
      <input
        type={column.type === "number" ? "number" : "text"}
        min={column.type === "number" ? 0 : undefined}
        step={column.key === "quantity" ? "0.001" : "any"}
        value={value ?? ""}
        onChange={(event) => updateRow(sheet, rowIndex, column.key, event.target.value)}
        className="w-full rounded bg-neutral-950 px-2 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-violet-400"
      />
    );
  };

  const renderRelationshipTable = (sheet) => {
    const columns = relationshipColumns[sheet];
    return (
      <div className="max-h-[52vh] overflow-auto rounded-xl border border-white/10">
        <table className="min-w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-neutral-900">
            <tr>
              {columns.map((column) => (
                <th key={column.key} style={{ minWidth: column.width }} className="border-b border-white/10 px-2 py-3 text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                  {column.label}
                </th>
              ))}
              <th className="sticky right-0 min-w-14 border-b border-white/10 bg-neutral-900 px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {sheets[sheet].map((row, rowIndex) => (
              <tr
                key={
                  sheet === "categories"
                    ? row.id || `${row.name}-${rowIndex}`
                    : sheet === "items"
                    ? row.item_id || `${row.group_ref}-${row.name}-${rowIndex}`
                    : row.group_ref ||
                      `${row.product_ref}-${row.inventory_item_id}-${rowIndex}`
                }
                className="border-b border-white/[0.06]"
              >
                {columns.map((column) => (
                  <td key={column.key} className="border-r border-white/[0.05] p-1">
                    {renderRelationshipInput(sheet, row, rowIndex, column)}
                  </td>
                ))}
                <td className="sticky right-0 bg-neutral-950 p-1">
                  <button
                    type="button"
                    onClick={() => deleteRow(sheet, rowIndex)}
                    title={sheet === "categories" ? "Eliminar categoría" : "Quitar fila"}
                    aria-label={sheet === "categories" ? "Eliminar categoría" : "Quitar fila"}
                    className="rounded-lg p-2 text-neutral-500 hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    <X size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {sheets[sheet].length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="p-8 text-center text-sm text-neutral-500">
                  Esta hoja está vacía. Agrega una fila con el botón superior.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const activeSheetData = {
    categories: ["Categorías", sheets.categories.length],
    products: ["Productos", sheets.products.length],
    groups: ["Grupos de opciones", sheets.groups.length],
    items: ["Opciones", sheets.items.length],
  };
  const changedProducts = sheets.products.filter((row) => row.name.trim()).length;
  const changedCategories = sheets.categories.filter((row) => row.name.trim()).length;
  const currentColumns = activeSheet === "products" ? productColumns : relationshipColumns[activeSheet];
  const missingUnits = activeSheet === "products" && units.length === 0;
  const hasRows = activeSheet === "products" ? sheets.products.length > 0 : true;

  return (
    <main className="fixed inset-0 z-[1200] flex h-screen h-[100dvh] w-screen flex-col overflow-hidden bg-neutral-950 text-white">
      <section className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-neutral-950 text-white">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-400/10 p-2 text-emerald-300">
              <FileSpreadsheet size={21} />
            </div>
            <div>
              <h2 className="text-base font-black sm:text-lg">Carga masiva de productos</h2>
              <p className="text-xs text-neutral-400">{businessName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar carga masiva" className="rounded-full p-2 text-neutral-400 hover:bg-white/10 hover:text-white">
            <X size={19} />
          </button>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
          <p className="max-w-3xl text-xs leading-5 text-neutral-400">
            Este flujo permite cargar categorías y productos. La pestaña Opciones del Excel es opcional; las filas vacías se ignoran.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              key={fileInputKey}
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) importWorkbook(file);
              }}
            />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-neutral-200 hover:bg-white/5 disabled:opacity-50">
              <Upload size={15} /> Importar Excel
            </button>
            <button type="button" onClick={downloadWorkbook} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-neutral-200 hover:bg-white/5 disabled:opacity-50">
              <Download size={15} /> Descargar plantilla Excel
            </button>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto border-b border-white/10 px-4 pt-3 sm:px-6">
          {Object.entries(activeSheetData).map(([key, [label, count]]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveSheet(key)}
              className={`shrink-0 rounded-t-lg px-3 py-2 text-xs font-bold ${
                activeSheet === key
                  ? "border border-b-0 border-white/10 bg-neutral-900 text-white"
                  : "text-neutral-500 hover:text-neutral-200"
              }`}
            >
              {label} <span className="ml-1 text-neutral-500">{count}</span>
            </button>
          ))}
        </nav>

        <main className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
          {loading ? (
            <div className="flex min-h-56 items-center justify-center gap-3 text-neutral-400">
              <LoaderCircle className="animate-spin" size={22} /> Cargando productos y tablas…
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-neutral-400">
                  {activeSheetData[activeSheet][1]} fila(s)
                  {activeSheet === "products" && " · * campos requeridos"}
                </p>
                <button
                  type="button"
                  onClick={() => addRow(activeSheet)}
                  disabled={activeSheet === "products" && !units.length}
                  className="inline-flex items-center gap-2 rounded-lg bg-violet-500/15 px-3 py-2 text-xs font-bold text-violet-200 hover:bg-violet-500/25 disabled:opacity-50"
                >
                  <Plus size={15} /> Agregar fila
                </button>
              </div>

              {missingUnits && (
                <p className="mb-3 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">
                  No hay unidades de venta disponibles en el catálogo. Configura una unidad antes de crear productos.
                </p>
              )}
              {activeSheet === "products"
                ? renderTable("products", currentColumns)
                : renderRelationshipTable(activeSheet)}
              {activeSheet === "categories" && (
                <p className="mt-3 text-xs text-neutral-500">Agrega las categorías que usarás en la tienda. Si una categoría tiene productos asignados, primero reasígnalos desde la hoja Productos para poder eliminarla.</p>
              )}
            </>
          )}

          {(error || notice) && (
            <div
              role={error ? "alert" : "status"}
              className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-xs leading-5 ${
                error
                  ? "border-rose-400/20 bg-rose-400/5 text-rose-200"
                  : "border-emerald-400/20 bg-emerald-400/5 text-emerald-200"
              }`}
            >
              {error ? <AlertCircle className="mt-0.5 shrink-0" size={15} /> : <Check className="mt-0.5 shrink-0" size={15} />}
              <span>{error || notice}</span>
            </div>
          )}
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3 sm:px-6">
          <p className="text-xs text-neutral-500">
            {changedCategories} categoría(s) y {changedProducts} producto(s) listos para guardar.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-bold text-neutral-300 hover:bg-white/5 disabled:opacity-50">
              Cerrar
            </button>
            <button
              type="button"
              onClick={saveChanges}
              disabled={loading || saving || !hasRows || missingUnits}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-xs font-black text-white hover:bg-violet-400 disabled:cursor-wait disabled:opacity-50"
            >
              {saving ? <LoaderCircle className="animate-spin" size={15} /> : <Save size={15} />}
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
};

export default ImportarProductosTienda;
