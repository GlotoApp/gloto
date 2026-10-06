import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div>Cargando...</div>;

  if (!user) {
    // El acceso a gestión requiere autenticación.
    if (location.pathname === "/gestion") {
      return <Navigate to="/acceso" replace />;
    }
    // Si intentas entrar al POS, vas al login normal
    return <Navigate to="/login" replace />;
  }

  return children;
};
