export const buildProductOptionGroups = (groups = [], items = []) => {
  const itemsByGroup = new Map();
  items.forEach((item) => {
    if (!item.option_group_id) return;
    const groupItems = itemsByGroup.get(item.option_group_id) || [];
    groupItems.push(item);
    itemsByGroup.set(item.option_group_id, groupItems);
  });

  const groupsByParentItem = new Map();
  groups.forEach((group) => {
    const parentItemId = group.parent_item_id || null;
    const childGroups = groupsByParentItem.get(parentItemId) || [];
    childGroups.push(group);
    groupsByParentItem.set(parentItemId, childGroups);
  });

  const buildGroups = (parentItemId = null, depth = 0) => {
    if (depth > 1) return [];

    return (groupsByParentItem.get(parentItemId) || [])
      .slice()
      .sort(
        (a, b) => Number(a.order_index || 0) - Number(b.order_index || 0),
      )
      .map((group) => {
        const isRequired = Boolean(group.is_required ?? group.required);
        const minSelections = Math.max(
          isRequired ? 1 : 0,
          group.min_selections == null ? 0 : Number(group.min_selections),
        );
        const options = (itemsByGroup.get(group.id) || [])
          .slice()
          .sort(
            (a, b) => Number(a.order_index || 0) - Number(b.order_index || 0),
          )
          .map((item) => ({
            ...item,
            id: item.id,
            nombre:
              item.nombre ||
              item.name ||
              item.title ||
              item.label ||
              `Opción ${item.id}`,
            precio_extra: Number(item.precio_extra || 0),
            order: Number(item.order_index || 0),
            grupos: buildGroups(item.id, depth + 1),
          }));

        return {
          ...group,
          id: group.id,
          nombre: group.name || group.nombre || `Grupo ${group.id}`,
          descripcion: group.description || group.descripcion || "",
          obligatorio: isRequired,
          selectionType: group.selection_type || "single",
          maxSelections: Number(group.max_selections) || null,
          minSelections,
          priceMode: group.price_mode === "highest" ? "highest" : "sum",
          maxExtraPrice:
            group.max_extra_price == null
              ? null
              : Number(group.max_extra_price),
          order: Number(group.order_index || 0),
          opciones: options,
        };
      });
  };

  return buildGroups();
};

const getSelectedForGroup = (group, selections) => {
  const selected = selections[group.id];
  const selectedIds =
    group.selectionType === "multiple"
      ? Array.isArray(selected)
        ? selected
        : []
      : selected
        ? [selected]
        : [];

  return selectedIds
    .map((id) => group.opciones.find((option) => option.id === id))
    .filter(Boolean);
};

export const getSelectedProductOptions = (groups = [], selections = {}) => {
  const selectedOptions = [];

  const visitGroups = (optionGroups) => {
    optionGroups.forEach((group) => {
      getSelectedForGroup(group, selections).forEach((option) => {
        selectedOptions.push({
          ...option,
          grupoId: group.id,
          grupoNombre: group.nombre,
          priceMode: group.priceMode,
          maxExtraPrice: group.maxExtraPrice,
        });
        visitGroups(option.grupos || []);
      });
    });
  };

  visitGroups(groups);
  return selectedOptions;
};

export const clearDependentProductOptionSelections = (
  selections,
  options = [],
) => {
  const nextSelections = { ...selections };
  const clearOptionChildren = (option) => {
    (option.grupos || []).forEach((group) => {
      delete nextSelections[group.id];
      group.opciones.forEach(clearOptionChildren);
    });
  };
  options.forEach(clearOptionChildren);
  return nextSelections;
};

export const getProductOptionsExtraPrice = (groups = [], selections = {}) => {
  const getGroupPrice = (group) => {
    const selectedOptions = getSelectedForGroup(group, selections);
    const prices = selectedOptions.map((option) =>
      Math.max(0, Number(option.precio_extra || 0)),
    );
    let groupPrice =
      group.priceMode === "highest"
        ? Math.max(0, ...prices)
        : prices.reduce((sum, price) => sum + price, 0);

    if (group.priceMode !== "highest" && Number.isFinite(group.maxExtraPrice)) {
      groupPrice = Math.min(groupPrice, group.maxExtraPrice);
    }

    const dependentPrice = selectedOptions.reduce(
      (sum, option) =>
        sum + getProductOptionsExtraPrice(option.grupos || [], selections),
      0,
    );

    return groupPrice + dependentPrice;
  };

  return groups.reduce((sum, group) => sum + getGroupPrice(group), 0);
};

export const getSelectedOptionsExtraPrice = (options = []) => {
  const groups = new Map();
  let ungroupedPrice = 0;

  options.forEach((option) => {
    const price = Math.max(
      0,
      Number(
        option.precio_extra ??
          option.precioExtra ??
          option.price_extra ??
          option.extra_price ??
          option.price ??
          0,
      ),
    );
    const groupId = option.grupoId ?? option.grupo_id;
    if (!groupId) {
      ungroupedPrice += price;
      return;
    }

    const group = groups.get(groupId) || {
      priceMode: option.priceMode ?? option.price_mode,
      maxExtraPrice: option.maxExtraPrice ?? option.max_extra_price,
      prices: [],
    };
    group.prices.push(price);
    groups.set(groupId, group);
  });

  return (
    ungroupedPrice +
    [...groups.values()].reduce((sum, group) => {
      const groupPrice =
        group.priceMode === "highest"
          ? Math.max(0, ...group.prices)
          : group.prices.reduce((total, price) => total + price, 0);
      return (
        sum +
        (group.priceMode !== "highest" && Number.isFinite(group.maxExtraPrice)
          ? Math.min(groupPrice, group.maxExtraPrice)
          : groupPrice)
      );
    }, 0)
  );
};

export const getMissingProductOptionGroups = (
  groups = [],
  selections = {},
) => {
  const missingGroups = [];

  groups.forEach((group) => {
    const selected = getSelectedForGroup(group, selections);
    const minimum = Math.max(0, Number(group.minSelections || 0));
    const maximum =
      group.maxSelections == null
        ? Infinity
        : Math.max(0, Number(group.maxSelections));

    if (selected.length < minimum || selected.length > maximum) {
      missingGroups.push(group);
    }

    selected.forEach((option) => {
      missingGroups.push(
        ...getMissingProductOptionGroups(option.grupos || [], selections),
      );
    });
  });

  return missingGroups;
};
