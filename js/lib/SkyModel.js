// js/SkyModel.js
export class SkyModel {
    constructor() {
        this.isSensorMode = false;
        this.isMicrobitConnected = false;
        this.rot = { x: Math.PI / 2, y: 0 };
        this.lerpRot = { x: Math.PI / 2, y: 0 };
        
        this.sphereRadius = 1000;
        this.lerpFactor = 0.1; 

        this.points = []; 
        this.records = []; 

        this.moonImageData = null; // 古い全体設定との互換性のために残します

        // 修正: クライアントIDを維持し、過去の自分のデータが他人扱いになるのを防ぐ
        let savedClientId = localStorage.getItem('sky_client_id');
        if (!savedClientId) {
            savedClientId = Math.random().toString(36).substr(2, 9);
            localStorage.setItem('sky_client_id', savedClientId);
        }
        this.clientId = savedClientId;

        this.sharedRecords = [];
        this.isSharedMode = false;
        this.filterTimestamp = null;

        // 初期化時にオートセーブデータを読み込む
        this.loadAutoSave();
    }

    updateRotation(x, y) {
        if (x !== undefined && !isNaN(x)) this.rot.x = x;
        if (y !== undefined && !isNaN(y)) this.rot.y = y;
    }

    forceSetRotation(x, y) {
        if (x !== undefined && !isNaN(x)) {
            this.rot.x = x;
            this.lerpRot.x = x;
        }
        if (y !== undefined && !isNaN(y)) {
            this.rot.y = y;
            this.lerpRot.y = y;
        }
    }

    updateLerp() {
        this.lerpRot.x += (this.rot.x - this.lerpRot.x) * this.lerpFactor;
        
        let diffY = this.rot.y - this.lerpRot.y;
        if (diffY > Math.PI) diffY -= Math.PI * 2;
        if (diffY < -Math.PI) diffY += Math.PI * 2;
        this.lerpRot.y += diffY * this.lerpFactor;
    }

    addPoint(phi, theta) {
        this.points.push({ phi, theta });
        if (this.points.length > 300) {
            this.points.shift(); 
        }
    }
    
    addRecord(elevation, azimuth, phi, theta, name = "", moonImageData = null, observerName = "") {
        const now = new Date();
        const hours = now.getHours();
        const ampm = hours < 12 ? '午前' : '午後';
        const h12 = hours % 12;
        const newRecord = {
            name: name,
            observerName: observerName, 
            dateStr: `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`,
            timeStr: `${ampm}${h12}:${now.getMinutes().toString().padStart(2, '0')}`,
            elevation: elevation,
            azimuth: azimuth,
            phi: phi,
            theta: theta,
            moonImageData: moonImageData 
        };
        this.records.push(newRecord);
        // 記録追加時に自動保存
        this.saveAutoSave();
        return newRecord; 
    }

    deleteRecord(targetData) {
        let deleted = false;

        // 自分の records から削除
        const index = this.records.findIndex(r => 
            r.name === targetData.name &&
            r.dateStr === targetData.dateStr &&
            r.timeStr === targetData.timeStr &&
            r.elevation === targetData.elevation &&
            r.azimuth === targetData.azimuth
        );
        if (index !== -1) {
            this.records.splice(index, 1);
            this.saveAutoSave();
            deleted = true;
        }

        // ★修正: 共有データ領域 (localStorage) からも探して確実に削除する
        const sharedDataStr = localStorage.getItem('sky_shared_data');
        if (sharedDataStr) {
            try {
                let sharedData = JSON.parse(sharedDataStr);
                let sharedModified = false;
                for (let key in sharedData) {
                    let clientRecords = sharedData[key].records;
                    const sIndex = clientRecords.findIndex(r => 
                        r.name === targetData.name &&
                        r.dateStr === targetData.dateStr &&
                        r.timeStr === targetData.timeStr &&
                        r.elevation === targetData.elevation &&
                        r.azimuth === targetData.azimuth
                    );
                    if (sIndex !== -1) {
                        clientRecords.splice(sIndex, 1);
                        sharedModified = true;
                        deleted = true;
                    }
                    if (clientRecords.length === 0) {
                        delete sharedData[key];
                    }
                }
                if (sharedModified) {
                    localStorage.setItem('sky_shared_data', JSON.stringify(sharedData));
                }
            } catch (e) {
                console.error("共有データの削除中にエラーが発生しました:", e);
            }
        }

        // 現在の sharedRecords リストからも削除
        const sIdx = this.sharedRecords.findIndex(r => 
            r.name === targetData.name &&
            r.dateStr === targetData.dateStr &&
            r.timeStr === targetData.timeStr &&
            r.elevation === targetData.elevation &&
            r.azimuth === targetData.azimuth
        );
        if (sIdx !== -1) {
            this.sharedRecords.splice(sIdx, 1);
        }

        return deleted;
    }

    // 状態を自動保存する処理
    saveAutoSave() {
        const data = {
            records: this.records,
            moonImageData: this.moonImageData
        };
        localStorage.setItem('sky_autosave_data', JSON.stringify(data));
    }

    // 保存されている状態を復元する処理
    loadAutoSave() {
        const dataStr = localStorage.getItem('sky_autosave_data');
        if (dataStr) {
            try {
                const data = JSON.parse(dataStr);
                if (Array.isArray(data.records)) {
                    this.records = data.records;
                }
                if (data.moonImageData) {
                    this.moonImageData = data.moonImageData;
                }
            } catch(e) {
                console.error("オートセーブ復元エラー:", e);
            }
        }
    }

    // すべてのデータを消去してリセットする
    resetData() {
        this.records = [];
        this.sharedRecords = [];
        this.moonImageData = null;
        localStorage.removeItem('sky_autosave_data');
        localStorage.removeItem('sky_shared_data'); // ★修正: 全データ消去時に共有のゴミデータも消去
    }
}