import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  X,
  ArrowRight,
  Pizza,
  Coffee,
  IceCream,
  CakeSlice,
  Leaf,
  Fish,
  Beef,
  ShoppingBasket,
  Cookie,
  Sandwich,
  Drumstick,
  ChefHat,
  Globe,
  Utensils,
  UtensilsCrossed,
  Timer,
  Hamburger,
  Motorbike,
  ClockFading,
  Star,
  Tag,
} from "lucide-react";
import { supabase, resolveImageUrl } from "../../../src/lib/supabaseClient";

// ─── Datos ──────────────────────────────────

const ICONOS_CATEGORIA = {
  Desayuno: Coffee,
  Colombiana: UtensilsCrossed,
  Latina: UtensilsCrossed,
  Internacional: UtensilsCrossed,
  Postres: CakeSlice,
  Tortas: CakeSlice,
  Snacks: CakeSlice,
  Helados: IceCream,
  Súper: ShoppingBasket,
  Saludable: Leaf,
  Arepas: Sandwich,
  Salchipapa: Beef,
  "Comida rápida": Beef,
  Hamburguesas: Hamburger,
  Pizza,
  Italiana: Pizza,
  Pollo: Drumstick,
  Carne: Beef,
  Americana: Beef,
  Asiática: Fish,
  Mariscos: Fish,
};

// Relaciona cada categoría con el/los tipos de cocina de las tiendas (campo "tipo")
const CATEGORIA_TIPOS = {
  Burgers: ["Americana"],
  Café: ["Cafetería"],
  Pizza: ["Italiana"],
  Helados: ["Heladería"],
  Sushi: ["Japonesa"],
  Tacos: ["Mexicana"],
  Postres: ["Postres", "Repostería"],
  Saludable: ["Saludable", "Vegetariana", "Vegana"],
};

const ICONOS_PROMOCION = {
  PATROCINADO: Hamburger,
  NUEVO: Coffee,
  TRENDING: Pizza,
};

const FILTROS = ["Relevancia", "Más cerca", "Calificación", "Precio", "Rápido"];

const FRASES = [
  "¿Qué vas a pedir?",
  "Antojos de hoy",
  "¿Qué comeremos hoy?",
  "¿Qué buscas?",
  "¿Algo rico para ordenar?",
];

const FRASES_LOOP = [...FRASES, ...FRASES];

const SkeletonBlock = ({ className = "", rounded = "rounded-2xl" }) => (
  <div
    className={`animate-pulse bg-surface/20 border border-outline/20 ${rounded} ${className}`}
  />
);

const Home = () => {
  const navigate = useNavigate();

  const [busqueda, setBusqueda] = useState("");
  const [filtroActivo, setFiltroActivo] = useState("Relevancia");
  const [categoriaActiva, setCategoriaActiva] = useState(null);
  const [textoIndex, setTextoIndex] = useState(0);
  const [animando, setAnimando] = useState(true);
  const [verTodasPromos, setVerTodasPromos] = useState(false);
  const [busquedaPromo, setBusquedaPromo] = useState("");
  const [tiendas, setTiendas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [promociones, setPromociones] = useState([]);
  const [cargando, setCargando] = useState(true);

  // Obtener negocios de Supabase
  useEffect(() => {
    const obtenerTiendas = async () => {
      try {
        const { data, error } = await supabase
          .from("businesses")
          .select(
            `
            id, 
            name, 
            slug, 
            logo_url,
            cover_url,
            is_active,
            created_at,
            business_info (
              rating,
              rating_count,
              delivery_time_min,
              delivery_time_max,
              delivery_fee,
              free_delivery_min_order,
              categoria
            )
          `,
          )
          .eq("is_active", true)
          .order("created_at", { ascending: true });

        if (error) throw error;

        const { data: categoriasData, error: categoriasError } = await supabase
          .from("categories")
          .select("id,name,icon_url")
          .order("name", { ascending: true });

        if (categoriasError) throw categoriasError;

        const categoriasUnicas = Array.from(
          new Map(
            (categoriasData || [])
              .filter((categoria) => categoria.name?.trim())
              .map((categoria) => [
                normalizarTexto(categoria.name),
                {
                  id: categoria.id,
                  n: categoria.name.trim(),
                  iconUrl: categoria.icon_url || null,
                },
              ]),
          ).values(),
        );
        setCategorias(categoriasUnicas);

        const { data: promocionesData, error: promocionesError } =
          await supabase
            .from("promotions")
            .select(
              "id,tag,offer_text,title,icon_url,order_index,business_id,businesses(slug,name)",
            )
            .eq("is_active", true)
            .eq("payment_status", "paid")
            .order("order_index", { ascending: true });

        if (promocionesError) {
          console.error(
            "No se pudieron cargar las promociones:",
            promocionesError,
          );
          setPromociones([]);
        } else {
          setPromociones(
            (promocionesData || []).map((promocion) => ({
              id: promocion.id,
              slug: promocion.businesses?.slug,
              tag: promocion.tag,
              oferta: promocion.offer_text,
              nombre: promocion.title || promocion.businesses?.name || "",
              icon: ICONOS_PROMOCION[promocion.tag] || Tag,
              iconUrl: promocion.icon_url || null,
            })),
          );
        }

        // Mapear datos de Supabase al formato esperado
        const tiendasMapeadas = data.map((negocio) => {
          // La relación retorna un array, acceder al primer elemento
          const info = Array.isArray(negocio.business_info)
            ? negocio.business_info[0]
            : negocio.business_info || {};

          const rating = info?.rating ? parseFloat(info.rating) : 4.5;
          const reviews = info?.rating_count || 0;
          const deliveryMin = info?.delivery_time_min || 20;
          const deliveryMax = info?.delivery_time_max || 35;
          const deliveryFee = info?.delivery_fee
            ? parseFloat(info.delivery_fee)
            : 2500;

          return {
            id: negocio.id,
            slug: negocio.slug,
            nombre: negocio.name,
            tipo: info?.categoria || "Tienda",
            // guardamos la ruta original en `logo` y la resolveremos abajo
            logo: negocio.logo_url || null,
            cover: negocio.cover_url || null,
            rating: rating.toFixed(1),
            reviews,
            tiempo: `${deliveryMin}–${deliveryMax} min`,
            domicilio:
              deliveryFee === 0
                ? "Gratis"
                : `$${deliveryFee.toLocaleString("es-CO")}`,
            distancia: "—",
            badge: null,
          };
        });

        // Si alguna tienda no tiene `cover`, intentar obtener la primera
        // imagen de producto disponible como fallback antes de resolver URLs.
        const tiendasConPortada = await Promise.all(
          tiendasMapeadas.map(async (t) => {
            if (t.cover) return t;
            try {
              const prodRes = await supabase
                .from("products")
                .select("image_url")
                .eq("business_id", t.id)
                .eq("is_active", true)
                .order("created_at", { ascending: true })
                .limit(1);

              const firstImg =
                Array.isArray(prodRes.data) && prodRes.data[0]
                  ? prodRes.data[0].image_url
                  : null;

              return { ...t, cover: firstImg || null };
            } catch (e) {
              return t;
            }
          }),
        );

        // Resolver URLs públicas para las imágenes (si vienen de Supabase Storage)
        const tiendasConUrls = await Promise.all(
          tiendasConPortada.map(async (t) => ({
            ...t,
            logo: t.logo ? await resolveImageUrl(t.logo) : "/default.png",
            cover: t.cover ? await resolveImageUrl(t.cover) : "/default.png",
          })),
        );

        setTiendas(tiendasConUrls);
      } catch (error) {
        console.error("Error al obtener tiendas:", error);
        setTiendas([]);
      } finally {
        setCargando(false);
      }
    };

    obtenerTiendas();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTextoIndex((prev) => prev + 1);
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (textoIndex === FRASES.length) {
      const timeout = setTimeout(() => {
        setAnimando(false);
        setTextoIndex(0);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setAnimando(true);
          });
        });
      }, 700);

      return () => clearTimeout(timeout);
    }
  }, [textoIndex]);

  // Normaliza texto para comparar sin tildes/mayúsculas
  const normalizar = (str) =>
    str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const normalizarTexto = (str) =>
    String(str ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const tiendasFiltradas = tiendas.filter((t) => {
    const pasaBusqueda =
      busqueda.trim() === "" ||
      (() => {
        const q = normalizar(busqueda);

        return (
          normalizar(t.nombre).includes(q) || normalizar(t.tipo).includes(q)
        );
      })();

    const pasaCategoria =
      !categoriaActiva ||
      normalizar(t.tipo) === normalizar(categoriaActiva) ||
      (CATEGORIA_TIPOS[categoriaActiva] || []).some(
        (tipo) => normalizar(t.tipo) === normalizar(tipo),
      );

    return pasaBusqueda && pasaCategoria;
  });

  // ← AQUÍ AFUERA
  const promocionesFiltradas = promociones.filter((promo) => {
    const q = normalizar(busquedaPromo);

    return (
      busquedaPromo.trim() === "" ||
      normalizar(promo.nombre).includes(q) ||
      normalizar(promo.oferta).includes(q) ||
      normalizar(promo.tag).includes(q)
    );
  });

  const buscando = busqueda.trim().length > 0;

  const modoCategoria = categoriaActiva !== null && !buscando;

  // Aplicar ordenamiento según el filtro activo
  const tiendasOrdenadas = (() => {
    const copia = [...tiendasFiltradas];

    switch (filtroActivo) {
      case "Relevancia":
        return copia.sort(
          (a, b) => parseFloat(b.rating) - parseFloat(a.rating),
        );
      case "Más cerca":
        return copia.sort((a, b) => {
          const minA = parseInt(a.tiempo.split("–")[0]);
          const minB = parseInt(b.tiempo.split("–")[0]);
          return minA - minB;
        });
      case "Calificación":
        return copia.sort(
          (a, b) => parseFloat(b.rating) - parseFloat(a.rating),
        );
      case "Precio":
        return copia.sort((a, b) => {
          const precioA =
            a.domicilio === "Gratis"
              ? 0
              : parseFloat(a.domicilio.replace("$", "").replace(/\./g, ""));
          const precioB =
            b.domicilio === "Gratis"
              ? 0
              : parseFloat(b.domicilio.replace("$", "").replace(/\./g, ""));
          return precioA - precioB;
        });
      case "Rápido":
        return copia.sort((a, b) => {
          const minA = parseInt(a.tiempo.split("–")[0]);
          const minB = parseInt(b.tiempo.split("–")[0]);
          return minA - minB;
        });
      default:
        return copia;
    }
  })();

  // Selecciona/deselecciona una categoría (toggle)
  const toggleCategoria = (nombreCategoria) => {
    setCategoriaActiva((prev) =>
      prev === nombreCategoria ? null : nombreCategoria,
    );
  };

  const renderLoadingState = () => (
    <div className="max-w-6xl mx-auto bg-background min-h-screen px-4 pt-4 pb-8">
      <section className="mb-6 space-y-4">
        <SkeletonBlock className="h-4 w-28" />
        <SkeletonBlock className="h-14 w-full rounded-3xl" />
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-10 w-full rounded-3xl" />
          <SkeletonBlock className="h-10 w-10 rounded-full" />
        </div>
      </section>

      <section className="mb-5">
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={`cat-skeleton-${idx}`}
              className="flex-shrink-0 flex flex-col items-center gap-2"
            >
              <SkeletonBlock className="h-14 w-14" rounded="rounded-2xl" />
              <SkeletonBlock className="h-3 w-10" />
            </div>
          ))}
        </div>
      </section>

      <section className="mb-5">
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={`promo-skeleton-${idx}`}
              className="w-[140px] sm:w-[160px] md:w-[190px]"
            >
              <SkeletonBlock className="h-24 w-full rounded-3xl" />
            </div>
          ))}
          <div className="flex-shrink-0 w-[110px] sm:w-[120px]">
            <SkeletonBlock className="h-24 w-full rounded-3xl" />
          </div>
        </div>
      </section>

      <section className="sticky top-0 z-10 mb-5 bg-background pt-4">
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {Array.from({ length: 5 }).map((_, idx) => (
            <SkeletonBlock
              key={`filter-skeleton-${idx}`}
              className="h-8 w-20 rounded-full"
            />
          ))}
        </div>
      </section>

      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={`tienda-skeleton-${idx}`}
              className="flex flex-col rounded-3xl bg-transparent p-3"
            >
              <SkeletonBlock className="h-24 w-full mb-3 rounded-3xl" />
              <SkeletonBlock className="h-3.5 w-3/4 mb-2 rounded-full" />
              <SkeletonBlock className="h-2.5 w-1/2 mb-3 rounded-full" />
              <SkeletonBlock className="h-2.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 text-center text-sm font-medium text-on-surface-variant/70">
        Estamos preparando todo para ti...
      </div>
    </div>
  );

  if (cargando) return renderLoadingState();

  return (
    <div className="max-w-6xl mx-auto bg-background min-h-screen">
      {/* HERO */}
      <section className="px-4 pt-4 pb-4">
        {!buscando && !modoCategoria && !verTodasPromos && (
          <div className="h-[72px] overflow-hidden mb-5">
            <div
              className={
                animando ? "transition-transform duration-700 ease-in-out" : ""
              }
              style={{
                transform: `translateY(-${textoIndex * 72}px)`,
              }}
            >
              {FRASES_LOOP.map((frase, index) => (
                <h1
                  key={index}
                  className="h-[72px] flex items-center font-black leading-none tracking-tighter text-[clamp(2rem,8vw,2.75rem)] text-on-surface"
                >
                  <span className="text-primary">{frase}</span>
                </h1>
              ))}
            </div>
          </div>
        )}

        {/* BUSCADOR SIEMPRE VISIBLE */}
        {!verTodasPromos && !modoCategoria && (
          <div className="flex items-center rounded-3xl bg-surface px-4 h-10">
            <Search size={18} className="opacity-50" />

            <input
              type="text"
              placeholder="Buscar..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="flex-1 bg-transparent px-3 text-base outline-none text-on-surface caret-primary-container"
            />

            {busqueda.length > 0 && (
              <button
                onClick={() => setBusqueda("")}
                className="p-1 rounded-full hover:bg-black/5 transition-colors"
              >
                <X size={16} className="opacity-50" />
              </button>
            )}
          </div>
        )}
      </section>

      {/* BANNER CATEGORÍA ACTIVA */}
      {modoCategoria && (
        <section className="px-4 pt-4 pb-4">
          <div className="flex items-center justify-between rounded-3xl border border-primary-container/20 bg-primary-container/10 px-5 py-4 transition-all duration-300">
            <div>
              <h2 className="text-2xl font-black text-on-surface">
                {categoriaActiva}
              </h2>
            </div>

            <button
              onClick={() => setCategoriaActiva(null)}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-surface hover:bg-surface/80 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </section>
      )}

      {/* CATEGORÍAS (se ocultan mientras se busca) */}
      {!buscando && !verTodasPromos && (
        <section className="px-2 mb-4">
          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {categorias.map((cat) => {
              const Icon = ICONOS_CATEGORIA[cat.n] || Utensils;
              const activa = categoriaActiva === cat.n;
              return (
                <button
                  key={cat.n}
                  onClick={() => toggleCategoria(cat.n)}
                  className={`flex-shrink-0 flex flex-col items-center gap-2 px-4 py-3 rounded-2xl min-w-[72px] transition-all ${
                    activa
                      ? "bg-primary-container text-white"
                      : "bg-surface/60 text-on-surface-variant"
                  }`}
                >
                  {cat.iconUrl ? (
                    <img
                      src={cat.iconUrl}
                      alt=""
                      className="h-[22px] w-[22px] object-contain"
                    />
                  ) : (
                    <Icon size={22} />
                  )}
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide ${
                      activa ? "text-white" : "text-on-surface-variant"
                    }`}
                  >
                    {cat.n}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* PROMOCIONES (se ocultan mientras se busca) */}
      {!buscando && !modoCategoria && !verTodasPromos && (
        <div className="flex gap-3 overflow-x-auto px-2 no-scrollbar pb-4">
          {promocionesFiltradas.map((promo) => {
            const IconPromo = promo.icon;
            return (
              <Link
                key={promo.id}
                to={`/marketplace/tienda/${promo.slug}`}
                className="relative flex-shrink-0 w-[140px] sm:w-[160px] md:w-[190px] h-[105px] rounded-3xl bg-primary-container/80 overflow-hidden"
              >
                <div className="absolute top-3 left-3 px-2 py-1 rounded-full text-[8px] font-bold bg-white/10 text-white/70">
                  {promo.tag}
                </div>
                <div className="absolute right-3 bottom-2 opacity-70">
                  {promo.iconUrl ? (
                    <img
                      src={promo.iconUrl}
                      alt=""
                      className="h-10 w-10 object-contain"
                    />
                  ) : (
                    <IconPromo size={40} className="text-white" />
                  )}
                </div>
                <div className="absolute left-3 bottom-3 text-white">
                  <p className="font-black text-base">{promo.oferta}</p>
                  <p className="text-[11px] opacity-70">{promo.nombre}</p>
                </div>
              </Link>
            );
          })}

          <button
            onClick={() => setVerTodasPromos(true)}
            className="flex-shrink-0 w-[110px] sm:w-[120px] h-[105px] rounded-3xl bg-surface flex flex-col items-center justify-center gap-2 hover:border-primary-container hover:text-primary-container transition-all"
          >
            <ArrowRight size={24} />
            <span className="text-xs font-bold">Ver más</span>
          </button>
        </div>
      )}

      {/* FILTROS (STICKY SE COMPORTA COMO PARTE DEL HEADER, se oculta mientras se busca) */}
      {!buscando && !modoCategoria && !verTodasPromos && (
        <section className="sticky top-14 sm:top-[54px] bg-background z-40 px-2 pt-2">
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar mb-2">
            {FILTROS.map((f) => (
              <button
                key={f}
                onClick={() => setFiltroActivo(f)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all ${
                  filtroActivo === f
                    ? "bg-primary-container text-white"
                    : "bg-surface text-on-surface-variant/60"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </section>
      )}

      {verTodasPromos && (
        <section className="px-4 pb-8">
          <div className="flex items-center rounded-3xl bg-surface px-4 h-11 mb-5">
            <Search size={18} className="opacity-50" />

            <input
              type="text"
              placeholder="Buscar promociones..."
              value={busquedaPromo}
              onChange={(e) => setBusquedaPromo(e.target.value)}
              className="flex-1 bg-transparent px-3 text-base outline-none"
            />

            {busquedaPromo && (
              <button onClick={() => setBusquedaPromo("")}>
                <X size={16} />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl font-black">Todas las promociones</h2>

            <button
              onClick={() => setVerTodasPromos(false)}
              className="w-10 h-10 rounded-full bg-surface flex items-center justify-center"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid gap-4">
            {promocionesFiltradas.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-12 text-on-surface-variant/60">
                <Search size={28} className="mb-3 opacity-50" />

                <p className="text-base font-bold">
                  No encontramos promociones para "{busquedaPromo}"
                </p>

                <p className="text-xs mt-1">Intenta con otro nombre u oferta</p>
              </div>
            ) : (
              promocionesFiltradas.map((promo) => {
                const IconPromo = promo.icon;
                return (
                  <Link
                    key={promo.id}
                    to={`/marketplace/tienda/${promo.slug}`}
                    className="relative h-36 rounded-3xl bg-primary-container overflow-hidden p-5"
                  >
                    <div className="absolute right-4 bottom-2 opacity-20">
                      {promo.iconUrl ? (
                        <img
                          src={promo.iconUrl}
                          alt=""
                          className="h-14 w-14 object-contain"
                        />
                      ) : (
                        <IconPromo size={56} className="text-white" />
                      )}
                    </div>

                    <span className="inline-flex px-3 py-1 rounded-full text-[10px] font-bold bg-white/10 text-white">
                      {promo.tag}
                    </span>

                    <h3 className="mt-4 text-2xl font-black text-white">
                      {promo.oferta}
                    </h3>

                    <p className="text-white/70">{promo.nombre}</p>
                  </Link>
                );
              })
            )}
          </div>
        </section>
      )}

      {!verTodasPromos && (
        <section className="px-5">
          {tiendasOrdenadas.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-16 text-on-surface-variant/60">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface border border-outline/20">
                <Search
                  size={28}
                  className="text-primary-container opacity-80"
                />
              </div>
              <p className="text-lg font-black text-on-surface">
                {buscando
                  ? "No encontramos esa tienda"
                  : categoriaActiva
                    ? `Aún no hay tiendas de ${categoriaActiva}`
                    : "Aún no hay tiendas disponibles"}
              </p>
              <p className="mt-2 max-w-xs text-sm leading-6">
                {buscando
                  ? `Prueba con otro nombre o explora todas las categorías.`
                  : "Estamos sumando nuevos lugares. Vuelve pronto o explora otra categoría."}
              </p>
              {buscando && (
                <button
                  type="button"
                  onClick={() => setBusqueda("")}
                  className="mt-5 rounded-full bg-primary-container px-5 py-2.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
                >
                  Ver todas las tiendas
                </button>
              )}
            </div>
          ) : buscando ? (
            // ── MODO BÚSQUEDA: tarjetas horizontales, compitiendo por la mirada del usuario ──
            <div className="flex flex-col gap-3 pb-8">
              {tiendasOrdenadas.map((t) => (
                <Link
                  key={t.slug}
                  to={`/marketplace/tienda/${t.slug}`}
                  className="group relative flex items-center gap-3 rounded-3xl bg-surface border border-outline/30 p-3 transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10"
                >
                  {/* Cover + logo */}
                  <div className="relative flex-shrink-0 flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-background border border-outline/10 overflow-hidden">
                    <img
                      src={t.cover || t.logo}
                      alt={t.nombre}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = t.logo || "/default.png";
                      }}
                    />

                    <div className="absolute bottom-0 right-0 w-8 h-8 overflow-hidden shadow-md rounded-full border border-white/20 bg-background">
                      <img
                        src={t.logo || t.cover}
                        alt={t.nombre}
                        className="w-full h-full object-cover rounded-full"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = "/default.png";
                        }}
                      />
                    </div>

                    {t.badge && (
                      <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-primary-container text-white text-[7px] font-bold uppercase tracking-wider shadow-sm">
                        {t.badge}
                      </div>
                    )}
                  </div>

                  {/* Información */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-extrabold text-base text-on-surface truncate">
                      {t.nombre}
                    </h4>
                    <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">
                      {t.tipo}
                    </p>

                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <div className="px-2 py-0.5 rounded-md bg-background border border-outline/10 text-[10px] font-bold text-on-surface flex items-center gap-1">
                        <span className="text-yellow-500">★</span> {t.rating}
                      </div>
                      <div className="px-2 py-0.5 rounded-md bg-background border border-outline/10 text-[10px] font-medium text-on-surface-variant">
                        {t.tiempo}
                      </div>
                    </div>

                    <div className="mt-1.5 text-[11px] font-bold flex items-center gap-1">
                      <span
                        className={
                          t.domicilio === "Gratis"
                            ? "text-success"
                            : "text-on-surface-variant"
                        }
                      >
                        {" "}
                        {t.domicilio === "Gratis"
                          ? "Envío Gratis"
                          : t.domicilio}
                      </span>
                    </div>
                  </div>

                  <ArrowRight
                    size={18}
                    className="flex-shrink-0 opacity-30 group-hover:opacity-70 group-hover:translate-x-0.5 transition-all"
                  />
                </Link>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-8">
              {tiendasOrdenadas.map((t) => (
                <Link
                  key={t.slug}
                  to={`/marketplace/tienda/${t.slug}`}
                  className="group relative flex flex-col rounded-3xl bg-surface  p-3 transition-all duration-300 hover:shadow-lg hover:translate-y-0.5 "
                >
                  {/* Contenedor de portada con logo superpuesto */}
                  <div className="relative flex items-center justify-center h-20 sm:h-24 rounded-2xl bg-background border border-outline/10 mb-3 overflow-hidden">
                    <img
                      src={t.cover || t.logo}
                      alt={t.nombre}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = t.logo || "/default.png";
                      }}
                    />

                    <div className="absolute bottom-2 right-2 w-8 h-8 overflow-hidden shadow-md">
                      <img
                        src={t.logo || t.cover}
                        alt={t.nombre}
                        className="w-full h-full object-cover rounded-[9px]"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = "/default.png";
                        }}
                      />
                    </div>

                    {/* Badge de estado, si tuviera un badge personalizado */}
                    {t.badge && (
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-primary-container text-white text-[9px] font-bold uppercase tracking-wider shadow-sm">
                        {t.badge}
                      </div>
                    )}
                  </div>

                  {/* Información de la tienda */}
                  <div className="flex-1">
                    <h4 className="font-extrabold text-base text-on-surface truncate pr-2">
                      {t.nombre}
                    </h4>
                    <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">
                      {t.tipo}
                    </p>
                  </div>

                  {/* Métricas: Compactas estilo Didi Food */}
                  <div className="mt-2 flex items-center gap-1 text-[8px] sm:text-[9px] text-white/50">
                    <div className="flex items-center gap-0.5">
                      <Star size={10} />
                      <span>{t.rating}</span>
                    </div>
                    <span className="text-white/30">•</span>
                    <div className="flex items-center gap-0.5">
                      <ClockFading size={10} />
                      <span>{t.tiempo}</span>
                    </div>
                    <span className="text-white/30">•</span>
                    <div className="flex items-center gap-0.5">
                      <Motorbike size={10} />
                      <span>
                        {t.domicilio === "Gratis" ? "Gratis" : t.domicilio}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default Home;
