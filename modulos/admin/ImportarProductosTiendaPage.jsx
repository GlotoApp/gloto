import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import ImportarProductosTienda from "./ImportarProductosTienda";

const ImportarProductosTiendaPage = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [businessName, setBusinessName] = useState(
    location.state?.businessName || "",
  );
  const [loading, setLoading] = useState(!location.state?.businessName);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id || businessName) return undefined;
    let cancelled = false;
    const loadBusiness = async () => {
      setLoading(true);
      setError("");
      const { data, error: businessError } = await supabase
        .from("businesses")
        .select("name")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (businessError || !data) {
        console.error("No se pudo cargar el nombre de la tienda:", businessError);
        setError("No se encontró la tienda o no se pudo cargar su información.");
      } else {
        setBusinessName(data.name);
      }
      setLoading(false);
    };
    loadBusiness();
    return () => {
      cancelled = true;
    };
  }, [businessName, id]);

  const goBackToStore = () => navigate(`/gestion/tiendas/${id}`);

  if (loading) {
    return (
      <main className="fixed inset-0 z-[1200] flex h-screen h-[100dvh] items-center justify-center bg-neutral-950 text-white">
        <div className="flex items-center gap-3 text-sm text-neutral-300">
          <LoaderCircle className="animate-spin text-emerald-300" size={20} />
          Cargando tienda…
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="fixed inset-0 z-[1200] flex h-screen h-[100dvh] items-center justify-center bg-neutral-950 px-5 text-white">
        <section className="max-w-md rounded-2xl border border-rose-400/20 bg-neutral-900 p-6 text-center">
          <AlertCircle className="mx-auto mb-3 text-rose-300" size={24} />
          <p role="alert" className="text-sm text-rose-200">{error}</p>
          <button
            type="button"
            onClick={goBackToStore}
            className="mt-5 rounded-xl border border-white/10 px-4 py-2 text-sm font-bold hover:bg-white/5"
          >
            Volver a la tienda
          </button>
        </section>
      </main>
    );
  }

  return (
    <ImportarProductosTienda
      businessId={id}
      businessName={businessName}
      onClose={goBackToStore}
    />
  );
};

export default ImportarProductosTiendaPage;
