import { useEffect, useRef, useState } from "react";
import {
  Download,
  Megaphone,
  Palette,
  Radio,
  ScanQrCode,
  Smartphone,
} from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "../../src/lib/supabaseClient";

const presets = [
  ["#6b21a8", "#3b0764"],
  ["#1d4ed8", "#1e3a8a"],
  ["#047857", "#064e3b"],
  ["#b91c1c", "#450a0a"],
];

const wrapText = (context, text, x, y, maxWidth, lineHeight) => {
  const words = text.trim().split(/\s+/);
  let line = "";
  let currentY = y;

  words.forEach((word, index) => {
    const testLine = `${line}${word} `;
    if (context.measureText(testLine.trim()).width > maxWidth && line) {
      context.fillText(line.trim(), x, currentY);
      line = `${word} `;
      currentY += lineHeight;
    } else {
      line = testLine;
    }

    if (index === words.length - 1) {
      context.fillText(line.trim(), x, currentY);
    }
  });
};

const roundedRect = (context, x, y, width, height, radius) => {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
};

export default function Utilidades() {
  const canvasRef = useRef(null);
  const qrRef = useRef(null);
  const [url, setUrl] = useState(
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/marketplace`,
  );
  const [title, setTitle] = useState("¡Escanea, Pide y Compra!");
  const [brand, setBrand] = useState("GLOTO");
  const [primaryColor, setPrimaryColor] = useState("#6b21a8");
  const [secondaryColor, setSecondaryColor] = useState("#3b0764");
  const [showNfc, setShowNfc] = useState(false);
  const [pieceType, setPieceType] = useState("general");
  const [businesses, setBusinesses] = useState([]);
  const [businessId, setBusinessId] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [isLoadingBusinesses, setIsLoadingBusinesses] = useState(true);
  const [businessSearch, setBusinessSearch] = useState("");
  const [isBusinessListOpen, setIsBusinessListOpen] = useState(false);

  const marketplaceUrl =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/marketplace`;

  useEffect(() => {
    let active = true;

    const loadBusinesses = async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("id,name,slug,logo_url")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (!active) return;
      if (error) {
        console.error("No se pudieron cargar los negocios:", error);
        setBusinesses([]);
      } else {
        setBusinesses(data || []);
      }
      setIsLoadingBusinesses(false);
    };

    loadBusinesses();
    return () => {
      active = false;
    };
  }, []);

  const selectPieceType = (type) => {
    setPieceType(type);
    setBusinessId("");
    setLogoUrl("");
    setBusinessSearch("");
    setIsBusinessListOpen(false);

    if (type === "general") {
      setUrl(marketplaceUrl);
      setBrand("GLOTO");
      setTitle("¡Escanea, Pide y Compra!");
    }
  };

  const selectBusiness = (id) => {
    setBusinessId(id);
    const business = businesses.find((item) => item.id === id);
    if (!business) return;

    setBusinessSearch(business.name || "");
    setIsBusinessListOpen(false);
    setBrand(business.name || "");
    setLogoUrl(business.logo_url || "");
    setTitle(`¡Compra fácil en ${business.name}!`);
    setUrl(`${window.location.origin}/marketplace/tienda/${business.slug}`);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const qrCanvas = qrRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;
    let cancelled = false;
    let logoImage = null;
    let glotoMarkImage = null;
    let radioIconImage = null;
    let scanQrCodeIconImage = null;

    const loadLogo = async () => {
      if (!logoUrl) return null;
      const image = new Image();
      image.crossOrigin = "anonymous";
      await new Promise((resolve) => {
        image.onload = resolve;
        image.onerror = resolve;
        image.src = logoUrl;
      });
      return image.naturalWidth ? image : null;
    };

    const loadGlotoMark = async () => {
      const image = new Image();
      await new Promise((resolve) => {
        image.onload = resolve;
        image.onerror = resolve;
        image.src = "/logo.png";
      });
      if (!image.naturalWidth) return null;

      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = image.naturalWidth;
      maskCanvas.height = image.naturalHeight;
      const maskContext = maskCanvas.getContext("2d");
      maskContext.drawImage(image, 0, 0);
      const pixels = maskContext.getImageData(
        0,
        0,
        maskCanvas.width,
        maskCanvas.height,
      );

      for (let index = 0; index < pixels.data.length; index += 4) {
        if (
          pixels.data[index] < 24 &&
          pixels.data[index + 1] < 24 &&
          pixels.data[index + 2] < 24
        ) {
          pixels.data[index + 3] = 0;
        }
      }

      maskContext.putImageData(pixels, 0, 0);
      return maskCanvas;
    };

    const loadLucideIcon = async (Icon) => {
      const svg = renderToStaticMarkup(
        <Icon color="#ffffff" width="48" height="48" strokeWidth="1.8" />,
      );
      const image = new Image();
      await new Promise((resolve) => {
        image.onload = resolve;
        image.onerror = resolve;
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      });
      return image.naturalWidth ? image : null;
    };

    const render = async () => {
      logoImage = await loadLogo();
      glotoMarkImage = await loadGlotoMark();
      radioIconImage = await loadLucideIcon(Radio);
      scanQrCodeIconImage = await loadLucideIcon(ScanQrCode);
      if (cancelled) return;

      const width = canvas.width;
      const height = canvas.height;
      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, primaryColor);
      gradient.addColorStop(1, secondaryColor);
      context.clearRect(0, 0, width, height);
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      context.save();
      context.globalAlpha = 0.07;
      context.fillStyle = "#ffffff";
      context.beginPath();
      context.arc(width + 20, 180, 210, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(-70, height - 130, 190, 0, Math.PI * 2);
      context.fill();
      context.restore();

      context.textAlign = "center";
      context.fillStyle = "#ffffff";

      context.save();
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.font = "500 34px system-ui, sans-serif";
      const headerText = "Gloto";
      const headerTextWidth = context.measureText(headerText).width;
      const markSize = 58;
      const headerGap = 14;
      const headerWidth = headerTextWidth + headerGap + markSize;
      const headerX = (width - headerWidth) / 2;
      context.fillStyle = "#ffffff";
      if (glotoMarkImage) {
        context.drawImage(glotoMarkImage, headerX, 83, markSize, markSize);
      }
      context.fillText(headerText, headerX + markSize + headerGap, 112);
      context.restore();

      context.textAlign = "center";
      context.font = "800 42px system-ui, sans-serif";
      wrapText(
        context,
        title || "¡Compra fácil desde tu celular!",
        width / 2,
        190,
        680,
        50,
      );

      const qrTop = 265;
      const qrSize = 370;
      const qrBottom = qrTop + qrSize;

      context.fillStyle = "#ffffff";
      context.beginPath();
      context.roundRect(180, qrTop, 440, 400, 28);
      context.fill();

      context.drawImage(qrCanvas, 215, qrTop + 15, qrSize, qrSize);

      if (pieceType === "business" && logoImage) {
        const logoSize = 72;
        const logoAspectRatio =
          logoImage.naturalWidth / logoImage.naturalHeight;
        const logoWidth =
          logoAspectRatio >= 1 ? logoSize : logoSize * logoAspectRatio;
        const logoHeight =
          logoAspectRatio >= 1 ? logoSize / logoAspectRatio : logoSize;
        context.drawImage(
          logoImage,
          (width - logoWidth) / 2,
          qrTop + 425,
          logoWidth,
          logoHeight,
        );
      }

      context.strokeStyle = "#ffffff";
      context.lineWidth = 7;
      context.lineCap = "round";
      const corners = [
        [145, 245, 1, 1],
        [655, 245, -1, 1],
        [145, 690, 1, -1],
        [655, 690, -1, -1],
      ];
      corners.forEach(([x, y, horizontal, vertical]) => {
        context.beginPath();
        context.moveTo(x + horizontal * 40, y);
        context.lineTo(x, y);
        context.lineTo(x, y + vertical * 40);
        context.stroke();
      });
      context.fillStyle = "#ffffff";
      const drawScannerIcon = (centerX, centerY) => {
        if (scanQrCodeIconImage) {
          context.drawImage(
            scanQrCodeIconImage,
            centerX - 24,
            centerY - 24,
            48,
            48,
          );
        }
      };

      const drawRadioIcon = (centerX, centerY) => {
        if (radioIconImage) {
          context.drawImage(radioIconImage, centerX - 24, centerY - 24, 48, 48);
        }
      };

      if (showNfc) {
        drawRadioIcon(width / 2 - 58, qrBottom + 165);
        drawScannerIcon(width / 2 + 58, qrBottom + 165);

        context.strokeStyle = "rgba(255, 255, 255, 0.78)";
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(width / 2, qrBottom + 139);
        context.lineTo(width / 2, qrBottom + 191);
        context.stroke();

        context.font = "600 19px system-ui, sans-serif";
        context.fillText(
          "Escanea o acerca tu movil NFC.",
          width / 2,
          qrBottom + 241,
        );
      } else {
        drawScannerIcon(width / 2, qrBottom + 165);
        context.font = "600 19px system-ui, sans-serif";
        context.fillText("Escanea el código QR", width / 2, qrBottom + 241);
      }

    };

    render();
    return () => {
      cancelled = true;
    };
  }, [
    url,
    title,
    brand,
    primaryColor,
    secondaryColor,
    showNfc,
    logoUrl,
    pieceType,
  ]);

  const downloadFlyer = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const exportScale = 3;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvas.width * exportScale;
    exportCanvas.height = canvas.height * exportScale;
    const exportContext = exportCanvas.getContext("2d");
    if (!exportContext) return;

    exportContext.imageSmoothingEnabled = true;
    exportContext.imageSmoothingQuality = "high";
    exportContext.drawImage(
      canvas,
      0,
      0,
      exportCanvas.width,
      exportCanvas.height,
    );

    exportCanvas.toBlob(
      (blob) => {
        if (!blob) return;
        const link = document.createElement("a");
        link.download = `afiche_${(brand.trim() || "pieza").toLowerCase().replace(/\s+/g, "_")}_${exportCanvas.width}x${exportCanvas.height}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      },
      "image/png",
      1,
    );
  };

  const applyPreset = (primary, secondary) => {
    setPrimaryColor(primary);
    setSecondaryColor(secondary);
  };

  const filteredBusinesses = businesses.filter((business) =>
    `${business.name || ""} ${business.slug || ""}`
      .toLowerCase()
      .includes(businessSearch.toLowerCase().trim()),
  );

  return (
    <div className="min-h-screen bg-neutral-950 px-4 py-5 text-white sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-black">
              <Megaphone className="text-violet-400" />
              Generador publicitario
            </h1>
          </div>
          <button
            type="button"
            onClick={downloadFlyer}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold hover:bg-violet-500"
          >
            <Download size={17} />
            Descargar PNG
          </button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <section className="h-fit rounded-xl border border-white/10 bg-neutral-900/60 p-4">
            <div className="mb-4">
              <h2 className="text-sm font-bold">Datos de la pieza</h2>
            </div>

            <div className="space-y-4">
              <div>
                <span className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                  Tipo de pieza
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => selectPieceType("general")}
                    className={`rounded-lg border px-3 py-2.5 text-xs font-bold transition-colors ${
                      pieceType === "general"
                        ? "border-violet-500 bg-violet-500/15 text-violet-300"
                        : "border-white/10 bg-neutral-950 text-neutral-400 hover:text-white"
                    }`}
                  >
                    General
                  </button>
                  <button
                    type="button"
                    onClick={() => selectPieceType("business")}
                    className={`rounded-lg border px-3 py-2.5 text-xs font-bold transition-colors ${
                      pieceType === "business"
                        ? "border-violet-500 bg-violet-500/15 text-violet-300"
                        : "border-white/10 bg-neutral-950 text-neutral-400 hover:text-white"
                    }`}
                  >
                    Negocio
                  </button>
                </div>
              </div>

              {pieceType === "business" && (
                <div className="block">
                  <span className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                    Seleccionar negocio
                  </span>
                  <div className="relative">
                    <input
                      value={businessSearch}
                      onChange={(event) => {
                        setBusinessSearch(event.target.value);
                        setIsBusinessListOpen(true);
                        if (businessId) {
                          setBusinessId("");
                          setLogoUrl("");
                        }
                      }}
                      onFocus={() => setIsBusinessListOpen(true)}
                      placeholder={
                        isLoadingBusinesses
                          ? "Cargando negocios..."
                          : "Escribe para buscar"
                      }
                      className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm outline-none focus:border-violet-500"
                    />
                    {isBusinessListOpen && !isLoadingBusinesses && (
                      <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-white/10 bg-neutral-950 p-1 shadow-2xl">
                        {filteredBusinesses.length ? (
                          filteredBusinesses.map((business) => (
                            <button
                              key={business.id}
                              type="button"
                              onClick={() => selectBusiness(business.id)}
                              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                                business.id === businessId
                                  ? "bg-violet-500/15 text-violet-300"
                                  : "text-neutral-200 hover:bg-white/5"
                              }`}
                            >
                              {business.logo_url && (
                                <img
                                  src={business.logo_url}
                                  alt=""
                                  className="h-6 w-6 rounded-full object-cover"
                                />
                              )}
                              <span className="truncate">{business.name}</span>
                            </button>
                          ))
                        ) : (
                          <p className="px-3 py-2 text-xs text-neutral-500">
                            No se encontraron negocios
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  Enlace
                </span>
                <input
                  value={url}
                  onChange={(event) =>
                    pieceType === "general" && setUrl(event.target.value)
                  }
                  readOnly={pieceType === "business"}
                  type="url"
                  className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm outline-none focus:border-violet-500 read-only:text-neutral-400"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  Frase principal
                </span>
                <textarea
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm outline-none focus:border-violet-500"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  Nombre
                </span>
                <input
                  value={brand}
                  onChange={(event) =>
                    pieceType === "general" && setBrand(event.target.value)
                  }
                  readOnly={pieceType === "business"}
                  type="text"
                  className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm outline-none focus:border-violet-500 read-only:text-neutral-400"
                />
              </label>

              <div className="flex items-center justify-between py-1">
                <span className="flex items-center gap-2 text-xs font-bold">
                  <Smartphone size={17} className="text-violet-400" />
                  Mostrar NFC / móvil
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showNfc}
                  onClick={() => setShowNfc((current) => !current)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${showNfc ? "bg-violet-600" : "bg-neutral-700"}`}
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${showNfc ? "left-6" : "left-1"}`}
                  />
                </button>
              </div>

              <div>
                <span className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                  <Palette size={14} />
                  Color del afiche
                </span>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    aria-label="Color principal"
                    value={primaryColor}
                    onChange={(event) => setPrimaryColor(event.target.value)}
                    className="h-10 w-10 cursor-pointer rounded-lg bg-transparent"
                  />
                  <input
                    type="color"
                    aria-label="Color secundario"
                    value={secondaryColor}
                    onChange={(event) => setSecondaryColor(event.target.value)}
                    className="h-10 w-10 cursor-pointer rounded-lg bg-transparent"
                  />
                  <div className="ml-auto flex gap-2">
                    {presets.map(([primary, secondary]) => (
                      <button
                        key={primary}
                        type="button"
                        onClick={() => applyPreset(primary, secondary)}
                        aria-label={`Usar paleta ${primary}`}
                        className="h-7 w-7 rounded-full border-2 border-white/20"
                        style={{
                          background: `linear-gradient(135deg, ${primary}, ${secondary})`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-col items-center rounded-xl border border-white/10 bg-neutral-900/40 p-3 sm:p-4">
            <div className="w-full max-w-[470px] overflow-hidden rounded-xl border border-white/10 bg-black p-2 shadow-2xl">
              <canvas
                ref={canvasRef}
                width={800}
                height={1000}
                className="h-auto w-full rounded-xl"
              />
            </div>
          </section>
        </div>
      </div>
      <div className="fixed left-[-9999px] top-0">
        <QRCodeCanvas
          ref={qrRef}
          value={url || "https://gloto.vercel.app"}
          size={310}
          level="H"
          includeMargin={false}
          imageSettings={undefined}
        />
      </div>
    </div>
  );
}
