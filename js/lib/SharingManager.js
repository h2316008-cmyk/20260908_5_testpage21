// 共有機構無効化のため全体をコメントアウト
/*
import { DBStorage } from './db.js';

export class SharingManager {
    constructor(model, onUpdate) {
        this.model = model;
        this.onUpdate = onUpdate;
        this.classCode = null;
        this.isSharing = false;
        this.apiBaseUrl = 'https://your-api-endpoint.com/api'; // ★外部APIのURLを指定
        this.pollInterval = null;
    }

    setClassCode(code) {
        this.classCode = code;
    }

    async startSharing() {
        if (!this.classCode) return;
        this.isSharing = true;
        await this.publish();
        await this.loadSharedData();

        // 10秒ごとに外部APIから最新の共有データを定期取得
        this.pollInterval = setInterval(() => this.loadSharedData(), 10000);
    }

    stopSharing() {
        this.isSharing = false;
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.model.sharedRecords = [];
        this.onUpdate();
    }

    // 自分のデータを外部APIへ送信
    async publish() {
        if (!this.isSharing || !this.classCode) return;

        const payload = {
            classCode: this.classCode,
            mode: this.model.observationMode,
            clientId: this.model.clientId,
            records: this.model.records
        };

        try {
            await fetch(`${this.apiBaseUrl}/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (err) {
            console.warn("API送信失敗（オフラインの可能性があります）:", err);
        }
    }

    // 外部APIから共有データを取得（オフライン時はIndexedDBキャッシュを利用）
    async loadSharedData() {
        if (!this.isSharing || !this.classCode) return;
        const cacheKey = `shared_${this.model.observationMode}_${this.classCode}`;

        try {
            const res = await fetch(`${this.apiBaseUrl}/share?classCode=${this.classCode}&mode=${this.model.observationMode}`);
            if (res.ok) {
                const sharedData = await res.json(); 
                
                // オフライン閲覧用にIndexedDBにキャッシュ保存
                await DBStorage.set('sharedCache', cacheKey, sharedData);
                this.processSharedRecords(sharedData);
                return;
            }
        } catch (err) {
            console.warn("API取得失敗。IndexedDBキャッシュを読み込みます:", err);
        }

        // オフライン時のキャッシュ取得
        const cachedData = await DBStorage.get('sharedCache', cacheKey);
        if (cachedData) {
            this.processSharedRecords(cachedData);
        }
    }

    processSharedRecords(sharedData) {
        let allRecords = [];
        for (let clientId in sharedData) {
            if (clientId !== this.model.clientId) {
                allRecords = allRecords.concat(sharedData[clientId].records || []);
            }
        }
        this.model.sharedRecords = allRecords;
        this.onUpdate();
    }
}
*/