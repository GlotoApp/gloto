import { getInvoiceHtml } from "./OrderInvoice";

const getInvoicePdfFileName = (order) =>
  `factura-${String(order.numeroFactura || "pedido").replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf`;

const downloadPdfBlob = (order, pdfBlob) => {
  const downloadUrl = URL.createObjectURL(pdfBlob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = getInvoicePdfFileName(order);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
};

const convertQrSvgToPng = async (svg, size = 512) => {
  const svgBlob = new Blob([new XMLSerializer().serializeToString(svg)], {
    type: "image/svg+xml;charset=utf-8",
  });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = new Image();
    image.src = svgUrl;
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("No se pudo preparar el código QR de la factura.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    context.drawImage(image, 0, 0, size, size);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
};

export const generateOrderInvoicePdf = async (order, business = {}) => {
  const iframe = document.createElement("iframe");
  iframe.title = `PDF de factura ${order.numeroFactura || ""}`;
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "80mm",
    height: "2400px",
    opacity: "0.01",
    pointerEvents: "none",
    zIndex: "-1",
    border: "0",
  });
  document.body.appendChild(iframe);

  try {
    const documentLoaded = new Promise((resolve, reject) => {
      iframe.addEventListener("load", resolve, { once: true });
      iframe.addEventListener(
        "error",
        () => reject(new Error("No se pudo preparar la factura para PDF.")),
        { once: true },
      );
    });
    iframe.srcdoc = getInvoiceHtml(order, business, { receipt: true });
    await documentLoaded;

    const invoiceDocument = iframe.contentDocument;
    const invoiceElement = invoiceDocument?.querySelector(".invoice");
    if (!invoiceDocument || !invoiceElement) {
      throw new Error("No se encontró el contenido de la factura para PDF.");
    }

    if (invoiceDocument.fonts?.ready) await invoiceDocument.fonts.ready;
    await Promise.all(
      Array.from(invoiceDocument.images).map(async (image) => {
        try {
          await image.decode();
        } catch (error) {
          console.warn(
            "No se pudo cargar una imagen de la factura PDF:",
            image.src,
            error,
          );
        }
      }),
    );

    const qrCode = invoiceElement.querySelector(".map-qr svg");
    if (qrCode) {
      const qrImage = invoiceDocument.createElement("img");
      qrImage.src = await convertQrSvgToPng(qrCode);
      qrImage.alt = "Código QR para abrir la ubicación del pedido";
      await qrImage.decode();
      Object.assign(qrImage.style, {
        display: "block",
        width: "40mm",
        height: "40mm",
        maxWidth: "100%",
        margin: "8px auto 0",
        objectFit: "contain",
      });
      qrCode.replaceWith(qrImage);
    }

    const sourceHeight = Math.max(
      invoiceElement.scrollHeight,
      invoiceElement.getBoundingClientRect().height,
    );
    iframe.style.height = `${sourceHeight + 64}px`;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const contentHeightPx = Math.max(
      invoiceElement.scrollHeight,
      invoiceElement.getBoundingClientRect().height,
    );
    const pageHeightMm = Math.ceil((contentHeightPx * 25.4) / 96 + 6);

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);
    const canvas = await html2canvas(invoiceElement, {
      scale: 3,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: Math.ceil((80 * 96) / 25.4),
      windowHeight: sourceHeight + 64,
      scrollX: 0,
      scrollY: 0,
    });
    const pdfContentHeightMm = (canvas.height * 74) / canvas.width;
    const pdfPageHeightMm = Math.max(
      pageHeightMm,
      Math.ceil(pdfContentHeightMm + 6),
    );
    const pdf = new jsPDF({
      unit: "mm",
      format: [80, pdfPageHeightMm],
      orientation: "portrait",
      compress: true,
    });
    pdf.addImage(
      canvas.toDataURL("image/jpeg", 0.98),
      "JPEG",
      3,
      3,
      74,
      pdfContentHeightMm,
      undefined,
      "FAST",
    );
    const pdfBlob = pdf.output("blob");

    if (!(pdfBlob instanceof Blob) || pdfBlob.size === 0) {
      throw new Error("La factura se generó vacía; no se pudo crear el PDF.");
    }
    return pdfBlob;
  } finally {
    iframe.remove();
  }
};

export const downloadOrderInvoicePdf = async (order, business = {}) => {
  const pdfBlob = await generateOrderInvoicePdf(order, business);
  downloadPdfBlob(order, pdfBlob);
};

export const shareOrderInvoicePdf = async (order, business = {}) => {
  const pdfBlob = await generateOrderInvoicePdf(order, business);
  const pdfFile = new File([pdfBlob], getInvoicePdfFileName(order), {
    type: "application/pdf",
  });

  if (
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [pdfFile] })
  ) {
    try {
      await navigator.share({
        title: `Factura ${order.numeroFactura || ""}`,
        files: [pdfFile],
      });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      if (error?.name !== "NotAllowedError") throw error;
    }
  }

  downloadPdfBlob(order, pdfBlob);
  return "downloaded";
};
