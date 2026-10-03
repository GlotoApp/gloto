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

const copyComputedStyles = (source, target) => {
  if (source.nodeType === Node.ELEMENT_NODE) {
    const computedStyle = source.ownerDocument.defaultView.getComputedStyle(source);
    for (const property of computedStyle) {
      target.style.setProperty(
        property,
        computedStyle.getPropertyValue(property),
        computedStyle.getPropertyPriority(property),
      );
    }
  }

  Array.from(source.children || []).forEach((sourceChild, index) => {
    const targetChild = target.children[index];
    if (targetChild) copyComputedStyles(sourceChild, targetChild);
  });
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

    const sourceHeight = Math.max(
      invoiceElement.scrollHeight,
      invoiceElement.getBoundingClientRect().height,
    );
    iframe.style.height = `${sourceHeight + 64}px`;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );

    const pdfContent = invoiceElement.cloneNode(true);
    copyComputedStyles(invoiceElement, pdfContent);
    Object.assign(pdfContent.style, {
      width: "74mm",
      height: "auto",
      minHeight: "0",
      maxHeight: "none",
      maxWidth: "none",
      marginLeft: "0",
      marginRight: "0",
      paddingBottom: "12mm",
      overflow: "visible",
    });
    const pdfContainer = document.createElement("div");
    Object.assign(pdfContainer.style, {
      position: "fixed",
      left: "-10000px",
      top: "0",
      width: "74mm",
      background: "#ffffff",
      zIndex: "-1",
      pointerEvents: "none",
    });
    pdfContainer.appendChild(pdfContent);
    document.body.appendChild(pdfContainer);
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const contentHeightPx = Math.max(
      pdfContent.scrollHeight,
      pdfContent.getBoundingClientRect().height,
    );
    const pageHeightMm = Math.ceil((contentHeightPx * 25.4) / 96 + 6);

    const { default: html2pdf } = await import("html2pdf.js");
    try {
      const pdfBlob = await html2pdf()
        .set({
          filename: getInvoicePdfFileName(order),
          margin: [3, 3, 3, 3],
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
            windowWidth: Math.ceil((80 * 96) / 25.4),
          },
          jsPDF: {
            unit: "mm",
            format: [80, pageHeightMm],
            orientation: "portrait",
          },
        })
        .from(pdfContent)
        .outputPdf("blob");

      if (!(pdfBlob instanceof Blob) || pdfBlob.size === 0) {
        throw new Error("La factura se generó vacía; no se pudo crear el PDF.");
      }
      return pdfBlob;
    } finally {
      pdfContainer.remove();
    }
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
