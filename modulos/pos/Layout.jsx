import React, { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Clock } from "lucide-react";
import Sidebar from "./Sidebar";
import { Loading, LOADING_DURATION_MS } from "./Loading";
import { supabase } from "../../src/lib/supabaseClient";
import { useAuth } from "../../src/components/AuthContext";

// Lógica de carga integrada globalmente en el Layout
const ReadyGate = ({ children }) => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const fontsWait = document.fonts.ready;
    const minWait =
      LOADING_DURATION_MS !== null
        ? new Promise((res) => setTimeout(res, LOADING_DURATION_MS))
        : Promise.resolve();

    Promise.all([minWait, fontsWait]).then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsReady(true));
      });
    });
  }, []);

  if (!isReady) return <Loading />;
  return children;
};

const Layout = () => {
  const location = useLocation();
  const { user } = useAuth();
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [colorMode, setColorMode] = useState("dark");
  const [inactiveTablesPrompt, setInactiveTablesPrompt] = useState([]);
  const [isClosingInactiveTables, setIsClosingInactiveTables] = useState(false);
  const [isInactiveTablesPreview, setIsInactiveTablesPreview] = useState(false);
  const isSidebarExpanded = isSidebarPinned || isSidebarHovered;
  const isPosRoute = location.pathname === "/pos";
  const isMesasRoute = location.pathname === "/pos/mesas";

  const toggleSidebar = () => {
    if (isSidebarPinned || isSidebarHovered) {
      setIsSidebarPinned(false);
      setIsSidebarHovered(false);
    } else {
      setIsSidebarPinned(true);
    }
  };

  const handleSidebarMouseEnter = () => {
    if (
      window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
      !isSidebarPinned &&
      !isPosRoute
    ) {
      setIsSidebarHovered(true);
    }
  };

  const handleSidebarMouseLeave = () => {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      setIsSidebarHovered(false);
    }
  };

  const closeSidebar = () => {
    setIsSidebarPinned(false);
    setIsSidebarHovered(false);
  };
  const sidebarPushesContent = isPosRoute && isSidebarExpanded;

  useEffect(() => {
    if (!user?.id) return undefined;

    let cancelled = false;

    const checkInactiveTables = async () => {
      if (new URLSearchParams(window.location.search).get("inactiveTablesPreview") === "1") {
        const now = Date.now();
        setIsInactiveTablesPreview(true);
        setInactiveTablesPrompt([
          { id: "preview-4", numero: "4", lastActivityAt: now - 27 * 60 * 60 * 1000 },
          { id: "preview-8", numero: "8", lastActivityAt: now - 31 * 60 * 60 * 1000 },
          { id: "preview-12", numero: "12", lastActivityAt: now - 49 * 60 * 60 * 1000 },
        ]);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError || !profile?.business_id || cancelled) return;

      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, mesa, table_status, updated_at, created_at")
        .eq("business_id", profile.business_id)
        .eq("order_type", "table")
        .neq("table_status", "cerrada")
        .neq("table_status", "clean");
      if (error || cancelled) return;

      const limit = 24 * 60 * 60 * 1000;
      const now = Date.now();
      const inactiveTables = (orders || []).flatMap((order) => {
        if (!order.mesa) return [];
        const lastActivityAt = new Date(order.updated_at || order.created_at).getTime();
        return Number.isFinite(lastActivityAt) && now - lastActivityAt >= limit
          ? [{ id: order.id, numero: String(order.mesa), lastActivityAt }]
          : [];
      });
      if (!inactiveTables.length) return;

      const promptKey = `gloto-inactive-tables-${profile.business_id}-${new Date().toLocaleDateString("en-CA")}`;
      if (sessionStorage.getItem(promptKey) === "shown") return;
      sessionStorage.setItem(promptKey, "shown");
      setInactiveTablesPrompt(inactiveTables);
    };

    checkInactiveTables();
    const interval = window.setInterval(checkInactiveTables, 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [location.pathname, user?.id]);

  const closeInactiveTables = async () => {
    if (!inactiveTablesPrompt.length) return;
    if (isInactiveTablesPreview) {
      setInactiveTablesPrompt([]);
      return;
    }

    setIsClosingInactiveTables(true);
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("business_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError || !profile?.business_id) {
      setIsClosingInactiveTables(false);
      return;
    }

    const results = await Promise.all(
      [...new Set(inactiveTablesPrompt.map((table) => table.id))]
        .filter((id) => !String(id).startsWith("preview-"))
        .map((orderId) =>
          supabase.rpc("close_table_order", {
            p_order_id: orderId,
            p_business_id: profile.business_id,
          }),
        ),
    );
    if (results.some(({ error }) => error)) {
      console.error("Error cerrando mesas inactivas:", results);
    } else {
      setInactiveTablesPrompt([]);
    }
    setIsClosingInactiveTables(false);
  };

  return (
    <div
      className="pos-theme bg-neutral-950 min-h-screen flex font-manrope selection:bg-violet-500/30 text-white relative overflow-x-hidden"
      data-theme={colorMode}
    >
      <div className="z-50 fixed top-0 left-0 h-screen transition-all duration-300">
        <Sidebar
          isExpanded={isSidebarExpanded}
          overlayClassName={isPosRoute ? "lg:hidden" : ""}
          toggleSidebar={toggleSidebar}
          onMouseEnter={handleSidebarMouseEnter}
          onMouseLeave={handleSidebarMouseLeave}
          onColorModeChange={setColorMode}
        />
      </div>

      <main
        className={`flex-1 p-0 ${
          isMesasRoute ? "h-[100dvh] overflow-hidden" : "overflow-y-auto min-h-screen"
        } ml-20 w-[calc(100%-5rem)] transition-all duration-300 ${
          sidebarPushesContent
            ? "lg:ml-64 lg:w-[calc(100%-16rem)]"
            : ""
        }`}
      >
        {/* Aquí la animación protege TODAS las rutas hijas automáticamente */}
        <ReadyGate>
          <Outlet context={{ isSidebarExpanded }} />
        </ReadyGate>
      </main>

      {isSidebarExpanded && (
        <div
          className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${
            isPosRoute ? "lg:hidden" : ""
          }`}
          onClick={closeSidebar}
        />
      )}

      {inactiveTablesPrompt.length > 0 && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/20 bg-neutral-950 p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
                <Clock size={22} />
              </div>
              <div>
                <h2 className="text-lg font-black text-white">
                  Mesas abiertas por más de 24 horas
                </h2>
                {isInactiveTablesPreview && (
                  <span className="mt-1 inline-block rounded-full bg-violet-500/15 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-violet-300">
                    Vista previa
                  </span>
                )}
                <p className="mt-1 text-sm leading-relaxed text-slate-400">
                  Hay {inactiveTablesPrompt.length} mesa{inactiveTablesPrompt.length === 1 ? "" : "s"} sin actividad desde hace al menos un día.
                </p>
              </div>
            </div>
            <div className="mt-4 max-h-52 space-y-2 overflow-y-auto rounded-xl border border-white/8 bg-white/[0.02] p-2">
              {inactiveTablesPrompt.map((mesa) => (
                <div key={mesa.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm">
                  <span className="font-bold text-white">Mesa {mesa.numero}</span>
                  <span className="text-xs text-slate-400">
                    {Math.floor(Math.max(0, Date.now() - Number(mesa.lastActivityAt)) / 3600000)} h sin actividad
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setInactiveTablesPrompt([])}
                disabled={isClosingInactiveTables}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-300 disabled:opacity-50"
              >
                Revisar después
              </button>
              <button
                type="button"
                onClick={closeInactiveTables}
                disabled={isClosingInactiveTables}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
              >
                {isClosingInactiveTables && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                {isClosingInactiveTables ? "Cerrando..." : "Cerrar todas"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
