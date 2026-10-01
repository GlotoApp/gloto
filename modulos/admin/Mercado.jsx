import { useEffect, useState } from "react";
import {
  ImagePlus,
  Megaphone,
  Plus,
  Save,
  Tag,
  Trash2,
  Upload,
} from "lucide-react";
import {
  removeStorageObjectIfUnused,
  resolveCategoryIconUrl,
  supabase,
} from "../../src/lib/supabaseClient";
import ImageCropEditor from "../pos/ImageCropEditor";
import SuperAdminSectionShell from "./ContenedorSeccion";

const crearPngCuadrado = (imageEditor) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("No se pudo preparar el recorte."));
        return;
      }

      const size =
        Math.min(image.naturalWidth, image.naturalHeight) / imageEditor.zoom;
      const sourceX = (image.naturalWidth - size) * (imageEditor.offsetX / 100);
      const sourceY =
        (image.naturalHeight - size) * (imageEditor.offsetY / 100);
      canvas.width = 512;
      canvas.height = 512;
      context.drawImage(image, sourceX, sourceY, size, size, 0, 0, 512, 512);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("No se pudo crear el PNG recortado."));
          return;
        }
        const filename =
          imageEditor.file.name.replace(/\.png$/i, "") || "icono";
        resolve(
          new File([blob], `${filename}-cuadrado.png`, { type: "image/png" }),
        );
      }, "image/png");
    };
    image.onerror = () => reject(new Error("No se pudo abrir la imagen PNG."));
    image.src = imageEditor.url;
  });

const SuperAdminMarketplacePanel = () => {
  const [frases, setFrases] = useState([]);
  const [fraseNueva, setFraseNueva] = useState("");
  const [cargandoFrases, setCargandoFrases] = useState(true);
  const [errorFrases, setErrorFrases] = useState(false);
  const [guardandoCambios, setGuardandoCambios] = useState(false);
  const [mensajeFrases, setMensajeFrases] = useState({ tipo: "", texto: "" });
  const [categorias, setCategorias] = useState([]);
  const [cargandoCategorias, setCargandoCategorias] = useState(true);
  const [errorCategorias, setErrorCategorias] = useState(false);
  const [guardandoCategoria, setGuardandoCategoria] = useState(null);
  const [imageEditor, setImageEditor] = useState(null);
  const [recortandoCategoria, setRecortandoCategoria] = useState(false);
  const [mensajeCategorias, setMensajeCategorias] = useState({
    tipo: "",
    texto: "",
  });

  useEffect(() => {
    let isMounted = true;
    const cargarFrases = async () => {
      const { data, error } = await supabase
        .from("frases")
        .select("id,texto,order_index,is_active,created_at")
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true });
      if (!isMounted) return;
      if (error) {
        console.error(
          "No se pudieron cargar las frases del Marketplace:",
          error,
        );
        setErrorFrases(true);
      } else {
        setFrases(data || []);
      }
      setCargandoFrases(false);
    };
    cargarFrases();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const cargarCategorias = async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name,icon_url,order_index")
        .order("order_index", { ascending: true })
        .order("name", { ascending: true });
      if (!isMounted) return;
      if (error) {
        console.error(
          "No se pudieron cargar las categorías del Marketplace:",
          error,
        );
        setErrorCategorias(true);
      } else {
        const categoriasUnicas = Array.from(
          new Map(
            (data || [])
              .filter((categoria) => categoria.name?.trim())
              .map((categoria) => [
                categoria.name.trim().toLocaleLowerCase(),
                { ...categoria, name: categoria.name.trim() },
              ]),
          ).values(),
        );
        const categoriasConPreview = await Promise.all(
          categoriasUnicas.map(async (categoria) => {
            try {
              return {
                ...categoria,
                _iconDisplayUrl: await resolveCategoryIconUrl(
                  categoria.icon_url,
                ),
              };
            } catch (iconError) {
              console.warn(
                "No se pudo mostrar el icono de categoría:",
                iconError,
              );
              return { ...categoria, _iconDisplayUrl: null };
            }
          }),
        );
        setCategorias(categoriasConPreview);
      }
      setCargandoCategorias(false);
    };
    cargarCategorias();
    return () => {
      isMounted = false;
    };
  }, []);

  const cambiarFrase = (id, cambios) => {
    setFrases((actuales) =>
      actuales.map((frase) =>
        frase.id === id ? { ...frase, ...cambios, _dirty: true } : frase,
      ),
    );
    setMensajeFrases({ tipo: "pendiente", texto: "Hay cambios sin guardar." });
  };

  const agregarFrase = (event) => {
    event.preventDefault();
    const texto = fraseNueva.trim();
    if (!texto) {
      setMensajeFrases({ tipo: "error", texto: "Escribe una frase primero." });
      return;
    }

    const orderIndex =
      frases.reduce(
        (mayor, frase) => Math.max(mayor, Number(frase.order_index) || 0),
        -1,
      ) + 1;
    const id = `nueva-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setFrases((actuales) =>
      [
        ...actuales,
        {
          id,
          texto,
          order_index: orderIndex,
          is_active: true,
          created_at: new Date().toISOString(),
          _new: true,
          _dirty: true,
        },
      ].sort((a, b) => Number(a.order_index) - Number(b.order_index)),
    );
    setFraseNueva("");
    setMensajeFrases({
      tipo: "pendiente",
      texto: "Frase añadida a la lista. Guarda para aplicarla.",
    });
  };

  const guardarCambiosFrases = async () => {
    const pendientes = frases.filter(
      (frase) => frase._new || frase._dirty || frase._deleted,
    );

    for (const frase of pendientes) {
      if (frase._deleted || frase.texto.trim()) continue;
      setMensajeFrases({ tipo: "error", texto: "Cada frase necesita texto." });
      return;
    }

    for (const frase of pendientes) {
      if (
        frase._deleted ||
        !Number.isInteger(Number(frase.order_index)) ||
        Number(frase.order_index) < 0
      ) {
        if (frase._deleted) continue;
        setMensajeFrases({
          tipo: "error",
          texto:
            "El orden de cada frase debe ser un entero igual o mayor que cero.",
        });
        return;
      }
    }

    setGuardandoCambios(true);
    setMensajeFrases({ tipo: "", texto: "" });
    for (const frase of pendientes) {
      let error = null;
      let fraseGuardada = null;

      if (frase._deleted && !frase._new) {
        ({ error } = await supabase.from("frases").delete().eq("id", frase.id));
      } else if (!frase._deleted && frase._new) {
        const result = await supabase
          .from("frases")
          .insert({
            texto: frase.texto.trim(),
            order_index: Number(frase.order_index),
            is_active: frase.is_active,
          })
          .select("id,texto,order_index,is_active,created_at")
          .single();
        error = result.error;
        fraseGuardada = result.data;
      } else if (!frase._deleted) {
        ({ error } = await supabase
          .from("frases")
          .update({
            texto: frase.texto.trim(),
            order_index: Number(frase.order_index),
            is_active: frase.is_active,
          })
          .eq("id", frase.id));
      }

      if (error) {
        console.error(
          "No se pudieron guardar todos los cambios de frases:",
          error,
        );
        setMensajeFrases({
          tipo: "error",
          texto:
            "No se pudo completar el guardado. Revisa los cambios pendientes e inténtalo otra vez.",
        });
        setGuardandoCambios(false);
        return;
      }

      setFrases((actuales) => {
        const actualizadas = frase._deleted
          ? actuales.filter((item) => item.id !== frase.id)
          : actuales.map((item) =>
              item.id === frase.id
                ? {
                    ...(fraseGuardada || frase),
                    _new: false,
                    _dirty: false,
                    _deleted: false,
                  }
                : item,
            );
        return actualizadas.sort(
          (a, b) => Number(a.order_index) - Number(b.order_index),
        );
      });
    }

    setMensajeFrases({ tipo: "exito", texto: "Cambios de frases guardados." });
    setGuardandoCambios(false);
  };

  const eliminarFrase = (frase) => {
    if (frase._new) {
      setFrases((actuales) => actuales.filter((item) => item.id !== frase.id));
    } else {
      cambiarFrase(frase.id, { _deleted: true });
    }
    setMensajeFrases({
      tipo: "pendiente",
      texto: "Eliminación pendiente. Guarda para confirmarla.",
    });
  };

  const cambiosPendientes = frases.filter(
    (frase) => frase._new || frase._dirty || frase._deleted,
  ).length;

  const cambiarNombreCategoria = (id, name) => {
    setCategorias((actuales) =>
      actuales.map((categoria) =>
        categoria.id === id ? { ...categoria, name, _dirty: true } : categoria,
      ),
    );
  };

  const agregarCategoria = () => {
    const id = `nueva-${crypto.randomUUID()}`;
    const orderIndex =
      categorias.reduce(
        (mayor, categoria) =>
          Math.max(mayor, Number(categoria.order_index) || 0),
        -1,
      ) + 1;
    setCategorias((actuales) => [
      ...actuales,
      {
        id,
        name: "",
        icon_url: null,
        order_index: orderIndex,
        _iconDisplayUrl: null,
        _new: true,
        _dirty: true,
      },
    ]);
    setMensajeCategorias({
      tipo: "pendiente",
      texto: "Escribe el nombre y sube un icono para crear la categoría.",
    });
  };

  const cambiarOrdenCategoria = (id, orderIndex) => {
    setCategorias((actuales) =>
      actuales.map((categoria) =>
        categoria.id === id
          ? { ...categoria, order_index: orderIndex, _dirty: true }
          : categoria,
      ),
    );
    setMensajeCategorias({
      tipo: "pendiente",
      texto: "Hay cambios sin guardar.",
    });
  };

  const eliminarCategoria = (categoria) => {
    if (categoria._new) {
      setCategorias((actuales) =>
        actuales.filter((item) => item.id !== categoria.id),
      );
      setMensajeCategorias({
        tipo: "pendiente",
        texto: "Categoría nueva descartada.",
      });
      return;
    }

    setCategorias((actuales) =>
      actuales.map((item) =>
        item.id === categoria.id
          ? { ...item, _deleted: true, _dirty: true }
          : item,
      ),
    );
    setMensajeCategorias({
      tipo: "pendiente",
      texto:
        'Eliminación pendiente. Al guardar, los negocios asociados pasarán a "Otras".',
    });
  };

  const quitarIconoCategoria = (id) => {
    setCategorias((actuales) =>
      actuales.map((categoria) =>
        categoria.id === id
          ? {
              ...categoria,
              _iconDisplayUrl: null,
              _iconFile: null,
              _removeIcon: Boolean(categoria.icon_url),
              _dirty: true,
            }
          : categoria,
      ),
    );
    setMensajeCategorias({
      tipo: "pendiente",
      texto: "Imagen marcada para eliminar. Guarda para confirmar.",
    });
  };

  const seleccionarIconoCategoria = (id, file) => {
    if (!file) return;
    const esPng =
      file.type === "image/png" ||
      (!file.type && file.name.toLowerCase().endsWith(".png"));
    if (!esPng || file.size > 2 * 1024 * 1024) {
      setMensajeCategorias({
        tipo: "error",
        texto: "El icono debe ser PNG y pesar máximo 2 MB.",
      });
      return;
    }

    setImageEditor({
      url: URL.createObjectURL(file),
      file,
      categoriaId: id,
      tipo: "logo",
      offsetX: 50,
      offsetY: 50,
      zoom: 1,
    });
  };

  const confirmarRecorteCategoria = async () => {
    if (!imageEditor) return;
    setRecortandoCategoria(true);

    try {
      const croppedFile = await crearPngCuadrado(imageEditor);
      const displayUrl = URL.createObjectURL(croppedFile);
      setCategorias((actuales) =>
        actuales.map((categoria) =>
          categoria.id === imageEditor.categoriaId
            ? {
                ...categoria,
                _iconFile: croppedFile,
                _iconDisplayUrl: displayUrl,
                _dirty: true,
              }
            : categoria,
        ),
      );
      URL.revokeObjectURL(imageEditor.url);
      setImageEditor(null);
      setMensajeCategorias({
        tipo: "pendiente",
        texto: "Icono recortado. Guarda la categoría para aplicarlo.",
      });
    } catch (error) {
      console.error("No se pudo recortar el icono:", error);
      setMensajeCategorias({
        tipo: "error",
        texto: "No se pudo preparar el recorte PNG.",
      });
    } finally {
      setRecortandoCategoria(false);
    }
  };

  const guardarCambiosCategorias = async () => {
    const pendientes = categorias.filter(
      (categoria) => categoria._new || categoria._dirty || categoria._deleted,
    );
    if (pendientes.length === 0) return;

    const nombres = new Set();
    for (const categoria of categorias) {
      if (categoria._deleted) continue;
      const name = categoria.name.trim();
      if (!name) {
        setMensajeCategorias({
          tipo: "error",
          texto: "Completa el nombre de todas las categorías nuevas.",
        });
        return;
      }
      const key = name.toLocaleLowerCase();
      if (nombres.has(key)) {
        setMensajeCategorias({
          tipo: "error",
          texto: `El nombre "${name}" está repetido.`,
        });
        return;
      }
      nombres.add(key);
      const orderIndex = Number(categoria.order_index);
      if (!Number.isInteger(orderIndex) || orderIndex < 0) {
        setMensajeCategorias({
          tipo: "error",
          texto:
            "El índice de orden debe ser un entero igual o mayor que cero.",
        });
        return;
      }
    }

    setGuardandoCategoria("todas");
    setMensajeCategorias({ tipo: "", texto: "" });

    try {
      for (const categoria of pendientes) {
        if (categoria._deleted && !categoria._new) {
          try {
            const { error } = await supabase
              .from("categories")
              .delete()
              .eq("id", categoria.id);
            if (error) throw error;
            if (categoria.icon_url) {
              const oldBucket = categoria.icon_url.startsWith(
                "sistema/categories generales iconos/",
              )
                ? "system"
                : "business-assets";
              try {
                await removeStorageObjectIfUnused(
                  oldBucket,
                  categoria.icon_url,
                );
              } catch (cleanupError) {
                console.warn(
                  "No se pudo limpiar el icono de la categoría eliminada:",
                  cleanupError,
                );
              }
            }
            setCategorias((actuales) =>
              actuales.filter((item) => item.id !== categoria.id),
            );
          } catch (error) {
            console.error("No se pudo eliminar la categoría:", error);
            setMensajeCategorias({
              tipo: "error",
              texto:
                error.code === "23503"
                  ? 'No se pudo eliminar. Verifica que la migración 088 esté aplicada para reasignar los negocios a "Otras".'
                  : "No se pudo eliminar la categoría. Revisa permisos e inténtalo otra vez.",
            });
            return;
          }
          continue;
        }

        const name = categoria.name.trim();
        const orderIndex = Number(categoria.order_index);
        const categoryId = categoria._new ? crypto.randomUUID() : categoria.id;
        let iconUrl = categoria.icon_url || null;
        let iconDisplayUrl = categoria._iconDisplayUrl || null;
        let uploadedPath = null;

        try {
          if (categoria._removeIcon && categoria.icon_url) {
            iconUrl = null;
          }

          if (categoria._iconFile) {
            uploadedPath = `sistema/categories generales iconos/${categoryId}/${crypto.randomUUID()}.png`;
            const { error: uploadError } = await supabase.storage
              .from("system")
              .upload(uploadedPath, categoria._iconFile, {
                contentType: "image/png",
                upsert: false,
              });
            if (uploadError) throw uploadError;
            iconUrl = uploadedPath;
            iconDisplayUrl = await resolveCategoryIconUrl(uploadedPath);
          }

          const query = categoria._new
            ? supabase.from("categories").insert({
                id: categoryId,
                name,
                icon_url: iconUrl,
                order_index: orderIndex,
              })
            : supabase
                .from("categories")
                .update({
                  name,
                  icon_url: iconUrl,
                  order_index: orderIndex,
                })
                .eq("id", categoria.id);
          const { data: savedCategory, error } = await query
            .select("id,name,icon_url")
            .single();
          if (error) throw error;

          setCategorias((actuales) =>
            actuales
              .map((actual) =>
                actual.id === categoria.id
                  ? {
                      ...actual,
                      id: savedCategory.id,
                      name,
                      icon_url: iconUrl,
                      order_index: orderIndex,
                      _iconDisplayUrl: iconDisplayUrl,
                      _iconFile: null,
                      _new: false,
                      _dirty: false,
                      _removeIcon: false,
                      _deleted: false,
                    }
                  : actual,
              )
              .sort(
                (a, b) =>
                  Number(a.order_index) - Number(b.order_index) ||
                  a.name.localeCompare(b.name, "es"),
              ),
          );

          if (categoria._removeIcon && categoria.icon_url) {
            const oldBucket = categoria.icon_url.startsWith(
              "sistema/categories generales iconos/",
            )
              ? "system"
              : "business-assets";
            try {
              await removeStorageObjectIfUnused(oldBucket, categoria.icon_url);
            } catch (cleanupError) {
              console.warn(
                "No se pudo limpiar el icono antiguo:",
                cleanupError,
              );
            }
          }

          if (categoria.icon_url && categoria.icon_url !== iconUrl) {
            const oldBucket = categoria.icon_url.startsWith(
              "sistema/categories generales iconos/",
            )
              ? "system"
              : "business-assets";
            try {
              await removeStorageObjectIfUnused(oldBucket, categoria.icon_url);
            } catch (cleanupError) {
              console.warn(
                "No se pudo limpiar el icono anterior:",
                cleanupError,
              );
            }
          }

          if (categoria._iconDisplayUrl?.startsWith("blob:")) {
            URL.revokeObjectURL(categoria._iconDisplayUrl);
          }
        } catch (error) {
          console.error(
            "No se pudieron guardar los cambios de categoría:",
            error,
          );
          if (uploadedPath) {
            try {
              await removeStorageObjectIfUnused("system", uploadedPath);
            } catch (cleanupError) {
              console.warn(
                "No se pudo limpiar el PNG que falló:",
                cleanupError,
              );
            }
          }
          setMensajeCategorias({
            tipo: "error",
            texto:
              "No se pudieron completar todas las categorías. Revisa permisos y reintenta.",
          });
          return;
        }
      }

      setMensajeCategorias({
        tipo: "exito",
        texto: "Cambios de categorías guardados.",
      });
    } finally {
      setGuardandoCategoria(null);
    }
  };

  const cambiosPendientesCategorias = categorias.filter(
    (categoria) => categoria._new || categoria._dirty,
  ).length;

  return (
    <SuperAdminSectionShell
      title="Marketplace"
      subtitle="Contenido que aparece en el inicio público."
      badge="Marketplace"
    >
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-neutral-900/75 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
                <Megaphone size={18} />
              </span>
              <div>
                <h3 className="font-bold text-white">Frases de inicio</h3>
                <p className="text-xs text-neutral-400">
                  Rotan en la portada pública.
                </p>
              </div>
            </div>
          </div>

          <form
            onSubmit={agregarFrase}
            className="mb-4 flex flex-col gap-2 sm:flex-row"
          >
            <input
              value={fraseNueva}
              onChange={(event) => setFraseNueva(event.target.value)}
              maxLength={120}
              placeholder="Nueva frase para Home"
              aria-label="Nueva frase para Home"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-violet-400"
            />
            <button
              type="submit"
              disabled={guardandoCambios}
              className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-500 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-violet-400 disabled:opacity-50 sm:w-auto"
            >
              <Plus size={16} />
              Añadir a lista
            </button>
          </form>

          {mensajeFrases.texto && (
            <p
              role="status"
              className={`mb-3 text-sm ${
                mensajeFrases.tipo === "error"
                  ? "text-red-300"
                  : mensajeFrases.tipo === "pendiente"
                    ? "text-amber-300"
                    : "text-emerald-300"
              }`}
            >
              {mensajeFrases.texto}
            </p>
          )}

          {cargandoFrases ? (
            <p className="py-5 text-sm text-neutral-400">Cargando frases...</p>
          ) : errorFrases ? (
            <p className="py-5 text-sm text-red-300">
              No se pudieron cargar las frases. Revisa que esté aplicada la
              migración `077_marketplace_frases.sql`.
            </p>
          ) : frases.length === 0 ? (
            <p className="py-5 text-sm text-neutral-400">
              No hay frases. Agrega una para mostrarla en Home.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full min-w-[540px] table-fixed border-collapse text-left">
                <caption className="sr-only">
                  Frases que se muestran en el inicio de Marketplace
                </caption>
                <colgroup>
                  <col />
                  <col className="w-20" />
                  <col className="w-28" />
                  <col className="w-14" />
                </colgroup>
                <thead className="bg-white/[0.03]">
                  <tr className="border-b border-white/10 text-[10px] font-bold uppercase text-neutral-400">
                    <th scope="col" className="px-3 py-2.5">
                      Frase
                    </th>
                    <th scope="col" className="px-2 py-2.5">
                      Orden
                    </th>
                    <th scope="col" className="px-2 py-2.5">
                      Visible
                    </th>
                    <th scope="col" className="px-2 py-2.5 text-center">
                      Acción
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {frases.map((frase, index) => (
                    <tr
                      key={frase.id}
                      className={`border-b border-white/[0.06] last:border-b-0 ${
                        frase._deleted ? "bg-red-500/[0.04]" : ""
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        {frase._deleted ? (
                          <span className="break-words text-sm text-red-200 line-through">
                            {frase.texto}
                          </span>
                        ) : (
                          <input
                            value={frase.texto}
                            onChange={(event) =>
                              cambiarFrase(frase.id, {
                                texto: event.target.value,
                              })
                            }
                            maxLength={120}
                            aria-label={`Texto de la frase ${index + 1}`}
                            disabled={guardandoCambios}
                            className="w-full min-w-0 rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-400 disabled:opacity-60"
                          />
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        {frase._deleted ? (
                          <span className="text-sm text-neutral-500">
                            {Number(frase.order_index) + 1}
                          </span>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={frase.order_index}
                            onChange={(event) =>
                              cambiarFrase(frase.id, {
                                order_index: event.target.value,
                              })
                            }
                            aria-label={`Orden de la frase ${index + 1}`}
                            disabled={guardandoCambios}
                            className="w-full rounded-md border border-white/10 bg-neutral-950 px-2 py-2 text-sm text-white outline-none focus:border-violet-400 disabled:opacity-60"
                          />
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        {frase._deleted ? (
                          <span className="text-xs text-red-300">
                            Pendiente
                          </span>
                        ) : (
                          <label className="flex items-center gap-2 text-xs text-neutral-300">
                            <input
                              type="checkbox"
                              checked={frase.is_active}
                              onChange={(event) =>
                                cambiarFrase(frase.id, {
                                  is_active: event.target.checked,
                                })
                              }
                              aria-label={`Mostrar frase ${index + 1} en Home`}
                              disabled={guardandoCambios}
                              className="h-4 w-4 accent-violet-500"
                            />
                            <span className="sr-only">
                              {frase.is_active ? "Activa" : "Inactiva"}
                            </span>
                          </label>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        {frase._deleted ? (
                          <button
                            type="button"
                            onClick={() =>
                              cambiarFrase(frase.id, { _deleted: false })
                            }
                            disabled={guardandoCambios}
                            className="text-xs font-bold text-neutral-200 hover:text-white disabled:opacity-50"
                          >
                            Restaurar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => eliminarFrase(frase)}
                            disabled={guardandoCambios}
                            title="Marcar para eliminar"
                            aria-label={`Marcar frase ${index + 1} para eliminar`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-red-500/10 text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!cargandoFrases && !errorFrases && (
            <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-neutral-400">
                {cambiosPendientes === 0
                  ? "Sin cambios pendientes."
                  : `${cambiosPendientes} cambio${cambiosPendientes === 1 ? "" : "s"} pendiente${cambiosPendientes === 1 ? "" : "s"}.`}
              </p>
              <button
                type="button"
                onClick={guardarCambiosFrases}
                disabled={cambiosPendientes === 0 || guardandoCambios}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-violet-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Save size={16} />
                {guardandoCambios ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-neutral-900/75 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">
                <Tag size={18} />
              </span>
              <div>
                <h3 className="font-bold text-white">Categorías visibles</h3>
                <p className="text-xs text-neutral-400">
                  Edita nombres y sube iconos PNG de hasta 2 MB.
                </p>
              </div>
            </div>
          </div>

          {cargandoCategorias ? (
            <p className="py-6 text-sm text-neutral-400">
              Cargando categorías...
            </p>
          ) : errorCategorias ? (
            <p className="py-6 text-sm text-red-300">
              No se pudieron cargar las categorías.
            </p>
          ) : (
            <>
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={agregarCategoria}
                  disabled={guardandoCategoria !== null}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-3.5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:opacity-50"
                >
                  <Plus size={16} />
                  Nueva categoría
                </button>
              </div>
              {mensajeCategorias.texto && (
                <p
                  role="status"
                  className={`mb-3 text-sm ${
                    mensajeCategorias.tipo === "error"
                      ? "text-red-300"
                      : mensajeCategorias.tipo === "pendiente"
                        ? "text-amber-300"
                        : "text-emerald-300"
                  }`}
                >
                  {mensajeCategorias.texto}
                </p>
              )}
              {categorias.length === 0 ? (
                <p className="py-6 text-sm text-neutral-400">
                  No hay categorías registradas.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                  <table className="w-full min-w-[620px] table-fixed border-collapse text-left">
                    <caption className="sr-only">
                      Categorías globales de Marketplace
                    </caption>
                    <colgroup>
                      <col />
                      <col className="w-24" />
                      <col className="w-64" />
                      <col className="w-28" />
                    </colgroup>
                    <thead className="bg-white/[0.03]">
                      <tr className="border-b border-white/10 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-400">
                        <th scope="col" className="px-3 py-2.5">
                          Nombre
                        </th>
                        <th scope="col" className="px-3 py-2.5">
                          Índice orden
                        </th>
                        <th scope="col" className="px-3 py-2.5">
                          Icono PNG
                        </th>
                        <th scope="col" className="px-3 py-2.5 text-center">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {categorias.map((categoria, index) => (
                        <tr
                          key={categoria.id}
                          className="border-b border-white/[0.06] align-top last:border-b-0"
                        >
                          <td className="px-3 py-2.5">
                            <input
                              value={categoria.name}
                              onChange={(event) =>
                                cambiarNombreCategoria(
                                  categoria.id,
                                  event.target.value,
                                )
                              }
                              maxLength={80}
                              aria-label={`Nombre de la categoría ${index + 1}`}
                              disabled={guardandoCategoria !== null}
                              className="w-full min-w-0 rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400 disabled:opacity-60"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={categoria.order_index}
                              onChange={(event) =>
                                cambiarOrdenCategoria(
                                  categoria.id,
                                  event.target.value,
                                )
                              }
                              aria-label={`Índice orden de categoría ${index + 1}`}
                              disabled={guardandoCategoria !== null}
                              className="w-full rounded-xl border border-white/10 bg-neutral-950 px-2 py-2.5 text-sm text-white outline-none focus:border-emerald-400 disabled:opacity-60"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-950 text-neutral-300">
                                {categoria._iconDisplayUrl ||
                                categoria.icon_url ? (
                                  <img
                                    src={
                                      categoria._iconDisplayUrl ||
                                      categoria.icon_url
                                    }
                                    alt=""
                                    className="h-6 w-6 object-contain"
                                  />
                                ) : (
                                  <ImagePlus size={17} />
                                )}
                              </span>
                              <label className="inline-flex min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-neutral-200 transition hover:bg-white/[0.06]">
                                <Upload size={15} />
                                <span className="truncate">
                                  {categoria._iconFile?.name || "Elegir PNG"}
                                </span>
                                <input
                                  type="file"
                                  accept="image/png,.png"
                                  aria-label={`Icono PNG para la categoría ${index + 1}`}
                                  disabled={guardandoCategoria !== null}
                                  onChange={(event) => {
                                    seleccionarIconoCategoria(
                                      categoria.id,
                                      event.target.files?.[0],
                                    );
                                    event.target.value = "";
                                  }}
                                  className="sr-only"
                                />
                              </label>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => eliminarCategoria(categoria)}
                                disabled={guardandoCategoria !== null}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                                title="Eliminar categoría"
                                aria-label={`Eliminar categoría ${index + 1}`}
                              >
                                <Trash2 size={16} />
                              </button>
                              {(categoria.icon_url ||
                                categoria._iconDisplayUrl) && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    quitarIconoCategoria(categoria.id)
                                  }
                                  disabled={guardandoCategoria !== null}
                                  className="text-[11px] font-semibold text-neutral-300 transition hover:text-white disabled:opacity-50"
                                >
                                  Quitar imagen
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {!cargandoCategorias && !errorCategorias && (
            <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-neutral-400">
                {cambiosPendientesCategorias === 0
                  ? "Sin cambios pendientes."
                  : `${cambiosPendientesCategorias} cambio${cambiosPendientesCategorias === 1 ? "" : "s"} pendiente${cambiosPendientesCategorias === 1 ? "" : "s"}.`}
              </p>
              <button
                type="button"
                onClick={guardarCambiosCategorias}
                disabled={
                  cambiosPendientesCategorias === 0 ||
                  guardandoCategoria !== null
                }
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
              >
                <Save size={16} />
                {guardandoCategoria !== null
                  ? "Guardando..."
                  : "Guardar cambios"}
              </button>
            </div>
          )}
        </section>
      </div>
      <ImageCropEditor
        imageEditor={imageEditor}
        setImageEditor={setImageEditor}
        onConfirm={confirmarRecorteCategoria}
        saving={recortandoCategoria}
      />
    </SuperAdminSectionShell>
  );
};

export default SuperAdminMarketplacePanel;
