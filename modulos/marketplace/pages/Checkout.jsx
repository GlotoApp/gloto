// Checkout.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  User,
  Phone,
  Armchair,
  MapPin,
  Store,
  Truck,
  Navigation,
  X,
  LocateFixed,
  Maximize2,
  Minimize2,
  LoaderCircle,
} from "lucide-react";
import { useCart } from "./CartContext";
import DeliveryMap from "../../pos/DeliveryMap";

const fmt = (n) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(n);

const PHOTON_URL = "https://photon.komoot.io/api/";
const PHOTON_REVERSE_URL = "https://photon.komoot.io/reverse";

const getDistanceKm = (first, second) => {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(first.latitude)) *
      Math.cos(toRadians(second.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

const getPlaceLabel = (properties = {}) => {
  const streetAddress = [
    properties.street,
    properties.housenumber,
  ].filter(Boolean).join(" ");
  const primary = streetAddress || properties.name;
  const locality = [
    properties.district,
    properties.suburb,
    properties.city,
    properties.state,
    properties.country,
  ].filter(Boolean);
  return [primary, ...locality]
    .filter(
      (part, index, values) =>
        part &&
        values.findIndex(
          (value) =>
            String(value).toLowerCase() === String(part).toLowerCase(),
        ) === index,
    )
    .join(", ");
};

// Capitaliza cada palabra: primera letra mayúscula, el resto en minúscula.
// Ej: "jorge puerta" -> "Jorge Puerta"
const capitalizarNombre = (texto) =>
  texto
    .toLowerCase()
    .split(" ")
    .map((palabra) =>
      palabra ? palabra.charAt(0).toUpperCase() + palabra.slice(1) : palabra,
    )
    .join(" ");

const METODOS_ENTREGA = [
  { id: "recoger", label: "Recoger", Icon: Store },
  { id: "mesa", label: "En mesa", Icon: Armchair },
  { id: "punto", label: "En punto", Icon: Navigation },
  { id: "domicilio", label: "Domicilio", Icon: Truck },
];

const clearButtonStyle = {
  position: "absolute",
  right: "14px",
  background: "none",
  border: "none",
  color: "rgba(255,255,255,0.3)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  padding: 0,
};

const inputStyle = {
  width: "100%",
  background: "#131313",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "14px",
  padding: "12px 14px 12px 42px",
  color: "#fff",
  fontSize: "16px",
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

const iconWrapStyle = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  marginBottom: "12px",
};

const iconInsideStyle = {
  position: "absolute",
  left: "14px",
  color: "rgba(255,255,255,0.35)",
  pointerEvents: "none",
};

const labelStyle = {
  display: "block",
  fontSize: "12px",
  fontWeight: 700,
  color: "rgba(255,255,255,0.7)",
  marginBottom: "10px",
};

const Checkout = ({ onVolver, onConfirmar }) => {
  const {
    nombreTienda,
    logoTienda,
    totalPrecio,
    metodoEntrega,
    setMetodoEntrega,
    datosCliente,
    actualizarDatoCliente,
    puedeConfirmarEntrega,
    deliverySettings,
  } = useCart();
  const [deliveryDistanceMeters, setDeliveryDistanceMeters] = useState(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [addressSearchError, setAddressSearchError] = useState("");
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [fullscreenSummaryHeight, setFullscreenSummaryHeight] = useState(0);
  const fullscreenSummaryRef = useRef(null);
  const skipAddressSearchRef = useRef("");
  const skipReverseGeocodeRef = useRef("");
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const origin = useMemo(() => {
    const latitude = Number(deliverySettings?.latitude);
    const longitude = Number(deliverySettings?.longitude);
    if (
      deliverySettings?.latitude == null ||
      deliverySettings?.longitude == null ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      return null;
    }
    return { latitude, longitude };
  }, [deliverySettings?.latitude, deliverySettings?.longitude]);
  const destination = useMemo(() => {
    const latitude = Number(datosCliente.latitude);
    const longitude = Number(datosCliente.longitude);
    if (
      datosCliente.latitude == null ||
      datosCliente.longitude == null ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      return null;
    }
    return { latitude, longitude };
  }, [datosCliente.latitude, datosCliente.longitude]);
  const handleDestinationChange = useCallback(
    (point) => {
      setDeliveryDistanceMeters(null);
      actualizarDatoCliente("latitude", point.latitude);
      actualizarDatoCliente("longitude", point.longitude);
      actualizarDatoCliente("direccion", "");
      setIsResolvingAddress(true);
      setAddressSearchError("");
      setLocationError("");
    },
    [actualizarDatoCliente],
  );

  useEffect(() => {
    if (!destination) {
      setIsResolvingAddress(false);
      return undefined;
    }

    const coordinateKey = `${destination.latitude.toFixed(6)},${destination.longitude.toFixed(6)}`;
    if (skipReverseGeocodeRef.current === coordinateKey) {
      skipReverseGeocodeRef.current = "";
      setIsResolvingAddress(false);
      return undefined;
    }
    if (datosCliente.direccion.trim()) {
      setIsResolvingAddress(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        lat: String(destination.latitude),
        lon: String(destination.longitude),
      });
      fetch(`${PHOTON_REVERSE_URL}?${params}`, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error("No se pudo consultar el lugar.");
          return response.json();
        })
        .then((result) => {
          const feature = result.features?.[0];
          const label = getPlaceLabel(feature?.properties);
          if (label) {
            skipAddressSearchRef.current = label;
            actualizarDatoCliente("direccion", label);
            setAddressSearchError("");
          } else {
            setAddressSearchError(
              "No encontramos el nombre de este lugar. Puedes escribir la dirección.",
            );
          }
        })
        .catch((error) => {
          if (error.name === "AbortError") return;
          console.error("No se pudo buscar la dirección del punto:", error);
          setAddressSearchError(
            "No se pudo obtener el nombre del lugar. Puedes escribir la dirección.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsResolvingAddress(false);
        });
    }, 600);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [destination, datosCliente.direccion, actualizarDatoCliente]);

  useEffect(() => {
    const query = datosCliente.direccion.trim();
    if (skipAddressSearchRef.current === query) {
      skipAddressSearchRef.current = "";
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      setIsSearchingAddress(false);
      return undefined;
    }
    if (query.length < 3 || metodoEntrega !== "domicilio") {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      setIsSearchingAddress(false);
      return undefined;
    }

    const controller = new AbortController();
    setAddressSearchError("");
    const timer = window.setTimeout(() => {
      if (controller.signal.aborted) return;
      setIsSearchingAddress(true);
      setShowAddressSuggestions(true);
      const params = new URLSearchParams({
        q: query,
        limit: "15",
      });
      if (origin) {
        params.set("lat", String(origin.latitude));
        params.set("lon", String(origin.longitude));
      }
      fetch(`${PHOTON_URL}?${params}`, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error("No se pudo buscar el lugar.");
          return response.json();
        })
        .then((result) => {
          const features = result.features || [];
          const orderedFeatures = origin
            ? features
                .map((feature) => {
                  const [longitude, latitude] =
                    feature.geometry?.coordinates || [];
                  return {
                    feature,
                    distance:
                      Number.isFinite(latitude) &&
                      Number.isFinite(longitude)
                        ? getDistanceKm(origin, { latitude, longitude })
                        : Number.POSITIVE_INFINITY,
                  };
                })
                .sort((first, second) => first.distance - second.distance)
                .map(({ feature }) => feature)
            : features;
          setAddressSuggestions(orderedFeatures);
          if (!orderedFeatures.length) {
            setAddressSearchError(
              "No encontramos ese lugar. Prueba con otra dirección o barrio.",
            );
          }
        })
        .catch((error) => {
          if (error.name === "AbortError") return;
          console.error("No se pudieron buscar direcciones:", error);
          setAddressSuggestions([]);
          setAddressSearchError(
            "La búsqueda de lugares no está disponible. Puedes marcar el punto en el mapa.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearchingAddress(false);
        });
    }, 600);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [datosCliente.direccion, metodoEntrega, origin]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (metodoEntrega === "domicilio") return;
    setDeliveryDistanceMeters(null);
    setIsCalculatingRoute(false);
    setRouteError("");
  }, [metodoEntrega]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    if (!isMapFullscreen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsMapFullscreen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMapFullscreen]);

  useEffect(() => {
    if (!isMapFullscreen || !fullscreenSummaryRef.current) {
      setFullscreenSummaryHeight(0);
      return undefined;
    }
    const summary = fullscreenSummaryRef.current;
    const updateHeight = () =>
      setFullscreenSummaryHeight(summary.getBoundingClientRect().height);
    updateHeight();
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateHeight)
        : null;
    observer?.observe(summary);
    return () => observer?.disconnect();
  }, [isMapFullscreen]);

  const deliveryRate = Number(deliverySettings?.delivery_fee_per_km);
  const minimumDeliveryFee = Number(deliverySettings?.min_delivery_fee);
  const maximumDeliveryFee = Number(deliverySettings?.max_delivery_fee);
  const deliveryPricingConfigured =
    deliverySettings?.delivery_fee_per_km != null &&
    deliverySettings?.min_delivery_fee != null &&
    deliverySettings?.max_delivery_fee != null &&
    Number.isFinite(deliveryRate) &&
    Number.isFinite(minimumDeliveryFee) &&
    Number.isFinite(maximumDeliveryFee) &&
    minimumDeliveryFee <= maximumDeliveryFee;
  const distanceKm =
    deliveryDistanceMeters === null ? null : deliveryDistanceMeters / 1000;
  const rawDeliveryFee =
    distanceKm !== null && deliveryPricingConfigured
      ? Math.max(minimumDeliveryFee, Math.round(distanceKm * deliveryRate))
      : null;
  const roundedDeliveryFee =
    rawDeliveryFee === null ? null : Math.ceil(rawDeliveryFee / 100) * 100;
  const baseDeliveryFee =
    roundedDeliveryFee === null
      ? null
      : Math.min(maximumDeliveryFee, roundedDeliveryFee);
  const surchargeStart = String(
    deliverySettings?.night_delivery_surcharge_start || "",
  ).slice(0, 5);
  const surchargeEnd = String(
    deliverySettings?.night_delivery_surcharge_end || "",
  ).slice(0, 5);
  const currentDeliveryTime = `${String(currentTime.getHours()).padStart(2, "0")}:${String(currentTime.getMinutes()).padStart(2, "0")}`;
  const isNightSurchargeTime =
    Boolean(deliverySettings?.night_delivery_surcharge_enabled) &&
    Boolean(surchargeStart && surchargeEnd && surchargeStart !== surchargeEnd) &&
    (surchargeStart < surchargeEnd
      ? currentDeliveryTime >= surchargeStart &&
        currentDeliveryTime < surchargeEnd
      : currentDeliveryTime >= surchargeStart ||
        currentDeliveryTime < surchargeEnd);
  const nightSurchargePercent =
    Number(deliverySettings?.night_delivery_surcharge_percent) || 0;
  const nightSurcharge =
    baseDeliveryFee !== null && isNightSurchargeTime
      ? Math.ceil(
          Math.round((baseDeliveryFee * nightSurchargePercent) / 100) / 100,
        ) * 100
      : 0;
  const deliveryFee = baseDeliveryFee === null ? 0 : baseDeliveryFee + nightSurcharge;
  const isDeliveryValueLoading =
    isCalculatingRoute ||
    isLocating ||
    isResolvingAddress ||
    isSearchingAddress;
  const canConfirmDelivery =
    metodoEntrega !== "domicilio" ||
    Boolean(origin && destination && deliveryDistanceMeters !== null) &&
      !isCalculatingRoute &&
      !routeError &&
      deliveryPricingConfigured &&
      baseDeliveryFee !== null;
  const canConfirmOrder = puedeConfirmarEntrega && canConfirmDelivery;
  const confirmationMessage = !metodoEntrega
    ? "Selecciona un método de entrega"
    : metodoEntrega === "domicilio" && !origin
      ? "La tienda debe configurar su ubicación en el mapa"
      : metodoEntrega === "domicilio" && !destination
        ? "Selecciona tu ubicación en el mapa para continuar"
        : metodoEntrega === "domicilio" && !deliveryPricingConfigured
          ? "La tienda debe configurar el costo del domicilio"
          : metodoEntrega === "domicilio" && isCalculatingRoute
            ? "Calculando ruta, espera un momento"
            : metodoEntrega === "domicilio" && routeError
              ? "No se pudo calcular la ruta; vuelve a seleccionar el punto"
              : metodoEntrega === "domicilio" &&
                  deliveryDistanceMeters === null
                ? "Espera a que se calcule la distancia del domicilio"
                : !puedeConfirmarEntrega
                  ? "Completa tus datos para continuar"
                  : "";

  const handleConfirmar = () => {
    if (!canConfirmOrder) return;
    actualizarDatoCliente("deliveryFee", deliveryFee);
    if (onConfirmar) onConfirmar(deliveryFee);
  };

  useEffect(() => {
    actualizarDatoCliente(
      "deliveryFee",
      metodoEntrega === "domicilio" ? deliveryFee : 0,
    );
  }, [deliveryFee, metodoEntrega, actualizarDatoCliente]);

  const locateCustomer = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError("Tu navegador no permite obtener la ubicación.");
      return;
    }
    setIsLocating(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        handleDestinationChange({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        setIsLocating(false);
      },
      (error) => {
        console.error("No se pudo obtener la ubicación del cliente:", error);
        setLocationError(
          "No se pudo obtener tu ubicación. Revisa los permisos o selecciona el punto en el mapa.",
        );
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [handleDestinationChange]);

  const selectAddressSuggestion = (feature) => {
    const [longitude, latitude] = feature.geometry?.coordinates || [];
    if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
      setAddressSearchError("Este resultado no tiene una ubicación válida.");
      return;
    }

    const label =
      getPlaceLabel(feature.properties) ||
      `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`;
    skipReverseGeocodeRef.current = `${Number(latitude).toFixed(6)},${Number(longitude).toFixed(6)}`;
    skipAddressSearchRef.current = label;
    setDeliveryDistanceMeters(null);
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
    setAddressSearchError("");
    setIsResolvingAddress(false);
    actualizarDatoCliente("direccion", label);
    actualizarDatoCliente("latitude", Number(latitude));
    actualizarDatoCliente("longitude", Number(longitude));
  };

  const renderAddressInput = () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        margin: "12px 0",
      }}
    >
      <div
        style={{ ...iconWrapStyle, flex: 1, minWidth: 0, marginBottom: 0 }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            window.setTimeout(() => setShowAddressSuggestions(false), 150);
          }
        }}
      >
        <MapPin size={16} style={iconInsideStyle} />
        <input
          style={inputStyle}
          placeholder={
            isResolvingAddress
              ? "Buscando dirección del punto..."
              : "Dirección (ej. Calle 10 # 5-20)"
          }
          value={datosCliente.direccion}
          autoComplete="off"
          onFocus={() => {
            if (addressSuggestions.length) setShowAddressSuggestions(true);
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              showAddressSuggestions &&
              addressSuggestions.length
            ) {
              event.preventDefault();
              selectAddressSuggestion(addressSuggestions[0]);
            }
          }}
          onChange={(event) => {
            setDeliveryDistanceMeters(null);
            setIsResolvingAddress(false);
            setAddressSearchError("");
            actualizarDatoCliente("latitude", null);
            actualizarDatoCliente("longitude", null);
            actualizarDatoCliente("direccion", event.target.value);
          }}
        />
        {datosCliente.direccion && (
          <button
            type="button"
            style={clearButtonStyle}
            onClick={() => {
              setDeliveryDistanceMeters(null);
              setAddressSuggestions([]);
              setShowAddressSuggestions(false);
              actualizarDatoCliente("direccion", "");
              actualizarDatoCliente("latitude", null);
              actualizarDatoCliente("longitude", null);
            }}
            aria-label="Borrar dirección"
          >
            <X size={16} />
          </button>
        )}
        {showAddressSuggestions && (
          <div
            role="listbox"
            aria-label="Lugares sugeridos"
            style={{
              position: "absolute",
              zIndex: 30,
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              maxHeight: "240px",
              overflowY: "auto",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "12px",
              background: "#171717",
              boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
            }}
          >
            {isSearchingAddress && (
              <p
                style={{
                  margin: 0,
                  padding: "12px",
                  color: "rgba(255,255,255,0.65)",
                  fontSize: "12px",
                }}
              >
                Buscando lugares...
              </p>
            )}
            {!isSearchingAddress &&
              addressSuggestions.map((feature, index) => {
                const label = getPlaceLabel(feature.properties);
                const [longitude, latitude] =
                  feature.geometry?.coordinates || [];
                const key = `${feature.properties?.osm_type || "place"}-${feature.properties?.osm_id || index}-${latitude}-${longitude}`;
                return (
                  <button
                    key={key}
                    type="button"
                    role="option"
                    onClick={() => selectAddressSuggestion(feature)}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "11px 13px",
                      borderBottom:
                        index < addressSuggestions.length - 1
                          ? "1px solid rgba(255,255,255,0.08)"
                          : "none",
                      background: "transparent",
                      color: "#fff",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        fontSize: "13px",
                        fontWeight: 700,
                      }}
                    >
                      {label || "Lugar en el mapa"}
                    </span>
                  </button>
                );
              })}
            {!isSearchingAddress && addressSearchError && (
              <p
                role="status"
                style={{
                  margin: 0,
                  padding: "12px",
                  color: "rgba(255,255,255,0.65)",
                  fontSize: "12px",
                }}
              >
                {addressSearchError}
              </p>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => locateCustomer()}
        disabled={isLocating}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          minHeight: "46px",
          padding: "0 12px",
          border: "1px solid rgba(167,139,250,0.35)",
          borderRadius: "12px",
          color: "#c4b5fd",
          background: "#171717",
          fontSize: "11px",
          fontWeight: 700,
          whiteSpace: "nowrap",
          cursor: isLocating ? "wait" : "pointer",
          opacity: isLocating ? 0.65 : 1,
        }}
      >
        <LocateFixed size={15} />
        {isLocating ? "Buscando..." : "Usar mi ubicación"}
      </button>
    </div>
  );

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0a0a0a",
        color: "#fff",
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "11px 4px",
          borderBottom: "1px solid #1a1a1a",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onVolver}
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
          aria-label="Volver al carrito"
        >
          <ChevronLeft size={20} color="#fff" />
        </button>
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "12px",
            background: "#131313",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {logoTienda ? (
            <img
              src={logoTienda}
              alt={`Logo de ${nombreTienda}`}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = "/default.png";
              }}
            />
          ) : (
            <Store size={24} style={{ color: "rgba(255,255,255,0.3)" }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: "16px", fontWeight: 800, margin: 0 }}>
            Entrega
          </h2>
          <p
            style={{
              fontSize: "12px",
              color: "rgba(255,255,255,0.45)",
              margin: 0,
            }}
          >
            {nombreTienda}
          </p>
        </div>
      </div>

      {/* Cuerpo scrolleable */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 20px 40px",
        }}
      >
        <p style={labelStyle}>¿Cómo deseas recibir tu pedido?</p>

        <div
          style={{
            display: "grid",
            // Definimos las 4 columnas
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "10px",
            marginBottom: "24px",
            // Esto asegura que si los botones son más pequeños que su celda, se centren
            justifyItems: "center",
          }}
        >
          {METODOS_ENTREGA.map(({ id, label, Icon }) => {
            const activo = metodoEntrega === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setMetodoEntrega(id)}
                style={{
                  background: activo ? "rgba(124,58,237,0.15)" : "#131313",
                  color: activo ? "#fff" : "rgba(255,255,255,0.7)",
                  // Ajusté el padding horizontal un poco para que quepan mejor 4 en fila
                  padding: "12px 4px",
                  borderRadius: "12px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center", // Centrado vertical del contenido del botón
                  gap: "6px",
                  fontSize: "11px", // Reducí un poco la fuente para que no se corte
                  fontWeight: 700,
                  width: "100%", // Asegura que ocupen el espacio de la columna
                }}
              >
                <Icon
                  size={20}
                  style={{ color: activo ? "#a78bfa" : "inherit" }}
                />
                {label}
              </button>
            );
          })}
        </div>

        {/* Datos comunes: solo se muestran tras elegir un método */}
        {metodoEntrega && (
          <>
            <p style={labelStyle}>Tus datos</p>

            <div style={iconWrapStyle}>
              <User size={16} style={iconInsideStyle} />
              <input
                style={inputStyle}
                placeholder="Nombre completo"
                value={datosCliente.nombre}
                onChange={(e) =>
                  actualizarDatoCliente(
                    "nombre",
                    capitalizarNombre(e.target.value),
                  )
                }
              />
              {/* Botón de borrado rápido */}
              {datosCliente.nombre && (
                <button
                  type="button"
                  style={clearButtonStyle}
                  onClick={() => actualizarDatoCliente("nombre", "")}
                  aria-label="Borrar nombre"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div style={iconWrapStyle}>
              <Phone size={16} style={iconInsideStyle} />
              <input
                style={inputStyle}
                placeholder="Teléfono de contacto"
                inputMode="tel"
                value={datosCliente.telefono}
                onChange={(e) => {
                  // Expresión regular: permite solo números y el signo +
                  const value = e.target.value.replace(/[^0-9+]/g, "");
                  actualizarDatoCliente("telefono", value);
                }}
              />
              {/* Botón de borrado rápido */}
              {datosCliente.telefono && (
                <button
                  type="button"
                  style={clearButtonStyle}
                  onClick={() => actualizarDatoCliente("telefono", "")}
                  aria-label="Borrar teléfono"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Mesa */}
            {metodoEntrega === "mesa" && (
              <div style={iconWrapStyle}>
                <Armchair size={16} style={iconInsideStyle} />
                <input
                  style={inputStyle}
                  placeholder="Número de mesa"
                  inputMode="numeric"
                  value={datosCliente.mesa}
                  onChange={(e) => {
                    // Expresión regular: permite solo números
                    const value = e.target.value.replace(/[^0-9]/g, "");
                    actualizarDatoCliente("mesa", value);
                  }}
                />
                {datosCliente.mesa && (
                  <button
                    type="button"
                    style={clearButtonStyle}
                    onClick={() => actualizarDatoCliente("mesa", "")}
                    aria-label="Borrar número de mesa"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            )}

            {/* Domicilio */}
            {metodoEntrega === "domicilio" && (
              <>
                {!isMapFullscreen && renderAddressInput()}
                {!isMapFullscreen && (
                  <div style={iconWrapStyle}>
                    <Store size={16} style={iconInsideStyle} />
                    <input
                      style={inputStyle}
                      placeholder="Punto de referencia (ej. Casa color azul)"
                      value={datosCliente.referencia || ""}
                      onChange={(event) =>
                        actualizarDatoCliente(
                          "referencia",
                          event.target.value,
                        )
                      }
                    />
                    {datosCliente.referencia && (
                      <button
                        type="button"
                        style={clearButtonStyle}
                        onClick={() =>
                          actualizarDatoCliente("referencia", "")
                        }
                        aria-label="Borrar punto de referencia"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                )}

                <div
                  style={
                    isMapFullscreen
                      ? {
                          position: "fixed",
                          inset: 0,
                          zIndex: 500,
                          margin: 0,
                          background: "#09090b",
                        }
                      : {
                          position: "relative",
                          marginTop: "4px",
                          marginBottom: "12px",
                        }
                  }
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: isMapFullscreen
                        ? "space-between"
                        : "flex-end",
                      gap: "10px",
                      position: "absolute",
                      zIndex: 2,
                      top: isMapFullscreen
                        ? "max(16px, env(safe-area-inset-top))"
                        : "10px",
                      left: isMapFullscreen ? "16px" : "10px",
                      right: isMapFullscreen ? "16px" : "10px",
                    }}
                  >
                    {isMapFullscreen && (
                      <div
                        style={{
                          position: "relative",
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        <input
                          style={{
                            ...inputStyle,
                            height: "42px",
                            padding: "8px 38px 8px 12px",
                            borderColor: "rgba(255,255,255,0.18)",
                            background: "rgba(9,9,11,0.96)",
                          }}
                          aria-label="Buscar dirección o barrio"
                          aria-autocomplete="list"
                          aria-expanded={showAddressSuggestions}
                          placeholder="Buscar dirección o barrio"
                          value={datosCliente.direccion}
                          autoComplete="off"
                          onFocus={() => {
                            if (addressSuggestions.length) {
                              setShowAddressSuggestions(true);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (
                              event.key === "Enter" &&
                              showAddressSuggestions &&
                              addressSuggestions.length
                            ) {
                              event.preventDefault();
                              selectAddressSuggestion(addressSuggestions[0]);
                            }
                          }}
                          onChange={(event) => {
                            setDeliveryDistanceMeters(null);
                            setIsResolvingAddress(false);
                            setAddressSearchError("");
                            actualizarDatoCliente("latitude", null);
                            actualizarDatoCliente("longitude", null);
                            actualizarDatoCliente(
                              "direccion",
                              event.target.value,
                            );
                          }}
                        />
                        {datosCliente.direccion && (
                          <button
                            type="button"
                            onClick={() => {
                              setDeliveryDistanceMeters(null);
                              setAddressSuggestions([]);
                              setShowAddressSuggestions(false);
                              actualizarDatoCliente("direccion", "");
                              actualizarDatoCliente("latitude", null);
                              actualizarDatoCliente("longitude", null);
                            }}
                            aria-label="Borrar dirección"
                            style={{
                              ...clearButtonStyle,
                              top: "13px",
                              right: "12px",
                            }}
                          >
                            <X size={16} />
                          </button>
                        )}
                        {showAddressSuggestions && (
                          <div
                            role="listbox"
                            aria-label="Lugares sugeridos"
                            style={{
                              position: "absolute",
                              zIndex: 5,
                              top: "calc(100% + 6px)",
                              left: 0,
                              right: 0,
                              maxHeight: "min(40vh, 280px)",
                              overflowY: "auto",
                              border: "1px solid rgba(255,255,255,0.12)",
                              borderRadius: "12px",
                              background: "#171717",
                              boxShadow: "0 12px 30px rgba(0,0,0,0.55)",
                            }}
                          >
                            {isSearchingAddress && (
                              <p
                                style={{
                                  margin: 0,
                                  padding: "12px",
                                  color: "rgba(255,255,255,0.65)",
                                  fontSize: "12px",
                                }}
                              >
                                Buscando lugares...
                              </p>
                            )}
                            {!isSearchingAddress &&
                              addressSuggestions.map((feature, index) => {
                                const label = getPlaceLabel(
                                  feature.properties,
                                );
                                const [longitude, latitude] =
                                  feature.geometry?.coordinates || [];
                                return (
                                  <button
                                    key={`${feature.properties?.osm_type || "place"}-${feature.properties?.osm_id || index}-${latitude}-${longitude}`}
                                    type="button"
                                    role="option"
                                    onClick={() =>
                                      selectAddressSuggestion(feature)
                                    }
                                    style={{
                                      display: "block",
                                      width: "100%",
                                      padding: "11px 13px",
                                      borderBottom:
                                        index < addressSuggestions.length - 1
                                          ? "1px solid rgba(255,255,255,0.08)"
                                          : "none",
                                      background: "transparent",
                                      color: "#fff",
                                      textAlign: "left",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <span
                                      style={{
                                        display: "block",
                                        fontSize: "13px",
                                        fontWeight: 700,
                                      }}
                                    >
                                      {label || "Lugar en el mapa"}
                                    </span>
                                    <span
                                      style={{
                                        display: "block",
                                        marginTop: "3px",
                                        color: "rgba(255,255,255,0.5)",
                                        fontSize: "10px",
                                      }}
                                    >
                                      Usar esta ubicación en el mapa
                                    </span>
                                  </button>
                                );
                              })}
                            {!isSearchingAddress && addressSearchError && (
                              <p
                                role="status"
                                style={{
                                  margin: 0,
                                  padding: "12px",
                                  color: "rgba(255,255,255,0.65)",
                                  fontSize: "12px",
                                }}
                              >
                                {addressSearchError}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: "8px" }}>
                      {isMapFullscreen ? (
                        <button
                          type="button"
                          onClick={() => setIsMapFullscreen(false)}
                          aria-label="Cerrar mapa en pantalla completa"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "36px",
                            height: "36px",
                            border: "1px solid rgba(255,255,255,0.2)",
                            borderRadius: "10px",
                            color: "#fff",
                            background: "rgba(9,9,11,0.9)",
                            cursor: "pointer",
                          }}
                        >
                          <Minimize2 size={17} />
                        </button>
                      ) : origin ? (
                        <button
                          type="button"
                          onClick={() => setIsMapFullscreen(true)}
                          aria-label="Abrir mapa en pantalla completa"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "36px",
                            height: "36px",
                            border: "1px solid rgba(167,139,250,0.3)",
                            borderRadius: "10px",
                            color: "#c4b5fd",
                            background: "#131313",
                            cursor: "pointer",
                          }}
                        >
                          <Maximize2 size={17} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {origin ? (
                    <div
                      style={
                        isMapFullscreen
                          ? {
                              position: "absolute",
                              inset: 0,
                            }
                          : { position: "relative" }
                      }
                    >
                      <DeliveryMap
                        origin={origin}
                        originLogoUrl={logoTienda}
                        destination={destination}
                        onDestinationChange={handleDestinationChange}
                        onRouteChange={setDeliveryDistanceMeters}
                        onRoutingChange={setIsCalculatingRoute}
                        onRouteErrorChange={setRouteError}
                        fullHeight={isMapFullscreen}
                      />
                      <button
                        type="button"
                        onClick={() => locateCustomer()}
                        disabled={isLocating}
                        aria-label={
                          isLocating
                            ? "Buscando mi ubicación"
                            : "Usar mi ubicación"
                        }
                        title={
                          isLocating
                            ? "Buscando mi ubicación"
                            : "Usar mi ubicación"
                        }
                        style={{
                          position: "absolute",
                          zIndex: 3,
                          right: "12px",
                          bottom: isMapFullscreen
                            ? `calc(${fullscreenSummaryHeight}px + 22px)`
                            : "30px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "42px",
                          height: "42px",
                          border: "1px solid rgba(167,139,250,0.4)",
                          borderRadius: "50%",
                          color: "#c4b5fd",
                          background: "rgba(9,9,11,0.94)",
                          boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
                          cursor: isLocating ? "wait" : "pointer",
                          opacity: isLocating ? 0.65 : 1,
                        }}
                      >
                        <LocateFixed
                          size={19}
                          className={isLocating ? "animate-pulse" : undefined}
                        />
                      </button>
                    </div>
                  ) : (
                    <div
                      role="alert"
                      style={{
                        border: "1px solid rgba(251,191,36,0.2)",
                        borderRadius: "14px",
                        background: "rgba(251,191,36,0.06)",
                        padding: "14px 64px 62px 14px",
                        color: "#fde68a",
                        fontSize: "12px",
                      }}
                    >
                      Esta tienda aún no configuró su ubicación en el mapa.
                      Contacta al negocio para completar el pedido.
                    </div>
                  )}
                  {isMapFullscreen && (
                    <div
                      ref={fullscreenSummaryRef}
                      role="region"
                      aria-label="Resumen del domicilio"
                      style={{
                        position: "absolute",
                        zIndex: 2,
                        left: "12px",
                        right: "12px",
                        bottom: "max(12px, env(safe-area-inset-bottom))",
                        maxHeight: "42vh",
                        overflowY: "auto",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "18px",
                        background: "rgba(9,9,11,0.94)",
                        backdropFilter: "blur(12px)",
                        padding: "14px",
                        boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
                      }}
                    >
                      <p style={{ fontSize: "13px", fontWeight: 800, margin: "0 0 10px" }}>
                        Resumen del domicilio
                      </p>
                      {routeError && (
                        <p role="alert" style={{ color: "#fca5a5", fontSize: "12px", margin: "0 0 8px" }}>
                          {routeError}
                        </p>
                      )}
                      {locationError && (
                        <p role="alert" style={{ color: "#fca5a5", fontSize: "12px", margin: "0 0 8px" }}>
                          {locationError}
                        </p>
                      )}
                      {!deliveryPricingConfigured && (
                        <p role="alert" style={{ color: "#fde68a", fontSize: "12px", margin: "0 0 8px" }}>
                          La tienda todavía no configuró sus tarifas de domicilio.
                        </p>
                      )}
                      {!destination && (
                        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "12px", margin: "0 0 8px" }}>
                          Toca el mapa para marcar el destino o arrastra el marcador verde.
                        </p>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                          <span style={{ color: "rgba(255,255,255,0.65)" }}>Distancia por carretera</span>
                          <strong>
                            {distanceKm !== null ? (
                              `${distanceKm.toFixed(2)} km`
                            ) : isDeliveryValueLoading ? (
                              <LoaderCircle
                                size={14}
                                aria-label="Calculando distancia"
                                className="animate-spin"
                              />
                            ) : (
                              "—"
                            )}
                          </strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                          <span style={{ color: "rgba(255,255,255,0.65)" }}>Domicilio base</span>
                          <strong>
                            {baseDeliveryFee !== null ? (
                              fmt(baseDeliveryFee)
                            ) : isDeliveryValueLoading ? (
                              <LoaderCircle
                                size={14}
                                aria-label="Calculando domicilio"
                                className="animate-spin"
                              />
                            ) : (
                              "—"
                            )}
                          </strong>
                        </div>
                        {nightSurcharge > 0 && (
                          <div style={{ display: "flex", justifyContent: "space-between", color: "#fde68a", fontSize: "12px" }}>
                            <span>Recargo nocturno ({nightSurchargePercent}%)</span>
                            <strong>+ {fmt(nightSurcharge)}</strong>
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: "8px", fontSize: "13px" }}>
                          <strong>Total domicilio</strong>
                          <strong>
                            {baseDeliveryFee !== null ? (
                              fmt(deliveryFee)
                            ) : isDeliveryValueLoading ? (
                              <LoaderCircle
                                size={14}
                                aria-label="Calculando total"
                                className="animate-spin"
                              />
                            ) : (
                              "—"
                            )}
                          </strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,0.7)", fontSize: "12px" }}>
                          <span>Total del pedido</span>
                          <strong style={{ color: "#fff" }}>
                            {baseDeliveryFee !== null ? (
                              fmt(totalPrecio + deliveryFee)
                            ) : isDeliveryValueLoading ? (
                              <LoaderCircle
                                size={14}
                                aria-label="Calculando total del pedido"
                                className="animate-spin"
                              />
                            ) : (
                              "—"
                            )}
                          </strong>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsMapFullscreen(false)}
                        style={{
                          width: "100%",
                          marginTop: "12px",
                          padding: "11px",
                          border: "none",
                          borderRadius: "12px",
                          background: "#7c3aed",
                          color: "#fff",
                          fontSize: "13px",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        Listo
                      </button>
                    </div>
                  )}
                  {!isMapFullscreen && routeError && (
                    <p role="alert" style={{ color: "#fca5a5", fontSize: "11px", marginTop: "8px" }}>
                      {routeError}
                    </p>
                  )}
                  {!isMapFullscreen && locationError && (
                    <p role="alert" style={{ color: "#fca5a5", fontSize: "11px", marginTop: "8px" }}>
                      {locationError}
                    </p>
                  )}
                  {!isMapFullscreen && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                        marginTop: "10px",
                        borderRadius: "12px",
                        background: "rgba(124,58,237,0.1)",
                        padding: "12px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                        <span style={{ color: "rgba(255,255,255,0.65)" }}>
                          Distancia por carretera
                        </span>
                        <strong>
                          {distanceKm !== null ? (
                            `${distanceKm.toFixed(2)} km`
                          ) : isDeliveryValueLoading ? (
                            <LoaderCircle
                              size={14}
                              aria-label="Calculando distancia"
                              className="animate-spin"
                            />
                          ) : (
                            "—"
                          )}
                        </strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                        <span style={{ color: "rgba(255,255,255,0.65)" }}>
                          Domicilio base
                        </span>
                        <strong>
                          {baseDeliveryFee !== null ? (
                            fmt(baseDeliveryFee)
                          ) : isDeliveryValueLoading ? (
                            <LoaderCircle
                              size={14}
                              aria-label="Calculando domicilio"
                              className="animate-spin"
                            />
                          ) : (
                            "—"
                          )}
                        </strong>
                      </div>
                      {nightSurcharge > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", color: "#fde68a", fontSize: "12px" }}>
                          <span>Recargo nocturno ({nightSurchargePercent}%)</span>
                          <strong>+ {fmt(nightSurcharge)}</strong>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "6px", fontSize: "13px" }}>
                        <strong>Total domicilio</strong>
                        <strong>
                          {baseDeliveryFee !== null ? (
                            fmt(deliveryFee)
                          ) : isDeliveryValueLoading ? (
                            <LoaderCircle
                              size={14}
                              aria-label="Calculando total"
                              className="animate-spin"
                            />
                          ) : (
                            "—"
                          )}
                        </strong>
                      </div>
                    </div>
                  )}
                  {!deliveryPricingConfigured && origin && (
                    <p style={{ color: "#fde68a", fontSize: "11px", marginTop: "8px" }}>
                      La tienda todavía no configuró sus tarifas de domicilio.
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Punto de encuentro */}
            {metodoEntrega === "punto" && (
              <div style={iconWrapStyle}>
                <Navigation size={16} style={iconInsideStyle} />
                <input
                  style={inputStyle}
                  placeholder="¿En qué punto te encuentras?"
                  value={datosCliente.puntoRetiro}
                  onChange={(e) =>
                    actualizarDatoCliente("puntoRetiro", e.target.value)
                  }
                />
                {datosCliente.puntoRetiro && (
                  <button
                    type="button"
                    style={clearButtonStyle}
                    onClick={() => actualizarDatoCliente("puntoRetiro", "")}
                    aria-label="Borrar punto de encuentro"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "16px 20px",
          paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
          borderTop: "1px solid #1a1a1a",
          flexShrink: 0,
        }}
      >
        {!canConfirmOrder && (
          <p
            style={{
              fontSize: "11.5px",
              color: "rgba(255,209,102,0.85)",
              marginBottom: "10px",
              textAlign: "center",
            }}
          >
            {confirmationMessage}
          </p>
        )}

        <button
          type="button"
          onClick={handleConfirmar}
          disabled={!canConfirmOrder}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "100px",
            background: canConfirmOrder
              ? "#7c3aed"
              : "rgba(124,58,237,0.25)",
            color: canConfirmOrder ? "#fff" : "rgba(255,255,255,0.5)",
            fontWeight: 800,
            fontSize: "14px",
            border: "none",
            cursor: canConfirmOrder ? "pointer" : "not-allowed",
            boxShadow: canConfirmOrder
              ? "0 8px 32px rgba(124,58,237,0.45)"
              : "none",
            transition: "all 0.15s",
          }}
        >
          Confirmar pedido · {fmt(totalPrecio + deliveryFee)}
        </button>
      </div>
    </div>,
    document.body,
  );
};

export default Checkout;
