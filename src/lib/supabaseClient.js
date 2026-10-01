import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Faltan las variables de entorno de Supabase");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function resolveCategoryIconUrl(iconPath) {
  if (!iconPath) return null;
  if (/^https?:\/\//i.test(iconPath)) return iconPath;

  const bucket = iconPath.startsWith("sistema/categories generales iconos/")
    ? "system"
    : "business-assets";
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(iconPath, 86400);

  if (error) throw error;
  return data.signedUrl;
}

const getStorageObjectPath = (bucket, pathOrUrl) => {
  if (!pathOrUrl) return null;
  const publicObjectPrefix = `/storage/v1/object/public/${bucket}/`;
  const publicObjectIndex = pathOrUrl.indexOf(publicObjectPrefix);
  if (publicObjectIndex < 0) {
    return pathOrUrl.startsWith("http") || pathOrUrl.startsWith("data:")
      ? null
      : pathOrUrl;
  }

  const encodedPath = pathOrUrl
    .slice(publicObjectIndex + publicObjectPrefix.length)
    .split(/[?#]/)[0];
  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return encodedPath;
  }
};

export async function removeStorageObjectIfUnused(bucket, pathOrUrl) {
  const path = getStorageObjectPath(bucket, pathOrUrl);
  if (!path) return { removed: false, reason: "invalid-path" };

  const publicUrl = supabase.storage.from(bucket).getPublicUrl(path)
    .data?.publicUrl;
  const referenceQueries = [];

  if (bucket === "business-assets") {
    referenceQueries.push(
      supabase
        .from("products")
        .select("id")
        .eq("image_url", publicUrl)
        .limit(1),
      supabase.from("products").select("id").eq("image_url", path).limit(1),
      supabase
        .from("businesses")
        .select("id")
        .eq("logo_url", publicUrl)
        .limit(1),
      supabase.from("businesses").select("id").eq("logo_url", path).limit(1),
      supabase
        .from("businesses")
        .select("id")
        .eq("cover_url", publicUrl)
        .limit(1),
      supabase.from("businesses").select("id").eq("cover_url", path).limit(1),
      supabase.from("promotions").select("id").eq("cover_path", path).limit(1),
      supabase
        .from("promotions")
        .select("id")
        .eq("icon_url", publicUrl)
        .limit(1),
      supabase.from("promotions").select("id").eq("icon_url", path).limit(1),
      supabase
        .from("categories")
        .select("id")
        .eq("icon_url", publicUrl)
        .limit(1),
      supabase.from("categories").select("id").eq("icon_url", path).limit(1),
    );
  } else if (bucket === "system") {
    referenceQueries.push(
      supabase.from("categories").select("id").eq("icon_url", path).limit(1),
    );
  } else if (bucket === "payment-supports") {
    referenceQueries.push(
      supabase
        .from("payment_records")
        .select("id")
        .eq("support_path", path)
        .limit(1),
      supabase
        .from("promotions")
        .select("id")
        .eq("payment_support_path", path)
        .limit(1),
    );
  } else if (bucket === "payment-qr") {
    referenceQueries.push(
      supabase
        .from("payment_qr_codes")
        .select("id")
        .eq("storage_path", path)
        .limit(1),
    );
  } else {
    return { removed: false, reason: "unsupported-bucket" };
  }

  const references = await Promise.all(referenceQueries);
  const queryError = references.find((result) => result.error)?.error;
  if (queryError) throw queryError;

  if (references.some((result) => result.data?.length > 0)) {
    return { removed: false, reason: "still-referenced" };
  }

  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
  return { removed: true };
}

// Intenta resolver una ruta de imagen desde Supabase Storage a una URL pública.
// Si `path` ya es una URL absoluta la devuelve tal cual. Si no, intenta
// generar una public URL usando varios nombres de bucket comunes.
export async function resolveImageUrl(path) {
  if (!path) return "/default.png";
  // Ya es una URL pública
  if (path.startsWith("http") || path.includes("/storage/v1/object/public/")) {
    return path;
  }

  const bucketsToTry = ["public", "images", "logos", "avatars"];

  for (const bucket of bucketsToTry) {
    try {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      const publicUrl = data?.publicUrl || data?.publicURL || data?.public_url;
      if (publicUrl) return publicUrl;
    } catch (e) {
      // ignorar y seguir probando otros buckets
    }
  }

  // Si no pudo resolverse, devolver imagen por defecto pública
  return "/default.png";
}
