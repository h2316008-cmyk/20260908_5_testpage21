/**
 * 天球観測シミュレーター (UART版)
 */

// --- 1. Three.js 基本設定 ---
const canvas = document.querySelector('#main');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x00081a, 1); 
renderer.autoClear = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 0.1); 

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.6, 0);
controls.rotateSpeed = -1.0; 
controls.enableDamping = true;
controls.enableZoom = false;

// --- 2. 状態管理 ---
let isSensorMode = false; 
let isMicrobitConnected = false;
// rot: 受信した生の角度(度数法), lerpRot: 補間用の角度(度数法)
let targetRot = { ele: 0, azi: 0 }; 
let currentRot = { ele: 0, azi: 0 }; 
const lerpFactor = 0.1; // 補間係数（滑らかさ）

// モード切替ボタン
const modeBtn = document.getElementById('modeBtn');
modeBtn.addEventListener('click', () => {
    isSensorMode = !isSensorMode;
    modeBtn.innerText = isSensorMode ? "モード: センサー" : "モード: マウス";
    controls.enabled = !isSensorMode; 
});

// --- 3. リアルタイム時計機能 ---
function updateRealTimeClock() {
    const now = new Date();
    const dateEl = document.getElementById('date');
    const clockEl = document.getElementById('clock');
    if (dateEl) dateEl.innerText = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
    if (clockEl) clockEl.innerText = now.toLocaleTimeString();
}

// --- 4. ズーム機能 ---
window.addEventListener('wheel', (event) => {
    camera.fov += event.deltaY * 0.05;
    camera.fov = Math.max(20, Math.min(100, camera.fov));
    camera.updateProjectionMatrix();
}, { passive: true });

// --- 5. HUD (中央十字) ---
const hudScene = new THREE.Scene();
const hudCamera = new THREE.OrthographicCamera(
    -window.innerWidth/2, window.innerWidth/2, window.innerHeight/2, -window.innerHeight/2, 0, 10
);
hudCamera.position.z = 5;

const crossSize = 25;
const crosshair = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-crossSize, 0, 0), new THREE.Vector3(crossSize, 0, 0),
        new THREE.Vector3(0, -crossSize, 0), new THREE.Vector3(0, crossSize, 0)
    ]),
    new THREE.LineBasicMaterial({ color: 0xffffff })
);
hudScene.add(crosshair);

// --- 6. 天球グリッド ---
const skyGroup = new THREE.Group();
skyGroup.position.y = 1.6; 
scene.add(skyGroup);

const sphereRadius = 100;
const segments = 128;
const lineMat = new THREE.LineBasicMaterial({ color: 0x446688, transparent: true, opacity: 0.5 });

// 緯線
for (let lat = 0; lat <= 75; lat += 15) {
    const r = sphereRadius * Math.cos(lat * Math.PI / 180);
    const y = sphereRadius * Math.sin(lat * Math.PI / 180);
    const points = [];
    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(r * Math.cos(theta), y, r * Math.sin(theta)));
    }
    skyGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMat));
}
// 経線
for (let lon = 0; lon < 360; lon += 15) {
    const points = [];
    for (let i = 0; i <= segments / 4; i++) {
        const phi = (i / (segments / 4)) * (Math.PI / 2);
        points.push(new THREE.Vector3(
            sphereRadius * Math.cos(phi) * Math.sin(lon * Math.PI / 180),
            sphereRadius * Math.sin(phi),
            sphereRadius * Math.cos(phi) * Math.cos(lon * Math.PI / 180)
        ));
    }
    skyGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMat));
}
// 地面
const floor = new THREE.Mesh(
    new THREE.CircleGeometry(sphereRadius, 64),
    new THREE.MeshBasicMaterial({ color: 0x704d38, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
);
floor.rotation.x = Math.PI / 2;
scene.add(floor);

// --- 7. ラベル・月配置 ---
function createTextSprite(text, color = '#00ff00', fontSize = 100) {
    const canvasLabel = document.createElement('canvas');
    const ctx = canvasLabel.getContext('2d');
    canvasLabel.width = 512; canvasLabel.height = 128;
    ctx.fillStyle = color; 
    ctx.font = `Bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center'; 
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvasLabel), transparent: true }));
    sprite.scale.set(12, 3, 1);
    return sprite;
}

const directions = [
    {n:'北', a:0}, {n:'北東', a:45}, {n:'東', a:90}, {n:'南東', a:135}, 
    {n:'南', a:180}, {n:'南西', a:225}, {n:'西', a:270}, {n:'北西', a:315}
];
directions.forEach(d => {
    const label = createTextSprite(d.n);
    const rad = (d.a - 90) * (Math.PI / 180);
    label.position.set(Math.cos(rad) * 95, 0, Math.sin(rad) * 95);
    skyGroup.add(label);
});

// 月を配置する関数
function placeMoon() {
    // 現在のカメラの向いている方向ベクトルを取得
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    
    // 月を作成
    const moon = new THREE.Mesh(new THREE.SphereGeometry(2, 32, 32), new THREE.MeshBasicMaterial({ color: 0xfff5aa }));
    const moonPos = direction.clone().multiplyScalar(sphereRadius - 5);
    moon.position.set(moonPos.x, moonPos.y, moonPos.z);
    skyGroup.add(moon);

    // 記録日時ラベル
    const now = new Date();
    const timeStr = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
    const timeLabel = createTextSprite(timeStr, '#ffffff', 35);
    timeLabel.position.set(moonPos.x, moonPos.y - 4, moonPos.z);
    skyGroup.add(timeLabel);
}

// --- 8. HUD数値更新 ---
function updateHUD(elevation, azimuth) {
    const azLabel = document.getElementById('label-azimuth');
    const elLabel = document.getElementById('label-elevation');
    if (azLabel && elLabel) {
        // 方位を0-360に正規化
        let azDisplay = (azimuth + 360) % 360;
        const kanji = directions[Math.round(azDisplay / 45) % 8].n;
        azLabel.innerText = `${kanji} ${azDisplay.toFixed(1)}°`;
        elLabel.innerText = `${elevation.toFixed(1)}°`;
    }
}

// --- 9. micro:bit 接続 (UART) ---
const UUID_UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UUID_UART_TX      = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // micro:bit受信(Write)
const UUID_UART_RX      = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // micro:bit送信(Notify)

// const UUID_ACC_SERVICE = 'e95d0753-251d-470a-a062-fa1922dfa9a8';
// const UUID_ACC_DATA    = 'e95dca4b-251d-470a-a062-fa1922dfa9a8';
// const UUID_MAG_SERVICE = 'e95df2d8-251d-470a-a062-fa1922dfa9a8';
// const UUID_MAG_DATA    = 'e95dfb11-251d-470a-a062-fa1922dfa9a8';
// const UUID_BTN_SERVICE = 'e95d9882-251d-470a-a062-fa1922dfa9a8';
// const UUID_BTN_A       = 'e95dda90-251d-470a-a062-fa1922dfa9a8';
// const UUID_BTN_B       = 'e95dda91-251d-470a-a062-fa1922dfa9a8';



let buffer = ""; // データバッファ

document.getElementById('connectBtn').addEventListener('click', async () => {
    try {
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'BBC micro:bit' }],
            optionalServices: [UUID_UART_SERVICE]
        });
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(UUID_UART_SERVICE);
        const characteristic = await service.getCharacteristic(UUID_UART_RX);

        await characteristic.startNotifications();
        
        // データ受信時の処理
        characteristic.addEventListener('characteristicvaluechanged', (event) => {
            const val = event.target.value;
            const decoder = new TextDecoder();
            const chunk = decoder.decode(val);
            
            // バッファに追加して改行で分割
            buffer += chunk;
            const lines = buffer.split('\n');
            
            // 最後の要素は不完全な可能性があるためバッファに戻す
            buffer = lines.pop();

            for (const line of lines) {
                processData(line.trim());
            }
        });

        isMicrobitConnected = true;
        isSensorMode = true;
        modeBtn.style.display = 'inline-block';
        document.getElementById('connectBtn').style.display = 'none';
        controls.enabled = false;

    } catch (e) {
        alert("接続エラー: " + e);
        console.error(e);
    }
});

// 受信データ処理関数
function processData(dataString) {
    // フォーマット例: "D:45.5,120.2" (Data) または "R:45.5,120.2" (Record)
    const type = dataString.charAt(0);
    const content = dataString.substring(2); // "D:"の次から
    const values = content.split(',');

    if (values.length >= 2) {
        const ele = parseFloat(values[0]);
        const azi = parseFloat(values[1]);

        if (type === 'D') {
            // データ更新
            targetRot.ele = ele;
            targetRot.azi = azi;
        } else if (type === 'R') {
            // 記録トリガー（A+Bボタン）
            // 一瞬ターゲットを強制的に合わせてから月を配置
            targetRot.ele = ele;
            targetRot.azi = azi;
            currentRot.ele = ele;
            currentRot.azi = azi;
            
            // カメラ向きを更新してから月を置く
            updateCameraOrientation(); 
            placeMoon();
        }
    }
}

function updateCameraOrientation() {
    // 角度(Degree)をラジアンに変換してカメラ座標系へ
    // Three.js: Y-up. 
    // Elevation: 0=Horizon, 90=Up.  Phi(0)=Up, Phi(90)=Horizon. => Phi = 90 - Elevation
    // Azimuth: 0=North(Z-?), 90=East(X+). 
    //  Math.sin/cos の座標系に合わせて調整
    
    // 現在値をターゲットに近づける(Lerp)
    currentRot.ele += (targetRot.ele - currentRot.ele) * lerpFactor;
    
    // 方位角の359->0の境界跨ぎ処理
    let diffAzi = targetRot.azi - currentRot.azi;
    if (diffAzi > 180) diffAzi -= 360;
    if (diffAzi < -180) diffAzi += 360;
    currentRot.azi += diffAzi * lerpFactor;

    // HUD更新
    updateHUD(currentRot.ele, currentRot.azi);

    const phi = (90 - currentRot.ele) * (Math.PI / 180);
    const theta = (currentRot.azi - 90) * (Math.PI / 180); // 北(0)がZ-方向になるように補正

    // 球面座標 -> 直交座標
    // x = r * sin(phi) * cos(theta)
    // y = r * cos(phi)
    // z = r * sin(phi) * sin(theta)
    // (Three.jsの座標系に合わせて調整: X=East, Z=Southが標準的だが、-Zを北とする)
    
    const x = Math.sin(phi) * Math.cos(theta);
    const y = Math.cos(phi);
    const z = Math.sin(phi) * Math.sin(theta);

    const lookAtPos = new THREE.Vector3(x, y, z).add(camera.position);
    camera.lookAt(lookAtPos);
}


// --- 10. メインループ ---
function animate() {
    requestAnimationFrame(animate);
    updateRealTimeClock();

    if (isMicrobitConnected && isSensorMode) {
        updateCameraOrientation();
    } else {
        // マウスモード時はOrbitControlsを使用
        controls.update();
        
        // 現在のカメラ向きからHUDを更新
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        
        // Y軸との角度(0が真上)
        const phi = Math.acos(Math.max(-1, Math.min(1, dir.y)));
        const ele = 90 - (phi * 180 / Math.PI);
        
        // XZ平面の角度
        const theta = Math.atan2(dir.z, dir.x);
        let azi = (theta * 180 / Math.PI) + 90;
        if(azi < 0) azi += 360;

        updateHUD(ele, azi);
    }

    renderer.clear();
    renderer.render(scene, camera);
    renderer.render(hudScene, hudCamera);
}
animate();

window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    hudCamera.left = -w/2; hudCamera.right = w/2;
    hudCamera.top = h/2; hudCamera.bottom = -h/2;
    hudCamera.updateProjectionMatrix();
    renderer.setSize(w, h);
});