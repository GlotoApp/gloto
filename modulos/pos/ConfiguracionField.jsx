import React from "react";

const FIELD_DESCRIPTIONS = {
  "Nombre del negocio": "Nombre público que verán tus clientes.",
  Categoría: "Clasifica la tienda dentro del marketplace.",
  "Dirección física": "Dirección donde opera o recibe pedidos la tienda.",
  "Número de WhatsApp":
    "Número usado para recibir pedidos y contactar el negocio.",
  "Tiempo mínimo (minutos)":
    "Tiempo mínimo estimado para preparar y entregar un pedido.",
  "Tiempo máximo (minutos)":
    "Tiempo máximo estimado para preparar y entregar un pedido.",
  "Tarifa por kilómetro": "Valor cobrado por cada kilómetro de distancia.",
  "Costo mínimo de domicilio": "Valor mínimo que puede tener un domicilio.",
  "Costo máximo de domicilio": "Límite máximo cobrado por un domicilio.",
  Latitud: "Coordenada norte-sur de la ubicación de la tienda.",
  Longitud: "Coordenada este-oeste de la ubicación de la tienda.",
  "Nombre completo": "Nombre de la persona que administra la cuenta.",
  "Correo electrónico": "Correo asociado a la cuenta del usuario.",
  Rol: "Permiso o función del usuario dentro del sistema.",
};

const ConfiguracionField = ({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  placeholder = "",
  showError = false,
}) => (
  <label className="flex flex-col gap-2">
    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
      {label}
    </span>
    <input
      type={type}
      inputMode={inputMode}
      value={value ?? ""}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full rounded-xl border bg-neutral-950/60 px-4 py-3 text-sm text-white outline-none transition ${showError && String(value ?? "").trim() === "" ? "border-red-500 focus:border-red-400" : "border-white/[0.1] focus:border-violet-500/60"}`}
    />
    {FIELD_DESCRIPTIONS[label] && (
      <span className="text-[10px] leading-4 text-neutral-600">
        {FIELD_DESCRIPTIONS[label]}
      </span>
    )}
  </label>
);

export default ConfiguracionField;
