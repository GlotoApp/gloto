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

const removeBusinessFiles = async (
  adminClient: ReturnType<typeof createClient>,
  bucket: string,
  businessId: string,
) => {
  const paths: string[] = [];
  const visit = async (prefix: string) => {
    let offset = 0;
    while (true) {
      const { data, error } = await adminClient.storage.from(bucket).list(
        prefix,
        { limit: 1000, offset, sortBy: { column: "name", order: "asc" } },
      );
      if (error) throw error;

      for (const item of data || []) {
        const path = `${prefix}/${item.name}`;
        if (item.id == null) await visit(path);
        else paths.push(path);
      }

      if (!data || data.length < 1000) break;
      offset += 1000;
    }
  };

  await visit(businessId);
  for (let index = 0; index < paths.length; index += 1000) {
    const { error } = await adminClient.storage
      .from(bucket)
      .remove(paths.slice(index, index + 1000));
    if (error) throw error;
  }
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
    return jsonResponse(401, { error: "Debes iniciar sesión como superadmin." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Faltan secretos requeridos para eliminar cuentas.");
    return jsonResponse(500, { error: "El servicio de eliminación no está configurado." });
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
  const { data: callerProfile, error: profileLookupError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", callerData.user.id)
    .maybeSingle();
  if (profileLookupError) {
    console.error("No se pudo validar el rol del solicitante:", profileLookupError);
    return jsonResponse(500, { error: "No se pudo validar el permiso de superadmin." });
  }
  if (callerProfile?.role !== "superadmin") {
    return jsonResponse(403, { error: "Solo un superadmin puede eliminar cuentas." });
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
  const businessId =
    typeof body.businessId === "string" ? body.businessId.trim() : "";
  const confirmationSlug =
    typeof body.confirmationSlug === "string" ? body.confirmationSlug.trim() : "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      businessId,
    )
  ) {
    return jsonResponse(400, { error: "La tienda seleccionada no es válida." });
  }

  const { data: business, error: businessLookupError } = await adminClient
    .from("businesses")
    .select("id,name,slug")
    .eq("id", businessId)
    .maybeSingle();
  if (businessLookupError) {
    console.error("No se pudo consultar la tienda que se eliminará:", businessLookupError);
    return jsonResponse(500, { error: "No se pudo verificar la tienda." });
  }
  if (!business) {
    return jsonResponse(404, { error: "La tienda ya no existe." });
  }
  if (confirmationSlug !== business.slug) {
    return jsonResponse(400, { error: "El slug de confirmación no coincide." });
  }

  const { data: profiles, error: profilesError } = await adminClient
    .from("profiles")
    .select("id,role")
    .eq("business_id", businessId);
  if (profilesError) {
    console.error("No se pudieron consultar los usuarios de la tienda:", profilesError);
    return jsonResponse(500, { error: "No se pudieron verificar los usuarios de la tienda." });
  }
  if (
    profiles?.some((profile) =>
      ["superadmin", "super_admin"].includes(
        String(profile.role || "").toLowerCase(),
      ),
    )
  ) {
    return jsonResponse(409, {
      error: "No se puede eliminar una tienda asociada a un usuario superadmin.",
    });
  }

  const userIds = (profiles || [])
    .map((profile) => profile.id)
    .filter((userId): userId is string => userId !== callerData.user.id);
  const { error: deleteBusinessError } = await adminClient
    .from("businesses")
    .delete()
    .eq("id", businessId);
  if (deleteBusinessError) {
    console.error("No se pudo eliminar la tienda y sus datos:", deleteBusinessError);
    return jsonResponse(409, {
      error:
        `No se pudo eliminar la tienda: ${deleteBusinessError.message}. No se eliminó ningún usuario.`,
    });
  }

  const cleanupWarnings: string[] = [];
  for (const bucket of ["business-assets", "payment-supports"]) {
    try {
      await removeBusinessFiles(adminClient, bucket, businessId);
    } catch (error) {
      console.error(`No se pudieron eliminar los archivos de ${bucket}:`, error);
      cleanupWarnings.push(`archivos de ${bucket}`);
    }
  }

  for (const userId of userIds) {
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) {
      console.error(`No se pudo eliminar el usuario de Auth ${userId}:`, error);
      cleanupWarnings.push("uno o más usuarios de acceso");
    }
  }

  return jsonResponse(200, {
    success: true,
    businessName: business.name,
    warning: cleanupWarnings.length
      ? `La tienda fue eliminada, pero no se pudieron limpiar: ${cleanupWarnings.join(", ")}.`
      : null,
  });
});
