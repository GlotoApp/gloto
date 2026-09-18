import React from "react";
import { useLocation } from "react-router-dom";
import ConfiguracionDatos from "./ConfiguracionDatos";
import ConfiguracionNotificaciones from "./ConfiguracionNotificaciones";
import ConfiguracionTienda from "./ConfiguracionTienda";

const sections = {
  tienda: {
    title: "Tienda",
    description: "Identidad, operación, entrega e información comercial.",
    component: ConfiguracionTienda,
  },
  datos: {
    title: "Datos",
    description: "Contacto, ubicación y canales públicos.",
    component: ConfiguracionDatos,
  },
  notificaciones: {
    title: "Notificaciones",
    description: "Alertas operativas para tu equipo.",
    component: ConfiguracionNotificaciones,
  },
};

const Configuracion = () => {
  const location = useLocation();
  const routeSection = location.pathname.split("/").pop();
  const section = sections[routeSection] || sections.tienda;
  const ActiveComponent = section.component;

  return (
    <div className="min-h-screen bg-background px-4 py-6 font-sans text-white sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 border-b border-white/[0.06] pb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-400">
            Configuración
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">
            {section.title}
          </h1>
          <p className="mt-1 text-xs text-neutral-500">{section.description}</p>
        </header>
        <main className="rounded-3xl border border-white/[0.06] bg-neutral-900/10 p-3 backdrop-blur-md md:p-5">
          <ActiveComponent />
        </main>
      </div>
    </div>
  );
};

export default Configuracion;
