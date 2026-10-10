import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER = [4.5709, -74.2973];

const isValidCoordinate = (latitude, longitude) =>
  latitude !== null &&
  latitude !== undefined &&
  latitude !== "" &&
  longitude !== null &&
  longitude !== undefined &&
  longitude !== "" &&
  Number.isFinite(Number(latitude)) &&
  Number.isFinite(Number(longitude)) &&
  Math.abs(Number(latitude)) <= 90 &&
  Math.abs(Number(longitude)) <= 180;

const PortalDomiciliarioMap = ({
  location,
  orders = [],
  radiusKm = 10,
  online = false,
  onSelectOrder,
  fullScreen = false,
  showRadius = true,
  selectedOrderId,
}) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const hasCenteredRef = useRef(false);
  const courierMarkerRef = useRef(null);
  const radiusCircleRef = useRef(null);
  const orderMarkersRef = useRef(null);
  const onSelectOrderRef = useRef(onSelectOrder);
  const [mapError, setMapError] = useState("");
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    onSelectOrderRef.current = onSelectOrder;
  }, [onSelectOrder]);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    let cancelled = false;
    let map;

    import("leaflet")
      .then((leafletModule) => {
        if (cancelled || !containerRef.current) return;
        const L = leafletModule.default || leafletModule;
        leafletRef.current = L;
        map = L.map(containerRef.current, {
          zoomControl: false,
          scrollWheelZoom: false,
        }).setView(DEFAULT_CENTER, 6);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(map);

        L.control.zoom({ position: "bottomright" }).addTo(map);
        orderMarkersRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setMapError("");
        setMapReady(true);
        window.setTimeout(() => map?.invalidateSize(), 100);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("No se pudo cargar el mapa del domiciliario:", error);
        setMapError("No se pudo cargar el mapa. Intenta actualizar la página.");
      });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      courierMarkerRef.current = null;
      radiusCircleRef.current = null;
      orderMarkersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!mapReady || !map || !L) return;

    if (!isValidCoordinate(location?.latitude, location?.longitude)) {
      courierMarkerRef.current?.remove();
      radiusCircleRef.current?.remove();
      courierMarkerRef.current = null;
      radiusCircleRef.current = null;
      hasCenteredRef.current = false;
      return;
    }

    const point = [Number(location.latitude), Number(location.longitude)];
    const courierIcon = L.divIcon({
      className: "",
      html: '<span style="display:flex;width:34px;height:34px;align-items:center;justify-content:center;border:3px solid white;border-radius:50%;background:#7c3aed;color:white;font-size:18px;box-shadow:0 2px 10px #0008">●</span>',
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });

    if (!courierMarkerRef.current) {
      courierMarkerRef.current = L.marker(point, { icon: courierIcon })
        .addTo(map)
        .bindTooltip("Tu ubicación");
    } else {
      courierMarkerRef.current.setLatLng(point);
    }

    if (!showRadius) {
      radiusCircleRef.current?.remove();
      radiusCircleRef.current = null;
    } else if (!radiusCircleRef.current) {
      radiusCircleRef.current = L.circle(point, {
        radius: Math.max(0.5, Number(radiusKm) || 10) * 1000,
        color: "#8b5cf6",
        weight: 1,
        fillColor: "#8b5cf6",
        fillOpacity: 0.08,
      }).addTo(map);
    } else {
      radiusCircleRef.current.setLatLng(point);
      radiusCircleRef.current.setRadius(Math.max(0.5, Number(radiusKm) || 10) * 1000);
    }

    if (!hasCenteredRef.current) {
      if (radiusCircleRef.current) {
        map.fitBounds(radiusCircleRef.current.getBounds(), {
          padding: [24, 24],
          maxZoom: 14,
          animate: false,
        });
      } else {
        map.setView(point, 15, { animate: false });
      }
      hasCenteredRef.current = true;
    } else if (online) {
      map.panTo(point, { animate: false });
    }
  }, [location, mapReady, online, radiusKm, showRadius]);

  useEffect(() => {
    const L = leafletRef.current;
    const markerLayer = orderMarkersRef.current;
    if (!mapReady || !L || !markerLayer) return;

    markerLayer.clearLayers();
    orders.forEach((order) => {
      if (
        !isValidCoordinate(
          order.destination_latitude,
          order.destination_longitude,
        )
      ) {
        return;
      }

      const marker = L.circleMarker(
        [
          Number(order.destination_latitude),
          Number(order.destination_longitude),
        ],
        {
          radius: order.order_id === selectedOrderId ? 12 : 9,
          color: "#ffffff",
          weight: 3,
          fillColor:
            order.order_id === selectedOrderId
              ? "#8b5cf6"
              : order.delivery_status === "available"
                ? order.courier_mode === "public"
                  ? "#f59e0b"
                  : "#a78bfa"
                : "#10b981",
          fillOpacity: 1,
        },
      );
      const popup = document.createElement("div");
      const business = document.createElement("strong");
      business.textContent = order.business_name || "Pedido disponible";
      const source = document.createElement("div");
      source.textContent =
        order.courier_mode === "public" ? "Pedido público" : "Pedido de tienda";
      const fee = document.createElement("div");
      fee.textContent = new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
      }).format(Number(order.delivery_fee) || 0);
      popup.append(business);
      popup.append(source);
      if (order.distance_km != null) {
        const distance = document.createElement("div");
        distance.textContent = `${Number(order.distance_km).toFixed(1)} km de ti`;
        popup.append(distance);
      }
      popup.append(fee);

      marker.bindPopup(popup);
      marker.on("click", () => onSelectOrderRef.current?.(order.order_id));
      marker.addTo(markerLayer);
    });
  }, [mapReady, orders, selectedOrderId]);

  return (
    <div
      className={
        fullScreen
          ? "fixed inset-0 z-0 h-[100dvh] w-screen overflow-hidden bg-neutral-900"
          : "relative h-[min(48vh,390px)] min-h-[270px] overflow-hidden rounded-3xl border border-white/10 bg-neutral-900 sm:h-[390px]"
      }
    >
      <div
        ref={containerRef}
        className="absolute inset-0 z-0"
        aria-label="Mapa de entregas cercanas"
      />
      {mapError && (
        <div
          role="alert"
          className="absolute inset-x-3 bottom-3 z-[400] rounded-xl border border-rose-400/20 bg-neutral-950/90 px-3 py-2 text-xs text-rose-200"
        >
          {mapError}
        </div>
      )}
    </div>
  );
};

export default PortalDomiciliarioMap;
