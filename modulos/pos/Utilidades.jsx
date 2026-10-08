import React, { useEffect, useRef, useState } from "react";
import {
  FileText,
  QrCode,
  Printer,
  Download,
  Copy,
  Menu,
  Users,
  Settings,
  AlertCircle,
  Square,
  Palette,
  Eye,
  Link,
  ChevronDown,
  LayoutTemplate,
  EyeOff,
  Loader,
  ShoppingBag,
} from "lucide-react";

import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "../../src/lib/supabaseClient";
import SubLoading from "./SubLoading";

const Utilidades = () => {
  const logo = "/logo.png";
  const [activeTab, setActiveTab] = useState("qr");
  const [qrMenu, setQrMenu] = useState("menu");
  const [copiedMenu, setCopiedMenu] = useState(false);
  const [copiedEmployees, setCopiedEmployees] = useState(false);
  const [qrLogoBlack, setQrLogoBlack] = useState("");
  const [qrLogoError, setQrLogoError] = useState("");
  const [qrLoading, setQrLoading] = useState(true);
  const [employeesQrLoading, setEmployeesQrLoading] = useState(true);
  const [storeSlug, setStoreSlug] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessLogo, setBusinessLogo] = useState("");
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState("");
  const [printMenuItems, setPrintMenuItems] = useState([]);
  const [printMenuCategories, setPrintMenuCategories] = useState([]);
  const [menuFormat, setMenuFormat] = useState("letter");
  const menuPreviewRef = useRef(null);
  const [storeLoading, setStoreLoading] = useState(true);
  const [storeError, setStoreError] = useState("");
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [qrTypeToDownload, setQrTypeToDownload] = useState(null);
  const [downloadOptions, setDownloadOptions] = useState({
    withBackground: true,
    backgroundColor: "#ffffff",
  });

  useEffect(() => {
    let cancelled = false;
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) {
        const error = new Error("No se pudo preparar el logo negro del QR.");
        console.error(error);
        if (!cancelled) setQrLogoError(error.message);
        return;
      }

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      context.drawImage(image, 0, 0);
      context.globalCompositeOperation = "source-in";
      context.fillStyle = "#000000";
      context.fillRect(0, 0, canvas.width, canvas.height);

      try {
        const blackLogo = canvas.toDataURL("image/png");
        if (!cancelled) setQrLogoBlack(blackLogo);
      } catch (error) {
        console.error("No se pudo generar el logo negro del QR:", error);
        if (!cancelled) {
          setQrLogoError("No se pudo preparar el logo negro del QR.");
        }
      }
    };

    image.onerror = () => {
      const error = new Error(`No se pudo cargar el logo ${logo}.`);
      console.error(error);
      if (!cancelled) setQrLogoError(error.message);
    };
    image.src = logo;

    return () => {
      cancelled = true;
    };
  }, []);

  // Productos que vienen desde API/Inventario (no editable)
  const [menuItems, setMenuItems] = useState([
    {
      id: 1,
      name: "Pepperoni Pizza",
      price: 12000,
      category: "Pizzas",
      visible: true,
      description: "Pizza clásica con pepperoni",
    },
    {
      id: 2,
      name: "Margherita Pizza",
      price: 10000,
      category: "Pizzas",
      visible: true,
      description: "Queso, tomate y albahaca",
    },
    {
      id: 3,
      name: "Cuatro Quesos",
      price: 13500,
      category: "Pizzas",
      visible: true,
      description: "Mozzarella, cheddar, parmesano y azul",
    },
    {
      id: 4,
      name: "Truffle Burger",
      price: 14000,
      category: "Hamburguesas",
      visible: true,
      description: "Carne con trufa",
    },
    {
      id: 5,
      name: "Clásica Burger",
      price: 9500,
      category: "Hamburguesas",
      visible: true,
      description: "Receta tradicional con cheddar",
    },
    {
      id: 6,
      name: "Ensalada Caesar",
      price: 8000,
      category: "Ensaladas",
      visible: true,
      description: "Con aderezo de la casa",
    },
    {
      id: 7,
      name: "Ensalada Griega",
      price: 9000,
      category: "Ensaladas",
      visible: true,
      description: "Tomate, pepino, feta y aceitunas",
    },
    {
      id: 8,
      name: "Pasta Carbonara",
      price: 11000,
      category: "Pastas",
      visible: true,
      description: "Receta italiana tradicional",
    },
    {
      id: 9,
      name: "Pasta Bolognesa",
      price: 10500,
      category: "Pastas",
      visible: true,
      description: "Con salsa de carne artesanal",
    },
    {
      id: 10,
      name: "Pasta Alfredo",
      price: 11500,
      category: "Pastas",
      visible: true,
      description: "Crema, queso y pimienta",
    },
    {
      id: 11,
      name: "Sopa de Tomate",
      price: 6500,
      category: "Sopas",
      visible: true,
      description: "Cremosa y reconfortante",
    },
    {
      id: 12,
      name: "Sopa Minestrone",
      price: 7000,
      category: "Sopas",
      visible: true,
      description: "Vegetales frescos y fideos",
    },
    {
      id: 13,
      name: "Alitas BBQ",
      price: 8500,
      category: "Entradas",
      visible: true,
      description: "Sazonadas y a la parrilla",
    },
    {
      id: 14,
      name: "Tabla de Quesos",
      price: 12000,
      category: "Entradas",
      visible: true,
      description: "Selección variada de quesos",
    },
    {
      id: 15,
      name: "Tabla de Embutidos",
      price: 11500,
      category: "Entradas",
      visible: true,
      description: "Jamones y carnes curadas",
    },
  ]);

  const qrUrls = {
    menu: storeSlug
      ? `${window.location.origin}/marketplace/tienda/${storeSlug}`
      : "",
    employees: `${window.location.origin}/marketplace/empleados/login`,
  };

  useEffect(() => {
    let cancelled = false;

    const loadStore = async () => {
      setStoreLoading(true);
      setStoreError("");
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError || !userData?.user?.id) {
        if (!cancelled) {
          setStoreError("No hay una sesión activa para identificar la tienda.");
          setMenuError("No se pudo identificar la tienda para cargar el menú.");
          setMenuLoading(false);
          setStoreLoading(false);
        }
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (profileError || !profile?.business_id) {
        if (!cancelled) {
          setStoreError("No se encontró el negocio de este usuario.");
          setMenuError("No se encontró el negocio para cargar el menú.");
          setMenuLoading(false);
          setStoreLoading(false);
        }
        return;
      }

      const [
        { data: business, error: businessError },
        { data: products, error: productsError },
        { data: categories, error: categoriesError },
      ] = await Promise.all([
        supabase
          .from("businesses")
          .select("slug, name, logo_url")
          .eq("id", profile.business_id)
          .maybeSingle(),
        supabase
          .from("products")
          .select(
            "id,name,description,price,image_url,is_active,is_sold_out,category_id,order_index,created_at,unit:units(name)",
          )
          .eq("business_id", profile.business_id)
          .eq("is_active", true)
          .order("order_index", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("categories_shop")
          .select("id,name,order_index,created_at")
          .eq("business_id", profile.business_id),
      ]);

      if (cancelled) return;
      if (business?.name) setBusinessName(business.name);
      if (business?.logo_url) setBusinessLogo(business.logo_url);
      if (businessError || !business?.slug) {
        setStoreError("La tienda no tiene un slug público configurado.");
      } else {
        setStoreSlug(business.slug);
        setBusinessName(business.name || "");
        setTableConfig((current) => ({
          ...current,
          restaurantName: business.name || current.restaurantName,
          qrUrl: `${window.location.origin}/marketplace/tienda/${business.slug}`,
        }));
      }
      if (productsError || categoriesError) {
        console.error(
          "No se pudo cargar el menú para impresión:",
          productsError || categoriesError,
        );
        setMenuError("No se pudieron cargar los productos del menú.");
      } else {
        const orderedCategories = [...(categories || [])].sort(
          (first, second) =>
            Number(first.order_index || 0) - Number(second.order_index || 0) ||
            String(first.created_at || "").localeCompare(
              String(second.created_at || ""),
            ),
        );
        const categoryNames = new Map(
          orderedCategories.map((category) => [category.id, category.name]),
        );
        setPrintMenuCategories(orderedCategories);
        setPrintMenuItems(
          (products || [])
          .filter((product) => !product.is_sold_out)
          .map((product) => ({
              ...product,
              category: categoryNames.get(product.category_id) || "Otros",
              unitName: product.unit?.name || "",
            })),
        );
      }
      setMenuLoading(false);
      setStoreLoading(false);
    };

    loadStore();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Estado habladores ──
  const [tableConfig, setTableConfig] = useState({
    startNumber: 1,
    endNumber: 10,
    restaurantName: "GLOTO", // Nombre del negocio establecido por defecto
    qrUrl: qrUrls.menu, // Ahora hereda directamente de la constante global del menú
    colorScheme: "dark", // dark | light | branded
    brandColor: "#7c3aed", // solo para "branded"
    showTableLabel: true,
    showQR: true,
    scanText: "Escaneame",
    layout: "tent", // tent | flat
  });

  // ── Estado para tema del menú ──
  const [menuTheme, setMenuTheme] = useState({
    scheme: "clean", // clean | minimal | bold | custom
    bgColor: "#ffffff",
    textColor: "#1a1a1a",
    accentColor: "#000000",
    categoryColor: "#666666",
  });

  // ── helpers ──
  const toggleMenuItemVisibility = (id) => {
    setMenuItems(
      menuItems.map((item) =>
        item.id === id ? { ...item, visible: !item.visible } : item,
      ),
    );
  };
  const getVisibleMenuItems = () => menuItems.filter((item) => item.visible);

  const generateMenuPages = () => {
    const visibleItems = getVisibleMenuItems();
    const ITEMS_PER_PAGE = 8;
    const pages = [];

    let currentPage = [];
    visibleItems.forEach((item, idx) => {
      currentPage.push(item);
      if (
        currentPage.length === ITEMS_PER_PAGE ||
        idx === visibleItems.length - 1
      ) {
        pages.push([...currentPage]);
        currentPage = [];
      }
    });

    return pages.length === 0 ? [[]] : pages;
  };

  const generateQRImage = () =>
    qrUrls[qrMenu]
      ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrUrls[qrMenu])}`
      : "";

  const handleCopyURL = () => {
    if (!qrUrls[qrMenu]) return;
    navigator.clipboard.writeText(qrUrls[qrMenu]);
    setCopiedMenu(true);
    setTimeout(() => setCopiedMenu(false), 2000);
  };

  const downloadQR = (type) => {
    if (!qrUrls[type]) return;
    setQrTypeToDownload(type);
    setDownloadOptions({
      withBackground: true,
      backgroundColor: "#ffffff",
    });
    setDownloadModalOpen(true);
  };

  const performDownload = () => {
    const url = qrUrls[qrTypeToDownload];
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&format=png&data=${encodeURIComponent(url)}`;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width = 400;
      canvas.height = 400;

      if (downloadOptions.withBackground) {
        ctx.fillStyle = downloadOptions.backgroundColor;
        ctx.fillRect(0, 0, 400, 400);
      } else {
        ctx.clearRect(0, 0, 400, 400);
      }

      ctx.drawImage(img, 0, 0, 400, 400);

      canvas.toBlob(
        (blob) => {
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = `qr-${qrTypeToDownload}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(link.href);

          setDownloadModalOpen(false);
        },
        "image/png",
        0.95,
      );
    };

    img.onerror = () => {
      alert("Error al generar el QR. Intenta de nuevo.");
      setDownloadModalOpen(false);
    };

    img.src = qrApiUrl;
  };

  const formatPrice = (price) =>
    price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  const escapeHTML = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character],
    );

  const menuPageSizes = {
    letter: "letter portrait",
    a4: "A4 portrait",
    half: "5.5in 8.5in",
  };
  const menuPreviewHtml = (() => {
    const categories = printMenuCategories
      .filter((category) =>
        printMenuItems.some((item) => item.category_id === category.id),
      )
      .map((category) => ({ id: category.id, name: category.name }));
    const uncategorizedItems = printMenuItems.filter(
      (item) =>
        !printMenuCategories.some(
          (category) => category.id === item.category_id,
        ),
    );
    if (uncategorizedItems.length) {
      categories.push({ id: null, name: "Otros" });
    }
    const menuHTML = categories
      .map(({ id, name }) => {
        const productCards = printMenuItems
          .filter((item) =>
            id === null
              ? !printMenuCategories.some(
                  (category) => category.id === item.category_id,
                )
              : item.category_id === id,
          )
          .map(
            (item) => `
              <article class="product ${item.image_url ? "has-image" : ""}">
                ${item.image_url ? `<img class="product-image" src="${escapeHTML(item.image_url)}" alt="">` : ""}
                <div class="product-copy">
                  <div class="product-heading">
                    <h3>${escapeHTML(item.name)}</h3>
                    <span class="price">$ ${formatPrice(Number(item.price) || 0)}${item.unitName ? `<small class="unit">${escapeHTML(item.unitName)}</small>` : ""}</span>
                  </div>
                  ${item.description ? `<p>${escapeHTML(item.description)}</p>` : ""}
                </div>
              </article>
            `,
          );
        return `<section class="category"><h2><img class="category-mark" src="${escapeHTML(logo)}" alt=""><span>${escapeHTML(name)}</span></h2><div class="products">${productCards.join("")}</div></section>`;
      })
      .join("");

    const logoHTML = businessLogo
      ? `<img class="brand-logo" src="${escapeHTML(businessLogo)}" alt="">`
      : `<div class="brand-mark">${escapeHTML((businessName || "M").slice(0, 1).toUpperCase())}</div>`;
    const pageSize = menuPageSizes[menuFormat] || menuPageSizes.letter;
    const pageDimensions =
      menuFormat === "a4"
        ? "794px"
        : menuFormat === "half"
          ? "528px"
          : "816px";
    const minimumHeight =
      menuFormat === "a4"
        ? "1123px"
        : menuFormat === "half"
          ? "816px"
          : "1056px";

    return `<!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Menú - ${escapeHTML(businessName || "Mi tienda")}</title>
          <style>
            @page { size: ${pageSize}; margin: 12mm; }
            * { box-sizing: border-box; font-family: Arial, Helvetica, sans-serif !important; }
            html { background: #e7e8ec; }
            body { width: ${pageDimensions}; min-height: ${minimumHeight}; margin: 24px auto; padding: 46px 48px; color: #f4f0f8; background: #111015; font: 13px/1.45 Arial, Helvetica, sans-serif; box-shadow: 0 12px 40px #10101866; }
            .masthead { display: flex; align-items: center; gap: 15px; }
            .brand-logo, .brand-mark { width: 58px; height: 58px; flex: 0 0 58px; border-radius: 16px; object-fit: contain; }
            .brand-mark { display: grid; place-items: center; color: white; background: #6d28d9; font: 800 28px Arial, Helvetica, sans-serif; }
            .brand-copy { flex: 1; }
            .eyebrow { margin: 0 0 4px; color: #b995f5; font-size: 9px; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; }
            h1 { margin: 0; color: #fff; font: 800 29px/1.05 Arial, Helvetica, sans-serif; letter-spacing: .025em; text-transform: uppercase; }
            .subtitle { margin: 6px 0 0; color: #76717d; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
            .brand-stamp { align-self: flex-start; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; margin-left: auto; }
            .brand-stamp img { display: block; width: 100%; height: 100%; object-fit: contain; }
            .menu-intro { margin: 18px 0 22px; padding: 11px 14px; border-left: 3px solid #8b5cf6; color: #5e5865; background: #f6f3fa; font: italic 12px Arial, Helvetica, sans-serif; }
            .category { margin: 18px 0 23px; break-inside: avoid; page-break-inside: avoid; }
            .category h2 { display: flex; align-items: center; gap: 10px; margin: 0 0 11px; color: #c8a8ff; font: 800 15px Arial, Helvetica, sans-serif; letter-spacing: .06em; text-transform: uppercase; break-after: avoid; page-break-after: avoid; }
            .category-mark { width: 16px; height: 16px; flex: 0 0 16px; object-fit: contain; }
            .category h2:after { height: 1px; flex: 1; content: ''; background: #43364f; }
            .products { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .product { display: flex; min-width: 0; gap: 10px; padding: 12px; border: 0; border-radius: 8px; background: #19171d; break-inside: avoid; }
            .product-image { width: 54px; height: 54px; flex: 0 0 54px; border-radius: 7px; object-fit: cover; background: #292431; }
            .product-copy { min-width: 0; flex: 1; }
            .product-heading { display: flex; justify-content: space-between; gap: 7px; align-items: baseline; }
            h3 { margin: 0; color: #f7f3fb; font-size: 11px; font-weight: 800; }
            .price { flex-shrink: 0; color: #c8a8ff; font-size: 10px; font-weight: 800; white-space: nowrap; }
            .unit { margin-left: 3px; font-size: 7px; font-weight: 600; opacity: .72; }
            .product p { margin: 5px 0 0; color: #b7b0c0; font-size: 9px; line-height: 1.35; }
            footer { display: flex; align-items: center; justify-content: center; gap: 7px; margin-top: 25px; padding-top: 12px; border-top: 1px solid #332b3b; color: #a39bab; font-size: 8px; letter-spacing: .1em; text-align: center; text-transform: uppercase; }
            footer strong { color: #c8a8ff; }
            @media screen and (max-width: 850px) {
              body { width: calc(100% - 24px); min-height: auto; margin: 12px auto; padding: 24px 18px; box-shadow: none; }
            }
            @media screen and (max-width: 620px) {
              .products { grid-template-columns: 1fr; }
            }
            @media print {
              html, body { width: auto; min-height: 0; margin: 0; box-shadow: none; background: #111015 !important; }
              body { padding: 7mm 8mm 10mm; }
              .masthead { margin-bottom: 8mm; }
              .category { margin: 0 0 23px; padding-top: 7mm; break-inside: avoid; page-break-inside: avoid; -webkit-column-break-inside: avoid; }
              .category:first-of-type { padding-top: 0; }
              .category h2 { break-after: avoid; page-break-after: avoid; }
              .products { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
              .product { display: flex; width: auto; margin: 0; break-inside: avoid; page-break-inside: avoid; -webkit-column-break-inside: avoid; }
              * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            }
          </style>
        </head>
        <body>
          <header class="masthead">
            ${logoHTML}
            <div class="brand-copy">
              <p class="eyebrow">MENU - CATALOGO</p>
              <h1>${escapeHTML(businessName || "Menú")}</h1>
            </div>
            <div class="brand-stamp">
              <img src="${escapeHTML(logo)}" alt="Gloto">
            </div>
          </header>
          ${menuHTML}
          <footer>
            <span>${escapeHTML(businessName || "Menú")} · <strong>Hecho con Gloto</strong></span>
          </footer>
        </body>
      </html>`;
  })();

  const printMenu = () => {
    const printWindow = menuPreviewRef.current?.contentWindow;
    if (!printWindow) {
      alert("No se pudo preparar la vista previa del menú.");
      return;
    }
    printWindow.focus();
    printWindow.print();
  };

  const totalMesas = Math.max(
    0,
    parseInt(tableConfig.endNumber) - parseInt(tableConfig.startNumber) + 1,
  );
  const mesaNumbers = Array.from(
    { length: totalMesas },
    (_, i) => parseInt(tableConfig.startNumber) + i,
  );

  const menuThemes = {
    clean: {
      bgColor: "#ffffff",
      textColor: "#1a1a1a",
      accentColor: "#000000",
      categoryColor: "#666666",
      borderColor: "#e5e5e5",
    },
    minimal: {
      bgColor: "#f9f9f9",
      textColor: "#2a2a2a",
      accentColor: "#555555",
      categoryColor: "#888888",
      borderColor: "#f0f0f0",
    },
    bold: {
      bgColor: "#000000",
      textColor: "#ffffff",
      accentColor: "#7c3aed",
      categoryColor: "#cccccc",
      borderColor: "#333333",
    },
    dark: {
      bgColor: "#1a1a1a",
      textColor: "#e5e5e5",
      accentColor: "#00d9ff",
      categoryColor: "#b0b0b0",
      borderColor: "#333333",
    },
  };

  const currentMenuTheme = menuThemes[menuTheme.scheme] || menuTheme;

  const colorPalettes = {
    dark: {
      front: "#000000",
      frontText: "#ffffff",
      back: "#ffffff",
      backText: "#000000",
      accent: "#000000",
    },
    light: {
      front: "#ffffff",
      frontText: "#000000",
      back: "#f5f5f5",
      backText: "#000000",
      accent: "#333333",
    },
    branded: {
      front: tableConfig.brandColor,
      frontText: "#ffffff",
      back: "#ffffff",
      backText: "#000000",
      accent: tableConfig.brandColor,
    },
  };
  const palette = colorPalettes[tableConfig.colorScheme];

  // ── Generador PDF de habladores ──
  const generateTableCardsPDF = () => {
    if (!storeSlug) return;
    const isTent = tableConfig.layout === "tent";

    // CORRECCIÓN: Definir la paleta aquí dentro para capturar el estado en tiempo real antes de imprimir
    const colorPalettesActualizada = {
      dark: {
        front: "#000000",
        frontText: "#ffffff",
        back: "#ffffff",
        backText: "#000000",
        accent: "#000000",
      },
      light: {
        front: "#ffffff",
        frontText: "#000000",
        back: "#f5f5f5",
        backText: "#000000",
        accent: "#333333",
      },
      branded: {
        front: tableConfig.brandColor, // Ahora sí toma el color seleccionado
        frontText: "#ffffff",
        back: "#ffffff",
        backText: "#000000",
        accent: tableConfig.brandColor,
      },
    };

    const pal = colorPalettesActualizada[tableConfig.colorScheme];

    const cardHTML = (tableNum) => `
        <div class="tent-card">
          <!-- CARA FRONTAL: NÚMERO -->
          <div class="side-number" style="background:${pal.front} !important; color:${pal.frontText} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
            ${tableConfig.showTableLabel ? `<span class="table-label" style="color:${pal.frontText}88;">MESA</span>` : ""}
            <span class="number" style="color:${pal.frontText};">${tableNum}</span>
            <span class="brand-name" style="color:${pal.frontText}66;">${tableConfig.restaurantName}</span>
          </div>

          ${isTent ? `<div class="fold-line"></div>` : ""}

          <!-- CARA TRASERA / REVERSO -->
          <div class="side-qr" style="background:${pal.back} !important; color:${pal.backText} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
            ${
              tableConfig.showQR
                ? `
            <div class="qr-wrapper" style="background:white; position:relative;">
              <img
                src="https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrUrls.menu + "?mesa=" + tableNum)}"
                style="width:100%;height:100%;display:block;"
                alt="QR Mesa ${tableNum}"
              />
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:22%;height:22%;display:grid;place-items:center;background:white;border-radius:3px;padding:2px;">
                <img
                  src="${window.location.origin}${logo}"
                  alt="Gloto"
                  style="width:100%;height:100%;object-fit:contain;filter:invert(1);"
                />
              </div>
            </div>
            <span class="qr-instruction" style="color:${pal.backText};">${tableConfig.scanText}</span>
            `
                : ""
            }
            <span class="mesa-badge" style="background:${pal.accent} !important; color:${pal.front === "#ffffff" ? "#fff" : pal.frontText} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;">MESA ${tableNum}</span>
          </div>
        </div>
      `;

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Habladores — ${tableConfig.restaurantName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,900;1,900&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Inter',sans-serif; background:#e5e5e5; }

    .instructions {
      text-align:center;
      padding:20px;
      font-size:11px;
      color:#666;
      font-weight:700;
      letter-spacing:2px;
      text-transform:uppercase;
    }

    .page {
      width:210mm;
      margin:0 auto 20px;
      padding:10mm;
      background:white;
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap:12mm;
      page-break-after: always;
      box-shadow:0 2px 20px rgba(0,0,0,0.1);
    }

    .tent-card {
      width:90mm;
      overflow:hidden;
      border-radius:3mm;
      page-break-inside:avoid;
      box-shadow: 0 1px 6px rgba(0,0,0,0.12);
    }

    /* FRENTE */
    .side-number {
      height:${isTent ? "90mm" : "120mm"};
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      position:relative;
      ${isTent ? "" : "border-bottom:1px solid rgba(0,0,0,0.08);"}
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .table-label {
      font-size:9px;
      text-transform:uppercase;
      letter-spacing:6px;
      font-weight:900;
      margin-bottom:6mm;
    }

    .number {
      font-size:100px;
      font-weight:900;
      line-height:1;
      font-style:italic;
    }

    .brand-name {
      position:absolute;
      bottom:8mm;
      font-size:10px;
      font-weight:900;
      letter-spacing:4px;
      text-transform:uppercase;
    }

    /* LÍNEA DE DOBLEZ */
    .fold-line {
      height:2px;
      border-top: 2px dashed #ccc;
      position:relative;
    }
    .fold-line::before {
      content:'✂ doblar aquí';
      position:absolute;
      top:-8px;
      left:50%;
      transform:translateX(-50%);
      font-size:7px;
      color:#bbb;
      background:white;
      padding:0 4px;
      letter-spacing:1px;
      white-space:nowrap;
    }

    /* REVERSO */
    .side-qr {
      height:${isTent ? "90mm" : "110mm"};
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:4mm;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .qr-wrapper {
      width:62mm;
      height:62mm;
      padding:3mm;
      border-radius:3mm;
      overflow:hidden;
      position:relative;
    }

    .qr-instruction {
      font-size:8px;
      text-transform:uppercase;
      letter-spacing:2px;
      font-weight:900;
    }

    .mesa-badge {
      font-size:8px;
      font-weight:900;
      text-transform:uppercase;
      letter-spacing:3px;
      padding:2mm 5mm;
      border-radius:10mm;
      color:white;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    @media print {
      body { background:white; }
      .instructions { display:none; }
      .page { box-shadow:none; margin:0; }
      .tent-card { box-shadow:none; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
  </style>
</head>
<body>
  <div class="instructions">
    Recortar por los bordes de cada tarjeta • Doblar por la línea punteada • ${tableConfig.restaurantName}
  </div>
  ${chunkArray(mesaNumbers, 4)
    .map(
      (page) => `
    <div class="page">
      ${page.map((n) => cardHTML(n)).join("")}
    </div>
  `,
    )
    .join("")}
  <script>
    window.onload = function() {
      const imgs = document.querySelectorAll('img');
      let loaded = 0;
      const total = imgs.length;
      if (total === 0) { window.print(); return; }
      imgs.forEach(img => {
        if (img.complete) {
          loaded++;
          if (loaded === total) window.print();
        } else {
          img.onload = img.onerror = () => {
            loaded++;
            if (loaded === total) window.print();
          };
        }
      });
    };
  </script>
</body>
</html>`;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("El navegador bloqueó la ventana emergente.");
      return;
    }
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Preview de un hablador de muestra
  const PreviewCard = ({ num }) => (
    <div className="w-32 rounded-xl overflow-hidden shadow-2xl border border-white/10 select-none">
      <div
        className="h-28 flex flex-col items-center justify-center relative"
        style={{ background: palette.front }}
      >
        {tableConfig.showTableLabel && (
          <span
            className="text-[7px] font-black uppercase tracking-[4px] mb-1"
            style={{ color: palette.frontText + "88" }}
          >
            MESA
          </span>
        )}
        <span
          className="text-5xl font-black italic leading-none"
          style={{ color: palette.frontText }}
        >
          {num}
        </span>
        <span
          className="absolute bottom-2 text-[6px] font-black uppercase tracking-widest"
          style={{ color: palette.frontText + "66" }}
        >
          {tableConfig.restaurantName}
        </span>
      </div>

      {tableConfig.layout === "tent" && (
        <div className="border-t-2 border-dashed border-white/20 bg-neutral-800 py-0.5 text-center">
          <span className="text-[5px] text-neutral-600 uppercase tracking-widest">
            doblar
          </span>
        </div>
      )}

      <div
        className="h-28 flex flex-col items-center justify-center gap-1.5"
        style={{ background: palette.back }}
      >
        {tableConfig.showQR && (
          <>
            <div className="w-16 h-16 overflow-hidden bg-white p-0.5 relative">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrls.menu + "?mesa=" + num)}`}
                alt={`QR Mesa ${num}`}
                className="w-full h-full object-contain"
              />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 rounded-sm bg-white p-0.5">
                <img
                  src={logo}
                  alt="Gloto logo"
                  className="h-full w-full object-contain invert"
                />
              </div>
            </div>
            <span
              className="text-[6px] font-black uppercase tracking-widest"
              style={{ color: palette.backText }}
            >
              {tableConfig.scanText}
            </span>
          </>
        )}
        <span
          className="text-[6px] font-black uppercase px-2 py-0.5 rounded-full"
          style={{ background: palette.accent, color: "#fff" }}
        >
          MESA {num}
        </span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-neutral-200 p-4 md:p-8 lg:p-12 font-sans">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 md:mb-12 gap-4 md:gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-black tracking-tighter">Utilidades</h1>
            {storeLoading && (
              <p className="text-[9px] text-neutral-500 uppercase font-bold">
                Cargando URL real de la tienda...
              </p>
            )}
            {storeError && (
              <p className="text-[9px] text-red-400 uppercase font-bold">
                {storeError}
              </p>
            )}
          </div>
        </header>

        {/* Tabs */}
        <div className="flex gap-2 md:gap-4 mb-8 md:mb-12 overflow-x-auto pb-2">
          {[
            { id: "qr", label: "Códigos QR", icon: QrCode },
            { id: "tables", label: "Habladores", icon: Square },
            { id: "menu", label: "Imprimir menú", icon: Printer },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 md:px-6 py-2.5 md:py-3 rounded-lg md:rounded-xl font-black uppercase text-[8px] md:text-[9px] whitespace-nowrap transition-all flex items-center gap-2 ${
                activeTab === id
                  ? "bg-violet-500 text-white"
                  : "bg-neutral-900/40 border border-white/5 text-neutral-400 hover:text-white"
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {storeLoading && (
          <SubLoading
            label="Cargando utilidades"
            className="py-24"
            dotClassName="bg-violet-400"
            fullHeight
          />
        )}
        {/* ─── QR Tab ─── */}
        {!storeLoading && activeTab === "qr" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* QR del Menú */}
            <div className="p-6 md:p-8 bg-neutral-900/40 border border-white/5 rounded-2xl">
              <h2 className="text-lg md:text-xl font-black uppercase mb-6 flex items-center gap-3">
                <QrCode className="text-violet-500" size={20} />
                QR de la Tienda
              </h2>
              <div className="space-y-6">
                {/* QR de la tienda real */}
                <div className="p-8 bg-white rounded-xl flex items-center justify-center min-h-[300px] relative overflow-hidden">
                  {qrLoading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/10 via-transparent to-transparent z-10">
                      <div className="flex flex-col items-center gap-4"></div>
                    </div>
                  )}

                  {/* AÑADIMOS 'p-4' PARA EL ESPACIO (PADDING) INTERNO */}
                  {storeSlug ? (
                    <div className="p-4 bg-white rounded-lg">
                      <QRCodeCanvas
                        value={qrUrls.menu}
                        size={200}
                        level="H"
                        imageSettings={
                          qrLogoBlack
                            ? {
                                src: qrLogoBlack,
                                height: 50,
                                width: 50,
                                excavate: true,
                              }
                            : undefined
                        }
                      />
                    </div>
                  ) : (
                    <p className="text-xs font-bold uppercase text-neutral-500">
                      Esperando la tienda real...
                    </p>
                  )}
                </div>
                {qrLogoError && (
                  <p role="alert" className="text-xs text-red-400">
                    {qrLogoError}
                  </p>
                )}

                <div className="space-y-3">
                  <p className="text-[8px] md:text-[9px] font-bold text-neutral-500 uppercase tracking-widest">
                    URL del QR
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={qrUrls.menu || ""}
                      readOnly
                      className="flex-1 bg-neutral-800/50 border border-white/5 rounded-lg px-3 py-2 text-xs text-neutral-400 select-all cursor-not-allowed focus:outline-none"
                    />
                    <button
                      onClick={handleCopyURL}
                      disabled={!storeSlug}
                      className={`px-4 py-2 rounded-lg font-black uppercase text-[8px] transition-all disabled:opacity-40 disabled:cursor-not-allowed ${copiedMenu ? "bg-green-500/20 text-green-400" : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300"}`}
                    >
                      {copiedMenu ? "✓ Copiado" : <Copy size={14} />}
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => downloadQR("menu")}
                  disabled={!storeSlug}
                  className="w-full py-3 bg-violet-500 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-black uppercase text-[9px] flex items-center justify-center gap-2 transition-all"
                >
                  <Download size={16} /> Descargar QR
                </button>
              </div>
            </div>

            {/* QR Empleados */}
            <div className="p-6 md:p-8 bg-neutral-900/40 border border-white/5 rounded-2xl">
              <h2 className="text-lg md:text-xl font-black uppercase mb-6 flex items-center gap-3">
                <Users className="text-green-500" size={20} />
                QR Empleados
              </h2>
              <div className="space-y-6">
                {/* QR del Menú */}
                <div className="p-8 bg-white rounded-xl flex items-center justify-center min-h-[300px] relative overflow-hidden">
                  {qrLoading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/10 via-transparent to-transparent z-10">
                      <div className="flex flex-col items-center gap-4"></div>
                    </div>
                  )}

                  {/* AÑADIMOS 'p-4' PARA EL ESPACIO (PADDING) INTERNO */}
                  <div className="p-4 bg-white rounded-lg">
                    <QRCodeCanvas
                      value={qrUrls.employees}
                      size={200} // Ajustamos un poco para dejar espacio al padding
                      level={"H"}
                      imageSettings={
                        qrLogoBlack
                          ? {
                              src: qrLogoBlack,
                              height: 50,
                              width: 50,
                              excavate: true,
                            }
                          : undefined
                      }
                    />
                  </div>
                </div>
                {qrLogoError && (
                  <p role="alert" className="text-xs text-red-400">
                    {qrLogoError}
                  </p>
                )}

                <div className="space-y-3">
                  <p className="text-[8px] md:text-[9px] font-bold text-neutral-500 uppercase tracking-widest">
                    URL de Acceso
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={qrUrls.employees}
                      readOnly
                      className="flex-1 bg-neutral-800/50 border border-white/5 rounded-lg px-3 py-2 text-xs text-neutral-400 select-all cursor-not-allowed focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(qrUrls.employees);
                        setCopiedEmployees(true);
                        setTimeout(() => setCopiedEmployees(false), 2000);
                      }}
                      className={`px-4 py-2 rounded-lg font-black uppercase text-[8px] transition-all ${copiedEmployees ? "bg-green-500/20 text-green-400" : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300"}`}
                    >
                      {copiedEmployees ? "✓ Copiado" : <Copy size={14} />}
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => downloadQR("employees")}
                  className="w-full py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-black uppercase text-[9px] flex items-center justify-center gap-2 transition-all"
                >
                  <Download size={16} /> Descargar QR
                </button>
              </div>
            </div>
          </div>
        )}

        {!storeLoading && activeTab === "menu" && (
          <section className="space-y-5">
            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-white/5 bg-neutral-900/40 p-5 sm:flex-row sm:items-center sm:p-7">
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-violet-500/10 p-3 text-violet-300">
                  <ShoppingBag size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black uppercase text-white">
                    Diseña e imprime tu menú
                  </h2>
                  <p className="mt-1 max-w-xl text-xs leading-5 text-neutral-400">
                    Vista previa en vivo con tus productos disponibles, precios,
                    descripciones e imágenes.
                  </p>
                </div>
              </div>
              <div className="shrink-0 rounded-xl border border-white/5 bg-black/20 px-4 py-3">
                <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400">
                  Productos incluidos
                </span>
                <span className="ml-3 text-sm font-black text-violet-300">
                  {printMenuItems.length}
                </span>
              </div>
            </div>
            {menuLoading ? (
              <p className="rounded-xl border border-white/5 bg-neutral-900/40 p-5 text-xs text-neutral-400">
                Cargando productos del menú...
              </p>
            ) : menuError ? (
              <p
                role="alert"
                className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-xs text-red-300"
              >
                {menuError}
              </p>
            ) : printMenuItems.length === 0 ? (
              <p className="rounded-xl border border-white/5 bg-neutral-900/40 p-5 text-xs text-neutral-400">
                No hay productos activos y disponibles para imprimir.
              </p>
            ) : (
              <>
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                  <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/60">
                    <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-neutral-300">
                          Vista previa
                        </p>
                        <p className="mt-1 text-[9px] text-neutral-500">
                          Así se verá al imprimir
                        </p>
                      </div>
                      <Eye size={16} className="text-violet-300" />
                    </div>
                    <iframe
                      ref={menuPreviewRef}
                      title="Vista previa del menú impreso"
                      srcDoc={menuPreviewHtml}
                      className="h-[680px] w-full border-0 bg-neutral-200 sm:h-[820px]"
                    />
                  </div>

                  <aside className="h-fit rounded-2xl border border-white/5 bg-neutral-900/60 p-5">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-violet-500/10 p-2 text-violet-300">
                        <LayoutTemplate size={16} />
                      </div>
                      <div>
                        <h3 className="text-xs font-black uppercase text-white">
                          Formato de impresión
                        </h3>
                        <p className="mt-1 text-[9px] text-neutral-500">
                          Elige el tamaño de papel
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      {[
                        { id: "letter", label: "Carta", detail: "8.5 × 11 pulgadas" },
                        { id: "a4", label: "A4", detail: "210 × 297 mm" },
                        { id: "half", label: "Media carta", detail: "5.5 × 8.5 pulgadas" },
                      ].map((format) => (
                        <button
                          key={format.id}
                          type="button"
                          onClick={() => setMenuFormat(format.id)}
                          aria-pressed={menuFormat === format.id}
                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition ${
                            menuFormat === format.id
                              ? "border-violet-400/50 bg-violet-500/10"
                              : "border-white/5 bg-black/20 hover:border-white/15"
                          }`}
                        >
                          <span>
                            <span className="block text-[10px] font-black text-white">
                              {format.label}
                            </span>
                            <span className="mt-1 block text-[9px] text-neutral-500">
                              {format.detail}
                            </span>
                          </span>
                          <span
                            className={`h-3 w-3 rounded-full border ${
                              menuFormat === format.id
                                ? "border-violet-300 bg-violet-400"
                                : "border-neutral-600"
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                    <p className="mt-4 rounded-lg bg-black/20 p-3 text-[9px] leading-4 text-neutral-500">
                      Confirma el tamaño seleccionado en las opciones de la
                      impresora para conservar la escala de la vista previa.
                    </p>
                    <button
                      type="button"
                      onClick={printMenu}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-violet-500"
                    >
                      <Printer size={15} />
                      Imprimir menú
                    </button>
                  </aside>
                </div>
              </>
            )}
          </section>
        )}

        {/* ─── HABLADORES DE MESA Tab ─── */}
        {!storeLoading && activeTab === "tables" && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* ── Panel de configuración ── */}
              <div className="p-6 md:p-8 bg-neutral-900/40 border border-white/5 rounded-2xl space-y-6">
                <h2 className="text-lg md:text-xl font-black uppercase flex items-center gap-3">
                  <Square className="text-violet-500" size={20} />
                  Edita tus Habladores
                </h2>

                {/* Rango de mesas */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500 mb-3">
                    Rango
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[8px] font-bold uppercase text-neutral-600 mb-1.5">
                        Desde
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={tableConfig.startNumber}
                        onChange={(e) =>
                          setTableConfig({
                            ...tableConfig,
                            startNumber: e.target.value,
                          })
                        }
                        className="w-full bg-neutral-800 border border-white/5 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] font-bold uppercase text-neutral-600 mb-1.5">
                        Hasta
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={tableConfig.endNumber}
                        onChange={(e) =>
                          setTableConfig({
                            ...tableConfig,
                            endNumber: e.target.value,
                          })
                        }
                        className="w-full bg-neutral-800 border border-white/5 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Configuración del Negocio (Inputs Protegidos) */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500 mb-3">
                    Información del Negocio
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[8px] font-bold uppercase text-neutral-500 mb-1.5">
                        Nombre del Negocio (Fijo)
                      </label>
                      <input
                        type="text"
                        value={tableConfig.restaurantName}
                        readOnly
                        disabled
                        className="w-full bg-neutral-800/40 border border-white/5 rounded-lg px-3 py-2 text-sm text-neutral-400 cursor-not-allowed opacity-80 focus:outline-none font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] font-bold uppercase text-neutral-500 mb-1.5 flex items-center gap-1">
                        <Link size={10} /> URL del QR (Bloqueada)
                      </label>
                      <input
                        type="text"
                        value={tableConfig.qrUrl}
                        readOnly
                        disabled
                        className="w-full bg-neutral-800/40 border border-white/5 rounded-lg px-3 py-2 text-sm text-neutral-400 cursor-not-allowed opacity-80 focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] font-bold uppercase text-neutral-600 mb-1.5">
                        Texto bajo el QR
                      </label>
                      <input
                        type="text"
                        value={tableConfig.scanText}
                        onChange={(e) =>
                          setTableConfig({
                            ...tableConfig,
                            scanText: e.target.value,
                          })
                        }
                        placeholder="Escaneame"
                        className="w-full bg-neutral-800 border border-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-violet-500 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Diseño */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500 mb-3 flex items-center gap-2">
                    <Palette size={12} /> Diseño
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[8px] font-bold uppercase text-neutral-600 mb-2">
                        Esquema de color
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          {
                            id: "dark",
                            label: "Oscuro",
                            bg: "bg-black",
                            text: "text-white",
                          },
                          {
                            id: "light",
                            label: "Claro",
                            bg: "bg-white",
                            text: "text-black",
                          },
                          {
                            id: "branded",
                            label: "Color marca",
                            bg: "",
                            text: "text-white",
                          },
                        ].map((scheme) => (
                          <button
                            key={scheme.id}
                            onClick={() =>
                              setTableConfig({
                                ...tableConfig,
                                colorScheme: scheme.id,
                              })
                            }
                            className={`py-2 px-3 rounded-lg text-[8px] font-black uppercase border transition-all ${
                              tableConfig.colorScheme === scheme.id
                                ? "border-violet-500 bg-violet-500/20 text-violet-300"
                                : "border-white/5 bg-neutral-800 text-neutral-400 hover:border-white/20"
                            }`}
                          >
                            {scheme.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {tableConfig.colorScheme === "branded" && (
                      <div className="flex items-center gap-3">
                        <label className="text-[8px] font-bold uppercase text-neutral-600">
                          Color
                        </label>
                        <input
                          type="color"
                          value={tableConfig.brandColor}
                          onChange={(e) =>
                            setTableConfig({
                              ...tableConfig,
                              brandColor: e.target.value,
                            })
                          }
                          className="w-10 h-8 rounded-lg border-0 cursor-pointer bg-transparent"
                        />
                        <span className="text-[9px] text-neutral-500 font-mono">
                          {tableConfig.brandColor}
                        </span>
                      </div>
                    )}

                    <div>
                      <label className="block text-[8px] font-bold uppercase text-neutral-600 mb-2">
                        Formato impresión
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() =>
                            setTableConfig({ ...tableConfig, layout: "tent" })
                          }
                          className={`py-2 px-3 rounded-lg text-[8px] font-black uppercase border transition-all flex flex-col items-center gap-1 ${tableConfig.layout === "tent" ? "border-violet-500 bg-violet-500/20 text-violet-300" : "border-white/5 bg-neutral-800 text-neutral-400"}`}
                        >
                          <LayoutTemplate size={14} />
                          Hablador (doblar)
                        </button>
                        <button
                          onClick={() =>
                            setTableConfig({ ...tableConfig, layout: "flat" })
                          }
                          className={`py-2 px-3 rounded-lg text-[8px] font-black uppercase border transition-all flex flex-col items-center gap-1 ${tableConfig.layout === "flat" ? "border-violet-500 bg-violet-500/20 text-violet-300" : "border-white/5 bg-neutral-800 text-neutral-400"}`}
                        >
                          <Square size={14} />
                          Tarjeta plana
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="text-[8px] font-bold uppercase text-neutral-500">
                        Mostrar etiqueta "MESA"
                      </label>
                      <button
                        onClick={() =>
                          setTableConfig({
                            ...tableConfig,
                            showTableLabel: !tableConfig.showTableLabel,
                          })
                        }
                        className={`w-9 h-5 rounded-full transition-all relative ${tableConfig.showTableLabel ? "bg-violet-500" : "bg-neutral-700"}`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${tableConfig.showTableLabel ? "left-4" : "left-0.5"}`}
                        />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[8px] font-bold uppercase text-neutral-500">
                        Incluir QR en el reverso
                      </label>
                      <button
                        onClick={() =>
                          setTableConfig({
                            ...tableConfig,
                            showQR: !tableConfig.showQR,
                          })
                        }
                        className={`w-9 h-5 rounded-full transition-all relative ${tableConfig.showQR ? "bg-violet-500" : "bg-neutral-700"}`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${tableConfig.showQR ? "left-4" : "left-0.5"}`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Vista previa ── */}
              <div className="p-6 md:p-8 bg-neutral-900/40 border border-white/5 rounded-2xl flex flex-col gap-6">
                <div>
                  <h3 className="text-sm font-black uppercase mb-1 flex items-center gap-2">
                    <Eye size={14} className="text-violet-400" />
                    Vista Previa
                  </h3>
                  <p className="text-[8px] text-neutral-600 uppercase font-bold">
                    Los QRs son reales y funcionan
                  </p>
                </div>

                <div className="flex gap-4 justify-center flex-wrap">
                  {mesaNumbers.slice(0, 2).map((n) => (
                    <PreviewCard key={n} num={n} />
                  ))}
                  {totalMesas > 2 && (
                    <div className="flex items-center justify-center w-32">
                      <span className="text-neutral-600 text-[9px] font-black uppercase">
                        +{totalMesas - 2} más
                      </span>
                    </div>
                  )}
                </div>

                <div className="bg-neutral-900/60 border border-white/5 rounded-xl p-4 space-y-2.5 mt-auto">
                  <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500">
                    Instrucciones de impresión
                  </p>
                  {[
                    {
                      n: "1",
                      txt: "Haz clic en Imprimir y selecciona tu impresora",
                    },
                    { n: "2", txt: "Imprime en papel bond o cartulina A4" },
                    {
                      n: "3",
                      txt: "Recorta cada hablador por la línea exterior",
                    },
                    {
                      n: "4",
                      txt: "Dobla por la línea punteada y apoya en la mesa",
                    },
                  ].map(({ n, txt }) => (
                    <div key={n} className="flex gap-3 items-start">
                      <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 text-[8px] font-black flex items-center justify-center shrink-0">
                        {n}
                      </span>
                      <span className="text-[9px] text-neutral-400">{txt}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={generateTableCardsPDF}
                  disabled={!storeSlug || totalMesas <= 0}
                  className="w-full py-3.5 bg-violet-500 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-black uppercase text-[9px] flex items-center justify-center gap-2 transition-all shadow-lg shadow-violet-500/20"
                >
                  <Printer size={16} />
                  Imprimir {totalMesas} Hablador{totalMesas !== 1 ? "es" : ""}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Descarga con Opciones */}
      {downloadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-8 max-w-md w-full animate-in fade-in zoom-in-95 duration-300 space-y-6">
            <h3 className="text-xl font-black uppercase text-violet-400">
              ¿Cómo descargar el QR?
            </h3>

            <div
              className="p-6 rounded-xl flex items-center justify-center min-h-[220px] border-2 border-dashed border-white/10"
              style={{
                backgroundColor: downloadOptions.withBackground
                  ? downloadOptions.backgroundColor
                  : "transparent",
                backgroundImage: !downloadOptions.withBackground
                  ? "repeating-conic-gradient(#222 0% 25%, #333 0% 50%) 50% / 20px 20px"
                  : "none",
              }}
            >
              <div className="relative w-48 h-48">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&format=png&data=${encodeURIComponent(qrUrls[qrTypeToDownload] || "")}`}
                  alt="QR Preview"
                  className="w-full h-full object-contain drop-shadow-lg"
                />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-sm bg-white p-0.5">
                  <img
                    src={logo}
                    alt="Gloto logo"
                    className="h-full w-full object-contain invert"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-3">
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                  Tipo de fondo
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() =>
                      setDownloadOptions({
                        ...downloadOptions,
                        withBackground: true,
                      })
                    }
                    className={`py-3 px-4 rounded-lg font-black uppercase text-[10px] transition-all ${
                      downloadOptions.withBackground
                        ? "bg-violet-500 text-white shadow-lg shadow-violet-500/50"
                        : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                    }`}
                  >
                    Con Fondo
                  </button>
                  <button
                    onClick={() =>
                      setDownloadOptions({
                        ...downloadOptions,
                        withBackground: false,
                      })
                    }
                    className={`py-3 px-4 rounded-lg font-black uppercase text-[10px] transition-all ${
                      !downloadOptions.withBackground
                        ? "bg-violet-500 text-white shadow-lg shadow-violet-500/50"
                        : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                    }`}
                  >
                    Sin Fondo
                  </button>
                </div>
              </div>

              {downloadOptions.withBackground && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                    Selecciona el color de fondo
                  </p>
                  <div className="flex items-center gap-4">
                    <input
                      type="color"
                      value={downloadOptions.backgroundColor}
                      onChange={(e) =>
                        setDownloadOptions({
                          ...downloadOptions,
                          backgroundColor: e.target.value,
                        })
                      }
                      className="w-20 h-20 rounded-lg cursor-pointer border-2 border-white/20 hover:border-white/40 transition-all flex-shrink-0"
                    />

                    <div className="flex-1 bg-neutral-800/50 px-4 py-4 rounded-lg flex flex-col justify-center">
                      <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-2">
                        nomenclatura de color
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-[12px] font-mono text-violet-400 font-black">
                          {downloadOptions.backgroundColor.toUpperCase()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/5">
                <button
                  onClick={() => setDownloadModalOpen(false)}
                  className="py-3 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg font-black uppercase text-[10px] transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={performDownload}
                  className="py-3 px-4 bg-violet-500 hover:bg-violet-600 text-white rounded-lg font-black uppercase text-[10px] transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-500/50"
                >
                  <Download size={14} /> Descargar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function chunkArray(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size)
    result.push(arr.slice(i, i + size));
  return result;
}

export default Utilidades;
