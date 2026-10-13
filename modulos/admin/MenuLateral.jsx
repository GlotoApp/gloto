import { useCallback, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Banknote,
  Bike,
  ChevronDown,
  Crown,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  Store,
  Tag,
  UserPlus,
  WalletCards,
  Megaphone,
  ShieldCheck,
  X,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import { useAdminRealtime } from "./useAdminRealtime";

const PendingBadge = ({ count, label, compact = false }) => {
  if (!count) return null;
  const accessibleLabel = `${count} ${label} pendientes`;

  return (
    <span
      aria-label={accessibleLabel}
      title={accessibleLabel}
      className={
        compact
          ? "absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-neutral-950 bg-red-500"
          : "ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black leading-none text-white"
      }
    >
      {!compact && (count > 99 ? "99+" : count)}
    </span>
  );
};

const navItems = [
  { label: "Resumen", path: "/gestion/resumen", icon: LayoutDashboard },
  { label: "Marketplace", path: "/gestion/marketplace", icon: Tag },
  { label: "Tiendas", path: "/gestion/tiendas", icon: Store },
  {
    label: "Domiciliarios",
    path: "/gestion/domiciliarios",
    icon: Bike,
  },
  { label: "Crear cuenta", path: "/gestion/cuentas/nueva", icon: UserPlus },
  {
    label: "Planes",
    path: "/gestion/planes",
    icon: CreditCard,
  },
  { label: "Sistema", path: "/gestion/sistema", icon: Settings },
];

const SuperAdminSidebar = ({
  isExpanded: expandedProp,
  toggleSidebar: toggleSidebarProp,
  onMouseEnter,
  onMouseLeave,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [internalExpanded, setInternalExpanded] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [financesOpen, setFinancesOpen] = useState(() =>
    location.pathname.startsWith("/gestion/finanzas"),
  );
  const [pendingCounts, setPendingCounts] = useState(null);
  const [paymentsOpen, setPaymentsOpen] = useState(() =>
    location.pathname.startsWith("/gestion/finanzas/pagos"),
  );
  const isExpanded = expandedProp ?? internalExpanded;
  const toggleSidebar =
    toggleSidebarProp ?? (() => setInternalExpanded((current) => !current));
  const isFinancesActive = location.pathname.startsWith("/gestion/finanzas");
  const isPaymentsActive =
    location.pathname.startsWith("/gestion/finanzas/pagos");
  const paymentSubmenu = [
    {
      label: "Por aprobar",
      path: "/gestion/finanzas/pagos",
      icon: WalletCards,
      count: pendingCounts
        ? pendingCounts.subscriptions +
          pendingCounts.promotions +
          pendingCounts.couriers
        : 0,
    },
    {
      label: "Suscripciones",
      path: "/gestion/finanzas/pagos/suscripciones",
      icon: ShieldCheck,
      count: pendingCounts?.subscriptions || 0,
    },
    {
      label: "Promociones",
      path: "/gestion/finanzas/pagos/promociones",
      icon: Megaphone,
      count: pendingCounts?.promotions || 0,
    },
    {
      label: "Domiciliarios",
      path: "/gestion/finanzas/pagos/domiciliarios",
      icon: Bike,
      count: pendingCounts?.couriers || 0,
    },
  ];
  const totalPendingCount = pendingCounts
    ? pendingCounts.subscriptions +
      pendingCounts.promotions +
      pendingCounts.couriers
    : 0;

  const loadPendingCounts = useCallback(async () => {
    const results = await Promise.all([
      supabase
        .from("payment_records")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("promotions")
        .select("id", { count: "exact", head: true })
        .eq("payment_status", "pending"),
      supabase
        .from("public_courier_topups")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("business_plan_change_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["awaiting_payment", "pending_review"]),
    ]);

    const failedResult = results.find(({ error }) => error);
    if (failedResult) {
      console.error(
        "No se pudieron actualizar los contadores de pagos pendientes:",
        failedResult.error,
      );
      return;
    }

    setPendingCounts({
      subscriptions: (results[0].count || 0) + (results[3].count || 0),
      promotions: results[1].count || 0,
      couriers: results[2].count || 0,
    });
  }, []);

  useAdminRealtime(
    [
      "payment_records",
      "promotions",
      "public_courier_topups",
      "business_plan_change_requests",
    ],
    loadPendingCounts,
    true,
  );

  const handleFinanceToggle = () => {
    if (!isExpanded) {
      toggleSidebar();
      setFinancesOpen(true);
      return;
    }
    setFinancesOpen((open) => !open);
  };

  const handlePaymentsToggle = () => {
    if (!isExpanded) {
      toggleSidebar();
      setFinancesOpen(true);
      setPaymentsOpen(true);
      return;
    }
    setPaymentsOpen((open) => !open);
  };

  const handleSubmenuNavigation = () => {
    if (isExpanded) toggleSidebar();
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setSignOutError("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate("/acceso", { replace: true });
    } catch (error) {
      console.error("No se pudo cerrar la sesión de administración:", error);
      setSignOutError("No se pudo cerrar sesión. Intenta de nuevo.");
    } finally {
      setIsSigningOut(false);
    }
  };

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
                Administración
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
        {navItems.slice(0, 4).map(({ label, path, icon: Icon }) => (
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
        <div className="flex flex-col">
          <button
            type="button"
            onClick={handleFinanceToggle}
            aria-expanded={isExpanded && financesOpen}
            aria-controls="admin-finance-submenu"
            title={isExpanded ? undefined : "Finanzas"}
            className={`group relative flex h-10 w-full items-center rounded-lg transition-all ${
              isExpanded ? "gap-3 px-3" : "justify-center px-0"
            } ${
              isFinancesActive
                ? "text-violet-300"
                : "text-neutral-400 hover:bg-white/[0.05] hover:text-white"
            }`}
          >
            <span
              className={`absolute left-0 h-5 w-1 rounded-r-full bg-violet-400 transition-opacity ${
                isFinancesActive ? "opacity-100" : "opacity-0"
              }`}
            />
            <CreditCard size={19} />
            <PendingBadge
              count={totalPendingCount}
              label="solicitudes por aprobar"
              compact={!isExpanded}
            />
            {isExpanded && (
              <>
                <span className="flex-1 truncate text-left text-xs font-bold uppercase tracking-tight">
                  Finanzas
                </span>
                <ChevronDown
                  size={15}
                  className={`transition-transform ${financesOpen ? "rotate-180" : ""}`}
                />
              </>
            )}
          </button>

          {isExpanded && financesOpen && (
            <div
              id="admin-finance-submenu"
              className="ml-5 mt-1 flex flex-col border-l border-white/20 pl-2"
            >
              <button
                type="button"
                onClick={handlePaymentsToggle}
                aria-expanded={paymentsOpen}
                aria-controls="admin-payment-submenu"
                className={`group flex min-h-9 items-center gap-2 rounded-lg px-2 text-left text-[11px] font-bold uppercase tracking-tight transition ${
                  isPaymentsActive
                    ? "text-violet-300"
                    : "text-neutral-400 hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                <Banknote size={15} />
                <span className="flex-1">Pagos</span>
                <ChevronDown
                  size={13}
                  className={`transition-transform ${paymentsOpen ? "rotate-180" : ""}`}
                />
              </button>
              {paymentsOpen && (
                <div
                  id="admin-payment-submenu"
                  className="ml-3 flex flex-col border-l border-white/10 pl-2"
                >
                  {paymentSubmenu.map(({ label, path, icon: Icon, count }) => (
                    <NavLink
                      key={path}
                      to={path}
                      end
                      onClick={() => {
                        setFinancesOpen(true);
                        setPaymentsOpen(true);
                        handleSubmenuNavigation();
                      }}
                      className={({ isActive }) =>
                        `group flex min-h-8 items-center gap-2 rounded-lg px-2 text-[10px] font-bold uppercase tracking-tight transition ${
                          isActive
                            ? "bg-violet-500/10 text-violet-300"
                            : "text-neutral-400 hover:bg-white/[0.05] hover:text-white"
                        }`
                      }
                    >
                      <Icon size={13} />
                      <span className="truncate">{label}</span>
                      <PendingBadge
                        count={count}
                        label={`${label.toLowerCase()} por aprobar`}
                      />
                    </NavLink>
                  ))}
                </div>
              )}
              <NavLink
                to="/gestion/finanzas/historial"
                end
                onClick={() => {
                  setFinancesOpen(true);
                  setPaymentsOpen(false);
                  handleSubmenuNavigation();
                }}
                className={({ isActive }) =>
                  `mt-1 flex min-h-9 items-center gap-2 rounded-lg px-2 text-[11px] font-bold uppercase tracking-tight transition ${
                    isActive
                      ? "bg-violet-500/10 text-violet-300"
                      : "text-neutral-400 hover:bg-white/[0.05] hover:text-white"
                  }`
                }
              >
                <ReceiptText size={15} />
                Historial de pagos
              </NavLink>
            </div>
          )}
        </div>
        {navItems.slice(4).map(({ label, path, icon: Icon }) => (
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
        {signOutError && (
          <p className="mb-2 text-xs text-rose-300" role="alert">
            {signOutError}
          </p>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          title={isExpanded ? undefined : "Cerrar sesión"}
          aria-label="Cerrar sesión"
          className={`group flex h-10 w-full items-center rounded-lg text-neutral-400 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-wait disabled:opacity-60 ${
            isExpanded ? "gap-3 px-3" : "justify-center"
          }`}
        >
          <LogOut size={18} />
          {isExpanded && (
            <span className="text-xs font-bold uppercase tracking-tight">
              {isSigningOut ? "Cerrando sesión..." : "Cerrar sesión"}
            </span>
          )}
        </button>
      </div>
    </aside>
  );
};

export default SuperAdminSidebar;
