import { useEffect, useState } from "react";
import {
  Check,
  KeyRound,
  Mail,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import SubLoading from "./SubLoading";

const EMPTY_FORM = { name: "", area: "" };
const EMPTY_ACCOUNT_FORM = { email: "", password: "" };

const AREA_OPTIONS = [
  "Administrador/a",
  "Cajero/a",
  "Cocinero/a",
  "Auxiliar de cocina",
  "Mesero/a",
  "Domiciliario/a",
  "Barista",
  "Bartender",
  "Supervisor/a",
];

const ConfiguracionEmpleados = () => {
  const [businessId, setBusinessId] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingForm, setEditingForm] = useState(EMPTY_FORM);
  const [accountEmployeeId, setAccountEmployeeId] = useState(null);
  const [accountAction, setAccountAction] = useState("create");
  const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT_FORM);
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
      const { data, error } = await supabase
        .from("employees")
        .select("id,name,area,created_at,auth_user_id")
        .eq("business_id", profile.business_id)
        .order("name", { ascending: true });
      if (error) setMessage(error.message);
      else {
        const loadedEmployees = data || [];
        let employeesWithLoginEmail = loadedEmployees;
        const linkedCouriers = loadedEmployees.filter(
          (employee) =>
            employee.auth_user_id &&
            employee.area.toLowerCase().includes("domiciliario"),
        );
        if (linkedCouriers.length) {
          const {
            data: accountData,
            error: accountError,
          } = await supabase.functions.invoke("crear-cuenta-domiciliario", {
            body: { action: "account-emails" },
          });
          if (accountError || !accountData?.success) {
            console.error(
              "No se pudieron cargar los correos de acceso de domiciliarios:",
              accountError || accountData?.error,
            );
            setMessage(
              accountData?.error ||
                "No se pudieron cargar los correos de acceso de domiciliarios.",
            );
          } else {
            const emailByEmployeeId = accountData.emails || {};
            employeesWithLoginEmail = loadedEmployees.map((employee) => ({
              ...employee,
              login_email: emailByEmployeeId[employee.id] || "",
            }));
          }
        }
        setEmployees(employeesWithLoginEmail);
      }
      setLoading(false);
    };

    load();
  }, []);

  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    const area = form.area.trim();
    if (!businessId || !name || !area) {
      setMessage("Completa el nombre y el área del empleado.");
      return;
    }

    setSaving(true);
    setMessage("");
    const { data, error } = await supabase
      .from("employees")
      .insert({ business_id: businessId, name, area })
      .select("id,name,area,created_at,auth_user_id")
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
      .update({ name, area })
      .eq("id", employeeId)
      .select("id,name,area,created_at,auth_user_id")
      .single();

    if (error) {
      setMessage(error.message);
    } else {
      setEmployees((current) =>
        current
          .map((employee) => (employee.id === employeeId ? data : employee))
          .sort((first, second) => first.name.localeCompare(second.name)),
      );
      cancelEditing();
      setMessage("Empleado actualizado.");
    }
    setSaving(false);
  };

  const createCourierAccess = async (event, employee) => {
    event.preventDefault();
    const email = accountForm.email.trim().toLowerCase();
    const password = accountForm.password;
    if (!email || password.length < 8) {
      setMessage("Ingresa un correo válido y una contraseña de al menos 8 caracteres.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke(
        "crear-cuenta-domiciliario",
        {
          body: { employeeId: employee.id, email, password },
        },
      );

      if (error) {
        let errorMessage =
          error.message || "No se pudo crear el acceso del domiciliario.";
        if (error.context && typeof error.context.json === "function") {
          try {
            const responseBody = await error.context.json();
            errorMessage =
              responseBody?.error ||
              responseBody?.message ||
              errorMessage;
          } catch (parseError) {
            console.warn(
              "No se pudo leer el error al crear el acceso del domiciliario:",
              parseError,
            );
          }
        }
        console.error("No se pudo crear el acceso del domiciliario:", error);
        setMessage(errorMessage);
      } else if (!data?.success || !data?.userId) {
        setMessage(data?.error || "No se pudo confirmar la creación del acceso.");
      } else {
        setEmployees((current) =>
          current.map((item) =>
            item.id === employee.id
              ? { ...item, auth_user_id: data.userId, login_email: email }
              : item,
          ),
        );
        setAccountEmployeeId(null);
        setAccountForm(EMPTY_ACCOUNT_FORM);
        setAccountAction("create");
        setMessage(
          `Acceso creado para ${email}. Comparte la contraseña con ${employee.name}.`,
        );
      }
    } catch (error) {
      console.error("Error creando el acceso del domiciliario:", error);
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
    try {
      const { data, error } = await supabase.functions.invoke(
        "crear-cuenta-domiciliario",
        {
          body: {
            action,
            employeeId: employee.id,
            password: accountForm.password,
          },
        },
      );

      if (error) {
        let errorMessage = error.message || "No se pudo completar la acción.";
        if (error.context && typeof error.context.json === "function") {
          try {
            const responseBody = await error.context.json();
            errorMessage = [
              responseBody?.error,
              responseBody?.detail,
            ]
              .filter(Boolean)
              .join(" ");
          } catch (parseError) {
            console.warn(
              `No se pudo leer el error al ${action} la cuenta del domiciliario:`,
              parseError,
            );
          }
        }
        console.error(`No se pudo ${action} la cuenta del domiciliario:`, error);
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
          `Se quitó el acceso de ${employee.name} a este negocio. Su cuenta de Gloto se conservó.`,
        );
      }
    } catch (error) {
      console.error(`Error al ${action} la cuenta del domiciliario:`, error);
      setMessage("Ocurrió un error al completar la acción. Intenta de nuevo.");
    } finally {
      setSaving(false);
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
            Registra el nombre de cada empleado y el área donde trabaja.
          </p>
        </div>
      </header>

      <form
        onSubmit={save}
        className="grid gap-4 rounded-2xl border border-white/[0.07] bg-neutral-900/45 p-5 md:grid-cols-[1fr_1fr_auto] md:items-end"
      >
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
            onChange={(event) => update("area", event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-3 text-sm text-white outline-none transition focus:border-violet-400"
            required
          >
            <option value="" disabled>
              Selecciona un área
            </option>
            {AREA_OPTIONS.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={saving || loading}
          className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition hover:bg-violet-500 disabled:opacity-40"
        >
          <Plus size={15} /> {saving ? "Guardando..." : "Registrar"}
        </button>
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
                        onChange={(event) =>
                          updateEditing("area", event.target.value)
                        }
                        disabled={Boolean(employee.auth_user_id)}
                        className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                        aria-label="Área del empleado"
                      >
                        {AREA_OPTIONS.map((area) => (
                          <option key={area} value={area}>
                            {area}
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
                        {employee.area
                          .toLowerCase()
                          .includes("domiciliario") &&
                          (employee.auth_user_id ? (
                            <span className="px-2 text-[10px] font-bold text-emerald-300">
                              Portal habilitado
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setAccountEmployeeId(employee.id);
                                setAccountAction("create");
                                setAccountForm(EMPTY_ACCOUNT_FORM);
                                setMessage("");
                              }}
                              className="rounded-lg px-2 py-2 text-[10px] font-black uppercase tracking-wider text-violet-300 transition hover:bg-violet-400/10"
                            >
                              Crear acceso
                            </button>
                          ))}
                        {employee.area
                          .toLowerCase()
                          .includes("domiciliario") &&
                          employee.auth_user_id && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setAccountEmployeeId(employee.id);
                                  setAccountAction("reset");
                                  setAccountForm(EMPTY_ACCOUNT_FORM);
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
                                  setMessage("");
                                }}
                                disabled={saving}
                                className="rounded-lg px-2 py-2 text-[10px] font-black uppercase tracking-wider text-rose-300 transition hover:bg-rose-400/10 disabled:opacity-50"
                              >
                                Quitar acceso
                              </button>
                            </>
                          )}
                        <button
                          type="button"
                          onClick={() => {
                            setAccountEmployeeId(employee.id);
                            setAccountAction("remove-employee");
                            setAccountForm(EMPTY_ACCOUNT_FORM);
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
                          createCourierAccess(event, employee);
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
                              ? "Crea las credenciales que usará para iniciar sesión en el portal de domiciliarios."
                              : accountAction === "reset"
                                ? "Define una contraseña nueva. La contraseña actual dejará de funcionar; comparte la nueva con el domiciliario por un canal privado."
                                : accountAction === "unlink"
                                  ? "El domiciliario dejará de ver y tomar pedidos de esta tienda. Su cuenta de Gloto y contraseña se conservan; podrá vincular su cuenta al portal público cuando esa modalidad esté disponible. El empleado permanece registrado y sus domicilios activos quedan disponibles para otro domiciliario."
                                  : employee.auth_user_id
                                    ? "Se eliminará permanentemente el registro del empleado de esta tienda. Sus domicilios activos quedarán disponibles. La cuenta y contraseña de Gloto del domiciliario se conservarán."
                                    : "Se eliminará permanentemente el registro de este empleado de la tienda. Esta acción no se puede deshacer."}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setAccountEmployeeId(null);
                            setAccountForm(EMPTY_ACCOUNT_FORM);
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
                          autoComplete="off"
                          value={accountForm.email}
                          onChange={(event) =>
                            setAccountForm((current) => ({
                              ...current,
                              email: event.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
                          required
                        />
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
                          <input
                            type="password"
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
                            className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
                            required
                          />
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
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
};

export default ConfiguracionEmpleados;
