import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse(401, { error: "Debes iniciar sesión como administrador del negocio." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Faltan secretos para gestionar cuentas de empleados.");
    return jsonResponse(500, { error: "El servicio no está configurado." });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerData, error: callerError } =
    await callerClient.auth.getUser();
  if (callerError || !callerData.user) {
    return jsonResponse(401, { error: "La sesión no es válida. Inicia sesión de nuevo." });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("business_id,role")
    .eq("id", callerData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("No se pudo verificar el perfil del administrador:", profileError);
    return jsonResponse(500, { error: "No se pudo verificar el permiso." });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "La solicitud no contiene datos válidos." });
  }
  if (!isRecord(body)) {
    return jsonResponse(400, { error: "La solicitud no contiene datos válidos." });
  }

  const action =
    typeof body.action === "string" ? body.action.trim().toLowerCase() : "create";
  const isBusinessAdmin =
    Boolean(callerProfile?.business_id) &&
    String(callerProfile.role || "").toLowerCase() === "admin";

  if (action === "statistics-dashboard") {
    if (!callerProfile?.business_id) {
      return jsonResponse(403, { error: "El usuario no está asociado a un negocio." });
    }
    if (!isBusinessAdmin) {
      const { data: employee, error: employeeError } = await adminClient
        .from("employees")
        .select("area_id,permissions")
        .eq("business_id", callerProfile.business_id)
        .eq("auth_user_id", callerData.user.id)
        .maybeSingle();
      if (employeeError) {
        console.error("No se pudieron verificar los permisos de estadísticas:", employeeError);
        return jsonResponse(500, { error: "No se pudieron verificar los permisos." });
      }
      if (!employee?.area_id) {
        return jsonResponse(403, { error: "No tienes permiso para ver estadísticas." });
      }
      if (employee.permissions?.estadisticas !== true) {
        return jsonResponse(403, { error: "No tienes permiso para ver estadísticas." });
      }
    }

    const startDate =
      typeof body.startDate === "string" ? body.startDate : "";
    const endDate = typeof body.endDate === "string" ? body.endDate : "";
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
      startDate > endDate
    ) {
      return jsonResponse(400, { error: "El rango de fechas no es válido." });
    }
    const { data, error } = await adminClient.rpc(
      "get_statistics_dashboard_for_employee",
      {
      p_user_id: callerData.user.id,
      p_start_date: startDate,
      p_end_date: endDate,
      },
    );
    if (error) {
      console.error("No se pudo cargar el panel de estadísticas:", error);
      return jsonResponse(500, { error: "No se pudieron cargar las estadísticas." });
    }
    return jsonResponse(200, { success: true, data });
  }

  if (!isBusinessAdmin) {
    return jsonResponse(403, {
      error: "Solo el administrador del negocio puede gestionar estos accesos.",
    });
  }

  if (action === "account-emails") {
    const { data: employees, error: employeesError } = await adminClient
      .from("employees")
      .select("id,auth_user_id")
      .eq("business_id", callerProfile.business_id)
      .not("auth_user_id", "is", null);
    if (employeesError) {
      console.error("No se pudieron consultar los accesos de empleados:", employeesError);
      return jsonResponse(500, { error: "No se pudieron consultar los correos de acceso." });
    }

    const userIds = (employees || [])
      .map((employee) => employee.auth_user_id)
      .filter((userId): userId is string => typeof userId === "string");
    if (!userIds.length) return jsonResponse(200, { success: true, emails: {} });

    const { data: profiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("id,email")
      .in("id", userIds);
    if (profilesError) {
      console.error("No se pudieron consultar los correos de acceso:", profilesError);
      return jsonResponse(500, { error: "No se pudieron consultar los correos de acceso." });
    }
    const emailByUserId = new Map(
      (profiles || []).map((profile) => [profile.id, profile.email || ""]),
    );
    return jsonResponse(200, {
      success: true,
      emails: Object.fromEntries(
        (employees || []).map((employee) => [
          employee.id,
          employee.auth_user_id
            ? emailByUserId.get(employee.auth_user_id) || ""
            : "",
        ]),
      ),
    });
  }

  const employeeId =
    typeof body.employeeId === "string" ? body.employeeId.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isUuid(employeeId)) {
    return jsonResponse(400, { error: "El empleado seleccionado no es válido." });
  }

  const { data: employee, error: employeeError } = await adminClient
    .from("employees")
    .select("id,name,area,area_id,auth_user_id")
    .eq("id", employeeId)
    .eq("business_id", callerProfile.business_id)
    .maybeSingle();
  if (employeeError) {
    console.error("No se pudo verificar el empleado:", employeeError);
    return jsonResponse(500, { error: "No se pudo verificar el empleado." });
  }
  if (!employee) {
    return jsonResponse(404, { error: "El empleado no pertenece a este negocio." });
  }
  if (String(employee.area || "").toLowerCase().includes("domiciliario")) {
    return jsonResponse(409, {
      error: "Los accesos de domiciliarios se gestionan desde su portal especializado.",
    });
  }

  if (action === "remove-employee" && !employee.auth_user_id) {
    const { error: removeError } = await adminClient
      .from("employees")
      .delete()
      .eq("id", employeeId)
      .eq("business_id", callerProfile.business_id);
    if (removeError) {
      console.error("No se pudo eliminar el empleado:", removeError);
      return jsonResponse(500, { error: "No se pudo eliminar el empleado." });
    }
    return jsonResponse(200, { success: true, action });
  }

  if (action === "create") {
    if (!employee.area_id) {
      return jsonResponse(409, { error: "Asigna al empleado a un área antes de crear su acceso." });
    }
    const { data: area, error: areaError } = await adminClient
      .from("business_employee_areas")
      .select("id")
      .eq("id", employee.area_id)
      .eq("business_id", callerProfile.business_id)
      .maybeSingle();
    if (areaError || !area) {
      console.error("No se pudo validar el área del empleado:", areaError);
      return jsonResponse(409, { error: "El área del empleado no es válida." });
    }
    if (employee.auth_user_id) {
      return jsonResponse(409, { error: "Este empleado ya tiene un acceso activo." });
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse(400, { error: "Ingresa un correo válido." });
    }
    if (password.length < 8 || password.length > 72) {
      return jsonResponse(400, { error: "La contraseña debe tener entre 8 y 72 caracteres." });
    }

    const { data: createdUser, error: createUserError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: employee.name, employee_access: true },
      });
    if (createUserError || !createdUser.user?.id) {
      console.error("No se pudo crear la cuenta de Auth:", createUserError);
      if (
        createUserError?.code === "email_exists" ||
        /already (registered|exists)|email.*already/i.test(
          createUserError?.message || "",
        )
      ) {
        return jsonResponse(409, {
          code: "EMAIL_ALREADY_EXISTS",
          error: "Este correo ya está registrado. Elige otro correo al que el empleado pueda acceder.",
        });
      }
      return jsonResponse(400, {
        error: createUserError?.message || "No se pudo crear la cuenta.",
      });
    }

    const userId = createdUser.user.id;
    const { error: profileUpsertError } = await adminClient.from("profiles").upsert(
      {
        id: userId,
        username: email,
        email,
        role: "empleado",
        business_id: callerProfile.business_id,
        onboarding_completed: true,
      },
      { onConflict: "id" },
    );
    if (profileUpsertError) {
      console.error("No se pudo crear el perfil del empleado:", profileUpsertError);
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(userId);
      if (cleanupError) console.error("No se pudo revertir la cuenta de Auth:", cleanupError);
      return jsonResponse(500, { error: "No se pudo completar el perfil del empleado." });
    }

    const { data: linkedEmployee, error: linkError } = await adminClient
      .from("employees")
      .update({ auth_user_id: userId })
      .eq("id", employeeId)
      .eq("business_id", callerProfile.business_id)
      .is("auth_user_id", null)
      .select("id")
      .maybeSingle();
    if (linkError || !linkedEmployee) {
      console.error("No se pudo vincular la cuenta al empleado:", linkError);
      const { error: deleteProfileError } = await adminClient
        .from("profiles")
        .delete()
        .eq("id", userId);
      if (deleteProfileError) console.error("No se pudo revertir el perfil:", deleteProfileError);
      const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
      if (deleteUserError) console.error("No se pudo revertir la cuenta de Auth:", deleteUserError);
      return jsonResponse(409, { error: "El empleado ya tiene acceso o no se pudo vincular." });
    }

    return jsonResponse(200, { success: true, userId, email });
  }

  if (!employee.auth_user_id) {
    return jsonResponse(404, { error: "Este empleado no tiene un acceso activo." });
  }

  const { data: linkedProfile, error: linkedProfileError } = await adminClient
    .from("profiles")
    .select("id,role,business_id")
    .eq("id", employee.auth_user_id)
    .maybeSingle();
  if (linkedProfileError) {
    console.error("No se pudo verificar la cuenta del empleado:", linkedProfileError);
    return jsonResponse(500, { error: "No se pudo verificar la cuenta." });
  }
  if (
    !linkedProfile ||
    !["empleado", "employee"].includes(String(linkedProfile.role || "").toLowerCase()) ||
    linkedProfile.business_id !== callerProfile.business_id
  ) {
    return jsonResponse(409, { error: "La cuenta vinculada no corresponde a este empleado." });
  }

  if (action === "reset") {
    if (password.length < 8 || password.length > 72) {
      return jsonResponse(400, { error: "La contraseña debe tener entre 8 y 72 caracteres." });
    }
    const { error: resetError } = await adminClient.auth.admin.updateUserById(
      employee.auth_user_id,
      { password },
    );
    if (resetError) {
      console.error("No se pudo restablecer la contraseña:", resetError);
      return jsonResponse(500, { error: "No se pudo restablecer la contraseña del empleado." });
    }
    return jsonResponse(200, { success: true, action });
  }

  if (action === "unlink" || action === "remove-employee") {
    const { error: unlinkError } = await adminClient
      .from("employees")
      .update({ auth_user_id: null })
      .eq("id", employeeId)
      .eq("business_id", callerProfile.business_id)
      .eq("auth_user_id", employee.auth_user_id);
    if (unlinkError) {
      console.error("No se pudo quitar el vínculo del empleado:", unlinkError);
      return jsonResponse(500, { error: "No se pudo quitar el vínculo del empleado." });
    }

    const { error: profileDeleteError } = await adminClient
      .from("profiles")
      .delete()
      .eq("id", employee.auth_user_id);
    if (profileDeleteError) {
      console.error("No se pudo desactivar el perfil del empleado:", profileDeleteError);
      const { error: relinkError } = await adminClient
        .from("employees")
        .update({ auth_user_id: employee.auth_user_id })
        .eq("id", employeeId)
        .eq("business_id", callerProfile.business_id)
        .is("auth_user_id", null);
      if (relinkError) console.error("No se pudo restaurar el vínculo del empleado:", relinkError);
      return jsonResponse(500, { error: "No se pudo desactivar el perfil del empleado." });
    }
    const { error: userDeleteError } = await adminClient.auth.admin.deleteUser(
      employee.auth_user_id,
    );
    if (userDeleteError) {
      console.error("No se pudo eliminar el acceso de Auth:", userDeleteError);
      return jsonResponse(500, { error: "No se pudo desactivar la cuenta de acceso." });
    }
    if (action === "remove-employee") {
      const { error: removeError } = await adminClient
        .from("employees")
        .delete()
        .eq("id", employeeId)
        .eq("business_id", callerProfile.business_id);
      if (removeError) {
        console.error("No se pudo eliminar el empleado:", removeError);
        return jsonResponse(500, { error: "Se desactivó el acceso, pero no se pudo eliminar el empleado." });
      }
    }
    return jsonResponse(200, { success: true, action });
  }

  return jsonResponse(400, { error: "La acción solicitada no es válida." });
});
