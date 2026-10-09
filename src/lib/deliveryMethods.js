export const DELIVERY_METHODS = [
  { id: "pickup", label: "Recoger" },
  { id: "table", label: "En mesa" },
  { id: "point", label: "En punto" },
  { id: "delivery", label: "Domicilio" },
];

export const DEFAULT_DELIVERY_METHODS = DELIVERY_METHODS.map(
  ({ id }) => id,
);

export const getEnabledDeliveryMethods = (methods) => {
  if (!Array.isArray(methods)) return DEFAULT_DELIVERY_METHODS;

  const enabledMethods = DELIVERY_METHODS.filter(({ id }) =>
    methods.includes(id),
  ).map(({ id }) => id);

  return enabledMethods.length ? enabledMethods : DEFAULT_DELIVERY_METHODS;
};
