import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const response = (status: number, body: Record<string, unknown>) =>
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
    return response(405, { error: "Método no permitido." });
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return response(401, { error: "Debes iniciar sesión para eliminar tu cuenta." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Faltan secretos requeridos para eliminar la cuenta del domiciliario.");
    return response(500, { error: "El servicio de eliminación no está configurado." });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerData, error: callerError } =
    await callerClient.auth.getUser();
  if (callerError || !callerData.user) {
    return response(401, { error: "La sesión no es válida. Inicia sesión de nuevo." });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response(400, { error: "La solicitud no contiene datos válidos." });
  }
  if (!isRecord(body) || body.confirmation !== "ELIMINAR") {
    return response(400, { error: 'Escribe "ELIMINAR" para confirmar.' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userId = callerData.user.id;
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) {
    console.error("No se pudo validar el perfil que solicita la eliminación:", profileError);
    return response(500, { error: "No se pudo validar tu cuenta." });
  }
  if (String(profile?.role || "").toLowerCase() !== "domiciliario") {
    return response(403, { error: "Esta opción solo está disponible para cuentas de domiciliario." });
  }

  const { data: linkedEmployees, error: employeesError } = await adminClient
    .from("employees")
    .select("id")
    .eq("auth_user_id", userId)
    .ilike("area", "%domiciliario%");
  if (employeesError) {
    console.error("No se pudieron consultar los vínculos del domiciliario:", employeesError);
    return response(500, { error: "No se pudieron verificar tus vínculos con las tiendas." });
  }
  const employeeIds = (linkedEmployees || []).map((employee) => employee.id);
  if (employeeIds.length) {
    const { error: disconnectError } = await adminClient
      .from("employees")
      .update({
        delivery_available: false,
        store_orders_enabled: false,
        store_order_priority_enabled: false,
      })
      .in("id", employeeIds);
    if (disconnectError) {
      console.error("No se pudo desconectar al domiciliario de sus tiendas:", disconnectError);
      return response(500, { error: "No se pudieron pausar tus vínculos con las tiendas." });
    }
  }
  const { error: publicDisconnectError } = await adminClient
    .from("public_courier_applications")
    .update({
      is_online: false,
      location_latitude: null,
      location_longitude: null,
      location_updated_at: null,
    })
    .eq("user_id", userId);
  if (publicDisconnectError) {
    console.error("No se pudo desconectar al domiciliario de la red pública:", publicDisconnectError);
    return response(500, { error: "No se pudo pausar tu acceso a pedidos públicos." });
  }

  const { data: activeOrders, error: ordersError } = await adminClient
    .from("orders")
    .select("id")
    .or(`public_courier_id.eq.${userId},delivery_courier_id.eq.${userId}`)
    .in("delivery_status", ["assigned", "picked_up"])
    .limit(1);
  if (ordersError) {
    console.error("No se pudieron verificar las entregas del domiciliario:", ordersError);
    return response(500, { error: "No se pudo verificar si tienes entregas en curso." });
  }
  if (activeOrders?.length) {
    return response(409, {
      error: "Completa tu entrega en curso antes de eliminar la cuenta.",
    });
  }

  const { data: requests, error: requestsError } = await adminClient
    .from("public_courier_application_requests")
    .select(
      "id,license_front_path,license_back_path,vehicle_card_front_path,vehicle_card_back_path,identity_front_path,identity_back_path,profile_photo_path",
    )
    .eq("user_id", userId);
  if (requestsError) {
    console.error("No se pudieron consultar los documentos del domiciliario:", requestsError);
    return response(500, { error: "No se pudieron preparar tus documentos para eliminarlos." });
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
        ].filter((path): path is string => typeof path === "string" && path.length > 0),
      ),
    ),
  ];
  if (documentPaths.length) {
    const { error: documentsError } = await adminClient.storage
      .from("courier-application-documents")
      .remove(documentPaths);
    if (documentsError) {
      console.error("No se pudieron eliminar los documentos del domiciliario:", documentsError);
      return response(500, { error: "No se pudieron eliminar tus documentos. Intenta de nuevo." });
    }
  }

  const { error: requestsDeleteError } = await adminClient
    .from("public_courier_application_requests")
    .delete()
    .eq("user_id", userId);
  if (requestsDeleteError) {
    console.error("No se pudieron eliminar las solicitudes del domiciliario:", requestsDeleteError);
    return response(500, { error: "No se pudieron eliminar tus solicitudes." });
  }
  const { error: applicationDeleteError } = await adminClient
    .from("public_courier_applications")
    .delete()
    .eq("user_id", userId);
  if (applicationDeleteError) {
    console.error("No se pudo eliminar el perfil público del domiciliario:", applicationDeleteError);
    return response(500, { error: "No se pudo eliminar tu perfil de la red pública." });
  }

  if (employeeIds.length) {
    const { error: unlinkError } = await adminClient
      .from("employees")
      .update({ auth_user_id: null })
      .in("id", employeeIds);
    if (unlinkError) {
      console.error("No se pudieron cerrar los vínculos del domiciliario:", unlinkError);
      return response(500, { error: "No se pudieron cerrar tus vínculos con las tiendas." });
    }
  }

  const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    console.error("No se pudo eliminar la cuenta Auth del domiciliario:", deleteUserError);
    return response(500, { error: "No se pudo eliminar la cuenta. Intenta de nuevo." });
  }

  return response(200, { success: true });
});
