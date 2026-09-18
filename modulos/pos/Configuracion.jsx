import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
// Importamos todos los íconos necesarios para evitar fallos de renderizado
import {
  Settings,
  User,
  Store,
  Bell,
  Users,
  Save,
  Camera,
  X,
  Plus,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import ImageCropEditor from "./ImageCropEditor";

const Configuracion = () => {
  const location = useLocation();
  const routeSection = location.pathname.split("/").pop();
  const activeTab = ["tienda", "datos", "notificaciones"].includes(routeSection)
    ? routeSection
    : "tienda";

  return (
    // SE AGREGÓ 'font-sans' AQUÍ PARA IGUALAR LA TIPOGRAFÍA DE UTILIDADES
    <div className="min-h-screen bg-background text-white p-4 pt-6 sm:p-10 font-sans">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 md:mb-12 gap-4 md:gap-6">
          <div className="flex flex-col gap-1">
            {/* CORRECCIÓN: Título cambiado de 'Utilidades' a 'Configuración' */}
            <h1 className="text-2xl font-black tracking-tighter">
              Configuración
            </h1>
            <p className="text-xs text-neutral-500 max-w-xl">
              Administra tu perfil, la identidad de la tienda y el acceso del
              equipo.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-10 items-start">
          {/* Contenedor del Componente Activo */}
          <div className="bg-neutral-900/30 border border-white/[0.07] rounded-3xl p-6 md:p-10 backdrop-blur-md flex flex-col justify-between min-h-[520px]">
            {/* RENDERIZADO CONDICIONAL DE COMPONENTES */}
            <div>
              {activeTab === "tienda" && <ComponenteTienda />}
              {activeTab === "datos" && <ComponenteDatos />}
              {activeTab === "notificaciones" && <ComponenteNotificaciones />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================
   1. COMPONENTE GENERAL: Específico de los datos del usuario logueado
   ========================================================================== */
const ComponenteGeneral = () => {
  const [datosUsuario, setDatosUsuario] = useState({
    nombre: "",
    cargo: "",
    email: "",
    telefono: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id;
      if (!userId) {
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, role, email")
        .eq("id", userId)
        .maybeSingle();
      setDatosUsuario({
        nombre: profile?.full_name || "",
        cargo: profile?.role || "",
        email: profile?.email || data.user.email || "",
        telefono: "",
      });
      setLoading(false);
    };
    loadUser();
  }, []);

  const guardarUsuario = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data?.user?.id) return;
    setSaving(true);
    setMessage("");
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: datosUsuario.nombre.trim() })
      .eq("id", data.user.id);
    let saveError = error;
    if (
      !saveError &&
      datosUsuario.email &&
      datosUsuario.email !== data.user.email
    ) {
      const { error: authError } = await supabase.auth.updateUser({
        email: datosUsuario.email.trim(),
      });
      saveError = authError;
    }
    setMessage(saveError ? saveError.message : "Datos personales guardados");
    setSaving(false);
  };

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500">
      {loading && (
        <p className="text-xs text-neutral-500 mb-4">
          Cargando datos reales...
        </p>
      )}
      <div className="flex items-center gap-6 mb-10 pb-10 border-b border-white/[0.06]">
        <div className="relative group">
          <div className="w-24 h-24 rounded-2xl bg-neutral-900 border-2 border-dashed border-neutral-700 flex items-center justify-center overflow-hidden">
            <User size={40} className="text-neutral-700" />
          </div>
          <button className="absolute -bottom-2 -right-2 p-2 bg-violet-600 rounded-lg hover:bg-violet-500 transition-colors shadow-lg">
            <Camera size={16} />
          </button>
        </div>
        <div>
          <h3 className="text-lg font-bold  uppercase">Foto del Usuario</h3>
          <p className="text-neutral-500 text-xs mt-1">
            Avatar personal en el sistema
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <InputGroup
          label="Nombre del Usuario"
          placeholder="Juan Pérez"
          value={datosUsuario.nombre}
          onChange={(e) =>
            setDatosUsuario({ ...datosUsuario, nombre: e.target.value })
          }
        />
        <InputGroup
          label="Cargo / Rol"
          placeholder="Administrador de Turno"
          value={datosUsuario.cargo}
          onChange={(e) =>
            setDatosUsuario({ ...datosUsuario, cargo: e.target.value })
          }
        />
        <InputGroup
          label="Correo Electrónico"
          placeholder="juan.perez@gloto.com"
          type="email"
          value={datosUsuario.email}
          onChange={(e) =>
            setDatosUsuario({ ...datosUsuario, email: e.target.value })
          }
        />
        <InputGroup
          label="Teléfono de Contacto"
          placeholder="300 123 4567"
          value={datosUsuario.telefono}
          onChange={(e) =>
            setDatosUsuario({ ...datosUsuario, telefono: e.target.value })
          }
        />
      </div>
      <div className="mt-8 flex items-center justify-between gap-4">
        <p className="text-xs text-neutral-400">{message}</p>
        <button
          onClick={guardarUsuario}
          disabled={saving || loading}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px]"
        >
          <Save size={14} /> {saving ? "Guardando..." : "Guardar usuario"}
        </button>
      </div>
    </div>
  );
};

/* ==========================================================================
   2. COMPONENTE TIENDA: Información comercial y operativa del restaurante
   ========================================================================== */
const ComponenteTienda = () => {
  const [datosTienda, setDatosTienda] = useState({
    nombreNegocio: "",
    direccion: "",
    whatsappPedidos: "",
    moneda: "COP",
    impuesto: "",
    tiempoEntregaMin: "",
    tiempoEntregaMax: "",
    tarifaDomicilio: "",
    minimoDomicilioGratis: "",
    categoria: "",
    latitud: "",
    longitud: "",
    costoPorKilometro: "",
    tarifaMinimaDomicilio: "",
    tarifaMaximaDomicilio: "",
    porcentajeNocturno: "",
    whatsappRed: "",
    facebook: "",
    tiktok: "",
    instagram: "",
  });

  const [customRedes, setCustomRedes] = useState([]);
  const [businessId, setBusinessId] = useState(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const logoInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [imageEditor, setImageEditor] = useState(null);

  useEffect(() => {
    const loadBusiness = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) {
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (!profile?.business_id) {
        setLoading(false);
        return;
      }
      setBusinessId(profile.business_id);
      const [{ data: business }, { data: info }] = await Promise.all([
        supabase
          .from("businesses")
          .select("name, logo_url, cover_url")
          .eq("id", profile.business_id)
          .maybeSingle(),
        supabase
          .from("business_info")
          .select("*")
          .eq("business_id", profile.business_id)
          .maybeSingle(),
      ]);
      setDatosTienda((current) => ({
        ...current,
        nombreNegocio: business?.name || "",
        direccion: info?.address || "",
        whatsappPedidos: info?.whatsapp_phone || "",
        moneda: info?.currency || "COP",
        impuesto: info?.tax_rate ?? "",
        tiempoEntregaMin: info?.delivery_time_min ?? "",
        tiempoEntregaMax: info?.delivery_time_max ?? "",
        tarifaDomicilio: info?.delivery_fee ?? "",
        minimoDomicilioGratis: info?.free_delivery_min_order ?? "",
        categoria: info?.categoria || "",
        latitud: info?.latitude ?? info?.latitud ?? "",
        longitud: info?.longitude ?? info?.longitud ?? "",
      }));
      setLogoUrl(business?.logo_url || "");
      setCoverUrl(business?.cover_url || "");
      setLoading(false);
    };
    loadBusiness();
  }, []);

  const guardarTienda = async () => {
    if (!businessId) return;
    setSaving(true);
    setMessage("");
    const { error: businessError } = await supabase
      .from("businesses")
      .update({ name: datosTienda.nombreNegocio.trim() })
      .eq("id", businessId);
    const { error: infoError } = await supabase.from("business_info").upsert(
      {
        business_id: businessId,
        address: datosTienda.direccion.trim(),
        currency: datosTienda.moneda.trim().toUpperCase(),
        tax_rate: Number(datosTienda.impuesto) || 0,
        delivery_time_min: Number(datosTienda.tiempoEntregaMin) || 0,
        delivery_time_max: Number(datosTienda.tiempoEntregaMax) || 0,
        delivery_fee: Number(datosTienda.tarifaDomicilio) || 0,
        free_delivery_min_order: Number(datosTienda.minimoDomicilioGratis) || 0,
        categoria: datosTienda.categoria.trim(),
        whatsapp_phone: datosTienda.whatsappPedidos.trim(),
      },
      { onConflict: "business_id" },
    );
    const error = businessError || infoError;
    setMessage(error ? error.message : "Datos de tienda guardados");
    setSaving(false);
  };

  const subirImagenNegocio = async (event, tipo) => {
    const file = event.target.files?.[0];
    if (!file || !businessId) return;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      setMessage("La imagen debe ser JPG, PNG o WEBP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage("La imagen no puede superar 5 MB.");
      return;
    }

    setImageEditor({
      file,
      url: URL.createObjectURL(file),
      tipo,
      zoom: 1,
      offsetX: 50,
      offsetY: 50,
    });
    event.target.value = "";
  };

  const confirmarImagenNegocio = async () => {
    if (!imageEditor || !businessId) return;
    setSaving(true);
    setMessage("");
    const { tipo, zoom, offsetX, offsetY } = imageEditor;
    const image = new Image();
    image.src = imageEditor.url;
    await new Promise((resolve) => {
      image.onload = resolve;
      image.onerror = resolve;
    });

    const width = tipo === "logo" ? 800 : 1600;
    const height = tipo === "logo" ? 800 : 900;
    const scale =
      Math.max(width / image.naturalWidth, height / image.naturalHeight) * zoom;
    const renderedWidth = image.naturalWidth * scale;
    const renderedHeight = image.naturalHeight * scale;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    const maxOffsetX = Math.max(0, renderedWidth - width);
    const maxOffsetY = Math.max(0, renderedHeight - height);
    context.drawImage(
      image,
      -(maxOffsetX * (offsetX / 100)),
      -(maxOffsetY * (offsetY / 100)),
      renderedWidth,
      renderedHeight,
    );

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.9),
    );
    if (!blob) {
      setMessage("No se pudo preparar la imagen.");
      setSaving(false);
      return;
    }

    const path = `${businessId}/${tipo}-${Date.now()}.webp`;
    const { error: uploadError } = await supabase.storage
      .from("business-assets")
      .upload(path, blob, { contentType: "image/webp", upsert: false });

    if (uploadError) {
      setMessage(uploadError.message);
      setSaving(false);
      return;
    }

    const { data: publicData } = supabase.storage
      .from("business-assets")
      .getPublicUrl(path);
    const publicUrl = publicData?.publicUrl;
    const column = tipo === "logo" ? "logo_url" : "cover_url";
    const { error: updateError } = await supabase
      .from("businesses")
      .update({ [column]: publicUrl })
      .eq("id", businessId);

    if (updateError) setMessage(updateError.message);
    else {
      if (tipo === "logo") setLogoUrl(publicUrl);
      else setCoverUrl(publicUrl);
      setMessage(
        `${tipo === "logo" ? "Logo" : "Portada"} actualizado correctamente`,
      );
    }
    setSaving(false);
    URL.revokeObjectURL(imageEditor.url);
    setImageEditor(null);
  };

  const manejarCambioFijo = (campo, valor) => {
    setDatosTienda({ ...datosTienda, [campo]: valor });
  };

  const agregarRedSocial = () => {
    setCustomRedes([
      ...customRedes,
      { id: Date.now(), plataforma: "", url: "" },
    ]);
  };

  const eliminarRedSocial = (id) => {
    setCustomRedes(customRedes.filter((red) => red.id !== id));
  };

  const manejarCambioCustom = (id, campo, valor) => {
    setCustomRedes(
      customRedes.map((red) =>
        red.id === id ? { ...red, [campo]: valor } : red,
      ),
    );
  };

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-10">
      {loading && (
        <p className="text-xs text-neutral-500">Cargando tienda real...</p>
      )}
      {/* Identidad y Ubicación del Negocio */}
      <div>
        <div className="flex items-center gap-6 mb-10 pb-10 border-b border-white/[0.06]">
          <div className="relative group">
            <div className="w-24 h-24 rounded-2xl bg-neutral-900 border-2 border-dashed border-neutral-700 flex items-center justify-center overflow-hidden">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`Logo de ${datosTienda.nombreNegocio || "la tienda"}`}
                  className="w-full h-full object-contain p-2"
                  onError={() => setLogoUrl("")}
                />
              ) : (
                <Store size={40} className="text-neutral-700" />
              )}
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => subirImagenNegocio(event, "logo")}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={saving || loading}
              className="absolute -bottom-2 -right-2 p-2 bg-violet-600 rounded-lg hover:bg-violet-500 disabled:opacity-40 transition-colors shadow-lg"
              title="Subir logo"
            >
              <Camera size={16} />
            </button>
          </div>
          <div>
            <h3 className="text-lg font-bold  uppercase">
              Logotipo del Negocio
            </h3>
            <p className="text-neutral-500 text-xs mt-1">
              Se mostrará en el menú digital y facturas
            </p>
          </div>
        </div>

        <div className="mb-10 rounded-2xl overflow-hidden border border-white/[0.08] bg-neutral-900">
          <div className="relative h-40 sm:h-52">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={`Portada de ${datosTienda.nombreNegocio || "la tienda"}`}
                className="w-full h-full object-cover"
                onError={() => setCoverUrl("")}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs uppercase tracking-widest text-neutral-600">
                Sin portada configurada
              </div>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => subirImagenNegocio(event, "cover")}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              disabled={saving || loading}
              className="absolute right-4 bottom-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-black/70 text-white text-[10px] font-black uppercase disabled:opacity-40"
            >
              <Camera size={14} /> Cambiar portada
            </button>
          </div>
          <div className="px-4 py-3 text-[10px] text-neutral-500 uppercase tracking-wider">
            Portada pública mostrada en Shop
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <InputGroup
            label="Nombre del Negocio"
            placeholder="Gloto Grill & Bar"
            value={datosTienda.nombreNegocio}
            onChange={(e) => manejarCambioFijo("nombreNegocio", e.target.value)}
          />
          <InputGroup
            label="Dirección Física"
            placeholder="Calle 10 # 4-25, Zona Centro"
            value={datosTienda.direccion}
            onChange={(e) => manejarCambioFijo("direccion", e.target.value)}
          />
          <InputGroup
            label="WhatsApp para recibir Pedidos"
            placeholder="Ej: 573001234567"
            type="tel"
            value={datosTienda.whatsappPedidos}
            onChange={(e) =>
              manejarCambioFijo("whatsappPedidos", e.target.value)
            }
          />
        </div>

        <div className="mt-10 pt-8 border-t border-white/[0.06] space-y-6">
          <div>
            <h4 className="text-sm font-black uppercase text-neutral-400 tracking-wider">
              Datos comerciales
            </h4>
            <p className="text-neutral-500 text-xs mt-1">
              Información pública usada por la tienda y el cálculo de
              domicilios.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <InputGroup
              label="Moneda"
              placeholder="COP"
              value={datosTienda.moneda}
              onChange={(e) => manejarCambioFijo("moneda", e.target.value)}
            />
            <InputGroup
              label="Categoría de la tienda"
              placeholder="Cafetería"
              value={datosTienda.categoria}
              onChange={(e) => manejarCambioFijo("categoria", e.target.value)}
            />
            <InputGroup
              label="Impuesto (%)"
              type="number"
              value={datosTienda.impuesto}
              onChange={(e) => manejarCambioFijo("impuesto", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <InputGroup
              label="Tiempo mínimo de entrega (minutos)"
              type="number"
              value={datosTienda.tiempoEntregaMin}
              onChange={(e) =>
                manejarCambioFijo("tiempoEntregaMin", e.target.value)
              }
            />
            <InputGroup
              label="Tiempo máximo de entrega (minutos)"
              type="number"
              value={datosTienda.tiempoEntregaMax}
              onChange={(e) =>
                manejarCambioFijo("tiempoEntregaMax", e.target.value)
              }
            />
            <InputGroup
              label="Tarifa de domicilio (COP)"
              type="number"
              value={datosTienda.tarifaDomicilio}
              onChange={(e) =>
                manejarCambioFijo("tarifaDomicilio", e.target.value)
              }
            />
            <InputGroup
              label="Mínimo para domicilio gratis (COP)"
              type="number"
              value={datosTienda.minimoDomicilioGratis}
              onChange={(e) =>
                manejarCambioFijo("minimoDomicilioGratis", e.target.value)
              }
            />
          </div>
        </div>
      </div>

      {/* Geolocalización (Coordenadas Exactas) */}
      <div className="pt-10 border-t border-white/[0.06]">
        <div className="mb-4">
          <h4 className="text-sm font-black uppercase text-neutral-400 tracking-wider">
            Geolocalización del Negocio
          </h4>
          <p className="text-neutral-500 text-xs mt-0.5">
            Coordenadas geográficas para ubicar tu restaurante exactamente en el
            mapa.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <InputGroup
            label="Latitud"
            placeholder="Ej: 7.89391"
            value={datosTienda.latitud}
            onChange={(e) => manejarCambioFijo("latitud", e.target.value)}
          />
          <InputGroup
            label="Longitud"
            placeholder="Ej: -72.50782"
            value={datosTienda.longitud}
            onChange={(e) => manejarCambioFijo("longitud", e.target.value)}
          />
        </div>
      </div>

      {/* Canales Digitales y Redes Sociales */}
      <div className="pt-10 border-t border-white/[0.06] space-y-8">
        <div>
          <h4 className="text-sm font-black uppercase text-neutral-400 tracking-wider">
            Canales Digitales y Enlaces
          </h4>
          <p className="text-neutral-500 text-xs mt-0.5">
            Configura los accesos directos para que tus clientes te contacten o
            sigan.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <InputGroup
            label="Enlace de WhatsApp (Link de perfil público)"
            placeholder="https://wa.me/57300..."
            value={datosTienda.whatsappRed}
            onChange={(e) => manejarCambioFijo("whatsappRed", e.target.value)}
          />
          <InputGroup
            label="Enlace de Facebook"
            placeholder="https://facebook.com/tunegocio"
            value={datosTienda.facebook}
            onChange={(e) => manejarCambioFijo("facebook", e.target.value)}
          />
          <InputGroup
            label="Enlace de TikTok"
            placeholder="https://tiktok.com/@tunegocio"
            value={datosTienda.tiktok}
            onChange={(e) => manejarCambioFijo("tiktok", e.target.value)}
          />
          <InputGroup
            label="Enlace de Instagram"
            placeholder="https://instagram.com/tunegocio"
            value={datosTienda.instagram}
            onChange={(e) => manejarCambioFijo("instagram", e.target.value)}
          />
        </div>

        {customRedes.length > 0 && (
          <div className="space-y-4 pt-2 animate-in fade-in duration-300">
            <label className="text-[10px] font-black uppercase text-neutral-500 tracking-widest ml-1 block">
              Redes adicionales añadidas
            </label>
            {customRedes.map((red) => (
              <div
                key={red.id}
                className="flex gap-4 items-end bg-white/[0.01] border border-white/[0.04] p-4 rounded-2xl relative group"
              >
                <div className="w-1/3">
                  <label className="text-[9px] font-black uppercase text-neutral-600 tracking-wider block mb-1">
                    Plataforma (Ej: Twitter / X, Web)
                  </label>
                  <input
                    type="text"
                    placeholder="Twitter"
                    value={red.plataforma}
                    onChange={(e) =>
                      manejarCambioCustom(red.id, "plataforma", e.target.value)
                    }
                    className="w-full bg-neutral-900/50 border border-white/[0.1] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500/50 text-white"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[9px] font-black uppercase text-neutral-600 tracking-wider block mb-1">
                    URL del perfil o enlace
                  </label>
                  <input
                    type="text"
                    placeholder="https://x.com/tunegocio"
                    value={red.url}
                    onChange={(e) =>
                      manejarCambioCustom(red.id, "url", e.target.value)
                    }
                    className="w-full bg-neutral-900/50 border border-white/[0.1] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500/50 text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => eliminarRedSocial(red.id)}
                  className="bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white p-3 rounded-xl transition-all duration-200"
                  title="Eliminar esta red"
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="pt-2">
          <button
            type="button"
            onClick={agregarRedSocial}
            className="inline-flex items-center gap-2 border border-dashed border-violet-500/40 hover:border-violet-500 bg-violet-600/5 hover:bg-violet-600/10 text-violet-400 text-xs font-bold uppercase tracking-wider px-5 py-3 rounded-xl transition-all duration-300"
          >
            <Plus size={16} />
            Añadir otra red social
          </button>
        </div>
      </div>

      <div className="pt-6 border-t border-white/[0.06] flex items-center justify-between gap-4">
        <p className="text-xs text-neutral-400">{message}</p>
        <button
          onClick={guardarTienda}
          disabled={saving || loading || !businessId}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px]"
        >
          <Save size={14} /> {saving ? "Guardando..." : "Guardar tienda"}
        </button>
      </div>

      <ImageCropEditor
        imageEditor={imageEditor}
        setImageEditor={setImageEditor}
        onConfirm={confirmarImagenNegocio}
        saving={saving}
      />
    </div>
  );
};

/* ==========================================================================
   3. COMPONENTE DATOS: Contacto, dirección, redes y canales del negocio
   ========================================================================== */
const ComponenteDatos = () => {
  const [datosTienda, setDatosTienda] = useState({
    direccion: "",
    whatsappPedidos: "",
    catalago: "",
    latitud: "",
    longitud: "",
    whatsappRed: "",
    facebook: "",
    tiktok: "",
    instagram: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [customRedes, setCustomRedes] = useState([]);

  useEffect(() => {
    const loadBusinessData = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (!profile?.business_id) {
        setLoading(false);
        return;
      }

      const { data: info } = await supabase
        .from("business_info")
        .select(
          "address, whatsapp_phone, latitude, longitude, whatsapp_link, facebook, tiktok, instagram",
        )
        .eq("business_id", profile.business_id)
        .maybeSingle();

      setDatosTienda({
        direccion: info?.address || "",
        whatsappPedidos: info?.whatsapp_phone || "",
        latitud: info?.latitude ?? "",
        longitud: info?.longitude ?? "",
        whatsappRed: info?.whatsapp_link || "",
        facebook: info?.facebook || "",
        tiktok: info?.tiktok || "",
        instagram: info?.instagram || "",
      });
      setLoading(false);
    };

    loadBusinessData();
  }, []);

  const manejarCambio = (campo, valor) => {
    setDatosTienda((prev) => ({ ...prev, [campo]: valor }));
  };

  const guardarDatos = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("business_id")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!profile?.business_id) return;

    setSaving(true);
    setMessage("");

    const { error } = await supabase.from("business_info").upsert(
      {
        business_id: profile.business_id,
        address: datosTienda.direccion.trim(),
        whatsapp_phone: datosTienda.whatsappPedidos.trim(),
        latitude: datosTienda.latitud ? Number(datosTienda.latitud) : null,
        longitude: datosTienda.longitud ? Number(datosTienda.longitud) : null,
        whatsapp_link: datosTienda.whatsappRed.trim(),
        facebook: datosTienda.facebook.trim(),
        tiktok: datosTienda.tiktok.trim(),
        instagram: datosTienda.instagram.trim(),
      },
      { onConflict: "business_id" },
    );

    setMessage(error ? error.message : "Datos actualizados correctamente");
    setSaving(false);
  };

  const agregarRedSocial = () => {
    setCustomRedes((prev) => [
      ...prev,
      { id: Date.now(), plataforma: "", url: "" },
    ]);
  };

  const eliminarRedSocial = (id) => {
    setCustomRedes((prev) => prev.filter((red) => red.id !== id));
  };

  const manejarCambioCustom = (id, campo, valor) => {
    setCustomRedes((prev) =>
      prev.map((red) => (red.id === id ? { ...red, [campo]: valor } : red)),
    );
  };

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-10">
      {loading && (
        <p className="text-xs text-neutral-500">Cargando datos reales...</p>
      )}

      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-black uppercase text-neutral-400 tracking-wider">
            Datos del negocio
          </h3>
          <p className="text-neutral-500 text-xs mt-1">
            Aquí gestionas la información de contacto, domicilio y enlaces con
            tus clientes.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <InputGroup
            label="Domicilio físico"
            placeholder="Calle 10 # 4-25, Zona Centro"
            value={datosTienda.direccion}
            onChange={(e) => manejarCambio("direccion", e.target.value)}
          />
          <InputGroup
            label="WhatsApp de pedidos"
            placeholder="573001234567"
            type="tel"
            value={datosTienda.whatsappPedidos}
            onChange={(e) => manejarCambio("whatsappPedidos", e.target.value)}
          />
        </div>
      </div>

      <div className="pt-10 border-t border-white/[0.06] space-y-6">
        <div>
          <h4 className="text-sm font-black uppercase text-neutral-400 tracking-wider">
            Mapa y localización
          </h4>
          <p className="text-neutral-500 text-xs mt-1">
            Coordenadas exactas para ubicar la tienda en el mapa de pedidos.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <InputGroup
            label="Latitud"
            placeholder="Ej: 7.89391"
            value={datosTienda.latitud}
            onChange={(e) => manejarCambio("latitud", e.target.value)}
          />
          <InputGroup
            label="Longitud"
            placeholder="Ej: -72.50782"
            value={datosTienda.longitud}
            onChange={(e) => manejarCambio("longitud", e.target.value)}
          />
        </div>
      </div>

      <div className="pt-10 border-t border-white/[0.06] space-y-8">
        <div>
          <h4 className="text-sm font-black uppercase text-neutral-400 tracking-wider">
            Canales, enlaces y redes sociales
          </h4>
          <p className="text-neutral-500 text-xs mt-1">
            Configura los enlaces con los que tus clientes pueden contactarte,
            seguirte o pedir.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <InputGroup
            label="WhatsApp público"
            placeholder="https://wa.me/57300..."
            value={datosTienda.whatsappRed}
            onChange={(e) => manejarCambio("whatsappRed", e.target.value)}
          />
          <InputGroup
            label="Facebook"
            placeholder="https://facebook.com/tunegocio"
            value={datosTienda.facebook}
            onChange={(e) => manejarCambio("facebook", e.target.value)}
          />
          <InputGroup
            label="TikTok"
            placeholder="https://tiktok.com/@tunegocio"
            value={datosTienda.tiktok}
            onChange={(e) => manejarCambio("tiktok", e.target.value)}
          />
          <InputGroup
            label="Instagram"
            placeholder="https://instagram.com/tunegocio"
            value={datosTienda.instagram}
            onChange={(e) => manejarCambio("instagram", e.target.value)}
          />
        </div>

        {customRedes.length > 0 && (
          <div className="space-y-4 pt-2 animate-in fade-in duration-300">
            <label className="text-[10px] font-black uppercase text-neutral-500 tracking-widest ml-1 block">
              Redes adicionales
            </label>
            {customRedes.map((red) => (
              <div
                key={red.id}
                className="flex gap-4 items-end bg-white/[0.01] border border-white/[0.04] p-4 rounded-2xl relative group"
              >
                <div className="w-1/3">
                  <label className="text-[9px] font-black uppercase text-neutral-600 tracking-wider block mb-1">
                    Plataforma
                  </label>
                  <input
                    type="text"
                    placeholder="Twitter"
                    value={red.plataforma}
                    onChange={(e) =>
                      manejarCambioCustom(red.id, "plataforma", e.target.value)
                    }
                    className="w-full bg-neutral-900/50 border border-white/[0.1] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500/50 text-white"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[9px] font-black uppercase text-neutral-600 tracking-wider block mb-1">
                    URL del enlace
                  </label>
                  <input
                    type="text"
                    placeholder="https://x.com/tunegocio"
                    value={red.url}
                    onChange={(e) =>
                      manejarCambioCustom(red.id, "url", e.target.value)
                    }
                    className="w-full bg-neutral-900/50 border border-white/[0.1] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500/50 text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => eliminarRedSocial(red.id)}
                  className="bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white p-3 rounded-xl transition-all duration-200"
                  title="Eliminar esta red"
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="pt-2">
          <button
            type="button"
            onClick={agregarRedSocial}
            className="inline-flex items-center gap-2 border border-dashed border-violet-500/40 hover:border-violet-500 bg-violet-600/5 hover:bg-violet-600/10 text-violet-400 text-xs font-bold uppercase tracking-wider px-5 py-3 rounded-xl transition-all duration-300"
          >
            <Plus size={16} />
            Añadir otra red social
          </button>
        </div>
      </div>

      <div className="pt-6 border-t border-white/[0.06] flex items-center justify-between gap-4">
        <p className="text-xs text-neutral-400">{message}</p>
        <button
          onClick={guardarDatos}
          disabled={saving || loading}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px]"
        >
          <Save size={14} /> {saving ? "Guardando..." : "Guardar datos"}
        </button>
      </div>
    </div>
  );
};

/* ==========================================================================
   3. COMPONENTE NOTIFICACIONES: Alertas de sonido, pedidos y caja
   ========================================================================== */
const ComponenteNotificaciones = () => {
  const [notifs, setNotifs] = useState({
    comandas: true,
    stock: false,
    caja: true,
  });

  const toggleNotif = (key) => setNotifs({ ...notifs, [key]: !notifs[key] });

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-4">
      <h3 className="text-sm font-black uppercase text-neutral-400 tracking-wider mb-4">
        Preferencias de Alertas del Sistema
      </h3>

      <ToggleRow
        title="Nuevas Comandas (KDS)"
        description="Emitir sonido y alerta visual cuando ingrese un pedido a cocina."
        active={notifs.comandas}
        onToggle={() => toggleNotif("comandas")}
      />
      <ToggleRow
        title="Alertas de Stock Crítico"
        description="Notificar cuando un insumo o producto baje de su inventario mínimo."
        active={notifs.stock}
        onToggle={() => toggleNotif("stock")}
      />
      <ToggleRow
        title="Aperturas y Arqueos de Caja"
        description="Enviar un aviso al correo principal al cerrar la caja del turno."
        active={notifs.caja}
        onToggle={() => toggleNotif("caja")}
      />
    </div>
  );
};

/* ==========================================================================
   4. COMPONENTE USUARIOS: Gestión interna de cuentas de empleados
   ========================================================================== */
const ComponenteUsuarios = () => {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUsers = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", userId)
        .maybeSingle();
      if (!profile?.business_id) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, username, role")
        .eq("business_id", profile.business_id)
        .order("full_name", { ascending: true });
      setUsuarios(data || []);
      setLoading(false);
    };
    loadUsers();
  }, []);

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-black uppercase text-neutral-400 tracking-wider">
          Administración de Personal de Cocina y Salón
        </h3>
      </div>
      <div className="border border-white/[0.06] bg-neutral-900/20 rounded-2xl overflow-hidden text-xs">
        <div className="grid grid-cols-3 p-3 bg-white/5 font-black text-neutral-400 uppercase tracking-widest border-b border-white/[0.06]">
          <span>Nombre</span>
          <span>Rol</span>
          <span>Estado</span>
        </div>
        {loading ? (
          <p className="p-4 text-neutral-500">Cargando usuarios reales...</p>
        ) : usuarios.length === 0 ? (
          <p className="p-4 text-neutral-500">No hay usuarios registrados.</p>
        ) : (
          usuarios.map((usuario) => (
            <div
              key={usuario.id}
              className="grid grid-cols-3 p-3 border-b border-white/[0.04]"
            >
              <span className="font-bold">
                {usuario.full_name || usuario.username || "Sin nombre"}
              </span>
              <span className="text-violet-400">
                {usuario.role || "Sin rol"}
              </span>
              <span className="text-emerald-400 font-bold">Activo</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

/* ==========================================================================
   COMPONENTES COMPARTIDOS / ATÓMICOS (HELPERS)
   ========================================================================== */
const InputGroup = ({
  label,
  placeholder,
  type = "text",
  value,
  onChange,
  disabled = false,
}) => (
  <div className="flex flex-col gap-2 w-full">
    <label className="text-[10px] font-black uppercase text-neutral-500 tracking-widest ml-1">
      {label}
    </label>
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="bg-neutral-900/50 border border-white/[0.1] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500/50 transition-colors text-white placeholder:text-neutral-700 w-full"
    />
  </div>
);

const ToggleRow = ({ title, description, active, onToggle }) => (
  <div className="flex items-center justify-between p-4 bg-white/[0.01] rounded-2xl border border-white/[0.04]">
    <div>
      <p className="text-xs font-bold uppercase tracking-wide">{title}</p>
      <p className="text-neutral-500 text-[11px] mt-0.5">{description}</p>
    </div>
    <button
      type="button"
      onClick={onToggle}
      className={`w-10 h-5 rounded-full p-0.5 relative transition-colors duration-300 flex-shrink-0 ${
        active ? "bg-violet-600" : "bg-neutral-800"
      }`}
    >
      <div
        className={`w-4 h-4 bg-white rounded-full transition-transform duration-300 transform ${
          active ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  </div>
);

export default Configuracion;
