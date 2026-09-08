export class TimeSliderUI {
    constructor(onChange) {
        this.container = document.getElementById('shared-time-slider-container');
        this.slider = document.getElementById('shared-time-slider');
        this.display = document.getElementById('shared-time-display');
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
            this.slider.min = now - 3600000;
            this.slider.max = now + 3600000;
            this.slider.value = now;
            this.updateDisplay(now);
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
        minTs -= 3600000; // 最も古い時間の1時間前
        maxTs += 3600000; // 最も新しい時間の1時間後

        this.slider.min = minTs;
        this.slider.max = maxTs;
        this.slider.value = originalMaxTs; 
        
        this.updateDisplay(originalMaxTs);
        this.onChange(originalMaxTs);
    }
}