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

// NEW: Data for example reactions
const exampleReactions = [
    {
        category: "🧪 Phản ứng của axit - bazơ - muối",
        reactions: [
            { name: "HCl + NaOH → NaCl + H₂O", input: "HCl + NaOH" },
            { name: "H₂SO₄ + 2NaOH → Na₂SO₄ + 2H₂O", input: "H2SO4 + NaOH" },
            { name: "HCl + AgNO₃ → AgCl↓ + HNO₃", input: "HCl + AgNO3" },
            { name: "H₂SO₄ + BaCl₂ → BaSO₄↓ + 2HCl", input: "H2SO4 + BaCl2" },
            { name: "NaOH + CuSO₄ → Cu(OH)₂↓ + Na₂SO₄", input: "NaOH + CuSO4" },
            { name: "Ba(OH)₂ + FeCl₃ → Fe(OH)₃↓ + BaCl₂", input: "Ba(OH)2 + FeCl3" },
        ]
    },
    {
        category: "🔥 Phản ứng oxi hóa - khử",
        reactions: [
            { name: "Zn + 2HCl → ZnCl₂ + H₂↑", input: "Zn + HCl" },
            { name: "Fe + H₂SO₄ → FeSO₄ + H₂↑", input: "Fe + H2SO4" },
            { name: "Fe + CuSO₄ → FeSO₄ + Cu↓", input: "Fe + CuSO4" },
            { name: "Zn + AgNO₃ → Zn(NO₃)₂ + Ag↓", input: "Zn + AgNO3" },
            { name: "CH₄ + 2O₂ → CO₂ + 2H₂O", input: "CH4 + O2" },
            { name: "2Mg + O₂ → 2MgO", input: "Mg + O2" },
        ]
    },
    {
        category: "🧱 Phản ứng phân hủy",
        reactions: [
            { name: "2KClO₃ → 2KCl + 3O₂", input: "KClO3" },
            { name: "CaCO₃ → CaO + CO₂", input: "CaCO3" },
        ]
    },
    {
        category: "🧊 Phản ứng đặc trưng của phi kim",
        reactions: [
            { name: "Fe + S → FeS", input: "Fe + S" },
            { name: "2Al + 3Cl₂ → 2AlCl₃", input: "Al + Cl2" },
            { name: "H₂ + Cl₂ → 2HCl", input: "H2 + Cl2" },
            { name: "N₂ + 3H₂ ⇌ 2NH₃", input: "N2 + H2" },
        ]
    },
    {
        category: "🧬 Phản ứng hữu cơ cơ bản",
        reactions: [
            { name: "CH₂=CH₂ + Br₂ → CH₂Br–CH₂Br", input: "CH2=CH2 + Br2" },
            { name: "CH≡CH + H₂ → CH₂=CH₂", input: "CH=CH + H2" },
            { name: "C₂H₆ + O₂ → CO₂ + H₂O", input: "C2H6 + O2" },
            { name: "CH₃COOH + O₂ → CO₂ + 2H₂O", input: "CH3COOH + O2" },
        ]
    },
    {
        category: "🧫 Phản ứng đặc trưng trong nhóm chất",
        reactions: [
            { name: "BaCl₂ + Na₂SO₄ → BaSO₄↓ + 2NaCl", input: "BaCl2 + Na2SO4" },
            { name: "AgNO₃ + NaCl → AgCl↓ + NaNO₃", input: "AgNO3 + NaCl" },
            { name: "NaHCO₃ + HCl → NaCl + CO₂↑ + H₂O", input: "NaHCO3 + HCl" },
        ]
    }
];

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
        ambientLight.name = "ambientLight";
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // Directional light for shadows/highlights
        directionalLight.name = "directionalLight";
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
        particleGeometry.userData.originalPositions = new Float32Array(positions); // Store original positions
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

        // Time variable for perpetual motion
        let time = 0;

        function animate() {
            requestAnimationFrame(animate);
            time += 0.05; // Increment time for vibration
            controls.update();

            // Perpetual motion logic for "living" molecules
            if (mainTimeline && mainTimeline.progress() === 1) {
                molecules.forEach(group => {
                    const data = group.userData.moleculeData;
                    if (data && data.drift) { 
                        group.position.add(data.drift);

                        const wrapLimit = 22;
                        if (group.position.x > wrapLimit) group.position.x = -wrapLimit;
                        if (group.position.x < -wrapLimit) group.position.x = wrapLimit;
                        if (group.position.y > 15) group.position.y = -15;
                        if (group.position.y < -15) group.position.y = 15;
                        if (group.position.z > wrapLimit) group.position.z = -wrapLimit;
                        if (group.position.z < -wrapLimit) group.position.z = wrapLimit;

                        group.rotation.x += data.rotationSpeed.x;
                        group.rotation.y += data.rotationSpeed.y;
                        group.rotation.z += data.rotationSpeed.z;

                        data.atoms.forEach((atom, i) => {
                            const originalPos = data.originalAtomPositions[i];
                            const vibrationData = data.vibrationParams[i];
                            const vibration = Math.sin(time * vibrationData.speed + vibrationData.phase) * 0.03;
                            atom.position.copy(originalPos).addScaledVector(vibrationData.axis, vibration);
                        });
                    }
                });
            }


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
// NEW: Example Modal Elements
let examplesBtn, examplesModalOverlay;


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
    
    if (particles) {
        particles.visible = true;
        const positions = particles.geometry.attributes.position.array;
        const originalPositions = particles.geometry.userData.originalPositions;
        for (let i = 0; i < originalPositions.length; i++) {
            positions[i] = originalPositions[i];
        }
        particles.geometry.attributes.position.needsUpdate = true;
    }
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
            playPauseBtn.textContent = "⏸️"; 
            restartBtn.disabled = false;
            timelineSlider.disabled = true;
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
    
    plan.animationSteps.forEach((step, stepIndex) => {
        const stepTimeline = gsap.timeline();

        // Pass the plan to each step for context if needed
        step.plan = plan;

        switch(step.type) {
            case 'move_to_center': {
                const DURATION = step.duration;
                stepTimeline.to(camera.position, { z: 25, duration: DURATION, ease: "power2.inOut"}, 0);
                
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
                    stepTimeline.to(group.rotation, { x: '+=0.2', y: '-=0.2', z: '+=0.2', duration: 0.5, ease: `rough({ strength: 2, points: 20 })`, yoyo: true, repeat: 3}, DURATION - 1.5);
                });
                break;
            }
            case 'disintegrate': {
                 const DURATION = step.duration;
                 stepTimeline.addLabel("disintegration");
                 reactantGroups.forEach(group => {
                     const atoms = group.userData.moleculeData.atoms;
                     const bonds = group.userData.moleculeData.bondMeshes;

                     bonds.forEach(bond => {
                         stepTimeline.to(bond.scale, { x: 0.1, y: 0.1, z: 0.1, duration: DURATION * 0.5, ease: "power2.in" }, "disintegration");
                         stepTimeline.to(bond.material, { opacity: 0, duration: DURATION * 0.5 }, "disintegration");
                     });
                     
                     atoms.forEach(atom => {
                          stepTimeline.to(atom.material.emissive, { r: 0.2, g: 0.2, b: 0.2, duration: DURATION }, "disintegration");
                          stepTimeline.to(atom.position, {
                              x: atom.position.x * 1.5, y: atom.position.y * 1.5, z: atom.position.z * 1.5,
                              duration: DURATION, ease: "power1.out"
                          }, "disintegration");
                     });
                 });
                break;
            }
            case 'maelstrom': {
                const DURATION = step.duration;
                stepTimeline.addLabel("vortex");
                const allAtoms = [];
                reactantGroups.forEach(group => {
                    group.userData.moleculeData.atoms.forEach(atom => {
                        const worldPos = new THREE.Vector3(); atom.getWorldPosition(worldPos);
                        scene.add(atom); atom.position.copy(worldPos); allAtoms.push(atom);
                    });
                    scene.remove(group);
                });
                reactantGroups.length = 0;

                allAtoms.forEach(atom => {
                    stepTimeline.to(atom.position, {
                        x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 5, z: (Math.random() - 0.5) * 5,
                        duration: DURATION, ease: "power2.inOut"
                    }, "vortex");
                    stepTimeline.to(atom.rotation, { y: "+=10", duration: DURATION }, "vortex");
                    stepTimeline.to(atom.material.emissive, { r: 0.6, g: 0.6, b: 0.3, duration: DURATION }, "vortex");
                });
                stepTimeline.to(camera.rotation, { z: '+=0.5', duration: DURATION, ease: "power1.inOut" }, "vortex");
                break;
            }
            case 'supernova': {
                const REACTION_CENTER = new THREE.Vector3(0, 0, 0);
                const DURATION = step.duration;
                stepTimeline.addLabel("detonation", "+=0");
                stepTimeline.to(camera.position, { z: 18, duration: DURATION * 0.2, ease: "power3.in" }, "detonation");
                
                const shake = { strength: 0.3 };
                stepTimeline.to(shake, {
                    strength: 0, duration: 1.2,
                    onUpdate: () => {
                        camera.position.x += (Math.random() - 0.5) * shake.strength;
                        camera.position.y += (Math.random() - 0.5) * shake.strength;
                    }
                }, "detonation");

                stepTimeline.add(() => {
                    const coreFlash = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending }));
                    coreFlash.userData.isEffect = true; scene.add(coreFlash);
                    gsap.to(coreFlash.scale, { x: 25, y: 25, z: 25, duration: 0.5, ease: "power2.out" });
                    gsap.to(coreFlash.material, { opacity: 0, duration: 0.7, ease: "power2.out", onComplete: () => scene.remove(coreFlash) });
                    
                    const shockwaveColor = plan.isExothermic ? 0xffa500 : 0x87ceeb;
                    const shockwave = new THREE.Mesh(new THREE.TorusGeometry(1, 0.2, 16, 100), new THREE.MeshBasicMaterial({ color: shockwaveColor, transparent: true, opacity: 0.8 }));
                    shockwave.rotation.x = Math.PI / 2; shockwave.userData.isEffect = true; scene.add(shockwave);
                    gsap.to(shockwave.scale, { x: 40, y: 40, z: 40, duration: 2.0, ease: "power1.out" });
                    gsap.to(shockwave.material, { opacity: 0, duration: 2.0, ease: "power1.out", onComplete: () => scene.remove(shockwave) });
                }, "detonation+=0.05");

                stepTimeline.addLabel("supernova", "detonation+=0.2");
                const detachedAtoms = scene.children.filter(c => c.userData && c.userData.isAtom);
                
                const ringGeo = new THREE.TorusGeometry(10, 0.15, 16, 100);
                const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
                const energyRing = new THREE.Mesh(ringGeo, ringMat);
                energyRing.rotation.x = Math.PI / 2; energyRing.userData.isEffect = true; scene.add(energyRing);
                stepTimeline.to(energyRing.scale, { x: 1.5, y: 1.5, z: 1.5, duration: DURATION * 0.9, ease: "power1.out"}, "supernova")
                stepTimeline.to(energyRing.material, { opacity: 0.7, duration: 1.5, ease: "power1.out" }, "supernova");
                stepTimeline.to(energyRing.rotation, { z: "+=5", duration: DURATION * 0.9 }, "supernova");
                stepTimeline.to(energyRing.material, { opacity: 0, duration: 1.5, ease: "power1.in", onComplete: () => scene.remove(energyRing) }, `supernova+=${DURATION*0.9 - 1.5}`);

                detachedAtoms.forEach(atom => {
                    stepTimeline.to(atom.position, {
                        x: (Math.random() - 0.5) * 25, y: (Math.random() - 0.5) * 25, z: (Math.random() - 0.5) * 25,
                        duration: DURATION * 0.7, ease: "power2.out"
                    }, "supernova");
                    stepTimeline.to(atom.material.emissive, { r: 1.5, g: 1.5, b: 0.8, duration: DURATION * 0.6, ease: "power2.in" }, "supernova");
                });
                break;
            }
            case 'reform': {
                const DURATION = step.duration;
                stepTimeline.addLabel("reformation", "+=0");
                const atomPool = {};
                scene.children.filter(c => c.userData && c.userData.isAtom).forEach(atom => {
                    const symbol = atom.userData.symbol;
                    if (!atomPool[symbol]) atomPool[symbol] = [];
                    atomPool[symbol].push(atom);
                });

                const totalProductInstances = plan.products.reduce((acc, p) => acc + (p.count * baseMultiplier), 0);
                let productIndex = 0;

                plan.products.forEach(p => {
                    for (let j = 0; j < Math.max(1, p.count) * baseMultiplier; j++) {
                        const angle = (productIndex / totalProductInstances) * Math.PI * 4;
                        const radius = 5 + (productIndex / totalProductInstances) * 10;
                        const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius, z = (Math.random() - 0.5) * 6;
                        const productGroup = drawMolecule3D(p, x, y, z);
                        
                        productGroup.userData.moleculeData.drift = new THREE.Vector3((Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.01);
                        productGroup.userData.moleculeData.rotationSpeed = new THREE.Vector3((Math.random() - 0.5) * 0.005, (Math.random() - 0.5) * 0.005, (Math.random() - 0.5) * 0.005);
                        productGroup.userData.moleculeData.originalAtomPositions = productGroup.userData.moleculeData.atoms.map(atom => atom.position.clone());
                        productGroup.userData.moleculeData.vibrationParams = productGroup.userData.moleculeData.atoms.map(() => ({
                            speed: 0.5 + Math.random() * 1.5, phase: Math.random() * Math.PI * 2, axis: new THREE.Vector3().randomDirection()
                        }));

                        productGroup.traverse(child => { if(child.isMesh) child.material.opacity = 0; });
                        
                        productGroup.userData.moleculeData.atoms.forEach(targetAtom => {
                             const sourceAtom = atomPool[targetAtom.userData.symbol]?.pop();
                             if(sourceAtom){
                                 const targetWorldPos = new THREE.Vector3(); targetAtom.getWorldPosition(targetWorldPos);
                                 stepTimeline.to(sourceAtom.position, { x: targetWorldPos.x, y: targetWorldPos.y, z: targetWorldPos.z, duration: DURATION * 0.4, ease: "power3.inOut" }, "reformation");
                                 stepTimeline.to(sourceAtom.material, { opacity: 0, duration: DURATION * 0.4 }, "reformation");
                                 stepTimeline.to(sourceAtom.material.emissive, { r:0, g:0, b:0, duration: DURATION * 0.4 }, "reformation");
                                 stepTimeline.add(()=> scene.remove(sourceAtom), `reformation+=${DURATION*0.4}`);
                             }
                        });

                        productGroup.traverse(child => { if (child.isMesh) stepTimeline.to(child.material, { opacity: 1, duration: DURATION * 0.3 }, `reformation+=${DURATION*0.1}`); });
                        productIndex++;
                    }
                });
                Object.values(atomPool).flat().forEach(atom => stepTimeline.to(atom.material, {opacity: 0, duration: 0.5, onComplete: ()=> scene.remove(atom)}, 'reformation'));
                break;
            }
            case 'aftermath': {
                const DURATION = step.duration;
                stepTimeline.addLabel("breathing", "+=0");
                molecules.forEach(group => {
                    const emissiveTargets = group.userData.moleculeData.atoms.map(a => a.material.emissive);
                    stepTimeline.to(emissiveTargets, { r: 0.8, g: 0.8, b: 0.4, duration: 1.5, yoyo: true, repeat: 5, ease: "sine.inOut" }, `breathing`);
                });
                const ambientLight = scene.getObjectByName("ambientLight");
                const directionalLight = scene.getObjectByName("directionalLight");
                if(ambientLight) stepTimeline.to(ambientLight, { intensity: 0.5, duration: DURATION }, "breathing");
                if(directionalLight) stepTimeline.to(directionalLight, { intensity: 1.0, duration: DURATION }, "breathing");
                stepTimeline.to(camera.position, { z: 25, duration: DURATION }, "breathing");
                break;
            }
            case 'gas_evolution':
                stepTimeline.add(() => createGasBubbles(step.options || {}));
                break;

            case 'precipitation':
                stepTimeline.add(() => createPrecipitationParticles(step.options || {}));
                break;
        }
        
        mainTimeline.add(stepTimeline);
        mainTimeline.add(() => {
            if (isExplanationMode) {
                mainTimeline.pause();
                showExplanationModal(step.text || `Bước...`, step.explanation, stepIndex + 1);
            } else { displayMessage(step.text || '...'); }
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

    // Final, most robust prompt
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
    
    QUY TẮC CHO CHẤT PHẢN ỨNG VÀ SẢN PHẨM:
    Mỗi đối tượng chất phải có dạng: {molecule, name, count, molecularWeight, physicalState, atoms: [{symbol, color}], bonds: [...]}.
    **QUY TẮC TỐI QUAN TRỌNG**: Trường "bonds" là BẮT BUỘC cho TẤT CẢ các chất.
    - Nếu chất có nhiều hơn một nguyên tử, "bonds" phải là một mảng các đối tượng liên kết.
    - Nếu chất chỉ có MỘT nguyên tử (ví dụ: Fe, Na, Cu), "bonds" PHẢI là một mảng rỗng: "bonds": [].
    - TUYỆT ĐỐI không được bỏ qua trường "bonds" hoặc trả về null.

    Sử dụng các màu sau cho nguyên tử: H: #FFFFFF, O: #FF6B6B, C: #333333, N: #6B9AFF, Fe: #A19D94, S: #FFF36B, Cl: #6BFF8B, Na: #B06BFF, ...
    Chỉ trả lời bằng một khối mã JSON hợp lệ duy nhất.
    `;

    try {
        const result = await model.generateContent(prompt);
        const textResponse = result.response.text();
        let plan;
        try {
            const jsonMatch = textResponse.match(/{[\s\S]*}/);
            if (!jsonMatch) {
                throw new Error("Không tìm thấy đối tượng JSON trong phản hồi của AI.");
            }
            plan = JSON.parse(jsonMatch[0]);
            
            // Manually add animation steps since we removed it from the prompt
            plan.animationSteps = [
                { type: "move_to_center", duration: 3.5, text: "Giai đoạn 1: Tụ Bão", explanation: "Các chất phản ứng được hút vào vùng trung tâm, tích tụ năng lượng." },
                { type: "disintegrate", duration: 1.5, text: "Giai đoạn 2: Phân rã", explanation: "Các liên kết ban đầu bị phá vỡ, giải phóng các nguyên tử." },
                { type: "maelstrom", duration: 2.5, text: "Giai đoạn 3: Hỗn Nguyên", explanation: "Các nguyên tử tự do được trộn lẫn trong một cơn lốc năng lượng." },
                { type: "supernova", duration: 2.0, text: "Giai đoạn 4: Kích Nổ", explanation: "Năng lượng phản ứng được giải phóng trong một vụ nổ lớn." },
                { type: "reform", duration: 3.0, text: "Giai đoạn 5: Tái tạo", explanation: "Các nguyên tử từ vụ nổ được tập hợp lại để hình thành sản phẩm mới." },
                { type: "aftermath", duration: 3.0, text: "Giai đoạn 6: Dư Âm", explanation: "Các phân tử sản phẩm ổn định và giải phóng năng lượng dư thừa." }
            ];
            
            // **FIXED**: Automatically detect and add special effect steps
            const gasProduct = plan.products.find(p => p.physicalState === 'gas');
            const precipitateProduct = plan.products.find(p => p.physicalState === 'solid' && plan.reactants.every(r => r.physicalState !== 'solid'));

            if (gasProduct) {
                plan.animationSteps.push({ type: 'gas_evolution', text: "Sản phẩm khí được giải phóng.", options: {} });
            }
            if (precipitateProduct) {
                plan.animationSteps.push({ type: 'precipitation', text: "Kết tủa được hình thành.", options: { color: precipitateProduct.atoms[0].color } });
            }

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

// NEW: Functions for Example Modal
function createExamplesModal() {
    const modalStyle = `
        .examples-modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(5px);
            display: flex; align-items: center; justify-content: center;
            z-index: 1000; opacity: 0; pointer-events: none; transition: opacity 0.3s ease;
        }
        .examples-modal-overlay.show { opacity: 1; pointer-events: auto; }
        .examples-modal-content {
            background: #2a2a3e; border: 1px solid #4a4a6a;
            padding: 2rem; border-radius: 12px;
            width: 90%; max-width: 800px; max-height: 80vh;
            overflow-y: auto; position: relative;
            transform: scale(0.95); transition: transform 0.3s ease;
        }
        .examples-modal-overlay.show .examples-modal-content { transform: scale(1); }
        .examples-modal-content h2 { font-size: 1.5rem; font-weight: 600; margin-bottom: 1.5rem; color: #e0e0e0; }
        .examples-modal-close-btn {
            position: absolute; top: 1rem; right: 1rem;
            background: none; border: none; font-size: 1.5rem;
            color: #888; cursor: pointer; transition: color 0.2s;
        }
        .examples-modal-close-btn:hover { color: #fff; }
        .reaction-category { margin-bottom: 1.5rem; }
        .reaction-category h3 { font-size: 1.1rem; font-weight: 500; color: #a0a0c0; margin-bottom: 0.75rem; border-bottom: 1px solid #4a4a6a; padding-bottom: 0.5rem; }
        .reaction-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 0.75rem; }
        .reaction-item {
            background: #3a3a5a; padding: 0.75rem 1rem; border-radius: 6px;
            cursor: pointer; transition: background 0.2s, transform 0.2s;
            font-family: 'Courier New', Courier, monospace;
        }
        .reaction-item:hover { background: #4a4a7a; transform: translateY(-2px); }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.innerText = modalStyle;
    document.head.appendChild(styleSheet);

    examplesModalOverlay = document.createElement('div');
    examplesModalOverlay.className = 'examples-modal-overlay';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'examples-modal-content';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'examples-modal-close-btn';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => examplesModalOverlay.classList.remove('show');

    const title = document.createElement('h2');
    title.textContent = 'Chọn một phản ứng ví dụ';
    
    modalContent.appendChild(closeBtn);
    modalContent.appendChild(title);

    exampleReactions.forEach(cat => {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'reaction-category';
        
        const categoryTitle = document.createElement('h3');
        categoryTitle.innerHTML = cat.category;
        categoryDiv.appendChild(categoryTitle);

        const listDiv = document.createElement('div');
        listDiv.className = 'reaction-list';

        cat.reactions.forEach(reaction => {
            const item = document.createElement('div');
            item.className = 'reaction-item';
            item.textContent = reaction.name;
            item.dataset.input = reaction.input;
            item.onclick = (event) => {
                input.value = event.currentTarget.dataset.input;
                updateInputState();
                examplesModalOverlay.classList.remove('show');
                displayMessage(`Đã chọn ví dụ: ${event.currentTarget.dataset.input}`);
            };
            listDiv.appendChild(item);
        });
        categoryDiv.appendChild(listDiv);
        modalContent.appendChild(categoryDiv);
    });

    examplesModalOverlay.appendChild(modalContent);
    document.body.appendChild(examplesModalOverlay);
    
    examplesModalOverlay.addEventListener('click', (event) => {
        if (event.target === examplesModalOverlay) {
            examplesModalOverlay.classList.remove('show');
        }
    });
}

function initApp() {
    init3D();
    generateBtn.addEventListener('click', generateReactionPlan);
    
    // NEW: Create and setup example button and modal
    createExamplesModal();
    examplesBtn = document.createElement('button');
    examplesBtn.innerHTML = `💡 Ví dụ`;
    examplesBtn.className = 'control-btn'; // Use same class as others for styling
    examplesBtn.style.marginLeft = '0.5rem';
    examplesBtn.onclick = () => examplesModalOverlay.classList.add('show');
    generateBtn.parentNode.insertBefore(examplesBtn, generateBtn.nextSibling);


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
            item.classList.add('suggestion-item');
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
