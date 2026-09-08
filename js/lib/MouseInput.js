export class MouseInput {
    constructor(view, onZoom, onClickRecord) {
        this.view = view;
        this.onZoom = onZoom;
        this.onClickRecord = onClickRecord; 
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.init();
    }

    // 球面ステレオ投影画面上の座標を3D空間レイキャスト用の遠近法座標に逆変換する
    getPerspectiveMouse(mouseX, mouseY, camera) {
        const aspect = window.innerWidth / window.innerHeight;
        const fovRad = camera.fov * Math.PI / 180;
        const tanHalfFov = Math.tan(fovRad * 0.5);
        
        // 四隅を基準にしたスケール計算
        const r_screen_corner = Math.sqrt(aspect * aspect + 1.0);
        const tanThetaCorner = r_screen_corner * tanHalfFov;
        const thetaCorner = Math.atan(tanThetaCorner);
        
        // 四隅のステレオ投影半径
        const r_stereo_corner = Math.tan(thetaCorner * 0.5);
        
        // 画面上の半径（縦横考慮）
        const pX = mouseX * aspect;
        const pY = mouseY;
        const r_screen = Math.sqrt(pX * pX + pY * pY);
        
        // 中心付近のゼロ除算回避
        if (r_screen < 0.0001) {
            return new THREE.Vector2(0, 0);
        }
        
        // 現在のピクセルのステレオ空間での半径
        const r_stereo = r_screen * (r_stereo_corner / r_screen_corner);
        
        // ステレオ逆変換で元の遠近法の角度(tanTheta)を求める
        const tanTheta = (2.0 * r_stereo) / (1.0 - r_stereo * r_stereo);
        
        // 遠近法での正規化半径
        const r_persp_norm = tanTheta / tanHalfFov;
        
        const p_perspX = (pX / r_screen) * r_persp_norm;
        const p_perspY = (pY / r_screen) * r_persp_norm;
        
        return new THREE.Vector2(p_perspX / aspect, p_perspY);
    }

    init() {
        window.addEventListener('wheel', (e) => {
            this.view.camera.fov += e.deltaY * 0.05;
            this.view.camera.fov = Math.max(20, Math.min(100, this.view.camera.fov));
            this.view.camera.updateProjectionMatrix();
        }, { passive: true });

        // 2本指タッチによるピンチイン / ピンチアウト（ズーム）処理
        let prevDistance = null;

        window.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                prevDistance = Math.hypot(dx, dy);
            } else {
                prevDistance = null;
            }
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && prevDistance !== null) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const distance = Math.hypot(dx, dy);

                const delta = prevDistance - distance;
                this.view.camera.fov += delta * 0.1;
                this.view.camera.fov = Math.max(20, Math.min(100, this.view.camera.fov));
                this.view.camera.updateProjectionMatrix();

                prevDistance = distance;
            }
        }, { passive: true });

        window.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) {
                prevDistance = null;
            }
        }, { passive: true });

        window.addEventListener('resize', () => {
            const w = window.innerWidth, h = window.innerHeight;
            this.view.camera.aspect = w / h;
            this.view.camera.updateProjectionMatrix();
            this.view.renderer.setSize(w, h);
            
            if (this.view.renderTarget) {
                this.view.renderTarget.setSize(w * window.devicePixelRatio, h * window.devicePixelRatio);
            }
            
            this.view.hudCamera.left = -w/2;
            this.view.hudCamera.right = w/2;
            this.view.hudCamera.top = h/2;
            this.view.hudCamera.bottom = -h/2;
            this.view.hudCamera.updateProjectionMatrix();
        });

        // クリックイベント
        window.addEventListener('pointerdown', (e) => {
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            
            // 投影後の画面座標から3Dレイキャスト座標へ変換
            const perspMouse = this.getPerspectiveMouse(this.mouse.x, this.mouse.y, this.view.camera);
            this.raycaster.setFromCamera(perspMouse, this.view.camera);
            
            // 記録グループ（月とテキスト）との交差判定
            const intersects = this.raycaster.intersectObjects(this.view.recordGroup.children, true);
            
            let foundRecord = false;

            for (let i = 0; i < intersects.length; i++) {
                const clickedObj = intersects[i].object;
                
                if (clickedObj.userData && clickedObj.userData.isRecord) {
                    if (this.onClickRecord) {
                        this.onClickRecord(clickedObj.userData, e.clientX, e.clientY);
                    }
                    foundRecord = true;
                    break; 
                }
            }
            
            if (!foundRecord && this.onClickRecord) {
                this.onClickRecord(null);
            }
        });
    }

    update() {
        this.view.controls.update();
    }
}