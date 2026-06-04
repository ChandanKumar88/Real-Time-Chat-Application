self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json?.() || {};
  } catch {
    data = {};
  }

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const hasFocusedQuickChat = windowClients.some((client) => client.focused);
      if (hasFocusedQuickChat) return;

      await self.registration.showNotification(data.title || "QuickChat", {
        body: data.body || "New message",
        icon: data.icon || "/favicon.svg",
        badge: data.badge || "/favicon.svg",
        tag: data.tag || "quickchat-message",
        renotify: true,
        data: {
          url: data.url || "/",
        },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const existingClient = windowClients.find((client) => client.url.startsWith(self.location.origin));
      if (existingClient) {
        await existingClient.focus();
        existingClient.postMessage({ type: "quickchat:notification-click", url: targetUrl });
        return;
      }

      await self.clients.openWindow(targetUrl);
    })()
  );
});
