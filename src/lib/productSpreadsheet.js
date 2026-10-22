import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const PRODUCT_SHEET = "Productos";
const OPTIONS_SHEET = "Opciones";
const normalized = (value) =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase("es-CO");

const text = (value) => String(value ?? "").trim();

const cellNumber = (value, label, rowNumber, errors, { optional = false } = {}) => {
  if ((value === "" || value == null) && optional) return 0;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) {
    errors.push(`Hoja Productos, fila ${rowNumber}: "${label}" debe ser un número igual o mayor que cero.`);
    return null;
  }
  return parsed;
};

const readRows = (XLSX, workbook, sheetName) => {
  const worksheet = workbook.Sheets[sheetName];
  return worksheet
    ? XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: true })
    : null;
};

const addValidations = (worksheetXml, validations) => {
  const block = `<dataValidations count="${validations.length}">${validations
    .map(
      ({ range, formula }) =>
        `<dataValidation type="list" allowBlank="1" showErrorMessage="1" showInputMessage="1" sqref="${range}"><formula1>${formula}</formula1></dataValidation>`,
    )
    .join("")}</dataValidations>`;
  if (worksheetXml.includes("<dataValidations")) {
    throw new Error("No se pudieron preparar las listas desplegables de la plantilla.");
  }
  const insertionPoint = [
    worksheetXml.indexOf("<ignoredErrors"),
    worksheetXml.indexOf("<hyperlinks"),
    worksheetXml.indexOf("<printOptions"),
    worksheetXml.indexOf("<pageMargins"),
  ]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  if (insertionPoint !== undefined) {
    return `${worksheetXml.slice(0, insertionPoint)}${block}${worksheetXml.slice(insertionPoint)}`;
  }
  return worksheetXml.replace("</worksheet>", `${block}</worksheet>`);
};

export const downloadProductTemplate = async ({
  categories = [],
  units = [],
  products = [],
}) => {
  const XLSX = await import("@e965/xlsx");
  const workbook = XLSX.utils.book_new();
  const productHeaders = [
    "Nombre del producto *",
    "Descripción",
    "Precio *",
    "Categoría *",
    "Unidad de venta *",
    "Stock",
    "Stock mínimo",
    "Activo",
  ];
  const optionHeaders = [
    "Producto *",
    "Grupo *",
    "Descripción del grupo",
    "Obligatorio",
    "Tipo de selección",
    "Mínimo",
    "Máximo",
    "Regla de precio",
    "Tope de precio",
    "Opción *",
    "Precio extra",
    "Grupo padre",
    "Opción padre",
  ];
  const productRows = [
    ...products.map((product) => ({
      "Nombre del producto *": product.name || "",
      Descripción: product.description || "",
      "Precio *": Number(product.price) || 0,
      "Categoría *": product.category || "",
      "Unidad de venta *": product.unit || "",
      Stock: product.stock ?? "",
      "Stock mínimo": product.minStock ?? "",
      Activo: product.isActive ? "Sí" : "No",
    })),
    ...Array.from(
      { length: 30 },
      () => Object.fromEntries(productHeaders.map((header) => [header, ""])),
    ),
  ];
  const optionRows = [];
  const addGroupRows = (
    productName,
    group,
    parentGroupName = "",
    parentOptionName = "",
  ) => {
    group.items.forEach((item) => {
      optionRows.push({
        "Producto *": productName,
        "Grupo *": group.name,
        "Descripción del grupo": group.description || "",
        Obligatorio: group.is_required ? "Sí" : "No",
        "Tipo de selección":
          group.selection_type === "multiple" ? "Varias opciones" : "Una opción",
        Mínimo: group.min_selections ?? "",
        Máximo: group.max_selections ?? "",
        "Regla de precio": group.price_mode === "highest" ? "Más caro" : "Sumar",
        "Tope de precio": group.max_extra_price ?? "",
        "Opción *": item.nombre,
        "Precio extra": Number(item.precio_extra) || 0,
        "Grupo padre": parentGroupName,
        "Opción padre": parentOptionName,
      });
      (item.childGroups || []).forEach((childGroup) =>
        addGroupRows(productName, childGroup, group.name, item.nombre),
      );
    });
  };
  products.forEach((product) =>
    (product.optionGroups || []).forEach((group) =>
      addGroupRows(product.name, group),
    ),
  );
  optionRows.push(
    ...Array.from(
      { length: 100 },
      () => Object.fromEntries(optionHeaders.map((header) => [header, ""])),
    ),
  );
  const instructions = [
    ["PLANTILLA PARA CARGAR PRODUCTOS"],
    ["Usa las hojas Productos y Opciones. No cambies los nombres de las columnas."],
    ["PRODUCTOS: una fila por producto. Nombre, precio, categoría y unidad son obligatorios."],
    ["OPCIONES: una fila por cada alternativa. Repite el nombre del grupo en cada alternativa del mismo grupo."],
    ["Para relacionar un grupo con un producto, escribe el mismo nombre exacto del producto en la columna Producto."],
    ["Para crear un grupo dependiente, completa Grupo padre y Opción padre. Solo se permite un nivel dependiente."],
    ["Ejemplo: Producto Pizza, grupo Tamaño, opción Pequeña; luego grupo Sabores, opciones Pollo y Champiñones, Grupo padre Tamaño y Opción padre Pequeña."],
    ["Usa Una opción para grupos de selección única o Varias opciones para combinaciones."],
    ["Mínimo y Máximo solo aplican a Varias opciones. Deja Máximo vacío para no limitar."],
    ["Regla de precio: Sumar agrega los precios extras; Más caro cobra solo el extra más alto."],
    ["El Tope de precio limita el total solo cuando la regla es Sumar."],
    ["Las categorías y unidades tienen listas desplegables con los datos actuales del negocio. También puedes escribir el nombre de una categoría ya existente."],
    ["Stock es opcional. Se importará solo si el negocio tiene inventario habilitado."],
    ["El Excel incluye los productos actuales para que puedas usarlos como referencia o editarlos. Al subirlo, cada fila con producto se agrega como nuevo."],
    ["Si el nombre coincide o se parece a uno que ya existe, Gloto te avisará antes de permitir agregarlo."],
    ["Las imágenes se agregan después desde el editor."],
    ["Ejemplo de Productos: Pizza | Pizza individual | 20000 | Pizzas | UNIDAD | 0 | 0 | Sí"],
    ["Ejemplo de Opciones: Pizza | Tamaño | Elige el tamaño | Sí | Una opción | 1 | 1 | Sumar | | Pequeña | 0 | |"],
    ["Ejemplo dependiente: Pizza | Sabores | Elige hasta dos sabores | Sí | Varias opciones | 1 | 2 | Más caro | | Pollo | 5000 | Tamaño | Pequeña"],
  ];
  const instructionSheet = XLSX.utils.aoa_to_sheet(instructions);
  instructionSheet["!cols"] = [{ wch: 130 }];
  const productSheet = XLSX.utils.json_to_sheet(productRows, {
    header: productHeaders,
  });
  productSheet["!cols"] = productHeaders.map((header) => ({
    wch: Math.max(16, Math.min(header.length + 4, 30)),
  }));
  productSheet["!autofilter"] = { ref: `A1:H${productRows.length + 1}` };
  productSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  const optionsSheet = XLSX.utils.json_to_sheet(optionRows, {
    header: optionHeaders,
  });
  optionsSheet["!cols"] = optionHeaders.map((header) => ({
    wch: Math.max(15, Math.min(header.length + 4, 28)),
  }));
  optionsSheet["!autofilter"] = { ref: `A1:M${optionRows.length + 1}` };
  optionsSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  const listRows = [
    ["Categorías", "Unidades", "Sí / No", "Tipo de selección", "Regla de precio"],
    ...Array.from(
      {
        length: Math.max(
          categories.length,
          units.length,
          2,
        ),
      },
      (_, index) => [
        categories[index]?.name || "",
        units[index]?.name || "",
        ["Sí", "No"][index] || "",
        ["Una opción", "Varias opciones"][index] || "",
        ["Sumar", "Más caro"][index] || "",
      ],
    ),
  ];
  const listSheet = XLSX.utils.aoa_to_sheet(listRows);
  listSheet["!cols"] = [
    { wch: 28 },
    { wch: 22 },
    { wch: 14 },
    { wch: 24 },
    { wch: 20 },
  ];
  listSheet["!state"] = "hidden";
  XLSX.utils.book_append_sheet(workbook, instructionSheet, "Instrucciones");
  XLSX.utils.book_append_sheet(workbook, productSheet, PRODUCT_SHEET);
  XLSX.utils.book_append_sheet(workbook, optionsSheet, OPTIONS_SHEET);
  XLSX.utils.book_append_sheet(workbook, listSheet, "Listas");

  const workbookBytes = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
  });
  const archive = unzipSync(new Uint8Array(workbookBytes));
  const workbookXml = strFromU8(archive["xl/workbook.xml"]);
  const categoryEnd = Math.max(2, categories.length + 1);
  const unitEnd = Math.max(2, units.length + 1);
  const productEnd = Math.max(1000, productRows.length + 1);
  const optionEnd = Math.max(1000, optionRows.length + 1);
  const definedNames = [
    `<definedName name="ListaCategorias">&apos;Listas&apos;!$A$2:$A$${categoryEnd}</definedName>`,
    `<definedName name="ListaUnidades">&apos;Listas&apos;!$B$2:$B$${unitEnd}</definedName>`,
    `<definedName name="ListaSiNo">&apos;Listas&apos;!$C$2:$C$3</definedName>`,
    `<definedName name="ListaSeleccion">&apos;Listas&apos;!$D$2:$D$3</definedName>`,
    `<definedName name="ListaPrecio">&apos;Listas&apos;!$E$2:$E$3</definedName>`,
    `<definedName name="ListaProductos">&apos;Productos&apos;!$A$2:$A$${productEnd}</definedName>`,
  ].join("");
  archive["xl/workbook.xml"] = strToU8(
    workbookXml.includes("</definedNames>")
      ? workbookXml.replace("</definedNames>", `${definedNames}</definedNames>`)
      : workbookXml.replace(
          "</workbook>",
          `<definedNames>${definedNames}</definedNames></workbook>`,
        ),
  );
  archive["xl/worksheets/sheet2.xml"] = strToU8(
    addValidations(strFromU8(archive["xl/worksheets/sheet2.xml"]), [
      { range: `D2:D${productEnd}`, formula: "ListaCategorias" },
      { range: `E2:E${productEnd}`, formula: "ListaUnidades" },
      { range: `H2:H${productEnd}`, formula: "ListaSiNo" },
    ]),
  );
  archive["xl/worksheets/sheet3.xml"] = strToU8(
    addValidations(strFromU8(archive["xl/worksheets/sheet3.xml"]), [
      { range: `A2:A${optionEnd}`, formula: "ListaProductos" },
      { range: `D2:D${optionEnd}`, formula: "ListaSiNo" },
      { range: `E2:E${optionEnd}`, formula: "ListaSeleccion" },
      { range: `H2:H${optionEnd}`, formula: "ListaPrecio" },
    ]),
  );

  return new Blob([zipSync(archive)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
};

export const parseProductWorkbook = async (
  file,
  { categories = [], units = [] } = {},
) => {
  const XLSX = await import("@e965/xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), {
    cellDates: false,
    raw: true,
  });
  const productRows = readRows(XLSX, workbook, PRODUCT_SHEET);
  const optionRows = readRows(XLSX, workbook, OPTIONS_SHEET);
  if (!productRows) {
    return {
      products: [],
      errors: [`El archivo debe tener una hoja llamada "${PRODUCT_SHEET}". Descarga la plantilla para obtener el formato correcto.`],
    };
  }
  const errors = [];
  const categoriesByName = new Map(
    categories.map((category) => [normalized(category.name), category]),
  );
  const unitsByName = new Map(
    units.map((unit) => [normalized(unit.name), unit]),
  );
  const productsByName = new Map();

  productRows.forEach((row, index) => {
    const name = text(row["Nombre del producto *"]);
    if (!name) return;
    const rowNumber = index + 2;
    if (productsByName.has(normalized(name))) {
      errors.push(`Hoja Productos, fila ${rowNumber}: el nombre "${name}" está repetido.`);
      return;
    }
    const categoryName = text(row["Categoría *"]);
    const unitName = text(row["Unidad de venta *"]);
    const category = categoriesByName.get(normalized(categoryName));
    const unit = unitsByName.get(normalized(unitName));
    const price = cellNumber(row["Precio *"], "Precio", rowNumber, errors);
    const stock = cellNumber(row.Stock, "Stock", rowNumber, errors, {
      optional: true,
    });
    const minStock = cellNumber(row["Stock mínimo"], "Stock mínimo", rowNumber, errors, {
      optional: true,
    });
    if (!category) {
      errors.push(`Hoja Productos, fila ${rowNumber}: la categoría "${categoryName || "(vacía)"}" no existe. Usa una categoría actual del negocio.`);
    }
    if (!unit) {
      errors.push(`Hoja Productos, fila ${rowNumber}: la unidad "${unitName || "(vacía)"}" no existe.`);
    }
    if (unit && !unit.allows_fraction && (stock % 1 !== 0 || minStock % 1 !== 0)) {
      errors.push(`Hoja Productos, fila ${rowNumber}: la unidad ${unit.name} no admite stock con decimales.`);
    }
    const activeText = normalized(row.Activo || "sí");
    if (!["si", "sí", "yes", "true", "1", "no", "false", "0"].includes(activeText)) {
      errors.push(`Hoja Productos, fila ${rowNumber}: "Activo" debe ser Sí o No.`);
    }
    productsByName.set(normalized(name), {
      name,
      description: text(row.Descripción),
      price,
      category,
      unit,
      stock,
      minStock,
      isActive: !["no", "false", "0"].includes(activeText),
      optionGroups: new Map(),
    });
  });

  const groupKey = (product, parentGroup, parentOption, groupName) =>
    [normalized(product), normalized(parentGroup), normalized(parentOption), normalized(groupName)].join("|");
  (optionRows || []).forEach((row, index) => {
    const productName = text(row["Producto *"]);
    const groupName = text(row["Grupo *"]);
    const optionName = text(row["Opción *"]);
    if (!productName && !groupName && !optionName) return;
    const rowNumber = index + 2;
    const product = productsByName.get(normalized(productName));
    const parentGroupName = text(row["Grupo padre"]);
    const parentOptionName = text(row["Opción padre"]);
    if (!product) {
      errors.push(`Hoja Opciones, fila ${rowNumber}: el producto "${productName || "(vacío)"}" no está en la hoja Productos.`);
      return;
    }
    if (!groupName || !optionName) {
      errors.push(`Hoja Opciones, fila ${rowNumber}: completa "Grupo" y "Opción".`);
      return;
    }
    if (Boolean(parentGroupName) !== Boolean(parentOptionName)) {
      errors.push(`Hoja Opciones, fila ${rowNumber}: completa "Grupo padre" y "Opción padre", o deja ambos vacíos.`);
      return;
    }
    const key = groupKey(productName, parentGroupName, parentOptionName, groupName);
    const requiredText = normalized(row.Obligatorio || "no");
    const selectionText = normalized(row["Tipo de selección"] || "una opción");
    const priceModeText = normalized(row["Regla de precio"] || "sumar");
    const selectionType =
      ["varias opciones", "multiple", "varias"].includes(selectionText)
        ? "multiple"
        : ["una opción", "single", "una"].includes(selectionText)
          ? "single"
          : null;
    const priceMode =
      ["más caro", "mas caro", "highest"].includes(priceModeText)
        ? "highest"
        : ["sumar", "sum"].includes(priceModeText)
          ? "sum"
          : null;
    const required = ["si", "sí", "yes", "true", "1"].includes(requiredText);
    if (!["si", "sí", "no", "yes", "true", "false", "1", "0"].includes(requiredText)) {
      errors.push(`Hoja Opciones, fila ${rowNumber}: "Obligatorio" debe ser Sí o No.`);
    }
    if (!selectionType) {
      errors.push(`Hoja Opciones, fila ${rowNumber}: "Tipo de selección" debe ser Una opción o Varias opciones.`);
    }
    if (!priceMode) {
      errors.push(`Hoja Opciones, fila ${rowNumber}: "Regla de precio" debe ser Sumar o Más caro.`);
    }
    const minimum = cellNumber(row.Mínimo, "Mínimo", rowNumber, errors, {
      optional: true,
    });
    const maximum = text(row.Máximo)
      ? cellNumber(row.Máximo, "Máximo", rowNumber, errors)
      : null;
    const maxExtraPrice = text(row["Tope de precio"])
      ? cellNumber(row["Tope de precio"], "Tope de precio", rowNumber, errors)
      : null;
    const extraPrice = cellNumber(row["Precio extra"], "Precio extra", rowNumber, errors, {
      optional: true,
    });
    if (selectionType === "single" && (minimum > 1 || maximum > 1)) {
      errors.push(`Hoja Opciones, fila ${rowNumber}: Una opción permite como máximo una alternativa.`);
    }
    if (maximum !== null && minimum > maximum) {
      errors.push(`Hoja Opciones, fila ${rowNumber}: el Mínimo no puede superar el Máximo.`);
    }
    let group = product.optionGroups.get(key);
    const config = {
      name: groupName,
      description: text(row["Descripción del grupo"]),
      is_required: required,
      selection_type: selectionType,
      min_selections: required ? Math.max(1, minimum) : minimum,
      max_selections: maximum,
      price_mode: priceMode,
      max_extra_price: maxExtraPrice,
      parentGroupName,
      parentOptionName,
      items: [],
    };
    if (!group) {
      group = config;
      product.optionGroups.set(key, group);
    } else if (
      group.description !== config.description ||
      group.is_required !== config.is_required ||
      group.selection_type !== config.selection_type ||
      group.min_selections !== config.min_selections ||
      group.max_selections !== config.max_selections ||
      group.price_mode !== config.price_mode ||
      group.max_extra_price !== config.max_extra_price
    ) {
      errors.push(`Hoja Opciones, fila ${rowNumber}: repite la misma configuración para todas las opciones del grupo "${groupName}".`);
    }
    if (group.items.some((item) => normalized(item.nombre) === normalized(optionName))) {
      errors.push(`Hoja Opciones, fila ${rowNumber}: la opción "${optionName}" está repetida en el grupo "${groupName}".`);
    } else {
      group.items.push({ nombre: optionName, precio_extra: extraPrice });
    }
  });

  productsByName.forEach((product) => {
    product.optionGroups.forEach((group) => {
      if (!group.parentGroupName) return;
      const parentKey = groupKey(product.name, "", "", group.parentGroupName);
      const parentGroup = product.optionGroups.get(parentKey);
      if (!parentGroup) {
        errors.push(`Producto "${product.name}": no se encontró el grupo padre "${group.parentGroupName}".`);
        return;
      }
      const parentOption = parentGroup.items.find(
        (item) => normalized(item.nombre) === normalized(group.parentOptionName),
      );
      if (!parentOption) {
        errors.push(`Producto "${product.name}": la opción padre "${group.parentOptionName}" no existe en "${group.parentGroupName}".`);
        return;
      }
      if (parentOption.childGroups) {
        errors.push(`Producto "${product.name}": la opción "${group.parentOptionName}" ya tiene un grupo dependiente.`);
        return;
      }
      parentOption.childGroups = [group];
    });
    product.optionGroups.forEach((group) => {
      if (!group.parentGroupName && group.items.some((item) => item.childGroups?.length)) {
        return;
      }
      if (group.parentGroupName && group.items.some((item) => item.childGroups?.length)) {
        errors.push(`Producto "${product.name}": no se permiten grupos dentro de un grupo dependiente.`);
      }
    });
  });

  return {
    products: [...productsByName.values()].map((product) => ({
      ...product,
      optionGroups: [...product.optionGroups.values()]
        .filter((group) => !group.parentGroupName)
        .map((group) => ({
          ...group,
          order_index: 0,
          items: group.items.map((item, index) => ({
            ...item,
            order_index: index + 1,
            childGroups: (item.childGroups || []).map((childGroup, childIndex) => ({
              ...childGroup,
              order_index: childIndex + 1,
              items: childGroup.items.map((childItem, childItemIndex) => ({
                ...childItem,
                order_index: childItemIndex + 1,
              })),
            })),
          })),
        })),
    })),
    errors,
  };
};
