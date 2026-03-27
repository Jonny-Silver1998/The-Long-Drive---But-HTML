--- a/javascript.js
+++ b/javascript.js
@@ -0,0 +1,1091 @@
+/*
+ * Top-down 2D survival driving prototype inspired by The Long Drive.
+ * Pure HTML5 Canvas + vanilla JavaScript.
+ */
+
+// ==========================
+// 1) CENTRALIZED CONFIG
+// ==========================
+const CONFIG = {
+  world: {
+    tileSize: 256,
+    roadTileSize: 256,
+    playerSpawn: { x: 0, y: 140 },
+    carSpawn: { x: 0, y: 0 },
+    itemSpawnOffset: 90,
+  },
+
+  camera: {
+    smoothness: 0.12,
+  },
+
+  player: {
+    size: 34,
+    walkSpeed: 210,
+    grabRadius: 50,
+    interactionRadius: 60,
+    maxHunger: 100,
+    hungerDepletionRate: 1.9, // hunger points per second
+    hungerCriticalSlowdownAt: 20,
+    hungerCriticalSpeedFactor: 0.7,
+  },
+
+  // ZAZ 968M real-world inspired -> arcade constants
+  // Real: 40 hp, 840 kg, top speed 118 km/h, 0-100 km/h in ~32s
+  // Arcade conversion notes:
+  // - 118 km/h -> ~32.8 m/s. In this 2D world we map this to maxSpeedPx = 510 px/s.
+  // - 0-100 time is slow, so acceleration is intentionally modest.
+  car: {
+    width: 68,
+    height: 122,
+    enginePowerHp: 40,
+    curbWeightKg: 840,
+    maxSpeedKmh: 118,
+    zeroToHundredSeconds: 32,
+
+    // Arcade movement constants
+    accelerationRate: 195, // px/s^2 forward
+    reverseAccelerationRate: 120,
+    brakeRate: 300,
+    maxVelocity: 510, // px/s
+    drag: 0.92, // applied every second (scaled by dt)
+    rollingResistance: 18,
+    steeringTurnRate: 2.2, // radians/sec at low speed
+    steeringSpeedInfluenceMin: 0.35,
+
+    maxFuel: 60,
+    fuelConsumptionRate: 0.013, // fuel units / second per normalized throttle*speed load
+  },
+
+  items: {
+    food: {
+      hungerRestore: 35,
+      mass: 0.35,
+      radius: 18,
+    },
+    canister: {
+      fuelAmount: 24,
+      transferRatePerSecond: 8,
+      mass: 2.7,
+      radius: 20,
+    },
+    engine: {
+      mass: 78,
+      radius: 24,
+    },
+    carrySpring: {
+      followStrength: 19,
+      damping: 0.83,
+      holdDistance: 30,
+    },
+  },
+
+  ui: {
+    font: "16px Arial",
+    lineHeight: 22,
+    panelX: 14,
+    panelY: 20,
+  },
+};
+
+// ==========================
+// 2) CANVAS + INPUT
+// ==========================
+const canvas = document.getElementById("gameCanvas");
+const ctx = canvas.getContext("2d");
+
+function resizeCanvas() {
+  canvas.width = window.innerWidth;
+  canvas.height = window.innerHeight;
+}
+window.addEventListener("resize", resizeCanvas);
+resizeCanvas();
+
+const input = {
+  keys: {},
+  mouse: {
+    x: 0,
+    y: 0,
+    worldX: 0,
+    worldY: 0,
+    leftDown: false,
+    justPressed: false,
+    justReleased: false,
+  },
+};
+
+window.addEventListener("keydown", (e) => {
+  if (!input.keys[e.code]) input.keys[e.code] = { down: true, pressed: true };
+  else {
+    input.keys[e.code].pressed = !input.keys[e.code].down;
+    input.keys[e.code].down = true;
+  }
+});
+
+window.addEventListener("keyup", (e) => {
+  if (!input.keys[e.code]) input.keys[e.code] = { down: false, pressed: false };
+  input.keys[e.code].down = false;
+});
+
+canvas.addEventListener("mousemove", (e) => {
+  const rect = canvas.getBoundingClientRect();
+  input.mouse.x = e.clientX - rect.left;
+  input.mouse.y = e.clientY - rect.top;
+});
+
+canvas.addEventListener("mousedown", (e) => {
+  if (e.button === 0) {
+    input.mouse.leftDown = true;
+    input.mouse.justPressed = true;
+  }
+});
+
+canvas.addEventListener("mouseup", (e) => {
+  if (e.button === 0) {
+    input.mouse.leftDown = false;
+    input.mouse.justReleased = true;
+  }
+});
+
+// ==========================
+// 3) IMAGE LOADING
+// ==========================
+const imagePaths = {
+  player: "sprites/Player.png",
+  grass: "sprites/grass.jpg",
+  car: "sprites/cars/ZAZ 968M/ZAZ.png",
+  engine: "sprites/cars/ZAZ 968M/Engine.png",
+  canister: "sprites/items/Canister.png",
+  food: "sprites/items/food/food.png",
+
+  roads: {
+    straightVertical: "sprites/roads/Road_Straight_Vertical.png",
+    curve90: "sprites/roads/Road_Curve_90.png",
+    crossroads: "sprites/roads/Crossroads.png",
+    horizontal: "sprites/roads/Road_Horizontal.png",
+    longVertical: "sprites/roads/Road_Long_Stretch_Vertical.png",
+    splitter: "sprites/roads/Road_Splitter.png",
+  },
+};
+
+function createImage(src) {
+  const img = new Image();
+  img.src = src;
+  return img;
+}
+
+function preloadImages(pathsObj, onComplete) {
+  const flat = [];
+
+  function flatten(obj) {
+    Object.values(obj).forEach((v) => {
+      if (typeof v === "string") flat.push(v);
+      else flatten(v);
+    });
+  }
+  flatten(pathsObj);
+
+  let loaded = 0;
+  let failed = 0;
+  const total = flat.length;
+
+  function doneOne() {
+    loaded += 1;
+    if (loaded >= total) onComplete({ total, failed });
+  }
+
+  flat.forEach((src) => {
+    const img = new Image();
+    img.onload = doneOne;
+    img.onerror = () => {
+      failed += 1;
+      doneOne();
+    };
+    img.src = src;
+  });
+}
+
+const assets = {
+  player: createImage(imagePaths.player),
+  grass: createImage(imagePaths.grass),
+  car: createImage(imagePaths.car),
+  engine: createImage(imagePaths.engine),
+  canister: createImage(imagePaths.canister),
+  food: createImage(imagePaths.food),
+  roads: {
+    straightVertical: createImage(imagePaths.roads.straightVertical),
+    curve90: createImage(imagePaths.roads.curve90),
+    crossroads: createImage(imagePaths.roads.crossroads),
+    horizontal: createImage(imagePaths.roads.horizontal),
+    longVertical: createImage(imagePaths.roads.longVertical),
+    splitter: createImage(imagePaths.roads.splitter),
+  },
+};
+
+// ==========================
+// 4) HELPERS
+// ==========================
+function clamp(v, min, max) {
+  return Math.max(min, Math.min(max, v));
+}
+
+function length(x, y) {
+  return Math.hypot(x, y);
+}
+
+function distance(a, b) {
+  return Math.hypot(a.x - b.x, a.y - b.y);
+}
+
+function lerp(a, b, t) {
+  return a + (b - a) * t;
+}
+
+function normalize(vx, vy) {
+  const len = Math.hypot(vx, vy) || 1;
+  return { x: vx / len, y: vy / len };
+}
+
+function angleTo(fromX, fromY, toX, toY) {
+  return Math.atan2(toY - fromY, toX - fromX);
+}
+
+function rotatePoint(x, y, angle) {
+  const c = Math.cos(angle);
+  const s = Math.sin(angle);
+  return { x: x * c - y * s, y: x * s + y * c };
+}
+
+function pointInRotatedRect(px, py, cx, cy, w, h, angle) {
+  const local = rotatePoint(px - cx, py - cy, -angle);
+  return Math.abs(local.x) <= w / 2 && Math.abs(local.y) <= h / 2;
+}
+
+function getKey(code) {
+  if (!input.keys[code]) return { down: false, pressed: false };
+  return input.keys[code];
+}
+
+function worldToScreen(x, y, camera) {
+  return {
+    x: x - camera.x + canvas.width / 2,
+    y: y - camera.y + canvas.height / 2,
+  };
+}
+
+// ==========================
+// 5) GAME STATE
+// ==========================
+const game = {
+  time: 0,
+  dt: 0,
+  lastTs: 0,
+  camera: { x: 0, y: 0 },
+
+  player: {
+    x: CONFIG.world.playerSpawn.x,
+    y: CONFIG.world.playerSpawn.y,
+    vx: 0,
+    vy: 0,
+    angle: 0,
+    hunger: CONFIG.player.maxHunger,
+    insideCar: false,
+    carryingItemId: null,
+  },
+
+  car: {
+    x: CONFIG.world.carSpawn.x,
+    y: CONFIG.world.carSpawn.y,
+    angle: -Math.PI / 2,
+    vx: 0,
+    vy: 0,
+    speed: 0,
+    fuel: 10,
+    hasEngine: false,
+  },
+
+  items: [],
+  roads: {
+    map: new Map(), // key: "tx,ty" => roadTile
+    activeKeys: new Set(),
+    pathState: {
+      tx: 0,
+      ty: 0,
+      dir: 0, // 0 up, 1 right, 2 down, 3 left
+      lengthUntilDecision: 5,
+    },
+    maxAhead: 180,
+    generatedSteps: 0,
+  },
+};
+
+let nextItemId = 1;
+
+function addItem(type, x, y) {
+  const cfg = CONFIG.items[type];
+  const item = {
+    id: nextItemId++,
+    type,
+    x,
+    y,
+    vx: 0,
+    vy: 0,
+    radius: cfg.radius,
+    active: true,
+    fuelRemaining: type === "canister" ? cfg.fuelAmount : 0,
+  };
+  game.items.push(item);
+  return item;
+}
+
+function setupInitialWorld() {
+  addItem("engine", game.car.x + CONFIG.world.itemSpawnOffset, game.car.y + 20);
+  addItem("canister", game.car.x - CONFIG.world.itemSpawnOffset, game.car.y + 50);
+  addItem("food", game.player.x + 80, game.player.y + 30);
+
+  for (let i = 0; i < 40; i += 1) {
+    extendRoadPath();
+  }
+}
+
+// ==========================
+// 6) PROCEDURAL ROAD SYSTEM
+// ==========================
+const DIRS = [
+  { x: 0, y: -1 },
+  { x: 1, y: 0 },
+  { x: 0, y: 1 },
+  { x: -1, y: 0 },
+];
+
+function tileKey(tx, ty) {
+  return `${tx},${ty}`;
+}
+
+function chooseWeighted(options) {
+  let sum = 0;
+  for (const o of options) sum += o.weight;
+  let r = Math.random() * sum;
+  for (const o of options) {
+    r -= o.weight;
+    if (r <= 0) return o.value;
+  }
+  return options[options.length - 1].value;
+}
+
+function getRoadSpriteByType(type) {
+  switch (type) {
+    case "straightV":
+      return assets.roads.straightVertical;
+    case "straightH":
+      return assets.roads.horizontal;
+    case "curve":
+      return assets.roads.curve90;
+    case "cross":
+      return assets.roads.crossroads;
+    case "splitter":
+      return assets.roads.splitter;
+    case "longV":
+      return assets.roads.longVertical;
+    default:
+      return assets.roads.straightVertical;
+  }
+}
+
+function roadRotationFor(type, inDir, outDir) {
+  // inDir/outDir are direction indices [0..3]
+  if (type === "straightV") return 0;
+  if (type === "longV") return 0;
+  if (type === "straightH") return Math.PI / 2;
+  if (type === "cross") return 0;
+  if (type === "splitter") return (outDir * Math.PI) / 2;
+
+  // curve mapping based on entering and exiting directions
+  const pair = `${inDir}->${outDir}`;
+  const lookup = {
+    "0->1": 0,
+    "1->2": Math.PI / 2,
+    "2->3": Math.PI,
+    "3->0": -Math.PI / 2,
+
+    "1->0": -Math.PI / 2,
+    "2->1": 0,
+    "3->2": Math.PI / 2,
+    "0->3": Math.PI,
+  };
+  return lookup[pair] ?? 0;
+}
+
+function placeRoadTile(tx, ty, type, rotation = 0) {
+  const key = tileKey(tx, ty);
+  game.roads.map.set(key, { tx, ty, type, rotation });
+  game.roads.activeKeys.add(key);
+}
+
+function extendRoadPath() {
+  const state = game.roads.pathState;
+
+  const prevDir = state.dir;
+  let nextDir = prevDir;
+  let tileType = prevDir % 2 === 0 ? "straightV" : "straightH";
+
+  if (state.lengthUntilDecision <= 0) {
+    const action = chooseWeighted([
+      { value: "straight", weight: 62 },
+      { value: "left", weight: 16 },
+      { value: "right", weight: 16 },
+      { value: "cross", weight: 6 },
+    ]);
+
+    if (action === "left") {
+      nextDir = (prevDir + 3) % 4;
+      tileType = "curve";
+    } else if (action === "right") {
+      nextDir = (prevDir + 1) % 4;
+      tileType = "curve";
+    } else if (action === "cross") {
+      tileType = Math.random() < 0.5 ? "cross" : "splitter";
+    } else {
+      tileType = prevDir % 2 === 0 ? (Math.random() < 0.2 ? "longV" : "straightV") : "straightH";
+    }
+
+    state.lengthUntilDecision = 3 + Math.floor(Math.random() * 6);
+  } else {
+    state.lengthUntilDecision -= 1;
+  }
+
+  const d = DIRS[nextDir];
+  state.tx += d.x;
+  state.ty += d.y;
+
+  const rot = roadRotationFor(tileType, prevDir, nextDir);
+  placeRoadTile(state.tx, state.ty, tileType, rot);
+
+  state.dir = nextDir;
+  game.roads.generatedSteps += 1;
+}
+
+function ensureRoadCoverage() {
+  const focus = game.player.insideCar ? game.car : game.player;
+  const aheadDistance = CONFIG.world.roadTileSize * 28;
+  const dir = DIRS[game.roads.pathState.dir];
+
+  const aheadX = focus.x + dir.x * aheadDistance;
+  const aheadY = focus.y + dir.y * aheadDistance;
+
+  const dx = aheadX - game.roads.pathState.tx * CONFIG.world.roadTileSize;
+  const dy = aheadY - game.roads.pathState.ty * CONFIG.world.roadTileSize;
+  const distToAhead = Math.hypot(dx, dy);
+
+  if (distToAhead < CONFIG.world.roadTileSize * 12) {
+    for (let i = 0; i < 20; i += 1) extendRoadPath();
+  }
+
+  // prune far tiles for memory
+  const maxDist = CONFIG.world.roadTileSize * 45;
+  const camX = game.camera.x;
+  const camY = game.camera.y;
+  for (const key of game.roads.activeKeys) {
+    const tile = game.roads.map.get(key);
+    if (!tile) continue;
+    const wx = tile.tx * CONFIG.world.roadTileSize;
+    const wy = tile.ty * CONFIG.world.roadTileSize;
+    if (Math.hypot(wx - camX, wy - camY) > maxDist) {
+      game.roads.activeKeys.delete(key);
+      game.roads.map.delete(key);
+    }
+  }
+}
+
+// ==========================
+// 7) UPDATE LOGIC
+// ==========================
+function update(dt) {
+  game.time += dt;
+  game.dt = dt;
+
+  updateMouseWorld();
+  updatePlayerRotationToMouse();
+
+  if (!game.player.insideCar) {
+    updatePlayerMovement(dt);
+    updateCarPassiveMotion(dt);
+    handleMouseInteractWhenOnFoot();
+    handleCarryAndItemPhysics(dt);
+    handleEngineInstallLogic();
+    handleFoodUse();
+    handleEngineExtract();
+    handleCanisterFuelTransfer(dt);
+    tryEnterCar();
+  } else {
+    updateCarDriving(dt);
+    followPlayerInsideCar();
+    handleExitCar();
+  }
+
+  updateHunger(dt);
+  updateCamera(dt);
+  ensureRoadCoverage();
+
+  clearOneFrameInput();
+}
+
+function updateMouseWorld() {
+  input.mouse.worldX = game.camera.x + (input.mouse.x - canvas.width / 2);
+  input.mouse.worldY = game.camera.y + (input.mouse.y - canvas.height / 2);
+}
+
+function updatePlayerRotationToMouse() {
+  game.player.angle = angleTo(
+    game.player.x,
+    game.player.y,
+    input.mouse.worldX,
+    input.mouse.worldY
+  );
+}
+
+function updatePlayerMovement(dt) {
+  const up = getKey("KeyW").down;
+  const down = getKey("KeyS").down;
+  const left = getKey("KeyA").down;
+  const right = getKey("KeyD").down;
+
+  let mx = 0;
+  let my = 0;
+  if (up) my -= 1;
+  if (down) my += 1;
+  if (left) mx -= 1;
+  if (right) mx += 1;
+
+  if (mx !== 0 || my !== 0) {
+    const n = normalize(mx, my);
+    let speed = CONFIG.player.walkSpeed;
+    if (game.player.hunger <= CONFIG.player.hungerCriticalSlowdownAt) {
+      speed *= CONFIG.player.hungerCriticalSpeedFactor;
+    }
+    game.player.vx = n.x * speed;
+    game.player.vy = n.y * speed;
+  } else {
+    game.player.vx = 0;
+    game.player.vy = 0;
+  }
+
+  game.player.x += game.player.vx * dt;
+  game.player.y += game.player.vy * dt;
+}
+
+function updateCarPassiveMotion(dt) {
+  // passive drag when not controlled
+  game.car.vx *= Math.pow(CONFIG.car.drag, dt);
+  game.car.vy *= Math.pow(CONFIG.car.drag, dt);
+  game.car.x += game.car.vx * dt;
+  game.car.y += game.car.vy * dt;
+  game.car.speed = Math.hypot(game.car.vx, game.car.vy);
+}
+
+function updateCarDriving(dt) {
+  const car = game.car;
+
+  const throttle = getKey("KeyW").down ? 1 : 0;
+  const reverse = getKey("KeyS").down ? 1 : 0;
+  const steerLeft = getKey("KeyA").down ? 1 : 0;
+  const steerRight = getKey("KeyD").down ? 1 : 0;
+  const braking = (throttle && reverse) || getKey("Space").down;
+
+  let forward = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
+
+  if (car.hasEngine && car.fuel > 0) {
+    if (throttle) {
+      car.vx += forward.x * CONFIG.car.accelerationRate * dt;
+      car.vy += forward.y * CONFIG.car.accelerationRate * dt;
+    }
+
+    if (reverse) {
+      car.vx -= forward.x * CONFIG.car.reverseAccelerationRate * dt;
+      car.vy -= forward.y * CONFIG.car.reverseAccelerationRate * dt;
+    }
+
+    const speed = Math.hypot(car.vx, car.vy);
+    const speedFactor = clamp(speed / CONFIG.car.maxVelocity, 0, 1);
+    const steeringFactor = lerp(1, CONFIG.car.steeringSpeedInfluenceMin, speedFactor);
+    const steerInput = steerRight - steerLeft;
+    car.angle += steerInput * CONFIG.car.steeringTurnRate * steeringFactor * dt;
+
+    // fuel burn under load
+    const normalizedLoad = clamp(speed / CONFIG.car.maxVelocity, 0, 1) * (throttle ? 1 : 0.2);
+    car.fuel -= CONFIG.car.fuelConsumptionRate * normalizedLoad * dt * 60;
+    car.fuel = clamp(car.fuel, 0, CONFIG.car.maxFuel);
+  }
+
+  if (braking) {
+    const s = Math.hypot(car.vx, car.vy);
+    if (s > 0) {
+      const decel = Math.min(s, CONFIG.car.brakeRate * dt);
+      const n = normalize(car.vx, car.vy);
+      car.vx -= n.x * decel;
+      car.vy -= n.y * decel;
+    }
+  }
+
+  // rolling resistance + drag
+  const speedNow = Math.hypot(car.vx, car.vy);
+  if (speedNow > 0) {
+    const rr = Math.min(speedNow, CONFIG.car.rollingResistance * dt);
+    const n = normalize(car.vx, car.vy);
+    car.vx -= n.x * rr;
+    car.vy -= n.y * rr;
+  }
+
+  car.vx *= Math.pow(CONFIG.car.drag, dt * 60);
+  car.vy *= Math.pow(CONFIG.car.drag, dt * 60);
+
+  // clamp max speed
+  const clampedSpeed = Math.hypot(car.vx, car.vy);
+  if (clampedSpeed > CONFIG.car.maxVelocity) {
+    const n = normalize(car.vx, car.vy);
+    car.vx = n.x * CONFIG.car.maxVelocity;
+    car.vy = n.y * CONFIG.car.maxVelocity;
+  }
+
+  car.x += car.vx * dt;
+  car.y += car.vy * dt;
+  car.speed = Math.hypot(car.vx, car.vy);
+}
+
+function tryEnterCar() {
+  if (!input.mouse.justPressed) return;
+  const player = game.player;
+  const car = game.car;
+  const dist = distance(player, car);
+  if (dist > CONFIG.player.interactionRadius + 34) return;
+
+  const clickedCar = pointInRotatedRect(
+    input.mouse.worldX,
+    input.mouse.worldY,
+    car.x,
+    car.y,
+    CONFIG.car.width,
+    CONFIG.car.height,
+    car.angle
+  );
+
+  if (clickedCar) {
+    player.insideCar = true;
+    player.carryingItemId = null;
+  }
+}
+
+function handleExitCar() {
+  if (!getKey("KeyE").pressed) return;
+  const player = game.player;
+  const car = game.car;
+
+  player.insideCar = false;
+
+  const exitOffset = rotatePoint(CONFIG.car.width * 0.9, 0, car.angle);
+  player.x = car.x + exitOffset.x;
+  player.y = car.y + exitOffset.y;
+  player.vx = 0;
+  player.vy = 0;
+}
+
+function followPlayerInsideCar() {
+  game.player.x = game.car.x;
+  game.player.y = game.car.y;
+}
+
+function handleMouseInteractWhenOnFoot() {
+  const player = game.player;
+
+  // Drop on release regardless
+  if (input.mouse.justReleased) {
+    player.carryingItemId = null;
+    return;
+  }
+
+  if (!input.mouse.leftDown) return;
+
+  // Maintain current carry if still valid
+  if (player.carryingItemId !== null) {
+    const carried = getItemById(player.carryingItemId);
+    if (!carried || !carried.active) {
+      player.carryingItemId = null;
+    }
+    return;
+  }
+
+  // Can't pick while clicking directly on car body (reserved for enter car)
+  const clickedCar = pointInRotatedRect(
+    input.mouse.worldX,
+    input.mouse.worldY,
+    game.car.x,
+    game.car.y,
+    CONFIG.car.width,
+    CONFIG.car.height,
+    game.car.angle
+  );
+  if (clickedCar) return;
+
+  // Find closest item under cursor & inside grab radius
+  let best = null;
+  let bestDist = Infinity;
+
+  for (const item of game.items) {
+    if (!item.active) continue;
+
+    const dPlayer = Math.hypot(item.x - player.x, item.y - player.y);
+    if (dPlayer > CONFIG.player.grabRadius) continue;
+
+    const dMouse = Math.hypot(item.x - input.mouse.worldX, item.y - input.mouse.worldY);
+    if (dMouse <= item.radius + 12 && dMouse < bestDist) {
+      bestDist = dMouse;
+      best = item;
+    }
+  }
+
+  if (best) {
+    player.carryingItemId = best.id;
+  }
+}
+
+function handleCarryAndItemPhysics(dt) {
+  const player = game.player;
+
+  for (const item of game.items) {
+    if (!item.active) continue;
+
+    if (player.carryingItemId === item.id && input.mouse.leftDown) {
+      // Smooth carry target in front of player, biased to mouse direction
+      const toMouse = normalize(input.mouse.worldX - player.x, input.mouse.worldY - player.y);
+      const targetX = player.x + toMouse.x * CONFIG.items.carrySpring.holdDistance;
+      const targetY = player.y + toMouse.y * CONFIG.items.carrySpring.holdDistance;
+
+      const ax = (targetX - item.x) * CONFIG.items.carrySpring.followStrength;
+      const ay = (targetY - item.y) * CONFIG.items.carrySpring.followStrength;
+
+      item.vx = (item.vx + ax * dt) * CONFIG.items.carrySpring.damping;
+      item.vy = (item.vy + ay * dt) * CONFIG.items.carrySpring.damping;
+    } else {
+      // Friction when dropped
+      item.vx *= 0.84;
+      item.vy *= 0.84;
+    }
+
+    item.x += item.vx * dt;
+    item.y += item.vy * dt;
+  }
+}
+
+function handleFoodUse() {
+  const pressedF = getKey("KeyF").pressed;
+  if (!pressedF) return;
+
+  const carried = getCarriedItem();
+  if (!carried || carried.type !== "food") return;
+
+  carried.active = false;
+  game.player.carryingItemId = null;
+  game.player.hunger = clamp(
+    game.player.hunger + CONFIG.items.food.hungerRestore,
+    0,
+    CONFIG.player.maxHunger
+  );
+}
+
+function handleCanisterFuelTransfer(dt) {
+  if (!getKey("KeyF").down) return;
+
+  const carried = getCarriedItem();
+  if (!carried || carried.type !== "canister") return;
+
+  const nearCar = distance(carried, game.car) <= CONFIG.car.width * 0.8;
+  if (!nearCar) return;
+
+  if (carried.fuelRemaining <= 0) return;
+  if (game.car.fuel >= CONFIG.car.maxFuel) return;
+
+  const amount = Math.min(
+    CONFIG.items.canister.transferRatePerSecond * dt,
+    carried.fuelRemaining,
+    CONFIG.car.maxFuel - game.car.fuel
+  );
+
+  carried.fuelRemaining -= amount;
+  game.car.fuel += amount;
+}
+
+function handleEngineInstallLogic() {
+  if (game.car.hasEngine) return;
+
+  const carried = getCarriedItem();
+  if (!carried || carried.type !== "engine") return;
+
+  const touchesCar = distance(carried, game.car) <= CONFIG.car.width * 0.58 + carried.radius;
+  if (!touchesCar) return;
+
+  game.car.hasEngine = true;
+  carried.active = false;
+  game.player.carryingItemId = null;
+}
+
+function handleEngineExtract() {
+  if (!getKey("KeyF").pressed) return;
+  if (game.player.insideCar) return;
+  if (!game.car.hasEngine) return;
+
+  const nearCar = distance(game.player, game.car) <= CONFIG.player.interactionRadius + 10;
+  if (!nearCar) return;
+
+  game.car.hasEngine = false;
+
+  const engineItem = game.items.find((it) => it.type === "engine");
+  if (engineItem) {
+    engineItem.active = true;
+    engineItem.x = game.player.x;
+    engineItem.y = game.player.y;
+    engineItem.vx = 0;
+    engineItem.vy = 0;
+    game.player.carryingItemId = engineItem.id;
+  } else {
+    const newEngine = addItem("engine", game.player.x, game.player.y);
+    game.player.carryingItemId = newEngine.id;
+  }
+}
+
+function updateHunger(dt) {
+  game.player.hunger -= CONFIG.player.hungerDepletionRate * dt;
+  game.player.hunger = clamp(game.player.hunger, 0, CONFIG.player.maxHunger);
+}
+
+function updateCamera(dt) {
+  const target = game.player.insideCar ? game.car : game.player;
+
+  game.camera.x = lerp(game.camera.x, target.x, 1 - Math.pow(1 - CONFIG.camera.smoothness, dt * 60));
+  game.camera.y = lerp(game.camera.y, target.y, 1 - Math.pow(1 - CONFIG.camera.smoothness, dt * 60));
+}
+
+function clearOneFrameInput() {
+  input.mouse.justPressed = false;
+  input.mouse.justReleased = false;
+
+  Object.keys(input.keys).forEach((k) => {
+    input.keys[k].pressed = false;
+  });
+}
+
+function getItemById(id) {
+  return game.items.find((i) => i.id === id) || null;
+}
+
+function getCarriedItem() {
+  if (game.player.carryingItemId == null) return null;
+  return getItemById(game.player.carryingItemId);
+}
+
+// ==========================
+// 8) DRAWING
+// ==========================
+function draw() {
+  ctx.clearRect(0, 0, canvas.width, canvas.height);
+
+  drawInfiniteGrass();
+  drawRoads();
+  drawCar();
+  drawItems();
+  drawPlayer();
+  drawInteractionHints();
+  drawUI();
+}
+
+function drawInfiniteGrass() {
+  const tile = CONFIG.world.tileSize;
+
+  const left = game.camera.x - canvas.width / 2;
+  const top = game.camera.y - canvas.height / 2;
+  const right = game.camera.x + canvas.width / 2;
+  const bottom = game.camera.y + canvas.height / 2;
+
+  const startX = Math.floor(left / tile) * tile;
+  const startY = Math.floor(top / tile) * tile;
+
+  for (let y = startY; y <= bottom + tile; y += tile) {
+    for (let x = startX; x <= right + tile; x += tile) {
+      const s = worldToScreen(x, y, game.camera);
+      if (assets.grass.complete && assets.grass.naturalWidth > 0) {
+        ctx.drawImage(assets.grass, s.x, s.y, tile, tile);
+      } else {
+        ctx.fillStyle = "#396b33";
+        ctx.fillRect(s.x, s.y, tile, tile);
+      }
+    }
+  }
+}
+
+function drawRoads() {
+  const size = CONFIG.world.roadTileSize;
+  for (const tile of game.roads.map.values()) {
+    const wx = tile.tx * size;
+    const wy = tile.ty * size;
+    const s = worldToScreen(wx, wy, game.camera);
+
+    const img = getRoadSpriteByType(tile.type);
+
+    ctx.save();
+    ctx.translate(s.x + size / 2, s.y + size / 2);
+    ctx.rotate(tile.rotation);
+    if (img.complete && img.naturalWidth > 0) {
+      ctx.drawImage(img, -size / 2, -size / 2, size, size);
+    } else {
+      ctx.fillStyle = "#666";
+      ctx.fillRect(-size / 2, -size / 2, size, size);
+    }
+    ctx.restore();
+  }
+}
+
+function drawCar() {
+  const c = game.car;
+  const s = worldToScreen(c.x, c.y, game.camera);
+
+  ctx.save();
+  ctx.translate(s.x, s.y);
+  ctx.rotate(c.angle + Math.PI / 2);
+
+  if (assets.car.complete && assets.car.naturalWidth > 0) {
+    ctx.drawImage(assets.car, -CONFIG.car.width / 2, -CONFIG.car.height / 2, CONFIG.car.width, CONFIG.car.height);
+  } else {
+    ctx.fillStyle = "#c4552c";
+    ctx.fillRect(-CONFIG.car.width / 2, -CONFIG.car.height / 2, CONFIG.car.width, CONFIG.car.height);
+  }
+
+  ctx.restore();
+}
+
+function drawItems() {
+  for (const item of game.items) {
+    if (!item.active) continue;
+
+    const s = worldToScreen(item.x, item.y, game.camera);
+    const size = item.radius * 2;
+
+    let img = null;
+    if (item.type === "food") img = assets.food;
+    if (item.type === "canister") img = assets.canister;
+    if (item.type === "engine") img = assets.engine;
+
+    if (img && img.complete && img.naturalWidth > 0) {
+      ctx.drawImage(img, s.x - size / 2, s.y - size / 2, size, size);
+    } else {
+      ctx.fillStyle = item.type === "engine" ? "#555" : item.type === "canister" ? "#9b2" : "#d87";
+      ctx.beginPath();
+      ctx.arc(s.x, s.y, item.radius, 0, Math.PI * 2);
+      ctx.fill();
+    }
+
+    if (game.player.carryingItemId === item.id) {
+      ctx.strokeStyle = "#fff";
+      ctx.lineWidth = 2;
+      ctx.beginPath();
+      ctx.arc(s.x, s.y, item.radius + 4, 0, Math.PI * 2);
+      ctx.stroke();
+    }
+  }
+}
+
+function drawPlayer() {
+  if (game.player.insideCar) return;
+
+  const p = game.player;
+  const s = worldToScreen(p.x, p.y, game.camera);
+  const size = CONFIG.player.size;
+
+  ctx.save();
+  ctx.translate(s.x, s.y);
+  ctx.rotate(p.angle + Math.PI / 2);
+
+  if (assets.player.complete && assets.player.naturalWidth > 0) {
+    ctx.drawImage(assets.player, -size / 2, -size / 2, size, size);
+  } else {
+    ctx.fillStyle = "#f0f0f0";
+    ctx.beginPath();
+    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
+    ctx.fill();
+  }
+
+  ctx.restore();
+}
+
+function drawInteractionHints() {
+  if (game.player.insideCar) return;
+
+  const pScreen = worldToScreen(game.player.x, game.player.y, game.camera);
+
+  // Grab radius ring
+  ctx.strokeStyle = "rgba(255,255,255,0.2)";
+  ctx.lineWidth = 1;
+  ctx.beginPath();
+  ctx.arc(pScreen.x, pScreen.y, CONFIG.player.grabRadius, 0, Math.PI * 2);
+  ctx.stroke();
+
+  // Car interaction ring
+  ctx.strokeStyle = "rgba(80,180,255,0.25)";
+  ctx.beginPath();
+  ctx.arc(pScreen.x, pScreen.y, CONFIG.player.interactionRadius, 0, Math.PI * 2);
+  ctx.stroke();
+}
+
+function drawUI() {
+  ctx.save();
+  ctx.font = CONFIG.ui.font;
+  ctx.fillStyle = "rgba(0,0,0,0.45)";
+  ctx.fillRect(8, 8, 370, 166);
+
+  ctx.fillStyle = "#fff";
+
+  const speedKmh = (game.car.speed / CONFIG.car.maxVelocity) * CONFIG.car.maxSpeedKmh;
+  const lines = [
+    `Hunger: ${game.player.hunger.toFixed(1)} / ${CONFIG.player.maxHunger}`,
+    `Fuel: ${game.car.fuel.toFixed(1)} / ${CONFIG.car.maxFuel}`,
+    `Speed: ${game.player.insideCar ? speedKmh.toFixed(1) : "0.0"} km/h`,
+    `Engine Installed: ${game.car.hasEngine ? "Yes" : "No"}`,
+    `Inside Car: ${game.player.insideCar ? "Yes" : "No"}`,
+    `Controls: WASD move/drive, LMB hold grab, F use, E exit car`,
+    `Canister Fuel Left: ${
+      (game.items.find((i) => i.type === "canister")?.fuelRemaining ?? 0).toFixed(1)
+    }`,
+  ];
+
+  lines.forEach((line, i) => {
+    ctx.fillText(line, CONFIG.ui.panelX, CONFIG.ui.panelY + i * CONFIG.ui.lineHeight);
+  });
+
+  if (!game.car.hasEngine) {
+    ctx.fillStyle = "#ffd55c";
+    ctx.fillText("Car cannot move without engine installed.", 14, 188);
+  }
+
+  ctx.restore();
+}
+
+// ==========================
+// 9) LOOP
+// ==========================
+function gameLoop(ts) {
+  if (!game.lastTs) game.lastTs = ts;
+  let dt = (ts - game.lastTs) / 1000;
+  game.lastTs = ts;
+  dt = clamp(dt, 0, 0.05);
+
+  update(dt);
+  draw();
+
+  requestAnimationFrame(gameLoop);
+}
+
+preloadImages(imagePaths, ({ failed }) => {
+  setupInitialWorld();
+  if (failed > 0) {
+    console.warn(`Some images failed to load (${failed}). Placeholder rendering will be used where needed.`);
+  }
+  requestAnimationFrame(gameLoop);
+});
