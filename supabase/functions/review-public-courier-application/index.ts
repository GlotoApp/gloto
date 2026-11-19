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

const createTemporaryPassword = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#";
  const values = new Uint32Array(16);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
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
    console.error("Faltan secretos para revisar solicitudes de domiciliarios.");
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
  if (
    profileError ||
    !["superadmin", "super_admin"].includes(
      String(callerProfile?.role || "").toLowerCase(),
    )
  ) {
    return response(403, { error: "Solo un superadministrador puede revisar solicitudes." });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return response(400, { error: "La solicitud no contiene datos válidos." });
  }
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  const status = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
  if (!requestId || !["approved", "rejected", "suspended"].includes(status)) {
    return response(400, { error: "La solicitud o el estado no son válidos." });
  }

  const { data: application, error: applicationError } = await adminClient
    .from("public_courier_application_requests")
    .select("id,user_id,full_name,email,phone,status")
    .eq("id", requestId)
    .maybeSingle();
  if (applicationError || !application) {
    return response(404, { error: "No se encontró la solicitud." });
  }

  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : null;
  if (status !== "approved") {
    const { error: updateError } = await adminClient
      .from("public_courier_application_requests")
      .update({
        status,
        review_notes: notes,
        reviewed_by: callerData.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", requestId);
    if (updateError) {
      console.error("No se pudo actualizar la solicitud:", updateError);
      return response(500, { error: "No se pudo actualizar la solicitud." });
    }
    return response(200, { success: true, status });
  }

  if (application.user_id) {
    if (status !== "approved") {
      const { error: linkedUpdateError } = await adminClient
        .from("public_courier_application_requests")
        .update({
          status,
          review_notes: notes,
          reviewed_by: callerData.user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestId);
      if (linkedUpdateError) {
        console.error("No se pudo actualizar la solicitud vinculada:", linkedUpdateError);
        return response(500, { error: "No se pudo actualizar la solicitud vinculada." });
      }
      return response(200, { success: true, status, existingAccount: true });
    }

    if (application.status !== "approved") {
      const { error: linkedApprovalError } = await adminClient
        .from("public_courier_application_requests")
        .update({
          status: "approved",
          review_notes: notes,
          reviewed_by: callerData.user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestId);
      if (linkedApprovalError) {
        console.error("No se pudo confirmar la solicitud vinculada:", linkedApprovalError);
        return response(500, { error: "No se pudo confirmar la solicitud vinculada." });
      }
    }

    return response(200, {
      success: true,
      status: "approved",
      existingAccount: true,
      email: application.email,
      phone: application.phone,
    });
  }

  const { data: existingProfile, error: existingProfileError } = await adminClient
    .from("profiles")
    .select("id,email,role")
    .ilike("email", application.email)
    .maybeSingle();
  if (existingProfileError) {
    console.error("No se pudo verificar el correo existente:", existingProfileError);
    return response(500, { error: "No se pudo verificar si el correo ya tiene una cuenta." });
  }
  if (existingProfile) {
    if (String(existingProfile.role || "").toLowerCase() !== "domiciliario") {
      return response(409, {
        error: "Este correo ya pertenece a otra cuenta. Solicita otro correo al postulante.",
      });
    }

    const { data: existingAuthUser, error: existingAuthUserError } =
      await adminClient.auth.admin.getUserById(existingProfile.id);
    if (existingAuthUserError || !existingAuthUser.user) {
      console.error("No se pudo cargar la cuenta existente:", existingAuthUserError);
      return response(500, { error: "No se pudo preparar la cuenta existente." });
    }
    const { error: metadataError } = await adminClient.auth.admin.updateUserById(
      existingProfile.id,
      {
        user_metadata: {
          ...(existingAuthUser.user.user_metadata || {}),
          must_change_password: true,
        },
      },
    );
    if (metadataError) {
      console.error("No se pudo activar el cambio de contraseña:", metadataError);
      return response(500, { error: "No se pudo activar el cambio de contraseña." });
    }

    const { error: existingUpdateError } = await adminClient
      .from("public_courier_application_requests")
      .update({
        user_id: existingProfile.id,
        status: "approved",
        review_notes: notes,
        reviewed_by: callerData.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", requestId);
    if (existingUpdateError) {
      console.error("No se pudo vincular la cuenta existente:", existingUpdateError);
      return response(500, { error: "No se pudo vincular la cuenta existente." });
    }
    return response(200, {
      success: true,
      status: "approved",
      existingAccount: true,
      email: application.email,
      phone: application.phone,
    });
  }

  const temporaryPassword = createTemporaryPassword();
  const { data: createdUser, error: createUserError } =
    await adminClient.auth.admin.createUser({
      email: application.email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: application.full_name,
        must_change_password: true,
      },
    });
  if (createUserError || !createdUser.user?.id) {
    console.error("No se pudo crear la cuenta del domiciliario:", createUserError);
    return response(409, {
      error: createUserError?.message || "No se pudo crear la cuenta.",
    });
  }

  const userId = createdUser.user.id;
  const { error: profileUpsertError } = await adminClient.from("profiles").upsert(
    {
      id: userId,
      username: application.email,
      email: application.email,
      full_name: application.full_name,
      role: "domiciliario",
      business_id: null,
      onboarding_completed: true,
    },
    { onConflict: "id" },
  );
  if (profileUpsertError) {
    await adminClient.auth.admin.deleteUser(userId);
    console.error("No se pudo crear el perfil del domiciliario:", profileUpsertError);
    return response(500, { error: "No se pudo completar el perfil del domiciliario." });
  }

  const { error: updateError } = await adminClient
    .from("public_courier_application_requests")
    .update({
      user_id: userId,
      status: "approved",
      review_notes: notes,
      reviewed_by: callerData.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (updateError) {
    await adminClient.from("profiles").delete().eq("id", userId);
    await adminClient.auth.admin.deleteUser(userId);
    console.error("No se pudo vincular la solicitud aprobada:", updateError);
    return response(500, { error: "No se pudo vincular la cuenta a la solicitud." });
  }

  return response(200, {
    success: true,
    status: "approved",
    email: application.email,
    phone: application.phone,
    temporaryPassword,
  });
});
