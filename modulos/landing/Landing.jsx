import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  CreditCard,
  Crown,
  LayoutDashboard,
  Menu,
  PackageCheck,
  Rocket,
  Settings2,
  ShoppingBag,
  Store,
  TabletSmartphone,
  Users,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { resolveImageUrl, supabase } from "../../src/lib/supabaseClient";
import "./landing.css";

const modules = [
  {
    icon: LayoutDashboard,
    title: "Punto de venta",
    text: "Vende, cobra y registra cada operación sin cambiar de herramienta.",
  },
  {
    icon: ShoppingBag,
    title: "Pedidos",
    text: "Unifica pedidos internos y ventas de canal digital en un solo flujo.",
  },
  {
    icon: PackageCheck,
    title: "Inventario",
    text: "Controla productos, insumos, movimientos y existencias.",
  },
  {
    icon: BarChart3,
    title: "Analítica",
    text: "Consulta ventas y comportamiento del negocio con reportes claros.",
  },
  {
    icon: WalletCards,
    title: "Caja",
    text: "Haz cierres, revisa diferencias y lleva el control financiero.",
  },
  {
    icon: Users,
    title: "Equipo",
    text: "Asigna permisos por rol y controla lo que puede hacer cada usuario.",
  },
];

const formatCurrency = (value) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const planLimit = (code) => {
  const normalized = String(code || "").toLowerCase();
  if (normalized.includes("premium")) return "Tickets POS ilimitados";
  if (normalized.includes("pro")) return "Hasta 2.000 tickets POS";
  if (normalized.includes("inicial")) return "Hasta 1.000 tickets POS";
  return null;
};

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [plans, setPlans] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [planFeatures, setPlanFeatures] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [selectedPeriodCode, setSelectedPeriodCode] = useState("monthly");
  const [businesses, setBusinesses] = useState([]);
  const [businessesLoading, setBusinessesLoading] = useState(true);
  const businessTrackRef = useRef(null);
  const [posStep, setPosStep] = useState(1);
  const [sceneStep, setSceneStep] = useState(0);

  useEffect(() => {
    document.documentElement.classList.add("landing-document");
    let active = true;

    const loadPlans = async () => {
      const [periodResult, featureResult] = await Promise.all([
        supabase
          .from("billing_plan_periods")
          .select("id,plan_code,plan_name,billing_type,plan_is_active,plan_display_order,code,label,duration_days,price_amount,commission_rate,minimum_amount,display_order,is_active")
          .eq("is_active", true)
          .eq("plan_is_active", true)
          .order("display_order", { ascending: true }),
        supabase
          .from("billing_plan_features")
          .select("id,plan_code,feature_text,is_section,display_order,is_active")
          .eq("is_active", true)
          .order("display_order", { ascending: true }),
      ]);

      if (!active) return;
      setPlansLoading(false);
      if (periodResult.error) {
        console.error("No se pudo cargar el catálogo público de planes:", periodResult.error);
      }
      if (featureResult.error) {
        console.error("No se pudieron cargar las características públicas de los planes:", featureResult.error);
      }
      if (!periodResult.error) setPeriods(periodResult.data || []);
      if (!featureResult.error) setPlanFeatures(featureResult.data || []);

      const planMap = new Map();
      (periodResult.data || []).forEach((period) => {
        if (!planMap.has(period.plan_code)) {
          planMap.set(period.plan_code, {
            code: period.plan_code,
            name: period.plan_name,
            billing_type: period.billing_type,
            display_order: period.plan_display_order,
          });
        }
      });
      setPlans(
        Array.from(planMap.values()).sort(
          (first, second) => Number(first.display_order) - Number(second.display_order),
        ),
      );
    };

    const loadBusinesses = async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("id,name,logo_url,is_active,admin_suspended")
        .eq("is_active", true)
        .eq("admin_suspended", false)
        .order("created_at", { ascending: false })
        .limit(16);

      if (!active) return;
      if (error) {
        setBusinessesLoading(false);
        return;
      }

      const resolved = await Promise.all(
        (data || []).map(async (business) => ({
          id: business.id,
          name: business.name,
          logo: await resolveImageUrl(business.logo_url),
        })),
      );
      if (active) {
        setBusinesses(
          resolved.filter(
            (business) =>
              business.name &&
              business.logo &&
              business.logo !== "/default.png",
          ),
        );
        setBusinessesLoading(false);
      }
    };

    loadBusinesses();
    loadPlans();
    return () => {
      active = false;
      document.documentElement.classList.remove("landing-document");
    };
  }, []);

  useEffect(() => {
    const elements = document.querySelectorAll(
      ".landing-reveal, .landing-module-grid article, .landing-plan-card, .landing-scene-card",
    );
    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px" },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [plansLoading, businesses]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setPosStep((current) => (current + 1) % 5);
    }, 1800);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setSceneStep((current) => (current + 1) % 3);
    }, 2600);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (businesses.length === 0) return;
    const track = businessTrackRef.current;
    if (!track) return;

    let frameId = 0;
    let position = 0;
    let previousTime = performance.now();

    const firstSet = track.querySelector(".landing-business-set");
    const setWidth = firstSet?.getBoundingClientRect().width || 0;
    if (!setWidth) return;

    const animate = (time) => {
      const elapsed = Math.min(time - previousTime, 32);
      previousTime = time;
      position -= elapsed * 0.025;
      if (position <= -setWidth) position += setWidth;
      track.style.transform = `translate3d(${position}px, 0, 0)`;
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [businesses]);


  const closeMenu = () => setMenuOpen(false);
  const openRequestModal = () => {
    closeMenu();
    window.dispatchEvent(new CustomEvent("open-gloto-request"));
  };
  const periodOptions = Array.from(
    new Map(periods.map((period) => [period.code, period])).values(),
  );

  return (
    <div className="landing-page">
      <header className="landing-nav-wrap">
        <nav className="landing-nav" aria-label="Navegación principal">
          <Link className="landing-brand" to="/" onClick={closeMenu} aria-label="Gloto inicio">
            <img src="/favicon.png" alt="" />
            <span>GLOTO</span>
          </Link>

          <div className="landing-mobile-actions">
            <button
              type="button"
              className="landing-mobile-cta"
              onClick={openRequestModal}
            >
              Empieza gratis
            </button>
            <button
              className="landing-menu-button"
              type="button"
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>

          <div className={`landing-nav-links ${menuOpen ? "is-open" : ""}`}>
            <a href="#productos" onClick={closeMenu}>Producto</a>
            <a href="#beneficios" onClick={closeMenu}>Beneficios</a>
            <a href="#planes" onClick={closeMenu}>Planes</a>
            <a href="#preguntas" onClick={closeMenu}>Preguntas</a>
            <Link className="landing-nav-login" to="/login" onClick={closeMenu}>Iniciar sesión</Link>
            <button type="button" className="landing-nav-cta" onClick={openRequestModal}>
              Empieza gratis <ArrowRight size={16} />
            </button>
          </div>
        </nav>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-photo" aria-hidden="true" />
          <div className="landing-hero-grid landing-container">
            <div className="landing-hero-copy">
              <div className="landing-eyebrow">
                <span />
                Control operativo y ventas
              </div>
              <h1>Más orden. Más eficiencia. Más ventas.</h1>
              <p>
                Organiza tu operación, conoce tus resultados y vende con una plataforma que conecta caja, inventario, pedidos y equipo en tiempo real.
              </p>
              <div className="landing-hero-actions">
                <button type="button" className="landing-primary-button" onClick={openRequestModal}>
                  Empieza gratis <ArrowRight size={18} />
                </button>
                <a className="landing-secondary-button" href="#productos">Ver cómo funciona</a>
              </div>
            </div>

            <div className="landing-hero-visual" aria-label="Vista previa del panel de Gloto">
              <div className="landing-window">
                <div className="landing-window-top">
                  <div className="landing-window-brand">
                    <img src="/favicon.png" alt="" />
                    <strong>Gloto</strong>
                  </div>
                  <div className="landing-window-profile">AD</div>
                </div>
                <div className="landing-window-body">
                  <aside>
                      {[
                        [LayoutDashboard, "Resumen"],
                        [ShoppingBag, "Punto de venta"],
                        [PackageCheck, "Inventario"],
                        [BarChart3, "Analítica"],
                        [Settings2, "Configuración"],
                      ].map(([Icon, label], index) => (
                        <span
                          className={(posStep % 5) === index ? "active" : ""}
                          title={label}
                          key={label}
                        >
                          <Icon size={17} />
                        </span>
                      ))}
                  </aside>
                  <div className="landing-window-main">
                    <div className="landing-window-heading">
                      <div>
                        <small key={`small-${posStep}`}>
                          {["Resumen general", "Venta rápida", "Control de existencias", "Resultados del negocio", "Configuración"][posStep]}
                        </small>
                        <strong key={`title-${posStep}`}>
                          {["Mi negocio", "Punto de venta", "Inventario", "Analítica", "Ajustes"][posStep]}
                        </strong>
                      </div>
                      <span>
                        {["Hoy", "Venta #1048", "Inventario activo", "Últimos 30 días", "Equipo"][posStep]}
                      </span>
                    </div>
                    <div className="landing-window-content" key={`scene-${posStep}`}>
                      {posStep === 0 && (
                        <div className="landing-visual-summary">
                          <div className="landing-summary-card main">
                            <span>Ventas del día</span>
                            <strong>$2.840.500</strong>
                            <i><b /></i>
                            <small>Meta diaria: 82%</small>
                          </div>
                          <div className="landing-summary-card">
                            <span>Pedidos</span><strong>86</strong><small>12 activos</small>
                          </div>
                          <div className="landing-summary-card">
                            <span>Caja</span><strong>$890.000</strong><small>Sin diferencias</small>
                          </div>
                          <div className="landing-summary-chart">
                            {[42,58,48,72,61,88,76].map((height,index)=><i key={index} style={{height:`${height}%`}} />)}
                          </div>
                        </div>
                      )}

                      {posStep === 1 && (
                        <>
                          <article className="landing-pos-products">
                            <div className="landing-pos-categories">
                              <span className="active">Todos</span><span>Más vendidos</span><span>Novedades</span>
                            </div>
                            <div className="landing-pos-grid">
                              {[
                                ["Producto A","$18.500"],["Producto B","$24.900"],["Producto C","$32.000"],
                                ["Producto D","$15.500"],["Producto E","$21.800"],["Producto F","$28.500"],
                              ].map(([name,price],index)=>(
                                <div className={`landing-pos-product ${index === posStep % 6 ? "is-active" : ""}`} key={name}>
                                  <span>{String(index+1).padStart(2,"0")}</span><strong>{name}</strong><small>{price}</small>
                                </div>
                              ))}
                            </div>
                          </article>
                          <article className="landing-pos-cart">
                            <div className="landing-panel-heading"><strong>Orden actual</strong><span className="landing-pos-live"><i /> En proceso</span></div>
                            <div className="landing-pos-cart-row"><span>2 ×</span><strong>Producto A</strong><b>$37.000</b></div>
                            <div className="landing-pos-cart-row"><span>1 ×</span><strong>Producto C</strong><b>$32.000</b></div>
                            <div className="landing-pos-total"><span>Total</span><strong>$69.000</strong></div>
                            <button type="button">Cobrar</button>
                          </article>
                        </>
                      )}

                      {posStep === 2 && (
                        <div className="landing-visual-inventory">
                          <div className="landing-inventory-heading"><strong>Inventario</strong><span>128 productos</span></div>
                          {[
                            ["Producto A","42 disponibles","Normal"],
                            ["Insumo B","8 disponibles","Bajo"],
                            ["Producto C","120 disponibles","Normal"],
                            ["Insumo D","15 disponibles","Revisar"],
                          ].map(([name,stock,status])=>(
                            <div className="landing-inventory-row" key={name}>
                              <span>{name.charAt(0)}</span><div><strong>{name}</strong><small>{stock}</small></div><b className={status === "Normal" ? "ok" : "warn"}>{status}</b>
                            </div>
                          ))}
                        </div>
                      )}

                      {posStep === 3 && (
                        <div className="landing-visual-analytics">
                          <div className="landing-analytics-top">
                            <div><span>Ingresos netos</span><strong>$7.910.000</strong></div>
                            <b>+12.4%</b>
                          </div>
                          <div className="landing-analytics-chart">
                            {[42,65,52,78,68,92,84,96,72,88].map((height,index)=><i key={index} style={{height:`${height}%`}} />)}
                          </div>
                          <div className="landing-analytics-values"><span>486 ventas</span><span>$17.300 ticket</span><span>Producto C líder</span></div>
                        </div>
                      )}

                      {posStep === 4 && (
                        <div className="landing-visual-settings">
                          <div className="landing-settings-title"><strong>Configuración</strong><span>Negocio activo</span></div>
                          {[
                            ["Negocio","Datos generales"],
                            ["Equipo","10 usuarios"],
                            ["Pagos","Métodos habilitados"],
                            ["Permisos","Roles configurados"],
                          ].map(([name,detail])=>(
                            <div className="landing-settings-row" key={name}><span>{name.charAt(0)}</span><div><strong>{name}</strong><small>{detail}</small></div><b>›</b></div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-proof-strip" aria-label="Características principales">
          {businessesLoading ? (
            <div className="landing-business-marquee landing-business-loading" aria-label="Cargando negocios">
              <div className="landing-business-loading-bar" />
            </div>
          ) : businesses.length > 0 ? (
            <>
              <p className="landing-businesses-title">Negocios que confían en Gloto</p>
              <div className="landing-business-marquee" aria-label="Negocios asociados a Gloto">
                <div className="landing-business-track" ref={businessTrackRef}>
                  {[0, 1].map((copy) => (
                    <div className="landing-business-set" key={copy} aria-hidden={copy === 1}>
                      {businesses.map((business) => (
                        <article className="landing-business-logo" key={`${copy}-${business.id}`} aria-label={business.name}>
                          <img src={business.logo} alt="" />
                          <strong>{business.name}</strong>
                        </article>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="landing-container landing-feature-strip">
              <p>Todo lo que necesitas para operar sin perder el control</p>
              <div>
                <span><TabletSmartphone /> Multidispositivo</span>
                <span><CreditCard /> Pagos y caja</span>
                <span><Store /> Varios puntos</span>
                <span><PackageCheck /> Inventario actualizado</span>
              </div>
            </div>
          )}
        </section>

        <section className="landing-business-scenes landing-reveal" aria-label="Negocios que pueden usar Gloto">
          <div className="landing-container">
            <div className="landing-scene-heading">
              <div>
                <span>Funciona para tu tipo de negocio</span>
                <h2>Una operación clara, sin importar la venta.</h2>
              </div>
              <p>Desde una tienda física hasta una empresa de servicios, Gloto organiza el trabajo cotidiano en una sola plataforma.</p>
            </div>

            <div className={`landing-scene-grid landing-scene-step-${sceneStep}`}>
              <article className="landing-scene-card landing-scene-card-large">
                <img
                  src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=85"
                  alt="Restaurante con mesas y ambiente de atención"
                />
                <div className="landing-scene-overlay">
                  <span>Restaurantes y gastronomía</span>
                  <h3>Ordena ventas, pedidos y operación en cocina.</h3>
                </div>
              </article>

              <article className="landing-scene-card">
                <img
                  src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=900&q=85"
                  alt="Dashboard de estadísticas y ventas"
                />
                <div className="landing-scene-overlay">
                  <span>Estadísticas y resultados</span>
                  <h3>Consulta ventas, caja e indicadores en tiempo real.</h3>
                </div>
              </article>

              <article className="landing-scene-card">
                <img
                  src="https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=900&q=85"
                  alt="Equipo de negocio trabajando en una reunión"
                />
                <div className="landing-scene-overlay">
                  <span>Servicios y equipos</span>
                  <h3>Coordina roles y resultados.</h3>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="landing-modules landing-reveal" id="productos">
          <div className="landing-container">
            <div className="landing-section-heading" id="beneficios">
              <span>Todo en un solo sistema</span>
              <h2>Diseñado para lo que realmente pasa cada día.</h2>
              <p>Gloto conecta ventas, operación y administración para que puedas decidir con información actualizada.</p>
            </div>
            <div className="landing-module-grid">
              {modules.map(({ icon: Icon, title, text }, index) => (
                <article className={index === 0 ? "featured" : ""} key={title}>
                  <div className="landing-module-icon"><Icon size={22} /></div>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                  <ChevronRight size={18} />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-daily landing-reveal">
          <div className="landing-container landing-daily-grid">
            <div className="landing-daily-copy">
              <span>Operación diaria</span>
              <h2>Descubre diferencias antes de que se conviertan en pérdidas.</h2>
              <p>Gloto reúne información de ventas, cobros y movimientos para que el cierre sea rápido y entendible.</p>
              <ul>
                <li><Check size={16} /> Registro de efectivo y medios de pago</li>
                <li><Check size={16} /> Comparación entre lo esperado y lo contado</li>
                <li><Check size={16} /> Reporte disponible al terminar el turno</li>
              </ul>
            </div>
            <div className="landing-close-preview">
              <div className="landing-close-heading">
                <div>
                  <small>Cierre de caja</small>
                  <strong>Turno de hoy</strong>
                </div>
                <span>Cuadrado</span>
              </div>
              <div className="landing-close-amount">
                <small>Ventas totales</small>
                <strong>$2.340.000</strong>
              </div>
              <div className="landing-close-row">
                <span>Efectivo esperado</span>
                <strong>$890.000</strong>
              </div>
              <div className="landing-close-row">
                <span>Efectivo contado</span>
                <strong>$890.000</strong>
              </div>
              <div className="landing-close-result">
                <span><Check size={16} /> Diferencia</span>
                <strong>$0</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-plans landing-reveal" id="planes">
          <div className="landing-container">
            <div className="landing-plan-heading">
              <div>
                <span>Planes de Gloto</span>
                <h2>Elige cómo quieres operar y crecer.</h2>
              </div>
              <p>Precios configurados directamente en el sistema. Sin permanencia ni costos ocultos.</p>
            </div>

            {periodOptions.length > 1 && (
              <div className="landing-period-switch" aria-label="Periodo de facturación">
                {periodOptions.map((period) => (
                  <button
                    type="button"
                    key={period.code}
                    className={selectedPeriodCode === period.code ? "active" : ""}
                    aria-pressed={selectedPeriodCode === period.code}
                    onClick={() => setSelectedPeriodCode(period.code)}
                  >
                    {period.label}
                  </button>
                ))}
              </div>
            )}

            <div className="landing-plan-grid">
              {plansLoading ? (
                <div className="landing-plan-loading">Cargando planes disponibles...</div>
              ) : plans.length === 0 ? (
                <div className="landing-plan-loading">No hay planes activos disponibles en este momento.</div>
              ) : plans.map((plan) => {
                const planPeriods = periods.filter((period) => period.plan_code === plan.code);
                const period =
                  planPeriods.find((item) => item.code === selectedPeriodCode) ||
                  planPeriods.find((item) => item.code === "monthly") ||
                  planPeriods[0];
                const features = planFeatures
                  .filter((feature) => feature.plan_code === plan.code && !feature.is_section)
                  .map((feature) => feature.feature_text);
                const isPro = plan.code === "pro";
                const isPremium = plan.code === "premium";
                const isCommission = plan.billing_type === "commission";
                const limit = planLimit(plan.code);

                return (
                  <article
                    className={`landing-plan-card ${isPro ? "recommended" : ""} ${isPremium ? "premium" : ""}`}
                    key={plan.code}
                  >
                    {(isPro || isPremium) && (
                      <span className="landing-plan-badge">{isPremium ? "Más completo" : "Más elegido"}</span>
                    )}
                    <div className="landing-plan-name">
                      {isPremium ? <Crown size={21} /> : isPro ? <Zap size={21} /> : <Rocket size={21} />}
                      <h3>{plan.name}</h3>
                    </div>
                    {limit && <p className="landing-plan-limit">{limit}</p>}
                    <div className="landing-plan-price">
                      {isCommission ? (
                        <>
                          <strong>{period ? `${Number(period.commission_rate || 0)}%` : "Comisión"}</strong>
                          <span>de ventas netas</span>
                        </>
                      ) : (
                        <>
                          <strong>{period?.price_amount != null ? formatCurrency(period.price_amount) : "Consultar"}</strong>
                          {period?.label && <span>/ {period.label}</span>}
                        </>
                      )}
                    </div>
                    {isCommission && period?.minimum_amount != null && (
                      <p className="landing-plan-minimum">
                        Mínimo {formatCurrency(period.minimum_amount)}
                        {period.label ? ` / ${period.label}` : ""}
                      </p>
                    )}
                    {features.length > 0 && (
                      <ul>
                        {features.map((feature) => (
                          <li key={feature}><Check size={15} /> {feature}</li>
                        ))}
                      </ul>
                    )}
                    <button type="button" className="landing-plan-button" onClick={openRequestModal}>
                      Empieza gratis <ArrowRight size={16} />
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="landing-onboarding landing-reveal">
          <div className="landing-container">
            <div className="landing-onboarding-heading">
              <span>Implementación acompañada</span>
              <h2>Empieza a operar sin hacerlo a ciegas.</h2>
            </div>
            <div className="landing-onboarding-grid">
              <article><b>01</b><h3>Configuración</h3><p>Cargamos tu estructura, usuarios y parámetros de operación.</p></article>
              <article><b>02</b><h3>Capacitación</h3><p>Tu equipo aprende el flujo según su rol y responsabilidades.</p></article>
              <article><b>03</b><h3>Puesta en marcha</h3><p>Validamos la operación y acompañamos el arranque inicial.</p></article>
            </div>
          </div>
        </section>

        <section className="landing-faq landing-reveal" id="preguntas">
          <div className="landing-container landing-faq-grid">
            <div>
              <span>Antes de decidir</span>
              <h2>Preguntas frecuentes</h2>
            </div>
            <div className="landing-faq-list">
              <details open>
                <summary>¿Puedo cambiar de plan después?</summary>
                <p>Gloto permite gestionar cambios de plan según la configuración de la suscripción y el estado de aprobación del negocio.</p>
              </details>
              <details>
                <summary>¿Los datos quedan en la cuenta del negocio?</summary>
                <p>La plataforma organiza la información por negocio y controla el acceso según los roles configurados.</p>
              </details>
              <details>
                <summary>¿Qué incluye la implementación?</summary>
                <p>El arranque contempla la configuración inicial, capacitación del equipo y acompañamiento durante el inicio operativo.</p>
              </details>
              <details>
                <summary>¿Gloto funciona sin conexión a internet?</summary>
                <p>Gloto está diseñado para operar conectado. Para confirmar disponibilidad offline, métodos de sincronización y comportamiento ante fallas, el equipo revisará tu caso durante la implementación.</p>
              </details>
              <details>
                <summary>¿Puedo usar Gloto en varios dispositivos?</summary>
                <p>Sí. Puedes consultar y operar desde dispositivos compatibles con la plataforma. Los permisos disponibles dependen del rol asignado a cada usuario.</p>
              </details>
              <details>
                <summary>¿Puedo manejar varias sucursales o puntos de venta?</summary>
                <p>Las capacidades multi-sede dependen del plan activo. Solicita acceso y el equipo confirmará cuál configuración corresponde a tu operación.</p>
              </details>
              <details>
                <summary>¿Cómo controla Gloto el acceso del equipo?</summary>
                <p>Puedes asignar usuarios y roles para limitar funciones según la responsabilidad de cada persona, como ventas, caja, inventario o administración.</p>
              </details>
              <details>
                <summary>¿Qué tipos de negocio pueden usar Gloto?</summary>
                <p>Gloto puede adaptarse a tiendas, comercios, restaurantes, servicios y otros negocios que necesiten ventas, pedidos, caja, inventario o control operativo.</p>
              </details>
              <details>
                <summary>¿Se puede solicitar el plan Inicial, Pro o Premium?</summary>
                <p>Sí. Los planes mostrados en la landing corresponden al catálogo activo del sistema. Después de solicitar acceso, el equipo revisará tu solicitud y el plan adecuado para tu operación.</p>
              </details>
            </div>
          </div>
        </section>

        <section className="landing-cta">
          <div className="landing-container">
            <div className="landing-cta-card">
              <div>
                <span>Haz crecer tu negocio</span>
                <h2>La próxima decisión debe basarse en datos.</h2>
              </div>
              <button type="button" className="landing-primary-button light" onClick={openRequestModal}>
                Empieza gratis <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <Link className="landing-brand" to="/" aria-label="Gloto inicio">
            <img src="/favicon.png" alt="" />
            <span>GLOTO</span>
          </Link>
          <p>© 2026 Gloto. Tecnología para hacer crecer tu negocio.</p>
          <div>
            <a href="/marketplace">Marketplace</a>
            <a href="/login">Acceso</a>
            <button type="button" onClick={openRequestModal}>Solicitar negocio</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
