import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

export const formatKitchenOption = (option) => {
  const label =
    typeof option === "string"
      ? option
      : option && typeof option === "object"
        ? option.name ||
          option.nombre ||
          option.label ||
          option.option_name ||
          option.title ||
          option.text ||
          option.value ||
          "Opción"
        : "Opción";
  return label;
};

const KitchenComanda = ({ orden, labelData, logoUrl }) => {
  const formatPrice = (value) =>
    new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);

  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <title>Comanda {orden.id}</title>
        <style>{`
          * { box-sizing: border-box; }
          html, body { width: 100%; margin: 0; padding: 0; background: #fff; color: #111; }
          body { font-family: Arial, Helvetica, sans-serif; }
          .comanda { width: 100%; padding: 3mm 3.5mm; overflow-wrap: anywhere; }
          .business-logo { display: block; max-width: 72%; max-height: 18mm; width: auto; height: auto; object-fit: contain; margin: 0 auto 3mm; }
          .header { padding: 0 0 2.5mm; border-bottom: 1px dashed #333; text-align: center; }
          .order-type { display: inline-block; margin: 0; padding: 1.5mm 3mm; border: 1px solid #111; font-size: 12pt; line-height: 1.1; font-weight: 800; overflow-wrap: anywhere; }
          .order-id { margin: 1.5mm 0; font-size: 10pt; line-height: 1.1; font-weight: 700; overflow-wrap: anywhere; }
          .customer { margin: 2mm 0 0; font-size: 9pt; overflow-wrap: anywhere; }
          .notes-block { margin: 2mm 0; padding: 1.5mm; border: 1px solid #777; font-size: 8pt; line-height: 1.25; overflow-wrap: anywhere; }
          .notes-title { display: block; margin-bottom: 1mm; font-size: 7pt; font-weight: 800; letter-spacing: .5px; }
          .items { margin-top: 1.5mm; }
          .item { display: grid; grid-template-columns: 13mm minmax(0, 1fr); gap: 1.5mm; padding: 2mm 0; border-bottom: 1px dashed #999; break-inside: avoid; page-break-inside: avoid; }
          .quantity { align-self: start; text-align: center; font-size: 10pt; line-height: 1.2; font-weight: 700; overflow-wrap: anywhere; }
          .unit { display: block; margin-top: .75mm; font-size: 6pt; line-height: 1.1; font-weight: 700; text-transform: uppercase; overflow-wrap: normal; }
          .item-content { min-width: 0; }
          .product-line { font-size: 9pt; line-height: 1.2; overflow-wrap: anywhere; }
          .product-name { font-weight: 700; }
          .option, .instruction { margin-top: .75mm; font-size: 7.5pt; line-height: 1.2; overflow-wrap: anywhere; }
          .option { padding-left: 1mm; }
          .product-note { grid-column: 1 / -1; width: 100%; margin-top: .5mm; padding: 1mm 1.5mm; border-left: 1px solid #777; font-size: 7.5pt; line-height: 1.2; overflow-wrap: anywhere; }
          .product-note-label { font-weight: 700; }
          .item-price { font-size: 8pt; font-weight: 700; }
          .footer { margin-top: 2mm; padding-top: 1.5mm; border-top: 1px dashed #777; text-align: center; font-size: 6.5pt; font-weight: 700; letter-spacing: .25px; }
          .footer p { margin: 1mm 0; overflow-wrap: anywhere; }
        `}</style>
      </head>
      <body>
        <main className="comanda">
          {logoUrl && (
            <img
              className="business-logo"
              src={logoUrl}
              alt="Logo del negocio"
            />
          )}
          <div className="header">
            <p className="order-type">
              {labelData?.label || "Mesa"}
              {orden.tipoEntrega === "table" && orden.mesa !== "-"
                ? ` · ${orden.mesa}`
                : ""}
            </p>
            <div className="order-id">#{orden.id}</div>
            <p className="customer">
              <strong>Cliente:</strong> {orden.cliente}
            </p>
          </div>
          {orden.notasGenerales && (
            <div className="notes-block">
              <span className="notes-title">OBSERVACIONES</span>
              {orden.notasGenerales}
            </div>
          )}
          <section className="items">
            {orden.items.map((item, index) => {
              const subtotal =
                (Number(item.price) || 0) * (Number(item.qty) || 0);

              return (
                <article
                  className="item"
                  key={item.databaseId || `${item.name}-${index}`}
                >
                  <div className="quantity">
                    {item.qty}
                    <span className="unit">{item.unit || "UNIDAD"}</span>
                  </div>
                  <div className="item-content">
                    <div className="product-line">
                      <span className="product-name">{item.name}</span>
                      {" - "}
                      <span className="item-price">{formatPrice(subtotal)}</span>
                    </div>
                    {(item.opciones || []).map((option, optionIndex) => (
                      <div
                        className="option"
                        key={`${item.databaseId || index}-option-${optionIndex}`}
                      >
                        + {formatKitchenOption(option)}
                      </div>
                    ))}
                  </div>
                  {item.nota && (
                    <div className="product-note">
                      <span className="product-note-label">Nota: </span>
                      {item.nota}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
          <div className="footer">
            <p>HECHO CON SISTEMA GLOTO</p>
            <p>FIN DE LA COMANDA</p>
          </div>
        </main>
      </body>
    </html>
  );
};

export const printKitchenComanda = (orden, labelData, logoUrl) => {
  const iframe = document.createElement("iframe");
  Object.assign(iframe.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "58mm",
    height: "100vh",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(iframe);

  const iframeDocument = iframe.contentDocument;
  const printWindow = iframe.contentWindow;
  if (!iframeDocument || !printWindow) {
    iframe.remove();
    throw new Error("No se pudo preparar la comanda para imprimir.");
  }

  const removeIframe = () => iframe.remove();
  printWindow.addEventListener("afterprint", removeIframe, { once: true });
  iframe.onload = async () => {
    try {
      await Promise.all(
        Array.from(iframeDocument.images).map(async (image) => {
          if (image.complete) {
            if (image.naturalWidth === 0) {
              throw new Error("No se pudo cargar el logo del negocio.");
            }
            return;
          }
          await new Promise((resolve, reject) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener(
              "error",
              () => reject(new Error("No se pudo cargar el logo del negocio.")),
              { once: true },
            );
          });
        }),
      );
      await iframeDocument.fonts?.ready;
      await new Promise((resolve) =>
        printWindow.requestAnimationFrame(() =>
          printWindow.requestAnimationFrame(resolve),
        ),
      );
      const comanda = iframeDocument.querySelector(".comanda");
      if (!comanda) {
        throw new Error("No se encontró el contenido de la comanda.");
      }
      const pageSize = iframeDocument.createElement("style");
      pageSize.textContent = "@page { size: auto; margin: 0; }";
      iframeDocument.head.appendChild(pageSize);
      printWindow.focus();
      printWindow.print();
    } catch (error) {
      console.error("Error preparando la impresión de la comanda:", error);
      window.alert(error.message || "No se pudo preparar la comanda para imprimir.");
      removeIframe();
    }
  };

  iframeDocument.open();
  iframeDocument.write(`<!doctype html>${renderToStaticMarkup(
    <KitchenComanda orden={orden} labelData={labelData} logoUrl={logoUrl} />,
  )}`);
  iframeDocument.close();
};

export default KitchenComanda;
