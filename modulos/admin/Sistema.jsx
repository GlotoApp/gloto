import SuperAdminSectionShell from "./ContenedorSeccion";
import SuperAdminStorageCleanup from "./LimpiarArchivos";

const SuperAdminSistemaPanel = () => {
  return (
    <SuperAdminSectionShell title="Sistema" badge="Sistema">
      <SuperAdminStorageCleanup />
    </SuperAdminSectionShell>
  );
};

export default SuperAdminSistemaPanel;
