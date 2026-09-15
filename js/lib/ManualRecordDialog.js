// js/ManualRecordDialog.js
export class ManualRecordDialog {
    constructor() {
        this.modal = document.getElementById('manual-record-modal');
        this.dateInput = document.getElementById('manual-date');
        this.timeInput = document.getElementById('manual-time');
        
        this.azimuthSlider = document.getElementById('manual-azimuth');
        this.azimuthNum = document.getElementById('manual-azimuth-num');
        
        this.elevationSlider = document.getElementById('manual-elevation');
        this.elevationNum = document.getElementById('manual-elevation-num');
        
        this.okBtn = document.getElementById('manual-ok');
        this.cancelBtn = document.getElementById('manual-cancel');

        // スライダーと数値入力の相互連動設定
        this.setupSync(this.azimuthSlider, this.azimuthNum, 0, 359);
        this.setupSync(this.elevationSlider, this.elevationNum, 0, 90);
    }

    // スライダーと数値入力ボックスを双方向で同期するメソッド
    setupSync(slider, numInput, min, max) {
        slider.addEventListener('input', () => {
            numInput.value = slider.value;
        });

        numInput.addEventListener('input', () => {
            let val = parseFloat(numInput.value);
            if (!isNaN(val)) {
                if (val < min) val = min;
                if (val > max) val = max;
                slider.value = val;
            }
        });

        // フォーカスが外れた時の範囲補正処理
        numInput.addEventListener('blur', () => {
            if (numInput.value === '' || isNaN(parseFloat(numInput.value))) {
                numInput.value = slider.value;
            } else {
                let val = Math.min(max, Math.max(min, parseFloat(numInput.value)));
                numInput.value = val;
                slider.value = val;
            }
        });
    }

    show(defaultAzimuth = 0, defaultElevation = 0, defaultDate = new Date()) {
        return new Promise((resolve) => {
            // 初期値の設定
            const azVal = Math.round(defaultAzimuth);
            this.azimuthSlider.value = azVal;
            this.azimuthNum.value = azVal;

            const elVal = Math.round(defaultElevation);
            this.elevationSlider.value = elVal;
            this.elevationNum.value = elVal;

            // 日時のフォーマット設定
            const yyyy = defaultDate.getFullYear();
            const MM = String(defaultDate.getMonth() + 1).padStart(2, '0');
            const dd = String(defaultDate.getDate()).padStart(2, '0');
            this.dateInput.value = `${yyyy}-${MM}-${dd}`;

            const hh = String(defaultDate.getHours()).padStart(2, '0');
            const mm = String(defaultDate.getMinutes()).padStart(2, '0');
            this.timeInput.value = `${hh}:${mm}`;

            this.modal.style.display = 'flex';

            const cleanup = () => {
                this.modal.style.display = 'none';
                this.okBtn.removeEventListener('click', onOk);
                this.cancelBtn.removeEventListener('click', onCancel);
            };

            const onOk = () => {
                cleanup();
                const [year, month, day] = this.dateInput.value.split('-');
                const [hour, minute] = this.timeInput.value.split(':');
                const customDate = new Date(year, month - 1, day, hour, minute);

                resolve({
                    date: customDate,
                    azimuth: parseFloat(this.azimuthNum.value),
                    elevation: parseFloat(this.elevationNum.value)
                });
            };

            const onCancel = () => {
                cleanup();
                resolve(null);
            };

            this.okBtn.addEventListener('click', onOk);
            this.cancelBtn.addEventListener('click', onCancel);
        });
    }
}