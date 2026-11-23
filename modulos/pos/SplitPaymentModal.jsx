import React, { useState } from "react";

const formatPrice = (price) => {
  return Math.round(price)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

export default function SplitPaymentModal({
  isOpen,
  onClose,
  total,
  splitPayments,
  updateSplitPayment,
  initializeSplits,
  removePaymentRow,
  availablePaymentMethods = ["efectivo", "tarjeta", "transferencia"],
}) {
  const [deletingIndex, setDeletingIndex] = useState(null);

  if (!isOpen) return null;

  const handleRemovePaymentRow = (index) => {
    setDeletingIndex(index);
    setTimeout(() => {
      removePaymentRow(index);
      setDeletingIndex(null);
    }, 300);
  };

  const totalAssigned = splitPayments.reduce(
    (sum, pay) => sum + (parseFloat(pay.amount) || 0),
    0,
  );
  const remaining = total - totalAssigned;
  const isSplitPaymentsComplete = splitPayments.every(
    (pay) => pay.method && pay.amount && Number(pay.amount) > 0,
  );

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
      <div className="bg-background shadow-2xl w-full max-w-md rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-background px-3 py-3 flex justify-between items-center">
          <h2 className="text-base font-black uppercase tracking-tight text-on-surface">
            Dividir Pago
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface transition-colors"
            aria-label="Cerrar división de pago"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-sidebar px-3 py-4 space-y-2">
          <div className="rounded-3xl bg-surface/5 p-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[8px] uppercase tracking-[0.24em] text-on-surface-variant">
                  Total sin propina
                </p>
                <p className="mt-1 text-lg font-black text-primary">
                  ${formatPrice(total)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[8px] uppercase tracking-[0.24em] text-on-surface-variant">
                  {remaining === 0
                    ? "Equilibrado"
                    : remaining < 0
                      ? "Sobra"
                      : "Faltante"}
                </p>
                <p
                  className={`mt-1 text-base font-black ${
                    remaining === 0
                      ? "text-success"
                      : remaining < 0
                        ? "text-success"
                        : "text-error"
                  }`}
                >
                  {remaining === 0
                    ? "✓"
                    : `$${formatPrice(Math.abs(remaining))}`}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-surface/5 divide-y divide-white/10">
            {splitPayments.map((pay, index) => (
              <div
                key={index}
                className={`w-full mx-auto flex items-center justify-between gap-2 p-1.5 transition-opacity duration-300 ${
                  deletingIndex === index ? "opacity-0" : "opacity-100"
                }`}
              >
                <div className="w-8 h-8 rounded-2xl bg-surface/30 text-on-surface font-black flex items-center justify-center text-xs">
                  {index + 1}
                </div>

                <div className="min-w-[90px] max-w-[100px]">
                  <select
                    value={pay.method}
                    onChange={(e) =>
                      updateSplitPayment(index, "method", e.target.value)
                    }
                    className="w-full bg-background text-on-surface text-[11px] font-bold rounded-2xl px-2 py-1 outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="" disabled>
                      Seleccionar
                    </option>
                    {availablePaymentMethods.includes("efectivo") && (
                      <option value="efectivo">Efectivo</option>
                    )}
                    {availablePaymentMethods.includes("tarjeta") && (
                      <option value="tarjeta">Tarjeta</option>
                    )}
                    {availablePaymentMethods.includes("transferencia") && (
                      <option value="transferencia">Transferencia</option>
                    )}
                  </select>
                </div>

                <div className="min-w-[130px] max-w-[1300px]">
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-[10px] font-black">
                      $
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={
                        pay.amount
                          ? formatPrice(parseFloat(pay.amount) || 0)
                          : ""
                      }
                      onChange={(e) => {
                        const numValue = e.target.value.replace(/\D/g, "");
                        updateSplitPayment(index, "amount", numValue);
                      }}
                      className="w-full bg-background text-on-surface text-[11px] font-black rounded-2xl px-2 py-1.5 pl-7 outline-none focus:ring-2 focus:ring-primary/30 text-right"
                      placeholder="0"
                    />
                  </div>
                </div>

                {splitPayments.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemovePaymentRow(index)}
                    aria-label={`Eliminar pago ${index + 1}`}
                    className="flex h-8 w-8 items-center justify-center rounded-2xl bg-surface/20 text-error hover:text-error/80 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">
                      close
                    </span>
                  </button>
                )}
              </div>
            ))}
            <div className="p-3">
              <button
                type="button"
                onClick={() => initializeSplits(splitPayments.length + 1)}
                className="w-full rounded-2xl border border-outline bg-background text-on-surface font-bold py-3 text-[11px] uppercase tracking-[0.2em] transition-all hover:border-primary hover:text-primary"
              >
                Añadir
              </button>
            </div>
          </div>
        </div>

        {!isSplitPaymentsComplete && (
          <div className="bg-warning/10 border border-warning/30 text-warning rounded-2xl px-3 py-2 text-[10px] text-center font-bold mb-2 mx-6">
            Selecciona método y monto para cada pago antes de confirmar.
          </div>
        )}
        <div className="bg-background px-3 py-3 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-surface hover:bg-surface-hover text-on-surface font-bold py-2 rounded-lg transition-all text-[9px] uppercase"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={remaining > 0 || !isSplitPaymentsComplete}
            className={`flex-1 font-bold py-2 rounded-lg transition-all text-[9px] uppercase ${
              remaining > 0 || !isSplitPaymentsComplete
                ? "bg-surface text-on-surface-variant cursor-not-allowed"
                : "bg-primary-container hover:bg-success text-on-surface"
            }`}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
