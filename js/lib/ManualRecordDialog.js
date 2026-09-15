// js/ManualRecordDialog.js
export class ManualRecordDialog {
    constructor() {
        this.modal = document.getElementById('manual-record-modal');
        this.dateInput = document.getElementById('manual-date');
        this.timeInput = document.getElementById('manual-time');
        this.azimuthSlider = document.getElementById('manual-azimuth');
        this.azimuthVal = document.getElementById('manual-azimuth-val');
        this.elevationSlider = document.getElementById('manual-elevation');
        this.elevationVal = document.getElementById('manual-elevation-val');
        this.okBtn = document.getElementById('manual-ok');
        this.cancelBtn = document.getElementById('manual-cancel');

        this.azimuthSlider.addEventListener('input', (e) => {
            this.azimuthVal.innerText = e.target.value;
        });
        
        this.elevationSlider.addEventListener('input', (e) => {
            this.elevationVal.innerText = e.target.value;
        });
    }

    show(defaultAzimuth = 0, defaultElevation = 0, defaultDate = new Date()) {
        return new Promise((resolve) => {
            // 初期値の設定
            this.azimuthSlider.value = Math.round(defaultAzimuth);
            this.azimuthVal.innerText = Math.round(defaultAzimuth);
            this.elevationSlider.value = Math.round(defaultElevation);
            this.elevationVal.innerText = Math.round(defaultElevation);

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
                    azimuth: parseFloat(this.azimuthSlider.value),
                    elevation: parseFloat(this.elevationSlider.value)
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
