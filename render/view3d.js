import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { applyOutfit, applyProportions, makeChild } from './childFigure3d.js';
import { easeLook, lookAngles } from './look.js';
import { applyCrawl, easeCrawl, liftHead } from './crawl.js';
import { gaitFor } from './gait.js';
import { createIdle } from './idle.js';
import { EVENT } from '../sim/events.js';
import { createPoseTracker, floorShadow, footHeight } from './childPose.js';
import { buildFurniture, buildSkirting } from './furniture3d.js';
import { buildGoalThing, hangsOnWall } from './goalShapes3d.js';
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
// Raised arms open a little outward (a banzai), so the hands rise beside the big head, not over the face.
const ARM_REACH_SPREAD = 0.4;
const MS_PER_SECOND = 1000;
const FIELD_OF_VIEW = 40;
const PLANK_COUNT = 9;
const CHIP_LIFT_CM = 10;
const HAZARD_COLOUR = 0xb5534a;
const HAZARD_THICK_CM = 3;
const GOAL_WALL_THICK_CM = 2;
const GOAL_LABEL_SHARE = 0.62;
const PARTITION_HEIGHT_CM = 100;
// The help scene (「助けを置いて見せる」): the stool's look and the close camera on the spot.
const STOOL_COLOUR = 0xe0b86a;
const STOOL_EDGE = 0x9a7a3a;
const STOOL_CORNER_CM = 2;
const HELP_DISTANCE_HEIGHTS = 2.6;
// The close views frame a child of this height (display only), whatever the age, so the child is
// seen to grow as the slider moves: the camera does not move back as the child gets taller.
const CLOSE_VIEW_HEIGHT_CM = 95;
// A chosen room is seen from high above (display only): the pitch, the room's share of the frame
// (more than 1 leaves a margin) and the height the camera aims at.
const AREA_PITCH = (65 * Math.PI) / 180;
const AREA_FRAME_MARGIN = 1.25;
const AREA_TARGET_HEIGHT_CM = 30;
const AREA_MIN_SPAN_CM = 260;
const HELP_PITCH = 0.42;
const HELP_SIDE_ANGLE = 0.6;
const HELP_LOOK_SHARE = 0.55;
const HELP_FORWARD_LEAN = 0.18;
const HELP_FORWARD_ARMS = 0.5;
// The camera stays this far inside the outer walls, so a thing in a corner is seen from the room.
const HELP_CAMERA_MARGIN_CM = 30;
// Floor tones by room (display only): tiles in the wet rooms, earth at the entrance.
const ROOM_FLOORS = { washroom: 0xe3e7ea, toilet: 0xdfe8ee, entrance: 0xd6d0c6, kitchen: 0xece4d6 };
const ROOM_FLOOR_OPACITY = 0.85;
const ROOM_FLOOR_LIFT_CM = 0.4;
const PARTITION_OPACITY = 0.9;
const ROOM_LABEL_SHARE = 0.7;
const ROOM_LABEL_LIFT_CM = 2;
const ROOM_LABEL_OPACITY = 0.75;
const GOAL_WALL_SIZE_CM = 8;
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
// The idle animation (display only): how long after any motion the child counts as still, and
// how far each movement goes on the figure.
const STILL_AFTER_SECONDS = 1.0;
const BLINK_SQUEEZE = 0.12;
const YAWN_HEAD_BACK = 0.28;
const YAWN_ARMS = Math.PI * 0.9;
const YAWN_MOUTH_FROM = 0.45;
const HAZARD_EVENTS = new Set([EVENT.TOUCHED_HAZARD, EVENT.REACHED_LOCK, EVENT.TOUCHED_HIGH]);
const noRaycast = () => {};
// The tags of the lock and the dangerous things take the colour of their row in the results.
const TAG_STYLES = {
  danger: { fill: 'rgba(211,47,47,0.95)', ink: '#ffffff', mesh: 0xd32f2f },
  caution: { fill: 'rgba(240,173,0,0.95)', ink: '#1f2933', mesh: 0xe0a000 },
  plain: { fill: 'rgba(120,128,136,0.92)', ink: '#ffffff', mesh: 0x8a9299 },
  ok: { fill: 'rgba(46,139,87,0.95)', ink: '#ffffff', mesh: 0x2e8b57 },
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

/** The idle movements on the figure: eyes, belly, head and arms. `idle` is from render/idle.js. */
function applyIdle(figure, idle, pose, gait) {
  const { eyes, belly, head, mouth, openMouth, arms } = figure;
  const closed = Math.max(idle.blink, idle.yawn > YAWN_MOUTH_FROM ? 1 : 0);
  for (const eye of eyes) eye.scale.y = 1 - (1 - BLINK_SQUEEZE) * closed;
  const bellyShare = gait ? gait.bellyShare : 1;
  belly.scale.y = BELLY_BASE_Y * bellyShare * (1 + idle.breath);
  belly.scale.x = bellyShare * (1 + idle.breath * 0.5);
  head.rotation.z = idle.tilt;
  head.rotation.x = -YAWN_HEAD_BACK * idle.yawn;
  const open = idle.yawn > YAWN_MOUTH_FROM;
  mouth.visible = !open;
  openMouth.visible = open;
  if (open) openMouth.scale.set(0.015 * (0.6 + idle.yawn), 0.02 * idle.yawn, 0.012);
  // The yawn's stretch wins over a walking swing, but never over a reach or climb.
  if (idle.yawn > 0 && !pose.busy) {
    for (const arm of arms) arm.rotation.x = Math.min(arm.rotation.x, -YAWN_ARMS * idle.yawn);
  }
}
const BELLY_BASE_Y = 0.9;

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
    // Both open outward: the guard of the youngest (arms up and out) and the banzai of a reach.
    arm.rotation.z = (i === 0 ? -1 : 1) * (guard * ARM_GUARD_SPREAD + pose.arms * ARM_REACH_SPREAD);
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
    if (help) help.cameraFree = true;
  });
  renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());

  const roomGroup = new THREE.Group();
  const planeGroup = new THREE.Group();
  scene.add(roomGroup, planeGroup);
  const child = makeChild();
  // Turn (y) first, then nod (x) about the turned head, then the idle tilt (z).
  child.head.rotation.order = 'YXZ';
  let look = { yaw: 0, pitch: 0 };
  // How far into crawling the figure is (0 standing … 1 on hands and knees), eased over real time.
  let crawlBlend = 0;
  const toViewer = new THREE.Vector3();
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
  // The dangerous things and the lock's tag show only while the hundred runs are being looked at.
  let hazardsShown = false;
  const hazardNodes = [];
  const roomLabels = [];
  // The goals' tags show for the room chosen in the panel ('all' for every room).
  let goalRoom = 'all';
  const goalNodes = [];
  // The help scene being shown, if any: the figure stands where the scene says instead of
  // following the run, a stool may be drawn, and the thing may be moved. Display only.
  let help = null;
  const goalMeshes = new Map();
  const helpGroup = new THREE.Group();
  scene.add(helpGroup);
  let gait = null;
  let updatePose = createPoseTracker(settings.display_seconds, gait);
  let updateIdle = createIdle(settings.idle_figure);
  // The idle animation runs on its own clock, so it goes on while the run is paused or over.
  let idleClock = 0;
  let busyUntil = -Infinity;

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

  // The room chosen in the panel (an area of the house), or null for the whole house.
  let focusedArea = null;
  function fitCamera() {
    const { position, target } = focusedArea ? areaPlacement(focusedArea) : cameraPlacement(model, camera.aspect, FIELD_OF_VIEW);
    controls.target.set(target.x, target.y, target.z);
    camera.position.set(position.x, position.y, position.z);
    controls.update();
  }

  /**
   * The camera framing one area from high above (about 65°), so the partition walls of the rooms
   * in front do not hide it; turned the same way round as the view of the whole house.
   */
  function areaPlacement(area) {
    const whole = cameraPlacement(model, camera.aspect, FIELD_OF_VIEW);
    const across = new THREE.Vector3(whole.position.x - whole.target.x, 0, whole.position.z - whole.target.z).normalize();
    const target = new THREE.Vector3(area.x + area.w / 2, AREA_TARGET_HEIGHT_CM, area.y + area.d / 2);
    const tanHalf = Math.tan((FIELD_OF_VIEW * Math.PI) / 180 / 2);
    // A small room (the entrance) is not blown up: at least AREA_MIN_SPAN_CM is in the frame.
    const fit = Math.max(area.w / camera.aspect, area.d, AREA_MIN_SPAN_CM) / 2 / tanHalf;
    const distance = fit * AREA_FRAME_MARGIN;
    const position = target.clone()
      .add(across.multiplyScalar(distance * Math.cos(AREA_PITCH)))
      .add(new THREE.Vector3(0, distance * Math.sin(AREA_PITCH), 0));
    return { position, target };
  }

  // Following: the camera glides to a close view of the child and keeps it while on; turning
  // the camera by hand keeps the distance but takes the new direction. Off goes back to the room.
  let following = false;
  function followChild(pose) {
    if (!following || !model) return;
    const target = new THREE.Vector3(pose.x, pose.feet + CLOSE_VIEW_HEIGHT_CM / 2, pose.z);
    const offset = camera.position.clone().sub(controls.target);
    offset.y = 0;
    if (offset.lengthSq() < 1) offset.set(0, 0, 1);
    const distance = CLOSE_VIEW_HEIGHT_CM * FOLLOW_DISTANCE_HEIGHTS;
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
    if (object.kind === 'window_lock') {
      tags.set(object.id, { sprite: label, text: object.label, meshes: [] });
      label.visible = hazardsShown;
      hazardNodes.push(label);
    }
    Object.assign(group.userData, {
      id: object.id, top: object.top, w: object.w, edge, label, materials, alwaysLabelled: object.kind === 'window_lock', isLock: object.kind === 'window_lock',
    });
    roomGroup.add(group);
    objectMeshes.set(object.id, group);
  }

  function showLabels() {
    for (const [id, group] of objectMeshes) {
      const always = group.userData.alwaysLabelled && (!group.userData.isLock || hazardsShown);
      group.userData.label.visible = always || id === hoveredId;
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
  // The goals not of this age (KO's 「年ごろ」) have no tag: their things are hidden. Run after
  // new tags come and after the room is built again, whichever comes last.
  function showGoalsOfAge() {
    if (tagLevels.size === 0) return;
    for (const [id, tag] of tags) {
      if (tag.nameOnly) for (const mesh of tag.meshes) mesh.visible = tagLevels.has(id);
    }
  }

  function paintTag(id) {
    const tag = tags.get(id);
    if (!tag) return;
    const known = tagLevels.get(id);
    const style = TAG_STYLES[known?.level ?? 'plain'];
    const text = known && !tag.nameOnly ? `${tag.text}　${known.text}` : tag.text;
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
    gait = { ...gaitFor(ledger, settings, simulation.months), heightCm: simulation.body.height.value, crawling: Boolean(simulation.body.crawling) };
    updatePose = createPoseTracker(settings.display_seconds, gait);
    updateIdle = createIdle(settings.idle_figure);
    busyUntil = -Infinity;
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
    // Partitions between the rooms: waist high so the whole house stays in view.
    for (const wall of model.walls) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(wall.w, PARTITION_HEIGHT_CM, wall.d),
        new THREE.MeshStandardMaterial({ color: WALL_COLOUR, roughness: 1, transparent: true, opacity: PARTITION_OPACITY }),
      );
      mesh.position.set(wall.x + wall.w / 2, PARTITION_HEIGHT_CM / 2, wall.z + wall.d / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.raycast = noRaycast;
      roomGroup.add(mesh);
    }
    // Each room's floor in its own tone, so the rooms read without their names.
    for (const area of model.rooms) {
      const tone = ROOM_FLOORS[area.id];
      if (!tone) continue;
      const sheet = new THREE.Mesh(
        new THREE.PlaneGeometry(area.w, area.d),
        new THREE.MeshStandardMaterial({ color: tone, roughness: 0.95, transparent: true, opacity: ROOM_FLOOR_OPACITY }),
      );
      sheet.rotation.x = -Math.PI / 2;
      sheet.position.set(area.x + area.w / 2, ROOM_FLOOR_LIFT_CM, area.z + area.d / 2);
      sheet.receiveShadow = true;
      sheet.raycast = noRaycast;
      roomGroup.add(sheet);
    }
    // The name of each room, over the middle of its floor (at the near edge it sat over the next
    // room's things, seen from the camera).
    for (const area of model.rooms) {
      const label = labelSprite(area.label, { share: ROOM_LABEL_SHARE });
      label.position.set(area.x + area.w / 2, ROOM_LABEL_LIFT_CM, area.z + area.d / 2);
      label.raycast = noRaycast;
      label.material.opacity = ROOM_LABEL_OPACITY;
      roomGroup.add(label);
      roomLabels.push(label);
    }
    hazardNodes.length = 0;
    roomLabels.length = 0;
    goalNodes.length = 0;
    goalMeshes.clear();
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
      mesh.visible = hazardsShown;
      hazardNodes.push(mesh);
      tags.set(hazard.id, { sprite: label, text: hazard.label, meshes: [mesh] });
    }
    // The goals: a small plate on the wall at the thing's height, or a small thing on furniture.
    for (const goal of model.goals) {
      const thick = goal.onWall ? GOAL_WALL_THICK_CM : HAZARD_THICK_CM;
      const mesh = new THREE.Mesh(
        new RoundedBoxGeometry(goal.w, goal.onWall ? GOAL_WALL_SIZE_CM : thick, goal.d, CORNER_SEGMENTS, Math.min(goal.w, goal.d, thick) * CORNER_SHARE),
        new THREE.MeshStandardMaterial({ color: TAG_STYLES.plain.mesh, roughness: 0.6 }),
      );
      const y = goal.onWall ? goal.height : goal.height + thick / 2;
      mesh.position.set(goal.x + goal.w / 2, y, goal.z + goal.d / 2);
      mesh.castShadow = true;
      // The thing itself, drawn so it is known without words; the plate under or behind it keeps the colour.
      const thing = buildGoalThing(goal.key, goal.facing);
      if (thing) {
        if (goal.onWall && hangsOnWall(goal.key)) {
          thing.position.set(goal.facing.x * (goal.d / 2 + 1), 0, goal.facing.z * (goal.d / 2 + 1));
        } else {
          thing.position.y = goal.onWall ? GOAL_WALL_SIZE_CM / 2 : thick / 2;
        }
        mesh.add(thing);
      }
      const label = labelSprite(goal.label, { share: GOAL_LABEL_SHARE });
      label.center.set(0.5, -0.3);
      label.visible = goalRoom === 'all' || goalRoom === goal.room;
      mesh.add(label);
      roomGroup.add(mesh);
      tags.set(goal.id, { sprite: label, text: goal.label, meshes: [mesh], nameOnly: true, room: goal.room });
      goalNodes.push({ room: goal.room, nodes: [label] });
      goalMeshes.set(goal.id, { mesh, home: mesh.position.clone(), onWall: goal.onWall, thick });
    }
    for (const id of tags.keys()) paintTag(id);
    showGoalsOfAge();
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
    // つかまり立ちのころ: a diaper and bare skin; from walking on, the T-shirt and shorts.
    applyOutfit(child, Boolean(gait.crawling));
    // The top of the head stands at the ledger's height.
    child.root.scale.setScalar(model.childHeight / unitHeight);
    if (selectedId && !objectMeshes.has(selectedId)) selectedId = null;
    aimSun();
    fitLabels();
    if (firstBuild) fitCamera();
    if (help) placeHelp();
  }

  /** Draws the help scene's stool and moves the thing, for the scene and side being shown. */
  function placeHelp() {
    disposeGroup(helpGroup);
    const { scene: shown, withHelp } = help;
    const entry = goalMeshes.get(`goal-${shown.goalId}`);
    if (entry) {
      const thing = withHelp ? shown.thingAfter : shown.thing;
      const y = entry.onWall ? thing.height : thing.height + entry.thick / 2;
      entry.mesh.position.set(thing.x + thing.w / 2, y, thing.y + thing.d / 2);
    }
    const prop = shown.prop;
    if (withHelp && prop?.kind === 'step') {
      const stool = new THREE.Mesh(
        new RoundedBoxGeometry(prop.w, prop.heightCm, prop.d, CORNER_SEGMENTS, STOOL_CORNER_CM),
        new THREE.MeshStandardMaterial({ color: STOOL_COLOUR, roughness: 0.7 }),
      );
      stool.position.set(prop.x + prop.w / 2, prop.heightCm / 2, prop.y + prop.d / 2);
      stool.castShadow = true;
      stool.receiveShadow = true;
      stool.raycast = noRaycast;
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(stool.geometry),
        new THREE.LineBasicMaterial({ color: STOOL_EDGE, transparent: true, opacity: 0.6 }),
      );
      edge.raycast = noRaycast;
      stool.add(edge);
      helpGroup.add(stool);
    }
  }

  /** Puts every moved thing back and takes the stool away. */
  function unplaceHelp() {
    disposeGroup(helpGroup);
    for (const { mesh, home } of goalMeshes.values()) mesh.position.copy(home);
  }

  /** The figure as the help scene has it: standing (or on the stool), facing the thing, reaching. */
  function helpPose() {
    const figure = help.withHelp ? help.scene.withHelp : help.scene.without;
    return {
      x: figure.x, z: figure.y, feet: figure.feet, yaw: figure.yaw, kind: null, turned: false, pitch: 0, sit: 0,
      lean: figure.forward ? HELP_FORWARD_LEAN : 0,
      arms: figure.forward ? HELP_FORWARD_ARMS : figure.arms,
      stretch: figure.stretch,
      walk: { phase: 0, moving: 0 },
      busy: false,
    };
  }

  /** Glides the camera to a close three-quarter view of the child at the thing, until turned by hand. */
  function lookAtHelp() {
    if (!help || help.cameraFree || !model) return;
    const { stand, thing, facing } = help.scene;
    const centre = { x: thing.x + thing.w / 2, y: thing.y + thing.d / 2 };
    const target = new THREE.Vector3(
      stand.x + (centre.x - stand.x) * HELP_LOOK_SHARE, CLOSE_VIEW_HEIGHT_CM * 0.6, stand.y + (centre.y - stand.y) * HELP_LOOK_SHARE,
    );
    // Behind the child's shoulder: back along the facing, swung to one side. The side that would
    // put the camera outside the room (behind a wall) is not used; what is left is kept inside.
    const distance = CLOSE_VIEW_HEIGHT_CM * HELP_DISTANCE_HEIGHTS;
    const up = new THREE.Vector3(0, 1, 0);
    const inside = (p) => p.x >= HELP_CAMERA_MARGIN_CM && p.x <= model.width - HELP_CAMERA_MARGIN_CM
      && p.z >= HELP_CAMERA_MARGIN_CM && p.z <= model.depth - HELP_CAMERA_MARGIN_CM;
    const candidate = (angle) => target.clone()
      .add(new THREE.Vector3(facing.x, 0, facing.y).applyAxisAngle(up, angle).multiplyScalar(distance * Math.cos(HELP_PITCH)))
      .add(new THREE.Vector3(0, distance * Math.sin(HELP_PITCH), 0));
    const options = [candidate(HELP_SIDE_ANGLE), candidate(-HELP_SIDE_ANGLE), candidate(0)];
    const wanted = options.find(inside) ?? options[2];
    wanted.x = Math.min(Math.max(wanted.x, HELP_CAMERA_MARGIN_CM), model.width - HELP_CAMERA_MARGIN_CM);
    wanted.z = Math.min(Math.max(wanted.z, HELP_CAMERA_MARGIN_CM), model.depth - HELP_CAMERA_MARGIN_CM);
    controls.target.lerp(target, FOLLOW_EASE);
    camera.position.lerp(wanted, FOLLOW_EASE);
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

  // A failure inside one frame is shown on the page instead of silently stopping the 3D view.
  function render(now) {
    try {
      renderFrame(now);
    } catch (error) {
      const box = document.querySelector('#error');
      if (box) {
        box.hidden = false;
        const where = String(error.stack ?? '').split('\n').slice(0, 4).join(' / ');
        box.textContent = `3D表示でエラーが起きました（${error.message}）。ページを再読み込み（Ctrl+F5）してください。 ${where}`;
      }
      throw error;
    }
  }

  function renderFrame(now) {
    const simulation = session.getSimulation();
    // The figure moves at the playback speed, like the simulation clock.
    const realSeconds = lastFrame === null ? 0 : (now - lastFrame) / MS_PER_SECOND;
    const seconds = realSeconds * session.getSpeed();
    lastFrame = now;
    const pose = updatePose({
      x: simulation.position.x,
      z: simulation.position.y,
      feet: footHeight(simulation),
      events: simulation.events,
      climbing: Boolean(simulation.climbing),
    }, seconds);
    const shownPose = help ? helpPose() : pose;
    applyPose(child, shownPose, gait);
    // KO's つかまり立ちのころ: crawl while moving, stand up at the furniture when stopped.
    crawlBlend = easeCrawl(crawlBlend, { crawlingAge: gait?.crawling, moving: shownPose.walk?.moving ?? 0, helped: Boolean(help) }, realSeconds);
    applyCrawl(child, crawlBlend, shownPose.walk?.phase ?? 0);
    // Still means: nothing going on now, and nothing for a moment before. The moments of
    // touching something dangerous come from the record so far and the scene's known moment.
    // Blinks, breaths and yawns take real time, whatever the playback speed.
    idleClock += realSeconds;
    if (pose.busy) busyUntil = idleClock + STILL_AFTER_SECONDS;
    // The two seconds around a dangerous moment only matter while the record is playing; paused
    // or finished, the child just stands there and may yawn.
    const live = session.isPlaying() && !(session.isFinished?.() ?? false);
    const playingScene = session.getScene();
    const hazardMoments = live ? simulation.events.filter(({ kind }) => HAZARD_EVENTS.has(kind)).map(({ time }) => time) : [];
    if (live && playingScene?.moment !== null && playingScene?.moment !== undefined) hazardMoments.push(playingScene.moment);
    const idle = updateIdle({ still: !pose.busy && idleClock >= busyUntil, time: simulation.time, hazardMoments }, realSeconds);
    applyIdle(child, idle, shownPose, gait);
    if (help) lookAtHelp(); else followChild(pose);
    // The head turns toward whoever is watching (the camera), within a natural range.
    child.root.updateMatrixWorld(true);
    child.head.parent.worldToLocal(toViewer.copy(camera.position)).sub(child.head.position);
    look = easeLook(look, lookAngles(toViewer, shownPose.arms ?? 0), realSeconds);
    child.head.rotation.y = look.yaw;
    child.head.rotation.x += look.pitch;
    liftHead(child, crawlBlend);
    const onFloor = floorShadow(shownPose.feet);
    blob.position.set(shownPose.x, 0.5, shownPose.z);
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
      showGoalsOfAge();
      for (const id of tags.keys()) {
        paintTag(id);
        if (before.size > 0 && before.get(id)?.level !== tagLevels.get(id)?.level) tags.get(id).sprite.userData.popUntil = now + TAG_POP_MS;
      }
      fitLabels();
    },
    /**
     * Shows one help scene (from sim/helpScene.js): the child at the thing, with the help placed
     * (`withHelp`) or without it. The run goes on underneath; the figure comes back to it on clearHelp.
     */
    showHelp(shown, withHelp) {
      const first = !help || help.scene.goalId !== shown.goalId;
      help = { scene: shown, withHelp, cameraFree: first ? false : help.cameraFree };
      if (first && following) setFollowing(false);
      unplaceHelp();
      placeHelp();
    },
    clearHelp() {
      if (!help) return;
      help = null;
      unplaceHelp();
      cameraTouched = false;
      if (model) fitCamera();
    },
    /** Shows the goals' tags of one room only ('all' for every room); the things themselves stay. */
    setGoalRoom(roomId) {
      goalRoom = roomId;
      for (const { room, nodes } of goalNodes) {
        for (const node of nodes) node.visible = roomId === 'all' || roomId === room;
      }
    },
    /** Frames the chosen room (null: the whole house), unless a help scene holds the camera. */
    focusArea(area) {
      focusedArea = area;
      cameraTouched = false;
      if (model && !help) fitCamera();
    },
    /** Shows or hides the dangerous things and the lock's tag (the goals stay). */
    showHazards(visible) {
      hazardsShown = visible;
      for (const node of hazardNodes) node.visible = visible;
    },
    /** The child just reached this thing: its tag grows and blinks for `seconds`. */
    pulse(id, seconds) {
      const tag = tags.get(id);
      if (tag) tag.sprite.userData.pulseUntil = performance.now() + seconds * MS_PER_SECOND;
    },
    select,
  };
}
