import * as THREE from "https://esm.sh/three";
import { VRButton } from "https://esm.sh/three/examples/jsm/webxr/VRButton.js";
import { XRControllerModelFactory } from "https://esm.sh/three/examples/jsm/webxr/XRControllerModelFactory.js";
import { XRHandModelFactory } from "https://esm.sh/three/examples/jsm/webxr/XRHandModelFactory.js"; // No lo usaremos directamente para input pero es buena práctica tenerlo si se usa XRControllerModelFactory

const minTileIndex = -8;
const maxTileIndex = 8;
const tilesPerRow = maxTileIndex - minTileIndex + 1;
const tileSize = 42;

let camera, scene, renderer;
let player;
let map;
let scoreDOM, resultDOM, finalScoreDOM, gameControlsDOM;
let backgroundMusic;

// Declarar variables para los controladores VR
let controller1, controller2;
let controllerGrip1, controllerGrip2;

// Game state
const metadata = [];
const position = {
    currentRow: 0,
    currentTile: 0,
};
const movesQueue = [];
const moveClock = new THREE.Clock(false);
const gameClock = new THREE.Clock();

function Camera() {
    const fov = 75;
    const aspect = window.innerWidth / window.innerHeight;
    const near = 0.1;
    const far = 1000;
    const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

    return camera;
}

function Texture(width, height, rects) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "rgba(0,0,0,0.6)";
    rects.forEach((rect) => {
        context.fillRect(rect.x, rect.y, rect.w, rect.h);
    });
    return new THREE.CanvasTexture(canvas);
}

const carFrontTexture = new Texture(40, 80, [{ x: 0, y: 10, w: 30, h: 60 }]);
const carBackTexture = new Texture(40, 80, [{ x: 10, y: 10, w: 30, h: 60 }]);
const carRightSideTexture = new Texture(110, 40, [
    { x: 10, y: 0, w: 50, h: 30 },
    { x: 70, y: 0, w: 30, h: 30 },
]);
const carLeftSideTexture = new Texture(110, 40, [
    { x: 10, y: 10, w: 50, h: 30 },
    { x: 70, y: 10, w: 30, h: 30 },
]);

const truckFrontTexture = Texture(30, 30, [
    { x: 5, y: 0, w: 10, h: 30 },
]);
const truckRightSideTexture = Texture(25, 30, [
    { x: 15, y: 5, w: 10, h: 10 },
]);
const truckLeftSideTexture = Texture(25, 30, [
    { x: 15, y: 15, w: 10, h: 10 },
]);

function Car(initialTileIndex, direction, color) {
    const car = new THREE.Group();
    car.position.x = initialTileIndex * tileSize;
    if (!direction) car.rotation.z = Math.PI;

    const main = new THREE.Mesh(
        new THREE.BoxGeometry(60, 30, 15),
        new THREE.MeshLambertMaterial({ color, flatShading: true })
    );
    main.position.z = 12;
    main.castShadow = true;
    main.receiveShadow = true;
    car.add(main);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(33, 24, 12), [
        new THREE.MeshPhongMaterial({
            color: 0xcccccc,
            flatShading: true,
            map: carBackTexture,
        }),
        new THREE.MeshPhongMaterial({
            color: 0xcccccc,
            flatShading: true,
            map: carFrontTexture,
        }),
        new THREE.MeshPhongMaterial({
            color: 0xcccccc,
            flatShading: true,
            map: carRightSideTexture,
        }),
        new THREE.MeshPhongMaterial({
            color: 0xcccccc,
            flatShading: true,
            map: carLeftSideTexture,
        }),
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true }), // top
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true }), // bottom
    ]);
    cabin.position.x = -6;
    cabin.position.z = 25.5;
    cabin.castShadow = true;
    cabin.receiveShadow = true;
    car.add(cabin);

    const frontWheel = Wheel(18);
    car.add(frontWheel);

    const backWheel = Wheel(-18);
    car.add(backWheel);

    return car;
}

function DirectionalLight() {
    const dirLight = new THREE.DirectionalLight(0xffffff, 1); // White light, full intensity
    dirLight.position.set(-100, -100, 200);
    dirLight.up.set(0, 0, 1);
    dirLight.castShadow = true;

    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;

    dirLight.shadow.camera.up.set(0, 0, 1);
    dirLight.shadow.camera.left = -400;
    dirLight.shadow.camera.right = 400;
    dirLight.shadow.camera.top = 400;
    dirLight.shadow.camera.bottom = -400;
    dirLight.shadow.camera.near = 50;
    dirLight.shadow.camera.far = 400;

    return dirLight;
}

function Grass(rowIndex) {
    const grass = new THREE.Group();
    grass.position.y = rowIndex * tileSize;

    const createSection = (color) =>
        new THREE.Mesh(
            new THREE.BoxGeometry(tilesPerRow * tileSize, tileSize, 3),
            new THREE.MeshLambertMaterial({ color })
        );

    const middle = createSection(0xbaf455);
    middle.receiveShadow = true;
    grass.add(middle);

    const left = createSection(0x99c846);
    left.position.x = -tilesPerRow * tileSize;
    grass.add(left);

    const right = createSection(0x99c846);
    right.position.x = tilesPerRow * tileSize;
    grass.add(right);

    return grass;
}

function initializeMap() {
    // Remove all rows
    metadata.length = 0;
    map.remove(...map.children);

    // Add new rows
    for (let rowIndex = 0; rowIndex > -10; rowIndex--) {
        const grass = Grass(rowIndex);
        map.add(grass);
    }
    addRows();
}

function addRows() {
    const newMetadata = generateRows(20);

    const startIndex = metadata.length;
    metadata.push(...newMetadata);

    newMetadata.forEach((rowData, index) => {
        const rowIndex = startIndex + index + 1;

        if (rowData.type === "forest") {
            const row = Grass(rowIndex);

            rowData.trees.forEach(({ tileIndex, height }) => {
                const three = Tree(tileIndex, height);
                row.add(three);
            });

            map.add(row);
        }

        if (rowData.type === "car") {
            const row = Road(rowIndex);

            rowData.vehicles.forEach((vehicle) => {
                const car = Car(
                    vehicle.initialTileIndex,
                    rowData.direction,
                    vehicle.color
                );
                vehicle.ref = car;
                row.add(car);
            });

            map.add(row);
        }

        if (rowData.type === "truck") {
            const row = Road(rowIndex);

            rowData.vehicles.forEach((vehicle) => {
                const truck = Truck(
                    vehicle.initialTileIndex,
                    rowData.direction,
                    vehicle.color
                );
                vehicle.ref = truck;
                row.add(truck);
            });

            map.add(row);
        }
    });
}

function Player() {
    const player = new THREE.Group();

    const body = new THREE.Mesh(
        new THREE.BoxGeometry(15, 15, 20),
        new THREE.MeshLambertMaterial({
            color: "white",
            flatShading: true,
        })
    );
    body.position.z = 10;
    body.castShadow = true;
    body.receiveShadow = true;
    player.add(body);

    const cap = new THREE.Mesh(
        new THREE.BoxGeometry(2, 4, 2),
        new THREE.MeshLambertMaterial({
            color: 0xf0619a,
            flatShading: true,
        })
    );
    cap.position.z = 21;
    cap.castShadow = true;
    cap.receiveShadow = true;
    player.add(cap);

    const playerContainer = new THREE.Group();
    playerContainer.add(player);

    return playerContainer;
}

function initializePlayer() {
    player.position.x = 0;
    player.position.y = 0;
    player.children[0].position.z = 0; // Reset player's Z position relative to its container

    position.currentRow = 0;
    position.currentTile = 0;

    movesQueue.length = 0;
}

function queueMove(direction) {
    const isValidMove = endsUpInValidPosition(
        {
            rowIndex: position.currentRow,
            tileIndex: position.currentTile,
        },
        [...movesQueue, direction]
    );

    if (!isValidMove) return;

    movesQueue.push(direction);
}

function stepCompleted() {
    const direction = movesQueue.shift();

    if (direction === "forward") position.currentRow += 1;
    if (direction === "backward") position.currentRow -= 1;
    if (direction === "left") position.currentTile -= 1;
    if (direction === "right") position.currentTile += 1;

    if (position.currentRow > metadata.length - 10) addRows();

    if (scoreDOM) scoreDOM.innerText = position.currentRow.toString();
}

function Renderer() {
    const canvas = document.querySelector("canvas.game");
    if (!canvas) throw new Error("Canvas not found");

    const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        canvas: canvas,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    // Enable WebXR - THIS IS KEY FOR VR
    renderer.xr.enabled = true;

    return renderer;
}

function Road(rowIndex) {
    const road = new THREE.Group();
    road.position.y = rowIndex * tileSize;

    const createSection = (color) =>
        new THREE.Mesh(
            new THREE.PlaneGeometry(tilesPerRow * tileSize, tileSize),
            new THREE.MeshLambertMaterial({ color })
        );

    const middle = createSection(0x454a59);
    middle.receiveShadow = true;
    road.add(middle);

    const left = createSection(0x393d49);
    left.position.x = -tilesPerRow * tileSize;
    road.add(left);

    const right = createSection(0x393d49);
    right.position.x = tilesPerRow * tileSize;
    road.add(right);

    return road;
}

function Tree(tileIndex, height) {
    const tree = new THREE.Group();
    tree.position.x = tileIndex * tileSize;

    const trunk = new THREE.Mesh(
        new THREE.BoxGeometry(15, 15, 20),
        new THREE.MeshLambertMaterial({
            color: 0x4d2926,
            flatShading: true,
        })
    );
    trunk.position.z = 10;
    tree.add(trunk);

    const crown = new THREE.Mesh(
        new THREE.BoxGeometry(30, 30, height),
        new THREE.MeshLambertMaterial({
            color: 0x7aa21d,
            flatShading: true,
        })
    );
    crown.position.z = height / 2 + 20;
    crown.castShadow = true;
    crown.receiveShadow = true;
    tree.add(crown);

    return tree;
}

function Truck(initialTileIndex, direction, color) {
    const truck = new THREE.Group();
    truck.position.x = initialTileIndex * tileSize;
    if (!direction) truck.rotation.z = Math.PI;

    const cargo = new THREE.Mesh(
        new THREE.BoxGeometry(70, 35, 35),
        new THREE.MeshLambertMaterial({
            color: 0xb4c6fc,
            flatShading: true,
        })
    );
    cargo.position.x = -15;
    cargo.position.z = 25;
    cargo.castShadow = true;
    cargo.receiveShadow = true;
    truck.add(cargo);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), [
        new THREE.MeshLambertMaterial({
            color,
            flatShading: true,
            map: truckFrontTexture,
        }), // front
        new THREE.MeshLambertMaterial({
            color,
            flatShading: true,
        }), // back
        new THREE.MeshLambertMaterial({
            color,
            flatShading: true,
            map: truckLeftSideTexture,
        }),
        new THREE.MeshLambertMaterial({
            color,
            flatShading: true,
            map: truckRightSideTexture,
        }),
        new THREE.MeshPhongMaterial({ color, flatShading: true }), // top
        new THREE.MeshPhongMaterial({ color, flatShading: true }), // bottom
    ]);
    cabin.position.x = 35;
    cabin.position.z = 20;
    cabin.castShadow = true;
    cabin.receiveShadow = true;

    truck.add(cabin);

    const frontWheel = Wheel(37);
    truck.add(frontWheel);

    const middleWheel = Wheel(5);
    truck.add(middleWheel);

    const backWheel = Wheel(-35);
    truck.add(backWheel);

    return truck;
}

function Wheel(x) {
    const wheel = new THREE.Mesh(
        new THREE.BoxGeometry(12, 33, 12),
        new THREE.MeshLambertMaterial({
            color: 0x333333,
            flatShading: true,
        })
    );
    wheel.position.x = x;
    wheel.position.z = 6;
    return wheel;
}

function calculateFinalPosition(currentPosition, moves) {
    return moves.reduce((position, direction) => {
        if (direction === "forward")
            return {
                rowIndex: position.rowIndex + 1,
                tileIndex: position.tileIndex,
            };
        if (direction === "backward")
            return {
                rowIndex: position.rowIndex - 1,
                tileIndex: position.tileIndex,
            };
        if (direction === "left")
            return {
                rowIndex: position.rowIndex,
                tileIndex: position.tileIndex - 1,
            };
        if (direction === "right")
            return {
                rowIndex: position.rowIndex,
                tileIndex: position.tileIndex + 1,
            };
        return position;
    }, currentPosition);
}

function endsUpInValidPosition(currentPosition, moves) {
    const finalPosition = calculateFinalPosition(currentPosition, moves);

    if (
        finalPosition.rowIndex === -1 ||
        finalPosition.tileIndex === minTileIndex - 1 ||
        finalPosition.tileIndex === maxTileIndex + 1
    ) {
        return false;
    }

    const finalRow = metadata[finalPosition.rowIndex - 1];
    if (
        finalRow &&
        finalRow.type === "forest" &&
        finalRow.trees.some((tree) => tree.tileIndex === finalPosition.tileIndex)
    ) {
        return false;
    }

    return true;
}

function generateRows(amount) {
    const rows = [];
    for (let i = 0; i < amount; i++) {
        const rowData = generateRow();
        rows.push(rowData);
    }
    return rows;
}

function generateRow() {
    const type = randomElement(["car", "truck", "forest"]);
    if (type === "car") return generateCarLaneMetadata();
    if (type === "truck") return generateTruckLaneMetadata();
    return generateForesMetadata();
}

function randomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function generateForesMetadata() {
    const occupiedTiles = new Set();
    const trees = Array.from({ length: 4 }, () => {
        let tileIndex;
        do {
            tileIndex = THREE.MathUtils.randInt(minTileIndex, maxTileIndex);
        } while (occupiedTiles.has(tileIndex));
        occupiedTiles.add(tileIndex);

        const height = randomElement([20, 45, 60]);

        return { tileIndex, height };
    });

    return { type: "forest", trees };
}

function generateCarLaneMetadata() {
    const direction = randomElement([true, false]);
    const speed = randomElement([100, 125, 150]);

    const occupiedTiles = new Set();

    const vehicles = Array.from({ length: 3 }, () => {
        let initialTileIndex;
        do {
            initialTileIndex = THREE.MathUtils.randInt(minTileIndex, maxTileIndex);
        } while (occupiedTiles.has(initialTileIndex));
        occupiedTiles.add(initialTileIndex - 1);
        occupiedTiles.add(initialTileIndex);
        occupiedTiles.add(initialTileIndex + 1);

        const color = randomElement([0xa52523, 0xbdb638, 0x78b14b]);

        return { initialTileIndex, color };
    });

    return { type: "car", direction, speed, vehicles };
}

function generateTruckLaneMetadata() {
    const direction = randomElement([true, false]);
    const speed = randomElement([100, 125, 150]);

    const occupiedTiles = new Set();

    const vehicles = Array.from({ length: 2 }, () => {
        let initialTileIndex;
        do {
            initialTileIndex = THREE.MathUtils.randInt(minTileIndex, maxTileIndex);
        } while (occupiedTiles.has(initialTileIndex));
        occupiedTiles.add(initialTileIndex - 2);
        occupiedTiles.add(initialTileIndex - 1);
        occupiedTiles.add(initialTileIndex);
        occupiedTiles.add(initialTileIndex + 1);
        occupiedTiles.add(initialTileIndex + 2);

        const color = randomElement([0xa52523, 0xbdb638, 0x78b14b]);

        return { initialTileIndex, color };
    });

    return { type: "truck", direction, speed, vehicles };
}

function animatePlayer() {
    if (!movesQueue.length) return;

    if (!moveClock.running) moveClock.start();

    const stepTime = 0.2; // Seconds it takes to take a step
    const progress = Math.min(1, moveClock.getElapsedTime() / stepTime);

    setPosition(progress);
    setRotation(progress);

    // Once a step has ended
    if (progress >= 1) {
        stepCompleted();
        moveClock.stop();
    }
}

function setPosition(progress) {
    const startX = position.currentTile * tileSize;
    const startY = position.currentRow * tileSize;
    let endX = startX;
    let endY = startY;

    if (movesQueue[0] === "left") endX -= tileSize;
    if (movesQueue[0] === "right") endX += tileSize;
    if (movesQueue[0] === "forward") endY += tileSize;
    if (movesQueue[0] === "backward") endY -= tileSize;

    player.position.x = THREE.MathUtils.lerp(startX, endX, progress);
    player.position.y = THREE.MathUtils.lerp(startY, endY, progress);
    player.children[0].position.z = Math.sin(progress * Math.PI) * 8;
}

function setRotation(progress) {
    let endRotation = 0;
    if (movesQueue[0] == "forward") endRotation = 0;
    if (movesQueue[0] == "left") endRotation = Math.PI / 2;
    if (movesQueue[0] == "right") endRotation = -Math.PI / 2;
    if (movesQueue[0] == "backward") endRotation = Math.PI;

    player.children[0].rotation.z = THREE.MathUtils.lerp(
        player.children[0].rotation.z,
        endRotation,
        progress
    );
}

function animateVehicles() {
    const delta = gameClock.getDelta();

    metadata.forEach((rowData) => {
        if (rowData.type === "car" || rowData.type === "truck") {
            const beginningOfRow = (minTileIndex - 2) * tileSize;
            const endOfRow = (maxTileIndex + 2) * tileSize;

            rowData.vehicles.forEach(({ ref }) => {
                if (!ref) throw Error("Vehicle reference is missing");

                if (rowData.direction) {
                    ref.position.x =
                        ref.position.x > endOfRow
                            ? beginningOfRow
                            : ref.position.x + rowData.speed * delta;
                } else {
                    ref.position.x =
                        ref.position.x < beginningOfRow
                            ? endOfRow
                            : ref.position.x - rowData.speed * delta;
                }
            });
        }
    });
}

function hitTest() {
    const row = metadata[position.currentRow - 1];
    if (!row) return;

    if (row.type === "car" || row.type === "truck") {
        const playerBoundingBox = new THREE.Box3();
        playerBoundingBox.setFromObject(player);

        row.vehicles.forEach(({ ref }) => {
            if (!ref) throw Error("Vehicle reference is missing");

            const vehicleBoundingBox = new THREE.Box3();
            vehicleBoundingBox.setFromObject(ref);

            if (playerBoundingBox.intersectsBox(vehicleBoundingBox)) {
                if (!resultDOM || !finalScoreDOM) return;
                resultDOM.style.visibility = "visible";
                finalScoreDOM.innerText = position.currentRow.toString();
                // Pause game logic on game over
                renderer.setAnimationLoop(null);
                if (backgroundMusic) backgroundMusic.pause();
            }
        });
    }
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    player = Player();
    scene.add(player);

    map = new THREE.Group();
    scene.add(map);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight = DirectionalLight();
    dirLight.target = player;
    scene.add(dirLight);

    camera = Camera();

    renderer = Renderer();
    document.getElementById("vr-button-container").appendChild(VRButton.createButton(renderer));

    scoreDOM = document.getElementById("score");
    resultDOM = document.getElementById("result-container");
    finalScoreDOM = document.getElementById("final-score");
    gameControlsDOM = document.getElementById("game-controls");
    backgroundMusic = document.getElementById("backgroundMusic");


    // Configuración de los controladores VR
    const controllerModelFactory = new XRControllerModelFactory();
    // const handModelFactory = new XRHandModelFactory(); // No es necesario si solo se usan los modelos de controlador

    // Controlador 1 (generalmente mano derecha)
    controller1 = renderer.xr.getController(0);
    scene.add(controller1);

    controllerGrip1 = renderer.xr.getControllerGrip(0);
    controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
    scene.add(controllerGrip1);

    // Controlador 2 (generalmente mano izquierda)
    controller2 = renderer.xr.getController(1);
    scene.add(controller2);

    controllerGrip2 = renderer.xr.getControllerGrip(1);
    controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
    scene.add(controllerGrip2);

    // Añadir listeners para los controladores
    controller1.addEventListener('connected', function (event) {
        console.log('Controller 1 connected:', event.data);
        this.gamepad = event.data.gamepad; // Accede al objeto gamepad
        // Puedes agregar más lógica aquí si necesitas un rayo de puntería u otros elementos visuales
    });
    controller2.addEventListener('connected', function (event) {
        console.log('Controller 2 connected:', event.data);
        this.gamepad = event.data.gamepad; // Accede al objeto gamepad
    });

    controller1.addEventListener('disconnected', function () {
        console.log('Controller 1 disconnected');
        this.gamepad = null; // Limpiar referencia al gamepad
    });
    controller2.addEventListener('disconnected', function () {
        console.log('Controller 2 disconnected');
        this.gamepad = null; // Limpiar referencia al gamepad
    });


    // Event listener for VR session start/end to toggle controls
    renderer.xr.addEventListener('sessionstart', function () {
        console.log('VR Session Started');
        gameControlsDOM.classList.add('active'); // Show buttons in VR
        if (backgroundMusic) backgroundMusic.play();
    });

    renderer.xr.addEventListener('sessionend', function () {
        console.log('VR Session Ended');
        gameControlsDOM.classList.remove('active'); // Hide buttons outside VR
        if (backgroundMusic) backgroundMusic.pause();
    });

    // Control buttons for movement (still active)
    document.getElementById("forward")?.addEventListener("click", () => queueMove("forward"));
    document.getElementById("backward")?.addEventListener("click", () => queueMove("backward"));
    document.getElementById("left")?.addEventListener("click", () => queueMove("left"));
    document.getElementById("right")?.addEventListener("click", () => queueMove("right"));

    // Keyboard controls as fallback/alternative (still active)
    window.addEventListener("keydown", (event) => {
        if (event.key === "ArrowUp") {
            event.preventDefault();
            queueMove("forward");
        } else if (event.key === "ArrowDown") {
            event.preventDefault();
            queueMove("backward");
        } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            queueMove("left");
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            queueMove("right");
        }
    });

    document.querySelector("#retry")?.addEventListener("click", initializeGame);

    initializeGame();

    // Start the animation loop for WebXR
    renderer.setAnimationLoop(animate);
}

function initializeGame() {
    initializePlayer();
    initializeMap();

    if (scoreDOM) scoreDOM.innerText = "0";
    if (resultDOM) resultDOM.style.visibility = "hidden";
    if (backgroundMusic) {
        backgroundMusic.currentTime = 0;
        if (renderer.xr.isPresenting) {
            backgroundMusic.play();
        }
    }

    renderer.setAnimationLoop(animate);
}

function animate() {
    animateVehicles();
    animatePlayer();
    hitTest();

    // Get the player's world position
    const playerWorldPosition = new THREE.Vector3();
    player.getWorldPosition(playerWorldPosition);

    // Third-person camera position relative to the player (for 2D view)
    const cameraOffsetX = 0;
    const cameraOffsetY = -150;
    const cameraOffsetZ = 100;

    camera.position.set(
        playerWorldPosition.x + cameraOffsetX,
        playerWorldPosition.y + cameraOffsetY,
        playerWorldPosition.z + cameraOffsetZ
    );

    // Make the camera look slightly ahead and slightly down from the player (for 2D view)
    const lookAtOffsetX = 0;
    const lookAtOffsetY = 50;
    const lookAtOffsetZ = -20;

    camera.lookAt(
        playerWorldPosition.x + lookAtOffsetX,
        playerWorldPosition.y + lookAtOffsetY,
        playerWorldPosition.z + lookAtOffsetZ
    );

    // --- Manejo de entrada de los controladores de VR ---
    if (renderer.xr.isPresenting) { // Solo procesar inputs de VR si estamos en una sesión VR
        // Mover el player para que la cámara VR siempre esté centrada en él
        // La cámara (del visor) se moverá con el jugador.
        // Asegúrate de que el 'player' es el objeto que realmente representa el origen del movimiento en el mundo VR
        
        // La cámara WebXR ya sigue la cabeza del usuario, así que no necesitamos modificar camera.position ni camera.lookAt aquí.
        // Lo que hacemos es mover el objeto 'player' en el mundo 3D en base a la entrada del controlador.
        
        // Usaremos el controller1 (asumiendo que es el controlador de la mano principal, e.g., derecha)
        if (controller1 && controller1.gamepad) {
            const gamepad = controller1.gamepad;

            // En Meta Quest 3, los thumbsticks suelen ser axes[2] y axes[3] para el controlador primario
            // Y-axis (vertical) para adelante/atrás
            // X-axis (horizontal) para izquierda/derecha
            const thumbstickX = gamepad.axes[2]; 
            const thumbstickY = gamepad.axes[3]; 

            const threshold = 0.5; // Ajusta este valor para la sensibilidad del thumbstick

            // Movimiento hacia adelante/atrás
            if (thumbstickY < -threshold) { // Thumbstick empujado hacia arriba
                queueMove("forward");
            } else if (thumbstickY > threshold) { // Thumbstick empujado hacia abajo
                queueMove("backward");
            }

            // Movimiento lateral
            if (thumbstickX < -threshold) { // Thumbstick empujado hacia la izquierda
                queueMove("left");
            } else if (thumbstickX > threshold) { // Thumbstick empujado hacia la derecha
                queueMove("right");
            }
            
            // Ejemplo de mapeo de botones (Meta Quest 3):
            // Botón 'A' o 'X' (suele ser el botón primario del controlador derecho/izquierdo)
            // if (gamepad.buttons[4] && gamepad.buttons[4].pressed) { // índice 4 a menudo es el thumbstick click
            //     console.log("Thumbstick click!");
            // }

            // Gatillo (botón índice 0)
            // if (gamepad.buttons[0] && gamepad.buttons[0].pressed) {
            //     console.log("Gatillo presionado!");
            // }
        }
    }

    renderer.render(scene, camera);
}

// Initialize the Three.js scene and game
init();
