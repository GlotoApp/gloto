import React, { useEffect, useRef, useState } from "react";
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
  X,
  ClipboardList,
  CalendarDays,
  Clock3,
  PencilRuler,
  CreditCard,
  Banknote,
  Bell,
  LogOut,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";

const Sidebar = ({ isExpanded, toggleSidebar, onMouseEnter, onMouseLeave }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const navRef = useRef(null);

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
  const isOrdersActive = location.pathname.startsWith("/pos/ordenes");

  useEffect(() => {
    if (!isExpanded) setUserMenuOpen(false);
  }, [isExpanded]);

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
    { name: "Órdenes activas", path: "/pos/ordenes" },
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
  ];

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
    const loadBusinessBrand = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (!profile?.business_id) return;

      const [{ data: business }, { data: subscription }] = await Promise.all([
        supabase
          .from("businesses")
          .select("name, logo_url")
          .eq("id", profile.business_id)
          .maybeSingle(),
        supabase
          .from("subscriptions")
          .select("plan_name")
          .eq("business_id", profile.business_id)
          .in("status", ["active", "suspended", "expired"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (business?.name) setBusinessName(business.name);
      if (business?.logo_url) setBusinessLogo(business.logo_url);
      if (subscription?.plan_name) setPlanName(subscription.plan_name);
    };

    loadBusinessBrand();
  }, []);

  useEffect(() => {
    let isMounted = true;
    let channel;
    let refreshTimeout;

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
  }, []);

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
        className={`fixed inset-0 z-50 transition-all duration-500 ${
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
        <div className="h-10 flex items-center px-5 pt-10 shrink-0">
          <div
            className={`relative z-50 bg-background flex items-center w-full pb-2 ${
              isExpanded
                ? "justify-between border-b border-primary/10"
                : "justify-center"
            }`}
          >
            <div
              className={`flex items-center min-w-0 ${
                isExpanded ? "flex-1 gap-3" : "justify-center"
              }`}
            >
              <button
                onClick={!isExpanded ? toggleSidebar : undefined}
                disabled={isExpanded}
                className={`w-8 h-8 rounded-lg bg-transparent flex items-center justify-center font-h1 font-black text-on-primary flex-shrink-0 relative p-0 ${
                  !isExpanded
                    ? "hover:scale-105 active:scale-95 transition-transform cursor-pointer"
                    : "cursor-default"
                }`}
              >
                <img
                  src={businessLogo || logoPng}
                  alt={businessName || "Gloto"}
                  className="w-7 h-7 object-contain rounded-md"
                  onError={(event) => {
                    event.currentTarget.src = logoPng;
                  }}
                />
              </button>

              <span
                title={businessName || "Gloto"}
                className={`min-w-0 text-on-surface font-h2 font-bold tracking-tight text-lg whitespace-nowrap transition-all duration-300 ${
                  isExpanded
                    ? "flex-1 truncate opacity-100 translate-x-0"
                    : "flex-none w-0 opacity-0 -translate-x-4 pointer-events-none overflow-hidden"
                }`}
              >
                {businessName || "Gloto"}
              </span>
            </div>

            {isExpanded && (
              <button
                onClick={toggleSidebar}
                className="shrink-0 p-2 rounded-default hover:bg-surface-hover text-on-surface-variant hover:text-primary transition-all animate-in fade-in zoom-in-95 duration-200"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        <nav
          ref={navRef}
          className="flex-1 px-3 pt-6 pb-20 space-y-0.5 overflow-y-auto overflow-x-hidden custom-sidebar scrollbar-gutter-stable"
          style={{ scrollbarGutter: isExpanded ? "stable" : "auto" }}
        >
          {menuItems.map((item) => {
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
                      {cajaSubMenu.map((sub) => {
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
                        ? "text-primary"
                        : "text-on-surface-variant hover:bg-surface-hover hover:text-on-surface"
                    }`}
                  >
                    <span
                      className={`absolute left-0 h-6 w-1 rounded-r-full bg-primary-container transition-all duration-300 ${
                        isOrdersActive
                          ? "scale-y-100 opacity-100"
                          : "scale-y-0 opacity-0 group-hover:scale-y-100 group-hover:opacity-50"
                      }`}
                    />
                    <div className={`flex h-5 w-5 flex-shrink-0 items-center justify-center ${isOrdersActive ? "text-primary-container" : ""}`}>
                      <ClipboardList size={20} strokeWidth={isOrdersActive ? 2.5 : 2} />
                    </div>
                    <span
                      className={`truncate text-left text-xs font-bold uppercase tracking-tight transition-all ${
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
                      <div className="fixed left-20 ml-2 rounded bg-primary-container px-3 py-1 text-[10px] font-black uppercase tracking-widest text-on-primary opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                        Órdenes
                      </div>
                    )}
                  </button>
                  {ordersOpen && isExpanded && (
                    <div className="ml-5 mt-1 flex flex-col space-y-0.5 border-l border-white/30 pl-2">
                      {ordersSubMenu.map((sub) => {
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
                      {catalogoSubMenu.map((sub) => {
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
                      {item.subMenu.map((sub) => {
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
                {finanzasSubMenu.map((sub) => {
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
                {configSubMenu.map((sub) => (
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
        </nav>

        <div className="relative border-t border-white/10 p-3">
          <div className="relative">
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
                  ? "bg-surface-hover"
                  : "hover:bg-surface-hover"
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-surface-hover border border-outline flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[14px] text-primary font-variation-fill">
                  shield_person
                </span>
              </div>

              <div
                className={`min-w-0 transition-all duration-300 ${
                  isExpanded
                    ? "flex-1 opacity-100 translate-x-0"
                    : "flex-none opacity-0 -translate-x-2 pointer-events-none w-0"
                }`}
              >
                <p className="text-on-surface font-body-sm text-[11px] font-black uppercase tracking-tighter truncate">
                  Mi cuenta
                </p>
                <p className="text-primary font-label-caps text-[9px] uppercase font-black tracking-[0.1em]">
                  {planName}
                </p>
              </div>

              {isExpanded && (
                <ChevronDown
                  size={14}
                  className={`text-primary/50 transition-transform duration-300 flex-shrink-0 ${
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
