import React, { useState } from "react";

const CrearTiendaWizard = ({ onCancel, onSuccess }) => {
  const [paso, setPaso] = useState(1);
  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);

  const handleNext = () => {
    if (!nombre.trim()) return;
    setPaso(2);
  };

  const handleSubmit = async () => {
    if (!nombre.trim()) return;

    setLoading(true);
    try {
      await onSuccess({
        nombre: nombre.trim(),
        slug: slug.trim() || nombre.trim(),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100%",
        width: "100%",
        background: "#131313",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "18px",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "18px",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: "12px",
              color: "#a78bfa",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Paso {paso} de 2
          </p>
          <h3
            style={{ margin: "8px 0 10px", fontSize: "22px", fontWeight: 800 }}
          >
            {paso === 1 ? "Nombre de la tienda" : "URL / slug"}
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: "13px",
              color: "rgba(255,255,255,0.55)",
              lineHeight: 1.5,
            }}
          >
            {paso === 1
              ? "Empieza por el nombre con el que quieres que se identifique la tienda."
              : "Ahora define la dirección corta que usará la tienda."}
          </p>
        </div>

        {paso === 1 ? (
          <div style={{ marginTop: "18px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "6px",
                fontSize: "11px",
                fontWeight: 700,
                color: "rgba(255,255,255,0.6)",
              }}
            >
              ¿Cómo se llamará tu negocio?
            </label>
            <input
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Sushi Roll Express"
              style={{
                width: "100%",
                background: "#0a0a0a",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "12px",
                padding: "12px 14px",
                color: "#fff",
                fontSize: "13px",
              }}
            />
          </div>
        ) : (
          <div style={{ marginTop: "18px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "6px",
                fontSize: "11px",
                fontWeight: 700,
                color: "rgba(255,255,255,0.6)",
              }}
            >
              Define el slug de acceso
            </label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="sushi-roll-express"
              style={{
                width: "100%",
                background: "#0a0a0a",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "12px",
                padding: "12px 14px",
                color: "#fff",
                fontSize: "13px",
              }}
            />
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "10px" }}>
        {paso === 2 && (
          <button
            type="button"
            onClick={() => setPaso(1)}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: "100px",
              background: "rgba(255,255,255,0.06)",
              border: "none",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Volver
          </button>
        )}
        <button
          type="button"
          onClick={paso === 1 ? handleNext : handleSubmit}
          disabled={loading || !nombre.trim()}
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: "100px",
            background:
              !loading && nombre.trim() ? "#7c3aed" : "rgba(124,58,237,0.25)",
            border: "none",
            color: "#fff",
            fontWeight: 700,
            cursor: !loading && nombre.trim() ? "pointer" : "not-allowed",
          }}
        >
          {loading ? "Creando..." : paso === 1 ? "Siguiente" : "Crear tienda"}
        </button>
      </div>

      <button
        type="button"
        onClick={onCancel}
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.45)",
          fontSize: "12px",
          cursor: "pointer",
          alignSelf: "flex-start",
        }}
      >
        Cancelar
      </button>
    </div>
  );
};

export default CrearTiendaWizard;
