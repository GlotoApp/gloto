import React, { useEffect, useState } from "react";
import { Check, Pencil, Plus, UserRound, X } from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";

const EMPTY_FORM = { name: "", area: "" };

const AREA_OPTIONS = [
  "Administrador/a",
  "Cajero/a",
  "Cocinero/a",
  "Auxiliar de cocina",
  "Mesero/a",
  "Domiciliario/a",
  "Barista",
  "Bartender",
  "Supervisor/a",
];

const ConfiguracionEmpleados = () => {
  const [businessId, setBusinessId] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingForm, setEditingForm] = useState(EMPTY_FORM);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user?.id) return setLoading(false);

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", authData.user.id)
        .maybeSingle();
      if (profileError || !profile?.business_id) {
        setMessage(profileError?.message || "No se encontró la tienda.");
        return setLoading(false);
      }

      setBusinessId(profile.business_id);
      const { data, error } = await supabase
        .from("employees")
        .select("id,name,area,created_at")
        .eq("business_id", profile.business_id)
        .order("name", { ascending: true });
      if (error) setMessage(error.message);
      else setEmployees(data || []);
      setLoading(false);
    };

    load();
  }, []);

  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    const area = form.area.trim();
    if (!businessId || !name || !area) {
      setMessage("Completa el nombre y el área del empleado.");
      return;
    }

    setSaving(true);
    setMessage("");
    const { data, error } = await supabase
      .from("employees")
      .insert({ business_id: businessId, name, area })
      .select("id,name,area,created_at")
      .single();

    if (error) {
      setMessage(error.message);
    } else {
      setEmployees((current) =>
        [...current, data].sort((first, second) =>
          first.name.localeCompare(second.name),
        ),
      );
      setForm(EMPTY_FORM);
      setMessage("Empleado registrado.");
    }
    setSaving(false);
  };

  const startEditing = (employee) => {
    setEditingId(employee.id);
    setEditingForm({ name: employee.name, area: employee.area });
    setMessage("");
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingForm(EMPTY_FORM);
  };

  const updateEditing = (key, value) =>
    setEditingForm((current) => ({ ...current, [key]: value }));

  const updateEmployee = async (employeeId) => {
    const name = editingForm.name.trim();
    const area = editingForm.area.trim();
    if (!name || !area) {
      setMessage("Completa el nombre y el área del empleado.");
      return;
    }

    setSaving(true);
    setMessage("");
    const { data, error } = await supabase
      .from("employees")
      .update({ name, area })
      .eq("id", employeeId)
      .select("id,name,area,created_at")
      .single();

    if (error) {
      setMessage(error.message);
    } else {
      setEmployees((current) =>
        current
          .map((employee) => (employee.id === employeeId ? data : employee))
          .sort((first, second) => first.name.localeCompare(second.name)),
      );
      cancelEditing();
      setMessage("Empleado actualizado.");
    }
    setSaving(false);
  };

  return (
    <section className="space-y-6">
      <header className="flex items-start gap-3 border-b border-white/[0.06] pb-5">
        <UserRound className="mt-0.5 text-violet-400" size={20} />
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-400">
            Equipo
          </p>
          <h2 className="mt-1 text-xl font-black text-white">Empleados</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Registra el nombre de cada empleado y el área donde trabaja.
          </p>
        </div>
      </header>

      <form
        onSubmit={save}
        className="grid gap-4 rounded-2xl border border-white/[0.07] bg-neutral-900/45 p-5 md:grid-cols-[1fr_1fr_auto] md:items-end"
      >
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
            Nombre
          </span>
          <input
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder="Nombre completo"
            className="w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-3 text-sm text-white outline-none transition focus:border-violet-400"
            required
          />
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
            Área
          </span>
          <select
            value={form.area}
            onChange={(event) => update("area", event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-3 text-sm text-white outline-none transition focus:border-violet-400"
            required
          >
            <option value="" disabled>
              Selecciona un área
            </option>
            {AREA_OPTIONS.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={saving || loading}
          className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition hover:bg-violet-500 disabled:opacity-40"
        >
          <Plus size={15} /> {saving ? "Guardando..." : "Registrar"}
        </button>
      </form>

      {message && <p className="text-xs text-emerald-300">{message}</p>}

      <div className="overflow-hidden rounded-2xl border border-white/[0.07]">
        <div className="grid grid-cols-[1fr_1fr] border-b border-white/[0.07] bg-neutral-950/80 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-500">
          <span>Empleado</span>
          <span>Área</span>
        </div>
        {loading && (
          <p className="px-4 py-5 text-xs text-neutral-500">
            Cargando empleados...
          </p>
        )}
        {!loading && employees.length === 0 && (
          <p className="px-4 py-5 text-xs text-neutral-500">
            Todavía no hay empleados registrados.
          </p>
        )}
        {employees.map((employee) => (
          <div
            key={employee.id}
            className="grid gap-3 border-b border-white/[0.05] px-4 py-4 text-sm last:border-b-0 md:grid-cols-[1fr_1fr_auto] md:items-center"
          >
            {editingId === employee.id ? (
              <>
                <input
                  value={editingForm.name}
                  onChange={(event) =>
                    updateEditing("name", event.target.value)
                  }
                  className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                  aria-label="Nombre del empleado"
                />
                <select
                  value={editingForm.area}
                  onChange={(event) =>
                    updateEditing("area", event.target.value)
                  }
                  className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                  aria-label="Área del empleado"
                >
                  {AREA_OPTIONS.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => updateEmployee(employee.id)}
                    disabled={saving}
                    className="rounded-lg p-2 text-emerald-300 transition hover:bg-emerald-400/10 disabled:opacity-40"
                    aria-label="Guardar cambios"
                    title="Guardar cambios"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditing}
                    className="rounded-lg p-2 text-neutral-400 transition hover:bg-white/10 hover:text-white"
                    aria-label="Cancelar edición"
                    title="Cancelar edición"
                  >
                    <X size={16} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="font-bold text-white">{employee.name}</span>
                <span className="text-neutral-400">{employee.area}</span>
                <button
                  type="button"
                  onClick={() => startEditing(employee)}
                  className="justify-self-start rounded-lg p-2 text-neutral-400 transition hover:bg-violet-400/10 hover:text-violet-300 md:justify-self-end"
                  aria-label={`Editar ${employee.name}`}
                  title="Editar empleado"
                >
                  <Pencil size={15} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

export default ConfiguracionEmpleados;
