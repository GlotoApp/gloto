import React, { useState } from "react";
import { Bell, Save } from "lucide-react";

const ConfiguracionNotificaciones = () => {
  const [settings, setSettings] = useState({
    comandas: true,
    stock: false,
    caja: true,
  });
  const [message, setMessage] = useState("");

  const toggle = (key) =>
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  const save = () => setMessage("Preferencias guardadas");

  return (
    <section className="space-y-6">
      <header className="flex items-start gap-3 border-b border-white/[0.06] pb-5">
        <Bell className="mt-0.5 text-violet-400" size={20} />
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-400">
            Sistema
          </p>
          <h2 className="mt-1 text-xl font-black text-white">Notificaciones</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Controla las alertas que recibe tu equipo.
          </p>
        </div>
      </header>
      <div className="space-y-3">
        {[
          [
            "comandas",
            "Nuevas comandas",
            "Alerta sonora y visual para pedidos de cocina.",
          ],
          [
            "stock",
            "Stock crítico",
            "Aviso cuando un producto o insumo llegue al mínimo.",
          ],
          ["caja", "Cierres de caja", "Aviso al cerrar la caja del turno."],
        ].map(([key, title, description]) => (
          <div
            key={key}
            className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.07] bg-neutral-900/45 p-4"
          >
            <div>
              <p className="text-sm font-bold text-white">{title}</p>
              <p className="mt-1 text-xs text-neutral-500">{description}</p>
            </div>
            <button
              type="button"
              onClick={() => toggle(key)}
              className={`relative h-6 w-11 shrink-0 rounded-full p-1 transition ${settings[key] ? "bg-violet-600" : "bg-neutral-700"}`}
              aria-label={`Alternar ${title}`}
            >
              <span
                className={`block h-4 w-4 rounded-full bg-white transition-transform ${settings[key] ? "translate-x-5" : ""}`}
              />
            </button>
          </div>
        ))}
      </div>
      <footer className="flex items-center justify-between rounded-2xl border border-violet-400/20 bg-neutral-950/80 p-4">
        <span className="text-xs text-emerald-300">{message}</span>
        <button
          type="button"
          onClick={save}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-violet-500"
        >
          <Save size={14} /> Guardar
        </button>
      </footer>
    </section>
  );
};

export default ConfiguracionNotificaciones;
