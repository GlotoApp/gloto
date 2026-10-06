import { Suspense, lazy, useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
} from "react-router-dom";
import Marketplace from "../modulos/marketplace/Marketplace";
import Layout from "../modulos/pos/Layout";
import { Loading } from "../modulos/pos/Loading";
import SinConexion from "../modulos/pos/SinConexion";
import Upss from "../modulos/pos/Upss";
import { useAuth } from "./components/AuthContext";
import Acceso from "../modulos/admin/Acceso";
import { supabase } from "./lib/supabaseClient";

// Lazy imports
const POS = lazy(() => import("../modulos/pos/POS"));
const Mesas = lazy(() => import("../modulos/pos/Mesas"));
const Ordenes = lazy(() => import("../modulos/pos/Ordenes"));
const OrdenesEliminadas = lazy(
  () => import("../modulos/pos/OrdenesEliminadas"),
);
const Cocina = lazy(() => import("../modulos/pos/Cocina"));
const Caja = lazy(() => import("../modulos/pos/Caja"));
const CierresEliminados = lazy(
  () => import("../modulos/pos/CierresEliminados"),
);
const HistorialCierres = lazy(() => import("../modulos/pos/HistorialCierres"));
const Horarios = lazy(() => import("../modulos/pos/Horarios"));
const Reservas = lazy(() => import("../modulos/pos/Reservas"));
const Productos = lazy(() => import("../modulos/pos/Productos"));
const Promociones = lazy(() => import("../modulos/pos/Promociones"));
const Inventario = lazy(() => import("../modulos/pos/inventario"));
const InventarioCategorias = lazy(
  () => import("../modulos/pos/InventarioCategorias"),
);
const InventarioMovimientos = lazy(
  () => import("../modulos/pos/InventarioMovimientos"),
);
const Estadisticas = lazy(() => import("../modulos/pos/Estadisticas"));
const Utilidades = lazy(() => import("../modulos/pos/Utilidades"));
const Planes = lazy(() => import("../modulos/pos/Planes"));
const MiPlan = lazy(() => import("../modulos/pos/MiPlan"));
const HistorialPagos = lazy(() => import("../modulos/pos/HistorialPagos"));
const Notificaciones = lazy(() => import("../modulos/pos/Notificaciones"));
const Configuracion = lazy(() => import("../modulos/pos/Configuracion"));
const GestionCompleta = lazy(() => import("../modulos/admin/GestionCompleta"));
const EstructuraAdmin = lazy(() => import("../modulos/admin/Estructura"));
const Resumen = lazy(() => import("../modulos/admin/Resumen"));
const Tiendas = lazy(() => import("../modulos/admin/Tiendas"));
const CrearCuentaSuperAdmin = lazy(
  () => import("../modulos/admin/CrearCuenta"),
);
const TiendaArchivo = lazy(() => import("../modulos/admin/TiendaArchivo"));
const PlanesFacturacion = lazy(
  () => import("../modulos/admin/PlanesFacturacion"),
);
const Mercado = lazy(() => import("../modulos/admin/Mercado"));
const Finanzas = lazy(() => import("../modulos/admin/Finanzas"));
const Sistema = lazy(() => import("../modulos/admin/Sistema"));
const Login = lazy(() => import("../modulos/pos/Login"));
const ConfiguracionInicial = lazy(
  () => import("../modulos/pos/ConfiguracionInicial"),
);

// Componentes protectores
const RequireAdmin = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return user ? children : <Navigate to="/acceso" replace />;
};

const RequireAuth = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return user ? children : <Navigate to="/login" replace />;
};

const LegacyAdminRouteRedirect = () => {
  const location = useLocation();
  const genericPath = location.pathname.replace(
    /^\/superadmin(?=\/|$)/,
    "/gestion",
  );
  return (
    <Navigate
      to={`${genericPath}${location.search}${location.hash}`}
      replace
    />
  );
};

const AccountSetupGate = ({ children }) => {
  const { user } = useAuth();
  const [setupStatus, setSetupStatus] = useState("loading");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const checkSetup = async () => {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();

      if (error || !profile) {
        console.error("No se pudo verificar la configuración inicial:", error);
        if (isMounted) setSetupStatus("error");
        return;
      }

      const requiresSetup =
        !profile.onboarding_completed ||
        Boolean(user.user_metadata?.must_change_password);
      if (isMounted) setSetupStatus(requiresSetup ? "required" : "complete");
    };

    checkSetup();
    return () => {
      isMounted = false;
    };
  }, [retryKey, user.id, user.user_metadata?.must_change_password]);

  if (setupStatus === "loading") return <Loading />;
  if (setupStatus === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-white">
        <section className="w-full max-w-lg rounded-2xl border border-rose-500/20 bg-neutral-900 p-6 text-center">
          <h1 className="text-xl font-black">
            No se pudo verificar tu configuración
          </h1>
          <p className="mt-2 text-sm text-neutral-300">
            Para proteger tu cuenta, el POS permanecerá bloqueado hasta validar
            si debes completar la configuración inicial.
          </p>
          <button
            type="button"
            onClick={() => {
              setSetupStatus("loading");
              setRetryKey((current) => current + 1);
            }}
            className="mt-5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-violet-500"
          >
            Reintentar
          </button>
        </section>
      </div>
    );
  }

  return setupStatus === "required" ? (
    <Navigate to="/configuracion-inicial" replace />
  ) : (
    children
  );
};

const PlanAccessGate = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  const [accessStatus, setAccessStatus] = useState("loading");
  const [retryKey, setRetryKey] = useState(0);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const checkPlanAccess = async () => {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error(
          "No se pudo consultar el negocio del usuario:",
          profileError,
        );
        if (isMounted) setAccessStatus("error");
        return;
      }

      if (!profile?.business_id) {
        if (isMounted) setAccessStatus("allowed");
        return;
      }

      const [
        { data: isSuspended, error: subscriptionError },
        { data: currentSubscription, error: currentSubscriptionError },
      ] = await Promise.all([
        supabase.rpc("is_business_subscription_suspended", {
          p_business_id: profile.business_id,
        }),
        supabase
          .from("subscriptions")
          .select("status,ends_at")
          .eq("business_id", profile.business_id)
          .in("status", ["active", "expired", "suspended"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (subscriptionError || currentSubscriptionError) {
        console.error(
          "No se pudo verificar la vigencia del plan:",
          subscriptionError || currentSubscriptionError,
        );
        if (isMounted) setAccessStatus("error");
        return;
      }

      const isExpired =
        currentSubscription?.ends_at &&
        new Date(currentSubscription.ends_at).getTime() <= Date.now();
      const requiresPayment =
        currentSubscription?.status === "suspended" || isExpired;

      if (isMounted) {
        setAccessStatus(
          requiresPayment
            ? "payment_only"
            : isSuspended
              ? "suspended"
              : "allowed",
        );
      }
    };

    checkPlanAccess();
    const intervalId = window.setInterval(checkPlanAccess, 60_000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [retryKey, user.id]);

  if (accessStatus === "loading") return <Loading />;

  if (accessStatus === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-white">
        <section className="w-full max-w-lg rounded-2xl border border-rose-500/20 bg-neutral-900 p-6 text-center">
          <h1 className="text-xl font-black">No se pudo verificar tu plan</h1>
          <p className="mt-2 text-sm text-neutral-300">
            Para proteger tu cuenta, el POS permanecerá bloqueado hasta poder
            validar el estado de la suscripción.
          </p>
          <button
            type="button"
            onClick={() => {
              setAccessStatus("loading");
              setRetryKey((current) => current + 1);
            }}
            className="mt-5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-violet-500"
          >
            Reintentar
          </button>
        </section>
      </div>
    );
  }

  if (accessStatus === "payment_only") {
    if (location.pathname !== "/pos/mi-plan") {
      return <Navigate to="/pos/mi-plan" replace />;
    }
    return <MiPlan />;
  }

  if (accessStatus === "suspended") {
    if (location.pathname !== "/pos/mi-plan") {
      return <Navigate to="/pos/mi-plan" replace />;
    }

    return (
      <div className="min-h-screen bg-neutral-950 px-4 py-6 text-white sm:px-6">
        <section
          role="alert"
          className="mx-auto mb-5 flex max-w-4xl flex-wrap items-center justify-between gap-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-5"
        >
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-black text-rose-200">
              Acceso suspendido
            </h1>
            <p className="mt-2 text-sm leading-6 text-rose-100/80">
              Tu tienda no aparece en el Marketplace y el acceso al POS está
              bloqueado. Si la suspensión se debe al vencimiento del plan,
              puedes consultar y pagar desde Mi plan. Si fue aplicada por el
              equipo de soporte, comunícate con nosotros para conocer el motivo.
            </p>
            {signOutError && (
              <p role="alert" className="mt-2 text-sm text-rose-200">
                {signOutError}
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={isSigningOut}
            onClick={async () => {
              setIsSigningOut(true);
              setSignOutError("");
              const { error } = await supabase.auth.signOut();
              if (error) {
                console.error("No se pudo cerrar la sesión:", error);
                setSignOutError("No se pudo cerrar la sesión. Inténtalo de nuevo.");
                setIsSigningOut(false);
              }
            }}
            className="shrink-0 rounded-lg border border-white/20 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
          >
            {isSigningOut ? "Cerrando sesión..." : "Cerrar sesión"}
          </button>
        </section>
        <MiPlan />
      </div>
    );
  }

  return children;
};

const RequireInventoryPlan = ({ children }) => {
  const [status, setStatus] = useState("loading");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const checkInventoryAccess = async () => {
      const { data, error } = await supabase.rpc("get_business_plan_access");
      if (error) {
        console.error("No se pudo verificar el acceso a inventario:", error);
        if (isMounted) setStatus("error");
        return;
      }
      if (isMounted) {
        setStatus(data?.inventory_enabled ? "allowed" : "restricted");
      }
    };

    checkInventoryAccess();
    return () => {
      isMounted = false;
    };
  }, [retryKey]);

  if (status === "loading") return <Loading />;
  if (status === "allowed") return children;

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 text-white">
      <section
        className={`w-full max-w-xl rounded-2xl bg-neutral-900 p-6 text-center ${
          status === "error"
            ? "border border-rose-500/20"
            : "border border-violet-500/20"
        }`}
        role={status === "error" ? "alert" : undefined}
      >
        <h1 className="text-xl font-black">
          {status === "error"
            ? "No se pudo verificar tu plan"
            : "Inventario disponible en Pro y Premium"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-neutral-300">
          {status === "error"
            ? "No pudimos comprobar si tu plan incluye inventario. Inténtalo de nuevo."
            : "Cambia tu plan para gestionar insumos, movimientos y recetas. Tus datos se conservan."}
        </p>
        {status === "error" ? (
          <button
            type="button"
            onClick={() => {
              setStatus("loading");
              setRetryKey((current) => current + 1);
            }}
            className="mt-5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-violet-500"
          >
            Reintentar
          </button>
        ) : (
          <Link
            to="/pos/planes"
            className="mt-5 inline-flex rounded-lg bg-violet-600 px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-violet-500"
          >
            Ver planes
          </Link>
        )}
      </section>
    </div>
  );
};

function App() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOnline) {
    return <SinConexion />;
  }

  return (
    <Router>
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* Rutas Públicas */}
          <Route path="/login" element={<Login />} />
          <Route path="/acceso" element={<Acceso />} />
          <Route
            path="/login-superadmin"
            element={<Navigate to="/acceso" replace />}
          />
          <Route
            path="/configuracion-inicial"
            element={
              <RequireAuth>
                <ConfiguracionInicial />
              </RequireAuth>
            }
          />
          <Route path="/marketplace/*" element={<Marketplace />} />
          <Route path="/" element={<Navigate to="/marketplace" replace />} />
          <Route path="*" element={<Upss />} />

          {/* Área protegida de administración */}
          <Route
            path="/gestion"
            element={
              <RequireAdmin>
                <EstructuraAdmin />
              </RequireAdmin>
            }
          >
            <Route index element={<Navigate to="resumen" replace />} />
            <Route path="resumen" element={<Resumen />} />
            <Route path="tiendas" element={<Tiendas />} />
            <Route
              path="cuentas/nueva"
              element={<CrearCuentaSuperAdmin />}
            />
            <Route path="tiendas/:id" element={<TiendaArchivo />} />
            <Route path="marketplace" element={<Mercado />} />
            <Route path="planes" element={<PlanesFacturacion />} />
            <Route
              path="finanzas"
              element={<Navigate to="finanzas/suscripciones" replace />}
            />
            <Route
              path="finanzas/suscripciones"
              element={
                <Finanzas
                  initialTypeFilter="subscription"
                  title="Suscripciones"
                  subtitle="Pagos y renovaciones de suscripciones de todas las tiendas."
                  badge="Suscripciones"
                />
              }
            />
            <Route
              path="finanzas/promociones"
              element={
                <Finanzas
                  initialTypeFilter="promotion"
                  title="Promociones"
                  subtitle="Pagos y aprobaciones de promociones de todas las tiendas."
                  badge="Promociones"
                />
              }
            />
            <Route path="sistema" element={<Sistema />} />
          </Route>
          <Route
            path="/gestion-general"
            element={
              <RequireAdmin>
                <GestionCompleta />
              </RequireAdmin>
            }
          />
          <Route
            path="/superadmin/*"
            element={<LegacyAdminRouteRedirect />}
          />
          <Route
            path="/superadmin-actual"
            element={<Navigate to="/gestion-general" replace />}
          />

          {/* Rutas Protegidas: POS */}
          <Route
            path="/pos"
            element={
              <RequireAuth>
                <AccountSetupGate>
                  <PlanAccessGate>
                    <Layout />
                  </PlanAccessGate>
                </AccountSetupGate>
              </RequireAuth>
            }
          >
            <Route index element={<POS />} />
            <Route path="pos" element={<POS />} />
            <Route path="mesas" element={<Mesas />} />
            <Route path="ordenes" element={<Ordenes />} />
            <Route
              path="ordenes/eliminadas"
              element={<OrdenesEliminadas />}
            />
            <Route path="cocina" element={<Cocina />} />
            <Route
              path="productos"
              element={<Productos section="productos" />}
            />
            <Route
              path="categorias"
              element={<Productos section="categorias" />}
            />
            <Route path="promociones" element={<Promociones />} />
            <Route
              path="inventario"
              element={
                <RequireInventoryPlan>
                  <Inventario initialTab="insumos" standalone />
                </RequireInventoryPlan>
              }
            />
            <Route
              path="inventario/categorias"
              element={
                <RequireInventoryPlan>
                  <InventarioCategorias />
                </RequireInventoryPlan>
              }
            />
            <Route
              path="inventario/movimientos"
              element={
                <RequireInventoryPlan>
                  <InventarioMovimientos />
                </RequireInventoryPlan>
              }
            />
            <Route path="caja" element={<Caja />} />
            <Route path="caja/historial" element={<HistorialCierres />} />
            <Route
              path="caja/CierresEliminados"
              element={<CierresEliminados />}
            />
            <Route path="horarios" element={<Horarios />} />
            <Route path="reservas" element={<Reservas />} />
            <Route path="estadisticas" element={<Estadisticas />} />
            <Route path="utilidades" element={<Utilidades />} />
            <Route path="planes" element={<Planes />} />
            <Route path="mi-plan" element={<MiPlan />} />
            <Route path="historial-pagos" element={<HistorialPagos />} />
            <Route path="notificaciones" element={<Notificaciones />} />
            <Route path="configuracion" element={<Configuracion />} />
            <Route path="configuracion/:section" element={<Configuracion />} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
