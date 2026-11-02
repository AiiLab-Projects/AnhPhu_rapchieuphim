const { THREE, OrbitControls, CSS3DRenderer, CSS3DObject } = window;

// ==========================================
// 1. CONFIGURATION & CONSTANTS (500 SEATS)
// ==========================================
const ROWS = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
    'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'
]; // 20 rows
const COLS = 25; // 25 seats per row -> 20 * 25 = 500 seats

const SCREEN_WIDTH = 24;
const SCREEN_HEIGHT = 10.2;
const SCREEN_POS = new THREE.Vector3(0, 7.4, -18.5);

// State
const seatsData = new Map(); // id -> seat metadata & meshes
const interactiveMeshes = []; // Meshes for raycasting
let currentSeatId = null;
let hoveredSeatId = null;
let lightMode = 1; // 0: Tắt, 1: Mờ (Default), 2: Sáng
let activeMediaMode = 'canvas'; // 'canvas' | 'video' | 'youtube'

// Camera transition animation state
let cameraAnim = null;

// ==========================================
// 2. SCENE, CAMERA & RENDERERS
// ==========================================
const webglContainer = document.getElementById('webgl-container');
const css3dContainer = document.getElementById('css3d-container');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050508);
scene.fog = new THREE.FogExp2(0x050508, 0.008);

const cssScene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    150
);
camera.position.set(0, 15.5, 27);

// WebGL Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
webglContainer.appendChild(renderer.domElement);

// CSS3D Renderer (for YouTube 3D Screen Integration)
const cssRenderer = new CSS3DRenderer();
cssRenderer.setSize(window.innerWidth, window.innerHeight);
css3dContainer.appendChild(cssRenderer.domElement);

// OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI / 2 + 0.15;
controls.minDistance = 0.3;
controls.maxDistance = 60;
controls.target.set(0, 6.2, -6);
controls.update();

// ==========================================
// 3. LIGHTING SYSTEM (AUDITORIUM + AMBILIGHT)
// ==========================================
const ambientLight = new THREE.AmbientLight(0x222638, 0.8);
scene.add(ambientLight);

// Ceiling Downlights
const ceilingLights = [];
const ceilingLightPositions = [
    [-12, 16.5, -6], [0, 16.5, -6], [12, 16.5, -6],
    [-12, 16.5, 6],  [0, 16.5, 6],  [12, 16.5, 6],
    [-12, 16.5, 18], [0, 16.5, 18], [12, 16.5, 18]
];

ceilingLightPositions.forEach(([x, y, z]) => {
    const pLight = new THREE.PointLight(0xffdfb0, 18, 28, 1.6);
    pLight.position.set(x, y, z);
    scene.add(pLight);
    ceilingLights.push(pLight);

    // Light fixture glow mesh
    const bulbGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.1, 16);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffdfb0 });
    const bulbMesh = new THREE.Mesh(bulbGeo, bulbMat);
    bulbMesh.position.set(x, y + 0.3, z);
    scene.add(bulbMesh);
});

// Screen Ambilight (casts screen glow onto the 500 seats)
const screenGlowCenter = new THREE.PointLight(0x4f8cff, 85, 48, 1.3);
screenGlowCenter.position.set(0, SCREEN_POS.y, SCREEN_POS.z + 2.5);
scene.add(screenGlowCenter);

const screenGlowLeft = new THREE.PointLight(0x3b82f6, 45, 38, 1.4);
screenGlowLeft.position.set(-8, SCREEN_POS.y, SCREEN_POS.z + 2.5);
scene.add(screenGlowLeft);

const screenGlowRight = new THREE.PointLight(0xec4899, 45, 38, 1.4);
screenGlowRight.position.set(8, SCREEN_POS.y, SCREEN_POS.z + 2.5);
scene.add(screenGlowRight);

function applyLightMode(mode) {
    lightMode = mode;
    const btn = document.getElementById('btn-toggle-lights');
    if (mode === 0) {
        ambientLight.intensity = 0.25;
        ceilingLights.forEach(l => (l.intensity = 0));
        btn.textContent = 'Đèn rạp: Tắt';
    } else if (mode === 1) {
        ambientLight.intensity = 0.85;
        ceilingLights.forEach(l => (l.intensity = 16));
        btn.textContent = 'Đèn rạp: Mờ';
    } else {
        ambientLight.intensity = 2.2;
        ceilingLights.forEach(l => (l.intensity = 65));
        btn.textContent = 'Đèn rạp: Sáng';
    }
}

// ==========================================
// 4. VIDEO & PROCEDURAL TRAILER ENGINE
// ==========================================
const videoElement = document.createElement('video');
videoElement.crossOrigin = 'anonymous';
videoElement.playsInline = true;
videoElement.loop = true;
videoElement.volume = 0.8;

const videoTexture = new THREE.VideoTexture(videoElement);
videoTexture.minFilter = THREE.LinearFilter;
videoTexture.magFilter = THREE.LinearFilter;
videoTexture.colorSpace = THREE.SRGBColorSpace;

const demoCanvas = document.createElement('canvas');
demoCanvas.width = 1280;
demoCanvas.height = 544;
const demoCtx = demoCanvas.getContext('2d');

const demoTexture = new THREE.CanvasTexture(demoCanvas);
demoTexture.minFilter = THREE.LinearFilter;
demoTexture.magFilter = THREE.LinearFilter;
demoTexture.colorSpace = THREE.SRGBColorSpace;

const ambilightCanvas = document.createElement('canvas');
ambilightCanvas.width = 16;
ambilightCanvas.height = 9;
const ambilightCtx = ambilightCanvas.getContext('2d', { willReadFrequently: true });

const stars = Array.from({ length: 120 }, () => ({
    x: (Math.random() - 0.5) * 1280,
    y: (Math.random() - 0.5) * 544,
    z: Math.random() * 1000 + 50
}));

function renderDemoCanvas(time) {
    const w = demoCanvas.width;
    const h = demoCanvas.height;
    const t = time * 0.001;

    const grad = demoCtx.createLinearGradient(0, 0, w, h);
    const hue1 = (t * 18) % 360;
    const hue2 = (hue1 + 70) % 360;
    grad.addColorStop(0, `hsl(${hue1}, 75%, 12%)`);
    grad.addColorStop(0.5, `#070a14`);
    grad.addColorStop(1, `hsl(${hue2}, 80%, 15%)`);
    demoCtx.fillStyle = grad;
    demoCtx.fillRect(0, 0, w, h);

    demoCtx.save();
    demoCtx.translate(w / 2, h / 2);
    stars.forEach(star => {
        star.z -= 6;
        if (star.z <= 10) {
            star.z = 1000;
            star.x = (Math.random() - 0.5) * w;
            star.y = (Math.random() - 0.5) * h;
        }
        const sx = (star.x / star.z) * 450;
        const sy = (star.y / star.z) * 450;
        const radius = Math.max(0.8, (1 - star.z / 1000) * 3.5);
        demoCtx.fillStyle = `rgba(255, 255, 255, ${1 - star.z / 1000})`;
        demoCtx.beginPath();
        demoCtx.arc(sx, sy, radius, 0, Math.PI * 2);
        demoCtx.fill();
    });

    for (let i = 0; i < 3; i++) {
        const pulse = ((t * 0.6 + i * 0.33) % 1);
        demoCtx.strokeStyle = `hsla(${(hue1 + i * 40) % 360}, 90%, 60%, ${1 - pulse})`;
        demoCtx.lineWidth = 3;
        demoCtx.beginPath();
        demoCtx.arc(0, 0, pulse * 360, 0, Math.PI * 2);
        demoCtx.stroke();
    }

    demoCtx.textAlign = 'center';
    demoCtx.shadowColor = `hsl(${hue1}, 95%, 60%)`;
    demoCtx.shadowBlur = 28;
    demoCtx.fillStyle = '#ffffff';
    demoCtx.font = '800 54px "Segoe UI", sans-serif';
    demoCtx.fillText('RẠP CHIẾU PHIM IMAX 3D', 0, -25);

    demoCtx.shadowBlur = 14;
    demoCtx.fillStyle = '#93c5fd';
    demoCtx.font = '600 24px "Segoe UI", sans-serif';
    demoCtx.fillText('KHÔNG Gian 500 CHỖ NGỒI • TRẢI NGHIỆM GÓC NHÌN THỰC TẾ', 0, 25);

    demoCtx.shadowBlur = 0;
    demoCtx.fillStyle = 'rgba(255,255,255,0.75)';
    demoCtx.font = '500 18px "Segoe UI", sans-serif';
    demoCtx.fillText('Chọn phim mẫu, tải video từ máy hoặc dán link YouTube ở thanh bên dưới để phát', 0, 72);

    const barCount = 48;
    const barWidth = 14;
    const gap = 6;
    const totalW = barCount * (barWidth + gap);
    for (let i = 0; i < barCount; i++) {
        const bx = -totalW / 2 + i * (barWidth + gap);
        const bh = 12 + Math.abs(Math.sin(t * 4 + i * 0.35) * Math.cos(t * 2.3 - i * 0.2)) * 68;
        demoCtx.fillStyle = `hsl(${(hue1 + i * 3) % 360}, 85%, 60%)`;
        demoCtx.fillRect(bx, h / 2 - bh - 18, barWidth, bh);
    }

    demoCtx.restore();
    demoTexture.needsUpdate = true;

    screenGlowLeft.color.setHSL((hue1 / 360) % 1, 0.8, 0.55);
    screenGlowRight.color.setHSL((hue2 / 360) % 1, 0.8, 0.55);
    screenGlowCenter.color.setHSL(((hue1 + hue2) / 720) % 1, 0.7, 0.6);
}

// ==========================================
// 5. BUILD AUDITORIUM & GIANT SCREEN
// ==========================================
const screenMaterial = new THREE.MeshBasicMaterial({
    map: demoTexture,
    side: THREE.FrontSide
});

let screenMesh;
let youtubeCssObject = null;
let youtubeIframe = null;

function buildAuditorium() {
    const hallGroup = new THREE.Group();

    const floorMat = new THREE.MeshStandardMaterial({
        color: 0x12131a,
        roughness: 0.85,
        metalness: 0.1
    });
    const carpetMat = new THREE.MeshStandardMaterial({
        color: 0x2b0912,
        roughness: 0.92,
        metalness: 0.05
    });
    const wallMat = new THREE.MeshStandardMaterial({
        color: 0x0d0f17,
        roughness: 0.9,
        metalness: 0.1
    });
    const stageMat = new THREE.MeshStandardMaterial({
        color: 0x08090d,
        roughness: 0.6,
        metalness: 0.25
    });
    const ledStripMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });

    const baseFloor = new THREE.Mesh(new THREE.BoxGeometry(44, 0.5, 52), floorMat);
    baseFloor.position.set(0, -0.25, 4);
    hallGroup.add(baseFloor);

    const stage = new THREE.Mesh(new THREE.BoxGeometry(36, 1.1, 7), stageMat);
    stage.position.set(0, 0.55, -16);
    hallGroup.add(stage);

    const stageLed = new THREE.Mesh(new THREE.BoxGeometry(36, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: 0x3b82f6 }));
    stageLed.position.set(0, 1.11, -12.5);
    hallGroup.add(stageLed);

    const frameGeo = new THREE.BoxGeometry(SCREEN_WIDTH + 1.2, SCREEN_HEIGHT + 1.2, 0.6);
    const frameMat = new THREE.MeshStandardMaterial({
        color: 0x050507,
        roughness: 0.4,
        metalness: 0.5
    });
    const screenFrame = new THREE.Mesh(frameGeo, frameMat);
    screenFrame.position.copy(SCREEN_POS);
    screenFrame.position.z -= 0.32;
    hallGroup.add(screenFrame);

    const screenGeo = new THREE.PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT);
    screenMesh = new THREE.Mesh(screenGeo, screenMaterial);
    screenMesh.position.copy(SCREEN_POS);
    hallGroup.add(screenMesh);

    const ytWrapper = document.createElement('div');
    ytWrapper.style.width = '1200px';
    ytWrapper.style.height = '510px';
    ytWrapper.style.background = '#000';

    youtubeIframe = document.createElement('iframe');
    youtubeIframe.style.width = '1200px';
    youtubeIframe.style.height = '510px';
    youtubeIframe.style.border = 'none';
    youtubeIframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    youtubeIframe.allowFullscreen = true;
    ytWrapper.appendChild(youtubeIframe);

    youtubeCssObject = new CSS3DObject(ytWrapper);
    youtubeCssObject.position.copy(SCREEN_POS);
    youtubeCssObject.scale.set(SCREEN_WIDTH / 1200, SCREEN_HEIGHT / 510, 1);
    youtubeCssObject.visible = false;
    cssScene.add(youtubeCssObject);

    const speakerGeo = new THREE.BoxGeometry(1.6, 5.5, 1.2);
    const speakerMat = new THREE.MeshStandardMaterial({ color: 0x101218, roughness: 0.5, metalness: 0.4 });
    [-14.5, 14.5].forEach(xPos => {
        const spk = new THREE.Mesh(speakerGeo, speakerMat);
        spk.position.set(xPos, SCREEN_POS.y, SCREEN_POS.z + 0.3);
        hallGroup.add(spk);
    });

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.8, 19, 52), wallMat);
    leftWall.position.set(-21.5, 9, 4);
    hallGroup.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.8, 19, 52), wallMat);
    rightWall.position.set(21.5, 9, 4);
    hallGroup.add(rightWall);

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(44, 19, 0.8), wallMat);
    backWall.position.set(0, 9, 29.5);
    hallGroup.add(backWall);

    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(44, 19, 0.8), wallMat);
    frontWall.position.set(0, 9, -20);
    hallGroup.add(frontWall);

    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(44, 0.6, 52), wallMat);
    ceiling.position.set(0, 18.2, 4);
    hallGroup.add(ceiling);

    const boothGlass = new THREE.Mesh(
        new THREE.PlaneGeometry(4.5, 1.4),
        new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.45 })
    );
    boothGlass.position.set(0, 14.8, 29.05);
    boothGlass.rotation.y = Math.PI;
    hallGroup.add(boothGlass);

    const panelGeo = new THREE.BoxGeometry(0.35, 11, 2.4);
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x241219, roughness: 0.85 });
    const sconceGeo = new THREE.BoxGeometry(0.15, 2.5, 0.12);
    const sconceMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });

    for (let z = -12; z <= 24; z += 4.5) {
        [-21.0, 21.0].forEach(xSide => {
            const panel = new THREE.Mesh(panelGeo, panelMat);
            panel.position.set(xSide, 8.5, z);
            hallGroup.add(panel);

            const sconce = new THREE.Mesh(sconceGeo, sconceMat);
            sconce.position.set(xSide > 0 ? xSide - 0.22 : xSide + 0.22, 9.5, z + 1.5);
            hallGroup.add(sconce);
        });
    }

    for (let r = 0; r < ROWS.length; r++) {
        const rowY = getRowElevation(r);
        const rowZ = getRowZ(r);
        const riserDepth = 1.65;
        const riserHeight = rowY + 0.15;

        const riserGeo = new THREE.BoxGeometry(41, riserHeight, riserDepth);
        const riserMesh = new THREE.Mesh(riserGeo, floorMat);
        riserMesh.position.set(0, riserHeight / 2 - 0.15, rowZ);
        hallGroup.add(riserMesh);

        const carpetGeo = new THREE.BoxGeometry(40.8, 0.04, riserDepth - 0.06);
        const carpetMesh = new THREE.Mesh(carpetGeo, carpetMat);
        carpetMesh.position.set(0, rowY + 0.02, rowZ);
        hallGroup.add(carpetMesh);

        const aisleXs = [-7.7, 7.7];
        aisleXs.forEach(ax => {
            const stepLight = new THREE.Mesh(
                new THREE.BoxGeometry(1.5, 0.05, 0.06),
                ledStripMat
            );
            stepLight.position.set(ax, rowY + 0.04, rowZ - riserDepth / 2 + 0.05);
            hallGroup.add(stepLight);
        });
    }

    scene.add(hallGroup);
}

// ==========================================
// 6. SEAT COORDINATES & 500-SEAT BUILDER
// ==========================================
function getRowZ(rowIndex) {
    return -6.5 + rowIndex * 1.65;
}

function getRowElevation(rowIndex) {
    return 0.2 + rowIndex * 0.46;
}

function getSeatX(colNumber) {
    const seatSpacing = 1.28;
    const aisleGap = 1.55;
    let x = (colNumber - 13) * seatSpacing;
    if (colNumber <= 6) {
        x -= aisleGap;
    } else if (colNumber >= 20) {
        x += aisleGap;
    }
    return x;
}

function getSeatCategory(rowIndex) {
    if (rowIndex <= 7) {
        return {
            type: 'standard',
            name: 'Ghế Thường (Standard)',
            color: 0x2563eb,
            emissive: 0x0a1936
        };
    } else if (rowIndex <= 17) {
        return {
            type: 'vip',
            name: 'Ghế VIP (Luxury Leather)',
            color: 0xd97706,
            emissive: 0x2e1503
        };
    } else {
        return {
            type: 'couple',
            name: 'Ghế Sweetbox / Couple',
            color: 0xdb2777,
            emissive: 0x33081b
        };
    }
}

const cushionGeo = new THREE.BoxGeometry(0.92, 0.22, 0.82);
const backrestGeo = new THREE.BoxGeometry(0.92, 0.95, 0.2);
const headrestGeo = new THREE.BoxGeometry(0.68, 0.24, 0.24);
const armrestGeo = new THREE.BoxGeometry(0.12, 0.1, 0.72);
const basePedestalGeo = new THREE.CylinderGeometry(0.14, 0.22, 0.38, 8);

const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.5,
    metalness: 0.6
});

function build500Seats() {
    const allSeatsGroup = new THREE.Group();

    ROWS.forEach((rowChar, rIdx) => {
        const y = getRowElevation(rIdx);
        const z = getRowZ(rIdx);
        const cat = getSeatCategory(rIdx);

        for (let c = 1; c <= COLS; c++) {
            const seatId = `${rowChar}${c}`;
            const x = getSeatX(c);

            const fabricMat = new THREE.MeshStandardMaterial({
                color: cat.color,
                emissive: cat.emissive,
                roughness: 0.62,
                metalness: 0.12
            });

            const seatGroup = new THREE.Group();
            seatGroup.position.set(x, y, z);

            let yaw = 0;
            if (c <= 6) yaw = -0.1;
            else if (c >= 20) yaw = 0.1;
            seatGroup.rotation.y = yaw;

            const pedestal = new THREE.Mesh(basePedestalGeo, darkMetalMat);
            pedestal.position.set(0, 0.19, 0);
            seatGroup.add(pedestal);

            const cushion = new THREE.Mesh(cushionGeo, fabricMat);
            cushion.position.set(0, 0.42, 0.04);
            seatGroup.add(cushion);

            const backrest = new THREE.Mesh(backrestGeo, fabricMat);
            backrest.position.set(0, 0.92, 0.36);
            backrest.rotation.x = 0.14;
            seatGroup.add(backrest);

            const headrest = new THREE.Mesh(headrestGeo, fabricMat);
            headrest.position.set(0, 1.42, 0.42);
            headrest.rotation.x = 0.14;
            seatGroup.add(headrest);

            const armL = new THREE.Mesh(armrestGeo, darkMetalMat);
            armL.position.set(-0.48, 0.64, 0.06);
            seatGroup.add(armL);

            const armR = new THREE.Mesh(armrestGeo, darkMetalMat);
            armR.position.set(0.48, 0.64, 0.06);
            seatGroup.add(armR);

            [cushion, backrest, headrest].forEach(mesh => {
                mesh.userData.seatId = seatId;
                interactiveMeshes.push(mesh);
            });

            allSeatsGroup.add(seatGroup);

            const eyePosition = new THREE.Vector3(x, y + 1.38, z + 0.15);

            seatsData.set(seatId, {
                id: seatId,
                row: rowChar,
                rowIndex: rIdx,
                col: c,
                category: cat,
                material: fabricMat,
                group: seatGroup,
                eyePosition
            });
        }
    });

    scene.add(allSeatsGroup);
}

// ==========================================
// 7. SEAT SELECTION & SMOOTH CAMERA FLIGHT
// ==========================================
function updateSeatVisuals() {
    seatsData.forEach((seat, id) => {
        if (id === currentSeatId) {
            seat.material.color.setHex(0x10b981);
            seat.material.emissive.setHex(0x065f46);
        } else if (id === hoveredSeatId) {
            seat.material.color.setHex(0x60a5fa);
            seat.material.emissive.setHex(0x1e3a8a);
        } else {
            seat.material.color.setHex(seat.category.color);
            seat.material.emissive.setHex(seat.category.emissive);
        }
    });

    document.querySelectorAll('.seat-cell').forEach(btn => {
        btn.classList.toggle('current', btn.dataset.seat === currentSeatId);
    });
}

function animateCameraTo(targetPos, targetLookAt, duration = 1100) {
    cameraAnim = {
        startTime: performance.now(),
        duration,
        startPos: camera.position.clone(),
        endPos: targetPos.clone(),
        startLook: controls.target.clone(),
        endLook: targetLookAt.clone()
    };
}

function sitAtSeat(seatId) {
    const seat = seatsData.get(seatId);
    if (!seat) return;

    currentSeatId = seatId;
    updateSeatVisuals();

    document.getElementById('current-seat-label').textContent = `Ghế ${seat.id} (${seat.category.name.split(' ')[1]})`;
    document.getElementById('select-row').value = seat.row;
    document.getElementById('select-col').value = String(seat.col);

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.seat === seatId);
    });

    const eyePos = seat.eyePosition.clone();
    const dirToScreen = new THREE.Vector3()
        .subVectors(SCREEN_POS, eyePos)
        .normalize();
    const lookTarget = eyePos.clone().add(dirToScreen.multiplyScalar(14));

    animateCameraTo(eyePos, lookTarget, 1100);
}

function setPresetCamera(presetName) {
    currentSeatId = null;
    updateSeatVisuals();

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.preset === presetName);
    });

    if (presetName === 'overview') {
        document.getElementById('current-seat-label').textContent = 'Toàn cảnh (Tự do)';
        animateCameraTo(
            new THREE.Vector3(0, 15.5, 27),
            new THREE.Vector3(0, 6.2, -6),
            1200
        );
    } else if (presetName === 'stage') {
        document.getElementById('current-seat-label').textContent = 'Từ sân khấu nhìn xuống 500 ghế';
        animateCameraTo(
            new THREE.Vector3(0, 5.5, -13.5),
            new THREE.Vector3(0, 5.2, 12),
            1200
        );
    }
}

// ==========================================
// 8. RAYCASTING (CLICK & HOVER ON 500 SEATS)
// ==========================================
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tooltip = document.getElementById('seat-tooltip');
const tooltipTitle = document.getElementById('tooltip-title');
const tooltipSubtitle = document.getElementById('tooltip-subtitle');

let pointerDownPos = { x: 0, y: 0 };

renderer.domElement.addEventListener('pointerdown', e => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
});

renderer.domElement.addEventListener('pointermove', e => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(interactiveMeshes, false);

    if (hits.length > 0) {
        const hitSeatId = hits[0].object.userData.seatId;
        if (hitSeatId !== hoveredSeatId) {
            hoveredSeatId = hitSeatId;
            updateSeatVisuals();
        }
        const seat = seatsData.get(hitSeatId);
        if (seat) {
            const section = seat.col <= 6 ? 'Cánh Trái' : seat.col >= 20 ? 'Cánh Phải' : 'Khu Giữa';
            tooltipTitle.textContent = `Ghế ${seat.id} (Hàng ${seat.row} - Số ${seat.col})`;
            tooltipSubtitle.textContent = `${seat.category.name} • ${section}`;
            tooltip.style.left = `${e.clientX}px`;
            tooltip.style.top = `${e.clientY}px`;
            tooltip.classList.remove('hidden');
            renderer.domElement.style.cursor = 'pointer';
        }
    } else {
        if (hoveredSeatId !== null) {
            hoveredSeatId = null;
            updateSeatVisuals();
        }
        tooltip.classList.add('hidden');
        renderer.domElement.style.cursor = 'grab';
    }
});

renderer.domElement.addEventListener('pointerup', e => {
    const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
    if (moveDist > 6) return;

    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(interactiveMeshes, false);

    if (hits.length > 0) {
        const seatId = hits[0].object.userData.seatId;
        if (seatId) {
            sitAtSeat(seatId);
        }
    }
});

// ==========================================
// 9. VIDEO & YOUTUBE MEDIA CONTROLLER
// ==========================================
const btnPlayPause = document.getElementById('btn-play-pause');
const seekBar = document.getElementById('seek-bar');
const timeCurrent = document.getElementById('time-current');
const timeDuration = document.getElementById('time-duration');
const btnMute = document.getElementById('btn-mute');
const volumeBar = document.getElementById('volume-bar');
const playbackControls = document.getElementById('playback-controls');
const youtubeNotice = document.getElementById('youtube-notice');

function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function extractYouTubeId(url) {
    const regExp = /^.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[1].length === 11 ? match[1] : null;
}

function switchToCanvasDemo() {
    activeMediaMode = 'canvas';
    videoElement.pause();
    youtubeIframe.src = 'about:blank';
    youtubeCssObject.visible = false;
    css3dContainer.classList.remove('youtube-active');
    screenMesh.visible = true;
    screenMaterial.map = demoTexture;
    screenMaterial.needsUpdate = true;
    playbackControls.classList.remove('hidden');
    youtubeNotice.classList.add('hidden');
    btnPlayPause.textContent = 'Đang chạy Demo';
}

function loadDirectVideo(srcUrl) {
    activeMediaMode = 'video';
    youtubeIframe.src = 'about:blank';
    youtubeCssObject.visible = false;
    css3dContainer.classList.remove('youtube-active');
    screenMesh.visible = true;

    videoElement.src = srcUrl;
    videoElement.load();
    videoElement.play().then(() => {
        btnPlayPause.textContent = 'Tạm dừng';
    }).catch(() => {
        btnPlayPause.textContent = 'Phát phim';
    });

    screenMaterial.map = videoTexture;
    screenMaterial.needsUpdate = true;
    playbackControls.classList.remove('hidden');
    youtubeNotice.classList.add('hidden');
}

function loadYouTubeVideo(videoId) {
    activeMediaMode = 'youtube';
    videoElement.pause();

    youtubeIframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
    youtubeCssObject.visible = true;
    css3dContainer.classList.add('youtube-active');
    playbackControls.classList.add('hidden');
    youtubeNotice.classList.remove('hidden');
}

document.getElementById('file-upload').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const fileUrl = URL.createObjectURL(file);
    loadDirectVideo(fileUrl);
    if (lightMode === 2) applyLightMode(1);
});

function handleUrlSubmit() {
    const rawUrl = document.getElementById('video-url-input').value.trim();
    if (!rawUrl) return;

    const ytId = extractYouTubeId(rawUrl);
    if (ytId) {
        loadYouTubeVideo(ytId);
    } else {
        loadDirectVideo(rawUrl);
    }
}

document.getElementById('btn-load-url').addEventListener('click', handleUrlSubmit);
document.getElementById('video-url-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleUrlSubmit();
});

document.getElementById('sample-video-select').addEventListener('change', e => {
    const val = e.target.value;
    if (val === 'trailer_canvas') {
        switchToCanvasDemo();
    } else {
        loadDirectVideo(val);
    }
});

btnPlayPause.addEventListener('click', () => {
    if (activeMediaMode === 'canvas') {
        const sampleSelect = document.getElementById('sample-video-select');
        sampleSelect.selectedIndex = 1;
        loadDirectVideo(sampleSelect.value);
        return;
    }
    if (videoElement.paused) {
        videoElement.play();
        btnPlayPause.textContent = 'Tạm dừng';
    } else {
        videoElement.pause();
        btnPlayPause.textContent = 'Phát phim';
    }
});

videoElement.addEventListener('timeupdate', () => {
    if (videoElement.duration) {
        seekBar.value = (videoElement.currentTime / videoElement.duration) * 100;
        timeCurrent.textContent = formatTime(videoElement.currentTime);
        timeDuration.textContent = formatTime(videoElement.duration);
    }
});

seekBar.addEventListener('input', () => {
    if (activeMediaMode === 'video' && videoElement.duration) {
        videoElement.currentTime = (seekBar.value / 100) * videoElement.duration;
    }
});

btnMute.addEventListener('click', () => {
    videoElement.muted = !videoElement.muted;
    btnMute.textContent = videoElement.muted ? 'Đã tắt tiếng' : 'Âm thanh';
});

volumeBar.addEventListener('input', () => {
    videoElement.volume = parseFloat(volumeBar.value);
    videoElement.muted = videoElement.volume === 0;
    btnMute.textContent = videoElement.muted ? 'Đã tắt tiếng' : 'Âm thanh';
});

// ==========================================
// 10. UI CONTROLS, 500-SEAT MAP & KEYBOARD
// ==========================================
function initUI() {
    const selectRow = document.getElementById('select-row');
    const selectCol = document.getElementById('select-col');

    ROWS.forEach((r, idx) => {
        const opt = document.createElement('option');
        opt.value = r;
        const typeLabel = idx <= 7 ? 'Thường' : idx <= 17 ? 'VIP' : 'Sweetbox';
        opt.textContent = `Hàng ${r} (${typeLabel})`;
        if (r === 'I') opt.selected = true;
        selectRow.appendChild(opt);
    });

    for (let c = 1; c <= COLS; c++) {
        const opt = document.createElement('option');
        opt.value = String(c);
        opt.textContent = `Ghế số ${c}${c === 13 ? ' (Giữa)' : ''}`;
        if (c === 13) opt.selected = true;
        selectCol.appendChild(opt);
    }

    document.getElementById('btn-go-seat').addEventListener('click', () => {
        const seatId = `${selectRow.value}${selectCol.value}`;
        sitAtSeat(seatId);
    });

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.seat) {
                sitAtSeat(btn.dataset.seat);
            } else if (btn.dataset.preset) {
                setPresetCamera(btn.dataset.preset);
            }
        });
    });

    document.getElementById('btn-toggle-lights').addEventListener('click', () => {
        applyLightMode((lightMode + 1) % 3);
    });

    const topBar = document.querySelector('.top-bar');
    const sidePanel = document.getElementById('side-panel');
    const bottomBar = document.getElementById('bottom-bar');
    const btnRestore = document.getElementById('btn-restore-ui');

    function toggleUIVisibility(forceShow) {
        const isHidden = topBar.classList.contains('hidden');
        const show = typeof forceShow === 'boolean' ? forceShow : isHidden;
        topBar.classList.toggle('hidden', !show);
        sidePanel.classList.toggle('hidden', !show);
        bottomBar.classList.toggle('hidden', !show);
        btnRestore.classList.toggle('hidden', show);
    }

    document.getElementById('btn-toggle-ui').addEventListener('click', () => toggleUIVisibility(false));
    btnRestore.addEventListener('click', () => toggleUIVisibility(true));

    const seatmapModal = document.getElementById('seatmap-modal');
    const seatmapGrid = document.getElementById('seatmap-grid');

    ROWS.forEach((r, rIdx) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'seat-row';

        const leftLabel = document.createElement('span');
        leftLabel.className = 'row-label';
        leftLabel.textContent = r;
        rowEl.appendChild(leftLabel);

        const cat = getSeatCategory(rIdx);

        for (let c = 1; c <= COLS; c++) {
            if (c === 7 || c === 20) {
                const spacer = document.createElement('span');
                spacer.className = 'aisle-spacer';
                rowEl.appendChild(spacer);
            }
            const seatId = `${r}${c}`;
            const cell = document.createElement('button');
            cell.className = `seat-cell ${cat.type}`;
            cell.dataset.seat = seatId;
            cell.textContent = seatId;
            cell.title = `Ghế ${seatId} - ${cat.name}`;
            cell.addEventListener('click', () => {
                seatmapModal.classList.add('hidden');
                sitAtSeat(seatId);
            });
            rowEl.appendChild(cell);
        }

        const rightLabel = document.createElement('span');
        rightLabel.className = 'row-label';
        rightLabel.textContent = r;
        rowEl.appendChild(rightLabel);

        seatmapGrid.appendChild(rowEl);
    });

    document.getElementById('btn-open-seatmap').addEventListener('click', () => {
        seatmapModal.classList.remove('hidden');
    });
    document.getElementById('btn-close-seatmap').addEventListener('click', () => {
        seatmapModal.classList.add('hidden');
    });
    seatmapModal.addEventListener('click', e => {
        if (e.target === seatmapModal) seatmapModal.classList.add('hidden');
    });

    const keysPressed = {};
    window.addEventListener('keydown', e => {
        if (document.activeElement.tagName === 'INPUT') return;
        keysPressed[e.code] = true;
        if (e.code === 'KeyH') {
            toggleUIVisibility();
        }
    });
    window.addEventListener('keyup', e => {
        keysPressed[e.code] = false;
    });

    window.__keysPressed = keysPressed;
}

// ==========================================
// 11. DYNAMIC VIDEO AMBILIGHT SAMPLER
// ==========================================
function sampleVideoAmbilight() {
    if (activeMediaMode !== 'video' || videoElement.paused || videoElement.readyState < 2) return;
    try {
        ambilightCtx.drawImage(videoElement, 0, 0, 16, 9);
        const data = ambilightCtx.getImageData(0, 0, 16, 9).data;

        const getPixelColor = (x, y) => {
            const idx = (y * 16 + x) * 4;
            return new THREE.Color(data[idx] / 255, data[idx + 1] / 255, data[idx + 2] / 255);
        };

        screenGlowLeft.color.lerp(getPixelColor(3, 4), 0.15);
        screenGlowCenter.color.lerp(getPixelColor(8, 4), 0.15);
        screenGlowRight.color.lerp(getPixelColor(13, 4), 0.15);
    } catch {
        // Fallback if CORS blocks pixel extraction
    }
}

// ==========================================
// 12. INITIALIZATION & ANIMATION LOOP
// ==========================================
buildAuditorium();
build500Seats();
initUI();
applyLightMode(1);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    cssRenderer.setSize(window.innerWidth, window.innerHeight);
});

let lastAmbilightSample = 0;

function animate(now) {
    requestAnimationFrame(animate);

    if (activeMediaMode === 'canvas') {
        renderDemoCanvas(now);
    } else if (activeMediaMode === 'video' && now - lastAmbilightSample > 120) {
        sampleVideoAmbilight();
        lastAmbilightSample = now;
    }

    if (cameraAnim) {
        const elapsed = now - cameraAnim.startTime;
        const t = Math.min(1, elapsed / cameraAnim.duration);
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        camera.position.lerpVectors(cameraAnim.startPos, cameraAnim.endPos, ease);
        controls.target.lerpVectors(cameraAnim.startLook, cameraAnim.endLook, ease);

        if (t >= 1) {
            cameraAnim = null;
        }
    }

    const keys = window.__keysPressed || {};
    if (keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD']) {
        const moveSpeed = 0.22;
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();

        if (keys['KeyW']) {
            camera.position.addScaledVector(forward, moveSpeed);
            controls.target.addScaledVector(forward, moveSpeed);
        }
        if (keys['KeyS']) {
            camera.position.addScaledVector(forward, -moveSpeed);
            controls.target.addScaledVector(forward, -moveSpeed);
        }
        if (keys['KeyD']) {
            camera.position.addScaledVector(right, moveSpeed);
            controls.target.addScaledVector(right, moveSpeed);
        }
        if (keys['KeyA']) {
            camera.position.addScaledVector(right, -moveSpeed);
            controls.target.addScaledVector(right, -moveSpeed);
        }
    }

    controls.update();
    renderer.render(scene, camera);
    cssRenderer.render(cssScene, camera);
}

requestAnimationFrame(animate);
