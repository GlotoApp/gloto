export const EMPLOYEE_PERMISSION_OPTIONS = [
  { key: "pos", label: "Usar POS" },
  { key: "mesas", label: "Gestionar mesas" },
  { key: "cocina", label: "Ver cocina" },
  { key: "ordenes", label: "Gestionar órdenes" },
  { key: "reservas", label: "Gestionar reservas" },
  { key: "catalogo", label: "Ver catálogo y productos" },
  { key: "inventario", label: "Gestionar inventario" },
  { key: "caja", label: "Acceder a caja y cierres" },
  { key: "horarios", label: "Gestionar horarios" },
  { key: "estadisticas", label: "Ver estadísticas" },
  { key: "utilidades", label: "Acceder a utilidades" },
  { key: "promociones", label: "Gestionar promociones" },
  { key: "finanzas", label: "Ver planes y pagos" },
  { key: "configuracion", label: "Editar configuración del negocio" },
  { key: "notificaciones", label: "Ver notificaciones" },
];

export const getEmployeePermissionForPath = (pathname) => {
  if (pathname === "/pos" || pathname === "/pos/pos") return "pos";
  if (pathname.startsWith("/pos/mesas")) return "mesas";
  if (pathname.startsWith("/pos/cocina")) return "cocina";
  if (pathname.startsWith("/pos/ordenes")) return "ordenes";
  if (pathname.startsWith("/pos/reservas")) return "reservas";
  if (
    pathname.startsWith("/pos/productos") ||
    pathname.startsWith("/pos/categorias")
  ) {
    return "catalogo";
  }
  if (pathname.startsWith("/pos/inventario")) return "inventario";
  if (pathname.startsWith("/pos/caja")) return "caja";
  if (pathname.startsWith("/pos/horarios")) return "horarios";
  if (pathname.startsWith("/pos/estadisticas")) return "estadisticas";
  if (pathname.startsWith("/pos/utilidades")) return "utilidades";
  if (pathname.startsWith("/pos/promociones")) return "promociones";
  if (
    pathname.startsWith("/pos/planes") ||
    pathname.startsWith("/pos/mi-plan") ||
    pathname.startsWith("/pos/historial-pagos")
  ) {
    return "finanzas";
  }
  if (pathname.startsWith("/pos/configuracion/empleados")) return null;
  if (pathname.startsWith("/pos/configuracion")) return "configuracion";
  if (pathname.startsWith("/pos/notificaciones")) return "notificaciones";
  return null;
};
