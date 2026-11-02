const { THREE, OrbitControls, CSS3DRenderer, CSS3DObject } = window;

// ==========================================
// 1. CONFIGURATION & CONSTANTS (500 SEATS)
// ==========================================
const ROWS = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
    'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'
]; // 20 rows
const COLS = 25; // 25 seats per row -> 20 * 25 = 500 seats

const SCREEN_WIDTH = 34.0;
const SCREEN_HEIGHT = 14.8;
const SCREEN_POS = new THREE.Vector3(0, 10.4, -18.6);

// State
const seatsData = new Map(); // id -> seat metadata & meshes
const interactiveMeshes = []; // Meshes for raycasting
let currentSeatId = null;
let hoveredSeatId = null;
let lightMode = 1; // 0: Tắt, 1: Mờ (Default), 2: Sáng
let activeMediaMode = 'canvas'; // 'canvas' | 'video' | 'youtube'

// Camera transition animation state
let cameraAnim = null;
// Camera modes: '3rd_person' | '1st_person' | 'overview'
let cameraMode = '3rd_person';
let lastFollowPos = null;

// ==========================================
// 2. SCENE, CAMERA & RENDERERS
// ==========================================
const webglContainer = document.getElementById('webgl-container');
const css3dContainer = document.getElementById('css3d-container');
const nametagsContainer = document.getElementById('nametags-container');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050508);
scene.fog = new THREE.FogExp2(0x050508, 0.007);

const cssScene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    160
);
camera.position.set(0, 7.5, 12);

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
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2 - 0.04; // Không bao giờ chúc xuống dưới mặt sàn
controls.minPolarAngle = 0.15; // Không lộn ngược qua trần nhà
controls.minDistance = 0.6;
controls.maxDistance = 6.8; // Giới hạn khoảng cách bám theo nhân vật, không bị văng ra khỏi rạp
controls.target.set(0, 5, 5);
controls.update();

// ==========================================
// 3. LIGHTING SYSTEM (AUDITORIUM + AMBILIGHT)
// ==========================================
const ambientLight = new THREE.AmbientLight(0x282d44, 0.85);
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

// Screen Ambilight
const screenGlowCenter = new THREE.PointLight(0x4f8cff, 110, 55, 1.2);
screenGlowCenter.position.set(0, SCREEN_POS.y, SCREEN_POS.z + 3.0);
scene.add(screenGlowCenter);

const screenGlowLeft = new THREE.PointLight(0x3b82f6, 60, 45, 1.3);
screenGlowLeft.position.set(-13, SCREEN_POS.y, SCREEN_POS.z + 3.0);
scene.add(screenGlowLeft);

const screenGlowRight = new THREE.PointLight(0xec4899, 60, 45, 1.3);
screenGlowRight.position.set(13, SCREEN_POS.y, SCREEN_POS.z + 3.0);
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
demoCanvas.width = 1920;
demoCanvas.height = 848;
const demoCtx = demoCanvas.getContext('2d');

const demoTexture = new THREE.CanvasTexture(demoCanvas);
demoTexture.minFilter = THREE.LinearFilter;
demoTexture.magFilter = THREE.LinearFilter;
demoTexture.colorSpace = THREE.SRGBColorSpace;

const ambilightCanvas = document.createElement('canvas');
ambilightCanvas.width = 16;
ambilightCanvas.height = 9;
const ambilightCtx = ambilightCanvas.getContext('2d', { willReadFrequently: true });

const stars = Array.from({ length: 150 }, () => ({
    x: (Math.random() - 0.5) * 1920,
    y: (Math.random() - 0.5) * 848,
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
    demoCtx.font = '800 50px "Segoe UI", sans-serif';
    demoCtx.fillText('RẠP PHIM 3D MULTIPLAYER', 0, -25);

    demoCtx.shadowBlur = 14;
    demoCtx.fillStyle = '#93c5fd';
    demoCtx.font = '600 22px "Segoe UI", sans-serif';
    demoCtx.fillText('ĐIỀU KHIỂN NHÂN VẬT • CHỌN CHỖ NGỒI • XEM PHIM CÙNG BẠN BÈ', 0, 25);

    demoCtx.shadowBlur = 0;
    demoCtx.fillStyle = 'rgba(255,255,255,0.75)';
    demoCtx.font = '500 17px "Segoe UI", sans-serif';
    demoCtx.fillText('Dùng phím W, A, S, D di chuyển nhân vật • Nhấn phím E hoặc click ghế để ngồi xem', 0, 72);

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

    // Stage (widescreen stage spanning below the giant screen)
    const stage = new THREE.Mesh(new THREE.BoxGeometry(40, 1.1, 7), stageMat);
    stage.position.set(0, 0.55, -16);
    hallGroup.add(stage);

    const stageLed = new THREE.Mesh(new THREE.BoxGeometry(40, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: 0x3b82f6 }));
    stageLed.position.set(0, 1.11, -12.5);
    hallGroup.add(stageLed);

    // Screen frame
    const frameGeo = new THREE.BoxGeometry(SCREEN_WIDTH + 1.2, SCREEN_HEIGHT + 1.2, 0.6);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 0.4, metalness: 0.5 });
    const screenFrame = new THREE.Mesh(frameGeo, frameMat);
    screenFrame.position.copy(SCREEN_POS);
    screenFrame.position.z -= 0.32;
    hallGroup.add(screenFrame);

    // Screen mesh
    const screenGeo = new THREE.PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT);
    screenMesh = new THREE.Mesh(screenGeo, screenMaterial);
    screenMesh.position.copy(SCREEN_POS);
    hallGroup.add(screenMesh);

    // CSS3D YouTube Screen (High-definition 1600x706 matching giant aspect ratio)
    const ytWrapper = document.createElement('div');
    ytWrapper.style.width = '1600px';
    ytWrapper.style.height = '706px';
    ytWrapper.style.background = '#000';

    youtubeIframe = document.createElement('iframe');
    youtubeIframe.style.width = '1600px';
    youtubeIframe.style.height = '706px';
    youtubeIframe.style.border = 'none';
    youtubeIframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    youtubeIframe.allowFullscreen = true;
    ytWrapper.appendChild(youtubeIframe);

    youtubeCssObject = new CSS3DObject(ytWrapper);
    youtubeCssObject.position.copy(SCREEN_POS);
    youtubeCssObject.scale.set(SCREEN_WIDTH / 1600, SCREEN_HEIGHT / 706, 1);
    youtubeCssObject.visible = false;
    cssScene.add(youtubeCssObject);

    // Side Stage Speaker Arrays flanking the giant screen
    const speakerGeo = new THREE.BoxGeometry(1.6, 7.5, 1.2);
    const speakerMat = new THREE.MeshStandardMaterial({ color: 0x101218, roughness: 0.5, metalness: 0.4 });
    [-18.8, 18.8].forEach(xPos => {
        const spk = new THREE.Mesh(speakerGeo, speakerMat);
        spk.position.set(xPos, SCREEN_POS.y, SCREEN_POS.z + 0.3);
        hallGroup.add(spk);
    });

    // Walls
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

    // Projection window
    const boothGlass = new THREE.Mesh(
        new THREE.PlaneGeometry(4.5, 1.4),
        new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.45 })
    );
    boothGlass.position.set(0, 14.8, 29.05);
    boothGlass.rotation.y = Math.PI;
    hallGroup.add(boothGlass);

    // Acoustic Ribs & Wall Lights
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

    // Risers (20 rows)
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

        [-7.7, 7.7].forEach(ax => {
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

// Determine walking floor elevation anywhere in the hall
function getFloorElevationAt(x, z) {
    if (z < -12.5) {
        return 1.1; // Stage
    }
    if (z < -7.325) {
        return 0.2; // Front walkway
    }
    const r = Math.floor((z - (-7.325)) / 1.65);
    const clampedR = Math.max(0, Math.min(ROWS.length - 1, r));
    return getRowElevation(clampedR);
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

            // Eye position when sitting
            const eyePosition = new THREE.Vector3(x, y + 1.38, z + 0.15);
            // Sit position of avatar base
            const sitPosition = new THREE.Vector3(x, y + 0.42, z + 0.12);

            seatsData.set(seatId, {
                id: seatId,
                row: rowChar,
                rowIndex: rIdx,
                col: c,
                category: cat,
                material: fabricMat,
                group: seatGroup,
                eyePosition,
                sitPosition,
                yaw
            });
        }
    });

    scene.add(allSeatsGroup);
}

// ==========================================
// 7. AVATAR / CHARACTER BUILDER SYSTEM
// ==========================================
function createAvatar(colorHex = '#ef4444', isLocal = false) {
    const avatarGroup = new THREE.Group();

    // Torso (Hoodie / Shirt)
    const shirtMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorHex),
        roughness: 0.6,
        metalness: 0.15
    });
    const skinMat = new THREE.MeshStandardMaterial({
        color: 0xffdfc4,
        roughness: 0.8
    });
    const pantsMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.7
    });
    const shoeMat = new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.5
    });

    // Torso group
    const torsoGroup = new THREE.Group();
    torsoGroup.position.y = 0.92;

    const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), shirtMat);
    torsoMesh.castShadow = true;
    torsoGroup.add(torsoMesh);

    // Head
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.54, 0);

    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), skinMat);
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    // Hair / Cap
    const capMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.1, 16),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 })
    );
    capMesh.position.set(0, 0.16, -0.02);
    headGroup.add(capMesh);

    // 3D Cinema Glasses (Red / Cyan Lenses!)
    const glassesFrame = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.08, 0.04),
        new THREE.MeshBasicMaterial({ color: 0x111111 })
    );
    glassesFrame.position.set(0, 0.03, 0.21);
    headGroup.add(glassesFrame);

    const lensLeft = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.07, 0.02),
        new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.85 })
    );
    lensLeft.position.set(-0.09, 0.03, 0.23);
    headGroup.add(lensLeft);

    const lensRight = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.07, 0.02),
        new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.85 })
    );
    lensRight.position.set(0.09, 0.03, 0.23);
    headGroup.add(lensRight);

    torsoGroup.add(headGroup);

    // Left Arm
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.35, 0.24, 0);
    const leftArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.16), shirtMat);
    leftArmMesh.position.set(0, -0.22, 0);
    leftArmGroup.add(leftArmMesh);
    const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), skinMat);
    leftHand.position.set(0, -0.48, 0);
    leftArmGroup.add(leftHand);
    torsoGroup.add(leftArmGroup);

    // Right Arm
    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.35, 0.24, 0);
    const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.16), shirtMat);
    rightArmMesh.position.set(0, -0.22, 0);
    rightArmGroup.add(rightArmMesh);
    const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), skinMat);
    rightHand.position.set(0, -0.48, 0);
    rightArmGroup.add(rightHand);
    torsoGroup.add(rightArmGroup);

    // Left Leg
    const leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.15, -0.3, 0);
    const leftLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.58, 0.18), pantsMat);
    leftLegMesh.position.set(0, -0.28, 0);
    leftLegGroup.add(leftLegMesh);
    const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.26), shoeMat);
    leftShoe.position.set(0, -0.56, 0.04);
    leftLegGroup.add(leftShoe);
    torsoGroup.add(leftLegGroup);

    // Right Leg
    const rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.15, -0.3, 0);
    const rightLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.58, 0.18), pantsMat);
    rightLegMesh.position.set(0, -0.28, 0);
    rightLegGroup.add(rightLegMesh);
    const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.26), shoeMat);
    rightShoe.position.set(0, -0.56, 0.04);
    rightLegGroup.add(rightShoe);
    torsoGroup.add(rightLegGroup);

    avatarGroup.add(torsoGroup);

    scene.add(avatarGroup);

    return {
        group: avatarGroup,
        torsoGroup,
        headGroup,
        leftArmGroup,
        rightArmGroup,
        leftLegGroup,
        rightLegGroup,
        shirtMat,
        walkCycle: 0,
        isSitting: false,
        updateColor(hex) {
            shirtMat.color.set(hex);
        },
        setSittingPose(sitting) {
            this.isSitting = sitting;
            if (sitting) {
                leftLegGroup.rotation.x = Math.PI / 2;
                rightLegGroup.rotation.x = Math.PI / 2;
                leftArmGroup.rotation.x = 0.45;
                rightArmGroup.rotation.x = 0.45;
                torsoGroup.position.y = 0.62;
            } else {
                leftLegGroup.rotation.x = 0;
                rightLegGroup.rotation.x = 0;
                leftArmGroup.rotation.x = 0;
                rightArmGroup.rotation.x = 0;
                torsoGroup.position.y = 0.92;
            }
        },
        animateWalk(isWalking, delta) {
            if (this.isSitting) return;
            if (isWalking) {
                this.walkCycle += delta * 9.5;
                const swing = Math.sin(this.walkCycle);
                leftLegGroup.rotation.x = swing * 0.55;
                rightLegGroup.rotation.x = -swing * 0.55;
                leftArmGroup.rotation.x = -swing * 0.45;
                rightArmGroup.rotation.x = swing * 0.45;
                torsoGroup.position.y = 0.92 + Math.abs(Math.sin(this.walkCycle * 2)) * 0.04;
            } else {
                leftLegGroup.rotation.x *= 0.85;
                rightLegGroup.rotation.x *= 0.85;
                leftArmGroup.rotation.x *= 0.85;
                rightArmGroup.rotation.x *= 0.85;
                torsoGroup.position.y = 0.92;
            }
        }
    };
}

// ==========================================
// 8. MULTIPLAYER PLAYERS MANAGER
// ==========================================
let localPlayerId = null;
let localPlayerData = {
    name: 'Khán giả #1',
    color: '#ef4444',
    x: 0,
    y: 4.8,
    z: 8.0,
    yaw: 0,
    state: 'standing',
    seatId: null
};

let localAvatar = null;
const remotePlayers = new Map(); // id -> { data, avatar, targetPos, targetYaw, nametagEl }
let ws = null;

function createNametagElement(id, name, color) {
    const el = document.createElement('div');
    el.className = 'player-nametag';
    el.id = `nametag-${id}`;

    const bubble = document.createElement('div');
    bubble.className = 'nametag-bubble hidden';
    bubble.id = `bubble-${id}`;
    el.appendChild(bubble);

    const label = document.createElement('div');
    label.className = 'nametag-label';
    label.innerHTML = `
        <span class="nametag-dot" id="dot-${id}" style="background: ${color};"></span>
        <span id="name-${id}">${name}</span>
    `;
    el.appendChild(label);

    nametagsContainer.appendChild(el);
    return el;
}

function showSpeechBubble(id, text) {
    const bubble = document.getElementById(`bubble-${id}`);
    if (!bubble) return;
    bubble.textContent = text;
    bubble.classList.remove('hidden');

    if (bubble._timer) clearTimeout(bubble._timer);
    bubble._timer = setTimeout(() => {
        bubble.classList.add('hidden');
    }, 4500);
}

// ==========================================
// 9. WEBSOCKET NETWORK SYNCHRONIZATION
// ==========================================
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        document.getElementById('chat-status').textContent = '🟢 Đã kết nối';
        document.getElementById('chat-status').style.color = '#10b981';
    };

    ws.onclose = () => {
        document.getElementById('chat-status').textContent = '🔴 Mất kết nối (Thử lại...)';
        document.getElementById('chat-status').style.color = '#ef4444';
        setTimeout(initWebSocket, 2500);
    };

    ws.onmessage = event => {
        try {
            const msg = JSON.parse(event.data);
            handleNetworkMessage(msg);
        } catch (err) {
            console.error('WS parse error:', err);
        }
    };
}

function handleNetworkMessage(msg) {
    switch (msg.type) {
        case 'welcome': {
            localPlayerId = msg.playerId;
            localPlayerData = msg.playerData;

            try {
                const savedName = localStorage.getItem('cinema_avatar_name');
                const savedColor = localStorage.getItem('cinema_avatar_color');
                if (savedName) localPlayerData.name = savedName;
                if (savedColor) localPlayerData.color = savedColor;
                if (savedName || savedColor) {
                    sendNetwork({
                        type: 'update_profile',
                        name: localPlayerData.name,
                        color: localPlayerData.color
                    });
                }
            } catch (e) {}

            // Spawn local avatar
            localAvatar = createAvatar(localPlayerData.color, true);
            localAvatar.group.position.set(localPlayerData.x, localPlayerData.y, localPlayerData.z);
            localAvatar.group.rotation.y = localPlayerData.yaw;

            createNametagElement(localPlayerId, `${localPlayerData.name} (Bạn)`, localPlayerData.color);

            // Populate existing players
            msg.allPlayers.forEach(p => {
                if (p.id !== localPlayerId) {
                    addRemotePlayer(p);
                }
            });

            updateOnlineCount();

            // Sync video if remote already playing
            if (msg.videoState && msg.videoState.src) {
                applySyncedVideo(msg.videoState);
            }
            break;
        }

        case 'player_joined': {
            if (msg.player.id !== localPlayerId) {
                addRemotePlayer(msg.player);
                addChatMessage('system', `${msg.player.name} vừa bước vào rạp.`);
                updateOnlineCount();
            }
            break;
        }

        case 'player_left': {
            removeRemotePlayer(msg.playerId);
            updateOnlineCount();
            break;
        }

        case 'player_moved': {
            const remote = remotePlayers.get(msg.playerId);
            if (remote) {
                remote.targetPos.set(msg.x, msg.y, msg.z);
                remote.targetYaw = msg.yaw;
                remote.state = msg.state;
                if (msg.seatId !== remote.data.seatId) {
                    remote.data.seatId = msg.seatId;
                    remote.avatar.setSittingPose(msg.state === 'sitting');
                }
            }
            break;
        }

        case 'player_sat': {
            const remote = remotePlayers.get(msg.playerId);
            if (remote) {
                remote.targetPos.set(msg.x, msg.y, msg.z);
                remote.targetYaw = msg.yaw;
                remote.state = 'sitting';
                remote.avatar.setSittingPose(true);
            }
            break;
        }

        case 'player_stood': {
            const remote = remotePlayers.get(msg.playerId);
            if (remote) {
                remote.targetPos.set(msg.x, msg.y, msg.z);
                remote.state = 'standing';
                remote.avatar.setSittingPose(false);
            }
            break;
        }

        case 'player_profile_updated': {
            if (msg.playerId === localPlayerId) {
                localPlayerData.name = msg.name;
                localPlayerData.color = msg.color;
                localAvatar.updateColor(msg.color);
                document.getElementById(`name-${localPlayerId}`).textContent = `${msg.name} (Bạn)`;
                document.getElementById(`dot-${localPlayerId}`).style.background = msg.color;
            } else {
                const remote = remotePlayers.get(msg.playerId);
                if (remote) {
                    remote.data.name = msg.name;
                    remote.data.color = msg.color;
                    remote.avatar.updateColor(msg.color);
                    document.getElementById(`name-${msg.playerId}`).textContent = msg.name;
                    document.getElementById(`dot-${msg.playerId}`).style.background = msg.color;
                }
            }
            break;
        }

        case 'player_chat': {
            addChatMessage('user', msg.text, msg.name);
            showSpeechBubble(msg.playerId, msg.text);
            break;
        }

        case 'player_emote': {
            showSpeechBubble(msg.playerId, msg.emote);
            break;
        }

        case 'video_synced': {
            applySyncedVideo(msg.videoState);
            addChatMessage('system', `${msg.byPlayer} vừa chuyển hoặc phát phim.`);
            break;
        }
    }
}

function addRemotePlayer(player) {
    if (remotePlayers.has(player.id)) return;

    const avatar = createAvatar(player.color, false);
    avatar.group.position.set(player.x, player.y, player.z);
    avatar.group.rotation.y = player.yaw;

    if (player.state === 'sitting') {
        avatar.setSittingPose(true);
    }

    const nametagEl = createNametagElement(player.id, player.name, player.color);

    remotePlayers.set(player.id, {
        data: player,
        avatar,
        targetPos: new THREE.Vector3(player.x, player.y, player.z),
        targetYaw: player.yaw,
        state: player.state,
        nametagEl
    });
}

function removeRemotePlayer(playerId) {
    const remote = remotePlayers.get(playerId);
    if (!remote) return;

    scene.remove(remote.avatar.group);
    if (remote.nametagEl && remote.nametagEl.parentNode) {
        remote.nametagEl.parentNode.removeChild(remote.nametagEl);
    }
    remotePlayers.delete(playerId);
}

function updateOnlineCount() {
    const count = 1 + remotePlayers.size;
    document.getElementById('online-count').textContent = count;
}

function sendNetwork(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

let lastMoveSent = 0;
function broadcastLocalMovement() {
    const now = performance.now();
    if (now - lastMoveSent < 45) return; // ~22 updates/sec
    lastMoveSent = now;

    sendNetwork({
        type: 'move',
        x: Number(localPlayerData.x.toFixed(2)),
        y: Number(localPlayerData.y.toFixed(2)),
        z: Number(localPlayerData.z.toFixed(2)),
        yaw: Number(localPlayerData.yaw.toFixed(2)),
        state: localPlayerData.state,
        seatId: localPlayerData.seatId
    });
}

// ==========================================
// 10. LOCAL CHARACTER SITTING & MOVEMENT
// ==========================================
const interactionHud = document.getElementById('interaction-hud');
const interactionText = document.getElementById('interaction-text');

function sitDownLocalPlayer(seatId) {
    const seat = seatsData.get(seatId);
    if (!seat || !localAvatar) return;

    currentSeatId = seatId;
    localPlayerData.seatId = seatId;
    localPlayerData.state = 'sitting';

    // Position avatar seated squarely on the chair
    localPlayerData.x = seat.sitPosition.x;
    localPlayerData.y = seat.sitPosition.y;
    localPlayerData.z = seat.sitPosition.z;
    localPlayerData.yaw = seat.yaw;

    localAvatar.group.position.copy(seat.sitPosition);
    localAvatar.group.rotation.y = seat.yaw;
    localAvatar.setSittingPose(true);
    localAvatar.group.visible = false; // Ẩn avatar của chính mình khi ngồi để tầm nhìn xem phim 100% không bị che

    sendNetwork({
        type: 'sit',
        seatId: seatId,
        x: localPlayerData.x,
        y: localPlayerData.y,
        z: localPlayerData.z,
        yaw: localPlayerData.yaw
    });

    updateSeatVisuals();
    document.getElementById('current-seat-label').textContent = `Đang ngồi ghế ${seatId}`;
    interactionHud.classList.remove('hidden');
    interactionText.textContent = `Đứng dậy khỏi ghế ${seatId} (Phím E)`;

    // Camera đặt ngang tầm mắt xem phim trực diện lên màn hình IMAX, không bị lưng ghế che
    const eyePos = seat.eyePosition.clone();
    camera.position.set(eyePos.x, eyePos.y + 0.1, eyePos.z - 0.05);
    const dirToScreen = new THREE.Vector3().subVectors(SCREEN_POS, camera.position).normalize();
    const lookTarget = camera.position.clone().add(dirToScreen.multiplyScalar(20));
    controls.target.copy(lookTarget);
    controls.minDistance = 0.05;
    controls.maxDistance = 1.0;
    lastFollowPos = null;
}

function standUpLocalPlayer() {
    if (!localAvatar || !currentSeatId) return;

    const seat = seatsData.get(currentSeatId);
    currentSeatId = null;
    localPlayerData.seatId = null;
    localPlayerData.state = 'standing';

    // Step just in front of the seat
    if (seat) {
        localPlayerData.z -= 0.65;
        localPlayerData.y = getFloorElevationAt(localPlayerData.x, localPlayerData.z);
        localAvatar.group.position.set(localPlayerData.x, localPlayerData.y, localPlayerData.z);
    }
    localAvatar.setSittingPose(false);
    localAvatar.group.visible = true;
    localAvatar.headGroup.visible = true;
    controls.minDistance = 0.6;
    controls.maxDistance = 6.8;
    lastFollowPos = null;

    sendNetwork({
        type: 'stand',
        x: localPlayerData.x,
        y: localPlayerData.y,
        z: localPlayerData.z
    });

    updateSeatVisuals();
    document.getElementById('current-seat-label').textContent = 'Đang đi lại';
    interactionHud.classList.add('hidden');
}

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

function findNearestSeat() {
    if (!localAvatar) return null;
    let nearest = null;
    let minDist = 2.2;
    const pPos = localAvatar.group.position;

    seatsData.forEach(seat => {
        const d = pPos.distanceTo(seat.sitPosition);
        if (d < minDist) {
            minDist = d;
            nearest = seat;
        }
    });
    return nearest;
}

// ==========================================
// 11. RAYCASTING (HOVER & CLICK 500 SEATS)
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
            sitDownLocalPlayer(seatId);
        }
    }
});

// ==========================================
// 12. VIDEO PLAYBACK & SYNCHRONIZATION
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

function switchToCanvasDemo(sync = true) {
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

    if (sync) {
        sendNetwork({
            type: 'sync_video',
            mode: 'canvas',
            src: '',
            title: 'Intro IMAX 3D'
        });
    }
}

function loadDirectVideo(srcUrl, sync = true, startTime = 0) {
    activeMediaMode = 'video';
    youtubeIframe.src = 'about:blank';
    youtubeCssObject.visible = false;
    css3dContainer.classList.remove('youtube-active');
    screenMesh.visible = true;

    videoElement.src = srcUrl;
    videoElement.load();
    if (startTime > 0) {
        videoElement.currentTime = startTime;
    }
    videoElement.play().then(() => {
        btnPlayPause.textContent = 'Tạm dừng';
    }).catch(() => {
        btnPlayPause.textContent = 'Phát phim';
    });

    screenMaterial.map = videoTexture;
    screenMaterial.needsUpdate = true;
    playbackControls.classList.remove('hidden');
    youtubeNotice.classList.add('hidden');

    if (sync) {
        sendNetwork({
            type: 'sync_video',
            mode: 'video',
            src: srcUrl,
            currentTime: startTime,
            isPlaying: true
        });
    }
}

function loadYouTubeVideo(videoId, sync = true) {
    activeMediaMode = 'youtube';
    videoElement.pause();

    youtubeIframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
    youtubeCssObject.visible = true;
    css3dContainer.classList.add('youtube-active');
    playbackControls.classList.add('hidden');
    youtubeNotice.classList.remove('hidden');

    if (sync) {
        sendNetwork({
            type: 'sync_video',
            mode: 'youtube',
            src: videoId,
            isPlaying: true
        });
    }
}

function applySyncedVideo(state) {
    if (state.mode === 'canvas') {
        switchToCanvasDemo(false);
    } else if (state.mode === 'youtube') {
        loadYouTubeVideo(state.src, false);
    } else if (state.mode === 'video') {
        loadDirectVideo(state.src, false, state.currentTime || 0);
        if (!state.isPlaying) {
            videoElement.pause();
            btnPlayPause.textContent = 'Phát phim';
        }
    }
}

document.getElementById('file-upload').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const fileUrl = URL.createObjectURL(file);
    loadDirectVideo(fileUrl, true);
    if (lightMode === 2) applyLightMode(1);
});

function handleUrlSubmit() {
    const rawUrl = document.getElementById('video-url-input').value.trim();
    if (!rawUrl) return;

    const ytId = extractYouTubeId(rawUrl);
    if (ytId) {
        loadYouTubeVideo(ytId, true);
    } else {
        loadDirectVideo(rawUrl, true);
    }
}

document.getElementById('btn-load-url').addEventListener('click', handleUrlSubmit);
document.getElementById('video-url-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleUrlSubmit();
});

document.getElementById('sample-video-select').addEventListener('change', e => {
    const val = e.target.value;
    if (val === 'trailer_canvas') {
        switchToCanvasDemo(true);
    } else {
        loadDirectVideo(val, true);
    }
});

btnPlayPause.addEventListener('click', () => {
    if (activeMediaMode === 'canvas') {
        const sampleSelect = document.getElementById('sample-video-select');
        sampleSelect.selectedIndex = 1;
        loadDirectVideo(sampleSelect.value, true);
        return;
    }
    if (videoElement.paused) {
        videoElement.play();
        btnPlayPause.textContent = 'Tạm dừng';
        sendNetwork({
            type: 'sync_video',
            mode: 'video',
            src: videoElement.src,
            currentTime: videoElement.currentTime,
            isPlaying: true
        });
    } else {
        videoElement.pause();
        btnPlayPause.textContent = 'Phát phim';
        sendNetwork({
            type: 'sync_video',
            mode: 'video',
            src: videoElement.src,
            currentTime: videoElement.currentTime,
            isPlaying: false
        });
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
        sendNetwork({
            type: 'sync_video',
            mode: 'video',
            src: videoElement.src,
            currentTime: videoElement.currentTime,
            isPlaying: !videoElement.paused
        });
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
// 13. CHAT, EMOTES & AVATAR PROFILE MODAL
// ==========================================
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

function addChatMessage(type, text, sender = '') {
    const msgEl = document.createElement('div');
    msgEl.className = `chat-msg ${type}`;
    if (sender) {
        msgEl.innerHTML = `<span class="sender">${sender}:</span><span>${text}</span>`;
    } else {
        msgEl.textContent = text;
    }
    chatMessages.appendChild(msgEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatForm.addEventListener('submit', e => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;

    sendNetwork({
        type: 'chat',
        text: text
    });

    chatInput.value = '';
    chatInput.blur();
});

document.querySelectorAll('.emote-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const emote = btn.dataset.emote;
        sendNetwork({
            type: 'emote',
            emote: emote
        });
    });
});

// Profile Modal & Color Picker
const profileModal = document.getElementById('profile-modal');
const profileNameInput = document.getElementById('profile-name-input');
const colorOptionsContainer = document.getElementById('color-options-container');

const AVATAR_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#10b981',
    '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
];
let selectedColor = '#ef4444';

AVATAR_COLORS.forEach(c => {
    const opt = document.createElement('div');
    opt.className = 'color-option';
    opt.style.background = c;
    opt.dataset.color = c;
    if (c === selectedColor) opt.classList.add('selected');
    opt.addEventListener('click', () => {
        document.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
        opt.classList.add('selected');
        selectedColor = c;
    });
    colorOptionsContainer.appendChild(opt);
});

document.getElementById('btn-profile').addEventListener('click', () => {
    profileNameInput.value = localPlayerData.name;
    selectedColor = localPlayerData.color;
    document.querySelectorAll('.color-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.color === selectedColor);
    });
    profileModal.classList.remove('hidden');
    profileNameInput.focus();
    profileNameInput.select();
});

document.getElementById('btn-close-profile').addEventListener('click', () => {
    profileModal.classList.add('hidden');
});

function saveProfile() {
    const newName = profileNameInput.value.trim() || 'Khán giả';
    localPlayerData.name = newName;
    localPlayerData.color = selectedColor;

    try {
        localStorage.setItem('cinema_avatar_name', newName);
        localStorage.setItem('cinema_avatar_color', selectedColor);
    } catch (e) {}

    sendNetwork({
        type: 'update_profile',
        name: newName,
        color: selectedColor
    });

    profileModal.classList.add('hidden');
}

document.getElementById('btn-save-profile').addEventListener('click', saveProfile);
profileNameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        saveProfile();
    }
});

// ==========================================
// 14. UI INITIALIZATION & 500-SEAT MAP
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
        sitDownLocalPlayer(seatId);
    });

    // Camera Mode toggle (3rd person / 1st person / Overview)
    const btnCameraMode = document.getElementById('btn-camera-mode');
    function toggleCameraMode() {
        lastFollowPos = null;
        if (cameraMode === '3rd_person') {
            cameraMode = '1st_person';
            controls.minDistance = 0.05;
            controls.maxDistance = 0.1;
            btnCameraMode.textContent = '📷 Góc nhìn: Tầm mắt (1st)';
        } else if (cameraMode === '1st_person') {
            cameraMode = 'overview';
            controls.minDistance = 2.0;
            controls.maxDistance = 28.0;
            btnCameraMode.textContent = '📷 Góc nhìn: Toàn cảnh rạp';
            camera.position.set(0, 15.5, 26);
            controls.target.set(0, 6, -6);
        } else {
            cameraMode = '3rd_person';
            controls.minDistance = 0.6;
            controls.maxDistance = 6.8;
            btnCameraMode.textContent = '📷 Góc nhìn: Sau lưng (3rd)';
        }
    }
    btnCameraMode.addEventListener('click', toggleCameraMode);

    // Presets
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.seat) {
                sitDownLocalPlayer(btn.dataset.seat);
            } else if (btn.dataset.preset === 'aisle_center') {
                if (currentSeatId) standUpLocalPlayer();
                localPlayerData.x = 0;
                localPlayerData.z = 8;
                localPlayerData.y = getFloorElevationAt(0, 8);
                localAvatar.group.position.set(0, localPlayerData.y, 8);
                broadcastLocalMovement();
            } else if (btn.dataset.preset === 'stage') {
                if (currentSeatId) standUpLocalPlayer();
                localPlayerData.x = 0;
                localPlayerData.z = -14;
                localPlayerData.y = 1.1;
                localAvatar.group.position.set(0, 1.1, -14);
                broadcastLocalMovement();
            }
        });
    });

    document.getElementById('btn-toggle-lights').addEventListener('click', () => {
        applyLightMode((lightMode + 1) % 3);
    });

    // Hide/Show UI
    const topBar = document.querySelector('.top-bar');
    const sidePanel = document.getElementById('side-panel');
    const chatWidget = document.getElementById('chat-widget');
    const bottomBar = document.getElementById('bottom-bar');
    const btnRestore = document.getElementById('btn-restore-ui');

    function toggleUIVisibility(forceShow) {
        const isHidden = topBar.classList.contains('hidden');
        const show = typeof forceShow === 'boolean' ? forceShow : isHidden;
        topBar.classList.toggle('hidden', !show);
        sidePanel.classList.toggle('hidden', !show);
        chatWidget.classList.toggle('hidden', !show);
        bottomBar.classList.toggle('hidden', !show);
        btnRestore.classList.toggle('hidden', show);
    }

    document.getElementById('btn-toggle-ui').addEventListener('click', () => toggleUIVisibility(false));
    btnRestore.addEventListener('click', () => toggleUIVisibility(true));

    // Collapse/Expand Side Panel & Chat
    const btnCollapseSide = document.getElementById('btn-collapse-side');
    const btnExpandSide = document.getElementById('btn-expand-side');
    if (btnCollapseSide && btnExpandSide) {
        btnCollapseSide.addEventListener('click', () => {
            sidePanel.classList.add('hidden');
            btnExpandSide.classList.remove('hidden');
        });
        btnExpandSide.addEventListener('click', () => {
            sidePanel.classList.remove('hidden');
            btnExpandSide.classList.add('hidden');
        });
    }

    const btnCollapseChat = document.getElementById('btn-collapse-chat');
    const btnExpandChat = document.getElementById('btn-expand-chat');
    if (btnCollapseChat && btnExpandChat) {
        btnCollapseChat.addEventListener('click', () => {
            chatWidget.classList.add('hidden');
            btnExpandChat.classList.remove('hidden');
        });
        btnExpandChat.addEventListener('click', () => {
            chatWidget.classList.remove('hidden');
            btnExpandChat.classList.add('hidden');
        });
    }

    // 2D 500-Seat Map Modal
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
                sitDownLocalPlayer(seatId);
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

    // Keyboard Controls
    const keysPressed = {};
    window.addEventListener('keydown', e => {
        if (document.activeElement.tagName === 'INPUT') return;

        keysPressed[e.code] = true;

        if (e.code === 'KeyE') {
            if (currentSeatId) {
                standUpLocalPlayer();
            } else {
                const near = findNearestSeat();
                if (near) {
                    sitDownLocalPlayer(near.id);
                }
            }
        } else if (e.code === 'KeyV') {
            toggleCameraMode();
        } else if (e.code === 'KeyH') {
            toggleUIVisibility();
        } else if (e.code === 'Enter') {
            chatInput.focus();
        }
    });

    window.addEventListener('keyup', e => {
        keysPressed[e.code] = false;
    });

    window.__keysPressed = keysPressed;
}

// ==========================================
// 15. PROJECTION & FLOATING NAMETAGS LOOP
// ==========================================
const tempVec = new THREE.Vector3();

function updateNametags() {
    const updateOne = (id, pos) => {
        const el = document.getElementById(`nametag-${id}`);
        if (!el) return;

        tempVec.copy(pos);
        tempVec.y += 2.05; // Above character head
        tempVec.project(camera);

        if (tempVec.z > 1.0) {
            el.style.display = 'none';
            return;
        }

        const screenX = (tempVec.x * 0.5 + 0.5) * window.innerWidth;
        const screenY = (-(tempVec.y * 0.5) + 0.5) * window.innerHeight;

        el.style.display = 'flex';
        el.style.transform = `translate(${screenX}px, ${screenY}px) translate(-50%, -100%)`;
    };

    // Only render nametag for local player if they sent a speech bubble/emote (so their own nametag never blocks the cinema screen)
    const localBubble = document.getElementById(`bubble-${localPlayerId}`);
    const isLocalBubbleActive = localBubble && !localBubble.classList.contains('hidden');
    if (localAvatar && localPlayerId && isLocalBubbleActive) {
        updateOne(localPlayerId, localAvatar.group.position);
    } else {
        const localEl = document.getElementById(`nametag-${localPlayerId}`);
        if (localEl) localEl.style.display = 'none';
    }

    remotePlayers.forEach((remote, id) => {
        updateOne(id, remote.avatar.group.position);
    });
}

// ==========================================
// 16. AMBILIGHT SAMPLER
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
        // Fallback for CORS
    }
}

// ==========================================
// 17. MAIN ANIMATION & GAME LOOP
// ==========================================
buildAuditorium();
build500Seats();
initUI();
initWebSocket();
applyLightMode(1);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    cssRenderer.setSize(window.innerWidth, window.innerHeight);
});

let lastTime = performance.now();
let lastAmbilightSample = 0;

function animate(now) {
    requestAnimationFrame(animate);

    const delta = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    // 1. Procedural Demo / Ambilight
    if (activeMediaMode === 'canvas') {
        renderDemoCanvas(now);
    } else if (activeMediaMode === 'video' && now - lastAmbilightSample > 120) {
        sampleVideoAmbilight();
        lastAmbilightSample = now;
    }

    // 2. Local Character Movement
    const keys = window.__keysPressed || {};
    let isMoving = false;

    if (localAvatar && !currentSeatId) {
        const moveVec = new THREE.Vector3();

        // Get camera forward direction projected onto horizontal plane
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        camDir.y = 0;
        camDir.normalize();

        const camRight = new THREE.Vector3().crossVectors(camDir, camera.up).normalize();

        if (keys['KeyW'] || keys['ArrowUp']) moveVec.add(camDir);
        if (keys['KeyS'] || keys['ArrowDown']) moveVec.sub(camDir);
        if (keys['KeyD'] || keys['ArrowRight']) moveVec.add(camRight);
        if (keys['KeyA'] || keys['ArrowLeft']) moveVec.sub(camRight);

        if (moveVec.lengthSq() > 0.001) {
            isMoving = true;
            moveVec.normalize();

            const speed = 5.6 * delta;
            localPlayerData.x += moveVec.x * speed;
            localPlayerData.z += moveVec.z * speed;

            // Boundaries
            localPlayerData.x = Math.max(-19.5, Math.min(19.5, localPlayerData.x));
            localPlayerData.z = Math.max(-18.0, Math.min(27.5, localPlayerData.z));

            // Calculate floor height based on stadium risers
            const targetY = getFloorElevationAt(localPlayerData.x, localPlayerData.z);
            localPlayerData.y += (targetY - localPlayerData.y) * 0.22;

            // Rotate avatar smoothly to face movement direction
            const targetYaw = Math.atan2(moveVec.x, moveVec.z);
            let diff = targetYaw - localPlayerData.yaw;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            localPlayerData.yaw += diff * 0.25;

            localAvatar.group.position.set(localPlayerData.x, localPlayerData.y, localPlayerData.z);
            localAvatar.group.rotation.y = localPlayerData.yaw;

            localPlayerData.state = 'walking';
            broadcastLocalMovement();

            // Check if near any seat
            const nearSeat = findNearestSeat();
            if (nearSeat) {
                interactionHud.classList.remove('hidden');
                interactionText.textContent = `Ngồi vào ghế ${nearSeat.id}`;
            } else {
                interactionHud.classList.add('hidden');
            }
        } else {
            if (localPlayerData.state === 'walking') {
                localPlayerData.state = 'standing';
                broadcastLocalMovement();
            }
        }

        localAvatar.animateWalk(isMoving, delta);

        // Update Camera Position based on mode (Tịnh tiến theo nhân vật mượt mà, KHÔNG bị vòng lặp tự xoay)
        if (cameraMode === '3rd_person') {
            const headPos = new THREE.Vector3(localPlayerData.x, localPlayerData.y + 1.25, localPlayerData.z);
            if (!lastFollowPos) {
                lastFollowPos = headPos.clone();
                controls.target.copy(headPos);
            }
            const deltaMove = new THREE.Vector3().subVectors(headPos, lastFollowPos);
            controls.target.add(deltaMove);
            camera.position.add(deltaMove);
            lastFollowPos.copy(headPos);

            if (currentSeatId) {
                localAvatar.group.visible = false;
            } else {
                localAvatar.group.visible = true;
                const dist = camera.position.distanceTo(controls.target);
                localAvatar.headGroup.visible = (dist > 1.2);
            }
        } else if (cameraMode === '1st_person') {
            const eyePos = new THREE.Vector3(localPlayerData.x, localPlayerData.y + 1.45, localPlayerData.z);
            camera.position.copy(eyePos);
            localAvatar.group.visible = false;
            if (lastFollowPos) lastFollowPos.copy(eyePos);
        } else {
            localAvatar.group.visible = true;
            localAvatar.headGroup.visible = true;
            lastFollowPos = null;
        }
    }

    // 3. Interpolate Remote Players
    remotePlayers.forEach(remote => {
        remote.avatar.group.position.lerp(remote.targetPos, 0.2);

        let diff = remote.targetYaw - remote.avatar.group.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        remote.avatar.group.rotation.y += diff * 0.2;

        const isRemoteMoving = remote.state === 'walking';
        remote.avatar.animateWalk(isRemoteMoving, delta);
    });

    // 4. Update Floating Nametags & Emote Bubbles
    updateNametags();

    controls.update();
    clampCameraWithinAuditorium();
    renderer.render(scene, camera);
    cssRenderer.render(cssScene, camera);
}

// ==========================================
// ROOM BOUNDARY CAMERA COLLISION GUARD
// ==========================================
function clampCameraWithinAuditorium() {
    const minX = -20.2;
    const maxX = 20.2;
    const minZ = -18.2;
    const maxZ = 28.0;
    const maxY = 17.2;

    camera.position.x = Math.max(minX, Math.min(maxX, camera.position.x));
    camera.position.z = Math.max(minZ, Math.min(maxZ, camera.position.z));
    camera.position.y = Math.min(maxY, camera.position.y);

    const floorY = getFloorElevationAt(camera.position.x, camera.position.z);
    camera.position.y = Math.max(floorY + 0.35, camera.position.y);

    // Keep controls target inside room bounds as well
    controls.target.x = Math.max(minX + 0.5, Math.min(maxX - 0.5, controls.target.x));
    controls.target.z = Math.max(minZ + 0.5, Math.min(maxZ - 0.5, controls.target.z));
    controls.target.y = Math.max(0.8, Math.min(maxY - 0.5, controls.target.y));
}

requestAnimationFrame(animate);
