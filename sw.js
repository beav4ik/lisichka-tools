/*
  Service worker для набора инструментов пункта приёма.

  Стратегия намеренно простая: «сначала сеть, кэш — запасной вариант».
  Это значит, что сотрудник всегда видит свежую версию, если интернет есть,
  и продолжает работать со вчерашней копией, если связи нет. Обратная стратегия
  (сначала кэш) дала бы мгновенный запуск, но обновление доходило бы до пунктов
  с задержкой в один-два запуска, а это ровно та проблема, ради которой
  инструменты и переехали на общий адрес.

  Важная тонкость, из-за которой обновления сначала не доходили: GitHub Pages
  отдаёт файлы с заголовком Cache-Control: max-age=600, а обычный fetch внутри
  service worker берёт ответ из HTTP-кэша браузера. «Сначала сеть» превращалось
  в «сначала кэш на десять минут». Поэтому запрос за свежей версией делается
  с cache: 'reload' — он обязан сходить на сервер. Ответ из кэша остаётся
  запасным вариантом на случай, когда сети нет.

  При изменении списка файлов достаточно поднять CACHE_VERSION — старый кэш
  удалится при активации нового воркера.
*/

var CACHE_VERSION = 'tools-v4';

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
  // Здесь тоже мимо HTTP-кэша: иначе новый воркер положил бы себе
  // в кэш те же устаревшие файлы, ради обхода которых он и ставится.
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (cache) {
        return Promise.all(PRECACHE.map(function (url) {
          return fetch(new Request(url, { cache: 'reload', credentials: 'same-origin' }))
            .then(function (response) {
              if (response && response.ok) return cache.put(url, response);
            })
            .catch(function () { /* нет сети при установке — страница доживёт до следующего запуска */ });
        }));
      })
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

  // cache: 'reload' — мимо HTTP-кэша браузера, прямо на сервер.
  var fresh = new Request(request.url, {
    cache: 'reload',
    credentials: 'same-origin',
    redirect: 'follow'
  });

  event.respondWith(
    fetch(fresh)
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
