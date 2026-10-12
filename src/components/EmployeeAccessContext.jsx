import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { supabase } from "../lib/supabaseClient";
import { Loading } from "../../modulos/pos/Loading";
import { getEmployeePermissionForPath } from "../lib/employeePermissions";

const EmployeeAccessContext = createContext({
  loading: true,
  isEmployee: false,
  permissions: {},
  error: "",
});

export const EmployeeAccessProvider = ({ children }) => {
  const { user } = useAuth();
  const [access, setAccess] = useState({
    loading: true,
    isEmployee: false,
    permissions: {},
    error: "",
  });

  useEffect(() => {
    if (!user?.id) return;
    let active = true;

    const loadAccess = async () => {
      setAccess({
        loading: true,
        isEmployee: false,
        permissions: {},
        error: "",
      });
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (!active) return;
      if (profileError || !profile) {
        console.error("No se pudo verificar el rol del usuario:", profileError);
        setAccess({
          loading: false,
          isEmployee: true,
          permissions: {},
          error: "No se pudo validar el acceso de este usuario.",
        });
        return;
      }

      const isEmployee = ["empleado", "employee"].includes(
        String(profile.role || "").toLowerCase(),
      );
      if (!isEmployee) {
        setAccess({
          loading: false,
          isEmployee: false,
          permissions: {},
          error: "",
        });
        return;
      }

      const { data, error } = await supabase.rpc("get_my_employee_access");
      if (!active) return;
      if (error) {
        console.error("No se pudieron validar los permisos del empleado:", error);
        setAccess({
          loading: false,
          isEmployee: true,
          permissions: {},
          error: "No se pudieron validar tus permisos. Contacta al dueño.",
        });
        return;
      }

      const employeeAccess = Array.isArray(data) ? data[0] : data;
      setAccess({
        loading: false,
        isEmployee: true,
        permissions:
          employeeAccess?.permissions &&
          typeof employeeAccess.permissions === "object"
            ? employeeAccess.permissions
            : {},
        error: employeeAccess
          ? ""
          : "Este usuario no está vinculado a un área activa del negocio.",
      });
    };

    loadAccess();
    return () => {
      active = false;
    };
  }, [user?.id]);

  if (access.loading) return <Loading />;
  return (
    <EmployeeAccessContext.Provider value={access}>
      {children}
    </EmployeeAccessContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useEmployeeAccess = () => useContext(EmployeeAccessContext);

export const EmployeeRouteGuard = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState("");
  const { loading, isEmployee, permissions, error } = useEmployeeAccess();
  if (loading) return <Loading />;
  if (!isEmployee) return children;

  const permission = getEmployeePermissionForPath(location.pathname);
  const allowed = permission && permissions[permission] === true;
  if (allowed) return children;

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-white">
      <section className="w-full max-w-lg rounded-2xl border border-amber-400/20 bg-neutral-900 p-6 text-center">
        <h1 className="text-lg font-black">Acceso no autorizado</h1>
        <p className="mt-2 text-sm text-neutral-300">
          {error || "El dueño del negocio no habilitó esta sección para tu área."}
        </p>
        {logoutError && (
          <p role="alert" className="mt-3 text-sm text-rose-300">
            {logoutError}
          </p>
        )}
        <div className="mt-5 flex justify-center gap-3">
          {permissions.pos === true && location.pathname !== "/pos" && (
            <button
              type="button"
              onClick={() => navigate("/pos", { replace: true })}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/5"
            >
              Ir al POS
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              setLogoutError("");
              const { error: signOutError } = await supabase.auth.signOut();
              if (signOutError) {
                console.error("No se pudo cerrar la sesión:", signOutError);
                setLogoutError("No se pudo cerrar la sesión. Inténtalo de nuevo.");
              }
            }}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-500"
          >
            Cerrar sesión
          </button>
        </div>
      </section>
    </div>
  );
};
