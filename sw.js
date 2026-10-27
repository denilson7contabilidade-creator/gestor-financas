// Guarda os arquivos do app no celular para funcionar sem internet.
// Com internet, sempre busca a versão mais nova; sem internet (ou com rede lenta),
// usa a cópia guardada.
const VERSAO = "gf-v13";
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
  // cache: "reload" ignora cópias antigas guardadas pelo navegador
  e.waitUntil(
    caches.open(VERSAO)
      .then((c) => c.addAll(ARQUIVOS.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSAO).then(async (cache) => {
      const daRede = fetch(req, { cache: "no-cache" })
        .then((resp) => { if (resp.ok) cache.put(req, resp.clone()); return resp; })
        .catch(() => null);
      // espera a internet por até 3 segundos; depois disso usa a cópia guardada
      const limite = new Promise((ok) => setTimeout(() => ok(null), 3000));
      const resp = await Promise.race([daRede, limite]);
      if (resp) return resp;
      const guardado = await cache.match(req, { ignoreSearch: true });
      if (guardado) { e.waitUntil(daRede); return guardado; }
      return (await daRede) || (await cache.match("index.html")) || Response.error();
    })
  );
});
