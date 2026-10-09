import SuperAdminSectionShell from "./ContenedorSeccion";
import SuperAdminStorageCleanup from "./LimpiarArchivos";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  MessageCircle,
  Save,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";

const SuperAdminSistemaPanel = () => {
  const [phoneInput, setPhoneInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const loadSupportPhone = async () => {
      const { data, error } = await supabase
        .from("support_settings")
        .select("whatsapp_phone")
        .eq("setting_key", "global")
        .single();

      if (error) {
        console.error("No se pudo cargar el WhatsApp de soporte:", error);
        setErrorMessage(
          "No se pudo cargar el contacto. Verifica que el SQL de configuración esté aplicado.",
        );
      } else {
        setPhoneInput(data.whatsapp_phone || "");
      }
      setLoading(false);
    };

    loadSupportPhone();
  }, []);

  const handleSave = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const phone = phoneInput.replace(/\D/g, "");
    if (phone && (phone.length < 8 || phone.length > 15)) {
      setErrorMessage(
        "Ingresa un número internacional válido de 8 a 15 dígitos, incluido el código de país.",
      );
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("support_settings")
        .update({ whatsapp_phone: phone })
        .eq("setting_key", "global")
        .select("whatsapp_phone")
        .single();

      if (error) throw error;
      setPhoneInput(data.whatsapp_phone);
      setSuccessMessage(
        phone
          ? "El contacto de soporte se actualizó correctamente."
          : "El contacto de soporte se quitó correctamente.",
      );
    } catch (error) {
      console.error("No se pudo guardar el WhatsApp de soporte:", error);
      setErrorMessage(
        "No se pudo guardar el número. Verifica tu acceso de superadmin e inténtalo de nuevo.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SuperAdminSectionShell title="Sistema" badge="Sistema">
      <section className="rounded-2xl border border-white/[0.08] bg-neutral-900/60 p-5 md:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
            <MessageCircle size={19} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-white">
              WhatsApp de soporte
            </h3>
            <p className="mt-1 text-xs leading-5 text-neutral-400">
              Este número aparecerá como botón de contacto en Configuración
              &gt; Datos. Incluye el código de país, solo con dígitos; por
              ejemplo, 573001234567. Déjalo vacío para ocultar el contacto.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="mt-5 max-w-xl space-y-4">
          <label className="block">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-neutral-400">
              Número de WhatsApp
            </span>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={24}
              value={phoneInput}
              onChange={(event) => {
                setPhoneInput(event.target.value);
                setErrorMessage("");
                setSuccessMessage("");
              }}
              placeholder="573001234567"
              disabled={loading || saving}
              className="w-full rounded-xl border border-white/[0.1] bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-violet-400/60 disabled:opacity-60"
            />
          </label>

          {errorMessage && (
            <p role="alert" className="text-xs text-rose-300">
              {errorMessage}
            </p>
          )}
          {successMessage && (
            <p
              role="status"
              className="flex items-center gap-2 text-xs text-emerald-300"
            >
              <CheckCircle2 size={15} aria-hidden="true" />
              {successMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || saving}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving || loading ? (
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <Save size={15} aria-hidden="true" />
            )}
            {loading
              ? "Cargando..."
              : saving
                ? "Guardando..."
                : "Guardar número"}
          </button>
        </form>
      </section>
      <SuperAdminStorageCleanup />
    </SuperAdminSectionShell>
  );
};

export default SuperAdminSistemaPanel;
