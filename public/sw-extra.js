// Tocar numa notificação do app abre (ou traz para frente) o app.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
    const aberto = lista[0];
    return aberto ? aberto.focus() : self.clients.openWindow(self.registration.scope);
  }));
});
