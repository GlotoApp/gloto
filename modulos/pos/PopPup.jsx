import { useEffect, useState } from "react";
import { Bell, Check, LoaderCircle, Volume2 } from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient";
import { useAuth } from "../../src/components/AuthContext";

const DEFAULT_SETTINGS = {
  show_widget: true,
  sound_enabled: true,
  color: "violet",
};

const COLOR_OPTIONS = [
  { id: "violet", label: "Violeta", classes: "bg-violet-500" },
  { id: "blue", label: "Azul", classes: "bg-sky-500" },
  { id: "emerald", label: "Verde", classes: "bg-emerald-500" },
  { id: "amber", label: "Ámbar", classes: "bg-amber-500" },
  { id: "rose", label: "Rosa", classes: "bg-rose-500" },
];

const COLOR_HEX_VALUES = {
  violet: "#8b5cf6",
  blue: "#0ea5e9",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
};

const PopPup = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsRowExists, setSettingsRowExists] = useState(false);
  const [businessId, setBusinessId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      if (!user?.id) {
        setBusinessId(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage("");
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!active) return;
      if (profileError || !profile?.business_id) {
        console.error("No se pudo identificar el negocio para Pop pup:", profileError);
        setErrorMessage("No se pudo cargar la configuración del negocio.");
        setLoading(false);
        return;
      }

      setBusinessId(profile.business_id);
      const { data, error } = await supabase
        .from("business_popup_settings")
        .select(
          "show_widget, sound_enabled, color",
        )
        .eq("business_id", profile.business_id)
        .maybeSingle();

      if (!active) return;
      if (error) {
        console.error("No se pudo cargar la configuración de Pop pup:", error);
        setErrorMessage("No se pudo cargar la configuración de Pop pup.");
      } else {
        setSettings({ ...DEFAULT_SETTINGS, ...data });
        setSettingsRowExists(Boolean(data));
      }
      setLoading(false);
    };

    loadSettings().catch((error) => {
      if (!active) return;
      console.error("Error cargando la configuración de Pop pup:", error);
      setErrorMessage("Ocurrió un error al cargar la configuración.");
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [user?.id]);

  const updateSettings = async (updates) => {
    if (!businessId || saving) return;
    const nextSettings = { ...settings, ...updates };
    setSettings(nextSettings);
    setSaving(true);
    setSaved(false);
    setErrorMessage("");

    try {
      const query = settingsRowExists
        ? supabase
            .from("business_popup_settings")
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq("business_id", businessId)
        : supabase.from("business_popup_settings").insert({
            business_id: businessId,
            ...nextSettings,
            updated_at: new Date().toISOString(),
          });
      const { error } = await query;
      if (error) throw error;
      setSettingsRowExists(true);

      window.dispatchEvent(
        new CustomEvent("gloto:popup-settings-changed", {
          detail: nextSettings,
        }),
      );
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("No se pudo guardar la configuración de Pop pup:", error);
      setSettings(settings);
      setErrorMessage("No se pudieron guardar los cambios. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const toggleOptions = [
    {
      key: "show_widget",
      title: "Mostrar botón flotante",
      description: "Permite moverlo por la pantalla y abrir las órdenes.",
      icon: Bell,
    },
    {
      key: "sound_enabled",
      title: "Sonido del aviso",
      description:
        "Reproducir un tono dentro de Gloto; el sonido nativo lo controla el navegador.",
      icon: Volume2,
    },
  ];

  return (
    <div className="min-h-screen bg-background px-4 py-6 font-sans text-white sm:px-8 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 pb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-400">
            Personalización
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">Pop pup</h1>
          <p className="mt-1 text-xs text-neutral-500">
            Configura el botón flotante, su color y el sonido de los avisos
            dentro de Gloto.
          </p>
        </header>

        <main className="space-y-4 rounded-3xl bg-neutral-900/10 p-3 backdrop-blur-md md:p-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-neutral-400">
              <LoaderCircle size={16} className="animate-spin" />
              Cargando preferencias...
            </div>
          ) : errorMessage && !businessId ? (
            <p role="alert" className="rounded-xl bg-rose-500/10 p-4 text-sm text-rose-200">
              {errorMessage}
            </p>
          ) : (
            <>
              <section className="rounded-2xl bg-neutral-900/60 p-4">
                <h2 className="text-sm font-bold text-white">
                  Apariencia y sonido
                </h2>
                <div className="mt-3 divide-y divide-white/5">
                  {toggleOptions.map(({ key, title, description, icon: Icon }) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-4 py-4 first:pt-2 last:pb-2"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <Icon size={17} className="mt-0.5 shrink-0 text-neutral-400" />
                        <div>
                          <p className="text-sm font-semibold text-neutral-100">
                            {title}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                            {description}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings[key]}
                        aria-label={title}
                        disabled={saving}
                        onClick={() => updateSettings({ [key]: !settings[key] })}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                          settings[key] ? "bg-violet-500" : "bg-white/15"
                        }`}
                      >
                        <span
                          className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                            settings[key] ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl bg-neutral-900/60 p-4">
                <h2 className="text-sm font-bold text-white">Color del botón</h2>
                <p className="mt-1 text-xs text-neutral-500">
                  El color se aplica al ícono flotante y al aviso cuando se expande.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {COLOR_OPTIONS.map((color) => (
                    <button
                      key={color.id}
                      type="button"
                      aria-label={color.label}
                      aria-pressed={settings.color === color.id}
                      title={color.label}
                      disabled={saving}
                      onClick={() => updateSettings({ color: color.id })}
                      className={`flex h-10 w-10 items-center justify-center rounded-full ${color.classes} transition hover:scale-105 disabled:opacity-50 ${
                        settings.color === color.id
                          ? "ring-2 ring-white ring-offset-2 ring-offset-neutral-900"
                          : "opacity-70 hover:opacity-100"
                      }`}
                    >
                      {settings.color === color.id && <Check size={17} />}
                    </button>
                  ))}
                  <label
                    className={`relative flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-neutral-800 ring-offset-2 ring-offset-neutral-900 transition hover:scale-105 ${
                      settings.color.startsWith("#")
                        ? "ring-2 ring-white"
                        : "ring-1 ring-white/20"
                    }`}
                    title="Elegir otro color"
                  >
                    <input
                      type="color"
                      aria-label="Elegir otro color"
                      value={
                        settings.color.startsWith("#")
                          ? settings.color
                          : COLOR_HEX_VALUES[settings.color] ||
                            COLOR_HEX_VALUES.violet
                      }
                      disabled={saving}
                      onChange={(event) =>
                        updateSettings({ color: event.target.value })
                      }
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                    <span
                      aria-hidden="true"
                      className="h-6 w-6 rounded-full border border-white/30"
                      style={{
                        background: settings.color.startsWith("#")
                          ? settings.color
                          : "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)",
                      }}
                    />
                  </label>
                </div>
              </section>

              {errorMessage && (
                <p role="alert" className="text-sm text-rose-300">
                  {errorMessage}
                </p>
              )}
              {saving && (
                <p className="flex items-center gap-2 text-xs text-neutral-400">
                  <LoaderCircle size={14} className="animate-spin" />
                  Guardando preferencias del negocio...
                </p>
              )}
              {saved && (
                <p role="status" className="text-xs text-emerald-300">
                  Cambios guardados para este negocio.
                </p>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default PopPup;
