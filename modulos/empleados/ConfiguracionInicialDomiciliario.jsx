import { useState } from "react";
import { Eye, EyeOff, KeyRound, LoaderCircle, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../src/components/AuthContext";
import { supabase } from "../../src/lib/supabaseClient";

const ConfiguracionInicialDomiciliario = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const changePassword = async (event) => {
    event.preventDefault();
    setError("");
    if (password.length < 10) {
      setError("La contraseña debe tener al menos 10 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSaving(true);
    const { data, error: updateError } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });
    if (updateError || data.user?.user_metadata?.must_change_password) {
      setError(updateError?.message || "No se pudo actualizar la contraseña.");
      setSaving(false);
      return;
    }
    navigate("/domiciliarios", { replace: true });
  };

  const signOut = async () => {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError("No se pudo cerrar la sesión. Inténtalo de nuevo.");
      return;
    }
    navigate("/domiciliarios/login", { replace: true });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-8 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-neutral-900 p-6 shadow-2xl sm:p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
          <KeyRound size={23} />
        </div>
        <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">
          Seguridad de tu cuenta
        </p>
        <h1 className="mt-2 text-2xl font-black">Crea tu nueva contraseña</h1>
        <p className="mt-2 text-sm leading-5 text-neutral-400">
          Esta es una contraseña temporal. Debes cambiarla antes de entrar al
          portal de domiciliarios.
        </p>

        <form onSubmit={changePassword} className="mt-6 grid gap-3">
          <label className="text-sm font-bold text-neutral-300">
            Nueva contraseña
            <span className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4">
              <input
                required
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full bg-transparent py-3 text-sm outline-none"
                placeholder="Mínimo 10 caracteres"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="text-neutral-500 hover:text-white"
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>
          <label className="text-sm font-bold text-neutral-300">
            Repite la contraseña
            <span className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4">
              <input
                required
                type={showConfirmation ? "text" : "password"}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="w-full bg-transparent py-3 text-sm outline-none"
                placeholder="Repite tu nueva contraseña"
              />
              <button
                type="button"
                onClick={() => setShowConfirmation((current) => !current)}
                aria-label={showConfirmation ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="text-neutral-500 hover:text-white"
              >
                {showConfirmation ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>
          {error && (
            <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={saving || !user}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3.5 text-sm font-black hover:bg-violet-400 disabled:opacity-60"
          >
            {saving && <LoaderCircle size={17} className="animate-spin" />}
            {saving ? "Guardando..." : "Guardar contraseña"}
          </button>
        </form>
        <button
          type="button"
          onClick={signOut}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-neutral-400 hover:bg-white/5 hover:text-white"
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </section>
    </main>
  );
};

export default ConfiguracionInicialDomiciliario;
