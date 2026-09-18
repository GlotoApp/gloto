import React, { useEffect, useState } from "react";
import { Save, User } from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import ConfiguracionField from "./ConfiguracionField";

const ConfiguracionDatos = () => {
  const [userId, setUserId] = useState(null);
  const [data, setData] = useState({ full_name: "", email: "", role: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user?.id) return setLoading(false);
      setUserId(authData.user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name,email,role")
        .eq("id", authData.user.id)
        .maybeSingle();
      setData({
        full_name: profile?.full_name || "",
        email: profile?.email || authData.user.email || "",
        role: profile?.role || "",
      });
      setLoading(false);
    };
    load();
  }, []);

  const update = (key, value) =>
    setData((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (!userId) return;
    setSaving(true);
    setMessage("");
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: data.full_name.trim() })
      .eq("id", userId);
    setMessage(error ? error.message : "Datos personales guardados");
    setSaving(false);
  };

  return (
    <section className="space-y-6">
      <header className="flex items-start gap-3 border-b border-white/[0.06] pb-5">
        <User className="mt-0.5 text-violet-400" size={20} />
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-400">
            Cuenta
          </p>
          <h2 className="mt-1 text-xl font-black text-white">
            Datos personales
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Información del usuario que administra esta tienda.
          </p>
        </div>
      </header>
      {loading && (
        <p className="text-xs text-neutral-500">Cargando datos personales...</p>
      )}
      <div className="rounded-2xl border border-white/[0.07] bg-neutral-900/45 p-5 md:p-6">
        <div className="grid gap-5 md:grid-cols-2">
          <ConfiguracionField
            label="Nombre completo"
            value={data.full_name}
            onChange={(e) => update("full_name", e.target.value)}
            placeholder="Nombre del administrador"
          />
          <ConfiguracionField
            label="Correo electrónico"
            value={data.email}
            onChange={(e) => update("email", e.target.value)}
            type="email"
          />
          <ConfiguracionField
            label="Rol"
            value={data.role}
            onChange={(e) => update("role", e.target.value)}
          />
        </div>
      </div>
      <footer className="flex items-center justify-between gap-4 rounded-2xl border border-violet-400/20 bg-neutral-950/95 p-4">
        <span className="text-xs text-emerald-300">{message}</span>
        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
        >
          <Save size={14} /> {saving ? "Guardando..." : "Guardar datos"}
        </button>
      </footer>
    </section>
  );
};

export default ConfiguracionDatos;
