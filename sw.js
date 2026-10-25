// Keeps the app working with no signal. With signal, always fetch the newest files
// (so updates arrive straight away); without signal, use the copy saved on the phone.
var CACHE = "trip-planner-v5";
var FILES = ["./", "index.html", "app.js", "leaflet.js", "leaflet.css", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // cache: "reload" skips the browser's own short-term copy, so a new version never saves old files
    return Promise.all(FILES.map(function (f) {
      return fetch(new Request(f, { cache: "reload" })).then(function (res) {
        if (!res.ok) throw new Error(f + " " + res.status);
        return c.put(f, res);
      });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(function (c) {
    var fromNetwork = fetch(e.request, { cache: "no-cache" }).then(function (res) {
      if (res && res.ok) c.put(e.request, res.clone());
      return res;
    });
    // Wait up to 4 seconds for the network (weak signal), then fall back to the saved copy
    var timeout = new Promise(function (resolve) { setTimeout(resolve, 4000); });
    return Promise.race([fromNetwork.catch(function () { return null; }), timeout]).then(function (res) {
      if (res) return res;
      return c.match(e.request, { ignoreSearch: true }).then(function (hit) { return hit || fromNetwork; });
    });
  }));
});
