import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const response = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isSuperAdmin = (role: unknown) =>
  ["superadmin", "super_admin"].includes(String(role || "").toLowerCase());

const createTemporaryPassword = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return response(405, { error: "Método no permitido." });
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return response(401, { error: "Debes iniciar sesión como superadministrador." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response(500, { error: "El servicio no está configurado." });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) {
    return response(401, { error: "La sesión no es válida." });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", callerData.user.id)
    .maybeSingle();
  if (profileError || !isSuperAdmin(callerProfile?.role)) {
    return response(403, { error: "Solo un superadministrador puede administrar cuentas." });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return response(400, { error: "La solicitud no contiene datos válidos." });
  }

  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  if (action === "list") {
    const { data: profiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("id,email,full_name,role")
      .eq("role", "domiciliario");
    if (profilesError) {
      console.error("No se pudieron cargar los perfiles de domiciliarios:", profilesError);
      return response(500, {
        error: "No se pudieron cargar las cuentas.",
        details: profilesError.message,
      });
    }

    const { data: usersData, error: usersError } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersError) {
      console.error("No se pudieron cargar los estados de autenticación:", usersError);
    }

    const users = new Map((usersData?.users || []).map((user) => [user.id, user]));
    return response(200, {
      accounts: (profiles || []).map((profile) => {
        const user = users.get(profile.id);
        const bannedUntil = user?.banned_until || null;
        const isSuspended =
          bannedUntil !== null &&
          bannedUntil !== "none" &&
          new Date(bannedUntil).getTime() > Date.now();
        return {
          ...profile,
          email: user?.email || profile.email || "",
          phone: user?.phone || "",
          lastSignInAt: user?.last_sign_in_at || null,
          isSuspended,
          bannedUntil,
        };
      }),
    });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId || userId === callerData.user.id) {
    return response(400, { error: "La cuenta seleccionada no es válida." });
  }

  const { data: targetProfile, error: targetError } = await adminClient
    .from("profiles")
    .select("id,role")
    .eq("id", userId)
    .maybeSingle();
  if (targetError || !targetProfile || String(targetProfile.role).toLowerCase() !== "domiciliario") {
    return response(404, { error: "No se encontró la cuenta del domiciliario." });
  }

  if (action === "reset-password") {
    const { data: targetUserData, error: targetUserError } =
      await adminClient.auth.admin.getUserById(userId);
    if (targetUserError || !targetUserData.user) {
      console.error("No se pudo consultar la cuenta de Auth del domiciliario:", targetUserError);
      return response(404, { error: "No se encontró la cuenta del domiciliario." });
    }

    const temporaryPassword = createTemporaryPassword();
    const { error: passwordError } = await adminClient.auth.admin.updateUserById(
      userId,
      {
        password: temporaryPassword,
        user_metadata: {
          ...(targetUserData.user.user_metadata || {}),
          must_change_password: true,
        },
      },
    );
    if (passwordError) {
      console.error("No se pudo restablecer la contraseña del domiciliario:", passwordError);
      return response(500, { error: "No se pudo restablecer la contraseña." });
    }

    return response(200, {
      success: true,
      email: targetUserData.user.email || "",
      temporaryPassword,
    });
  }

  if (action === "update") {
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    if (fullName.length < 3 || fullName.length > 120) {
      return response(400, { error: "El nombre debe tener entre 3 y 120 caracteres." });
    }
    const { error: updateProfileError } = await adminClient
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", userId);
    if (updateProfileError) {
      console.error("No se pudo actualizar el perfil del domiciliario:", updateProfileError);
      return response(500, { error: "No se pudo actualizar el perfil." });
    }
    const { data: targetUser } = await adminClient.auth.admin.getUserById(userId);
    const { error: metadataError } = await adminClient.auth.admin.updateUserById(userId, {
      user_metadata: { ...(targetUser.user?.user_metadata || {}), full_name: fullName },
    });
    if (metadataError) {
      console.error("No se pudo actualizar el nombre de la cuenta:", metadataError);
      return response(500, { error: "El perfil se actualizó, pero no la cuenta." });
    }
    return response(200, { success: true });
  }

  if (action === "suspend" || action === "restore") {
    const banDuration = action === "suspend" ? "876000h" : "none";
    const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
      ban_duration: banDuration,
    });
    if (authError) {
      console.error("No se pudo cambiar el estado de la cuenta:", authError);
      return response(500, { error: "No se pudo cambiar el estado de la cuenta." });
    }
    await adminClient
      .from("public_courier_application_requests")
      .update({ status: action === "suspend" ? "suspended" : "approved" })
      .eq("user_id", userId)
      .eq("status", action === "suspend" ? "approved" : "suspended");
    return response(200, { success: true, isSuspended: action === "suspend" });
  }

  if (action === "delete") {
    const { data: activeOrders, error: ordersError } = await adminClient
      .from("orders")
      .select("id")
      .or(`public_courier_id.eq.${userId},delivery_courier_id.eq.${userId}`)
      .in("delivery_status", ["assigned", "picked_up"])
      .limit(1);
    if (ordersError) {
      console.error("No se pudieron verificar las entregas del domiciliario:", ordersError);
      return response(500, { error: "No se pudo verificar si tiene entregas en curso." });
    }
    if (activeOrders?.length) {
      return response(409, {
        error: "No se puede eliminar la cuenta hasta completar la entrega en curso.",
      });
    }

    const { data: linkedEmployees, error: employeesError } = await adminClient
      .from("employees")
      .select("id")
      .eq("auth_user_id", userId)
      .ilike("area", "%domiciliario%");
    if (employeesError) {
      console.error("No se pudieron consultar los vínculos del domiciliario:", employeesError);
      return response(500, { error: "No se pudieron preparar los vínculos con las tiendas." });
    }
    const employeeIds = (linkedEmployees || []).map((employee) => employee.id);

    const { data: courierIdentity, error: identityError } = await adminClient
      .from("courier_identities")
      .select("cedula")
      .eq("courier_user_id", userId)
      .maybeSingle();
    if (identityError) {
      console.error("No se pudo consultar la identidad del domiciliario:", identityError);
      return response(500, { error: "No se pudo preparar la identidad para eliminar la cuenta." });
    }

    const applicationFields =
      "id,status,cedula,license_front_path,license_back_path,vehicle_card_front_path,vehicle_card_back_path,identity_front_path,identity_back_path,profile_photo_path";
    const { data: linkedRequests, error: requestsError } = await adminClient
      .from("public_courier_application_requests")
      .select(applicationFields)
      .eq("user_id", userId);
    if (requestsError) {
      console.error(
        "No se pudieron consultar las solicitudes del domiciliario:",
        requestsError,
      );
      return response(500, {
        error: "No se pudieron preparar las solicitudes para eliminar la cuenta.",
      });
    }

    const cedulas = [
      ...new Set([
        courierIdentity?.cedula,
        ...(linkedRequests || []).map((application) => application.cedula),
      ].filter((cedula) => typeof cedula === "string" && cedula.length > 0)),
    ];
    let requests = linkedRequests || [];
    if (cedulas.length) {
      const { data: requestsByCedula, error: cedulaRequestsError } = await adminClient
        .from("public_courier_application_requests")
        .select(applicationFields)
        .in("cedula", cedulas);
      if (cedulaRequestsError) {
        console.error(
          "No se pudieron consultar las solicitudes anteriores del domiciliario:",
          cedulaRequestsError,
        );
        return response(500, {
          error: "No se pudieron preparar los documentos de solicitudes anteriores.",
        });
      }
      requests = [
        ...new Map(
          [...requests, ...(requestsByCedula || [])].map((application) => [
            application.id,
            application,
          ]),
        ).values(),
      ];
    }

    const documentPaths = [
      ...new Set(
        (requests || []).flatMap((application) =>
          [
            application.license_front_path,
            application.license_back_path,
            application.vehicle_card_front_path,
            application.vehicle_card_back_path,
            application.identity_front_path,
            application.identity_back_path,
            application.profile_photo_path,
          ].filter((path) => typeof path === "string" && path.length > 0),
        ),
      ),
    ];
    if (documentPaths.length) {
      const { error: documentsError } = await adminClient.storage
        .from("courier-application-documents")
        .remove(documentPaths);
      if (documentsError) {
        console.error("No se pudieron eliminar los documentos del domiciliario:", documentsError);
        return response(500, {
          error: "No se pudieron eliminar los documentos personales de la cuenta.",
        });
      }
    }

    if (employeeIds.length) {
      const { error: unlinkError } = await adminClient
        .from("employees")
        .update({
          delivery_available: false,
          store_orders_enabled: false,
          store_order_priority_enabled: false,
          auth_user_id: null,
        })
        .in("id", employeeIds);
      if (unlinkError) {
        console.error("No se pudieron cerrar los vínculos del domiciliario:", unlinkError);
        return response(500, { error: "No se pudieron cerrar los vínculos con las tiendas." });
      }
    }

    const { error: applicationDeleteError } = await adminClient
      .from("public_courier_applications")
      .delete()
      .eq("user_id", userId);
    if (applicationDeleteError) {
      console.error("No se pudo eliminar el perfil público del domiciliario:", applicationDeleteError);
      return response(500, { error: "No se pudo eliminar el perfil público del domiciliario." });
    }

    const activeRequestIds = (requests || [])
      .filter((application) => ["pending", "approved"].includes(application.status))
      .map((application) => application.id);
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("No se pudo eliminar la cuenta del domiciliario:", deleteError);
      return response(500, { error: "No se pudo eliminar la cuenta." });
    }

    if (activeRequestIds.length) {
      const { error: requestUpdateError } = await adminClient
        .from("public_courier_application_requests")
        .update({
          status: "rejected",
          review_notes:
            "Cuenta eliminada por administración; puede volver a postularse.",
          reviewed_by: callerData.user.id,
          reviewed_at: new Date().toISOString(),
        })
        .in("id", activeRequestIds);
      if (requestUpdateError) {
        console.error(
          "Se eliminó la cuenta, pero no se pudo liberar la solicitud para una nueva postulación:",
          requestUpdateError,
        );
        return response(500, {
          error:
            "La cuenta se eliminó, pero no se pudo liberar la solicitud para una nueva postulación. Contacta a soporte.",
        });
      }
    }

    return response(200, { success: true });
  }

  return response(400, { error: "La acción solicitada no es válida." });
});
