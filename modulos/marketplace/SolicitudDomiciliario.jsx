import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bike,
  Camera,
  Check,
  ChevronRight,
  ImagePlus,
  LoaderCircle,
  Phone,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../src/lib/supabaseClient";

const DRAFT_KEY = "gloto_courier_application_draft";

const STEPS = [
  { title: "Tu vehículo", description: "¿Con qué vehículo realizarías tus entregas?" },
  { title: "Tus datos", description: "Confirma tu identidad y tus datos de contacto." },
  { title: "Licencia de conducción", description: "Sube una foto clara de ambos lados." },
  { title: "Tarjeta de propiedad", description: "Necesitamos ambos lados de la tarjeta del vehículo." },
  { title: "Documento de identidad", description: "Necesitamos ambos lados de tu documento." },
  { title: "Foto de perfil", description: "Usa una foto reciente con fondo blanco." },
];

const INITIAL_VALUES = {
  vehicle: "",
  fullName: "",
  cedula: "",
  cedulaConfirmation: "",
  email: "",
  phone: "",
  phoneConfirmation: "",
  licenseFront: null,
  licenseBack: null,
  vehicleCardFront: null,
  vehicleCardBack: null,
  identityFront: null,
  identityBack: null,
  profilePhoto: null,
};

const fileLabel = (file) => (file ? file.name : "Seleccionar imagen");

const readInitialValues = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (saved?.vehicle || saved?.phone) {
      return { ...INITIAL_VALUES, ...saved };
    }
  } catch (storageError) {
    console.warn("No se pudo recuperar el avance de la solicitud:", storageError);
  }
  return INITIAL_VALUES;
};

export default function SolicitudDomiciliario({ onClose }) {
  const navigate = useNavigate();
  const closePage = useCallback(
    () => (onClose ? onClose() : navigate("/marketplace")),
    [navigate, onClose],
  );
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(readInitialValues);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closePage();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePage]);

  const progress = useMemo(() => `${((step + 1) / STEPS.length) * 100}%`, [step]);

  const updateValue = (name, value) => {
    setError("");
    setValues((current) => ({ ...current, [name]: value }));
  };

  const validateStep = () => {
    if (step === 0 && !values.vehicle) return "Selecciona carro o moto para continuar.";
    if (step === 1) {
      if (values.fullName.trim().length < 3) {
        return "Escribe tu nombre completo.";
      }
      if (!/^[0-9]{5,15}$/.test(values.cedula.replace(/\D/g, ""))) {
        return "Escribe un número de cédula válido.";
      }
      if (
        values.cedula.replace(/\D/g, "") !==
        values.cedulaConfirmation.replace(/\D/g, "")
      ) {
        return "Los números de cédula no coinciden.";
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
        return "Escribe un correo electrónico válido.";
      }
      if (!/^[0-9+\s()-]{7,20}$/.test(values.phone.trim())) {
        return "Escribe un número de teléfono válido.";
      }
      if (values.phone.trim() !== values.phoneConfirmation.trim()) {
        return "Los números de teléfono no coinciden.";
      }
    }
    if (step === 2 && (!values.licenseFront || !values.licenseBack)) {
      return "Sube el frente y el respaldo de tu licencia.";
    }
    if (step === 3 && (!values.vehicleCardFront || !values.vehicleCardBack)) {
      return "Sube el frente y el respaldo de la tarjeta de propiedad.";
    }
    if (step === 4 && (!values.identityFront || !values.identityBack)) {
      return "Sube el frente y el respaldo de tu documento de identidad.";
    }
    if (step === 5 && !values.profilePhoto) {
      return "Toma tu foto de perfil con fondo blanco.";
    }
    return "";
  };

  const persistDraft = () => {
    const draft = Object.fromEntries(
      Object.entries(values).filter(
        ([key, value]) =>
          key !== "cedula" &&
          key !== "cedulaConfirmation" &&
          typeof value === "string",
      ),
    );
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  };

  const next = () => {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    persistDraft();
    if (step < STEPS.length - 1) {
      setStep((current) => current + 1);
      return;
    }
    submitApplication();
  };

  const submitApplication = async () => {
    setSaving(true);
    setError("");
    const requestId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const folderName = values.fullName
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "postulante";
    const folder = `pending/${folderName}-${requestId}`;
    const files = {
      licenseFront: ["license-front", values.licenseFront],
      licenseBack: ["license-back", values.licenseBack],
      vehicleCardFront: ["vehicle-card-front", values.vehicleCardFront],
      vehicleCardBack: ["vehicle-card-back", values.vehicleCardBack],
      identityFront: ["identity-front", values.identityFront],
      identityBack: ["identity-back", values.identityBack],
      profilePhoto: ["profile-photo", values.profilePhoto],
    };
    const uploadedPaths = [];

    try {
      const paths = {};
      for (const [field, [label, file]] of Object.entries(files)) {
        if (!file) throw new Error(`Falta el archivo de ${field}.`);
        const extension = file.name.split(".").pop()?.toLowerCase();
        const path = `${folder}/${label}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("courier-application-documents")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        uploadedPaths.push(path);
        paths[field] = path;
      }

      const { error: requestError } = await supabase.rpc(
        "submit_public_courier_application_request",
        {
          p_full_name: values.fullName.trim(),
          p_cedula: values.cedula.replace(/\D/g, ""),
          p_email: values.email.trim().toLowerCase(),
          p_phone: values.phone.trim(),
          p_vehicle_type: values.vehicle,
          p_license_front_path: paths.licenseFront,
          p_license_back_path: paths.licenseBack,
          p_vehicle_card_front_path: paths.vehicleCardFront,
          p_vehicle_card_back_path: paths.vehicleCardBack,
          p_identity_front_path: paths.identityFront,
          p_identity_back_path: paths.identityBack,
          p_profile_photo_path: paths.profilePhoto,
        },
      );
      if (requestError) throw requestError;
      localStorage.removeItem(DRAFT_KEY);
      setSubmitted(true);
    } catch (submitError) {
      if (uploadedPaths.length) {
        const { error: cleanupError } = await supabase.storage
          .from("courier-application-documents")
          .remove(uploadedPaths);
        if (cleanupError) {
          console.error("No se pudieron limpiar documentos incompletos:", cleanupError);
        }
      }
      console.error("No se pudo enviar la solicitud de domiciliario:", submitError);
      setError(
        submitError.message ||
          "No se pudo enviar la solicitud. Verifica los archivos e inténtalo de nuevo.",
      );
    } finally {
      setSaving(false);
    }
  };

  const previous = () => {
    setError("");
    setStep((current) => Math.max(0, current - 1));
  };

  const renderFileField = (name, label, capture) => (
    <label className="block cursor-pointer rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-4 transition hover:border-violet-400/50">
      <span className="flex items-center gap-3 text-sm font-bold text-neutral-200">
        <ImagePlus size={19} className="text-violet-300" />
        {label}
      </span>
      <span className="mt-2 block truncate text-xs text-neutral-500">
        {fileLabel(values[name])}
      </span>
      <input
        type="file"
        accept="image/*"
        capture={capture}
        className="sr-only"
        onChange={(event) => updateValue(name, event.target.files?.[0] || null)}
      />
    </label>
  );

  const cedulaConfirmationMismatch =
    values.cedulaConfirmation.length > 0 &&
    values.cedula.replace(/\D/g, "") !==
      values.cedulaConfirmation.replace(/\D/g, "");
  const phoneConfirmationMismatch =
    values.phoneConfirmation.trim().length > 0 &&
    values.phone.trim() !== values.phoneConfirmation.trim();

  if (submitted) {
    return (
      <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white sm:px-6 sm:py-12">
        <section className="mx-auto w-full max-w-2xl rounded-3xl border border-emerald-400/20 bg-neutral-900 p-6 text-center shadow-2xl sm:p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
            <Check size={30} />
          </div>
          <h1 className="mt-6 text-2xl font-black">Tus datos están en confirmación</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-neutral-300">
            Revisaremos manualmente tu información y tus documentos. Este proceso
            puede tardar entre <strong className="text-white">uno y dos días</strong>.
          </p>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-neutral-400">
            Si tu solicitud es aprobada, recibirás en el número de WhatsApp que
            registraste un mensaje con tus credenciales temporales. Al entrar por
            primera vez podrás cambiar tu contraseña.
          </p>
          <button
            type="button"
            onClick={closePage}
            className="mt-8 rounded-xl bg-violet-500 px-5 py-3 text-sm font-black text-white hover:bg-violet-400"
          >
            Volver al marketplace
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-64px)] bg-neutral-950 px-4 py-8 text-white sm:px-6 sm:py-12">
      <section className="mx-auto w-full max-w-2xl rounded-3xl border border-white/10 bg-neutral-900 p-5 shadow-2xl sm:p-8">
        <button
          type="button"
          onClick={closePage}
          className="mb-5 inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-bold text-neutral-400 hover:bg-white/5 hover:text-white"
        >
          <ArrowLeft size={17} />
          Volver al marketplace
        </button>
        <div className="pr-12">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">
            Trabaja con Gloto
          </p>
          <h1 id="courier-request-title" className="mt-2 text-2xl font-black tracking-tight">
            Solicitud de repartidor
          </h1>
          <p className="mt-2 text-sm leading-5 text-neutral-400">
            Paso {step + 1} de {STEPS.length}: {STEPS[step].description}
          </p>
        </div>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: progress }} />
        </div>

        <div className="mt-7 min-h-[190px]">
          {step === 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["car", "Carro", "Tengo carro para realizar entregas."],
                ["motorcycle", "Moto", "Tengo moto para realizar entregas."],
              ].map(([value, label, description]) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => updateValue("vehicle", value)}
                  className={`rounded-2xl border p-5 text-left transition ${
                    values.vehicle === value
                      ? "border-violet-400 bg-violet-500/15"
                      : "border-white/10 bg-white/[0.03] hover:border-white/25"
                  }`}
                >
                  <Bike className="text-violet-300" />
                  <strong className="mt-4 block text-lg">{label}</strong>
                  <span className="mt-1 block text-xs text-neutral-400">{description}</span>
                </button>
              ))}
            </div>
          )}
          {step === 1 && (
            <div className="grid gap-3">
              <label className="text-sm font-bold text-neutral-300">
                Nombre completo
                <input
                  required
                  type="text"
                  autoComplete="name"
                  value={values.fullName}
                  onChange={(event) => updateValue("fullName", event.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none focus:border-violet-400"
                  placeholder="Como aparece en tu documento"
                />
              </label>
              <label className="text-sm font-bold text-neutral-300">
                Número de cédula
                <input
                  required
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={15}
                  value={values.cedula}
                  onChange={(event) =>
                    updateValue("cedula", event.target.value.replace(/\D/g, ""))
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none focus:border-violet-400"
                  placeholder="Solo números"
                />
              </label>
              <label className="text-sm font-bold text-neutral-300">
                Repite tu número de cédula
                <input
                  required
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={15}
                  value={values.cedulaConfirmation}
                  onPaste={(event) => event.preventDefault()}
                  onChange={(event) =>
                    updateValue(
                      "cedulaConfirmation",
                      event.target.value.replace(/\D/g, ""),
                    )
                  }
                  aria-invalid={cedulaConfirmationMismatch}
                  className={`mt-2 w-full rounded-xl border bg-white/[0.04] px-4 py-3 text-sm outline-none ${
                    cedulaConfirmationMismatch
                      ? "border-rose-400 focus:border-rose-400"
                      : "border-white/10 focus:border-violet-400"
                  }`}
                  placeholder="Vuelve a escribirla"
                />
                {cedulaConfirmationMismatch && (
                  <span
                    role="status"
                    aria-live="polite"
                    className="mt-1 block text-xs font-medium text-rose-300"
                  >
                    Los números de cédula no coinciden.
                  </span>
                )}
              </label>
              <label className="text-sm font-bold text-neutral-300">
                Correo electrónico
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={values.email}
                  onChange={(event) => updateValue("email", event.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none focus:border-violet-400"
                  placeholder="Será tu usuario de acceso"
                />
              </label>
              <label className="text-sm font-bold text-neutral-300">
                Número de teléfono
                <span className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4">
                  <Phone size={17} className="text-violet-300" />
                  <input
                    required
                    type="tel"
                    inputMode="tel"
                    value={values.phone}
                    onChange={(event) => updateValue("phone", event.target.value)}
                    className="w-full bg-transparent py-3 text-sm outline-none"
                    placeholder="Ej. 300 123 4567"
                  />
                </span>
              </label>
              <label className="text-sm font-bold text-neutral-300">
                Repite tu número
                <input
                  required
                  type="tel"
                  inputMode="tel"
                  value={values.phoneConfirmation}
                  onPaste={(event) => event.preventDefault()}
                  onChange={(event) =>
                    updateValue("phoneConfirmation", event.target.value)
                  }
                  aria-invalid={phoneConfirmationMismatch}
                  className={`mt-2 w-full rounded-xl border bg-white/[0.04] px-4 py-3 text-sm outline-none ${
                    phoneConfirmationMismatch
                      ? "border-rose-400 focus:border-rose-400"
                      : "border-white/10 focus:border-violet-400"
                  }`}
                  placeholder="Vuelve a escribirlo"
                />
                {phoneConfirmationMismatch && (
                  <span
                    role="status"
                    aria-live="polite"
                    className="mt-1 block text-xs font-medium text-rose-300"
                  >
                    Los números de teléfono no coinciden.
                  </span>
                )}
              </label>
            </div>
          )}
          {step === 2 && (
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {renderFileField("licenseFront", "Frente de la licencia")}
                {renderFileField("licenseBack", "Respaldo de la licencia")}
              </div>
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs leading-5 text-amber-100">
                <strong className="block text-amber-200">Cómo tomar las fotos</strong>
                Coloca la licencia sobre una superficie plana, captura el documento
                completo y asegúrate de que todos los datos se lean. Mantén el celular
                quieto y enfoca antes de tomar la foto. Evita sombras y reflejos: si
                usas flash, no lo apuntes directamente al plástico; usa luz lateral o
                aléjate un poco para que el brillo no tape la información.
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {renderFileField("vehicleCardFront", "Frente de la tarjeta")}
                {renderFileField("vehicleCardBack", "Respaldo de la tarjeta")}
              </div>
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs leading-5 text-amber-100">
                <strong className="block text-amber-200">Tarjeta de propiedad del vehículo</strong>
                Fotografía el frente y el respaldo de la tarjeta, no tu documento de
                identidad. Captura cada cara completa, derecha y legible. No cubras
                nombres, placas, números ni fechas. Usa buena luz y limpia el lente.
                El flash no daña la tarjeta, pero puede producir reflejos; si lo usas,
                inclina ligeramente la tarjeta o utiliza luz lateral.
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {renderFileField("identityFront", "Frente del documento")}
                {renderFileField("identityBack", "Respaldo del documento")}
              </div>
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs leading-5 text-amber-100">
                <strong className="block text-amber-200">Documento de identidad</strong>
                Fotografía una cara a la vez, con el documento completamente visible,
                derecho y dentro del encuadre. No cubras nombres, números, códigos ni
                fechas. Usa buena luz y limpia el lente. El flash no daña el documento,
                pero puede producir un reflejo; si lo usas, inclina ligeramente el
                documento o toma la foto desde un ángulo leve para que la información
                siga siendo legible.
              </div>
            </div>
          )}
          {step === 5 && (
            <div className="grid gap-3">
              <label className="block cursor-pointer rounded-2xl border border-dashed border-sky-400/40 bg-sky-500/[0.06] p-5 text-center transition hover:border-sky-300">
                <Camera size={28} className="mx-auto text-sky-300" />
                <span className="mt-3 block text-sm font-black text-white">
                  Tomar foto de perfil
                </span>
                <span className="mt-2 block truncate text-xs text-neutral-400">
                  {fileLabel(values.profilePhoto)}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="sr-only"
                  onChange={(event) =>
                    updateValue("profilePhoto", event.target.files?.[0] || null)
                  }
                />
              </label>
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs leading-5 text-amber-100">
                <strong className="block text-amber-200">Importante: esta foto será revisada.</strong>
                Tómala directamente ahora, de frente, con el rostro completo visible,
                buena iluminación, sin filtros, sin gorra ni gafas oscuras y con fondo
                blanco o claro. Si la imagen está borrosa, oscura o el rostro no se ve
                claramente, la solicitud será rechazada.
              </div>
            </div>
          )}
        </div>

        {error && <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={step === 0 ? closePage : previous}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-neutral-400 hover:text-white"
          >
            <ArrowLeft size={16} />
            {step === 0 ? "Cancelar" : "Atrás"}
          </button>
          <button
            type="button"
            onClick={next}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-5 py-3 text-sm font-black text-white hover:bg-violet-400 disabled:opacity-60"
          >
            {saving ? <LoaderCircle size={17} className="animate-spin" /> : step === STEPS.length - 1 ? <Check size={17} /> : <ChevronRight size={17} />}
            {saving ? "Guardando..." : step === STEPS.length - 1 ? "Finalizar solicitud" : "Continuar"}
          </button>
        </div>
      </section>
    </main>
  );
}
