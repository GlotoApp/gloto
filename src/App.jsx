import { Suspense, lazy } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Marketplace from "../modulos/marketplace/Marketplace";
import Layout from "../modulos/pos/Layout";
import { Loading } from "../modulos/pos/Loading";
import { useAuth } from "./components/AuthContext";
import LoginSuperAdmin from "../modulos/admin/LoginSuperAdmin";

// Lazy imports
const POS = lazy(() => import("../modulos/pos/POS"));
const Mesas = lazy(() => import("../modulos/pos/Mesas"));
const Ordenes = lazy(() => import("../modulos/pos/Ordenes"));
const Cocina = lazy(() => import("../modulos/pos/Cocina"));
const Caja = lazy(() => import("../modulos/pos/Caja"));
const CierresEliminados = lazy(
  () => import("../modulos/pos/CierresEliminados"),
);
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
const Configuracion = lazy(() => import("../modulos/pos/Configuracion"));
const SuperAdmin = lazy(() => import("../modulos/admin/SuperAdmin"));
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

function App() {
  return (
    <Router>
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* Rutas Públicas */}
          <Route path="/login" element={<Login />} />
          <Route path="/login-superadmin" element={<LoginSuperAdmin />} />
          <Route path="/marketplace/*" element={<Marketplace />} />
          <Route path="/" element={<Navigate to="/marketplace" replace />} />

          {/* Ruta Protegida: SuperAdmin */}
          <Route
            path="/superadmin"
            element={
              <RequireAdmin>
                <SuperAdmin />
              </RequireAdmin>
            }
          />

          {/* Rutas Protegidas: POS */}
          <Route
            path="/pos"
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<POS />} />
            <Route path="pos" element={<POS />} />
            <Route path="mesas" element={<Mesas />} />
            <Route path="ordenes" element={<Ordenes />} />
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
            <Route
              path="caja/CierresEliminados"
              element={<CierresEliminados />}
            />
            <Route path="horarios" element={<Horarios />} />
            <Route path="reservas" element={<Reservas />} />
            <Route path="estadisticas" element={<Estadisticas />} />
            <Route path="utilidades" element={<Utilidades />} />
            <Route path="planes" element={<Planes />} />
            <Route path="configuracion" element={<Configuracion />} />
            <Route path="configuracion/:section" element={<Configuracion />} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
