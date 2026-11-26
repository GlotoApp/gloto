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

  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.status(200).json({
    id: "/",
    name: "Gloto",
    short_name: "Gloto",
    description:
      "Plataforma comercial para ventas, pedidos, inventario, caja y operación.",
    start_url: getStartUrl(requestedStartUrl),
    scope: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      {
        src: "/favicon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  });
}
