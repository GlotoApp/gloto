import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, UserPlus } from "lucide-react";
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
  const [categoryId, setCategoryId] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [address, setAddress] = useState("");
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadCategories = async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name")
        .order("name", { ascending: true });

      if (!isMounted) return;
      if (error) {
        console.error("No se pudieron cargar las categorías:", error);
        setCategoriesError("No se pudieron cargar las categorías de la tienda.");
      } else {
        setCategories(data || []);
      }
      setCategoriesLoading(false);
    };

    loadCategories();
    return () => {
      isMounted = false;
    };
  }, []);

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

    try {
      const { data, error } = await supabase.functions.invoke(
        "crear-cuenta-negocio",
        {
          body: {
            businessName: businessName.trim(),
            businessSlug: businessSlug.trim(),
            categoryId,
            whatsappPhone: whatsappPhone.trim(),
            address: address.trim(),
            email: email.trim().toLowerCase(),
            password,
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
            console.warn("No se pudo leer el error de creación de cuenta:", parseError);
          }
        }
        throw new Error(message || "No se pudo crear la cuenta.");
      }

      if (!data?.success) {
        throw new Error(data?.error || "No se pudo crear la cuenta.");
      }

      setFeedback({
        type: "success",
        message: `Cuenta creada para ${data.email}. Negocio: ${data.businessSlug}.`,
      });
      setBusinessName("");
      setBusinessSlug("");
      setSlugWasEdited(false);
      setCategoryId("");
      setWhatsappPhone("");
      setAddress("");
      setEmail("");
      setPassword("");
    } catch (error) {
      console.error("Error creando cuenta desde Superadmin:", error);
      setFeedback({
        type: "error",
        message: error.message || "No se pudo crear la cuenta.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SuperAdminSectionShell
      title="Crear cuenta de negocio"
      subtitle="Registra los datos principales del negocio y crea su usuario administrador."
      badge="Cuentas"
    >
      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-2xl space-y-6 rounded-2xl border border-white/10 bg-neutral-900/70 p-5 shadow-xl sm:p-7"
      >
        <div className="flex items-start gap-3 rounded-xl border border-violet-400/15 bg-violet-500/5 p-4">
          <UserPlus className="mt-0.5 shrink-0 text-violet-300" size={18} />
          <p className="text-sm leading-6 text-neutral-300">
            Se creará un negocio nuevo junto con una cuenta administradora
            asociada. La cuenta quedará confirmada y podrá entrar con el correo
            y la contraseña que definas aquí.
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
            Categoría del negocio
            <select
              required
              className={inputClassName}
              value={categoryId}
              disabled={categoriesLoading || Boolean(categoriesError)}
              onChange={(event) => {
                setCategoryId(event.target.value);
                setFeedback(null);
              }}
            >
              <option value="">
                {categoriesLoading
                  ? "Cargando categorías..."
                  : "Selecciona una categoría"}
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {categoriesError && (
              <span role="alert" className="mt-1 block font-normal text-red-300">
                {categoriesError}
              </span>
            )}
          </label>

          <label className="text-xs font-bold text-neutral-300 sm:col-span-2">
            WhatsApp de contacto
            <input
              required
              type="tel"
              maxLength={40}
              autoComplete="tel"
              className={inputClassName}
              value={whatsappPhone}
              onChange={(event) => {
                setWhatsappPhone(event.target.value);
                setFeedback(null);
              }}
              placeholder="Ej.: +57 300 123 4567"
            />
          </label>

          <label className="text-xs font-bold text-neutral-300 sm:col-span-2">
            Dirección del negocio
            <input
              maxLength={500}
              autoComplete="street-address"
              className={inputClassName}
              value={address}
              onChange={(event) => {
                setAddress(event.target.value);
                setFeedback(null);
              }}
              placeholder="Dirección que verá el cliente (opcional)"
            />
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

          <label className="text-xs font-bold text-neutral-300 sm:col-span-2">
            Contraseña inicial
            <input
              required
              type="password"
              minLength={8}
              autoComplete="new-password"
              className={inputClassName}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setFeedback(null);
              }}
              placeholder="Mínimo 8 caracteres"
            />
          </label>
        </div>

        {feedback && (
          <div
            role={feedback.type === "error" ? "alert" : "status"}
            className={`rounded-xl border px-4 py-3 text-sm ${
              feedback.type === "success"
                ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                : "border-red-400/20 bg-red-500/10 text-red-200"
            }`}
          >
            {feedback.type === "success" && (
              <CheckCircle2 className="mr-2 inline-block" size={16} />
            )}
            {feedback.message}
          </div>
        )}

        <button
          type="submit"
          disabled={
            isSubmitting ||
            !businessName.trim() ||
            !businessSlug.trim() ||
            !categoryId ||
            !whatsappPhone.trim() ||
            categoriesLoading ||
            Boolean(categoriesError) ||
            !email.trim() ||
            password.length < 8
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
              Crear cuenta y negocio
            </>
          )}
        </button>
      </form>
    </SuperAdminSectionShell>
  );
};

export default CrearCuentaSuperAdmin;
