// sw.js — Lot & Gavel service worker
// 3d202f6574d6 is replaced by build.js at build time; bumping it invalidates old caches.

const VERSION = '3d202f6574d6';
const SHELL_CACHE = `lotgavel-shell-${VERSION}`;
const ART_CACHE   = `lotgavel-art-${VERSION}`;

// Small, always-needed files. Art is deliberately NOT here: 8 MB would make
// install slow and failure-prone on mobile data. It is prefetched after
// activation instead, and any miss falls through to cache-first fetch anyway.
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

const ART = [
  './art/mira.webp',  './art/mira_mock.webp',
  './art/kenji.webp', './art/kenji_mock.webp',
  './art/cleo.webp',  './art/cleo_mock.webp',
  './art/ran.webp',   './art/ran_mock.webp',
  './art/domu.webp',  './art/domu_mock.webp',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.endsWith(VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
    // Background art prefetch — best effort, never blocks activation.
    const art = await caches.open(ART_CACHE);
    for (const url of ART) {
      if (!(await art.match(url))) {
        try { await art.add(url); } catch (_) { /* retried on demand by fetch handler */ }
      }
    }
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Navigations: serve the cached shell so a cold offline start still works.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('./index.html', { cacheName: SHELL_CACHE }))
    );
    return;
  }

  const sameOrigin = new URL(req.url).origin === self.location.origin;
  const cacheName = /\.webp$/.test(req.url) ? ART_CACHE : SHELL_CACHE;

  // Cache-first for our own assets and for Google Fonts (so offline keeps the typeface).
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && (sameOrigin || /fonts\.(googleapis|gstatic)\.com/.test(req.url))) {
      const c = await caches.open(sameOrigin ? cacheName : SHELL_CACHE);
      c.put(req, res.clone());
    }
    return res;
  })());
});
