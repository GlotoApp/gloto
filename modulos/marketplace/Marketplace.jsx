import React, { useState } from "react";
import {
  Routes,
  Route,
  useLocation,
  useNavigate,
  Link,
} from "react-router-dom";
import { LoaderCircle, MapPin } from "lucide-react";

import Home from "./pages/Home";
import Shop from "./pages/Shop";
import SeguimientoPedido from "./pages/SeguimientoPedido";
import { CartProvider } from "./pages/CartContext";

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

            <button
              type="button"
              onClick={() => {
                setLocationDialogOpen(true);
                setLocationError("");
              }}
              className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-bold transition-colors hover:bg-surface/80"
              aria-label="Cambiar ubicación"
            >
              <MapPin size={14} className="text-primary-container" />
              <span>{userLocation?.city || "Elegir ubicación"}</span>
            </button>
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
