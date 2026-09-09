export class TimeSliderUI {
    constructor(onChange) {
        this.container = document.getElementById('shared-time-slider-container');
        this.slider = document.getElementById('shared-time-slider');
        this.display = document.getElementById('shared-time-display');
        this.ticksContainer = document.getElementById('shared-time-ticks');
        this.onChange = onChange;
        
        this.slider.addEventListener('input', () => {
            const ts = parseInt(this.slider.value);
            this.updateDisplay(ts);
            this.onChange(ts);
        });
    }

    updateDisplay(ts) {
        const d = new Date(ts);
        const hours = d.getHours();
        const ampm = hours < 12 ? '午前' : '午後';
        const h12 = hours % 12;
        this.display.innerText = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${ampm}${h12}:${d.getMinutes().toString().padStart(2, '0')}`;
    }

    show(records) {
        this.container.style.display = 'block';
        this.updateRange(records);
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

    updateRange(records) {
        if (records.length === 0) {
            const now = Date.now();
            const d = new Date(now);
            // 記録がない場合は当日の午前0時～午後12時(23:59:59)とする
            const minTs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime();
            const maxTs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime();
            
            this.slider.min = minTs;
            this.slider.max = maxTs;
            this.slider.value = now;
            this.updateDisplay(now);
            this.updateTicks(minTs, maxTs);
            this.onChange(now);
            return;
        }

        let minTs = Infinity;
        let maxTs = -Infinity;
        records.forEach(r => {
            // 修正: parseTimestampメソッドを使用して正しい時刻を取得する
            const ts = this.parseTimestamp(r.dateStr, r.timeStr);
            if (ts < minTs) minTs = ts;
            if (ts > maxTs) maxTs = ts;
        });
        
        const originalMaxTs = maxTs;
        
        // 最古の日付の午前0時に設定
        const minDate = new Date(minTs);
        minTs = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate(), 0, 0, 0).getTime();

        // 最新の日付の午後12時（23時59分59秒）に設定
        const maxDate = new Date(maxTs);
        maxTs = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate(), 23, 59, 59).getTime();

        this.slider.min = minTs;
        this.slider.max = maxTs;
        this.slider.value = originalMaxTs; 
        
        this.updateDisplay(originalMaxTs);
        this.updateTicks(minTs, maxTs);
        this.onChange(originalMaxTs);
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