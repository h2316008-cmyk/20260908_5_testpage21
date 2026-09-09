// js/SkyController.js
/**
 * ============================================================================
 * 第三者ライブラリのライセンス表示 (Third-Party Library Licenses)
 * ============================================================================
 * * 本ソフトウェアは以下の外部ライブラリを使用しています。
 * * ----------------------------------------------------------------------------
 * 1. Three.js (The MIT License)
 * ----------------------------------------------------------------------------
 * Copyright © 2010-2023 three.js authors
 * * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 * * ----------------------------------------------------------------------------
 * 2. SunCalc (BSD 2-Clause License)
 * ----------------------------------------------------------------------------
 * Copyright (c) 2014, Vladimir Agafonkin
 * All rights reserved.
 * * Redistribution and use in source and binary forms, with or without modification, are
 * permitted provided that the following conditions are met:
 * * 1. Redistributions of source code must retain the above copyright notice, this list of
 * conditions and the following disclaimer.
 * * 2. Redistributions in binary form must reproduce the above copyright notice, this list
 * of conditions and the following disclaimer in the documentation and/or other materials
 * provided with the distribution.
 * * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 * COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
 * TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * ============================================================================
 */

import { MouseInput } from './MouseInput.js';
import { MicrobitInput } from './MicrobitInput.js';

// 共有機構無効化
// import { SharingManager } from './SharingManager.js';
import { TimeSliderUI } from './TimeSliderUI.js';
import { DBStorage } from './db.js';

const LATITUDE = 37.7608;
const LONGITUDE = 140.4748;

const CELESTIAL_BODIES = {
    'vega': { ra: 18 + (36 / 60) + (56.3 / 3600), dec: 38 + (47 / 60) + (1.3 / 3600), name: 'ベガ' },
    'deneb': { ra: 20 + (41 / 60) + (25.9 / 3600), dec: 45 + (16 / 60) + (49.2 / 3600), name: 'デネブ' },
    'altair': { ra: 19 + (50 / 60) + (47.0 / 3600), dec: 8 + (52 / 60) + (6.0 / 3600), name: 'アルタイル' },
    'antares': { ra: 16 + (29 / 60) + (24.5 / 3600), dec: -(26 + (25 / 60) + (55.2 / 3600)), name: 'アンタレス' },
    'polaris': { ra: 2 + (31 / 60) + (49.1 / 3600), dec: 89 + (15 / 60) + (50.8 / 3600), name: '北極星' }
};

function calculateHorizontalCoordinates(date, lat, lon, ra, dec) {
    const jd = (date.getTime() / 86400000.0) + 2440587.5;
    const d = jd - 2451545.0;
    let gmst = 18.697374558 + 24.06570982441908 * d;
    gmst = gmst % 24.0;
    if (gmst < 0) gmst += 24.0;
    let lst = gmst + (lon / 15.0);
    lst = lst % 24.0;
    if (lst < 0) lst += 24.0;
    let ha = lst - ra;
    if (ha < -12) ha += 24.0;
    if (ha > 12) ha -= 24.0;

    const PI = Math.PI;
    const latRad = lat * PI / 180.0;
    const decRad = dec * PI / 180.0;
    const haRad = ha * 15.0 * PI / 180.0;

    const sinAlt = Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);
    let altRad = Math.asin(sinAlt);
    let alt = altRad * 180.0 / PI;

    if (alt > -0.5) {
        const rArcMin = 1.02 / Math.tan((alt + 10.3 / (alt + 5.11)) * PI / 180.0);
        alt += rArcMin / 60.0;
    }

    const y = -Math.sin(haRad) * Math.cos(decRad);
    const x = Math.cos(latRad) * Math.sin(decRad) - Math.sin(latRad) * Math.cos(decRad) * Math.cos(haRad);
    let azRad = Math.atan2(y, x);
    let az = azRad * 180.0 / PI;
    if (az < 0) az += 360.0;

    return { azimuth: az, altitude: alt };
}

export class SkyController {
    constructor(model, view) {
        this.model = model;
        this.view = view;
        this.currentSelectedRecord = null;
        this.currentRecordToDraw = null;
        this.wakeLock = null;

        this.loadSunCalc();

        // 共有機構無効化
        // this.sharingManager = new SharingManager(this.model, () => this.updateViewRecords());
        this.timeSliderUI = new TimeSliderUI((ts) => {
            this.model.filterTimestamp = ts;
            this.updateViewRecords();
        });

        this.timeSliderUI.show(this.model.records);

        this.mouseInput = new MouseInput(this.view, null, (data, x, y) => {
            const tooltip = document.getElementById('tooltip');
            if (data) {
                this.currentSelectedRecord = data; 
                let normalizedAzi = (data.azimuth + 360) % 360;
                let index = Math.round(normalizedAzi / 45) % 8;
                const kanji = this.view.directions[index] ? this.view.directions[index].n : ""; 
                
                const dateDisplay = data.dateStr ? `${data.dateStr} ` : ""; 
                const nameDisplay = data.name ? `<strong>天体名:</strong> ${data.name}<br>` : "";
                
                // 共有機能無効化に伴い観察者名の表示をオフ
                const observerDisplay = "";

                tooltip.innerHTML = `${nameDisplay}${observerDisplay}<strong>日時:</strong> ${dateDisplay}${data.timeStr}<br>
                                     <strong>高度:</strong> ${data.elevation.toFixed(1)}°<br>
                                     <strong>方位:</strong> ${kanji} ${normalizedAzi.toFixed(1)}°<br>
                                     <button id="delete-record-btn">記ろくを消す</button>`;
                tooltip.style.left = x + 'px'; tooltip.style.top = y + 'px';
                tooltip.style.display = 'block';
            } else {
                tooltip.style.display = 'none';
                this.currentSelectedRecord = null;
            }
        });
        
        this.microbitInput = new MicrobitInput(
            this.model, 
            async () => { 
                await this.executeRecord();
            },
            (data) => { this.processProcessedData(data); },
            (msg) => { if (this.view?.showStatusMessage) this.view.showStatusMessage(msg, 2500); }
        );

        this.initUIHandlers();
        this.initMoonCanvasEvents();

        if (this.model.records.length > 0) {
            this.updateViewRecords();
        }
        
        const savedView = localStorage.getItem('sky_camera_view');
        if (savedView) {
            try {
                const { phi, theta } = JSON.parse(savedView);
                this.model.forceSetRotation(phi, theta);
                
                const radius = 0.1;
                this.view.camera.position.set(
                    -radius * Math.sin(phi) * Math.cos(theta),
                    1.6 - radius * Math.cos(phi),
                    -radius * Math.sin(phi) * Math.sin(theta)
                );
                this.view.controls.update();
            } catch (e) {
                console.error("視点の復元に失敗しました:", e);
            }
        }

        const saveCameraView = () => {
            const dir = new THREE.Vector3();
            this.view.camera.getWorldDirection(dir);
            const phi = Math.acos(Math.max(-1, Math.min(1, dir.y)));
            const theta = Math.atan2(dir.z, dir.x);
            localStorage.setItem('sky_camera_view', JSON.stringify({ phi, theta }));
        };
        window.addEventListener('beforeunload', saveCameraView);
        window.addEventListener('pagehide', saveCameraView);

        this.startLoop();
    }

    async executeRecord() {
        const dir = new THREE.Vector3();
        this.view.camera.getWorldDirection(dir);
        const phi = Math.acos(Math.max(-1, Math.min(1, dir.y)));
        const theta = Math.atan2(dir.z, dir.x);
        const ele = 90 - (phi * 180 / Math.PI);
        let azi = (theta * 180 / Math.PI) + 90;
        if (azi < 0) azi += 360;

        const recordType = await this.promptRecordType();
        if (!recordType) return; 

        let objectName = "";
        if (recordType === 'sun') {
            objectName = "太陽";
        } else if (recordType === 'moon') {
            objectName = "月";
        } else if (recordType === 'other') {
            objectName = await this.customPrompt("星の名前をかきましょう。", "");
            if (!objectName) return; 
        }

        const observerName = this.model.observerName || "";

        // 記録を追加し、描画対象として保持
        const newRecord = this.model.addRecord(ele, azi, phi, theta, objectName, null, observerName);
        this.currentRecordToDraw = newRecord;

        const allRecords = this.model.records;
        this.timeSliderUI.show(allRecords);

        this.updateViewRecords();

        if (this.view?.showStatusMessage) {
            this.view.showStatusMessage("天体を記ろくしました。", 2000);
        }

        if (recordType === 'moon') {
            this.openMoonDrawModal();
        }
    }

    updateRecordBtnVisibility() {
        const recordBtn = document.getElementById('recordBtn');
        if (recordBtn) {
            recordBtn.style.display = this.model.isSensorMode ? 'none' : 'inline-block';
        }
    }

    updateViewRecords() {
        const allRecords = this.model.records;
        this.view.drawRecords(allRecords, this.model.isSharedMode, this.model.filterTimestamp);
    }

    loadSunCalc() {
        if (!window.SunCalc) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/suncalc/1.9.0/suncalc.min.js';
            document.head.appendChild(script);
        }
    }
    
    promptRecordType() {
        return new Promise((resolve) => {
            const modal = document.getElementById('record-type-modal');
            const sunBtn = document.getElementById('btn-record-sun');
            const moonBtn = document.getElementById('btn-record-moon');
            const otherBtn = document.getElementById('btn-record-other');
            const backBtn = document.getElementById('btn-record-back');

            modal.style.display = 'flex';

            const cleanup = () => {
                modal.style.display = 'none';
                sunBtn.removeEventListener('click', onSun);
                moonBtn.removeEventListener('click', onMoon);
                otherBtn.removeEventListener('click', onOther);
                if (backBtn) backBtn.removeEventListener('click', onBack); 
            };

            const onSun = () => { cleanup(); resolve('sun'); };
            const onMoon = () => { cleanup(); resolve('moon'); };
            const onOther = () => { cleanup(); resolve('other'); };
            const onBack = () => { cleanup(); resolve(null); }; 

            sunBtn.addEventListener('click', onSun);
            moonBtn.addEventListener('click', onMoon);
            otherBtn.addEventListener('click', onOther);
            if (backBtn) backBtn.addEventListener('click', onBack); 
        });
    }

    async customPrompt(message, defaultValue) {
        return new Promise((resolve) => {
            const modal = document.getElementById('prompt-modal');
            const msgEl = document.getElementById('prompt-msg');
            const input = document.getElementById('prompt-input');
            const okBtn = document.getElementById('prompt-ok');
            const cancelBtn = document.getElementById('prompt-cancel');

            msgEl.innerText = message;
            input.value = defaultValue;
            modal.style.display = 'flex';
            
            setTimeout(() => {
                input.focus();
                input.select(); 
            }, 50);

            const cleanup = () => {
                modal.style.display = 'none';
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                input.removeEventListener('keydown', onKey);
            };

            const onOk = () => {
                cleanup();
                resolve(input.value.trim());
            };

            const onCancel = () => {
                cleanup();
                resolve(null);
            };

            const onKey = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault(); 
                    onOk();
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    onCancel();
                }
            };

            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            input.addEventListener('keydown', onKey);
        });
    }

    isModalOpen() {
        const modalIds = ['record-type-modal', 'prompt-modal', 'moon-draw-modal', 'modal-overlay', 'load-modal'];
        return modalIds.some(id => {
            const el = document.getElementById(id);
            return el && window.getComputedStyle(el).display !== 'none';
        });
    }

    processProcessedData(data) {
        if (!data) return;
        if (this.isModalOpen()) return;
        const { heading, elevation } = data; 
        if (this.model.isSensorMode) {
            this.model.updateRotation((90 - elevation) * Math.PI / 180, (heading - 90) * Math.PI / 180);
        }
    }

    preventUnload = (e) => {
        if (this.model.isMicrobitConnected) {
            e.preventDefault();
            e.returnValue = '';
        }
    };

    openMoonDrawModal() {
        const modal = document.getElementById('moon-draw-modal');
        if (!modal) return;
        const canvas = document.getElementById('moon-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        modal.style.display = 'flex';
    }

    initMoonCanvasEvents() {
        const canvas = document.getElementById('moon-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const colorPicker = document.getElementById('moon-color-picker');
        let isDrawing = false;
        let lastPos = { x: 0, y: 0 };

        const getCanvasCoords = (e) => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: (e.clientX - rect.left) * (canvas.width / rect.width),
                y: (e.clientY - rect.top) * (canvas.height / rect.height)
            };
        };

        const startDrawing = (e) => {
            isDrawing = true;
            lastPos = getCanvasCoords(e);
            
            ctx.beginPath();
            ctx.fillStyle = colorPicker ? colorPicker.value : '#ffff77';
            ctx.arc(lastPos.x, lastPos.y, 12, 0, Math.PI * 2);
            ctx.fill();
        };

        const draw = (e) => {
            if (!isDrawing) return;
            const currentPos = getCanvasCoords(e);
            
            ctx.beginPath();
            ctx.strokeStyle = colorPicker ? colorPicker.value : '#ffff77';
            ctx.lineWidth = 24;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.moveTo(lastPos.x, lastPos.y);
            ctx.lineTo(currentPos.x, currentPos.y);
            ctx.stroke();
            
            lastPos = currentPos;
        };

        const stopDrawing = () => {
            isDrawing = false;
        };

        canvas.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            canvas.setPointerCapture(e.pointerId);
            startDrawing(e);
        });

        canvas.addEventListener('pointermove', (e) => {
            e.preventDefault();
            draw(e);
        });

        canvas.addEventListener('pointerup', (e) => {
            e.preventDefault();
            stopDrawing();
        });

        canvas.addEventListener('pointercancel', (e) => {
            e.preventDefault();
            stopDrawing();
        });

        const clearBtn = document.getElementById('btn-moon-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            });
        }

        const confirmBtn = document.getElementById('btn-moon-confirm');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                const dataUrl = canvas.toDataURL('image/png');
                
                if (this.currentRecordToDraw) {
                    this.currentRecordToDraw.moonImageData = dataUrl;
                    this.currentRecordToDraw.moonColor = colorPicker ? colorPicker.value : '#ffffbb';
                }
                
                this.model.saveAutoSave();
                this.updateViewRecords();
                
                document.getElementById('moon-draw-modal').style.display = 'none';
            });
        }
    }

    escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>"']/g, (m) => {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[m];
        });
    }

    async createNewSave() {
        const defaultTitle = `観測データ_${new Date().toLocaleDateString('ja-JP')}`;
        const title = prompt("セーブデータのタイトルを入力してください:", defaultTitle);
        if (!title || title.trim() === "") return false;

        const saveData = {
            id: `save_${Date.now()}`,
            title: title.trim(),
            timestamp: Date.now(),
            classCode: localStorage.getItem('sky_class_code') || '',
            observationMode: this.model.observationMode,
            records: [...this.model.records]
        };

        await DBStorage.set('saves', null, saveData);
        
        if (this.view?.showStatusMessage) {
            this.view.showStatusMessage("IndexedDBに保存しました", 2500);
        }
        return true;
    }

    async renderSaveList() {
        const saveListContainer = document.getElementById('save-list');
        if (!saveListContainer) return;

        const saves = await DBStorage.getAllSaves();
        saves.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        saveListContainer.innerHTML = '';

        if (saves.length === 0) {
            saveListContainer.innerHTML = '<p style="color:#aaa; padding:15px 0; text-align:center;">保存されたデータはありません</p>';
            return;
        }

        saves.forEach(save => {
            const item = document.createElement('div');
            item.className = 'save-item';
            item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.08); margin:8px 0; padding:10px; border-radius:6px; border:1px solid rgba(255,255,255,0.1);';
            
            const dateStr = save.timestamp ? new Date(save.timestamp).toLocaleString('ja-JP') : '';
            const recordCount = Array.isArray(save.records) ? save.records.length : 0;

            const titleSpan = document.createElement('div');
            titleSpan.style.cssText = 'text-align:left; flex-grow:1; margin-right:10px; overflow:hidden;';
            titleSpan.innerHTML = `
                <div style="font-weight:bold; font-size:15px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; color:#fff;">${this.escapeHtml(save.title || '無題')}</div>
                <div style="font-size:12px; color:#aaa; margin-top:2px;">${dateStr} (${recordCount}件の記ろく)</div>
            `;

            const btnGroup = document.createElement('div');
            btnGroup.style.cssText = 'display:flex; gap:5px; flex-shrink:0;';

            const loadBtn = document.createElement('button');
            loadBtn.className = 'btn-load-slot';
            loadBtn.dataset.id = save.id;
            loadBtn.style.cssText = 'padding:4px 10px; font-size:13px; background:#007acc; border:none; margin-right:0;';
            loadBtn.innerText = '復元';

            const editBtn = document.createElement('button');
            editBtn.className = 'btn-edit-slot';
            editBtn.dataset.id = save.id;
            editBtn.style.cssText = 'padding:4px 10px; font-size:13px; background:#e6a100; border:none; margin-right:0;';
            editBtn.innerText = '編集';

            const delBtn = document.createElement('button');
            delBtn.className = 'btn-del-slot';
            delBtn.dataset.id = save.id;
            delBtn.style.cssText = 'padding:4px 10px; font-size:13px; background:#d32f2f; border:none; margin-right:0;';
            delBtn.innerText = '削除';

            btnGroup.appendChild(loadBtn);
            btnGroup.appendChild(editBtn);
            btnGroup.appendChild(delBtn);

            item.appendChild(titleSpan);
            item.appendChild(btnGroup);

            saveListContainer.appendChild(item);
        });
    }

    initUIHandlers() {
        const recordBtn = document.getElementById('recordBtn');
        if (recordBtn) {
            recordBtn.addEventListener('click', () => {
                this.executeRecord();
            });
        }

        // --- 保存（セーブ）ボタンの処理 (Create) ---
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                await this.createNewSave();
            });
        }

        // モーダル内の「現在の状態を保存」ボタン (Create)
        const modalSaveNewBtn = document.getElementById('modal-save-new-btn');
        if (modalSaveNewBtn) {
            modalSaveNewBtn.addEventListener('click', async () => {
                const saved = await this.createNewSave();
                if (saved) {
                    await this.renderSaveList();
                }
            });
        }

        // --- 読み込み（ロード）ボタンの処理 (Read / Update / Delete / Restore) ---
        const loadBtn = document.getElementById('loadBtn');
        const loadModal = document.getElementById('load-modal');
        const saveListContainer = document.getElementById('save-list');

        if (loadBtn && loadModal && saveListContainer) {
            loadBtn.addEventListener('click', async () => {
                await this.renderSaveList();
                loadModal.style.display = 'flex';
            });

            // モーダル内の各アクション（復元 / 編集 / 削除）
            saveListContainer.addEventListener('click', async (e) => {
                const button = e.target.closest('button');
                if (!button) return;

                const id = button.getAttribute('data-id');
                if (!id) return;

                const saves = await DBStorage.getAllSaves();
                const targetSave = saves.find(s => s.id === id);

                // --- 復元 (Restore) ---
                if (button.classList.contains('btn-load-slot')) {
                    if (targetSave) {
                        this.model.observationMode = targetSave.observationMode;
                        this.model.records = Array.isArray(targetSave.records) ? [...targetSave.records] : [];
                        await this.model.saveAutoSave();
                        
                        const allRecords = this.model.records;
                        this.timeSliderUI.show(allRecords);

                        this.updateViewRecords();
                        loadModal.style.display = 'none';

                        if (this.view?.showStatusMessage) {
                            this.view.showStatusMessage("データを復元しました", 2000);
                        }
                    }
                } 
                // --- 編集 (Update) ---
                else if (button.classList.contains('btn-edit-slot')) {
                    if (targetSave) {
                        const newTitle = prompt("新しいタイトルを入力してください:", targetSave.title || '');
                        if (newTitle !== null && newTitle.trim() !== '') {
                            targetSave.title = newTitle.trim();
                            targetSave.timestamp = Date.now();
                            await DBStorage.set('saves', null, targetSave);
                            await this.renderSaveList();
                            if (this.view?.showStatusMessage) {
                                this.view.showStatusMessage("タイトルを更新しました", 2000);
                            }
                        }
                    }
                } 
                // --- 削除 (Delete) ---
                else if (button.classList.contains('btn-del-slot')) {
                    if (targetSave && confirm(`「${targetSave.title || '無題'}」を削除しますか？`)) {
                        await DBStorage.deleteSave(id);
                        await this.renderSaveList();
                        if (this.view?.showStatusMessage) {
                            this.view.showStatusMessage("データを削除しました", 2000);
                        }
                    }
                }
            });

            document.getElementById('close-load-modal')?.addEventListener('click', () => {
                loadModal.style.display = 'none';
            });
        }

        const tooltip = document.getElementById('tooltip');

        tooltip.addEventListener('pointerdown', (e) => e.stopPropagation());
        tooltip.addEventListener('mousedown', (e) => e.stopPropagation());
        tooltip.addEventListener('touchstart', (e) => e.stopPropagation());

        tooltip.addEventListener('click', (e) => {
            if (e.target.id === 'delete-record-btn') {
                if (confirm("本当に記ろくを消しますか？")) {
                    if (this.currentSelectedRecord) {
                        this.model.deleteRecord(this.currentSelectedRecord);

                        const allRecords = this.model.records;
                        this.timeSliderUI.show(allRecords);
                        
                        this.updateViewRecords();

                        tooltip.style.display = 'none';
                        this.currentSelectedRecord = null;
                    }
                }
            }
        });

        const modeBtn = document.getElementById('modeBtn');
        document.getElementById('connectBtn').addEventListener('click', async () => {
            const success = await this.microbitInput.connect();
            if (success) {
                this.model.isMicrobitConnected = true;
                this.model.isSensorMode = true;
                modeBtn.style.display = 'inline-block';
                document.getElementById('connectBtn').style.display = 'none';
                this.view.controls.enabled = false;
                
                this.updateRecordBtnVisibility();

                document.getElementById('bt-connection-frame').style.display = 'block';
                
                try {
                    if ('wakeLock' in navigator) {
                        this.wakeLock = await navigator.wakeLock.request('screen');
                    }
                } catch (err) {
                    console.log(`WakeLock error: ${err.name}, ${err.message}`);
                }

                window.addEventListener('beforeunload', this.preventUnload);

                this.startCalibrationCountdown();
            }
        });

        modeBtn.addEventListener('click', () => {
            this.model.isSensorMode = !this.model.isSensorMode;
            modeBtn.innerText = this.model.isSensorMode ? "モード: センサー" : "モード: マウス";
            this.view.controls.enabled = !this.model.isSensorMode;
            this.updateRecordBtnVisibility();
        });

        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (confirm("すべてのデータを消去して一からやり直しますか？")) {
                    this.model.resetData();
                    this.view.setCustomMoonImage(null);
                    
                    this.updateViewRecords();
                    
                    tooltip.style.display = 'none';
                    this.currentSelectedRecord = null;

                    localStorage.removeItem('sky_camera_view');

                    this.timeSliderUI.show([]);
                    this.updateRecordBtnVisibility();
                }
            });
        }

        this.updateRecordBtnVisibility();

        const toggleRadar = document.getElementById('toggle-radar');
        if (toggleRadar) {
            toggleRadar.addEventListener('change', (e) => {
                this.view.setRadarVisible(e.target.checked);
            });
            this.view.setRadarVisible(toggleRadar.checked);
        }

        // 方角の表示切替
        const toggleDirection = document.getElementById('toggle-direction');
        if (toggleDirection) {
            toggleDirection.addEventListener('change', (e) => {
                this.view.setDirectionVisible(e.target.checked);
            });
            this.view.setDirectionVisible(toggleDirection.checked);
        }

        // タイムスライダーの表示切替
        const toggleTimeslider = document.getElementById('toggle-timeslider');
        const sliderContainer = document.getElementById('shared-time-slider-container');
        if (toggleTimeslider && sliderContainer) {
            toggleTimeslider.addEventListener('change', (e) => {
                sliderContainer.style.display = e.target.checked ? 'block' : 'none';
            });
            sliderContainer.style.display = toggleTimeslider.checked ? 'block' : 'none';
        }
    }

    startCalibrationCountdown() {
        let countdownEl = document.getElementById('huge-countdown') || document.createElement('div');
        if (!countdownEl.id) {
            countdownEl.id = 'huge-countdown'; countdownEl.style.position = 'fixed'; countdownEl.style.top = '0'; countdownEl.style.left = '0';
            countdownEl.style.width = '100vw'; countdownEl.style.height = '100vh'; countdownEl.style.display = 'flex'; countdownEl.style.justifyContent = 'center';
            countdownEl.style.alignItems = 'center'; countdownEl.style.fontSize = '40vw'; countdownEl.style.fontFamily = 'sans-serif';
            countdownEl.style.fontWeight = 'bold'; countdownEl.style.color = '#ffffff'; countdownEl.style.textShadow = '0 0 30px #00aaff';
            countdownEl.style.zIndex = '9999'; countdownEl.style.pointerEvents = 'none'; countdownEl.style.backgroundColor = 'rgba(0,0,10,0.7)';
            document.body.appendChild(countdownEl);
        }
        let count = 5; countdownEl.innerText = count; countdownEl.style.display = 'flex';
        const timerId = setInterval(() => {
            count--;
            if (count > 0) {
                countdownEl.innerText = count; this.microbitInput.playBeep(880, 0.05, 0.05); 
            } else {
                clearInterval(timerId); countdownEl.style.display = 'none'; this.microbitInput.beginCalibration(15000);
            }
        }, 1000);
    }

    startLoop() {
        const animate = () => { requestAnimationFrame(animate); this.updateSystem(); this.view.render(); };
        animate();
    }

    updateSystem() {
        this.updateClockUI();
        if (this.model.isMicrobitConnected && this.model.isSensorMode) {
            this.model.updateLerp();
            const phi = this.model.lerpRot.x, theta = this.model.lerpRot.y;
            this.view.camera.lookAt(new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)).add(this.view.camera.position));
            let aziDeg = (theta * 180 / Math.PI) + 90; if (aziDeg < 0) aziDeg += 360;
            this.view.updateHUDText(90 - (phi * 180 / Math.PI), aziDeg);
        } else {
            this.mouseInput.update();
            const dir = new THREE.Vector3(); this.view.camera.getWorldDirection(dir);
            const phi = Math.acos(Math.max(-1, Math.min(1, dir.y))), theta = Math.atan2(dir.z, dir.x); 
            let azi = (theta * 180 / Math.PI) + 90; if (azi < 0) azi += 360;
            this.view.updateHUDText(90 - (phi * 180 / Math.PI), azi);
        }
    }
    
    updateClockUI() {
        const targetDate = this.model.filterTimestamp ? new Date(this.model.filterTimestamp) : new Date();
        const hours = targetDate.getHours() + (targetDate.getMinutes() / 60);
        this.view.setDayNightMode(hours >= 5.0 && hours < 18.5);
    }
}