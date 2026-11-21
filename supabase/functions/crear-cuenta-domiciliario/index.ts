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

const normalizeCedula = (value: unknown) =>
  typeof value === "string" ? value.replace(/\D/g, "") : "";

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
  if (action === "link-by-cedula") {
    const cedula = normalizeCedula(body.cedula);
    if (!/^[0-9]{5,15}$/.test(cedula)) {
      return jsonResponse(400, { error: "Ingresa una cédula válida." });
    }

    const employeeId =
      typeof body.employeeId === "string" ? body.employeeId.trim() : null;
    const { data: employee, error: linkError } = await adminClient.rpc(
      "link_public_courier_by_cedula",
      {
        p_business_id: callerProfile.business_id,
        p_cedula: cedula,
        p_employee_id: employeeId,
      },
    );
    if (linkError || !employee?.id) {
      console.error("No se pudo vincular el domiciliario por cédula:", linkError);
      return jsonResponse(409, {
        error: linkError?.message || "No se pudo vincular el domiciliario.",
      });
    }

    return jsonResponse(200, {
      success: true,
      linkedExisting: true,
      employee,
    });
  }

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
      return jsonResponse(200, {
        success: true,
        emails: {},
        cedulas: {},
        phones: {},
      });
    }

    const [
      { data: courierProfiles, error: courierProfilesError },
      { data: courierIdentities, error: identityError },
      { data: legacyApplications, error: legacyApplicationsError },
      { data: applicationRequests, error: applicationRequestsError },
    ] = await Promise.all([
      adminClient
        .from("profiles")
        .select("id,email")
        .in("id", userIds),
      adminClient
        .from("courier_identities")
        .select("courier_user_id,cedula")
        .in("courier_user_id", userIds),
      adminClient
        .from("public_courier_applications")
        .select("user_id,phone,created_at")
        .in("user_id", userIds)
        .eq("status", "approved")
        .order("created_at", { ascending: false }),
      adminClient
        .from("public_courier_application_requests")
        .select("user_id,phone,created_at")
        .in("user_id", userIds)
        .eq("status", "approved")
        .order("created_at", { ascending: false }),
    ]);
    if (courierProfilesError) {
      console.error("No se pudieron consultar los correos de acceso:", courierProfilesError);
      return jsonResponse(500, {
        error: "No se pudieron consultar los correos de acceso.",
      });
    }
    if (identityError) {
      console.error("No se pudieron consultar las cédulas de los domiciliarios:", identityError);
      return jsonResponse(500, {
        error: "No se pudieron consultar las cédulas de los domiciliarios.",
      });
    }
    if (legacyApplicationsError || applicationRequestsError) {
      console.error(
        "No se pudieron consultar los teléfonos de los domiciliarios:",
        legacyApplicationsError || applicationRequestsError,
      );
      return jsonResponse(500, {
        error: "No se pudieron consultar los teléfonos de los domiciliarios.",
      });
    }

    const emailByUserId = new Map(
      (courierProfiles || []).map((profile) => [profile.id, profile.email || ""]),
    );
    const cedulaByUserId = new Map(
      (courierIdentities || []).map((identity) => [
        identity.courier_user_id,
        identity.cedula,
      ]),
    );
    const phoneByUserId = new Map<string, string>();
    for (const application of [
      ...(legacyApplications || []),
      ...(applicationRequests || []),
    ]) {
      if (
        typeof application.user_id === "string" &&
        typeof application.phone === "string" &&
        application.phone.trim() &&
        !phoneByUserId.has(application.user_id)
      ) {
        phoneByUserId.set(application.user_id, application.phone);
      }
    }
    const emails = Object.fromEntries(
      (linkedEmployees || []).map((employee) => [
        employee.id,
        employee.auth_user_id
          ? emailByUserId.get(employee.auth_user_id) || ""
          : "",
      ]),
    );
    const cedulas = Object.fromEntries(
      (linkedEmployees || []).map((employee) => [
        employee.id,
        employee.auth_user_id
          ? cedulaByUserId.get(employee.auth_user_id) || ""
          : "",
      ]),
    );
    const phones = Object.fromEntries(
      (linkedEmployees || []).map((employee) => [
        employee.id,
        employee.auth_user_id
          ? phoneByUserId.get(employee.auth_user_id) || ""
          : "",
      ]),
    );
    return jsonResponse(200, { success: true, emails, cedulas, phones });
  }

  const employeeId =
    typeof body.employeeId === "string" ? body.employeeId.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const cedula = normalizeCedula(body.cedula);
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
    .select("id,name,area,auth_user_id,store_orders_enabled,store_order_priority_enabled")
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

  if (action === "set-store-orders-enabled") {
    if (!employee.auth_user_id) {
      return jsonResponse(409, {
        error: "Crea primero el acceso del domiciliario para cambiar la recepción de pedidos.",
      });
    }
    if (typeof body.enabled !== "boolean") {
      return jsonResponse(400, {
        error: "Indica si el domiciliario puede recibir pedidos de la tienda.",
      });
    }
    const { data: updatedEmployee, error: updateError } = await adminClient
      .from("employees")
      .update({ store_orders_enabled: body.enabled })
      .eq("id", employeeId)
      .eq("business_id", callerProfile.business_id)
      .select("store_orders_enabled")
      .maybeSingle();
    if (updateError) {
      console.error("No se pudo cambiar la recepción de pedidos del domiciliario:", updateError);
      return jsonResponse(500, {
        error: "No se pudo cambiar la recepción de pedidos del domiciliario.",
      });
    }
    if (!updatedEmployee) {
      return jsonResponse(409, {
        error: "El domiciliario cambió o ya no pertenece a esta tienda.",
      });
    }
    return jsonResponse(200, {
      success: true,
      action,
      enabled: updatedEmployee.store_orders_enabled,
    });
  }

  if (action === "set-store-order-priority") {
    if (!employee.auth_user_id) {
      return jsonResponse(409, {
        error: "Crea primero el acceso del domiciliario para cambiar su prioridad.",
      });
    }
    if (typeof body.enabled !== "boolean") {
      return jsonResponse(400, {
        error: "Indica si el domiciliario tendrá prioridad en los pedidos de la tienda.",
      });
    }
    const { data: courierProfile, error: courierProfileError } = await adminClient
      .from("profiles")
      .select("role,business_id")
      .eq("id", employee.auth_user_id)
      .maybeSingle();
    if (courierProfileError) {
      console.error("No se pudo validar la cuenta del domiciliario:", courierProfileError);
      return jsonResponse(500, { error: "No se pudo validar la cuenta del domiciliario." });
    }
    if (
      !courierProfile ||
      String(courierProfile.role || "").toLowerCase() !== "domiciliario" ||
      courierProfile.business_id !== null
    ) {
      return jsonResponse(409, {
        error: "La cuenta vinculada no corresponde a un domiciliario.",
      });
    }

    const { data: updatedEmployee, error: updateError } = await adminClient
      .from("employees")
      .update({ store_order_priority_enabled: body.enabled })
      .eq("id", employeeId)
      .eq("business_id", callerProfile.business_id)
      .select("store_order_priority_enabled")
      .maybeSingle();
    if (updateError) {
      console.error("No se pudo cambiar la prioridad de pedidos:", updateError);
      return jsonResponse(500, { error: "No se pudo cambiar la prioridad de pedidos." });
    }
    if (!updatedEmployee) {
      return jsonResponse(409, {
        error: "El domiciliario cambió o ya no pertenece a esta tienda.",
      });
    }
    return jsonResponse(200, {
      success: true,
      action,
      enabled: updatedEmployee.store_order_priority_enabled,
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
  if (!/^[0-9]{5,15}$/.test(cedula)) {
    return jsonResponse(400, { error: "Ingresa una cédula válida." });
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
  const { data: existingIdentity, error: identityLookupError } = await adminClient
    .from("courier_identities")
    .select("courier_user_id")
    .eq("cedula", cedula)
    .maybeSingle();
  if (identityLookupError) {
    console.error("No se pudo verificar la cédula del domiciliario:", identityLookupError);
    return jsonResponse(500, { error: "No se pudo verificar la cédula." });
  }
  if (existingIdentity) {
    const { data: linkedCourier, error: existingCourierLinkError } =
      await adminClient.rpc("link_public_courier_by_cedula", {
        p_business_id: callerProfile.business_id,
        p_cedula: cedula,
        p_employee_id: employeeId,
      });
    if (existingCourierLinkError || !linkedCourier?.auth_user_id) {
      console.error("No se pudo vincular la cuenta existente por cédula:", existingCourierLinkError);
      return jsonResponse(409, {
        error: existingCourierLinkError?.message ||
          "No se pudo vincular la cuenta pública con esta tienda.",
      });
    }
    return jsonResponse(200, {
      success: true,
      userId: linkedCourier.auth_user_id,
      name: linkedCourier.name,
      email: linkedCourier.email || email,
      linkedExisting: true,
      storeOrderPriorityEnabled: linkedCourier.store_order_priority_enabled,
    });
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
    if (
      createUserError?.code === "email_exists" ||
      /already (registered|exists)|email.*already/i.test(
        createUserError?.message || "",
      )
    ) {
      const { data: existingProfile, error: existingProfileError } =
        await adminClient
          .from("profiles")
          .select("id,role,business_id")
          .eq("email", email)
          .maybeSingle();
      if (existingProfileError) {
        console.error("No se pudo verificar la cuenta existente:", existingProfileError);
        return jsonResponse(500, {
          error: "No se pudo verificar el correo existente.",
        });
      }

      if (
        existingProfile &&
        String(existingProfile.role || "").toLowerCase() === "domiciliario" &&
        existingProfile.business_id === null
      ) {
        const { data: existingIdentity, error: existingIdentityError } =
          await adminClient
            .from("courier_identities")
            .select("cedula")
            .eq("courier_user_id", existingProfile.id)
            .maybeSingle();
        if (existingIdentityError) {
          console.error("No se pudo verificar la identidad del domiciliario:", existingIdentityError);
          return jsonResponse(500, {
            error: "No se pudo verificar la identidad de la cuenta existente.",
          });
        }
        if (existingIdentity?.cedula !== cedula) {
          return jsonResponse(409, {
            error: "El correo ya está registrado, pero la cédula no coincide. Verifica los datos o busca la cuenta por cédula.",
          });
        }

        const { data: otherLinks, error: otherLinksError } = await adminClient
          .from("employees")
          .select("id")
          .eq("auth_user_id", existingProfile.id)
          .neq("id", employeeId)
          .ilike("area", "%domiciliario%")
          .limit(1);
        if (otherLinksError) {
          console.error("No se pudo verificar el vínculo existente:", otherLinksError);
          return jsonResponse(500, {
            error: "No se pudo verificar el vínculo del domiciliario.",
          });
        }
        if (otherLinks?.length) {
          return jsonResponse(409, {
            error: "Esta cuenta ya está vinculada a otra tienda.",
          });
        }

        const { data: linkedEmployee, error: linkError } = await adminClient
          .from("employees")
          .update({
            auth_user_id: existingProfile.id,
            store_orders_enabled: true,
            store_order_priority_enabled: true,
          })
          .eq("id", employeeId)
          .eq("business_id", callerProfile.business_id)
          .is("auth_user_id", null)
          .select("id,store_order_priority_enabled")
          .maybeSingle();
        if (linkError || !linkedEmployee) {
          console.error("No se pudo vincular la cuenta existente:", linkError);
          return jsonResponse(409, {
            error: "El empleado ya tiene acceso o no se pudo vincular.",
          });
        }

        return jsonResponse(200, {
          success: true,
          userId: existingProfile.id,
          email,
          linkedExisting: true,
          storeOrderPriorityEnabled: linkedEmployee.store_order_priority_enabled,
        });
      }

      return jsonResponse(409, {
        code: "EMAIL_ALREADY_EXISTS",
        error: "Este correo ya está registrado en una cuenta que no se puede vincular como domiciliario.",
      });
    }
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
        full_name: employee.name,
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

  const { error: identityInsertError } = await adminClient
    .from("courier_identities")
    .insert({ courier_user_id: userId, cedula });
  if (identityInsertError) {
    console.error("No se pudo guardar la cédula del domiciliario:", identityInsertError);
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
      error: identityInsertError.code === "23505"
        ? "Esta cédula ya pertenece a un domiciliario registrado."
        : "No se pudo guardar la cédula del domiciliario.",
    });
  }

  const { data: linkedEmployee, error: linkError } = await adminClient
    .from("employees")
    .update({
      auth_user_id: userId,
    })
    .eq("id", employeeId)
    .eq("business_id", callerProfile.business_id)
    .is("auth_user_id", null)
    .select("id,store_order_priority_enabled")
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
    storeOrderPriorityEnabled: linkedEmployee.store_order_priority_enabled,
  });
});
