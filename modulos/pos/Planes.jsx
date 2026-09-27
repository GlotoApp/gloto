import React, { useEffect, useState } from "react";
import { Check, Zap, Crown, Rocket } from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";

const PLAN_ICONS = {
  inicial: Rocket,
  pro: Zap,
  premium: Crown,
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const Planes = () => {
  const [plans, setPlans] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [features, setFeatures] = useState([]);
  const [selectedPeriodCode, setSelectedPeriodCode] = useState("quarterly");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadPlans = async () => {
      const [
        { data: planData, error: planError },
        { data: periodData },
        { data: featureData, error: featureError },
      ] = await Promise.all([
        supabase
          .from("billing_plans")
          .select(
            "id,code,name,billing_type,price_amount,commission_rate,minimum_amount,display_order",
          )
          .eq("is_active", true)
          .order("display_order", { ascending: true }),
        supabase
          .from("billing_plan_periods")
          .select(
            "id,plan_id,code,label,duration_days,price_amount,commission_rate,minimum_amount,display_order",
          )
          .eq("is_active", true)
          .order("display_order", { ascending: true }),
        supabase
          .from("billing_plan_features")
          .select("id,plan_id,feature_text,is_section,display_order")
          .eq("is_active", true)
          .order("display_order", { ascending: true }),
      ]);

      if (planError) {
        console.error("No se pudieron cargar los planes:", planError);
        setError("No se pudieron cargar los planes.");
      } else {
        setPlans(planData || []);
      }

      const activePeriods = periodData || [];
      setPeriods(activePeriods);
      if (featureError) {
        console.error(
          "No se pudieron cargar las características:",
          featureError,
        );
        setError("No se pudieron cargar las características de los planes.");
      } else {
        setFeatures(featureData || []);
      }
      if (!activePeriods.some((period) => period.code === "quarterly")) {
        setSelectedPeriodCode("monthly");
      }
      setLoading(false);
    };

    loadPlans();
  }, []);

  const periodOptions = periods.reduce((options, period) => {
    if (!options.some((option) => option.code === period.code)) {
      options.push(period);
    }
    return options;
  }, []);
  const monthlyOption = periodOptions.find(
    (period) => period.code === "monthly",
  );
  const quarterlyOption = periodOptions.find(
    (period) => period.code === "quarterly",
  );
  const showPeriodSwitch = monthlyOption && quarterlyOption;
  const selectedPeriod = periodOptions.find(
    (period) => period.code === selectedPeriodCode,
  );

  const selectOtherPeriod = () => {
    setSelectedPeriodCode(
      selectedPeriodCode === monthlyOption?.code
        ? quarterlyOption?.code
        : monthlyOption?.code,
    );
  };

  return (
    <div className="min-h-screen bg-background px-6 pb-12 pt-24 text-white sm:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-16 text-center">
          <h1 className="mb-4 text-3xl font-black uppercase italic tracking-tighter sm:text-4xl md:text-5xl">
            Impulsa tu <span className="text-violet-500">Negocio</span>
          </h1>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-neutral-400 sm:text-base md:text-lg">
            Encuentra el plan ideal para tu negocio y crece a tu propio ritmo.
          </p>

          {showPeriodSwitch && (
            <div className="mt-10 flex items-center justify-center gap-4">
              <span
                className={`text-[11px] font-black uppercase tracking-widest ${selectedPeriodCode === monthlyOption.code ? "text-white" : "text-neutral-500"}`}
              >
                {monthlyOption.label}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={selectedPeriodCode === quarterlyOption.code}
                aria-label="Cambiar periodo de facturación"
                onClick={selectOtherPeriod}
                className="relative h-6 w-12 rounded-full border border-white/10 bg-neutral-900 p-1 transition-all"
              >
                <span
                  className={`block h-4 w-4 transform rounded-full bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.5)] transition-all duration-300 ${selectedPeriodCode === quarterlyOption.code ? "translate-x-6" : "translate-x-0"}`}
                />
              </button>
              <span
                className={`text-[11px] font-black uppercase tracking-widest ${selectedPeriodCode === quarterlyOption.code ? "text-white" : "text-neutral-500"}`}
              >
                {quarterlyOption.label}
              </span>
            </div>
          )}
        </header>

        {loading ? (
          <p className="py-16 text-center text-sm text-neutral-400">
            Cargando planes...
          </p>
        ) : error ? (
          <p className="py-16 text-center text-sm text-rose-300">{error}</p>
        ) : plans.length === 0 ? (
          <p className="py-16 text-center text-sm text-neutral-400">
            No hay planes activos disponibles.
          </p>
        ) : (
          <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 lg:grid-cols-3 xl:gap-8">
            {plans.map((plan) => {
              const Icon = PLAN_ICONS[plan.code] || Rocket;
              const highlight = plan.code === "pro";
              const isPremium = plan.code === "premium";
              const isCommission = plan.billing_type === "commission";
              const isMonthly = selectedPeriodCode === "monthly";
              const planPeriod = periods.find(
                (period) =>
                  period.plan_id === plan.id &&
                  period.code === selectedPeriodCode,
              );
              const price = isMonthly
                ? plan.price_amount
                : planPeriod?.price_amount;
              const minimum = isMonthly
                ? plan.minimum_amount
                : planPeriod?.minimum_amount;
              const commissionRate =
                plan.commission_rate ?? planPeriod?.commission_rate;
              const periodLabel =
                planPeriod?.label || selectedPeriod?.label || "";
              const planFeatures = features.filter(
                (feature) => feature.plan_id === plan.id,
              );

              return (
                <article
                  key={plan.id}
                  className={`relative flex flex-col rounded-[2rem] border p-6 transition-all duration-500 hover:scale-[1.02] sm:p-8 ${
                    isPremium
                      ? "border-amber-300/40 bg-amber-400/[0.04] shadow-[0_20px_50px_rgba(245,158,11,0.12)]"
                      : highlight
                        ? "border-violet-500/40 bg-violet-600/[0.03] shadow-[0_20px_50px_rgba(124,58,237,0.1)]"
                        : "border-white/[0.06] bg-white/[0.01]"
                  }`}
                >
                  {(highlight || isPremium) && (
                    <div
                      className={`absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-white ${isPremium ? "bg-amber-500 text-neutral-950" : "bg-violet-600"}`}
                    >
                      {isPremium ? "Más completo" : "Recomendado"}
                    </div>
                  )}

                  <div className="mb-6">
                    <div
                      className={`mb-6 flex h-12 w-12 items-center justify-center rounded-2xl ${isPremium ? "bg-amber-400/15" : highlight ? "bg-violet-600/20" : "bg-white/5"}`}
                    >
                      <Icon
                        className={
                          isPremium
                            ? "text-amber-300"
                            : highlight
                              ? "text-violet-400"
                              : "text-neutral-500"
                        }
                        size={24}
                      />
                    </div>
                    <h2
                      className={`text-2xl font-black uppercase italic tracking-tight ${isPremium ? "text-amber-100" : ""}`}
                    >
                      {plan.name}
                    </h2>
                  </div>

                  <div className="min-h-[85px] border-t border-white/5 pt-6">
                    {isCommission ? (
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span
                            className={`text-5xl font-black italic tracking-tighter ${isPremium ? "text-amber-300" : "text-violet-400"}`}
                          >
                            {commissionRate === null ||
                            commissionRate === undefined
                              ? "-"
                              : `${Number(commissionRate).toLocaleString("es-CO")}%`}
                          </span>
                          <span className="ml-1 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                            de ventas netas
                          </span>
                        </div>
                        <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                          {minimum === null || minimum === undefined
                            ? "Mínimo no configurado"
                            : `Mínimo ${formatCurrency(minimum)} ${periodLabel ? `/ ${periodLabel}` : ""}`}
                        </p>
                      </div>
                    ) : price === null || price === undefined ? (
                      <p className="text-sm text-neutral-400">
                        Precio no configurado para este periodo.
                      </p>
                    ) : (
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-black italic tracking-tighter">
                            {formatCurrency(price)}
                          </span>
                          {periodLabel && (
                            <span className="ml-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                              / {periodLabel}
                            </span>
                          )}
                        </div>
                        {periodLabel && (
                          <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                            {periodLabel}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <ul className="mb-10 mt-6 flex-1 space-y-3.5 border-t border-white/5 pt-6">
                    {planFeatures.map((feature) => (
                      <li
                        key={feature.id}
                        className={`flex items-start gap-3 text-sm ${
                          feature.is_section
                            ? `mt-2 font-bold ${isPremium ? "text-amber-300" : "text-violet-400"}`
                            : "text-neutral-300"
                        }`}
                      >
                        {!feature.is_section && (
                          <Check
                            size={16}
                            className={`mt-0.5 shrink-0 ${isPremium ? "text-amber-400" : "text-violet-500"}`}
                          />
                        )}
                        <span>{feature.feature_text}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Planes;
