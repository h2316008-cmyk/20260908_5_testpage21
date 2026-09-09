const CACHE_NAME = 'HoshiPita-cache-v5.01'; // ★ バージョンを更新してキャッシュをリフレッシュ

// キャッシュするファイルのリスト
const urlsToCache = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './css/style.css',
    './js/main.js',
    './js/lib/SkyModel.js',
    './js/lib/SkyView.js',
    './js/lib/SkyController.js',
    './js/lib/MouseInput.js',
    './js/lib/MicrobitInput.js',
    './js/lib/SharingManager.js',
    './js/lib/TimeSliderUI.js',
    './background_day.jpg',   // ★ 昼用背景画像に変更
    './background_night.jpg', // ★ 夜用背景画像に変更
    // 外部ライブラリのキャッシュ
    'https://unpkg.com/three@0.142.0/build/three.min.js',
    'https://unpkg.com/three@0.142.0/examples/js/controls/OrbitControls.js',
    'https://cdnjs.cloudflare.com/ajax/libs/suncalc/1.9.0/suncalc.min.js'
];

// インストール時にキャッシュを保存
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                // 1つのファイル取得失敗で全体が失敗するのを防ぐため個別取得処理を実行
                return Promise.all(
                    urlsToCache.map((url) => {
                        return cache.add(url).catch((err) => {
                            console.warn(`Failed to cache: ${url}`, err);
                        });
                    })
                );
            })
            .then(() => self.skipWaiting())
    );
});

// 古いキャッシュの削除と制御の即時移行
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.filter((cacheName) => {
                    return cacheName !== CACHE_NAME;
                }).map((cacheName) => {
                    return caches.delete(cacheName);
                })
            );
        }).then(() => self.clients.claim())
    );
});

// ネットワークリクエストのインターセプト（オフライン対応）
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // キャッシュがあればそれを返す
                if (response) {
                    return response;
                }

                // キャッシュがなければネットワークへ要求
                return fetch(event.request)
                    .then((networkResponse) => {
                        // 正常なレスポンス（同域・CORS対応外部リソース含む）であれば動的にキャッシュへ追加
                        if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // オフライン状態でページ遷移を行った場合は index.html を返す
                        if (event.request.mode === 'navigate') {
                            return caches.match('./index.html') || caches.match('./');
                        }
                    });
            })
    );
});