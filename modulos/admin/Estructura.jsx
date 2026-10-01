import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import SuperAdminSidebar from "./MenuLateral";

const SuperAdminLayout = () => {
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const isSidebarExpanded = isSidebarPinned || isSidebarHovered;

  const toggleSidebar = () => {
    if (isSidebarPinned || isSidebarHovered) {
      setIsSidebarPinned(false);
      setIsSidebarHovered(false);
    } else {
      setIsSidebarPinned(true);
    }
  };

  const handleMouseEnter = () => {
    if (
      window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
      !isSidebarPinned
    ) {
      setIsSidebarHovered(true);
    }
  };

  const handleMouseLeave = () => {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      setIsSidebarHovered(false);
    }
  };

  const closeSidebar = () => {
    setIsSidebarPinned(false);
    setIsSidebarHovered(false);
  };

  return (
    <div className="relative flex min-h-screen overflow-x-hidden bg-neutral-950 font-manrope text-white selection:bg-violet-500/30">
      <div className="fixed left-0 top-0 z-50 h-screen transition-all duration-300">
        <SuperAdminSidebar
          isExpanded={isSidebarExpanded}
          toggleSidebar={toggleSidebar}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
      </div>
      <main className="ml-20 min-h-screen w-[calc(100%-5rem)] flex-1 overflow-y-auto p-5 transition-all duration-300 md:p-8">
        <Outlet />
      </main>
      {isSidebarExpanded && (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-default bg-black/40 backdrop-blur-sm"
          onClick={closeSidebar}
          aria-label="Cerrar menú"
        />
      )}
    </div>
  );
};

export default SuperAdminLayout;
