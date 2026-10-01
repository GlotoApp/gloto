import React from "react";

const SuperAdminStatCard = ({ icon: Icon, label, value, color }) => (
  <div
    style={{
      flex: 1,
      background: "#131313",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "14px",
      padding: "14px",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      minWidth: 0,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        color: "rgba(255,255,255,0.45)",
      }}
    >
      <Icon size={14} style={{ color }} />
      <span
        style={{
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </span>
    </div>
    <span style={{ fontSize: "22px", fontWeight: 800, color: "#fff" }}>
      {value}
    </span>
  </div>
);

export default SuperAdminStatCard;
