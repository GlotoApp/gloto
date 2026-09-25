import React, { useState } from "react";
import { Check, Zap, Crown, Rocket, Star } from "lucide-react";

const Planes = () => {
  // true = 3 Meses / Trimestral, false = Mensual
  const [isAnnual, setIsAnnual] = useState(true);

  const plans = [
    {
      name: "Inicial",
      icon: Rocket,
      description: "Hasta 800 ticket pos / mes * pdv",
      priceMonthly: 99500,
      pricePeriod: 300000,
      periodLabel: "por 3 meses",
      isCommission: false,
      buttonText: "Probar Gratis",
      highlight: false,
      features: [
        "POS (Punto de venta)",
        "Tienda en línea",
        "Menú digital y QR",
        "App móvil meseros",
        "Fidelización de clientes",
        "Gestión de Cajas y Mesas",
        "Mostrador / Autoservicio",
        "Módulo de Domicilios",
        "Recetas y Arqueos de caja (normal/ciego)",
        "Comandas digitales (KDS)",
        "Reportes y Copias de seguridad en la nube",
        "Usuarios, mesas y productos ilimitados",
      ],
    },
    {
      name: "Pro",
      icon: Zap,
      description: "Hasta 2,000 ticket pos / mes * pdv",
      priceMonthly: 149500,
      pricePeriod: 450000,
      periodLabel: "por 3 meses",
      isCommission: false,
      buttonText: "Probar Gratis",
      highlight: true,
      features: [
        "Todo lo de Plan Inicial +",
        "Personalizar Tienda en Línea",
        "Arqueos de Inventarios",
        "Sub-recetas y Producciones",
        "Dominio de tienda propio",
      ],
    },
    {
      name: "Premium",
      icon: Crown,
      description: "Sin límites de tickets",
      priceMonthly: 249500,
      pricePeriod: 748500,
      isCommission: true,
      commissionText: "0.5%",
      subText: "de ventas netas",
      buttonText: "Probar Gratis",
      highlight: false,
      features: [
        "Todo lo de Plan Inicial + Pro",
        "App de Domiciliarios y Logística avanzada",
        "Tienda online en servidor dedicado",
        "Reportes avanzados",
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background text-white pt-24 pb-12 px-6 sm:px-10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black uppercase tracking-tighter italic mb-4">
            Impulsa tu <span className="text-violet-500">Negocio</span>
          </h1>
          <p className="text-neutral-400 text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Selecciona el plan que mejor se adapte al ritmo de tu cocina. Cambia
            de nivel cuando lo necesites.
          </p>

          {/* Selector de Periodo: Mensual vs 3 Meses */}
          <div className="flex items-center justify-center mt-10 gap-4">
            <span
              className={`text-[11px] font-black uppercase tracking-widest ${!isAnnual ? "text-white" : "text-neutral-500"}`}
            >
              Mensual
            </span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className="w-12 h-6 bg-neutral-900 border border-white/10 rounded-full p-1 relative transition-all"
            >
              <div
                className={`w-4 h-4 bg-violet-500 rounded-full shadow-[0_0_10px_rgba(139,92,246,0.5)] transition-all duration-300 transform ${isAnnual ? "translate-x-6" : "translate-x-0"}`}
              />
            </button>
            <span
              className={`text-[11px] font-black uppercase tracking-widest ${isAnnual ? "text-white" : "text-neutral-500"}`}
            >
              Trimestral (3 Meses)
            </span>
          </div>
        </div>

        {/* Grid de Tarjetas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 md:grid-cols-2 gap-6 xl:gap-8 items-start">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`relative flex flex-col p-6 sm:p-8 rounded-[2rem] border transition-all duration-500 hover:scale-[1.02] ${
                plan.highlight
                  ? "bg-violet-600/[0.03] border-violet-500/40 shadow-[0_20px_50px_rgba(124,58,237,0.1)]"
                  : "bg-white/[0.01] border-white/[0.06]"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-violet-600 text-white text-[9px] font-black uppercase tracking-[0.2em] px-4 py-1.5 rounded-full whitespace-nowrap">
                  Recomendado
                </div>
              )}

              {/* Icono y Nombre del Plan */}
              <div className="mb-6">
                <div
                  className={`w-12 h-12 rounded-2xl mb-6 flex items-center justify-center ${plan.highlight ? "bg-violet-600/20" : "bg-white/5"}`}
                >
                  <plan.icon
                    className={
                      plan.highlight ? "text-violet-400" : "text-neutral-500"
                    }
                    size={24}
                  />
                </div>
                <h3 className="text-2xl font-black uppercase tracking-tight italic">
                  {plan.name}
                </h3>
                <p className="text-neutral-400 font-medium text-xs mt-2 bg-white/5 inline-block px-2 py-1 rounded">
                  {plan.description}
                </p>
              </div>

              {/* Precios dinámicos */}
              <div className="mb-8 min-h-[85px]">
                {plan.isCommission ? (
                  // Renderizado especial para plan Premium
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-black italic tracking-tighter text-violet-400">
                        {plan.commissionText}
                      </span>
                      <span className="text-neutral-500 text-[10px] font-black uppercase tracking-widest ml-1">
                        de ventas netas
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-400 uppercase font-black mt-2 tracking-widest">
                      Mínimo $
                      {(isAnnual
                        ? plan.pricePeriod
                        : plan.priceMonthly
                      ).toLocaleString("es-CO")}{" "}
                      x PDV
                    </p>
                  </div>
                ) : (
                  // Renderizado para planes Inicial y Pro
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-black italic tracking-tighter">
                        $
                        {isAnnual
                          ? plan.pricePeriod.toLocaleString("es-CO")
                          : plan.priceMonthly.toLocaleString("es-CO")}
                      </span>
                      <span className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest ml-1">
                        / {isAnnual ? "3 meses" : "mes"}
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-500 uppercase font-black mt-2 tracking-widest">
                      {isAnnual
                        ? `Pago único trimestral por PDV`
                        : `Pago mensual por PDV`}
                    </p>
                  </div>
                )}
              </div>

              {/* Lista de características */}
              <ul className="space-y-3.5 mb-10 flex-1 border-t border-white/5 pt-6">
                {plan.features.map((feature, idx) => {
                  const isHeaderFeature = feature.includes("Todo lo de Plan");
                  return (
                    <li
                      key={idx}
                      className={`flex items-start gap-3 text-sm ${
                        isHeaderFeature
                          ? "text-violet-400 font-bold mt-2"
                          : "text-neutral-300"
                      }`}
                    >
                      {!isHeaderFeature && (
                        <Check
                          size={16}
                          className="text-violet-500 mt-0.5 flex-shrink-0"
                        />
                      )}
                      <span>{feature}</span>
                    </li>
                  );
                })}
              </ul>

              {/* Botón de acción */}
              <button
                className={`w-full py-4 rounded-2xl font-black uppercase tracking-[0.15em] text-[10px] transition-all duration-300 active:scale-95 ${
                  plan.highlight
                    ? "bg-violet-600 hover:bg-violet-500 text-white shadow-[0_10px_25px_rgba(124,58,237,0.4)]"
                    : "bg-white/5 hover:bg-white/10 text-white border border-white/10"
                }`}
              >
                {plan.buttonText}
              </button>
            </div>
          ))}
        </div>

        {/* Footer info */}
        <div className="mt-20 text-center">
          <div className="inline-flex flex-wrap justify-center items-center gap-4 px-6 py-3 rounded-2xl bg-white/[0.02] border border-white/[0.05] text-neutral-500 text-[10px] font-black uppercase tracking-[0.1em]">
            <div className="flex items-center gap-2">
              <Star size={14} className="text-yellow-500" />
              <span>Garantía de 14 días</span>
            </div>
            <div className="hidden sm:block w-px h-4 bg-white/10"></div>
            <span>Encriptación SSL de 256 bits</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Planes;
