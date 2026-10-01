import React from "react";
import { ShieldCheck } from "lucide-react";

const SuperAdminSectionShell = ({
  title,
  subtitle,
  badge,
  actions,
  children,
}) => {
  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-violet-500/20 bg-neutral-900/80 p-5 shadow-[0_16px_40px_rgba(76,29,149,0.18)] backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
              <ShieldCheck size={16} />
            </span>
            {badge && (
              <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-violet-200">
                {badge}
              </span>
            )}
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>
          )}
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </header>

      <div className="space-y-6">{children}</div>
    </section>
  );
};

export default SuperAdminSectionShell;
