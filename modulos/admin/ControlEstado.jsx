import React from "react";

const SuperAdminToggle = ({ activo, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={activo ? "Desactivar tienda" : "Activar tienda"}
    style={{
      width: "44px",
      height: "26px",
      borderRadius: "100px",
      border: "none",
      cursor: "pointer",
      position: "relative",
      background: activo ? "#7c3aed" : "rgba(255,255,255,0.12)",
      transition: "background 0.2s",
      flexShrink: 0,
      padding: 0,
    }}
  >
    <span
      style={{
        position: "absolute",
        top: "3px",
        left: activo ? "21px" : "3px",
        width: "20px",
        height: "20px",
        borderRadius: "50%",
        background: "#fff",
        transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
      }}
    />
  </button>
);

export default SuperAdminToggle;
