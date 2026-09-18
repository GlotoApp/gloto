import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Image,
  Megaphone,
  Plus,
  Save,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";

const INITIAL_FORM = {
  tag: "NUEVO",
  title: "",
  offerText: "",
  iconUrl: "",
  startsAt: "",
  endsAt: "",
};

const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString("es-CO") : "Sin fecha definida";

const Promociones = () => {
  const [businessId, setBusinessId] = useState(null);
  const [promotions, setPromotions] = useState([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadData = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("business_id")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile?.business_id) {
      setMessage("No se encontró el negocio del usuario.");
      setLoading(false);
      return;
    }

    setBusinessId(profile.business_id);
    const { data, error } = await supabase
      .from("promotions")
      .select(
        "id,tag,title,offer_text,icon_url,starts_at,ends_at,payment_status,created_at",
      )
      .eq("business_id", profile.business_id)
      .order("created_at", { ascending: false });

    if (error) setMessage("No se pudieron cargar las promociones.");
    else setPromotions(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!businessId || !form.title.trim() || !form.offerText.trim()) return;

    setSaving(true);
    setMessage("");
    const { error } = await supabase.from("promotions").insert({
      business_id: businessId,
      tag: form.tag,
      title: form.title.trim(),
      offer_text: form.offerText.trim(),
      icon_url: form.iconUrl.trim() || null,
      starts_at: form.startsAt || null,
      ends_at: form.endsAt || null,
      payment_status: "pending",
      is_active: false,
    });

    if (error) {
      console.error("No se pudo crear la promoción:", error);
      setMessage("No se pudo crear la promoción.");
    } else {
      setMessage("Promoción creada. Debe pagarse antes de publicarse.");
      setForm(INITIAL_FORM);
      setIsFormOpen(false);
      await loadData();
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-violet-400">
              Marketplace
            </p>
            <h1 className="text-3xl font-black tracking-tight">Promociones</h1>
            <p className="mt-2 max-w-xl text-sm text-neutral-400">
              Crea una propuesta promocional. Solo las promociones con pago
              confirmado aparecen en Home.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsFormOpen((current) => !current)}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-xs font-black uppercase tracking-wider transition hover:bg-violet-500"
          >
            <Plus size={16} /> Nueva promoción
          </button>
        </header>

        {message && (
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-3 text-sm text-violet-200">
            {message}
          </div>
        )}

        {isFormOpen && (
          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-2xl border border-white/10 bg-neutral-900/60 p-5"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-xs font-bold text-neutral-300">
                Etiqueta
                <select
                  value={form.tag}
                  onChange={(event) =>
                    setForm({ ...form, tag: event.target.value })
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-3 text-sm text-white"
                >
                  <option>NUEVO</option>
                  <option>PATROCINADO</option>
                  <option>TRENDING</option>
                  <option>OFERTA</option>
                </select>
              </label>
              <label className="text-xs font-bold text-neutral-300">
                Título
                <input
                  required
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  placeholder="Ej. Café Bolívar"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-3 text-sm text-white outline-none focus:border-violet-500"
                />
              </label>
              <label className="text-xs font-bold text-neutral-300 md:col-span-2">
                Texto de la oferta
                <input
                  required
                  value={form.offerText}
                  onChange={(event) =>
                    setForm({ ...form, offerText: event.target.value })
                  }
                  placeholder="Ej. 20% de descuento en bebidas"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-3 text-sm text-white outline-none focus:border-violet-500"
                />
              </label>
              <label className="text-xs font-bold text-neutral-300 md:col-span-2">
                URL del icono (opcional)
                <input
                  type="url"
                  value={form.iconUrl}
                  onChange={(event) =>
                    setForm({ ...form, iconUrl: event.target.value })
                  }
                  placeholder="https://..."
                  className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-3 text-sm text-white outline-none focus:border-violet-500"
                />
              </label>
              <label className="text-xs font-bold text-neutral-300">
                Inicio (opcional)
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) =>
                    setForm({ ...form, startsAt: event.target.value })
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-3 text-sm text-white"
                />
              </label>
              <label className="text-xs font-bold text-neutral-300">
                Fin (opcional)
                <input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) =>
                    setForm({ ...form, endsAt: event.target.value })
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-3 text-sm text-white"
                />
              </label>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-4">
              <p className="text-xs text-amber-300">
                Se guardará como pendiente de pago.
              </p>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-wider disabled:opacity-50"
              >
                <Save size={15} /> {saving ? "Guardando..." : "Crear solicitud"}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm text-neutral-500">
            Cargando promociones...
          </div>
        ) : promotions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 py-16 text-center text-sm text-neutral-500">
            Aún no tienes promociones creadas.
          </div>
        ) : (
          <div className="grid gap-3">
            {promotions.map((promotion) => {
              const isPaid = promotion.payment_status === "paid";
              return (
                <article
                  key={promotion.id}
                  className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-neutral-900/50 p-4"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
                    {promotion.icon_url ? (
                      <Image size={20} />
                    ) : (
                      <Megaphone size={20} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-wider text-violet-300">
                      {promotion.tag}
                    </p>
                    <h2 className="truncate text-base font-black">
                      {promotion.title}
                    </h2>
                    <p className="text-sm text-neutral-400">
                      {promotion.offer_text}
                    </p>
                  </div>
                  <div
                    className={`flex items-center gap-2 rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-wider ${isPaid ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}
                  >
                    {isPaid ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
                    {isPaid ? "Pagada y publicada" : "Pendiente de pago"}
                  </div>
                  <p className="w-full text-[11px] text-neutral-500">
                    Vigencia: {formatDateTime(promotion.starts_at)} -{" "}
                    {formatDateTime(promotion.ends_at)}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Promociones;
