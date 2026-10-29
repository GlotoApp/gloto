// ProductoDetalle.jsx
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Minus, Plus } from "lucide-react";
import { supabase } from "../../../src/lib/supabaseClient";
import {
  buildProductOptionGroups,
  clearDependentProductOptionSelections,
  getMissingProductOptionGroups,
  getProductOptionsExtraPrice,
  getSelectedProductOptions,
} from "../../../src/lib/productOptions";
import { useCart } from "./CartContext";

const fmt = (n) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

const normalizeOptionItem = (item) => ({
  id: item.id,
  nombre:
    item.nombre ||
    item.name ||
    item.title ||
    item.label ||
    item.option_name ||
    item.option ||
    item.text ||
    item.value ||
    `Opción ${item.id}`,
  precioExtra:
    Number(
      item.precio_extra ??
        item.price ??
        item.price_extra ??
        item.extra_price ??
        item.monto ??
        0,
    ) || 0,
  obligatorio:
    item.es_opcion_obligatoria ??
    item.mandatory ??
    item.is_mandatory ??
    item.required ??
    item.is_required ??
    false,
  tags: item.tags ?? item.tag ?? item.categories ?? null,
});

const ProductoDetalle = ({
  producto,
  onClose,
  onAgregarIntento,
  tiendaNombre,
  tiendaLogo,
  tiendaSlug,
  onAddedToCart,
  tiendaAbierta,
}) => {
  const {
    agregarConVariante,
    obtenerItemId,
    carrito,
    setNombreTienda,
    setLogoTienda,
    setTiendaSlug,
  } = useCart();
  const [opciones, setOpciones] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [selecciones, setSelecciones] = useState({});
  const [varianteId, setVarianteId] = useState(null);
  const [notas, setNotas] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [cantidadMedida, setCantidadMedida] = useState("1");

  useEffect(() => {
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
    };
  }, []);

  // Única fuente de verdad: las opciones ya vienen cargadas en
  // `producto.variantes` desde la consulta en bloque que hace
  // Shop.jsx (una sola vez, para todos los productos, en `obtenerTienda`).
  // Antes este componente volvía a consultar "products_items" por su
  // cuenta (una tercera consulta redundante) y, si esa consulta llegaba
  // a devolver un arreglo vacío por cualquier motivo (RLS, timing,
  // condición de carrera), pisaba las opciones correctas que ya
  // traía `producto`. Quitar esa consulta elimina ese punto de falla.
  useEffect(() => {
    let activo = true;

    const mapGroups = (rawGroups) =>
      (rawGroups || [])
        .map((group) => {
          const isRequired =
            group.is_required ??
            group.es_requerido ??
            group.required ??
            group.isRequired ??
            false;
          const selectionType =
            group.selection_type ??
            group.selectionType ??
            group.type ??
            group.selection ??
            "single";
          const rawOptions =
            group.opciones ||
            group.options ||
            group.items ||
            group.products_items ||
            group.product_options ||
            [];

          return {
            id: group.id,
            nombre:
              group.name || group.nombre || group.title || `Grupo ${group.id}`,
            descripcion:
              group.description || group.descripcion || group.hint || "",
            obligatorio: Boolean(isRequired),
            selectionType,
            maxSelections:
              Number(group.max_selections ?? group.maxSelections) || null,
            minSelections:
              group.min_selections == null
                ? isRequired
                  ? 1
                  : 0
                : Number(group.min_selections),
            priceMode:
              group.price_mode ?? group.priceMode ?? "sum",
            maxExtraPrice:
              group.max_extra_price == null &&
              group.maxExtraPrice == null
                ? null
                : Number(group.max_extra_price ?? group.maxExtraPrice),
            order: Number(
              group.order_index ?? group.orderIndex ?? group.order ?? 0,
            ),
            opciones: rawOptions
              .map((item) => ({
                ...normalizeOptionItem(item),
                precio_extra: Number(
                  item.precio_extra ?? item.precioExtra ?? 0,
                ),
                order: Number(item.order_index ?? item.order ?? 0),
                grupos: mapGroups(item.grupos || item.childGroups || []),
              }))
              .sort((a, b) => a.order - b.order),
          };
        })
        .sort((a, b) => a.order - b.order);

    const loadFallbackGroups = async () => {
      try {
        const [groupsRes, itemsRes] = await Promise.all([
          supabase
            .from("product_option_groups")
            .select("*")
            .eq("product_id", producto.id)
            .order("order_index", { ascending: true }),
          supabase
            .from("products_items")
            .select("*")
            .eq("product_id", producto.id)
            .order("order_index", { ascending: true }),
        ]);

        if (groupsRes.error) {
          console.error("Error al obtener grupos fallback:", groupsRes.error);
          return [];
        }
        if (itemsRes.error) {
          console.error("Error al obtener opciones fallback:", itemsRes.error);
          return [];
        }

        return buildProductOptionGroups(
          groupsRes.data || [],
          itemsRes.data || [],
        );
      } catch (error) {
        console.error("Error en fallback de grupos:", error);
        return [];
      }
    };

    const initialize = async () => {
      const rawGroups =
        producto.option_groups ||
        producto.product_option_groups ||
        producto.groups ||
        producto.product_option_groups ||
        producto.option_groups ||
        producto.groups ||
        [];

      let parsedGroups = mapGroups(rawGroups);

      const initialOptions = (
        producto.variantes ||
        producto.products_items ||
        producto.options ||
        []
      ).map(normalizeOptionItem);

      if (parsedGroups.length === 0) {
        const fallbackGroups = await loadFallbackGroups();
        if (fallbackGroups.length > 0) {
          parsedGroups = mapGroups(fallbackGroups);
        }
      }

      if (!activo) return;

      if (parsedGroups.length > 0) {
        setGrupos(parsedGroups);
        setOpciones([]);
        setSelecciones({});
      } else {
        setGrupos([]);
        setOpciones(initialOptions);
        setSelecciones({});
      }

      setNotas("");
      setCantidad(1);
      setCantidadMedida("1");
      setVarianteId(null);
    };

    initialize();

    return () => {
      activo = false;
    };
  }, [producto]);

  if (!producto) return null;

  const modoGrupos = grupos.length > 0;
  const hasAdvancedGroups = (optionGroups) =>
    optionGroups.some(
      (group) =>
        group.minSelections > 1 ||
        group.priceMode === "highest" ||
        group.maxExtraPrice !== null ||
        group.opciones.some(
          (option) =>
            (option.grupos || []).length > 0 ||
            hasAdvancedGroups(option.grupos || []),
        ),
    );
  const renderAdvancedOptions = hasAdvancedGroups(grupos);

  const selectedOptions = modoGrupos
    ? getSelectedProductOptions(grupos, selecciones)
    : [];

  const variante = modoGrupos
    ? selectedOptions.length > 0
      ? {
          id: selectedOptions.map((opt) => opt.id).join("__"),
          nombre: selectedOptions.map((opt) => opt.nombre).join(" · "),
          precioExtra: getProductOptionsExtraPrice(grupos, selecciones),
          opciones: selectedOptions.map((opt) => ({
            id: opt.id,
            nombre: opt.nombre,
            precioExtra: Number(opt.precio_extra ?? opt.precioExtra) || 0,
            grupoId: opt.grupoId,
            priceMode: opt.priceMode,
            maxExtraPrice: opt.maxExtraPrice,
          })),
        }
      : null
    : opciones.find((v) => v.id === varianteId) || null;

  const precioUnitario = producto.precio + (variante?.precioExtra || 0);
  const unidadVenta = producto.unit || {
    name: "UNIDAD",
    allows_fraction: false,
  };
  const admiteFracciones = unidadVenta.allows_fraction === true;
  const cantidadIngresada = admiteFracciones
    ? Number(String(cantidadMedida).replace(",", "."))
    : cantidad;
  const cantidadAgregada = Number.isFinite(cantidadIngresada)
    ? cantidadIngresada
    : 0;
  const precioTotal = precioUnitario * cantidadAgregada;
  const stockDisponible =
    typeof producto.stock === "number" ? producto.stock : Infinity;

  const tieneOpcionesObligatorias = modoGrupos
    ? grupos.some((group) => group.obligatorio)
    : opciones.some((opt) => opt.obligatorio);

  const missingRequiredGroups = modoGrupos
    ? getMissingProductOptionGroups(grupos, selecciones)
    : [];
  const requiereSeleccionarVariante = modoGrupos
    ? missingRequiredGroups.length > 0
    : tieneOpcionesObligatorias && varianteId === null;

  // Clave exacta que ocupará esta combinación de variante + notas en el
  // carrito. Es la MISMA función que usa CartContext al agregar, así que
  // esta pantalla siempre lee el número real que ya hay en esa línea del
  // carrito — sin importar si se agregó desde aquí o desde el botón "+"
  // de la lista de la tienda.
  const itemId = obtenerItemId(producto.id, variante, notas);
  const yaEnCarrito = carrito[itemId] || 0;

  const agotado =
    producto.isAvailable === false ||
    stockDisponible <= 0 ||
    producto.is_sold_out === true ||
    producto.isSoldOut === true ||
    producto.sold_out === true;
  const limiteAlcanzado = !agotado && yaEnCarrito >= stockDisponible;
  const restanteParaAgregar = Math.max(0, stockDisponible - yaEnCarrito);
  const alcanzoStock =
    restanteParaAgregar <= 0 || cantidadAgregada >= restanteParaAgregar;
  const noSePuedeAgregar =
    !tiendaAbierta ||
    agotado ||
    limiteAlcanzado ||
    cantidadAgregada <= 0 ||
    cantidadAgregada > restanteParaAgregar;

  const renderOptionGroup = (group, depth = 0) => {
    const selectedValue = selecciones[group.id];
    const selectedValues = Array.isArray(selectedValue)
      ? selectedValue
      : selectedValue
        ? [selectedValue]
        : [];
    const helperText =
      group.selectionType === "multiple"
        ? `${group.minSelections ? `Mínimo ${group.minSelections} · ` : ""}${
            group.maxSelections
              ? `Hasta ${group.maxSelections}`
              : "Selecciona varias"
          }`
        : "Elige una";

    return (
      <div
        key={group.id}
        data-option-group-id={group.id}
        style={{
          marginBottom: depth > 0 ? "8px" : "14px",
          marginTop: depth > 0 ? "8px" : "0",
          marginLeft: `${Math.min(depth, 3) * 12}px`,
          padding: depth > 0 ? "14px 10px 9px" : "12px",
          borderRadius: depth > 0 ? "12px" : "14px",
          border:
            depth > 0 ? "none" : "none",
          borderLeft:
            depth > 0 ? "2px solid rgba(167,139,250,0.65)" : "none",
          background:
            depth > 0 ? "rgba(124,58,237,0.06)" : "rgba(255,255,255,0.03)",
        }}
      >
        <div style={{ marginBottom: depth > 0 ? "7px" : "10px" }}>
          {depth > 0 ? (
            <span
              style={{
                display: "block",
                marginBottom: "4px",
                color: "#c4b5fd",
                fontSize: "9px",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Personaliza esta opción
            </span>
          ) : null}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "6px",
              alignItems: "center",
            }}
          >
            <p style={{ fontSize: depth > 0 ? "13px" : "14px", fontWeight: 700, margin: 0 }}>
              {group.nombre}
            </p>
            {group.minSelections > 0 ? (
              <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[9px] font-bold text-amber-200">
                Obligatorio
              </span>
            ) : null}
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9px]">
              {helperText}
            </span>
            {group.priceMode === "highest" ? (
              <span className="rounded-full bg-violet-400/10 px-2.5 py-1 text-[10px] text-violet-200">
                Se cobra el precio más alto
              </span>
            ) : null}
          </div>
          {group.descripcion ? (
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.65)", margin: "10px 0 0" }}>
              {group.descripcion}
            </p>
          ) : null}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              depth > 0 ? "repeat(auto-fit, minmax(120px, 1fr))" : "1fr",
            gap: "6px",
          }}
        >
          {group.opciones.map((option) => {
            const isSelected = selectedValues.includes(option.id);
            const reachedMax =
              group.selectionType === "multiple" &&
              group.maxSelections !== null &&
              selectedValues.length >= group.maxSelections &&
              !isSelected;
            return (
              <div key={option.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  disabled={reachedMax}
                  onClick={() =>
                    setSelecciones((previous) => {
                      const current = previous[group.id];
                      const values = Array.isArray(current)
                        ? current
                        : current
                          ? [current]
                          : [];
                      if (group.selectionType === "multiple") {
                        const isRemoving = values.includes(option.id);
                        const cleared = isRemoving
                          ? clearDependentProductOptionSelections(
                              previous,
                              [option],
                            )
                          : { ...previous };
                        cleared[group.id] = isRemoving
                          ? values.filter((id) => id !== option.id)
                          : [...values, option.id];
                        return cleared;
                      }
                      const isRemoving = values.includes(option.id);
                      const optionsToClear = values
                        .map((id) =>
                          group.opciones.find((item) => item.id === id),
                        )
                        .filter((item) => item && (isRemoving || item.id !== option.id));
                      const cleared = clearDependentProductOptionSelections(
                        previous,
                        optionsToClear,
                      );
                      return {
                        ...cleared,
                        [group.id]: isRemoving ? null : option.id,
                      };
                    })
                  }
                  style={{
                    width: "100%",
                    background: isSelected
                      ? depth > 0
                        ? "rgba(124,58,237,0.18)"
                        : "linear-gradient(135deg, rgba(124,58,237,0.22), rgba(124,58,237,0.12))"
                      : depth > 0
                        ? "rgba(0,0,0,0.22)"
                        : "#090909",
                    border: isSelected
                      ? `1px solid ${depth > 0 ? "rgba(167,139,250,0.7)" : "#7c3aed"}`
                      : `1px solid ${depth > 0 ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.10)"}`,
                    color: isSelected ? "#fff" : "rgba(255,255,255,0.92)",
                    borderRadius: depth > 0 ? "10px" : "16px",
                    padding: depth > 0 ? "8px 9px" : "12px 14px",
                    opacity: reachedMax ? 0.45 : 1,
                    cursor: reachedMax ? "not-allowed" : "pointer",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: depth > 0 ? "column" : "row",
                    alignItems: depth > 0 ? "flex-start" : "center",
                    justifyContent: depth > 0 ? "flex-start" : "space-between",
                    gap: depth > 0 ? "5px" : "14px",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: depth > 0 ? "16px" : "18px",
                        height: depth > 0 ? "16px" : "18px",
                        borderRadius: "999px",
                        border: isSelected
                          ? "1px solid #7c3aed"
                          : "1px solid rgba(255,255,255,0.25)",
                        background: isSelected ? "#7c3aed" : "transparent",
                        color: "#fff",
                        fontSize: "12px",
                        fontWeight: 800,
                      }}
                    >
                      {isSelected ? "✓" : ""}
                    </span>
                    <span style={{ fontSize: depth > 0 ? "12px" : "14px", fontWeight: 700 }}>
                      {option.nombre}
                    </span>
                  </span>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)" }}>
                    {option.precio_extra ?? option.precioExtra
                      ? `+${fmt(option.precio_extra ?? option.precioExtra)}`
                      : "Incluido"}
                  </span>
                </button>
                {isSelected
                  ? (option.grupos || []).map((childGroup) =>
                      renderOptionGroup(childGroup, depth + 1),
                    )
                  : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const handleAgregar = () => {
    if (noSePuedeAgregar || requiereSeleccionarVariante) return;
    if (onAgregarIntento && !onAgregarIntento()) return;
    // Aseguramos que el contexto del carrito refleje la tienda desde
    // la que se está agregando el producto.
    try {
      if (tiendaNombre) setNombreTienda(tiendaNombre);
      if (tiendaLogo) setLogoTienda(tiendaLogo);
      if (tiendaSlug) setTiendaSlug(tiendaSlug);
    } catch (e) {
      // no rompemos la UX si algo falla aquí
    }

    agregarConVariante({
      productoBase: producto,
      variante,
      notas,
      cantidad: cantidadAgregada,
    });
    onAddedToCart?.(producto);
    onClose();
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0a0a0a",
        color: "#fff",
        zIndex: 250,
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overscrollBehaviorY: "contain",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Imagen / emoji grande */}
        <div
          style={{
            position: "relative",
            height: "42vh",
            minHeight: "300px",
            background:
              "radial-gradient(circle at 50% 30%, #1d1d1d 0%, #0a0a0a 70%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              position: "absolute",
              top: "16px",
              right: "16px",
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: "rgba(0,0,0,0.45)",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              zIndex: 1,
            }}
            aria-label="Cerrar"
          >
            <X size={18} color="#fff" />
          </button>

          {producto.image ? (
            <img
              src={producto.image}
              alt={producto.nombre}
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = "/default.png";
              }}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span style={{ fontSize: "64px", fontWeight: 700, color: "#fff" }}>
              {producto.nombre?.charAt(0).toUpperCase() || "?"}
            </span>
          )}
        </div>

        <div style={{ padding: "20px" }}>
          {producto.tag && (
            <span
              style={{
                display: "inline-block",
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#a78bfa",
                marginBottom: "6px",
              }}
            >
              {producto.tag}
            </span>
          )}

          <h2 style={{ fontSize: "20px", fontWeight: 800, margin: "0 0 6px" }}>
            {producto.nombre}
          </h2>
          {Number(producto.precio) > 0 && (
            <p
              style={{
                fontSize: "18px",
                fontWeight: 800,
                color: "#fff",
                margin: "0 0 10px",
              }}
            >
              {fmt(producto.precio)}{" "}
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.58)",
                }}
              >
                {unidadVenta.name}
              </span>
            </p>
          )}
          <p
            style={{
              fontSize: "13px",
              color: "rgba(255,255,255,0.5)",
              lineHeight: 1.6,
              marginBottom: agotado || stockDisponible <= 5 ? "8px" : "20px",
            }}
          >
            {producto.desc}
          </p>

          {agotado ? (
            <p
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#e53e3e",
                marginBottom: "20px",
              }}
            >
              Producto agotado
            </p>
          ) : (
            stockDisponible <= 5 && (
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#f6e05e",
                  marginBottom: "20px",
                }}
              >
                ¡Solo quedan {stockDisponible} {unidadVenta.name}!
              </p>
            )
          )}

          {/* Grupos de opciones (tamaños, endulzante, etc.) */}
          {renderAdvancedOptions ? (
            grupos.map((group) => renderOptionGroup(group))
          ) : grupos.length > 0 ? (
            grupos.map((group) => {
              const seleccionActual = selecciones[group.id];
              const selectedValues = Array.isArray(seleccionActual)
                ? seleccionActual
                : seleccionActual
                  ? [seleccionActual]
                  : [];
              return (
                <div
                  key={group.id}
                  style={{
                    marginBottom: "18px",
                    padding: "16px",
                    borderRadius: "8px",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div style={{ marginBottom: "12px" }}>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "10px",
                        alignItems: "center",
                      }}
                    >
                      <p
                        style={{
                          fontSize: "15px",
                          fontWeight: 700,
                          color: "#fff",
                          margin: 0,
                        }}
                      >
                        {group.nombre}
                      </p>
                      {group.obligatorio && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "4px 10px",
                            borderRadius: "999px",
                            fontSize: "11px",
                            fontWeight: 700,
                            color: "#fefce8",
                            background: "rgba(251,191,36,0.16)",
                          }}
                        >
                          Obligatorio
                        </span>
                      )}
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "4px 10px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "rgba(255,255,255,0.85)",
                          background: "rgba(255,255,255,0.05)",
                        }}
                      >
                        {group.selectionType === "multiple"
                          ? group.maxSelections
                            ? `Hasta ${group.maxSelections} opciones`
                            : "Selecciona varias"
                          : "Elige una"}
                      </span>
                    </div>
                    {group.descripcion ? (
                      <p
                        style={{
                          fontSize: "12px",
                          color: "rgba(255,255,255,0.65)",
                          margin: "6px 0 0",
                        }}
                      >
                        {group.descripcion}
                      </p>
                    ) : null}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                  >
                    {group.opciones.map((opt) => {
                      const activo = selectedValues.includes(opt.id);
                      const reachedMax =
                        group.selectionType === "multiple" &&
                        group.maxSelections !== null &&
                        selectedValues.length >= group.maxSelections &&
                        !activo;

                      return (
                        <button
                          key={opt.id}
                          type="button"
                          aria-pressed={activo}
                          disabled={reachedMax}
                          onClick={() =>
                            setSelecciones((prev) => {
                              const current = prev[group.id];
                              const values = Array.isArray(current)
                                ? current
                                : current
                                  ? [current]
                                  : [];

                              if (group.selectionType === "multiple") {
                                const nextValues = values.includes(opt.id)
                                  ? values.filter((id) => id !== opt.id)
                                  : [...values, opt.id];

                                return {
                                  ...prev,
                                  [group.id]: nextValues,
                                };
                              }

                              return {
                                ...prev,
                                [group.id]: values.includes(opt.id)
                                  ? null
                                  : opt.id,
                              };
                            })
                          }
                          style={{
                            width: "100%",
                            background: activo
                              ? "linear-gradient(135deg, rgba(124,58,237,0.22), rgba(124,58,237,0.12))"
                              : "#090909",
                            border: activo
                              ? "1px solid #7c3aed"
                              : "1px solid rgba(255,255,255,0.10)",
                            color: activo ? "#fff" : "rgba(255,255,255,0.92)",
                            borderRadius: "20px",
                            padding: "16px 18px",
                            opacity: reachedMax ? 0.45 : 1,
                            cursor: reachedMax ? "not-allowed" : "pointer",
                            textAlign: "left",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "14px",
                            boxShadow: activo
                              ? "0 20px 35px rgba(124,58,237,0.12)"
                              : "none",
                            transition:
                              "border-color 150ms ease, background 150ms ease, box-shadow 150ms ease",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "20px",
                                height: "20px",
                                borderRadius: "999px",
                                border: activo
                                  ? "1px solid #7c3aed"
                                  : "1px solid rgba(255,255,255,0.25)",
                                background: activo ? "#7c3aed" : "transparent",
                                color: activo ? "#fff" : "transparent",
                                fontSize: "12px",
                                fontWeight: 800,
                              }}
                            >
                              ✓
                            </span>
                            <div
                              style={{
                                fontSize: "15px",
                                fontWeight: 700,
                                lineHeight: 1.3,
                                color: activo
                                  ? "#fff"
                                  : "rgba(255,255,255,0.92)",
                              }}
                            >
                              {opt.nombre}
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: "14px",
                              color: activo
                                ? "#d8b4fe"
                                : "rgba(255,255,255,0.65)",
                              fontWeight: activo ? 700 : 500,
                            }}
                          >
                            {opt.precioExtra
                              ? `+${fmt(opt.precioExtra)}`
                              : "Incluido"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : opciones.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                gap: "10px",
              }}
            >
              {opciones.map((v) => {
                const activo = v.id === varianteId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    aria-pressed={activo}
                    onClick={() =>
                      setVarianteId((currentId) =>
                        currentId === v.id ? null : v.id,
                      )
                    }
                    style={{
                      background: activo ? "#7c3aed" : "#080808",
                      border: activo
                        ? "1px solid #7c3aed"
                        : "1px solid rgba(255,255,255,0.08)",
                      color: activo ? "#fff" : "rgba(255,255,255,0.75)",
                      borderRadius: "18px",
                      padding: "16px 14px",
                      cursor: "pointer",
                      textAlign: "center",
                      boxShadow: activo
                        ? "0 18px 32px rgba(124,58,237,0.2)"
                        : "none",
                      transition:
                        "background 150ms ease, border-color 150ms ease, box-shadow 150ms ease",
                    }}
                  >
                    <div style={{ fontSize: "15px", fontWeight: 700 }}>
                      {v.nombre}
                    </div>
                    {v.precioExtra ? (
                      <div
                        style={{
                          fontSize: "14px",
                          color: activo ? "#f8f7ff" : "rgba(255,255,255,0.55)",
                          marginTop: "4px",
                        }}
                      >
                        +{fmt(v.precioExtra)}
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: "14px",
                          color: activo ? "#d8b4fe" : "rgba(255,255,255,0.5)",
                          marginTop: "4px",
                        }}
                      >
                        Incluido
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* Indicaciones / notas para este producto */}
          <div style={{ marginBottom: "12px" }}>
            <label
              htmlFor="notas-producto"
              style={{
                display: "block",
                fontSize: "16px",
                fontWeight: 700,
                color: "rgba(255,255,255,0.7)",
                marginBottom: "8px",
              }}
            >
              Indicaciones extras (opcional)
            </label>
            <textarea
              id="notas-producto"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Añade indicaciones extras aquí..."
              rows={3}
              style={{
                width: "100%",
                resize: "vertical",
                background: "#131313",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "14px",
                padding: "12px 14px",
                color: "#fff",
                fontSize: "16px",
                fontFamily: "inherit",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>
      </div>

      {/* Footer: cantidad + agregar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "16px 20px",
          paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
          borderTop: "1px solid #1a1a1a",
          flexShrink: 0,
          background: "#050505",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            background: "#131313",
            borderRadius: "100px",
            padding: "10px 14px",
            flexShrink: 0,
          }}
        >
          {admiteFracciones ? (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: "#fff",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              Cantidad ({unidadVenta.name})
              <input
                type="text"
                inputMode="decimal"
                value={cantidadMedida}
                onChange={(event) => {
                  const value = event.target.value.replace(",", ".");
                  if (/^\d*(\.\d{0,3})?$/.test(value)) {
                    setCantidadMedida(value);
                  }
                }}
                aria-label={`Cantidad en ${unidadVenta.name}`}
                style={{
                  width: "84px",
                  borderRadius: "10px",
                  border: "1px solid #333",
                  background: "#131313",
                  color: "#fff",
                  padding: "9px",
                }}
              />
            </label>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                style={{
                  background: "none",
                  border: "none",
                  color: "#fff",
                  cursor: "pointer",
                  display: "flex",
                }}
                aria-label="Quitar uno"
              >
                <Minus size={16} />
              </button>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 800,
                  minWidth: "16px",
                  textAlign: "center",
                }}
              >
                {cantidad}
              </span>
              <button
                type="button"
                onClick={() =>
                  setCantidad((c) => (c < restanteParaAgregar ? c + 1 : c))
                }
                disabled={alcanzoStock}
                style={{
                  background: "none",
                  border: "none",
                  color: alcanzoStock ? "rgba(255,255,255,0.3)" : "#fff",
                  cursor: alcanzoStock ? "not-allowed" : "pointer",
                  display: "flex",
                }}
                aria-label="Agregar uno"
              >
                <Plus size={16} />
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={handleAgregar}
          disabled={noSePuedeAgregar || requiereSeleccionarVariante}
          style={{
            flex: 1,
            padding: "10px",
            borderRadius: "100px",
            background:
              noSePuedeAgregar || requiereSeleccionarVariante
                ? "rgba(124,58,237,0.25)"
                : "#7c3aed",
            color:
              noSePuedeAgregar || requiereSeleccionarVariante
                ? "rgba(255,255,255,0.5)"
                : "#fff",
            fontWeight: 800,
            fontSize: "14px",
            border: "none",
            cursor:
              noSePuedeAgregar || requiereSeleccionarVariante
                ? "not-allowed"
                : "pointer",
            boxShadow:
              noSePuedeAgregar || requiereSeleccionarVariante
                ? "none"
                : "0 8px 32px rgba(124,58,237,0.45)",
          }}
        >
          {!tiendaAbierta
            ? "Tienda cerrada"
            : agotado
              ? "Agotado"
              : limiteAlcanzado
                ? "Máximo alcanzado"
                : requiereSeleccionarVariante
                  ? "Selecciona una opción"
                  : `Agregar · ${fmt(precioTotal)}`}
        </button>
      </div>
    </div>,
    document.body,
  );
};

export default ProductoDetalle;
