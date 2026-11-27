import { useEffect, useState } from "react";
import {
  Bike,
  Eye,
  EyeOff,
  ImagePlus,
  LoaderCircle,
  Mail,
  Phone,
  Plus,
  Search,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import SubLoading from "./SubLoading";

const DOCUMENT_FIELDS = [
  { key: "licenseFront", path: "license-front", label: "Frente de la licencia" },
  { key: "licenseBack", path: "license-back", label: "Respaldo de la licencia" },
  { key: "vehicleCardFront", path: "vehicle-card-front", label: "Frente de la tarjeta de propiedad" },
  { key: "vehicleCardBack", path: "vehicle-card-back", label: "Respaldo de la tarjeta de propiedad" },
  { key: "identityFront", path: "identity-front", label: "Frente del documento de identidad" },
  { key: "identityBack", path: "identity-back", label: "Respaldo del documento de identidad" },
  { key: "profilePhoto", path: "profile-photo", label: "Foto de perfil" },
];

const EMPTY_FORM = {
  fullName: "",
  cedula: "",
  cedulaConfirmation: "",
  email: "",
  phone: "",
  phoneConfirmation: "",
  vehicleType: "",
  password: "",
  passwordConfirmation: "",
  documents: {},
};

const uuid = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
        const random = Math.floor(Math.random() * 16);
        return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
      });

const getExtension = (file) =>
  ({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  })[file.type];

const preventPaste = (event) => event.preventDefault();

const CourierSwitch = ({ enabled, disabled, onChange, name }) => (
  <button
    type="button"
    role="switch"
    aria-checked={enabled}
    aria-label={`${enabled ? "Desactivar" : "Activar"} vínculo de ${name} con la tienda`}
    onClick={onChange}
    disabled={disabled}
    className={`relative h-6 w-11 shrink-0 rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-wait disabled:opacity-50 ${
      enabled ? "bg-emerald-500" : "bg-white/15"
    }`}
  >
    <span
      aria-hidden="true"
      className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${
        enabled ? "translate-x-5" : "translate-x-0"
      }`}
    />
  </button>
);

const MisDomiciliarios = () => {
  const [businessId, setBusinessId] = useState(null);
  const [couriers, setCouriers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchCedula, setSearchCedula] = useState("");
  const [searchCandidate, setSearchCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [linkingSearchCandidate, setLinkingSearchCandidate] = useState(false);
  const [updatingCourierId, setUpdatingCourierId] = useState(null);
  const [courierToRemove, setCourierToRemove] = useState(null);
  const [accountTarget, setAccountTarget] = useState(null);
  const [accountCedula, setAccountCedula] = useState("");
  const [accountCedulaConfirmation, setAccountCedulaConfirmation] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPasswordConfirmation, setAccountPasswordConfirmation] =
    useState("");
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [expandedDocumentsId, setExpandedDocumentsId] = useState(null);
  const [signedDocuments, setSignedDocuments] = useState({});
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  useEffect(() => {
    let active = true;

    const loadCouriers = async () => {
      setLoading(true);
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user?.id) {
        if (active) {
          setMessage(authError?.message || "Inicia sesión para ver tus domiciliarios.");
          setMessageType("error");
          setLoading(false);
        }
        return;
      }
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", authData.user.id)
        .maybeSingle();
      if (profileError || !profile?.business_id) {
        if (active) {
          setMessage(profileError?.message || "No se encontró la tienda.");
          setMessageType("error");
          setLoading(false);
        }
        return;
      }

      const [
        { data: employeeData, error: employeeError },
        { data: detailData, error: detailError },
      ] = await Promise.all([
        supabase
          .from("employees")
          .select("id,name,area,auth_user_id,store_orders_enabled,store_order_priority_enabled")
          .eq("business_id", profile.business_id)
          .ilike("area", "%domiciliario%")
          .order("name", { ascending: true }),
        supabase
          .from("business_courier_details")
          .select("employee_id,full_name,cedula,email,phone,vehicle_type,document_paths")
          .eq("business_id", profile.business_id),
      ]);
      if (employeeError || detailError) {
        console.error("No se pudieron cargar los domiciliarios de la tienda:", employeeError || detailError);
        if (active) {
          setMessage((employeeError || detailError).message);
          setMessageType("error");
          setLoading(false);
        }
        return;
      }

      const detailsByEmployee = new Map(
        (detailData || []).map((detail) => [detail.employee_id, detail]),
      );
      let emails = {};
      let cedulas = {};
      let phones = {};
      if ((employeeData || []).some((employee) => employee.auth_user_id)) {
        const { data: accountData, error: accountError } =
          await supabase.functions.invoke("crear-cuenta-domiciliario", {
            body: { action: "account-emails" },
          });
        if (accountError || !accountData?.success) {
          console.error("No se pudieron cargar los correos de domiciliarios:", accountError || accountData?.error);
          if (active) {
            setMessage(accountData?.error || "No se pudieron cargar los correos de acceso.");
            setMessageType("error");
          }
        } else {
          emails = accountData.emails || {};
          cedulas = accountData.cedulas || {};
          phones = accountData.phones || {};
        }
      }

      if (active) {
        setBusinessId(profile.business_id);
        setCouriers(
          (employeeData || []).map((employee) => ({
            ...employee,
            email:
              detailsByEmployee.get(employee.id)?.email ||
              emails[employee.id] ||
              "",
            cedula:
              detailsByEmployee.get(employee.id)?.cedula ||
              cedulas[employee.id] ||
              "",
            phone:
              detailsByEmployee.get(employee.id)?.phone ||
              phones[employee.id] ||
              "",
            vehicle_type: detailsByEmployee.get(employee.id)?.vehicle_type || "",
            document_paths:
              detailsByEmployee.get(employee.id)?.document_paths || null,
          })),
        );
        setLoading(false);
      }
    };

    loadCouriers();
    return () => {
      active = false;
    };
  }, []);

  const updateForm = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  const cleanUploadedFiles = async (paths) => {
    if (!paths.length) return null;
    const { error } = await supabase.storage
      .from("courier-application-documents")
      .remove(paths);
    if (error) {
      console.error("No se pudieron limpiar documentos de domiciliario:", error);
    }
    return error;
  };

  const createCourierAccess = async (employeeId, email, password, cedula) => {
    const { data, error } = await supabase.functions.invoke(
      "crear-cuenta-domiciliario",
      {
        body: { employeeId, email, password, cedula },
      },
    );
    if (error) {
      let errorMessage = error.message || "No se pudo crear el acceso.";
      if (error.context && typeof error.context.json === "function") {
        try {
          const response = await error.context.json();
          errorMessage = response?.error || errorMessage;
        } catch (parseError) {
          console.warn("No se pudo leer el error de creación de acceso:", parseError);
        }
      }
      throw new Error(errorMessage);
    }
    if (!data?.success || !data?.userId) {
      throw new Error(data?.error || "No se pudo confirmar la creación del acceso.");
    }
    return {
      userId: data.userId,
      linkedExisting: data.linkedExisting === true,
      name: data.name || "",
      email: data.email || "",
    };
  };

  const lookupCourierByCedula = async () => {
    const cedula = searchCedula.replace(/\D/g, "");
    if (!/^[0-9]{5,15}$/.test(cedula)) {
      setMessage("Escribe un número de cédula válido para buscarlo.");
      setMessageType("error");
      return;
    }

    setSearching(true);
    setSearchCandidate(null);
    setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke(
        "crear-cuenta-domiciliario",
        {
          body: { action: "lookup-by-cedula", cedula },
        },
      );
      if (error) {
        let errorMessage = error.message || "No se pudo buscar la cédula.";
        if (error.context && typeof error.context.json === "function") {
          try {
            const response = await error.context.json();
            errorMessage = response?.error || errorMessage;
          } catch (parseError) {
            console.warn("No se pudo leer el error de búsqueda:", parseError);
          }
        }
        throw new Error(errorMessage);
      }
      if (!data?.success || !data.courier?.cedula || !data.courier?.documents) {
        throw new Error(data?.error || "No se pudo cargar la documentación del domiciliario.");
      }
      setSearchCandidate(data.courier);
    } catch (error) {
      console.error("No se pudo buscar el domiciliario por cédula:", error);
      setMessage(error.message || "No se pudo buscar el domiciliario.");
      setMessageType("error");
    } finally {
      setSearching(false);
    }
  };

  const linkCourierByCedula = async () => {
    if (!searchCandidate?.cedula) return;

    const cedula = searchCandidate.cedula;
    setLinkingSearchCandidate(true);
    setMessage("");
    try {
      const existingCourier = couriers.find(
        (courier) =>
          !courier.auth_user_id &&
          String(courier.cedula || "").replace(/\D/g, "") === cedula,
      );
      const { data, error } = await supabase.functions.invoke(
        "crear-cuenta-domiciliario",
        {
          body: {
            action: "link-by-cedula",
            cedula,
            employeeId: existingCourier?.id,
          },
        },
      );
      if (error) {
        let errorMessage = error.message || "No se pudo buscar la cédula.";
        if (error.context && typeof error.context.json === "function") {
          try {
            const response = await error.context.json();
            errorMessage = response?.error || errorMessage;
          } catch (parseError) {
            console.warn("No se pudo leer el error de vinculación:", parseError);
          }
        }
        throw new Error(errorMessage);
      }
      if (!data?.success || !data.employee?.id) {
        throw new Error(data?.error || "No se pudo vincular el domiciliario.");
      }

      const courier = {
        ...data.employee,
        cedula,
        email: data.employee.email || "",
        phone: data.employee.phone || existingCourier?.phone || "",
        vehicle_type: "",
        document_paths: null,
      };
      setCouriers((current) =>
        current.some((item) => item.id === courier.id)
          ? current.map((item) =>
              item.id === courier.id
                ? {
                    ...item,
                    ...courier,
                    email: courier.email || item.email || "",
                    phone: courier.phone || item.phone || "",
                    vehicle_type: item.vehicle_type || "",
                    document_paths: item.document_paths || null,
                  }
                : item,
            )
          : [...current, courier].sort((first, second) =>
              first.name.localeCompare(second.name),
            ),
      );
      setSearchOpen(false);
      setSearchCedula("");
      setSearchCandidate(null);
      setMessage(
        data.employee.already_linked
          ? `${courier.name} ya estaba vinculado a esta tienda.`
          : `${courier.name} quedó vinculado a esta tienda.`,
      );
      setMessageType("success");
    } catch (error) {
      console.error("No se pudo vincular el domiciliario por cédula:", error);
      setMessage(error.message || "No se pudo vincular el domiciliario.");
      setMessageType("error");
    } finally {
      setLinkingSearchCandidate(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setMessageType("error");

    const fullName = form.fullName.trim();
    const cedula = form.cedula.replace(/\D/g, "");
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();
    if (fullName.length < 3 || fullName.length > 120) {
      setMessage("Escribe el nombre completo del domiciliario.");
      return;
    }
    if (!/^[0-9]{5,15}$/.test(cedula)) {
      setMessage("Escribe un número de cédula válido.");
      return;
    }
    if (cedula !== form.cedulaConfirmation.replace(/\D/g, "")) {
      setMessage("Los números de cédula no coinciden.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage("Escribe un correo electrónico válido.");
      return;
    }
    if (!/^[0-9+\s()-]{7,30}$/.test(phone)) {
      setMessage("Escribe un número de teléfono válido.");
      return;
    }
    if (phone !== form.phoneConfirmation.trim()) {
      setMessage("Los números de teléfono no coinciden.");
      return;
    }
    if (!["car", "motorcycle"].includes(form.vehicleType)) {
      setMessage("Selecciona el vehículo del domiciliario.");
      return;
    }
    const missingDocument = DOCUMENT_FIELDS.find(
      ({ key }) => !form.documents[key],
    );
    if (missingDocument) {
      setMessage(`Falta subir: ${missingDocument.label.toLowerCase()}.`);
      return;
    }
    const unsupportedDocument = DOCUMENT_FIELDS.find(({ key }) => {
      const file = form.documents[key];
      return (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 10 * 1024 * 1024
      );
    });
    if (unsupportedDocument) {
      setMessage("Usa imágenes JPG, PNG o WEBP de máximo 10 MB por archivo.");
      return;
    }
    if (form.password.length < 8 || form.password.length > 72) {
      setMessage("La contraseña inicial debe tener entre 8 y 72 caracteres.");
      return;
    }
    if (form.password !== form.passwordConfirmation) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }
    if (!businessId) {
      setMessage("No se pudo identificar la tienda.");
      return;
    }

    setSaving(true);
    const employeeId = uuid();
    const folder = `business/${businessId}/${employeeId}`;
    const uploadedPaths = [];
    let employeeCreated = false;

    try {
      const documentPaths = {};
      for (const { key, path } of DOCUMENT_FIELDS) {
        const file = form.documents[key];
        const storagePath = `${folder}/${path}.${getExtension(file)}`;
        const { error: uploadError } = await supabase.storage
          .from("courier-application-documents")
          .upload(storagePath, file, {
            contentType: file.type,
            upsert: false,
          });
        if (uploadError) throw uploadError;
        uploadedPaths.push(storagePath);
        documentPaths[key] = storagePath;
      }

      const { data: employee, error: employeeError } = await supabase
        .from("employees")
        .insert({
          id: employeeId,
          business_id: businessId,
          name: fullName,
          area: "Domiciliario",
          store_orders_enabled: true,
          store_order_priority_enabled: true,
          permissions: {},
        })
        .select("id,name,area,auth_user_id,store_orders_enabled,store_order_priority_enabled")
        .single();
      if (employeeError) throw employeeError;
      employeeCreated = true;

      const { error: detailsError } = await supabase
        .from("business_courier_details")
        .insert({
          employee_id: employee.id,
          business_id: businessId,
          full_name: fullName,
          cedula,
          email,
          phone,
          vehicle_type: form.vehicleType,
          document_paths: documentPaths,
        });
      if (detailsError) throw detailsError;

      const courier = {
        ...employee,
        email,
        cedula,
        phone,
        vehicle_type: form.vehicleType,
        document_paths: documentPaths,
      };
      setCouriers((current) =>
        [...current, courier].sort((first, second) =>
          first.name.localeCompare(second.name),
        ),
      );
      setForm(EMPTY_FORM);
      setRegistrationOpen(false);

      try {
        const access = await createCourierAccess(
          employee.id,
          email,
          form.password,
          cedula,
        );
        setCouriers((current) =>
          current.map((item) =>
            item.id === employee.id
              ? {
                  ...item,
                  name: access.name || item.name,
                  email: access.email || item.email,
                  auth_user_id: access.userId,
                }
              : item,
          ),
        );
        setMessage(
          access.linkedExisting
            ? `${access.name || fullName} quedó vinculado con su cuenta pública existente. Su contraseña actual no cambió.`
            : `${fullName} quedó registrado y vinculado a la tienda.`,
        );
        setMessageType("success");
      } catch (accountError) {
        console.error("Se registró el domiciliario, pero falló su acceso:", accountError);
        setMessage(
          `El registro de ${fullName} y sus documentos se guardaron, pero no se creó el acceso: ${accountError.message} Puedes reintentarlo desde la lista.`,
        );
        setMessageType("error");
      }
    } catch (error) {
      console.error("No se pudo registrar el domiciliario:", error);
      await cleanUploadedFiles(uploadedPaths);
      if (employeeCreated) {
        const { error: deleteError } = await supabase
          .from("employees")
          .delete()
          .eq("id", employeeId)
          .eq("business_id", businessId);
        if (deleteError) {
          console.error("No se pudo revertir el registro incompleto:", deleteError);
        }
      }
      setMessage(error.message || "No se pudo registrar el domiciliario.");
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  };

  const toggleStoreLink = async (courier) => {
    const enabled = courier.store_orders_enabled === false;
    setUpdatingCourierId(courier.id);
    setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke(
        "crear-cuenta-domiciliario",
        {
          body: {
            action: "set-store-orders-enabled",
            employeeId: courier.id,
            enabled,
          },
        },
      );
      if (error) throw error;
      if (!data?.success || typeof data.enabled !== "boolean") {
        throw new Error(data?.error || "No se pudo confirmar el cambio.");
      }
      setCouriers((current) =>
        current.map((item) =>
          item.id === courier.id
            ? { ...item, store_orders_enabled: data.enabled }
            : item,
        ),
      );
      setMessage(
        data.enabled
          ? `${courier.name} volvió a recibir pedidos de esta tienda con prioridad.`
          : `Se pausó el vínculo de ${courier.name} con esta tienda. Su acceso a pedidos públicos no cambia.`,
      );
      setMessageType("success");
    } catch (error) {
      console.error("No se pudo actualizar el vínculo del domiciliario:", error);
      setMessage(error.message || "No se pudo actualizar el vínculo con la tienda.");
      setMessageType("error");
    } finally {
      setUpdatingCourierId(null);
    }
  };

  const removeCourierFromStore = async () => {
    if (!courierToRemove) return;
    const courier = courierToRemove;
    setUpdatingCourierId(courier.id);
    setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke(
        "crear-cuenta-domiciliario",
        {
          body: {
            action: "remove-employee",
            employeeId: courier.id,
          },
        },
      );
      if (error) {
        let errorMessage = error.message || "No se pudo eliminar el domiciliario de la tienda.";
        if (error.context && typeof error.context.json === "function") {
          try {
            const response = await error.context.json();
            errorMessage = response?.error || errorMessage;
          } catch (parseError) {
            console.warn("No se pudo leer el error al eliminar el domiciliario:", parseError);
          }
        }
        throw new Error(errorMessage);
      }
      if (!data?.success) {
        throw new Error(data?.error || "No se pudo confirmar la eliminación.");
      }

      const cleanupError = await cleanUploadedFiles(
        Object.values(courier.document_paths || {}).filter(
          (path) => typeof path === "string",
        ),
      );
      setCouriers((current) => current.filter((item) => item.id !== courier.id));
      setSignedDocuments((current) => {
        const next = { ...current };
        delete next[courier.id];
        return next;
      });
      setExpandedDocumentsId((current) =>
        current === courier.id ? null : current,
      );
      setCourierToRemove(null);
      setMessage(
        cleanupError
          ? `Se quitó a ${courier.name} de la tienda, pero no se pudieron borrar algunos documentos.`
          : `${courier.name} se quitó de la tienda. Su cuenta de Gloto sigue activa y puede recibir pedidos públicos.`,
      );
      setMessageType(cleanupError ? "error" : "success");
    } catch (error) {
      console.error("No se pudo quitar el domiciliario de la tienda:", error);
      setMessage(error.message || "No se pudo quitar el domiciliario de la tienda.");
      setMessageType("error");
    } finally {
      setUpdatingCourierId(null);
    }
  };

  const submitAccount = async (event) => {
    event.preventDefault();
    const cedula = accountCedula.replace(/\D/g, "");
    if (!/^[0-9]{5,15}$/.test(cedula)) {
      setMessage("Completa un número de cédula válido para crear el acceso.");
      setMessageType("error");
      return;
    }
    if (
      accountTarget.cedula &&
      String(accountTarget.cedula).replace(/\D/g, "") !== cedula
    ) {
      setMessage("La cédula debe coincidir con la registrada para este domiciliario.");
      setMessageType("error");
      return;
    }
    if (cedula !== accountCedulaConfirmation.replace(/\D/g, "")) {
      setMessage("Los números de cédula no coinciden.");
      setMessageType("error");
      return;
    }
    if (accountPassword.length < 8 || accountPassword.length > 72) {
      setMessage("La contraseña inicial debe tener entre 8 y 72 caracteres.");
      setMessageType("error");
      return;
    }
    if (accountPassword !== accountPasswordConfirmation) {
      setMessage("Las contraseñas no coinciden.");
      setMessageType("error");
      return;
    }

    setUpdatingCourierId(accountTarget.id);
    setMessage("");
    try {
      const access = await createCourierAccess(
        accountTarget.id,
        accountTarget.email,
        accountPassword,
        cedula,
      );
      setCouriers((current) =>
        current.map((item) =>
          item.id === accountTarget.id
            ? {
                ...item,
                name: access.name || item.name,
                email: access.email || item.email,
                auth_user_id: access.userId,
                store_orders_enabled: true,
              }
            : item,
        ),
      );
      setMessage(
        access.linkedExisting
          ? `Se vinculó la cuenta pública existente de ${access.name || accountTarget.name}. Su contraseña actual no cambió.`
          : `Acceso creado para ${accountTarget.name}. Comparte la contraseña por un canal privado.`,
      );
      setMessageType("success");
      setAccountTarget(null);
      setAccountPassword("");
      setAccountPasswordConfirmation("");
    } catch (error) {
      console.error("No se pudo crear el acceso del domiciliario:", error);
      setMessage(error.message || "No se pudo crear el acceso.");
      setMessageType("error");
    } finally {
      setUpdatingCourierId(null);
    }
  };

  const toggleDocuments = async (courier) => {
    if (expandedDocumentsId === courier.id) {
      setExpandedDocumentsId(null);
      return;
    }
    setExpandedDocumentsId(courier.id);

    const documentEntries = Object.entries(courier.document_paths || {});
    const results = await Promise.all(
      documentEntries.map(async ([key, path]) => {
        const { data, error } = await supabase.storage
          .from("courier-application-documents")
          .createSignedUrl(path, 60 * 5);
        if (error) throw error;
        return [key, data.signedUrl];
      }),
    ).catch((error) => {
      console.error("No se pudieron abrir los documentos del domiciliario:", error);
      setMessage(error.message || "No se pudieron abrir los documentos.");
      setMessageType("error");
      return null;
    });
    if (results) {
      setSignedDocuments((current) => ({
        ...current,
        [courier.id]: Object.fromEntries(results),
      }));
    }
  };

  const cedulaConfirmationMismatch =
    form.cedulaConfirmation.length > 0 &&
    form.cedula !== form.cedulaConfirmation;
  const phoneConfirmationMismatch =
    form.phoneConfirmation.trim().length > 0 &&
    form.phone.trim() !== form.phoneConfirmation.trim();
  const accountCedulaConfirmationMismatch =
    accountCedulaConfirmation.length > 0 &&
    accountCedula.replace(/\D/g, "") !==
      accountCedulaConfirmation.replace(/\D/g, "");

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-white/[0.06] pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Bike className="mt-0.5 shrink-0 text-violet-400" size={20} />
          <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-400">
            Equipo de reparto
          </p>
          <h2 className="mt-1 text-xl font-black text-white">Mis domiciliarios</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-500">
            Registra sus datos y documentos. Mientras el vínculo esté activo,
            los domiciliarios conectados tienen prioridad en los pedidos de tu
            tienda. Al pausarlo, conservan su acceso a los pedidos públicos.
          </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setMessage("");
              setMessageType("info");
              setSearchOpen(true);
            }}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-200 transition hover:bg-white/5 disabled:cursor-wait disabled:opacity-40"
          >
            <Search size={15} />
            Buscar domiciliario
          </button>
          <button
            type="button"
            onClick={() => {
              setMessage("");
              setMessageType("info");
              setRegistrationOpen(true);
            }}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition hover:bg-violet-500 disabled:cursor-wait disabled:opacity-40"
          >
            <Plus size={15} />
            Registrar domiciliario
          </button>
        </div>
      </header>

      <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-4 text-xs leading-5 text-amber-100">
        Los domiciliarios conectados a tu tienda tienen 10 segundos para aceptar
        cada pedido con prioridad. Después, queda disponible para domiciliarios
        públicos.
      </div>

      {registrationOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setRegistrationOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-courier-title"
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl"
          >
            <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/[0.07] bg-neutral-900/95 px-4 py-4 backdrop-blur sm:px-5">
              <h3 id="register-courier-title" className="text-sm font-black text-white">
                Registrar domiciliario
              </h3>
              <button
                type="button"
                onClick={() => setRegistrationOpen(false)}
                disabled={saving}
                aria-label="Cerrar formulario"
                className="rounded-lg p-2 text-neutral-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                <X size={17} />
              </button>
            </header>
            <form
              onSubmit={submit}
              className="space-y-5 p-4 sm:p-5"
            >
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">
            Vehículo
          </legend>
          {[
            ["car", "Carro", "Tengo carro para realizar entregas."],
            ["motorcycle", "Moto", "Tengo moto para realizar entregas."],
          ].map(([value, label, description]) => (
            <button
              key={value}
              type="button"
              onClick={() => updateForm("vehicleType", value)}
              className={`rounded-xl border p-3 text-left transition ${
                form.vehicleType === value
                  ? "border-violet-400 bg-violet-500/10"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-bold text-white">
                <Bike size={17} className="text-violet-300" />
                {label}
              </span>
              <span className="mt-1 block text-xs text-neutral-500">
                {description}
              </span>
            </button>
          ))}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs font-semibold text-neutral-300">
            Número de cédula
            <input
              required
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={15}
              value={form.cedula}
              onChange={(event) =>
                updateForm("cedula", event.target.value.replace(/\D/g, ""))
              }
              placeholder="Solo números"
              className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
            />
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-neutral-300">
            Repite el número de cédula
            <input
              required
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={15}
              value={form.cedulaConfirmation}
              onPaste={preventPaste}
              onChange={(event) =>
                updateForm(
                  "cedulaConfirmation",
                  event.target.value.replace(/\D/g, ""),
                )
              }
              placeholder="Vuelve a escribirla"
              aria-invalid={cedulaConfirmationMismatch}
              className={`w-full rounded-lg border bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none ${
                cedulaConfirmationMismatch
                  ? "border-rose-400 focus:border-rose-400"
                  : "border-white/10 focus:border-violet-400"
              }`}
            />
            {cedulaConfirmationMismatch && (
              <span
                role="status"
                aria-live="polite"
                className="block text-[11px] font-medium text-rose-300"
              >
                Los números de cédula no coinciden.
              </span>
            )}
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-neutral-300">
            Nombre completo
            <input
              required
              autoComplete="name"
              value={form.fullName}
              onChange={(event) => updateForm("fullName", event.target.value)}
              placeholder="Como aparece en tu documento"
              className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
            />
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-neutral-300">
            Correo de acceso
            <span className="relative block">
              <Mail
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
              />
              <input
                required
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) => updateForm("email", event.target.value)}
                placeholder="nombre@correo.com"
                className="w-full rounded-lg border border-white/10 bg-neutral-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-violet-400"
              />
            </span>
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-neutral-300">
            Número de teléfono
            <span className="relative block">
              <Phone
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
              />
              <input
                required
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(event) => updateForm("phone", event.target.value)}
                placeholder="Ej. 300 123 4567"
                className="w-full rounded-lg border border-white/10 bg-neutral-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-violet-400"
              />
            </span>
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-neutral-300">
            Repite el número
            <input
              required
              type="tel"
              inputMode="tel"
              value={form.phoneConfirmation}
              onPaste={preventPaste}
              onChange={(event) =>
                updateForm("phoneConfirmation", event.target.value)
              }
              placeholder="Vuelve a escribirlo"
              aria-invalid={phoneConfirmationMismatch}
              className={`w-full rounded-lg border bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none ${
                phoneConfirmationMismatch
                  ? "border-rose-400 focus:border-rose-400"
                  : "border-white/10 focus:border-violet-400"
              }`}
            />
            {phoneConfirmationMismatch && (
              <span
                role="status"
                aria-live="polite"
                className="block text-[11px] font-medium text-rose-300"
              >
                Los números de teléfono no coinciden.
              </span>
            )}
          </label>
        </div>

        <div>
          <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
            Documentos y fotos
          </h4>
          <p className="mt-1 text-xs text-neutral-500">
            Imágenes JPG, PNG o WEBP de hasta 10 MB. Los archivos son privados
            y solo los puede consultar esta tienda.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {DOCUMENT_FIELDS.map(({ key, label }) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/10 bg-neutral-950/40 p-3 transition hover:border-violet-400/40"
              >
                <ImagePlus size={18} className="shrink-0 text-violet-300" />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-neutral-200">
                    {label}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
                    {form.documents[key]?.name || "Seleccionar imagen"}
                  </span>
                </span>
                <input
                  type="file"
                  key={form.documents[key]?.name || "empty"}
                  accept="image/jpeg,image/png,image/webp"
                  capture={key === "profilePhoto" ? "user" : undefined}
                  className="sr-only"
                  onChange={(event) =>
                    updateForm(
                      "documents",
                      {
                        ...form.documents,
                        [key]: event.target.files?.[0] || null,
                      },
                    )
                  }
                />
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs font-semibold text-neutral-300">
            Contraseña inicial
            <span className="block text-[11px] font-normal leading-4 text-neutral-500">
              Si el correo ya pertenece a un domiciliario público, vincularemos
              esa cuenta y conservará su contraseña actual.
            </span>
            <input
              required
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              value={form.password}
              onChange={(event) => updateForm("password", event.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
            />
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-neutral-300">
            Repite la contraseña
            <input
              required
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              value={form.passwordConfirmation}
              onChange={(event) =>
                updateForm("passwordConfirmation", event.target.value)
              }
              placeholder="Vuelve a escribirla"
              className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
            />
          </label>
        </div>

        {message && (
          <p
            role={messageType === "error" ? "alert" : "status"}
            className={`text-xs leading-5 ${
              messageType === "error" ? "text-rose-300" : "text-emerald-300"
            }`}
          >
            {message}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || loading}
            className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition hover:bg-violet-500 disabled:cursor-wait disabled:opacity-40"
          >
            {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Bike size={15} />}
            {saving ? "Registrando..." : "Registrar domiciliario"}
          </button>
        </div>
            </form>
          </div>
        </div>
      )}

      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !searching &&
              !linkingSearchCandidate
            ) {
              setSearchOpen(false);
              setSearchCandidate(null);
            }
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="search-courier-title"
            onSubmit={(event) => {
              event.preventDefault();
              lookupCourierByCedula();
            }}
            className="max-h-[90vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900 p-5 shadow-2xl"
          >
            <header className="flex items-start justify-between gap-3">
              <div>
                <h3 id="search-courier-title" className="text-lg font-black text-white">
                  {searchCandidate ? "Revisar domiciliario" : "Buscar domiciliario"}
                </h3>
                <p className="mt-1 text-xs text-neutral-400">
                  Consulta la cédula y revisa todos sus documentos antes de
                  aceptar y vincularlo a tu tienda.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  setSearchCandidate(null);
                }}
                disabled={searching || linkingSearchCandidate}
                aria-label="Cerrar búsqueda"
                className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                <X size={17} />
              </button>
            </header>
            <label className="block space-y-1.5 text-xs font-semibold text-neutral-300">
              Cédula
              <input
                required
                autoFocus
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={15}
                value={searchCedula}
                onChange={(event) => {
                  setSearchCedula(event.target.value.replace(/\D/g, ""));
                  setSearchCandidate(null);
                  setMessage("");
                }}
                placeholder="Solo números"
                className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
              />
            </label>
            {searchCandidate && (
              <section className="space-y-4 rounded-xl border border-white/[0.08] bg-black/20 p-4">
                <div>
                  <h4 className="text-sm font-bold text-white">
                    {searchCandidate.name}
                  </h4>
                  <p className="mt-1 text-xs text-neutral-400">
                    Cédula: {searchCandidate.cedula}
                    {searchCandidate.phone ? ` · ${searchCandidate.phone}` : ""}
                    {searchCandidate.vehicle_type
                      ? ` · ${searchCandidate.vehicle_type === "motorcycle" ? "Moto" : "Carro"}`
                      : ""}
                  </p>
                  {searchCandidate.email && (
                    <p className="mt-1 text-xs text-neutral-400">
                      {searchCandidate.email}
                    </p>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {DOCUMENT_FIELDS.map(({ key, label }) => (
                    <a
                      key={key}
                      href={searchCandidate.documents[key]}
                      target="_blank"
                      rel="noreferrer"
                      className="overflow-hidden rounded-lg border border-white/10 bg-neutral-950 transition hover:border-violet-400/50"
                    >
                      <img
                        src={searchCandidate.documents[key]}
                        alt={label}
                        className="h-40 w-full object-contain"
                      />
                      <span className="block border-t border-white/[0.06] px-3 py-2 text-[11px] font-semibold text-violet-200">
                        {label}
                      </span>
                    </a>
                  ))}
                </div>
                <p className="text-xs leading-5 text-neutral-400">
                  Revisa las siete imágenes. Al aceptar, se vinculará su cuenta
                  a esta tienda.
                </p>
              </section>
            )}
            {message && messageType === "error" && (
              <p role="alert" className="text-xs leading-5 text-rose-300">
                {message}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="submit"
                disabled={
                  searching ||
                  linkingSearchCandidate ||
                  loading ||
                  !searchCedula
                }
                className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-neutral-200 transition hover:bg-white/5 disabled:cursor-wait disabled:opacity-50"
              >
                {searching ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <Search size={15} />
                )}
                {searching
                  ? "Buscando..."
                  : searchCandidate
                    ? "Buscar otra cédula"
                    : "Buscar"}
              </button>
              {searchCandidate && (
                <button
                  type="button"
                  onClick={linkCourierByCedula}
                  disabled={linkingSearchCandidate || searching}
                  className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-xs font-black uppercase tracking-widest transition hover:bg-violet-500 disabled:cursor-wait disabled:opacity-50"
                >
                  {linkingSearchCandidate && (
                    <LoaderCircle size={15} className="animate-spin" />
                  )}
                  {linkingSearchCandidate ? "Vinculando..." : "Aceptar y vincular"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-black text-white">Domiciliarios de mi tienda</h3>
          <p className="mt-1 text-xs text-neutral-500">
            El interruptor desactiva sus nuevas ofertas privadas de esta tienda.
            Al eliminarlo, sale del equipo sin perder su cuenta y puede seguir
            recibiendo ofertas públicas, incluso de tu tienda.
          </p>
        </div>
        {loading ? (
          <SubLoading label="Cargando domiciliarios" className="py-16" />
        ) : couriers.length === 0 ? (
          <p className="rounded-xl border border-white/[0.06] bg-neutral-900/30 px-4 py-5 text-xs text-neutral-500">
            Aún no has registrado domiciliarios para esta tienda.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/[0.07]">
            {couriers.map((courier) => {
              const storeLinked = courier.store_orders_enabled !== false;
              const detailsExpanded = expandedDocumentsId === courier.id;
              return (
                <article
                  key={courier.id}
                  className="border-b border-white/[0.06] p-4 last:border-b-0"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">
                        {courier.name}
                      </p>
                      <p className="mt-1 text-xs text-neutral-400">
                        {courier.vehicle_type
                          ? courier.vehicle_type === "motorcycle"
                            ? "Moto"
                            : "Carro"
                          : "Domiciliario"}
                        {!courier.auth_user_id && courier.cedula
                          ? ` · Cédula: ${courier.cedula}`
                          : ""}
                        {courier.phone ? ` · ${courier.phone}` : ""}
                      </p>
                      {courier.email && (
                        <p className="mt-1 truncate text-[11px] text-neutral-500">
                          {courier.email}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {!courier.auth_user_id ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAccountTarget(courier);
                            setAccountCedula(courier.cedula || "");
                            setAccountCedulaConfirmation(courier.cedula || "");
                            setAccountPassword("");
                            setAccountPasswordConfirmation("");
                            setMessage("");
                          }}
                          className="rounded-lg border border-amber-400/20 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-amber-200 transition hover:bg-amber-400/10"
                        >
                          Crear o vincular acceso
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold text-emerald-300">
                          Acceso creado
                        </span>
                      )}
                      {courier.document_paths && (
                        <button
                          type="button"
                          onClick={() => toggleDocuments(courier)}
                          className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-neutral-300 transition hover:bg-white/5"
                        >
                          {detailsExpanded ? "Ocultar documentos" : "Ver documentos"}
                        </button>
                      )}
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold ${
                            storeLinked ? "text-emerald-300" : "text-neutral-400"
                          }`}
                        >
                          {storeLinked ? "Trabaja con mi tienda" : "No trabaja con mi tienda"}
                        </span>
                        <CourierSwitch
                          enabled={storeLinked}
                          name={courier.name}
                          disabled={!courier.auth_user_id || updatingCourierId === courier.id}
                          onChange={() => toggleStoreLink(courier)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCourierToRemove(courier);
                          setMessage("");
                        }}
                        disabled={updatingCourierId === courier.id}
                        aria-label={`Eliminar a ${courier.name} de mi tienda`}
                        title="Eliminar de mi tienda"
                        className="flex items-center gap-1.5 rounded-lg border border-rose-400/20 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-rose-200 transition hover:bg-rose-400/10 disabled:cursor-wait disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                        Eliminar
                      </button>
                    </div>
                  </div>
                  {detailsExpanded && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
                      {DOCUMENT_FIELDS.map(({ key, label }) => {
                        const url = signedDocuments[courier.id]?.[key];
                        return url ? (
                          <a
                            key={key}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg bg-white/[0.04] px-3 py-2 text-[11px] text-violet-200 transition hover:bg-violet-500/10"
                          >
                            {label}
                          </a>
                        ) : null;
                      })}
                    </div>
                  )}
                  {courier.store_order_priority_enabled !== false &&
                    courier.auth_user_id &&
                    storeLinked && (
                      <p className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-200/80">
                        <Store size={12} />
                        Prioridad activa en pedidos de la tienda
                      </p>
                    )}
                </article>
              );
            })}
          </div>
        )}
        {message && (
          <p
            role={messageType === "error" ? "alert" : "status"}
            className={`text-xs leading-5 ${
              messageType === "error" ? "text-rose-300" : "text-emerald-300"
            }`}
          >
            {message}
          </p>
        )}
      </section>

      {accountTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !updatingCourierId) {
              setAccountTarget(null);
            }
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-courier-access-title"
            onSubmit={submitAccount}
            className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-neutral-900 p-5 shadow-2xl"
          >
            <header className="flex items-start justify-between gap-3">
              <div>
                <h3 id="create-courier-access-title" className="text-lg font-black text-white">
                  Crear o vincular acceso para {accountTarget.name}
                </h3>
                <p className="mt-1 text-xs text-neutral-400">
                  {accountTarget.email}. Si ya tiene una cuenta pública de
                  domiciliario, se vinculará sin cambiar su contraseña.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAccountTarget(null)}
                disabled={Boolean(updatingCourierId)}
                aria-label="Cerrar"
                className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                <X size={17} />
              </button>
            </header>
            <label className="block space-y-1.5 text-xs font-semibold text-neutral-300">
              Cédula
              <input
                required
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={15}
                disabled={Boolean(accountTarget.cedula)}
                value={accountCedula}
                onChange={(event) =>
                  setAccountCedula(event.target.value.replace(/\D/g, ""))
                }
                placeholder="Solo números"
                className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
              />
            </label>
            <label className="block space-y-1.5 text-xs font-semibold text-neutral-300">
              Repite la cédula
              <input
                required
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={15}
                disabled={Boolean(accountTarget.cedula)}
                value={accountCedulaConfirmation}
                onPaste={preventPaste}
                onChange={(event) =>
                  setAccountCedulaConfirmation(
                    event.target.value.replace(/\D/g, ""),
                  )
                }
                placeholder="Vuelve a escribirla"
                aria-invalid={accountCedulaConfirmationMismatch}
                className={`w-full rounded-lg border bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none ${
                  accountCedulaConfirmationMismatch
                    ? "border-rose-400 focus:border-rose-400"
                    : "border-white/10 focus:border-violet-400"
                }`}
              />
              {accountCedulaConfirmationMismatch && (
                <span
                  role="status"
                  aria-live="polite"
                  className="block text-[11px] font-medium text-rose-300"
                >
                  Los números de cédula no coinciden.
                </span>
              )}
            </label>
            <label className="block space-y-1.5 text-xs font-semibold text-neutral-300">
              Contraseña inicial
              <span className="relative block">
                <input
                  required
                  type={showAccountPassword ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  value={accountPassword}
                  onChange={(event) => setAccountPassword(event.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 pr-11 text-sm text-white outline-none focus:border-violet-400"
                />
                <button
                  type="button"
                  onClick={() => setShowAccountPassword((visible) => !visible)}
                  aria-label={showAccountPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-neutral-400 hover:text-white"
                >
                  {showAccountPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>
            <label className="block space-y-1.5 text-xs font-semibold text-neutral-300">
              Repite la contraseña
              <input
                required
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                value={accountPasswordConfirmation}
                onChange={(event) =>
                  setAccountPasswordConfirmation(event.target.value)
                }
                className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
              />
            </label>
            {messageType === "error" && message && (
              <p role="alert" className="text-xs text-rose-300">
                {message}
              </p>
            )}
            <button
              type="submit"
              disabled={Boolean(updatingCourierId)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-xs font-black uppercase tracking-widest transition hover:bg-violet-500 disabled:opacity-50"
            >
              {updatingCourierId === accountTarget.id && (
                <LoaderCircle size={15} className="animate-spin" />
              )}
              Crear o vincular acceso
            </button>
          </form>
        </div>
      )}

      {courierToRemove && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !updatingCourierId) {
              setCourierToRemove(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-courier-title"
            className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-neutral-900 p-5 shadow-2xl"
          >
            <header className="flex items-start justify-between gap-3">
              <div>
                <h3 id="remove-courier-title" className="text-lg font-black text-white">
                  Eliminar a {courierToRemove.name} de mi tienda
                </h3>
                <p className="mt-2 text-xs leading-5 text-neutral-400">
                  Se quitará su vínculo y dejará de recibir ofertas privadas de
                  tu tienda. Su cuenta de Gloto seguirá activa y podrá recibir
                  ofertas públicas, incluso de tu tienda. Los pedidos activos de
                  tienda quedarán disponibles para otro domiciliario.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCourierToRemove(null)}
                disabled={Boolean(updatingCourierId)}
                aria-label="Cerrar confirmación"
                className="rounded-lg p-2 text-neutral-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                <X size={17} />
              </button>
            </header>
            {messageType === "error" && message && (
              <p role="alert" className="text-xs leading-5 text-rose-300">
                {message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCourierToRemove(null)}
                disabled={Boolean(updatingCourierId)}
                className="rounded-lg border border-white/10 px-4 py-2.5 text-xs font-bold text-neutral-300 transition hover:bg-white/5 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={removeCourierFromStore}
                disabled={Boolean(updatingCourierId)}
                className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-rose-500 disabled:opacity-50"
              >
                {updatingCourierId === courierToRemove.id && (
                  <LoaderCircle size={14} className="animate-spin" />
                )}
                Eliminar de mi tienda
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
};

export default MisDomiciliarios;
