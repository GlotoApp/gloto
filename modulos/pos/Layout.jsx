import React, { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import { Loading, LOADING_DURATION_MS } from "./Loading";

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
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const isSidebarExpanded = isSidebarPinned || isSidebarHovered;
  const isPosRoute = location.pathname === "/pos";

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

  return (
    <div className="bg-neutral-950 min-h-screen flex font-manrope selection:bg-violet-500/30 text-white relative overflow-x-hidden">
      <div className="z-50 fixed top-0 left-0 h-screen transition-all duration-300">
        <Sidebar
          isExpanded={isSidebarExpanded}
          toggleSidebar={toggleSidebar}
          onMouseEnter={handleSidebarMouseEnter}
          onMouseLeave={handleSidebarMouseLeave}
        />
      </div>

      <main className="flex-1 p-0 overflow-y-auto min-h-screen ml-20 w-[calc(100%-5rem)] transition-all duration-300">
        {/* Aquí la animación protege TODAS las rutas hijas automáticamente */}
        <ReadyGate>
          <Outlet context={{ isSidebarExpanded }} />
        </ReadyGate>
      </main>

      {isSidebarExpanded && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300"
          onClick={closeSidebar}
        />
      )}
    </div>
  );
};

export default Layout;
