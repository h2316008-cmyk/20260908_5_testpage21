export class TimeSliderUI {
    constructor(onChange) {
        this.headerContainer = document.getElementById('shared-time-header');
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
            // 手動操作されたら現在時刻への追従を解除（ボタン表示・秒非表示へ）
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

        // 現在時刻追従中はボタンを隠す
        if (this.resetBtn) {
            this.resetBtn.style.display = 'none';
        }

        const now = Date.now();
        this.updateRange(this.currentRecords, now);

        // 1秒ごとに更新（秒あり）
        this.liveTimer = setInterval(() => {
            const currentTs = Date.now();
            const currentMax = parseInt(this.slider.max);

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

        // 手動操作時はボタンを表示し、表示を秒なしに更新
        if (this.resetBtn) {
            this.resetBtn.style.display = 'inline-block';
        }

        if (this.slider) {
            this.updateDisplay(parseInt(this.slider.value));
        }
    }

    resetToNow() {
        this.startLiveMode();
    }

    updateDisplay(ts) {
        const d = new Date(ts);
        const hours = d.getHours();
        const ampm = hours < 12 ? '午前' : '午後';
        const h12 = hours % 12;
        const minStr = d.getMinutes().toString().padStart(2, '0');

        // 現在時刻（isLive）のときだけ秒を表示
        if (this.isLive) {
            const secStr = d.getSeconds().toString().padStart(2, '0');
            this.display.innerText = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${ampm}${h12}:${minStr}:${secStr}`;
        } else {
            this.display.innerText = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${ampm}${h12}:${minStr}`;
        }
    }

    show(records) {
        if (this.headerContainer) this.headerContainer.style.display = 'flex';
        if (this.container) this.container.style.display = 'block';

        if (!records || records.length === 0) {
            this.currentRecords = [];
            this.startLiveMode();
        } else {
            this.stopLiveMode();
            this.updateRange(records);
        }
    }

    hide() {
        // 常時表示にするため無効化
    }

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

        if (selectedTs < minTs) minTs = selectedTs;
        if (selectedTs > maxTs) maxTs = selectedTs;
        
        const minDate = new Date(minTs);
        minTs = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate(), 0, 0, 0).getTime();

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

        const endLine = document.createElement('div');
        endLine.className = 'time-tick-line';
        endLine.style.left = '100%';
        this.ticksContainer.appendChild(endLine);

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