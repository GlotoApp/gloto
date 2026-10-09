import { useCallback, useRef, useState } from "react";
import { Save } from "lucide-react";
import { useLocation } from "react-router-dom";
import ConfiguracionDatos from "./ConfiguracionDatos";
import ConfiguracionEmpleados from "./ConfiguracionEmpleados";
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
  empleados: {
    title: "Empleados",
    description: "Registra a las personas que forman parte de tu equipo.",
    component: ConfiguracionEmpleados,
  },
};

const Configuracion = () => {
  const location = useLocation();
  const routeSection = location.pathname.split("/").pop();
  const activeSectionKey = sections[routeSection] ? routeSection : "tienda";
  const section = sections[activeSectionKey];
  const ActiveComponent = section.component;
  const saveActionRef = useRef(null);
  const [saveState, setSaveState] = useState({
    disabled: true,
    saving: false,
  });
  const updateSaveState = useCallback((nextState) => {
    setSaveState((currentState) =>
      currentState.disabled === nextState.disabled &&
      currentState.saving === nextState.saving
        ? currentState
        : nextState,
    );
  }, []);

  return (
    <div className="min-h-screen bg-background px-4 py-6 font-sans text-white sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 pb-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-400">
              Configuración
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight">
              {section.title}
            </h1>
            <p className="mt-1 text-xs text-neutral-500">
              {section.description}
            </p>
          </div>
          {activeSectionKey === "tienda" && (
            <button
              type="button"
              onClick={() => saveActionRef.current?.()}
              disabled={saveState.disabled}
              className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save size={14} />
              {saveState.saving ? "Guardando..." : "Guardar tienda"}
            </button>
          )}
        </header>
        <main className="rounded-3xl bg-neutral-900/10 p-3 backdrop-blur-md md:p-5">
          {activeSectionKey === "tienda" ? (
            <ActiveComponent
              saveActionRef={saveActionRef}
              onSaveStateChange={updateSaveState}
            />
          ) : (
            <ActiveComponent />
          )}
        </main>
      </div>
    </div>
  );
};

export default Configuracion;
