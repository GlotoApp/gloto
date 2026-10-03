import { Suspense, lazy, useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
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
const TiendaArchivo = lazy(() => import("../modulos/admin/TiendaArchivo"));
const PlanesFacturacion = lazy(
  () => import("../modulos/admin/PlanesFacturacion"),
);
const Mercado = lazy(() => import("../modulos/admin/Mercado"));
const Finanzas = lazy(() => import("../modulos/admin/Finanzas"));
const Sistema = lazy(() => import("../modulos/admin/Sistema"));
const Login = lazy(() => import("../modulos/pos/Login"));

// Componentes protectores
const RequireAdmin = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return user ? children : <Navigate to="/login-superadmin" replace />;
};

const RequireAuth = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return user ? children : <Navigate to="/login" replace />;
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

      const { data: isSuspended, error: subscriptionError } =
        await supabase.rpc("is_business_subscription_suspended", {
          p_business_id: profile.business_id,
        });

      if (subscriptionError) {
        console.error(
          "No se pudo verificar la vigencia del plan:",
          subscriptionError,
        );
        if (isMounted) setAccessStatus("error");
        return;
      }

      if (isMounted) setAccessStatus(isSuspended ? "suspended" : "allowed");
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
          <Route path="/login-superadmin" element={<Acceso />} />
          <Route path="/marketplace/*" element={<Marketplace />} />
          <Route path="/" element={<Navigate to="/marketplace" replace />} />
          <Route path="*" element={<Upss />} />

          {/* Ruta Protegida: SuperAdmin */}
          <Route
            path="/superadmin"
            element={
              <RequireAdmin>
                <EstructuraAdmin />
              </RequireAdmin>
            }
          >
            <Route index element={<Navigate to="resumen" replace />} />
            <Route path="resumen" element={<Resumen />} />
            <Route path="tiendas" element={<Tiendas />} />
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
            path="/superadmin-actual"
            element={
              <RequireAdmin>
                <GestionCompleta />
              </RequireAdmin>
            }
          />

          {/* Rutas Protegidas: POS */}
          <Route
            path="/pos"
            element={
              <RequireAuth>
                <PlanAccessGate>
                  <Layout />
                </PlanAccessGate>
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
              element={<Inventario initialTab="insumos" standalone />}
            />
            <Route
              path="inventario/categorias"
              element={<InventarioCategorias />}
            />
            <Route
              path="inventario/movimientos"
              element={<InventarioMovimientos />}
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
