import React, { useState } from "react";
import {
  Routes,
  Route,
  useLocation,
  useNavigate,
  Link,
} from "react-router-dom";
import { MapPin, Globe } from "lucide-react";

import Home from "./pages/Home";
import Shop from "./pages/Shop";
import SeguimientoPedido from "./pages/SeguimientoPedido";
import { CartProvider } from "./pages/CartContext";

const Marketplace = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isShopPage = location.pathname.includes("/tienda/");

  return (
    <div className="min-h-screen bg-background text-on-surface">
      {/* HEADER */}
      {!isShopPage && (
        <header className="sticky top-0 z-50 bg-background">
          <div className="px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center gap-3">
                <img
                  src="/gloto-logo.png"
                  alt="Gloto"
                  className="h-7 sm:h-8 object-contain"
                  onError={(e) => {
                    e.target.src = "/favicon.png";
                  }}
                />
                <span className="font-black text-lg sm:text-2xl tracking-tighter text-fff">
                  Gloto
                </span>
              </Link>
            </div>

            <button className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-surface">
              <MapPin size={14} className="text-primary-container" />
              <span>Cartagena</span>
            </button>
          </div>
        </header>
      )}

      {/* Sidebar removed per UX decision */}

      {/* CONTENIDO */}
      <main className="view-animate">
        <CartProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/tienda/:slug" element={<Shop />} />
            <Route path="/seguimiento" element={<SeguimientoPedido />} />
          </Routes>
        </CartProvider>
      </main>
    </div>
  );
};

export default Marketplace;
