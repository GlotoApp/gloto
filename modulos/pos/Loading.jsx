// ⏱️ Duración mínima del loading en milisegundos
const LOADING_DURATION_MS = 1500;

export { default as SubLoading } from "./SubLoading";
export { default as SectionLoading } from "./SubLoading";

export const Loading = () => {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background">
      <div className="relative flex items-center justify-center">
        <img
          src="/logo.png"
          alt="Cargando Gloto"
          className="relative h-[72px] w-[72px] object-contain"
          style={{
            animation:
              "logoIn 0.6s ease-out forwards, glowPulse 3s ease-in-out infinite",
          }}
        />
      </div>

      <style>{`
        @keyframes logoIn {
          0%   { opacity: 0; transform: scale(0.88); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes glowPulse {
          0%, 100% { filter: drop-shadow(0px 0px 4px var(--color-primary-container)); }
          50%       { filter: drop-shadow(0px 0px 18px var(--color-primary-container)); }
        }
      `}</style>
    </div>
  );
};

export { LOADING_DURATION_MS };
