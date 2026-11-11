import React, { useEffect, useState } from "react";

const MarketplaceLoading = ({ ready = false, onComplete }) => {
  const [progress, setProgress] = useState(4);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (ready) {
      setProgress(100);
      const timer = window.setTimeout(() => onComplete?.(), 350);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setInterval(() => {
      setProgress((current) =>
        current >= 92
          ? 92
          : Math.min(
              92,
              current + Math.max(0.4, (92 - current) * 0.035),
            ),
      );
    }, 60);
    return () => window.clearInterval(timer);
  }, [ready, onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[100] overflow-hidden overscroll-none bg-[#09080f] transition-opacity duration-300 ${
        ready ? "opacity-0" : "opacity-100"
      }`}
      role="status"
      aria-live="polite"
      aria-label="Cargando Gloto"
    >
      <style>{`
      @keyframes gloto-orbit {
        to { transform: rotate(360deg); }
      }
      @keyframes gloto-float {
        0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: .38; }
        50% { transform: translate3d(0, -14px, 0) scale(1.08); opacity: .65; }
      }
      @keyframes gloto-logo-breathe {
        0%, 100% { transform: translateY(0) scale(1); }
        50% { transform: translateY(-5px) scale(1.06); }
      }
      @media (prefers-reduced-motion: reduce) {
        .gloto-motion { animation: none !important; }
        .gloto-progress-fill { transition: none !important; }
      }
      @media (max-height: 480px) {
        .gloto-loader-mark { transform: scale(.72); margin-bottom: .5rem; }
        .gloto-loader-content { padding-top: 1rem; padding-bottom: 1rem; }
      }
    `}</style>
      <div className="relative flex min-h-[100vh] min-h-[100svh] w-full items-center justify-center px-4 py-8 [padding-bottom:calc(2rem+env(safe-area-inset-bottom))] [padding-left:calc(1rem+env(safe-area-inset-left))] [padding-right:calc(1rem+env(safe-area-inset-right))] [padding-top:calc(2rem+env(safe-area-inset-top))] sm:px-6">
        <div
          aria-hidden="true"
          className="gloto-motion pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-violet-600/20 blur-[80px] sm:-left-28 sm:-top-32 sm:h-80 sm:w-80 sm:blur-[100px]"
          style={{ animation: "gloto-float 5s ease-in-out infinite" }}
        />
        <div
          aria-hidden="true"
          className="gloto-motion pointer-events-none absolute -bottom-28 -right-20 h-72 w-72 rounded-full bg-fuchsia-600/10 blur-[90px] sm:-bottom-36 sm:-right-24 sm:h-96 sm:w-96 sm:blur-[110px]"
          style={{ animation: "gloto-float 6s ease-in-out infinite reverse" }}
        />

        <div className="gloto-loader-content relative flex w-full max-w-md flex-col items-center py-4 text-center">
          <div className="gloto-loader-mark relative mb-6 flex h-28 w-28 items-center justify-center sm:mb-8 sm:h-36 sm:w-36">
            <div className="absolute inset-3 rounded-full bg-violet-500/20 blur-2xl sm:inset-4" />
            <div className="absolute inset-1 rounded-full border border-white/[0.08]" />
            <div
              className="gloto-motion absolute inset-0 rounded-full border border-transparent border-t-violet-300/80"
              style={{ animation: "gloto-orbit 2.8s linear infinite" }}
            >
              <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-violet-300 shadow-[0_0_16px_rgba(196,181,253,0.9)] sm:h-2.5 sm:w-2.5" />
            </div>
            <div className="relative flex h-20 w-20 items-center justify-center sm:h-24 sm:w-24">
              <img
                src="/logo.png"
                alt=""
                className="gloto-motion h-14 w-14 object-contain sm:h-[68px] sm:w-[68px]"
                style={{
                  animation: "gloto-logo-breathe 2.8s ease-in-out infinite",
                }}
              />
            </div>
          </div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.38em] text-violet-200/80 sm:text-[11px] sm:tracking-[0.42em]">
            GLOTO
          </p>
          <h1 className="mt-3 text-xl font-black tracking-tight text-white sm:text-3xl">
            Algo bueno viene
          </h1>
          <p className="mt-2 max-w-xs text-xs leading-5 text-white/55 sm:text-sm sm:leading-6">
            Estamos encontrando los mejores lugares para ti.
          </p>
          <div
            className="mt-7 h-1 w-36 overflow-hidden rounded-full bg-white/10 sm:mt-8 sm:w-48"
            aria-hidden="true"
          >
            <div
              className="gloto-progress-fill h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-300 to-violet-400 shadow-[0_0_12px_rgba(167,139,250,0.55)]"
              style={{
                width: `${progress}%`,
                transition: "width 180ms ease-out",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketplaceLoading;
