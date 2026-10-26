// Guarda os arquivos do app no celular para funcionar sem internet.
const VERSAO = "gf-v1";
const ARQUIVOS = [
  "./",
  "index.html",
  "estilo.css",
  "app.js",
  "icones.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Abre na hora com a cópia guardada; se houver internet, busca a versão nova
// em segundo plano, que passa a valer na próxima vez que o app for aberto.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSAO).then(async (cache) => {
      const guardado = await cache.match(req, { ignoreSearch: true });
      const daRede = fetch(req)
        .then((resp) => {
          if (resp.ok) cache.put(req, resp.clone());
          return resp;
        })
        .catch(() => null);
      if (guardado) {
        e.waitUntil(daRede);
        return guardado;
      }
      return (await daRede) || (await cache.match("index.html")) || Response.error();
    })
  );
});
