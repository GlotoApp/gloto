import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER = [4.5709, -74.2973];
const ROUTING_URL = "https://router.project-osrm.org/route/v1/driving";
const ROUTE_PIN_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';

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
    ".courier-active-delivery-card, .courier-offer-preview-card",
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
    ".courier-active-delivery-card, .courier-offer-preview-card",
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
  hotZones = [],
  hotZoneError = "",
  publicRadiusKm,
  searching = false,
  online = false,
  fullScreen = false,
  activeDelivery = null,
  previewOffer = null,
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
  const routeOrder = activeDelivery || previewOffer;
  const routeDeliveryOrderId = routeOrder?.order_id;
  const routeDeliveryStatus = routeOrder?.delivery_status;
  const pickupLatitude = Number(routeOrder?.pickup_latitude);
  const pickupLongitude = Number(routeOrder?.pickup_longitude);
  const destinationLatitude = Number(routeOrder?.destination_latitude);
  const destinationLongitude = Number(routeOrder?.destination_longitude);
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
  const hasRoutePreview = Boolean(previewOffer && !activeDelivery);
  const routeKey = [
    hasActiveDelivery ? "active" : hasRoutePreview ? "preview" : "none",
    routeDeliveryOrderId,
    routeDeliveryStatus,
    hasActiveDelivery ? routeLocationLatitude : null,
    hasActiveDelivery ? routeLocationLongitude : null,
    pickupLatitude,
    pickupLongitude,
    destinationLatitude,
    destinationLongitude,
  ].join(":");
  const hasEnoughRoutePoints = hasRoutePreview
    ? isValidCoordinate(pickupLatitude, pickupLongitude) &&
      isValidCoordinate(destinationLatitude, destinationLongitude)
    : (routeLocationLatitude !== null ? 1 : 0) +
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
    const showCoverage =
      hasCoverageRadius && !activeDelivery && !previewOffer;
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

    if (activeDelivery || previewOffer) {
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
    previewOffer,
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
    const storeDemand = new Map();
    const showStoreDemand = !activeDelivery && !previewOffer;
    const visibleHotZones = showStoreDemand ? hotZones : [];
    const visibleOrders = showStoreDemand ? orders : [];
    visibleHotZones.forEach((zone) => {
      const latitude = Number(zone.latitude);
      const longitude = Number(zone.longitude);
      if (!isValidCoordinate(latitude, longitude)) return;

      const storeKey = zone.business_id
        ? `store:${zone.business_id}`
        : `location:${latitude.toFixed(5)}:${longitude.toFixed(5)}`;
      storeDemand.set(storeKey, {
        latitude,
        longitude,
        dailyCount: Number(zone.order_count) || 0,
        availableCount: 0,
      });
    });

    visibleOrders.forEach((order) => {
      if (order.delivery_status !== "available") return;
      const latitude = Number(order.pickup_latitude);
      const longitude = Number(order.pickup_longitude);
      if (!isValidCoordinate(latitude, longitude)) return;

      const storeKey = order.business_id
        ? `store:${order.business_id}`
        : `location:${latitude.toFixed(5)}:${longitude.toFixed(5)}`;
      const store = storeDemand.get(storeKey) || {
        latitude,
        longitude,
        dailyCount: 0,
        availableCount: 0,
      };
      store.availableCount += 1;
      storeDemand.set(storeKey, store);
    });

    storeDemand.forEach(
      ({ latitude, longitude, dailyCount, availableCount }) => {
        const totalCount = Math.max(dailyCount, availableCount);
        const intensity = Math.min(Math.sqrt(totalCount) / 2.5, 1);
        const markerSize = Math.round(115 + intensity * 105);
        const opacity = (0.28 + intensity * 0.42).toFixed(2);
        const marker = L.marker([latitude, longitude], {
          icon: L.divIcon({
            className: "courier-store-heat-icon",
            html: `<span style="--heat-size:${markerSize}px;--heat-opacity:${opacity}"><i></i></span>`,
            iconSize: [markerSize, markerSize],
            iconAnchor: [markerSize / 2, markerSize / 2],
          }),
          zIndexOffset: totalCount,
        });
        const popup = document.createElement("div");
        popup.className = "courier-store-popup";
        const goLink = document.createElement("a");
        goLink.href = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
        goLink.target = "_blank";
        goLink.rel = "noopener noreferrer";
        goLink.textContent = "Ir a la tienda";
        goLink.setAttribute("aria-label", "Ir a la tienda");
        popup.append(goLink);
        marker.bindPopup(popup, { closeButton: false, minWidth: 120 });
        marker.addTo(markerLayer);
      },
    );

    const routeOrder = activeDelivery || previewOffer;
    if (routeOrder) {
      const pickupValid = isValidCoordinate(
        routeOrder.pickup_latitude,
        routeOrder.pickup_longitude,
      );
      const destinationValid = isValidCoordinate(
        routeOrder.destination_latitude,
        routeOrder.destination_longitude,
      );
      const pickup = pickupValid
        ? [
            Number(routeOrder.pickup_latitude),
            Number(routeOrder.pickup_longitude),
          ]
        : null;
      const destination = destinationValid
        ? [
            Number(routeOrder.destination_latitude),
            Number(routeOrder.destination_longitude),
          ]
        : null;
      const routePoints = [pickup, destination].filter(Boolean);

      [
        { point: pickup, className: "pickup", tooltip: "Tienda" },
        { point: destination, className: "destination", tooltip: "Cliente" },
      ].forEach(({ point, className, tooltip }) => {
        if (!point) return;
        const completedPickup =
          className === "pickup" &&
          activeDelivery?.delivery_status === "picked_up";
        const marker = L.marker(point, {
          icon: L.divIcon({
            className: "courier-route-point-icon",
            html: `<span class="courier-route-point courier-route-point--${className}${completedPickup ? " is-complete" : ""}">${ROUTE_PIN_ICON}</span>`,
            iconSize: [42, 48],
            iconAnchor: [21, 44],
          }),
          zIndexOffset: 1100,
        });
        marker.bindTooltip(
          tooltip,
          { direction: "top", offset: [0, -15] },
        );
        marker.addTo(markerLayer);
      });

      if (activeDelivery) {
        const activeRouteKey = `${activeDelivery.order_id}:${activeDelivery.delivery_status}`;
        if (
          fittedActiveDeliveryRef.current !== activeRouteKey &&
          routePoints.length > 0
        ) {
          fitActiveDeliveryBounds(mapRef.current, L, activeDelivery, location, false);
          fittedActiveDeliveryRef.current = activeRouteKey;
        }
      }
      return;
    }

    fittedActiveDeliveryRef.current = null;
  }, [activeDelivery, hotZones, location, mapReady, orders, previewOffer]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!mapReady || !map || !L) return undefined;

    if (!hasActiveDelivery && !hasRoutePreview) {
      routeLayerRef.current?.remove();
      routeLayerRef.current = null;
      fittedRoadRouteRef.current = null;
      return undefined;
    }

    routeLayerRef.current?.remove();
    routeLayerRef.current = null;

    const points = [];
    if (hasActiveDelivery && routeLocationLatitude !== null) {
      points.push([routeLocationLongitude, routeLocationLatitude]);
    }
    if (
      (hasRoutePreview || routeDeliveryStatus !== "picked_up") &&
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
        const roadRouteKey = routeKey;
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
    hasRoutePreview,
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
      {(mapError || hotZoneError) && (
        <div
          role="alert"
          className="absolute inset-x-3 bottom-3 z-[400] rounded-xl border border-rose-400/20 bg-neutral-950/90 px-3 py-2 text-xs text-rose-200"
        >
          {mapError && <p>{mapError}</p>}
          {hotZoneError && <p>{hotZoneError}</p>}
        </div>
      )}
      {(hasActiveDelivery || hasRoutePreview) &&
        (!hasEnoughRoutePoints || routeError?.routeKey === routeKey) && (
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
