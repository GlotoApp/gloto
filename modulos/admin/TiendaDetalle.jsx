import {
  Banknote,
  BellRing,
  Building2,
  CheckCircle2,
  Clock3,
  MapPin,
  Package,
  Percent,
  Phone,
  ShieldCheck,
  Sparkles,
  Tag,
  XCircle,
} from "lucide-react";

const getWeekdayLabel = (day) => {
  const labels = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
  ];
  return labels[day - 1] || "Día";
};

const getInitials = (name) =>
  (name || "T")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "T";

const formatDayTime = (slot) => {
  if (!slot?.is_open) return "Cerrado";
  if (!slot?.open_time && !slot?.close_time) return "Abierto";
  return `${slot.open_time || "--"} - ${slot.close_time || "--"}${slot.close_day === "next" ? " (+1 día)" : ""}`;
};

const formatCop = (value) =>
  value === null || value === undefined || value === ""
    ? "No definido"
    : new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
      }).format(Number(value) || 0);

const TiendaDetalle = ({ store, detail }) => {
  if (!store) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-white/10 bg-neutral-900/75 p-6 text-sm text-neutral-400">
        Selecciona una tienda para ver su detalle completo.
      </div>
    );
  }

  const businessHours = detail?.businessHours || [];
  const shopCategories = detail?.shopCategories || [];
  const inventoryCategories = detail?.inventoryCategories || [];
  const products = detail?.products || [];
  const inventory = detail?.inventory || [];
  const notifications = detail?.notifications || [];
  const costs = {
    deliveryFeePerKm: store.info?.delivery_fee_per_km ?? "",
    minDeliveryFee: store.info?.min_delivery_fee ?? "",
    maxDeliveryFee: store.info?.max_delivery_fee ?? "",
    taxRate: store.info?.tax_rate ?? "",
  };
  const subscription = store.subscription;
  const subscriptionEnd = subscription?.ends_at
    ? new Date(subscription.ends_at)
    : null;
  const remainingDays =
    subscriptionEnd && Number.isFinite(subscriptionEnd.getTime())
      ? Math.ceil((subscriptionEnd.getTime() - Date.now()) / 86400000)
      : null;
  const statusLabels = {
    active: "Activo",
    pending: "Pendiente",
    expired: "Vencido",
    cancelled: "Cancelado",
  };
  const subscriptionStatus =
    subscription?.status === "active" &&
    remainingDays !== null &&
    remainingDays <= 0
      ? "Vencido"
      : statusLabels[subscription?.status] || "Sin suscripción";
  const planDetails = [
    subscription?.billing_period,
    subscriptionEnd && Number.isFinite(subscriptionEnd.getTime())
      ? `Vence ${subscriptionEnd.toLocaleDateString("es-CO")}`
      : null,
    remainingDays !== null
      ? remainingDays > 0
        ? `Quedan ${remainingDays} ${remainingDays === 1 ? "día" : "días"}`
        : "Sin días restantes"
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const businessHoursByDay = [
    ...new Set(businessHours.map((slot) => slot.day_of_week)),
  ]
    .sort((first, second) => first - second)
    .map((dayOfWeek) => {
      const slots = businessHours
        .filter((slot) => slot.day_of_week === dayOfWeek)
        .sort((first, second) => first.shift_index - second.shift_index);
      const openSlots = slots.filter((slot) => slot.is_open);

      return {
        dayOfWeek,
        isOpen: openSlots.length > 0,
        hours: openSlots.map(formatDayTime).join(" · ") || "Cerrado",
      };
    });
  const costFields = [
    { key: "deliveryFeePerKm", label: "Tarifa por kilómetro" },
    { key: "minDeliveryFee", label: "Costo mínimo de domicilio" },
    { key: "maxDeliveryFee", label: "Costo máximo de domicilio" },
    { key: "taxRate", label: "Impuesto", isTax: true },
  ];
  const hasCoordinates =
    store.info?.latitude !== null &&
    store.info?.latitude !== undefined &&
    store.info?.longitude !== null &&
    store.info?.longitude !== undefined;
  const deliveryWindow =
    store.info?.delivery_time_min != null &&
    store.info?.delivery_time_max != null
      ? `${store.info.delivery_time_min}–${store.info.delivery_time_max} min`
      : "No definido";
  const quickFacts = [
    {
      label: "Dirección",
      value: store.address || "Sin dirección",
      icon: MapPin,
    },
    {
      label: "WhatsApp",
      value: store.phone || "Sin WhatsApp",
      icon: Phone,
    },
    {
      label: "Tiempo de entrega",
      value: deliveryWindow,
      icon: Clock3,
    },
    {
      label: "Categorías de productos",
      value: `${shopCategories.filter((category) => category.is_active).length} activas · ${shopCategories.length} total`,
      icon: Tag,
    },
    {
      label: "Categorías de inventario",
      value: `${inventoryCategories.length} registradas`,
      icon: Package,
    },
  ];

  const summaryCards = [
    {
      label: "Plan",
      value: store.planName || "Sin plan",
      detail: [subscriptionStatus, planDetails].filter(Boolean).join(" · "),
      icon: ShieldCheck,
      accent: "text-violet-200",
    },
    {
      label: "Estado",
      value: store.admin_suspended
        ? "Suspendida por administración"
        : store.is_active
          ? "Activa"
          : "Inactiva",
      detail: store.admin_suspended ? store.admin_suspension_reason : null,
      icon: store.is_active ? CheckCircle2 : XCircle,
      accent: store.is_active ? "text-emerald-200" : "text-red-200",
    },
    {
      label: "Valoración",
      value: store.rating ? `${store.rating} / 5` : "Sin reseñas",
      icon: Sparkles,
      accent: "text-amber-200",
    },
    {
      label: "Avisos",
      value: `${notifications.length} pendientes`,
      icon: BellRing,
      accent: "text-cyan-200",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-neutral-900/80 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
        <div
          className="relative h-32 bg-gradient-to-r from-violet-600/30 via-purple-500/10 to-transparent"
          style={
            store.cover_url
              ? {
                  backgroundImage: `linear-gradient(90deg, rgba(24,24,27,0.8), rgba(24,24,27,0.2)), url(${store.cover_url})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(168,85,247,0.40),transparent_35%)]" />
        </div>

        <div className="p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-neutral-950">
                {store.logo_url ? (
                  <img
                    src={store.logo_url}
                    alt={store.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-lg font-black text-violet-200">
                    {getInitials(store.name)}
                  </span>
                )}
              </div>

              <div className="min-w-0">
                <h3 className="truncate text-2xl font-black text-white">
                  {store.name}
                </h3>
                <p className="text-sm text-neutral-400">
                  /{store.slug || "sin-slug"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-200">
                {store.category || "Sin categoría"}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                  store.is_active
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "bg-red-500/10 text-red-300"
                }`}
              >
                {store.admin_suspended
                  ? "Suspendida"
                  : store.is_active
                    ? "Disponible"
                    : "Cerrada"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(({ label, value, detail, icon: Icon, accent }) => (
          <div
            key={label}
            className="rounded-2xl border border-white/10 bg-neutral-900/75 p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                {label}
              </span>
              <Icon className={`h-4 w-4 ${accent}`} />
            </div>
            <p className="text-base font-bold text-white">{value}</p>
            {detail && (
              <p className="mt-1 text-[11px] leading-4 text-neutral-400">
                {detail}
              </p>
            )}
          </div>
        ))}
      </div>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-neutral-900/75 p-4">
        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-neutral-400">
          <Building2 size={14} /> Vista rápida
        </div>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-5">
          {quickFacts.map(({ label, value, icon: Icon }) => (
            <div key={label} className="min-w-0">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                <Icon size={12} />
                {label}
              </div>
              <p className="break-words text-sm text-neutral-200">{value}</p>
            </div>
          ))}
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
              <MapPin size={12} /> Ubicación
            </div>
            {hasCoordinates ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.info.latitude},${store.info.longitude}`)}`}
                target="_blank"
                rel="noreferrer"
                className="break-words text-sm text-violet-200 underline decoration-violet-400/40 underline-offset-2 hover:text-violet-100"
              >
                {store.info.latitude}, {store.info.longitude}
              </a>
            ) : (
              <p className="text-sm text-neutral-500">Sin coordenadas</p>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-neutral-900/75 p-4">
        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-neutral-400">
          <Banknote className="text-emerald-300" size={15} /> Costos y entrega
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {costFields.map(({ key, label, isTax }) => (
            <div
              key={key}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
            >
              <label className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                {isTax && <Percent size={12} />}
                {label}
                <span className="normal-case tracking-normal text-neutral-600">
                  ({isTax ? "%" : "COP"})
                </span>
              </label>
              <p className="text-sm font-semibold text-white">
                {isTax
                  ? costs[key] === "" || costs[key] == null
                    ? "No definido"
                    : `${costs[key]}%`
                  : formatCop(costs[key])}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-neutral-900/75 p-4">
        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-neutral-400">
          <Tag size={14} /> Categorías de productos
        </div>
        {shopCategories.length ? (
          <div className="flex flex-wrap gap-2">
            {shopCategories.map((category) => (
              <span
                key={category.id}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  category.is_active
                    ? "border-violet-500/25 bg-violet-500/10 text-violet-100"
                    : "border-white/10 bg-white/[0.02] text-neutral-500"
                }`}
                title={category.description || category.name}
              >
                {category.name}
                {!category.is_active && " · Inactiva"}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">
            Esta tienda todavía no tiene categorías de productos.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-neutral-900/75 p-4">
        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-neutral-400">
          <Package size={14} /> Categorías de inventario
        </div>
        {inventoryCategories.length ? (
          <div className="flex flex-wrap gap-2">
            {inventoryCategories.map((category) => (
              <span
                key={category.id}
                className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-100"
              >
                {category.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">
            Esta tienda todavía no tiene categorías de inventario.
          </p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-4 rounded-2xl border border-white/10 bg-neutral-900/75 p-4">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-neutral-400">
            <Building2 size={14} /> Información general
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                <MapPin size={12} /> Dirección
              </div>
              <p className="text-sm text-neutral-200">
                {store.address || "Sin dirección registrada"}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                <Phone size={12} /> WhatsApp
              </div>
              <p className="text-sm text-neutral-200">
                {store.phone || "Sin WhatsApp"}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                <Tag size={12} /> Categoría
              </div>
              <p className="text-sm text-neutral-200">
                {store.category || "Sin categoría"}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                <Clock3 size={12} /> Delivery
              </div>
              <p className="text-sm text-neutral-200">
                {store.info?.delivery_time_min && store.info?.delivery_time_max
                  ? `${store.info.delivery_time_min}–${store.info.delivery_time_max} min`
                  : "Sin horario de entrega"}
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-neutral-900/75 p-4">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-neutral-400">
            <BellRing size={14} /> Avisos
          </div>

          <div className="space-y-2">
            {notifications.length > 0 ? (
              notifications.slice(0, 4).map((alerta) => (
                <div
                  key={alerta.id}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-white">
                      {alerta.title}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] ${
                        alerta.severity === "critical"
                          ? "bg-red-500/10 text-red-300"
                          : "bg-amber-500/10 text-amber-300"
                      }`}
                    >
                      {alerta.severity || "info"}
                    </span>
                  </div>
                  <p className="text-xs leading-5 text-neutral-400">
                    {alerta.message}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-neutral-400">
                Sin avisos activos para esta tienda.
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-3 rounded-2xl border border-white/10 bg-neutral-900/75 p-4">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-neutral-400">
            <Clock3 size={14} /> Horarios
          </div>

          <div className="space-y-2">
            {businessHoursByDay.length > 0 ? (
              businessHoursByDay.map((day) => (
                <div
                  key={`${store.id}-${day.dayOfWeek}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-white">
                      {getWeekdayLabel(day.dayOfWeek)}
                    </p>
                    <p className="text-xs text-neutral-400">{day.hours}</p>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                      day.isOpen
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-red-500/10 text-red-300"
                    }`}
                  >
                    {day.isOpen ? (
                      <CheckCircle2 size={12} />
                    ) : (
                      <XCircle size={12} />
                    )}
                    {day.isOpen ? "Abierto" : "Cerrado"}
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-neutral-400">
                No hay horarios configurados.
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-white/10 bg-neutral-900/75 p-4">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-neutral-400">
            <Package size={14} /> Productos y stock
          </div>

          <div className="space-y-2">
            {products.length > 0 ? (
              products.slice(0, 5).map((producto) => (
                <div
                  key={`${store.id}-${producto.name}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {producto.name}
                    </p>
                    <p className="text-[11px] text-neutral-400">
                      {producto.is_active ? "Disponible" : "Oculto"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                      Number(producto.stock) <= 0
                        ? "bg-red-500/10 text-red-300"
                        : "bg-emerald-500/10 text-emerald-300"
                    }`}
                  >
                    {producto.stock} uds
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-neutral-400">
                No hay productos visibles en este negocio.
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-white/10 bg-neutral-900/75 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-neutral-400">
          <Package size={14} /> Inventario
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {inventory.length > 0 ? (
            inventory.slice(0, 8).map((insumo) => (
              <div
                key={`${store.id}-${insumo.name}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {insumo.name}
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    Min: {insumo.min_stock} · {insumo.unit || "uds"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                    Number(insumo.stock) <= Number(insumo.min_stock)
                      ? "bg-amber-500/10 text-amber-300"
                      : "bg-emerald-500/10 text-emerald-300"
                  }`}
                >
                  {insumo.stock}
                </span>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-neutral-400 md:col-span-2">
              Este negocio no tiene inventario registrado.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default TiendaDetalle;
