import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  buildSceneModel, highlightedIds, STATE_CLIMBABLE, STATE_REACHABLE,
} from './sceneModel.js';

// Display only: colours, label sizes, the camera and the proportions of the figure.
// No body value or layout dimension is written here.
const STATE_COLOURS = { [STATE_CLIMBABLE]: 0xf59e0b, [STATE_REACHABLE]: 0x60a5fa };
const BASE_COLOUR = 0xcbd5e1;
const BOX_EDGE_COLOUR = 0x475569;
const HIGHLIGHT_COLOUR = 0xfde047;
const TAP_PIXELS = 8;
const PLANE_OPACITY = 0.28;
const PLANE_EASE = 0.15;
const LABEL_HEIGHT_CM = 16;
const LABEL_GAP_CM = 12;
const PULSE_MS = 400;

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
  const font = '600 42px system-ui, sans-serif';
  context.font = font;
  const padding = 16;
  canvas.width = Math.ceil(context.measureText(text).width) + padding * 2;
  canvas.height = 64;
  context.font = font;
  context.fillStyle = 'rgba(255,255,255,0.92)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#1f2328';
  context.textBaseline = 'middle';
  context.fillText(text, padding, canvas.height / 2);
  const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set((LABEL_HEIGHT_CM * canvas.width) / canvas.height, LABEL_HEIGHT_CM, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** A simple figure one unit tall, scaled to the child's height. */
function makeChild() {
  const material = new THREE.MeshStandardMaterial({ color: 0x1d4ed8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xfbbf8a });
  const figure = new THREE.Group();
  const part = (geometry, mat, x, y) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, 0);
    figure.add(mesh);
  };
  part(new THREE.SphereGeometry(0.11, 20, 14), skin, 0, 0.89);
  part(new THREE.CapsuleGeometry(0.09, 0.26, 6, 14), material, 0, 0.58);
  for (const side of [-1, 1]) {
    part(new THREE.CapsuleGeometry(0.035, 0.26, 4, 10), material, side * 0.13, 0.58);
    part(new THREE.CapsuleGeometry(0.045, 0.3, 4, 10), material, side * 0.05, 0.19);
  }
  return figure;
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
export function mountView3d({ container, ledger, roomView, modeButtons }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef1f4);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a94a0, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(100, 400, -200);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(45, 1, 10, 5000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;

  const roomGroup = new THREE.Group();
  const planeGroup = new THREE.Group();
  scene.add(roomGroup, planeGroup);
  const child = makeChild();
  scene.add(child);

  const raycaster = new THREE.Raycaster();
  let model = null;
  let floor = null;
  let boxMeshes = new Map();
  let objectMeshes = new Map();
  let lit = new Set();
  let planes = [];
  let placedCamera = false;

  function placeCamera() {
    const aspect = container.clientWidth / Math.max(container.clientHeight, 1);
    const reach = Math.max(model.width, model.depth) * (aspect < 1 ? 1.5 / aspect ** 0.5 : 1.25);
    controls.target.set(model.width / 2, 60, model.depth / 2);
    camera.position.set(model.width / 2 + reach * 0.45, reach * 0.75, model.depth / 2 - reach);
    controls.update();
  }

  function addBox(object) {
    const height = object.top - object.bottom;
    const material = new THREE.MeshStandardMaterial({ color: STATE_COLOURS[object.state] ?? BASE_COLOUR });
    const geometry = new THREE.BoxGeometry(object.w, height, object.d);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(object.x + object.w / 2, object.bottom + height / 2, object.z + object.d / 2);
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: BOX_EDGE_COLOUR })));
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
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, side: THREE.DoubleSide }),
    );
    wall.position.set(x, model.wallHeight / 2, z);
    wall.rotation.y = rotation;
    roomGroup.add(wall);
  }

  function rebuild() {
    const simulation = roomView.getSimulation();
    const room = roomView.getRoom();
    const boxIds = new Set(roomView.getBoxes().map(({ id }) => id));
    model = buildSceneModel({ ledger, room, landmarks: simulation.landmarks, body: simulation.body, boxIds });

    disposeGroup(roomGroup);
    disposeGroup(planeGroup);
    boxMeshes = new Map();
    objectMeshes = new Map();

    floor = new THREE.Mesh(
      new THREE.PlaneGeometry(model.width, model.depth),
      new THREE.MeshStandardMaterial({ color: 0xe7dcc8 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(model.width / 2, 0, model.depth / 2);
    roomGroup.add(floor);
    addWall(model.width, model.width / 2, model.depth, 0);
    addWall(model.depth, 0, model.depth / 2, Math.PI / 2);

    model.objects.forEach(addBox);
    if (model.pane) {
      const paneHeight = model.pane.top - model.pane.bottom;
      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(model.pane.w, paneHeight),
        new THREE.MeshStandardMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
      );
      pane.position.set(model.pane.x + model.pane.w / 2, model.pane.bottom + paneHeight / 2, model.depth - 1);
      roomGroup.add(pane);
    }

    const previous = new Map(planes.map(({ id, mesh }) => [id, mesh.position.y]));
    planes = model.planes.map(({ id, label, height, category }) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(model.width, model.depth),
        new THREE.MeshBasicMaterial({
          color: toneOf(category), transparent: true, opacity: PLANE_OPACITY, side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(model.width / 2, previous.get(id) ?? height, model.depth / 2);
      const tag = labelSprite(`${label} ${height.toFixed(1)}cm`);
      // A plane is rotated flat, so its local y runs along the floor and z points up.
      tag.position.set(-model.width / 2 + 40, -model.depth / 2 + 10, LABEL_GAP_CM);
      mesh.add(tag);
      planeGroup.add(mesh);
      return { id, mesh, height };
    });

    child.scale.setScalar(model.childHeight);
    if (!placedCamera) {
      placeCamera();
      placedCamera = true;
    }
    applyHighlight(roomView.getHighlightedId());
  }

  function applyHighlight(id) {
    lit = highlightedIds(roomView.getSimulation().landmarks, id);
    for (const [objectId, mesh] of objectMeshes) {
      if (!lit.has(objectId)) mesh.material.emissive.setHex(0x000000);
    }
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = container;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }

  function render(now) {
    const { position, foothold } = roomView.getSimulation();
    child.position.set(position.x, foothold?.height ?? 0, position.y);
    for (const { mesh, height } of planes) {
      mesh.position.y += (height - mesh.position.y) * PLANE_EASE;
    }
    const pulse = 0.55 + 0.45 * Math.sin(now / PULSE_MS);
    for (const id of lit) objectMeshes.get(id)?.material.emissive.setHex(HIGHLIGHT_COLOUR).multiplyScalar(pulse);
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

  new ResizeObserver(resize).observe(container);
  roomView.onConditionChange(rebuild);
  roomView.onHighlightChange(applyHighlight);
  resize();
  rebuild();
  setMode('view');
  requestAnimationFrame(render);
}
