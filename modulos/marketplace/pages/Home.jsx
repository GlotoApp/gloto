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
} from "lucide-react";
import {
  resolveCategoryIconUrl,
  resolveImageUrl,
  supabase,
} from "../../../src/lib/supabaseClient";
import FRASES_FALLBACK_MARKETPLACE from "../FrasesInicioMarketplace";

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

const FILTROS = [
  "Todas",
  "Mejor calificadas",
  "Entrega rápida",
  "Menor domicilio",
  "Con promociones",
];

const SkeletonBlock = ({ className = "", rounded = "rounded-2xl" }) => (
  <div
    className={`animate-pulse bg-surface/20 border border-outline/20 ${rounded} ${className}`}
  />
);

const Home = () => {
  const navigate = useNavigate();

  const [busqueda, setBusqueda] = useState("");
  const [filtroActivo, setFiltroActivo] = useState("Todas");
  const [categoriaActiva, setCategoriaActiva] = useState(null);
  const [textoIndex, setTextoIndex] = useState(0);
  const [animando, setAnimando] = useState(true);
  const [verTodasPromos, setVerTodasPromos] = useState(false);
  const [busquedaPromo, setBusquedaPromo] = useState("");
  const [tiendas, setTiendas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [promociones, setPromociones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [frasesInicio, setFrasesInicio] = useState(FRASES_FALLBACK_MARKETPLACE);
  const frasesLoop = [...frasesInicio, ...frasesInicio];

  useEffect(() => {
    let isMounted = true;

    const obtenerFrases = async () => {
      const { data, error } = await supabase
        .from("frases")
        .select("texto")
        .eq("is_active", true)
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true });

      if (!isMounted) return;
      if (error) {
        console.error(
          "No se pudieron cargar las frases del Marketplace:",
          error,
        );
        return;
      }

      setFrasesInicio((data || []).map((frase) => frase.texto));
    };

    obtenerFrases();
    return () => {
      isMounted = false;
    };
  }, []);

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
              category_id,
              categoria,
              rating,
              rating_count,
              delivery_time_min,
              delivery_time_max,
              min_delivery_fee,
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
          .select("id,name,icon_url,order_index")
          .order("order_index", { ascending: true })
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
        const categoriasConIconos = await Promise.all(
          categoriasUnicas.map(async (categoria) => {
            try {
              return {
                ...categoria,
                iconUrl: await resolveCategoryIconUrl(categoria.iconUrl),
              };
            } catch (iconError) {
              console.warn(
                "No se pudo resolver el icono de categoría:",
                iconError,
              );
              return { ...categoria, iconUrl: null };
            }
          }),
        );
        setCategorias(categoriasConIconos);

        const { data: promocionesData, error: promocionesError } =
          await supabase
            .from("promotions")
            .select(
              "id,tag,offer_text,title,cover_path,order_index,business_id,businesses(slug,name)",
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
              coverUrl: promocion.cover_path
                ? supabase.storage
                    .from("business-assets")
                    .getPublicUrl(promocion.cover_path).data.publicUrl
                : null,
            })),
          );
        }

        // Mapear datos de Supabase al formato esperado
        const tiendasMapeadas = data.map((negocio) => {
          // La relación retorna un array, acceder al primer elemento
          const info = Array.isArray(negocio.business_info)
            ? negocio.business_info[0]
            : negocio.business_info || {};

          const businessCategory =
            (categoriasData || []).find(
              (category) => category.id === info?.category_id,
            ) ||
            (categoriasData || []).find(
              (category) =>
                normalizarTexto(category.name) ===
                normalizarTexto(info?.categoria),
            );
          const ratingValue = info?.rating;
          const reviews = Number(info?.rating_count ?? 0);
          const ratingNumber =
            ratingValue == null || ratingValue === ""
              ? null
              : Number(ratingValue);
          const rating =
            reviews > 0 && Number.isFinite(ratingNumber)
              ? ratingNumber.toFixed(1)
              : null;
          const deliveryMinValue = info?.delivery_time_min;
          const deliveryMaxValue = info?.delivery_time_max;
          const deliveryMin =
            deliveryMinValue == null || deliveryMinValue === ""
              ? null
              : Number(deliveryMinValue);
          const deliveryMax =
            deliveryMaxValue == null || deliveryMaxValue === ""
              ? null
              : Number(deliveryMaxValue);
          const tiempo =
            Number.isFinite(deliveryMin) && Number.isFinite(deliveryMax)
              ? `${deliveryMin}–${deliveryMax} min`
              : null;
          const deliveryFeeValue = info?.min_delivery_fee;
          const deliveryFee =
            deliveryFeeValue == null || deliveryFeeValue === ""
              ? null
              : Number(deliveryFeeValue);

          return {
            id: negocio.id,
            slug: negocio.slug,
            nombre: negocio.name,
            tipo: businessCategory?.name || info?.categoria || "Tienda",
            categoryId: businessCategory?.id || null,
            // guardamos la ruta original en `logo` y la resolveremos abajo
            logo: negocio.logo_url || null,
            cover: negocio.cover_url || null,
            rating,
            reviews,
            tiempo,
            deliveryMin: Number.isFinite(deliveryMin) ? deliveryMin : null,
            deliveryFee: Number.isFinite(deliveryFee) ? deliveryFee : null,
            domicilio:
              deliveryFee == null || !Number.isFinite(deliveryFee)
                ? null
                : deliveryFee === 0
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
    if (frasesInicio.length === 0) return undefined;

    const interval = setInterval(() => {
      setTextoIndex((prev) => prev + 1);
    }, 2500);

    return () => clearInterval(interval);
  }, [frasesInicio.length]);

  useEffect(() => {
    if (!frasesInicio.length || textoIndex < frasesInicio.length) return;

    if (textoIndex >= frasesInicio.length) {
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
  }, [textoIndex, frasesInicio.length]);

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

    const pasaCategoria = !categoriaActiva || t.categoryId === categoriaActiva;

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
  const categoriaActivaData = categorias.find(
    (categoria) => categoria.id === categoriaActiva,
  );

  const slugsConPromocion = new Set(
    promociones.map((promocion) => promocion.slug).filter(Boolean),
  );

  // Aplicar ordenamiento según el filtro activo
  const tiendasOrdenadas = (() => {
    const tiendasDisponibles =
      filtroActivo === "Con promociones"
        ? tiendasFiltradas.filter((tienda) =>
            slugsConPromocion.has(tienda.slug),
          )
        : tiendasFiltradas;
    const copia = [...tiendasDisponibles];

    switch (filtroActivo) {
      case "Mejor calificadas":
        return copia.sort((a, b) => {
          const ratingA = a.rating == null ? -Infinity : Number(a.rating);
          const ratingB = b.rating == null ? -Infinity : Number(b.rating);
          return ratingB - ratingA || b.reviews - a.reviews;
        });
      case "Entrega rápida":
        return copia.sort((a, b) => {
          const entregaA = a.deliveryMin ?? Infinity;
          const entregaB = b.deliveryMin ?? Infinity;
          return entregaA - entregaB;
        });
      case "Menor domicilio":
        return copia.sort((a, b) => {
          const tarifaA = a.deliveryFee ?? Infinity;
          const tarifaB = b.deliveryFee ?? Infinity;
          return tarifaA - tarifaB;
        });
      default:
        return copia;
    }
  })();

  // Selecciona/deselecciona una categoría (toggle)
  const toggleCategoria = (idCategoria) => {
    setCategoriaActiva((prev) => (prev === idCategoria ? null : idCategoria));
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
      <section className="px-3 pt-3 pb-3 sm:px-4 sm:pt-4 sm:pb-4">
        {!buscando &&
          !modoCategoria &&
          !verTodasPromos &&
          frasesInicio.length > 0 && (
            <div className="mb-4 h-16 overflow-hidden sm:mb-5">
              <div
                className={
                  animando
                    ? "transition-transform duration-700 ease-in-out"
                    : ""
                }
                style={{
                  transform: `translateY(-${textoIndex * 64}px)`,
                }}
              >
                {frasesLoop.map((frase, index) => (
                  <h1
                    key={index}
                    className="flex h-16 min-w-0 w-full items-center font-black leading-none tracking-normal text-on-surface text-3xl sm:text-4xl"
                  >
                    <span className="block w-full truncate text-primary">
                      {frase}
                    </span>
                  </h1>
                ))}
              </div>
            </div>
          )}

        {/* BUSCADOR SIEMPRE VISIBLE */}
        {!verTodasPromos && !modoCategoria && (
          <div className="flex h-12 items-center rounded-2xl border border-white/5 bg-surface/80 px-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] sm:h-12 sm:rounded-3xl sm:px-4">
            <Search size={18} className="opacity-60" />

            <input
              type="text"
              placeholder="Buscar..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="flex-1 bg-transparent px-3 text-sm outline-none text-on-surface caret-primary-container sm:text-base"
            />

            {busqueda.length > 0 && (
              <button
                onClick={() => setBusqueda("")}
                className="rounded-full p-1 transition-colors hover:bg-white/5"
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
                {categoriaActivaData?.n}
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
        <section className="px-2 pb-3 sm:mb-4 sm:pb-2">
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar sm:gap-3">
            {categorias.map((cat) => {
              const Icon = ICONOS_CATEGORIA[cat.n] || Utensils;
              const activa = categoriaActiva === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => toggleCategoria(cat.id)}
                  aria-label={`Filtrar por ${cat.n}`}
                  title={cat.n}
                  className="group flex h-[92px] w-[88px] flex-shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-2 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:h-[100px] sm:w-[96px]"
                >
                  {cat.iconUrl ? (
                    <img
                      src={cat.iconUrl}
                      alt=""
                      className={`h-12 w-12 flex-shrink-0 object-contain transition-all sm:h-14 sm:w-14 ${
                        activa
                          ? "scale-110 drop-shadow-[0_0_14px_rgba(168,85,247,0.7)]"
                          : "opacity-80 group-hover:scale-105 group-hover:opacity-100"
                      }`}
                    />
                  ) : (
                    <Icon
                      size={40}
                      className={`flex-shrink-0 transition-all sm:h-11 sm:w-11 ${
                        activa
                          ? "scale-110 text-primary drop-shadow-[0_0_12px_rgba(168,85,247,0.7)]"
                          : "text-on-surface-variant group-hover:scale-105 group-hover:text-on-surface"
                      }`}
                    />
                  )}
                  <span
                    className={`w-full truncate text-center text-[9px] font-bold uppercase leading-tight tracking-[0.08em] transition-colors sm:text-[10px] ${
                      activa
                        ? "text-primary"
                        : "text-on-surface-variant group-hover:text-on-surface"
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
      {!buscando &&
        !modoCategoria &&
        !verTodasPromos &&
        promocionesFiltradas.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-2 pb-4 no-scrollbar sm:gap-3">
            {promocionesFiltradas.map((promo) => {
              return (
                <Link
                  key={promo.id}
                  to={`/marketplace/tienda/${promo.slug}`}
                  className="relative h-[96px] w-[130px] flex-shrink-0 overflow-hidden rounded-3xl bg-primary-container/80 sm:h-[105px] sm:w-[150px] md:w-[190px]"
                >
                  {promo.coverUrl && (
                    <img
                      src={promo.coverUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 bg-black/45" />
                  <div className="absolute left-3 top-3 rounded-full bg-white/10 px-2 py-1 text-[8px] font-bold text-white/70">
                    {promo.tag}
                  </div>
                  <div className="absolute inset-x-3 bottom-3 min-w-0 text-white">
                    <p className="line-clamp-1 text-sm font-black sm:text-base">
                      {promo.oferta}
                    </p>
                    <p className="line-clamp-1 text-[10px] opacity-80 sm:text-[11px]">
                      {promo.nombre}
                    </p>
                  </div>
                </Link>
              );
            })}

            <button
              onClick={() => setVerTodasPromos(true)}
              className="flex h-[96px] w-[90px] flex-shrink-0 flex-col items-center justify-center gap-2 rounded-3xl bg-surface transition-all hover:border-primary-container hover:text-primary-container sm:h-[105px] sm:w-[110px]"
            >
              <ArrowRight size={22} />
              <span className="text-[10px] font-bold sm:text-xs">Ver más</span>
            </button>
          </div>
        )}

      {/* FILTROS (STICKY SE COMPORTA COMO PARTE DEL HEADER, se oculta mientras se busca) */}
      {!buscando && !modoCategoria && !verTodasPromos && (
        <section className="sticky top-14 z-40 bg-background px-2 pt-2 sm:top-[54px]">
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-2 no-scrollbar sm:gap-2">
            {FILTROS.map((f) => (
              <button
                key={f}
                onClick={() => setFiltroActivo(f)}
                className={`flex-shrink-0 rounded-full px-3 py-2 text-[10px] font-bold transition-all sm:px-4 sm:py-2 sm:text-xs ${
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
                return (
                  <Link
                    key={promo.id}
                    to={`/marketplace/tienda/${promo.slug}`}
                    className="relative h-36 rounded-3xl bg-primary-container overflow-hidden p-5"
                  >
                    {promo.coverUrl && (
                      <img
                        src={promo.coverUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    )}
                    <div className="absolute inset-0 bg-black/45" />

                    <span className="relative inline-flex rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-white">
                      {promo.tag}
                    </span>

                    <h3 className="relative mt-4 line-clamp-1 text-2xl font-black text-white">
                      {promo.oferta}
                    </h3>

                    <p className="relative line-clamp-1 text-white/80">
                      {promo.nombre}
                    </p>
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
                  : categoriaActivaData
                    ? `Aún no hay tiendas de ${categoriaActivaData.n}`
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

                    {(t.rating || t.tiempo) && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {t.rating && (
                          <div className="flex items-center gap-1 rounded-md border border-outline/10 bg-background px-2 py-0.5 text-[10px] font-bold text-on-surface">
                            <span className="text-yellow-500">★</span>{" "}
                            {t.rating}
                          </div>
                        )}
                        {t.tiempo && (
                          <div className="rounded-md border border-outline/10 bg-background px-2 py-0.5 text-[10px] font-medium text-on-surface-variant">
                            {t.tiempo}
                          </div>
                        )}
                      </div>
                    )}

                    {t.domicilio && (
                      <div className="mt-1.5 flex items-center gap-1 text-[11px] font-bold">
                        <span
                          className={
                            t.domicilio === "Gratis"
                              ? "text-success"
                              : "text-on-surface-variant"
                          }
                        >
                          {t.domicilio === "Gratis"
                            ? "Envío Gratis"
                            : t.domicilio}
                        </span>
                      </div>
                    )}
                  </div>

                  <ArrowRight
                    size={18}
                    className="flex-shrink-0 opacity-30 group-hover:opacity-70 group-hover:translate-x-0.5 transition-all"
                  />
                </Link>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 pb-8 sm:grid-cols-2 lg:grid-cols-3">
              {tiendasOrdenadas.map((t) => (
                <Link
                  key={t.slug}
                  to={`/marketplace/tienda/${t.slug}`}
                  className="group relative flex flex-row items-center gap-3 rounded-3xl bg-surface p-2.5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(0,0,0,0.18)] sm:flex-col sm:items-stretch sm:gap-0 sm:p-3"
                >
                  {/* Contenedor de portada con logo superpuesto */}
                  <div className="relative h-24 w-28 flex-shrink-0 overflow-hidden rounded-2xl border border-outline/10 bg-background sm:mb-3 sm:h-28 sm:w-full">
                    <img
                      src={t.cover || t.logo}
                      alt={t.nombre}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = t.logo || "/default.png";
                      }}
                    />

                    <div className="absolute bottom-2 right-2 h-8 w-8 overflow-hidden shadow-md">
                      <img
                        src={t.logo || t.cover}
                        alt={t.nombre}
                        className="h-full w-full rounded-[9px] object-cover"
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
                  <div className="min-w-0 flex-1 sm:flex-auto">
                    <h4 className="truncate pr-2 text-base font-extrabold text-on-surface">
                      {t.nombre}
                    </h4>
                    <p className="mt-0.5 text-[11px] font-medium text-on-surface-variant">
                      {t.tipo}
                    </p>
                    {(t.rating || t.tiempo || t.domicilio) && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[8px] text-white/50 sm:text-[9px]">
                        {t.rating && (
                          <div className="flex items-center gap-0.5">
                            <Star size={10} />
                            <span>{t.rating}</span>
                          </div>
                        )}
                        {t.rating && t.tiempo && (
                          <span className="text-white/30">•</span>
                        )}
                        {t.tiempo && (
                          <div className="flex items-center gap-0.5">
                            <ClockFading size={10} />
                            <span>{t.tiempo}</span>
                          </div>
                        )}
                        {(t.rating || t.tiempo) && t.domicilio && (
                          <span className="text-white/30">•</span>
                        )}
                        {t.domicilio && (
                          <div className="flex items-center gap-0.5">
                            <Motorbike size={10} />
                            <span>
                              {t.domicilio === "Gratis"
                                ? "Gratis"
                                : t.domicilio}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
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
