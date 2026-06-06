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
      const isIncomingCall = data.type === "incoming-call";
      const hasFocusedQuickChat = windowClients.some((client) => client.focused);
      if (hasFocusedQuickChat && !isIncomingCall) return;

      await self.registration.showNotification(data.title || "QuickChat", {
        body: data.body || "New message",
        icon: data.icon || "/favicon.svg",
        badge: data.badge || "/favicon.svg",
        tag: data.tag || "quickchat-message",
        requireInteraction: Boolean(data.requireInteraction || isIncomingCall),
        renotify: true,
        silent: false,
        vibrate: data.vibrate || (isIncomingCall ? [500, 180, 500, 180, 900] : [180, 80, 180]),
        actions: isIncomingCall
          ? [
              { action: "open-call", title: "Open QuickChat" },
              { action: "dismiss-call", title: "Dismiss" },
            ]
          : [],
        data: {
          type: data.type || "message",
          url: data.url || "/",
        },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss-call") return;

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
