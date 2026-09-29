import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

const ROUTING_URL = "https://router.project-osrm.org/route/v1/driving";

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
  const destinationMarker = useRef(null);
  const routeLayer = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!origin || !mapElement.current) return undefined;

    let cancelled = false;
    let map;

    import("leaflet")
      .then((leafletModule) => {
        if (cancelled || !mapElement.current) return;

        const L = leafletModule.default || leafletModule;
        leafletInstance.current = L;
        const originPosition = [
          Number(origin.latitude),
          Number(origin.longitude),
        ];
        map = L.map(mapElement.current, { zoomControl: true }).setView(
          originPosition,
          14,
        );

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(map);

        const originIcon = originLogoUrl
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

        const originMarker = L.marker(originPosition, { icon: originIcon })
          .addTo(map)
          .bindTooltip("Negocio");
        if (originLogoUrl && originMarker.getElement()) {
          Object.assign(originMarker.getElement().style, {
            border: "3px solid white",
            borderRadius: "50%",
            objectFit: "cover",
            backgroundColor: "white",
            boxShadow: "0 2px 8px #0008",
          });
        }

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
      destinationMarker.current = null;
      routeLayer.current = null;
    };
  }, [origin, originLogoUrl, onDestinationChange, onRouteErrorChange]);

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
        html: '<span style="display:flex;width:30px;height:30px;align-items:center;justify-content:center;border:3px solid white;border-radius:50%;background:#16a34a;color:white;font-size:11px;font-weight:900;box-shadow:0 2px 8px #0008">D</span>',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
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
    const handleResize = () => map.invalidateSize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [mapReady, origin]);

  return (
    <div
      className={`relative isolate ${fullHeight ? "h-full min-h-[220px]" : compact ? "h-40" : "h-48"} w-full overflow-hidden rounded-lg border border-outline bg-neutral-800`}
    >
      <div
        ref={mapElement}
        className="h-full w-full"
        aria-label="Mapa de ruta de domicilio"
      />
      <p className="pointer-events-none absolute bottom-2 left-2 right-2 rounded-md bg-neutral-950/85 px-2 py-1 text-center text-[9px] font-bold text-white">
        {destination
          ? "Arrastra el marcador verde para ajustar el destino"
          : "Selecciona el destino tocando el mapa"}
      </p>
    </div>
  );
}
