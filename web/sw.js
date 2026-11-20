const PREFIX = 'qabchin-shell-';
const CACHE = PREFIX + '__BUILD__';
const FILES = __PRECACHE__;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  // An update waits until the user saves and explicitly accepts it.
});
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('message', event => { if (event.data === 'APPLY_UPDATE') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  // Never cache GitHub requests, credentials, API replies or project data.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === 'navigate') return (await cache.match('./index.html')) || fetch(event.request);
    return (await cache.match(event.request, { ignoreSearch: true })) || fetch(event.request);
  })());
});
