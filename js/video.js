/**
 * AR天球観測機 - ズーム機能搭載・統合版
 * ・マウスホイールで視野角(FOV)ズーム
 * ・地面固定 & 天球回転
 * ・15度刻み高精細グリッド
 */

// --- 1. カメラ映像の初期化 ---
async function initCamera() {
    const video = document.getElementById('video');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false
        });
        video.srcObject = stream;
    } catch (err) {
        console.error("Camera Error:", err);
    }
}
initCamera();

// --- 2. Three.js 基本設定 ---
const canvas = document.querySelector('#main');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0); 
renderer.autoClear = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
// 初期位置: 高さ1.6m, わずかに手前に配置
camera.position.set(0, 1.6, 0.1); 

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.6, 0);
controls.rotateSpeed = -1.0; 
controls.enableDamping = true;
// OrbitControls自体のDollyズームは、位置が変わってしまうため無効化するか、FOVで制御する
controls.enableZoom = false; 

// --- 3. ズーム機能 (FOV制御) ---
window.addEventListener('wheel', (event) => {
    // スクロール量に応じてFOV(視野角)を変更
    camera.fov += event.deltaY * 0.05;
    // 範囲制限: 20(望遠) 〜 100(広角)
    camera.fov = Math.max(20, Math.min(100, camera.fov));
    camera.updateProjectionMatrix();
}, { passive: true });

// --- 4. HUD (中央十字) ---
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

// --- 5. 天球グリッド (回転グループ) ---
const skyGroup = new THREE.Group();
skyGroup.position.y = 1.6; 
scene.add(skyGroup);

const sphereRadius = 100;
const segments = 128;
const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });

// 緯線（0°〜75°）
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

// 経線（地平線から天頂まで）
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

// --- 6. 地面 (世界固定 y=0) ---
// const floor = new THREE.Mesh(
//     new THREE.CircleGeometry(sphereRadius, 64),
//     new THREE.MeshBasicMaterial({ 
//         color: 0x111111, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false 
//     })
// );
// floor.rotation.x = Math.PI / 2;
// floor.position.y = 0; 
// scene.add(floor);

// const floorEdges = new THREE.LineLoop(
//     new THREE.CircleGeometry(sphereRadius, 64),
//     new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
// );
// floorEdges.rotation.x = Math.PI / 2;
// floorEdges.position.y = 0;
// scene.add(floorEdges);

// --- 7. ラベル表示 ---
function createTextSprite(text, color = '#00ff00') {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256; canvas.height = 128;
    ctx.fillStyle = color;
    ctx.font = 'Bold 50px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 64);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
    sprite.scale.set(12, 6, 1);
    return sprite;
}

const directions = [{n:'北', a:0}, {n:'北東', a:45}, {n:'東', a:90}, {n:'南東', a:135}, {n:'南', a:180}, {n:'南西', a:225}, {n:'西', a:270}, {n:'北西', a:315}];
directions.forEach(d => {
    const label = createTextSprite(d.n);
    const rad = (d.a - 90) * (Math.PI / 180);
    label.position.set(Math.cos(rad) * 95, 0, Math.sin(rad) * 95);
    skyGroup.add(label);
});

for (let alt = 15; alt <= 75; alt += 15) {
    const label = createTextSprite(`${alt}°`, '#aaaaaa');
    const rad = alt * (Math.PI / 180);
    label.position.set(0, 95 * Math.sin(rad), -95 * Math.cos(rad));
    label.scale.set(7, 3.5, 1);
    skyGroup.add(label);
}

// --- 8. UI更新 ---
function updateUI() {
    const now = new Date();
    document.getElementById('date').innerText = now.toLocaleDateString('ja-JP');
    document.getElementById('clock').innerText = now.toLocaleTimeString('ja-JP');

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    let az = Math.atan2(dir.x, -dir.z) * (180 / Math.PI);
    if (az < 0) az += 360;
    const kanji = directions[Math.round(az / 45) % 8].n;
    const el = Math.asin(dir.y) * (180 / Math.PI);

    document.getElementById('label-azimuth').innerText = `${kanji} ${az.toFixed(1)}°`;
    document.getElementById('label-elevation').innerText = `${el.toFixed(1)}°`;
}

// --- 9. micro:bit 連携 ---
let rot = { x: 0, y: 0 };
document.getElementById('connectBtn').addEventListener('click', async () => {
    try {
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'BBC micro:bit' }],
            optionalServices: ['e95d0753-251d-470a-a062-fa1922dfa9a8']
        });
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService('e95d0753-251d-470a-a062-fa1922dfa9a8');
        const char = await service.getCharacteristic('e95dca4b-251d-470a-a062-fa1922dfa9a8');
        char.startNotifications();
        char.addEventListener('characteristicvaluechanged', (e) => {
            const d = e.target.value;
            rot.y = (d.getInt16(0, true) / 1000) * Math.PI;
            rot.x = (d.getInt16(2, true) / 1000) * Math.PI;
        });
        document.getElementById('connectBtn').style.display = 'none';
    } catch (e) { console.error(e); }
});

// --- 10. メインループ ---
function animate() {
    requestAnimationFrame(animate);
    
    // micro:bit/マウスによる回転
    skyGroup.rotation.x += (rot.x - skyGroup.rotation.x) * 0.1;
    skyGroup.rotation.y += (rot.y - skyGroup.rotation.y) * 0.1;
    
    controls.update();
    
    // カメラの距離を固定し、FOVズームのみを有効にする
    const dist = 0.1; 
    camera.position.setFromSphericalCoords(
        dist, 
        controls.getPolarAngle(), 
        controls.getAzimuthalAngle()
    );
    camera.position.y += 1.6; 

    updateUI();
    
    renderer.clear();
    renderer.render(scene, camera);
    renderer.render(hudScene, hudCamera);
}
animate();

// リサイズ対応
window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    hudCamera.left = -w/2; hudCamera.right = w/2;
    hudCamera.top = h/2; hudCamera.bottom = -h/2;
    hudCamera.updateProjectionMatrix();
    renderer.setSize(w, h);
});