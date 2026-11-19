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
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("No se pudo eliminar la cuenta del domiciliario:", deleteError);
      return response(500, { error: "No se pudo eliminar la cuenta." });
    }
    return response(200, { success: true });
  }

  return response(400, { error: "La acción solicitada no es válida." });
});
