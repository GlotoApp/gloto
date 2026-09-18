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
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";

const Sidebar = ({ isExpanded, toggleSidebar }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const navRef = useRef(null);
  const cajaSectionRef = useRef(null);
  const catalogoSectionRef = useRef(null);
  const inventarioSectionRef = useRef(null);
  const configSectionRef = useRef(null);

  const [cajaOpen, setCajaOpen] = useState(false);
  const [catalogoOpen, setCatalogoOpen] = useState(false);
  const [inventarioOpen, setInventarioOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [businessName, setBusinessName] = useState("Gloto");
  const [businessLogo, setBusinessLogo] = useState(logoPng);

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
    { name: "Planes", path: "/pos/planes", icon: CreditCard },
  ];

  const cajaSubMenu = [
    { name: "Cierre de Caja", path: "/pos/caja" },
    { name: "Cierres Eliminados", path: "/pos/caja/CierresEliminados" },
  ];

  const catalogoSubMenu = [
    { name: "Categorías", path: "/pos/categorias" },
    { name: "Productos", path: "/pos/productos" },
  ];

  const configSubMenu = [
    { name: "Tienda", path: "/pos/configuracion/tienda" },
    { name: "Datos", path: "/pos/configuracion/datos" },
    { name: "Notificaciones", path: "/pos/configuracion/notificaciones" },
  ];

  useEffect(() => {
    if (!isExpanded) {
      setCajaOpen(false);
      setCatalogoOpen(false);
      setInventarioOpen(false);
      setConfigOpen(false);
    }
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
    if (isConfigSectionActive) setConfigOpen(true);
  }, [isConfigSectionActive]);

  useEffect(() => {
    if (isExpanded && cajaOpen) {
      cajaSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [cajaOpen, isExpanded]);

  useEffect(() => {
    if (isExpanded && catalogoOpen) {
      catalogoSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [catalogoOpen, isExpanded]);

  useEffect(() => {
    if (isExpanded && inventarioOpen) {
      inventarioSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [inventarioOpen, isExpanded]);

  useEffect(() => {
    if (isExpanded && configOpen) {
      configSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [configOpen, isExpanded]);

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

      const { data: business } = await supabase
        .from("businesses")
        .select("name, logo_url")
        .eq("id", profile.business_id)
        .maybeSingle();

      if (business?.name) setBusinessName(business.name);
      if (business?.logo_url) setBusinessLogo(business.logo_url);
    };

    loadBusinessBrand();
  }, []);

  const handleLogout = async () => {
    setShowLogoutConfirm(false);
    setUserMenuOpen(false);
    await supabase.auth.signOut();
    navigate("/login");
  };

  const handleOpenConfig = () => {
    setUserMenuOpen(false);
    navigate("/pos/configuracion/tienda");
  };

  const handleLogoutClick = () => {
    setUserMenuOpen(false);
    setShowLogoutConfirm(true);
  };

  const handleItemClick = () => {
    if (isExpanded) toggleSidebar();
  };

  const handleToggleClickCaja = (e) => {
    e.preventDefault();
    if (!isExpanded) toggleSidebar();
    setCajaOpen((prev) => !prev);
  };

  const handleToggleClickCatalogo = (e) => {
    e.preventDefault();
    if (!isExpanded) toggleSidebar();
    setCatalogoOpen((prev) => !prev);
  };

  const handleToggleClickInventario = (e) => {
    e.preventDefault();
    if (!isExpanded) toggleSidebar();
    setInventarioOpen((prev) => !prev);
  };

  const handleToggleClickConfig = (e) => {
    e.preventDefault();
    if (!isExpanded) toggleSidebar();
    setConfigOpen((prev) => !prev);
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
              className={`flex items-center ${isExpanded ? "gap-3" : "justify-center"}`}
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
                className={`text-on-surface font-h2 font-bold tracking-tight text-lg whitespace-nowrap transition-all duration-300 ${
                  isExpanded
                    ? "opacity-100 translate-x-0"
                    : "opacity-0 -translate-x-4 pointer-events-none w-0 overflow-hidden"
                }`}
              >
                {businessName || "Gloto"}
              </span>
            </div>

            {isExpanded && (
              <button
                onClick={toggleSidebar}
                className="p-2 rounded-default hover:bg-surface-hover text-on-surface-variant hover:text-primary transition-all animate-in fade-in zoom-in-95 duration-200"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        <nav
          ref={navRef}
          className="flex-1 px-3 pt-12 space-y-1 overflow-y-auto overflow-x-hidden custom-sidebar scrollbar-gutter-stable"
        >
          {menuItems.map((item) => {
            if (item.name === "Caja") {
              return (
                <div
                  key={item.path}
                  ref={cajaSectionRef}
                  className="flex flex-col transition-all duration-300"
                >
                  <button
                    onClick={handleToggleClickCaja}
                    className={`group relative flex items-center h-12 rounded-default transition-all duration-300 px-4 gap-4 w-full ${
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
                      className={`font-label-caps text-xs font-bold uppercase tracking-tight flex-1 truncate text-left transition-all duration-300 ${
                        isCajaActive ? "text-primary-container" : ""
                      } ${
                        isExpanded
                          ? "opacity-100 translate-x-0"
                          : "opacity-0 -translate-x-4 pointer-events-none w-0"
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
                    <div className="mt-2 ml-4 flex flex-col border-l border-primary-container/30 space-y-1 pl-3 animate-in slide-in-from-top-2 duration-300">
                      {cajaSubMenu.map((sub) => {
                        const isSubActive = location.pathname === sub.path;
                        return (
                          <Link
                            key={sub.path}
                            to={sub.path}
                            onClick={handleItemClick}
                            className={`group relative flex items-center rounded-default transition-all duration-300 px-3 py-2 font-label-caps text-[11px] font-bold uppercase tracking-tight ${
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

            if (item.name === "Catálogo") {
              return (
                <div
                  key={item.path}
                  ref={catalogoSectionRef}
                  className="flex flex-col transition-all duration-300"
                >
                  <button
                    onClick={handleToggleClickCatalogo}
                    className={`group relative flex items-center h-12 rounded-default transition-all duration-300 px-4 gap-4 w-full ${
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
                      className={`font-label-caps text-xs font-bold uppercase tracking-tight flex-1 truncate text-left transition-all duration-300 ${
                        isCatalogoActive ? "text-primary-container" : ""
                      } ${
                        isExpanded
                          ? "opacity-100 translate-x-0"
                          : "opacity-0 -translate-x-4 pointer-events-none w-0"
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
                    <div className="mt-2 ml-4 flex flex-col border-l border-primary-container/30 space-y-1 pl-3 animate-in slide-in-from-top-2 duration-300">
                      {catalogoSubMenu.map((sub) => {
                        const isSubActive = location.pathname === sub.path;
                        return (
                          <Link
                            key={sub.path}
                            to={sub.path}
                            onClick={handleItemClick}
                            className={`group relative flex items-center rounded-default transition-all duration-300 px-3 py-2 font-label-caps text-[11px] font-bold uppercase tracking-tight ${
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
                  ref={inventarioSectionRef}
                  className="flex flex-col transition-all duration-300"
                >
                  <button
                    onClick={handleToggleClickInventario}
                    className={`group relative flex items-center h-12 rounded-default transition-all duration-300 px-4 gap-4 w-full ${
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
                      className={`font-label-caps text-xs font-bold uppercase tracking-tight flex-1 truncate text-left transition-all duration-300 ${
                        isInventarioActive ? "text-primary-container" : ""
                      } ${
                        isExpanded
                          ? "opacity-100 translate-x-0"
                          : "opacity-0 -translate-x-4 pointer-events-none w-0"
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
                    <div className="mt-2 ml-4 flex flex-col border-l border-primary-container/30 space-y-1 pl-3 animate-in slide-in-from-top-2 duration-300">
                      {item.subMenu.map((sub) => {
                        const isSubActive = location.pathname === sub.path;
                        return (
                          <Link
                            key={sub.path}
                            to={sub.path}
                            onClick={handleItemClick}
                            className={`group relative flex items-center rounded-default transition-all duration-300 px-3 py-2 font-label-caps text-[11px] font-bold uppercase tracking-tight ${
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
                className={`group relative flex items-center h-12 rounded-default transition-all duration-300 pl-4 pr-3.75 gap-4 w-full ${
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
                  className={`font-label-caps text-xs font-bold uppercase tracking-tight truncate flex-1 transition-all duration-300 ${
                    isActive ? "text-primary-container" : ""
                  } ${
                    isExpanded
                      ? "opacity-100 translate-x-0"
                      : "opacity-0 -translate-x-4 pointer-events-none w-0"
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

          <div
            ref={configSectionRef}
            className="flex flex-col transition-all duration-300"
          >
            <button
              onClick={handleToggleClickConfig}
              className={`group relative flex items-center h-12 rounded-default transition-all duration-300 px-4 gap-4 w-full ${
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
                className={`font-label-caps text-xs font-bold uppercase tracking-tight truncate flex-1 text-left transition-all duration-300 ${
                  isConfigSectionActive ? "text-primary-container" : ""
                } ${
                  isExpanded
                    ? "opacity-100 translate-x-0"
                    : "opacity-0 -translate-x-4 pointer-events-none w-0"
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
              <div className="mt-2 ml-4 flex flex-col border-l border-primary-container/30 space-y-1 pl-3 animate-in slide-in-from-top-2 duration-300">
                {configSubMenu.map((sub) => (
                  <Link
                    key={sub.path}
                    to={sub.path}
                    onClick={handleItemClick}
                    className={`rounded-default px-3 py-2 font-label-caps text-[11px] font-bold uppercase tracking-tight ${
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

        <div className="p-4 relative">
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((prev) => !prev)}
              className={`flex items-center rounded-default p-2 gap-3 w-full justify-start overflow-hidden transition-all duration-300 ${
                userMenuOpen ? "bg-surface-hover" : "hover:bg-surface-hover"
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-surface-hover border border-outline flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[14px] text-primary font-variation-fill">
                  shield_person
                </span>
              </div>

              <div
                className={`flex-1 min-w-0 transition-all duration-300 ${
                  isExpanded
                    ? "opacity-100 translate-x-0"
                    : "opacity-0 -translate-x-2 pointer-events-none w-0"
                }`}
              >
                <p className="text-on-surface font-body-sm text-[11px] font-black uppercase tracking-tighter truncate">
                  Admin Local
                </p>
                <p className="text-primary font-label-caps text-[9px] uppercase font-black tracking-[0.1em]">
                  Premium
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

            {userMenuOpen && (
              <div
                className={`absolute ${
                  isExpanded
                    ? "bottom-full left-0 right-0 mb-2"
                    : "left-full top-1 -translate-y-1/2 ml-3 w-48"
                } rounded-default border border-primary/20 bg-background shadow-lg shadow-background/60 overflow-hidden z-[60]`}
              >
                <button
                  type="button"
                  onClick={handleOpenConfig}
                  className="w-full text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:bg-surface-hover transition-colors"
                >
                  Configuración
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/pos/configuracion/tienda")}
                  className="w-full text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:bg-surface-hover transition-colors"
                >
                  Perfil
                </button>
                <button
                  type="button"
                  onClick={handleLogoutClick}
                  className="w-full text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest text-error hover:bg-error/10 transition-colors"
                >
                  Cerrar sesión
                </button>
              </div>
            )}

            {showLogoutConfirm && (
              <div
                className={`absolute ${
                  isExpanded
                    ? "bottom-full left-0 right-0 mb-2"
                    : "left-full top-1/2 -translate-y-1/2 ml-3 w-52"
                } z-[70] rounded-default border border-error/30 bg-background shadow-2xl shadow-background/70 p-3`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface mb-2">
                  ¿Seguro que quieres cerrar sesión?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(false)}
                    className="flex-1 px-2 py-2 rounded-default text-[9px] font-black uppercase tracking-widest text-on-surface-variant hover:bg-surface-hover transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex-1 px-2 py-2 rounded-default bg-error text-on-surface text-[9px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity"
                  >
                    Sí, salir
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
