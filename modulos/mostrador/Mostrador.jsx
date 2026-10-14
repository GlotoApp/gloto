import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Expand,
  LoaderCircle,
  RefreshCw,
  Store,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toBlobURL } from "@ffmpeg/util";
import ffmpegCoreURL from "@ffmpeg/core?url";
import ffmpegWasmURL from "@ffmpeg/core/wasm?url";
import { supabase } from "../../src/lib/supabaseClient";

const REFRESH_INTERVAL_MS = 90_000;
const SLIDE_DURATION_MS = 7_000;
const CONTROLS_IDLE_MS = 3_000;
const VIDEO_WIDTH = 1280;
const VIDEO_HEIGHT = 720;
const VIDEO_FPS = 15;
const VIDEO_TRANSITION_MS = 300;

const formatPrice = (price) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(price) || 0);

const wait = (duration) =>
  new Promise((resolve) => window.setTimeout(resolve, duration));

const loadVideoImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error(
          "No se pudo cargar una imagen del menú para el video. Comprueba que sus imágenes permitan acceso desde este sitio.",
        ),
      );
    image.src = src;
  });

const drawCoverImage = (context, image) => {
  const scale = Math.max(
    VIDEO_WIDTH / image.width,
    VIDEO_HEIGHT / image.height,
  );
  const width = image.width * scale;
  const height = image.height * scale;
  context.drawImage(
    image,
    (VIDEO_WIDTH - width) / 2,
    (VIDEO_HEIGHT - height) / 2,
    width,
    height,
  );
};

const drawWrappedText = (context, text, x, y, maxWidth, lineHeight, maxLines) => {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);

  lines.slice(0, maxLines).forEach((textLine, index) => {
    context.fillText(textLine, x, y + index * lineHeight);
  });

  return Math.min(lines.length, maxLines) * lineHeight;
};

const drawVideoSlide = (product, business, images) => {
  const canvas = document.createElement("canvas");
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Este navegador no pudo crear el video.");

  const productImage = images.get(product.image_url);
  if (productImage) {
    drawCoverImage(context, productImage);
  } else {
    const background = context.createLinearGradient(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
    background.addColorStop(0, "#262522");
    background.addColorStop(1, "#10100f");
    context.fillStyle = background;
    context.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
  }

  const bottomGradient = context.createLinearGradient(0, 220, 0, VIDEO_HEIGHT);
  bottomGradient.addColorStop(0, "rgba(0, 0, 0, 0.08)");
  bottomGradient.addColorStop(1, "rgba(0, 0, 0, 0.92)");
  context.fillStyle = bottomGradient;
  context.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
  const sideGradient = context.createLinearGradient(0, 0, VIDEO_WIDTH, 0);
  sideGradient.addColorStop(0, "rgba(0, 0, 0, 0.58)");
  sideGradient.addColorStop(0.65, "rgba(0, 0, 0, 0)");
  context.fillStyle = sideGradient;
  context.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);

  const logo = images.get(business.logo_url);
  if (logo) {
    context.save();
    context.beginPath();
    context.arc(72, 74, 30, 0, Math.PI * 2);
    context.clip();
    context.drawImage(logo, 42, 44, 60, 60);
    context.restore();
  }

  context.textBaseline = "top";
  context.fillStyle = "#ffffff";
  context.shadowColor = "rgba(0, 0, 0, 0.55)";
  context.shadowBlur = 12;
  context.font = "700 30px Manrope, sans-serif";
  context.fillText(business.name, logo ? 120 : 56, 57, 1050);

  context.shadowBlur = 0;
  context.fillStyle = "#fbbf24";
  context.font = "700 22px Manrope, sans-serif";
  context.fillText(product.categoryName.toLocaleUpperCase("es-CO"), 72, 400, 1050);

  context.fillStyle = "#ffffff";
  context.shadowColor = "rgba(0, 0, 0, 0.65)";
  context.shadowBlur = 16;
  context.font = "800 68px Manrope, sans-serif";
  const titleHeight = drawWrappedText(
    context,
    product.name,
    72,
    444,
    1080,
    74,
    2,
  );

  context.shadowBlur = 8;
  if (product.description) {
    context.font = "500 24px Manrope, sans-serif";
    context.fillStyle = "rgba(255, 255, 255, 0.86)";
    drawWrappedText(
      context,
      product.description,
      72,
      444 + titleHeight + 6,
      1000,
      32,
      2,
    );
  }

  context.shadowBlur = 12;
  context.fillStyle = "#fbbf24";
  context.font = "800 50px Manrope, sans-serif";
  context.fillText(formatPrice(product.price), 72, 640, 800);
  if (!product.available) {
    context.font = "700 18px Manrope, sans-serif";
    context.fillStyle = "#ffffff";
    context.fillText("AGOTADO", 760, 652, 300);
  }

  return canvas;
};

const Mostrador = () => {
  const { slug } = useParams();
  const [business, setBusiness] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fullscreenError, setFullscreenError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloadStatus, setDownloadStatus] = useState("");
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [cssFullscreen, setCssFullscreen] = useState(false);
  const [activeSlide, setActiveSlide] = useState({ slug: null, index: 0 });
  const [controlsVisible, setControlsVisible] = useState(false);
  const controlsTimer = useRef(null);
  const displayRef = useRef(null);
  const ffmpegRef = useRef(null);
  const isDownloading = Boolean(downloadStatus);

  const loadMenu = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      setError("");

      try {
        const { data: businessData, error: businessError } = await supabase
          .from("businesses")
          .select("id,name,slug,logo_url,admin_suspended")
          .eq("slug", slug)
          .eq("is_active", true)
          .eq("admin_suspended", false)
          .maybeSingle();

        if (businessError) throw businessError;
        if (!businessData) {
          setBusiness(null);
          setProducts([]);
          setError("No encontramos un negocio activo con ese enlace.");
          return;
        }

        const [categoriesResult, productsResult, availabilityResult, inventoryResult] =
          await Promise.all([
            supabase
              .from("categories_shop")
              .select("id,name,order_index")
              .eq("business_id", businessData.id)
              .order("order_index", { ascending: true }),
            supabase
              .from("products")
              .select(
                "id,name,description,price,stock,image_url,is_active,is_sold_out,category_id,order_index,created_at",
              )
              .eq("business_id", businessData.id)
              .eq("is_active", true)
              .order("order_index", { ascending: true })
              .order("created_at", { ascending: true }),
            supabase
              .from("product_availability")
              .select("product_id,is_available")
              .eq("business_id", businessData.id),
            supabase.rpc("get_public_business_inventory_access", {
              p_business_id: businessData.id,
            }),
          ]);

        if (categoriesResult.error) throw categoriesResult.error;
        if (productsResult.error) throw productsResult.error;
        if (availabilityResult.error) throw availabilityResult.error;
        if (inventoryResult.error) throw inventoryResult.error;

        const categoryOrder = new Map(
          (categoriesResult.data || []).map((category, index) => [
            category.id,
            { name: category.name, order: index },
          ]),
        );
        const availability = new Map(
          (availabilityResult.data || []).map((row) => [
            row.product_id,
            row.is_available,
          ]),
        );
        const inventoryEnabled = Boolean(inventoryResult.data);

        const menuProducts = (productsResult.data || [])
          .map((product) => {
            const category = categoryOrder.get(product.category_id);
            const inStock =
              availability.get(product.id) ??
              (Number(product.stock || 0) > 0 && !product.is_sold_out);

            return {
              ...product,
              categoryName: category?.name || "Otros",
              categoryOrder: category?.order ?? Number.MAX_SAFE_INTEGER,
              available: !product.is_sold_out && (!inventoryEnabled || inStock),
            };
          })
          .sort(
            (first, second) =>
              first.categoryOrder - second.categoryOrder ||
              Number(first.order_index || 0) - Number(second.order_index || 0),
          );

        setBusiness(businessData);
        setProducts(menuProducts);
        setActiveSlide((current) => ({
          slug,
          index:
            current.slug === slug && menuProducts.length
              ? current.index % menuProducts.length
              : 0,
        }));
      } catch (loadError) {
        console.error("No se pudo cargar el menú del mostrador:", loadError);
        setError("No se pudo cargar el menú. Revisa la conexión e inténtalo de nuevo.");
      } finally {
        setLoading(false);
      }
    },
    [slug],
  );

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => loadMenu(true), 0);
    const refreshTimer = window.setInterval(
      () => loadMenu(),
      REFRESH_INTERVAL_MS,
    );
    return () => {
      window.clearTimeout(initialLoadTimer);
      window.clearInterval(refreshTimer);
    };
  }, [loadMenu]);

  useEffect(() => {
    if (products.length < 2) return undefined;
    const slideTimer = window.setInterval(
      () =>
        setActiveSlide((current) => ({
          slug,
          index:
            ((current.slug === slug ? current.index : 0) + 1) % products.length,
        })),
      SLIDE_DURATION_MS,
    );
    return () => window.clearInterval(slideTimer);
  }, [products.length, slug]);

  useEffect(() => {
    const showControls = () => {
      setControlsVisible(true);
      window.clearTimeout(controlsTimer.current);
      controlsTimer.current = window.setTimeout(
        () => setControlsVisible(false),
        CONTROLS_IDLE_MS,
      );
    };

    window.addEventListener("pointermove", showControls);
    window.addEventListener("pointerdown", showControls);
    window.addEventListener("keydown", showControls);
    window.addEventListener("touchstart", showControls, { passive: true });

    return () => {
      window.removeEventListener("pointermove", showControls);
      window.removeEventListener("pointerdown", showControls);
      window.removeEventListener("keydown", showControls);
      window.removeEventListener("touchstart", showControls);
      window.clearTimeout(controlsTimer.current);
    };
  }, []);

  useEffect(() => {
    const updateFullscreenState = () => {
      const fullscreenElement =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement;
      if (fullscreenElement) setCssFullscreen(false);
    };
    const exitCssFullscreen = (event) => {
      if (event.key === "Escape") setCssFullscreen(false);
    };

    document.addEventListener("fullscreenchange", updateFullscreenState);
    document.addEventListener("webkitfullscreenchange", updateFullscreenState);
    document.addEventListener("mozfullscreenchange", updateFullscreenState);
    document.addEventListener("MSFullscreenChange", updateFullscreenState);
    window.addEventListener("keydown", exitCssFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreenState);
      document.removeEventListener(
        "webkitfullscreenchange",
        updateFullscreenState,
      );
      document.removeEventListener("mozfullscreenchange", updateFullscreenState);
      document.removeEventListener("MSFullscreenChange", updateFullscreenState);
      window.removeEventListener("keydown", exitCssFullscreen);
    };
  }, []);

  const activeIndex = activeSlide.slug === slug ? activeSlide.index : 0;
  const currentProductIndex = products.length ? activeIndex % products.length : 0;
  const activeProduct = products[currentProductIndex];

  const changeProduct = (direction) => {
    setActiveSlide({
      slug,
      index: (currentProductIndex + direction + products.length) % products.length,
    });
  };

  const toggleFullscreen = async () => {
    setFullscreenError("");
    try {
      const fullscreenElement =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement;
      const exitFullscreen =
        document.exitFullscreen ||
        document.webkitExitFullscreen ||
        document.mozCancelFullScreen ||
        document.msExitFullscreen;
      if (fullscreenElement && exitFullscreen) {
        await exitFullscreen.call(document);
        setCssFullscreen(false);
      } else {
        const display = displayRef.current;
        const requestFullscreen =
          display?.requestFullscreen ||
          display?.webkitRequestFullscreen ||
          display?.mozRequestFullScreen ||
          display?.msRequestFullscreen;
        if (requestFullscreen) {
          await requestFullscreen.call(display);
        } else {
          setCssFullscreen((current) => !current);
        }
      }
    } catch (fullscreenRequestError) {
      console.error("No se pudo activar pantalla completa:", fullscreenRequestError);
      setCssFullscreen(true);
      setFullscreenError(
        "Este navegador no permitió ocultar sus barras; el mostrador ocupará toda el área visible.",
      );
    }
  };

  const downloadVideo = async () => {
    if (!products.length || isDownloading) return;
    setDownloadError("");
    setDownloadProgress(0);

    let recorder;
    let stream;
    let ffmpeg;
    let ffmpegFiles = [];
    try {
      setDownloadStatus("Preparando el video...");
      await document.fonts?.ready;

      const imageSources = [
        ...new Set(
          [business.logo_url, ...products.map((product) => product.image_url)].filter(
            Boolean,
          ),
        ),
      ];
      const images = new Map();
      const loadedImages = await Promise.all(
        imageSources.map(async (src) => [src, await loadVideoImage(src)]),
      );
      loadedImages.forEach(([src, image]) => images.set(src, image));
      const slides = products.map((product) =>
        drawVideoSlide(product, business, images),
      );

      const canvas = document.createElement("canvas");
      canvas.width = VIDEO_WIDTH;
      canvas.height = VIDEO_HEIGHT;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Este navegador no pudo crear el video.");
      if (!canvas.captureStream || typeof MediaRecorder === "undefined") {
        throw new Error(
          "Este navegador no admite la grabación de video. Prueba con una versión reciente de Chrome, Edge, Firefox o Safari.",
        );
      }

      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      ffmpeg = ffmpegRef.current || new FFmpeg();
      ffmpegRef.current = ffmpeg;
      if (!ffmpeg.loaded) {
        setDownloadStatus("Cargando el codificador de video...");
        await ffmpeg.load({
          coreURL: await toBlobURL(ffmpegCoreURL, "text/javascript"),
          wasmURL: await toBlobURL(ffmpegWasmURL, "application/wasm"),
        });
        ffmpeg.on("progress", ({ progress }) => {
          setDownloadProgress(Math.max(0, Math.min(100, Math.round(progress * 100))));
        });
      }

      const mimeType = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
        "video/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) {
        throw new Error(
          "Este navegador no ofrece un formato de grabación compatible para crear el MP4.",
        );
      }

      stream = canvas.captureStream(VIDEO_FPS);
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 4_000_000,
      });
      const recordedChunks = [];
      const recording = new Promise((resolve, reject) => {
        recorder.addEventListener(
          "dataavailable",
          (event) => {
            if (event.data.size) recordedChunks.push(event.data);
          },
        );
        recorder.addEventListener(
          "error",
          (event) => reject(event.error || new Error("Falló la grabación del video.")),
          { once: true },
        );
        recorder.addEventListener(
          "stop",
          () => resolve(new Blob(recordedChunks, { type: mimeType })),
          { once: true },
        );
      });

      recorder.start();
      setDownloadStatus("Grabando los productos...");
      for (let index = 0; index < slides.length; index += 1) {
        setDownloadStatus(`Grabando producto ${index + 1} de ${slides.length}...`);
        const nextSlide = slides[index];
        const previousSlide = slides[index - 1];
        const transitionStart = performance.now();
        if (previousSlide) {
          while (performance.now() - transitionStart < VIDEO_TRANSITION_MS) {
            const progress = Math.min(
              1,
              (performance.now() - transitionStart) / VIDEO_TRANSITION_MS,
            );
            context.clearRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
            context.drawImage(previousSlide, 0, 0);
            context.globalAlpha = progress;
            context.drawImage(nextSlide, 0, 0);
            context.globalAlpha = 1;
            await wait(1000 / VIDEO_FPS);
          }
        }
        context.clearRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
        context.drawImage(nextSlide, 0, 0);
        await wait(SLIDE_DURATION_MS - (previousSlide ? VIDEO_TRANSITION_MS : 0));
      }
      recorder.stop();
      const recordedVideo = await recording;

      setDownloadStatus("Convirtiendo el video a MP4...");
      const filePrefix = `mostrador-${Date.now()}`;
      const inputFile = `${filePrefix}-input`;
      const outputFile = `${filePrefix}-output.mp4`;
      ffmpegFiles = [inputFile, outputFile];
      await ffmpeg.writeFile(
        inputFile,
        new Uint8Array(await recordedVideo.arrayBuffer()),
      );
      await ffmpeg.exec([
        "-i",
        inputFile,
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outputFile,
      ]);
      const videoData = await ffmpeg.readFile(outputFile);
      const videoUrl = URL.createObjectURL(
        new Blob([videoData], { type: "video/mp4" }),
      );
      const downloadLink = document.createElement("a");
      downloadLink.href = videoUrl;
      downloadLink.download = `mostrador-${business.slug || "menu"}.mp4`;
      downloadLink.click();
      window.setTimeout(() => URL.revokeObjectURL(videoUrl), 1000);
    } catch (videoError) {
      console.error("No se pudo generar el video del mostrador:", videoError);
      setDownloadError(
        videoError.message ||
          "No se pudo generar el video. Inténtalo de nuevo en otro navegador.",
      );
    } finally {
      if (recorder && recorder.state !== "inactive") recorder.stop();
      stream?.getTracks().forEach((track) => track.stop());
      if (ffmpeg?.loaded) {
        await Promise.all(
          ffmpegFiles.map(async (file) => {
            try {
              await ffmpeg.deleteFile(file);
            } catch (cleanupError) {
              console.warn(`No se pudo limpiar el archivo temporal ${file}:`, cleanupError);
            }
          }),
        );
      }
      setDownloadStatus("");
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-white">
        <LoaderCircle className="animate-spin text-amber-400" size={40} />
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-white">
        <section className="max-w-lg rounded-3xl border border-white/10 bg-neutral-900 p-10 text-center">
          <Store className="mx-auto mb-5 text-amber-400" size={40} />
          <h1 className="text-2xl font-black">Mostrador no disponible</h1>
          <p className="mt-3 text-neutral-400">{error}</p>
          <button
            type="button"
            onClick={() => loadMenu(true)}
            className="mt-7 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 font-bold text-neutral-950 hover:bg-amber-300"
          >
            <RefreshCw size={18} />
            Reintentar
          </button>
        </section>
      </main>
    );
  }

  return (
    <main
      ref={displayRef}
      className={`relative h-screen h-[100dvh] overflow-hidden bg-[#10100f] text-white ${
        cssFullscreen ? "fixed inset-0 z-[1000]" : ""
      }`}
    >
      {products.length === 0 ? (
        <section className="flex h-full flex-col items-center justify-center px-6 text-center">
          <Store className="mb-4 text-neutral-600" size={44} />
          <h2 className="text-2xl font-bold">Aún no hay productos para mostrar</h2>
          <p className="mt-2 text-neutral-500">
            Los productos activos de este negocio aparecerán aquí.
          </p>
        </section>
      ) : (
        <AnimatePresence mode="wait">
          <motion.section
            key={activeProduct.id}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            {activeProduct.image_url ? (
              <motion.img
                src={activeProduct.image_url}
                alt={activeProduct.name}
                className="absolute inset-0 h-full w-full object-cover"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-neutral-800 via-neutral-950 to-[#10100f]">
                <Store className="text-white/10" size={180} />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-transparent to-transparent" />

            <div className="absolute left-6 top-6 flex items-center gap-3 sm:left-10 sm:top-10 lg:left-16 lg:top-12">
              {business.logo_url ? (
                <img
                  src={business.logo_url}
                  alt=""
                  className="h-11 w-11 rounded-full border border-white/20 object-cover sm:h-14 sm:w-14"
                />
              ) : (
                <Store className="text-amber-400" size={30} />
              )}
              <p className="max-w-[55vw] truncate text-lg font-bold drop-shadow-lg sm:text-2xl">
                {business.name}
              </p>
            </div>

            <div className="absolute bottom-24 left-6 right-6 sm:bottom-28 sm:left-10 sm:right-10 lg:bottom-32 lg:left-16 lg:right-16">
              <p className="mb-3 text-sm font-bold uppercase tracking-[0.24em] text-amber-400 sm:text-lg">
                {activeProduct.categoryName}
              </p>
              <h1 className="max-w-5xl text-4xl font-black leading-[0.98] drop-shadow-xl sm:text-6xl lg:text-8xl">
                {activeProduct.name}
              </h1>
              {activeProduct.description && (
                <p className="mt-4 max-w-3xl text-base text-white/80 drop-shadow-md sm:mt-6 sm:text-xl lg:text-2xl">
                  {activeProduct.description}
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-4 sm:mt-7 sm:gap-6">
                <p className="text-3xl font-black text-amber-400 drop-shadow-lg sm:text-5xl lg:text-6xl">
                  {formatPrice(activeProduct.price)}
                </p>
                {!activeProduct.available && (
                  <span className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold uppercase backdrop-blur sm:text-base">
                    Agotado
                  </span>
                )}
              </div>
            </div>
          </motion.section>
        </AnimatePresence>
      )}

      <div
        aria-hidden={!controlsVisible}
        className={`absolute right-5 top-5 z-10 flex gap-2 transition-opacity duration-500 sm:right-8 sm:top-8 ${
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={() => loadMenu()}
          tabIndex={controlsVisible ? 0 : -1}
          aria-label="Actualizar menú"
          title="Actualizar menú"
          className="rounded-full border border-white/20 bg-black/30 p-3 text-white backdrop-blur transition hover:bg-black/60"
        >
          <RefreshCw size={20} />
        </button>
        <button
          type="button"
          onClick={downloadVideo}
          disabled={isDownloading || products.length === 0}
          tabIndex={controlsVisible ? 0 : -1}
          aria-label="Descargar mostrador como video MP4"
          title="Descargar video MP4"
          className="rounded-full border border-white/20 bg-black/30 p-3 text-white backdrop-blur transition hover:bg-black/60 disabled:cursor-wait disabled:opacity-60"
        >
          {isDownloading ? (
            <LoaderCircle className="animate-spin" size={20} />
          ) : (
            <Download size={20} />
          )}
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          tabIndex={controlsVisible ? 0 : -1}
          aria-label="Activar pantalla completa"
          title="Pantalla completa"
          className="rounded-full border border-white/20 bg-black/30 p-3 text-white backdrop-blur transition hover:bg-black/60"
        >
          <Expand size={20} />
        </button>
      </div>

      {products.length > 1 && (
        <div
          aria-hidden={!controlsVisible}
          className={`absolute bottom-0 left-0 right-0 z-10 px-6 pb-5 transition-opacity duration-500 sm:px-10 sm:pb-7 lg:px-16 ${
            controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <div className="mb-4 flex gap-1.5" aria-hidden="true">
            {products.map((product, index) => (
              <div
                key={product.id}
                className="h-1 flex-1 overflow-hidden rounded-full bg-white/30"
              >
                {index === currentProductIndex && (
                  <motion.div
                    key={`${product.id}-${activeIndex}`}
                    className="h-full origin-left rounded-full bg-amber-400"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{
                      duration: SLIDE_DURATION_MS / 1000,
                      ease: "linear",
                    }}
                  />
                )}
                {index < currentProductIndex && (
                  <div className="h-full rounded-full bg-amber-400" />
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white/75 sm:text-base">
              {currentProductIndex + 1} / {products.length}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => changeProduct(-1)}
                tabIndex={controlsVisible ? 0 : -1}
                aria-label="Producto anterior"
                className="rounded-full border border-white/30 bg-black/30 p-3 text-white backdrop-blur transition hover:bg-black/60"
              >
                <ArrowLeft size={20} />
              </button>
              <button
                type="button"
                onClick={() => changeProduct(1)}
                tabIndex={controlsVisible ? 0 : -1}
                aria-label="Siguiente producto"
                className="rounded-full border border-white/30 bg-black/30 p-3 text-white backdrop-blur transition hover:bg-black/60"
              >
                <ArrowRight size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {fullscreenError && (
        <p
          role="status"
          aria-hidden={!controlsVisible}
          className={`absolute bottom-20 right-6 z-20 rounded-xl bg-black/80 px-4 py-3 text-sm text-rose-300 transition-opacity duration-500 ${
            controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {fullscreenError}
        </p>
      )}
      {(downloadStatus || downloadError) && (
        <p
          role={downloadError ? "alert" : "status"}
          aria-live="polite"
          className={`absolute bottom-20 right-6 z-20 max-w-[min(90vw,32rem)] rounded-xl bg-black/85 px-4 py-3 text-sm transition-opacity ${
            downloadError ? "text-rose-300" : "text-white"
          }`}
        >
          {downloadError ||
            `${downloadStatus}${downloadProgress ? ` ${downloadProgress}%` : ""}`}
        </p>
      )}
    </main>
  );
};

export default Mostrador;
