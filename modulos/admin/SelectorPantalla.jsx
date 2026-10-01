import React from "react";
import SuperAdminDashboardOverview from "./Resumen";
import SuperAdminTiendasPanel from "./Tiendas";
import SuperAdminMarketplacePanel from "./Mercado";
import SuperAdminFinanzasPanel from "./Finanzas";
import SuperAdminSistemaPanel from "./Sistema";

const sectionsMap = {
  resumen: SuperAdminDashboardOverview,
  tiendas: SuperAdminTiendasPanel,
  "crear-tienda": SuperAdminTiendasPanel,
  "categorias-maestras": SuperAdminMarketplacePanel,
  promociones: SuperAdminMarketplacePanel,
  planes: SuperAdminFinanzasPanel,
  "pagos-suscripciones": SuperAdminFinanzasPanel,
  sistema: SuperAdminSistemaPanel,
  configuracion: SuperAdminSistemaPanel,
};

const SuperAdminSectionRouter = ({ section = "resumen" }) => {
  const Component = sectionsMap[section] || SuperAdminDashboardOverview;
  return <Component />;
};

export default SuperAdminSectionRouter;
