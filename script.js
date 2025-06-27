import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getAI, getGenerativeModel, GoogleAIBackend } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-ai.js";
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// --- Firebase, AI, 3D Engine Setup ---
// Firebase configuration for AI and other services
const firebaseConfig = { apiKey: "AIzaSyBVpguEIjTnIVOk1Ld0u-BGC7nM-pSww_o", authDomain: "aihoa-ac63b.firebaseapp.com", projectId: "aihoa-ac63b", storageBucket: "aihoa-ac63b.firebasestorage.app", messagingSenderId: "241068548961", appId: "1:241068548961:web:33d4126d020e9372d15b20"};
let model;
try {
    // Initialize Firebase app
    const app = initializeApp(firebaseConfig);
    // Get AI service with GoogleAIBackend
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    // Use gemini-2.5-flash for content generation
    model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });
} catch (e) {
    console.error("Firebase/AI initialization error:", e);
    // Display error if AI cannot be initialized
    displayMessage("Lỗi: Không thể kết nối với AI Engine. Vui lòng kiểm tra console để biết chi tiết.", true);
    document.getElementById('generate-btn').disabled = true;
}

const chamber = document.getElementById('reaction-chamber');
let renderer, scene, camera, controls, composer, mainTimeline;
let molecules = []; // Stores THREE.Group objects representing molecules
let particles;
let solutionContainer; // Declare solution container globally

// For molecule tooltip
const moleculeTooltip = document.getElementById('molecule-tooltip');
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredMolecule = null;

/**
 * Initializes the 3D scene, camera, renderer, lights, controls, and particle system.
 * Handles WebGL error display.
 */
function init3D() {
    chamber.innerHTML = ''; // Clear old WebGL error content if any
    try {
        // Scene, Camera, Renderer setup
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(75, chamber.clientWidth / chamber.clientHeight, 0.1, 1000);
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(chamber.clientWidth, chamber.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        chamber.appendChild(renderer.domElement);

        // Setup Post-processing (Bloom effect) for visual enhancement
        const renderPass = new RenderPass(scene, camera);
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
        bloomPass.threshold = 0;
        bloomPass.strength = 1.2;
        bloomPass.radius = 0.5;
        const outputPass = new OutputPass();

        composer = new EffectComposer(renderer);
        composer.addPass(renderPass);
        composer.addPass(bloomPass);
        composer.addPass(outputPass);

        // Add lights to the scene
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Soft ambient light
        ambientLight.name = "ambientLight"; // Name for easy access
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // Directional light for shadows/highlights
        directionalLight.name = "directionalLight"; // Name for easy access
        directionalLight.position.set(5, 10, 7.5);
        scene.add(directionalLight);

        camera.position.z = 20; // Initial camera position, slightly further out

        // OrbitControls for interactive camera movement
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true; // Smooth camera movement

        // Add particle system for background ambiance
        const particleCount = 1000;
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const particleColor = new THREE.Color(0xffffff); // White particles
        const sphereRadius = 25; // Increased radius
        for (let i = 0; i < particleCount; i++) {
            const u = Math.random();
            const v = Math.random();
            const theta = 2 * Math.PI * u;
            const phi = Math.acos(2 * v - 1);
            const x = sphereRadius * Math.sin(phi) * Math.cos(theta);
            const y = sphereRadius * Math.sin(phi) * Math.sin(theta);
            const z = sphereRadius * Math.cos(phi);
            
            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
            colors[i * 3] = particleColor.r;
            colors[i * 3 + 1] = particleColor.g;
            colors[i * 3 + 2] = particleColor.b;
        }
        const particleGeometry = new THREE.BufferGeometry();
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const particleMaterial = new THREE.PointsMaterial({
            size: 0.1, vertexColors: true, transparent: true,
            opacity: 0.5, blending: THREE.AdditiveBlending
        });
        particles = new THREE.Points(particleGeometry, particleMaterial);
        scene.add(particles);

        // Create solution container
        const solutionGeometry = new THREE.BoxGeometry(12, 12, 12);
        const solutionMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000, transparent: true, opacity: 0.0
        });
        solutionContainer = new THREE.Mesh(solutionGeometry, solutionMaterial);
        solutionContainer.visible = false;
        scene.add(solutionContainer);

        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            if (particles && particles.visible) {
                particles.rotation.y += 0.0005;
                particles.rotation.x += 0.0002;
            }
            composer.render();
        }
        animate();

        window.addEventListener('resize', () => {
            camera.aspect = chamber.clientWidth / chamber.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(chamber.clientWidth, chamber.clientHeight);
            composer.setSize(chamber.clientWidth, chamber.clientHeight);
        });
        chamber.addEventListener('mousemove', onChamberMouseMove, false);
        chamber.addEventListener('mouseleave', () => {
            moleculeTooltip.classList.remove('show');
            hoveredMolecule = null;
        });

    } catch (error) {
        console.error("WebGL initialization error:", error);
        chamber.innerHTML = `<div class="webgl-error-message"><h2>Lỗi WebGL</h2><p>Trình duyệt của bạn có thể không hỗ trợ hoặc WebGL đang bị tắt.</p><p><a href="https://get.webgl.org/" target="_blank">Kiểm tra trạng thái WebGL của bạn tại đây</a></p></div>`;
        generateBtn.disabled = true;
        throw new Error("WebGL init failed");
    }
}

/**
 * Handles mouse movement on the reaction chamber for molecule tooltip.
 * Uses raycasting to detect hovered atoms and display molecule information.
 * @param {MouseEvent} event - The mousemove event.
 */
function onChamberMouseMove(event) {
    const rect = chamber.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const allAtomMeshes = molecules.flatMap(molGroup => molGroup.children.filter(c => c.userData.isAtom));
    const intersects = raycaster.intersectObjects(allAtomMeshes);

    if (intersects.length > 0) {
        const parentMoleculeGroup = intersects[0].object.parent;
        if (hoveredMolecule !== parentMoleculeGroup) {
            hoveredMolecule = parentMoleculeGroup;
            const data = parentMoleculeGroup.userData.moleculeData;
            if (data) {
                let state;
                switch (data.physicalState?.toLowerCase()) {
                    case 'gas': state = 'Khí'; break;
                    case 'liquid': state = 'Lỏng'; break;
                    case 'solid': state = 'Rắn'; break;
                    case 'aqueous': state = 'Dung dịch'; break;
                    default: state = data.physicalState;
                }
                moleculeTooltip.innerHTML = `<strong>${data.molecule}</strong>` +
                    (data.name ? `<br/>Tên: ${data.name}` : '') +
                    (data.molecularWeight ? `<br/>KLPT: ${data.molecularWeight.toFixed(3)} g/mol` : '') +
                    (state ? `<br/>Trạng thái: ${state}` : '');
                moleculeTooltip.style.left = `${event.clientX + 10}px`;
                moleculeTooltip.style.top = `${event.clientY + 10}px`;
                moleculeTooltip.classList.add('show');
            } else {
                moleculeTooltip.classList.remove('show');
            }
        }
    } else if (hoveredMolecule) {
        moleculeTooltip.classList.remove('show');
        hoveredMolecule = null;
    }
}

// --- Core Application Logic ---
const generateBtn = document.getElementById('generate-btn');
const input = document.getElementById('equation-input');
const infoText = document.getElementById('info-text');
const playPauseBtn = document.getElementById('play-pause-btn');
const restartBtn = document.getElementById('restart-btn');
const loadingSpinner = document.getElementById('loading-spinner');
const speedButtons = document.querySelectorAll('.speed-btn');
const timelineSlider = document.getElementById('timeline-slider');
const dragHint = document.getElementById('drag-hint');
const clearInputBtn = document.getElementById('clear-input-btn');
const suggestionsList = document.getElementById('suggestions-list');
const welcomeModalOverlay = document.getElementById('welcome-modal-overlay');
const modalCloseBtn = document.getElementById('modal-close-btn');
const explanationModeToggle = document.getElementById('explanation-mode-toggle');
const explanationModalOverlay = document.getElementById('explanation-modal-overlay');
const explanationTitle = document.getElementById('explanation-title');
const explanationText = document.getElementById('explanation-text');
const explanationContinueBtn = document.getElementById('explanation-continue-btn');
let isExplanationMode = false;
const atomLegendHeader = document.getElementById('atom-legend-header');
const atomLegendContent = document.getElementById('atom-legend-content');
const atomLegendToggle = atomLegendHeader.querySelector('.atom-legend-toggle');

const ATOM_COLORS = [
    { symbol: 'H', color: '#FFFFFF' }, { symbol: 'O', color: '#FF6B6B' }, { symbol: 'C', color: '#333333' },
    { symbol: 'N', color: '#6B9AFF' }, { symbol: 'Fe', color: '#A19D94' }, { symbol: 'S', color: '#FFF36B' },
    { symbol: 'Cl', color: '#6BFF8B' }, { symbol: 'Na', color: '#B06BFF' }, { symbol: 'K', color: '#8A2BE2' },
    { symbol: 'Mg', color: '#BDB76B' }, { symbol: 'Ca', color: '#DDA0DD' }, { symbol: 'Al', color: '#C0C0C0' },
    { symbol: 'P', color: '#FFA500' }, { symbol: 'Br', color: '#A52A2A' }, { symbol: 'I', color: '#4B0082' }
];
const COMMON_CHEMICALS = [
    'H2O', 'CO2', 'O2', 'N2', 'H2', 'CH4', 'C2H5OH', 'NaCl', 'HCl', 'H2SO4',
    'NaOH', 'KMnO4', 'NH3', 'CaO', 'Fe2O3', 'SO2', 'NO2', 'C6H12O6', 'C12H22O11'
];
let currentMessageTimeout;

function displayMessage(message, isError = false) {
    if (currentMessageTimeout) clearTimeout(currentMessageTimeout);
    infoText.textContent = message;
    infoText.classList.toggle('error-message', isError);
    gsap.to(infoText, { opacity: 1, duration: 0.3 });
    if (!isError) {
        currentMessageTimeout = setTimeout(() => gsap.to(infoText, { opacity: 0, duration: 0.5 }), 5000);
    }
}
function toggleDragHint(show) { if (dragHint) dragHint.classList.toggle('show', show); }

function clearScene() {
    molecules.forEach(m => {
        m.traverse(child => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
        scene.remove(m);
    });
    scene.children
        .filter(obj => obj.userData.isEffect || obj.userData.isGasBubble || obj.userData.isPrecipitationParticle)
        .forEach(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
            scene.remove(obj);
        });
    molecules = [];
    if (solutionContainer) {
        solutionContainer.material.color.set(0x000000);
        solutionContainer.material.opacity = 0.0;
        solutionContainer.visible = false;
    }
}

function drawMolecule3D(moleculeDef, x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const atomRadius = 0.5;
    const bondThickness = 0.1;
    const atomMeshes = moleculeDef.atoms.map((atomDef, i) => {
        const geometry = new THREE.SphereGeometry(atomRadius, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(atomDef.color), metalness: 0.4, roughness: 0.4,
            transparent: true, emissive: new THREE.Color(0x000000)
        });
        const atomMesh = new THREE.Mesh(geometry, material);
        if (moleculeDef.atoms.length > 1) {
            const angle = (i / moleculeDef.atoms.length) * 2 * Math.PI;
            const spreadRadius = atomRadius * 1.5;
            atomMesh.position.set(Math.cos(angle) * spreadRadius, Math.sin(angle) * spreadRadius, (Math.random() - 0.5) * atomRadius * 0.5);
        }
        atomMesh.userData = { isAtom: true, symbol: atomDef.symbol };
        group.add(atomMesh);
        return atomMesh;
    });

    const bondMeshes = [];
    // Ensure bonds array exists before iterating
    if (moleculeDef.bonds && Array.isArray(moleculeDef.bonds)) {
        moleculeDef.bonds.forEach(bond => {
            const atomA = atomMeshes[bond.atom1Index];
            const atomB = atomMeshes[bond.atom2Index];
            if (atomA && atomB) {
                const posA = atomA.position, posB = atomB.position;
                const distance = posA.distanceTo(posB);
                const midPoint = new THREE.Vector3().addVectors(posA, posB).divideScalar(2);
                const direction = new THREE.Vector3().subVectors(posB, posA).normalize();
                let perp = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
                if (perp.lengthSq() < 1e-4) perp.set(1, 0, 0).crossVectors(direction, perp).normalize();
                
                let segments = 1, offset = 0;
                switch (bond.bondType) {
                    case 'double': segments = 2; offset = bondThickness * 0.5; break;
                    case 'triple': segments = 3; offset = bondThickness * 0.7; break;
                }
                for (let i = 0; i < segments; i++) {
                    const geom = new THREE.CylinderGeometry(bondThickness, bondThickness, distance, 8);
                    const mat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.2, roughness: 0.6, transparent: true });
                    const mesh = new THREE.Mesh(geom, mat);
                    mesh.position.copy(midPoint);
                    mesh.lookAt(posB);
                    mesh.rotation.x += Math.PI / 2;
                    if (segments > 1) mesh.position.add(perp.clone().multiplyScalar((i - (segments - 1) / 2) * offset));
                    mesh.userData.isBond = true;
                    group.add(mesh);
                    bondMeshes.push(mesh);
                }
            }
        });
    }
    group.userData.moleculeData = { ...moleculeDef, atoms: atomMeshes, bondMeshes: bondMeshes };
    scene.add(group);
    molecules.push(group);
    return group;
}

function createGasBubbles(options) {
    const defaultColor = '#ADD8E6';
    const defaultCount = 30;
    const defaultSize = 0.1;
    const defaultOrigin = { x: 0, y: -5, z: 0 };
    const bubbleColor = options.gas_color || defaultColor;
    const bubbleCount = options.bubble_count || defaultCount;
    const bubbleSize = options.bubble_size || defaultSize;
    const originPoint = options.origin_point || defaultOrigin;
    const bubbleGeometry = new THREE.SphereGeometry(bubbleSize, 16, 16);
    const bubbleMaterial = new THREE.MeshBasicMaterial({ color: bubbleColor, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
    for (let i = 0; i < bubbleCount; i++) {
        const bubble = new THREE.Mesh(bubbleGeometry, bubbleMaterial.clone());
        bubble.position.set(originPoint.x + (Math.random() - 0.5) * 2, originPoint.y + (Math.random() * 2), originPoint.z + (Math.random() - 0.5) * 2);
        bubble.userData.isGasBubble = true;
        scene.add(bubble);
        gsap.to(bubble.position, {
            y: originPoint.y + 15 + Math.random() * 5, x: bubble.position.x + (Math.random() - 0.5) * 3,
            duration: 3 + Math.random() * 2, ease: "none",
            onComplete: () => gsap.to(bubble.material, { opacity: 0, duration: 0.5, onComplete: () => { bubble.geometry.dispose(); bubble.material.dispose(); scene.remove(bubble); } })
        });
    }
}

function createPrecipitationParticles(options) {
    const defaultColor = '#C0C0C0';
    let particleCount = 200, particleSize = 0.08, startY = 5, endY = -5, spread = 5;
    const precipitationColor = options.color || defaultColor;
    const formationArea = options.formation_area || 'bottom';
    switch (options.density || 'medium') {
        case 'light': particleCount = 100; particleSize = 0.05; break;
        case 'heavy': particleCount = 400; particleSize = 0.12; break;
    }
    const precipitationGeometry = new THREE.SphereGeometry(particleSize, 8, 8);
    const precipitationMaterial = new THREE.MeshBasicMaterial({ color: precipitationColor, transparent: true, opacity: 0 });
    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(precipitationGeometry, precipitationMaterial.clone());
        particle.position.set((Math.random() - 0.5) * spread, startY + (Math.random() * 2 - 1) * 2, (Math.random() - 0.5) * spread);
        particle.userData.isPrecipitationParticle = true;
        scene.add(particle);
        const finalY = (formationArea === 'bottom') ? endY + (Math.random() * 2 - 1) * 0.5 : (Math.random() * 2 - 1) * 1;
        gsap.timeline({ delay: Math.random() * 0.5 })
            .to(particle.material, { opacity: 0.8, duration: 1 })
            .to(particle.position, { y: finalY, duration: 2 + Math.random() * 2, ease: "power1.inOut" }, "<");
    }
}

function validateReactionPlan(plan) {
    if (!plan || typeof plan !== 'object') throw new Error("Phản hồi AI không phải là đối tượng hợp lệ.");
    if (!plan.title || typeof plan.title !== 'string') throw new Error("Thiếu 'title' trong phản hồi AI.");
    if (!Array.isArray(plan.reactants)) throw new Error("Thiếu 'reactants' trong phản hồi AI.");
    if (!Array.isArray(plan.products)) throw new Error("Thiếu 'products' trong phản hồi AI.");
    if (!Array.isArray(plan.animationSteps)) throw new Error("Thiếu 'animationSteps' trong phản hồi AI.");
    // Validate existence of isExothermic and bonds
    if (typeof plan.isExothermic !== 'boolean') throw new Error("Thiếu trường 'isExothermic' trong phản hồi AI.");
    const allSubstances = [...plan.reactants, ...plan.products];
    for(const sub of allSubstances){
        if (!Array.isArray(sub.bonds)) throw new Error(`Chất ${sub.molecule} thiếu trường 'bonds' bắt buộc.`);
    }
    return true;
}


// --- Animation Engine (UPDATED) ---
/**
 * Runs the chemical reaction animation based on the provided plan.
 * This version implements the "Chemical Supernova" concept.
 * @param {object} plan - The reaction plan object generated by the AI.
 */
function runAnimation(plan) {
    if (mainTimeline) mainTimeline.kill();
    clearScene();
    
    if (particles) particles.visible = false;
    toggleDragHint(false);
    moleculeTooltip.classList.remove('show');
    hideExplanationModal();
    displayMessage(`Đang chuẩn bị: ${plan.title}`);
    updateAtomLegend(plan);

    mainTimeline = gsap.timeline({
        onUpdate: () => {
            timelineSlider.value = mainTimeline.progress() * 100;
            if (!isExplanationMode) playPauseBtn.textContent = mainTimeline.paused() ? "▶️" : "⏸️";
        },
        onComplete: () => {
            displayMessage("Hoạt ảnh hoàn tất!");
            playPauseBtn.textContent = "▶️";
            [playPauseBtn, restartBtn, timelineSlider, explanationModeToggle, ...speedButtons].forEach(el => el.disabled = true);
            if (particles) particles.visible = true;
            toggleDragHint(true);
        }
    });

    [playPauseBtn, restartBtn, timelineSlider, explanationModeToggle, ...speedButtons].forEach(el => el.disabled = false);
    playPauseBtn.textContent = "⏸️";

    const reactantGroups = [];
    const baseMultiplier = 2;
    plan.reactants.forEach(r => {
        for (let j = 0; j < Math.max(1, r.count) * baseMultiplier; j++) {
            const x = (Math.random() - 0.5) * 16 + (j % 2 === 0 ? -4 : 4);
            const y = (Math.random() - 0.5) * 8;
            const z = (Math.random() - 0.5) * 8;
            reactantGroups.push(drawMolecule3D(r, x, y, z));
        }
    });

    plan.animationSteps.forEach((step, index) => {
        const stepTimeline = gsap.timeline();

        if (step.type === 'move_to_center') {
            // Pha 1: Tụ Bão
            const DURATION = 2.5;
            stepTimeline.to(camera.position, { z: 25, duration: DURATION, ease: "power2.inOut"}, 0);
            
            // **FIXED**: Correctly target light objects for animation
            const ambientLight = scene.getObjectByName("ambientLight");
            const directionalLight = scene.getObjectByName("directionalLight");
            if(ambientLight) stepTimeline.to(ambientLight, { intensity: 0.1, duration: DURATION * 0.8 }, 0);
            if(directionalLight) stepTimeline.to(directionalLight, { intensity: 0.2, duration: DURATION * 0.8 }, 0);
            
            reactantGroups.forEach(group => {
                stepTimeline.to(group.position, {
                    x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 6,
                    duration: DURATION, ease: "power2.inOut"
                }, 0);
                stepTimeline.to(group.rotation, { x: '+=6', y: '+=6', duration: DURATION, ease: "power1.inOut" }, 0);
                stepTimeline.to(group.scale, { x: 1.1, y: 1.1, z: 1.1, yoyo: true, repeat: 3, duration: DURATION / 4}, 0)
            });

        } else if (step.type === 'rearrange') {
            // Pha 2: Kích Nổ
            const REACTION_CENTER = new THREE.Vector3(0, 0, 0);
            const DURATION = 4.0; // Kéo dài thời gian cho hoành tráng hơn
            stepTimeline.addLabel("detonation", "+=0");
            stepTimeline.to(camera.position, { z: 18, duration: DURATION * 0.2, ease: "power3.in" }, "detonation");
            
            const shake = { strength: 0.2 };
            stepTimeline.to(shake, {
                strength: 0, duration: 0.8,
                onUpdate: () => {
                    camera.position.x += (Math.random() - 0.5) * shake.strength;
                    camera.position.y += (Math.random() - 0.5) * shake.strength;
                }
            }, "detonation+=0.1");

            stepTimeline.add(() => {
                // Lõi sáng
                const coreFlash = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending }));
                coreFlash.userData.isEffect = true;
                scene.add(coreFlash);
                gsap.to(coreFlash.scale, { x: 20, y: 20, z: 20, duration: 0.4, ease: "power2.out" });
                gsap.to(coreFlash.material, { opacity: 0, duration: 0.6, ease: "power2.out", onComplete: () => scene.remove(coreFlash) });
                // Sóng xung kích
                const shockwave = new THREE.Mesh(new THREE.TorusGeometry(1, 0.2, 16, 100), new THREE.MeshBasicMaterial({ color: plan.isExothermic ? 0xffa500 : 0x87ceeb, transparent: true, opacity: 0.7 }));
                shockwave.rotation.x = Math.PI / 2;
                shockwave.userData.isEffect = true;
                scene.add(shockwave);
                gsap.to(shockwave.scale, { x: 30, y: 30, z: 30, duration: 1.5, ease: "power1.out" });
                gsap.to(shockwave.material, { opacity: 0, duration: 1.5, ease: "power1.out", onComplete: () => scene.remove(shockwave) });
            }, "detonation+=0.15");

            // Pha 3: Siêu Tân Tinh
            stepTimeline.addLabel("supernova", "detonation+=0.2");
            const detachedAtoms = [];
            reactantGroups.forEach(group => {
                group.traverse(child => {
                    if (child.isMesh) stepTimeline.to(child.material, { opacity: 0, duration: 0.5 }, "detonation");
                });
                group.userData.moleculeData.atoms.forEach(atom => {
                    const worldPos = new THREE.Vector3();
                    atom.getWorldPosition(worldPos);
                    const newAtom = atom.clone(); // Clone để không ảnh hưởng animation fade out của group
                    newAtom.position.copy(worldPos);
                    scene.add(newAtom);
                    detachedAtoms.push(newAtom);
                });
                stepTimeline.add(() => scene.remove(group), "detonation+=0.5");
            });
            reactantGroups.length = 0; molecules = [];
            
            // Vành đai năng lượng
            const ringGeo = new THREE.TorusGeometry(8, 0.1, 16, 100);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
            const energyRing = new THREE.Mesh(ringGeo, ringMat);
            energyRing.rotation.x = Math.PI / 2;
            energyRing.userData.isEffect = true;
            scene.add(energyRing);
            stepTimeline.to(energyRing.material, { opacity: 0.6, duration: 1.0 }, "supernova");
            stepTimeline.to(energyRing.rotation, { z: "+=4", duration: DURATION * 0.8 }, "supernova");
            stepTimeline.to(energyRing.material, { opacity: 0, duration: 1.0, onComplete: () => scene.remove(energyRing) }, `supernova+=${DURATION*0.8 - 1.0}`);


            detachedAtoms.forEach(atom => {
                stepTimeline.to(atom.position, {
                    x: (Math.random() - 0.5) * 20, y: (Math.random() - 0.5) * 20, z: (Math.random() - 0.5) * 20,
                    duration: DURATION * 0.4, ease: "power2.out"
                }, "supernova");
                stepTimeline.to(atom.material.emissive, { r: 1, g: 1, b: 0.5, duration: DURATION * 0.4, ease: "power2.in" }, "supernova");
            });

            // Pha 4 & 5: Tái tạo & Dư âm
            stepTimeline.addLabel("reformation", "supernova+=" + DURATION * 0.4);
            const atomPool = [...detachedAtoms];
            const totalProductInstances = plan.products.reduce((acc, p) => acc + (p.count * baseMultiplier), 0);
            
            let productIndex = 0;
            plan.products.forEach(p => {
                for (let j = 0; j < Math.max(1, p.count) * baseMultiplier; j++) {
                    const angle = (productIndex / totalProductInstances) * Math.PI * 4;
                    const radius = 4 + (productIndex / totalProductInstances) * 8;
                    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius, z = (Math.random() - 0.5) * 6;

                    const productGroup = drawMolecule3D(p, x, y, z);
                    productGroup.traverse(child => { if(child.isMesh) child.material.opacity = 0; });
                    
                    productGroup.userData.moleculeData.atoms.forEach(targetAtom => {
                         const sourceIndex = atomPool.findIndex(a => a.userData.symbol === targetAtom.userData.symbol);
                         const sourceAtom = (sourceIndex !== -1) ? atomPool.splice(sourceIndex, 1)[0] : atomPool.pop();
                         
                         if(sourceAtom){
                             const targetWorldPos = new THREE.Vector3();
                             targetAtom.getWorldPosition(targetWorldPos);
                             
                             stepTimeline.to(sourceAtom.position, {
                                 x: targetWorldPos.x, y: targetWorldPos.y, z: targetWorldPos.z,
                                 duration: DURATION * 0.5, ease: "power3.inOut"
                             }, "reformation");
                             stepTimeline.to(sourceAtom.material, { opacity: 0, duration: DURATION * 0.5 }, "reformation");
                             stepTimeline.to(sourceAtom.material.emissive, { r:0, g:0, b:0, duration: DURATION * 0.5 }, "reformation");
                             stepTimeline.add(()=> {
                                 if(sourceAtom.parent) sourceAtom.parent.remove(sourceAtom);
                                 sourceAtom.geometry.dispose();
                                 sourceAtom.material.dispose();
                             }, `reformation+=${DURATION*0.5}`);
                         }
                    });

                    productGroup.traverse(child => {
                        if (child.isMesh) {
                            stepTimeline.to(child.material, { opacity: 1, duration: DURATION * 0.4 }, `reformation+=${DURATION*0.1}`);
                        }
                    });
                     
                    const emissiveTargets = productGroup.userData.moleculeData.atoms.map(a => a.material.emissive);
                    stepTimeline.to(emissiveTargets, { r: 0.1, g: 0.1, b: 0.1, duration: 0.5, yoyo: true, repeat: 3, ease: "sine.inOut" }, `reformation+=${DURATION*0.5}`);
                    productIndex++;
                }
            });
            
            stepTimeline.to(atomPool.map(a=>a.material), {opacity: 0, duration: 0.5, onComplete: ()=> atomPool.forEach(a=>scene.remove(a))}, 'reformation');
            
            // **FIXED**: Correctly restore light intensity
            const ambientLight = scene.getObjectByName("ambientLight");
            const directionalLight = scene.getObjectByName("directionalLight");
            if(ambientLight) stepTimeline.to(ambientLight, { intensity: 0.5, duration: 2.0 }, "reformation");
            if(directionalLight) stepTimeline.to(directionalLight, { intensity: 1.0, duration: 2.0 }, "reformation");

            stepTimeline.to(camera.position, { z: 25, duration: 2.0 }, "reformation");

        } else if (step.type === 'gas_evolution') {
            stepTimeline.add(() => createGasBubbles(step));
        } else if (step.type === 'precipitation') {
            stepTimeline.add(() => createPrecipitationParticles(step));
        } else if (step.type === 'color_change') {
            stepTimeline.add(() => {
                if (solutionContainer) {
                    solutionContainer.visible = true;
                    // ... (color change logic as before)
                }
            });
        }
        
        mainTimeline.add(stepTimeline);
        mainTimeline.add(() => {
            if (isExplanationMode) {
                mainTimeline.pause();
                showExplanationModal(step.text || `Bước ${index + 1}`, step.explanation, index + 1);
            } else {
                displayMessage(step.text || '...');
            }
        }, ">");
    });
}

/**
 * Generates the reaction plan by calling the AI model and then runs the animation. (UPDATED)
 */
async function generateReactionPlan() {
    if (!model || !renderer) {
        displayMessage("Lỗi: Engine AI hoặc môi trường 3D chưa sẵn sàng.", true);
        return;
    }
    const userInput = input.value.trim();
    if (!userInput) {
        displayMessage("Vui lòng nhập các chất tham gia để tạo phản ứng.", true);
        input.classList.add('input-error');
        updateAtomLegend(null);
        return;
    }
    input.classList.remove('input-error');

    displayMessage('AI đang tư duy... 🧠');
    [generateBtn, playPauseBtn, restartBtn, timelineSlider, explanationModeToggle, ...speedButtons].forEach(el => el.disabled = true);
    loadingSpinner.classList.remove('hidden');
    clearInputBtn.classList.add('hidden');
    moleculeTooltip.classList.remove('show');
    hideExplanationModal();
    if (particles) particles.visible = false;
    toggleDragHint(false);
    updateAtomLegend(null);

    // **FIXED**: The most robust prompt yet.
    const prompt = `
    Từ các chất tham gia: "${userInput}".
    Hãy tạo một kịch bản hoạt ảnh JSON.
    1. Dự đoán sản phẩm hóa học và cân bằng phương trình.
    2. Tạo đối tượng JSON theo cấu trúc được yêu cầu nghiêm ngặt dưới đây.

    CẤU TRÚC JSON:
    - "title": (string) Phương trình hóa học đầy đủ.
    - "isExothermic": (boolean) Phản ứng có tỏa nhiệt không. Đây là trường BẮT BUỘC, vì nó quyết định hiệu ứng hình ảnh cuối cùng. Phải luôn là true hoặc false.
    - "reactants": (array) Mảng các đối tượng chất phản ứng.
    - "products": (array) Mảng các đối tượng sản phẩm.
    - "animationSteps": (array) Một mảng các bước hoạt ảnh.

    QUY TẮC CHO CHẤT PHẢN ỨNG VÀ SẢN PHẨM:
    Mỗi đối tượng chất phải có dạng: {molecule, name, count, molecularWeight, physicalState, atoms: [{symbol, color}], bonds: [...]}.
    **QUY TẮC TỐI QUAN TRỌNG**: Trường "bonds" là BẮT BUỘC cho TẤT CẢ các chất.
    - Nếu chất có nhiều hơn một nguyên tử, "bonds" phải là một mảng các đối tượng liên kết.
    - Nếu chất chỉ có MỘT nguyên tử (ví dụ: Fe, Na, Cu), "bonds" PHẢI là một mảng rỗng: "bonds": [].
    - TUYỆT ĐỐI không được bỏ qua trường "bonds" hoặc trả về null.

    QUY TẮC CHO ANIMATION STEPS:
    Luôn tạo ra đúng 2 bước ĐẦU TIÊN, và bước thứ 3 là tùy chọn:
        1. { "type": "move_to_center", "text": "Các chất phản ứng di chuyển vào trung tâm.", "explanation": "Các phân tử cần đến gần nhau để có thể tương tác và bắt đầu phản ứng." }
        2. { "type": "rearrange", "text": "Phản ứng xảy ra.", "explanation": "Năng lượng va chạm phá vỡ các liên kết hóa học hiện có. Các nguyên tử sau đó tự sắp xếp lại thành các cấu trúc bền vững hơn, tạo thành sản phẩm." }
        3. (Tùy chọn) Thêm MỘT bước hiệu ứng đặc biệt như 'gas_evolution', 'precipitation', hoặc 'color_change' nếu nó thực sự xảy ra.

    Sử dụng các màu sau cho nguyên tử: H: #FFFFFF, O: #FF6B6B, C: #333333, N: #6B9AFF, Fe: #A19D94, S: #FFF36B, Cl: #6BFF8B, Na: #B06BFF, ...
    Chỉ trả lời bằng một khối mã JSON hợp lệ duy nhất.
    `;

    try {
        const result = await model.generateContent(prompt);
        const textResponse = result.response.text();
        let plan;
        try {
            // Robust JSON extraction using regex
            const jsonMatch = textResponse.match(/{[\s\S]*}/);
            if (!jsonMatch) {
                throw new Error("Không tìm thấy đối tượng JSON trong phản hồi của AI.");
            }
            plan = JSON.parse(jsonMatch[0]);
        } catch (jsonError) {
            console.error("Lỗi parsing JSON:", jsonError, "Phản hồi thô:", textResponse);
            throw new Error("Phản hồi của AI không phải là JSON hợp lệ.");
        }
        validateReactionPlan(plan);
        runAnimation(plan);
    } catch (error) {
        console.error("Lỗi:", error);
        displayMessage(`Lỗi: ${error.message}`, true);
        if (particles) particles.visible = true;
        toggleDragHint(true);
    } finally {
        generateBtn.disabled = false;
        loadingSpinner.classList.add('hidden');
        if (input.value.length > 0) clearInputBtn.classList.remove('hidden');
    }
}

// --- UI and Event Listeners ---
function updateInputState() {
    const value = input.value.trim();
    clearInputBtn.classList.toggle('hidden', value.length === 0);
    input.classList.remove('input-error', 'input-valid');
    if (value.length > 0) {
        if (/^[A-Za-z0-9\s\+->]*$/.test(value)) {
             input.classList.add('input-valid');
        } else {
             input.classList.add('input-error');
        }
    }
}
function showSuggestions(query) {
    suggestionsList.innerHTML = '';
    if (query.length < 1) {
        suggestionsList.classList.remove('show');
        return;
    }
    const filteredSuggestions = COMMON_CHEMICALS.filter(chem => chem.toLowerCase().includes(query.toLowerCase()));
    if (filteredSuggestions.length > 0) {
        filteredSuggestions.forEach(suggestion => {
            const item = document.createElement('div');
            item.classList.add('suggestion-item');
            item.textContent = suggestion;
            item.addEventListener('click', () => {
                input.value = suggestion;
                suggestionsList.classList.remove('show');
                updateInputState();
            });
            suggestionsList.appendChild(item);
        });
        suggestionsList.classList.add('show');
    } else {
        suggestionsList.classList.remove('show');
    }
}
input.addEventListener('input', () => { updateInputState(); showSuggestions(input.value); });
document.addEventListener('click', (e) => { if (!input.contains(e.target) && !suggestionsList.contains(e.target)) suggestionsList.classList.remove('show'); });
clearInputBtn.addEventListener('click', () => { input.value = ''; updateInputState(); suggestionsList.classList.remove('show'); displayMessage("Đầu vào đã được xóa."); });
playPauseBtn.addEventListener('click', () => { if (mainTimeline) { mainTimeline.paused(!mainTimeline.paused()); if (!mainTimeline.paused() && isExplanationMode) hideExplanationModal(); } });
restartBtn.addEventListener('click', () => { if (mainTimeline) mainTimeline.restart(); hideExplanationModal(); });
speedButtons.forEach(button => button.addEventListener('click', (e) => {
    const speed = parseFloat(e.target.dataset.speed);
    if (mainTimeline) mainTimeline.timeScale(speed);
    speedButtons.forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
}));
timelineSlider.addEventListener('input', () => { if (mainTimeline) { mainTimeline.progress(timelineSlider.value / 100).pause(); if (isExplanationMode) hideExplanationModal(); } });
modalCloseBtn.addEventListener('click', hideWelcomeModal);
atomLegendHeader.addEventListener('click', () => {
    atomLegendContent.classList.toggle('expanded');
    atomLegendToggle.style.transform = atomLegendContent.classList.contains('expanded') ? 'rotate(180deg)' : 'rotate(0deg)';
});
explanationModeToggle.addEventListener('click', () => {
    isExplanationMode = !isExplanationMode;
    explanationModeToggle.classList.toggle('active', isExplanationMode);
    displayMessage(`Chế độ Giải thích: ${isExplanationMode ? 'BẬT' : 'TẮT'}`);
    if (isExplanationMode && mainTimeline && !mainTimeline.isActive()) mainTimeline.restart();
    else if (!isExplanationMode && mainTimeline && mainTimeline.paused()) { mainTimeline.resume(); hideExplanationModal(); }
});
explanationContinueBtn.addEventListener('click', () => { if (mainTimeline) { mainTimeline.resume(); hideExplanationModal(); } });

function showWelcomeModal() {
    const hasVisited = localStorage.getItem('hasVisitedChemicalAIApp');
    if (!hasVisited) {
        welcomeModalOverlay.classList.add('show');
        document.body.style.overflow = 'hidden';
    } else {
        initApp();
    }
}
function hideWelcomeModal() {
    welcomeModalOverlay.classList.remove('show');
    localStorage.setItem('hasVisitedChemicalAIApp', 'true');
    document.body.style.overflow = '';
    initApp();
}
function initApp() {
    init3D();
    generateBtn.addEventListener('click', generateReactionPlan);
    displayMessage("Hãy xem AI dự đoán và diễn họa phản ứng hóa học!");
    toggleDragHint(true);
    updateAtomLegend(null);
    updateInputState();
}
function showExplanationModal(title, content, stepNumber) {
    explanationTitle.textContent = `Bước ${stepNumber}: ${title}`;
    explanationText.textContent = content;
    explanationModalOverlay.classList.add('show');
    [playPauseBtn, restartBtn, timelineSlider, ...speedButtons, explanationModeToggle].forEach(el => el.disabled = true);
}
function hideExplanationModal() {
    explanationModalOverlay.classList.remove('show');
    if (mainTimeline && !mainTimeline.isActive()) return;
    if(mainTimeline) {
      [playPauseBtn, restartBtn, timelineSlider, ...speedButtons, explanationModeToggle].forEach(el => el.disabled = false);
    }
}
function updateAtomLegend(plan) {
    atomLegendContent.innerHTML = '';
    let uniqueAtomSymbols = new Set();
    if (plan) {
        plan.reactants.forEach(r => r.atoms.forEach(a => uniqueAtomSymbols.add(a.symbol)));
        plan.products.forEach(p => p.atoms.forEach(a => uniqueAtomSymbols.add(a.symbol)));
    } else {
        ['H', 'O', 'C'].forEach(s => uniqueAtomSymbols.add(s));
    }
    const atomsToShow = ATOM_COLORS.filter(atom => uniqueAtomSymbols.has(atom.symbol));
    if (atomsToShow.length === 0) {
        atomLegendContent.innerHTML = '<span class="text-sm text-gray-400">Không có chú thích.</span>';
        atomLegendContent.classList.add('expanded');
    } else {
         atomsToShow.forEach(atom => {
            const item = document.createElement('div');
            item.classList.add('atom-legend-item');
            item.innerHTML = `<div class="atom-color-circle" style="background-color: ${atom.color};"></div><span>${atom.symbol}</span>`;
            atomLegendContent.appendChild(item);
        });
        atomLegendContent.classList.add('expanded');
        atomLegendToggle.style.transform = 'rotate(180deg)';
    }
}

// Initial load
showWelcomeModal();
atomLegendContent.classList.remove('expanded');
atomLegendToggle.style.transform = 'rotate(0deg)';
