import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";

const formatMoney = (value) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatQuantity = (value) =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(
    Number(value) || 0,
  );

const formatPercent = (value) =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(
    Number(value) || 0,
  );

const getUnitName = (value) => {
  const name = String(value || "").trim();
  return name && name.toUpperCase() !== "UNIDAD" ? name : "";
};

const getOptionLabel = (option) => {
  if (typeof option === "string") return option;
  if (!option || typeof option !== "object") return "Opción";
  return (
    option.name ||
    option.nombre ||
    option.label ||
    option.option_name ||
    option.title ||
    option.text ||
    option.value ||
    "Opción"
  );
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const displayDeliveryMethod = (value) => {
  const normalized = String(value || "").toLowerCase();
  const labels = {
    pickup: "Recoger",
    recoger: "Recoger",
    delivery: "Domicilio",
    domicilio: "Domicilio",
    table: "Mesa",
    mesa: "Mesa",
    point: "Punto",
    punto: "Punto",
  };
  return labels[normalized] || value || "Sin definir";
};

const displayPaymentMethod = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  const labels = {
    cash: "Efectivo",
    efectivo: "Efectivo",
    card: "Tarjeta",
    tarjeta: "Tarjeta",
    credit_card: "Tarjeta",
    transfer: "Transferencia",
    transferencia: "Transferencia",
    bank_transfer: "Transferencia",
    split: "Dividido",
    dividir: "Dividido",
    dividido: "Dividido",
  };
  return labels[normalized] || value || "";
};

const getItemsSubtotal = (order) =>
  (order.items || []).reduce(
    (sum, item) =>
      sum +
      Number(
        item.subtotal ||
          Number(item.unit_price || 0) * Number(item.quantity || 0),
      ),
    0,
  );

export const getInvoiceHtml = (order, business = {}, { receipt = false } = {}) => {
  const items = (order.items || [])
    .map((item) => {
      const options = (item.options || [])
        .map(getOptionLabel)
        .filter(Boolean)
        .join(" · ");
      const unit = getUnitName(item.unit_name);
      const quantity = `${formatQuantity(item.quantity)}${unit ? ` ${unit}` : ""}`;
      const subtotal =
        Number(item.subtotal) ||
        Number(item.unit_price || 0) * Number(item.quantity || 0);
      return `<tr>
        <td><strong>${escapeHtml(item.product_name)}</strong>${options ? `<small>${escapeHtml(options)}</small>` : ""}${item.notes ? `<small>Nota: ${escapeHtml(item.notes)}</small>` : ""}</td>
        <td class="center">${escapeHtml(quantity)}</td>
        <td class="right">${formatMoney(item.unit_price)}</td>
        <td class="right">${formatMoney(subtotal)}</td>
      </tr>`;
    })
    .join("");
  const logoUrl = /^https?:\/\//i.test(String(business.logoUrl || ""))
    ? `<img class="logo" src="${escapeHtml(business.logoUrl)}" alt="${escapeHtml(business.name || "Logo de la tienda")}">`
    : "";
  const details = [
    order.deliveryAddress &&
      `<p><strong>Dirección:</strong> ${escapeHtml(order.deliveryAddress)}</p>`,
    order.deliveryInstructions &&
      `<p><strong>Referencia:</strong> ${escapeHtml(order.deliveryInstructions)}</p>`,
    order.mesa && `<p><strong>Mesa:</strong> ${escapeHtml(order.mesa)}</p>`,
    order.punto && `<p><strong>Punto:</strong> ${escapeHtml(order.punto)}</p>`,
  ]
    .filter(Boolean)
    .join("");
  const savedLocation = order.deliveryLocation || {};
  const latitude = Number(savedLocation.latitude);
  const longitude = Number(savedLocation.longitude);
  const hasValidCoordinates =
    savedLocation.latitude !== null &&
    savedLocation.latitude !== undefined &&
    savedLocation.longitude !== null &&
    savedLocation.longitude !== undefined &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180;
  const savedMapUrl = String(order.deliveryMapLink || "").trim();
  const mapUrl = /^https?:\/\//i.test(savedMapUrl)
    ? savedMapUrl
    : hasValidCoordinates
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`
      : "";
  const qrMarkup = mapUrl
    ? renderToStaticMarkup(
        <QRCodeSVG
          value={mapUrl}
          size={180}
          level="M"
          marginSize={2}
          bgColor="#ffffff"
          fgColor="#000000"
          title="Código QR para abrir la ubicación en Google Maps"
        />,
      )
    : "";
  const mapQr = qrMarkup
    ? `<section class="map-qr"><p><strong>¡ESCANEA PARA ABRIR LA UBICACIÓN!</strong></p>${qrMarkup}<a class="map-link" href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(mapUrl)}</a></section>`
    : "";
  const itemsSubtotal = getItemsSubtotal(order);
  const deliveryFee = Number(order.deliveryFee || 0);
  const tipAmount = Math.max(0, Number(order.tipAmount || 0));
  const tipPercent = Math.max(0, Number(order.tipPercent || 0));
  const totalWithTip = Number(order.total || 0);
  const totalWithoutTip = Math.max(0, totalWithTip - tipAmount);
  const paymentMethods = order.paymentMethods?.length
    ? order.paymentMethods
        .map((payment) =>
          displayPaymentMethod(payment.metodo || payment.method),
        )
        .filter(Boolean)
    : [displayPaymentMethod(order.metodoPago)].filter(Boolean);
  const paymentMethodMarkup = paymentMethods.length
    ? `<p class="payment-method"><strong>Método${paymentMethods.length > 1 ? "s" : ""} de pago:</strong> ${escapeHtml(paymentMethods.join(" + "))}</p>`
    : "";

  return `<!doctype html>
    <html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Factura ${escapeHtml(order.numeroFactura)}</title>
    <style>
      *{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#111;margin:0;padding:24px}
      .invoice{max-width:760px;margin:0 auto}.header{text-align:center;border-bottom:1px dashed #555;padding-bottom:16px}
      .logo{display:block;max-width:150px;max-height:90px;object-fit:contain;margin:0 auto 10px;filter:grayscale(1) contrast(1.15)}
      h1{font-size:20px;margin:8px 0 4px}.muted,small{color:#444}.muted{margin:3px 0}
      .columns{display:flex;flex-direction:column;gap:14px;padding:14px 0;border-bottom:1px dashed #555}
      h2{font-size:11px;text-transform:uppercase;margin:0 0 7px}p{margin:4px 0;line-height:1.4}
      table{width:100%;border-collapse:collapse;margin-top:12px;break-inside:auto}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th,td{padding:8px 5px;border-bottom:1px solid #bbb;text-align:left;vertical-align:top}
      th{border-top:1px solid #333;border-bottom:1px solid #333;text-transform:uppercase;font-size:10px}
      td small{display:block;margin-top:3px}.right{text-align:right}.center{text-align:center;white-space:nowrap}
      .totals{width:100%;margin:14px 0 0}.totals p{display:flex;justify-content:space-between}
      .totals .before-tip{font-size:14px;font-weight:bold}
      .grand{border-top:1px solid #111;padding-top:8px;font-size:16px;font-weight:bold}
      .payment-method{margin-top:8px;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;text-transform:uppercase}
      .notes{border-top:1px dashed #555;border-bottom:1px dashed #555;margin-top:16px;padding:12px 0}.footer{text-align:center;margin-top:22px;font-size:10px}
      .map-qr{text-align:center;margin:20px auto 0;break-inside:avoid}.map-qr svg{display:block;width:150px;height:150px;margin:8px auto 0}
      .map-link{display:block;margin:8px auto 0;max-width:100%;font-size:9px;color:#111;overflow-wrap:anywhere;word-break:break-word}
      .document-footer{text-align:center;margin-top:18px;padding-top:12px;border-top:1px dashed #555;break-inside:avoid}
      .non-fiscal{margin:0 0 6px;font-size:10px;font-weight:bold;text-transform:uppercase}
      .printed-by{margin:0;font-size:9px;font-weight:bold;text-transform:uppercase}
      .gloto-brand{display:flex;align-items:center;justify-content:center;gap:6px;margin:8px auto 0;color:#111;font-size:14px;font-weight:900;letter-spacing:1px}
      .gloto-logo{display:block!important;flex:0 0 28px;width:28px!important;height:28px!important;max-width:28px;object-fit:contain;margin:0;filter:grayscale(1) invert(1) contrast(1.4);print-color-adjust:exact;-webkit-print-color-adjust:exact}
      .footer{text-align:center;margin-top:10px;font-size:10px}
      ${receipt ? "body{padding:3mm}.invoice{width:100%;max-width:none;margin:0}table{table-layout:fixed}th,td{overflow-wrap:anywhere;word-break:break-word}.center{white-space:normal}.map-link{overflow-wrap:anywhere;word-break:break-all}.map-qr,.document-footer{break-inside:auto}" : ""}
      @media print{body{padding:0}.invoice{max-width:none}.logo{filter:grayscale(1) contrast(1.3);print-color-adjust:exact;-webkit-print-color-adjust:exact}a{color:#111;text-decoration:none}}
    </style></head><body><main class="invoice">
      <header class="header">${logoUrl}${business.name ? `<h1>${escapeHtml(business.name)}</h1>` : "<h1>Factura</h1>"}${business.address ? `<p class="muted">${escapeHtml(business.address)}</p>` : ""}${business.phone ? `<p class="muted">Tel. ${escapeHtml(business.phone)}</p>` : ""}
      <p><strong>Factura N.º ${escapeHtml(order.numeroFactura)}</strong></p><p class="muted">${escapeHtml(order.horaIngreso)} · ${escapeHtml(displayDeliveryMethod(order.metodoEntrega))}</p></header>
      <section class="columns"><div><p><strong>Cliente:</strong> ${escapeHtml(order.cliente || "Consumidor final")}</p><p><strong>Teléfono:</strong> ${escapeHtml(order.telefono || "No registrado")}</p></div>
      <div><p><strong>Entrega:</strong> ${escapeHtml(displayDeliveryMethod(order.metodoEntrega))}</p>${details}</div></section>
      <table><thead><tr><th>Producto</th><th class="center">Cantidad</th><th class="right">Precio</th><th class="right">Total</th></tr></thead><tbody>${items || '<tr><td colspan="4">Sin productos</td></tr>'}</tbody></table>
      <section class="totals"><p><span>Subtotal</span><strong>${formatMoney(itemsSubtotal)}</strong></p>${deliveryFee > 0 ? `<p><span>Domicilio</span><strong>${formatMoney(deliveryFee)}</strong></p>` : ""}<p class="before-tip"><span>Total sin propina</span><strong>${formatMoney(totalWithoutTip)}</strong></p><p><span>Propina ${formatPercent(tipPercent)}% (Opcional)</span><strong>${formatMoney(tipAmount)}</strong></p><p class="grand"><span>TOTAL A PAGAR</span><span>${formatMoney(totalWithTip)}</span></p>${paymentMethodMarkup}</section>
      ${order.observaciones ? `<section class="notes"><h2>Observaciones generales</h2><p>${escapeHtml(order.observaciones)}</p></section>` : ""}
      ${mapQr}<section class="document-footer"><p class="non-fiscal">Documento no fiscal — solo para uso interno</p><p class="printed-by">Impreso por el sistema Gloto</p><div class="gloto-brand"><img class="gloto-logo" src="/logogloto.png" alt=""><span>GLOTO</span></div></section><footer class="footer">¡Gracias por tu compra!</footer>
    </main></body></html>`;
};

export const printOrderInvoice = (order, business) => {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Permite las ventanas emergentes para imprimir la factura.");
    return;
  }

  let printStarted = false;
  const startPrint = async () => {
    if (printStarted || printWindow.closed) return;
    printStarted = true;

    await Promise.all(
      Array.from(printWindow.document.images).map(
        (image) =>
          new Promise((resolve) => {
            if (image.complete) {
              if (image.naturalWidth === 0) {
                console.warn("No se pudo cargar una imagen de la factura:", image.src);
              }
              resolve();
              return;
            }
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener(
              "error",
              () => {
                console.warn("No se pudo cargar una imagen de la factura:", image.src);
                resolve();
              },
              { once: true },
            );
          }),
      ),
    );

    if (printWindow.closed) return;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    printWindow.focus();
    printWindow.print();
  };

  printWindow.addEventListener("load", startPrint, { once: true });
  printWindow.document.write(getInvoiceHtml(order, business));
  printWindow.document.close();
  window.setTimeout(() => {
    if (printWindow.document.readyState === "complete") startPrint();
  }, 500);
};

const OrderInvoice = ({ order, business, onClose, onPrint }) => {
  if (!order) return null;
  const invoiceHtml = getInvoiceHtml(order, business);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="flex h-[92vh] max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-neutral-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-white">
              Factura
            </h2>
            <p className="mt-1 text-[10px] text-neutral-500">
              Orden {order.numeroFactura}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-xs font-bold text-neutral-400 hover:bg-white/10 hover:text-white"
          >
            Cerrar
          </button>
        </div>

        <iframe
          title={`Vista previa de factura ${order.numeroFactura}`}
          srcDoc={invoiceHtml}
          className="min-h-0 w-full flex-1 border-0 bg-white"
        />

        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-xs font-bold text-neutral-300 hover:bg-white/10"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => onPrint(order)}
            className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-black uppercase text-white hover:bg-violet-500"
          >
            Imprimir factura
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderInvoice;
