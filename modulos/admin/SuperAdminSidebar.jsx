import React, { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Crown,
  LayoutDashboard,
  Megaphone,
  Menu,
  Plus,
  Settings,
  Store,
  Tag,
  WalletCards,
} from "lucide-react";

const SuperAdminSidebar = ({ activeSection, onNavigate }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [storesOpen, setStoresOpen] = useState(true);
  const [marketplaceOpen, setMarketplaceOpen] = useState(true);
  const [financeOpen, setFinanceOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const sections = [{ label: "Resumen", icon: LayoutDashboard, id: "resumen" }];

  const handleNavigate = (id) => {
    onNavigate(id);
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const renderLink = (label, id, Icon = null) => {
    const active = activeSection === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => handleNavigate(id)}
        className={`group relative flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[11px] font-bold uppercase tracking-tight transition-all ${
          active
            ? "bg-violet-500/15 text-violet-300"
            : "text-neutral-400 hover:bg-white/[0.05] hover:text-white"
        }`}
      >
        <span
          className={`absolute left-0 h-5 w-0.5 rounded-r-full bg-violet-400 transition-opacity ${
            active ? "opacity-100" : "opacity-0"
          }`}
        />
        {Icon ? (
          <Icon size={16} strokeWidth={active ? 2.5 : 2} />
        ) : (
          <span className="ml-1 h-1.5 w-1.5 rounded-full bg-current" />
        )}
        <span className={isExpanded ? "truncate" : "sr-only"}>{label}</span>
      </button>
    );
  };

  const renderGroup = (label, Icon, open, setOpen, children) => (
    <div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="group flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-xs font-black uppercase tracking-tight text-neutral-300 transition hover:bg-white/[0.05] hover:text-white"
      >
        <Icon size={18} className="text-violet-300" />
        <span className={isExpanded ? "flex-1 truncate" : "sr-only"}>
          {label}
        </span>
        {isExpanded && (
          <ChevronDown
            size={14}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {open && isExpanded && (
        <div className="ml-3 border-l border-violet-400/20 pl-3">
          {children}
        </div>
      )}
    </div>
  );

  return (
    <aside
      className={`${
        isExpanded ? "w-64" : "w-20"
      } fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-violet-400/20 bg-neutral-950 transition-all duration-300`}
    >
      <div className="flex h-20 items-center justify-between border-b border-white/[0.06] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
            <Crown size={19} />
          </div>
          <div className={isExpanded ? "min-w-0" : "sr-only"}>
            <p className="truncate text-sm font-black text-white">Gloto</p>
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-violet-300">
              Master Admin
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
          className="rounded-lg p-2 text-neutral-400 transition hover:bg-white/[0.06] hover:text-white"
          aria-label={isExpanded ? "Contraer menu" : "Expandir menu"}
        >
          <Menu size={17} />
        </button>
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-5">
        {sections.map((section) =>
          renderLink(section.label, section.id, section.icon),
        )}
        {renderGroup(
          "Tiendas",
          Store,
          storesOpen,
          setStoresOpen,
          <>
            {renderLink("Todas las tiendas", "tiendas", Store)}
            {renderLink("Crear tienda", "crear-tienda", Plus)}
          </>,
        )}
        {renderGroup(
          "Marketplace",
          Megaphone,
          marketplaceOpen,
          setMarketplaceOpen,
          <>
            {renderLink("Categorias maestras", "categorias-maestras", Tag)}
            {renderLink("Promociones", "promociones-pendientes", Megaphone)}
          </>,
        )}
        {renderGroup(
          "Finanzas",
          WalletCards,
          financeOpen,
          setFinanceOpen,
          <>
            {renderLink("Planes", "planes", CreditCard)}
            {renderLink(
              "Pagos de promociones",
              "promociones-pendientes",
              WalletCards,
            )}
            {renderLink(
              "Pagos de suscripciones",
              "pagos-suscripciones",
              WalletCards,
            )}
          </>,
        )}
        {renderGroup(
          "Sistema",
          Settings,
          settingsOpen,
          setSettingsOpen,
          <>{renderLink("Estado de sesion", "resumen", CheckCircle2)}</>,
        )}
      </nav>
    </aside>
  );
};

export default SuperAdminSidebar;
