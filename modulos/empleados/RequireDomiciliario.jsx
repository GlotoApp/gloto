import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../src/components/AuthContext";
import { supabase } from "../../src/lib/supabaseClient";

const RequireDomiciliario = ({ children }) => {
  const { user, loading } = useAuth();
  const [status, setStatus] = useState("loading");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    let isMounted = true;

    const verifyRole = async () => {
      try {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (!isMounted) return;
        if (error) {
          console.error(
            "No se pudo verificar el acceso del domiciliario:",
            error,
          );
          setStatus("error");
          return;
        }
        setStatus(
          String(profile?.role || "").toLowerCase() === "domiciliario"
            ? "allowed"
            : "denied",
        );
      } catch (error) {
        if (!isMounted) return;
        console.error("Error verificando el perfil del domiciliario:", error);
        setStatus("error");
      }
    };

    setStatus("loading");
    verifyRole();
    return () => {
      isMounted = false;
    };
  }, [retryKey, user?.id]);

  if (loading || (user && status === "loading")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-sm text-neutral-400">
        Verificando acceso...
      </div>
    );
  }
  if (!user) return <Navigate to="/domiciliarios/login" replace />;
  if (status === "denied") {
    return <Navigate to="/domiciliarios/login" replace />;
  }
  if (status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-white">
        <section className="max-w-md rounded-2xl border border-rose-400/20 bg-neutral-900 p-6 text-center">
          <h1 className="text-lg font-black">No se pudo validar tu cuenta</h1>
          <p className="mt-2 text-sm text-neutral-400">
            No podemos cargar tus entregas hasta verificar el perfil.
          </p>
          <button
            type="button"
            onClick={() => {
              setStatus("loading");
              setRetryKey((current) => current + 1);
            }}
            className="mt-5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold hover:bg-violet-500"
          >
            Reintentar
          </button>
        </section>
      </main>
    );
  }

  return children;
};

export default RequireDomiciliario;
