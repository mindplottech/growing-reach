import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { applyProportions, BASE_UNIT_HEIGHT, makeChild } from './childFigure3d.js';
import { gaitFor } from './gait.js';
import { createPoseTracker, floorShadow, footHeight } from './childPose.js';
import { buildFurniture, buildSkirting } from './furniture3d.js';
import { buildSceneModel, cameraPlacement, highlightedIds } from './sceneModel.js';

// Display only: colours, sizes on screen, the camera and the figure. No body value or
// layout dimension is written here.
const WALL_COLOUR = 0xfffcf2;
const BACKGROUND = 0xf6f5f1;
const ACCENT = 0x2f5d8a;
const EDGE_OPACITY = 0.95;
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
const SHADOW_RADIUS_CM = 22;
const SHADOW_OPACITY = 0.3;
const STRETCH_SHARE = 0.06;
const ARM_RAISE = Math.PI * 0.95;
const MS_PER_SECOND = 1000;
const FIELD_OF_VIEW = 40;
const PLANK_COUNT = 9;
const CHIP_LIFT_CM = 10;
const HAZARD_COLOUR = 0xb5534a;
const HAZARD_THICK_CM = 3;
const HAZARD_LABEL_SHARE = 0.8;
const SIT_DROP = 0.14;
// Walking, for the look only: a small bob per step, the arms swing a share of the legs, and the
// youngest hold the arms up and out (high guard).
const WALK_BOB = 0.8;
const ARM_SWING_SHARE = 0.6;
const ARM_GUARD_RAISE = Math.PI * 0.45;
const ARM_GUARD_SPREAD = 0.5;
// 「子どもに近づく」: the camera keeps this distance from the child (in child heights), looks
// slightly down, and eases towards the child each frame.
const FOLLOW_DISTANCE_HEIGHTS = 3.2;
const FOLLOW_PITCH = 0.55;
const FOLLOW_EASE = 0.08;
const noRaycast = () => {};
// The tags of the lock and the dangerous things take the colour of their row in the results.
const TAG_STYLES = {
  danger: { fill: 'rgba(211,47,47,0.95)', ink: '#ffffff', mesh: 0xd32f2f },
  caution: { fill: 'rgba(240,173,0,0.95)', ink: '#1f2933', mesh: 0xe0a000 },
  plain: { fill: 'rgba(120,128,136,0.92)', ink: '#ffffff', mesh: 0x8a9299 },
};
// A tag whose colour changed grows for about a second (KO's choice); one the child just reached
// grows more and blinks for a moment.
const TAG_POP_MS = 1000;
const TAG_POP_GROWTH = 0.6;
const TAG_PULSE_GROWTH = 0.8;
const TAG_PULSE_BLINK_MS = 160;
const TRAIL_OPACITY = 0.35;
const TRAIL_LIFT_CM = 0.6;

function labelTexture(text, { fill = 'rgba(255,255,255,0.95)', ink = '#1f2933' } = {}) {
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
  return { texture, widthPerHeight: canvas.width / canvas.height };
}

function labelSprite(text, { fill, ink, share = 1 } = {}) {
  const { texture, widthPerHeight } = labelTexture(text, { fill, ink });
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, sizeAttenuation: false });
  const sprite = new THREE.Sprite(material);
  sprite.userData.widthPerHeight = widthPerHeight;
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

function applyPose(figure, pose, gait) {
  const { root, body, arms, legs } = figure;
  const { phase, moving } = pose.walk ?? { phase: 0, moving: 0 };
  const swing = Math.sin(phase) * moving;
  root.position.set(pose.x, pose.feet + WALK_BOB * Math.abs(Math.sin(phase)) * moving, pose.z);
  root.rotation.y = pose.yaw + (pose.turned ? Math.PI : 0);
  body.rotation.x = pose.lean + pose.pitch;
  // The toddler's sway: the body rolls from side to side with each step.
  body.rotation.z = gait ? gait.sway * Math.cos(phase) * moving : 0;
  body.position.y = -SIT_DROP * (pose.sit ?? 0);
  body.scale.y = 1 + pose.stretch * STRETCH_SHARE;
  // Legs swing in opposition; feet stand apart by the ledger's stride width.
  const legSwing = gait ? gait.legSwing : 0;
  const stance = gait ? (gait.strideWidthCm / 2) / (gait.heightCm || 1) : 0;
  legs.forEach((hip, i) => {
    hip.rotation.x = (i === 0 ? 1 : -1) * swing * legSwing;
    if (gait) hip.position.x = (i === 0 ? -1 : 1) * Math.max(0.055, stance);
  });
  // Arms: a gesture wins; otherwise the youngest hold them up as a guard, and the others swing
  // them opposite to the legs.
  arms.forEach((arm, i) => {
    const guard = gait ? gait.armGuard : 0;
    const armSwing = (i === 0 ? -1 : 1) * swing * legSwing * ARM_SWING_SHARE * (1 - guard);
    const raise = Math.max(pose.arms * ARM_RAISE, guard * ARM_GUARD_RAISE * (0.6 + 0.4 * moving));
    arm.rotation.x = -raise + armSwing;
    arm.rotation.z = (i === 0 ? 1 : -1) * guard * ARM_GUARD_SPREAD;
  });
}

function disposeGroup(group) {
  group.traverse((node) => {
    node.geometry?.dispose();
    node.material?.map?.dispose();
    node.material?.dispose();
  });
  group.clear();
}

/**
 * Draws the room and handles pointing at it. Every change to the room goes out through
 * `editing`; this module never decides whether a change is allowed.
 */
export function mountView3d({ container, chip, ledger, settings, session, slider, editing, trailToggle, followButton = null }) {
  // id → { level, text } from the last calculation; id → the tag sprite and its thing.
  let tagLevels = new Map();
  let tags = new Map();
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
  // The walked trail: one line per leg, redrawn when the simulation adds points.
  const trailGroup = new THREE.Group();
  scene.add(trailGroup);
  const trailMaterial = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: TRAIL_OPACITY });
  let trailPoints = -1;

  function drawTrail(simulation, pose) {
    trailGroup.visible = trailToggle.checked;
    if (!trailGroup.visible) return;
    // Only the part walked since the scene began.
    const from = session.getScene()?.start ?? 0;
    // Each leg keeps the last point before the scene began, so the line starts where the child was.
    const legs = simulation.trail.map((leg) => leg.filter((point, i) => point.time >= from || (leg[i + 1]?.time ?? Infinity) >= from));
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
  let gait = null;
  let updatePose = createPoseTracker(settings.display_seconds, gait);

  const raycaster = new THREE.Raycaster();
  let lastFrame = null;
  let model = null;
  let floor = null;
  let backWall = null;
  let objectMeshes = new Map();
  let planes = [];
  let sliderHeld = false;
  let planesUntil = 0;
  let selectedId = null;
  let hoveredId = null;
  let tool = { type: 'select' };

  function fitCamera() {
    const { position, target } = cameraPlacement(model, camera.aspect, FIELD_OF_VIEW);
    controls.target.set(target.x, target.y, target.z);
    camera.position.set(position.x, position.y, position.z);
    controls.update();
  }

  // Following: the camera glides to a close view of the child and keeps it while on; turning
  // the camera by hand keeps the distance but takes the new direction. Off goes back to the room.
  let following = false;
  function followChild(pose) {
    if (!following || !model) return;
    const target = new THREE.Vector3(pose.x, pose.feet + model.childHeight / 2, pose.z);
    const offset = camera.position.clone().sub(controls.target);
    offset.y = 0;
    if (offset.lengthSq() < 1) offset.set(0, 0, 1);
    const distance = model.childHeight * FOLLOW_DISTANCE_HEIGHTS;
    offset.setLength(distance * Math.cos(FOLLOW_PITCH));
    const wanted = target.clone().add(offset).add(new THREE.Vector3(0, distance * Math.sin(FOLLOW_PITCH), 0));
    controls.target.lerp(target, FOLLOW_EASE);
    camera.position.lerp(wanted, FOLLOW_EASE);
  }
  function setFollowing(next) {
    following = next;
    followButton?.setAttribute('aria-pressed', String(next));
    if (!next) {
      cameraTouched = false;
      if (model) fitCamera();
    }
  }
  followButton?.addEventListener('click', () => setFollowing(!following));

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
    if (object.kind === 'window_lock') tags.set(object.id, { sprite: label, text: object.label, meshes: [] });
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

  /** Redraws one tag in its row's colour, with the same words as its row. */
  function paintTag(id) {
    const tag = tags.get(id);
    if (!tag) return;
    const known = tagLevels.get(id);
    const style = TAG_STYLES[known?.level ?? 'plain'];
    const text = known ? `${tag.text}　${known.text}` : tag.text;
    const { texture, widthPerHeight } = labelTexture(text, style);
    tag.sprite.material.map?.dispose();
    tag.sprite.material.map = texture;
    tag.sprite.material.needsUpdate = true;
    tag.sprite.userData.widthPerHeight = widthPerHeight;
    for (const mesh of tag.meshes) mesh.material.color.setHex(style.mesh);
  }

  /** Grows each tag while it pops or pulses, on top of the size fitLabels gives it. */
  function animateTags(now) {
    for (const { sprite } of tags.values()) {
      const base = sprite.userData.base;
      if (!base) continue;
      let growth = 0;
      const pop = (sprite.userData.popUntil ?? 0) - now;
      if (pop > 0) growth = Math.max(growth, TAG_POP_GROWTH * Math.sin((Math.PI * pop) / TAG_POP_MS));
      const pulse = (sprite.userData.pulseUntil ?? 0) - now;
      if (pulse > 0) growth = Math.max(growth, TAG_PULSE_GROWTH);
      sprite.scale.set(base[0] * (1 + growth), base[1] * (1 + growth), 1);
      sprite.material.opacity = pulse > 0 && Math.floor(pulse / TAG_PULSE_BLINK_MS) % 2 === 1 ? 0.55 : 1;
    }
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
          node.userData.base = [height * node.userData.widthPerHeight, height];
        }
      });
    }
  }

  function rebuild() {
    const simulation = session.getSimulation();
    const room = session.getRunRoom();
    const boxIds = new Set(room.landmarks.filter(({ temporary }) => temporary).map(({ id }) => id));
    const firstBuild = model === null;
    model = buildSceneModel({ ledger, room, landmarks: simulation.landmarks, body: simulation.body, boxIds, hazards: simulation.hazards });
    gait = { ...gaitFor(ledger, settings, simulation.months), heightCm: simulation.body.height.value };
    updatePose = createPoseTracker(settings.display_seconds, gait);
    trailPoints = -1;

    disposeGroup(roomGroup);
    disposeGroup(planeGroup);
    objectMeshes = new Map();
    tags = new Map();

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
    const onSame = new Map();
    for (const hazard of model.hazards) {
      // Tags of things on the same furniture take turns hanging below and standing above.
      const turn = onSame.get(hazard.on) ?? 0;
      onSame.set(hazard.on, turn + 1);
      const mesh = new THREE.Mesh(
        new RoundedBoxGeometry(hazard.w, HAZARD_THICK_CM, hazard.d, CORNER_SEGMENTS, Math.min(hazard.w, hazard.d, HAZARD_THICK_CM) * CORNER_SHARE),
        new THREE.MeshStandardMaterial({ color: HAZARD_COLOUR, roughness: 0.6 }),
      );
      mesh.position.set(hazard.x + hazard.w / 2, hazard.bottom + HAZARD_THICK_CM / 2, hazard.z + hazard.d / 2);
      mesh.castShadow = true;
      // A tag hanging below the thing, so it does not cover the furniture's own label above.
      const label = labelSprite(hazard.label, { share: HAZARD_LABEL_SHARE });
      label.center.set(0.5, turn % 2 === 0 ? 1.15 : -0.3);
      mesh.add(label);
      roomGroup.add(mesh);
      tags.set(hazard.id, { sprite: label, text: hazard.label, meshes: [mesh] });
    }
    for (const id of tags.keys()) paintTag(id);
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

    const { unitHeight } = applyProportions(child, gait);
    child.root.scale.setScalar(model.childHeight * (BASE_UNIT_HEIGHT / unitHeight));
    if (selectedId && !objectMeshes.has(selectedId)) selectedId = null;
    aimSun();
    fitLabels();
    if (firstBuild) fitCamera();
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

  /** Only the furniture being edited gets a frame; nothing else on the furniture is marked. */
  function paintObjects() {
    const selected = selectedId ? groupOf(selectedId) : new Set();
    for (const [id, group] of objectMeshes) group.userData.edge.visible = selected.has(id);
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
    applyPose(child, pose, gait);
    followChild(pose);
    const onFloor = floorShadow(pose.feet);
    blob.position.set(pose.x, 0.5, pose.z);
    blob.scale.setScalar(onFloor.scale);
    blob.material.opacity = SHADOW_OPACITY * onFloor.opacity;
    drawTrail(simulation, pose);

    const strength = planeStrength(now);
    for (const { mesh, tag, height } of planes) {
      mesh.visible = strength > 0;
      mesh.material.opacity = PLANE_OPACITY * strength;
      tag.material.opacity = strength;
      mesh.position.y += (height - mesh.position.y) * PLANE_EASE;
    }
    paintObjects();
    animateTags(now);
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
    /** The colours from a new calculation; a tag whose colour changed pops for a moment. */
    setTags(next) {
      const now = performance.now();
      const before = tagLevels;
      tagLevels = new Map(next);
      for (const id of tags.keys()) {
        paintTag(id);
        if (before.size > 0 && before.get(id)?.level !== tagLevels.get(id)?.level) tags.get(id).sprite.userData.popUntil = now + TAG_POP_MS;
      }
      fitLabels();
    },
    /** The child just reached this thing: its tag grows and blinks for `seconds`. */
    pulse(id, seconds) {
      const tag = tags.get(id);
      if (tag) tag.sprite.userData.pulseUntil = performance.now() + seconds * MS_PER_SECOND;
    },
    select,
  };
}
