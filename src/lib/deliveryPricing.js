const isInTimeRange = (time, start, end) =>
  start < end
    ? time >= start && time < end
    : time >= start || time < end;

export const calculateTipAmount = (itemsSubtotal, deliveryFee, tipPercent) => {
  const percent = Math.max(0, Math.min(100, Number(tipPercent) || 0));
  return Math.round(
    ((Number(itemsSubtotal) || 0) + (Number(deliveryFee) || 0)) *
      (percent / 100),
  );
};

export const calculateDeliveryPricing = (
  settings,
  distanceMeters,
  currentTime = new Date(),
) => {
  const deliveryRate = Number(settings?.delivery_fee_per_km);
  const minimumDeliveryFee = Number(settings?.min_delivery_fee);
  const maximumDeliveryFee = Number(settings?.max_delivery_fee);
  const configured =
    settings?.delivery_fee_per_km !== null &&
    settings?.delivery_fee_per_km !== undefined &&
    settings?.min_delivery_fee !== null &&
    settings?.min_delivery_fee !== undefined &&
    settings?.max_delivery_fee !== null &&
    settings?.max_delivery_fee !== undefined &&
    Number.isFinite(deliveryRate) &&
    Number.isFinite(minimumDeliveryFee) &&
    Number.isFinite(maximumDeliveryFee) &&
    minimumDeliveryFee <= maximumDeliveryFee;
  const distanceKm =
    distanceMeters == null ? null : Number(distanceMeters) / 1000;
  const rawDeliveryFee =
    configured && Number.isFinite(distanceKm)
      ? Math.max(minimumDeliveryFee, Math.round(distanceKm * deliveryRate))
      : null;
  const roundedDeliveryFee =
    rawDeliveryFee === null ? null : Math.ceil(rawDeliveryFee / 100) * 100;
  const baseDeliveryFee =
    roundedDeliveryFee === null
      ? null
      : Math.min(maximumDeliveryFee, roundedDeliveryFee);
  const surchargeStart = String(
    settings?.night_delivery_surcharge_start || "",
  ).slice(0, 5);
  const surchargeEnd = String(
    settings?.night_delivery_surcharge_end || "",
  ).slice(0, 5);
  const currentDeliveryTime = `${String(currentTime.getHours()).padStart(2, "0")}:${String(currentTime.getMinutes()).padStart(2, "0")}`;
  const nightSurchargePercent =
    Number(settings?.night_delivery_surcharge_percent) || 0;
  const isNightSurchargeTime =
    Boolean(settings?.night_delivery_surcharge_enabled) &&
    Boolean(surchargeStart && surchargeEnd && surchargeStart !== surchargeEnd) &&
    isInTimeRange(currentDeliveryTime, surchargeStart, surchargeEnd);
  const nightSurcharge =
    baseDeliveryFee !== null && isNightSurchargeTime
      ? Math.ceil(
          Math.round((baseDeliveryFee * nightSurchargePercent) / 100) / 100,
        ) * 100
      : 0;

  return {
    configured,
    baseDeliveryFee,
    nightSurcharge,
    nightSurchargePercent,
    deliveryFee: baseDeliveryFee === null ? 0 : baseDeliveryFee + nightSurcharge,
  };
};
