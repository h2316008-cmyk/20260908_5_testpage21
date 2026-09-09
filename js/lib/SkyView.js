// js/SkyView.js
export class SkyView {
    constructor(canvasId) {
        const canvas = document.querySelector(canvasId);
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x00081a, 1);
        this.renderer.autoClear = false;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 2000);
        this.camera.position.set(0, 1.6, 0.1);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 1.6, 0);
        
        // 変更箇所：
        // 回転スピードを小さくして、少しずつ動くようにする（数値を -0.5 などに変更）
        this.controls.rotateSpeed = -0.5; 
        
        // 慣性（滑るような動き）を無効にし、指で動かした分だけピタッと止まるようにする
        this.controls.enableDamping = false; 
        
        this.controls.enableZoom = false;

        this.renderTarget = new THREE.WebGLRenderTarget(
            window.innerWidth * window.devicePixelRatio,
            window.innerHeight * window.devicePixelRatio,
            { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat }
        );

        this.paniniScene = new THREE.Scene();
        this.paniniCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // --- 球面（ステレオ）投影シェーダー ---
        this.paniniMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: this.renderTarget.texture },
                uFov: { value: this.camera.fov * Math.PI / 180 },
                uAspect: { value: window.innerWidth / window.innerHeight }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float uFov;
                uniform float uAspect;
                varying vec2 vUv;

                void main() {
                    vec2 p = (vUv - 0.5) * 2.0;
                    p.x *= uAspect;

                    float r_screen = length(p);

                    if (r_screen < 0.0001) {
                        gl_FragColor = texture2D(tDiffuse, vUv);
                        return;
                    }

                    float tanHalfFov = tan(uFov * 0.5);
                    float r_screen_corner = sqrt(uAspect * uAspect + 1.0);
                    float tanThetaCorner = r_screen_corner * tanHalfFov;
                    float thetaCorner = atan(tanThetaCorner);

                    float r_stereo_corner = tan(thetaCorner * 0.5);

                    float r_stereo = r_screen * (r_stereo_corner / r_screen_corner);

                    float tanTheta = (2.0 * r_stereo) / (1.0 - r_stereo * r_stereo);

                    float r_persp_norm = tanTheta / tanHalfFov;

                    vec2 p_persp = (p / r_screen) * r_persp_norm;

                    vec2 sampleUv;
                    sampleUv.x = (p_persp.x / uAspect) * 0.5 + 0.5;
                    sampleUv.y = p_persp.y * 0.5 + 0.5;

                    sampleUv = clamp(sampleUv, 0.0, 1.0);
                    gl_FragColor = texture2D(tDiffuse, sampleUv);
                }
            `,
            depthTest: false,
            depthWrite: false
        });

        // 背景画像用のテクスチャローダーを準備
        const textureLoader = new THREE.TextureLoader();

        // 昼用・夜用のテクスチャを保持する変数
        this.textureDay = null;
        this.textureNight = null;

        // 背景用のジオメトリとマテリアルを作成（JPEGのため transparent は不要）
        const bgGeometry = new THREE.SphereGeometry(1050, 64, 32, 0, Math.PI * 2, 0, Math.PI);
        this.bgMaterial = new THREE.MeshBasicMaterial({
            side: THREE.BackSide, 
            depthWrite: false
        });

        const backgroundSphere = new THREE.Mesh(bgGeometry, this.bgMaterial);
        backgroundSphere.rotation.y = Math.PI * 1.5;
        this.scene.add(backgroundSphere);

        // 昼用の背景画像（JPEG）を読み込み
        textureLoader.load('img/background_day.jpg', (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.repeat.x = -1;
            this.textureDay = texture;
            if (this.isDayMode) {
                this.bgMaterial.map = this.textureDay;
                this.bgMaterial.needsUpdate = true;
            }
        });

        // 夜用の背景画像（JPEG）を読み込み
        textureLoader.load('img/background_night.jpg', (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.repeat.x = -1;
            this.textureNight = texture;
            if (!this.isDayMode) {
                this.bgMaterial.map = this.textureNight;
                this.bgMaterial.needsUpdate = true;
            }
        });

        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.paniniMaterial);
        this.paniniScene.add(quad);

        this.skyGroup = new THREE.Group();
        this.skyGroup.position.y = 1.6;
        this.skyGroup.scale.set(1.0, 1.0, 1.0);
        this.scene.add(this.skyGroup);

        this.pointsGroup = new THREE.Group();
        this.skyGroup.add(this.pointsGroup);
        
        this.recordGroup = new THREE.Group();
        this.skyGroup.add(this.recordGroup);

        this.pointMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        this.pointGeometry = new THREE.SphereGeometry(3, 8, 8); 

        this.directions = [
            {n:'北', a:0}, {n:'北東', a:45}, {n:'東', a:90}, {n:'南東', a:135}, 
            {n:'南', a:180}, {n:'南西', a:225}, {n:'西', a:270}, {n:'北西', a:315}
        ];

        this.customMoonTexture = null;
        this.lastRecords = [];
        this.textureCache = {}; // 個別の月のテクスチャをキャッシュするためのオブジェクト

        this.initHUD();
        this.createEnvironment();
        this.isDayMode = false;
    }

    setCustomMoonImage(dataUrl) {
        if (!dataUrl) {
            if (this.customMoonTexture) {
                this.customMoonTexture.dispose();
                this.customMoonTexture = null;
            }
            if (this.lastRecords) {
                this.drawRecords(this.lastRecords);
            }
        }
    }

    initHUD() {
        this.hudScene = new THREE.Scene();
        const w = window.innerWidth, h = window.innerHeight;
        this.hudCamera = new THREE.OrthographicCamera(-w/2, w/2, h/2, -h/2, 0, 10);
        this.hudCamera.position.z = 5;

        const crossSize = 25;
        const crosshair = new THREE.LineSegments(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-crossSize, 0, 0), new THREE.Vector3(crossSize, 0, 0),
                new THREE.Vector3(0, -crossSize, 0), new THREE.Vector3(0, crossSize, 0)
            ]),
            new THREE.LineBasicMaterial({ color: 0xffffff })
        );
        this.crosshair = crosshair; // 非表示制御のために保存
        this.hudScene.add(crosshair);
    }

    setDayNightMode(isDay) {
        if (this.isDayMode === isDay) return; 
        this.isDayMode = isDay;
        
        if (isDay) {
            if (this.textureDay && this.bgMaterial) {
                this.bgMaterial.map = this.textureDay;
                this.bgMaterial.needsUpdate = true;
            }
        } else {
            if (this.textureNight && this.bgMaterial) {
                this.bgMaterial.map = this.textureNight;
                this.bgMaterial.needsUpdate = true;
            }
        }
    }

    createEnvironment() {
        const sphereRadius = 800;
        const lineMat = new THREE.LineBasicMaterial({ color: 0x446688, transparent: true, opacity: 0.5});
        
        for (let lat = 0; lat <= 75; lat += 15) {
            const r = sphereRadius * Math.cos(lat * Math.PI / 180);
            const y = sphereRadius * Math.sin(lat * Math.PI / 180);
            const points = [];
            for (let i = 0; i <= 128; i++) {
                const theta = (i / 128) * Math.PI * 2;
                points.push(new THREE.Vector3(r * Math.cos(theta), y, r * Math.sin(theta)));
            }
            this.skyGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMat));
            
            if(lat > 0){
                [0, 90, 180, 270].forEach(angle => {
                    const rad = angle * (Math.PI / 180);
                    const label = this.createTextSprite(`${lat}°`, '#cccccc', 160);
                    const labelDist = sphereRadius * 0.99;
                    const lx = labelDist * Math.cos(lat * Math.PI / 180) * Math.sin(rad);
                    const lz = labelDist * Math.cos(lat * Math.PI / 180) * Math.cos(rad);
                    label.position.set(lx, y-1, lz);
                    label.scale.set(90, 20, 1);
                    this.skyGroup.add(label);
                });
            }
        }

        for (let lon = 0; lon < 360; lon += 15) {
            const points = [];
            for (let i = 0; i <= 128 / 4; i++) {
                const phi = (i / 32) * (Math.PI / 2);
                points.push(new THREE.Vector3(
                    sphereRadius * Math.cos(phi) * Math.sin(lon * Math.PI / 180),
                    sphereRadius * Math.sin(phi),
                    sphereRadius * Math.cos(phi) * Math.cos(lon * Math.PI / 180)
                ));
            }
            this.skyGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMat));
        }

        const groundGroup = new THREE.Group();
        this.scene.add(groundGroup);
        
        const guideMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
        const crossPoints = [
            new THREE.Vector3(0, 0, -sphereRadius), new THREE.Vector3(0, 0, sphereRadius),
            new THREE.Vector3(-sphereRadius, 0, 0), new THREE.Vector3(sphereRadius, 0, 0)
        ];
        groundGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(crossPoints), guideMat));

        this.directionLabels = []; // 非表示制御のために保存
        this.directions.forEach(d => {
            const label = this.createTextSprite(d.n, '#00ff00', 100);
            const rad = d.a * (Math.PI / 180);
            const dist = 95;
            label.position.set(Math.sin(rad) * dist, 4, -Math.cos(rad) * dist);
            label.scale.set(30, 8, 1); 
            this.skyGroup.add(label);
            this.directionLabels.push(label);
        });
    }

    updateHUDText(elevation, azimuth) {
        const azLabel = document.getElementById('label-azimuth');
        const elLabel = document.getElementById('label-elevation');
        if (azLabel && elLabel) {
            let normalizedAzi = (azimuth + 360) % 360;
            let index = Math.round(normalizedAzi / 45) % 8;
            const dirObj = this.directions[index];
            azLabel.innerText = `${dirObj ? dirObj.n : "--"} ${normalizedAzi.toFixed(1)}°`;
            elLabel.innerText = `${elevation.toFixed(1)}°`;
        }
    }

    showStatusMessage(text, autoHideMs = 2000) {
        const el = document.getElementById('status-message');
        if (!el) return;
        el.innerText = String(text ?? "");
        el.style.display = 'block';
        if (this._statusMessageTimer) clearTimeout(this._statusMessageTimer);
        this._statusMessageTimer = setTimeout(() => { el.style.display = 'none'; }, autoHideMs);
    }
    
    // 追加: 日本語の「午前/午後」を含む日時文字列をタイムスタンプに変換するヘルパー
    parseTimestamp(dateStr, timeStr) {
        const [year, month, day] = dateStr.split('/').map(Number);
        const ampm = timeStr.substring(0, 2);
        const time = timeStr.substring(2);
        let [h, m] = time.split(':').map(Number);
        
        if (ampm === '午後' && h < 12) h += 12;
        if (ampm === '午前' && h === 12) h = 0;
        
        return new Date(year, month - 1, day, h, m).getTime();
    }

    drawRecords(records, isSharedMode = false, filterTimestamp = null) {
        this.lastRecords = records;
        while(this.recordGroup.children.length > 0) { 
            const child = this.recordGroup.children[0];
            this.recordGroup.remove(child);
            
            if(child.material && child.material.map && child.material.map !== this.customMoonTexture) {
                // キャッシュされている個別の月のテクスチャは破棄しない
                let isCached = false;
                for (let key in this.textureCache) {
                    if (this.textureCache[key] === child.material.map) {
                        isCached = true;
                        break;
                    }
                }
                if (!isCached) {
                    child.material.map.dispose();
                }
            }
            if(child.geometry) child.geometry.dispose(); 
            if(child.material) child.material.dispose();
        }

        // 天体画像の基本サイズを設定
        const moonSize = 20; 

        records.forEach(rec => {
            let moonTexture;
            let scaleMultiplier = 1;

            if (rec.name === '月' && rec.moonImageData) {
                // 個別の月の画像が存在する場合はキャッシュから取得、または新規読み込み
                if (!this.textureCache[rec.moonImageData]) {
                    this.textureCache[rec.moonImageData] = new THREE.TextureLoader().load(rec.moonImageData);
                }
                moonTexture = this.textureCache[rec.moonImageData];
            } else if (rec.name === '月' && this.customMoonTexture) {
                // 過去バージョン互換のためのフォールバック
                moonTexture = this.customMoonTexture;
            } else {
                const canvasMoon = document.createElement('canvas');
                const ctxMoon = canvasMoon.getContext('2d');
                canvasMoon.width = 512; 
                canvasMoon.height = 512;
                
                ctxMoon.beginPath();
                ctxMoon.arc(256, 256, 240, 0, Math.PI * 2);

                if (rec.name === '太陽') {
                    ctxMoon.fillStyle = '#ff6600'; 
                    ctxMoon.strokeStyle = '#ff9933';
                } else if (rec.name === '月') {
                    ctxMoon.fillStyle = '#fff5aa'; 
                    ctxMoon.strokeStyle = '#fff9d6';
                } else {
                    ctxMoon.fillStyle = '#ffffff'; 
                    ctxMoon.strokeStyle = '#dddddd';
                    scaleMultiplier = 0.5;
                }

                ctxMoon.fill();
                ctxMoon.lineWidth = 10;
                ctxMoon.stroke();

                moonTexture = new THREE.CanvasTexture(canvasMoon);
            }

            // ★ 修正: depthTest を false にして深度を無視させる
            const moonMaterial = new THREE.SpriteMaterial({ map: moonTexture, transparent: true, depthTest: false });

            // 修正: 共有モードかどうかにかかわらず、タイムスライダーのフィルターを適用
            if (filterTimestamp !== null) {
                // 修正: parseTimestampメソッドを使用して正しい時刻を取得する
                const recTime = this.parseTimestamp(rec.dateStr, rec.timeStr);
                const diff = Math.abs(recTime - filterTimestamp);
                
                // スライダーの時間から前後30分(1800000ミリ秒)を外れた記録はグレーアウトする
                if (diff > 1800000) {
                    moonMaterial.color.setHex(0x555555);
                    moonMaterial.opacity = 0.15;
                }
            }

            const recordMark = new THREE.Sprite(moonMaterial);
            
            // ★ 修正: ワイヤーフレームの手前に強制的に描画するために renderOrder を最大化する
            recordMark.renderOrder = 999;
            
            const currentSize = moonSize * scaleMultiplier;
            recordMark.scale.set(currentSize * 2, currentSize * 2, 1);

            const currentTheta = rec.theta !== undefined ? rec.theta : 0;
            const markPos = new THREE.Vector3(
                990 * Math.sin(rec.phi) * Math.cos(currentTheta),
                990 * Math.cos(rec.phi),
                990 * Math.sin(rec.phi) * Math.sin(currentTheta)
            );
            
            recordMark.position.copy(markPos);

            recordMark.userData = {
                isRecord: true,
                name: rec.name || "", 
                observerName: rec.observerName || "", // 追記: クリック用データに観測者名を渡す
                dateStr: rec.dateStr, 
                timeStr: rec.timeStr,
                elevation: rec.elevation,
                azimuth: rec.azimuth
            };
            this.recordGroup.add(recordMark);

            // 日時ラベルの作成（日付と時刻を表示）
            const labelText = rec.dateStr ? `${rec.dateStr} ${rec.timeStr}` : rec.timeStr;
            const timeLabel = this.createTextSprite(labelText, '#ffffff', 100);
            
            // ★ 修正: 時刻のラベルも最前面に出すために追加
            timeLabel.material.depthTest = false;
            timeLabel.renderOrder = 999;
            
            // 日時ラベルの表示スケールを設定
            timeLabel.scale.set(160, 40, 1); 

            // 画像のサイズ変更に合わせてオフセットを調整
            const offsetPhi = (currentSize + 35) / 990;
            const labelPhi = rec.phi + offsetPhi;
            
            timeLabel.position.set(
                990 * Math.sin(labelPhi) * Math.cos(currentTheta),
                990 * Math.cos(labelPhi),
                990 * Math.sin(labelPhi) * Math.sin(currentTheta)
            );
            
            // 修正: 共有モードかどうかにかかわらず、タイムスライダーのフィルターを適用
            if (filterTimestamp !== null) {
                // 修正: parseTimestampメソッドを使用して正しい時刻を取得する
                const recTime = this.parseTimestamp(rec.dateStr, rec.timeStr);
                if (Math.abs(recTime - filterTimestamp) > 1800000) {
                    timeLabel.material.color.setHex(0x555555);
                    timeLabel.material.opacity = 0.15;
                }
            }

            this.recordGroup.add(timeLabel);
        });
    }

    createTextSprite(text, color = '#00ff00', fontSize = 100) {
        const canvasLabel = document.createElement('canvas');
        const ctx = canvasLabel.getContext('2d');
        canvasLabel.width = 1024; canvasLabel.height = 256;
        ctx.fillStyle = color; ctx.font = `Bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, 512, 128, 980); // maxWidth を 980px に指定して文字のはみ出しを防止
        return new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvasLabel), transparent: true }));
    }

    drawPoints(pointsData) {
        while(this.pointsGroup.children.length > 0) this.pointsGroup.remove(this.pointsGroup.children[0]); 
        const renderRadius = 980;
        pointsData.forEach(p => {
            const pointMesh = new THREE.Mesh(this.pointGeometry, this.pointMaterial);
            pointMesh.position.set(
                renderRadius * Math.sin(p.phi) * Math.cos(p.theta),
                renderRadius * Math.cos(p.phi),
                renderRadius * Math.sin(p.phi) * Math.sin(p.theta)
            );
            this.pointsGroup.add(pointMesh);
        });
    }

    setRadarVisible(isVisible) {
        if (this.crosshair) this.crosshair.visible = isVisible;
        
        // 親コンテナごと消すとステータスメッセージも消えてしまうため、個別のラベルを制御
        const azLabel = document.getElementById('label-azimuth');
        const elLabel = document.getElementById('label-elevation');
        
        if (azLabel) {
            azLabel.style.display = isVisible ? '' : 'none';
        }
        if (elLabel) {
            elLabel.style.display = isVisible ? '' : 'none';
        }
    }

    setDirectionVisible(isVisible) {
        if (this.directionLabels) {
            this.directionLabels.forEach(lbl => {
                lbl.visible = isVisible;
            });
        }
    }

    render() {
        this.paniniMaterial.uniforms.uFov.value = this.camera.fov * Math.PI / 180;
        this.paniniMaterial.uniforms.uAspect.value = window.innerWidth / window.innerHeight;

        this.renderer.setRenderTarget(this.renderTarget);
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);

        this.renderer.setRenderTarget(null);
        this.renderer.clear();
        this.renderer.render(this.paniniScene, this.paniniCamera);

        this.renderer.render(this.hudScene, this.hudCamera);
    }
}