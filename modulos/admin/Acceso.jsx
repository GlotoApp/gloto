import { useState } from "react";
import { supabase } from "../../src/lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, Loader2, Eye, EyeOff, AlertCircle } from "lucide-react";

const LoginSuperAdmin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      await supabase.auth.signOut();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        setErrorMsg("Usuario o contraseña incorrectos");
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id);

      if (profile && profile.length > 0 && profile[0].role === "superadmin") {
        await supabase.auth.updateUser({ data: { role: "super_admin" } });
        navigate("/superadmin");
      } else {
        setErrorMsg("Acceso denegado: no tienes permisos de administrador");
        await supabase.auth.signOut();
      }
    } catch (err) {
      setErrorMsg("Ocurrió un error al intentar entrar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gloto-login-container">
      <style>{`
        .gloto-login-container {
          --bg: var(--background);
          --surface: var(--surface);
          --border: var(--outline);
          --border-hover: var(--surface-bright);
          --accent: var(--primary-container);
          --accent-light: var(--urgent);
          --accent-glow: var(--urgent-light);
          --text: var(--on-surface);
          --text-muted: rgba(255, 255, 255, 0.6);
          --text-dim: rgba(255, 255, 255, 0.35);
          --error: var(--error);

          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 20px;
          font-family: system-ui, -apple-system, sans-serif;
          background:
            radial-gradient(circle at 50% 0%, rgba(124, 58, 237, 0.08), transparent 55%),
            var(--bg);
          position: relative;
          overflow: hidden;
        }

        .gloto-login-container::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 42px 42px;
          mask-image: radial-gradient(circle at 50% 35%, black, transparent 70%);
          pointer-events: none;
        }

        .gloto-card {
          position: relative;
          width: 100%;
          max-width: 380px;
          background: var(--surface);
          padding: 44px 40px 36px;
          border: 1px solid var(--border);
          border-radius: 22px;
          text-align: center;
          animation: gloto-rise 0.55s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.7);
        }

        .gloto-card::before {
          content: "";
          position: absolute;
          top: -1px;
          left: -1px;
          right: -1px;
          height: 2px;
          border-radius: 22px 22px 0 0;
          background: linear-gradient(90deg, transparent, var(--accent-light), transparent);
          opacity: 0.9;
        }

        @keyframes gloto-rise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .gloto-header {
          margin-bottom: 30px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .gloto-logo {
          width: 52px;
          height: auto;
          margin-bottom: 18px;
          filter: brightness(0) invert(1);
        }

        .gloto-title {
          color: var(--text);
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 23px;
          font-weight: 700;
          letter-spacing: 1px;
          margin: 0;
        }

        .gloto-subtitle {
          color: var(--text-muted);
          margin: 6px 0 0;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 3px;
        }

        .gloto-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .gloto-input-group {
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
        }

        .gloto-input-icon {
          position: absolute;
          left: 16px;
          color: var(--text-dim);
          transition: color 0.2s ease;
          pointer-events: none;
        }

        .gloto-input-group:focus-within .gloto-input-icon {
          color: var(--accent-light);
        }

        .gloto-input {
          width: 100%;
          box-sizing: border-box;
          padding: 15px 16px 15px 50px;
          background: #101012;
          border: 1px solid var(--border);
          border-radius: 12px;
          color: var(--text);
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 15px;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
        }

        .gloto-input::placeholder {
          color: var(--text-dim);
        }

        .gloto-input:hover {
          border-color: var(--border-hover);
        }

        .gloto-input:focus {
          border-color: var(--accent);
          background: #121214;
          box-shadow: 0 0 0 3px var(--accent-glow);
        }

        .gloto-toggle-visibility {
          position: absolute;
          right: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--text-dim);
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          transition: color 0.15s ease;
        }

        .gloto-toggle-visibility:hover {
          color: var(--text-muted);
        }

        .gloto-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 11px 14px;
          background: rgba(248, 113, 113, 0.08);
          border: 1px solid rgba(248, 113, 113, 0.25);
          border-radius: 10px;
          color: var(--error);
          font-size: 13px;
          text-align: left;
          animation: gloto-rise 0.3s ease;
        }

        .gloto-button {
          position: relative;
          overflow: hidden;
          padding: 16px;
          color: #ffffff;
          background: var(--accent);
          border: none;
          border-radius: 12px;
          font-family: system-ui, -apple-system, sans-serif;
          font-weight: 600;
          font-size: 14px;
          letter-spacing: 2px;
          cursor: pointer;
          transition: background 0.2s ease, transform 0.15s ease;
          margin-top: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 52px;
        }

        .gloto-button:hover:not(:disabled) {
          background: #6d28d9;
        }

        .gloto-button:active:not(:disabled) {
          transform: scale(0.98);
        }

        .gloto-button:disabled {
          cursor: not-allowed;
          opacity: 0.75;
        }

        .gloto-button::after {
          content: "";
          position: absolute;
          top: 0;
          left: -60%;
          width: 40%;
          height: 100%;
          background: linear-gradient(120deg, transparent, rgba(255,255,255,0.18), transparent);
          transform: skewX(-20deg);
          transition: left 0.6s ease;
        }

        .gloto-button:hover:not(:disabled)::after {
          left: 130%;
        }

        .gloto-footer-text {
          color: var(--text-dim);
          font-size: 12px;
          margin-top: 22px;
          cursor: pointer;
          transition: color 0.15s ease;
        }

        .gloto-footer-text:hover {
          color: var(--text-muted);
        }

        @media (prefers-reduced-motion: reduce) {
          .gloto-card, .gloto-error, .gloto-button::after {
            animation: none;
            transition: none;
          }
        }
      `}</style>

      <div className="gloto-card">
        <div className="gloto-header">
          <img
            src="/logo.png"
            alt="Gloto Logo"
            className="gloto-logo"
            onError={(e) => (e.target.style.display = "none")}
          />
          <h2 className="gloto-title">PANEL MAESTRO</h2>
          <p className="gloto-subtitle">Acceso Administrador</p>
        </div>

        <form onSubmit={handleLogin} className="gloto-form">
          {errorMsg && (
            <div className="gloto-error" role="alert">
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="gloto-input-group">
            <Mail size={18} className="gloto-input-icon" />
            <input
              type="email"
              placeholder="Correo de administrador"
              className="gloto-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="gloto-input-group">
            <Lock size={18} className="gloto-input-icon" />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              className="gloto-input"
              style={{ paddingRight: "44px" }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="gloto-toggle-visibility"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={
                showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
              }
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          <button type="submit" className="gloto-button" disabled={loading}>
            {loading ? (
              <Loader2 className="animate-spin" size={19} />
            ) : (
              "ENTRAR"
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginSuperAdmin;
