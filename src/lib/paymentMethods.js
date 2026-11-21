export const PAYMENT_METHODS = [
  { id: "Efectivo", label: "Efectivo" },
  { id: "Tarjeta", label: "Tarjeta" },
  { id: "Transferencia", label: "Transferencia" },
];

export const DEFAULT_PAYMENT_METHODS = PAYMENT_METHODS.map(({ id }) => id);

export const getEnabledPaymentMethods = (methods) => {
  if (!Array.isArray(methods)) return DEFAULT_PAYMENT_METHODS;

  const enabledMethods = PAYMENT_METHODS.filter(({ id }) =>
    methods.includes(id),
  ).map(({ id }) => id);

  return enabledMethods.length ? enabledMethods : DEFAULT_PAYMENT_METHODS;
};
