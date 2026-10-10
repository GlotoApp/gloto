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
    console.error("Faltan secretos para crear cuentas de domiciliarios.");
    return jsonResponse(500, { error: "El servicio no está configurado." });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerData, error: callerError } =
    await callerClient.auth.getUser();
  if (callerError || !callerData.user) {
    return jsonResponse(401, {
      error: "La sesión no es válida. Inicia sesión de nuevo.",
    });
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
  if (
    !callerProfile?.business_id ||
    String(callerProfile.role || "").toLowerCase() !== "admin"
  ) {
    return jsonResponse(403, {
      error: "Solo un administrador de negocio puede crear estos accesos.",
    });
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

  const requestedAction =
    typeof body.action === "string" ? body.action.trim().toLowerCase() : "create";
  const action = requestedAction === "delete" ? "unlink" : requestedAction;
  if (action === "account-emails") {
    const { data: linkedEmployees, error: linkedEmployeesError } =
      await adminClient
        .from("employees")
        .select("id,auth_user_id")
        .eq("business_id", callerProfile.business_id)
        .ilike("area", "%domiciliario%")
        .not("auth_user_id", "is", null);
    if (linkedEmployeesError) {
      console.error("No se pudieron consultar las cuentas de domiciliarios:", linkedEmployeesError);
      return jsonResponse(500, {
        error: "No se pudieron consultar los correos de acceso.",
      });
    }

    const userIds = (linkedEmployees || [])
      .map((employee) => employee.auth_user_id)
      .filter((userId): userId is string => typeof userId === "string");
    if (!userIds.length) {
      return jsonResponse(200, { success: true, emails: {} });
    }

    const { data: courierProfiles, error: courierProfilesError } =
      await adminClient
        .from("profiles")
        .select("id,email")
        .in("id", userIds);
    if (courierProfilesError) {
      console.error("No se pudieron consultar los correos de acceso:", courierProfilesError);
      return jsonResponse(500, {
        error: "No se pudieron consultar los correos de acceso.",
      });
    }

    const emailByUserId = new Map(
      (courierProfiles || []).map((profile) => [profile.id, profile.email || ""]),
    );
    const emails = Object.fromEntries(
      (linkedEmployees || []).map((employee) => [
        employee.id,
        employee.auth_user_id
          ? emailByUserId.get(employee.auth_user_id) || ""
          : "",
      ]),
    );
    return jsonResponse(200, { success: true, emails });
  }

  const employeeId =
    typeof body.employeeId === "string" ? body.employeeId.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      employeeId,
    )
  ) {
    return jsonResponse(400, { error: "El empleado seleccionado no es válido." });
  }
  const { data: employee, error: employeeError } = await adminClient
    .from("employees")
    .select("id,name,area,auth_user_id")
    .eq("id", employeeId)
    .eq("business_id", callerProfile.business_id)
    .maybeSingle();
  if (employeeError) {
    console.error("No se pudo verificar el empleado:", employeeError);
    return jsonResponse(500, { error: "No se pudo verificar el empleado." });
  }
  if (!employee) {
    return jsonResponse(404, {
      error: "El empleado no pertenece a este negocio.",
    });
  }

  if (action === "remove-employee") {
    const { error: removeEmployeeError } = await adminClient.rpc(
      "remove_employee_from_business",
      {
        p_business_id: callerProfile.business_id,
        p_employee_id: employeeId,
      },
    );
    if (removeEmployeeError) {
      console.error("No se pudo eliminar el empleado:", removeEmployeeError);
      return jsonResponse(500, {
        error: "No se pudo eliminar el empleado.",
        detail: removeEmployeeError.message,
      });
    }
    return jsonResponse(200, { success: true, action });
  }

  if (!String(employee.area || "").toLowerCase().includes("domiciliario")) {
    return jsonResponse(404, {
      error: "El empleado no es domiciliario.",
    });
  }

  if (action === "reset" || action === "unlink") {
    if (!employee.auth_user_id) {
      return jsonResponse(404, {
        error: "Este domiciliario no tiene un acceso activo.",
      });
    }

    const { data: courierProfile, error: courierProfileError } = await adminClient
      .from("profiles")
      .select("id,role,business_id,email")
      .eq("id", employee.auth_user_id)
      .maybeSingle();
    if (courierProfileError) {
      console.error("No se pudo verificar la cuenta del domiciliario:", courierProfileError);
      return jsonResponse(500, { error: "No se pudo verificar la cuenta." });
    }
    if (
      !courierProfile ||
      courierProfile.role !== "domiciliario" ||
      courierProfile.business_id !== null
    ) {
      return jsonResponse(409, {
        error: "La cuenta vinculada no corresponde a un domiciliario privado.",
      });
    }

    if (action === "reset") {
      if (password.length < 8 || password.length > 72) {
        return jsonResponse(400, {
          error: "La contraseña debe tener entre 8 y 72 caracteres.",
        });
      }

      const { error: resetError } = await adminClient.auth.admin.updateUserById(
        employee.auth_user_id,
        { password },
      );
      if (resetError) {
        console.error("No se pudo restablecer la contraseña:", resetError);
        return jsonResponse(500, {
          error: "No se pudo restablecer la contraseña del domiciliario.",
        });
      }

      return jsonResponse(200, {
        success: true,
        action,
        email: courierProfile.email || "",
      });
    }

    const { error: unlinkError } = await adminClient.rpc(
      "detach_domiciliario_from_business",
      {
        p_business_id: callerProfile.business_id,
        p_employee_id: employeeId,
      },
    );
    if (unlinkError) {
      console.error("No se pudo quitar el vínculo del domiciliario al negocio:", unlinkError);
      return jsonResponse(500, {
        error: "No se pudo quitar el acceso del domiciliario a este negocio.",
        detail: unlinkError.message,
      });
    }

    return jsonResponse(200, { success: true, action });
  }

  if (action !== "create") {
    return jsonResponse(400, { error: "La acción solicitada no es válida." });
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse(400, { error: "Ingresa un correo válido." });
  }
  if (password.length < 8 || password.length > 72) {
    return jsonResponse(400, {
      error: "La contraseña debe tener entre 8 y 72 caracteres.",
    });
  }
  if (employee.auth_user_id) {
    return jsonResponse(409, { error: "Este domiciliario ya tiene un acceso." });
  }

  const { data: createdUser, error: createUserError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: employee.name },
    });
  if (createUserError || !createdUser.user?.id) {
    console.error("No se pudo crear la cuenta de Auth:", createUserError);
    return jsonResponse(400, {
      error: createUserError?.message || "No se pudo crear la cuenta.",
    });
  }

  const userId = createdUser.user.id;
  const { error: profileUpsertError } = await adminClient
    .from("profiles")
    .upsert(
      {
        id: userId,
        username: email,
        email,
        role: "domiciliario",
        business_id: null,
        onboarding_completed: true,
      },
      { onConflict: "id" },
    );
  if (profileUpsertError) {
    console.error("No se pudo crear el perfil del domiciliario:", profileUpsertError);
    const { error: cleanupError } = await adminClient.auth.admin.deleteUser(userId);
    if (cleanupError) {
      console.error("No se pudo revertir la cuenta de Auth:", cleanupError);
    }
    return jsonResponse(500, { error: "No se pudo completar el perfil del domiciliario." });
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
    console.error("No se pudo vincular el acceso al empleado:", linkError);
    const { error: deleteProfileError } = await adminClient
      .from("profiles")
      .delete()
      .eq("id", userId);
    if (deleteProfileError) {
      console.error("No se pudo revertir el perfil del domiciliario:", deleteProfileError);
    }
    const { error: deleteUserError } =
      await adminClient.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      console.error("No se pudo revertir la cuenta de Auth:", deleteUserError);
    }
    return jsonResponse(409, {
      error: "El empleado ya tiene acceso o no se pudo vincular.",
    });
  }

  return jsonResponse(200, {
    success: true,
    userId,
    email,
  });
});
