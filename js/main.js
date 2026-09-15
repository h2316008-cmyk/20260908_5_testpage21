import { SkyModel } from './lib/SkyModel.js';
import { SkyView } from './lib/SkyView.js';
import { SkyController } from './lib/SkyController.js';

// --- PWA: Service Worker の登録と自動強制リロード ---
if ('serviceWorker' in navigator) {
    let refreshing = false;

    // 新しい Service Worker がアクティブ化してページを制御した瞬間にリロード
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            refreshing = true;
            window.location.reload();
        }
    });

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((registration) => {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
            // 起動時にサーバーへ最新の sw.js がないか更新チェックをかける
            registration.update();
        }, (err) => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}
// ----------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    const model = new SkyModel();
    const view = new SkyView('#main');
    const controller = new SkyController(model, view);
});

document.getElementById('menuBtn').addEventListener('click', () => {
    document.getElementById('actionMenu').classList.toggle('is-open');
});

// sw.js からバージョン文字列（例: v5.02）を自動抽出して表示
async function loadVersionInfo() {
    const versionEl = document.getElementById('app-version');
    if (!versionEl) return;

    try {
        const response = await fetch('./sw.js');
        const text = await response.text();
        // sw.js 内の "v5.02" 形式の文字パターンを検索
        const match = text.match(/v\d+\.\d+/);
        if (match) {
            versionEl.textContent = match[0];
        }
    } catch (err) {
        console.warn('バージョン情報の取得に失敗しました', err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadVersionInfo(); // バージョン表示を実行
    
    const model = new SkyModel();
    const view = new SkyView('#main');
    const controller = new SkyController(model, view);
});