/* خدمة العمل بلا شبكة وإشعارات الدفع. غيّر رقم النسخة عند أي تعديل في هذا الملف */
var V = 'stations-v8';
var SHELL = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
var CDN = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(V).then(function (c) {
    return c.addAll(SHELL).then(function () {
      /* المكتبات الخارجية: نحاول تخزينها، لكن لا ننتظر أكثر من 8 ثوانٍ حتى لا نؤخر التفعيل */
      var all = Promise.all(CDN.map(function (u) {
        return fetch(new Request(u, { mode: 'no-cors' })).then(function (r) { return c.put(u, r); }).catch(function () {});
      }));
      return Promise.race([all, new Promise(function (res) { setTimeout(res, 8000); })]);
    });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* صفحات الموقع: الشبكة أولاً، ومن الذاكرة إذا انقطعت أو تأخرت أكثر من 4 ثوانٍ */
function netFirst(req, url) {
  return caches.open(V).then(function (cache) {
    var key = new Request(url.origin + url.pathname);
    return cache.match(key).then(function (cached) {
      var net = fetch(req).then(function (r) {
        if (r && r.ok && r.type === 'basic') { cache.put(key, r.clone()); return r; }
        return cached || r;
      });
      if (!cached) return net;
      return Promise.race([net, new Promise(function (res) { setTimeout(function () { res(cached); }, 4000); })])
        .catch(function () { return cached; });
    });
  });
}

/* مكتبات وخطوط خارجية: من الذاكرة فوراً مع تحديثها في الخلفية */
function swr(req) {
  return caches.open(V).then(function (cache) {
    return cache.match(req).then(function (cached) {
      var net = fetch(req).then(function (r) { if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone()); return r; }).catch(function () { return cached; });
      return cached || net;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (/\.supabase\.co$/.test(url.hostname)) return;
  if (url.origin === self.location.origin) { e.respondWith(netFirst(req, url)); return; }
  if (/^(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname)) { e.respondWith(swr(req)); }
});

/* إشعارات الدفع */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'يومية المحطات', {
    body: d.body || '',
    tag: d.tag || undefined,
    dir: 'rtl',
    lang: 'ar',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf(self.registration.scope) === 0) {
        return c.focus().then(function (w) { return (w && 'navigate' in w) ? w.navigate(target) : w; });
      }
    }
    return self.clients.openWindow(target);
  }));
});
