// SuperAdmin.jsx
// Panel de control para administrar todas las tiendas del sistema
// (crear, editar, activar/desactivar, eliminar).
//
// IMPORTANTE: por ahora no hay backend, así que los datos se guardan en
// localStorage para que no se pierdan al recargar la página. Cuando
// conectes una base de datos real (Supabase, Firebase, API propia),
// solo hay que reemplazar las funciones `cargarTiendas` / `guardarTiendas`
// por llamadas a tu API — el resto del componente no debería cambiar.

import React, { useState, useEffect, useMemo } from "react";
import {
  ChevronLeft,
  Store,
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  Power,
  Building2,
  CheckCircle2,
  XCircle,
  Phone,
  Tag,
  Rocket,
  Zap,
  Crown,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import CrearTiendaWizard from "./CrearTiendaWizard";
import SuperAdminSidebar from "./SuperAdminSidebar";
import SuperAdminStatCard from "./SuperAdminStatCard";
import SuperAdminToggle from "./SuperAdminToggle";

const STORAGE_KEY = "superadmin_tiendas";

const CATEGORIAS = [
  "Restaurante",
  "Comida rápida",
  "Cafetería",
  "Panadería",
  "Tienda",
  "Otro",
];

const fmtCOP = (n) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(n);

const PLANES = [
  {
    id: "inicial",
    name: "Inicial",
    icon: Rocket,
    description: "Hasta 800 ticket pos / mes * pdv",
    priceMonthly: 100000,
    pricePeriod: 300000,
    periodLabel: "por 3 meses",
    isCommission: false,
    color: "#a78bfa",
  },
  {
    id: "pro",
    name: "Pro",
    icon: Zap,
    description: "Hasta 2,000 ticket pos / mes * pdv",
    priceMonthly: 150000,
    pricePeriod: 450000,
    periodLabel: "por 3 meses",
    isCommission: false,
    color: "#7c3aed",
  },
  {
    id: "premium",
    name: "Premium",
    icon: Crown,
    description: "Sin límites de tickets",
    priceMonthly: 250000,
    pricePeriod: 250000,
    isCommission: true,
    commissionText: "0.25%",
    subText: "de ventas netas (mín. $250,000 x PDV)",
    color: "#fbbf24",
  },
];

const planPorId = (id) => PLANES.find((p) => p.id === id) || PLANES[0];

// ── Utilidades ──────────────────────────────────────────────

const slugify = (texto) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const generarEmailAdmin = (slug) => {
  const base = slugify(slug || "tienda")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 4)}`;
  return `${base || "tienda"}-${unique}@gloto.com`;
};

const crearTiendaEnSupabase = async ({ nombre, slug, activo }) => {
  try {
    const { data, error } = await supabase
      .from("businesses")
      .insert({
        name: nombre,
        slug,
        is_active: activo,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("No se pudo crear la tienda en Supabase:", error);
    return null;
  }
};

const signUpWithRetry = async (
  { email, password, options },
  attempts = 3,
  delayMs = 5000,
) => {
  let lastError = null;

  for (let i = 0; i < attempts; i += 1) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options,
    });

    if (!error) return { data };

    lastError = error;
    const isRateLimit =
      error.status === 429 || /rate limit/i.test(error.message || "");
    if (!isRateLimit) break;

    if (i < attempts - 1) {
      await sleep(delayMs);
    }
  }

  throw lastError;
};

const crearUsuarioAdministrador = async ({ businessId, slug, nombre }) => {
  const email = generarEmailAdmin(slug);
  const password = "123456";

  const { data, error } = await signUpWithRetry({
    email,
    password,
    options: {
      data: {
        business_id: businessId,
        role: "admin",
        business_name: nombre,
      },
    },
  });

  if (error) throw error;

  if (!data?.user?.id) {
    throw new Error("No se pudo crear el usuario en Auth");
  }

  const payload = {
    id: data.user.id,
    username: email,
    email,
    role: "admin",
    business_id: businessId,
  };

  const { error: profileError } = await supabase
    .from("profiles")
    .insert(payload);

  if (profileError) {
    console.error("No se pudo crear el profile del usuario:", profileError);
    throw profileError;
  }

  return { email, password, userId: data.user.id };
};

const tiendaVacia = () => ({
  id: null,
  nombre: "",
  slug: "",
  categoria: CATEGORIAS[0],
  telefono: "",
  descripcion: "",
  activo: true,
  plan: "inicial",
});

// Datos de ejemplo, solo para que el panel no se vea vacío la primera vez.
const SEED_TIENDAS = [
  {
    id: uid(),
    nombre: "Sushi Roll Express",
    slug: "sushi-roll-express",
    categoria: "Restaurante",
    telefono: "+573001234567",
    descripcion: "Sushi y comida japonesa a domicilio.",
    activo: true,
    plan: "pro",
    creadoEn: Date.now() - 1000 * 60 * 60 * 24 * 30,
  },
  {
    id: uid(),
    nombre: "La Burguesía",
    slug: "la-burguesia",
    categoria: "Comida rápida",
    telefono: "+573009876543",
    descripcion: "Hamburguesas artesanales.",
    activo: true,
    plan: "inicial",
    creadoEn: Date.now() - 1000 * 60 * 60 * 24 * 12,
  },
  {
    id: uid(),
    nombre: "Café Andino",
    slug: "cafe-andino",
    categoria: "Cafetería",
    telefono: "+573004445566",
    descripcion: "Café de origen colombiano.",
    activo: false,
    plan: "premium",
    creadoEn: Date.now() - 1000 * 60 * 60 * 24 * 3,
  },
];

const cargarTiendas = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_TIENDAS));
      return SEED_TIENDAS;
    }
    const parsed = JSON.parse(raw);
    // Compatibilidad: tiendas guardadas antes de añadir el campo "plan"
    return parsed.map((t) => ({ plan: "inicial", ...t }));
  } catch {
    return SEED_TIENDAS;
  }
};

const guardarTiendas = (tiendas) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tiendas));
  } catch {
    // Si localStorage falla (ej. modo incógnito sin soporte), no rompemos la app.
  }
};

// ── Subcomponentes ──────────────────────────────────────────

// ── Componente principal ────────────────────────────────────

const SuperAdmin = ({ onVolver }) => {
  const [tiendas, setTiendas] = useState([]);
  const [cargado, setCargado] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todas"); // todas | activas | inactivas

  const [modalAbierto, setModalAbierto] = useState(false);
  const [tiendaEditando, setTiendaEditando] = useState(null); // null = creando nueva
  const [form, setForm] = useState(tiendaVacia());
  const [slugManual, setSlugManual] = useState(false); // si el usuario editó el slug a mano
  const [mostrarWizard, setMostrarWizard] = useState(false);
  const [vistaCreacion, setVistaCreacion] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState({ tipo: "", texto: "" });
  const [progresoCreacion, setProgresoCreacion] = useState({
    activo: false,
    pasos: [],
  });
  const [categoriasMaestras, setCategoriasMaestras] = useState([]);
  const [cargandoCategorias, setCargandoCategorias] = useState(true);
  const [guardandoCategoria, setGuardandoCategoria] = useState(null);
  const [promocionesPendientes, setPromocionesPendientes] = useState([]);
  const [cargandoPromociones, setCargandoPromociones] = useState(true);
  const [confirmandoPromocion, setConfirmandoPromocion] = useState(null);
  const [activeSection, setActiveSection] = useState("resumen");

  const [tiendaAEliminar, setTiendaAEliminar] = useState(null);
  const navigate = useNavigate();

  // Cargar desde localStorage al montar
  useEffect(() => {
    setTiendas(cargarTiendas());
    setCargado(true);
  }, []);

  useEffect(() => {
    const cargarPromocionesPendientes = async () => {
      const { data, error } = await supabase
        .from("promotions")
        .select(
          "id,business_id,tag,title,offer_text,payment_status,created_at,businesses(name)",
        )
        .eq("payment_status", "pending")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("No se pudieron cargar promociones pendientes:", error);
        setPromocionesPendientes([]);
      } else {
        setPromocionesPendientes(data || []);
      }
      setCargandoPromociones(false);
    };

    cargarPromocionesPendientes();
  }, []);

  // Guardar cada vez que cambien las tiendas (después de la carga inicial)
  useEffect(() => {
    if (cargado) guardarTiendas(tiendas);
  }, [tiendas, cargado]);

  useEffect(() => {
    const cargarCategoriasMaestras = async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name,icon_url")
        .order("name", { ascending: true });

      if (error) {
        console.error("No se pudieron cargar las categorías maestras:", error);
        setCategoriasMaestras([]);
      } else {
        const unicas = Array.from(
          new Map(
            (data || [])
              .filter((categoria) => categoria.name?.trim())
              .map((categoria) => [
                categoria.name.trim().toLowerCase(),
                categoria,
              ]),
          ).values(),
        );
        setCategoriasMaestras(unicas);
      }
      setCargandoCategorias(false);
    };

    cargarCategoriasMaestras();
  }, []);

  const tiendasFiltradas = useMemo(() => {
    return tiendas
      .filter((t) => {
        if (filtroEstado === "activas") return t.activo;
        if (filtroEstado === "inactivas") return !t.activo;
        return true;
      })
      .filter((t) =>
        busqueda
          ? t.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
            t.slug.toLowerCase().includes(busqueda.toLowerCase())
          : true,
      )
      .sort((a, b) => b.creadoEn - a.creadoEn);
  }, [tiendas, busqueda, filtroEstado]);

  const totalActivas = tiendas.filter((t) => t.activo).length;
  const totalInactivas = tiendas.length - totalActivas;

  const guardarIconoCategoria = async (categoria) => {
    setGuardandoCategoria(categoria.id);
    const iconUrl = categoria.icon_url?.trim() || null;
    const { error } = await supabase
      .from("categories")
      .update({ icon_url: iconUrl })
      .eq("name", categoria.name);

    if (error) {
      console.error("No se pudo guardar el icono de la categoría:", error);
      setMensajeEstado({
        tipo: "error",
        texto: "No se pudo guardar el icono de la categoría.",
      });
    } else {
      setCategoriasMaestras((actuales) =>
        actuales.map((actual) =>
          actual.id === categoria.id
            ? { ...actual, icon_url: iconUrl }
            : actual,
        ),
      );
      setMensajeEstado({
        tipo: "success",
        texto: `Icono actualizado para ${categoria.name}.`,
      });
    }
    setGuardandoCategoria(null);
  };

  const confirmarPagoPromocion = async (promocion) => {
    setConfirmandoPromocion(promocion.id);
    const { error } = await supabase
      .from("promotions")
      .update({
        payment_status: "paid",
        payment_reference: "confirmed_by_superadmin",
        paid_at: new Date().toISOString(),
        is_active: true,
      })
      .eq("id", promocion.id);

    if (error) {
      console.error("No se pudo confirmar el pago:", error);
      setMensajeEstado({
        tipo: "error",
        texto: "No se pudo confirmar el pago de la promoción.",
      });
    } else {
      setPromocionesPendientes((actuales) =>
        actuales.filter((actual) => actual.id !== promocion.id),
      );
      setMensajeEstado({
        tipo: "success",
        texto: `Promoción de ${promocion.businesses?.name || "la tienda"} publicada.`,
      });
    }
    setConfirmandoPromocion(null);
  };

  // ── Acciones ──

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("No se pudo cerrar la sesión:", err);
    }
    navigate("/login-superadmin");
  };

  const abrirCrear = () => {
    setTiendaEditando(null);
    setForm(tiendaVacia());
    setSlugManual(false);
    setMensajeEstado({ tipo: "", texto: "" });
    setProgresoCreacion({ activo: false, pasos: [] });
    setMostrarWizard(false);
    setVistaCreacion(true);
    setModalAbierto(true);
  };

  const abrirEditar = (tienda) => {
    setTiendaEditando(tienda);
    setForm(tienda);
    setSlugManual(true); // al editar, no regeneramos el slug automáticamente
    setMensajeEstado({ tipo: "", texto: "" });
    setProgresoCreacion({ activo: false, pasos: [] });
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    setMensajeEstado({ tipo: "", texto: "" });
    setProgresoCreacion({ activo: false, pasos: [] });
    setMostrarWizard(false);
    setVistaCreacion(false);
    setModalAbierto(false);
  };

  const handleNombreChange = (valor) => {
    setForm((f) => ({
      ...f,
      nombre: valor,
      slug: slugManual ? f.slug : slugify(valor),
    }));
  };

  const handleGuardar = async (datosCreacion) => {
    const nombreFinal = datosCreacion?.nombre || form.nombre.trim();
    const slugFinal =
      (datosCreacion?.slug || form.slug || "").trim() || slugify(nombreFinal);

    if (!nombreFinal.trim()) return; // nombre es obligatorio

    setGuardando(true);
    setMensajeEstado({ tipo: "", texto: "" });

    setForm((prev) => ({ ...prev, nombre: nombreFinal, slug: slugFinal }));

    const pasosBase = [
      { id: "local", label: "Preparando tienda local", estado: "loading" },
      {
        id: "usuario",
        label: "Creando usuario administrador",
        estado: "pendiente",
      },
      { id: "final", label: "Finalizando creación", estado: "pendiente" },
    ];

    setProgresoCreacion({ activo: true, pasos: pasosBase });

    if (tiendaEditando) {
      const tiendasActualizadas = tiendas.map((t) =>
        t.id === tiendaEditando.id ? { ...form, slug: slugFinal } : t,
      );
      setTiendas(tiendasActualizadas);
      guardarTiendas(tiendasActualizadas);
      setModalAbierto(false);
      setGuardando(false);
      return;
    }

    try {
      setProgresoCreacion((prev) => ({
        ...prev,
        pasos: prev.pasos.map((paso) =>
          paso.id === "local" ? { ...paso, estado: "completado" } : paso,
        ),
      }));

      let businessId = null;
      try {
        const negocio = await crearTiendaEnSupabase({
          nombre: nombreFinal,
          slug: slugFinal,
          activo: form.activo,
        });
        businessId = negocio?.id ?? null;
      } catch (error) {
        console.warn("No se pudo crear la tienda en Supabase:", error);
      }

      if (!businessId) {
        throw new Error(
          "No se pudo crear la tienda en Supabase. Revisa las políticas RLS de businesses y asegúrate de que el superadmin tenga permisos.",
        );
      }

      const nuevaTienda = {
        ...form,
        nombre: nombreFinal,
        slug: slugFinal,
        id: uid(),
        creadoEn: Date.now(),
        business_id: businessId,
      };

      const tiendasActualizadas = [...tiendas, nuevaTienda];
      setTiendas(tiendasActualizadas);
      guardarTiendas(tiendasActualizadas);

      setProgresoCreacion((prev) => ({
        ...prev,
        pasos: prev.pasos.map((paso) =>
          paso.id === "usuario" ? { ...paso, estado: "loading" } : paso,
        ),
      }));

      try {
        const { userId, email, password } = await crearUsuarioAdministrador({
          businessId,
          slug: slugFinal,
          nombre: nombreFinal,
        });

        setProgresoCreacion((prev) => ({
          ...prev,
          pasos: prev.pasos.map((paso) =>
            paso.id === "usuario" ? { ...paso, estado: "completado" } : paso,
          ),
        }));

        setProgresoCreacion((prev) => ({
          ...prev,
          pasos: prev.pasos.map((paso) =>
            paso.id === "final" ? { ...paso, estado: "loading" } : paso,
          ),
        }));

        setMensajeEstado({
          tipo: "success",
          texto: `Usuario creado correctamente. ID de perfil: ${userId}`,
        });
      } catch (authError) {
        console.error("Error creando usuario administrador:", authError);
        setProgresoCreacion((prev) => ({
          ...prev,
          pasos: prev.pasos.map((paso) =>
            paso.id === "usuario"
              ? { ...paso, estado: "error", detalle: "No se pudo completar" }
              : paso,
          ),
        }));

        const isRateLimit =
          authError?.status === 429 ||
          /rate limit/i.test(authError?.message || "");

        setMensajeEstado({
          tipo: "error",
          texto: isRateLimit
            ? "Límite de creación de usuarios alcanzado. Espera unos minutos y vuelve a intentarlo."
            : "No se pudo crear el usuario o el profile. Revisa la consola y las políticas RLS.",
        });
      }

      setProgresoCreacion((prev) => ({
        ...prev,
        pasos: prev.pasos.map((paso) =>
          paso.id === "final" ? { ...paso, estado: "completado" } : paso,
        ),
      }));
      setModalAbierto(false);
    } catch (error) {
      console.error("Error al guardar la tienda en Supabase:", error);
      const tiendaFallback = {
        ...form,
        nombre: nombreFinal,
        slug: slugFinal,
        id: uid(),
        creadoEn: Date.now(),
      };
      const tiendasActualizadas = [...tiendas, tiendaFallback];
      setTiendas(tiendasActualizadas);
      guardarTiendas(tiendasActualizadas);
      setMensajeEstado({
        tipo: "error",
        texto:
          "No se pudo guardar la tienda en Supabase; se almacenó de forma local.",
      });
    } finally {
      setGuardando(false);
    }
  };

  const toggleActivo = (id) => {
    setTiendas((prev) =>
      prev.map((t) => (t.id === id ? { ...t, activo: !t.activo } : t)),
    );
  };

  const confirmarEliminar = () => {
    setTiendas((prev) => prev.filter((t) => t.id !== tiendaAEliminar.id));
    setTiendaAEliminar(null);
  };

  // ── Render ──

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#fff",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <SuperAdminSidebar
        activeSection={activeSection}
        onNavigate={(section) => {
          setActiveSection(section);
          if (section === "crear-tienda") abrirCrear();
        }}
      />

      <div className="ml-20 min-h-screen transition-all duration-300 lg:ml-64">
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "16px 20px",
            borderBottom: "1px solid #1a1a1a",
            position: "sticky",
            top: 0,
            background: "rgba(10,10,10,0.96)",
            backdropFilter: "blur(16px)",
            zIndex: 20,
          }}
        >
          {onVolver && (
            <button
              type="button"
              onClick={onVolver}
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.06)",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
              aria-label="Volver"
            >
              <ChevronLeft size={20} color="#fff" />
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <button
              onClick={handleLogout}
              style={{
                background: "#e53e3e",
                color: "white",
                padding: "10px",
                borderRadius: "5px",
              }}
            >
              Cerrar Sesión
            </button>
            <h1 style={{ fontSize: "16px", fontWeight: 800, margin: 0 }}>
              SuperAdmin
            </h1>
            <p
              style={{
                fontSize: "12px",
                color: "rgba(255,255,255,0.45)",
                margin: 0,
              }}
            >
              Control de tiendas
            </p>
          </div>
          <button
            type="button"
            onClick={abrirCrear}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "#7c3aed",
              border: "none",
              color: "#fff",
              fontWeight: 700,
              fontSize: "12px",
              padding: "10px 14px",
              borderRadius: "100px",
              cursor: "pointer",
              boxShadow: "0 8px 24px rgba(124,58,237,0.35)",
              flexShrink: 0,
            }}
          >
            <Plus size={16} />
            Nueva tienda
          </button>
        </div>

        <div style={{ padding: "20px", maxWidth: "920px", margin: "0 auto" }}>
          {/* Stats */}
          <div
            id="resumen"
            style={{
              display: "flex",
              gap: "10px",
              marginBottom: "20px",
              scrollMarginTop: "24px",
            }}
          >
            <SuperAdminStatCard
              icon={Building2}
              label="Total"
              value={tiendas.length}
              color="#a78bfa"
            />
            <SuperAdminStatCard
              icon={CheckCircle2}
              label="Activas"
              value={totalActivas}
              color="#34d399"
            />
            <SuperAdminStatCard
              icon={XCircle}
              label="Inactivas"
              value={totalInactivas}
              color="#f87171"
            />
          </div>

          {mensajeEstado.texto && (
            <div
              role="status"
              style={{
                marginBottom: "14px",
                padding: "10px 12px",
                borderRadius: "12px",
                border:
                  mensajeEstado.tipo === "error"
                    ? "1px solid rgba(248,113,113,0.28)"
                    : "1px solid rgba(52,211,153,0.28)",
                background:
                  mensajeEstado.tipo === "error"
                    ? "rgba(248,113,113,0.12)"
                    : "rgba(52,211,153,0.12)",
                color: mensajeEstado.tipo === "error" ? "#fda4af" : "#bbf7d0",
                fontSize: "12px",
              }}
            >
              {mensajeEstado.texto}
            </div>
          )}

          {/* Búsqueda */}
          <div style={{ position: "relative", marginBottom: "12px" }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: "14px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "rgba(255,255,255,0.35)",
              }}
            />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar tienda por nombre..."
              style={{
                width: "100%",
                background: "#131313",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "14px",
                padding: "12px 14px 12px 42px",
                color: "#fff",
                fontSize: "13px",
                fontFamily: "inherit",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Filtros de estado */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
            {[
              { id: "todas", label: "Todas" },
              { id: "activas", label: "Activas" },
              { id: "inactivas", label: "Inactivas" },
            ].map(({ id, label }) => {
              const activo = filtroEstado === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFiltroEstado(id)}
                  style={{
                    background: activo ? "rgba(124,58,237,0.15)" : "#131313",
                    border: activo
                      ? "1px solid #7c3aed"
                      : "1px solid rgba(255,255,255,0.08)",
                    color: activo ? "#fff" : "rgba(255,255,255,0.6)",
                    fontSize: "12px",
                    fontWeight: 700,
                    padding: "8px 14px",
                    borderRadius: "100px",
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <section
            id="categorias-maestras"
            style={{
              background: "#131313",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "16px",
              padding: "16px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                marginBottom: "12px",
              }}
            >
              <div>
                <h2 style={{ fontSize: "14px", fontWeight: 800, margin: 0 }}>
                  Categorías maestras
                </h2>
                <p
                  style={{
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.45)",
                    margin: "4px 0 0",
                  }}
                >
                  Define el icono que se mostrará en el marketplace.
                </p>
              </div>
              <Tag size={18} color="#a78bfa" />
            </div>

            {cargandoCategorias ? (
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "12px" }}>
                Cargando categorías...
              </p>
            ) : categoriasMaestras.length === 0 ? (
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "12px" }}>
                No hay categorías maestras disponibles.
              </p>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                {categoriasMaestras.map((categoria) => (
                  <div
                    key={categoria.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      flexWrap: "wrap",
                      padding: "9px 0",
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <span
                      style={{
                        width: "120px",
                        fontSize: "12px",
                        fontWeight: 700,
                      }}
                    >
                      {categoria.name}
                    </span>
                    <input
                      value={categoria.icon_url || ""}
                      onChange={(event) =>
                        setCategoriasMaestras((actuales) =>
                          actuales.map((actual) =>
                            actual.id === categoria.id
                              ? { ...actual, icon_url: event.target.value }
                              : actual,
                          ),
                        )
                      }
                      placeholder="URL del icono"
                      style={{
                        flex: 1,
                        minWidth: "180px",
                        background: "#0a0a0a",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "10px",
                        padding: "9px 10px",
                        color: "#fff",
                        fontSize: "12px",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => guardarIconoCategoria(categoria)}
                      disabled={guardandoCategoria === categoria.id}
                      style={{
                        background: "#7c3aed",
                        border: "none",
                        borderRadius: "10px",
                        color: "#fff",
                        padding: "9px 12px",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor:
                          guardandoCategoria === categoria.id
                            ? "wait"
                            : "pointer",
                        opacity: guardandoCategoria === categoria.id ? 0.6 : 1,
                      }}
                    >
                      {guardandoCategoria === categoria.id
                        ? "Guardando..."
                        : "Guardar"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section
            id="promociones-pendientes"
            style={{
              background: "#131313",
              border: "1px solid rgba(245,158,11,0.2)",
              borderRadius: "16px",
              padding: "16px",
              marginBottom: "20px",
            }}
          >
            <div style={{ marginBottom: "12px" }}>
              <h2 style={{ fontSize: "14px", fontWeight: 800, margin: 0 }}>
                Promociones pendientes de pago
              </h2>
              <p
                style={{
                  fontSize: "11px",
                  color: "rgba(255,255,255,0.45)",
                  margin: "4px 0 0",
                }}
              >
                Confirma aquí los pagos verificados. Solo después aparecerán en
                Home.
              </p>
            </div>

            {cargandoPromociones ? (
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "12px" }}>
                Cargando promociones...
              </p>
            ) : promocionesPendientes.length === 0 ? (
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "12px" }}>
                No hay promociones pendientes.
              </p>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                {promocionesPendientes.map((promocion) => (
                  <div
                    key={promocion.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      flexWrap: "wrap",
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                      padding: "10px 0",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: "200px" }}>
                      <p
                        style={{ margin: 0, fontSize: "12px", fontWeight: 800 }}
                      >
                        {promocion.title || "Sin título"}
                      </p>
                      <p
                        style={{
                          margin: "4px 0 0",
                          fontSize: "11px",
                          color: "rgba(255,255,255,0.5)",
                        }}
                      >
                        {promocion.businesses?.name || "Tienda"} ·{" "}
                        {promocion.offer_text}
                      </p>
                    </div>
                    <span
                      style={{
                        color: "#fbbf24",
                        fontSize: "10px",
                        fontWeight: 800,
                        textTransform: "uppercase",
                      }}
                    >
                      Pendiente
                    </span>
                    <button
                      type="button"
                      onClick={() => confirmarPagoPromocion(promocion)}
                      disabled={confirmandoPromocion === promocion.id}
                      style={{
                        background: "#059669",
                        border: "none",
                        borderRadius: "10px",
                        color: "#fff",
                        padding: "9px 12px",
                        fontSize: "11px",
                        fontWeight: 800,
                        cursor: "pointer",
                        opacity:
                          confirmandoPromocion === promocion.id ? 0.6 : 1,
                      }}
                    >
                      {confirmandoPromocion === promocion.id
                        ? "Publicando..."
                        : "Confirmar pago"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Lista de tiendas */}
          <div id="tiendas" style={{ scrollMarginTop: "24px" }}>
            {tiendasFiltradas.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "56px 24px",
                  color: "rgba(255,255,255,0.4)",
                }}
              >
                <Store
                  size={32}
                  style={{ marginBottom: "10px", opacity: 0.5 }}
                />
                <p style={{ fontSize: "13px", margin: 0 }}>
                  {tiendas.length === 0
                    ? "Aún no has creado ninguna tienda."
                    : "No hay tiendas que coincidan con ese filtro."}
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {tiendasFiltradas.map((tienda) => (
                  <div
                    key={tienda.id}
                    style={{
                      background: "#131313",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "16px",
                      padding: "16px",
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                      opacity: tienda.activo ? 1 : 0.55,
                    }}
                  >
                    <div
                      style={{
                        width: "44px",
                        height: "44px",
                        borderRadius: "12px",
                        background: "rgba(124,58,237,0.15)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Store size={20} color="#a78bfa" />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "4px",
                        }}
                      >
                        <h3
                          style={{
                            fontSize: "14px",
                            fontWeight: 800,
                            margin: 0,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {tienda.nombre}
                        </h3>
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 700,
                            color: tienda.activo ? "#34d399" : "#f87171",
                            background: tienda.activo
                              ? "rgba(52,211,153,0.12)"
                              : "rgba(248,113,113,0.12)",
                            padding: "2px 8px",
                            borderRadius: "100px",
                            flexShrink: 0,
                          }}
                        >
                          {tienda.activo ? "Activa" : "Inactiva"}
                        </span>
                        {(() => {
                          const plan = planPorId(tienda.plan);
                          const PlanIcon = plan.icon;
                          return (
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "3px",
                                fontSize: "10px",
                                fontWeight: 700,
                                color: plan.color,
                                background: `${plan.color}1f`,
                                padding: "2px 8px",
                                borderRadius: "100px",
                                flexShrink: 0,
                              }}
                            >
                              <PlanIcon size={10} />
                              {plan.name}
                            </span>
                          );
                        })()}
                      </div>
                      <p
                        style={{
                          fontSize: "11.5px",
                          color: "rgba(255,255,255,0.45)",
                          margin: 0,
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <Tag size={11} /> {tienda.categoria}
                        </span>
                        <span>/{tienda.slug}</span>
                        {tienda.telefono && (
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <Phone size={11} /> {tienda.telefono}
                          </span>
                        )}
                      </p>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <SuperAdminToggle
                        activo={tienda.activo}
                        onClick={() => toggleActivo(tienda.id)}
                      />
                      <button
                        type="button"
                        onClick={() => abrirEditar(tienda)}
                        style={{
                          width: "34px",
                          height: "34px",
                          borderRadius: "10px",
                          background: "rgba(255,255,255,0.06)",
                          border: "none",
                          color: "#fff",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        aria-label="Editar tienda"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setTiendaAEliminar(tienda)}
                        style={{
                          width: "34px",
                          height: "34px",
                          borderRadius: "10px",
                          background: "rgba(248,113,113,0.1)",
                          border: "none",
                          color: "#f87171",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        aria-label="Eliminar tienda"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal crear/editar tienda */}
        {modalAbierto && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              zIndex: 100,
            }}
            onClick={cerrarModal}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: "480px",
                background: "#0a0a0a",
                borderTop: "1px solid #1a1a1a",
                borderRadius: "20px 20px 0 0",
                padding: "20px",
                paddingBottom: "calc(20px + env(safe-area-inset-bottom))",
                maxHeight: "88vh",
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "18px",
                }}
              >
                <h2 style={{ fontSize: "16px", fontWeight: 800, margin: 0 }}>
                  {tiendaEditando ? "Editar tienda" : "Nueva tienda"}
                </h2>
                <button
                  type="button"
                  onClick={cerrarModal}
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.06)",
                    border: "none",
                    color: "#fff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  aria-label="Cerrar"
                >
                  <X size={16} />
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                {vistaCreacion ? (
                  <CrearTiendaWizard
                    onCancel={cerrarModal}
                    onSuccess={async (datos) => {
                      setMostrarWizard(true);
                      await handleGuardar(datos);
                    }}
                  />
                ) : (
                  <>
                    {progresoCreacion.activo && (
                      <div
                        style={{
                          background: "#131313",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "14px",
                          padding: "14px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "10px",
                          }}
                        >
                          <div>
                            <p
                              style={{
                                margin: 0,
                                fontSize: "12px",
                                fontWeight: 800,
                                color: "#fff",
                              }}
                            >
                              Creando tienda en etapas
                            </p>
                            <p
                              style={{
                                margin: "2px 0 0",
                                fontSize: "11px",
                                color: "rgba(255,255,255,0.45)",
                              }}
                            >
                              Seguimiento del proceso en tiempo real
                            </p>
                          </div>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "rgba(255,255,255,0.55)",
                            }}
                          >
                            {
                              progresoCreacion.pasos.filter(
                                (p) => p.estado === "completado",
                              ).length
                            }
                            /{progresoCreacion.pasos.length}
                          </span>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                          }}
                        >
                          {progresoCreacion.pasos.map((paso) => {
                            const color =
                              paso.estado === "completado"
                                ? "#34d399"
                                : paso.estado === "error"
                                  ? "#f87171"
                                  : paso.estado === "loading"
                                    ? "#a78bfa"
                                    : "rgba(255,255,255,0.25)";

                            return (
                              <div
                                key={paso.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                }}
                              >
                                <div
                                  style={{
                                    width: "10px",
                                    height: "10px",
                                    borderRadius: "50%",
                                    background: color,
                                    flexShrink: 0,
                                  }}
                                />
                                <div style={{ flex: 1 }}>
                                  <div
                                    style={{
                                      fontSize: "12px",
                                      fontWeight: 700,
                                    }}
                                  >
                                    {paso.label}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      color: "rgba(255,255,255,0.45)",
                                    }}
                                  >
                                    {paso.estado === "loading"
                                      ? "En curso"
                                      : paso.estado === "completado"
                                        ? "Completado"
                                        : paso.estado === "error"
                                          ? "Falló"
                                          : "Pendiente"}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div>
                      <label style={labelStyle}>Nombre de la tienda</label>
                      <input
                        autoFocus
                        value={form.nombre}
                        onChange={(e) => handleNombreChange(e.target.value)}
                        placeholder="Ej: Sushi Roll Express"
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>
                        URL / slug{" "}
                        <span style={{ color: "rgba(255,255,255,0.3)" }}>
                          (se genera solo, pero puedes cambiarlo)
                        </span>
                      </label>
                      <input
                        value={form.slug}
                        onChange={(e) => {
                          setSlugManual(true);
                          setForm((f) => ({
                            ...f,
                            slug: slugify(e.target.value),
                          }));
                        }}
                        placeholder="sushi-roll-express"
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Categoría</label>
                      <select
                        value={form.categoria}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, categoria: e.target.value }))
                        }
                        style={inputStyle}
                      >
                        {CATEGORIAS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={labelStyle}>Plan</label>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        {PLANES.map((plan) => {
                          const activo = form.plan === plan.id;
                          const PlanIcon = plan.icon;
                          return (
                            <button
                              key={plan.id}
                              type="button"
                              onClick={() =>
                                setForm((f) => ({ ...f, plan: plan.id }))
                              }
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "12px",
                                textAlign: "left",
                                background: activo
                                  ? "rgba(124,58,237,0.12)"
                                  : "#131313",
                                border: activo
                                  ? "1px solid #7c3aed"
                                  : "1px solid rgba(255,255,255,0.08)",
                                borderRadius: "14px",
                                padding: "12px 14px",
                                cursor: "pointer",
                              }}
                            >
                              <div
                                style={{
                                  width: "34px",
                                  height: "34px",
                                  borderRadius: "10px",
                                  background: `${plan.color}1f`,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                              >
                                <PlanIcon size={16} color={plan.color} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "baseline",
                                    justifyContent: "space-between",
                                    gap: "8px",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "13px",
                                      fontWeight: 800,
                                      color: "#fff",
                                    }}
                                  >
                                    {plan.name}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      fontWeight: 700,
                                      color: plan.color,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {plan.isCommission
                                      ? plan.commissionText
                                      : `${fmtCOP(plan.priceMonthly)}/mes`}
                                  </span>
                                </div>
                                <p
                                  style={{
                                    fontSize: "11px",
                                    color: "rgba(255,255,255,0.45)",
                                    margin: "2px 0 0",
                                  }}
                                >
                                  {plan.isCommission
                                    ? plan.subText
                                    : plan.description}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label style={labelStyle}>Teléfono de contacto</label>
                      <input
                        value={form.telefono}
                        inputMode="tel"
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9+]/g, "");
                          setForm((f) => ({ ...f, telefono: v }));
                        }}
                        placeholder="+573001234567"
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Descripción (opcional)</label>
                      <textarea
                        value={form.descripcion}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            descripcion: e.target.value,
                          }))
                        }
                        rows={3}
                        placeholder="Breve descripción del negocio..."
                        style={{ ...inputStyle, resize: "vertical" }}
                      />
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "#131313",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "14px",
                        padding: "12px 14px",
                      }}
                    >
                      <div>
                        <p
                          style={{
                            fontSize: "13px",
                            fontWeight: 700,
                            margin: 0,
                            marginBottom: "2px",
                          }}
                        >
                          Tienda activa
                        </p>
                        <p
                          style={{
                            fontSize: "11px",
                            color: "rgba(255,255,255,0.4)",
                            margin: 0,
                          }}
                        >
                          Si la desactivas, no será visible para los clientes.
                        </p>
                      </div>
                      <SuperAdminToggle
                        activo={form.activo}
                        onClick={() =>
                          setForm((f) => ({ ...f, activo: !f.activo }))
                        }
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleGuardar({ nombre: form.nombre, slug: form.slug })
                      }
                      disabled={!form.nombre.trim() || guardando}
                      style={{
                        width: "100%",
                        padding: "14px",
                        borderRadius: "100px",
                        background:
                          form.nombre.trim() && !guardando
                            ? "#7c3aed"
                            : "rgba(124,58,237,0.25)",
                        color:
                          form.nombre.trim() && !guardando
                            ? "#fff"
                            : "rgba(255,255,255,0.5)",
                        fontWeight: 800,
                        fontSize: "14px",
                        border: "none",
                        cursor:
                          form.nombre.trim() && !guardando
                            ? "pointer"
                            : "not-allowed",
                        marginTop: "6px",
                        boxShadow:
                          form.nombre.trim() && !guardando
                            ? "0 8px 32px rgba(124,58,237,0.45)"
                            : "none",
                      }}
                    >
                      {guardando
                        ? "Creando tienda..."
                        : tiendaEditando
                          ? "Guardar cambios"
                          : "Crear tienda"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal confirmar eliminación */}
        {tiendaAEliminar && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 110,
              padding: "20px",
            }}
            onClick={() => setTiendaAEliminar(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: "360px",
                background: "#131313",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "18px",
                padding: "22px",
              }}
            >
              <h3
                style={{ fontSize: "15px", fontWeight: 800, margin: "0 0 8px" }}
              >
                ¿Eliminar tienda?
              </h3>
              <p
                style={{
                  fontSize: "12.5px",
                  color: "rgba(255,255,255,0.5)",
                  margin: "0 0 18px",
                  lineHeight: 1.5,
                }}
              >
                Vas a eliminar <strong>{tiendaAEliminar.nombre}</strong>. Esta
                acción no se puede deshacer.
              </p>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setTiendaAEliminar(null)}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "100px",
                    background: "rgba(255,255,255,0.06)",
                    border: "none",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarEliminar}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "100px",
                    background: "#e53e3e",
                    border: "none",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  Sí, eliminar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const labelStyle = {
  display: "block",
  fontSize: "11px",
  fontWeight: 700,
  color: "rgba(255,255,255,0.6)",
  marginBottom: "6px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const inputStyle = {
  width: "100%",
  background: "#131313",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "12px",
  padding: "12px 14px",
  color: "#fff",
  fontSize: "13px",
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

export default SuperAdmin;
