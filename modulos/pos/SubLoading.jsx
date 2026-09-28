import React from "react";

export default function SubLoading({
  label = "",
  className = "",
  dotClassName = "bg-violet-400",
  fullHeight = false,
  compact = false,
}) {
  const containerClass = fullHeight
    ? "flex min-h-[220px] items-center justify-center"
    : compact
      ? "flex items-center justify-center py-8"
      : "flex items-center justify-center py-16";

  return (
    <div className={`${containerClass} ${className}`.trim()}>
      <div className="flex flex-col items-center justify-center gap-3">
        <div className="flex items-center justify-center gap-2">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className={`h-2.5 w-2.5 animate-pulse rounded-full ${dotClassName}`}
              style={{ animationDelay: `${dot * 150}ms` }}
            />
          ))}
        </div>

        {label && (
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">
            {label}
          </p>
        )}
      </div>
    </div>
  );
}
