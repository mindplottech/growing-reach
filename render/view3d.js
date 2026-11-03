import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeChild } from './childFigure3d.js';
import { createPoseTracker, floorShadow, footHeight, reachMark } from './childPose.js';
import { buildFurniture, buildSkirting } from './furniture3d.js';
import { buildSceneModel, cameraPlacement, highlightedIds } from './sceneModel.js';

// Display only: colours, sizes on screen, the camera and the figure. No body value or
// layout dimension is written here.
const WALL_COLOUR = 0xfffcf2;
const BACKGROUND = 0xf6f5f1;
const ACCENT = 0x2f5d8a;
const DANGER = 0xd32f2f;
const CAUTION = 0xc9900a;
const EDGE_OPACITY = 0.95;
const DANGER_GLOW = 0.32;
const FOCUS_GLOW = 0.28;
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
const HAZARD_COLOUR = 0xb5534a;
const HAZARD_THICK_CM = 3;
const HAZARD_LABEL_SHARE = 0.8;
const SIT_DROP = 0.14;
const noRaycast = () => {};
const TRAIL_OPACITY = 0.35;
const TRAIL_LIFT_CM = 0.6;

function labelSprite(text, { fill = 'rgba(255,255,255,0.95)', ink = '#1f2933', share = 1 } = {}) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const font = '600 48px system-ui, -apple-system, "Hiragino Sans", sans-serif';
  const padding = 26;
  context.font = font;
  canvas.width = Math.ceil(context.measureText(text).width) + padding * 2;
  canvas.height = 84;
  context.font = font;
  context.fillStyle = fill;
  context.beginPath();
  context.roundRect(0, 0, canvas.width, canvas.height, canvas.height / 2);
  context.fill();
  context.fillStyle = ink;
  context.textBaseline = 'middle';
  context.fillText(text, padding, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, sizeAttenuation: false });
  const sprite = new THREE.Sprite(material);
  sprite.userData.widthPerHeight = canvas.width / canvas.height;
  sprite.userData.share = share;
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

function applyPose(figure, pose) {
  const { root, body, arms } = figure;
  root.position.set(pose.x, pose.feet, pose.z);
  root.rotation.y = pose.yaw + (pose.turned ? Math.PI : 0);
  body.rotation.x = pose.lean + pose.pitch;
  body.position.y = -SIT_DROP * (pose.sit ?? 0);
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
export function mountView3d({ container, chip, ledger, settings, session, slider, editing, trailToggle }) {
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
  // The walked trail: one line per leg, redrawn when the simulation adds points.
  const trailGroup = new THREE.Group();
  scene.add(trailGroup);
  const trailMaterial = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: TRAIL_OPACITY });
  let trailPoints = -1;

  function drawTrail(simulation, pose) {
    trailGroup.visible = trailToggle.checked;
    if (!trailGroup.visible) return;
    const legs = simulation.trail;
    const count = legs.reduce((sum, leg) => sum + leg.length, 0);
    const last = legs[legs.length - 1];
    if (count !== trailPoints) {
      trailPoints = count;
      trailGroup.children.forEach((line) => line.geometry.dispose());
      trailGroup.clear();
      for (const leg of legs) {
        const geometry = new THREE.BufferGeometry().setFromPoints(
          [...leg, ...(leg === last ? [{ x: pose.x, y: pose.z }] : [])].map(({ x, y }) => new THREE.Vector3(x, TRAIL_LIFT_CM, y)),
        );
        trailGroup.add(new THREE.Line(geometry, trailMaterial));
      }
    } else if (last && trailGroup.children.length > 0) {
      // Only the end of the current leg moves between points: follow the child.
      const line = trailGroup.children[trailGroup.children.length - 1];
      const positions = Array.from(line.geometry.attributes.position.array);
      positions.splice(-3, 3, pose.x, TRAIL_LIFT_CM, pose.z);
      line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    }
  }
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
  let hoveredId = null;
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

  function addObject(object, index) {
    // A group standing on the floor at the centre of the footprint; its parts carry the look.
    const { group, materials } = buildFurniture(object, model, index);
    const alongZ = object.facing.x === 0;
    const localW = alongZ ? object.w : object.d;
    const localD = alongZ ? object.d : object.w;
    const edgeBottom = object.bottom;
    const edgeHeight = object.visualTop - edgeBottom;
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(localW + 2, edgeHeight + 2, localD + 2)),
      new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: EDGE_OPACITY }),
    );
    edge.position.y = edgeBottom + edgeHeight / 2;
    edge.visible = false;
    edge.raycast = noRaycast;
    group.add(edge);
    // Furniture names show only under the mouse; the lock keeps its tag all the time.
    const label = labelSprite(object.label);
    label.position.set(0, object.visualTop + LABEL_GAP_CM, 0);
    label.raycast = noRaycast;
    label.visible = object.kind === 'window_lock';
    group.add(label);
    Object.assign(group.userData, {
      id: object.id, top: object.top, w: object.w, edge, label, materials, alwaysLabelled: label.visible,
    });
    roomGroup.add(group);
    objectMeshes.set(object.id, group);
  }

  function showLabels() {
    for (const [id, group] of objectMeshes) {
      group.userData.label.visible = group.userData.alwaysLabelled || id === hoveredId;
    }
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
        if (node.isSprite) {
          const height = size * (node.userData.share ?? 1);
          node.scale.set(height * node.userData.widthPerHeight, height, 1);
        }
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
      origin.y = start.userData.top + ARROW_LIFT_CM;
      const target = end.position.clone();
      target.y = end.userData.top;
      arrowGroup.add(arrow(origin, target));
    }
  }

  function rebuild() {
    const simulation = session.getSimulation();
    const room = session.getRoom();
    const boxIds = new Set(room.landmarks.filter(({ temporary }) => temporary).map(({ id }) => id));
    const firstBuild = model === null;
    model = buildSceneModel({ ledger, room, landmarks: simulation.landmarks, body: simulation.body, boxIds, hazards: simulation.hazards });
    updatePose = createPoseTracker(settings.display_seconds);
    trailPoints = -1;

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

    roomGroup.add(buildSkirting(model));
    model.objects.forEach(addObject);
    showLabels();
    // Dangerous things lie flat on their furniture; they are drawn but not picked or dragged.
    for (const hazard of model.hazards) {
      const mesh = new THREE.Mesh(
        new RoundedBoxGeometry(hazard.w, HAZARD_THICK_CM, hazard.d, CORNER_SEGMENTS, Math.min(hazard.w, hazard.d, HAZARD_THICK_CM) * CORNER_SHARE),
        new THREE.MeshStandardMaterial({ color: HAZARD_COLOUR, roughness: 0.6 }),
      );
      mesh.position.set(hazard.x + hazard.w / 2, hazard.bottom + HAZARD_THICK_CM / 2, hazard.z + hazard.d / 2);
      mesh.castShadow = true;
      // A red tag hanging below the thing, so it does not cover the furniture's own label above.
      const label = labelSprite(hazard.label, { fill: 'rgba(181,83,74,0.95)', ink: '#ffffff', share: HAZARD_LABEL_SHARE });
      label.center.set(0.5, 1.15);
      mesh.add(label);
      roomGroup.add(mesh);
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
    for (const [id, group] of objectMeshes) {
      const { materials, edge } = group.userData;
      for (const material of materials) {
        if (danger.ids.has(id)) {
          material.emissive.setHex(edgeColour).multiplyScalar(DANGER_GLOW * pulse);
        } else if (focus.has(id)) {
          material.emissive.setHex(ACCENT).multiplyScalar(FOCUS_GLOW * pulse);
        } else {
          material.emissive.setHex(0x000000);
        }
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
    top.y = mesh.userData.top + CHIP_LIFT_CM;
    top.x += mesh.userData.w / 2;
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
    // The figure moves at the playback speed, like the simulation clock.
    const seconds = lastFrame === null ? 0 : ((now - lastFrame) / MS_PER_SECOND) * session.getSpeed();
    lastFrame = now;
    const pose = updatePose({
      x: simulation.position.x,
      z: simulation.position.y,
      feet: footHeight(simulation),
      events: simulation.events,
      climbing: Boolean(simulation.climbing),
    }, seconds);
    applyPose(child, pose);
    const onFloor = floorShadow(pose.feet);
    blob.position.set(pose.x, 0.5, pose.z);
    blob.scale.setScalar(onFloor.scale);
    blob.material.opacity = SHADOW_OPACITY * onFloor.opacity;
    const reached = reachMark(simulation, pose.feet);
    mark.visible = session.isPlaying();
    mark.position.set(pose.x, reached.height, pose.z);
    mark.material.color.setHex(reached.reachesLock ? DANGER : ACCENT);
    drawTrail(simulation, pose);

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
    const [hit] = raycaster.intersectObjects([...objectMeshes.values()], true);
    let node = hit?.object;
    while (node && node.userData.id === undefined) node = node.parent;
    return node ? node.userData.id : null;
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

  function hover(id) {
    if (id === hoveredId) return;
    hoveredId = id;
    showLabels();
  }
  renderer.domElement.addEventListener('pointerleave', () => hover(null));

  renderer.domElement.addEventListener('pointermove', (event) => {
    if (!press) hover(pickObject(event));
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
