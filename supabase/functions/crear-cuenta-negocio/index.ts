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

const isValidSlug = (slug: string) =>
  slug.length >= 2 &&
  slug.length <= 80 &&
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

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
    console.error("Faltan secretos requeridos para crear cuentas.");
    return jsonResponse(500, { error: "El servicio de creación no está configurado." });
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
    return jsonResponse(500, { error: "No se pudo validar el permiso de administración." });
  }
  if (callerProfile?.role !== "superadmin") {
    return jsonResponse(403, { error: "Solo una cuenta de administración puede crear negocios." });
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
  const body = parsedBody;

  const businessName =
    typeof body.businessName === "string" ? body.businessName.trim() : "";
  const businessSlug =
    typeof body.businessSlug === "string" ? body.businessSlug.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!businessName || businessName.length > 120) {
    return jsonResponse(400, { error: "El nombre del negocio es obligatorio." });
  }
  if (!isValidSlug(businessSlug)) {
    return jsonResponse(400, { error: "El slug debe contener letras minúsculas, números y guiones." });
  }
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return jsonResponse(400, { error: "Ingresa un correo válido." });
  }
  const temporaryPassword = createTemporaryPassword();

  let businessId: string | null = null;
  let userId: string | null = null;

  try {
    const { data: initialPeriod, error: initialPeriodError } = await adminClient
      .from("billing_plan_periods")
      .select(
        "id,plan_code,plan_name,billing_type,plan_is_active,code,label,duration_days,price_amount,commission_rate,minimum_amount,is_active",
      )
      .eq("plan_code", "inicial")
      .eq("code", "monthly")
      .eq("plan_is_active", true)
      .eq("is_active", true)
      .maybeSingle();

    if (initialPeriodError) throw initialPeriodError;
    if (!initialPeriod) {
      throw new Error(
        "El plan Inicial no está disponible. Actívalo antes de crear negocios.",
      );
    }

    const { data: business, error: businessError } = await adminClient
      .from("businesses")
      .insert({
        name: businessName,
        slug: businessSlug,
        is_active: true,
      })
      .select("id")
      .single();

    if (businessError) throw businessError;
    businessId = business.id;

    const { data: createdUser, error: createUserError } =
      await adminClient.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { must_change_password: true },
      });

    if (createUserError) throw createUserError;
    if (!createdUser.user?.id) {
      throw new Error("Supabase no devolvió el usuario creado.");
    }
    userId = createdUser.user.id;

    const { error: upsertProfileError } = await adminClient
      .from("profiles")
      .upsert(
        {
          id: userId,
          username: email,
          email,
          role: "admin",
          business_id: businessId,
          onboarding_completed: false,
        },
        { onConflict: "id" },
      );

    if (upsertProfileError) throw upsertProfileError;

    const startsAt = new Date();
    const endsAt = new Date(
      startsAt.getTime() + initialPeriod.duration_days * 24 * 60 * 60 * 1000,
    );
    const subscriptionAmount =
      initialPeriod.billing_type === "commission"
        ? Number(initialPeriod.minimum_amount || 0)
        : Number(initialPeriod.price_amount || 0);
    const { error: subscriptionError } = await adminClient
      .from("subscriptions")
      .insert({
        business_id: businessId,
        plan_code: initialPeriod.plan_code,
        plan_name: initialPeriod.plan_name,
        period_id: initialPeriod.id,
        duration_days: initialPeriod.duration_days,
        billing_period: initialPeriod.label,
        amount: subscriptionAmount,
        status: "active",
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
      });

    if (subscriptionError) throw subscriptionError;

    return jsonResponse(200, {
      success: true,
      userId,
      email,
      businessId,
      businessSlug,
      planName: initialPeriod.plan_name,
      planEndsAt: endsAt.toISOString(),
      temporaryPassword,
    });
  } catch (error) {
    console.error("Error creando usuario/negocio:", error);
    let rollbackFailed = false;

    if (userId) {
      const { error: deleteProfileError } = await adminClient
        .from("profiles")
        .delete()
        .eq("id", userId);
      if (deleteProfileError) {
        rollbackFailed = true;
        console.error("No se pudo revertir el perfil:", deleteProfileError);
      }

      const { error: deleteUserError } =
        await adminClient.auth.admin.deleteUser(userId);
      if (deleteUserError) {
        rollbackFailed = true;
        console.error("No se pudo revertir el usuario de Auth:", deleteUserError);
      }
    }

    if (businessId) {
      const { error: deleteBusinessError } = await adminClient
        .from("businesses")
        .delete()
        .eq("id", businessId);
      if (deleteBusinessError) {
        rollbackFailed = true;
        console.error("No se pudo revertir el negocio:", deleteBusinessError);
      }
    }

    const message =
      error instanceof Error
        ? error.message
        : isRecord(error) && typeof error.message === "string"
          ? error.message
          : "Error desconocido al crear la cuenta.";
    return jsonResponse(rollbackFailed ? 500 : 400, {
      error: rollbackFailed
        ? `La creación falló y no se pudieron revertir todos los datos. Contacta soporte. Detalle: ${message}`
        : message,
    });
  }
});
