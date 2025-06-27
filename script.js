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
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // Directional light for shadows/highlights
        directionalLight.position.set(5, 10, 7.5);
        scene.add(directionalLight);

        camera.position.z = 15; // Initial camera position

        // OrbitControls for interactive camera movement
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true; // Smooth camera movement

        // Add particle system for background ambiance
        const particleCount = 1000;
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const particleColor = new THREE.Color(0xffffff); // White particles
        const sphereRadius = 20; // Radius of the particle distribution area

        for (let i = 0; i < particleCount; i++) {
            // Generate random positions within a sphere for particles
            const x = (Math.random() - 0.5) * 2 * sphereRadius;
            const y = (Math.random() - 0.5) * 2 * sphereRadius;
            const z = (Math.random() - 0.5) * 2 * sphereRadius;
            
            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            // Assign white color with slight opacity to particles
            colors[i * 3] = particleColor.r;
            colors[i * 3 + 1] = particleColor.g;
            colors[i * 3 + 2] = particleColor.b;
        }

        const particleGeometry = new THREE.BufferGeometry();
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const particleMaterial = new THREE.PointsMaterial({
            size: 0.1, // Particle size
            vertexColors: true, // Use colors from attribute
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending // Blending mode for particles
        });

        particles = new THREE.Points(particleGeometry, particleMaterial);
        scene.add(particles);
        particles.visible = true; // Show particles by default

        // Create solution container (transparent box for liquid reactions)
        const solutionGeometry = new THREE.BoxGeometry(10, 10, 10); // Adjust size as needed
        const solutionMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000, // Default to black or transparent
            transparent: true,
            opacity: 0.0
        });
        solutionContainer = new THREE.Mesh(solutionGeometry, solutionMaterial);
        solutionContainer.position.set(0, 0, -5); // Position slightly behind main action
        solutionContainer.visible = false; // Initially hidden
        scene.add(solutionContainer);


        // Main animation loop to render the scene
        function animate() {
            requestAnimationFrame(animate);
            controls.update(); // Update OrbitControls
            // Rotate particles gently for dynamic background
            if (particles && particles.visible) {
                particles.rotation.y += 0.0005;
                particles.rotation.x += 0.0002;
            }
            composer.render(); // Render scene with post-processing
        }
        animate();

        // Listen for window resize events to adjust camera and renderer
        window.addEventListener('resize', () => {
            camera.aspect = chamber.clientWidth / chamber.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(chamber.clientWidth, chamber.clientHeight);
            composer.setSize(chamber.clientWidth, chamber.clientHeight);
        });

        // Mouse event listener for raycasting and tooltip display
        chamber.addEventListener('mousemove', onChamberMouseMove, false);
        chamber.addEventListener('mouseleave', () => {
            moleculeTooltip.classList.remove('show');
            if (hoveredMolecule) {
                 // Reset any highlighting if applied
                hoveredMolecule = null;
            }
        });

    } catch (error) {
        console.error("WebGL initialization error:", error);
        // Display user-friendly error message if WebGL fails
        chamber.innerHTML = `
            <div class="webgl-error-message">
                <h2>Lỗi WebGL</h2>
                <p>Trình duyệt của bạn có thể không hỗ trợ hoặc WebGL đang bị tắt.</p>
                <p>Chi tiết lỗi: ${error.message || 'Không rõ.'}</p>
                <p>Để trải nghiệm hoạt ảnh 3D, vui lòng đảm bảo trình duyệt của bạn được cập nhật và WebGL được bật.</p>
                <p><a href="https://get.webgl.org/" target="_blank">Kiểm tra trạng thái WebGL của bạn tại đây</a></p>
            </div>
        `;
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
    // Calculate mouse position in normalized device coordinates (-1 to +1)
    const rect = chamber.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Get all atom meshes from all molecules in the scene
    const allAtomMeshes = [];
    molecules.forEach(molGroup => {
        molGroup.children.forEach(child => {
            // Only consider atom meshes, not bond meshes
            if (child.userData.isAtom) {
                allAtomMeshes.push(child);
            }
        });
    });

    const intersects = raycaster.intersectObjects(allAtomMeshes);

    if (intersects.length > 0) {
        // Find the parent group (molecule) of the intersected atom
        const intersectedAtom = intersects[0].object;
        const parentMoleculeGroup = intersectedAtom.parent;

        // Check if it's a new hovered molecule or the same one
        if (hoveredMolecule !== parentMoleculeGroup) {
            hoveredMolecule = parentMoleculeGroup;
            const moleculeData = parentMoleculeGroup.userData.moleculeData;

            if (moleculeData) {
                let tooltipContent = `<strong>${moleculeData.molecule}</strong>`;
                if (moleculeData.name) {
                    tooltipContent += `<br/>Tên: ${moleculeData.name}`;
                }
                if (moleculeData.molecularWeight) {
                    tooltipContent += `<br/>KLPT: ${moleculeData.molecularWeight.toFixed(3)} g/mol`;
                }
                if (moleculeData.physicalState) {
                    let stateVietnamese;
                    switch (moleculeData.physicalState.toLowerCase()) {
                        case 'gas': stateVietnamese = 'Khí'; break;
                        case 'liquid': stateVietnamese = 'Lỏng'; break;
                        case 'solid': stateVietnamese = 'Rắn'; break;
                        case 'aqueous': stateVietnamese = 'Dung dịch'; break;
                        default: stateVietnamese = moleculeData.physicalState;
                    }
                    tooltipContent += `<br/>Trạng thái: ${stateVietnamese}`;
                }

                moleculeTooltip.innerHTML = tooltipContent;
                moleculeTooltip.style.left = `${event.clientX + 10}px`;
                moleculeTooltip.style.top = `${event.clientY + 10}px`;
                moleculeTooltip.classList.add('show');
            } else {
                moleculeTooltip.classList.remove('show');
            }
        }
    } else {
        // No intersection, hide tooltip
        if (hoveredMolecule) {
            moleculeTooltip.classList.remove('show');
            hoveredMolecule = null;
        }
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
const clearInputBtn = document.getElementById('clear-input-btn'); // New: Clear button
const suggestionsList = document.getElementById('suggestions-list'); // New: Suggestions list

const welcomeModalOverlay = document.getElementById('welcome-modal-overlay');
const modalCloseBtn = document.getElementById('modal-close-btn');

// NEW: Explanation Mode elements
const explanationModeToggle = document.getElementById('explanation-mode-toggle');
const explanationModalOverlay = document.getElementById('explanation-modal-overlay');
const explanationTitle = document.getElementById('explanation-title');
const explanationText = document.getElementById('explanation-text');
const explanationContinueBtn = document.getElementById('explanation-continue-btn');
let isExplanationMode = false; // State variable for explanation mode

// Atom Legend Elements
const atomLegendHeader = document.getElementById('atom-legend-header');
const atomLegendContent = document.getElementById('atom-legend-content');
const atomLegendToggle = atomLegendHeader.querySelector('.atom-legend-toggle');

// Define atom colors (must match what's in the AI prompt)
const ATOM_COLORS = [
    { symbol: 'H', color: '#FFFFFF' }, // Trắng (White)
    { symbol: 'O', color: '#FF6B6B' }, // Đỏ (Red)
    { symbol: 'C', color: '#333333' }, // Xám đen (Dark Grey)
    { symbol: 'N', color: '#6B9AFF' }, // Xanh dương (Blue)
    { symbol: 'Fe', color: '#A19D94' },// Xám kim loại (Metallic Grey)
    { symbol: 'S', color: '#FFF36B' }, // Vàng (Yellow)
    { symbol: 'Cl', color: '#6BFF8B' },// Xanh lá (Green)
    { symbol: 'Na', color: '#B06BFF' },// Tím (Purple)
    { symbol: 'K', color: '#8A2BE2' }, // Tím nhạt (Light Purple)
    { symbol: 'Mg', color: '#BDB76B' },// Vàng xanh (Yellow-Green)
    { symbol: 'Ca', color: '#DDA0DD' },// Tím hoa cà (Plum)
    { symbol: 'Al', color: '#C0C0C0' },// Bạc (Silver)
    { symbol: 'P', color: '#FFA500' }, // Cam (Orange)
    { symbol: 'Br', color: '#A52A2A' },// Nâu (Brown)
    { symbol: 'I', color: '#4B0082' }  // Chàm (Indigo)
];

// New: Common chemical suggestions for input field
const COMMON_CHEMICALS = [
    'H2O', 'CO2', 'O2', 'N2', 'H2', 'CH4', 'C2H5OH', 'NaCl', 'HCl', 'H2SO4',
    'NaOH', 'KMnO4', 'NH3', 'CaO', 'Fe2O3', 'SO2', 'NO2', 'C6H12O6', 'C12H22O11'
];


let currentMessageTimeout;
/**
 * Displays a message in the info text area, optionally as an error.
 * Fades out non-error messages after a delay.
 * @param {string} message - The message to display.
 * @param {boolean} isError - True if the message is an error, false otherwise.
 */
function displayMessage(message, isError = false) {
    if (currentMessageTimeout) {
        clearTimeout(currentMessageTimeout);
        currentMessageTimeout = null;
    }

    infoText.textContent = message;
    if (isError) {
        infoText.classList.add('error-message');
    } else {
        infoText.classList.remove('error-message');
    }
    gsap.to(infoText, { opacity: 1, duration: 0.3, ease: "power2.out" });

    if (!isError) {
        currentMessageTimeout = setTimeout(() => {
            gsap.to(infoText, { opacity: 0, duration: 0.5, ease: "power2.in" });
        }, 5000);
    }
}

/**
 * Toggles the visibility of the drag hint message.
 * @param {boolean} show - True to show the hint, false to hide.
 */
function toggleDragHint(show) {
    if (dragHint) {
        if (show) {
            dragHint.classList.add('show');
        } else {
            dragHint.classList.remove('show');
        }
    }
}

/**
 * Clears all molecules, particles, and resets the solution container in the 3D scene.
 */
function clearScene() {
    molecules.forEach(m => {
        m.children.forEach(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) {
                if (c.material.emissive) c.material.emissive.set(0x000000); // Ensure emissive is off
                c.material.dispose();
            }
        });
        scene.remove(m);
    });
    // Also remove any existing gas bubbles and precipitation particles
    scene.children.filter(obj => obj.userData.isGasBubble || obj.userData.isPrecipitationParticle).forEach(particle => {
        if (particle.geometry) particle.geometry.dispose();
        if (particle.material) particle.material.dispose();
        scene.remove(particle);
    });
    molecules = [];

    // Reset and hide solution container
    if (solutionContainer) {
        solutionContainer.material.color.set(0x000000); // Reset color to black (or clear color)
        solutionContainer.material.opacity = 0.0; // Make it fully transparent
        solutionContainer.visible = false; // Hide it
    }
}

/**
 * Draws a 3D molecule based on its definition, including atoms and bonds.
 * @param {object} moleculeDef - Definition of the molecule (atoms, bonds, colors).
 * @param {number} x - X position for the molecule group.
 * @param {number} y - Y position for the molecule group.
 * @param {number} z - Z position for the molecule group.
 * @returns {THREE.Group} The created 3D group representing the molecule.
 */
function drawMolecule3D(moleculeDef, x, y, z) {
    const group = new THREE.Group();
    const atomRadius = 0.5;
    const bondThickness = 0.1; // Thinner for multiple bonds
    const bondMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc, // Grayish white for bonds
        metalness: 0.2,
        roughness: 0.6,
        transparent: true,
        opacity: 1 // Bonds start fully opaque by default if no animation applied yet
    });

    // Store atom meshes to easily reference their positions for bonds
    const atomMeshes = [];

    moleculeDef.atoms.forEach((atomDef, i) => {
        const geometry = new THREE.SphereGeometry(atomRadius, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            color: atomDef.color,
            metalness: 0.4,
            roughness: 0.4,
            emissive: '#000000' // Ensure emissive starts black for new atoms
        });
        const atomMesh = new THREE.Mesh(geometry, material);

        // Simple initial positioning for individual atoms or small molecules
        if (moleculeDef.atoms.length === 1) {
            atomMesh.position.set(0, 0, 0); // Center single atom
        } else {
            // Arrange atoms in a rough circular or linear pattern
            // Use spherical coordinates for better 3D distribution if possible, or simpler arrangement
            const angle = (i / moleculeDef.atoms.length) * 2 * Math.PI;
            const spreadRadius = atomRadius * 1.5; // Distance from center of molecule for atoms
            atomMesh.position.x = Math.cos(angle) * spreadRadius;
            atomMesh.position.y = Math.sin(angle) * spreadRadius;
            // Add slight random Z to avoid perfect 2D planar molecules for all
            atomMesh.position.z = (Math.random() - 0.5) * atomRadius * 0.5;
        }
        atomMesh.userData.isAtom = true; // Mark as atom for raycasting
        group.add(atomMesh);
        atomMeshes.push(atomMesh);
    });

    const bondMeshes = []; // To store bond meshes for animation

    // Draw bonds
    if (moleculeDef.bonds && moleculeDef.bonds.length > 0) {
        moleculeDef.bonds.forEach(bond => {
            const atomA = atomMeshes[bond.atom1Index];
            const atomB = atomMeshes[bond.atom2Index];

            if (atomA && atomB) {
                const positionA = atomA.position;
                const positionB = atomB.position;

                const distance = positionA.distanceTo(positionB);
                const midPoint = new THREE.Vector3().addVectors(positionA, positionB).divideScalar(2);

                // Calculate direction and perpendicular vector for bond offset
                const direction = new THREE.Vector3().subVectors(positionB, positionA).normalize();
                const perpendicular = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();

                // Adjust perpendicular vector if it's too close to zero (collinear)
                if (perpendicular.lengthSq() < 0.0001) {
                    perpendicular.set(1, 0, 0); // Fallback to X-axis if collinear with Y
                    perpendicular.crossVectors(direction, perpendicular).normalize();
                }


                let bondSegments = 1;
                let offsetDistance = 0; // Distance from center for parallel bonds

                switch (bond.bondType) {
                    case 'single':
                        bondSegments = 1;
                        offsetDistance = 0; // Single bond, no offset
                        break;
                    case 'double':
                        bondSegments = 2;
                        offsetDistance = bondThickness * 0.5; // Offset for two parallel bonds
                        break;
                    case 'triple':
                        bondSegments = 3;
                        offsetDistance = bondThickness * 0.7; // Offset for three parallel bonds
                        break;
                    default:
                        bondSegments = 1; // Fallback to single
                        offsetDistance = 0;
                }

                for (let i = 0; i < bondSegments; i++) {
                    const segmentGeometry = new THREE.CylinderGeometry(bondThickness, bondThickness, distance, 8);
                    const segmentMesh = new THREE.Mesh(segmentGeometry, bondMaterial.clone()); // Clone material for individual control
                    segmentMesh.name = `bond-${bond.atom1Index}-${bond.atom2Index}-${i}`; // Give it a name for debugging

                    // Position segment
                    segmentMesh.position.copy(midPoint);
                    segmentMesh.lookAt(positionB);
                    segmentMesh.rotation.x += Math.PI / 2; // Adjust for cylinder's default orientation

                    // Apply offset for parallel bonds
                    if (bondSegments > 1) {
                        const currentOffset = (i - (bondSegments - 1) / 2) * offsetDistance;
                        segmentMesh.position.add(perpendicular.clone().multiplyScalar(currentOffset));
                    }
                    
                    group.add(segmentMesh);
                    bondMeshes.push(segmentMesh);
                }
            }
        });
    }

    group.position.set(x, y, z);
    // Store the original molecule definition including new fields and bond meshes
    group.userData.moleculeData = {
        molecule: moleculeDef.molecule,
        name: moleculeDef.name,
        molecularWeight: moleculeDef.molecularWeight,
        physicalState: moleculeDef.physicalState,
        bonds: moleculeDef.bonds, // Store bonds data as well for potential future use
        bondMeshes: bondMeshes // Store references to bond meshes
    };
    scene.add(group);
    molecules.push(group);
    return group;
}

/**
 * Creates and animates gas bubbles.
 * @param {object} options - Options for gas bubbles: color, count, size, origin_point {x, y, z}.
 */
function createGasBubbles(options) {
    const defaultColor = '#ADD8E6'; // Light blue for gas
    const defaultCount = 30;
    const defaultSize = 0.1;
    const defaultOrigin = { x: 0, y: -5, z: 0 }; // Default from bottom center

    const bubbleColor = options.gas_color || defaultColor;
    const bubbleCount = options.bubble_count || defaultCount;
    const bubbleSize = options.bubble_size || defaultSize;
    const originPoint = options.origin_point || defaultOrigin;

    const bubbles = [];
    const bubbleGeometry = new THREE.SphereGeometry(bubbleSize, 16, 16);
    const bubbleMaterial = new THREE.MeshBasicMaterial({
        color: bubbleColor,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });

    for (let i = 0; i < bubbleCount; i++) {
        const bubble = new THREE.Mesh(bubbleGeometry, bubbleMaterial.clone()); // Clone material for individual opacity
        bubble.position.set(
            originPoint.x + (Math.random() - 0.5) * 2, // Slight random spread
            originPoint.y + (Math.random() * 2), // Start slightly above origin
            originPoint.z + (Math.random() - 0.5) * 2
        );
        bubble.userData.isGasBubble = true; // Mark as gas bubble for easy removal
        scene.add(bubble);
        bubbles.push(bubble);

        // Animate individual bubbles
        gsap.to(bubble.position, {
            y: originPoint.y + 15 + Math.random() * 5, // Rise far up
            x: bubble.position.x + (Math.random() - 0.5) * 3, // Drift horizontally
            duration: 3 + Math.random() * 2, // Random duration
            ease: "none",
            onComplete: () => {
                // Fade out and remove when reaching top
                gsap.to(bubble.material, {
                    opacity: 0,
                    duration: 0.5,
                    onComplete: () => {
                        bubble.geometry.dispose();
                        bubble.material.dispose();
                        scene.remove(bubble);
                    }
                });
            }
        });

        // Animate bubble size
        gsap.to(bubble.scale, {
            x: 1.5, y: 1.5, z: 1.5,
            duration: 0.5,
            yoyo: true, repeat: -1, // Pulsate
            ease: "sine.inOut",
            delay: Math.random() * 2 // Stagger
        });
    }
}

/**
 * Creates and animates precipitation particles.
 * @param {object} options - Options for precipitation: color, density, formation_area.
 */
function createPrecipitationParticles(options) {
    const defaultColor = '#C0C0C0'; // Default gray/white for precipitate
    let particleCount = 200;
    let particleSize = 0.08;
    let startY = 5; // Particles start from mid-top
    let endY = -5;  // Particles settle towards bottom
    let spread = 5; // Horizontal spread

    const precipitationColor = options.color || defaultColor;
    const formationArea = options.formation_area || 'bottom'; // 'center' or 'bottom'
    const density = options.density || 'medium'; // 'light', 'medium', 'heavy'

    switch (density) {
        case 'light':
            particleCount = 100;
            particleSize = 0.05;
            break;
        case 'medium':
            particleCount = 200;
            particleSize = 0.08;
            break;
        case 'heavy':
            particleCount = 400;
            particleSize = 0.12;
            break;
    }

    const precipitationGeometry = new THREE.SphereGeometry(particleSize, 8, 8);
    const precipitationMaterial = new THREE.MeshBasicMaterial({
        color: precipitationColor,
        transparent: true,
        opacity: 0
    });

    const particlesArray = [];
    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(precipitationGeometry, precipitationMaterial.clone());
        particle.position.set(
            (Math.random() - 0.5) * spread,
            startY + (Math.random() * 2 - 1) * 2, // Slightly randomized start Y
            (Math.random() - 0.5) * spread
        );
        particle.userData.isPrecipitationParticle = true; // Mark for easy removal
        scene.add(particle);
        particlesArray.push(particle);

        const finalY = (formationArea === 'bottom') ? endY + (Math.random() * 2 - 1) * 0.5 : (Math.random() * 2 - 1) * 1; // Settle at bottom or center
        const duration = 2 + Math.random() * 2; // Random duration for settling

        // Animate opacity and position
        gsap.timeline({ delay: Math.random() * 0.5 }) // Stagger appearance
            .to(particle.material, { opacity: 0.8, duration: 1 })
            .to(particle.position, {
                y: finalY,
                x: particle.position.x + (Math.random() - 0.5) * 1, // Slight drift
                z: particle.position.z + (Math.random() - 0.5) * 1, // Slight drift
                duration: duration,
                ease: "power1.inOut"
            }, "<"); // Start position animation at same time as opacity fade-in
    }
}


/**
 * Validates the structure of the reaction plan object returned by the AI.
 * @param {object} plan - The reaction plan object returned by the AI.
 * @returns {boolean} True if the plan is valid, false otherwise.
 * @throws {Error} If a critical property is missing or has an incorrect type.
 */
function validateReactionPlan(plan) {
    if (typeof plan !== 'object' || plan === null) {
        throw new Error("Phản hồi AI không phải là đối tượng hợp lệ.");
    }
    if (typeof plan.title !== 'string' || plan.title.trim() === '') {
        throw new Error("Thiếu hoặc sai định dạng 'title' trong phản hồi AI.");
    }
    if (!Array.isArray(plan.reactants)) {
        throw new Error("Thiếu hoặc sai định dạng 'reactants' (phải là mảng) trong phản hồi AI.");
    }
    if (!Array.isArray(plan.products)) {
        throw new Error("Thiếu hoặc sai định dạng 'products' (phải là mảng) trong phản hồi AI.");
    }
    if (!Array.isArray(plan.animationSteps)) {
        throw new Error("Thiếu hoặc sai định dạng 'animationSteps' (phải là mảng) trong phản hồi AI.");
    }
    // Basic check for contents of reactants/products/animationSteps
    if (plan.reactants.length === 0 && plan.products.length === 0) {
         throw new Error("Phản hồi AI không chứa chất phản ứng hoặc sản phẩm. Vui lòng thử lại hoặc thay đổi yêu cầu.");
    }

    // Validate specific animation step types if they exist
    for (const step of plan.animationSteps) {
        if (typeof step.text !== 'string' || step.text.trim() === '') { // Validate general text
            console.warn(`Animation step missing 'text' field.`);
        }
        // NEW: Validate explanation field for explanation mode
        if (typeof step.explanation !== 'string' || step.explanation.trim() === '') {
            console.warn(`Animation step missing 'explanation' field. Falling back to 'text' for explanation mode.`);
            step.explanation = step.text; // Fallback if explanation is missing
        }


        if (step.type === 'gas_evolution') {
            if (typeof step.gas_color !== 'string' || !step.gas_color.startsWith('#')) {
                console.warn("Gas evolution step missing or invalid 'gas_color'. Using default.");
            }
            if (typeof step.bubble_count !== 'number' || step.bubble_count <= 0) {
                console.warn("Gas evolution step missing or invalid 'bubble_count'. Using default.");
            }
            if (typeof step.bubble_size !== 'number' || step.bubble_size <= 0) {
                console.warn("Gas evolution step missing or invalid 'bubble_size'. Using default.");
            }
            // Validate origin_point if provided
            if (step.origin_point && (typeof step.origin_point.x !== 'number' || typeof step.origin_point.y !== 'number' || typeof step.origin_point.z !== 'number')) {
                console.warn("Gas evolution step has invalid 'origin_point'. Using default.");
                step.origin_point = undefined; // Force default if invalid
            }
        } else if (step.type === 'precipitation') { // Validate precipitation step
            if (typeof step.color !== 'string' || !step.color.startsWith('#')) {
                console.warn("Precipitation step missing or invalid 'color'. Using default.");
            }
            if (step.density && !['light', 'medium', 'heavy'].includes(step.density)) {
                console.warn("Precipitation step has invalid 'density'. Using default.");
            }
            if (step.formation_area && !['center', 'bottom'].includes(step.formation_area)) {
                console.warn("Precipitation step has invalid 'formation_area'. Using default.");
            }
        } else if (step.type === 'color_change') { // Validate color change step
            if (typeof step.initial_color !== 'string' || !step.initial_color.startsWith('#')) {
                console.warn("Color change step missing or invalid 'initial_color'. Using default.");
            }
            if (typeof step.final_color !== 'string' || !step.final_color.startsWith('#')) {
                console.warn("Color change step missing or invalid 'final_color'. Using default.");
            }
            if (typeof step.duration !== 'number' || step.duration <= 0) {
                console.warn("Color change step missing or invalid 'duration'. Using default.");
            }
            // Validate initial_opacity and final_opacity
            if (step.initial_opacity !== undefined && (typeof step.initial_opacity !== 'number' || step.initial_opacity < 0 || step.initial_opacity > 1)) {
                console.warn("Color change step has invalid 'initial_opacity'. Using default.");
                step.initial_opacity = undefined;
            }
             if (step.final_opacity !== undefined && (typeof step.final_opacity !== 'number' || step.final_opacity < 0 || step.final_opacity > 1)) {
                console.warn("Color change step has invalid 'final_opacity'. Using default.");
                step.final_opacity = undefined;
            }
        }
        // Add validation for other new types here when implemented
    }

    // Validate bonds structure for reactants and products
    const validateMoleculeBonds = (moleculeArray) => {
        for (const mol of moleculeArray) {
            if (mol.bonds) {
                if (!Array.isArray(mol.bonds)) {
                    throw new Error(`Molecular bonds for ${mol.molecule} must be an array.`);
                }
                for (const bond of mol.bonds) {
                    if (typeof bond.atom1Index !== 'number' || typeof bond.atom2Index !== 'number' || bond.atom1Index < 0 || bond.atom2Index < 0 || bond.atom1Index >= mol.atoms.length || bond.atom2Index >= mol.atoms.length) {
                        console.warn(`Invalid atom indices in bond for ${mol.molecule}. Skipping bond:`, bond);
                    }
                     if (bond.bondType && !['single', 'double', 'triple'].includes(bond.bondType)) {
                        console.warn(`Invalid bondType for ${mol.molecule}. Using default visualization.`);
                    }
                }
            }
        }
    };

    validateMoleculeBonds(plan.reactants);
    validateMoleculeBonds(plan.products);

    return true;
}


// --- Animation Engine ---
/**
 * Runs the chemical reaction animation based on the provided plan.
 * @param {object} plan - The reaction plan object generated by the AI.
 */
function runAnimation(plan) {
    if (mainTimeline) mainTimeline.kill(); // Kill any existing animation timeline
    clearScene(); // Clears molecules, gas bubbles, precipitation particles, and resets solution container
    
    if (particles) {
        particles.visible = false; // Hide background particles during animation
    }
    toggleDragHint(false); // Hide drag hint
    moleculeTooltip.classList.remove('show'); // Hide tooltip during animation
    hideExplanationModal(); // Ensure explanation modal is hidden when a new animation starts

    displayMessage(`Đang chuẩn bị hoạt ảnh cho: ${plan.title}`); // Display animation title

    // Update atom legend based on current reaction plan
    updateAtomLegend(plan);


    mainTimeline = gsap.timeline({
        onUpdate: () => {
            timelineSlider.value = mainTimeline.progress() * 100; // Update timeline slider
            // Only update play/pause button if not in explanation mode
            if (!isExplanationMode) {
                 playPauseBtn.textContent = mainTimeline.paused() ? "▶️" : "⏸️"; // Update play/pause button icon
            }
        },
        onComplete: () => {
            displayMessage("Hoạt ảnh hoàn tất!"); // Animation complete message
            playPauseBtn.textContent = "▶️"; // Reset play button icon
            playPauseBtn.disabled = true;
            restartBtn.disabled = true; // Disable restart as animation is done
            timelineSlider.disabled = true; // Disable slider
            speedButtons.forEach(btn => btn.disabled = true); // Disable speed buttons
            explanationModeToggle.disabled = true; // Disable explanation mode toggle after animation finishes
            if (particles) {
                particles.visible = true; // Show background particles again
            }
            toggleDragHint(true); // Show drag hint
            // Ensure solution container is hidden after animation
            if (solutionContainer) {
                solutionContainer.visible = false;
                solutionContainer.material.color.set(0x000000); // Reset color
                solutionContainer.material.opacity = 0.0;
            }
        }
    });

    // Enable control buttons
    playPauseBtn.disabled = false;
    restartBtn.disabled = false;
    timelineSlider.disabled = false;
    speedButtons.forEach(btn => btn.disabled = false);
    explanationModeToggle.disabled = false; // Enable explanation mode toggle when animation is ready

    playPauseBtn.textContent = "⏸️"; // Set play button to pause initially

    const reactantObjects = [];
    const initialReactantSpread = { x: 8, y: 4, z: 4 }; // Spread volume for initial reactants
    const baseMoleculeCountMultiplier = 2; // Each AI-specified molecule count will be multiplied

    // Draw initial reactant molecules in the scene
    plan.reactants.forEach((r) => {
        // Dynamically increase the number of instances for visual appeal
        const actualCountToSpawn = Math.max(1, r.count) * baseMoleculeCountMultiplier; // Ensure at least 1 even if AI says 0
        for (let j = 0; j < actualCountToSpawn; j++) {
            const x = (Math.random() - 0.5) * initialReactantSpread.x * 2; // Random X within spread
            const y = (Math.random() - 0.5) * initialReactantSpread.y * 2; // Random Y within spread
            const z = (Math.random() - 0.5) * initialReactantSpread.z * 2; // Random Z within spread
            
            const moleculeObj = drawMolecule3D(r, x, y, z);
            reactantObjects.push({obj: moleculeObj});
        }
    });

    // Iterate through animation steps and add logic for explanation mode
    plan.animationSteps.forEach((step, index) => {
        // Use a separate mini-timeline for each step animation to control it independently
        const stepTimeline = gsap.timeline();

        if (step.type === 'move_to_center') {
            // Ensure no glow on atoms at the start of this phase
            stepTimeline.add(() => {
                scene.children.flatMap(obj => {
                    if (obj.isGroup && obj.userData.moleculeData) { // Check if it's a molecule group
                        return obj.children.filter(c => c.userData.isAtom);
                    }
                    return [];
                }).forEach(atomMesh => {
                    atomMesh.material.emissive.set(0x000000); // Set emissive color to black (no glow)
                });
            }, 0); // Start immediately at the beginning of this stepTimeline

            // Zoom camera out slightly to show more of the action area with more molecules
            stepTimeline.to(camera.position, { z: 20, duration: 2.5, ease: "power2.inOut"}, 0); // Start at 0
            const convergenceRadius = 3; // Radius around the center where molecules converge
            reactantObjects.forEach((m) => {
                // Move molecules towards random points within a smaller central sphere/cube
                const targetX = (Math.random() - 0.5) * convergenceRadius * 2;
                const targetY = (Math.random() - 0.5) * convergenceRadius * 2;
                const targetZ = (Math.random() - 0.5) * convergenceRadius * 2; // Also introduce some Z variation

                stepTimeline.to(m.obj.position, {
                    x: targetX,
                    y: targetY,
                    z: targetZ,
                    duration: 2.5,
                    ease: "power2.inOut"
                }, 0); // Start all at the same time
            });
        } else if (step.type === 'break_bonds') {
            stepTimeline.to(camera.position, { z: 12, duration: 2, ease: "power2.inOut"}, 0); // Zoom in slightly
            reactantObjects.forEach(m => {
                // Animate atoms emissive color (reduced glow intensity)
                m.obj.children.forEach((child) => {
                    if (child.userData.isAtom) { // Only animate atoms
                        stepTimeline.to(child.material.emissive, { r: 0.3, g: 0.3, b: 0.1, duration: 1, ease: "power2.in" }, 0);
                    }
                });
                // Animate bond "snap" and fade out
                if (m.obj.userData.moleculeData && m.obj.userData.moleculeData.bondMeshes) {
                    m.obj.userData.moleculeData.bondMeshes.forEach(bondMesh => {
                        // Animate scale down, then fade opacity
                        stepTimeline.to(bondMesh.scale, { x: 0.2, y: 0.2, z: 0.2, duration: 0.3, ease: "power1.in" }, 0);
                        stepTimeline.to(bondMesh.material, { opacity: 0, duration: 0.5, ease: "power1.out" }, 0.1); // Start fade slightly after scale starts
                    });
                }
                // Animate atoms breaking apart from each other
                m.obj.children.forEach((child, i) => {
                    if (child.userData.isAtom) {
                        // Simple outward movement from center of its group
                        const direction = new THREE.Vector3().copy(child.position).normalize();
                        stepTimeline.to(child.position, {
                            x: child.position.x + direction.x * 0.8,
                            y: child.position.y + direction.y * 0.8,
                            z: child.position.z + direction.z * 0.8,
                            duration: 2,
                            ease: "back.out(4)"
                        }, 0);
                    }
                });
            });
        } else if (step.type === 'rearrange') {
            // Quickly fade out any lingering emissive glow from all atoms in the scene
            stepTimeline.to(scene.children.flatMap(obj => {
                if (obj.isGroup && obj.userData.moleculeData) { // Filter for molecule groups
                    return obj.children.filter(c => c.userData.isAtom); // Get atoms within groups
                }
                return [];
            }),
                {
                    'material.emissive.r': 0,
                    'material.emissive.g': 0,
                    'material.emissive.b': 0,
                    duration: 0.1 // Very quick fade to turn off glow
                }, 0); // Start at the very beginning of this stepTimeline

            // Fade out old reactant atoms and bonds, then remove molecule groups
            reactantObjects.forEach(m => {
                stepTimeline.to(m.obj.children.map(c => c.material), { opacity: 0, duration: 1, onComplete: () => scene.remove(m.obj) }, 0);
            });

            if (plan.isExothermic) { // If reaction is exothermic, show a shockwave effect
                stepTimeline.add(() => {
                    const shockwaveGeo = new THREE.TorusGeometry(1, 0.1, 16, 100);
                    const shockwaveMat = new THREE.MeshBasicMaterial({ color: 0xffffee, transparent: true, opacity: 1 });
                    const shockwave = new THREE.Mesh(shockwaveGeo, shockwaveMat);
                    shockwave.rotation.x = Math.PI / 2;
                    scene.add(shockwave);
                    gsap.to(shockwave.scale, { x: 20, y: 20, z: 20, duration: 2, ease: "power1.out" });
                    gsap.to(shockwave.material, { opacity: 0, duration: 2, ease: "power1.out", onComplete: () => scene.remove(shockwave) });
                }, 0.5); // Relative to start of stepTimeline

            }

            let productX = -5;
            plan.products.forEach(p => {
                for (let j = 0; j < p.count; j++) {
                    const productObj = drawMolecule3D(p, productX, (j % 2 === 0 ? 1 : -1) * 3, 0);
                    // Initial state for new products: transparent atoms and bonds, bonds start from zero scale
                    productObj.children.forEach(c => { 
                        c.material.transparent = true; 
                        c.material.opacity = 0; 
                        if (c.name.startsWith('bond-')) { // Check if it's a bond mesh
                            c.scale.set(0.001, 0.001, 0.001); // Start bonds very small
                        }
                    });

                    // Animate atoms and bonds to full opacity and scale (for bonds)
                    stepTimeline.to(productObj.children.map(c => c.material), { opacity: 1, duration: 2 }, 1); // Start at 1 second mark of stepTimeline
                    
                    // Animate bond scale in for products
                    productObj.children.forEach(c => {
                        if (c.name.startsWith('bond-')) {
                            stepTimeline.to(c.scale, { x: 1, y: 1, z: 1, duration: 1.5, ease: "back.out(1.7)" }, 1); // Start at 1 second mark of stepTimeline
                        }
                    });
                    productX += 5;
                }
            });
        } else if (step.type === 'gas_evolution') { // Handle gas evolution step
            stepTimeline.add(() => {
                createGasBubbles(step);
            }, 0);
        } else if (step.type === 'precipitation') { // Handle precipitation step
            stepTimeline.add(() => {
                createPrecipitationParticles(step);
            }, 0);
        } else if (step.type === 'color_change') { // Handle color change step
            stepTimeline.add(() => {
                if (solutionContainer) {
                    solutionContainer.visible = true;
                    // Set initial color and opacity from step data or defaults
                    const initialColor = new THREE.Color(step.initial_color || '#FFFFFF'); // Default white
                    const finalColor = new THREE.Color(step.final_color || '#FFFFFF');     // Default white
                    const initialOpacity = step.initial_opacity !== undefined ? step.initial_opacity : 0.0; // Default transparent
                    const finalOpacity = step.final_opacity !== undefined ? step.final_opacity : 0.5;     // Default 50% opaque
                    const duration = step.duration || 2;                                // Default 2 seconds

                    solutionContainer.material.color.set(initialColor);
                    solutionContainer.material.opacity = initialOpacity;

                    // Animate to final color and opacity
                    gsap.to(solutionContainer.material.color, {
                        r: finalColor.r,
                        g: finalColor.g,
                        b: finalColor.b,
                        duration: duration,
                        ease: "power1.inOut"
                    });
                     gsap.to(solutionContainer.material, {
                        opacity: finalOpacity,
                        duration: duration,
                        ease: "power1.inOut"
                    });
                }
            }, 0);
        }

        // Add the stepTimeline to the mainTimeline
        mainTimeline.add(stepTimeline);

        // NEW: Explanation Mode Logic - Add a pause and show modal AFTER each stepTimeline completes
        mainTimeline.add(() => {
            // This function runs when the *current* step's animation is complete
            if (isExplanationMode) {
                mainTimeline.pause(); // Pause the main animation
                // Display the explanation modal
                showExplanationModal(step.text || `Bước ${index + 1}`, step.explanation, index + 1);
            } else {
                // If not in explanation mode, just display the info text briefly
                displayMessage(step.text || '...');
            }
        }, ">"); // Position this immediately after the `stepTimeline` has finished
    });
}

/**
 * Generates the reaction plan by calling the AI model and then runs the animation.
 */
async function generateReactionPlan() {
    if (!model || !renderer) {
        displayMessage("Lỗi: Engine AI hoặc môi trường 3D chưa sẵn sàng.", true);
        return;
    }
    const userInput = input.value.trim();
    if (!userInput) {
        displayMessage("Vui lòng nhập các chất tham gia để tạo phản ứng.", true);
        input.classList.remove('input-valid'); // Ensure valid state is removed
        input.classList.add('input-error');
        updateAtomLegend(null);
        return;
    } else {
        input.classList.remove('input-error');
    }

    displayMessage('AI đang tư duy... 🧠');
    generateBtn.disabled = true;
    loadingSpinner.classList.remove('hidden');
    playPauseBtn.disabled = true;
    restartBtn.disabled = true;
    timelineSlider.disabled = true;
    speedButtons.forEach(btn => btn.disabled = true);
    explanationModeToggle.disabled = true; // Disable explanation mode toggle during generation
    clearInputBtn.classList.add('hidden'); // Hide clear button during processing
    moleculeTooltip.classList.remove('show'); // Hide tooltip during generation
    hideExplanationModal(); // Hide explanation modal if it was open

    if (particles) {
        particles.visible = false;
    }
    toggleDragHint(false);
    updateAtomLegend(null);

    // UPDATED PROMPT: Requesting 'explanation' field for each animation step
    const prompt = `
    Từ các chất tham gia do người dùng cung cấp là: "${userInput}".
    Hãy thực hiện các bước sau một cách tuần tự:
    1. Dự đoán sản phẩm hóa học có khả năng xảy ra nhất trong điều kiện tiêu chuẩn.
    2. Viết phương trình hóa học đầy đủ và đã được cân bằng cho phản ứng đó.
    3. Dựa trên phương trình bạn vừa tạo, hãy tạo một kịch bản hoạt ảnh chi tiết dưới dạng một đối tượng JSON.

    Đối tượng JSON phải có cấu trúc chính xác như sau:
    - "title": (string) Phương trình hóa học đầy đủ mà bạn đã tạo (ví dụ: "2H2 + O2 -> 2H2O").
    - "isExothermic": (boolean) Phản ứng có tỏa nhiệt hay không (true nếu tỏa nhiệt, false nếu thu nhiệt hoặc không xác định).
    - "reactants": (array) Một mảng các đối tượng chất phản ứng, mỗi đối tượng có dạng {molecule: string, name: string, count: number, molecularWeight: number, physicalState: string, atoms: [{symbol: string, color: string}], bonds: [{atom1Index: number, atom2Index: number, bondType: string}]}.
        "molecule" là công thức hóa học (ví dụ "H2O").
        "name" là tên thông thường của chất (ví dụ "Nước").
        "molecularWeight" là khối lượng mol (g/mol) của chất.
        "physicalState" là trạng thái vật lý của chất trong điều kiện phản ứng ('gas', 'liquid', 'solid', 'aqueous').
        "bonds": Một mảng các liên kết trong phân tử. Mỗi liên kết là một đối tượng chứa:
            - "atom1Index": (number) Chỉ số của nguyên tử đầu tiên trong mảng 'atoms' của phân tử.
            - "atom2Index": (number) Chỉ số của nguyên tử thứ hai trong mảng 'atoms' của phân tử.
            - "bondType": (string) Loại liên kết ('single', 'double', 'triple').
    - "products": (array) Một mảng các đối tượng sản phẩm, cấu trúc tương tự reactants, bao gồm các thông tin về liên kết.
    - "animationSteps": (array) Một mảng các bước hoạt ảnh, mỗi bước có dạng {type: string, text: string, explanation: string, ...}.
        "text": (string) Mô tả ngắn gọn cho thanh thông báo.
        "explanation": (string) Mô tả chi tiết hơn cho hộp giải thích từng bước.
        Các loại type có thể có:
        - 'move_to_center': Các phân tử di chuyển vào trung tâm buồng phản ứng.
        - 'break_bonds': Liên kết giữa các nguyên tử bị phá vỡ, các nguyên tử tách rời.
        - 'rearrange': Các nguyên tử tự sắp xếp lại để tạo thành sản phẩm mới.
        - 'gas_evolution': Mô phỏng sự giải phóng khí. Cần các thuộc tính bổ sung:
            - 'gas_color': (string) Mã màu HEX của bong bóng khí (vd: '#ADD8E6' cho xanh nhạt).
            - 'bubble_count': (number) Số lượng bong bóng khí.
            - 'bubble_size': (number) Kích thước tương đối của mỗi bong bóng (0.05-0.5).
            - 'origin_point': (object, tùy chọn) Điểm bắt đầu của bong bóng {x: number, y: number, z: number}. Mặc định sẽ là dưới đáy.
        - 'precipitation': Mô phỏng sự hình thành kết tủa. Cần các thuộc tính bổ sung:
            - 'color': (string) Mã màu HEX của hạt kết tủa (vd: '#F0F0F0' cho trắng).
            - 'density': (string, tùy chọn) Mức độ dày đặc của kết tủa ('light', 'medium', 'heavy'). Mặc định là 'medium'.
            - 'formation_area': (string, tùy chọn) Khu vực kết tủa hình thành ('center', 'bottom'). Mặc định là 'bottom'.
        - 'color_change': Mô phỏng sự thay đổi màu sắc và độ trong suốt của dung dịch. Cần các thuộc tính bổ sung:
            - 'initial_color': (string) Mã màu HEX của màu ban đầu (vd: '#FFFFFF' cho không màu).
            - 'final_color': (string) Mã màu HEX của màu cuối cùng (vd: '#0000FF' cho xanh lam).
            - 'initial_opacity': (number, tùy chọn) Độ trong suốt ban đầu (0.0 - 1.0). Mặc định 0.0.
            - 'final_opacity': (number, tùy chọn) Độ trong suốt cuối cùng (0.0 - 1.0). Mặc định 0.5.
            - 'duration': (number) Thời gian chuyển màu tính bằng giây. Mặc định là 2 giây.

    Sử dụng các màu sau cho nguyên tử (hãy tự suy ra các màu khác nếu cần):
    - H: #FFFFFF (Trắng)
    - O: #FF6B6B (Đỏ)
    - C: #333333 (Xám đen)
    - N: #6B9AFF (Xanh dương)
    - Fe: #A19D94 (Xám kim loại)
    - S: #FFF36B (Vàng)
    - Cl: #6BFF8B (Xanh lá)
    - Na: #B06BFF (Tím)
    - K: #8A2BE2 (Tím nhạt)
    - Mg: #BDB76B (Vàng xanh)
    - Ca: #DDA0DD (Tím hoa cà)
    - Al: #C0C0C0 (Bạc)
    - P: #FFA500 (Cam)
    - Br: #A52A2A (Nâu)
    - I: #4B0082 (Chàm)

    Quan trọng: Chỉ trả lời bằng một khối mã JSON hợp lệ duy nhất, không chứa "'''json" hay bất kỳ văn bản giải thích nào khác.
    `;

    try {
        const result = await model.generateContent(prompt);
        const textResponse = result.response.text();
        
        // Try to clean and parse JSON
        const cleanedText = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        let plan;
        try {
            plan = JSON.parse(cleanedText);
        } catch (jsonError) {
            console.error("JSON parsing error:", jsonError);
            throw new Error("Phản hồi của AI không phải là JSON hợp lệ. Vui lòng thử lại.");
        }

        // Validate the structure of the parsed plan
        validateReactionPlan(plan);

        runAnimation(plan);
    } catch (error) {
        console.error("Error generating animation or validation:", error);
        // Display a more specific message based on the type of error
        if (error.message.includes("JSON hợp lệ") || error.message.includes("Phản hồi AI không phải là đối tượng hợp lệ")) {
            displayMessage(`Lỗi định dạng dữ liệu từ AI: ${error.message}`, true);
        } else if (error.message.includes("Thiếu hoặc sai định dạng")) {
            displayMessage(`Lỗi cấu trúc dữ liệu từ AI: ${error.message}`, true);
        } else if (error.message.includes("không chứa chất phản ứng hoặc sản phẩm")) {
            displayMessage(`Phản ứng không rõ ràng: ${error.message}`, true);
        } else {
            displayMessage("Đã có lỗi xảy ra trong quá trình tạo hoạt ảnh. Vui lòng thử lại.", true);
        }
        
        if (particles) {
            particles.visible = true;
        }
        toggleDragHint(true);
        updateAtomLegend(null);
    } finally {
        generateBtn.disabled = false;
        loadingSpinner.classList.add('hidden');
        // Show clear button if input has content after processing
        if (input.value.trim().length > 0) {
            clearInputBtn.classList.remove('hidden');
        }
    }
}

// New: Input validation and suggestions
/**
 * Validates the user input for chemical equations.
 * @param {string} value - The input string to validate.
 * @returns {boolean} True if the input is valid, false otherwise.
 */
function validateInput(value) {
    // Very basic validation for demonstration.
    // A more robust validation would require a chemical parser.
    // This checks for common chemical symbols and basic arithmetic/equation patterns.
    const chemicalRegex = /^[A-Z][a-z]?[0-9]*(?:[\+\-]\s*[A-Z][a-z]?[0-9]*)*(\s*->\s*[A-Z][a-z]?[0-9]*(?:[\+\-]\s*[A-Z][a-z]?[0-9]*)*)?$/;
    return chemicalRegex.test(value.replace(/\s/g, '')); // Remove spaces for simpler regex
}

/**
 * Shows chemical suggestions based on user input.
 * @param {string} query - The current input query.
 */
function showSuggestions(query) {
    suggestionsList.innerHTML = '';
    if (query.length < 1) { // Show suggestions only after user types a bit
        suggestionsList.classList.remove('show');
        return;
    }

    const filteredSuggestions = COMMON_CHEMICALS.filter(chem =>
        chem.toLowerCase().includes(query.toLowerCase())
    );

    if (filteredSuggestions.length > 0) {
        filteredSuggestions.forEach(suggestion => {
            const item = document.createElement('div');
            item.classList.add('suggestion-item');
            item.textContent = suggestion;
            item.addEventListener('click', () => {
                input.value = suggestion;
                suggestionsList.classList.remove('show');
                updateInputState(); // Validate after selecting a suggestion
            });
            suggestionsList.appendChild(item);
        });
        suggestionsList.classList.add('show');
    } else {
        suggestionsList.classList.remove('show');
    }
}

/**
 * Updates the visual state of the input field (error/valid) and clear button.
 */
function updateInputState() {
    const value = input.value.trim();
    if (value.length > 0) {
        clearInputBtn.classList.remove('hidden');
        if (validateInput(value)) {
            input.classList.remove('input-error');
            input.classList.add('input-valid');
        } else {
            input.classList.remove('input-valid');
            input.classList.add('input-error');
        }
    } else {
        clearInputBtn.classList.add('hidden');
        input.classList.remove('input-error', 'input-valid');
    }
}

input.addEventListener('input', () => {
    updateInputState();
    showSuggestions(input.value);
});

// Hide suggestions when clicking outside
document.addEventListener('click', (event) => {
    if (!input.contains(event.target) && !suggestionsList.contains(event.target)) {
        suggestionsList.classList.remove('show');
    }
});

clearInputBtn.addEventListener('click', () => {
    input.value = '';
    updateInputState(); // Update state after clearing
    suggestionsList.classList.remove('show'); // Hide suggestions
    displayMessage("Đầu vào đã được xóa.");
});

playPauseBtn.addEventListener('click', () => {
    if (mainTimeline) {
        mainTimeline.paused(!mainTimeline.paused());
        // If we're in explanation mode and just unpaused, hide the modal
        if (!mainTimeline.paused() && isExplanationMode) {
            hideExplanationModal();
        }
    }
});

restartBtn.addEventListener('click', () => {
    if (mainTimeline) {
        mainTimeline.restart();
        hideExplanationModal(); // Hide modal on restart
    }
});

speedButtons.forEach(button => {
    button.addEventListener('click', (event) => {
        const speed = parseFloat(event.target.dataset.speed);
        if (mainTimeline) {
            mainTimeline.timeScale(speed);
        }
        speedButtons.forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
    });
});

timelineSlider.addEventListener('input', () => {
    if (mainTimeline) {
        mainTimeline.progress(timelineSlider.value / 100);
        if (isExplanationMode) { // If in explanation mode, pause when user drags slider
            mainTimeline.pause();
            hideExplanationModal(); // Hide explanation if user manually scrubs
        }
    }
});

// Logic to show/hide welcome modal
/**
 * Shows the welcome modal if the user has not visited before.
 */
function showWelcomeModal() {
    const hasVisited = localStorage.getItem('hasVisitedChemicalAIApp');
    if (!hasVisited) {
        welcomeModalOverlay.classList.add('show');
        document.body.style.overflow = 'hidden'; // Prevent scrolling while modal is open
    } else {
        initApp(); // Initialize app directly if already visited
    }
}

/**
 * Hides the welcome modal and marks the app as visited.
 */
function hideWelcomeModal() {
    welcomeModalOverlay.classList.remove('show');
    localStorage.setItem('hasVisitedChemicalAIApp', 'true');
    document.body.style.overflow = ''; // Re-enable scrolling
    initApp();
}

/**
 * Initializes the main application components after the welcome modal.
 */
function initApp() {
    init3D(); // Initialize 3D scene
    generateBtn.addEventListener('click', generateReactionPlan); // Attach event listener to generate button
    displayMessage("Hãy xem AI dự đoán và diễn họa phản ứng hóa học!"); // Initial info message
    toggleDragHint(true); // Show drag hint
    updateAtomLegend(null); // Initially clear or set up empty legend
    updateInputState(); // Initial check for input field

    // NEW: Event listeners for explanation mode
    explanationModeToggle.addEventListener('click', () => {
        isExplanationMode = !isExplanationMode;
        explanationModeToggle.classList.toggle('active', isExplanationMode);
        displayMessage(`Chế độ Giải thích: ${isExplanationMode ? 'BẬT' : 'TẮT'}`);
        if (isExplanationMode && mainTimeline && !mainTimeline.isActive()) {
            // If toggled ON and animation is already finished, start from beginning in explanation mode
            mainTimeline.restart();
        } else if (!isExplanationMode && mainTimeline && mainTimeline.paused()) {
            // If toggled OFF and currently paused by explanation, resume
            mainTimeline.resume();
            hideExplanationModal();
        }
    });

    explanationContinueBtn.addEventListener('click', () => {
        if (mainTimeline) {
            mainTimeline.resume(); // Resume animation
            hideExplanationModal(); // Hide explanation modal
        }
    });
}

modalCloseBtn.addEventListener('click', hideWelcomeModal); // Close welcome modal on button click

showWelcomeModal(); // Show welcome modal on page load

// Atom Legend Functions
/**
 * Updates the atom color legend based on the atoms present in the reaction plan.
 * @param {object|null} plan - The reaction plan object, or null to show default/empty legend.
 */
function updateAtomLegend(plan) {
    atomLegendContent.innerHTML = ''; // Clear existing content

    let uniqueAtomSymbols = new Set();

    if (plan) {
        // Collect atom symbols from reactants
        plan.reactants.forEach(reactant => {
            reactant.atoms.forEach(atom => {
                uniqueAtomSymbols.add(atom.symbol);
            });
        });

        // Collect atom symbols from products
        plan.products.forEach(product => {
            product.atoms.forEach(atom => {
                uniqueAtomSymbols.add(atom.symbol);
            });
        });
    } else {
        // If no plan (e.g., initial state or error), show some common ones or nothing
        // For now, let's show some basic ones if plan is null
        uniqueAtomSymbols.add('H');
        uniqueAtomSymbols.add('O');
        uniqueAtomSymbols.add('C');
    }


    const atomsToShow = ATOM_COLORS.filter(atom => uniqueAtomSymbols.has(atom.symbol));

    if (atomsToShow.length === 0) {
        // If no unique atoms, or plan is null and we don't want default, hide legend or show a message
        atomLegendContent.innerHTML = '<span class="text-sm text-gray-400">Không có nguyên tử nào để hiển thị chú thích.</span>';
        atomLegendContent.classList.add('expanded'); // Keep it expanded to show the message
    } else {
         atomsToShow.forEach(atom => {
            const item = document.createElement('div');
            item.classList.add('atom-legend-item');
            item.innerHTML = `
                <div class="atom-color-circle" style="background-color: ${atom.color};"></div>
                <span>${atom.symbol}</span>
            `;
            atomLegendContent.appendChild(item);
        });
         // Ensure legend is expanded when populated with actual data
        atomLegendContent.classList.add('expanded');
        atomLegendToggle.style.transform = 'rotate(180deg)';
    }
}

// Toggle Atom Legend visibility
atomLegendHeader.addEventListener('click', () => {
    atomLegendContent.classList.toggle('expanded');
    atomLegendToggle.style.transform = atomLegendContent.classList.contains('expanded') ? 'rotate(180deg)' : 'rotate(0deg)';
});

// Initial state: collapse the legend by default
atomLegendContent.classList.remove('expanded');
atomLegendToggle.style.transform = 'rotate(0deg)';

// NEW: Explanation Modal Functions
/**
 * Shows the explanation modal with specific title and content.
 * Disables main controls while the modal is open.
 * @param {string} title - The title of the explanation step.
 * @param {string} content - The detailed explanation text.
 * @param {number} stepNumber - The current step number.
 */
function showExplanationModal(title, content, stepNumber) {
    explanationTitle.textContent = `Bước ${stepNumber}: ${title}`;
    explanationText.textContent = content;
    explanationModalOverlay.classList.add('show');
    // Disable controls while modal is open, except continue button
    playPauseBtn.disabled = true;
    restartBtn.disabled = true;
    timelineSlider.disabled = true;
    speedButtons.forEach(btn => btn.disabled = true);
    explanationModeToggle.disabled = true; // Disable explanation mode toggle while modal is open
}

/**
 * Hides the explanation modal and re-enables main controls.
 */
function hideExplanationModal() {
    explanationModalOverlay.classList.remove('show');
    // Re-enable controls
    playPauseBtn.disabled = false;
    restartBtn.disabled = false;
    timelineSlider.disabled = false;
    speedButtons.forEach(btn => btn.disabled = false);
    explanationModeToggle.disabled = false; // Enable explanation mode toggle
}
