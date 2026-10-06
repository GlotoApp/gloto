import { useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  LoaderCircle,
  UserPlus,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import SuperAdminSectionShell from "./ContenedorSeccion";

const createSlug = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const inputClassName =
  "mt-2 w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-violet-400/50";

const CrearCuentaSuperAdmin = () => {
  const [businessName, setBusinessName] = useState("");
  const [businessSlug, setBusinessSlug] = useState("");
  const [slugWasEdited, setSlugWasEdited] = useState(false);
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [credentialsCopied, setCredentialsCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  const updateBusinessName = (value) => {
    setBusinessName(value);
    if (!slugWasEdited) setBusinessSlug(createSlug(value));
    setFeedback(null);
  };

  const updateBusinessSlug = (value) => {
    setSlugWasEdited(true);
    setBusinessSlug(createSlug(value));
    setFeedback(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setFeedback(null);
    setCreatedCredentials(null);
    setCredentialsCopied(false);
    setCopyError("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.refreshSession();

      if (sessionError || !session?.access_token) {
        throw new Error(
          "Tu sesión expiró. Inicia sesión de nuevo como administrador.",
        );
      }

      const { data, error } = await supabase.functions.invoke(
        "crear-cuenta-negocio",
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: {
            businessName: businessName.trim(),
            businessSlug: businessSlug.trim(),
            email: email.trim().toLowerCase(),
          },
        },
      );

      if (error) {
        let message = error.message;
        if (error.context && typeof error.context.json === "function") {
          try {
            const responseBody = await error.context.json();
            message = responseBody?.error || message;
          } catch (parseError) {
            console.warn(
              "No se pudo leer el error de creación de cuenta:",
              parseError,
            );
          }
        }
        throw new Error(message || "No se pudo crear la cuenta.");
      }

      if (!data?.success || !data?.temporaryPassword) {
        throw new Error(data?.error || "No se recibió la contraseña temporal.");
      }

      setCreatedCredentials({
        email: data.email,
        password: data.temporaryPassword,
        businessSlug: data.businessSlug,
        planName: data.planName,
      });
      setBusinessName("");
      setBusinessSlug("");
      setSlugWasEdited(false);
      setEmail("");
    } catch (error) {
      console.error("Error creando cuenta desde administración:", error);
      setFeedback({
        type: "error",
        message: error.message || "No se pudo crear la cuenta.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyCredentials = async () => {
    if (!createdCredentials) return;
    setCopyError("");
    try {
      await navigator.clipboard.writeText(
        `Correo: ${createdCredentials.email}\nContraseña temporal: ${createdCredentials.password}`,
      );
      setCredentialsCopied(true);
    } catch (error) {
      console.error("No se pudieron copiar las credenciales:", error);
      setCopyError(
        "No se pudieron copiar. Selecciona el correo y la contraseña y cópialos manualmente.",
      );
    }
  };

  return (
    <SuperAdminSectionShell
      title="Crear cuenta de negocio"
      subtitle="Crea el acceso del negocio y comparte su contraseña temporal. El usuario terminará la configuración al ingresar."
      badge="Cuentas"
    >
      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-2xl space-y-6 rounded-2xl border border-white/10 bg-neutral-900/70 p-5 shadow-xl sm:p-7"
      >
        <div className="flex items-start gap-3 rounded-xl border border-violet-400/15 bg-violet-500/5 p-4">
          <UserPlus className="mt-0.5 shrink-0 text-violet-300" size={18} />
          <p className="text-sm leading-6 text-neutral-300">
            Solo necesitas el nombre del negocio, su slug y el correo de acceso.
            Se generará una contraseña temporal segura que podrás copiar y
            enviarle. La tienda recibirá el plan Inicial activo por 30 días, sin
            registrar un pago. En su primer ingreso, el usuario deberá cambiar
            su contraseña y completar los datos de la tienda.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-xs font-bold text-neutral-300 sm:col-span-2">
            Nombre del negocio
            <input
              required
              maxLength={120}
              autoComplete="organization"
              className={inputClassName}
              value={businessName}
              onChange={(event) => updateBusinessName(event.target.value)}
              placeholder="Ej.: Café Central"
            />
          </label>

          <label className="text-xs font-bold text-neutral-300 sm:col-span-2">
            Slug de la tienda
            <input
              required
              minLength={2}
              maxLength={80}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              title="Usa letras minúsculas, números y guiones."
              autoComplete="off"
              className={inputClassName}
              value={businessSlug}
              onChange={(event) => updateBusinessSlug(event.target.value)}
              placeholder="cafe-central"
            />
            <span className="mt-1 block font-normal text-neutral-500">
              Será la dirección pública de la tienda y debe ser único.
            </span>
          </label>

          <label className="text-xs font-bold text-neutral-300 sm:col-span-2">
            Correo de acceso
            <input
              required
              type="email"
              maxLength={254}
              autoComplete="email"
              className={inputClassName}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setFeedback(null);
              }}
              placeholder="admin@negocio.com"
            />
          </label>
        </div>

        {feedback && (
          <div
            role={feedback.type === "error" ? "alert" : "status"}
            className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            {feedback.message}
          </div>
        )}

        <button
          type="submit"
          disabled={
            isSubmitting ||
            !businessName.trim() ||
            !businessSlug.trim() ||
            !email.trim()
          }
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {isSubmitting ? (
            <>
              <LoaderCircle className="animate-spin" size={17} />
              Creando cuenta...
            </>
          ) : (
            <>
              <UserPlus size={17} />
              Crear cuenta y generar contraseña
            </>
          )}
        </button>
      </form>

      {createdCredentials && (
        <section
          aria-labelledby="created-account-title"
          className="mx-auto mt-6 w-full max-w-2xl space-y-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-5 sm:p-7"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-300" size={20} />
            <div>
              <h2 id="created-account-title" className="font-black text-white">
                Cuenta creada: {createdCredentials.businessSlug}
              </h2>
              <p className="mt-1 text-sm leading-6 text-neutral-300">
                Comparte estas credenciales de forma privada. La contraseña
                temporal se muestra solo ahora; el usuario deberá cambiarla al
                iniciar sesión.
              </p>
              <p className="mt-2 text-sm font-semibold text-emerald-200">
                Plan {createdCredentials.planName || "Inicial"} activo por 30 días.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold text-neutral-400">
              Correo de acceso
              <input
                readOnly
                value={createdCredentials.email}
                className={inputClassName}
                onFocus={(event) => event.target.select()}
              />
            </label>
            <label className="text-xs font-bold text-neutral-400">
              Contraseña temporal
              <input
                readOnly
                value={createdCredentials.password}
                className={`${inputClassName} font-mono`}
                onFocus={(event) => event.target.select()}
              />
            </label>
          </div>

          {copyError && (
            <p role="alert" className="text-sm text-amber-200">
              {copyError}
            </p>
          )}
          <button
            type="button"
            onClick={copyCredentials}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-500"
          >
            {credentialsCopied ? <Check size={17} /> : <Copy size={17} />}
            {credentialsCopied ? "Credenciales copiadas" : "Copiar credenciales"}
            <KeyRound size={16} />
          </button>
        </section>
      )}
    </SuperAdminSectionShell>
  );
};

export default CrearCuentaSuperAdmin;
