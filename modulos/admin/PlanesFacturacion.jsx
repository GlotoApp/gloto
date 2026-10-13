import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  CreditCard,
  DollarSign,
  Eye,
  EyeOff,
  GripVertical,
  Heading,
  Percent,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import SuperAdminSectionShell from "./ContenedorSeccion";
import { useAdminRealtime } from "./useAdminRealtime";

const PLAN_REALTIME_TABLES = [
  "billing_plan_periods",
  "billing_plan_features",
];

const inputClass =
  "w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none transition focus:border-violet-400";
const labelClass =
  "mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-400";

const PlanesFacturacion = () => {
  const [plans, setPlans] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [features, setFeatures] = useState([]);
  const [newFeatureText, setNewFeatureText] = useState({});
  const [newFeatureIsSection, setNewFeatureIsSection] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [draggedFeatureId, setDraggedFeatureId] = useState(null);
  const [message, setMessage] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const scheduleRefresh = useCallback(() => {
    const hasUnsubmittedFeatures = Object.values(newFeatureText).some((text) =>
      text.trim(),
    );
    if (savingId === null && !hasUnsubmittedFeatures) {
      setRefreshKey((current) => current + 1);
    }
  }, [newFeatureText, savingId]);

  useAdminRealtime(PLAN_REALTIME_TABLES, scheduleRefresh);

  const fetchCatalog = useCallback(
    () =>
      Promise.all([
        supabase
          .from("billing_plan_periods")
          .select(
            "id,plan_code,plan_name,billing_type,plan_is_active,plan_display_order,code,label,duration_days,price_amount,commission_rate,minimum_amount,is_active,display_order",
          )
          .order("plan_display_order", { ascending: true }),
        supabase
          .from("billing_plan_features")
          .select("id,plan_code,feature_text,is_section,display_order,is_active")
          .order("display_order", { ascending: true }),
      ]),
    [],
  );

  const applyCatalogResults = useCallback(
    ([periodsResult, featuresResult]) => {
      if (periodsResult.error || featuresResult.error) {
        const error = periodsResult.error || featuresResult.error;
        console.error("No se pudo cargar el catálogo de planes:", error);
        setLoadError(
          error.message || "No se pudo cargar la configuración de los planes.",
        );
        setPlans([]);
        setPeriods([]);
        setFeatures([]);
      } else {
        const catalogPeriods = periodsResult.data || [];
        const planMap = new Map();
        catalogPeriods.forEach((period) => {
          if (!planMap.has(period.plan_code)) {
            planMap.set(period.plan_code, {
              id: period.plan_code,
              code: period.plan_code,
              name: period.plan_name,
              billing_type: period.billing_type,
              is_active: period.plan_is_active,
              display_order: period.plan_display_order,
            });
          }
        });
        setPlans(
          Array.from(planMap.values()).sort(
            (first, second) =>
              Number(first.display_order) - Number(second.display_order),
          ),
        );
        setPeriods(catalogPeriods);
        setFeatures(featuresResult.data || []);
      }
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    let isMounted = true;
    fetchCatalog()
      .then((results) => {
        if (isMounted) applyCatalogResults(results);
      })
      .catch((error) => {
        console.error("No se pudo cargar el catálogo de planes:", error);
        if (isMounted) {
          setLoadError("No se pudo cargar la configuración de los planes.");
          setPlans([]);
          setPeriods([]);
          setFeatures([]);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [applyCatalogResults, fetchCatalog, refreshKey]);

  const loadCatalog = async () => {
    setLoading(true);
    setLoadError("");
    try {
      applyCatalogResults(await fetchCatalog());
    } catch (error) {
      console.error("No se pudo cargar el catálogo de planes:", error);
      setLoadError("No se pudo cargar la configuración de los planes.");
      setPlans([]);
      setPeriods([]);
      setFeatures([]);
      setLoading(false);
    }
  };

  const reorderFeatures = async (planCode, targetFeatureId) => {
    const sourceFeatureId = draggedFeatureId;
    setDraggedFeatureId(null);
    if (!sourceFeatureId || sourceFeatureId === targetFeatureId) return;

    const planFeatures = features
      .filter((feature) => feature.plan_code === planCode)
      .sort(
        (first, second) =>
          Number(first.display_order) - Number(second.display_order),
      );
    const sourceIndex = planFeatures.findIndex(
      (feature) => feature.id === sourceFeatureId,
    );
    const targetIndex = planFeatures.findIndex(
      (feature) => feature.id === targetFeatureId,
    );
    if (sourceIndex < 0 || targetIndex < 0) return;

    const [movedFeature] = planFeatures.splice(sourceIndex, 1);
    planFeatures.splice(targetIndex, 0, movedFeature);
    const reorderedFeatures = planFeatures.map((feature, index) => ({
      ...feature,
      display_order: index,
    }));
    const orderById = new Map(
      reorderedFeatures.map((feature) => [feature.id, feature.display_order]),
    );

    setFeatures((current) =>
      current.map((feature) =>
        orderById.has(feature.id)
          ? { ...feature, display_order: orderById.get(feature.id) }
          : feature,
      ),
    );
    setSavingId(`feature-reorder-${planCode}`);
    setMessage(null);

    const results = await Promise.all(
      reorderedFeatures.map((feature) =>
        supabase
          .from("billing_plan_features")
          .update({ display_order: feature.display_order })
          .eq("id", feature.id),
      ),
    );
    const failedResult = results.find((result) => result.error);
    if (failedResult) {
      console.error("No se pudo guardar el orden de los ítems del plan:", failedResult.error);
      setMessage({
        type: "error",
        text:
          failedResult.error.message ||
          "No se pudo guardar el nuevo orden de los ítems.",
      });
      await loadCatalog();
    } else {
      setMessage({
        type: "success",
        text: "Orden de los ítems actualizado.",
      });
    }
    setSavingId(null);
  };

  const updatePlanField = (planId, field, value) => {
    setPlans((current) =>
      current.map((plan) =>
        plan.id === planId ? { ...plan, [field]: value } : plan,
      ),
    );
    setMessage(null);
  };

  const updatePeriodField = (periodId, field, value) => {
    setPeriods((current) =>
      current.map((period) =>
        period.id === periodId ? { ...period, [field]: value } : period,
      ),
    );
    setMessage(null);
  };

  const updateFeatureField = (featureId, field, value) => {
    setFeatures((current) =>
      current.map((feature) =>
        feature.id === featureId ? { ...feature, [field]: value } : feature,
      ),
    );
    setMessage(null);
  };

  const selectPlanHeader = async (planCode, featureId) => {
    if (savingId !== null) return;

    const planFeatures = features.filter(
      (feature) => feature.plan_code === planCode,
    );
    const headersToClear = planFeatures.filter(
      (feature) => feature.is_section && feature.id !== featureId,
    );
    const selectedFeature = planFeatures.find(
      (feature) => feature.id === featureId,
    );
    if (!selectedFeature) return;

    setFeatures((current) =>
      current.map((feature) =>
        feature.plan_code === planCode
          ? { ...feature, is_section: feature.id === featureId }
          : feature,
      ),
    );
    setSavingId(`feature-header-${planCode}`);
    setMessage(null);

    for (const feature of headersToClear) {
      const { error } = await supabase
        .from("billing_plan_features")
        .update({ is_section: false })
        .eq("id", feature.id);

      if (error) {
        console.error("No se pudo actualizar el encabezado del plan:", error);
        setMessage({
          type: "error",
          text: error.message || "No se pudo cambiar el encabezado del plan.",
        });
        await loadCatalog();
        setSavingId(null);
        return;
      }
    }

    if (!selectedFeature.is_section) {
      const { error } = await supabase
        .from("billing_plan_features")
        .update({ is_section: true })
        .eq("id", featureId);

      if (error) {
        console.error("No se pudo guardar el encabezado del plan:", error);
        setMessage({
          type: "error",
          text: error.message || "No se pudo guardar el encabezado del plan.",
        });
        await loadCatalog();
        setSavingId(null);
        return;
      }
    }

    setMessage({ type: "success", text: "Encabezado del plan actualizado." });
    setSavingId(null);
  };

  const addFeature = async (planId) => {
    const planCode = planId;
    const featureText = String(newFeatureText[planCode] || "").trim();
    if (!featureText) {
      setMessage({ type: "error", text: "Escribe el ítem que quieres agregar." });
      return;
    }

    const existingFeature = features.find(
      (feature) =>
        feature.plan_code === planCode &&
        feature.feature_text === featureText &&
        !feature.is_active,
    );
    const nextDisplayOrder =
      Math.max(
        -1,
        ...features
          .filter((feature) => feature.plan_code === planCode)
          .map((feature) => Number(feature.display_order) || 0),
      ) + 1;

    setSavingId(`feature-new-${planCode}`);
    setMessage(null);

    if (newFeatureIsSection[planCode]) {
      const previousHeaders = features.filter(
        (feature) => feature.plan_code === planCode && feature.is_section,
      );
      for (const feature of previousHeaders) {
        const { error } = await supabase
          .from("billing_plan_features")
          .update({ is_section: false })
          .eq("id", feature.id);

        if (error) {
          console.error(
            "No se pudo actualizar el encabezado del plan antes de agregar el ítem:",
            error,
          );
          setMessage({
            type: "error",
            text: error.message || "No se pudo cambiar el encabezado del plan.",
          });
          setSavingId(null);
          return;
        }
      }
      setFeatures((current) =>
        current.map((feature) =>
          feature.plan_code === planCode && feature.is_section
            ? { ...feature, is_section: false }
            : feature,
        ),
      );
    }

    const result = existingFeature
      ? await supabase
          .from("billing_plan_features")
          .update({
            is_active: true,
            is_section: Boolean(newFeatureIsSection[planCode]),
          })
          .eq("id", existingFeature.id)
          .select("id,plan_code,feature_text,is_section,display_order,is_active")
          .single()
      : await supabase
          .from("billing_plan_features")
          .insert({
            plan_code: planCode,
            feature_text: featureText,
            is_section: Boolean(newFeatureIsSection[planCode]),
            display_order: nextDisplayOrder,
            is_active: true,
          })
          .select("id,plan_code,feature_text,is_section,display_order,is_active")
          .single();

    if (result.error) {
      console.error("No se pudo agregar el ítem del plan:", result.error);
      setMessage({
        type: "error",
        text:
          result.error.message ||
          "No se pudo agregar el ítem a las características del plan.",
      });
    } else {
      setFeatures((current) => {
        const withoutPrevious = current.filter(
          (feature) => feature.id !== result.data.id,
        );
        return [...withoutPrevious, result.data];
      });
      setNewFeatureText((current) => ({ ...current, [planCode]: "" }));
      setNewFeatureIsSection((current) => ({ ...current, [planCode]: false }));
      setMessage({
        type: "success",
        text: existingFeature
          ? "Ítem del plan reactivado."
          : "Ítem agregado al plan.",
      });
    }
    setSavingId(null);
  };

  const saveFeature = async (feature) => {
    const featureText = feature.feature_text.trim();
    const displayOrder = Number(feature.display_order);
    if (!featureText || !Number.isInteger(displayOrder) || displayOrder < 0) {
      setMessage({
        type: "error",
        text: "Cada ítem necesita texto y un orden entero igual o mayor que cero.",
      });
      return;
    }

    setSavingId(feature.id);
    setMessage(null);
    const { error } = await supabase
      .from("billing_plan_features")
      .update({
        feature_text: featureText,
        is_section: Boolean(feature.is_section),
        display_order: displayOrder,
        is_active: Boolean(feature.is_active),
      })
      .eq("id", feature.id);

    if (error) {
      console.error("No se pudo guardar el ítem del plan:", error);
      setMessage({
        type: "error",
        text: error.message || "No se pudo guardar el ítem del plan.",
      });
    } else {
      setFeatures((current) =>
        current.map((item) =>
          item.id === feature.id
            ? { ...feature, feature_text: featureText, display_order: displayOrder }
            : item,
        ),
      );
      setMessage({
        type: "success",
        text: "Ítem del plan actualizado correctamente.",
      });
    }
    setSavingId(null);
  };

  const savePlan = async (plan) => {
    if (!plan.name.trim()) {
      setMessage({
        type: "error",
        text: "Escribe un nombre para el plan antes de guardar.",
      });
      return;
    }

    setSavingId(plan.id);
    setMessage(null);
    const { error } = await supabase
      .from("billing_plan_periods")
      .update({
        plan_name: plan.name.trim(),
        plan_is_active: Boolean(plan.is_active),
      })
      .eq("plan_code", plan.code);

    if (error) {
      console.error("No se pudo guardar el plan:", error);
      setMessage({
        type: "error",
        text: error.message || `No se pudo guardar el plan ${plan.name}.`,
      });
    } else {
      try {
        const results = await fetchCatalog();
        applyCatalogResults(results);
        const refreshError = results.find((result) => result.error)?.error;
        setMessage(
          refreshError
            ? {
                type: "error",
                text: "El plan se guardó, pero no se pudo recargar el catálogo.",
              }
            : {
                type: "success",
                text: `Plan ${plan.name} actualizado correctamente.`,
              },
        );
      } catch (refreshError) {
        console.error("No se pudo recargar el catálogo después de guardar:", refreshError);
        setMessage({
          type: "error",
          text: "El plan se guardó, pero no se pudo recargar el catálogo.",
        });
      }
    }
    setSavingId(null);
  };

  const savePeriod = async (period, plan) => {
    const isCommission = plan.billing_type === "commission";
    const value = isCommission
      ? Number(period.commission_rate)
      : Number(period.price_amount);
    const minimum = isCommission ? Number(period.minimum_amount) : null;

    if (!Number.isFinite(value) || value < 0 || (isCommission && value > 100)) {
      setMessage({
        type: "error",
        text: isCommission
          ? "La comisión del periodo debe estar entre 0 y 100%."
          : "El precio del periodo debe ser un valor válido.",
      });
      return;
    }
    if (isCommission && (!Number.isFinite(minimum) || minimum < 0)) {
      setMessage({
        type: "error",
        text: "El mínimo del periodo debe ser un valor válido.",
      });
      return;
    }

    setSavingId(period.id);
    setMessage(null);
    const { error } = await supabase
      .from("billing_plan_periods")
      .update({
        price_amount: isCommission ? 0 : Number(period.price_amount),
        commission_rate: isCommission
          ? Number(period.commission_rate)
          : null,
        minimum_amount: isCommission ? Number(period.minimum_amount) : null,
        is_active: Boolean(period.is_active),
      })
      .eq("id", period.id);

    if (error) {
      console.error("No se pudo guardar el periodo del plan:", error);
      setMessage({
        type: "error",
        text:
          error.message ||
          `No se pudo guardar el periodo ${period.label} de ${plan.name}.`,
      });
    } else {
      try {
        const results = await fetchCatalog();
        applyCatalogResults(results);
        const refreshError = results.find((result) => result.error)?.error;
        setMessage(
          refreshError
            ? {
                type: "error",
                text: "El precio se guardó, pero no se pudo recargar el catálogo. Actualiza la página para verificar los valores.",
              }
            : {
                type: "success",
                text: `Periodo ${period.label} de ${plan.name} actualizado.`,
              },
        );
      } catch (refreshError) {
        console.error("No se pudo recargar el catálogo después de guardar:", refreshError);
        setMessage({
          type: "error",
          text: "El precio se guardó, pero no se pudo recargar el catálogo. Actualiza la página para verificar los valores.",
        });
      }
    }
    setSavingId(null);
  };

  return (
    <SuperAdminSectionShell
      title="Planes"
      subtitle="Administra precios, comisiones y periodos disponibles para las tiendas."
      badge="Facturación"
      actions={
        <button
          type="button"
          onClick={loadCatalog}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          <span className="sr-only">Actualizar</span>
        </button>
      }
    >
      {message && (
        <p
          role={message.type === "error" ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.type === "error"
              ? "border-red-500/20 bg-red-500/10 text-red-200"
              : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {message.text}
        </p>
      )}

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-neutral-900/75 p-10 text-center text-sm text-neutral-400">
          Cargando planes y periodos...
        </div>
      ) : loadError ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-200"
        >
          <ShieldAlert size={18} className="mt-0.5 shrink-0" />
          <div className="space-y-3">
            <p>{loadError}</p>
            <button
              type="button"
              onClick={loadCatalog}
              className="rounded-lg border border-red-400/20 px-3 py-1.5 font-semibold hover:bg-red-500/10"
            >
              Reintentar
            </button>
          </div>
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-neutral-900/50 p-10 text-center text-sm text-neutral-400">
          No hay planes configurados en el catálogo de facturación.
        </div>
      ) : (
        <div className="space-y-5">
          {plans.map((plan) => {
            const planPeriods = periods.filter(
              (period) => period.plan_code === plan.code,
            );
            const planFeatures = features
              .filter((feature) => feature.plan_code === plan.code)
              .sort(
                (first, second) =>
                  Number(first.display_order) - Number(second.display_order),
              );
            const isCommission = plan.billing_type === "commission";

            return (
              <section
                key={plan.id}
                className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/75"
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
                      <CreditCard size={18} />
                    </span>
                    <div>
                      <h3 className="font-bold text-white">{plan.name}</h3>
                      <p className="text-xs text-neutral-500">
                        Código: {plan.code} ·{" "}
                        {isCommission ? "Por comisión" : "Precio fijo"}
                      </p>
                    </div>
                  </div>
                  <label
                    className={`inline-flex cursor-pointer items-center rounded-lg border p-2 transition ${
                      plan.is_active
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                        : "border-white/10 bg-white/5 text-neutral-500"
                    }`}
                    title={plan.is_active ? "Plan disponible" : "Plan desactivado"}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(plan.is_active)}
                      onChange={(event) =>
                        updatePlanField(
                          plan.id,
                          "is_active",
                          event.target.checked,
                        )
                      }
                      aria-label={`Plan ${plan.name}: ${
                        plan.is_active ? "disponible" : "desactivado"
                      }`}
                      className="sr-only"
                    />
                    {plan.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                  </label>
                </header>

                <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <label>
                    <span className={labelClass}>Nombre del plan</span>
                    <input
                      value={plan.name}
                      onChange={(event) =>
                        updatePlanField(plan.id, "name", event.target.value)
                      }
                      className={inputClass}
                      maxLength={100}
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => savePlan(plan)}
                      disabled={savingId === plan.id}
                      aria-label={`Guardar plan ${plan.name}`}
                      title="Guardar plan"
                      className="inline-flex items-center justify-center rounded-xl bg-violet-600 p-2.5 text-white transition hover:bg-violet-500 disabled:cursor-wait disabled:opacity-60"
                    >
                      <Save size={17} className={savingId === plan.id ? "animate-pulse" : ""} />
                    </button>
                  </div>
                </div>

                <div className="border-t border-white/10 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        Precios y periodos
                      </h4>
                      <p className="mt-1 text-xs text-neutral-500">
                        {planPeriods.length} periodos
                      </p>
                      {plan.code === "premium" && isCommission && (
                        <p className="mt-1 text-xs text-violet-300/80">
                          Configura una comisión y un mínimo independientes
                          para cada periodo.
                        </p>
                      )}
                    </div>
                  </div>
                  {planPeriods.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-neutral-500">
                      Este plan no tiene periodos de cobro configurados.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {planPeriods.map((period) => (
                        <div
                          key={period.id}
                          className={`grid gap-3 rounded-xl border border-white/10 bg-neutral-950/50 p-3 sm:grid-cols-2 xl:items-center ${
                            isCommission
                              ? "xl:grid-cols-[minmax(160px,1.1fr)_minmax(160px,1fr)_minmax(160px,1fr)_auto_auto]"
                              : "xl:grid-cols-[minmax(180px,1.2fr)_minmax(220px,1fr)_auto_auto]"
                          }`}
                        >
                          <div className="flex flex-col justify-center">
                            <p className="text-sm font-semibold text-white">
                              {period.label}
                            </p>
                            <p className="flex items-center gap-1 text-xs text-neutral-500">
                              <CalendarDays size={12} aria-hidden="true" />
                              {period.duration_days} días
                            </p>
                          </div>
                          <label className="relative block">
                            <span className="sr-only">
                              {isCommission
                                ? "Comisión (%) · este periodo"
                                : "Precio (COP)"}
                            </span>
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                            >
                              {isCommission ? <Percent size={15} /> : <DollarSign size={15} />}
                            </span>
                            <input
                              type="number"
                              min="0"
                              max={isCommission ? "100" : undefined}
                              step={isCommission ? "0.01" : "500"}
                              value={
                                isCommission
                                  ? (period.commission_rate ?? "")
                                  : (period.price_amount ?? "")
                              }
                              aria-label={isCommission
                                ? `Comisión para ${period.label} en porcentaje`
                                : `Precio para ${period.label} en COP`}
                              onChange={(event) =>
                                updatePeriodField(
                                  period.id,
                                  isCommission
                                    ? "commission_rate"
                                    : "price_amount",
                                  event.target.value,
                                )
                              }
                              className={`${inputClass} pl-9`}
                            />
                          </label>
                          {isCommission && (
                            <label className="relative block">
                              <span className="sr-only">Mínimo (COP)</span>
                              <DollarSign
                                size={15}
                                aria-hidden="true"
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                              />
                              <input
                                type="number"
                                min="0"
                                step="500"
                                value={period.minimum_amount ?? ""}
                                aria-label={`Mínimo para ${period.label} en COP`}
                                onChange={(event) =>
                                  updatePeriodField(
                                    period.id,
                                    "minimum_amount",
                                    event.target.value,
                                  )
                                }
                                className={`${inputClass} pl-9`}
                              />
                            </label>
                          )}
                          <label
                            className={`inline-flex cursor-pointer items-center rounded-lg border p-2 transition ${
                              period.is_active
                                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                                : "border-white/10 bg-white/5 text-neutral-500"
                            }`}
                            title={period.is_active ? "Periodo disponible" : "Periodo desactivado"}
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(period.is_active)}
                              onChange={(event) =>
                                updatePeriodField(
                                  period.id,
                                  "is_active",
                                  event.target.checked,
                                )
                              }
                              aria-label={`Periodo ${period.label}: ${
                                period.is_active ? "disponible" : "desactivado"
                              }`}
                              className="sr-only"
                            />
                            {period.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                          </label>
                          <button
                            type="button"
                            onClick={() => savePeriod(period, plan)}
                            disabled={savingId === period.id}
                            aria-label={`Guardar periodo ${period.label}`}
                            title="Guardar periodo"
                            className="inline-flex items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 p-2 text-violet-100 transition hover:bg-violet-500/20 disabled:cursor-wait disabled:opacity-60"
                          >
                            <Save
                              size={16}
                              className={savingId === period.id ? "animate-pulse" : ""}
                            />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-white/10 p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        Ítems incluidos
                      </h4>
                      <p className="mt-1 text-xs text-neutral-500">
                        Administra las características que aparecen en la
                        tarjeta de este plan.
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-neutral-400">
                      {planFeatures.filter((feature) => feature.is_active).length}{" "}
                      visibles
                    </span>
                  </div>

                  <div className="space-y-2">
                    {planFeatures.map((feature) => (
                      <div
                        key={feature.id}
                        onDragOver={(event) => {
                          if (
                            draggedFeatureId &&
                            draggedFeatureId !== feature.id
                          ) {
                            event.preventDefault();
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          void reorderFeatures(plan.code, feature.id);
                        }}
                        className={`grid gap-2 rounded-xl border p-3 transition sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] ${
                          feature.is_active
                            ? "border-white/10 bg-neutral-950/50"
                            : "border-dashed border-white/10 opacity-60"
                        } ${
                          draggedFeatureId === feature.id
                            ? "opacity-40"
                            : draggedFeatureId
                              ? "border-violet-400/30"
                              : ""
                        }`}
                      >
                        <button
                          type="button"
                          draggable={savingId === null}
                          onDragStart={() => setDraggedFeatureId(feature.id)}
                          onDragEnd={() => setDraggedFeatureId(null)}
                          disabled={savingId !== null}
                          aria-label={`Arrastrar para reordenar: ${feature.feature_text}`}
                          title="Arrastra para cambiar el orden"
                          className="inline-flex h-9 w-7 cursor-grab items-center justify-center self-end rounded-lg text-neutral-500 transition hover:bg-white/[0.06] hover:text-white active:cursor-grabbing disabled:cursor-not-allowed"
                        >
                          <GripVertical size={17} />
                        </button>
                        <label>
                          <span className="sr-only">Texto del ítem</span>
                          <input
                            value={feature.feature_text}
                            aria-label="Texto del ítem"
                            onChange={(event) =>
                              updateFeatureField(
                                feature.id,
                                "feature_text",
                                event.target.value,
                              )
                            }
                            maxLength={200}
                            className={inputClass}
                          />
                        </label>
                        <label
                          className={`inline-flex cursor-pointer items-center self-end rounded-lg border p-2 transition ${
                            planFeatures.find((item) => item.is_section)?.id ===
                            feature.id
                              ? "border-violet-400/30 bg-violet-500/10 text-violet-200"
                              : "border-white/10 text-neutral-500 hover:text-neutral-200"
                          }`}
                          title="Elegir como encabezado único del plan"
                        >
                          <input
                            type="radio"
                            name={`plan-header-${plan.code}`}
                            checked={
                              planFeatures.find((item) => item.is_section)
                                ?.id === feature.id
                            }
                            onChange={() =>
                              void selectPlanHeader(plan.code, feature.id)
                            }
                            aria-label={`Elegir ${feature.feature_text} como encabezado único`}
                            disabled={savingId !== null}
                            className="sr-only"
                          />
                          <Heading size={16} />
                        </label>
                        <div className="flex items-end gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateFeatureField(
                                feature.id,
                                "is_active",
                                !feature.is_active,
                              )
                            }
                            aria-label={feature.is_active
                              ? `Ocultar ${feature.feature_text}`
                              : `Mostrar ${feature.feature_text}`}
                            title={feature.is_active ? "Ocultar" : "Mostrar"}
                            className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                              feature.is_active
                                ? "border-red-500/20 text-red-200 hover:bg-red-500/10"
                                : "border-emerald-500/20 text-emerald-200 hover:bg-emerald-500/10"
                            }`}
                          >
                            {feature.is_active ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => saveFeature(feature)}
                            disabled={savingId === feature.id}
                            aria-label={`Guardar ${feature.feature_text}`}
                            title="Guardar ítem"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white transition hover:bg-violet-500 disabled:cursor-wait disabled:opacity-60"
                          >
                            <Save size={15} className={savingId === feature.id ? "animate-pulse" : ""} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {planFeatures.length === 0 && (
                      <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-neutral-500">
                        Este plan aún no tiene ítems configurados.
                      </p>
                    )}
                  </div>

                  <form
                    className="mt-3 grid gap-2 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                    onSubmit={(event) => {
                      event.preventDefault();
                      addFeature(plan.id);
                    }}
                  >
                    <label>
                      <span className={labelClass}>Agregar ítem</span>
                      <input
                        value={newFeatureText[plan.id] || ""}
                        onChange={(event) =>
                          setNewFeatureText((current) => ({
                            ...current,
                            [plan.id]: event.target.value,
                          }))
                        }
                        maxLength={200}
                        placeholder="Ej.: Productos ilimitados"
                        className={inputClass}
                      />
                    </label>
                    <label
                    className={`inline-flex cursor-pointer items-center self-end rounded-lg border p-2 transition ${
                        newFeatureIsSection[plan.id]
                          ? "border-violet-400/30 bg-violet-500/10 text-violet-200"
                          : "border-white/10 text-neutral-500 hover:text-neutral-200"
                      }`}
                    title="Agregar como encabezado único"
                    >
                      <input
                      type="radio"
                      name={`new-plan-header-${plan.code}`}
                      checked={Boolean(newFeatureIsSection[plan.id])}
                      onChange={() =>
                        setNewFeatureIsSection((current) => ({
                          ...current,
                          [plan.id]: true,
                        }))
                      }
                      aria-label="Agregar como encabezado único"
                      className="sr-only"
                    />
                      <Heading size={16} />
                    </label>
                    <button
                      type="submit"
                      disabled={
                        savingId === `feature-new-${plan.id}` ||
                        !String(newFeatureText[plan.id] || "").trim()
                      }
                      aria-label="Agregar ítem"
                      title="Agregar ítem"
                      className="inline-flex items-center justify-center self-end rounded-xl border border-violet-500/30 bg-violet-500/10 p-2.5 text-violet-100 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Plus size={15} />
                    </button>
                  </form>
                </div>

              </section>
            );
          })}
        </div>
      )}

      <div
        role="note"
        aria-label="Cambiar el precio mensual actualiza también el precio principal del plan; el trimestral conserva su propio costo. Los nuevos precios se aplican a compras y renovaciones futuras, sin alterar cobros históricos."
        title="El precio mensual actualiza el principal del plan; el trimestral es independiente. Los cambios aplican a compras y renovaciones futuras."
        className="flex justify-end text-amber-200/70"
      >
        <BadgeCheck size={17} aria-hidden="true" />
      </div>
    </SuperAdminSectionShell>
  );
};

export default PlanesFacturacion;
