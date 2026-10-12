import React, { useRef } from "react";

const formatPrice = (price) =>
  Math.round(price)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const PosInvoice = ({ order, onClose }) => {
  const invoiceRef = useRef(null);

  const handlePrint = () => {
    if (!invoiceRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Factura ${order.orderNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1, h2, h3, h4, h5, h6 { margin: 0; }
            .invoice-header { text-align: center; margin-bottom: 24px; }
            .invoice-section { margin-bottom: 18px; }
            .invoice-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            .invoice-table th, .invoice-table td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            .invoice-table th { background: #f5f5f5; }
            .text-right { text-align: right; }
            .small { font-size: 12px; color: #555; }
          </style>
        </head>
        <body>
          ${invoiceRef.current.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  const metodoPagoTexto = () => {
    if (!order.paymentMethods || order.paymentMethods.length === 0)
      return "No especificado";
    const formatMethod = (method) =>
      ["variado", "por_definir"].includes(method)
        ? "Efectivo/Tarjeta/Trans"
        : method;
    if (order.paymentMethods.length === 1) {
      const pago = order.paymentMethods[0];
      return `${formatMethod(pago.metodo)}: $ ${formatPrice(pago.monto)}`;
    }
    return order.paymentMethods
      .map(
        (p) =>
          `${formatMethod(p.metodo)}: $ ${formatPrice(p.monto)}`,
      )
      .join(" | ");
  };

  return (
    <div className="fixed inset-0 bg-background bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="max-w-3xl w-full bg-surface border border-outline rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-outline bg-surface-hover">
          <div>
            <h2 className="text-lg font-bold text-on-surface">Factura</h2>
            <p className="text-xs text-on-surface-variant">
              Pedido enviado correctamente
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-xl bg-primary-container px-4 py-2 text-xs font-semibold uppercase text-on-primary transition-colors hover:bg-primary"
            >
              Imprimir
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-surface text-sm font-semibold px-4 py-2 text-on-surface transition-colors hover:bg-surface-hover"
            >
              Cerrar
            </button>
          </div>
        </div>

        <div className="p-6" ref={invoiceRef}>
          <div className="invoice-header">
            <h1 className="text-2xl font-black">Factura</h1>
            <p className="text-sm text-on-surface-variant">
              Pedido Nº {order.orderNumber}
            </p>
            <p className="text-sm text-on-surface-variant">
              Canal: {order.metadata?.canal || "POS"}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 mb-6">
            <div className="invoice-section">
              <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-2">
                Cliente
              </h3>
              <p className="text-sm text-on-surface">
                {order.customer_name || "Consumidor"}
              </p>
              <p className="text-sm text-on-surface">
                {order.customer_phone || "Sin teléfono"}
              </p>
              {order.metadata?.cliente?.direccion && (
                <p className="text-sm text-on-surface">
                  {order.metadata.cliente.direccion}
                </p>
              )}
            </div>
            <div className="invoice-section">
              <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-2">
                Detalle
              </h3>
              <p className="text-sm text-on-surface">
                Método de entrega:{" "}
                {order.metadata?.metodoEntrega || "No definido"}
              </p>
              <p className="text-sm text-on-surface">
                Pago: {metodoPagoTexto()}
              </p>
              <p className="text-sm text-on-surface">
                Estado: {order.status || "confirmado"}
              </p>
            </div>
          </div>

          <div className="invoice-section">
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cant.</th>
                  <th className="text-right">Precio</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, index) => (
                  <tr key={index}>
                    <td>
                      <div className="font-semibold">{item.nombre}</div>
                      {item.notas && (
                        <div className="text-xs text-on-surface-variant">
                          {item.notas}
                        </div>
                      )}
                      {item.opciones?.length > 0 && (
                        <div className="text-xs text-on-surface-variant">
                          {item.opciones.join(" · ")}
                        </div>
                      )}
                    </td>
                    <td>{item.cantidad}</td>
                    <td className="text-right">$ {formatPrice(item.precio)}</td>
                    <td className="text-right">
                      $ {formatPrice(item.precio * item.cantidad)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 border-t border-outline pt-4">
            <div className="flex justify-between text-sm text-on-surface-variant">
              <span>Subtotal</span>
              <span>$ {formatPrice(order.total || 0)}</span>
            </div>
            <div className="flex justify-between text-sm text-on-surface-variant mt-2">
              <span>Total</span>
              <span className="font-black text-on-surface">
                $ {formatPrice(order.total || 0)}
              </span>
            </div>
          </div>

          {order.notes && (
            <div className="mt-6">
              <h4 className="text-sm font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-2">
                Observaciones
              </h4>
              <p className="text-sm text-on-surface">{order.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PosInvoice;
