import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  createPoseTracker, floorShadow, footHeight, reachMark,
} from './childPose.js';
import {
  buildSceneModel, cameraPlacement, highlightedIds, reachableNow, STATE_CLIMBABLE, STATE_REACHABLE,
} from './sceneModel.js';

// Display only: colours, label sizes, the camera and the proportions of the figure.
// No body value or layout dimension is written here.
const PASTELS = [0xf7c9c0, 0xbfe3d0, 0xc8d8f2, 0xf6e2ad, 0xdccdf0, 0xf5cfe0, 0xc5e8ec];
const BOX_COLOUR = 0xe5c99c;
const WINDOW_COLOUR = 0xf4efe2;
const WALL_COLOUR = 0xfffbef;
const BACKGROUND = 0xf3f1ea;
const STATE_COLOURS = { [STATE_CLIMBABLE]: 0xf59e0b, [STATE_REACHABLE]: 0x60a5fa };
const REACHED_GLOW = 0xff9d5c;
const REACHED_GLOW_SCALE = 0.55;
const COUNTERMEASURE_GLOW = 0xfde047;
const FOOTHOLD_EDGE = 0xffffff;
const FOOTHOLD_EDGE_OPACITY = 0.75;
const CORNER_CM = 5;
const CORNER_SHARE = 0.3;
const CORNER_SEGMENTS = 3;
const SHADOW_MAP_SIZE = 1024;
const TAP_PIXELS = 8;
const PLANE_OPACITY = 0.28;
const PLANE_EASE = 0.15;
const PLANE_LINGER_MS = 1500;
const PLANE_FADE_MS = 300;
const LABEL_HEIGHT_CM = 24;
const LABEL_GAP_CM = 16;
const PULSE_MS = 400;
const SHADOW_RADIUS_CM = 22;
const SHADOW_OPACITY = 0.3;
const STRETCH_SHARE = 0.06;
const ARM_RAISE = Math.PI * 0.95;
const MS_PER_SECOND = 1000;
const MARK_RADIUS_CM = 16;
const MARK_TUBE_CM = 1.6;
const MARK_COLOUR = 0x3b82f6;
const MARK_OVER_LOCK_COLOUR = 0xdc2626;
const FIELD_OF_VIEW = 40;
const PLANK_COUNT = 9;

function toneOf(category) {
  const probe = document.createElement('span');
  probe.className = `cat-${category}`;
  document.body.append(probe);
  const tone = getComputedStyle(probe).getPropertyValue('--tone').trim();
  probe.remove();
  return new THREE.Color(tone);
}

function labelSprite(text) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const font = '600 48px system-ui, -apple-system, "Hiragino Sans", sans-serif';
  const padding = 26;
  context.font = font;
  canvas.width = Math.ceil(context.measureText(text).width) + padding * 2;
  canvas.height = 84;
  context.font = font;
  context.fillStyle = 'rgba(255,255,255,0.94)';
  context.beginPath();
  context.roundRect(0, 0, canvas.width, canvas.height, canvas.height / 2);
  context.fill();
  context.fillStyle = '#2f3640';
  context.textBaseline = 'middle';
  context.fillText(text, padding, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set((LABEL_HEIGHT_CM * canvas.width) / canvas.height, LABEL_HEIGHT_CM, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function woodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const plank = canvas.height / PLANK_COUNT;
  for (let i = 0; i < PLANK_COUNT; i += 1) {
    context.fillStyle = i % 2 === 0 ? '#ecdcc0' : '#e6d4b4';
    context.fillRect(0, i * plank, canvas.width, plank);
    context.fillStyle = 'rgba(150,120,80,0.25)';
    context.fillRect(0, i * plank, canvas.width, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A round figure one unit tall, two to three heads high, with arms on shoulder joints. */
function makeChild() {
  const shirt = new THREE.MeshStandardMaterial({ color: 0x7fb5e6, roughness: 0.7 });
  const trousers = new THREE.MeshStandardMaterial({ color: 0x5f88b8, roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xfcd5ae, roughness: 0.6 });
  const body = new THREE.Group();
  const part = (parent, geometry, material, x, y, scale) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, 0);
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  part(body, new THREE.SphereGeometry(0.2, 24, 18), skin, 0, 0.8);
  part(body, new THREE.SphereGeometry(0.16, 20, 16), shirt, 0, 0.42, [1, 1.2, 0.9]);
  const arms = [-1, 1].map((side) => {
    part(body, new THREE.CapsuleGeometry(0.055, 0.1, 4, 10), trousers, side * 0.07, 0.11);
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.17, 0.53, 0);
    part(shoulder, new THREE.CapsuleGeometry(0.045, 0.16, 4, 10), shirt, 0, -0.1);
    part(shoulder, new THREE.SphereGeometry(0.05, 12, 10), skin, 0, -0.22);
    body.add(shoulder);
    return shoulder;
  });
  const root = new THREE.Group();
  root.add(body);
  return { root, body, arms };
}

/** Puts the figure in a pose from the tracker; feet stay at the group's origin. */
function applyPose(figure, pose) {
  const { root, body, arms } = figure;
  root.position.set(pose.x, pose.feet, pose.z);
  root.rotation.y = pose.yaw + (pose.turned ? Math.PI : 0);
  body.rotation.x = pose.lean + pose.pitch;
  body.scale.y = 1 + pose.stretch * STRETCH_SHARE;
  for (const arm of arms) arm.rotation.x = -ARM_RAISE * pose.arms;
}

function disposeGroup(group) {
  group.traverse((node) => {
    node.geometry?.dispose();
    node.material?.map?.dispose();
    node.material?.dispose();
  });
  group.clear();
}

/** Draws the room in 3D. All changes go through `roomView`, so 2D and 3D stay in step. */
export function mountView3d({ container, ledger, settings, roomView, modeButtons, slider }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cdb8, 2.0));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sun.shadow.radius = 6;
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 10, 5000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  let cameraTouched = false;
  controls.addEventListener('start', () => {
    cameraTouched = true;
  });

  const roomGroup = new THREE.Group();
  const planeGroup = new THREE.Group();
  scene.add(roomGroup, planeGroup);
  const child = makeChild();
  scene.add(child.root);
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(SHADOW_RADIUS_CM, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.renderOrder = 5;
  scene.add(blob);
  const mark = new THREE.Mesh(
    new THREE.TorusGeometry(MARK_RADIUS_CM, MARK_TUBE_CM, 10, 32),
    new THREE.MeshBasicMaterial({ color: MARK_COLOUR }),
  );
  mark.rotation.x = Math.PI / 2;
  scene.add(mark);
  const updatePose = createPoseTracker(settings.display_seconds);

  const raycaster = new THREE.Raycaster();
  let lastFrame = null;
  let model = null;
  let floor = null;
  let boxMeshes = new Map();
  let objectMeshes = new Map();
  let lit = new Set();
  let planes = [];
  let sliderHeld = false;
  let planesUntil = 0;

  function fitCamera() {
    const { position, target } = cameraPlacement(model, camera.aspect, FIELD_OF_VIEW);
    controls.target.set(target.x, target.y, target.z);
    camera.position.set(position.x, position.y, position.z);
    controls.update();
  }

  function aimSun() {
    const { width, depth, wallHeight } = model;
    sun.target.position.set(width / 2, 0, depth / 2);
    sun.position.set(width * 0.8, wallHeight * 2, -depth * 0.4);
    const span = Math.max(width, depth);
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 10, far: span * 4 });
    sun.shadow.camera.updateProjectionMatrix();
  }

  function baseColour(object, index) {
    if (object.kind === 'box') return BOX_COLOUR;
    if (object.kind === 'window' || object.kind === 'window_lock') return WINDOW_COLOUR;
    return PASTELS[index % PASTELS.length];
  }

  function addObject(object, index) {
    const height = object.top - object.bottom;
    const radius = Math.min(CORNER_CM, Math.min(object.w, object.d, height) * CORNER_SHARE);
    const material = new THREE.MeshStandardMaterial({ color: baseColour(object, index), roughness: 0.85 });
    const geometry = new RoundedBoxGeometry(object.w, height, object.d, CORNER_SEGMENTS, radius);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(object.x + object.w / 2, object.bottom + height / 2, object.z + object.d / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.base = baseColour(object, index);
    mesh.userData.state = object.state;

    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(object.w + 1, height + 1, object.d + 1)),
      new THREE.LineBasicMaterial({ color: FOOTHOLD_EDGE, transparent: true, opacity: FOOTHOLD_EDGE_OPACITY }),
    );
    edge.visible = false;
    mesh.add(edge);
    mesh.userData.edge = edge;

    const label = labelSprite(object.label);
    label.position.set(0, height / 2 + LABEL_GAP_CM, 0);
    mesh.add(label);
    roomGroup.add(mesh);
    objectMeshes.set(object.id, mesh);
    if (object.kind === 'box') boxMeshes.set(object.id, mesh);
  }

  function addWall(width, x, z, rotation) {
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(width, model.wallHeight),
      new THREE.MeshStandardMaterial({ color: WALL_COLOUR, emissive: WALL_COLOUR, emissiveIntensity: 0.35, side: THREE.DoubleSide, roughness: 1 }),
    );
    wall.position.set(x, model.wallHeight / 2, z);
    wall.rotation.y = rotation;
    wall.receiveShadow = true;
    roomGroup.add(wall);
  }

  function rebuild() {
    const simulation = roomView.getSimulation();
    const room = roomView.getRoom();
    const boxIds = new Set(roomView.getBoxes().map(({ id }) => id));
    const firstBuild = model === null;
    model = buildSceneModel({ ledger, room, landmarks: simulation.landmarks, body: simulation.body, boxIds });

    disposeGroup(roomGroup);
    disposeGroup(planeGroup);
    boxMeshes = new Map();
    objectMeshes = new Map();

    floor = new THREE.Mesh(
      new THREE.PlaneGeometry(model.width, model.depth),
      new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(model.width / 2, 0, model.depth / 2);
    floor.receiveShadow = true;
    roomGroup.add(floor);
    addWall(model.width, model.width / 2, model.depth, 0);
    addWall(model.depth, 0, model.depth / 2, Math.PI / 2);

    model.objects.forEach(addObject);
    if (model.pane) {
      const paneHeight = model.pane.top - model.pane.bottom;
      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(model.pane.w, paneHeight),
        new THREE.MeshStandardMaterial({ color: 0xbfe7f7, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
      );
      pane.position.set(model.pane.x + model.pane.w / 2, model.pane.bottom + paneHeight / 2, model.depth - 1);
      roomGroup.add(pane);
    }

    const previous = new Map(planes.map(({ id, mesh }) => [id, mesh.position.y]));
    planes = model.planes.map(({ id, label, height, category }) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(model.width, model.depth),
        new THREE.MeshBasicMaterial({
          color: toneOf(category), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(model.width / 2, previous.get(id) ?? height, model.depth / 2);
      const tag = labelSprite(`${label} ${height.toFixed(1)}cm`);
      // A plane is rotated flat, so its local y runs along the floor and z points up.
      tag.position.set(id === 'reach' ? -model.width / 5 : model.width / 5, model.depth / 2 - 12, LABEL_GAP_CM);
      mesh.add(tag);
      mesh.visible = false;
      planeGroup.add(mesh);
      return { id, mesh, tag, height };
    });

    child.root.scale.setScalar(model.childHeight);
    aimSun();
    if (firstBuild) fitCamera();
    applyHighlight(roomView.getHighlightedId());
  }

  function applyHighlight(id) {
    lit = highlightedIds(roomView.getSimulation().landmarks, id);
  }

  /** Planes show while the slider is in use and fade soon after it is let go. */
  function planeStrength(now) {
    if (sliderHeld) return 1;
    const left = planesUntil - now;
    if (left <= 0) return 0;
    return Math.min(left / PLANE_FADE_MS, 1);
  }

  function paintObjects(simulation, strength, now) {
    const reached = reachableNow({
      ledger,
      body: simulation.body,
      landmarks: simulation.landmarks,
      position: simulation.position,
      foothold: simulation.foothold,
    });
    const pulse = 0.55 + 0.45 * Math.sin(now / PULSE_MS);
    for (const [id, mesh] of objectMeshes) {
      const { material, userData } = mesh;
      material.color.setHex(strength > 0 ? STATE_COLOURS[userData.state] ?? userData.base : userData.base);
      if (lit.has(id)) material.emissive.setHex(COUNTERMEASURE_GLOW).multiplyScalar(pulse);
      else if (reached.has(id)) material.emissive.setHex(REACHED_GLOW).multiplyScalar(REACHED_GLOW_SCALE);
      else material.emissive.setHex(0x000000);
      userData.edge.visible = simulation.foothold?.id === id;
    }
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = container;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (model && !cameraTouched) fitCamera();
  }

  function render(now) {
    const simulation = roomView.getSimulation();
    const seconds = lastFrame === null ? 0 : (now - lastFrame) / MS_PER_SECOND;
    lastFrame = now;
    const pose = updatePose({
      x: simulation.position.x,
      z: simulation.position.y,
      feet: footHeight(simulation),
      events: simulation.events,
    }, seconds);
    applyPose(child, pose);
    const onFloor = floorShadow(pose.feet);
    blob.position.set(pose.x, 0.5, pose.z);
    blob.scale.setScalar(onFloor.scale);
    blob.material.opacity = SHADOW_OPACITY * onFloor.opacity;
    const reached = reachMark(simulation, pose.feet);
    mark.position.set(pose.x, reached.height, pose.z);
    mark.material.color.setHex(reached.reachesLock ? MARK_OVER_LOCK_COLOUR : MARK_COLOUR);

    const strength = planeStrength(now);
    for (const { mesh, tag, height } of planes) {
      mesh.visible = strength > 0;
      mesh.material.opacity = PLANE_OPACITY * strength;
      tag.material.opacity = strength;
      mesh.position.y += (height - mesh.position.y) * PLANE_EASE;
    }
    paintObjects(simulation, strength, now);
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(render);
  }

  // Placement: a tap on the floor adds a box; dragging a box moves it across the floor.
  let mode = 'view';
  let press = null;

  function ray(event) {
    const area = renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - area.left) / area.width) * 2 - 1,
      -(((event.clientY - area.top) / area.height) * 2 - 1),
    );
    raycaster.setFromCamera(pointer, camera);
  }

  function floorPoint(event) {
    ray(event);
    const [hit] = raycaster.intersectObject(floor);
    return hit ? { x: hit.point.x, y: hit.point.z } : null;
  }

  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (mode !== 'place') return;
    ray(event);
    const [hit] = raycaster.intersectObjects([...boxMeshes.values()], false);
    const boxId = hit && [...boxMeshes].find(([, mesh]) => mesh === hit.object)[0];
    press = { x: event.clientX, y: event.clientY, boxId, moved: false, valid: null };
    renderer.domElement.setPointerCapture(event.pointerId);
  });

  renderer.domElement.addEventListener('pointermove', (event) => {
    if (!press?.boxId) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < TAP_PIXELS) return;
    press.moved = true;
    const point = floorPoint(event);
    if (!point) return;
    const candidate = roomView.tryMoveBox(press.boxId, point);
    if (!candidate) return;
    press.valid = point;
    const mesh = boxMeshes.get(press.boxId);
    mesh.position.x = candidate.x + candidate.w / 2;
    mesh.position.z = candidate.y + candidate.d / 2;
  });

  renderer.domElement.addEventListener('pointerup', (event) => {
    if (!press) return;
    const { boxId, moved, valid, x, y } = press;
    press = null;
    if (boxId) {
      if (moved && valid) roomView.moveBox(boxId, valid);
      return;
    }
    if (Math.hypot(event.clientX - x, event.clientY - y) >= TAP_PIXELS) return;
    const point = floorPoint(event);
    if (point) roomView.addBoxAt(point);
  });

  function setMode(next) {
    mode = next;
    controls.enabled = mode === 'view';
    for (const [name, button] of Object.entries(modeButtons)) {
      button.setAttribute('aria-pressed', String(name === mode));
    }
  }
  for (const [name, button] of Object.entries(modeButtons)) {
    button.addEventListener('click', () => setMode(name));
  }

  const keepPlanes = () => {
    planesUntil = performance.now() + PLANE_LINGER_MS;
  };
  slider.addEventListener('input', keepPlanes);
  slider.addEventListener('pointerdown', () => {
    sliderHeld = true;
  });
  for (const type of ['pointerup', 'pointercancel']) {
    window.addEventListener(type, () => {
      if (sliderHeld) keepPlanes();
      sliderHeld = false;
    });
  }

  new ResizeObserver(resize).observe(container);
  roomView.onConditionChange(rebuild);
  roomView.onHighlightChange(applyHighlight);
  resize();
  rebuild();
  setMode('view');
  requestAnimationFrame(render);
}
