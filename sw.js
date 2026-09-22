/*
  Service worker для набора инструментов пункта приёма.

  Стратегия намеренно простая: «сначала сеть, кэш — запасной вариант».
  Это значит, что сотрудник всегда видит свежую версию, если интернет есть,
  и продолжает работать со вчерашней копией, если связи нет. Обратная стратегия
  (сначала кэш) дала бы мгновенный запуск, но обновление доходило бы до пунктов
  с задержкой в один-два запуска, а это ровно та проблема, ради которой
  инструменты и переехали на общий адрес.

  При изменении списка файлов достаточно поднять CACHE_VERSION — старый кэш
  удалится при активации нового воркера.
*/

var CACHE_VERSION = 'tools-v3';

var PRECACHE = [
  './',
  './index.html',
  './bonus-refund-calculator.html',
  './kak-dobavit-na-telefon.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (cache) { return cache.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(names.map(function (name) {
          return name === CACHE_VERSION ? null : caches.delete(name);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;

  // Вмешиваемся только в обычные GET-запросы внутри своей папки.
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;

  event.respondWith(
    fetch(request)
      .then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      })
      .catch(function () {
        return caches.match(request).then(function (cached) {
          if (cached) return cached;
          // навигация без сети и без кэша — отдаём стартовую страницу
          if (request.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
      })
  );
});
