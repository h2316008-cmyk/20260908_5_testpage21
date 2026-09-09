export class TimeSliderUI {
    constructor(onChange) {
        this.container = document.getElementById('shared-time-slider-container');
        this.slider = document.getElementById('shared-time-slider');
        this.display = document.getElementById('shared-time-display');
        this.ticksContainer = document.getElementById('shared-time-ticks');
        this.marksContainer = document.getElementById('shared-time-marks');
        this.resetBtn = document.getElementById('reset-time-btn');
        this.onChange = onChange;
        this.currentRecords = [];
        
        // リアルタイム更新（現在時刻追従）用のタイマーと状態
        this.liveTimer = null;
        this.isLive = false;

        this.slider.addEventListener('input', () => {
            // ユーザーが手動でスライダーを動かした場合は、現在時刻への追従を解除
            this.stopLiveMode();
            
            const ts = parseInt(this.slider.value);
            this.updateDisplay(ts);
            this.onChange(ts);
        });

        if (this.resetBtn) {
            this.resetBtn.addEventListener('click', () => {
                this.resetToNow();
            });
        }

        // デフォルトは現在時刻（リアルタイム進行状態）で開始
        this.startLiveMode();
    }

    // --- リアルタイム（現在時刻）更新モード ---
    startLiveMode() {
        if (this.isLive) return;
        this.isLive = true;

        // 現在時刻に追従している時は「リセットボタン」を隠す
        if (this.resetBtn) {
            this.resetBtn.style.display = 'none';
        }

        // 初回更新
        const now = Date.now();
        this.updateRange(this.currentRecords, now);

        // 1秒ごとにスライダーと表示を更新
        this.liveTimer = setInterval(() => {
            const currentTs = Date.now();
            const currentMax = parseInt(this.slider.max);

            // 日付を跨いでスライダーの最大値（23:59:59）を超えた場合は範囲全体を再設定
            if (currentTs > currentMax) {
                this.updateRange(this.currentRecords, currentTs);
            } else {
                this.slider.value = currentTs;
                this.updateDisplay(currentTs);
                this.onChange(currentTs);
            }
        }, 1000);
    }

    stopLiveMode() {
        this.isLive = false;
        if (this.liveTimer) {
            clearInterval(this.liveTimer);
            this.liveTimer = null;
        }

        // 手動操作で任意の時間を見ている時は「リセットボタン」を表示する
        if (this.resetBtn) {
            // CSSの元のdisplayプロパティ（blockやflexなど）に戻すため空文字を指定
            this.resetBtn.style.display = ''; 
        }
    }

    resetToNow() {
        // 現在時刻に戻した場合は、再びリアルタイム更新を開始する
        this.startLiveMode();
    }

    updateDisplay(ts) {
        const d = new Date(ts);
        const hours = d.getHours();
        const ampm = hours < 12 ? '午前' : '午後';
        const h12 = hours % 12;
        
        // 分・秒を2桁でゼロ埋め
        const minStr = d.getMinutes().toString().padStart(2, '0');
        const secStr = d.getSeconds().toString().padStart(2, '0');
        
        // 秒を含めて表示
        this.display.innerText = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${ampm}${h12}:${minStr}:${secStr}`;
    }

    show(records) {
        this.container.style.display = 'block';
        if (!records || records.length === 0) {
            // 記録がない場合は現在時刻から始まるため、リアルタイム更新をオンにする
            this.currentRecords = [];
            this.startLiveMode();
        } else {
            // 記録（過去データ）がある場合はリアルタイム更新を停止して範囲を表示
            this.stopLiveMode();
            this.updateRange(records);
        }
    }

    hide() {
        // 修正: タイムスライダーを常時表示にするため、非表示処理を無効化
        // this.container.style.display = 'none';
    }

    // 日本語の「午前/午後」を含む日時文字列をタイムスタンプに変換するヘルパー
    parseTimestamp(dateStr, timeStr) {
        const [year, month, day] = dateStr.split('/').map(Number);
        const ampm = timeStr.substring(0, 2);
        const time = timeStr.substring(2);
        let [h, m] = time.split(':').map(Number);
        
        if (ampm === '午後' && h < 12) h += 12;
        if (ampm === '午前' && h === 12) h = 0;
        
        return new Date(year, month - 1, day, h, m).getTime();
    }

    updateRange(records, targetTs = null) {
        this.currentRecords = records || [];
        const now = Date.now();

        if (this.currentRecords.length === 0) {
            const current = targetTs !== null ? targetTs : now;
            const d = new Date(current);
            // 記録がない場合は当日の午前0時～午後12時(23:59:59)とする
            const minTs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime();
            const maxTs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime();
            
            this.slider.min = minTs;
            this.slider.max = maxTs;
            this.slider.value = current;
            this.updateDisplay(current);
            this.updateTicks(minTs, maxTs);
            this.updateMarks([], minTs, maxTs);
            this.onChange(current);
            return;
        }

        let minTs = Infinity;
        let maxTs = -Infinity;
        this.currentRecords.forEach(r => {
            const ts = this.parseTimestamp(r.dateStr, r.timeStr);
            if (ts < minTs) minTs = ts;
            if (ts > maxTs) maxTs = ts;
        });
        
        const selectedTs = targetTs !== null ? targetTs : maxTs;

        // 指定時刻（現在時刻など）が現在の記録範囲外にあれば範囲を広げる
        if (selectedTs < minTs) minTs = selectedTs;
        if (selectedTs > maxTs) maxTs = selectedTs;
        
        // 最古の日付の午前0時に設定
        const minDate = new Date(minTs);
        minTs = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate(), 0, 0, 0).getTime();

        // 最新の日付の午後12時（23時59分59秒）に設定
        const maxDate = new Date(maxTs);
        maxTs = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate(), 23, 59, 59).getTime();

        this.slider.min = minTs;
        this.slider.max = maxTs;
        this.slider.value = selectedTs; 
        
        this.updateDisplay(selectedTs);
        this.updateTicks(minTs, maxTs);
        this.updateMarks(this.currentRecords, minTs, maxTs);
        this.onChange(selectedTs);
    }

    updateMarks(records, minTs, maxTs) {
        if (!this.marksContainer) return;
        this.marksContainer.innerHTML = '';

        const totalRange = maxTs - minTs;
        if (totalRange <= 0) return;

        records.forEach(r => {
            const ts = this.parseTimestamp(r.dateStr, r.timeStr);
            const percent = ((ts - minTs) / totalRange) * 100;
            if (percent >= 0 && percent <= 100) {
                const markEl = document.createElement('div');
                markEl.className = 'time-record-mark';
                markEl.style.left = `${percent}%`;
                this.marksContainer.appendChild(markEl);
            }
        });
    }

    updateTicks(minTs, maxTs) {
        if (!this.ticksContainer) return;
        this.ticksContainer.innerHTML = '';

        const totalRange = maxTs - minTs;
        if (totalRange <= 0) return;

        const days = [];
        let cur = new Date(minTs);
        while (cur.getTime() <= maxTs) {
            days.push(new Date(cur));
            cur.setDate(cur.getDate() + 1);
        }

        const dayCount = days.length;
        let step = 1;
        if (dayCount > 14) {
            step = Math.ceil(dayCount / 10);
        }

        // 各日の区切り線（0:00）を描画
        days.forEach((d) => {
            const boundaryTs = d.getTime();
            const percent = ((boundaryTs - minTs) / totalRange) * 100;
            if (percent >= 0 && percent <= 100) {
                const lineEl = document.createElement('div');
                lineEl.className = 'time-tick-line';
                lineEl.style.left = `${percent}%`;
                this.ticksContainer.appendChild(lineEl);
            }
        });

        // スライダー右端（最後の日の23:59:59）にも区切り線を描画
        const endLine = document.createElement('div');
        endLine.className = 'time-tick-line';
        endLine.style.left = '100%';
        this.ticksContainer.appendChild(endLine);

        // 各日の中央（正午 12:00）の位置に日付ラベル（例: 10/1）を描画
        days.forEach((d, index) => {
            if (index % step !== 0 && index !== dayCount - 1) return;

            const noonTs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).getTime();
            const percent = ((noonTs - minTs) / totalRange) * 100;

            if (percent >= 0 && percent <= 100) {
                const labelEl = document.createElement('div');
                labelEl.className = 'time-tick-label';
                labelEl.style.left = `${percent}%`;
                labelEl.innerText = `${d.getMonth() + 1}/${d.getDate()}`;
                this.ticksContainer.appendChild(labelEl);
            }
        });
    }
}