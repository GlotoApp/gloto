import { useEffect, useState } from "react";
import { Loader2, Store, X } from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";

const INITIAL_VALUES = {
  business_name: "",
  owner_name: "",
  phone: "",
  role: "",
};

export default function SolicitudNegocio({ onClose }) {
  const [values, setValues] = useState(INITIAL_VALUES);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && onClose) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const updateValue = (event) => {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const { error: requestError } = await supabase.rpc(
        "submit_business_join_request",
        {
          p_full_name: values.owner_name.trim(),
          p_phone: values.phone.trim(),
          p_business_name: values.business_name.trim(),
          p_role: values.role,
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
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-success-title"
        onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}
      >
        <section className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-neutral-900 p-8 text-center shadow-2xl">
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10"><X size={19} /></button>
          )}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300"><Store /></div>
          <h1 id="request-success-title" className="mt-5 text-2xl font-black">Solicitud enviada</h1>
          {onClose && <button type="button" onClick={onClose} className="mt-6 inline-flex rounded-xl bg-violet-500 px-5 py-3 text-sm font-black text-white hover:bg-violet-400">Cerrar</button>}
        </section>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/75 px-4 py-6 text-white backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="request-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}
    >
      <section className="relative my-auto w-full max-w-lg rounded-3xl border border-white/10 bg-neutral-900 p-5 shadow-2xl sm:p-8">
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10"><X size={19} /></button>
        )}
        <div>
          <div className="pr-12">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">Únete a Gloto</p>
            <h1 id="request-title" className="mt-2 text-[28px] leading-[1.05] font-black tracking-tight">Empieza a usar Gloto</h1>
          </div>
          <form onSubmit={submit} className="mt-6 grid gap-3 sm:grid-cols-2">
            <input required aria-label="Nombre completo" name="owner_name" value={values.owner_name} onChange={updateValue} autoComplete="name" placeholder="Nombre completo" className="sm:col-span-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none placeholder:text-neutral-500 focus:border-violet-400" />
            <input required aria-label="Teléfono de WhatsApp" type="tel" inputMode="tel" name="phone" value={values.phone} onChange={updateValue} autoComplete="tel" placeholder="WhatsApp" className="sm:col-span-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none placeholder:text-neutral-500 focus:border-violet-400" />
            <input required aria-label="Nombre del negocio" name="business_name" value={values.business_name} onChange={updateValue} placeholder="Nombre del negocio" className="sm:col-span-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none placeholder:text-neutral-500 focus:border-violet-400" />
            <select required aria-label="Cuál es tu rol" name="role" value={values.role} onChange={updateValue} className="sm:col-span-2 w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-sm outline-none focus:border-violet-400">
                <option value="">¿Cuál es tu rol?</option>
                <option value="Propietario">Propietario</option>
                <option value="Administrador">Administrador</option>
                <option value="Gerente">Gerente</option>
                <option value="Empleado">Empleado</option>
                <option value="Asesor comercial">Asesor comercial</option>
                <option value="Otro">Otro</option>
            </select>
            {error && <p className="sm:col-span-2 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
            <button disabled={submitting} type="submit" className="sm:col-span-2 flex items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3.5 text-sm font-black hover:bg-violet-400 disabled:opacity-60">{submitting && <Loader2 size={18} className="animate-spin" />}{submitting ? "Enviando solicitud..." : "Enviar solicitud"}</button>
          </form>
        </div>
      </section>
    </div>
  );
}
