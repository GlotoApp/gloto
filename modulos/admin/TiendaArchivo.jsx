import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Banknote,
  Ban,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Image as ImageIcon,
  KeyRound,
  LocateFixed,
  LoaderCircle,
  MapPin,
  Percent,
  PencilLine,
  Plus,
  Store,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import {
  removeStorageObjectIfUnused,
  supabase,
} from "../../src/lib/supabaseClient";
import { compressCanvasToWebP } from "../../src/lib/imageCompression";
import TiendaDetalle from "./TiendaDetalle";

const WEEKDAYS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 7, label: "Domingo" },
];

const createDefaultShift = () => ({
  openTime: "09:00",
  closeTime: "18:00",
  closeDay: "same",
});

const formatCurrency = (amount) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);

const convertImageToWebP = async (file) => {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = imageUrl;
    await image.decode();

    const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la imagen.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await compressCanvasToWebP(canvas);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
};

const normalizeBusinessHours = (rows = []) =>
  WEEKDAYS.map(({ value, label }) => {
    const openRows = rows
      .filter((row) => row.day_of_week === value && row.is_open)
      .sort((first, second) => first.shift_index - second.shift_index);

    return {
      dayOfWeek: value,
      label,
      isOpen: openRows.length > 0,
      shifts: openRows.slice(0, 2).map((row) => ({
        openTime: String(row.open_time || "").slice(0, 5),
        closeTime: String(row.close_time || "").slice(0, 5),
        closeDay: row.close_day || "same",
      })),
    };
  });

const normalizeBusinessData = (business, info, subscription, notifications) => {
  const businessNotifications = notifications || [];

  return {
    ...business,
    info: info || {},
    subscription: subscription || null,
    notifications: businessNotifications,
    unreadNotifications: businessNotifications.filter(
      (notification) => !notification.read_at,
    ).length,
    planName: subscription?.plan_name || "Sin plan",
    category: info?.category?.name || info?.categoria || "Sin categoría",
    address: info?.address || "Sin dirección",
    phone: info?.whatsapp_phone || "Sin WhatsApp",
    rating: info?.rating ?? null,
  };
};

const setMapInteraction = (map, element, enabled) => {
  [
    "dragging",
    "touchZoom",
    "doubleClickZoom",
    "scrollWheelZoom",
    "boxZoom",
    "keyboard",
  ].forEach((handlerName) => {
    const handler = map[handlerName];
    if (!handler) return;
    if (enabled) handler.enable();
    else handler.disable();
  });

  if (element) {
    element.style.pointerEvents = enabled ? "auto" : "none";
    const controls = element.querySelector(".leaflet-control-container");
    if (controls) controls.style.pointerEvents = enabled ? "auto" : "none";
  }
};

const TiendaArchivo = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [store, setStore] = useState(null);
  const [detail, setDetail] = useState(null);
  const [businessSchedule, setBusinessSchedule] = useState([]);
  const [shopCategories, setShopCategories] = useState([]);
  const [inventoryCategories, setInventoryCategories] = useState([]);
  const [billingPlans, setBillingPlans] = useState([]);
  const [billingPeriods, setBillingPeriods] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [changingPlan, setChangingPlan] = useState(false);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [locationEditMode, setLocationEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suspensionDialogOpen, setSuspensionDialogOpen] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState("");
  const [suspensionError, setSuspensionError] = useState("");
  const [suspensionSaving, setSuspensionSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingBusiness, setDeletingBusiness] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordResetUsers, setPasswordResetUsers] = useState([]);
  const [selectedPasswordUserId, setSelectedPasswordUserId] = useState("");
  const [passwordResetCredentials, setPasswordResetCredentials] =
    useState(null);
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [passwordResetError, setPasswordResetError] = useState("");
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const logoInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const mapElementRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const locationEditModeRef = useRef(false);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    category: "",
    address: "",
    phone: "",
    latitude: "",
    longitude: "",
    deliveryFeePerKm: "",
    minDeliveryFee: "",
    maxDeliveryFee: "",
    taxRate: "",
    is_active: true,
  });

  const resetFormFromStore = () => {
    if (!store) return;

    setFormData({
      name: store.name || "",
      slug: store.slug || "",
      category: store.info?.category_id || store.info?.categoria || "",
      address: store.address || "",
      phone: store.phone || "",
      latitude: store.info?.latitude ?? "",
      longitude: store.info?.longitude ?? "",
      deliveryFeePerKm: store.info?.delivery_fee_per_km ?? "",
      minDeliveryFee: store.info?.min_delivery_fee ?? "",
      maxDeliveryFee: store.info?.max_delivery_fee ?? "",
      taxRate: store.info?.tax_rate ?? "",
      is_active: Boolean(store.is_active),
    });
    setBusinessSchedule(normalizeBusinessHours(detail?.businessHours || []));
    setShopCategories(detail?.shopCategories || []);
    setInventoryCategories(detail?.inventoryCategories || []);
  };

  const uploadImage = async (event, type) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !id) return;

    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      alert("Selecciona una imagen de máximo 5 MB.");
      return;
    }

    let uploadedPath = null;
    try {
      setSaving(true);

      const webpBlob = await convertImageToWebP(file);
      const folder = type === "cover" ? "portadas-negocios" : "logos-negocio";
      uploadedPath = `${id}/${folder}/${type}-${Date.now()}.webp`;

      const { error: uploadError } = await supabase.storage
        .from("business-assets")
        .upload(uploadedPath, webpBlob, {
          contentType: "image/webp",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from("business-assets")
        .getPublicUrl(uploadedPath);

      const previousUrl = type === "logo" ? logoUrl : coverUrl;
      const url = publicData?.publicUrl;

      if (!url) {
        throw new Error("No se pudo generar la URL pública de la imagen.");
      }

      const { error: updateError } = await supabase
        .from("businesses")
        .update({ [type === "logo" ? "logo_url" : "cover_url"]: url })
        .eq("id", id);

      if (updateError) throw updateError;

      if (type === "logo") {
        setLogoUrl(url);
        setStore((current) =>
          current ? { ...current, logo_url: url } : current,
        );
      } else {
        setCoverUrl(url);
        setStore((current) =>
          current ? { ...current, cover_url: url } : current,
        );
      }

      if (previousUrl && previousUrl !== url) {
        try {
          await removeStorageObjectIfUnused("business-assets", previousUrl);
        } catch (cleanupError) {
          console.error("No se pudo limpiar la imagen anterior:", cleanupError);
          alert(
            "La imagen se actualizó, pero no se pudo borrar la imagen anterior de Supabase.",
          );
        }
      }
    } catch (error) {
      console.error("Error subiendo la imagen:", error);
      let cleanupFailed = false;
      if (uploadedPath) {
        try {
          await removeStorageObjectIfUnused("business-assets", uploadedPath);
        } catch (cleanupError) {
          cleanupFailed = true;
          console.error(
            "No se pudo limpiar la imagen de tienda que no quedó guardada:",
            cleanupError,
          );
        }
      }
      alert(
        cleanupFailed
          ? "No se pudo guardar la imagen ni limpiar el archivo temporal de Supabase."
          : error.message || "No se pudo subir la imagen de la tienda.",
      );
    } finally {
      setSaving(false);
    }
  };

  const loadStoreData = async () => {
    if (!id) {
      setStore(null);
      setDetail(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        businessResult,
        infoResult,
        subscriptionsResult,
        notificationsResult,
        categoriesResult,
        shopCategoriesResult,
        inventoryCategoriesResult,
        billingPeriodsResult,
      ] = await Promise.all([
        supabase
          .from("businesses")
          .select(
            "id,name,slug,logo_url,cover_url,is_active,admin_suspended,admin_suspension_reason,admin_suspended_at,created_at",
          )
          .eq("id", id)
          .single(),
        supabase
          .from("business_info")
          .select(
            "business_id,category_id,categoria,address,whatsapp_phone,delivery_time_min,delivery_time_max,rating,rating_count,delivery_fee_per_km,min_delivery_fee,max_delivery_fee,currency,tax_rate,latitude,longitude",
          )
          .eq("business_id", id)
          .maybeSingle(),
        supabase
          .from("subscriptions")
          .select(
            "id,business_id,plan_code,period_id,plan_name,status,amount,billing_period,starts_at,ends_at",
          )
          .eq("business_id", id)
          .in("status", ["active", "suspended", "expired"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("business_notifications")
          .select(
            "id,business_id,title,notification_type,severity,message,action_path,created_at,read_at,resolved_at",
          )
          .eq("business_id", id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("categories")
          .select("id,name")
          .order("name", { ascending: true }),
        supabase
          .from("categories_shop")
          .select(
            "id,business_id,name,description,icon_url,order_index,is_active",
          )
          .eq("business_id", id)
          .order("order_index", { ascending: true }),
        supabase
          .from("inventory_categories")
          .select("id,business_id,name,created_at")
          .eq("business_id", id)
          .order("name", { ascending: true }),
        supabase
          .from("billing_plan_periods")
          .select(
            "id,plan_code,plan_name,billing_type,plan_is_active,plan_display_order,code,label,duration_days,price_amount,commission_rate,minimum_amount,is_active,display_order",
          )
          .order("plan_display_order", { ascending: true }),
      ]);

      if (businessResult.error) throw businessResult.error;
      if (infoResult.error) throw infoResult.error;
      if (subscriptionsResult.error) throw subscriptionsResult.error;
      if (notificationsResult.error) throw notificationsResult.error;
      if (categoriesResult.error) {
        console.error("Error cargando categorías:", categoriesResult.error);
      }
      if (shopCategoriesResult.error) throw shopCategoriesResult.error;
      if (inventoryCategoriesResult.error) {
        throw inventoryCategoriesResult.error;
      }
      if (billingPeriodsResult.error) throw billingPeriodsResult.error;
      const planMap = new Map();
      (billingPeriodsResult.data || []).forEach((period) => {
        if (!planMap.has(period.plan_code)) {
          planMap.set(period.plan_code, {
            id: period.plan_code,
            code: period.plan_code,
            name: period.plan_name,
            billing_type: period.billing_type,
            is_active: period.plan_is_active,
            display_order: period.plan_display_order,
          });
        }
      });
      const billingPlans = Array.from(planMap.values()).sort(
        (first, second) =>
          Number(first.display_order) - Number(second.display_order),
      );

      const storeNormalized = normalizeBusinessData(
        businessResult.data,
        infoResult.data,
        subscriptionsResult.data,
        notificationsResult.data || [],
      );
      storeNormalized.category =
        categoriesResult.data?.find(
          (category) => category.id === infoResult.data?.category_id,
        )?.name || storeNormalized.category;

      const [productsResult, inventoryResult, hoursResult] = await Promise.all([
        supabase
          .from("products")
          .select("name,price,stock,is_active")
          .eq("business_id", id)
          .order("order_index", { ascending: true })
          .limit(20),
        supabase
          .from("inventory_items")
          .select("name,stock,min_stock,unit,is_active")
          .eq("business_id", id)
          .order("name", { ascending: true })
          .limit(20),
        supabase
          .from("business_hours")
          .select(
            "id,day_of_week,shift_index,is_open,open_time,close_time,close_day",
          )
          .eq("business_id", id)
          .order("day_of_week", { ascending: true }),
      ]);

      if (productsResult.error) throw productsResult.error;
      if (inventoryResult.error) throw inventoryResult.error;
      if (hoursResult.error) throw hoursResult.error;

      setStore(storeNormalized);
      setCategories(categoriesResult.data || []);
      setShopCategories(shopCategoriesResult.data || []);
      setInventoryCategories(inventoryCategoriesResult.data || []);
      setBillingPlans(billingPlans);
      setBillingPeriods(billingPeriodsResult.data || []);
      setLogoUrl(businessResult.data.logo_url || "");
      setCoverUrl(businessResult.data.cover_url || "");
      setDetail({
        products: productsResult.data || [],
        inventory: inventoryResult.data || [],
        businessHours: hoursResult.data || [],
        notifications: notificationsResult.data || [],
        shopCategories: shopCategoriesResult.data || [],
        inventoryCategories: inventoryCategoriesResult.data || [],
      });
      setBusinessSchedule(normalizeBusinessHours(hoursResult.data || []));
      const currentPlan = billingPlans.find(
        (plan) =>
          plan.code === subscriptionsResult.data?.plan_code ||
          plan.name === subscriptionsResult.data?.plan_name,
      );
      const currentPeriod =
        billingPeriodsResult.data?.find(
          (period) => period.id === subscriptionsResult.data?.period_id,
        ) ||
        billingPeriodsResult.data?.find(
          (period) =>
            period.plan_code === currentPlan?.code &&
            (period.label?.toLowerCase() ===
              subscriptionsResult.data?.billing_period?.toLowerCase() ||
              period.code?.toLowerCase() ===
                subscriptionsResult.data?.billing_period?.toLowerCase()),
        );
      setSelectedPlanId(currentPlan?.code || "");
      setSelectedPeriodId(currentPeriod?.id || "");
      setFormData({
        name: businessResult.data.name || "",
        slug: businessResult.data.slug || "",
        category:
          infoResult.data?.category_id || infoResult.data?.categoria || "",
        address: infoResult.data?.address || "",
        phone: infoResult.data?.whatsapp_phone || "",
        latitude: infoResult.data?.latitude ?? "",
        longitude: infoResult.data?.longitude ?? "",
        deliveryFeePerKm: infoResult.data?.delivery_fee_per_km ?? "",
        minDeliveryFee: infoResult.data?.min_delivery_fee ?? "",
        maxDeliveryFee: infoResult.data?.max_delivery_fee ?? "",
        taxRate: infoResult.data?.tax_rate ?? "",
        is_active: Boolean(businessResult.data.is_active),
      });
    } catch (error) {
      console.error("Error cargando la tienda:", error);
      setStore(null);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStoreData();
  }, [id]);

  useEffect(() => {
    if (!editMode || !mapElementRef.current) return undefined;

    let isMounted = true;
    let map;
    const latitude = Number(formData.latitude);
    const longitude = Number(formData.longitude);
    const hasCoordinates =
      String(formData.latitude).trim() !== "" &&
      String(formData.longitude).trim() !== "" &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude);
    const initialCenter = hasCoordinates
      ? [latitude, longitude]
      : [10.373842, -75.473796];

    import("leaflet").then((leafletModule) => {
      if (!isMounted || !mapElementRef.current) return;

      const L = leafletModule.default;
      map = L.map(mapElementRef.current, { zoomControl: true }).setView(
        initialCenter,
        hasCoordinates ? 15 : 12,
      );

      const tileLayer = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        },
      ).addTo(map);

      map.on("moveend", () => {
        if (!locationEditModeRef.current) return;
        const center = map.getCenter();
        setFormData((current) => ({
          ...current,
          latitude: Number(center.lat).toFixed(6),
          longitude: Number(center.lng).toFixed(6),
        }));
      });

      mapInstanceRef.current = map;
      setMapInteraction(
        map,
        mapElementRef.current,
        locationEditModeRef.current,
      );
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => map?.invalidateSize({ pan: false })),
      );
    });

    return () => {
      isMounted = false;
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, [editMode]);

  useEffect(() => {
    locationEditModeRef.current = locationEditMode;
  }, [locationEditMode]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!editMode || !map) return;

    setMapInteraction(map, mapElementRef.current, locationEditMode);

    if (locationEditMode) {
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => {
          if (mapInstanceRef.current !== map) return;
          map.invalidateSize({ pan: false });
        }),
      );
    }
  }, [editMode, locationEditMode]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const latitude = Number(formData.latitude);
    const longitude = Number(formData.longitude);
    if (
      !editMode ||
      !locationEditMode ||
      !map ||
      String(formData.latitude).trim() === "" ||
      String(formData.longitude).trim() === "" ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return;
    }

    const center = map.getCenter();
    if (
      Math.abs(center.lat - latitude) > 0.000001 ||
      Math.abs(center.lng - longitude) > 0.000001
    ) {
      map.setView([latitude, longitude], Math.max(map.getZoom(), 15), {
        animate: false,
      });
    }
  }, [editMode, locationEditMode, formData.latitude, formData.longitude]);

  const toggleEditMode = () => {
    if (!store) return;

    if (!editMode) {
      resetFormFromStore();
      setLocationEditMode(false);
    } else {
      setLocationEditMode(false);
    }

    setEditMode((current) => !current);
  };

  const handleFieldChange = (key, value) => {
    setFormData((current) => ({ ...current, [key]: value }));
  };

  const selectedPlan = billingPlans.find((plan) => plan.id === selectedPlanId);
  const availablePlans = billingPlans.filter(
    (plan) => plan.is_active || plan.id === selectedPlanId,
  );
  const availablePeriods = billingPeriods.filter(
    (period) =>
      period.plan_code === selectedPlanId &&
      ((period.is_active && period.plan_is_active) ||
        period.id === selectedPeriodId),
  );
  const selectedPeriod = availablePeriods.find(
    (period) => period.id === selectedPeriodId,
  );
  const subscriptionEndDate = store?.subscription?.ends_at
    ? new Date(store.subscription.ends_at)
    : null;
  const subscriptionRemainingDays =
    subscriptionEndDate && Number.isFinite(subscriptionEndDate.getTime())
      ? Math.ceil((subscriptionEndDate.getTime() - Date.now()) / 86400000)
      : null;
  const subscriptionStatusLabels = {
    active: "Activo",
    pending: "Pendiente",
    expired: "Vencido",
    cancelled: "Cancelado",
  };
  const currentSubscriptionStatus =
    store?.subscription?.status === "active" &&
    subscriptionRemainingDays !== null &&
    subscriptionRemainingDays <= 0
      ? "Vencido"
      : subscriptionStatusLabels[store?.subscription?.status] ||
        "Sin suscripción";

  const handlePlanChange = (planId) => {
    setSelectedPlanId(planId);
    const firstPeriod = billingPeriods.find(
      (period) =>
        period.plan_code === planId &&
        period.plan_is_active &&
        period.is_active,
    );
    setSelectedPeriodId(firstPeriod?.id || "");
  };

  const applyPlanChange = async () => {
    const period = availablePeriods.find(
      (item) => item.id === selectedPeriodId && item.is_active,
    );
    if (!id || !selectedPlan || !period) {
      alert("Selecciona un plan y un período activo.");
      return;
    }
    if (
      !window.confirm(
        `¿Aplicar el plan ${selectedPlan.name} (${period.label}) ahora? La suscripción anterior se cancelará; sus pagos permanecerán en el historial.`,
      )
    ) {
      return;
    }

    try {
      setChangingPlan(true);
      const { error } = await supabase.rpc(
        "change_business_subscription_plan",
        {
          p_business_id: id,
          p_plan_code: selectedPlan.code,
          p_period_id: period.id,
        },
      );
      if (error) throw error;

      await loadStoreData();
      alert(`Plan ${selectedPlan.name} aplicado correctamente.`);
    } catch (error) {
      console.error("No se pudo cambiar el plan de la tienda:", error);
      alert(error?.message || "No se pudo cambiar el plan de la tienda.");
    } finally {
      setChangingPlan(false);
    }
  };

  const updateScheduleDay = (dayOfWeek, update) => {
    setBusinessSchedule((current) =>
      current.map((day) => (day.dayOfWeek === dayOfWeek ? update(day) : day)),
    );
  };

  const updateShopCategory = (categoryKey, field, value) => {
    setShopCategories((current) =>
      current.map((category, index) =>
        (category.id || category._draftId) === categoryKey
          ? { ...category, [field]: value }
          : category,
      ),
    );
  };

  const addShopCategory = () => {
    setShopCategories((current) => [
      ...current,
      {
        business_id: id,
        name: "",
        description: "",
        icon_url: null,
        _draftId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        order_index: current.length,
        is_active: true,
      },
    ]);
  };

  const removeNewShopCategory = (categoryKey) => {
    setShopCategories((current) =>
      current.filter(
        (category) => category.id || category._draftId !== categoryKey,
      ),
    );
  };

  const updateInventoryCategory = (categoryKey, name) => {
    setInventoryCategories((current) =>
      current.map((category) =>
        (category.id || category._draftId) === categoryKey
          ? { ...category, name }
          : category,
      ),
    );
  };

  const addInventoryCategory = () => {
    setInventoryCategories((current) => [
      ...current,
      {
        business_id: id,
        name: "",
        _draftId: `inventory-draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      },
    ]);
  };

  const removeNewInventoryCategory = (categoryKey) => {
    setInventoryCategories((current) =>
      current.filter(
        (category) => category.id || category._draftId !== categoryKey,
      ),
    );
  };

  const toggleScheduleDay = (dayOfWeek) => {
    updateScheduleDay(dayOfWeek, (day) => {
      const isOpen = !day.isOpen;
      return {
        ...day,
        isOpen,
        shifts:
          isOpen && day.shifts.length === 0
            ? [createDefaultShift()]
            : day.shifts,
      };
    });
  };

  const updateScheduleShift = (dayOfWeek, shiftIndex, field, value) => {
    updateScheduleDay(dayOfWeek, (day) => ({
      ...day,
      shifts: day.shifts.map((shift, index) =>
        index === shiftIndex ? { ...shift, [field]: value } : shift,
      ),
    }));
  };

  const addScheduleShift = (dayOfWeek) => {
    updateScheduleDay(dayOfWeek, (day) =>
      day.shifts.length >= 2
        ? day
        : {
            ...day,
            isOpen: true,
            shifts: [...day.shifts, createDefaultShift()],
          },
    );
  };

  const removeScheduleShift = (dayOfWeek, shiftIndex) => {
    updateScheduleDay(dayOfWeek, (day) => ({
      ...day,
      shifts: day.shifts.filter((_, index) => index !== shiftIndex),
    }));
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Tu navegador no permite obtener la ubicación.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        handleFieldChange("latitude", coords.latitude.toFixed(6));
        handleFieldChange("longitude", coords.longitude.toFixed(6));
      },
      () =>
        alert(
          "No se pudo obtener la ubicación. Revisa los permisos del navegador.",
        ),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleSave = async () => {
    if (!id) return;

    try {
      setSaving(true);

      const latitude = Number(formData.latitude);
      const longitude = Number(formData.longitude);

      if (
        formData.latitude !== "" &&
        (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
      ) {
        throw new Error("La latitud debe estar entre -90 y 90.");
      }

      if (
        formData.longitude !== "" &&
        (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
      ) {
        throw new Error("La longitud debe estar entre -180 y 180.");
      }

      const costFields = [
        ["Tarifa por kilómetro", formData.deliveryFeePerKm],
        ["Costo mínimo de domicilio", formData.minDeliveryFee],
        ["Costo máximo de domicilio", formData.maxDeliveryFee],
        ["Impuesto", formData.taxRate],
      ];
      const parsedCosts = Object.fromEntries(
        costFields.map(([label, value]) => {
          if (value === "") return [label, null];
          const parsed = Number(value);
          if (!Number.isFinite(parsed) || parsed < 0) {
            throw new Error(
              `${label} debe ser un número igual o mayor a cero.`,
            );
          }
          return [label, parsed];
        }),
      );

      if (parsedCosts.Impuesto !== null && parsedCosts.Impuesto > 100) {
        throw new Error("El impuesto debe estar entre 0 y 100%.");
      }

      if (
        parsedCosts["Costo mínimo de domicilio"] !== null &&
        parsedCosts["Costo máximo de domicilio"] !== null &&
        parsedCosts["Costo mínimo de domicilio"] >
          parsedCosts["Costo máximo de domicilio"]
      ) {
        throw new Error(
          "El costo mínimo de domicilio no puede superar el máximo.",
        );
      }

      const normalizedShopCategories = shopCategories.map((category) => ({
        ...category,
        name: category.name.trim(),
      }));
      const emptyShopCategory = normalizedShopCategories.find(
        (category) => !category.name,
      );
      if (emptyShopCategory) {
        throw new Error("Escribe el nombre de cada categoría de la tienda.");
      }

      const uniqueShopCategoryNames = new Set(
        normalizedShopCategories.map((category) => category.name.toLowerCase()),
      );
      if (uniqueShopCategoryNames.size !== normalizedShopCategories.length) {
        throw new Error("No puede haber nombres de categoría repetidos.");
      }

      const shopCategoryPayload = normalizedShopCategories.map(
        (category, index) => ({
          ...(category.id ? { id: category.id } : {}),
          business_id: id,
          name: category.name,
          description: category.description?.trim() || null,
          icon_url: category.icon_url || null,
          order_index: Number.isFinite(Number(category.order_index))
            ? Number(category.order_index)
            : index,
          is_active: Boolean(category.is_active),
        }),
      );

      const normalizedInventoryCategories = inventoryCategories.map(
        (category) => ({
          ...category,
          name: String(category.name || "")
            .trim()
            .toUpperCase(),
        }),
      );
      if (normalizedInventoryCategories.some((category) => !category.name)) {
        throw new Error("Escribe el nombre de cada categoría de inventario.");
      }

      const uniqueInventoryCategoryNames = new Set(
        normalizedInventoryCategories.map((category) => category.name),
      );
      if (
        uniqueInventoryCategoryNames.size !==
        normalizedInventoryCategories.length
      ) {
        throw new Error("No puede haber nombres repetidos en inventario.");
      }

      const inventoryCategoryPayload = normalizedInventoryCategories.map(
        (category) => ({
          ...(category.id ? { id: category.id } : {}),
          business_id: id,
          name: category.name,
        }),
      );

      const businessPayload = {
        name: formData.name.trim(),
        slug: formData.slug.trim(),
        logo_url: logoUrl || null,
        cover_url: coverUrl || null,
        is_active: formData.is_active,
      };

      const infoPayload = {
        category_id:
          categories.find((category) => category.id === formData.category)
            ?.id || null,
        categoria:
          categories.find((category) => category.id === formData.category)
            ?.name || formData.category.trim(),
        address: formData.address.trim(),
        whatsapp_phone: formData.phone.trim(),
        latitude: formData.latitude === "" ? null : Number(formData.latitude),
        longitude:
          formData.longitude === "" ? null : Number(formData.longitude),
        delivery_fee_per_km: parsedCosts["Tarifa por kilómetro"],
        min_delivery_fee: parsedCosts["Costo mínimo de domicilio"],
        max_delivery_fee: parsedCosts["Costo máximo de domicilio"],
        tax_rate: parsedCosts.Impuesto,
      };

      const scheduleRows = businessSchedule.flatMap((day) => {
        if (!day.isOpen) {
          return [
            {
              business_id: id,
              day_of_week: day.dayOfWeek,
              shift_index: 0,
              is_open: false,
              open_time: "00:00",
              close_time: "00:00",
              close_day: "next",
            },
          ];
        }

        if (!day.shifts.length || day.shifts.length > 2) {
          throw new Error(`Configura uno o dos turnos para ${day.label}.`);
        }

        return day.shifts.map((shift, shiftIndex) => {
          if (
            !shift.openTime ||
            !shift.closeTime ||
            !["same", "next"].includes(shift.closeDay) ||
            (shift.closeTime === shift.openTime && shift.closeDay !== "next") ||
            (shift.closeDay === "same" && shift.closeTime <= shift.openTime)
          ) {
            throw new Error(
              `Revisa las horas de ${day.label}, turno ${shiftIndex + 1}.`,
            );
          }

          return {
            business_id: id,
            day_of_week: day.dayOfWeek,
            shift_index: shiftIndex,
            is_open: true,
            open_time: shift.openTime,
            close_time: shift.closeTime,
            close_day: shift.closeDay,
          };
        });
      });

      const savedScheduleKeys = new Set(
        scheduleRows.map((row) => `${row.day_of_week}-${row.shift_index}`),
      );
      const obsoleteHourIds = (detail?.businessHours || [])
        .filter(
          (row) =>
            !savedScheduleKeys.has(`${row.day_of_week}-${row.shift_index}`),
        )
        .map((row) => row.id)
        .filter(Boolean);

      const [
        businessUpdate,
        infoUpdate,
        hoursUpsert,
        categoriesUpsert,
        inventoryCategoriesUpsert,
      ] = await Promise.all([
        supabase.from("businesses").update(businessPayload).eq("id", id),
        supabase
          .from("business_info")
          .upsert(
            { business_id: id, ...infoPayload },
            { onConflict: "business_id" },
          ),
        supabase.from("business_hours").upsert(scheduleRows, {
          onConflict: "business_id,day_of_week,shift_index",
        }),
        shopCategoryPayload.length
          ? supabase.from("categories_shop").upsert(shopCategoryPayload)
          : Promise.resolve({ error: null }),
        inventoryCategoryPayload.length
          ? supabase
              .from("inventory_categories")
              .upsert(inventoryCategoryPayload)
          : Promise.resolve({ error: null }),
      ]);

      if (businessUpdate.error) throw businessUpdate.error;
      if (infoUpdate.error) throw infoUpdate.error;
      if (hoursUpsert.error) throw hoursUpsert.error;
      if (categoriesUpsert.error) throw categoriesUpsert.error;
      if (inventoryCategoriesUpsert.error) {
        throw inventoryCategoriesUpsert.error;
      }

      if (obsoleteHourIds.length > 0) {
        const { error: hoursDeleteError } = await supabase
          .from("business_hours")
          .delete()
          .eq("business_id", id)
          .in("id", obsoleteHourIds);
        if (hoursDeleteError) throw hoursDeleteError;
      }

      await loadStoreData();
      setLocationEditMode(false);
      setEditMode(false);
    } catch (error) {
      console.error("Error al guardar cambios de la tienda:", error);
      alert(
        error?.message || "No se pudieron guardar los cambios de la tienda.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSuspendBusiness = async (event) => {
    event.preventDefault();
    if (!id || !suspensionReason.trim()) {
      setSuspensionError("Escribe el motivo de la suspensión.");
      return;
    }

    setSuspensionSaving(true);
    setSuspensionError("");
    try {
      const { error } = await supabase.rpc("admin_suspend_business", {
        p_business_id: id,
        p_reason: suspensionReason.trim(),
      });
      if (error) throw error;

      setSuspensionDialogOpen(false);
      setSuspensionReason("");
      await loadStoreData();
    } catch (error) {
      console.error("No se pudo suspender la tienda:", error);
      setSuspensionError(error.message || "No se pudo suspender la tienda.");
    } finally {
      setSuspensionSaving(false);
    }
  };

  const handleReactivateBusiness = async () => {
    if (!id || !window.confirm(`¿Reactivar la tienda ${store?.name}?`)) return;

    setSuspensionSaving(true);
    try {
      const { error } = await supabase.rpc("admin_reactivate_business", {
        p_business_id: id,
      });
      if (error) throw error;

      await loadStoreData();
    } catch (error) {
      console.error("No se pudo reactivar la tienda:", error);
      window.alert(error.message || "No se pudo reactivar la tienda.");
    } finally {
      setSuspensionSaving(false);
    }
  };

  const handleDeleteBusiness = async (event) => {
    event.preventDefault();
    if (
      !store ||
      deletingBusiness ||
      deleteConfirmation.trim() !== store.slug
    ) {
      return;
    }

    setDeletingBusiness(true);
    setDeleteError("");
    try {
      const { data, error } = await supabase.functions.invoke(
        "eliminar-cuenta-negocio",
        {
          body: {
            businessId: store.id,
            confirmationSlug: deleteConfirmation.trim(),
          },
        },
      );

      if (error) {
        let message = error.message;
        if (error.context && typeof error.context.json === "function") {
          try {
            const responseBody = await error.context.json();
            message = responseBody?.error || message;
          } catch (parseError) {
            console.warn("No se pudo leer el error de eliminación:", parseError);
          }
        }
        throw new Error(message || "No se pudo eliminar la tienda.");
      }

      if (!data?.success) {
        throw new Error(data?.error || "No se pudo eliminar la tienda.");
      }

      if (data.warning) {
        window.alert(data.warning);
      }
      navigate("/gestion/tiendas", { replace: true });
    } catch (error) {
      console.error("Error eliminando la tienda desde administración:", error);
      setDeleteError(error.message || "No se pudo eliminar la tienda.");
    } finally {
      setDeletingBusiness(false);
    }
  };

  const invokePasswordReset = async (body) => {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.refreshSession();
    if (sessionError || !session?.access_token) {
      throw new Error(
        "Tu sesión expiró. Inicia sesión de nuevo como administrador.",
      );
    }

    const { data, error } = await supabase.functions.invoke(
      "restablecer-contrasena-negocio",
      {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body,
      },
    );
    if (error) {
      let message = error.message;
      if (error.context && typeof error.context.json === "function") {
        try {
          const responseBody = await error.context.json();
          message = responseBody?.error || message;
        } catch (parseError) {
          console.warn(
            "No se pudo leer el error de restablecimiento:",
            parseError,
          );
        }
      }
      throw new Error(message || "No se pudo restablecer la contraseña.");
    }
    return data;
  };

  const openPasswordResetDialog = async () => {
    setPasswordDialogOpen(true);
    setPasswordResetLoading(true);
    setPasswordResetError("");
    setPasswordResetCredentials(null);
    setPasswordCopied(false);
    setPasswordResetUsers([]);
    setSelectedPasswordUserId("");

    try {
      const data = await invokePasswordReset({
        action: "list",
        businessId: id,
      });
      if (!data?.success || !Array.isArray(data.users)) {
        throw new Error(data?.error || "No se pudieron cargar los usuarios.");
      }
      setPasswordResetUsers(data.users);
      setSelectedPasswordUserId(data.users[0]?.id || "");
      if (data.users.length === 0) {
        setPasswordResetError(
          "Esta tienda no tiene administradores activos para restablecer.",
        );
      }
    } catch (error) {
      console.error("No se pudieron cargar los usuarios de la tienda:", error);
      setPasswordResetError(
        error.message || "No se pudieron cargar los usuarios.",
      );
    } finally {
      setPasswordResetLoading(false);
    }
  };

  const handlePasswordReset = async (event) => {
    event.preventDefault();
    if (!selectedPasswordUserId || passwordResetLoading) return;

    setPasswordResetLoading(true);
    setPasswordResetError("");
    setPasswordResetCredentials(null);
    setPasswordCopied(false);
    try {
      const data = await invokePasswordReset({
        action: "reset",
        businessId: id,
        userId: selectedPasswordUserId,
      });
      if (!data?.success || !data?.temporaryPassword) {
        throw new Error(data?.error || "No se recibió la contraseña temporal.");
      }
      setPasswordResetCredentials({
        email: data.email,
        password: data.temporaryPassword,
      });
    } catch (error) {
      console.error("No se pudo restablecer la contraseña:", error);
      setPasswordResetError(
        error.message || "No se pudo restablecer la contraseña.",
      );
    } finally {
      setPasswordResetLoading(false);
    }
  };

  const copyTemporaryPassword = async () => {
    if (!passwordResetCredentials) return;
    try {
      await navigator.clipboard.writeText(
        `Correo: ${passwordResetCredentials.email}\nContraseña temporal: ${passwordResetCredentials.password}`,
      );
      setPasswordCopied(true);
      setPasswordResetError("");
    } catch (error) {
      console.error("No se pudo copiar la contraseña temporal:", error);
      setPasswordResetError(
        "No se pudo copiar. Selecciona los datos y cópialos manualmente.",
      );
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 px-4 py-5 text-white md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate("/gestion/tiendas")}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:border-violet-400 hover:bg-violet-500/10"
          >
            <ArrowLeft size={16} />
            Volver a tiendas
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {store && !loading && (
              <button
                type="button"
                onClick={openPasswordResetDialog}
                disabled={passwordResetLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-400/20 disabled:cursor-wait disabled:opacity-60"
              >
                <KeyRound size={16} />
                Restablecer contraseña
              </button>
            )}
            {store && !loading && (
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmation("");
                  setDeleteError("");
                  setDeleteDialogOpen(true);
                }}
                disabled={deletingBusiness}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-100 transition hover:bg-red-500/20 disabled:cursor-wait disabled:opacity-60"
              >
                <Trash2 size={16} />
                Eliminar tienda
              </button>
            )}
            {store &&
              !loading &&
              (store.admin_suspended ? (
                <button
                  type="button"
                  onClick={handleReactivateBusiness}
                  disabled={suspensionSaving}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-wait disabled:opacity-60"
                >
                  <ShieldCheck size={16} />
                  {suspensionSaving ? "Procesando..." : "Reactivar tienda"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSuspensionError("");
                    setSuspensionDialogOpen(true);
                  }}
                  disabled={suspensionSaving}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-100 transition hover:bg-red-500/20 disabled:cursor-wait disabled:opacity-60"
                >
                  <Ban size={16} />
                  Suspender tienda
                </button>
              ))}
            {!editMode ? (
              <button
                type="button"
                onClick={toggleEditMode}
                className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm font-medium text-violet-100 transition hover:bg-violet-500/20"
              >
                <PencilLine size={16} />
                Editar
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Check size={16} />
                  {saving ? "Guardando..." : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={toggleEditMode}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:border-red-400 hover:text-red-200"
                >
                  <X size={16} />
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-neutral-900/75 p-10 text-center text-sm text-neutral-400">
            Cargando información de la tienda...
          </div>
        ) : !store ? (
          <div className="rounded-2xl border border-white/10 bg-neutral-900/75 p-10 text-center text-sm text-neutral-400">
            No se encontró la tienda seleccionada.
          </div>
        ) : editMode ? (
          <div className="space-y-6 rounded-2xl border border-white/10 bg-neutral-900/80 p-4 md:p-5">
            <div className="grid gap-4 md:grid-cols-[150px_1fr]">
              <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-neutral-950/60 p-4">
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.14em] text-neutral-400">
                  Logo
                </p>
                <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/10 bg-neutral-950">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Logo de la tienda"
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <Store className="text-neutral-700" size={36} />
                  )}
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="absolute bottom-1 right-1 rounded-lg bg-violet-600 p-2 text-white"
                  >
                    <Camera size={14} />
                  </button>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => uploadImage(event, "logo")}
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/60">
                <div className="relative h-40 w-full">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt="Portada de la tienda"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.14em] text-neutral-600">
                      Sin portada
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-xl bg-black/75 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white"
                  >
                    <ImageIcon size={14} />
                    Cambiar portada
                  </button>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => uploadImage(event, "cover")}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.14em] text-neutral-400">
                  Nombre
                </span>
                <input
                  value={formData.name}
                  onChange={(event) =>
                    handleFieldChange("name", event.target.value)
                  }
                  className="w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.14em] text-neutral-400">
                  Slug
                </span>
                <input
                  value={formData.slug}
                  onChange={(event) =>
                    handleFieldChange("slug", event.target.value)
                  }
                  className="w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.14em] text-neutral-400">
                  Categoría
                </span>
                <select
                  value={formData.category}
                  onChange={(event) =>
                    handleFieldChange("category", event.target.value)
                  }
                  className="w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
                >
                  <option value="">Selecciona una categoría</option>
                  {formData.category &&
                    !categories.some(
                      (category) => category.id === formData.category,
                    ) && (
                      <option value={formData.category}>
                        {store?.category || formData.category}
                      </option>
                    )}
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.14em] text-neutral-400">
                  WhatsApp
                </span>
                <input
                  value={formData.phone}
                  onChange={(event) =>
                    handleFieldChange("phone", event.target.value)
                  }
                  className="w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
                />
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-xs uppercase tracking-[0.14em] text-neutral-400">
                  Dirección
                </span>
                <input
                  value={formData.address}
                  onChange={(event) =>
                    handleFieldChange("address", event.target.value)
                  }
                  className="w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
                />
              </label>
            </div>

            <section className="space-y-4 rounded-xl border border-white/10 bg-neutral-950/50 p-3 md:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Categorías de la tienda
                  </h3>
                  <p className="mt-1 text-xs text-neutral-400">
                    Administra las categorías que organizan sus productos.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addShopCategory}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-neutral-200 transition hover:border-violet-400/50 hover:text-violet-200"
                >
                  <Plus size={14} />
                  Añadir categoría
                </button>
              </div>

              {shopCategories.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-neutral-500">
                  Esta tienda todavía no tiene categorías de productos.
                </p>
              ) : (
                <div className="space-y-3">
                  {shopCategories.map((shopCategory) => {
                    const categoryKey =
                      shopCategory.id || shopCategory._draftId;

                    return (
                      <div
                        key={categoryKey}
                        className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3 md:grid-cols-[1fr_1.4fr_90px_auto_auto] md:items-end"
                      >
                        <label className="space-y-1.5">
                          <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                            Nombre
                          </span>
                          <input
                            value={shopCategory.name}
                            onChange={(event) =>
                              updateShopCategory(
                                categoryKey,
                                "name",
                                event.target.value,
                              )
                            }
                            className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                            placeholder="Nombre de categoría"
                          />
                        </label>

                        <label className="space-y-1.5">
                          <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                            Descripción
                          </span>
                          <input
                            value={shopCategory.description || ""}
                            onChange={(event) =>
                              updateShopCategory(
                                categoryKey,
                                "description",
                                event.target.value,
                              )
                            }
                            className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                            placeholder="Opcional"
                          />
                        </label>

                        <label className="space-y-1.5">
                          <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                            Orden
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={shopCategory.order_index ?? 0}
                            onChange={(event) =>
                              updateShopCategory(
                                categoryKey,
                                "order_index",
                                event.target.value,
                              )
                            }
                            className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                          />
                        </label>

                        <label className="flex h-9 items-center gap-2 text-xs text-neutral-300">
                          <input
                            type="checkbox"
                            checked={Boolean(shopCategory.is_active)}
                            onChange={(event) =>
                              updateShopCategory(
                                categoryKey,
                                "is_active",
                                event.target.checked,
                              )
                            }
                            className="h-4 w-4 accent-violet-500"
                          />
                          Activa
                        </label>

                        {!shopCategory.id && (
                          <button
                            type="button"
                            onClick={() => removeNewShopCategory(categoryKey)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-neutral-400 transition hover:border-red-400/50 hover:text-red-300"
                            aria-label="Quitar categoría nueva"
                            title="Quitar categoría nueva"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="space-y-4 rounded-xl border border-white/10 bg-neutral-950/50 p-3 md:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Categorías de inventario
                  </h3>
                  <p className="mt-1 text-xs text-neutral-400">
                    Los nombres se guardan en mayúsculas. Los IDs se conservan
                    para mantener vinculados los insumos.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addInventoryCategory}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-neutral-200 transition hover:border-violet-400/50 hover:text-violet-200"
                >
                  <Plus size={14} />
                  Añadir categoría
                </button>
              </div>

              {inventoryCategories.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-neutral-500">
                  Esta tienda todavía no tiene categorías de inventario.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {inventoryCategories.map((category) => {
                    const categoryKey = category.id || category._draftId;

                    return (
                      <div
                        key={categoryKey}
                        className="flex items-end gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3"
                      >
                        <label className="min-w-0 flex-1 space-y-1.5">
                          <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                            Nombre de categoría
                          </span>
                          <input
                            value={category.name}
                            onChange={(event) =>
                              updateInventoryCategory(
                                categoryKey,
                                event.target.value,
                              )
                            }
                            className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                            placeholder="Ej. VERDURAS"
                          />
                        </label>
                        {!category.id && (
                          <button
                            type="button"
                            onClick={() =>
                              removeNewInventoryCategory(categoryKey)
                            }
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-neutral-400 transition hover:border-red-400/50 hover:text-red-300"
                            aria-label="Quitar categoría nueva"
                            title="Quitar categoría nueva"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="space-y-4 rounded-xl border border-white/10 bg-neutral-950/50 p-3 md:p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Plan de suscripción
                  </h3>
                  <p className="mt-1 text-xs text-neutral-400">
                    Actual: {store.subscription?.plan_name || "Sin plan"}
                    {store.subscription?.billing_period
                      ? ` · ${store.subscription.billing_period}`
                      : ""}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {subscriptionEndDate &&
                    Number.isFinite(subscriptionEndDate.getTime())
                      ? `Vence ${subscriptionEndDate.toLocaleDateString("es-CO")}${
                          subscriptionRemainingDays > 0
                            ? ` · Quedan ${subscriptionRemainingDays} ${subscriptionRemainingDays === 1 ? "día" : "días"}`
                            : " · Sin días restantes"
                        }`
                      : "Sin fecha de vencimiento registrada"}
                  </p>
                </div>
                <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-200">
                  {currentSubscriptionStatus}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">
                    Plan
                  </span>
                  <select
                    value={selectedPlanId}
                    onChange={(event) => handlePlanChange(event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
                  >
                    <option value="">Selecciona un plan</option>
                    {availablePlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                        {plan.is_active ? "" : " (inactivo)"}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">
                    Período
                  </span>
                  <select
                    value={selectedPeriodId}
                    onChange={(event) =>
                      setSelectedPeriodId(event.target.value)
                    }
                    disabled={!availablePeriods.length}
                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400 disabled:opacity-50"
                  >
                    <option value="">Selecciona un período</option>
                    {availablePeriods.map((period) => (
                      <option key={period.id} value={period.id}>
                        {period.label}
                        {period.is_active ? "" : " (inactivo)"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {selectedPlan && selectedPeriod && (
                <p className="text-xs text-neutral-400">
                  {selectedPlan.billing_type === "commission"
                    ? `Comisión ${selectedPeriod.commission_rate ?? "no configurada"}% · mínimo ${selectedPeriod.minimum_amount == null ? "no configurado" : formatCurrency(selectedPeriod.minimum_amount)}`
                    : `${formatCurrency(selectedPeriod.price_amount)} · ${selectedPeriod.duration_days} días`}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
                <p className="text-xs text-neutral-500">
                  El cambio inicia un nuevo período y conserva el historial
                  anterior.
                </p>
                <button
                  type="button"
                  onClick={applyPlanChange}
                  disabled={
                    changingPlan ||
                    !selectedPlan?.is_active ||
                    !selectedPeriod?.is_active
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Check size={14} />
                  {changingPlan ? "Aplicando..." : "Aplicar plan"}
                </button>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-white/10 bg-neutral-950/50 p-3 md:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Ubicación en el mapa
                  </h3>
                  <p className="mt-1 text-xs text-neutral-400">
                    {locationEditMode
                      ? "Arrastra el mapa para colocar el marcador en la tienda."
                      : "El mapa está bloqueado. Activa la edición para cambiar la ubicación."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLocationEditMode((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-200 transition hover:bg-violet-500/20"
                >
                  <MapPin size={14} />
                  {locationEditMode ? "Terminar edición" : "Editar ubicación"}
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">
                    Latitud
                  </span>
                  {locationEditMode ? (
                    <input
                      type="number"
                      step="any"
                      value={formData.latitude}
                      onChange={(event) =>
                        handleFieldChange("latitude", event.target.value)
                      }
                      className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                      placeholder="Latitud"
                    />
                  ) : (
                    <p className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white">
                      {formData.latitude === "" || formData.latitude == null
                        ? "Sin definir"
                        : formData.latitude}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">
                    Longitud
                  </span>
                  {locationEditMode ? (
                    <input
                      type="number"
                      step="any"
                      value={formData.longitude}
                      onChange={(event) =>
                        handleFieldChange("longitude", event.target.value)
                      }
                      className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                      placeholder="Longitud"
                    />
                  ) : (
                    <p className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white">
                      {formData.longitude === "" || formData.longitude == null
                        ? "Sin definir"
                        : formData.longitude}
                    </p>
                  )}
                </div>
              </div>

              <div className="relative z-0 h-72 overflow-hidden rounded-xl border border-white/10 bg-neutral-900">
                <div
                  ref={mapElementRef}
                  className="relative h-full w-full"
                  aria-label="Mapa interactivo de ubicación de la tienda"
                />
                {(locationEditMode ||
                  (formData.latitude !== "" && formData.longitude !== "")) && (
                  <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-full text-violet-500 drop-shadow-[0_3px_4px_rgba(0,0,0,0.75)]">
                    <MapPin
                      size={40}
                      fill="currentColor"
                      stroke="white"
                      strokeWidth={1.5}
                    />
                  </div>
                )}
              </div>
              {locationEditMode && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={useCurrentLocation}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-white/10"
                  >
                    <LocateFixed size={14} />
                    Usar mi ubicación
                  </button>
                  <p className="self-center text-xs text-neutral-500">
                    La ubicación se guarda al pulsar Guardar.
                  </p>
                </div>
              )}
            </section>

            <section className="space-y-4 rounded-xl border border-white/10 bg-neutral-950/50 p-3 md:p-4">
              <div className="flex items-center gap-2">
                <Banknote className="text-emerald-300" size={16} />
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Costos y entrega
                  </h3>
                  <p className="mt-1 text-xs text-neutral-400">
                    Valores en COP; el impuesto se expresa como porcentaje.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  {
                    key: "deliveryFeePerKm",
                    label: "Tarifa por kilómetro",
                    step: "0.01",
                  },
                  {
                    key: "minDeliveryFee",
                    label: "Costo mínimo de domicilio",
                    step: "0.01",
                  },
                  {
                    key: "maxDeliveryFee",
                    label: "Costo máximo de domicilio",
                    step: "0.01",
                  },
                  {
                    key: "taxRate",
                    label: "Impuesto",
                    step: "0.01",
                    tax: true,
                  },
                ].map(({ key, label, step, tax }) => (
                  <label key={key} className="space-y-1.5">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                      {tax && <Percent size={12} />}
                      {label}
                      <span className="normal-case tracking-normal text-neutral-600">
                        ({tax ? "%" : "COP"})
                      </span>
                    </span>
                    <input
                      type="number"
                      min="0"
                      max={tax ? "100" : undefined}
                      step={step}
                      value={formData[key]}
                      onChange={(event) =>
                        handleFieldChange(key, event.target.value)
                      }
                      className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
                      placeholder="0"
                    />
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-white/10 bg-neutral-950/50 p-3 md:p-4">
              <div className="flex items-center gap-2">
                <Clock3 className="text-violet-300" size={16} />
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Horarios de atención
                  </h3>
                  <p className="mt-1 text-xs text-neutral-400">
                    Configura los días abiertos y hasta dos turnos por día.
                  </p>
                </div>
              </div>

              <div className="divide-y divide-white/10">
                {businessSchedule.map((day) => (
                  <div
                    key={day.dayOfWeek}
                    className="grid gap-3 py-4 first:pt-0 last:pb-0 lg:grid-cols-[150px_1fr] lg:items-start"
                  >
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={day.isOpen}
                        onChange={() => toggleScheduleDay(day.dayOfWeek)}
                        className="h-4 w-4 accent-violet-500"
                      />
                      <span className="text-sm font-medium text-white">
                        {day.label}
                      </span>
                    </label>

                    {!day.isOpen ? (
                      <p className="text-sm text-neutral-500">Cerrado</p>
                    ) : (
                      <div className="space-y-3">
                        {day.shifts.map((shift, shiftIndex) => (
                          <div
                            key={`${day.dayOfWeek}-${shiftIndex}`}
                            className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 sm:grid-cols-[1fr_1fr_150px_auto] sm:items-end"
                          >
                            <label className="space-y-1.5">
                              <span className="block text-[10px] uppercase tracking-wider text-neutral-500">
                                Turno {shiftIndex + 1}, abre
                              </span>
                              <input
                                type="time"
                                value={shift.openTime}
                                onChange={(event) =>
                                  updateScheduleShift(
                                    day.dayOfWeek,
                                    shiftIndex,
                                    "openTime",
                                    event.target.value,
                                  )
                                }
                                className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                              />
                            </label>
                            <label className="space-y-1.5">
                              <span className="block text-[10px] uppercase tracking-wider text-neutral-500">
                                Cierra
                              </span>
                              <input
                                type="time"
                                value={shift.closeTime}
                                onChange={(event) =>
                                  updateScheduleShift(
                                    day.dayOfWeek,
                                    shiftIndex,
                                    "closeTime",
                                    event.target.value,
                                  )
                                }
                                className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                              />
                            </label>
                            <label className="space-y-1.5">
                              <span className="block text-[10px] uppercase tracking-wider text-neutral-500">
                                Cierre
                              </span>
                              <select
                                value={shift.closeDay}
                                onChange={(event) =>
                                  updateScheduleShift(
                                    day.dayOfWeek,
                                    shiftIndex,
                                    "closeDay",
                                    event.target.value,
                                  )
                                }
                                className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                              >
                                <option value="same">Mismo día</option>
                                <option value="next">Día siguiente</option>
                              </select>
                            </label>
                            {day.shifts.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  removeScheduleShift(day.dayOfWeek, shiftIndex)
                                }
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-neutral-400 transition hover:border-red-400/50 hover:text-red-300"
                                aria-label={`Eliminar turno ${shiftIndex + 1} del ${day.label}`}
                                title="Eliminar turno"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        ))}

                        {day.shifts.length < 2 && (
                          <button
                            type="button"
                            onClick={() => addScheduleShift(day.dayOfWeek)}
                            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-neutral-300 transition hover:border-violet-400/50 hover:text-violet-200"
                          >
                            <Plus size={14} />
                            Añadir turno
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-neutral-950/60 p-3">
              <div>
                <p className="text-sm font-medium text-white">
                  Estado normal (is_active)
                </p>
                <p className="text-xs text-neutral-400">
                  {formData.is_active
                    ? "Activa para clientes."
                    : "Inactiva para clientes."}
                  {store.admin_suspended &&
                    " La suspensión administrativa es independiente."}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  handleFieldChange("is_active", !formData.is_active)
                }
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition ${
                  formData.is_active ? "bg-emerald-500" : "bg-neutral-700"
                }`}
                aria-label="Cambiar estado normal de la tienda"
                aria-pressed={formData.is_active}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white transition ${
                    formData.is_active ? "translate-x-8" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            {store.admin_suspended && store.admin_suspension_reason && (
              <p className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-200">
                Suspendida por administración. Motivo:{" "}
                {store.admin_suspension_reason}
              </p>
            )}
          </div>
        ) : (
          <TiendaDetalle store={store} detail={detail} />
        )}
      </div>
      {passwordDialogOpen && store && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => {
            if (!passwordResetLoading) setPasswordDialogOpen(false);
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-password-title"
            onSubmit={handlePasswordReset}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-lg space-y-4 rounded-2xl border border-amber-400/20 bg-neutral-900 p-5 shadow-2xl"
          >
            <div>
              <h2 id="reset-password-title" className="text-lg font-black">
                Restablecer contraseña
              </h2>
              <p className="mt-1 text-sm leading-6 text-neutral-400">
                No es posible consultar la contraseña anterior. Se generará una
                nueva temporal, que el usuario deberá cambiar al iniciar sesión.
              </p>
            </div>
            {passwordResetCredentials ? (
              <div className="space-y-3 rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4">
                <div className="flex items-start gap-2 text-sm text-emerald-100">
                  <CheckCircle2 className="mt-0.5 shrink-0" size={17} />
                  <p>
                    Contraseña temporal generada. Cópiala ahora; no se volverá
                    a mostrar cuando cierres esta ventana.
                  </p>
                </div>
                <label className="block space-y-1.5 text-xs font-semibold text-neutral-400">
                  Correo de acceso
                  <input
                    readOnly
                    value={passwordResetCredentials.email || ""}
                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 font-mono text-sm text-white"
                  />
                </label>
                <label className="block space-y-1.5 text-xs font-semibold text-neutral-400">
                  Contraseña temporal
                  <input
                    readOnly
                    value={passwordResetCredentials.password}
                    onFocus={(event) => event.target.select()}
                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 font-mono text-sm text-white"
                  />
                </label>
                <button
                  type="button"
                  onClick={copyTemporaryPassword}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-500"
                >
                  {passwordCopied ? <Check size={16} /> : <Copy size={16} />}
                  {passwordCopied ? "Credenciales copiadas" : "Copiar credenciales"}
                </button>
              </div>
            ) : (
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-neutral-200">
                  Administrador de la tienda
                </span>
                <select
                  required
                  value={selectedPasswordUserId}
                  onChange={(event) =>
                    setSelectedPasswordUserId(event.target.value)
                  }
                  disabled={passwordResetLoading || passwordResetUsers.length === 0}
                  className="w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                >
                  <option value="">
                    {passwordResetLoading
                      ? "Cargando administradores..."
                      : "Selecciona un administrador"}
                  </option>
                  {passwordResetUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.email || user.username || user.id}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {passwordResetError && (
              <p role="alert" className="text-sm text-red-300">
                {passwordResetError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={passwordResetLoading}
                onClick={() => setPasswordDialogOpen(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-neutral-300 hover:bg-white/5 disabled:opacity-60"
              >
                Cerrar
              </button>
              {!passwordResetCredentials && (
                <button
                  type="submit"
                  disabled={
                    passwordResetLoading ||
                    !selectedPasswordUserId ||
                    passwordResetUsers.length === 0
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-neutral-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {passwordResetLoading ? (
                    <LoaderCircle className="animate-spin" size={16} />
                  ) : (
                    <KeyRound size={16} />
                  )}
                  {passwordResetLoading
                    ? "Restableciendo..."
                    : "Generar contraseña temporal"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
      {suspensionDialogOpen && store && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => {
            if (!suspensionSaving) setSuspensionDialogOpen(false);
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="suspend-store-title"
            onSubmit={handleSuspendBusiness}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-lg space-y-4 rounded-2xl border border-white/10 bg-neutral-900 p-5 shadow-2xl"
          >
            <div>
              <h2 id="suspend-store-title" className="text-lg font-black">
                Suspender {store.name}
              </h2>
              <p className="mt-1 text-sm text-neutral-400">
                La tienda dejará de aparecer en el Marketplace y el acceso al
                POS quedará bloqueado hasta reactivarla manualmente.
              </p>
            </div>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-neutral-200">
                Motivo de suspensión
              </span>
              <textarea
                autoFocus
                required
                maxLength={1000}
                value={suspensionReason}
                onChange={(event) => setSuspensionReason(event.target.value)}
                rows={4}
                className="w-full resize-y rounded-xl border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-red-400"
                placeholder="Describe el motivo para dejarlo registrado"
              />
            </label>
            {suspensionError && (
              <p role="alert" className="text-sm text-red-300">
                {suspensionError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={suspensionSaving}
                onClick={() => setSuspensionDialogOpen(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-neutral-300 hover:bg-white/5 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={suspensionSaving || !suspensionReason.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Ban size={16} />
                {suspensionSaving ? "Suspendiendo..." : "Suspender tienda"}
              </button>
            </div>
          </form>
        </div>
      )}
      {deleteDialogOpen && store && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => {
            if (!deletingBusiness) setDeleteDialogOpen(false);
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-store-title"
            onSubmit={handleDeleteBusiness}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-lg space-y-4 rounded-2xl border border-red-500/20 bg-neutral-900 p-5 shadow-2xl"
          >
            <div>
              <h2 id="delete-store-title" className="text-lg font-black text-red-100">
                Eliminar permanentemente {store.name}
              </h2>
              <p className="mt-2 text-sm leading-6 text-neutral-300">
                Se borrarán la tienda, sus productos, inventario, pedidos,
                configuración, archivos y las cuentas de acceso vinculadas.
                Esta acción no se puede deshacer.
              </p>
            </div>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-neutral-200">
                Escribe <code className="text-red-200">{store.slug}</code> para confirmar
              </span>
              <input
                autoFocus
                required
                value={deleteConfirmation}
                onChange={(event) => {
                  setDeleteConfirmation(event.target.value);
                  setDeleteError("");
                }}
                autoComplete="off"
                className="w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-red-400"
              />
            </label>
            {deleteError && (
              <p role="alert" className="text-sm text-red-300">
                {deleteError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={deletingBusiness}
                onClick={() => setDeleteDialogOpen(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-neutral-300 hover:bg-white/5 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  deletingBusiness || deleteConfirmation.trim() !== store.slug
                }
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingBusiness ? (
                  <LoaderCircle className="animate-spin" size={16} />
                ) : (
                  <Trash2 size={16} />
                )}
                {deletingBusiness ? "Eliminando..." : "Eliminar definitivamente"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default TiendaArchivo;
