import React, { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, ShieldCheck, User, X } from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import SubLoading from "./SubLoading";

const ConfiguracionDatos = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [showVerification, setShowVerification] = useState(false);
  const [verificationPassword, setVerificationPassword] = useState("");
  const [showVerificationPassword, setShowVerificationPassword] =
    useState(false);
  const [isIdentityVerified, setIsIdentityVerified] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswordChange, setShowPasswordChange] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user?.id) return setLoading(false);
      setEmail(authData.user.email || "");
      setLoading(false);
    };
    load();
  }, []);

  const verifyIdentityPreview = (event) => {
    event.preventDefault();
    if (!verificationPassword) return;
    setIsIdentityVerified(true);
    setShowPasswordChange(true);
    setShowVerification(false);
    setVerificationPassword("");
  };

  const previewPasswordSave = (event) => {
    event.preventDefault();
    if (!newPassword || newPassword !== confirmPassword) return;
    setMessage(
      "Vista visual lista. El cambio real de contraseña aún no está conectado.",
    );
    setNewPassword("");
    setConfirmPassword("");
    setShowPasswordChange(false);
    setIsIdentityVerified(false);
  };

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
            Correo de inicio de sesión y seguridad de la cuenta.
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
          <div className="rounded-2xl border border-white/[0.07] bg-neutral-900/45 p-5 md:p-6">
            <div className="grid gap-5">
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
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-neutral-900/45 p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <KeyRound className="mt-0.5 text-violet-400" size={18} />
                <div>
                  <h3 className="text-sm font-black text-white">Contraseña</h3>
                  <p className="mt-1 text-xs text-neutral-500">
                    Por seguridad, la contraseña actual no se puede consultar.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="select-none text-sm tracking-[0.25em] text-neutral-400"
                  aria-label="Contraseña oculta"
                >
                  ••••••••••••
                </span>
                <button
                  type="button"
                  onClick={() => setShowVerification(true)}
                  className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-white/[0.06]"
                >
                  <Eye size={14} /> Cambiar contraseña
                </button>
              </div>
            </div>

            {isIdentityVerified && showPasswordChange && (
              <form
                onSubmit={previewPasswordSave}
                className="mt-5 grid gap-4 border-t border-white/[0.07] pt-5 md:grid-cols-2"
              >
                <label className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                    Nueva contraseña
                  </span>
                  <input
                    type="password"
                    minLength={8}
                    required
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="w-full rounded-xl border border-white/[0.1] bg-neutral-950/60 px-4 py-3 text-sm text-white outline-none focus:border-violet-500/60"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                    Confirmar contraseña
                  </span>
                  <input
                    type="password"
                    minLength={8}
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="w-full rounded-xl border border-white/[0.1] bg-neutral-950/60 px-4 py-3 text-sm text-white outline-none focus:border-violet-500/60"
                  />
                  {confirmPassword && newPassword !== confirmPassword && (
                    <span className="text-[10px] text-rose-300">
                      Las contraseñas no coinciden.
                    </span>
                  )}
                </label>
                <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2">
                  <p className="text-[10px] text-amber-300">
                    Vista visual: la actualización real se conectará después.
                  </p>
                  <button
                    type="submit"
                    disabled={!newPassword || newPassword !== confirmPassword}
                    className="rounded-xl bg-violet-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-white disabled:opacity-40"
                  >
                    Guardar contraseña
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordChange(false);
                      setIsIdentityVerified(false);
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    className="rounded-xl border border-white/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-neutral-300 hover:bg-white/[0.06]"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>

          {message && (
            <p className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-200">
              {message}
            </p>
          )}

          {showVerification && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setShowVerification(false);
                  setVerificationPassword("");
                  setShowVerificationPassword(false);
                }
              }}
            >
              <form
                onSubmit={verifyIdentityPreview}
                className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-5 shadow-2xl sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 text-violet-300" size={20} />
                    <div>
                      <h3 className="text-base font-black text-white">
                        Verificar identidad
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-neutral-400">
                        Confirma tu contraseña actual para continuar con el
                        cambio.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowVerification(false);
                      setVerificationPassword("");
                      setShowVerificationPassword(false);
                    }}
                    className="rounded-lg p-1 text-neutral-500 hover:bg-white/10 hover:text-white"
                    aria-label="Cerrar verificación"
                  >
                    <X size={18} />
                  </button>
                </div>

                <label className="mt-5 flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                    Contraseña actual
                  </span>
                  <span className="relative">
                    <input
                      type={showVerificationPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={verificationPassword}
                      onChange={(event) =>
                        setVerificationPassword(event.target.value)
                      }
                      className="w-full rounded-xl border border-white/[0.1] bg-neutral-950 px-4 py-3 pr-12 text-sm text-white outline-none focus:border-violet-500/60"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowVerificationPassword((visible) => !visible)
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-neutral-500 hover:text-white"
                      aria-label={
                        showVerificationPassword
                          ? "Ocultar contraseña"
                          : "Mostrar contraseña ingresada"
                      }
                    >
                      {showVerificationPassword ? (
                        <EyeOff size={16} />
                      ) : (
                        <Eye size={16} />
                      )}
                    </button>
                  </span>
                </label>

                <p className="mt-3 text-[10px] leading-4 text-amber-300">
                  Vista visual únicamente; la validación real aún no está
                  conectada.
                </p>
                <button
                  type="submit"
                  disabled={!verificationPassword}
                  className="mt-5 w-full rounded-xl bg-violet-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-40"
                >
                  Verificar y continuar
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default ConfiguracionDatos;
