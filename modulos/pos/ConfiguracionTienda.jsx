import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Image,
  LocateFixed,
  MapPin,
  Maximize2,
  Minimize2,
  Save,
  Store,
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "../../src/lib/supabaseClient";
import ConfiguracionField from "./ConfiguracionField";

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

const ConfiguracionTienda = () => {
  const [businessId, setBusinessId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [data, setData] = useState(EMPTY_DATA);
  const [logoUrl, setLogoUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [message, setMessage] = useState("");
  const logoInput = useRef(null);
  const coverInput = useRef(null);
  const mapElement = useRef(null);
  const mapInstance = useRef(null);

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
            "address,whatsapp_phone,delivery_time_min,delivery_time_max,delivery_fee_per_km,min_delivery_fee,max_delivery_fee,categoria,latitude,longitude",
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
      setCategories(categoryData || []);
      setData((current) => ({
        ...current,
        name: business?.name || "",
        category: info?.categoria || "",
        address: info?.address || "",
        whatsapp_phone: info?.whatsapp_phone || "",
        delivery_time_min: info?.delivery_time_min ?? "",
        delivery_time_max: info?.delivery_time_max ?? "",
        delivery_fee_per_km: info?.delivery_fee_per_km ?? "",
        min_delivery_fee: info?.min_delivery_fee ?? "",
        max_delivery_fee: info?.max_delivery_fee ?? "",
        latitude: info?.latitude ?? "",
        longitude: info?.longitude ?? "",
      }));
      setLogoUrl(business?.logo_url || "");
      setCoverUrl(business?.cover_url || "");
      setLoading(false);
    };
    load();
  }, []);

  const update = (key, value) =>
    setData((current) => ({ ...current, [key]: value }));
  const updateMoney = (key, value) => update(key, formatThousands(value));
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

  const updateCoordinates = (latitude, longitude) => {
    update("latitude", Number(latitude).toFixed(6));
    update("longitude", Number(longitude).toFixed(6));
  };

  useEffect(() => {
    if (!mapElement.current || mapInstance.current) return undefined;

    const initialCenter = coordinates || [10.373842, -75.473796];
    const map = L.map(mapElement.current, { zoomControl: true }).setView(
      initialCenter,
      coordinates ? 15 : 12,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    map.on("moveend", () => {
      const center = map.getCenter();
      updateCoordinates(center.lat, center.lng);
    });
    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

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
      setIsMapFullscreen(document.fullscreenElement === mapElement.current);
      setTimeout(() => mapInstance.current?.invalidateSize(), 100);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleMapFullscreen = () => {
    if (!mapElement.current) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else mapElement.current.requestFullscreen?.();
    setTimeout(() => mapInstance.current?.invalidateSize(), 200);
  };

  const useCurrentLocation = () => {
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
      ["Logo", logoUrl],
      ["Portada", coverUrl],
    ];
    const emptyField = requiredFields.find(
      ([, value]) => String(value ?? "").trim() === "",
    );
    if (emptyField) {
      setMessage("");
      return;
    }

    const minimumDelivery = parseThousands(data.min_delivery_fee);
    const maximumDelivery = parseThousands(data.max_delivery_fee);
    const latitude = Number(data.latitude);
    const longitude = Number(data.longitude);
    if (minimumDelivery > maximumDelivery) {
      setMessage("El costo mínimo no puede ser mayor que el costo máximo.");
      return;
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      setMessage("La latitud debe estar entre -90 y 90.");
      return;
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      setMessage("La longitud debe estar entre -180 y 180.");
      return;
    }

    setSaving(true);
    setMessage("");
    const [{ error: businessError }, { error: infoError }] = await Promise.all([
      supabase
        .from("businesses")
        .update({ name: data.name.trim() })
        .eq("id", businessId),
      supabase
        .from("business_info")
        .upsert(
          {
            business_id: businessId,
            address: data.address.trim(),
            whatsapp_phone: data.whatsapp_phone.trim(),
            delivery_time_min: Number(data.delivery_time_min) || 0,
            delivery_time_max: Number(data.delivery_time_max) || 0,
            delivery_fee_per_km: parseThousands(data.delivery_fee_per_km),
            min_delivery_fee: parseThousands(data.min_delivery_fee),
            max_delivery_fee: parseThousands(data.max_delivery_fee),
            categoria: data.category.trim(),
            latitude: data.latitude ? Number(data.latitude) : null,
            longitude: data.longitude ? Number(data.longitude) : null,
          },
          { onConflict: "business_id" },
        ),
    ]);
    const error = businessError || infoError;
    setMessage(
      error ? error.message : "Información de tienda y ubicación guardadas",
    );
    setSaving(false);
  };

  const uploadImage = async (event, type) => {
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
    setSaving(true);
    setMessage("");
    const path = `${businessId}/${type}-${Date.now()}.${file.type.split("/")[1]}`;
    const { error: uploadError } = await supabase.storage
      .from("business-assets")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setMessage(uploadError.message);
      setSaving(false);
      return;
    }
    const { data: publicData } = supabase.storage
      .from("business-assets")
      .getPublicUrl(path);
    const url = publicData?.publicUrl;
    const { error } = await supabase
      .from("businesses")
      .update({ [type === "logo" ? "logo_url" : "cover_url"]: url })
      .eq("id", businessId);
    if (error) setMessage(error.message);
    else {
      type === "logo" ? setLogoUrl(url) : setCoverUrl(url);
      setMessage("Imagen actualizada");
    }
    setSaving(false);
  };

  return (
    <section className="space-y-6" data-save-attempted={saveAttempted}>
      <style>{`section[data-save-attempted="true"] input:placeholder-shown { border-color: rgb(239 68 68 / 0.9); }`}</style>
      <style>{`section.space-y-6 > div:nth-of-type(3) > div:first-child > div:last-child > button:nth-child(2) { display: none; }`}</style>
      <header className="flex items-start gap-3 border-b border-white/[0.06] pb-5">
        <Store className="mt-0.5 text-violet-400" size={20} />
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-400">
            Información pública
          </p>
          <h2 className="mt-1 text-xl font-black text-white">Tienda</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Aquí está todo lo que tus clientes ven y necesitan para encontrarte.
          </p>
        </div>
      </header>
      {loading && (
        <p className="text-xs text-neutral-500">
          Cargando información de la tienda...
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-neutral-900/45 p-4">
          <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-neutral-500">
            Logo
          </p>
          <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-neutral-700 bg-neutral-950">
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
              className="absolute bottom-1 right-1 rounded-lg bg-violet-600 p-2"
            >
              <Camera size={14} />
            </button>
            <input
              ref={logoInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => uploadImage(event, "logo")}
            />
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-neutral-900/45">
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
              className="absolute bottom-3 right-3 flex items-center gap-2 rounded-xl bg-black/75 px-3 py-2 text-[10px] font-black uppercase"
            >
              <Image size={14} /> Cambiar portada
            </button>
            <input
              ref={coverInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => uploadImage(event, "cover")}
            />
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-white/[0.07] bg-neutral-900/45 p-5 md:p-6">
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
              className={`w-full rounded-xl border bg-neutral-950/60 px-4 py-3 text-sm text-white outline-none transition ${saveAttempted && !data.category.trim() ? "border-red-500 focus:border-red-400" : "border-white/[0.1] focus:border-violet-500/60"}`}
            >
              <option value="">Selecciona una categoría</option>
              {data.category &&
                !categories.some(
                  (category) => category.name === data.category,
                ) && <option value={data.category}>{data.category}</option>}
              {categories.map((category) => (
                <option key={category.id} value={category.name}>
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
      <div className="rounded-2xl border border-white/[0.07] bg-neutral-900/45 p-5 md:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-neutral-300">
              Ubicación en el mapa
            </h3>
            <p className="mt-1 text-xs text-neutral-500">
              Mueve el mapa debajo del puntero fijo para elegir la ubicación.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={useCurrentLocation}
              disabled={locating}
              className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-[10px] font-black uppercase text-violet-300 disabled:opacity-50"
            >
              <LocateFixed size={14} />{" "}
              {locating ? "Localizando..." : "Usar mi ubicación"}
            </button>
            <button
              type="button"
              onClick={toggleMapFullscreen}
              className="rounded-xl border border-white/10 bg-white/[0.05] p-2 text-neutral-300 hover:bg-white/10"
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
                <Minimize2 size={16} />
              ) : (
                <Maximize2 size={16} />
              )}
            </button>
          </div>
        </div>
        <div
          ref={mapElement}
          className="relative mb-5 h-72 overflow-hidden rounded-2xl border border-white/[0.08] bg-neutral-950 [&:fullscreen]:mb-0 [&:fullscreen]:h-screen [&:fullscreen]:rounded-none [&:fullscreen]:border-0"
          aria-label="Mapa interactivo de ubicación de la tienda"
        >
          <button
            type="button"
            onClick={toggleMapFullscreen}
            className="absolute right-4 top-4 z-[600] rounded-xl border border-white/20 bg-neutral-950/85 p-2 text-white shadow-lg backdrop-blur-md"
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
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-full text-violet-600 drop-shadow-[0_3px_4px_rgba(0,0,0,0.65)]">
            <MapPin
              size={42}
              fill="currentColor"
              stroke="white"
              strokeWidth={1.5}
            />
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <ConfiguracionField
            label="Latitud"
            value={data.latitude}
            onChange={(e) => update("latitude", e.target.value)}
            placeholder="Ej. 10.3910"
          />
          <ConfiguracionField
            label="Longitud"
            value={data.longitude}
            onChange={(e) => update("longitude", e.target.value)}
            placeholder="Ej. -75.4794"
          />
        </div>
      </div>
      <div className="rounded-2xl border border-white/[0.07] bg-neutral-900/45 p-5 md:p-6">
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
            onChange={(e) => updateMoney("delivery_fee_per_km", e.target.value)}
          />
          <ConfiguracionField
            label="Costo mínimo de domicilio"
            inputMode="numeric"
            value={formatThousands(data.min_delivery_fee)}
            onChange={(e) => updateMoney("min_delivery_fee", e.target.value)}
          />
          <ConfiguracionField
            label="Costo máximo de domicilio"
            inputMode="numeric"
            value={formatThousands(data.max_delivery_fee)}
            onChange={(e) => updateMoney("max_delivery_fee", e.target.value)}
          />
        </div>
      </div>
      <footer className="sticky bottom-4 z-10 flex items-center justify-between gap-4 rounded-2xl border border-violet-400/20 bg-neutral-950/95 p-4 shadow-xl backdrop-blur-md">
        <span className="text-xs text-emerald-300">{message}</span>
        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
        >
          <Save size={14} /> {saving ? "Guardando..." : "Guardar tienda"}
        </button>
      </footer>
    </section>
  );
};

export default ConfiguracionTienda;
