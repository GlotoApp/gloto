// Carrito.jsx
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  Trash2,
  ShoppingBag,
  Banknote,
  CreditCard,
  Landmark,
  Split,
  Store,
} from "lucide-react";
import { useCart } from "./CartContext";

const fmt = (n) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(n);

const formatNumberForInput = (value) => {
  if (!value) return "";
  // Quita todo lo que no sea número y agrega puntos de miles
  const num = String(value).replace(/\D/g, "");
  return new Intl.NumberFormat("es-CO").format(Number(num));
};

const METODOS_PAGO = [
  { id: "Efectivo", label: "Efectivo", Icon: Banknote },
  { id: "Tarjeta", label: "Tarjeta", Icon: CreditCard },
  { id: "Transferencia", label: "Transferencia", Icon: Landmark },
  { id: "Dividir", label: "Dividir", Icon: Split },
];

const Carrito = ({ onIrAPagar }) => {
  const [imageError, setImageError] = useState(false);

  const {
    carrito,
    productos,
    nombreTienda,
    logoTienda,
    cerrarCarrito,
    agregar,
    quitar,
    eliminar,
    vaciarTodo,
    observaciones,
    setObservaciones,
    metodoPago,
    agregarDivision,
    eliminarDivision,
    actualizarDivision,
    setMetodoPago,
    puedeHacerPedido,
    itemsAgotados,
    totalItems,
    totalPrecio,
    totalPagado,
  } = useCart();

  const hayFilaSinMetodo =
    metodoPago.length > 1 && metodoPago.some((it) => !it.metodo);

  useEffect(() => {
    setImageError(false);
  }, [logoTienda]);

  useEffect(() => {
    if (metodoPago.length === 1) {
      setMetodoPago((prev) => [{ ...prev[0], monto: totalPrecio }]);
    }
  }, [totalPrecio]);

  const [confirmVaciarOpen, setConfirmVaciarOpen] = useState(false);
  const [removingItems, setRemovingItems] = useState([]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const handleEliminar = (id) => {
    if (removingItems.includes(id)) return;
    setRemovingItems((prev) => [...prev, id]);
    window.setTimeout(() => {
      eliminar(id);
      setRemovingItems((prev) => prev.filter((itemId) => itemId !== id));
    }, 220);
  };

  const items = productos.filter((p) => carrito[p.id] > 0);

  const handlePedir = () => {
    if (!puedeHacerPedido) return;
    // TODO: conectar con el envío real del pedido (API / backend).
    if (onIrAPagar) onIrAPagar();
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0a0a0a",
        color: "#fff",
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "11px 4px",
          borderBottom: "1px solid #1a1a1a",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={cerrarCarrito}
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
          aria-label="Volver a la tienda"
        >
          <ChevronLeft size={20} color="#fff" />
        </button>
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "12px",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* La lógica con onError para manejar errores de carga */}
          {logoTienda && !imageError ? (
            <img
              src={logoTienda}
              alt={`Logo de ${nombreTienda}`}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={() => setImageError(true)}
            />
          ) : (
            <Store size={24} style={{ color: "rgba(255,255,255,0.3)" }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: "16px", fontWeight: 800, margin: 0 }}>
            Resumen
          </h2>
          <p
            style={{
              fontSize: "12px",
              color: "rgba(255,255,255,0.45)",
              margin: 0,
            }}
          >
            {nombreTienda}
          </p>
        </div>

        {items.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmVaciarOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              borderRadius: "100px",
              padding: "8px 12px",
              color: "rgba(255,255,255,0.7)",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
              flexShrink: 0,
            }}
            aria-label="Vaciar carrito"
          >
            <Trash2 size={14} />
            Vaciar
          </button>
        )}
      </div>

      {/* Cuerpo scrolleable */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Lista de items */}
        <div style={{ padding: "12px 0" }}>
          {items.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "72px 24px",
                color: "rgba(255,255,255,0.35)",
              }}
            >
              <p style={{ fontSize: "13px" }}>Tu carrito está vacío.</p>
            </div>
          ) : (
            items.map((p) => {
              const qty = carrito[p.id];
              const stockDisponible =
                typeof p.stock === "number" ? p.stock : Infinity;
              const alcanzoStock = qty >= stockDisponible;
              return (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    padding: "14px 20px",
                    borderBottom: "1px solid #222222",
                    opacity: removingItems.includes(p.id) ? 0 : 1,
                    transform: removingItems.includes(p.id)
                      ? "translateX(-18px)"
                      : "translateX(0)",
                    transition: "opacity 0.22s ease, transform 0.22s ease",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleEliminar(p.id)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      flexShrink: 0,
                      display: "flex",
                    }}
                    aria-label={`Eliminar ${p.nombre} del carrito`}
                  >
                    <Trash2 size={16} color="rgba(255,255,255,0.35)" />
                  </button>
                  <div
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "14px",
                      background: "#131313",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                    }}
                  >
                    {p.image ? (
                      <img
                        src={p.image}
                        alt={p.nombre}
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = "/default.png";
                        }}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          fontSize: "20px",
                          fontWeight: 700,
                          color: "#fff",
                        }}
                      >
                        {p.nombre?.charAt(0).toUpperCase() || "?"}
                      </span>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        gap: "8px",
                        marginBottom: "6px",
                        width: "100%",
                      }}
                    >
                      <h4
                        style={{
                          fontSize: "15px",
                          fontWeight: 700,
                          margin: 0,
                          display: "flex",
                          alignItems: "baseline",
                          gap: "6px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span>
                          {p.varianteNombre
                            ? p.nombre.replace(` · ${p.varianteNombre}`, "")
                            : p.nombre}
                        </span>
                        <span
                          style={{
                            fontSize: "14px",
                            fontWeight: 800,
                            color: "#fff",
                            whiteSpace: "nowrap",
                          }}
                        >
                          - {fmt((p.precioBase ?? p.precio) * qty)}
                        </span>
                      </h4>
                    </div>
                    {p.varianteNombre && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "4px",
                          marginBottom: "10px",
                        }}
                      >
                        {(Array.isArray(p.opciones) && p.opciones.length > 0
                          ? p.opciones
                          : p.varianteNombre.split(" · ").map((opt, index) => ({
                              nombre: opt,
                              precioExtra:
                                index === 0 && Number(p.precioExtraTotal) > 0
                                  ? Number(p.precioExtraTotal)
                                  : 0,
                            }))
                        ).map((opt, index) => (
                          <span
                            key={`${opt.nombre}-${index}`}
                            style={{
                              fontSize: "12px",
                              fontWeight: 700,
                              color: "#fff",
                              background: "rgba(124,58,237,0.16)",
                              padding: "5px 5px",
                              borderRadius: "999px",
                              lineHeight: 1.4,
                            }}
                          >
                            {opt.nombre}
                            {Number(opt.precioExtra) > 0
                              ? ` +${fmt(Number(opt.precioExtra))}`
                              : ""}
                          </span>
                        ))}
                      </div>
                    )}
                    {p.notas && (
                      <p
                        style={{
                          fontSize: "13px",
                          color: "rgba(255,255,255,0.65)",
                          fontStyle: "italic",
                          margin: "0 0 4px",
                          lineHeight: 1.5,
                        }}
                      >
                        "{p.notas}"
                      </p>
                    )}
                    {alcanzoStock && (
                      <p
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "#f6e05e",
                          margin: "4px 0 0",
                        }}
                      >
                        Máximo disponible alcanzado
                      </p>
                    )}
                    {p.isAvailable === false && (
                      <p
                        style={{
                          fontSize: "12px",
                          fontWeight: 800,
                          color: "#fc8181",
                          margin: "4px 0 0",
                        }}
                      >
                        Agotado mientras estaba en tu carrito
                      </p>
                    )}
                  </div>

                  {/* Stepper cantidad */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "15px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        background: "#131313",
                        borderRadius: "100px",
                        padding: "6px 12px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => quitar(p.id)}
                        style={{
                          color: "#fff",
                          background: "none",
                          border: "none",
                          fontSize: "16px",
                          fontWeight: 700,
                          cursor: "pointer",
                          lineHeight: 1,
                          padding: 0,
                        }}
                        aria-label={`Quitar ${p.nombre}`}
                      >
                        −
                      </button>
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: 800,
                          minWidth: "14px",
                          textAlign: "center",
                        }}
                      >
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (alcanzoStock) return;
                          agregar(p.id);
                        }}
                        disabled={alcanzoStock}
                        style={{
                          color: alcanzoStock
                            ? "rgba(255,255,255,0.3)"
                            : "#fff",
                          background: "none",
                          border: "none",
                          fontSize: "16px",
                          fontWeight: 700,
                          cursor: alcanzoStock ? "not-allowed" : "pointer",
                          lineHeight: 1,
                          padding: 0,
                        }}
                        aria-label={`Agregar ${p.nombre}`}
                      >
                        +
                      </button>
                    </div>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 800,
                        color: "#fff",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fmt(
                        ((Number(p.precioBase ?? p.precio) || 0) +
                          (Number(p.precioExtraTotal) || 0)) *
                          qty,
                      )}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {items.length > 0 && (
          <>
            {itemsAgotados.length > 0 && (
              <div
                style={{
                  margin: "4px 20px 12px",
                  padding: "12px 14px",
                  border: "1px solid rgba(252,129,129,0.35)",
                  borderRadius: "14px",
                  background: "rgba(252,129,129,0.08)",
                  color: "#fc8181",
                  fontSize: "13px",
                  fontWeight: 700,
                  lineHeight: 1.45,
                }}
              >
                Hay productos agotados en tu carrito. Elimínalos para continuar
                con la compra.
              </div>
            )}
            {/* Observaciones generales */}
            <div style={{ padding: "16px 20px" }}>
              <label
                htmlFor="observaciones-pedido"
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.7)",
                  marginBottom: "8px",
                }}
              >
                Observaciones generales
              </label>
              <textarea
                id="observaciones-pedido"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Instrucción especial para tu pedido aquí..."
                rows={3}
                style={{
                  width: "100%",
                  resize: "vertical",
                  background: "#131313",
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

            {/* Método de pago */}
            <div style={{ padding: "4px 20px 20px" }}>
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.7)",
                  marginBottom: "10px",
                }}
              >
                Método de pago
              </p>

              {/* 1. Botones siempre visibles */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "10px",
                  marginBottom: "15px",
                  justifyItems: "center",
                }}
              >
                {METODOS_PAGO.map(({ id, label, Icon }) => {
                  // Definimos si el botón está activo:
                  // - Si es Dividir: está activo si hay más de 1 elemento en el array.
                  // - Si es otro método: está activo si hay exactamente 1 elemento y es ese método.
                  const activo =
                    id === "Dividir"
                      ? metodoPago.length > 1
                      : metodoPago.length === 1 && metodoPago[0].metodo === id;

                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        if (id === "Dividir") {
                          // Si ya estamos dividiendo, no hacemos nada (el usuario usa el botón +)
                          // Si no, iniciamos la división limpiando cualquier residuo anterior
                          if (metodoPago.length <= 1) {
                            agregarDivision();
                          }
                        } else {
                          // Al seleccionar método único, borramos cualquier rastro de división
                          setMetodoPago([
                            { id: Date.now(), metodo: id, monto: totalPrecio },
                          ]);
                        }
                      }}
                      style={{
                        background: activo
                          ? "rgba(124,58,237,0.15)"
                          : "#131313",

                        color: activo ? "#fff" : "rgba(255,255,255,0.7)",
                        padding: "12px 4px",
                        borderRadius: "12px",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        fontSize: "11px",
                        fontWeight: 700,
                        width: "100%",
                      }}
                    >
                      <Icon
                        size={20}
                        style={{ color: activo ? "#a78bfa" : "inherit" }}
                      />
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* 2. Bloque de división */}
              {metodoPago.length > 1 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    borderTop: "1px solid rgba(255,255,255,0.1)",
                    paddingTop: "16px",
                  }}
                >
                  <p
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.7)",
                      marginBottom: "10px",
                    }}
                  >
                    Dividir pago
                  </p>

                  {metodoPago.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                      }}
                    >
                      <button
                        onClick={() => eliminarDivision(item.id)}
                        style={{
                          border: "none",
                          color: "rgba(255,255,255,0.7)",
                          width: "28px",
                          height: "28px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          padding: 0,
                          fontSize: "18px",
                        }}
                      >
                        ×
                      </button>

                      <select
                        value={item.metodo}
                        onChange={(e) =>
                          actualizarDivision(item.id, "metodo", e.target.value)
                        }
                        aria-invalid={!item.metodo}
                        title={item.metodo ? "" : "Selecciona un método"}
                        style={{
                          flex: "0.8",
                          minWidth: 0,
                          background: "#131313",
                          color: "#fff",
                          padding: "8px 6px",
                          borderRadius: "8px",
                          fontSize: "16px",
                          border: item.metodo
                            ? "1px solid rgba(0,0,0,0)"
                            : "1px solid #e53e3e",
                          boxShadow: item.metodo
                            ? "none"
                            : "0 0 0 4px rgba(229,62,62,0.06)",
                          transition: "box-shadow 0.15s, border 0.15s",
                        }}
                      >
                        <option value="" disabled>
                          Método
                        </option>
                        <option value="Efectivo">Efectivo</option>
                        <option value="Tarjeta">Tarjeta</option>
                        <option value="Transferencia">Transferencia</option>
                      </select>

                      {/* Contenedor del input para que el signo $ se vea integrado */}
                      <div
                        style={{
                          flex: "1.6",
                          minWidth: 0,
                          position: "relative",
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="text"
                          inputMode="numeric" // Esto asegura que en el móvil salga el teclado numérico
                          placeholder="$"
                          // Aquí formateas el valor para que el usuario vea: 1.000.000
                          value={
                            item.monto
                              ? new Intl.NumberFormat("es-CO").format(
                                  item.monto,
                                )
                              : ""
                          }
                          onChange={(e) => {
                            const valorLimpio = e.target.value.replace(
                              /\D/g,
                              "",
                            );
                            actualizarDivision(item.id, "monto", valorLimpio);
                          }}
                          style={{
                            width: "100%",
                            background: "#131313",
                            color: "#fff",
                            padding: "8px 8px 8px 25px",
                            borderRadius: "8px",
                            fontSize: "16px",
                            boxSizing: "border-box",
                            cursor: "text",
                            border: item.monto
                              ? "1px solid rgba(0,0,0,0)"
                              : "1px solid #e53e3e",
                            boxShadow: item.monto
                              ? "none"
                              : "0 0 0 4px rgba(229,62,62,0.06)",
                            transition: "box-shadow 0.15s, border 0.15s",
                          }}
                        />
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={agregarDivision}
                    style={{
                      background: "transparent",
                      border: "1px dashed rgba(167, 139, 250, 0.4)",
                      color: "#a78bfa",
                      padding: "10px",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: 600,
                      marginTop: "4px",
                    }}
                  >
                    + Añadir otra forma de pago
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer total + botón pedir */}
      {items.length > 0 && (
        <div
          style={{
            padding: "16px 20px",
            paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
            borderTop: "1px solid #1a1a1a",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "12px",
              fontSize: "16px",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            <span>{totalItems} producto(s)</span>
            <span style={{ fontWeight: 800, color: "#fff" }}>
              TOTAL: {fmt(totalPrecio)}
            </span>
          </div>

          {/* Advertencia: No se ha seleccionado método */}
          {metodoPago.length === 0 && (
            <p
              style={{
                fontSize: "11.5px",
                color: "rgba(255,209,102,0.85)",
                marginBottom: "10px",
                textAlign: "center",
              }}
            >
              Selecciona un método de pago para continuar
            </p>
          )}

          {/* Nota: se indica visualmente en cada fila si falta seleccionar método. */}

          {/* Advertencia: Montos incompletos o excedidos al Dividir */}
          {metodoPago.length > 1 && totalPagado !== totalPrecio && (
            <p
              style={{
                fontSize: "11.5px",
                color: totalPagado < totalPrecio ? "#e53e3e" : "#f6e05e",
                marginBottom: "10px",
                textAlign: "center",
                fontWeight: 600,
              }}
            >
              {totalPagado < totalPrecio
                ? `Faltan ${fmt(totalPrecio - totalPagado)} para completar el pago.`
                : `Excediste el pago por ${fmt(totalPagado - totalPrecio)}.`}
            </p>
          )}

          <button
            type="button"
            onClick={handlePedir}
            disabled={!puedeHacerPedido || hayFilaSinMetodo}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "100px",
              background:
                !puedeHacerPedido || hayFilaSinMetodo
                  ? "rgba(124,58,237,0.25)"
                  : "#7c3aed",
              color:
                !puedeHacerPedido || hayFilaSinMetodo
                  ? "rgba(255,255,255,0.5)"
                  : "#fff",
              fontWeight: 800,
              fontSize: "14px",
              border: "none",
              cursor:
                !puedeHacerPedido || hayFilaSinMetodo
                  ? "not-allowed"
                  : "pointer",
              boxShadow:
                !puedeHacerPedido || hayFilaSinMetodo
                  ? "none"
                  : "0 8px 32px rgba(124,58,237,0.45)",
              transition: "all 0.15s",
            }}
          >
            Confirmar · {fmt(totalPrecio)}
          </button>
        </div>
      )}

      {/* Confirmar vaciar carrito */}
      {confirmVaciarOpen &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.75)",
              backdropFilter: "blur(6px)",
              zIndex: 300,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
            }}
          >
            <div
              style={{
                background: "#131313",
                borderRadius: "20px",
                padding: "26px 22px",
                width: "100%",
                maxWidth: "320px",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "50%",
                  background: "rgba(229,62,62,0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 14px",
                }}
              >
                <Trash2 size={24} color="#e53e3e" />
              </div>
              <h3
                style={{
                  fontSize: "15px",
                  fontWeight: 800,
                  color: "#fff",
                  marginBottom: "8px",
                }}
              >
                ¿Vaciar el carrito?
              </h3>
              <p
                style={{
                  fontSize: "12.5px",
                  color: "rgba(255,255,255,0.5)",
                  lineHeight: 1.5,
                  marginBottom: "22px",
                }}
              >
                Se eliminarán todos los productos, las observaciones y el método
                de pago seleccionado.
              </p>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setConfirmVaciarOpen(false)}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "100px",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    vaciarTodo();
                    setConfirmVaciarOpen(false);
                  }}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "100px",
                    background: "#e53e3e",
                    border: "none",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Sí, vaciar
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>,
    document.body,
  );
};

export default Carrito;
