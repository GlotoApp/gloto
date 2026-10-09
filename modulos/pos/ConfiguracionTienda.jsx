import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Crop,
  Image,
  LoaderCircle,
  LocateFixed,
  Maximize2,
  Minimize2,
  Pencil,
  Save,
  Store,
  Trash2,
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import {
  removeStorageObjectIfUnused,
  supabase,
} from "../../src/lib/supabaseClient";
import { compressCanvasToWebP } from "../../src/lib/imageCompression";
import {
  DELIVERY_METHODS,
  getEnabledDeliveryMethods,
} from "../../src/lib/deliveryMethods";
import ConfiguracionField from "./ConfiguracionField";
import ImageCropEditor from "./ImageCropEditor";
import SubLoading from "./SubLoading";

const EMPTY_DATA = {
  name: "",
  category: "",
  address: "",
  whatsapp_phone: "",
  delivery_time_min: "",
  delivery_time_max: "",
  delivery_fee_per_km: "",
  min_delivery_fee: "",
  max_delivery_fee: "",
  delivery_methods: getEnabledDeliveryMethods(),
  night_delivery_surcharge_enabled: false,
  night_delivery_surcharge_start: "21:00",
  night_delivery_surcharge_end: "06:00",
  night_delivery_surcharge_percent: "",
  tip_percent: "",
  latitude: "",
  longitude: "",
};

const DELIVERY_METHOD_PRESENTATION = {
  pickup: {
    icon: "flag",
    description: "El cliente recoge el pedido",
    selectedClass: "border-amber-400/35 bg-amber-400/[0.08]",
    iconClass: "bg-amber-400/10 text-amber-300",
    checkboxClass: "accent-amber-400",
  },
  table: {
    icon: "table_bar",
    description: "Atención en el local",
    selectedClass: "border-emerald-400/35 bg-emerald-400/[0.08]",
    iconClass: "bg-emerald-400/10 text-emerald-300",
    checkboxClass: "accent-emerald-400",
  },
  point: {
    icon: "location_on",
    description: "Recogida en un punto",
    selectedClass: "border-sky-400/35 bg-sky-400/[0.08]",
    iconClass: "bg-sky-400/10 text-sky-300",
    checkboxClass: "accent-sky-400",
  },
  delivery: {
    icon: "delivery_dining",
    description: "Entrega a domicilio",
    selectedClass: "border-fuchsia-400/35 bg-fuchsia-400/[0.08]",
    iconClass: "bg-fuchsia-400/10 text-fuchsia-300",
    checkboxClass: "accent-fuchsia-400",
  },
};

const formatThousands = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? Number(digits).toLocaleString("es-CO") : "";
};

const parseThousands = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? Number(digits) : 0;
};

const formatCoordinatePair = (latitude, longitude) => {
  const lat = Number(String(latitude ?? "").trim());
  const lng = Number(String(longitude ?? "").trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
};

const parseCoordinatePair = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return { latitude: "", longitude: "" };

  const numberPattern = "[-+]?(?:\\d+\\.?\\d*|\\.\\d+)";
  const googlePlaceMatch = raw.match(
    new RegExp(`!3d(${numberPattern})!4d(${numberPattern})`),
  );
  const googleViewportMatch = raw.match(
    new RegExp(`@(${numberPattern}),(${numberPattern})`),
  );
  const numbers = googlePlaceMatch
    ? [googlePlaceMatch[1], googlePlaceMatch[2]]
    : googleViewportMatch
      ? [googleViewportMatch[1], googleViewportMatch[2]]
      : raw.match(new RegExp(numberPattern, "g"));
  if (!numbers || numbers.length < 2) return { latitude: "", longitude: "" };

  const latitude = Number(numbers[0]);
  const longitude = Number(numbers[1]);

  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return { latitude: "", longitude: "" };
  }

  return {
    latitude: latitude.toFixed(6),
    longitude: longitude.toFixed(6),
  };
};

const loadEditorImage = async (editor) => {
  const image = new window.Image();
  image.src = editor.url;
  await image.decode();
  return image;
};

const setMapEditing = (map, enabled) => {
  [
    "dragging",
    "touchZoom",
    "doubleClickZoom",
    "scrollWheelZoom",
    "boxZoom",
    "keyboard",
  ].forEach((interaction) => {
    const handler = map[interaction];
    if (!handler) return;
    if (enabled) handler.enable();
    else handler.disable();
  });
};

const unclipMapAncestors = (mapNode) => {
  const changedAncestors = [];
  let ancestor = mapNode?.parentElement;

  while (ancestor && ancestor !== document.body) {
    const computedStyle = window.getComputedStyle(ancestor);
    if (
      computedStyle.overflowX !== "visible" ||
      computedStyle.overflowY !== "visible" ||
      computedStyle.transform !== "none" ||
      computedStyle.filter !== "none" ||
      computedStyle.backdropFilter !== "none"
    ) {
      changedAncestors.push({
        element: ancestor,
        overflow: ancestor.style.overflow,
        transform: ancestor.style.transform,
        filter: ancestor.style.filter,
        backdropFilter: ancestor.style.backdropFilter,
      });
      ancestor.style.overflow = "visible";
      ancestor.style.transform = "none";
      ancestor.style.filter = "none";
      ancestor.style.backdropFilter = "none";
    }
    ancestor = ancestor.parentElement;
  }

  return () => {
    changedAncestors.forEach(
      ({ element, overflow, transform, filter, backdropFilter }) => {
        element.style.overflow = overflow;
        element.style.transform = transform;
        element.style.filter = filter;
        element.style.backdropFilter = backdropFilter;
      },
    );
  };
};

const createCroppedImage = async (editor, crop) => {
  const image = await loadEditorImage(editor);
  const isCover = editor.type === "cover";
  const canvas = document.createElement("canvas");
  canvas.width = isCover ? 1600 : 1024;
  canvas.height = isCover ? 700 : 1024;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo preparar el recorte de la imagen.");
  context.drawImage(
    image,
    crop.x * image.naturalWidth,
    crop.y * image.naturalHeight,
    crop.width * image.naturalWidth,
    crop.height * image.naturalHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const webpBlob = await compressCanvasToWebP(canvas);
  return new File([webpBlob], isCover ? "portada.webp" : "logo.webp", {
    type: webpBlob.type,
  });
};

const ConfiguracionTienda = ({
  onboardingMode = false,
  onCompleted,
  saveActionRef,
  onSaveStateChange,
}) => {
  const [businessId, setBusinessId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [data, setData] = useState(EMPTY_DATA);
  const [initialData, setInitialData] = useState(EMPTY_DATA);
  const [logoUrl, setLogoUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [initialMediaUrls, setInitialMediaUrls] = useState({ logo: "", cover: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(null);
  const [deletingImage, setDeletingImage] = useState(null);
  const [editingImage, setEditingImage] = useState(null);
  const [draggingImage, setDraggingImage] = useState(null);
  const [imageEditor, setImageEditor] = useState(null);
  const [imageEditorError, setImageEditorError] = useState("");
  const [locating, setLocating] = useState(false);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [isCssMapFullscreen, setIsCssMapFullscreen] = useState(false);
  const [isMapEditing, setIsMapEditing] = useState(false);
  const [locationInput, setLocationInput] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const logoInput = useRef(null);
  const coverInput = useRef(null);
  const mapElement = useRef(null);
  const mapInstance = useRef(null);
  const mapMarker = useRef(null);
  const isMapEditingRef = useRef(false);
  const wasMapNativeFullscreen = useRef(false);

  useEffect(
    () => () => {
      if (imageEditor?.url) URL.revokeObjectURL(imageEditor.url);
    },
    [imageEditor?.url],
  );

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) return setLoading(false);
      const { data: profile } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (!profile?.business_id) return setLoading(false);
      setBusinessId(profile.business_id);
      const [
        { data: business, error: businessError },
        { data: info, error: infoError },
        { data: categoryData, error: categoryError },
      ] = await Promise.all([
        supabase
          .from("businesses")
          .select("name,logo_url,cover_url")
          .eq("id", profile.business_id)
          .maybeSingle(),
        supabase
          .from("business_info")
          .select(
            "address,whatsapp_phone,delivery_time_min,delivery_time_max,delivery_fee_per_km,min_delivery_fee,max_delivery_fee,delivery_methods,night_delivery_surcharge_enabled,night_delivery_surcharge_start,night_delivery_surcharge_end,night_delivery_surcharge_percent,tip_percent,category_id,categoria,latitude,longitude",
          )
          .eq("business_id", profile.business_id)
          .maybeSingle(),
        supabase
          .from("categories")
          .select("id,name,icon_url")
          .order("name", { ascending: true }),
      ]);
      if (businessError || infoError || categoryError) {
        console.error(
          "No se pudo cargar la información de la tienda:",
          businessError || infoError || categoryError,
        );
        setMessage("No se pudo cargar toda la información de la tienda.");
      }
      const loadedData = {
        name: business?.name || "",
        category:
          info?.category_id ||
          categoryData?.find((category) => category.name === info?.categoria)
            ?.id ||
          "",
        address: info?.address || "",
        whatsapp_phone: info?.whatsapp_phone || "",
        delivery_time_min: info?.delivery_time_min ?? "",
        delivery_time_max: info?.delivery_time_max ?? "",
        delivery_fee_per_km: info?.delivery_fee_per_km ?? "",
        min_delivery_fee: info?.min_delivery_fee ?? "",
        max_delivery_fee: info?.max_delivery_fee ?? "",
        delivery_methods: getEnabledDeliveryMethods(info?.delivery_methods),
        night_delivery_surcharge_enabled:
          info?.night_delivery_surcharge_enabled ?? false,
        night_delivery_surcharge_start:
          info?.night_delivery_surcharge_start?.slice(0, 5) || "21:00",
        night_delivery_surcharge_end:
          info?.night_delivery_surcharge_end?.slice(0, 5) || "06:00",
        night_delivery_surcharge_percent:
          info?.night_delivery_surcharge_percent ?? "",
        tip_percent: info?.tip_percent ?? "",
        latitude: info?.latitude ?? "",
        longitude: info?.longitude ?? "",
      };
      setCategories(categoryData || []);
      setData(loadedData);
      setInitialData(loadedData);
      setLocationInput(formatCoordinatePair(loadedData.latitude, loadedData.longitude));
      setLogoUrl(business?.logo_url || "");
      setCoverUrl(business?.cover_url || "");
      setInitialMediaUrls({
        logo: business?.logo_url || "",
        cover: business?.cover_url || "",
      });
      setLoading(false);
    };
    load();
  }, []);

  const update = (key, value) =>
    setData((current) => ({ ...current, [key]: value }));
  const updateMoney = (key, value) => update(key, formatThousands(value));
  const syncCoordinatesToForm = useCallback((latitude, longitude) => {
    const nextLatitude = Number(latitude).toFixed(6);
    const nextLongitude = Number(longitude).toFixed(6);
    setLocationInput(`${nextLatitude}, ${nextLongitude}`);
    setData((current) => ({
      ...current,
      latitude: nextLatitude,
      longitude: nextLongitude,
    }));
  }, []);
  const updateLocationInput = (nextValue) => {
    setLocationInput(nextValue);
    const parsed = parseCoordinatePair(nextValue);
    if (!parsed.latitude || !parsed.longitude) return;
    syncCoordinatesToForm(parsed.latitude, parsed.longitude);
  };
  const hasUnsavedChanges = useMemo(() => {
    const sameData =
      JSON.stringify(data) === JSON.stringify(initialData);
    const sameMedia =
      logoUrl === initialMediaUrls.logo &&
      coverUrl === initialMediaUrls.cover;

    return !sameData || !sameMedia;
  }, [coverUrl, data, initialData, initialMediaUrls.cover, initialMediaUrls.logo, logoUrl]);
  const parsedLocationInput = parseCoordinatePair(locationInput);
  const canSave =
    hasUnsavedChanges &&
    Boolean(parsedLocationInput.latitude) &&
    Boolean(parsedLocationInput.longitude);
  const coordinates = useMemo(() => {
    const latitude = Number(String(data.latitude ?? "").trim());
    const longitude = Number(String(data.longitude ?? "").trim());
    if (
      !String(data.latitude ?? "").trim() ||
      !String(data.longitude ?? "").trim()
    )
      return null;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return [latitude, longitude];
  }, [data.latitude, data.longitude]);
  const coordinatesRef = useRef(coordinates);

  useEffect(() => {
    coordinatesRef.current = coordinates;
  }, [coordinates]);

  useEffect(() => {
    if (loading) return undefined;

    let isMounted = true;
    let mapResizeObserver;

    import("leaflet").then((L) => {
      if (!isMounted || !mapElement.current || mapInstance.current) return;

      const initialCenter = coordinatesRef.current || [10.373842, -75.473796];
      const map = L.default
        .map(mapElement.current, {
          dragging: false,
          touchZoom: false,
          doubleClickZoom: false,
          scrollWheelZoom: false,
          boxZoom: false,
          keyboard: false,
        })
        .setView(initialCenter, coordinatesRef.current ? 15 : 12);

      setMapEditing(map, isMapEditingRef.current);
      L.default
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        })
        .addTo(map);
      mapMarker.current = L.default
        .marker(initialCenter, {
          icon: L.default.divIcon({
            className: "border-0 bg-transparent",
            html: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 24 24" fill="#7c3aed" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 3px 4px rgba(0,0,0,.65))"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="#fff"/></svg>',
            iconSize: [40, 48],
            iconAnchor: [20, 48],
          }),
          draggable: isMapEditingRef.current,
        })
        .addTo(map);
      mapMarker.current.on("dragend", () => {
        const position = mapMarker.current?.getLatLng();
        if (position) {
          syncCoordinatesToForm(position.lat, position.lng);
        }
      });
      map.on("click", (event) => {
        if (!isMapEditingRef.current) return;
        const target = event.originalEvent.target;
        if (
          target instanceof Element &&
          target.closest("[data-map-controls]")
        ) {
          return;
        }
        mapMarker.current?.setLatLng(event.latlng);
        syncCoordinatesToForm(event.latlng.lat, event.latlng.lng);
      });
      if (window.ResizeObserver) {
        mapResizeObserver = new ResizeObserver(() => {
          map.invalidateSize({ pan: false });
        });
        mapResizeObserver.observe(mapElement.current);
      }

      mapInstance.current = map;
    });

    return () => {
      isMounted = false;
      mapResizeObserver?.disconnect();
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
      mapMarker.current = null;
    };
  }, [loading, syncCoordinatesToForm]);

  const toggleMapEditing = () => {
    const nextEditingState = !isMapEditingRef.current;
    isMapEditingRef.current = nextEditingState;
    setIsMapEditing(nextEditingState);
    if (!mapInstance.current) return;

    setMapEditing(mapInstance.current, nextEditingState);
    if (mapMarker.current?.dragging) {
      if (nextEditingState) mapMarker.current.dragging.enable();
      else mapMarker.current.dragging.disable();
    }
  };

  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !coordinates) return;

    const [latitude, longitude] = coordinates;
    const markerPosition = mapMarker.current?.getLatLng();
    const markerAlreadyAtCoordinates =
      markerPosition &&
      Math.abs(markerPosition.lat - latitude) <= 0.000001 &&
      Math.abs(markerPosition.lng - longitude) <= 0.000001;
    mapMarker.current?.setLatLng([latitude, longitude]);
    if (markerAlreadyAtCoordinates) return;

    const currentCenter = map.getCenter();
    if (
      Math.abs(currentCenter.lat - latitude) > 0.000001 ||
      Math.abs(currentCenter.lng - longitude) > 0.000001
    ) {
      map.setView([latitude, longitude], Math.max(map.getZoom(), 15), {
        animate: false,
      });
    }
  }, [coordinates]);

  useEffect(() => {
    let resizeFrame = 0;
    const resizeTimeouts = [];
    const invalidateMapSize = () =>
      mapInstance.current?.invalidateSize({
        pan: false,
        debounceMoveend: true,
      });
    const scheduleFullscreenResize = (centerOnMarker = false) => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        invalidateMapSize();
        resizeFrame = window.requestAnimationFrame(() => {
          invalidateMapSize();
          if (centerOnMarker && mapMarker.current) {
            mapInstance.current?.setView(
              mapMarker.current.getLatLng(),
              mapInstance.current.getZoom(),
              { animate: false },
            );
          }
          resizeFrame = 0;
        });
      });
      [100, 300, 700].forEach((delay) => {
        resizeTimeouts.push(window.setTimeout(invalidateMapSize, delay));
      });
    };
    const handleFullscreenChange = () => {
      const nativeFullscreen =
        document.fullscreenElement === mapElement.current;
      const exitedMapFullscreen =
        wasMapNativeFullscreen.current && !nativeFullscreen;
      wasMapNativeFullscreen.current = nativeFullscreen;
      setIsMapFullscreen(nativeFullscreen || isCssMapFullscreen);
      scheduleFullscreenResize(exitedMapFullscreen);
    };
    const handleMapResize = () => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        invalidateMapSize();
        resizeFrame = 0;
      });
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) handleMapResize();
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("resize", handleMapResize);
    window.addEventListener("orientationchange", handleMapResize);
    window.visualViewport?.addEventListener("resize", handleMapResize);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("resize", handleMapResize);
      window.removeEventListener("orientationchange", handleMapResize);
      window.visualViewport?.removeEventListener("resize", handleMapResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeTimeouts.forEach(window.clearTimeout);
    };
  }, [isCssMapFullscreen]);

  useEffect(() => {
    if (!isCssMapFullscreen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const restoreAncestors = unclipMapAncestors(mapElement.current);
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsCssMapFullscreen(false);
        setIsMapFullscreen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    let resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = window.requestAnimationFrame(() => {
        mapInstance.current?.invalidateSize({
          pan: false,
          debounceMoveend: true,
        });
        resizeFrame = 0;
      });
    });
    const resizeTimeouts = [100, 300, 700].map((delay) =>
      window.setTimeout(
        () =>
          mapInstance.current?.invalidateSize({
            pan: false,
            debounceMoveend: true,
          }),
        delay,
      ),
    );

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.cancelAnimationFrame(resizeFrame);
      resizeTimeouts.forEach(window.clearTimeout);
      restoreAncestors();
      window.requestAnimationFrame(() => {
        mapInstance.current?.invalidateSize({
          pan: false,
          debounceMoveend: true,
        });
        window.requestAnimationFrame(() => {
          const map = mapInstance.current;
          const marker = mapMarker.current;
          if (!map || !marker) return;
          map.invalidateSize({ pan: false, debounceMoveend: true });
          map.setView(marker.getLatLng(), map.getZoom(), { animate: false });
        });
      });
    };
  }, [isCssMapFullscreen]);

  const toggleMapFullscreen = async () => {
    if (!mapElement.current) return;
    if (isMapFullscreen) {
      setIsCssMapFullscreen(false);
      setIsMapFullscreen(false);
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch (error) {
          console.error("No se pudo cerrar la pantalla completa del mapa:", error);
        }
      }
      return;
    }

    if (mapElement.current.requestFullscreen) {
      try {
        await mapElement.current.requestFullscreen();
        return;
      } catch (error) {
        console.warn(
          "El navegador no permitió pantalla completa nativa; se abrirá el mapa ampliado.",
          error,
        );
      }
    }

    setIsCssMapFullscreen(true);
    setIsMapFullscreen(true);
  };

  const locateCurrentLocation = () => {
    if (!navigator.geolocation)
      return setMessage("Tu navegador no permite obtener la ubicación.");
    setLocating(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        syncCoordinatesToForm(coords.latitude, coords.longitude);
        setMessage(
          "Ubicación actual cargada. Guarda la tienda para conservarla.",
        );
        setLocating(false);
      },
      () => {
        setMessage(
          "No se pudo obtener la ubicación. Revisa los permisos del navegador.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const save = async () => {
    if (!businessId) return;
    setSaveAttempted(true);
    const requiredFields = [
      ["Nombre del negocio", data.name],
      ["Categoría", data.category],
      ["Dirección física", data.address],
      ["Número de WhatsApp", data.whatsapp_phone],
      ["Tiempo mínimo de entrega", data.delivery_time_min],
      ["Tiempo máximo de entrega", data.delivery_time_max],
      ["Tarifa por kilómetro", data.delivery_fee_per_km],
      ["Costo mínimo de domicilio", data.min_delivery_fee],
      ["Costo máximo de domicilio", data.max_delivery_fee],
      ["Latitud", data.latitude],
      ["Longitud", data.longitude],
    ];
    const emptyField = requiredFields.find(
      ([, value]) => String(value ?? "").trim() === "",
    );
    if (emptyField) {
      setMessageType("error");
      setMessage("Completa todos los campos obligatorios antes de guardar.");
      return;
    }
    if (!data.delivery_methods.length) {
      setMessageType("error");
      setMessage("Activa al menos un método de entrega.");
      return;
    }

    const minimumDelivery = parseThousands(data.min_delivery_fee);
    const maximumDelivery = parseThousands(data.max_delivery_fee);
    const latitude = Number(data.latitude);
    const longitude = Number(data.longitude);
    if (minimumDelivery > maximumDelivery) {
      setMessageType("error");
      setMessage("El costo mínimo no puede ser mayor que el costo máximo.");
      return;
    }
    if (Number(data.delivery_time_max) < Number(data.delivery_time_min)) {
      setMessageType("error");
      setMessage("El tiempo máximo no puede ser menor que el tiempo mínimo.");
      return;
    }
    if (
      !Number.isFinite(Number(data.delivery_time_min)) ||
      Number(data.delivery_time_min) <= 0 ||
      !Number.isFinite(Number(data.delivery_time_max)) ||
      Number(data.delivery_time_max) <= 0
    ) {
      setMessageType("error");
      setMessage("Los tiempos de entrega deben ser mayores que cero.");
      return;
    }
    const nightSurchargePercent = Number(
      data.night_delivery_surcharge_percent,
    );
    const tipPercent = Number(data.tip_percent);
    if (
      data.tip_percent !== "" &&
      (!Number.isFinite(tipPercent) || tipPercent < 0 || tipPercent > 100)
    ) {
      setMessageType("error");
      setMessage("El porcentaje de propina debe estar entre 0 y 100.");
      return;
    }
    if (data.night_delivery_surcharge_enabled) {
      if (
        !data.night_delivery_surcharge_start ||
        !data.night_delivery_surcharge_end ||
        data.night_delivery_surcharge_start ===
          data.night_delivery_surcharge_end
      ) {
        setMessageType("error");
        setMessage("Define un horario nocturno válido.");
        return;
      }
      if (!Number.isFinite(nightSurchargePercent) || nightSurchargePercent <= 0) {
        setMessageType("error");
        setMessage("El porcentaje del recargo nocturno debe ser mayor que cero.");
        return;
      }
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      setMessageType("error");
      setMessage("La latitud debe estar entre -90 y 90.");
      return;
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      setMessageType("error");
      setMessage("La longitud debe estar entre -180 y 180.");
      return;
    }

    setSaving(true);
    setMessageType("info");
    setMessage("");
    const selectedCategory = categories.find(
      (category) => category.id === data.category,
    );
    const [{ error: businessError }, { error: infoError }] = await Promise.all([
      supabase
        .from("businesses")
        .update({ name: data.name.trim() })
        .eq("id", businessId),
      supabase.from("business_info").upsert(
        {
          business_id: businessId,
          address: data.address.trim(),
          whatsapp_phone: data.whatsapp_phone.trim(),
          delivery_time_min: Number(data.delivery_time_min) || 0,
          delivery_time_max: Number(data.delivery_time_max) || 0,
          delivery_fee_per_km: parseThousands(data.delivery_fee_per_km),
          min_delivery_fee: parseThousands(data.min_delivery_fee),
          max_delivery_fee: parseThousands(data.max_delivery_fee),
          delivery_methods: getEnabledDeliveryMethods(data.delivery_methods),
          night_delivery_surcharge_enabled:
            data.night_delivery_surcharge_enabled,
          night_delivery_surcharge_start: data.night_delivery_surcharge_enabled
            ? data.night_delivery_surcharge_start
            : null,
          night_delivery_surcharge_end: data.night_delivery_surcharge_enabled
            ? data.night_delivery_surcharge_end
            : null,
          night_delivery_surcharge_percent:
            data.night_delivery_surcharge_enabled
              ? nightSurchargePercent
              : null,
          tip_percent: data.tip_percent === "" ? 0 : tipPercent,
          category_id: selectedCategory?.id || null,
          categoria: selectedCategory?.name || "",
          latitude: data.latitude ? Number(data.latitude) : null,
          longitude: data.longitude ? Number(data.longitude) : null,
        },
        { onConflict: "business_id" },
      ),
    ]);
    const error = businessError || infoError;
    if (error) {
      console.error("No se pudo guardar la configuración de la tienda:", error);
      setMessage(error.message || "No se pudo guardar la información de la tienda.");
      setSaving(false);
      return;
    }
    const savedData = {
      ...data,
      delivery_methods: getEnabledDeliveryMethods(data.delivery_methods),
    };
    setData(savedData);
    setInitialData(savedData);
    setInitialMediaUrls({ logo: logoUrl, cover: coverUrl });

    if (onboardingMode) {
      const { error: onboardingError } = await supabase.rpc(
        "complete_business_onboarding",
      );
      if (onboardingError) {
        console.error(
          "No se pudo completar la configuración inicial:",
          onboardingError,
        );
        setMessageType("error");
        setMessage(
          onboardingError.message ||
            "No se pudo completar la configuración inicial.",
        );
        setSaving(false);
        return;
      }
      setMessageType("success");
      setMessage("Configuración completa. Ya puedes empezar a usar tu tienda.");
      setSaving(false);
      onCompleted?.();
      return;
    } else {
      setMessageType("success");
      setMessage("Información de tienda y ubicación guardadas");
    }
    setSaving(false);
  };

  useEffect(() => {
    if (!saveActionRef || onboardingMode) return undefined;
    saveActionRef.current = save;
    return () => {
      saveActionRef.current = null;
    };
  });

  useEffect(() => {
    if (onboardingMode || !onSaveStateChange) return;
    onSaveStateChange({
      disabled: saving || loading || Boolean(uploadingImage) || !canSave,
      saving,
    });
  }, [
    canSave,
    loading,
    onSaveStateChange,
    onboardingMode,
    saving,
    uploadingImage,
  ]);

  const openImageEditor = (file, type) => {
    if (!file || !businessId) return;
    if (
      !file.type.startsWith("image/") ||
      file.size > 5 * 1024 * 1024
    ) {
      setMessage("Selecciona una imagen de máximo 5 MB.");
      return;
    }
    if (uploadingImage) return;
    setImageEditor({
      file,
      type,
      url: URL.createObjectURL(file),
    });
    setImageEditorError("");
    setMessage("");
  };

  const selectImage = (event, type) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    openImageEditor(file, type);
  };

  const handleImageDrop = (event, type) => {
    event.preventDefault();
    setDraggingImage(null);
    openImageEditor(event.dataTransfer.files?.[0], type);
  };

  const recropImage = async (type) => {
    const imageUrl = type === "logo" ? logoUrl : coverUrl;
    if (!imageUrl || editingImage || uploadingImage || deletingImage) return;

    setEditingImage(type);
    setMessage("");
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error("No se pudo cargar la imagen para editarla.");
      }
      const blob = await response.blob();
      const file = new File([blob], type === "logo" ? "logo.png" : "portada.webp", {
        type: blob.type || (type === "logo" ? "image/png" : "image/webp"),
      });
      openImageEditor(file, type);
    } catch (error) {
      console.error("No se pudo preparar la imagen para recortarla:", error);
      setMessageType("error");
      setMessage(error.message || "No se pudo cargar la imagen para editarla.");
    } finally {
      setEditingImage(null);
    }
  };

  const uploadImage = async (file, type, previewUrl) => {
    const previousUrl = type === "logo" ? logoUrl : coverUrl;
    type === "logo" ? setLogoUrl(previewUrl) : setCoverUrl(previewUrl);
    setUploadingImage(type);
    setMessage("Subiendo imagen...");

    const folder = type === "cover" ? "portadas-negocios" : "logos-negocio";
    const path = `${businessId}/${folder}/${type}-${Date.now()}.webp`;

    try {
      if (file.type !== "image/webp") {
        throw new Error("La imagen no se convirtió correctamente a WebP.");
      }
      const { error: uploadError } = await supabase.storage
        .from("business-assets")
        .upload(path, file, { contentType: "image/webp", upsert: false });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from("business-assets")
        .getPublicUrl(path);
      const url = publicData?.publicUrl;
      if (!url) throw new Error("No se pudo obtener la URL de la imagen.");

      const { error } = await supabase
        .from("businesses")
        .update({ [type === "logo" ? "logo_url" : "cover_url"]: url })
        .eq("id", businessId);
      if (error) throw error;

      type === "logo" ? setLogoUrl(url) : setCoverUrl(url);
      setInitialMediaUrls((current) => ({ ...current, [type]: url }));
      setMessage("Imagen actualizada");
      window.setTimeout(() => URL.revokeObjectURL(previewUrl), 1000);

      if (previousUrl && previousUrl !== url) {
        try {
          await removeStorageObjectIfUnused("business-assets", previousUrl);
        } catch (cleanupError) {
          console.error("No se pudo limpiar la imagen anterior:", cleanupError);
          setMessageType("error");
          setMessage(
            "Imagen actualizada, pero no se pudo borrar el archivo anterior de Supabase.",
          );
        }
      }
    } catch (error) {
      type === "logo" ? setLogoUrl(previousUrl) : setCoverUrl(previousUrl);
      setMessage(error.message || "No se pudo subir la imagen.");
      URL.revokeObjectURL(previewUrl);
      try {
        await removeStorageObjectIfUnused("business-assets", path);
      } catch (cleanupError) {
        console.error(
          "No se pudo limpiar la imagen que no se guardó:",
          cleanupError,
        );
        setMessageType("error");
        setMessage(
          "No se pudo guardar la imagen y tampoco se pudo limpiar el archivo temporal de Supabase.",
        );
      }
    } finally {
      setUploadingImage(null);
    }
  };

  const deleteImage = async (type) => {
    const imageUrl = type === "logo" ? logoUrl : coverUrl;
    if (!businessId || !imageUrl || uploadingImage || deletingImage) return;
    if (
      !window.confirm(
        `¿Eliminar ${type === "logo" ? "el logo" : "la portada"} de la tienda?`,
      )
    ) {
      return;
    }

    setDeletingImage(type);
    setMessage("");
    try {
      const { error } = await supabase
        .from("businesses")
        .update({ [type === "logo" ? "logo_url" : "cover_url"]: null })
        .eq("id", businessId);
      if (error) throw error;

      if (type === "logo") setLogoUrl("");
      else setCoverUrl("");
      setInitialMediaUrls((current) => ({ ...current, [type]: "" }));
      setMessageType("success");
      setMessage(`${type === "logo" ? "Logo" : "Portada"} eliminada.`);

      try {
        await removeStorageObjectIfUnused("business-assets", imageUrl);
      } catch (cleanupError) {
        console.warn(
          "No se pudo limpiar el archivo de imagen eliminado:",
          cleanupError,
        );
        setMessage(
          `${type === "logo" ? "Logo" : "Portada"} eliminada, pero no se pudo limpiar el archivo anterior.`,
        );
      }
    } catch (error) {
      console.error("No se pudo eliminar la imagen de la tienda:", error);
      setMessageType("error");
      setMessage(error.message || "No se pudo eliminar la imagen.");
    } finally {
      setDeletingImage(null);
    }
  };

  const applyImageEdit = async (crop) => {
    if (!imageEditor || uploadingImage) return;

    let editedFile;
    try {
      editedFile = await createCroppedImage(imageEditor, crop);
    } catch (error) {
      setImageEditorError(
        error.message || "No se pudo preparar la imagen seleccionada.",
      );
      return;
    }

    const previewUrl = URL.createObjectURL(editedFile);
    const { type } = imageEditor;
    setImageEditor(null);
    await uploadImage(editedFile, type, previewUrl);
  };

  return (
    <section className="space-y-6" data-save-attempted={saveAttempted}>
      <style>{`section[data-save-attempted="true"] input:placeholder-shown { border-color: rgb(239 68 68 / 0.9); }`}</style>
      {onboardingMode && (
        <header className="flex items-start gap-3 pb-5">
          <Store className="mt-0.5 text-violet-400" size={20} />
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-400">
              Información pública
            </p>
            <h2 className="mt-1 text-xl font-black text-white">
              Configura tu tienda
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              Completa los datos del negocio, contacto, entrega y ubicación para
              poder empezar a vender.
            </p>
          </div>
        </header>
      )}
      {loading ? (
        <SubLoading
          label="Cargando información de la tienda"
          className="py-24"
          dotClassName="bg-violet-400"
          fullHeight
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <div
              className={`relative h-48 overflow-hidden rounded-2xl bg-neutral-900/45 transition ${
                draggingImage === "logo"
                  ? "border-2 border-dashed border-violet-400 bg-violet-500/10"
                  : "border border-transparent"
              }`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDraggingImage("logo");
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setDraggingImage(null);
                }
              }}
              onDrop={(event) => handleImageDrop(event, "logo")}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo de la tienda"
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Store className="text-neutral-700" size={36} />
                </div>
              )}
              {draggingImage === "logo" && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-neutral-950/70 text-xs font-bold text-violet-200">
                  Suelta la imagen del logo aquí
                </div>
              )}
              <button
                type="button"
                onClick={() => logoInput.current?.click()}
                disabled={
                  saving ||
                  Boolean(uploadingImage) ||
                  Boolean(deletingImage) ||
                  Boolean(editingImage)
                }
                className="absolute bottom-3 right-3 rounded-lg bg-violet-600 p-2 disabled:opacity-50"
                aria-label="Cambiar imagen del logo"
                title="Cambiar imagen"
              >
                <Image size={14} />
              </button>
              {logoUrl && (
                <button
                  type="button"
                  onClick={() => recropImage("logo")}
                  disabled={
                    saving ||
                    Boolean(uploadingImage) ||
                    Boolean(deletingImage) ||
                    Boolean(editingImage)
                  }
                  className="absolute bottom-3 right-12 rounded-lg bg-neutral-700 p-2 disabled:opacity-50"
                  aria-label="Volver a recortar el logo"
                  title="Volver a recortar"
                >
                  <Crop size={14} />
                </button>
              )}
              {logoUrl && (
                <button
                  type="button"
                  onClick={() => deleteImage("logo")}
                  disabled={
                    saving ||
                    Boolean(uploadingImage) ||
                    Boolean(deletingImage) ||
                    Boolean(editingImage)
                  }
                  className="absolute bottom-3 right-[5.25rem] rounded-lg bg-red-600 p-2 disabled:opacity-50"
                  aria-label="Eliminar imagen del logo"
                  title="Eliminar imagen"
                >
                  <Trash2 size={14} />
                </button>
              )}
              {uploadingImage === "logo" && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-neutral-950/80 text-xs font-bold text-white">
                  <LoaderCircle size={22} className="animate-spin text-violet-400" />
                  Subiendo logo...
                </div>
              )}
              {deletingImage === "logo" && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-neutral-950/80 text-xs font-bold text-white">
                  <LoaderCircle size={22} className="animate-spin text-violet-400" />
                  Eliminando logo...
                </div>
              )}
              {editingImage === "logo" && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-neutral-950/80 text-xs font-bold text-white">
                  <LoaderCircle size={22} className="animate-spin text-violet-400" />
                  Preparando editor...
                </div>
              )}
              <input
                ref={logoInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => selectImage(event, "logo")}
              />
            </div>
            <div className="overflow-hidden rounded-2xl bg-neutral-900/45">
              <div
                className={`relative h-48 transition ${
                  draggingImage === "cover"
                    ? "border-2 border-dashed border-violet-400 bg-violet-500/10"
                    : "border border-transparent"
                }`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDraggingImage("cover");
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setDraggingImage(null);
                  }
                }}
                onDrop={(event) => handleImageDrop(event, "cover")}
              >
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt="Portada de la tienda"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs uppercase tracking-widest text-neutral-600">
                    Sin portada
                  </div>
                )}
                {draggingImage === "cover" && (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-neutral-950/70 text-xs font-bold text-violet-200">
                    Suelta la imagen de portada aquí
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => coverInput.current?.click()}
                  disabled={
                    saving ||
                    Boolean(uploadingImage) ||
                    Boolean(deletingImage) ||
                    Boolean(editingImage)
                  }
                  className="absolute bottom-3 right-3 rounded-lg bg-violet-600 p-2 disabled:opacity-50"
                  aria-label="Cambiar imagen de portada"
                  title="Cambiar imagen"
                >
                  <Image size={14} />
                </button>
                {coverUrl && (
                  <button
                    type="button"
                    onClick={() => recropImage("cover")}
                    disabled={
                      saving ||
                      Boolean(uploadingImage) ||
                      Boolean(deletingImage) ||
                      Boolean(editingImage)
                    }
                    className="absolute bottom-3 right-12 rounded-lg bg-neutral-700 p-2 disabled:opacity-50"
                    aria-label="Volver a recortar la portada"
                    title="Volver a recortar"
                  >
                    <Crop size={14} />
                  </button>
                )}
                {coverUrl && (
                  <button
                    type="button"
                    onClick={() => deleteImage("cover")}
                    disabled={
                      saving ||
                      Boolean(uploadingImage) ||
                      Boolean(deletingImage) ||
                      Boolean(editingImage)
                    }
                    className="absolute bottom-3 right-[5.25rem] rounded-lg bg-red-600 p-2 disabled:opacity-50"
                    aria-label="Eliminar imagen de portada"
                    title="Eliminar imagen"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                {uploadingImage === "cover" && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-neutral-950/75 text-xs font-bold text-white">
                    <LoaderCircle size={24} className="animate-spin text-violet-400" />
                    Subiendo portada...
                  </div>
                )}
                {deletingImage === "cover" && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-neutral-950/75 text-xs font-bold text-white">
                    <LoaderCircle size={24} className="animate-spin text-violet-400" />
                    Eliminando portada...
                  </div>
                )}
                {editingImage === "cover" && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-neutral-950/75 text-xs font-bold text-white">
                    <LoaderCircle size={24} className="animate-spin text-violet-400" />
                    Preparando editor...
                  </div>
                )}
                <input
                  ref={coverInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => selectImage(event, "cover")}
                />
              </div>
            </div>
          </div>
          <ImageCropEditor
            key={imageEditor?.url || "closed"}
            imageEditor={imageEditor}
            onConfirm={applyImageEdit}
            onClose={() => setImageEditor(null)}
            saving={Boolean(uploadingImage)}
            error={imageEditorError}
          />
          <div className="rounded-2xl bg-neutral-900/45 p-5 md:p-6">
            <h3 className="mb-5 text-sm font-black uppercase tracking-wider text-neutral-300">
              Identidad y contacto
            </h3>
            <div className="grid gap-5 md:grid-cols-2">
              <ConfiguracionField
                showError={saveAttempted}
                label="Nombre del negocio"
                value={data.name}
                onChange={(e) => update("name", e.target.value)}
              />
              <label className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                  Categoría
                </span>
                <select
                  value={data.category}
                  onChange={(e) => update("category", e.target.value)}
                  className={`w-full rounded-xl border bg-neutral-950/60 px-4 py-3 text-sm text-white outline-none transition ${saveAttempted && !data.category ? "border-red-500 focus:border-red-400" : "border-white/[0.1] focus:border-violet-500/60"}`}
                >
                  <option value="">Selecciona una categoría</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] leading-4 text-neutral-600">
                  Clasifica la tienda dentro del marketplace.
                </span>
              </label>
              <ConfiguracionField
                showError={saveAttempted}
                label="Dirección física"
                value={data.address}
                onChange={(e) => update("address", e.target.value)}
                placeholder="Calle 78 #3"
              />
              <ConfiguracionField
                showError={saveAttempted}
                label="Número de WhatsApp"
                value={data.whatsapp_phone}
                onChange={(e) => update("whatsapp_phone", e.target.value)}
                placeholder="573001234567"
              />
            </div>
          </div>
          <div className="rounded-2xl bg-neutral-900/45 p-5 md:p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-neutral-300">
                  Ubicación en el mapa
                </h3>
                <p className="mt-1 text-xs text-neutral-500">
                  {isMapEditing
                    ? "Haz clic o arrastra el marcador para cambiar la ubicación."
                    : "El mapa está bloqueado para que puedas desplazarte sin moverlo por accidente."}
                </p>
              </div>
            </div>
            <div
              ref={mapElement}
              className={`isolate overflow-hidden bg-neutral-950 [&:fullscreen]:mb-0 [&:fullscreen]:h-screen [&:fullscreen]:rounded-none [&:fullscreen]:border-0 ${
                isCssMapFullscreen
                  ? "fixed inset-0 z-[1000] m-0 h-screen h-[100dvh] w-screen rounded-none border-0"
                  : "relative mb-5 h-72 rounded-2xl"
              }`}
              style={
                isCssMapFullscreen ? { height: "100dvh" } : undefined
              }
              aria-label="Mapa interactivo de ubicación de la tienda"
            >
              <div
                data-map-controls
                className="absolute right-3 top-3 z-[600] flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-end gap-2"
              >
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleMapEditing();
                  }}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase shadow-lg backdrop-blur-md transition ${
                    isMapEditing
                      ? "border-emerald-500/30 bg-neutral-950/90 text-emerald-300 hover:bg-emerald-500/15"
                      : "border-violet-500/30 bg-neutral-950/90 text-violet-300 hover:bg-violet-500/15"
                  }`}
                  aria-pressed={isMapEditing}
                >
                  {isMapEditing ? <Check size={14} /> : <Pencil size={14} />}
                  {isMapEditing ? "Listo" : "Editar mapa"}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    locateCurrentLocation();
                  }}
                  disabled={locating}
                  aria-busy={locating}
                  className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-neutral-950/85 px-3 py-2 text-[10px] font-black uppercase text-violet-300 shadow-lg backdrop-blur-md disabled:opacity-50"
                >
                  <LocateFixed size={14} />
                  {locating ? "Localizando..." : "Usar mi ubicación"}
                </button>
                <button
                  type="button"
                  onClick={toggleMapFullscreen}
                  className="rounded-xl border border-white/20 bg-neutral-950/85 p-2 text-white shadow-lg backdrop-blur-md"
                  aria-label={
                    isMapFullscreen
                      ? "Salir de pantalla completa"
                      : "Abrir pantalla completa"
                  }
                  title={
                    isMapFullscreen
                      ? "Salir de pantalla completa"
                      : "Abrir pantalla completa"
                  }
                >
                  {isMapFullscreen ? (
                    <Minimize2 size={18} />
                  ) : (
                    <Maximize2 size={18} />
                  )}
                </button>
              </div>
            </div>
            <div className="grid gap-5">
              <label className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                  Ubicación (latitud, longitud)
                </span>
                <input
                  value={locationInput}
                  onChange={(event) => updateLocationInput(event.target.value)}
                  placeholder="Ej. 10.382876, -75.473188 o https://maps.google.com/..."
                  className={`w-full rounded-xl border bg-neutral-950/60 px-4 py-3 text-sm text-white outline-none transition ${saveAttempted && (!data.latitude || !data.longitude) ? "border-red-500 focus:border-red-400" : "border-white/[0.1] focus:border-violet-500/60"}`}
                />
                <span className="text-[10px] leading-4 text-neutral-600">
                  Acepta coordenadas en formato decimal, pares tipo (10.382876, -75.473188) o enlaces de Google Maps.
                </span>
              </label>
            </div>
          </div>
          <div className="rounded-2xl bg-neutral-900/45 p-5 md:p-6">
            <h3 className="mb-5 text-sm font-black uppercase tracking-wider text-neutral-300">
              Entrega y domicilio
            </h3>
            <div className="mb-5 rounded-2xl bg-neutral-950/45 p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-neutral-100">
                  Métodos de entrega
                </p>
                <span className="text-[11px] text-neutral-500">
                  {data.delivery_methods.length} activos
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {DELIVERY_METHODS.map(({ id, label }) => {
                  const checked = data.delivery_methods.includes(id);
                  const {
                    icon,
                    description,
                    selectedClass,
                    iconClass,
                    checkboxClass,
                  } = DELIVERY_METHOD_PRESENTATION[id];
                  return (
                    <label
                      key={id}
                      className={`flex min-h-[72px] cursor-pointer items-center justify-between gap-2 rounded-xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-violet-400/60 ${
                        checked
                          ? selectedClass
                          : "border-white/[0.06] bg-neutral-900/35 hover:bg-neutral-800/55"
                      } ${
                        checked && data.delivery_methods.length === 1
                          ? "cursor-not-allowed"
                          : ""
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                            checked
                              ? iconClass
                              : "bg-neutral-800 text-neutral-400"
                          }`}
                        >
                          <span
                            className="material-symbols-outlined text-lg leading-none"
                            aria-hidden="true"
                          >
                            {icon}
                          </span>
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-bold text-neutral-100 sm:text-sm">
                            {label}
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] text-neutral-500 sm:text-[11px]">
                            {description}
                          </span>
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={checked && data.delivery_methods.length === 1}
                        onChange={(event) =>
                          setData((current) => ({
                            ...current,
                            delivery_methods: event.target.checked
                              ? [...current.delivery_methods, id]
                              : current.delivery_methods.filter(
                                  (method) => method !== id,
                                ),
                          }))
                        }
                        className={`h-4 w-4 shrink-0 rounded ${checkboxClass}`}
                      />
                    </label>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] leading-5 text-neutral-500">
                Elige qué opciones podrán seleccionar tus clientes y el equipo
                en el POS. Debe quedar al menos una activa.
              </p>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl bg-neutral-950/35 p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-400/10 text-sky-300">
                    <span className="material-symbols-outlined text-xl leading-none">
                      schedule
                    </span>
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-neutral-100">
                      Tiempo estimado
                    </h4>
                    <p className="mt-0.5 text-[11px] text-neutral-500">
                      Rango para preparar y entregar cada pedido
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ConfiguracionField
                    label="Tiempo mínimo (minutos)"
                    type="number"
                    value={data.delivery_time_min}
                    onChange={(e) =>
                      update("delivery_time_min", e.target.value)
                    }
                  />
                  <ConfiguracionField
                    label="Tiempo máximo (minutos)"
                    type="number"
                    value={data.delivery_time_max}
                    onChange={(e) =>
                      update("delivery_time_max", e.target.value)
                    }
                  />
                </div>
              </div>
              <div className="rounded-2xl bg-neutral-950/35 p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
                    <span className="material-symbols-outlined text-xl leading-none">
                      payments
                    </span>
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-neutral-100">
                      Costos de domicilio
                    </h4>
                    <p className="mt-0.5 text-[11px] text-neutral-500">
                      Define la tarifa y los límites de cobro
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ConfiguracionField
                    label="Tarifa por kilómetro"
                    inputMode="numeric"
                    value={formatThousands(data.delivery_fee_per_km)}
                    onChange={(e) =>
                      updateMoney("delivery_fee_per_km", e.target.value)
                    }
                  />
                  <ConfiguracionField
                    label="Costo mínimo de domicilio"
                    inputMode="numeric"
                    value={formatThousands(data.min_delivery_fee)}
                    onChange={(e) =>
                      updateMoney("min_delivery_fee", e.target.value)
                    }
                  />
                  <ConfiguracionField
                    label="Costo máximo de domicilio"
                    inputMode="numeric"
                    value={formatThousands(data.max_delivery_fee)}
                    onChange={(e) =>
                      updateMoney("max_delivery_fee", e.target.value)
                    }
                  />
                </div>
              </div>
            </div>
            <div
              className={`mt-5 rounded-2xl border p-4 transition-colors sm:p-5 ${
                data.night_delivery_surcharge_enabled
                  ? "border-amber-400/20 bg-amber-400/[0.04]"
                  : "border-white/[0.06] bg-neutral-950/35"
              }`}
            >
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
                    <span className="material-symbols-outlined text-xl leading-none">
                      dark_mode
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-neutral-100 sm:text-sm">
                      Recargo nocturno
                    </span>
                    <span className="mt-0.5 block text-[11px] text-neutral-500">
                      Aplicar un porcentaje adicional a los domicilios en un horario definido
                    </span>
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={data.night_delivery_surcharge_enabled}
                  onChange={(e) =>
                    update("night_delivery_surcharge_enabled", e.target.checked)
                  }
                  className="h-4 w-4 shrink-0 accent-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
                />
              </label>
              {data.night_delivery_surcharge_enabled && (
                <>
                  <div className="my-4 border-t border-white/[0.07]" />
                  <div className="grid gap-4 sm:grid-cols-3">
                    <ConfiguracionField
                      label="Hora de inicio"
                      type="time"
                      value={data.night_delivery_surcharge_start}
                      onChange={(e) =>
                        update("night_delivery_surcharge_start", e.target.value)
                      }
                    />
                    <ConfiguracionField
                      label="Hora de fin"
                      type="time"
                      value={data.night_delivery_surcharge_end}
                      onChange={(e) =>
                        update("night_delivery_surcharge_end", e.target.value)
                      }
                    />
                    <ConfiguracionField
                      label="Recargo (%)"
                      type="number"
                      value={data.night_delivery_surcharge_percent}
                      onChange={(e) =>
                        update(
                          "night_delivery_surcharge_percent",
                          e.target.value,
                        )
                      }
                      placeholder="Ej. 15"
                    />
                  </div>
                </>
              )}
              <p className="mt-3 text-[11px] leading-5 text-neutral-500">
                El porcentaje se suma al costo de domicilio calculado. El
                horario puede cruzar la medianoche.
              </p>
            </div>
          </div>
          <div className="rounded-2xl bg-neutral-900/45 p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-400/10 text-violet-300">
                  <span className="material-symbols-outlined text-xl leading-none">
                    volunteer_activism
                  </span>
                </span>
                <div>
                  <h3 className="text-sm font-bold text-neutral-100">
                    Propina en POS
                  </h3>
                  <p className="mt-1 max-w-xl text-xs leading-5 text-neutral-500">
                    Define el porcentaje que se agregará automáticamente al subtotal
                    de los productos en cada pedido. Usa 0 para no cobrar propina.
                  </p>
                </div>
              </div>
              <div className="w-full max-w-xs rounded-xl bg-neutral-950/45 p-4 sm:w-auto">
                <ConfiguracionField
                  label="Propina (%)"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={data.tip_percent}
                  onChange={(e) => update("tip_percent", e.target.value)}
                  placeholder="Ej. 10"
                />
              </div>
            </div>
          </div>
          {onboardingMode ? (
            <footer className="flex items-center justify-between gap-4 rounded-2xl bg-neutral-950/95 p-4">
              <span
                aria-live="polite"
                className={`text-xs ${
                  messageType === "error"
                    ? "text-red-300"
                    : messageType === "info"
                      ? "text-violet-300"
                      : "text-emerald-300"
                }`}
              >
                {message}
              </span>
              <button
                type="button"
                onClick={save}
                disabled={
                  saving || loading || Boolean(uploadingImage) || !canSave
                }
                className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Save size={14} />{" "}
                {saving ? "Guardando..." : "Guardar y comenzar"}
              </button>
            </footer>
          ) : (
            <div
              aria-live="polite"
              className={`min-h-5 text-right text-xs ${
                messageType === "error"
                  ? "text-red-300"
                  : messageType === "info"
                    ? "text-violet-300"
                    : "text-emerald-300"
              }`}
            >
              {message}
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default ConfiguracionTienda;
