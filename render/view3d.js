import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createPoseTracker, floorShadow, footHeight, reachMark } from './childPose.js';
import { buildSceneModel, cameraPlacement, highlightedIds } from './sceneModel.js';

// Display only: colours, sizes on screen, the camera and the figure. No body value or
// layout dimension is written here.
const PASTELS = [0xf2d4cc, 0xcfe5d9, 0xd2ddef, 0xf1e4bf, 0xe0d6ee, 0xf1d6e2, 0xd0e8eb];
const BOX_COLOUR = 0xe2c79b;
const WINDOW_COLOUR = 0xf2eee4;
const WALL_COLOUR = 0xfffcf2;
const BACKGROUND = 0xf6f5f1;
const ACCENT = 0x2f5d8a;
const DANGER = 0xd32f2f;
const CAUTION = 0xc9900a;
const EDGE_OPACITY = 0.95;
const DANGER_GLOW = 0.32;
const FOCUS_GLOW = 0.28;
const CORNER_CM = 5;
const CORNER_SHARE = 0.3;
const CORNER_SEGMENTS = 3;
const SHADOW_MAP_SIZE = 1024;
const TAP_PIXELS = 6;
const PLANE_OPACITY = 0.22;
const PLANE_EASE = 0.15;
const PLANE_LINGER_MS = 1500;
const PLANE_FADE_MS = 300;
const LABEL_HEIGHT_PIXELS = 28;
const LABEL_GAP_CM = 18;
const PULSE_MS = 450;
const SHADOW_RADIUS_CM = 22;
const SHADOW_OPACITY = 0.3;
const STRETCH_SHARE = 0.06;
const ARM_RAISE = Math.PI * 0.95;
const MS_PER_SECOND = 1000;
const MARK_RADIUS_CM = 16;
const MARK_TUBE_CM = 1.6;
const FIELD_OF_VIEW = 40;
const PLANK_COUNT = 9;
const ARROW_RADIUS_CM = 1.8;
const ARROW_HEAD_CM = 14;
const ARROW_LIFT_CM = 6;
const CHIP_LIFT_CM = 10;

function labelSprite(text) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const font = '600 48px system-ui, -apple-system, "Hiragino Sans", sans-serif';
  const padding = 26;
  context.font = font;
  canvas.width = Math.ceil(context.measureText(text).width) + padding * 2;
  canvas.height = 84;
  context.font = font;
  context.fillStyle = 'rgba(255,255,255,0.95)';
  context.beginPath();
  context.roundRect(0, 0, canvas.width, canvas.height, canvas.height / 2);
  context.fill();
  context.fillStyle = '#1f2933';
  context.textBaseline = 'middle';
  context.fillText(text, padding, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, sizeAttenuation: false });
  const sprite = new THREE.Sprite(material);
  sprite.userData.widthPerHeight = canvas.width / canvas.height;
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
    context.fillStyle = i % 2 === 0 ? '#efe2c9' : '#e9dabd';
    context.fillRect(0, i * plank, canvas.width, plank);
    context.fillStyle = 'rgba(150,120,80,0.2)';
    context.fillRect(0, i * plank, canvas.width, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A round figure one unit tall, two to three heads high, with arms on shoulder joints. */
function makeChild() {
  const shirt = new THREE.MeshStandardMaterial({ color: 0x7fa6cf, roughness: 0.7 });
  const trousers = new THREE.MeshStandardMaterial({ color: 0x4f6f94, roughness: 0.7 });
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

/** A red tube with a cone, from one point to another. */
function arrow(from, to) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: DANGER, depthTest: false, transparent: true });
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(ARROW_RADIUS_CM, ARROW_RADIUS_CM, length - ARROW_HEAD_CM, 10), material);
  shaft.position.y = (length - ARROW_HEAD_CM) / 2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(ARROW_RADIUS_CM * 3.5, ARROW_HEAD_CM, 14), material);
  head.position.y = length - ARROW_HEAD_CM / 2;
  group.add(shaft, head);
  group.position.copy(from);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  group.renderOrder = 9;
  shaft.renderOrder = 9;
  head.renderOrder = 9;
  return group;
}

/**
 * Draws the room and handles pointing at it. Every change to the room goes out through
 * `editing`; this module never decides whether a change is allowed.
 */
export function mountView3d({ container, chip, ledger, settings, session, slider, editing }) {
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
  // The left button is for picking and dragging; the view turns with the right and zooms with the wheel.
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  let cameraTouched = false;
  controls.addEventListener('start', () => {
    cameraTouched = true;
  });
  renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());

  const roomGroup = new THREE.Group();
  const planeGroup = new THREE.Group();
  const arrowGroup = new THREE.Group();
  scene.add(roomGroup, planeGroup, arrowGroup);
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
    new THREE.MeshBasicMaterial({ color: ACCENT }),
  );
  mark.rotation.x = Math.PI / 2;
  scene.add(mark);
  let updatePose = createPoseTracker(settings.display_seconds);

  const raycaster = new THREE.Raycaster();
  let lastFrame = null;
  let model = null;
  let floor = null;
  let backWall = null;
  let objectMeshes = new Map();
  let planes = [];
  let sliderHeld = false;
  let planesUntil = 0;
  let danger = { level: null, ids: new Set(), arrows: [] };
  let focus = new Set();
  let selectedId = null;
  let tool = { type: 'select' };

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
    mesh.userData.id = object.id;
    mesh.userData.height = height;
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(object.w + 2, height + 2, object.d + 2)),
      new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: EDGE_OPACITY }),
    );
    edge.visible = false;
    mesh.add(edge);
    mesh.userData.edge = edge;
    const label = labelSprite(object.label);
    label.position.set(0, height / 2 + LABEL_GAP_CM, 0);
    mesh.add(label);
    roomGroup.add(mesh);
    objectMeshes.set(object.id, mesh);
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
    return wall;
  }

  function fitLabels() {
    const { clientHeight: height } = container;
    if (height === 0) return;
    const size = (LABEL_HEIGHT_PIXELS / height) * 2 * Math.tan(THREE.MathUtils.degToRad(FIELD_OF_VIEW) / 2);
    for (const group of [roomGroup, planeGroup]) {
      group.traverse((node) => {
        if (node.isSprite) node.scale.set(size * node.userData.widthPerHeight, size, 1);
      });
    }
  }

  function drawArrows() {
    disposeGroup(arrowGroup);
    for (const { from, to } of danger.arrows) {
      const start = objectMeshes.get(from);
      const end = objectMeshes.get(to);
      if (!start || !end) continue;
      const origin = start.position.clone();
      origin.y += start.userData.height / 2 + ARROW_LIFT_CM;
      const target = end.position.clone();
      target.y += end.userData.height / 2;
      arrowGroup.add(arrow(origin, target));
    }
  }

  function rebuild() {
    const simulation = session.getSimulation();
    const room = session.getRoom();
    const boxIds = new Set(room.landmarks.filter(({ temporary }) => temporary).map(({ id }) => id));
    const firstBuild = model === null;
    model = buildSceneModel({ ledger, room, landmarks: simulation.landmarks, body: simulation.body, boxIds });
    updatePose = createPoseTracker(settings.display_seconds);

    disposeGroup(roomGroup);
    disposeGroup(planeGroup);
    objectMeshes = new Map();

    floor = new THREE.Mesh(
      new THREE.PlaneGeometry(model.width, model.depth),
      new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(model.width / 2, 0, model.depth / 2);
    floor.receiveShadow = true;
    roomGroup.add(floor);
    backWall = addWall(model.width, model.width / 2, model.depth, 0);
    addWall(model.depth, 0, model.depth / 2, Math.PI / 2);

    model.objects.forEach(addObject);
    if (model.pane) {
      const paneHeight = model.pane.top - model.pane.bottom;
      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(model.pane.w, paneHeight),
        new THREE.MeshStandardMaterial({ color: 0xcfe9f5, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
      );
      pane.position.set(model.pane.x + model.pane.w / 2, model.pane.bottom + paneHeight / 2, model.depth - 1);
      roomGroup.add(pane);
    }

    const previous = new Map(planes.map(({ id, mesh }) => [id, mesh.position.y]));
    planes = model.planes.map(({ id, label, height }) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(model.width, model.depth),
        new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(model.width / 2, previous.get(id) ?? height, model.depth / 2);
      const tag = labelSprite(`${label} ${Math.round(height)}cm`);
      // A plane is rotated flat, so its local y runs along the floor and z points up.
      tag.position.set(id === 'reach' ? -model.width / 5 : model.width / 5, model.depth / 2 - 12, LABEL_GAP_CM);
      mesh.add(tag);
      mesh.visible = false;
      planeGroup.add(mesh);
      return { id, mesh, tag, height };
    });

    child.root.scale.setScalar(model.childHeight);
    if (selectedId && !objectMeshes.has(selectedId)) selectedId = null;
    aimSun();
    fitLabels();
    if (firstBuild) fitCamera();
    drawArrows();
  }

  function planeStrength(now) {
    if (sliderHeld) return 1;
    const left = planesUntil - now;
    if (left <= 0) return 0;
    return Math.min(left / PLANE_FADE_MS, 1);
  }

  function groupOf(id) {
    return highlightedIds(session.getRoom().landmarks, id);
  }

  function paintObjects(now) {
    const pulse = 0.75 + 0.25 * Math.sin(now / PULSE_MS);
    const selected = selectedId ? groupOf(selectedId) : new Set();
    const edgeColour = danger.level === 'caution' ? CAUTION : DANGER;
    for (const [id, mesh] of objectMeshes) {
      const { material, userData } = mesh;
      const { edge } = userData;
      if (danger.ids.has(id)) {
        material.emissive.setHex(edgeColour).multiplyScalar(DANGER_GLOW * pulse);
      } else if (focus.has(id)) {
        material.emissive.setHex(ACCENT).multiplyScalar(FOCUS_GLOW * pulse);
      } else {
        material.emissive.setHex(0x000000);
      }
      edge.visible = selected.has(id) || danger.ids.has(id) || focus.has(id);
      edge.material.color.setHex(selected.has(id) || !danger.ids.has(id) ? ACCENT : edgeColour);
    }
  }

  function placeChip() {
    const mesh = selectedId && objectMeshes.get(selectedId);
    if (!mesh || !editing.canRemove(selectedId)) {
      chip.hidden = true;
      return;
    }
    const top = mesh.position.clone();
    top.y += mesh.userData.height / 2 + CHIP_LIFT_CM;
    top.x += mesh.geometry.parameters.width / 2;
    top.project(camera);
    chip.hidden = top.z > 1;
    chip.style.left = `${((top.x + 1) / 2) * container.clientWidth}px`;
    chip.style.top = `${((1 - top.y) / 2) * container.clientHeight}px`;
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = container;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    fitLabels();
    if (model && !cameraTouched) fitCamera();
  }

  function render(now) {
    const simulation = session.getSimulation();
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
    mark.material.color.setHex(reached.reachesLock ? DANGER : ACCENT);

    const strength = planeStrength(now);
    for (const { mesh, tag, height } of planes) {
      mesh.visible = strength > 0;
      mesh.material.opacity = PLANE_OPACITY * strength;
      tag.material.opacity = strength;
      mesh.position.y += (height - mesh.position.y) * PLANE_EASE;
    }
    paintObjects(now);
    controls.update();
    renderer.render(scene, camera);
    placeChip();
    requestAnimationFrame(render);
  }

  // ---- Pointing: pick, drag, place ----
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

  function wallOrFloorPoint(event) {
    ray(event);
    const [hit] = raycaster.intersectObjects([backWall, floor]);
    return hit ? { x: hit.point.x, y: hit.point.z } : null;
  }

  function pickObject(event) {
    ray(event);
    const [hit] = raycaster.intersectObjects([...objectMeshes.values()], false);
    return hit ? hit.object.userData.id : null;
  }

  function select(id) {
    selectedId = id;
    editing.onSelect(id);
  }

  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const id = tool.type === 'select' ? pickObject(event) : null;
    const start = floorPoint(event);
    const centre = id ? objectMeshes.get(id).position : null;
    press = {
      x: event.clientX,
      y: event.clientY,
      id,
      offset: id && start ? { x: start.x - centre.x, y: start.y - centre.z } : { x: 0, y: 0 },
      moved: false,
      valid: null,
    };
    renderer.domElement.setPointerCapture(event.pointerId);
  });

  renderer.domElement.addEventListener('pointermove', (event) => {
    if (!press?.id || !editing.canMove(press.id)) return;
    if (!press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) < TAP_PIXELS) return;
    press.moved = true;
    const point = floorPoint(event);
    if (!point) return;
    const target = { x: point.x - press.offset.x, y: point.y - press.offset.y };
    const candidate = editing.tryMove(press.id, target);
    if (!candidate) return;
    press.valid = target;
    for (const landmark of candidate.landmarks) {
      const mesh = objectMeshes.get(landmark.id);
      if (!mesh) continue;
      mesh.position.x = landmark.x + landmark.w / 2;
      mesh.position.z = landmark.y + landmark.d / 2;
    }
    drawArrows();
  });

  renderer.domElement.addEventListener('pointerup', (event) => {
    if (!press) return;
    const { id, moved, valid, x, y } = press;
    press = null;
    if (moved) {
      if (id && valid) editing.move(id, valid);
      else if (id) rebuild();
      return;
    }
    if (Math.hypot(event.clientX - x, event.clientY - y) >= TAP_PIXELS) return;
    if (tool.type === 'select') {
      select(id);
      return;
    }
    const point = tool.type === 'window' ? wallOrFloorPoint(event) : floorPoint(event);
    if (point) editing.useTool(tool, point);
    else editing.missed(tool);
  });

  window.addEventListener('keydown', (event) => {
    if (event.target.closest('input, select, textarea, dialog')) return;
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId && editing.canRemove(selectedId)) {
      event.preventDefault();
      editing.remove(selectedId);
    }
  });
  chip.addEventListener('click', () => {
    if (selectedId) editing.remove(selectedId);
  });

  // Planes show while the age slider is in use and fade soon after it is let go.
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
  session.on('restart', rebuild);
  resize();
  rebuild();
  requestAnimationFrame(render);

  return {
    setTool(next) {
      tool = next;
      renderer.domElement.style.cursor = next.type === 'select' ? 'default' : 'crosshair';
    },
    setDanger(next) {
      danger = next;
      drawArrows();
    },
    setFocus(id) {
      focus = id ? groupOf(id) : new Set();
    },
    select,
  };
}
