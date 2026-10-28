import { useEffect, useState } from "react";
import { Edit3, Printer, Plus, Trash2, Wifi } from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import { useAuth } from "../../src/components/AuthContext";

const emptyPrinter = { name: "", ip_address: "", port: 9100, is_active: true };

export default function ConfiguracionImpresoras() {
  const { user } = useAuth();
  const [businessId, setBusinessId] = useState(null);
  const [printers, setPrinters] = useState([]);
  const [form, setForm] = useState(emptyPrinter);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadPrinters = async (id) => {
    const { data, error } = await supabase
      .from("network_printers")
      .select("id,name,ip_address,port,is_active,created_at")
      .eq("business_id", id)
      .order("name");
    if (error) { setMessage(error.message); return; }
    setPrinters(data || []);
  };

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    supabase.from("profiles").select("business_id").eq("id", user.id).maybeSingle().then(({ data, error }) => {
      if (!active || error || !data?.business_id) return;
      setBusinessId(data.business_id);
      loadPrinters(data.business_id).finally(() => active && setLoading(false));
    });
    return () => { active = false; };
  }, [user?.id]);

  const reset = () => { setEditingId(null); setForm(emptyPrinter); setMessage(""); };

  const save = async (event) => {
    event.preventDefault();
    if (!businessId || !form.name.trim() || !/^\d{1,3}(\.\d{1,3}){3}$/.test(form.ip_address.trim())) {
      setMessage("Escribe un nombre y una dirección IP válida."); return;
    }
    const octets = form.ip_address.trim().split(".").map(Number);
    if (octets.some((octet) => octet > 255)) { setMessage("La dirección IP contiene valores mayores a 255."); return; }

    setSaving(true);
    setMessage("");
    const payload = {
      business_id: businessId,
      name: form.name.trim(),
      ip_address: form.ip_address.trim(),
      port: Number(form.port || 9100),
      is_active: form.is_active,
    };
    const query = editingId
      ? supabase.from("network_printers").update(payload).eq("id", editingId)
      : supabase.from("network_printers").insert(payload);
    const { error } = await query;
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    await loadPrinters(businessId);
    reset();
  };

  const edit = (printer) => {
    setEditingId(printer.id);
    setForm({ name: printer.name, ip_address: printer.ip_address, port: printer.port, is_active: printer.is_active });
    setMessage("");
  };

  const remove = async (printer) => {
    if (!window.confirm(`¿Eliminar la impresora "${printer.name}"? Las categorías quedarán sin impresora asignada.`)) return;
    const { error } = await supabase.from("network_printers").delete().eq("id", printer.id);
    if (error) { setMessage(error.message); return; }
    await loadPrinters(businessId);
    if (editingId === printer.id) reset();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <form onSubmit={save} className="rounded-2xl border border-white/10 bg-neutral-950/40 p-5">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-400"><Printer size={20} /></div>
          <div>
            <h2 className="text-sm font-bold">{editingId ? "Editar impresora" : "Nueva impresora"}</h2>
            <p className="text-xs text-neutral-500">Datos de conexión en la red local.</p>
          </div>
        </div>
        <label className="block text-xs font-bold text-neutral-300">Nombre visible</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5 text-sm" placeholder="Ej. Cocina principal" />
        <label className="mt-4 block text-xs font-bold text-neutral-300">Dirección IP</label>
        <input value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5 font-mono text-sm" placeholder="192.168.1.50" />
        <label className="mt-4 block text-xs font-bold text-neutral-300">Puerto RAW</label>
        <input type="number" min="1" max="65535" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5 text-sm" />
        <label className="mt-4 flex items-center gap-2 text-xs text-neutral-300">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          Impresora activa
        </label>
        {message && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{message}</p>}
        <div className="mt-5 flex gap-2">
          <button disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold disabled:opacity-50"><Plus size={15} />{saving ? "Guardando..." : editingId ? "Actualizar" : "Crear impresora"}</button>
          {editingId && <button type="button" onClick={reset} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs">Cancelar</button>}
        </div>
      </form>

      <section className="rounded-2xl border border-white/10 bg-neutral-950/20 p-5">
        <div className="mb-4 flex items-center gap-2"><Wifi size={16} className="text-emerald-400" /><h2 className="text-sm font-bold">Impresoras registradas</h2></div>
        {loading ? <p className="text-xs text-neutral-500">Cargando...</p> : printers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 py-12 text-center text-xs text-neutral-500">Aún no hay impresoras configuradas.</div>
        ) : (
          <div className="space-y-2">
            {printers.map((printer) => (
              <div key={printer.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-neutral-900/60 p-3">
                <div className="rounded-lg bg-neutral-800 p-2"><Printer size={17} /></div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{printer.name}</p><p className="font-mono text-xs text-neutral-400">{printer.ip_address}:{printer.port}</p></div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${printer.is_active ? "bg-emerald-500/10 text-emerald-400" : "bg-neutral-700 text-neutral-300"}`}>{printer.is_active ? "Activa" : "Inactiva"}</span>
                <button type="button" onClick={() => edit(printer)} className="rounded-lg p-2 text-neutral-400 hover:bg-white/5" aria-label="Editar"><Edit3 size={16} /></button>
                <button type="button" onClick={() => remove(printer)} className="rounded-lg p-2 text-red-400 hover:bg-red-500/10" aria-label="Eliminar"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
