import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  Image,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Maximize2,
  Minimize2,
  Pencil,
  Save,
  Store,
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import {
  removeStorageObjectIfUnused,
  supabase,
} from "../../src/lib/supabaseClient";
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
  night_delivery_surcharge_enabled: false,
  night_delivery_surcharge_start: "21:00",
  night_delivery_surcharge_end: "06:00",
  night_delivery_surcharge_percent: "",
  tip_percent: "",
  latitude: "",
  longitude: "",
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

  const numbers = raw.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  if (numbers.length < 2) return { latitude: "", longitude: "" };

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

const canvasToFile = (canvas, fileName, type, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(new File([blob], fileName, { type }))
          : reject(new Error("No se pudo crear la imagen editada.")),
      type,
      quality,
    );
  });

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
  return isCover
    ? canvasToFile(canvas, "portada.webp", "image/webp", 0.9)
    : canvasToFile(canvas, "logo.png", "image/png");
};

const ConfiguracionTienda = ({ onboardingMode = false, onCompleted }) => {
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
  const isMapEditingRef = useRef(false);

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
            "address,whatsapp_phone,delivery_time_min,delivery_time_max,delivery_fee_per_km,min_delivery_fee,max_delivery_fee,night_delivery_surcharge_enabled,night_delivery_surcharge_start,night_delivery_surcharge_end,night_delivery_surcharge_percent,tip_percent,category_id,categoria,latitude,longitude",
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
  const updateLocationInput = (nextValue) => {
    setLocationInput(nextValue);
    const parsed = parseCoordinatePair(nextValue);
    if (!parsed.latitude || !parsed.longitude) return;
    update("latitude", parsed.latitude);
    update("longitude", parsed.longitude);
  };
  const hasUnsavedChanges = useMemo(() => {
    const sameData =
      JSON.stringify(data) === JSON.stringify(initialData);
    const sameMedia =
      logoUrl === initialMediaUrls.logo &&
      coverUrl === initialMediaUrls.cover;

    return !sameData || !sameMedia;
  }, [coverUrl, data, initialData, initialMediaUrls.cover, initialMediaUrls.logo, logoUrl]);
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
    setLocationInput(formatCoordinatePair(data.latitude, data.longitude));
  }, [data.latitude, data.longitude]);

  useEffect(() => {
    if (loading) return undefined;

    let isMounted = true;

    import("leaflet").then((L) => {
      if (!isMounted || !mapElement.current || mapInstance.current) return;

      const initialCenter = coordinatesRef.current || [10.373842, -75.473796];
      const map = L.default
        .map(mapElement.current, {
          zoomControl: true,
          dragging: false,
          touchZoom: false,
          doubleClickZoom: false,
          scrollWheelZoom: false,
          boxZoom: false,
          keyboard: false,
        })
        .setView(initialCenter, coordinates ? 15 : 12);

      setMapEditing(map, isMapEditingRef.current);
      L.default
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        })
        .addTo(map);

      map.on("moveend", () => {
        if (!isMapEditingRef.current) return;
        const center = map.getCenter();
        setData((current) => ({
          ...current,
          latitude: Number(center.lat).toFixed(6),
          longitude: Number(center.lng).toFixed(6),
        }));
      });
      mapInstance.current = map;
    });

    return () => {
      isMounted = false;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [loading]);

  const syncMapCenterToForm = () => {
    if (!mapInstance.current) return;
    const center = mapInstance.current.getCenter();
    const latitude = Number(center.lat).toFixed(6);
    const longitude = Number(center.lng).toFixed(6);
    setData((current) => {
      if (
        current.latitude === latitude &&
        current.longitude === longitude
      ) {
        return current;
      }
      return {
        ...current,
        latitude,
        longitude,
      };
    });
  };

  const toggleMapEditing = () => {
    const nextEditingState = !isMapEditingRef.current;
    isMapEditingRef.current = nextEditingState;
    setIsMapEditing(nextEditingState);
    if (mapInstance.current) {
      setMapEditing(mapInstance.current, nextEditingState);
      if (!nextEditingState) {
        syncMapCenterToForm();
      }
    }
  };

  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !coordinates) return;

    const [latitude, longitude] = coordinates;
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
    const handleFullscreenChange = () => {
      const nativeFullscreen =
        document.fullscreenElement === mapElement.current;
      setIsMapFullscreen(nativeFullscreen || isCssMapFullscreen);
      setTimeout(() => mapInstance.current?.invalidateSize(), 100);
    };
    const handleMapResize = () => {
      requestAnimationFrame(() =>
        mapInstance.current?.invalidateSize({ pan: false }),
      );
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) handleMapResize();
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("resize", handleMapResize);
    window.addEventListener("orientationchange", handleMapResize);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("resize", handleMapResize);
      window.removeEventListener("orientationchange", handleMapResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isCssMapFullscreen]);

  useEffect(() => {
    if (!isCssMapFullscreen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsCssMapFullscreen(false);
        setIsMapFullscreen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    const resizeFrame = window.requestAnimationFrame(() =>
      mapInstance.current?.invalidateSize({ pan: false }),
    );

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.cancelAnimationFrame(resizeFrame);
      window.requestAnimationFrame(() =>
        mapInstance.current?.invalidateSize({ pan: false }),
      );
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
        update("latitude", coords.latitude.toFixed(6));
        update("longitude", coords.longitude.toFixed(6));
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

  const selectImage = (event, type) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !businessId) return;
    if (
      !file.type.match(/^image\/(jpeg|png|webp)$/) ||
      file.size > 5 * 1024 * 1024
    ) {
      setMessage("Usa JPG, PNG o WEBP de máximo 5 MB.");
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

  const uploadImage = async (file, type, previewUrl) => {
    const previousUrl = type === "logo" ? logoUrl : coverUrl;
    type === "logo" ? setLogoUrl(previewUrl) : setCoverUrl(previewUrl);
    setUploadingImage(type);
    setMessage("Subiendo imagen...");

    const folder = type === "cover" ? "portadas-negocios" : "logos-negocio";
    const extensionByType = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    const extension = extensionByType[file.type] || "webp";
    const path = `${businessId}/${folder}/${type}-${Date.now()}.${extension}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("business-assets")
        .upload(path, file, { contentType: file.type, upsert: false });
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
      setMessage("Imagen actualizada");
      window.setTimeout(() => URL.revokeObjectURL(previewUrl), 1000);

      if (previousUrl && previousUrl !== url) {
        void removeStorageObjectIfUnused("business-assets", previousUrl).catch(
          (cleanupError) => {
            console.warn("No se pudo limpiar la imagen anterior:", cleanupError);
            setMessage(
              "Imagen actualizada; no se pudo limpiar el archivo anterior.",
            );
          },
        );
      }
    } catch (error) {
      type === "logo" ? setLogoUrl(previousUrl) : setCoverUrl(previousUrl);
      setMessage(error.message || "No se pudo subir la imagen.");
      URL.revokeObjectURL(previewUrl);
      try {
        await removeStorageObjectIfUnused("business-assets", path);
      } catch (cleanupError) {
        console.warn(
          "No se pudo limpiar la imagen que no se guardó:",
          cleanupError,
        );
      }
    } finally {
      setUploadingImage(null);
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
      <header className="flex items-start gap-3 pb-5">
        <Store className="mt-0.5 text-violet-400" size={20} />
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-400">
            Información pública
          </p>
          <h2 className="mt-1 text-xl font-black text-white">
            {onboardingMode ? "Configura tu tienda" : "Tienda"}
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            {onboardingMode
              ? "Completa los datos del negocio, contacto, entrega y ubicación para poder empezar a vender."
              : "Aquí está todo lo que tus clientes ven y necesitan para encontrarte."}
          </p>
        </div>
      </header>
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
            <div className="flex flex-col items-center justify-center rounded-2xl bg-neutral-900/45 p-4">
              <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                Logo
              </p>
              <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl bg-neutral-950">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Logo de la tienda"
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <Store className="text-neutral-700" size={36} />
                )}
                <button
                  type="button"
                  onClick={() => logoInput.current?.click()}
                  disabled={saving || Boolean(uploadingImage)}
                  className="absolute bottom-1 right-1 rounded-lg bg-violet-600 p-2 disabled:opacity-50"
                >
                  <Camera size={14} />
                </button>
                {uploadingImage === "logo" && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-neutral-950/80 text-xs font-bold text-white">
                    <LoaderCircle size={22} className="animate-spin text-violet-400" />
                    Subiendo logo...
                  </div>
                )}
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => selectImage(event, "logo")}
                />
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl bg-neutral-900/45">
              <div className="relative h-48">
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
                <button
                  type="button"
                  onClick={() => coverInput.current?.click()}
                  disabled={saving || Boolean(uploadingImage)}
                  className="absolute bottom-3 right-3 flex items-center gap-2 rounded-xl bg-black/75 px-3 py-2 text-[10px] font-black uppercase disabled:opacity-50"
                >
                  <Image size={14} /> Cambiar portada
                </button>
                {uploadingImage === "cover" && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-neutral-950/75 text-xs font-bold text-white">
                    <LoaderCircle size={24} className="animate-spin text-violet-400" />
                    Subiendo portada...
                  </div>
                )}
                <input
                  ref={coverInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
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
                    ? "Mueve el mapa debajo del puntero fijo y confirma al terminar."
                    : "El mapa está bloqueado para evitar movimientos accidentales."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={toggleMapEditing}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black uppercase transition ${
                    isMapEditing
                      ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                      : "bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
                  }`}
                  aria-pressed={isMapEditing}
                >
                  {isMapEditing ? <Check size={14} /> : <Pencil size={14} />}
                  {isMapEditing ? "Listo" : "Editar mapa"}
                </button>
              </div>
            </div>
            <div
              ref={mapElement}
              className={`isolate overflow-hidden bg-neutral-950 [&:fullscreen]:mb-0 [&:fullscreen]:h-screen [&:fullscreen]:rounded-none [&:fullscreen]:border-0 ${
                isCssMapFullscreen
                  ? "fixed inset-0 z-[1000] m-0 h-[100dvh] w-screen rounded-none border-0"
                  : "relative mb-5 h-72 rounded-2xl"
              }`}
              aria-label="Mapa interactivo de ubicación de la tienda"
            >
              <div className="absolute right-4 top-4 z-[600] flex items-center gap-2">
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
              <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-full text-violet-600 drop-shadow-[0_3px_4px_rgba(0,0,0,0.65)]">
                <MapPin
                  size={42}
                  fill="currentColor"
                  stroke="white"
                  strokeWidth={1.5}
                />
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
            <div className="grid gap-5 md:grid-cols-2">
              <ConfiguracionField
                label="Tiempo mínimo (minutos)"
                type="number"
                value={data.delivery_time_min}
                onChange={(e) => update("delivery_time_min", e.target.value)}
              />
              <ConfiguracionField
                label="Tiempo máximo (minutos)"
                type="number"
                value={data.delivery_time_max}
                onChange={(e) => update("delivery_time_max", e.target.value)}
              />
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
            <div className="mt-6 rounded-xl bg-neutral-950/50 p-4">
              <label className="flex cursor-pointer items-center gap-3 text-sm font-bold text-neutral-200">
                <input
                  type="checkbox"
                  checked={data.night_delivery_surcharge_enabled}
                  onChange={(e) =>
                    update("night_delivery_surcharge_enabled", e.target.checked)
                  }
                  className="h-4 w-4 accent-violet-500"
                />
                Activar recargo nocturno para domicilios
              </label>
              {data.night_delivery_surcharge_enabled && (
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
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
              )}
              <p className="mt-3 text-xs text-neutral-500">
                El porcentaje se suma al costo de domicilio calculado. El
                horario puede cruzar la medianoche.
              </p>
            </div>
          </div>
          <div className="rounded-2xl bg-neutral-900/45 p-5 md:p-6">
            <h3 className="mb-2 text-sm font-black uppercase tracking-wider text-neutral-300">
              Propina en POS
            </h3>
            <p className="mb-5 text-xs text-neutral-500">
              Define el porcentaje que se agregará automáticamente al subtotal
              de los productos en cada pedido. Usa 0 para no cobrar propina.
            </p>
            <div className="max-w-sm">
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
          <footer className="sticky bottom-4 z-10 flex items-center justify-between gap-4 rounded-2xl bg-neutral-950/95 p-4 shadow-xl backdrop-blur-md">
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
              disabled={saving || loading || Boolean(uploadingImage) || !hasUnsavedChanges}
              className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save size={14} />{" "}
              {saving
                ? "Guardando..."
                : onboardingMode
                  ? "Guardar y comenzar"
                  : "Guardar tienda"}
            </button>
          </footer>
        </>
      )}
    </section>
  );
};

export default ConfiguracionTienda;
