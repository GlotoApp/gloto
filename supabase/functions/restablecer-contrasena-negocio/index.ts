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

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse(401, { error: "Debes iniciar sesión con una cuenta de administración." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Faltan secretos requeridos para restablecer contraseñas.");
    return jsonResponse(500, {
      error: "El servicio de restablecimiento no está configurado.",
    });
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
  const { data: callerProfile, error: profileLookupError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", callerData.user.id)
    .maybeSingle();
  if (profileLookupError) {
    console.error("No se pudo validar el rol del solicitante:", profileLookupError);
    return jsonResponse(500, {
      error: "No se pudo validar el permiso de administración.",
    });
  }
  if (callerProfile?.role !== "superadmin") {
    return jsonResponse(403, {
      error: "Solo una cuenta de administración puede restablecer contraseñas.",
    });
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return jsonResponse(400, { error: "La solicitud no contiene datos válidos." });
  }
  if (!isRecord(parsedBody)) {
    return jsonResponse(400, { error: "La solicitud no contiene datos válidos." });
  }

  const businessId =
    typeof parsedBody.businessId === "string"
      ? parsedBody.businessId.trim()
      : "";
  const action = parsedBody.action;
  const userId =
    typeof parsedBody.userId === "string" ? parsedBody.userId.trim() : "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      businessId,
    )
  ) {
    return jsonResponse(400, { error: "La tienda seleccionada no es válida." });
  }
  if (action !== "list" && action !== "reset") {
    return jsonResponse(400, { error: "La acción solicitada no es válida." });
  }

  const { data: business, error: businessError } = await adminClient
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .maybeSingle();
  if (businessError) {
    console.error("No se pudo verificar la tienda:", businessError);
    return jsonResponse(500, { error: "No se pudo verificar la tienda." });
  }
  if (!business) {
    return jsonResponse(404, { error: "La tienda ya no existe." });
  }

  if (action === "list") {
    const { data: profiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("id,email,username,role")
      .eq("business_id", businessId)
      .order("username", { ascending: true });
    if (profilesError) {
      console.error("No se pudieron consultar los accesos de la tienda:", profilesError);
      return jsonResponse(500, {
        error: "No se pudieron consultar los usuarios de la tienda.",
      });
    }

    const adminProfiles = (profiles || []).filter(
      (profile) =>
        String(profile.role || "").toLowerCase() === "admin" &&
        profile.id !== callerData.user.id,
    );
    return jsonResponse(200, { success: true, users: adminProfiles });
  }

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      userId,
    )
  ) {
    return jsonResponse(400, { error: "El usuario seleccionado no es válido." });
  }

  const { data: targetProfile, error: targetProfileError } = await adminClient
    .from("profiles")
    .select("id,email,username,role")
    .eq("id", userId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (targetProfileError) {
    console.error("No se pudo verificar el usuario seleccionado:", targetProfileError);
    return jsonResponse(500, { error: "No se pudo verificar el usuario." });
  }
  if (!targetProfile || targetProfile.role !== "admin") {
    return jsonResponse(404, {
      error: "El administrador seleccionado no pertenece a esta tienda.",
    });
  }

  const { data: authUserData, error: authUserError } =
    await adminClient.auth.admin.getUserById(userId);
  if (authUserError || !authUserData.user) {
    console.error("No se pudo consultar el usuario de Auth:", authUserError);
    return jsonResponse(500, {
      error: "No se pudo localizar el usuario de acceso.",
    });
  }

  const temporaryPassword = createTemporaryPassword();
  const { error: updateUserError } =
    await adminClient.auth.admin.updateUserById(userId, {
      password: temporaryPassword,
      user_metadata: {
        ...authUserData.user.user_metadata,
        must_change_password: true,
      },
    });
  if (updateUserError) {
    console.error("No se pudo restablecer la contraseña:", updateUserError);
    return jsonResponse(500, {
      error: "No se pudo restablecer la contraseña del usuario.",
    });
  }

  return jsonResponse(200, {
    success: true,
    email: targetProfile.email || targetProfile.username,
    temporaryPassword,
  });
});
