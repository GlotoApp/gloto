import {
  Bike,
  CircleDollarSign,
  ClipboardList,
  Globe2,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Store,
  UserRound,
  Wallet,
  X,
} from "lucide-react";

const sections = [
  { id: "orders", label: "Pedidos", icon: ClipboardList },
  { id: "history", label: "Historial", icon: History },
  { id: "wallet", label: "Mi saldo", icon: Wallet, publicOnly: true },
  { id: "profile", label: "Mi perfil", icon: UserRound },
];

const PortalDomiciliarioSidebar = ({
  isOpen,
  onToggle,
  onClose,
  section,
  onSectionChange,
  mode,
  onModeChange,
  canUsePrivate,
  canUsePublic,
  isPublicApproved,
  privateOnline,
  publicOnline,
  privateBusinessName,
  privateEnabled,
  publicEnabled,
  availabilityBusy,
  onToggleAvailability,
  balance,
  displayName,
  onSignOut,
  compact = false,
}) => (
  <>
    <header
      className={
        compact
          ? "pointer-events-none fixed inset-x-0 top-0 z-30"
          : "sticky top-0 z-30 border-b border-white/[0.07] bg-neutral-950/90 backdrop-blur-xl"
      }
    >
      <div
        className={`mx-auto flex items-center justify-between gap-4 ${
          compact
            ? "max-w-none px-3 py-3 sm:px-6"
            : "max-w-7xl px-4 py-3 sm:px-6"
        }`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onToggle}
            aria-label={isOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={isOpen}
            className={`pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-neutral-950/80 text-neutral-100 shadow-lg backdrop-blur-xl transition hover:bg-neutral-900 ${
              compact ? "" : "rounded-xl bg-transparent shadow-none"
            }`}
          >
            {isOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
          {!compact && (
            <>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
                <Bike size={22} />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">
                  Portal de domiciliarios
                </p>
                <p className="truncate text-sm font-bold text-white">
                  Hola, {displayName}
                </p>
              </div>
            </>
          )}
        </div>
        {isPublicApproved && (
          <div className="pointer-events-auto flex shrink-0 items-center gap-2 rounded-xl border border-emerald-400/20 bg-neutral-950/85 px-3 py-2 text-emerald-200 shadow-lg backdrop-blur-xl">
            <CircleDollarSign size={17} />
            <div>
              <p className="hidden text-[9px] font-bold uppercase tracking-wider text-emerald-200/70 sm:block">
                Saldo disponible
              </p>
              <p className="text-xs font-black sm:text-sm">
                {new Intl.NumberFormat("es-CO", {
                  style: "currency",
                  currency: "COP",
                  maximumFractionDigits: 0,
                }).format(Number(balance) || 0)}
              </p>
            </div>
          </div>
        )}
      </div>
    </header>

    {isOpen && (
      <>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar menú"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
        />
        <aside className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,88vw)] flex-col border-r border-white/10 bg-neutral-950 shadow-2xl shadow-black/50">
          <div className="flex items-center justify-between border-b border-white/[0.07] p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
                <Bike size={21} />
              </span>
              <div>
                <p className="text-sm font-black text-white">Gloto</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  Portal domiciliario
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar menú"
              className="rounded-lg p-2 text-neutral-400 hover:bg-white/5 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          {(canUsePrivate || canUsePublic || !isPublicApproved) && (
            <div className="border-b border-white/[0.07] p-4">
              <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.16em] text-neutral-500">
                Recibir pedidos
              </p>
              <div className="space-y-1">
                {canUsePrivate && (
                  <AvailabilitySwitch
                    label={privateBusinessName || "Pedidos de mi tienda"}
                    description={
                      privateOnline
                        ? "Recibiendo pedidos"
                        : privateEnabled
                          ? "Elegido · conecta para recibir"
                          : "No recibir pedidos"
                    }
                    checked={privateEnabled}
                    disabled={availabilityBusy}
                    onChange={() => onToggleAvailability("private")}
                    accent="violet"
                    icon={Store}
                  />
                )}
                {canUsePublic && (
                  <AvailabilitySwitch
                    label="Pedidos públicos"
                    description={
                      publicOnline
                        ? "Cerca de ti · hasta 1 km"
                        : publicEnabled
                          ? "Elegido · conecta para recibir"
                          : "No recibir pedidos"
                    }
                    checked={publicEnabled}
                    disabled={availabilityBusy}
                    onChange={() => onToggleAvailability("public")}
                    accent="emerald"
                    icon={Globe2}
                  />
                )}
                {!isPublicApproved && (
                  <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5">
                    <div>
                      <p className="text-xs font-semibold text-neutral-300">
                        Pedidos públicos
                      </p>
                      <p className="mt-0.5 text-[10px] text-neutral-500">
                        {mode === "public" ? "Acceso público" : "Solicita acceso"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onModeChange("public")}
                      className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-bold text-neutral-300 transition hover:bg-white/[0.06]"
                    >
                      Solicitar
                    </button>
                  </div>
                )}
                {isPublicApproved && (
                  <p className="px-3 pt-1 text-[10px] leading-4 text-neutral-500">
                    El saldo se usa solo en pedidos públicos, nunca en los de tu tienda.
                  </p>
                )}
                <p className="px-3 pt-1 text-[10px] leading-4 text-neutral-500">
                  Al conectarte compartimos tu ubicación en vivo. Se pausa cuando te desconectas.
                </p>
              </div>
            </div>
          )}

          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {sections
              .filter(
                (item) =>
                  !item.publicOnly ||
                  isPublicApproved,
              )
              .map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onSectionChange(id);
                    onClose();
                  }}
                  className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition ${
                    section === id
                      ? "bg-violet-500/15 text-violet-200"
                      : "text-neutral-400 hover:bg-white/[0.05] hover:text-white"
                  }`}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            <div className="px-3 pt-4">
              <div className="h-px bg-white/[0.07]" />
            </div>
            <button
              type="button"
              onClick={() => {
                onSectionChange("orders");
                onClose();
              }}
              className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-neutral-400 transition hover:bg-white/[0.05] hover:text-white"
            >
              <LayoutDashboard size={18} />
              Inicio
            </button>
          </nav>

          <div className="border-t border-white/[0.07] p-3">
            <button
              type="button"
              onClick={onSignOut}
              className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-neutral-400 transition hover:bg-rose-400/10 hover:text-rose-200"
            >
              <LogOut size={18} />
              Cerrar sesión
            </button>
          </div>
        </aside>
      </>
    )}
  </>
);

const AvailabilitySwitch = ({
  label,
  description,
  checked,
  disabled,
  onChange,
  accent,
  icon: Icon,
}) => {
  const colors =
    accent === "emerald"
      ? {
          activeCard: "border-emerald-400/25 bg-emerald-400/[0.08]",
          activeIcon: "bg-emerald-400/15 text-emerald-300",
          activeDescription: "text-emerald-200/75",
          activeTrack: "bg-emerald-400",
        }
      : {
          activeCard: "border-violet-400/25 bg-violet-400/[0.08]",
          activeIcon: "bg-violet-400/15 text-violet-300",
          activeDescription: "text-violet-200/75",
          activeTrack: "bg-violet-400",
        };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label}: ${checked ? "activo" : "pausado"}`}
      onClick={onChange}
      disabled={disabled}
      className={`group flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-wait disabled:opacity-60 ${
        checked
          ? colors.activeCard
          : "border-white/[0.07] bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.045]"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
          checked
            ? colors.activeIcon
            : "bg-white/[0.05] text-neutral-400 group-hover:text-neutral-200"
        }`}
      >
        <Icon size={18} strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          title={label}
          className="block truncate text-xs font-bold text-neutral-100"
        >
          {label}
        </span>
        <span
          className={`mt-1 block text-[10px] font-medium ${
            checked ? colors.activeDescription : "text-neutral-500"
          }`}
        >
          {description}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full p-0.5 transition duration-200 ${
          checked
            ? colors.activeTrack
            : "bg-neutral-700 group-hover:bg-neutral-600"
        }`}
      >
        <span
          className={`block h-6 w-6 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.35)] transition duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
};

export default PortalDomiciliarioSidebar;
