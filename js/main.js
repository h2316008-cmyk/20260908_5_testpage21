import { SkyModel } from './lib/SkyModel.js';
import { SkyView } from './lib/SkyView.js';
import { SkyController } from './lib/SkyController.js';

// --- PWA: Service Worker の登録を追加 ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((registration) => {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
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