export class MicrobitInput {
    constructor(model, onShoot, onRawData = null, onStatus = null) {
        this.model = model;
        this.onShoot = onShoot; 
        this.onRawData = onRawData; 
        this.onStatus = onStatus; 

        this._btnA = 0;
        this._btnB = 0;
        this._comboLatched = false;

        this.ALPHA = 0.15; 
        this.MANUAL_OFFSET_X = 0;
        this.MANUAL_OFFSET_Y = 0;
        this.MANUAL_OFFSET_Z = 0;
        this.ELEVATION_OFFSET = 2; 
        this.MAGNETIC_DECLINATION = 8; 

        this.currentSensor = { aX: 0, aY: 0, aZ: 0, mX: 0, mY: 0, mZ: 0 };

        this.isCalibrating = false;
        this.calibData = {
            minX: 2000, maxX: -2000,
            minY: 2000, maxY: -2000,
            minZ: 2000, maxZ: -2000,
            scaleX: 1, scaleY: 1, scaleZ: 1,
            offsetX: 0, offsetY: 0, offsetZ: 0,
            northOffset: 0
        };

        // キャリブレーション用タイマー
        this.calibTimer = null;
        this.maxCalibTimer = null; // 最大60秒制限用のタイマー

        // --- 記録制御用の変数 ---
        this.recordAttemptCount = 0; // 記録を試みた回数
        this.lastMovementTime = Date.now(); // 最後に機体が動いた時刻
        this.prevHeading = null;
        this.prevElevation = null;
        // ★修正: 安定しているとみなす変化量の閾値を 2.0 から 5.0度 に緩和（数値を大きくするほど緩くなります）
        this.STABLE_THRESHOLD = 5.0; 

        // UARTのパケット分割対策用のバッファとBluetoothデバイスの保持
        this.receiveBuffer = "";
        this.bluetoothDevice = null;

        this.UUID = {
            UART_SERVICE: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
            UART_TX_CHAR: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
            UART_RX_CHAR: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
            BTN_SRV:      'e95d9882-251d-470a-a062-fa1922dfa9a8',
            BTN_A:        'e95dda90-251d-470a-a062-fa1922dfa9a8',
            BTN_B:        'e95dda91-251d-470a-a062-fa1922dfa9a8'
        };

        this.audioCtx = null;
    }

    // --- 音声フィードバック機能 ---
    initAudio() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    playBeep(frequency, duration, volume = 0.1) {
        if (!this.audioCtx) return;
        const oscillator = this.audioCtx.createOscillator();
        const gainNode = this.audioCtx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);

        gainNode.gain.setValueAtTime(0, this.audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(volume, this.audioCtx.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

        oscillator.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);

        oscillator.start(this.audioCtx.currentTime);
        oscillator.stop(this.audioCtx.currentTime + duration);
    }

    playCalibrationDone() {
        this.playBeep(523.25, 0.1); // C5
        setTimeout(() => this.playBeep(659.25, 0.1), 150); // E5
        setTimeout(() => this.playBeep(783.99, 0.15), 300); // G5
        setTimeout(() => this.playBeep(1046.50, 0.3), 450); // C6
    }

    playErrorBeep() {
        // 短く低い「ブブッ」という音
        this.playBeep(150, 0.1, 0.2);
        setTimeout(() => this.playBeep(150, 0.1, 0.2), 150);
    }

    // --- PC側キャリブレーションAPI ---
    
    startCalibrationCountdown() {
        let count = 5;
        if (this.onStatus) this.onStatus(`接続完了！${count}秒後にキャリブレーションを開始します`);
        
        const countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                if (this.onStatus) this.onStatus(`${count}秒後にキャリブレーションを開始します...`);
                this.playBeep(440, 0.1); 
            } else {
                clearInterval(countdownInterval);
                this.beginCalibration(); 
            }
        }, 1000);
    }

    beginCalibration() {
        this.initAudio(); 
        this.isCalibrating = true;
        
        // 追加: オーバーレイの表示
        const overlay = document.getElementById('calibration-overlay');
        if (overlay) overlay.style.display = 'flex';
        
        this.calibData.minX = 2000; this.calibData.maxX = -2000;
        this.calibData.minY = 2000; this.calibData.maxY = -2000;
        this.calibData.minZ = 2000; this.calibData.maxZ = -2000;
        this.calibData.scaleX = 1; this.calibData.scaleY = 1; this.calibData.scaleZ = 1;
        this.calibData.offsetX = 0; this.calibData.offsetY = 0; this.calibData.offsetZ = 0;

        console.log("地磁気キャリブレーション開始");
       if (this.onStatus) this.onStatus("8の字に回してください (最大40秒で終了)");

        this.playBeep(880, 0.1);
        setTimeout(() => this.playBeep(880, 0.1), 150);

        this.resetCalibrationTimeout();

        if (this.maxCalibTimer) clearTimeout(this.maxCalibTimer);
        this.maxCalibTimer = setTimeout(() => {
            console.log("40秒経過したためキャリブレーションを終了します");
            this.finishCalibration();
        }, 40000); 
    }

    resetCalibrationTimeout() {
        if (this.calibTimer) {
            clearTimeout(this.calibTimer);
        }
        this.calibTimer = setTimeout(() => {
            console.log("15秒間更新がなかったためキャリブレーションを終了します");
            this.finishCalibration();
        }, 15000);
    }

    finishCalibration() {
        if (!this.isCalibrating) return; 

        this.isCalibrating = false;

        // 追加: オーバーレイの非表示
        const overlay = document.getElementById('calibration-overlay');
        if (overlay) overlay.style.display = 'none';

        if (this.calibTimer) clearTimeout(this.calibTimer);
        if (this.maxCalibTimer) clearTimeout(this.maxCalibTimer);

        let rangeX = this.calibData.maxX - this.calibData.minX;
        let rangeY = this.calibData.maxY - this.calibData.minY;
        let rangeZ = this.calibData.maxZ - this.calibData.minZ;

        if (rangeX < 1) rangeX = 1;
        if (rangeY < 1) rangeY = 1;
        if (rangeZ < 1) rangeZ = 1;

        let avgRange = (rangeX + rangeY + rangeZ) / 3;

        this.calibData.scaleX = avgRange / rangeX;
        this.calibData.scaleY = avgRange / rangeY;
        this.calibData.scaleZ = avgRange / rangeZ;

        this.calibData.offsetX = ((this.calibData.maxX + this.calibData.minX) / 2) + this.MANUAL_OFFSET_X;
        this.calibData.offsetY = ((this.calibData.maxY + this.calibData.minY) / 2) + this.MANUAL_OFFSET_Y;
        this.calibData.offsetZ = ((this.calibData.maxZ + this.calibData.minZ) / 2) + this.MANUAL_OFFSET_Z;

        console.log("キャリブレーション完了:", this.calibData);
        if (this.onStatus) this.onStatus("キャリブレーション完了しました");

        this.playCalibrationDone();
    }

    // ====== Bluetooth接続処理 ======
    async connect() {
        try {
            console.log("Bluetoothデバイスを検索中...");
            if (this.onStatus) this.onStatus("Bluetoothデバイスを探しています...");
            
            this.bluetoothDevice = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: 'BBC micro:bit' }],
                optionalServices: [this.UUID.UART_SERVICE, this.UUID.BTN_SRV]
            });

            this.bluetoothDevice.addEventListener('gattserverdisconnected', () => this.onDisconnected());

            console.log("GATTサーバーに接続中...");
            if (this.onStatus) this.onStatus("GATTサーバーに接続しています...");
            const server = await this.bluetoothDevice.gatt.connect();

            this.initAudio();

            if (this.onStatus) this.onStatus("UARTサービスを設定中...");
            const uartService = await server.getPrimaryService(this.UUID.UART_SERVICE);
            const uartTxCharacteristic = await uartService.getCharacteristic(this.UUID.UART_TX_CHAR);
            await uartTxCharacteristic.startNotifications();
            uartTxCharacteristic.addEventListener('characteristicvaluechanged', (e) => this.handleUartData(e));

            if (this.onStatus) this.onStatus("ボタンサービスを設定中...");
            const btnService = await server.getPrimaryService(this.UUID.BTN_SRV);
            
            const btnAChar = await btnService.getCharacteristic(this.UUID.BTN_A);
            await btnAChar.startNotifications();
            btnAChar.addEventListener('characteristicvaluechanged', (e) => this.handleButtonA(e));
            
            const btnBChar = await btnService.getCharacteristic(this.UUID.BTN_B);
            await btnBChar.startNotifications();
            btnBChar.addEventListener('characteristicvaluechanged', (e) => this.handleButtonB(e));

            console.log("すべてのセンサーの接続と準備が完了しました！");
            if (this.onStatus) this.onStatus("接続完了！データを受信中...");
            
            this.playBeep(1046.50, 0.1);
            setTimeout(() => this.playBeep(1318.51, 0.15), 100);

            this.startCalibrationCountdown();

            return true;

        } catch (error) {
            console.error("接続エラー", error);
            if (this.onStatus) this.onStatus("エラー: 接続に失敗しました。");
            alert("接続エラー: コンソールを確認してください。\n" + error);
            return false;
        }
    }

    disconnect() {
        if (this.bluetoothDevice && this.bluetoothDevice.gatt.connected) {
            this.bluetoothDevice.gatt.disconnect();
        }
    }

    onDisconnected() {
        if (this.onStatus) this.onStatus("切断されました");
        console.log("デバイスが切断されました");
    }

    // ====== データ受信時の処理 (UART) ======
    handleUartData(event) {
        const value = new TextDecoder().decode(event.target.value);
        this.receiveBuffer += value;
        
        const lines = this.receiveBuffer.split('\n');
        this.receiveBuffer = lines.pop();
        
        for (let line of lines) {
            line = line.trim();
            if (line) {
                const data = line.split(',');
                if (data.length === 6) {
                    const ax = parseFloat(data[0]);
                    const ay = parseFloat(data[1]);
                    const az = parseFloat(data[2]);
                    const mx = parseFloat(data[3]);
                    const my = parseFloat(data[4]);
                    const mz = parseFloat(data[5]);

                    this.currentSensor.aX = this.currentSensor.aX * (1 - this.ALPHA) + ax * this.ALPHA;
                    this.currentSensor.aY = this.currentSensor.aY * (1 - this.ALPHA) + ay * this.ALPHA;
                    this.currentSensor.aZ = this.currentSensor.aZ * (1 - this.ALPHA) + az * this.ALPHA;

                    this.currentSensor.mX = this.currentSensor.mX * (1 - this.ALPHA) + mx * this.ALPHA;
                    this.currentSensor.mY = this.currentSensor.mY * (1 - this.ALPHA) + my * this.ALPHA;
                    this.currentSensor.mZ = this.currentSensor.mZ * (1 - this.ALPHA) + mz * this.ALPHA;

                    if (this.isCalibrating) {
                        let updated = false;
                        const cx = this.currentSensor.mX;
                        const cy = this.currentSensor.mY;
                        const cz = this.currentSensor.mZ;
                        
                        if (cx < this.calibData.minX) { this.calibData.minX = cx; updated = true; }
                        if (cx > this.calibData.maxX) { this.calibData.maxX = cx; updated = true; }
                        if (cy < this.calibData.minY) { this.calibData.minY = cy; updated = true; }
                        if (cy > this.calibData.maxY) { this.calibData.maxY = cy; updated = true; }
                        if (cz < this.calibData.minZ) { this.calibData.minZ = cz; updated = true; }
                        if (cz > this.calibData.maxZ) { this.calibData.maxZ = cz; updated = true; }

                        if (updated) {
                            this.playBeep(4000, 0.05, 0.05);
                            this.resetCalibrationTimeout(); 
                        }
                    }

                    this.notifyProcessedData();
                }
            }
        }
    }

    notifyProcessedData() {
        if (!this.onRawData) return;

        const heading = this.calculateHeading();
        const elevation = this.calculateElevation();

        // --- 機体の安定判定 ---
        if (this.prevHeading !== null && this.prevElevation !== null) {
            const diffHeading = Math.abs(heading - this.prevHeading);
            const diffElevation = Math.abs(elevation - this.prevElevation);
            
            const minDiffH = Math.min(diffHeading, 360 - diffHeading);
            
            // 変化が閾値（5.0度）を超えたら「動いた」とみなし、タイマーをリセット
            if (minDiffH > this.STABLE_THRESHOLD || diffElevation > this.STABLE_THRESHOLD) {
                this.lastMovementTime = Date.now();
            }
        }
        
        this.prevHeading = heading;
        this.prevElevation = elevation;

        this.onRawData({ heading, elevation });
    }

    calculateHeading() {
        const mx = (this.currentSensor.mX - this.calibData.offsetX) * this.calibData.scaleX;
        const my = (this.currentSensor.mY - this.calibData.offsetY) * this.calibData.scaleY;
        const mz = (this.currentSensor.mZ - this.calibData.offsetZ) * this.calibData.scaleZ;

        const ax = this.currentSensor.aX;
        const ay = this.currentSensor.aY;
        const az = this.currentSensor.aZ;

        const roll = Math.atan2(ay, az);
        const pitch = Math.atan2(-ax, Math.sqrt(ay * ay + az * az));

        const sinPhi = Math.sin(roll);
        const cosPhi = Math.cos(roll);
        const sinTheta = Math.sin(pitch);
        const cosTheta = Math.cos(pitch);

        const xh = mx * cosTheta + my * sinPhi * sinTheta + mz * cosPhi * sinTheta;
        const yh = my * cosPhi - mz * sinPhi;

        let angle = Math.atan2(yh, xh);
        let degree = angle * 57.295779; 

        degree += 90;

        let h = degree;
        h = h - this.calibData.northOffset - this.MAGNETIC_DECLINATION;
        h = (h % 360 + 360) % 360;

        return h;
    }

    calculateElevation() {
        const theta = Math.atan2(this.currentSensor.aZ, Math.sqrt(this.currentSensor.aX * this.currentSensor.aX + this.currentSensor.aY * this.currentSensor.aY));
        let elevation = (theta * 57.295779) + this.ELEVATION_OFFSET;
        return elevation;
    }

    handleButtonA(event) {
        const val = event.target.value.getUint8(0);
        this._btnA = val;
        this._checkComboAndTrigger();
        if (val === 0) this._comboLatched = false;
    }

    handleButtonB(event) {
        const val = event.target.value.getUint8(0);
        this._btnB = val;
        this._checkComboAndTrigger();
        if (val === 0) this._comboLatched = false;
    }

    _checkComboAndTrigger() {
        if (this._btnA === 1 && this._btnB === 1 && !this._comboLatched) {
            this._comboLatched = true;
            
            // ★修正: 1回目と2回目を準備に使い、3回目から記録できるようにする
            if (this.recordAttemptCount < 2) {
                this.recordAttemptCount++;
                if (this.recordAttemptCount === 1) {
                    console.log("1回目の記録操作を検知。");
                    if (this.onStatus) this.onStatus("1回目の準備完了。もう一度押してください");
                } else if (this.recordAttemptCount === 2) {
                    console.log("2回目の記録操作を検知。");
                    if (this.onStatus) this.onStatus("準備完了。次から5秒静止させて記録できます");
                }
                this.playBeep(880, 0.1); 
                return; // ここでは記録しない
            }

            const timeStable = Date.now() - this.lastMovementTime;

            if (timeStable >= 5000) {
                // 5秒間安定している場合
                console.log("機体が安定しています。記録します");
                this.playBeep(1760, 0.1);

                if (this.onStatus) this.onStatus("天体を記録します");
                if (this.onShoot) this.onShoot();
            } else {
                // 5秒間安定していない場合
                console.log("機体が不安定です。記録できません");
                if (this.onStatus) this.onStatus("エラー: 星に向けて5秒間静止してください");
                this.playErrorBeep(); 
            }
        }
    }

    update() {}
}