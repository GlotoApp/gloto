import React, { useState } from "react";
import {
  supabase,
  removeStorageObjectIfUnused,
} from "../../src/lib/supabaseClient";

const STORAGE_BUCKETS = ["business-assets", "payment-supports", "payment-qr"];
const PAGE_SIZE = 1000;

const getObjectPath = (bucket, value) => {
  if (!value || typeof value !== "string" || value.startsWith("data:")) {
    return null;
  }

  const bucketMarkers = [
    `/storage/v1/object/public/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
    `/storage/v1/object/authenticated/${bucket}/`,
  ];
  const marker = bucketMarkers.find((item) => value.includes(item));
  if (!marker) return value.startsWith("http") ? null : value;

  const encodedPath = value
    .slice(value.indexOf(marker) + marker.length)
    .split(/[?#]/)[0];
  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return encodedPath;
  }
};

const addReference = (references, bucket, value) => {
  const path = getObjectPath(bucket, value);
  if (path) references.add(`${bucket}/${path}`);
};

const loadReferences = async () => {
  const [
    { data: businesses, error: businessesError },
    { data: products, error: productsError },
    { data: promotions, error: promotionsError },
    { data: categories, error: categoriesError },
    { data: payments, error: paymentsError },
    { data: qrs, error: qrsError },
  ] = await Promise.all([
    supabase.from("businesses").select("logo_url,cover_url"),
    supabase.from("products").select("image_url"),
    supabase
      .from("promotions")
      .select("cover_path,icon_url,payment_support_path"),
    supabase.from("categories").select("icon_url"),
    supabase.from("payment_records").select("support_path"),
    supabase.from("payment_qr_codes").select("storage_path"),
  ]);

  const failedQuery = [
    businessesError,
    productsError,
    promotionsError,
    categoriesError,
    paymentsError,
    qrsError,
  ].find(Boolean);
  if (failedQuery) throw failedQuery;

  const references = new Set();
  (businesses || []).forEach((business) => {
    addReference(references, "business-assets", business.logo_url);
    addReference(references, "business-assets", business.cover_url);
  });
  (products || []).forEach((product) =>
    addReference(references, "business-assets", product.image_url),
  );
  (promotions || []).forEach((promotion) => {
    addReference(references, "business-assets", promotion.cover_path);
    addReference(references, "business-assets", promotion.icon_url);
    addReference(
      references,
      "payment-supports",
      promotion.payment_support_path,
    );
  });
  (categories || []).forEach((category) =>
    addReference(references, "business-assets", category.icon_url),
  );
  (payments || []).forEach((payment) =>
    addReference(references, "payment-supports", payment.support_path),
  );
  (qrs || []).forEach((qr) =>
    addReference(references, "payment-qr", qr.storage_path),
  );

  return references;
};

const listBucketFiles = async (bucket) => {
  const files = [];
  const visit = async (prefix = "") => {
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;

      for (const item of data || []) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id == null) await visit(path);
        else
          files.push({
            bucket,
            path,
            metadata: item.metadata || {},
            createdAt: item.created_at,
          });
      }

      if (!data || data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  };

  await visit();
  return files;
};

const formatBytes = (value) => {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function SuperAdminStorageCleanup() {
  const [orphans, setOrphans] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [scanning, setScanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");

  const scanStorage = async () => {
    setScanning(true);
    setMessage("");
    setSelected(new Set());
    try {
      const references = await loadReferences();
      const files = (
        await Promise.all(STORAGE_BUCKETS.map(listBucketFiles))
      ).flat();
      const unused = files.filter(
        (file) => !references.has(`${file.bucket}/${file.path}`),
      );
      setOrphans(unused);
      setMessage(
        unused.length
          ? `Escaneo completado: ${unused.length} archivo(s) sin referencia.`
          : "Escaneo completado: no hay archivos huérfanos.",
      );
    } catch (error) {
      console.error("No se pudo revisar Storage:", error);
      setMessage(
        `No se pudo completar el escaneo. No se eliminó ningún archivo. ${error.message || ""}`,
      );
    }
    setScanning(false);
  };

  const toggleSelected = (key) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const deleteSelected = async () => {
    const targets = orphans.filter((file) =>
      selected.has(`${file.bucket}/${file.path}`),
    );
    if (!targets.length) return;
    if (
      !window.confirm(
        `¿Eliminar ${targets.length} archivo(s) huérfano(s) de Storage?`,
      )
    ) {
      return;
    }

    setDeleting(true);
    const removed = [];
    const retained = [];
    const failed = [];

    for (const file of targets) {
      try {
        const result = await removeStorageObjectIfUnused(
          file.bucket,
          file.path,
        );
        if (result.removed) removed.push(file);
        else retained.push(file);
      } catch (error) {
        console.error(
          `No se pudo eliminar ${file.bucket}/${file.path}:`,
          error,
        );
        failed.push(file);
      }
    }

    setOrphans((current) => current.filter((file) => !removed.includes(file)));
    setSelected(new Set());
    setMessage(
      `${removed.length} eliminado(s). ${retained.length} conservado(s) porque ahora tienen referencias. ${failed.length} con error; siguen listados.`,
    );
    setDeleting(false);
  };

  return (
    <section className="mb-5 rounded-2xl border border-rose-500/20 bg-neutral-900 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-black text-white">Limpieza de Storage</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-400">
            Busca archivos sin referencias en negocios, productos, promociones,
            pagos y QR. Antes de borrar cada objeto, se comprueba otra vez que
            siga sin usarse.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={scanStorage}
            disabled={scanning || deleting}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/10 disabled:opacity-50"
          >
            {scanning ? "Escaneando..." : "Escanear Storage"}
          </button>
          <button
            type="button"
            onClick={deleteSelected}
            disabled={scanning || deleting || selected.size === 0}
            className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-rose-600 disabled:opacity-50"
          >
            {deleting
              ? "Eliminando..."
              : `Eliminar seleccionados (${selected.size})`}
          </button>
        </div>
      </div>

      {message && (
        <p className="mt-3 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-neutral-300">
          {message}
        </p>
      )}

      {orphans.length > 0 && (
        <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
          {orphans.map((file) => {
            const key = `${file.bucket}/${file.path}`;
            return (
              <label
                key={key}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/[0.06] p-3 hover:bg-white/[0.03]"
              >
                <input
                  type="checkbox"
                  checked={selected.has(key)}
                  onChange={() => toggleSelected(key)}
                  disabled={deleting}
                  className="mt-1 accent-rose-500"
                />
                <span className="min-w-0 flex-1">
                  <span className="block break-all text-xs font-bold text-white">
                    {file.bucket}/{file.path}
                  </span>
                  <span className="mt-1 block text-[10px] text-neutral-500">
                    {formatBytes(
                      file.metadata.size || file.metadata.contentLength,
                    )}
                    {file.createdAt
                      ? ` · ${new Date(file.createdAt).toLocaleString("es-CO")}`
                      : ""}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
