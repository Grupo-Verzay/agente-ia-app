/**
 * El service worker: lo único que sigue vivo con la plataforma cerrada.
 *
 * Dos manejadores y nada más. `push` pinta el aviso que manda el servidor;
 * `notificationclick` lleva a donde toque. Todo lo demás —el sonido, el
 * contador, la campanita— necesita una pestaña abierta y vive en la App.
 */

self.addEventListener("push", (event) => {
  // Sin datos no se pinta nada: un aviso vacío con el título del navegador es
  // peor que no avisar. Y el `try` no sobra — un servicio de empuje puede
  // mandar una carga que no sea JSON y eso reventaría el manejador entero.
  let aviso = null;
  try {
    aviso = event.data ? event.data.json() : null;
  } catch (e) {
    aviso = null;
  }
  if (!aviso || !aviso.titulo) return;

  event.waitUntil(
    self.registration.showNotification(aviso.titulo, {
      body: aviso.texto || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // La MISMA etiqueta agrupa: cinco mensajes de la misma conversación son
      // una notificación, no cinco. Apiladas se aprenden a despachar sin leer,
      // que es el fallo del que viene todo esto.
      tag: aviso.etiqueta || "chat-equipo",
      renotify: true,
      data: { url: aviso.url || "/chat-equipo" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/chats";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      if (existing) {
        existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
