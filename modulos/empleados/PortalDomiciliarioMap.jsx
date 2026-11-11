import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER = [4.5709, -74.2973];
const ROUTING_URL = "https://router.project-osrm.org/route/v1/driving";

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

const fitActiveDeliveryBounds = (map, L, delivery, location, animate) => {
  if (!map || !delivery) return;
  const points = [
    [delivery.pickup_latitude, delivery.pickup_longitude],
    [delivery.destination_latitude, delivery.destination_longitude],
    [location?.latitude, location?.longitude],
  ]
    .filter(([latitude, longitude]) => isValidCoordinate(latitude, longitude))
    .map(([latitude, longitude]) => [Number(latitude), Number(longitude)]);

  if (points.length === 0) return;
  const bounds = L.latLngBounds(points);
  const deliveryCard = document.querySelector(
    ".courier-active-delivery-card",
  );
  const mapHeight = map.getSize().y || window.innerHeight;
  const deliveryCardTop =
    deliveryCard?.getBoundingClientRect().top ?? mapHeight;
  const paddingBottom = Math.max(40, mapHeight - deliveryCardTop + 24);

  if (points.length === 1) {
    map.setView(points[0], 15, { animate });
    return;
  }

  map.fitBounds(bounds, {
    paddingTopLeft: [32, 80],
    paddingBottomRight: [32, paddingBottom],
    maxZoom: 15,
    animate,
  });
};

const fitActiveRouteBounds = (map, routeBounds, animate) => {
  if (!map || !routeBounds?.isValid()) return;
  const mapHeight = map.getSize().y || window.innerHeight;
  const deliveryCard = document.querySelector(
    ".courier-active-delivery-card",
  );
  const deliveryCardTop =
    deliveryCard?.getBoundingClientRect().top ?? mapHeight;
  const paddingBottom = Math.max(40, mapHeight - deliveryCardTop + 24);

  map.fitBounds(routeBounds, {
    paddingTopLeft: [32, 80],
    paddingBottomRight: [32, paddingBottom],
    maxZoom: 15,
    animate,
  });
};

const PortalDomiciliarioMap = ({
  location,
  orders = [],
  publicRadiusKm,
  searching = false,
  online = false,
  fullScreen = false,
  activeDelivery = null,
  recenterRequest = 0,
  fitRouteRequest = 0,
}) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const hasCenteredRef = useRef(false);
  const courierMarkerRef = useRef(null);
  const coverageLayerRef = useRef(null);
  const orderMarkersRef = useRef(null);
  const routeLayerRef = useRef(null);
  const fittedRoadRouteRef = useRef(null);
  const fittedActiveDeliveryRef = useRef(null);
  const lastRecenterRequestRef = useRef(recenterRequest);
  const lastFitRouteRequestRef = useRef(fitRouteRequest);
  const [mapError, setMapError] = useState("");
  const [routeError, setRouteError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const coverageRadiusMeters = Number(publicRadiusKm) * 1000;
  const hasCoverageRadius =
    Number.isFinite(coverageRadiusMeters) && coverageRadiusMeters > 0;
  const hasValidLocation = isValidCoordinate(
    location?.latitude,
    location?.longitude,
  );
  const lastCoverageRadiusRef = useRef(null);
  const routeDeliveryOrderId = activeDelivery?.order_id;
  const routeDeliveryStatus = activeDelivery?.delivery_status;
  const pickupLatitude = Number(activeDelivery?.pickup_latitude);
  const pickupLongitude = Number(activeDelivery?.pickup_longitude);
  const destinationLatitude = Number(activeDelivery?.destination_latitude);
  const destinationLongitude = Number(activeDelivery?.destination_longitude);
  const routeLocationLatitude = isValidCoordinate(
    location?.latitude,
    location?.longitude,
  )
    ? Math.round(Number(location.latitude) * 1000) / 1000
    : null;
  const routeLocationLongitude = routeLocationLatitude === null
    ? null
    : Math.round(Number(location.longitude) * 1000) / 1000;
  const hasActiveDelivery = Boolean(activeDelivery);
  const routeKey = [
    routeDeliveryOrderId,
    routeDeliveryStatus,
    routeLocationLatitude,
    routeLocationLongitude,
    pickupLatitude,
    pickupLongitude,
    destinationLatitude,
    destinationLongitude,
  ].join(":");
  const hasEnoughRoutePoints =
    (routeLocationLatitude !== null ? 1 : 0) +
      (routeDeliveryStatus !== "picked_up" &&
      isValidCoordinate(pickupLatitude, pickupLongitude)
        ? 1
        : 0) +
      (isValidCoordinate(destinationLatitude, destinationLongitude) ? 1 : 0) >=
    2;

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
      coverageLayerRef.current = null;
      orderMarkersRef.current = null;
      routeLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!mapReady || !map || !L) return;

    if (!hasValidLocation) {
      courierMarkerRef.current?.remove();
      courierMarkerRef.current = null;
      coverageLayerRef.current?.layer.remove();
      coverageLayerRef.current = null;
      hasCenteredRef.current = false;
      lastCoverageRadiusRef.current = null;
      return;
    }

    const point = [Number(location.latitude), Number(location.longitude)];
    const showCoverage = hasCoverageRadius && !activeDelivery;
    const courierIcon = L.divIcon({
      className: "courier-location-icon",
      html: '<span class="courier-location-dot"><span class="courier-location-dot-center"></span></span>',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    if (!courierMarkerRef.current) {
      courierMarkerRef.current = L.marker(point, {
        icon: courierIcon,
        zIndexOffset: 1200,
      })
        .addTo(map)
        .bindTooltip("Tu ubicación");
    } else {
      courierMarkerRef.current.setLatLng(point);
    }

    if (showCoverage) {
      if (!coverageLayerRef.current) {
        const coverageLayer = L.layerGroup();
        const boundary = L.circle(point, {
          radius: coverageRadiusMeters,
          stroke: false,
          fill: false,
        });
        coverageLayer.addLayer(boundary);
        coverageLayer.addTo(map);
        coverageLayerRef.current = { layer: coverageLayer, boundary };
      } else {
        const { boundary } = coverageLayerRef.current;
        boundary.setLatLng(point).setRadius(coverageRadiusMeters);
      }
    } else if (coverageLayerRef.current) {
      coverageLayerRef.current.layer.remove();
      coverageLayerRef.current = null;
    }

    if (activeDelivery) {
      lastCoverageRadiusRef.current = null;
      return;
    }

    const radiusChanged =
      showCoverage && lastCoverageRadiusRef.current !== coverageRadiusMeters;
    if (!hasCenteredRef.current || radiusChanged) {
      if (showCoverage) {
        map.fitBounds(coverageLayerRef.current.boundary.getBounds(), {
          padding: [28, 28],
          maxZoom: 15,
          animate: false,
        });
      } else {
        map.setView(point, 15, { animate: false });
      }
      hasCenteredRef.current = true;
      lastCoverageRadiusRef.current = showCoverage ? coverageRadiusMeters : null;
    } else if (online) {
      map.panTo(point, { animate: false });
    }
  }, [
    activeDelivery,
    coverageRadiusMeters,
    hasCoverageRadius,
    hasValidLocation,
    location,
    mapReady,
    online,
    searching,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (
      !mapReady ||
      !map ||
      recenterRequest === lastRecenterRequestRef.current
    ) {
      return;
    }
    lastRecenterRequestRef.current = recenterRequest;
    if (!isValidCoordinate(location?.latitude, location?.longitude)) return;
    if (coverageLayerRef.current) {
      map.fitBounds(coverageLayerRef.current.boundary.getBounds(), {
        padding: [28, 28],
        maxZoom: 15,
        animate: true,
      });
    } else {
      map.setView(
        [Number(location.latitude), Number(location.longitude)],
        15,
        { animate: true },
      );
    }
  }, [location, mapReady, recenterRequest]);

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
        fitActiveDeliveryBounds(mapRef.current, L, activeDelivery, location, false);
        fittedActiveDeliveryRef.current = activeRouteKey;
      }
      return;
    }

    fittedActiveDeliveryRef.current = null;
    const storeDemand = new Map();
    orders.forEach((order) => {
      if (order.delivery_status !== "available") return;
      const latitude = Number(order.pickup_latitude);
      const longitude = Number(order.pickup_longitude);
      if (!isValidCoordinate(latitude, longitude)) return;

      const storeKey = order.business_id
        ? `store:${order.business_id}`
        : `location:${latitude.toFixed(5)}:${longitude.toFixed(5)}`;
      const store = storeDemand.get(storeKey) || {
        latitudeTotal: 0,
        longitudeTotal: 0,
        businessName: order.business_name || "",
        count: 0,
      };
      store.latitudeTotal += latitude;
      store.longitudeTotal += longitude;
      if (!store.businessName && order.business_name) {
        store.businessName = order.business_name;
      }
      store.count += 1;
      storeDemand.set(storeKey, store);
    });

    storeDemand.forEach(({ latitudeTotal, longitudeTotal, businessName, count }) => {
      const latitude = latitudeTotal / count;
      const longitude = longitudeTotal / count;
      const intensity = Math.min(Math.sqrt(count) / 2.5, 1);
      const markerSize = Math.round(115 + intensity * 105);
      const opacity = (0.28 + intensity * 0.42).toFixed(2);
      const marker = L.marker([latitude, longitude], {
        icon: L.divIcon({
          className: "courier-store-heat-icon",
          html: `<span style="--heat-size:${markerSize}px;--heat-opacity:${opacity}"><i></i></span>`,
          iconSize: [markerSize, markerSize],
          iconAnchor: [markerSize / 2, markerSize / 2],
        }),
        zIndexOffset: count,
      });
      const popup = document.createElement("div");
      popup.className = "courier-store-popup";
      const title = document.createElement("strong");
      title.textContent = businessName || "Tienda cercana";
      const orderCount = document.createElement("p");
      orderCount.textContent = `${count} ${count === 1 ? "pedido disponible" : "pedidos disponibles"}`;
      const directionsLink = document.createElement("a");
      directionsLink.href = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
      directionsLink.target = "_blank";
      directionsLink.rel = "noopener noreferrer";
      directionsLink.textContent = "Abrir ruta en Google Maps";
      popup.append(title, orderCount, directionsLink);
      marker.bindPopup(popup, { closeButton: true, minWidth: 190 });
      marker.addTo(markerLayer);
    });
  }, [activeDelivery, location, mapReady, orders]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!mapReady || !map || !L) return undefined;

    if (!hasActiveDelivery) {
      routeLayerRef.current?.remove();
      routeLayerRef.current = null;
      fittedRoadRouteRef.current = null;
      return undefined;
    }

    routeLayerRef.current?.remove();
    routeLayerRef.current = null;

    const points = [];
    if (routeLocationLatitude !== null) {
      points.push([routeLocationLongitude, routeLocationLatitude]);
    }
    if (
      routeDeliveryStatus !== "picked_up" &&
      isValidCoordinate(pickupLatitude, pickupLongitude)
    ) {
      points.push([pickupLongitude, pickupLatitude]);
    }
    if (isValidCoordinate(destinationLatitude, destinationLongitude)) {
      points.push([destinationLongitude, destinationLatitude]);
    }

    if (points.length < 2) {
      return undefined;
    }

    const controller = new AbortController();
    const coordinates = points
      .map(([longitude, latitude]) => `${longitude},${latitude}`)
      .join(";");

    fetch(`${ROUTING_URL}/${coordinates}?overview=full&geometries=geojson`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo consultar la ruta vial.");
        return response.json();
      })
      .then((result) => {
        const route = result.routes?.[0];
        if (result.code !== "Ok" || !route?.geometry) {
          throw new Error("No se encontró una ruta por las calles para este domicilio.");
        }
        const routeLayer = L.geoJSON(route.geometry, {
          style: {
            color: "#4285f4",
            weight: 6,
            opacity: 0.95,
            lineCap: "round",
            lineJoin: "round",
          },
        }).addTo(map);
        routeLayerRef.current = routeLayer;
        const roadRouteKey = `${routeDeliveryOrderId}:${routeDeliveryStatus}`;
        if (fittedRoadRouteRef.current !== roadRouteKey) {
          fitActiveRouteBounds(map, routeLayer.getBounds(), false);
          fittedRoadRouteRef.current = roadRouteKey;
        }
        setRouteError(null);
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        console.error("No se pudo trazar la ruta vial del domicilio:", error);
        setRouteError({
          routeKey,
          message:
            error.message || "No se pudo trazar la ruta vial. Intenta de nuevo.",
        });
      });

    return () => controller.abort();
  }, [
    destinationLatitude,
    destinationLongitude,
    hasActiveDelivery,
    mapReady,
    pickupLatitude,
    pickupLongitude,
    routeDeliveryOrderId,
    routeDeliveryStatus,
    routeLocationLatitude,
    routeLocationLongitude,
    routeKey,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (
      !mapReady ||
      !map ||
      !L ||
      !activeDelivery ||
      fitRouteRequest === lastFitRouteRequestRef.current
    ) {
      return;
    }
    lastFitRouteRequestRef.current = fitRouteRequest;
    if (routeLayerRef.current) {
      fitActiveRouteBounds(map, routeLayerRef.current.getBounds(), true);
    } else {
      fitActiveDeliveryBounds(map, L, activeDelivery, location, true);
    }
  }, [activeDelivery, fitRouteRequest, location, mapReady]);

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
        className="courier-map-container absolute inset-0 z-0"
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
      {hasActiveDelivery && (!hasEnoughRoutePoints || routeError?.routeKey === routeKey) && (
        <div
          role="alert"
          className="absolute inset-x-3 top-[128px] z-[400] mx-auto max-w-lg rounded-xl border border-amber-300/20 bg-neutral-950/95 px-3 py-2 text-xs text-amber-100 shadow-lg backdrop-blur"
        >
          {!hasEnoughRoutePoints
            ? "Faltan ubicaciones para trazar la ruta por las calles."
            : routeError.message}
        </div>
      )}
    </div>
  );
};

export default PortalDomiciliarioMap;
