import { useEffect, useState } from "react";
import { LifeBuoy, MessageCircle, User } from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import SubLoading from "./SubLoading";

const ConfiguracionDatos = () => {
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [supportLoading, setSupportLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [supportErrorMessage, setSupportErrorMessage] = useState("");

  useEffect(() => {
    const loadAccount = async () => {
      const { data: authData, error } = await supabase.auth.getUser();
      if (error) {
        console.error("No se pudo cargar la cuenta autenticada:", error);
        setErrorMessage("No se pudo cargar la cuenta. Inicia sesión de nuevo.");
        setLoading(false);
        return;
      }
      if (!authData?.user?.id) {
        setErrorMessage("No hay una sesión activa. Inicia sesión de nuevo.");
        setLoading(false);
        return;
      }

      setEmail(authData.user.email || "");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", authData.user.id)
        .maybeSingle();

      if (profileError) {
        console.error("No se pudo cargar la tienda de la cuenta:", profileError);
      } else if (profile?.business_id) {
        const { data: business, error: businessError } = await supabase
          .from("businesses")
          .select("name")
          .eq("id", profile.business_id)
          .maybeSingle();

        if (businessError) {
          console.error("No se pudo cargar el nombre de la tienda:", businessError);
        } else {
          setBusinessName(business?.name || "");
        }
      }
      setLoading(false);
    };

    const loadSupportPhone = async () => {
      const { data, error } = await supabase
        .from("support_settings")
        .select("whatsapp_phone")
        .eq("setting_key", "global")
        .maybeSingle();

      if (error) {
        console.error("No se pudo cargar el WhatsApp de soporte:", error);
        setSupportErrorMessage(
          "No se pudo cargar el contacto de soporte. Intenta más tarde.",
        );
      } else {
        setSupportPhone(data?.whatsapp_phone || "");
      }
      setSupportLoading(false);
    };

    loadAccount();
    loadSupportPhone();
  }, []);

  const whatsappMessage = [
    `Hola, soy de la tienda ${businessName || "Gloto"}.`,
    email ? `Mi correo de acceso es ${email}.` : "",
    "Necesito ayuda para restablecer la contraseña de esta cuenta.",
  ]
    .filter(Boolean)
    .join("\n");
  const whatsappUrl = supportPhone
    ? `https://wa.me/${supportPhone}?text=${encodeURIComponent(whatsappMessage)}`
    : "";

  return (
    <section className="space-y-6">
      <header className="flex items-start gap-3 border-b border-white/[0.06] pb-5">
        <User className="mt-0.5 text-violet-400" size={20} />
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-400">
            Cuenta
          </p>
          <h2 className="mt-1 text-xl font-black text-white">
            Acceso al sistema
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Correo de inicio de sesión y asistencia con el acceso.
          </p>
        </div>
      </header>

      {loading ? (
        <SubLoading
          label="Cargando acceso"
          className="py-24"
          dotClassName="bg-violet-400"
          fullHeight
        />
      ) : (
        <>
          {errorMessage ? (
            <p
              role="alert"
              className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-xs text-rose-200"
            >
              {errorMessage}
            </p>
          ) : (
            <div className="rounded-2xl border border-white/[0.07] bg-neutral-900/45 p-5 md:p-6">
              <label className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                  Correo de inicio de sesión
                </span>
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="w-full cursor-not-allowed rounded-xl border border-white/[0.1] bg-neutral-950/60 px-4 py-3 text-sm text-neutral-400"
                />
                <span className="text-[10px] leading-4 text-neutral-600">
                  Correo asociado a la autenticación de esta cuenta.
                </span>
              </label>
            </div>
          )}

          <div className="rounded-2xl border border-violet-400/15 bg-violet-400/[0.04] p-5 md:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-400/10 text-violet-300">
                <LifeBuoy size={19} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-white">
                  ¿Necesitas cambiar tu contraseña?
                </h3>
                <p className="mt-2 max-w-2xl text-xs leading-5 text-neutral-400">
                  Usa el botón de WhatsApp para solicitar el restablecimiento
                  de tu acceso. Por seguridad, la contraseña actual no se
                  muestra ni se puede recuperar.
                </p>
                {supportLoading ? (
                  <p className="mt-3 text-xs text-neutral-500">
                    Cargando contacto de soporte...
                  </p>
                ) : supportErrorMessage ? (
                  <p
                    role="alert"
                    className="mt-3 text-xs text-rose-300"
                  >
                    {supportErrorMessage}
                  </p>
                ) : whatsappUrl ? (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-neutral-950"
                  >
                    <MessageCircle size={16} aria-hidden="true" />
                    Contactar por WhatsApp
                  </a>
                ) : (
                  <p className="mt-3 text-xs text-neutral-500">
                    El contacto de soporte aún no está configurado.
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export default ConfiguracionDatos;
