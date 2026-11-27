const getStartUrl = (requestedStartUrl) => {
  if (
    typeof requestedStartUrl !== "string" ||
    !requestedStartUrl.startsWith("/") ||
    requestedStartUrl.startsWith("//") ||
    requestedStartUrl.includes("\\")
  ) {
    return "/";
  }

  return requestedStartUrl;
};

export default function manifestHandler(req, res) {
  const requestedStartUrl = req.query && req.query.start_url;
  const startUrl = getStartUrl(requestedStartUrl);
  const isCourierApp = startUrl.startsWith("/domiciliarios");

  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.status(200).json({
    id: isCourierApp ? "/domiciliarios" : "/",
    name: isCourierApp ? "Gloto Domiciliarios" : "Gloto",
    short_name: isCourierApp ? "Domicilios" : "Gloto",
    description: isCourierApp
      ? "Recibe y gestiona tus ofertas de entrega en Gloto."
      : "Plataforma comercial para ventas, pedidos, inventario, caja y operación.",
    start_url: isCourierApp ? "/domiciliarios" : startUrl,
    scope: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      isCourierApp
        ? {
            src: "/gloto-domiciliarios.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          }
        : {
            src: "/favicon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
    ],
  });
}
