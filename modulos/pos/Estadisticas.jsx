import React, { useEffect, useState } from "react";
import {
  Clock,
  DollarSign,
  ShoppingBag,
  Layers,
  Truck,
  Copy,
  Check,
  User,
  Coffee,
  Activity, // Icono para la sección semanal
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";

const formatMoney = (value) =>
  `$ ${Number(value || 0).toLocaleString("es-CO", {
    maximumFractionDigits: 0,
  })}`;

const colors = ["#8b5cf6", "#10b981", "#f97316", "#3b82f6", "#eab308"];

const Estadisticas = () => {
  const [activePeriod, setActivePeriod] = useState("30 Días");
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [copied, setCopied] = useState(false);

  // Rango de fechas personalizado
  const [customRange, setCustomRange] = useState({
    start: "",
    end: "",
  });

  const getLocalDateString = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const today = new Date();
    const end = getLocalDateString(today);
    const daysByPeriod = {
      Hoy: 1,
      "Últimos 7 Días": 7,
      "30 Días": 30,
      "2 Meses": 60,
    };
    let start = end;

    if (activePeriod === "Personalizado") {
      if (!customRange.start || !customRange.end) return;
      start = customRange.start;
    } else {
      const date = new Date(today);
      date.setDate(date.getDate() - (daysByPeriod[activePeriod] || 30) + 1);
      start = getLocalDateString(date);
    }

    let cancelled = false;
    const loadDashboard = async () => {
      setLoading(true);
      setLoadError("");
      const { data, error } = await supabase.rpc("get_statistics_dashboard", {
        p_start_date: start,
        p_end_date: activePeriod === "Personalizado" ? customRange.end : end,
      });

      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
        setDashboard(null);
      } else {
        const payload = Array.isArray(data)
          ? data[0]?.get_statistics_dashboard
          : data?.get_statistics_dashboard || data;
        setDashboard(payload || null);
      }
      setLoading(false);
    };

    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [activePeriod, customRange]);

  const summary = dashboard?.summary || {};
  const dailyRows = dashboard?.daily || [];
  const hourRows = dashboard?.hours || [];
  const channelRows = dashboard?.channels || [];
  const paymentRows = dashboard?.payments || [];
  const productRows = dashboard?.products || [];
  const stockRows = dashboard?.stock || [];
  const customersByOrders = dashboard?.customers_by_orders || [];
  const customersByTotal = dashboard?.customers_by_total || [];
  const maxDaily = Math.max(...dailyRows.map((row) => Number(row.total)), 1);
  const maxHour = Math.max(...hourRows.map((row) => Number(row.total)), 1);
  const totalChannels =
    channelRows.reduce((sum, row) => sum + Number(row.total || 0), 0) || 1;
  const totalPayments =
    paymentRows.reduce((sum, row) => sum + Number(row.total || 0), 0) || 1;
  const maxProduct = Math.max(
    ...productRows.map((row) => Number(row.units)),
    1,
  );

  const mainStats = [
    {
      label: "Total Vendido",
      value: formatMoney(summary.total_sold),
      sub: "Ventas del período",
      icon: DollarSign,
      progress: 100,
      color: "bg-violet-500",
    },
    {
      label: "Pedidos Totales",
      value: Number(summary.total_orders || 0).toLocaleString("es-CO"),
      sub: "Pedidos no cancelados",
      icon: ShoppingBag,
      progress: 100,
      color: "bg-emerald-500",
    },
    {
      label: "Ticket Promedio",
      value: formatMoney(summary.average_ticket),
      sub: "Promedio por pedido",
      icon: Layers,
      progress: 100,
      color: "bg-orange-500",
    },
    {
      label: "Venta Domicilios",
      value: formatMoney(summary.delivery_sales),
      sub: "Ventas a domicilio",
      icon: Truck,
      progress: summary.total_sold
        ? (Number(summary.delivery_sales || 0) / Number(summary.total_sold)) *
          100
        : 0,
      color: "bg-blue-500",
    },
  ];

  const weeklyTrendsData = dailyRows.map((row) => ({
    day: new Date(`${row.day}T12:00:00`).toLocaleDateString("es-CO", {
      weekday: "short",
    }),
    percentage: (Number(row.total) / maxDaily) * 100,
    vol: formatMoney(row.total),
  }));

  const hourly24hData = Array.from({ length: 24 }, (_, hour) => {
    const row = hourRows.find((item) => Number(item.hour) === hour);
    return {
      hour: `${String(hour).padStart(2, "0")}h`,
      percentage: row ? (Number(row.total) / maxHour) * 100 : 0,
      vol: formatMoney(row?.total),
    };
  });

  const distributionData = channelRows.map((row, index) => ({
    label: row.channel,
    percentage: Math.round((Number(row.total || 0) / totalChannels) * 100),
    amount: formatMoney(row.total),
    color: colors[index % colors.length],
    strokeDash: `${(Number(row.total || 0) / totalChannels) * 628} 628`,
    strokeOffset: `${-channelRows.slice(0, index).reduce((sum, item) => sum + (Number(item.total || 0) / totalChannels) * 628, 0)}`,
  }));

  const paymentData = paymentRows.map((row, index) => ({
    label: row.payment_method,
    percentage: Math.round((Number(row.total || 0) / totalPayments) * 100),
    amount: formatMoney(row.total),
    color: ["#e5e5e5", "#7c3aed", "#404040", "#3b82f6"][index % 4],
    strokeDash: `${(Number(row.total || 0) / totalPayments) * 628} 628`,
    strokeOffset: `${-paymentRows.slice(0, index).reduce((sum, item) => sum + (Number(item.total || 0) / totalPayments) * 628, 0)}`,
  }));

  const allProducts = productRows.map((row, index) => ({
    name: row.product,
    sales: row.units,
    total: formatMoney(row.total),
    share: (Number(row.units) / maxProduct) * 100,
    color: [
      "bg-violet-500",
      "bg-emerald-500",
      "bg-orange-500",
      "bg-blue-500",
      "bg-neutral-600",
    ][index % 5],
  }));

  const getPeriodString = () => {
    if (
      activePeriod === "Personalizado" &&
      customRange.start &&
      customRange.end
    ) {
      return `${customRange.start} HASTA ${customRange.end}`;
    }
    return activePeriod;
  };

  const rawReportText = `INFORME OPERATIVO EJECUTIVO - GLOTO
Periodo Evaluado: ${getPeriodString()}
--------------------------------------------------
1. RENDIMIENTO FINANCIERO
- Facturación: ${formatMoney(summary.total_sold)} COP
- Pedidos: ${Number(summary.total_orders || 0)}
- Ticket Promedio: ${formatMoney(summary.average_ticket)} COP
- Ventas a Domicilio: ${formatMoney(summary.delivery_sales)} COP

2. CANALES DE VENTA
${channelRows.map((row) => `- ${row.channel}: ${formatMoney(row.total)} COP (${row.orders} pedidos)`).join("\n") || "- Sin ventas en el período"}

3. PRODUCTOS MÁS VENDIDOS
${productRows.map((row) => `- ${row.product}: ${row.units} unidades, ${formatMoney(row.total)} COP`).join("\n") || "- Sin productos vendidos"}

4. INVENTARIO BAJO
${
  stockRows
    .filter((row) => row.low_stock)
    .map(
      (row) =>
        `- ${row.name}: ${row.stock} ${row.unit} (mínimo ${row.min_stock})`,
    )
    .join("\n") || "- No hay productos bajo el mínimo"
}`;

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(rawReportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Fallo de API Portapapeles", err);
    }
  };

  return (
    <div className="min-h-screen bg-background text-neutral-200 p-4 md:p-8 font-sans antialiased selection:bg-violet-500/30">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* HEADER CONTROLES */}
        <header className="flex flex-col xl:flex-row xl:items-center justify-between pb-6 border-b border-white/5 gap-6">
          <div>
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-black tracking-tighter">
                Estadísticas
              </h1>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
            {showCustomPicker && (
              <div className="flex items-center gap-2 bg-neutral-950/80 border border-white/5 p-1 rounded-xl animate-in fade-in slide-in-from-top-1 duration-200">
                <input
                  type="date"
                  value={customRange.start}
                  onChange={(e) =>
                    setCustomRange({ ...customRange, start: e.target.value })
                  }
                  className="bg-transparent border-0 text-[10px] font-mono font-bold uppercase text-neutral-200 focus:outline-none focus:ring-0 py-1 px-2 cursor-pointer [color-scheme:dark]"
                />
                <span className="text-[9px] font-black text-neutral-600 uppercase px-1">
                  A
                </span>
                <input
                  type="date"
                  value={customRange.end}
                  onChange={(e) =>
                    setCustomRange({ ...customRange, end: e.target.value })
                  }
                  className="bg-transparent border-0 text-[10px] font-mono font-bold uppercase text-neutral-200 focus:outline-none focus:ring-0 py-1 px-2 cursor-pointer [color-scheme:dark]"
                />
              </div>
            )}

            <div className="relative bg-neutral-900/80 rounded-xl border border-white/5 p-1 flex items-center w-full sm:w-auto">
              <select
                value={activePeriod}
                onChange={(e) => {
                  const period = e.target.value;
                  setActivePeriod(period);
                  setShowCustomPicker(period === "Personalizado");
                }}
                className="appearance-none bg-transparent pl-3 pr-8 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-neutral-200 hover:text-white transition-colors cursor-pointer focus:outline-none focus:ring-0 w-full sm:w-44 border-0"
              >
                <option
                  value="Hoy"
                  className="bg-neutral-950 text-neutral-200 uppercase font-sans font-bold"
                >
                  Hoy
                </option>
                <option
                  value="Últimos 7 Días"
                  className="bg-neutral-950 text-neutral-200 uppercase font-sans font-bold"
                >
                  Últimos 7 Días
                </option>
                <option
                  value="30 Días"
                  className="bg-neutral-950 text-neutral-200 uppercase font-sans font-bold"
                >
                  30 Días
                </option>
                <option
                  value="2 Meses"
                  className="bg-neutral-950 text-neutral-200 uppercase font-sans font-bold"
                >
                  2 Meses
                </option>
                <option
                  value="Personalizado"
                  className="bg-neutral-950 text-neutral-200 uppercase font-sans font-bold"
                >
                  Personalizado
                </option>
              </select>
              <div className="absolute right-3 pointer-events-none flex items-center justify-center text-neutral-500">
                <svg className="w-2 h-2 fill-current" viewBox="0 0 20 20">
                  <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                </svg>
              </div>
            </div>
          </div>
        </header>

        {loading && (
          <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
            Cargando estadísticas reales...
          </div>
        )}
        {loadError && (
          <div className="border border-red-500/20 bg-red-500/10 rounded-xl px-4 py-3 text-[10px] font-bold text-red-300">
            No se pudieron cargar las estadísticas: {loadError}
          </div>
        )}

        {/* METRICAS PRINCIPALES */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {mainStats.map((kpi, idx) => (
            <div
              key={idx}
              className="bg-neutral-900/40 border border-white/5 p-5 rounded-3xl flex flex-col justify-between h-32"
            >
              <div className="flex justify-between items-start">
                <span className="text-neutral-500 text-[9px] font-black uppercase tracking-widest">
                  {kpi.label}
                </span>
                <div className="p-1.5 bg-neutral-950 rounded-lg border border-white/5 text-neutral-400">
                  <kpi.icon size={12} />
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-black tracking-tight text-white font-mono">
                  {kpi.value}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-[2px] bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${kpi.color}`}
                      style={{ width: `${kpi.progress}%` }}
                    />
                  </div>
                  <span className="text-[8px] font-bold uppercase text-neutral-600 tracking-tight whitespace-nowrap">
                    {kpi.sub}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* 📊 GRÁFICA SEMANAL: EXACTAMENTE RESPONSIVA E IGUAL A LA DE HORAS */}
        <section className="bg-neutral-900/40 border border-white/5 p-6 md:p-8 rounded-[2rem]">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 text-neutral-400">
                <Activity size={14} className="text-violet-500" />
                Flujo Analítico de Ventas por Día
              </h3>
              <p className="text-neutral-600 text-[9px] uppercase font-bold mt-0.5">
                Volumen real registrado por día dentro del período seleccionado
              </p>
            </div>
            <div className="text-right">
              <span className="text-[8px] font-mono font-black uppercase text-neutral-400 bg-neutral-950 px-3 py-1 rounded border border-white/5">
                Ciclo Semanal Completo
              </span>
            </div>
          </div>

          {/* Cambios aquí: overflow-x-auto, scrollbar-none y pt-8 para evitar cortes del tooltip flotante */}
          <div className="h-44 flex items-end gap-3 sm:gap-4 border-b border-white/5 pb-2 pt-8 overflow-x-auto scrollbar-none">
            {weeklyTrendsData.map((bar, i) => (
              <div
                key={i}
                // Cambios aquí: Añadido min-w-[55px] sm:min-w-0 para garantizar tamaño estructurado en móviles
                className="flex-1 min-w-[55px] sm:min-w-0 flex flex-col items-center gap-2 group h-full justify-end relative"
              >
                {/* Tooltip flotante */}
                <span className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-5 text-[8px] font-mono font-bold text-white bg-neutral-950 px-1.5 py-0.5 rounded border border-white/10 pointer-events-none z-10 whitespace-nowrap">
                  {bar.vol} ({bar.percentage}%)
                </span>

                {/* Contenedor de la barra */}
                <div className="w-full bg-neutral-950 rounded-t-md overflow-hidden h-full flex items-end border border-white/[0.02]">
                  <div
                    style={{ height: `${bar.percentage}%` }}
                    className={`w-full rounded-t-sm transition-all duration-500 ${
                      bar.isPeak
                        ? "bg-violet-500 shadow-md shadow-violet-500/20"
                        : "bg-neutral-800 group-hover:bg-violet-400/50"
                    }`}
                  />
                </div>

                {/* Eje X (Días) - truncate evita desbordamientos de texto */}
                <span
                  className={`text-[8px] font-mono font-black tracking-tighter uppercase w-full text-center truncate ${
                    bar.isPeak ? "text-violet-400" : "text-neutral-600"
                  }`}
                >
                  {bar.day}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* INTENSIDAD HORARIA */}
        <section className="bg-neutral-900/40 border border-white/5 p-6 md:p-8 rounded-[2rem]">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 text-neutral-400">
                <Clock size={14} className="text-violet-500" />
                Intensidad Horaria Operativa Transaccional
              </h3>
              <p className="text-neutral-600 text-[9px] uppercase font-bold mt-0.5">
                Rendimiento Técnico de Capacidad Instalada (24 Horas Continuas)
              </p>
            </div>
            <div className="text-right">
              <span className="text-[8px] font-mono font-black uppercase text-neutral-400 bg-neutral-950 px-3 py-1 rounded border border-white/5">
                Ventana Operativa de 24H
              </span>
            </div>
          </div>

          <div className="h-44 flex items-end gap-1.5 sm:gap-2 border-b border-white/5 pb-2 pt-8 overflow-x-auto scrollbar-none">
            {hourly24hData.map((bar, i) => (
              <div
                key={i}
                className="flex-1 min-w-[20px] flex flex-col items-center gap-2 group h-full justify-end relative"
              >
                <span className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-5 text-[8px] font-mono font-bold text-white bg-neutral-950 px-1.5 py-0.5 rounded border border-white/10 pointer-events-none z-10 whitespace-nowrap">
                  {bar.vol} ({bar.percentage}%)
                </span>
                <div className="w-full bg-neutral-950 rounded-t-md overflow-hidden h-full flex items-end border border-white/[0.02]">
                  <div
                    style={{ height: `${bar.percentage}%` }}
                    className={`w-full rounded-t-sm transition-all duration-500 ${bar.isPeak ? "bg-violet-500 shadow-md shadow-violet-500/20" : "bg-neutral-800 group-hover:bg-violet-400/50"}`}
                  />
                </div>
                <span className="text-[8px] font-mono font-bold text-neutral-600 tracking-tighter">
                  {bar.hour}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* DONAS DE CONTROL */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-neutral-900/40 border border-white/5 p-6 md:p-8 rounded-[2rem] flex flex-col md:flex-row items-center gap-8 justify-between">
            <div className="flex-1 space-y-4 w-full">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-500" /> Rueda
                de Canales
              </h3>
              <div className="space-y-2">
                {distributionData.map((item, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center text-[10px] bg-neutral-950/60 border border-white/[0.02] p-2.5 rounded-xl"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-neutral-300 font-bold uppercase">
                        {item.label}
                      </span>
                    </div>
                    <div className="text-right font-mono">
                      <span className="text-neutral-500 text-[9px] mr-2">
                        {item.amount}
                      </span>
                      <span className="text-white font-black">
                        {item.percentage}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative w-40 h-40 flex-shrink-0 flex items-center justify-center">
              <svg
                className="w-full h-full transform -rotate-90"
                viewBox="0 0 240 240"
              >
                <circle
                  cx="120"
                  cy="120"
                  r="100"
                  fill="transparent"
                  stroke="#161616"
                  strokeWidth="24"
                />
                {distributionData.map((item, i) => (
                  <circle
                    key={i}
                    cx="120"
                    cy="120"
                    r="100"
                    fill="transparent"
                    stroke={item.color}
                    strokeWidth="24"
                    strokeDasharray={item.strokeDash}
                    strokeDashoffset={item.strokeOffset}
                    strokeLinecap="round"
                    className="transition-all duration-1000"
                  />
                ))}
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-xs font-black text-white font-mono">
                  {distributionData[0]?.percentage || 0}%
                </span>
                <span className="text-[7px] font-black tracking-widest text-neutral-600 uppercase">
                  {distributionData[0]?.label || "Sin datos"}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-neutral-900/40 border border-white/5 p-6 md:p-8 rounded-[2rem] flex flex-col md:flex-row items-center gap-8 justify-between">
            <div className="flex-1 space-y-4 w-full">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-500" /> Flujo
                de Monetización
              </h3>
              <div className="space-y-2">
                {paymentData.map((item, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center text-[10px] bg-neutral-950/60 border border-white/[0.02] p-2.5 rounded-xl"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-neutral-300 font-bold uppercase">
                        {item.label}
                      </span>
                    </div>
                    <div className="text-right font-mono">
                      <span className="text-neutral-500 text-[9px] mr-2">
                        {item.amount}
                      </span>
                      <span className="text-white font-black">
                        {item.percentage}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative w-40 h-40 flex-shrink-0 flex items-center justify-center">
              <svg
                className="w-full h-full transform -rotate-90"
                viewBox="0 0 240 240"
              >
                <circle
                  cx="120"
                  cy="120"
                  r="100"
                  fill="transparent"
                  stroke="#161616"
                  strokeWidth="24"
                />
                {paymentData.map((item, i) => (
                  <circle
                    key={i}
                    cx="120"
                    cy="120"
                    r="100"
                    fill="transparent"
                    stroke={item.color}
                    strokeWidth="24"
                    strokeDasharray={item.strokeDash}
                    strokeDashoffset={item.strokeOffset}
                    strokeLinecap="round"
                    className="transition-all duration-1000"
                  />
                ))}
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-xs font-black text-white font-mono">
                  {paymentData[0]?.percentage || 0}%
                </span>
                <span className="text-[7px] font-black tracking-widest text-neutral-600 uppercase">
                  {paymentData[0]?.label || "Sin datos"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* LISTAS DE CLIENTES Y CATÁLOGO DE PRODUCTOS */}
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-neutral-900/40 border border-white/5 p-6 md:p-8 rounded-[2rem] flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-6">
                <User size={14} className="text-violet-500" />
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">
                  Fidelización Core • Segmentación de Clientes
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-[9px] font-black uppercase tracking-wider text-violet-400">
                      Alta Frecuencia (Recurrencia)
                    </span>
                    <span className="text-[8px] font-mono text-neutral-600 font-bold">
                      ORDEN: PEDIDOS
                    </span>
                  </div>
                  <div className="divide-y divide-white/[0.03] space-y-1">
                    {customersByOrders.map((client, i) => (
                      <div
                        key={i}
                        className="py-2.5 flex justify-between items-center group"
                      >
                        <div>
                          <h4 className="text-[11px] font-black text-white uppercase group-hover:text-violet-400 transition-colors">
                            {client.customer}
                          </h4>
                          <p className="text-[8px] font-mono text-neutral-500 mt-0.5">
                            {formatMoney(client.total)} acumulado
                          </p>
                        </div>
                        <span className="text-[10px] font-mono font-black text-white bg-neutral-950 px-2 py-0.5 rounded border border-white/5">
                          {client.orders} pedidos
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400">
                      Mayores Inversores (Volumen de Gasto)
                    </span>
                    <span className="text-[8px] font-mono text-neutral-600 font-bold">
                      ORDEN: MONTO
                    </span>
                  </div>
                  <div className="divide-y divide-white/[0.03] space-y-1">
                    {customersByTotal.map((client, i) => (
                      <div
                        key={i}
                        className="py-2.5 flex justify-between items-center group"
                      >
                        <div>
                          <h4 className="text-[11px] font-black text-white uppercase group-hover:text-emerald-400 transition-colors">
                            {client.customer}
                          </h4>
                          <p className="text-[8px] font-mono text-neutral-500 mt-0.5">
                            {client.orders} pedidos
                          </p>
                        </div>
                        <span className="text-[10px] font-mono font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/10">
                          {formatMoney(client.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-neutral-900/40 border border-white/5 p-6 md:p-8 rounded-[2rem]">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] mb-6 flex items-center gap-2 text-neutral-400">
              <Coffee size={14} className="text-violet-500" /> Catálogo de
              Rendimiento Absoluto
            </h3>
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin">
              {allProducts.map((product, i) => (
                <div key={i} className="space-y-1 group">
                  <div className="flex justify-between items-center text-[10px] font-bold uppercase">
                    <span className="text-white font-black group-hover:text-violet-400 transition-colors">
                      {product.name}
                    </span>
                    <div className="space-x-3 font-mono">
                      <span className="text-neutral-500">
                        {product.sales} uds
                      </span>
                      <span className="text-white font-black">
                        {product.total}
                      </span>
                    </div>
                  </div>
                  <div className="h-[5px] w-full bg-neutral-950 rounded-full overflow-hidden border border-white/[0.02]">
                    <div
                      className={`h-full ${product.color} rounded-full transition-all duration-1000`}
                      style={{ width: `${product.share}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* INFORME OPERATIVO COPIABLE */}
        <section className="bg-neutral-950 border-2 border-white/5 p-6 md:p-8 rounded-[2rem] space-y-6 relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2 text-white">
                Informe Operativo Desglosado
              </h3>
              <p className="text-[9px] text-neutral-600 uppercase font-bold tracking-wider mt-0.5">
                Estructura limpia para copiar e integrar en minutas de control
              </p>
            </div>
            <button
              onClick={handleCopyReport}
              className="flex items-center gap-2 px-3 py-2 bg-neutral-900 hover:bg-white hover:text-black border border-white/5 rounded-xl transition-all text-[9px] font-black uppercase tracking-widest text-neutral-400"
            >
              {copied ? (
                <>
                  <Check size={12} className="text-emerald-500" />
                  <span>¡Copiado!</span>
                </>
              ) : (
                <>
                  <Copy size={12} />
                  <span>Copiar Informe</span>
                </>
              )}
            </button>
          </div>
          <div className="bg-neutral-900/20 rounded-2xl p-5 border border-white/[0.02] font-mono text-[10px] text-neutral-400 space-y-4 whitespace-pre-line leading-relaxed">
            {rawReportText}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Estadisticas;
