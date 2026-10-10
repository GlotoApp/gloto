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
  activeDelivery = null,
}) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const hasCenteredRef = useRef(false);
  const courierMarkerRef = useRef(null);
  const radiusCircleRef = useRef(null);
  const orderMarkersRef = useRef(null);
  const fittedActiveDeliveryRef = useRef(null);
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
      html: '<span class="courier-location-pin"><span class="courier-location-wave courier-location-wave--first"></span><span class="courier-location-wave courier-location-wave--second"></span><span class="courier-location-center">●</span></span>',
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });

    if (!courierMarkerRef.current) {
      courierMarkerRef.current = L.marker(point, { icon: courierIcon })
        .addTo(map)
        .bindTooltip("Tu ubicación");
    } else {
      courierMarkerRef.current.setLatLng(point);
    }
    courierMarkerRef.current
      .getElement()
      ?.querySelector(".courier-location-pin")
      ?.classList.toggle("is-live", online);

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

    if (activeDelivery) return;

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
  }, [activeDelivery, location, mapReady, online, radiusKm, showRadius]);

  useEffect(() => {
    const L = leafletRef.current;
    const markerLayer = orderMarkersRef.current;
    if (!mapReady || !L || !markerLayer) return;

    markerLayer.clearLayers();
    if (activeDelivery) {
      const pickupValid = isValidCoordinate(
        activeDelivery.pickup_latitude,
        activeDelivery.pickup_longitude,
      );
      const destinationValid = isValidCoordinate(
        activeDelivery.destination_latitude,
        activeDelivery.destination_longitude,
      );
      const pickup = pickupValid
        ? [
            Number(activeDelivery.pickup_latitude),
            Number(activeDelivery.pickup_longitude),
          ]
        : null;
      const destination = destinationValid
        ? [
            Number(activeDelivery.destination_latitude),
            Number(activeDelivery.destination_longitude),
          ]
        : null;
      const routePoints = [pickup, destination].filter(Boolean);
      const courier = isValidCoordinate(location?.latitude, location?.longitude)
        ? [Number(location.latitude), Number(location.longitude)]
        : null;
      const nextStop = activeDelivery.delivery_status === "picked_up"
        ? destination
        : pickup;

      if (courier && nextStop) {
        L.polyline([courier, nextStop], {
          color: "#34d399",
          weight: 6,
          opacity: 0.95,
          lineCap: "round",
        }).addTo(markerLayer);
      }
      if (
        activeDelivery.delivery_status !== "picked_up" &&
        pickup &&
        destination
      ) {
        L.polyline(routePoints, {
          color: "#8b5cf6",
          weight: 4,
          opacity: 0.65,
          lineCap: "round",
          dashArray: "8 10",
        }).addTo(markerLayer);
      }

      [
        { point: pickup, label: "A", className: "pickup" },
        { point: destination, label: "B", className: "destination" },
      ].forEach(({ point, label, className }) => {
        if (!point) return;
        const completedPickup =
          label === "A" && activeDelivery.delivery_status === "picked_up";
        const marker = L.marker(point, {
          icon: L.divIcon({
            className: "courier-route-point-icon",
            html: `<span class="courier-route-point courier-route-point--${className}${completedPickup ? " is-complete" : ""}">${label}</span>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          }),
          zIndexOffset: 1100,
        });
        marker.bindTooltip(
          label === "A" ? "A · Recogida" : "B · Entrega",
          { direction: "top", offset: [0, -15] },
        );
        marker.addTo(markerLayer);
      });

      const activeRouteKey = `${activeDelivery.order_id}:${activeDelivery.delivery_status}`;
      if (
        fittedActiveDeliveryRef.current !== activeRouteKey &&
        routePoints.length > 0
      ) {
        const boundsPoints = [...routePoints, ...(courier ? [courier] : [])];
        const bounds = L.latLngBounds(boundsPoints);
        mapRef.current?.fitBounds(bounds, {
          padding: [48, 48],
          maxZoom: 15,
          animate: false,
        });
        fittedActiveDeliveryRef.current = activeRouteKey;
      }
      return;
    }

    fittedActiveDeliveryRef.current = null;
    orders.forEach((order) => {
      if (order.delivery_status !== "available") return;
      if (
        !isValidCoordinate(
          order.destination_latitude,
          order.destination_longitude,
        )
      ) {
        return;
      }

      const point = [
        Number(order.destination_latitude),
        Number(order.destination_longitude),
      ];
      const selected = order.order_id === selectedOrderId;
      const logoUrl = typeof order.business_logo_url === "string"
        ? order.business_logo_url
        : "";
      const safeLogoUrl = /^https?:\/\//i.test(logoUrl)
        ? logoUrl.replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[character])
        : "";
      const markerSize = selected ? 24 : 18;
      const marker = safeLogoUrl
        ? L.marker(point, {
            icon: L.divIcon({
              className: "courier-order-logo-icon",
              html: `<span class="courier-order-logo-marker ${order.courier_mode === "public" ? "is-public" : "is-store"}${selected ? " is-selected" : ""}"><img src="${safeLogoUrl}" alt="" /></span>`,
              iconSize: [markerSize, markerSize],
              iconAnchor: [markerSize / 2, markerSize / 2],
            }),
            zIndexOffset: selected ? 1000 : 0,
          })
        : L.circleMarker(point, {
            radius: selected ? 12 : 9,
            color: "#ffffff",
            weight: selected ? 4 : 3,
            fillColor: selected
              ? "#7c3aed"
              : order.courier_mode === "public"
                ? "#f59e0b"
                : "#a78bfa",
            fillOpacity: 1,
          });
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
  }, [activeDelivery, location, mapReady, orders, selectedOrderId]);

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
