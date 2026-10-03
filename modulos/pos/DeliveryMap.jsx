import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

const ROUTING_URL = "https://router.project-osrm.org/route/v1/driving";
const DEFAULT_MAP_CENTER = { latitude: 4.5709, longitude: -74.2973 };

const isValidCoordinate = (value) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value));

export default function DeliveryMap({
  origin,
  originLogoUrl = "",
  destination,
  onDestinationChange,
  onRouteChange,
  onRoutingChange,
  onRouteErrorChange,
  fullHeight = false,
  compact = false,
}) {
  const mapElement = useRef(null);
  const mapInstance = useRef(null);
  const leafletInstance = useRef(null);
  const originMarker = useRef(null);
  const destinationMarker = useRef(null);
  const routeLayer = useRef(null);
  const originRef = useRef(origin);
  const originLogoUrlRef = useRef(originLogoUrl);
  const [mapReady, setMapReady] = useState(false);
  originRef.current = origin;
  originLogoUrlRef.current = originLogoUrl;

  useEffect(() => {
    if (!mapElement.current) return undefined;

    let cancelled = false;
    let map;

    import("leaflet")
      .then((leafletModule) => {
        if (cancelled || !mapElement.current) return;

        const L = leafletModule.default || leafletModule;
        leafletInstance.current = L;
        const currentOrigin = originRef.current;
        const initialCenter = currentOrigin || DEFAULT_MAP_CENTER;
        const centerPosition = [
          Number(initialCenter.latitude),
          Number(initialCenter.longitude),
        ];
        map = L.map(mapElement.current, { zoomControl: true }).setView(
          centerPosition,
          currentOrigin ? 14 : 6,
        );

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(map);

        map.on("click", (event) => {
          onDestinationChange({
            latitude: event.latlng.lat,
            longitude: event.latlng.lng,
          });
        });

        mapInstance.current = map;
        setMapReady(true);
        window.setTimeout(() => map?.invalidateSize(), 100);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("No se pudo cargar el mapa de domicilio:", error);
          onRouteErrorChange("No se pudo cargar el mapa.");
        }
      });

    return () => {
      cancelled = true;
      if (map) map.remove();
      mapInstance.current = null;
      leafletInstance.current = null;
      originMarker.current = null;
      destinationMarker.current = null;
      routeLayer.current = null;
    };
  }, [onDestinationChange, onRouteErrorChange]);

  useEffect(() => {
    const map = mapInstance.current;
    const L = leafletInstance.current;
    if (!mapReady || !map || !L || !origin) return;

    const position = [Number(origin.latitude), Number(origin.longitude)];
    const icon = originLogoUrl
      ? L.icon({
          iconUrl: originLogoUrl,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        })
      : L.divIcon({
          className: "",
          html: '<span style="display:flex;width:30px;height:30px;align-items:center;justify-content:center;border:3px solid white;border-radius:50%;background:#7c3aed;color:white;font-size:11px;font-weight:900;box-shadow:0 2px 8px #0008">N</span>',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

    if (!originMarker.current) {
      originMarker.current = L.marker(position, { icon })
        .addTo(map)
        .bindTooltip("Negocio");
    } else {
      originMarker.current.setLatLng(position);
      originMarker.current.setIcon(icon);
    }
    if (originLogoUrl && originMarker.current.getElement()) {
      Object.assign(originMarker.current.getElement().style, {
        border: "3px solid white",
        borderRadius: "50%",
        objectFit: "cover",
        backgroundColor: "white",
        boxShadow: "0 2px 8px #0008",
      });
    }

    map.setView(position, 14, { animate: false });
  }, [mapReady, origin, originLogoUrl]);

  useEffect(() => {
    const map = mapInstance.current;
    const L = leafletInstance.current;
    if (!mapReady || !map || !L) return;

    if (!destination) {
      destinationMarker.current?.remove();
      destinationMarker.current = null;
      return;
    }

    const position = [
      Number(destination.latitude),
      Number(destination.longitude),
    ];
    if (!destinationMarker.current) {
      const destinationIcon = L.divIcon({
        className: "",
        html: '<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 24 24" fill="#7c3aed" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 3px 4px #000a)"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3" fill="white" stroke="white"/></svg>',
        iconSize: [42, 42],
        iconAnchor: [21, 42],
      });
      const marker = L.marker(position, {
        icon: destinationIcon,
        draggable: true,
      }).addTo(map);
      marker.bindTooltip("Destino");
      marker.on("dragend", () => {
        const point = marker.getLatLng();
        onDestinationChange({ latitude: point.lat, longitude: point.lng });
      });
      destinationMarker.current = marker;
    } else {
      destinationMarker.current.setLatLng(position);
    }
    map.panTo(position, { animate: false });
  }, [destination, mapReady, onDestinationChange]);

  useEffect(() => {
    if (
      !mapReady ||
      !origin ||
      !destination ||
      !isValidCoordinate(origin.latitude) ||
      !isValidCoordinate(origin.longitude) ||
      !isValidCoordinate(destination.latitude) ||
      !isValidCoordinate(destination.longitude)
    ) {
      routeLayer.current?.remove();
      routeLayer.current = null;
      onRouteChange(null);
      onRoutingChange(false);
      onRouteErrorChange("");
      return undefined;
    }

    const controller = new AbortController();
    routeLayer.current?.remove();
    routeLayer.current = null;
    onRouteChange(null);
    onRoutingChange(true);
    onRouteErrorChange("");

    const coordinates = `${Number(origin.longitude)},${Number(origin.latitude)};${Number(destination.longitude)},${Number(destination.latitude)}`;
    fetch(`${ROUTING_URL}/${coordinates}?overview=full&geometries=geojson`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo consultar la ruta.");
        return response.json();
      })
      .then((result) => {
        const selectedRoute = result.routes?.[0];
        if (result.code !== "Ok" || !selectedRoute?.geometry) {
          throw new Error("No hay una ruta disponible para este destino.");
        }

        const nextRoute = {
          distanceMeters: selectedRoute.distance,
          geometry: selectedRoute.geometry,
        };
        const map = mapInstance.current;
        const L = leafletInstance.current;
        if (map && L) {
          const nextRouteLayer = L.geoJSON(nextRoute.geometry, {
            style: { color: "#4285F4", weight: 5, opacity: 0.9 },
          }).addTo(map);
          routeLayer.current = nextRouteLayer;
          map.fitBounds(nextRouteLayer.getBounds(), {
            padding: [24, 24],
            maxZoom: 16,
          });
        }
        onRouteChange(selectedRoute.distance);
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        routeLayer.current?.remove();
        routeLayer.current = null;
        onRouteChange(null);
        onRouteErrorChange(error.message || "No se pudo calcular la ruta.");
      })
      .finally(() => {
        if (!controller.signal.aborted) onRoutingChange(false);
      });

    return () => controller.abort();
  }, [
    mapReady,
    origin,
    destination,
    onRouteChange,
    onRouteErrorChange,
    onRoutingChange,
  ]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return undefined;
    let animationFrame;
    const resizeTimeouts = [];
    const handleResize = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        map.invalidateSize({ pan: false, debounceMoveend: true });
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      handleResize();
      resizeTimeouts.push(
        window.setTimeout(handleResize, 100),
        window.setTimeout(handleResize, 300),
      );
    };
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(handleResize)
        : null;
    observer?.observe(map.getContainer());
    if (map.getContainer().parentElement) {
      observer?.observe(map.getContainer().parentElement);
    }
    window.addEventListener("resize", handleResize);
    window.addEventListener("focus", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    handleResize();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.cancelAnimationFrame(animationFrame);
      resizeTimeouts.forEach(window.clearTimeout);
    };
  }, [mapReady]);

  return (
    <div
      className={`relative isolate ${fullHeight ? "h-full min-h-[220px]" : compact ? "h-40" : "h-48"} w-full overflow-hidden rounded-lg border border-outline bg-neutral-800`}
    >
      <div
        ref={mapElement}
        className="h-full w-full"
        aria-label="Mapa de ruta de domicilio"
      />
      <p className="pointer-events-none absolute left-2 right-2 top-2 rounded-md bg-neutral-950/85 px-2 py-1 text-center text-[9px] font-bold text-white">
        {destination
          ? "Arrastra el pin para ajustar el destino"
          : "Selecciona el destino tocando el mapa"}
      </p>
      {destination && (
        <div
          aria-label={`Coordenadas del destino: ${Number(destination.latitude).toFixed(6)}, ${Number(destination.longitude).toFixed(6)}`}
          className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded-md border border-white/15 bg-neutral-950/90 px-2 py-1 font-mono text-[10px] font-semibold text-white shadow-md"
        >
          {Number(destination.latitude).toFixed(6)},{" "}
          {Number(destination.longitude).toFixed(6)}
        </div>
      )}
    </div>
  );
}
