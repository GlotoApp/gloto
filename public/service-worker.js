self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    console.error("No se pudo interpretar el aviso push:", error);
  }

  const title = payload.title || "Nuevo pedido recibido";
  const options = {
    body: payload.body || "Tienes un pedido nuevo en Gloto.",
    icon: payload.icon || "/favicon.png",
    badge: payload.badge || "/favicon.png",
    tag: payload.tag || "gloto-order",
    data: {
      url: payload.url || "/pos/ordenes",
    },
  };

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const appIsFocused = clients.some(
          (client) =>
            client.visibilityState === "visible" && client.focused,
        );
        if (appIsFocused) return undefined;
        return self.registration.showNotification(title, options);
      }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl = event.notification.data?.url || "/pos/ordenes";
  const targetUrl = new URL(requestedUrl, self.location.origin);
  if (targetUrl.origin !== self.location.origin) {
    targetUrl.href = new URL("/pos/ordenes", self.location.origin).href;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      async (clients) => {
        const appWindow = clients.find(
          (client) => new URL(client.url).origin === self.location.origin,
        );
        if (appWindow) {
          await appWindow.navigate(targetUrl.href);
          await appWindow.focus();
          return;
        }
        await self.clients.openWindow(targetUrl.href);
      },
    ),
  );
});
