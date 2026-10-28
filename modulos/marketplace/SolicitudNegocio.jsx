import { useState } from "react";
import { ArrowLeft, Building2, Loader2, Store } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../../src/lib/supabaseClient";

const INITIAL_VALUES = {
  business_name: "",
  owner_name: "",
  email: "",
  phone: "",
  city: "",
  address: "",
  neighborhood: "",
  business_type: "",
  description: "",
  legal_name: "",
  tax_id: "",
  opening_hours: "",
  delivery_available: "no",
  estimated_products: "",
};

export default function SolicitudNegocio() {
  const [values, setValues] = useState(INITIAL_VALUES);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const updateValue = (event) => {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    if (values.description.trim().length < 10) {
      setError("Cuéntanos sobre el negocio con al menos 10 caracteres.");
      setSubmitting(false);
      return;
    }

    try {
      const { error: requestError } = await supabase.rpc(
        "submit_business_join_request",
        {
          p_business_name: values.business_name.trim(),
          p_owner_name: values.owner_name.trim(),
          p_email: values.email.trim().toLowerCase(),
          p_phone: values.phone.trim(),
          p_city: values.city.trim(),
          p_address: values.address.trim(),
          p_neighborhood: values.neighborhood.trim(),
          p_business_type: values.business_type,
          p_description: values.description.trim(),
          p_legal_name: values.legal_name.trim(),
          p_tax_id: values.tax_id.trim(),
          p_opening_hours: values.opening_hours.trim(),
          p_delivery_available: values.delivery_available === "si",
          p_estimated_products: values.estimated_products.trim(),
        },
      );
      if (requestError) throw requestError;
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError.message || "No pudimos enviar tu solicitud.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-10 text-white">
        <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-neutral-900 p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300"><Store /></div>
          <h1 className="mt-5 text-2xl font-black">Solicitud enviada</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-400">El equipo de Gloto revisará la información. Te contactaremos por correo o teléfono cuando exista una respuesta.</p>
          <Link to="/marketplace" className="mt-6 inline-flex rounded-xl bg-violet-500 px-5 py-3 text-sm font-black text-white hover:bg-violet-400">Volver al marketplace</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white sm:px-6">
      <section className="mx-auto w-full max-w-2xl">
        <Link to="/marketplace" className="inline-flex items-center gap-2 text-sm font-bold text-neutral-400 hover:text-white"><ArrowLeft size={18} /> Volver al marketplace</Link>
        <div className="mt-5 rounded-3xl border border-white/10 bg-neutral-900 p-5 shadow-2xl sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500 text-white"><Building2 /></div>
            <div><p className="text-xs font-black uppercase tracking-widest text-violet-300">Únete a Gloto</p><h1 className="mt-1 text-2xl font-black">Solicita vender en la plataforma</h1></div>
          </div>
          <p className="mt-4 text-sm leading-6 text-neutral-400">Completa los datos de tu negocio. Esta solicitud quedará pendiente para ser revisada por el equipo de superadministración.</p>

          <form onSubmit={submit} className="mt-7 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2 text-sm font-bold">Nombre del negocio *<input required name="business_name" value={values.business_name} onChange={updateValue} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 font-normal outline-none focus:border-violet-400" /></label>
            <label className="sm:col-span-2 text-sm font-bold">Nombre del propietario *<input required name="owner_name" value={values.owner_name} onChange={updateValue} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 font-normal outline-none focus:border-violet-400" /></label>
            <label className="text-sm font-bold">Correo electrónico *<input required type="email" name="email" value={values.email} onChange={updateValue} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 font-normal outline-none focus:border-violet-400" /></label>
            <label className="text-sm font-bold">Teléfono o WhatsApp *<input required name="phone" value={values.phone} onChange={updateValue} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 font-normal outline-none focus:border-violet-400" /></label>
            <label className="text-sm font-bold">Ciudad *<input required name="city" value={values.city} onChange={updateValue} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 font-normal outline-none focus:border-violet-400" /></label>
            <label className="text-sm font-bold">Tipo de negocio *<select required name="business_type" value={values.business_type} onChange={updateValue} className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 font-normal outline-none focus:border-violet-400"><option value="">Seleccionar...</option><option>Restaurante</option><option>Tiendas y supermercados</option><option>Belleza y cuidado personal</option><option>Moda y accesorios</option><option>Tecnología</option><option>Servicios</option><option>Otro</option></select></label>
            <label className="text-sm font-bold">Dirección del negocio *<input required name="address" value={values.address} onChange={updateValue} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 font-normal outline-none focus:border-violet-400" /></label>
            <label className="text-sm font-bold">Barrio o sector *<input required name="neighborhood" value={values.neighborhood} onChange={updateValue} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 font-normal outline-none focus:border-violet-400" /></label>
            <label className="text-sm font-bold">Razón social<input name="legal_name" value={values.legal_name} onChange={updateValue} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 font-normal outline-none focus:border-violet-400" /></label>
            <label className="text-sm font-bold">NIT o documento<input name="tax_id" value={values.tax_id} onChange={updateValue} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 font-normal outline-none focus:border-violet-400" /></label>
            <label className="sm:col-span-2 text-sm font-bold">Horario de atención *<input required name="opening_hours" value={values.opening_hours} onChange={updateValue} placeholder="Ej: Lunes a sábado, 8:00 a. m. - 8:00 p. m." className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 font-normal outline-none focus:border-violet-400" /></label>
            <label className="text-sm font-bold">¿Realiza domicilios? *<select required name="delivery_available" value={values.delivery_available} onChange={updateValue} className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 font-normal outline-none focus:border-violet-400"><option value="no">No</option><option value="si">Sí</option></select></label>
            <label className="text-sm font-bold">Cantidad aproximada de productos<input name="estimated_products" value={values.estimated_products} onChange={updateValue} placeholder="Ej: 50" className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 font-normal outline-none focus:border-violet-400" /></label>
            <label className="sm:col-span-2 text-sm font-bold">Cuéntanos sobre tu negocio<textarea required minLength={10} name="description" rows={4} value={values.description} onChange={updateValue} placeholder="Productos, horarios, zona de cobertura y demás información útil..." className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 font-normal outline-none focus:border-violet-400" /></label>
            {error && <p className="sm:col-span-2 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
            <button disabled={submitting} type="submit" className="sm:col-span-2 flex items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3.5 text-sm font-black hover:bg-violet-400 disabled:opacity-60">{submitting && <Loader2 size={18} className="animate-spin" />}{submitting ? "Enviando solicitud..." : "Enviar solicitud"}</button>
          </form>
        </div>
      </section>
    </main>
  );
}
