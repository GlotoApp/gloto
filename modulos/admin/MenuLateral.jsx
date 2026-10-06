import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  ArrowLeft,
  Crown,
  CreditCard,
  LayoutDashboard,
  Menu,
  Megaphone,
  Settings,
  Store,
  Tag,
  UserPlus,
  WalletCards,
  X,
} from "lucide-react";

const navItems = [
  { label: "Resumen", path: "/superadmin/resumen", icon: LayoutDashboard },
  { label: "Marketplace", path: "/superadmin/marketplace", icon: Tag },
  { label: "Tiendas", path: "/superadmin/tiendas", icon: Store },
  { label: "Crear cuenta", path: "/superadmin/cuentas/nueva", icon: UserPlus },
  {
    label: "Suscripciones",
    path: "/superadmin/finanzas/suscripciones",
    icon: WalletCards,
  },
  {
    label: "Planes",
    path: "/superadmin/planes",
    icon: CreditCard,
  },
  {
    label: "Promociones",
    path: "/superadmin/finanzas/promociones",
    icon: Megaphone,
  },
  { label: "Sistema", path: "/superadmin/sistema", icon: Settings },
];

const SuperAdminSidebar = ({
  isExpanded: expandedProp,
  toggleSidebar: toggleSidebarProp,
  onMouseEnter,
  onMouseLeave,
}) => {
  const [internalExpanded, setInternalExpanded] = useState(true);
  const isExpanded = expandedProp ?? internalExpanded;
  const toggleSidebar =
    toggleSidebarProp ?? (() => setInternalExpanded((current) => !current));

  return (
    <aside
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`${
        isExpanded ? "w-64" : "w-20"
      } flex h-screen flex-col border-r border-violet-400/20 bg-neutral-950 transition-all duration-300`}
    >
      <div className="flex h-20 items-center justify-between border-b border-white/[0.06] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
            <Crown size={19} />
          </span>
          {isExpanded && (
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-white">Gloto</p>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-violet-300">
                Superadmin
              </p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={toggleSidebar}
          className="shrink-0 rounded-lg p-2 text-neutral-400 transition hover:bg-white/[0.06] hover:text-white"
          aria-label={isExpanded ? "Contraer menú" : "Expandir menú"}
        >
          {isExpanded ? <X size={17} /> : <Menu size={17} />}
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
        {navItems.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            title={isExpanded ? undefined : label}
            className={({ isActive }) =>
              `group relative flex h-10 w-full items-center rounded-lg transition-all ${
                isExpanded ? "gap-3 px-3" : "justify-center px-0"
              } ${
                isActive
                  ? "bg-violet-500/15 text-violet-300"
                  : "text-neutral-400 hover:bg-white/[0.05] hover:text-white"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`absolute left-0 h-5 w-1 rounded-r-full bg-violet-400 transition-opacity ${
                    isActive ? "opacity-100" : "opacity-0"
                  }`}
                />
                <Icon size={19} strokeWidth={isActive ? 2.5 : 2} />
                {isExpanded && (
                  <span className="truncate text-xs font-bold uppercase tracking-tight">
                    {label}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        <Link
          to="/superadmin-actual"
          title={isExpanded ? undefined : "Gestión completa"}
          className={`group flex h-10 items-center rounded-lg text-neutral-400 transition hover:bg-white/[0.05] hover:text-white ${
            isExpanded ? "gap-3 px-3" : "justify-center"
          }`}
        >
          <ArrowLeft size={18} />
          {isExpanded && (
            <span className="text-xs font-bold uppercase tracking-tight">
              Gestión completa
            </span>
          )}
        </Link>
      </div>
    </aside>
  );
};

export default SuperAdminSidebar;
