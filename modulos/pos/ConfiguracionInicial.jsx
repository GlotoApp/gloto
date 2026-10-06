import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../../src/components/AuthContext";
import { supabase } from "../../src/lib/supabaseClient";
import ConfiguracionTienda from "./ConfiguracionTienda";

const ConfiguracionInicial = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState("loading");
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadOnboarding = async () => {
      if (!user?.id) return;
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();

      if (!isMounted) return;
      if (error || !profile) {
        console.error("No se pudo verificar la configuración inicial:", error);
        setProfileError(
          error?.message || "No se encontró el perfil de esta cuenta.",
        );
        setStep("error");
        return;
      }

      setOnboardingCompleted(Boolean(profile.onboarding_completed));
      if (
        profile.onboarding_completed &&
        !user.user_metadata?.must_change_password
      ) {
        navigate("/pos", { replace: true });
        return;
      }

      setStep(
        user.user_metadata?.must_change_password ? "password" : "store",
      );
    };

    loadOnboarding();
    return () => {
      isMounted = false;
    };
  }, [navigate, user]);

  const changeTemporaryPassword = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    if (newPassword.length < 10) {
      setErrorMessage("La nueva contraseña debe tener al menos 10 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage("Las contraseñas no coinciden.");
      return;
    }

    setIsSavingPassword(true);
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
      data: { must_change_password: false },
    });
    if (error) {
      console.error("No se pudo cambiar la contraseña temporal:", error);
      setErrorMessage(error.message || "No se pudo cambiar la contraseña.");
      setIsSavingPassword(false);
      return;
    }
    if (data.user?.user_metadata?.must_change_password) {
      setErrorMessage("No se pudo confirmar el cambio de contraseña. Inténtalo de nuevo.");
      setIsSavingPassword(false);
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    if (onboardingCompleted) {
      navigate("/pos", { replace: true });
    } else {
      setStep("store");
    }
    setIsSavingPassword(false);
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("No se pudo cerrar la sesión:", error);
      setErrorMessage("No se pudo cerrar la sesión. Inténtalo de nuevo.");
      return;
    }
    navigate("/login", { replace: true });
  };

  if (step === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-white">
        <LoaderCircle className="animate-spin text-violet-400" size={32} />
      </div>
    );
  }

  if (step === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-white">
        <section className="w-full max-w-lg space-y-4 rounded-2xl border border-red-500/20 bg-neutral-900 p-6">
          <h1 className="text-xl font-black">No se pudo cargar la configuración</h1>
          <p role="alert" className="text-sm text-red-200">
            {profileError}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold"
          >
            Reintentar
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-violet-400/15 bg-neutral-900/70 p-5">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-violet-500/10 p-2 text-violet-300">
              <ShieldCheck size={20} />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-violet-300">
                Primer ingreso
              </p>
              <h1 className="mt-1 text-xl font-black">
                {step === "password"
                  ? "Protege tu cuenta"
                  : "Deja tu tienda lista para vender"}
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-400">
                {step === "password"
                  ? "Cambia la contraseña temporal que te compartieron desde el equipo de soporte. Después configurarás los datos operativos de tu negocio."
                  : "Completa la información del negocio, contacto, entrega y ubicación. Podrás crear tus productos y categorías después."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-neutral-300 hover:bg-white/5"
          >
            <LogOut size={16} />
            Salir
          </button>
        </header>

        {step === "password" ? (
          <form
            onSubmit={changeTemporaryPassword}
            className="mx-auto w-full max-w-xl space-y-5 rounded-2xl border border-white/10 bg-neutral-900/70 p-5 shadow-xl sm:p-7"
          >
            <div className="flex items-start gap-3 rounded-xl border border-amber-400/15 bg-amber-500/5 p-4">
              <KeyRound className="mt-0.5 shrink-0 text-amber-200" size={18} />
              <p className="text-sm leading-6 text-neutral-300">
                Usa una contraseña nueva de al menos 10 caracteres. No vuelvas a
                compartir la contraseña temporal.
              </p>
            </div>
            <label className="block text-xs font-bold text-neutral-300">
              Nueva contraseña
              <span className="relative mt-2 block">
                <input
                  required
                  type={showNewPassword ? "text" : "password"}
                  minLength={10}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 pr-12 text-sm text-white outline-none focus:border-violet-400/50"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((visible) => !visible)}
                  aria-label={
                    showNewPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  aria-pressed={showNewPassword}
                  className="absolute inset-y-0 right-0 flex items-center px-4 text-neutral-400 transition hover:text-white"
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
            <label className="block text-xs font-bold text-neutral-300">
              Confirma la nueva contraseña
              <span className="relative mt-2 block">
                <input
                  required
                  type={showConfirmPassword ? "text" : "password"}
                  minLength={10}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 pr-12 text-sm text-white outline-none focus:border-violet-400/50"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((visible) => !visible)}
                  aria-label={
                    showConfirmPassword
                      ? "Ocultar contraseña"
                      : "Mostrar contraseña"
                  }
                  aria-pressed={showConfirmPassword}
                  className="absolute inset-y-0 right-0 flex items-center px-4 text-neutral-400 transition hover:text-white"
                >
                  {showConfirmPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </span>
            </label>
            {errorMessage && (
              <p role="alert" className="text-sm text-red-300">
                {errorMessage}
              </p>
            )}
            <button
              type="submit"
              disabled={
                isSavingPassword ||
                newPassword.length < 10 ||
                confirmPassword.length < 10
              }
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSavingPassword ? (
                <LoaderCircle className="animate-spin" size={17} />
              ) : (
                <CheckCircle2 size={17} />
              )}
              {isSavingPassword ? "Actualizando..." : "Cambiar y continuar"}
            </button>
          </form>
        ) : (
          <ConfiguracionTienda
            onboardingMode
            onCompleted={() => navigate("/pos", { replace: true })}
          />
        )}
      </div>
    </main>
  );
};

export default ConfiguracionInicial;
