import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import logoPng from "../../public/logo.png";
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
import { useNavigate } from "react-router-dom";

const Sidebar = ({ isExpanded, toggleSidebar }) => {
  const location = useLocation();
  const [cajaOpen, setCajaOpen] = useState(false);
  const [catalogoOpen, setCatalogoOpen] = useState(false);
  const [inventarioOpen, setInventarioOpen] = useState(false);

  // Cerrar submenús si se colapsa el sidebar de manera manual o automática
  useEffect(() => {
    if (!isExpanded) {
      setCajaOpen(false);
      setCatalogoOpen(false);
      setInventarioOpen(false);
    }
  }, [isExpanded]);

  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login"); // O "/login-superadmin" si lo prefieres
  };

  const menuItems = [
    { name: "POS", path: "/pos", icon: Plus },
    { name: "Mesas", path: "/pos/mesas", icon: "table_bar" },
    {
      name: "Cocina",
      path: "/pos/cocina",
      icon: ChefHat,
    },
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

  const isCajaActive = location.pathname.startsWith("/pos/caja");
  const isInventarioActive = location.pathname.startsWith("/pos/inventario");
  const isCatalogoActive =
    location.pathname === "/pos/productos" ||
    location.pathname === "/pos/categorias";
  const isConfigActive = location.pathname === "/pos/configuracion";

  // Auto-abrir submenús si la ruta actual pertenece a sus hijos
  useEffect(() => {
    if (isCatalogoActive) setCatalogoOpen(true);
  }, [isCatalogoActive]);

  useEffect(() => {
    if (isCajaActive) setCajaOpen(true);
  }, [isCajaActive]);

  useEffect(() => {
    if (isInventarioActive) setInventarioOpen(true);
  }, [isInventarioActive]);

  // --- FUNCIÓN PARA AUTO-CERRAR/REDUCIR EL SIDEBAR ---
  const handleItemClick = () => {
    if (isExpanded) {
      toggleSidebar();
    }
  };

  const handleToggleClickCaja = (e) => {
    e.preventDefault();
    if (!isExpanded) {
      toggleSidebar();
    }
    setCajaOpen(!cajaOpen);
  };

  const handleToggleClickCatalogo = (e) => {
    e.preventDefault();
    if (!isExpanded) {
      toggleSidebar();
    }
    setCatalogoOpen(!catalogoOpen);
  };

  const handleToggleClickInventario = (e) => {
    e.preventDefault();
    if (!isExpanded) toggleSidebar();
    setInventarioOpen(!inventarioOpen);
  };

  return (
    <>
      {/* Overlay con efecto blur */}
      <div
        className={`fixed inset-0 z-50 transition-all duration-500 ${
          isExpanded
            ? "bg-background/40 backdrop-blur-sm opacity-100 pointer-events-auto"
            : "bg-background/0 backdrop-blur-0 opacity-0 pointer-events-none"
        }`}
        onClick={toggleSidebar}
      />

      {/* Sidebar contenedor principal */}
      <aside
        className={`flex flex-col fixed border-r border-primary/30 left-0 top-0 h-full bg-background z-50 transition-all duration-500 ease-in-out ${
          isExpanded ? "w-64" : "w-20"
        }`}
      >
        {/* Header con el Logo */}
        <div className="h-10 flex items-center px-5 pt-10 shrink-0">
          <div className="relative z-50 bg-background flex items-center justify-between w-full pb-2">
            <div className="flex items-center gap-3">
              <button
                onClick={!isExpanded ? toggleSidebar : undefined}
                disabled={isExpanded}
                className={`w-8 h-8 rounded-default bg-primary-container flex items-center justify-center font-h1 font-black text-on-primary  flex-shrink-0 relative ${
                  !isExpanded
                    ? "hover:scale-105 active:scale-95 transition-transform cursor-pointer"
                    : "cursor-default"
                }`}
              >
                <img src={logoPng} alt="Logo" className="w-6 h-6" />
              </button>

              <span
                className={`text-on-surface font-h2 font-bold tracking-tight text-lg whitespace-nowrap transition-all duration-300 ${
                  isExpanded
                    ? "opacity-100 translate-x-0"
                    : "opacity-0 -translate-x-4 pointer-events-none w-0 overflow-hidden"
                }`}
              >
                Gloto
              </span>
            </div>

            {/* Botón X para cerrar */}
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

        {/* Cuerpo de Navegación */}
        <nav className="flex-1 px-3 pt-12 space-y-1 overflow-y-auto overflow-x-hidden custom-sidebar scrollbar-gutter-stable">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            const isGoogleIcon = typeof item.icon === "string";
            const Icon = item.icon;

            return (
              <React.Fragment key={item.path}>
                {item.name !== "Caja" &&
                  item.name !== "Catálogo" &&
                  item.name !== "Inventario" && (
                    <Link
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
                  )}

                {item.name === "Caja" && (
                  <div className="flex flex-col transition-all duration-300">
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
                )}

                {item.name === "Catálogo" && (
                  <div className="flex flex-col transition-all duration-300">
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
                )}

                {/* Bloque expandible de Caja */}
                {item.name === "Inventario" && (
                  <div className="flex flex-col transition-all duration-300">
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

                    {/* Submenu de Caja */}
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
                )}
              </React.Fragment>
            );
          })}

          {/* Enlace Directo Único de Configuración */}
          <Link
            to="/pos/configuracion"
            onClick={handleItemClick}
            className={`group relative flex items-center h-12 rounded-default transition-all duration-300 pl-4 pr-3.75 gap-4 w-full ${
              isConfigActive
                ? "text-primary font-medium"
                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-hover"
            }`}
          >
            <span
              className={`absolute left-0 w-1 h-6 rounded-r-full bg-primary-container transition-all duration-300 ${
                isConfigActive
                  ? "scale-y-100 opacity-100"
                  : "scale-y-0 opacity-0 group-hover:scale-y-100 group-hover:opacity-50 group-hover:bg-primary"
              }`}
            />

            <div
              className={`flex items-center justify-center flex-shrink-0 w-5 h-5 transition-transform duration-300 ${
                !isExpanded && "group-hover:scale-110"
              } ${isConfigActive ? "text-primary-container" : "group-hover:text-on-surface"}`}
            >
              <Settings size={20} strokeWidth={isConfigActive ? 2.5 : 2} />
            </div>

            <span
              className={`font-label-caps text-xs font-bold uppercase tracking-tight truncate flex-1 transition-all duration-300 ${
                isConfigActive ? "text-primary-container" : ""
              } ${
                isExpanded
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 -translate-x-4 pointer-events-none w-0"
              }`}
            >
              Configuración
            </span>

            {!isExpanded && (
              <div className="fixed left-20 ml-2 px-3 py-1 bg-primary-container text-on-primary text-[10px] font-label-caps font-black uppercase tracking-widest rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100] shadow-lg shadow-background">
                Configuración
              </div>
            )}
          </Link>
        </nav>

        {/* Footer Profile */}
        <div className="p-4">
          <div className="flex items-center rounded-default p-2 gap-3 w-full justify-start overflow-hidden">
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
          </div>
          <button
            onClick={handleLogout}
            className={`flex items-center gap-3 p-2 rounded-default hover:bg-error/10 text-on-surface-variant hover:text-error transition-all duration-300 ${
              !isExpanded ? "justify-center" : "justify-start px-3"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              logout
            </span>
            {isExpanded && (
              <span className="font-label-caps text-[10px] font-black uppercase tracking-widest">
                Salir
              </span>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
