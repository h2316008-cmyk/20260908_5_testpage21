// js/SharingManager.js
export class SharingManager {
    constructor(model, onUpdate) {
        this.model = model;
        this.onUpdate = onUpdate;
        this.isSharing = false; // classCodeを削除[cite: 4]

        window.addEventListener('storage', (e) => {
            if (this.isSharing && e.key === 'sky_shared_data') { // 共通キーに変更[cite: 4]
                this.loadSharedData();
            }
        });
    }

    startSharing() {
        this.isSharing = true; // classCodeの判定を削除[cite: 4]
        this.publish();
        this.loadSharedData();
    }

    stopSharing() {
        this.isSharing = false;
        this.model.sharedRecords = [];
        this.onUpdate();
    }

    publish() {
        if (!this.isSharing) return; // classCodeの判定を削除[cite: 4]
        const myData = {
            clientId: this.model.clientId,
            records: this.model.records
        };
        let sharedData = this.getSharedData();
        sharedData[this.model.clientId] = myData;
        localStorage.setItem('sky_shared_data', JSON.stringify(sharedData)); // 共通キーに変更[cite: 4]
    }

    loadSharedData() {
        if (!this.isSharing) return; // classCodeの判定を削除[cite: 4]
        let sharedData = this.getSharedData();
        let allSharedRecords = [];
        for (let key in sharedData) {
            if (key !== this.model.clientId) {
                allSharedRecords = allSharedRecords.concat(sharedData[key].records);
            }
        }
        this.model.sharedRecords = allSharedRecords;
        this.onUpdate();
    }

    getSharedData() {
        const dataStr = localStorage.getItem('sky_shared_data'); // 共通キーに変更[cite: 4]
        return dataStr ? JSON.parse(dataStr) : {};
    }
}