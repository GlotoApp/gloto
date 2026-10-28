import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import logoPng from "/logo.png";
import {
  Plus,
  ChefHat,
  BookOpen,
  Package,
  BarChart3,
  Settings,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CalendarDays,
  Clock3,
  PencilRuler,
  CreditCard,
  Banknote,
  Bell,
  LogOut,
  Moon,
  Sun,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import { getEnabledDeliveryMethods } from "../../src/lib/deliveryMethods";
import { useEmployeeAccess } from "../../src/components/EmployeeAccessContext";
import { getEmployeePermissionForPath } from "../../src/lib/employeePermissions";
import { useAuth } from "../../src/components/AuthContext";
import {
  cacheColorMode,
  getStoredColorMode,
} from "../../src/lib/colorMode";

const Sidebar = ({
  isExpanded,
  toggleSidebar,
  onColorModeChange,
  onMouseEnter,
  onMouseLeave,
  overlayClassName = "",
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const navRef = useRef(null);
  const { user } = useAuth();
  const { isEmployee, permissions } = useEmployeeAccess();
  const canAccessPath = (path) => {
    if (!isEmployee) return true;
    const permission = getEmployeePermissionForPath(path);
    return Boolean(permission && permissions[permission] === true);
  };

  const [cajaOpen, setCajaOpen] = useState(false);
  const [catalogoOpen, setCatalogoOpen] = useState(false);
  const [inventarioOpen, setInventarioOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [finanzasOpen, setFinanzasOpen] = useState(false);
  const [selectedMenuGroup, setSelectedMenuGroup] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [businessName, setBusinessName] = useState("Gloto");
  const [businessLogo, setBusinessLogo] = useState(logoPng);
  const [planName, setPlanName] = useState("Sin plan");
  const [inventoryEnabled, setInventoryEnabled] = useState(false);
  const [tablesEnabled, setTablesEnabled] = useState(true);
  const [ticketUsage, setTicketUsage] = useState(null);
  const [colorMode, setColorMode] = useState(getStoredColorMode);
  const [colorModeReady, setColorModeReady] = useState(false);
  const [savingColorMode, setSavingColorMode] = useState(false);
  const isOrdersActive = location.pathname.startsWith("/pos/ordenes");
  const accountPlanStyles = planName.toLowerCase().includes("premium")
    ? {
        button: "bg-amber-400/[0.06] hover:bg-amber-400/10",
        active: "bg-amber-400/15",
        icon: "bg-amber-400/15 text-amber-200",
        accent: "text-amber-300",
        details: "text-amber-100/60",
      }
    : planName.toLowerCase().includes("pro")
      ? {
          button: "bg-violet-400/[0.06] hover:bg-violet-400/10",
          active: "bg-violet-400/15",
          icon: "bg-violet-400/15 text-violet-200",
          accent: "text-violet-300",
          details: "text-violet-100/60",
        }
      : {
          button: "bg-white/[0.03] hover:bg-white/[0.07]",
          active: "bg-white/[0.08]",
          icon: "bg-white/10 text-neutral-200",
          accent: "text-neutral-300",
          details: "text-neutral-400",
        };

  useEffect(() => {
    if (!isExpanded) setUserMenuOpen(false);
  }, [isExpanded]);

  useEffect(() => {
    let isMounted = true;
    if (!user?.id) {
      setColorModeReady(true);
      return () => {
        isMounted = false;
      };
    }

    setColorModeReady(false);
    const cachedMode = cacheColorMode(getStoredColorMode(user.id), user.id);
    setColorMode(cachedMode);
    onColorModeChange?.(cachedMode);
    const loadColorMode = async () => {
      try {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("color_mode")
          .eq("id", user.id)
          .maybeSingle();
        if (!isMounted) return;
        if (error) {
          console.error("No se pudo cargar la apariencia del usuario:", error);
          setColorModeReady(true);
          return;
        }
        if (profile?.color_mode === "light" || profile?.color_mode === "dark") {
          const savedMode = cacheColorMode(profile.color_mode, user.id);
          setColorMode(savedMode);
          onColorModeChange?.(savedMode);
        }
        setColorModeReady(true);
      } catch (error) {
        if (!isMounted) return;
        console.error("Error cargando la apariencia del usuario:", error);
        setColorModeReady(true);
      }
    };

    loadColorMode();
    return () => {
      isMounted = false;
    };
  }, [onColorModeChange, user?.id]);

  const handleColorModeToggle = async () => {
    if (!user?.id || !colorModeReady || savingColorMode) return;
    const nextMode = colorMode === "dark" ? "light" : "dark";
    const cachedMode = cacheColorMode(nextMode, user.id);
    setColorMode(cachedMode);
    onColorModeChange?.(cachedMode);
    setSavingColorMode(true);

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ color_mode: nextMode })
        .eq("id", user.id)
        .select("id")
        .maybeSingle();
      if (error || !data) {
        console.error(
          "No se pudo guardar la apariencia del usuario:",
          error || "No se actualizó ningún perfil para el usuario actual.",
        );
        window.alert(
          "El tema cambió en este dispositivo, pero no se pudo guardar en tu perfil. Intenta nuevamente.",
        );
      }
    } catch (error) {
      console.error("Error guardando la apariencia del usuario:", error);
      window.alert(
        "El tema cambió en este dispositivo, pero no se pudo guardar en tu perfil. Intenta nuevamente.",
      );
    } finally {
      setSavingColorMode(false);
    }
  };

  const menuItems = [
    { name: "POS", path: "/pos", icon: Plus },
    { name: "Mesas", path: "/pos/mesas", icon: "table_bar" },
    { name: "Cocina", path: "/pos/cocina", icon: ChefHat },
    { name: "Órdenes", path: "/pos/ordenes", icon: ClipboardList },
    { name: "Reservas", path: "/pos/reservas", icon: CalendarDays },
    { name: "Catálogo", path: "/pos/productos", icon: BookOpen },
    {
      name: "Inventario",
      path: "/pos/inventario",
      icon: Package,
      subMenu: [
        { name: "Categorías de insumos", path: "/pos/inventario/categorias" },
        { name: "Insumos", path: "/pos/inventario" },
        {
          name: "Historial de movimientos",
          path: "/pos/inventario/movimientos",
        },
      ],
    },
    { name: "Caja", path: "/pos/caja", icon: Banknote },
    { name: "Horarios", path: "/pos/horarios", icon: Clock3 },
    { name: "Estadísticas", path: "/pos/estadisticas", icon: BarChart3 },
    { name: "Utilidades", path: "/pos/utilidades", icon: PencilRuler },
  ];

  const cajaSubMenu = [
    { name: "Cierre de Caja", path: "/pos/caja" },
    { name: "Historial de cierres", path: "/pos/caja/historial" },
    { name: "Cierres Eliminados", path: "/pos/caja/CierresEliminados" },
  ];

  const ordersSubMenu = [
    { name: "Órdenes", path: "/pos/ordenes" },
    { name: "Órdenes eliminadas", path: "/pos/ordenes/eliminadas" },
  ];

  const catalogoSubMenu = [
    { name: "Categorías", path: "/pos/categorias" },
    { name: "Productos", path: "/pos/productos" },
  ];

  const finanzasSubMenu = [
    { name: "Mi plan", path: "/pos/mi-plan" },
    { name: "Promociones", path: "/pos/promociones" },
    { name: "Planes", path: "/pos/planes" },
    { name: "Historial de pagos", path: "/pos/historial-pagos" },
  ];

  const configSubMenu = [
    { name: "Tienda", path: "/pos/configuracion/tienda" },
    { name: "Datos", path: "/pos/configuracion/datos" },
    { name: "Empleados", path: "/pos/configuracion/empleados" },
    { name: "Impresoras", path: "/pos/configuracion/impresoras" },
  ];
  const visibleFinanzasSubMenu = finanzasSubMenu.filter((sub) =>
    canAccessPath(sub.path),
  );
  const visibleConfigSubMenu = configSubMenu.filter((sub) =>
    canAccessPath(sub.path),
  );

  useEffect(() => {
    if (isExpanded) {
      navRef.current?.scrollTo({ top: 0 });
      if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
        setCajaOpen(true);
        setCatalogoOpen(true);
        setInventarioOpen(true);
        setConfigOpen(true);
        setFinanzasOpen(true);
      }
      return;
    }

    setCajaOpen(false);
    setCatalogoOpen(false);
    setInventarioOpen(false);
    setOrdersOpen(false);
    setConfigOpen(false);
    setFinanzasOpen(false);
    setSelectedMenuGroup(null);
  }, [isExpanded]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverflowY = document.body.style.overflowY;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousHtmlOverflowY = document.documentElement.style.overflowY;

    if (isExpanded) {
      document.body.style.overflow = "hidden";
      document.body.style.overflowY = "hidden";
      document.documentElement.style.overflow = "hidden";
      document.documentElement.style.overflowY = "hidden";
    }

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overflowY = previousBodyOverflowY;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.documentElement.style.overflowY = previousHtmlOverflowY;
    };
  }, [isExpanded]);

  const isCajaActive = location.pathname.startsWith("/pos/caja");
  const isInventarioActive = location.pathname.startsWith("/pos/inventario");
  const isCatalogoActive =
    location.pathname === "/pos/productos" ||
    location.pathname === "/pos/categorias";
  const isConfigSectionActive =
    location.pathname.startsWith("/pos/configuracion");
  const isFinanzasActive =
    location.pathname.startsWith("/pos/planes") ||
    location.pathname.startsWith("/pos/mi-plan") ||
    location.pathname.startsWith("/pos/historial-pagos") ||
    location.pathname.startsWith("/pos/promociones");

  useEffect(() => {
    if (isCatalogoActive) setCatalogoOpen(true);
  }, [isCatalogoActive]);

  useEffect(() => {
    if (isCajaActive) setCajaOpen(true);
  }, [isCajaActive]);

  useEffect(() => {
    if (isInventarioActive) setInventarioOpen(true);
  }, [isInventarioActive]);

  useEffect(() => {
    if (isOrdersActive && isExpanded) setOrdersOpen(true);
  }, [isOrdersActive, isExpanded]);

  useEffect(() => {
    if (isConfigSectionActive) setConfigOpen(true);
  }, [isConfigSectionActive]);

  useEffect(() => {
    if (isFinanzasActive) setFinanzasOpen(true);
  }, [isFinanzasActive]);

  useEffect(() => {
    let isMounted = true;
    const loadBusinessBrand = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (!profile?.business_id) return;

      const [
        { data: business },
        { data: planAccess, error: planAccessError },
      ] = await Promise.all([
        supabase
          .from("businesses")
          .select("name, logo_url")
          .eq("id", profile.business_id)
          .maybeSingle(),
        supabase.rpc("get_business_plan_access"),
      ]);

      if (!isMounted) return;
      if (business?.name) setBusinessName(business.name);
      if (business?.logo_url) setBusinessLogo(business.logo_url);
      if (planAccessError) {
        console.error("No se pudo cargar el acceso del plan:", planAccessError);
        return;
      }
      if (planAccess?.plan_name) setPlanName(planAccess.plan_name);
      setInventoryEnabled(Boolean(planAccess?.inventory_enabled));
      setTicketUsage(
        planAccess?.plan_code
          ? {
              limit: planAccess.ticket_limit,
              used: Number(planAccess.tickets_used || 0),
            }
          : null,
      );
    };

    loadBusinessBrand();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadDeliveryMethods = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error("No se pudo identificar el negocio:", userError);
        return;
      }
      if (!userData?.user?.id) return;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (profileError) {
        console.error("No se pudo cargar el negocio:", profileError);
        return;
      }
      if (!profile?.business_id) return;

      const { data: businessInfo, error } = await supabase
        .from("business_info")
        .select("delivery_methods")
        .eq("business_id", profile.business_id)
        .maybeSingle();
      if (error) {
        console.error(
          "No se pudo cargar los métodos de entrega de la tienda:",
          error,
        );
        return;
      }
      if (isMounted) {
        setTablesEnabled(
          getEnabledDeliveryMethods(businessInfo?.delivery_methods).includes(
            "table",
          ),
        );
      }
    };

    loadDeliveryMethods();
    return () => {
      isMounted = false;
    };
  }, [location.pathname]);

  useEffect(() => {
    let isMounted = true;
    if (
      isEmployee &&
      permissions.inventario !== true &&
      permissions.finanzas !== true
    ) {
      return () => {
        isMounted = false;
      };
    }

    const refreshPlanAccess = async () => {
      const { data, error } = await supabase.rpc("get_business_plan_access");
      if (error) {
        console.error("No se pudo actualizar el uso del plan:", error);
        return;
      }
      if (!isMounted) return;
      if (data?.plan_name) setPlanName(data.plan_name);
      setInventoryEnabled(Boolean(data?.inventory_enabled));
      setTicketUsage(
        data?.plan_code
          ? {
              limit: data.ticket_limit,
              used: Number(data.tickets_used || 0),
            }
          : null,
      );
    };

    const intervalId = window.setInterval(refreshPlanAccess, 30_000);
    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [isEmployee, permissions.finanzas, permissions.inventario]);

  useEffect(() => {
    let isMounted = true;
    let channel;
    let refreshTimeout;
    if (isEmployee && permissions.notificaciones !== true) {
      return () => {
        isMounted = false;
      };
    }

    const loadNotifications = async ({ sync = false } = {}) => {
      if (sync) {
        const { error: refreshError } = await supabase.rpc(
          "refresh_business_notifications",
        );
        if (refreshError) {
          console.error("No se pudieron sincronizar avisos:", refreshError);
        }
      }

      const { count, error } = await supabase
        .from("business_notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null)
        .not(
          "notification_type",
          "in",
          '("stock_low","product_stock_low","product_out_of_stock")',
        );

      if (!isMounted) return;
      if (error) {
        console.error("No se pudieron cargar las notificaciones:", error);
      } else {
        setUnreadNotificationCount(count || 0);
      }
    };

    const subscribeToBusinessNotifications = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId || !isMounted) return;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", userId)
        .maybeSingle();

      if (profileError || !profile?.business_id || !isMounted) return;

      channel = supabase
        .channel(`sidebar-notification-count-${profile.business_id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "business_notifications",
            filter: `business_id=eq.${profile.business_id}`,
          },
          () => {
            if (refreshTimeout) window.clearTimeout(refreshTimeout);
            refreshTimeout = window.setTimeout(() => {
              loadNotifications();
            }, 150);
          },
        )
        .subscribe((status, channelError) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error(
              "Realtime del contador no disponible:",
              status,
              channelError,
            );
          }
        });

      await loadNotifications({ sync: true });
    };

    subscribeToBusinessNotifications();

    return () => {
      isMounted = false;
      if (refreshTimeout) window.clearTimeout(refreshTimeout);
      if (channel) supabase.removeChannel(channel);
    };
  }, [isEmployee, permissions.notificaciones]);

  const handleLogout = async () => {
    setShowLogoutConfirm(false);
    setUserMenuOpen(false);
    await supabase.auth.signOut();
    navigate("/login");
  };

  const handleLogoutClick = () => {
    setUserMenuOpen(false);
    setShowLogoutConfirm(true);
  };

  const handleItemClick = () => {
    if (isExpanded) toggleSidebar();
  };

  const setOpenMenuGroup = (group) => {
    setCajaOpen(group === "caja");
    setCatalogoOpen(group === "catalogo");
    setInventarioOpen(group === "inventario");
    setOrdersOpen(group === "ordenes");
    setConfigOpen(group === "configuracion");
    setFinanzasOpen(group === "finanzas");
  };

  const handleSubmenuToggle = (event, group, isOpen) => {
    event.preventDefault();
    const shouldOpen = !isExpanded || !isOpen;
    setSelectedMenuGroup(group);
    setOpenMenuGroup(shouldOpen ? group : null);
    if (!isExpanded) toggleSidebar();
  };

  const handleToggleClickCaja = (e) => {
    handleSubmenuToggle(e, "caja", cajaOpen);
  };

  const handleToggleClickCatalogo = (e) => {
    handleSubmenuToggle(e, "catalogo", catalogoOpen);
  };

  const handleToggleClickInventario = (e) => {
    handleSubmenuToggle(e, "inventario", inventarioOpen);
  };
  const handleToggleClickOrders = (e) => {
    handleSubmenuToggle(e, "ordenes", ordersOpen);
  };

  const handleToggleClickConfig = (e) => {
    handleSubmenuToggle(e, "configuracion", configOpen);
  };

  const handleToggleClickFinanzas = (e) => {
    handleSubmenuToggle(e, "finanzas", finanzasOpen);
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-50 transition-all duration-500 ${overlayClassName} ${
          isExpanded
            ? "bg-background/40 backdrop-blur-sm opacity-100 pointer-events-auto"
            : "bg-background/0 backdrop-blur-0 opacity-0 pointer-events-none"
        }`}
        onClick={toggleSidebar}
      />

      <aside
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={`flex flex-col fixed border-r border-primary/30 left-0 top-0 h-full bg-background z-50 transition-all duration-500 ease-in-out ${
          isExpanded ? "w-64" : "w-20"
        }`}
      >
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={isExpanded ? "Contraer menú lateral" : "Expandir menú lateral"}
          title={isExpanded ? "Contraer menú" : "Expandir menú"}
          className="absolute -right-3 top-12 z-[60] flex h-7 w-7 items-center justify-center rounded-full border border-primary/25 bg-background text-on-surface-variant shadow-lg shadow-black/40 transition-all hover:scale-105 hover:border-primary/50 hover:text-primary active:scale-95"
        >
          {isExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>

        <div className="h-16 shrink-0 px-3 pt-3">
          <div
            className={`relative z-50 flex h-10 w-full items-center pb-2 ${
              isExpanded ? "justify-between border-b border-white/10" : "justify-center"
            }`}
          >
            <div
              className={`flex min-w-0 items-center ${
                isExpanded ? "flex-1 gap-3" : "justify-center"
              }`}
            >
              <button
                type="button"
                onClick={!isExpanded ? toggleSidebar : undefined}
                disabled={isExpanded}
                aria-label={businessName || "Gloto"}
                className="flex h-8 w-8 flex-shrink-0 cursor-default items-center justify-center bg-transparent p-0"
              >
                <img
                  src={businessLogo || logoPng}
                  alt={businessName || "Gloto"}
                  className="h-7 w-7 object-contain"
                  onError={(event) => {
                    event.currentTarget.src = logoPng;
                  }}
                />
              </button>

              <span
                title={businessName || "Gloto"}
                className={`min-w-0 whitespace-nowrap text-lg font-bold tracking-tight text-on-surface transition-all duration-300 ${
                  isExpanded
                    ? "flex-1 truncate opacity-100 translate-x-0"
                    : "pointer-events-none w-0 overflow-hidden opacity-0 -translate-x-4"
                }`}
              >
                {businessName || "Gloto"}
              </span>
            </div>
          </div>
        </div>

        <nav
          ref={navRef}
          className="flex-1 px-3 pt-6 pb-20 space-y-0.5 overflow-y-auto overflow-x-hidden custom-sidebar scrollbar-gutter-stable"
          style={{ scrollbarGutter: isExpanded ? "stable" : "auto" }}
        >
          {menuItems
            .filter(
              (item) =>
                canAccessPath(item.path) ||
                item.subMenu?.some((sub) => canAccessPath(sub.path)),
            )
            .filter((item) => item.name !== "Inventario" || inventoryEnabled)
            .filter(
              (item) =>
                !["Mesas", "Reservas"].includes(item.name) || tablesEnabled,
            )
            .map((item) => {
            if (item.name === "Caja") {
              return (
                <div
                  key={item.path}
                  className="flex flex-col transition-all duration-300"
                >
                  <button
                    onClick={handleToggleClickCaja}
                    className={`group relative flex items-center h-10 rounded-default transition-all duration-300 w-full ${
                      isExpanded ? "px-3 gap-3" : "justify-center px-0 gap-0"
                    } ${
                      isCajaActive
                        ? "text-primary"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-hover"
                    }`}
                  >
                    <span
                      className={`absolute left-0 w-1 h-6 rounded-r-full bg-primary-container transition-all duration-300 ${
                        isCajaActive
                          ? "scale-y-100 opacity-100"
                          : "scale-y-0 opacity-0 group-hover:scale-y-100 group-hover:opacity-50 group-hover:bg-primary"
                      }`}
                    />
                    <div
                      className={`flex items-center justify-center flex-shrink-0 w-5 h-5 transition-transform duration-300 ${
                        !isExpanded && "group-hover:scale-110"
                      } ${isCajaActive ? "text-primary-container" : "group-hover:text-on-surface"}`}
                    >
                      <Banknote
                        size={20}
                        strokeWidth={isCajaActive ? 2.5 : 2}
                      />
                    </div>
                    <span
                      className={`font-label-caps text-xs font-bold uppercase tracking-tight truncate text-left transition-all duration-300 ${
                        isCajaActive ? "text-primary-container" : ""
                      } ${
                        isExpanded
                          ? "flex-1 opacity-100 translate-x-0"
                          : "flex-none opacity-0 -translate-x-4 pointer-events-none w-0"
                      }`}
                    >
                      Caja
                    </span>
                    {isExpanded && (
                      <ChevronDown
                        size={14}
                        className={`text-primary/50 transition-transform duration-300 flex-shrink-0 ${
                          cajaOpen ? "rotate-180" : ""
                        }`}
                      />
                    )}
                    {!isExpanded && (
                      <div className="fixed left-20 ml-2 px-3 py-1 bg-primary-container text-on-primary text-[10px] font-label-caps font-black uppercase tracking-widest rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100] shadow-lg shadow-background">
                        Caja
                      </div>
                    )}
                  </button>

                  {cajaOpen && isExpanded && (
                    <div className="mt-1 ml-5 flex flex-col border-l border-white/30 space-y-0.5 pl-2 animate-in slide-in-from-top-2 duration-300">
                      {cajaSubMenu.filter((sub) => canAccessPath(sub.path)).map((sub) => {
                        const isSubActive = location.pathname === sub.path;
                        return (
                          <Link
                            key={sub.path}
                            to={sub.path}
                            onClick={handleItemClick}
                            className={`group relative flex items-center rounded-default transition-all duration-300 px-2 py-1.5 font-label-caps text-[11px] font-bold uppercase tracking-tight ${
                              isSubActive
                                ? "bg-primary-container/10 text-primary"
                                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-hover"
                            }`}
                          >
                            <span
                              className={`absolute left-0 w-1 h-5 rounded-r-full bg-primary transition-all duration-300 ${
                                isSubActive
                                  ? "scale-y-100 opacity-100"
                                  : "scale-y-0 opacity-0 group-hover:scale-y-100 group-hover:opacity-50"
                              }`}
                            />
                            {sub.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            if (item.name === "Órdenes") {
              return (
                <div
                  key={item.path}
                  className="flex flex-col transition-all duration-300"
                >
                  <button
                    type="button"
                    onClick={handleToggleClickOrders}
                    className={`group relative flex h-10 w-full items-center rounded-default transition-all duration-300 ${
                      isExpanded ? "gap-3 px-3" : "justify-center gap-0 px-0"
                    } ${
                      isOrdersActive
                        ? "text-primary-container"
                        : "text-on-surface-variant hover:bg-surface-hover hover:text-on-surface"
                    }`}
                  >
                    <span
                      className={`absolute left-0 h-6 w-1 rounded-r-full bg-primary-container transition-all duration-300 ${
                        isOrdersActive
                          ? "scale-y-100 opacity-100"
                          : "scale-y-0 opacity-0 group-hover:scale-y-100 group-hover:opacity-50 group-hover:bg-primary"
                      }`}
                    />
                    <div
                      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center ${isOrdersActive ? "text-primary-container" : ""}`}
                    >
                      <ClipboardList
                        size={20}
                        strokeWidth={isOrdersActive ? 2.5 : 2}
                      />
                    </div>
                    <span
                      className={`font-label-caps truncate text-left text-xs font-bold uppercase tracking-tight transition-all ${
                        isExpanded
                          ? "flex-1 opacity-100"
                          : "pointer-events-none w-0 -translate-x-4 opacity-0"
                      }`}
                    >
                      Órdenes
                    </span>
                    {isExpanded && (
                      <ChevronDown
                        size={14}
                        className={`flex-shrink-0 text-primary/50 transition-transform ${ordersOpen ? "rotate-180" : ""}`}
                      />
                    )}
                    {!isExpanded && (
                      <div className="pointer-events-none fixed left-20 ml-2 rounded bg-primary-container px-3 py-1 text-[10px] font-black uppercase tracking-widest text-on-primary opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                        Órdenes
                      </div>
                    )}
                  </button>
                  {ordersOpen && isExpanded && (
                    <div className="ml-5 mt-1 flex flex-col space-y-0.5 border-l border-white/30 pl-2">
                      {ordersSubMenu.filter((sub) => canAccessPath(sub.path)).map((sub) => {
                        const isSubActive = location.pathname === sub.path;
                        return (
                          <Link
                            key={sub.path}
                            to={sub.path}
                            onClick={handleItemClick}
                            className={`rounded-default px-2 py-1.5 text-[11px] font-bold uppercase tracking-tight transition-all ${
                              isSubActive
                                ? "bg-primary-container/10 text-primary"
                                : "text-on-surface-variant hover:bg-surface-hover hover:text-on-surface"
                            }`}
                          >
                            {sub.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            if (item.name === "Catálogo") {
              return (
                <div
                  key={item.path}
                  className="flex flex-col transition-all duration-300"
                >
                  <button
                    onClick={handleToggleClickCatalogo}
                    className={`group relative flex items-center h-10 rounded-default transition-all duration-300 w-full ${
                      isExpanded ? "px-3 gap-3" : "justify-center px-0 gap-0"
                    } ${
                      isCatalogoActive
                        ? "text-primary"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-hover"
                    }`}
                  >
                    <span
                      className={`absolute left-0 w-1 h-6 rounded-r-full bg-primary-container transition-all duration-300 ${
                        isCatalogoActive
                          ? "scale-y-100 opacity-100"
                          : "scale-y-0 opacity-0 group-hover:scale-y-100 group-hover:opacity-50 group-hover:bg-primary"
                      }`}
                    />
                    <div
                      className={`flex items-center justify-center flex-shrink-0 w-5 h-5 transition-transform duration-300 ${
                        !isExpanded && "group-hover:scale-110"
                      } ${isCatalogoActive ? "text-primary-container" : "group-hover:text-on-surface"}`}
                    >
                      <BookOpen
                        size={20}
                        strokeWidth={isCatalogoActive ? 2.5 : 2}
                      />
                    </div>
                    <span
                      className={`font-label-caps text-xs font-bold uppercase tracking-tight truncate text-left transition-all duration-300 ${
                        isCatalogoActive ? "text-primary-container" : ""
                      } ${
                        isExpanded
                          ? "flex-1 opacity-100 translate-x-0"
                          : "flex-none opacity-0 -translate-x-4 pointer-events-none w-0"
                      }`}
                    >
                      Catálogo
                    </span>
                    {isExpanded && (
                      <ChevronDown
                        size={14}
                        className={`text-primary/50 transition-transform duration-300 flex-shrink-0 ${
                          catalogoOpen ? "rotate-180" : ""
                        }`}
                      />
                    )}
                    {!isExpanded && (
                      <div className="fixed left-20 ml-2 px-3 py-1 bg-primary-container text-on-primary text-[10px] font-label-caps font-black uppercase tracking-widest rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100] shadow-lg shadow-background">
                        Catálogo
                      </div>
                    )}
                  </button>

                  {catalogoOpen && isExpanded && (
                    <div className="mt-1 ml-5 flex flex-col border-l border-white/30 space-y-0.5 pl-2 animate-in slide-in-from-top-2 duration-300">
                      {catalogoSubMenu.filter((sub) => canAccessPath(sub.path)).map((sub) => {
                        const isSubActive = location.pathname === sub.path;
                        return (
                          <Link
                            key={sub.path}
                            to={sub.path}
                            onClick={handleItemClick}
                            className={`group relative flex items-center rounded-default transition-all duration-300 px-2 py-1.5 font-label-caps text-[11px] font-bold uppercase tracking-tight ${
                              isSubActive
                                ? "bg-primary-container/10 text-primary"
                                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-hover"
                            }`}
                          >
                            <span
                              className={`absolute left-0 w-1 h-5 rounded-r-full bg-primary transition-all duration-300 ${
                                isSubActive
                                  ? "scale-y-100 opacity-100"
                                  : "scale-y-0 opacity-0 group-hover:scale-y-100 group-hover:opacity-50"
                              }`}
                            />
                            {sub.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            if (item.name === "Inventario") {
              return (
                <div
                  key={item.path}
                  className="flex flex-col transition-all duration-300"
                >
                  <button
                    onClick={handleToggleClickInventario}
                    className={`group relative flex items-center h-10 rounded-default transition-all duration-300 w-full ${
                      isExpanded ? "px-3 gap-3" : "justify-center px-0 gap-0"
                    } ${
                      isInventarioActive
                        ? "text-primary"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-hover"
                    }`}
                  >
                    <span
                      className={`absolute left-0 w-1 h-6 rounded-r-full bg-primary-container transition-all duration-300 ${
                        isInventarioActive
                          ? "scale-y-100 opacity-100"
                          : "scale-y-0 opacity-0 group-hover:scale-y-100 group-hover:opacity-50 group-hover:bg-primary"
                      }`}
                    />
                    <div
                      className={`flex items-center justify-center flex-shrink-0 w-5 h-5 transition-transform duration-300 ${
                        !isExpanded && "group-hover:scale-110"
                      } ${isInventarioActive ? "text-primary-container" : "group-hover:text-on-surface"}`}
                    >
                      <Package
                        size={20}
                        strokeWidth={isInventarioActive ? 2.5 : 2}
                      />
                    </div>
                    <span
                      className={`font-label-caps text-xs font-bold uppercase tracking-tight truncate text-left transition-all duration-300 ${
                        isInventarioActive ? "text-primary-container" : ""
                      } ${
                        isExpanded
                          ? "flex-1 opacity-100 translate-x-0"
                          : "flex-none opacity-0 -translate-x-4 pointer-events-none w-0"
                      }`}
                    >
                      Inventario
                    </span>
                    {isExpanded && (
                      <ChevronDown
                        size={14}
                        className={`text-primary/50 transition-transform duration-300 flex-shrink-0 ${
                          inventarioOpen ? "rotate-180" : ""
                        }`}
                      />
                    )}
                    {!isExpanded && (
                      <div className="fixed left-20 ml-2 px-3 py-1 bg-primary-container text-on-primary text-[10px] font-label-caps font-black uppercase tracking-widest rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100] shadow-lg shadow-background">
                        Inventario
                      </div>
                    )}
                  </button>

                  {inventarioOpen && isExpanded && (
                    <div className="mt-1 ml-5 flex flex-col border-l border-white/30 space-y-0.5 pl-2 animate-in slide-in-from-top-2 duration-300">
                      {item.subMenu.filter((sub) => canAccessPath(sub.path)).map((sub) => {
                        const isSubActive = location.pathname === sub.path;
                        return (
                          <Link
                            key={sub.path}
                            to={sub.path}
                            onClick={handleItemClick}
                            className={`group relative flex items-center rounded-default transition-all duration-300 px-2 py-1.5 font-label-caps text-[11px] font-bold uppercase tracking-tight ${
                              isSubActive
                                ? "bg-primary-container/10 text-primary"
                                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-hover"
                            }`}
                          >
                            <span
                              className={`absolute left-0 w-1 h-5 rounded-r-full bg-primary transition-all duration-300 ${
                                isSubActive
                                  ? "scale-y-100 opacity-100"
                                  : "scale-y-0 opacity-0 group-hover:scale-y-100 group-hover:opacity-50"
                              }`}
                            />
                            {sub.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const isActive = location.pathname === item.path;
            const isGoogleIcon = typeof item.icon === "string";
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={handleItemClick}
                className={`group relative flex items-center h-10 rounded-default transition-all duration-300 w-full ${
                  isExpanded ? "pl-3 pr-3 gap-3" : "justify-center px-0 gap-0"
                } ${
                  isActive
                    ? "text-primary font-medium"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-hover"
                }`}
              >
                <span
                  className={`absolute left-0 w-1 h-6 rounded-r-full bg-primary-container transition-all duration-300 ${
                    isActive
                      ? "scale-y-100 opacity-100"
                      : "scale-y-0 opacity-0 group-hover:scale-y-100 group-hover:opacity-50 group-hover:bg-primary"
                  }`}
                />

                <div
                  className={`flex items-center justify-center flex-shrink-0 w-5 h-5 transition-transform duration-300 ${
                    !isExpanded && "group-hover:scale-110"
                  } ${isActive ? "text-primary-container" : "group-hover:text-on-surface"}`}
                >
                  {isGoogleIcon ? (
                    <span className="material-symbols-outlined !text-[22px]">
                      {item.icon}
                    </span>
                  ) : (
                    <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                  )}
                </div>

                <span
                  className={`font-label-caps text-xs font-bold uppercase tracking-tight truncate transition-all duration-300 ${
                    isActive ? "text-primary-container" : ""
                  } ${
                    isExpanded
                      ? "flex-1 opacity-100 translate-x-0"
                      : "flex-none opacity-0 -translate-x-4 pointer-events-none w-0"
                  }`}
                >
                  {item.name}
                </span>

                {!isExpanded && (
                  <div className="fixed left-20 ml-2 px-3 py-1 bg-primary-container text-on-primary text-[10px] font-label-caps font-black uppercase tracking-widest rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100] shadow-lg shadow-background">
                    {item.name}
                  </div>
                )}
              </Link>
            );
          })}

          {visibleFinanzasSubMenu.length > 0 && (
          <div className="flex flex-col transition-all duration-300">
            <button
              onClick={handleToggleClickFinanzas}
              className={`group relative flex items-center h-10 rounded-default transition-all duration-300 w-full ${
                isExpanded ? "px-3 gap-3" : "justify-center px-0 gap-0"
              } ${
                isFinanzasActive
                  ? "text-primary"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-hover"
              }`}
            >
              <span
                className={`absolute left-0 w-1 h-6 rounded-r-full bg-primary-container transition-all duration-300 ${
                  isFinanzasActive
                    ? "scale-y-100 opacity-100"
                    : "scale-y-0 opacity-0 group-hover:scale-y-100 group-hover:opacity-50 group-hover:bg-primary"
                }`}
              />
              <div
                className={`flex items-center justify-center flex-shrink-0 w-5 h-5 transition-transform duration-300 ${
                  !isExpanded && "group-hover:scale-110"
                } ${
                  isFinanzasActive
                    ? "text-primary-container"
                    : "group-hover:text-on-surface"
                }`}
              >
                <CreditCard
                  size={20}
                  strokeWidth={isFinanzasActive ? 2.5 : 2}
                />
              </div>
              <span
                className={`font-label-caps text-xs font-bold uppercase tracking-tight truncate text-left transition-all duration-300 ${
                  isFinanzasActive ? "text-primary-container" : ""
                } ${
                  isExpanded
                    ? "flex-1 opacity-100 translate-x-0"
                    : "flex-none opacity-0 -translate-x-4 pointer-events-none w-0"
                }`}
              >
                Finanzas
              </span>
              {isExpanded && (
                <ChevronDown
                  size={14}
                  className={`text-primary/50 transition-transform duration-300 ${
                    finanzasOpen ? "rotate-180" : ""
                  }`}
                />
              )}
              {!isExpanded && (
                <div className="fixed left-20 ml-2 px-3 py-1 bg-primary-container text-on-primary text-[10px] font-label-caps font-black uppercase tracking-widest rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100] shadow-lg shadow-background">
                  Finanzas
                </div>
              )}
            </button>

            {finanzasOpen && isExpanded && (
              <div className="mt-1 ml-5 flex flex-col border-l border-white/30 space-y-0.5 pl-2 animate-in slide-in-from-top-2 duration-300">
                {visibleFinanzasSubMenu.map((sub) => {
                  const isSubActive = location.pathname === sub.path;
                  return (
                    <Link
                      key={sub.path}
                      to={sub.path}
                      onClick={handleItemClick}
                      className={`group relative flex items-center rounded-default transition-all duration-300 px-2 py-1.5 font-label-caps text-[11px] font-bold uppercase tracking-tight ${
                        isSubActive
                          ? "bg-primary-container/10 text-primary"
                          : "text-on-surface-variant hover:text-on-surface hover:bg-surface-hover"
                      }`}
                    >
                      <span
                        className={`absolute left-0 w-1 h-5 rounded-r-full bg-primary transition-all duration-300 ${
                          isSubActive
                            ? "scale-y-100 opacity-100"
                            : "scale-y-0 opacity-0 group-hover:scale-y-100 group-hover:opacity-50"
                        }`}
                      />
                      {sub.name}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
          )}

          {visibleConfigSubMenu.length > 0 && (
          <div className="flex flex-col transition-all duration-300">
            <button
              onClick={handleToggleClickConfig}
              className={`group relative flex items-center h-10 rounded-default transition-all duration-300 w-full ${
                isExpanded ? "px-3 gap-3" : "justify-center px-0 gap-0"
              } ${
                isConfigSectionActive
                  ? "text-primary"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-hover"
              }`}
            >
              <span
                className={`absolute left-0 w-1 h-6 rounded-r-full bg-primary-container transition-all duration-300 ${
                  isConfigSectionActive
                    ? "scale-y-100 opacity-100"
                    : "scale-y-0 opacity-0 group-hover:scale-y-100 group-hover:opacity-50 group-hover:bg-primary"
                }`}
              />
              <div
                className={`flex items-center justify-center flex-shrink-0 w-5 h-5 transition-transform duration-300 ${
                  !isExpanded && "group-hover:scale-110"
                } ${
                  isConfigSectionActive
                    ? "text-primary-container"
                    : "group-hover:text-on-surface"
                }`}
              >
                <Settings
                  size={20}
                  strokeWidth={isConfigSectionActive ? 2.5 : 2}
                />
              </div>
              <span
                className={`font-label-caps text-xs font-bold uppercase tracking-tight truncate text-left transition-all duration-300 ${
                  isConfigSectionActive ? "text-primary-container" : ""
                } ${
                  isExpanded
                    ? "flex-1 opacity-100 translate-x-0"
                    : "flex-none opacity-0 -translate-x-4 pointer-events-none w-0"
                }`}
              >
                Configuración
              </span>
              {isExpanded && (
                <ChevronDown
                  size={14}
                  className={`text-primary/50 transition-transform ${
                    configOpen ? "rotate-180" : ""
                  }`}
                />
              )}
              {!isExpanded && (
                <div className="fixed left-20 ml-2 px-3 py-1 bg-primary-container text-on-primary text-[10px] font-label-caps font-black uppercase tracking-widest rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100] shadow-lg shadow-background">
                  Configuración
                </div>
              )}
            </button>

            {configOpen && isExpanded && (
              <div className="mt-1 ml-5 flex flex-col border-l border-white/30 space-y-0.5 pl-2 animate-in slide-in-from-top-2 duration-300">
                {visibleConfigSubMenu.map((sub) => (
                  <Link
                    key={sub.path}
                    to={sub.path}
                    onClick={handleItemClick}
                    className={`rounded-default px-2 py-1.5 font-label-caps text-[11px] font-bold uppercase tracking-tight ${
                      location.pathname === sub.path
                        ? "bg-primary-container/10 text-primary"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-hover"
                    }`}
                  >
                    {sub.name}
                  </Link>
                ))}
              </div>
              )}
            </div>
          )}
        </nav>

        <div className="relative border-t border-white/10 p-3">
          <div className="relative">
            {canAccessPath("/pos/notificaciones") && (
            <div className={`mb-2 ${isExpanded ? "" : "flex justify-center"}`}>
              <button
                type="button"
                onClick={() => {
                  navigate("/pos/notificaciones");
                  if (isExpanded) toggleSidebar();
                }}
                aria-label={`Notificaciones${unreadNotificationCount ? `, ${unreadNotificationCount} sin leer` : ""}`}
                className={`relative flex h-10 w-full items-center rounded-default transition-colors hover:bg-surface-hover ${isExpanded ? "gap-3 px-3" : "w-10 justify-center"}`}
              >
                <span className="relative flex h-5 w-5 shrink-0 items-center justify-center text-on-surface-variant">
                  <Bell size={19} />
                  {unreadNotificationCount > 0 && (
                    <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[9px] font-black text-white">
                      {unreadNotificationCount > 9
                        ? "9+"
                        : unreadNotificationCount}
                    </span>
                  )}
                </span>
                {isExpanded && (
                  <span className="truncate text-left font-label-caps text-xs font-bold uppercase tracking-tight text-on-surface-variant">
                    Notificaciones
                  </span>
                )}
              </button>
            </div>
            )}

            <div className={`mb-2 ${isExpanded ? "" : "flex justify-center"}`}>
              <button
                type="button"
                onClick={handleColorModeToggle}
                disabled={!colorModeReady || savingColorMode || !user?.id}
                aria-label={
                  colorMode === "dark"
                    ? "Cambiar a modo claro"
                    : "Cambiar a modo oscuro"
                }
                title={
                  colorMode === "dark"
                    ? "Cambiar a modo claro"
                    : "Cambiar a modo oscuro"
                }
                className={`relative flex h-10 w-full items-center rounded-default transition-colors hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60 ${isExpanded ? "gap-3 px-3" : "w-10 justify-center"}`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center text-on-surface-variant">
                  {colorMode === "dark" ? <Sun size={19} /> : <Moon size={19} />}
                </span>
                {isExpanded && (
                  <span className="truncate text-left font-label-caps text-xs font-bold uppercase tracking-tight text-on-surface-variant">
                    Apariencia: {colorMode === "dark" ? "Oscuro" : "Claro"}
                  </span>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!isExpanded) toggleSidebar();
                setUserMenuOpen((prev) => !prev);
              }}
              aria-expanded={isExpanded && userMenuOpen}
              className={`flex items-center rounded-default p-2 w-full overflow-hidden transition-all duration-300 ${
                isExpanded ? "gap-3 justify-start" : "justify-center"
              } ${
                isExpanded && userMenuOpen
                  ? accountPlanStyles.active
                  : accountPlanStyles.button
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${accountPlanStyles.icon}`}
              >
                <span className="material-symbols-outlined text-[14px] font-variation-fill">
                  shield_person
                </span>
              </div>

              <div
                className={`min-w-0 transition-all duration-300 ${
                  isExpanded
                    ? "flex-1 text-center opacity-100 translate-x-0"
                    : "flex-none opacity-0 -translate-x-2 pointer-events-none w-0"
                }`}
              >
                <div className="flex min-w-0 items-center justify-center gap-1.5">
                  <p className="min-w-0 truncate text-on-surface font-body-sm text-[11px] font-black tracking-tight">
                    {businessName}
                  </p>
                  {(!isEmployee || permissions.finanzas === true) && (
                    <span
                      className={`${accountPlanStyles.accent} shrink-0 font-label-caps text-[9px] uppercase font-black tracking-[0.1em]`}
                    >
                      {planName}
                    </span>
                  )}
                </div>
                {ticketUsage &&
                  (!isEmployee || permissions.finanzas === true) && (
                  <p
                    className={`mt-0.5 truncate text-center text-[9px] ${accountPlanStyles.details}`}
                  >
                    {ticketUsage.limit == null
                      ? `${ticketUsage.used.toLocaleString("es-CO")} tickets · sin límite`
                      : `${ticketUsage.used.toLocaleString("es-CO")} / ${ticketUsage.limit.toLocaleString("es-CO")} tickets`}
                  </p>
                )}
              </div>

              {isExpanded && (
                <ChevronDown
                  size={14}
                  className={`${accountPlanStyles.accent} opacity-60 transition-transform duration-300 flex-shrink-0 ${
                    userMenuOpen ? "rotate-180" : ""
                  }`}
                />
              )}
            </button>

            {isExpanded && userMenuOpen && (
              <div className="mt-1 ml-5 flex flex-col border-l border-white/30 space-y-0.5 pl-2">
                <button
                  type="button"
                  onClick={handleLogoutClick}
                  className="group relative flex w-full items-center gap-2 rounded-default px-2 py-1.5 text-left font-label-caps text-[11px] font-bold uppercase tracking-tight text-error transition-colors hover:bg-error/10"
                >
                  <span className="absolute left-0 h-5 w-1 scale-y-0 rounded-r-full bg-error opacity-0 transition-all duration-300 group-hover:scale-y-100 group-hover:opacity-50" />
                  <LogOut size={14} />
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-dialog-title"
            className="w-full max-w-lg rounded-xl border border-white/10 bg-background p-6 shadow-2xl sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-error/10 text-error">
              <LogOut size={22} />
            </div>
            <h2
              id="logout-dialog-title"
              className="text-xl font-black text-white sm:text-2xl"
            >
              ¿Seguro que quieres cerrar sesión?
            </h2>
            <p className="mt-2 text-sm text-neutral-400">
              Tendrás que volver a iniciar sesión para continuar.
            </p>
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="rounded-lg border border-white/10 px-4 py-3 text-sm font-bold text-neutral-200 transition hover:bg-white/[0.06]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center justify-center gap-2 rounded-lg bg-error px-4 py-3 text-sm font-black text-white transition hover:opacity-90"
              >
                <LogOut size={16} /> Sí, cerrar sesión
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
};

export default Sidebar;
