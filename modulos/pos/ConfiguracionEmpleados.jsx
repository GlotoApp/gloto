import { useEffect, useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import { EMPLOYEE_PERMISSION_OPTIONS } from "../../src/lib/employeePermissions";
import SubLoading from "./SubLoading";

const EMPTY_FORM = { name: "", area: "" };
const EMPTY_ACCOUNT_FORM = { email: "", password: "" };
const EMPTY_PERMISSIONS = {};
const isCourierArea = (area) =>
  String(area || "").toLowerCase().includes("domiciliario");
const isCourierEmployee = (employee) =>
  isCourierArea(employee?.area);

const getEmailSuggestions = (email, employeeName) => {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return [];

  const namePart = employeeName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const suggestions = [
    `${localPart}.${namePart}@${domain}`,
    `${namePart}.${localPart}@${domain}`,
    `${localPart}2@${domain}`,
  ];
  return [...new Set(suggestions)].filter((suggestion) => suggestion !== email);
};

const PermissionSwitch = ({ label, checked, onChange }) => (
  <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] px-3 py-2 text-xs text-neutral-300">
    <span>{label}</span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 ${
        checked ? "bg-violet-600" : "bg-white/15"
      }`}
    >
      <span
        aria-hidden="true"
        className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  </div>
);

const CourierPrioritySwitch = ({ checked, onChange }) => (
  <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-4">
    <div>
      <p className="text-sm font-bold text-amber-100">
        Prioridad para domiciliario de la tienda
      </p>
      <p className="mt-1 text-xs leading-relaxed text-neutral-300">
        Solo aplica a empleados del área de domiciliarios. Si está conectado,
        recibirá primero los pedidos de la tienda; si no acepta en 2 minutos,
        se ofrecerán a los domiciliarios públicos.
      </p>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Dar prioridad de dos minutos en pedidos de la tienda"
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
        checked ? "bg-amber-500" : "bg-white/15"
      }`}
    >
      <span
        aria-hidden="true"
        className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  </div>
);

const ConfiguracionEmpleados = () => {
  const [businessId, setBusinessId] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [areas, setAreas] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [employeePermissions, setEmployeePermissions] =
    useState(EMPTY_PERMISSIONS);
  const [employeeStoreOrderPriorityEnabled, setEmployeeStoreOrderPriorityEnabled] =
    useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingCourierId, setUpdatingCourierId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingForm, setEditingForm] = useState(EMPTY_FORM);
  const [accountEmployeeId, setAccountEmployeeId] = useState(null);
  const [permissionsEmployeeId, setPermissionsEmployeeId] = useState(null);
  const [editingPermissions, setEditingPermissions] =
    useState(EMPTY_PERMISSIONS);
  const [editingStoreOrderPriorityEnabled, setEditingStoreOrderPriorityEnabled] =
    useState(false);
  const [accountAction, setAccountAction] = useState("create");
  const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT_FORM);
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [emailSuggestions, setEmailSuggestions] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user?.id) return setLoading(false);

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", authData.user.id)
        .maybeSingle();
      if (profileError || !profile?.business_id) {
        setMessage(profileError?.message || "No se encontró la tienda.");
        return setLoading(false);
      }

      setBusinessId(profile.business_id);
      const [
        { data: areaData, error: areaError },
        { data: employeeData, error: employeeError },
      ] = await Promise.all([
        supabase
          .from("business_employee_areas")
          .select("id,name")
          .eq("business_id", profile.business_id)
          .order("name", { ascending: true }),
        supabase
          .from("employees")
          .select("id,name,area,area_id,permissions,created_at,auth_user_id,store_orders_enabled,store_order_priority_enabled")
          .eq("business_id", profile.business_id)
          .order("name", { ascending: true }),
      ]);
      if (areaError || employeeError) {
        setMessage((areaError || employeeError).message);
        return setLoading(false);
      }
      setAreas(areaData || []);
      const loadedEmployees = employeeData || [];
      let emailByEmployeeId = {};
      const linkedGroups = [
        {
          courier: true,
          employees: loadedEmployees.filter(
            (employee) => employee.auth_user_id && isCourierEmployee(employee),
          ),
          functionName: "crear-cuenta-domiciliario",
        },
        {
          courier: false,
          employees: loadedEmployees.filter(
            (employee) => employee.auth_user_id && !isCourierEmployee(employee),
          ),
          functionName: "gestionar-cuenta-empleado",
        },
      ];
      for (const group of linkedGroups) {
        if (!group.employees.length) continue;
        const { data: accountData, error: accountError } =
          await supabase.functions.invoke(group.functionName, {
            body: { action: "account-emails" },
          });
        if (accountError || !accountData?.success) {
          console.error(
            `No se pudieron cargar los correos de acceso${group.courier ? " de domiciliarios" : " de empleados"}:`,
            accountError || accountData?.error,
          );
          setMessage(
            accountData?.error || "No se pudieron cargar los correos de acceso.",
          );
        } else {
          emailByEmployeeId = {
            ...emailByEmployeeId,
            ...(accountData.emails || {}),
          };
        }
      }
      setEmployees(
        loadedEmployees.map((employee) => ({
          ...employee,
          login_email: emailByEmployeeId[employee.id] || "",
        })),
      );
      setLoading(false);
    };

    load();
  }, []);

  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  const selectArea = (areaName) => {
    update("area", areaName);
  };

  const togglePermission = (setPermissions, permission) => {
    setPermissions((current) => ({
      ...current,
      [permission]: current[permission] !== true,
    }));
  };

  const createArea = async () => {
    const name = newAreaName.trim();
    if (!businessId || !name) {
      setMessage("Escribe el nombre del área que quieres crear.");
      return;
    }
    setSaving(true);
    setMessage("");
    const { data, error } = await supabase
      .from("business_employee_areas")
      .insert({ business_id: businessId, name })
      .select("id,name")
      .single();
    if (error) {
      setMessage(
        error.code === "23505"
          ? "Ya existe un área con ese nombre en este negocio."
          : error.message,
      );
    } else {
      setAreas((current) =>
        [...current, data].sort((first, second) =>
          first.name.localeCompare(second.name),
        ),
      );
      setNewAreaName("");
      setForm((current) => ({ ...current, area: data.name }));
      setMessage(`Área "${data.name}" creada para este negocio.`);
    }
    setSaving(false);
  };

  const saveEmployeePermissions = async (employeeId) => {
    const employee = employees.find((item) => item.id === employeeId);
    setSaving(true);
    setMessage("");
    const { data, error } = await supabase
      .from("employees")
      .update({
        permissions: editingPermissions,
        store_order_priority_enabled:
          isCourierEmployee(employee) && editingStoreOrderPriorityEnabled,
      })
      .eq("id", employeeId)
      .eq("business_id", businessId)
      .select("id,name,permissions,store_order_priority_enabled")
      .single();
    if (error) {
      setMessage(error.message);
    } else {
      setEmployees((current) =>
        current.map((employee) =>
          employee.id === data.id
            ? {
                ...employee,
                permissions: data.permissions,
                store_order_priority_enabled:
                  data.store_order_priority_enabled,
              }
            : employee,
        ),
      );
      setPermissionsEmployeeId(null);
      setMessage(`Permisos actualizados para ${data.name}.`);
    }
    setSaving(false);
  };

  const save = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    const area = form.area.trim();
    const selectedArea = areas.find((item) => item.name === area);
    if (!businessId || !name || !selectedArea) {
      setMessage("Completa el nombre y el área del empleado.");
      return;
    }

    setSaving(true);
    setMessage("");
    const { data, error } = await supabase
      .from("employees")
      .insert({
        business_id: businessId,
        name,
        area,
        area_id: selectedArea.id,
        permissions: employeePermissions,
        store_order_priority_enabled:
          isCourierArea(area) && employeeStoreOrderPriorityEnabled,
      })
      .select("id,name,area,area_id,permissions,created_at,auth_user_id,store_orders_enabled,store_order_priority_enabled")
      .single();

    if (error) {
      setMessage(error.message);
    } else {
      setEmployees((current) =>
        [...current, data].sort((first, second) =>
          first.name.localeCompare(second.name),
        ),
      );
      setForm(EMPTY_FORM);
      setEmployeePermissions(EMPTY_PERMISSIONS);
      setEmployeeStoreOrderPriorityEnabled(false);
      setMessage("Empleado registrado.");
    }
    setSaving(false);
  };

  const startEditing = (employee) => {
    setEditingId(employee.id);
    setEditingForm({ name: employee.name, area: employee.area });
    setMessage("");
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingForm(EMPTY_FORM);
  };

  const updateEditing = (key, value) =>
    setEditingForm((current) => ({ ...current, [key]: value }));

  const updateEmployee = async (employeeId) => {
    const name = editingForm.name.trim();
    const area = editingForm.area.trim();
    if (!name || !area) {
      setMessage("Completa el nombre y el área del empleado.");
      return;
    }

    setSaving(true);
    setMessage("");
    const { data, error } = await supabase
      .from("employees")
      .update({
        name,
        area,
        area_id: areas.find((item) => item.name === area)?.id || null,
        ...(!isCourierArea(area) ? { store_order_priority_enabled: false } : {}),
      })
      .eq("id", employeeId)
      .select("id,name,area,area_id,permissions,created_at,auth_user_id,store_orders_enabled,store_order_priority_enabled")
      .single();

    if (error) {
      setMessage(error.message);
    } else {
      setEmployees((current) =>
        current
          .map((employee) =>
            employee.id === employeeId
              ? { ...employee, ...data }
              : employee,
          )
          .sort((first, second) => first.name.localeCompare(second.name)),
      );
      cancelEditing();
      setMessage("Empleado actualizado.");
    }
    setSaving(false);
  };

  const createEmployeeAccess = async (event, employee) => {
    event.preventDefault();
    const email = accountForm.email.trim().toLowerCase();
    const password = accountForm.password;
    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      password.length < 8 ||
      password.length > 72
    ) {
      setMessage("Ingresa un correo válido y una contraseña de 8 a 72 caracteres.");
      return;
    }

    setSaving(true);
    setMessage("");
    setEmailSuggestions([]);
    const functionName = isCourierEmployee(employee)
      ? "crear-cuenta-domiciliario"
      : "gestionar-cuenta-empleado";
    try {
      const { data, error } = await supabase.functions.invoke(
        functionName,
        {
          body: {
            employeeId: employee.id,
            email,
            password,
          },
        },
      );

      if (error) {
        let errorMessage =
          error.message || "No se pudo crear el acceso del empleado.";
        let emailAlreadyExists = false;
        if (error.context && typeof error.context.json === "function") {
          try {
            const responseBody = await error.context.json();
            emailAlreadyExists =
              responseBody?.code === "EMAIL_ALREADY_EXISTS";
            errorMessage = responseBody?.error || responseBody?.message || errorMessage;
          } catch (parseError) {
            console.warn(
              "No se pudo leer el error al crear el acceso del empleado:",
              parseError,
            );
          }
        }
        console.error("No se pudo crear el acceso del empleado:", error);
        setMessage(errorMessage);
        if (emailAlreadyExists) {
          setEmailSuggestions(getEmailSuggestions(email, employee.name));
        }
      } else if (!data?.success || !data?.userId) {
        if (data?.code === "EMAIL_ALREADY_EXISTS") {
          setMessage(data.error);
          setEmailSuggestions(getEmailSuggestions(email, employee.name));
        } else {
          setMessage(data?.error || "No se pudo confirmar la creación del acceso.");
        }
      } else {
        setEmployees((current) =>
          current.map((item) =>
            item.id === employee.id
              ? {
                  ...item,
                  auth_user_id: data.userId,
                  login_email: email,
                }
              : item,
          ),
        );
        setAccountEmployeeId(null);
        setAccountForm(EMPTY_ACCOUNT_FORM);
        setEmailSuggestions([]);
        setAccountAction("create");
        setMessage(
          `Acceso creado para ${email}. Comparte la contraseña con ${employee.name}.`,
        );
      }
    } catch (error) {
      console.error("Error creando el acceso del empleado:", error);
      setMessage("Ocurrió un error al crear el acceso. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const manageEmployeeAccount = async (employee, action) => {
    if (
      action === "reset" &&
      (accountForm.password.length < 8 || accountForm.password.length > 72)
    ) {
      setMessage("La nueva contraseña debe tener entre 8 y 72 caracteres.");
      return;
    }

    setSaving(true);
    setMessage("");
    const functionName = isCourierEmployee(employee)
      ? "crear-cuenta-domiciliario"
      : "gestionar-cuenta-empleado";
    try {
      const { data, error } = await supabase.functions.invoke(
        functionName,
        {
          body: {
            action,
            employeeId: employee.id,
            password: accountForm.password,
          },
        },
      );

      if (error) {
        let errorMessage =
          error.name === "FunctionsFetchError"
            ? "No se pudo conectar con la función de empleados. Verifica que gestionar-cuenta-empleado esté desplegada en el proyecto Supabase configurado y que el servicio esté disponible. No se confirmó la eliminación."
            : error.message || "No se pudo completar la acción.";
        if (error.context && typeof error.context.json === "function") {
          try {
            const responseBody = await error.context.json();
            const responseError = [
              responseBody?.error,
              responseBody?.detail,
            ]
              .filter(Boolean)
              .join(" ");
            if (responseError) errorMessage = responseError;
          } catch (parseError) {
            console.warn(
              `No se pudo leer el error al ${action} la cuenta del empleado:`,
              parseError,
            );
          }
        }
        console.error(`No se pudo ${action} la cuenta del empleado:`, error);
        setMessage(errorMessage || "No se pudo completar la acción.");
      } else if (!data?.success) {
        setMessage(data?.error || "No se pudo confirmar la acción.");
      } else if (action === "reset") {
        setAccountEmployeeId(null);
        setAccountForm(EMPTY_ACCOUNT_FORM);
        setAccountAction("create");
        setMessage(
          `Contraseña restablecida para ${employee.name}.`,
        );
      } else if (action === "remove-employee") {
        setEmployees((current) =>
          current.filter((item) => item.id !== employee.id),
        );
        setEditingId(null);
        setAccountEmployeeId(null);
        setAccountForm(EMPTY_ACCOUNT_FORM);
        setAccountAction("create");
        setMessage(`Se eliminó el registro de ${employee.name}.`);
      } else {
        setEmployees((current) =>
          current.map((item) =>
            item.id === employee.id
              ? { ...item, auth_user_id: null, login_email: "" }
              : item,
          ),
        );
        setAccountEmployeeId(null);
        setAccountForm(EMPTY_ACCOUNT_FORM);
        setAccountAction("create");
        setMessage(
          `Se quitó el acceso y se desactivaron las credenciales de ${employee.name}.`,
        );
      }
    } catch (error) {
      console.error(`Error al ${action} la cuenta del empleado:`, error);
      setMessage("Ocurrió un error al completar la acción. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const toggleCourierStoreOrders = async (employee) => {
    const enabled = employee.store_orders_enabled === false;
    setUpdatingCourierId(employee.id);
    setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke(
        "crear-cuenta-domiciliario",
        {
          body: {
            action: "set-store-orders-enabled",
            employeeId: employee.id,
            enabled,
          },
        },
      );
      if (error) {
        let errorMessage = error.message || "No se pudo actualizar la recepción de pedidos.";
        if (error.context && typeof error.context.json === "function") {
          try {
            const responseBody = await error.context.json();
            errorMessage = responseBody?.error || errorMessage;
          } catch (parseError) {
            console.warn(
              "No se pudo leer el error al actualizar la recepción de pedidos:",
              parseError,
            );
          }
        }
        console.error("No se pudo actualizar la recepción de pedidos:", error);
        setMessage(errorMessage);
        return;
      }
      if (!data?.success || typeof data.enabled !== "boolean") {
        setMessage(data?.error || "No se pudo confirmar el cambio.");
        return;
      }
      setEmployees((current) =>
        current.map((item) =>
          item.id === employee.id
            ? { ...item, store_orders_enabled: data.enabled }
            : item,
        ),
      );
      setMessage(
        data.enabled
          ? `${employee.name} puede recibir pedidos nuevos de esta tienda.`
          : `Se pausaron los pedidos nuevos de esta tienda para ${employee.name}. Sus domicilios asignados no cambian.`,
      );
    } catch (error) {
      console.error("Error al cambiar la recepción de pedidos:", error);
      setMessage("No se pudo conectar para actualizar la recepción de pedidos.");
    } finally {
      setUpdatingCourierId(null);
    }
  };

  return (
    <section className="space-y-6">
      <header className="flex items-start gap-3 border-b border-white/[0.06] pb-5">
        <UserRound className="mt-0.5 text-violet-400" size={20} />
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-400">
            Equipo
          </p>
          <h2 className="mt-1 text-xl font-black text-white">Empleados</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Organiza al equipo por áreas del negocio y define accesos individuales para cada empleado.
          </p>
        </div>
      </header>

      <form
        onSubmit={save}
        className="space-y-4 rounded-2xl border border-white/[0.07] bg-neutral-900/45 p-5"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
            Nombre
          </span>
          <input
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder="Nombre completo"
            className="w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-3 text-sm text-white outline-none transition focus:border-violet-400"
            required
          />
          </label>
          <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
            Área
          </span>
          <select
            value={form.area}
            onChange={(event) => selectArea(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-3 text-sm text-white outline-none transition focus:border-violet-400"
            required
          >
            <option value="" disabled>
              Selecciona un área
            </option>
            {areas.map((area) => (
              <option key={area.id} value={area.name}>
                {area.name}
              </option>
            ))}
            <option value="__new__">Crear un área nueva...</option>
          </select>
          </label>
        </div>

        {form.area === "__new__" && (
          <div className="flex flex-col gap-3 rounded-xl border border-violet-400/20 bg-violet-400/[0.04] p-4 sm:flex-row sm:items-end">
            <label className="flex-1 space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                Nombre del área nueva
              </span>
              <input
                value={newAreaName}
                onChange={(event) => setNewAreaName(event.target.value)}
                maxLength={80}
                placeholder="Ej. Atención al cliente"
                className="w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-3 text-sm text-white outline-none transition focus:border-violet-400"
              />
            </label>
            <button
              type="button"
              onClick={createArea}
              disabled={saving || !newAreaName.trim()}
              className="flex items-center justify-center gap-2 rounded-xl border border-violet-400/30 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-violet-200 transition hover:bg-violet-400/10 disabled:opacity-40"
            >
              <Plus size={15} /> Crear área
            </button>
          </div>
        )}

        {form.area && (
          <section className="space-y-3 rounded-xl border border-white/[0.07] bg-neutral-950/50 p-4">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-white">
                {form.name.trim()
                  ? `Permisos de ${form.name.trim()}`
                  : "Permisos del empleado"}
              </h3>
              <p className="mt-1 text-xs text-neutral-500">
                Estos permisos son individuales; otros empleados del área pueden tener accesos distintos.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {EMPLOYEE_PERMISSION_OPTIONS.map((permission) => (
                <PermissionSwitch
                  key={permission.key}
                  label={permission.label}
                  checked={employeePermissions[permission.key] === true}
                  onChange={() =>
                    togglePermission(setEmployeePermissions, permission.key)
                  }
                />
              ))}
            </div>
            {isCourierArea(
              form.area === "__new__" ? newAreaName : form.area,
            ) && (
              <CourierPrioritySwitch
                checked={employeeStoreOrderPriorityEnabled}
                onChange={() =>
                  setEmployeeStoreOrderPriorityEnabled((enabled) => !enabled)
                }
              />
            )}
          </section>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || loading}
            className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition hover:bg-violet-500 disabled:opacity-40"
          >
            <Plus size={15} /> {saving ? "Guardando..." : "Registrar empleado"}
          </button>
        </div>
      </form>

      {loading ? (
        <SubLoading
          label="Cargando empleados"
          className="py-24"
          dotClassName="bg-violet-400"
          fullHeight
        />
      ) : (
        <>
          {message && <p className="text-xs text-emerald-300">{message}</p>}
          <div className="overflow-hidden rounded-2xl border border-white/[0.07]">
            <div className="grid grid-cols-[1fr_1fr] border-b border-white/[0.07] bg-neutral-950/80 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-500">
              <span>Empleado</span>
              <span>Área</span>
            </div>
            {!loading && employees.length === 0 && (
              <p className="px-4 py-5 text-xs text-neutral-500">
                Todavía no hay empleados registrados.
              </p>
            )}
            {employees.map((employee) => (
              <div
                key={employee.id}
                className="border-b border-white/[0.05] px-4 py-4 text-sm last:border-b-0"
              >
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-center">
                  {editingId === employee.id ? (
                    <>
                      <input
                        value={editingForm.name}
                        onChange={(event) =>
                          updateEditing("name", event.target.value)
                        }
                        className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                        aria-label="Nombre del empleado"
                      />
                      <select
                        value={editingForm.area}
                        onChange={(event) => updateEditing("area", event.target.value)}
                        disabled={Boolean(
                          employee.auth_user_id && isCourierEmployee(employee),
                        )}
                        className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                        aria-label="Área del empleado"
                      >
                        {areas.map((area) => (
                          <option key={area.id} value={area.name}>
                            {area.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => updateEmployee(employee.id)}
                          disabled={saving}
                          className="rounded-lg p-2 text-emerald-300 transition hover:bg-emerald-400/10 disabled:opacity-40"
                          aria-label="Guardar cambios"
                          title="Guardar cambios"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditing}
                          className="rounded-lg p-2 text-neutral-400 transition hover:bg-white/10 hover:text-white"
                          aria-label="Cancelar edición"
                          title="Cancelar edición"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-white">
                        {employee.name}
                      </span>
                      <div className="flex flex-wrap items-center gap-2 text-neutral-400">
                        <span>{employee.area}</span>
                        {employee.auth_user_id && (
                          <>
                            <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-300">
                              Acceso activo
                            </span>
                            <span className="text-[11px] text-neutral-500">
                              Inicia con:{" "}
                              <span className="text-neutral-300">
                                {employee.login_email || "Correo no disponible"}
                              </span>
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1 justify-self-start md:justify-self-end">
                        {employee.auth_user_id ? (
                          <>
                            {isCourierEmployee(employee) && (
                              <div className="flex flex-col gap-2 px-2">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`text-[10px] font-bold ${
                                      employee.store_orders_enabled === false
                                        ? "text-amber-300"
                                        : "text-emerald-300"
                                    }`}
                                  >
                                    {employee.store_orders_enabled === false
                                      ? "Pedidos pausados"
                                      : "Recibe pedidos"}
                                  </span>
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={employee.store_orders_enabled !== false}
                                    aria-label={`${
                                      employee.store_orders_enabled === false
                                        ? "Permitir"
                                        : "Pausar"
                                    } pedidos de tienda para ${employee.name}`}
                                    title={
                                      employee.store_orders_enabled === false
                                        ? "Permitir nuevos pedidos de esta tienda"
                                        : "Pausar nuevos pedidos de esta tienda"
                                    }
                                    onClick={() => toggleCourierStoreOrders(employee)}
                                    disabled={updatingCourierId === employee.id}
                                    className={`relative h-6 w-11 shrink-0 rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-wait disabled:opacity-50 ${
                                      employee.store_orders_enabled === false
                                        ? "bg-white/15"
                                        : "bg-violet-600"
                                    }`}
                                  >
                                    <span
                                      aria-hidden="true"
                                      className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                        employee.store_orders_enabled === false
                                          ? "translate-x-0"
                                          : "translate-x-5"
                                      }`}
                                    />
                                  </button>
                                </div>
                              </div>
                            )}
                            <span className="px-2 text-[10px] font-bold text-emerald-300">
                              {isCourierEmployee(employee)
                                ? "Portal habilitado"
                                : "Acceso activo"}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setAccountEmployeeId(employee.id);
                                setAccountAction("reset");
                                setAccountForm(EMPTY_ACCOUNT_FORM);
                                setEmailSuggestions([]);
                                setMessage("");
                              }}
                              className="rounded-lg px-2 py-2 text-[10px] font-black uppercase tracking-wider text-amber-300 transition hover:bg-amber-400/10"
                            >
                              Restablecer
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAccountEmployeeId(employee.id);
                                setAccountAction("unlink");
                                setAccountForm(EMPTY_ACCOUNT_FORM);
                                setEmailSuggestions([]);
                                setMessage("");
                              }}
                              disabled={saving}
                              className="rounded-lg px-2 py-2 text-[10px] font-black uppercase tracking-wider text-rose-300 transition hover:bg-rose-400/10 disabled:opacity-50"
                            >
                              Quitar acceso
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setAccountEmployeeId(employee.id);
                              setAccountAction("create");
                              setAccountForm(EMPTY_ACCOUNT_FORM);
                              setEmailSuggestions([]);
                              setMessage("");
                            }}
                            className="rounded-lg px-2 py-2 text-[10px] font-black uppercase tracking-wider text-violet-300 transition hover:bg-violet-400/10"
                          >
                            Crear acceso
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setPermissionsEmployeeId(employee.id);
                            setEditingPermissions(employee.permissions || {});
                            setEditingStoreOrderPriorityEnabled(
                              employee.store_order_priority_enabled === true,
                            );
                            setMessage("");
                          }}
                          className="rounded-lg px-2 py-2 text-[10px] font-black uppercase tracking-wider text-violet-300 transition hover:bg-violet-400/10"
                        >
                          Permisos
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAccountEmployeeId(employee.id);
                            setAccountAction("remove-employee");
                            setAccountForm(EMPTY_ACCOUNT_FORM);
                            setEmailSuggestions([]);
                            setMessage("");
                          }}
                          disabled={saving}
                          className="rounded-lg p-2 text-rose-300 transition hover:bg-rose-400/10 disabled:opacity-50"
                          aria-label={`Eliminar empleado ${employee.name}`}
                          title="Eliminar empleado"
                        >
                          <Trash2 size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditing(employee)}
                          className="rounded-lg p-2 text-neutral-400 transition hover:bg-violet-400/10 hover:text-violet-300"
                          aria-label={`Editar ${employee.name}`}
                          title="Editar empleado"
                        >
                          <Pencil size={15} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {accountEmployeeId === employee.id && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
                    onMouseDown={(event) => {
                      if (event.target === event.currentTarget && !saving) {
                        setAccountEmployeeId(null);
                        setAccountForm(EMPTY_ACCOUNT_FORM);
                        setShowAccountPassword(false);
                      }
                    }}
                  >
                    <form
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="courier-account-modal-title"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (accountAction === "create") {
                          createEmployeeAccess(event, employee);
                        } else {
                          manageEmployeeAccount(employee, accountAction);
                        }
                      }}
                      className="w-full max-w-lg space-y-5 rounded-2xl border border-white/10 bg-neutral-900 p-5 shadow-2xl sm:p-6"
                    >
                      <header className="flex items-start justify-between gap-4">
                        <div>
                          <h3
                            id="courier-account-modal-title"
                            className="text-lg font-black text-white"
                          >
                            {accountAction === "create"
                              ? `Crear acceso para ${employee.name}`
                              : accountAction === "reset"
                                ? `Restablecer contraseña`
                                : accountAction === "unlink"
                                  ? `Quitar acceso a ${employee.name}`
                                  : `Eliminar empleado ${employee.name}`}
                          </h3>
                          <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                            {accountAction === "create"
                              ? isCourierEmployee(employee)
                                ? "Crea las credenciales que usará para iniciar sesión en el portal de domiciliarios."
                                : "Crea las credenciales individuales con las que iniciará sesión en el POS. Sus permisos dependen del área asignada."
                              : accountAction === "reset"
                                ? `Define una contraseña nueva para ${isCourierEmployee(employee) ? "el domiciliario" : "el empleado"}. La contraseña actual dejará de funcionar; comparte la nueva por un canal privado.`
                                : accountAction === "unlink"
                                  ? isCourierEmployee(employee)
                                    ? "El domiciliario dejará de ver y tomar pedidos de esta tienda. Su cuenta de Gloto y contraseña se conservan; el empleado permanece registrado y sus domicilios activos quedan disponibles para otro domiciliario."
                                    : "Se desactivarán las credenciales individuales del empleado. El registro del empleado permanecerá en el área."
                                  : employee.auth_user_id
                                    ? isCourierEmployee(employee)
                                      ? "Se eliminará permanentemente el registro del empleado de esta tienda. Sus domicilios activos quedarán disponibles. La cuenta y contraseña de Gloto del domiciliario se conservarán."
                                      : "Se eliminarán permanentemente el registro del empleado y su acceso individual."
                                    : "Se eliminará permanentemente el registro de este empleado de la tienda. Esta acción no se puede deshacer."}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setAccountEmployeeId(null);
                            setAccountForm(EMPTY_ACCOUNT_FORM);
                            setShowAccountPassword(false);
                          }}
                          disabled={saving}
                          className="rounded-lg p-2 text-neutral-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                          aria-label="Cerrar ventana"
                        >
                          <X size={18} />
                        </button>
                      </header>
                      {accountAction === "create" && (
                      <label className="space-y-2">
                        <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                          <Mail size={13} /> Correo de acceso
                        </span>
                        <input
                          type="email"
                          autoComplete="email"
                          placeholder="nombre@correo.com"
                          value={accountForm.email}
                          onChange={(event) => {
                            setAccountForm((current) => ({
                              ...current,
                              email: event.target.value,
                            }));
                            setEmailSuggestions([]);
                            setMessage("");
                          }}
                          className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
                          required
                        />
                        <span className="block text-[11px] text-neutral-500">
                          Al crear el acceso comprobaremos si ya está registrado y, si lo está, sugeriremos variantes.
                        </span>
                      </label>
                      )}
                      {(accountAction === "create" ||
                        accountAction === "reset") && (
                        <label className="block space-y-2">
                          <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                            <KeyRound size={13} />
                            {accountAction === "create"
                              ? "Contraseña inicial"
                              : "Nueva contraseña"}
                          </span>
                          <div className="relative">
                            <input
                              type={showAccountPassword ? "text" : "password"}
                              autoComplete="new-password"
                              minLength={8}
                              maxLength={72}
                              value={accountForm.password}
                              onChange={(event) =>
                                setAccountForm((current) => ({
                                  ...current,
                                  password: event.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 pr-11 text-sm text-white outline-none focus:border-violet-400"
                              required
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setShowAccountPassword((visible) => !visible)
                              }
                              className="absolute inset-y-0 right-0 flex items-center px-3 text-neutral-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400"
                              aria-label={
                                showAccountPassword
                                  ? "Ocultar contraseña"
                                  : "Mostrar contraseña"
                              }
                              aria-pressed={showAccountPassword}
                            >
                              {showAccountPassword ? (
                                <EyeOff size={17} />
                              ) : (
                                <Eye size={17} />
                              )}
                            </button>
                          </div>
                          <span className="block text-[11px] text-neutral-500">
                            Debe tener entre 8 y 72 caracteres.
                          </span>
                        </label>
                      )}
                      {message && (
                        <p role="alert" className="text-sm text-rose-300">
                          {message}
                        </p>
                      )}
                      {emailSuggestions.length > 0 && (
                        <div
                          aria-live="polite"
                          className="space-y-2 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3"
                        >
                          <p className="text-xs text-amber-100">
                            Prueba otra dirección a la que el empleado pueda acceder. Estas variantes no están verificadas:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {emailSuggestions.map((suggestion) => (
                              <button
                                key={suggestion}
                                type="button"
                                onClick={() => {
                                  setAccountForm((current) => ({
                                    ...current,
                                    email: suggestion,
                                  }));
                                  setEmailSuggestions([]);
                                  setMessage("");
                                }}
                                className="rounded-md border border-amber-200/20 px-2 py-1 text-xs text-amber-100 transition hover:bg-amber-200/10"
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setAccountEmployeeId(null);
                            setAccountForm(EMPTY_ACCOUNT_FORM);
                          }}
                          disabled={saving}
                          className="rounded-lg border border-white/10 px-4 py-2.5 text-xs font-bold text-neutral-300 transition hover:bg-white/5 disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          className={`rounded-lg px-4 py-2.5 text-xs font-black transition disabled:opacity-50 ${
                          accountAction === "unlink" ||
                          accountAction === "remove-employee"
                              ? "bg-rose-600 text-white hover:bg-rose-500"
                              : "bg-violet-600 text-white hover:bg-violet-500"
                          }`}
                        >
                          {saving
                            ? "Procesando..."
                            : accountAction === "create"
                              ? "Crear acceso"
                              : accountAction === "reset"
                                ? "Guardar contraseña"
                                : accountAction === "unlink"
                                  ? "Sí, quitar acceso"
                                  : "Eliminar empleado"}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
                {permissionsEmployeeId === employee.id && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
                    onMouseDown={(event) => {
                      if (event.target === event.currentTarget && !saving) {
                        setPermissionsEmployeeId(null);
                      }
                    }}
                  >
                    <section
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="employee-permissions-title"
                      className="w-full max-w-2xl space-y-5 rounded-2xl border border-white/10 bg-neutral-900 p-5 shadow-2xl sm:p-6"
                    >
                      <header className="flex items-start justify-between gap-4">
                        <div>
                          <h3
                            id="employee-permissions-title"
                            className="text-lg font-black text-white"
                          >
                            Accesos de {employee.name}
                          </h3>
                          <p className="mt-2 text-sm text-neutral-400">
                            Los permisos se asignan a esta persona y no cambian
                            los accesos de los demás integrantes de {employee.area}.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPermissionsEmployeeId(null)}
                          disabled={saving}
                          className="rounded-lg p-2 text-neutral-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                          aria-label="Cerrar ventana"
                        >
                          <X size={18} />
                        </button>
                      </header>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {EMPLOYEE_PERMISSION_OPTIONS.map((permission) => (
                          <PermissionSwitch
                            key={permission.key}
                            label={permission.label}
                            checked={editingPermissions[permission.key] === true}
                            onChange={() =>
                              togglePermission(
                                setEditingPermissions,
                                permission.key,
                              )
                            }
                          />
                        ))}
                      </div>
                      {isCourierEmployee(employee) && (
                        <CourierPrioritySwitch
                          checked={editingStoreOrderPriorityEnabled}
                          onChange={() =>
                            setEditingStoreOrderPriorityEnabled(
                              (enabled) => !enabled,
                            )
                          }
                        />
                      )}
                      {message && (
                        <p role="alert" className="text-sm text-rose-300">
                          {message}
                        </p>
                      )}
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setPermissionsEmployeeId(null)}
                          disabled={saving}
                          className="rounded-lg border border-white/10 px-4 py-2.5 text-xs font-bold text-neutral-300 transition hover:bg-white/5 disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEmployeePermissions(employee.id)}
                          disabled={saving}
                          className="rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-violet-500 disabled:opacity-50"
                        >
                          {saving ? "Guardando..." : "Guardar permisos"}
                        </button>
                      </div>
                    </section>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
};

export default ConfiguracionEmpleados;
