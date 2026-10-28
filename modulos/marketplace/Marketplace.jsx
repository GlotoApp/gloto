import React, { useState } from "react";
import {
  Routes,
  Route,
  useLocation,
  useNavigate,
  Link,
} from "react-router-dom";
import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  LoaderCircle,
  MapPin,
  Menu,
  ShieldCheck,
  Store,
  X,
} from "lucide-react";

import Home from "./pages/Home";
import Shop from "./pages/Shop";
import SeguimientoPedido from "./pages/SeguimientoPedido";
import { CartProvider } from "./pages/CartContext";
import TerminosCondiciones from "./pages/TerminosCondiciones";
import PoliticaPrivacidad from "./pages/PoliticaPrivacidad";

const LOCATION_STORAGE_KEY = "gloto_marketplace_location";
const LOCATION_PROMPT_KEY = "gloto_marketplace_location_prompt";

const COLOMBIAN_CITIES = [
  { name: "Cartagena", latitude: 10.391, longitude: -75.4794 },
  { name: "Barranquilla", latitude: 10.9639, longitude: -74.7964 },
  { name: "Santa Marta", latitude: 11.2408, longitude: -74.199 },
  { name: "Sincelejo", latitude: 9.3047, longitude: -75.3978 },
  { name: "Montería", latitude: 8.75, longitude: -75.8785 },
  { name: "Valledupar", latitude: 10.4631, longitude: -73.2532 },
  { name: "Riohacha", latitude: 11.5444, longitude: -72.9072 },
  { name: "Bogotá", latitude: 4.711, longitude: -74.0721 },
  { name: "Medellín", latitude: 6.2476, longitude: -75.5658 },
  { name: "Cali", latitude: 3.4516, longitude: -76.532 },
  { name: "Bucaramanga", latitude: 7.1193, longitude: -73.1227 },
  { name: "Cúcuta", latitude: 7.8891, longitude: -72.4967 },
  { name: "Pereira", latitude: 4.8087, longitude: -75.6906 },
  { name: "Manizales", latitude: 5.0703, longitude: -75.5138 },
  { name: "Armenia", latitude: 4.5339, longitude: -75.6811 },
  { name: "Ibagué", latitude: 4.4389, longitude: -75.2322 },
  { name: "Villavicencio", latitude: 4.142, longitude: -73.6266 },
  { name: "Pasto", latitude: 1.2136, longitude: -77.2811 },
  { name: "Neiva", latitude: 2.9273, longitude: -75.2819 },
  { name: "Popayán", latitude: 2.4448, longitude: -76.6147 },
];

const distanceInKm = (first, second) => {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

const getCityName = (latitude, longitude) => {
  const nearestCity = COLOMBIAN_CITIES.map((city) => ({
    ...city,
    distance: distanceInKm({ latitude, longitude }, city),
  })).sort((first, second) => first.distance - second.distance)[0];

  return nearestCity && nearestCity.distance <= 60
    ? nearestCity.name
    : "Ubicación detectada";
};

const readSavedLocation = () => {
  try {
    const savedLocation = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!savedLocation) return null;
    const location = JSON.parse(savedLocation);
    if (
      !Number.isFinite(location.latitude) ||
      !Number.isFinite(location.longitude) ||
      typeof location.city !== "string"
    ) {
      return null;
    }
    return location;
  } catch (error) {
    console.warn("No se pudo recuperar la ubicación guardada:", error);
    return null;
  }
};

const Marketplace = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isShopPage = location.pathname.includes("/tienda/");
  const isHomePage =
    location.pathname === "/marketplace" ||
    location.pathname === "/marketplace/";
  const [userLocation, setUserLocation] = useState(readSavedLocation);
  const [locationDialogOpen, setLocationDialogOpen] = useState(() => {
    try {
      return (
        !localStorage.getItem(LOCATION_STORAGE_KEY) &&
        localStorage.getItem(LOCATION_PROMPT_KEY) !== "dismissed"
      );
    } catch (error) {
      console.warn("No se pudo leer la preferencia de ubicación:", error);
      return false;
    }
  });
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [legalPanel, setLegalPanel] = useState(null);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Tu navegador no permite acceder a la ubicación.");
      return;
    }

    setIsLocating(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const nextLocation = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          city: getCityName(coords.latitude, coords.longitude),
        };
        setUserLocation(nextLocation);
        try {
          localStorage.setItem(
            LOCATION_STORAGE_KEY,
            JSON.stringify(nextLocation),
          );
          localStorage.setItem(LOCATION_PROMPT_KEY, "accepted");
        } catch (error) {
          console.warn(
            "No se pudo guardar la ubicación en este dispositivo:",
            error,
          );
        }
        setLocationDialogOpen(false);
        setIsLocating(false);
      },
      (error) => {
        setIsLocating(false);
        if (error.code === 1) {
          setLocationError(
            "No tenemos permiso para acceder a tu ubicación. Puedes activarlo en los ajustes del navegador.",
          );
          return;
        }
        if (error.code === 2) {
          setLocationError("No pudimos determinar tu ubicación en este momento.");
          return;
        }
        setLocationError("La ubicación tardó demasiado. Inténtalo de nuevo.");
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  };

  const dismissLocationPrompt = () => {
    try {
      localStorage.setItem(LOCATION_PROMPT_KEY, "dismissed");
    } catch (error) {
      console.warn("No se pudo guardar la preferencia de ubicación:", error);
    }
    setLocationDialogOpen(false);
    setLocationError("");
  };

  return (
    <div className="min-h-screen bg-background text-on-surface">
      {/* HEADER */}
      {!isShopPage && (
        <header className="sticky top-0 z-50 bg-background">
          <div className="px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center gap-3">
                <img
                  src="/gloto-logo.png"
                  alt="Gloto"
                  className="h-7 sm:h-8 object-contain"
                  onError={(e) => {
                    e.target.src = "/favicon.png";
                  }}
                />
                <span className="font-black text-lg sm:text-2xl tracking-tighter text-fff">
                  Gloto
                </span>
              </Link>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setLocationDialogOpen(true);
                  setLocationError("");
                }}
                disabled={isLocating}
                className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-bold transition-colors hover:bg-surface/80 disabled:cursor-wait disabled:opacity-70"
                aria-label="Cambiar ubicación"
                aria-busy={isLocating}
              >
                {isLocating ? (
                  <LoaderCircle
                    size={14}
                    className="animate-spin text-primary-container"
                  />
                ) : (
                  <MapPin size={14} className="text-primary-container" />
                )}
                <span>
                  {isLocating
                    ? "Buscando ubicación..."
                    : userLocation?.city || "Elegir ubicación"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLegalPanel(null);
                  setMenuOpen(true);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-outline/10 bg-surface text-on-surface transition hover:border-primary/30 hover:bg-surface/80"
                aria-label="Abrir menú"
                aria-expanded={menuOpen}
              >
                <Menu size={19} />
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Sidebar removed per UX decision */}

      {/* CONTENIDO */}
      <main className="view-animate">
        <CartProvider>
          <Routes>
            <Route path="/" element={<Home userLocation={userLocation} />} />
            <Route path="/tienda/:slug" element={<Shop />} />
            <Route path="/seguimiento" element={<SeguimientoPedido />} />
          </Routes>
        </CartProvider>
      </main>

      {menuOpen && (
        <div className="fixed inset-0 z-[90]" role="presentation">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
            aria-label="Cerrar menú"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menú de Gloto"
            className="absolute right-0 top-0 flex h-full w-[min(88vw,380px)] flex-col border-l border-white/10 bg-[#111114] shadow-2xl"
          >
            <div className="flex h-16 items-center justify-between border-b border-white/8 px-5">
              <div className="flex items-center gap-2">
                {legalPanel ? (
                  <button
                    type="button"
                    onClick={() => setLegalPanel(null)}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-300 hover:bg-white/5"
                    aria-label="Volver al menú"
                  >
                    <ArrowLeft size={20} />
                  </button>
                ) : (
                  <img src="/favicon.png" alt="" className="h-8 w-8 object-contain" />
                )}
                <span className="font-black tracking-tight text-white">
                  {legalPanel === "terms"
                    ? "Términos y condiciones"
                    : legalPanel === "privacy"
                      ? "Política de privacidad"
                      : "Gloto"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition hover:bg-white/5 hover:text-white"
                aria-label="Cerrar menú"
              >
                <X size={21} />
              </button>
            </div>

            {legalPanel ? (
              <div className="overflow-y-auto px-6 py-6 text-sm leading-6 text-neutral-300">
                {legalPanel === "terms" ? <TerminosCondiciones /> : <PoliticaPrivacidad />}
              </div>
            ) : (
              <div className="flex flex-1 flex-col px-4 py-5">
                <p className="px-2 text-[10px] font-black uppercase tracking-[0.16em] text-neutral-500">Información</p>
                <div className="mt-3 space-y-1">
                  <button
                    type="button"
                    onClick={() => setLegalPanel("terms")}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-neutral-200 transition hover:bg-white/[0.05]"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300"><FileText size={19} /></span>
                    <span className="flex-1">Términos y condiciones</span>
                    <ChevronRight size={18} className="text-neutral-600" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLegalPanel("privacy")}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-neutral-200 transition hover:bg-white/[0.05]"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-300"><ShieldCheck size={19} /></span>
                    <span className="flex-1">Política de privacidad</span>
                    <ChevronRight size={18} className="text-neutral-600" />
                  </button>
                </div>

                <div className="mt-auto rounded-2xl border border-violet-400/15 bg-gradient-to-br from-violet-500/15 to-violet-950/20 p-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500 text-white shadow-lg shadow-violet-950/30"><Store size={22} /></div>
                  <h2 className="mt-4 text-lg font-black text-white">¿Tienes un negocio?</h2>
                  <p className="mt-1 text-sm leading-5 text-neutral-400">Lleva tu tienda a Gloto y llega a más clientes de tu ciudad.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/solicitar-negocio");
                    }}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 text-sm font-black text-white transition hover:bg-violet-400"
                  >
                    Solicitar unirse a Gloto
                    <ExternalLink size={16} />
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {isHomePage && locationDialogOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm"
          role="presentation"
        >
          <section
            aria-labelledby="location-dialog-title"
            aria-modal="true"
            className="w-full max-w-md rounded-3xl border border-outline/20 bg-surface p-6 shadow-2xl sm:p-8"
            role="dialog"
          >
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <MapPin size={24} />
            </div>
            <h2
              id="location-dialog-title"
              className="text-xl font-black text-on-surface"
            >
              Encuentra tiendas cerca de ti
            </h2>
            <p className="mt-2 text-sm leading-6 text-on-surface-variant">
              Comparte tu ubicación para mostrar primero los negocios más
              cercanos y la ciudad en la que estás. Tu ubicación se guarda
              únicamente en este dispositivo.
            </p>
            {locationError && (
              <p className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {locationError}
              </p>
            )}
            <button
              type="button"
              onClick={requestLocation}
              disabled={isLocating}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-primary-container px-5 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
            >
              {isLocating ? (
                <>
                  <LoaderCircle size={16} className="animate-spin" />
                  Detectando ubicación...
                </>
              ) : (
                "Usar mi ubicación"
              )}
            </button>
            <button
              type="button"
              onClick={dismissLocationPrompt}
              disabled={isLocating}
              className="mt-3 w-full rounded-full px-5 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-50"
            >
              Ahora no, mostrar todas las tiendas
            </button>
          </section>
        </div>
      )}
    </div>
  );
};

export default Marketplace;
