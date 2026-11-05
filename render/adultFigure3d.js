import * as THREE from 'three';

// Display only: the adult beside あーちゃん (KO 2026-11-06). Sits on the sofa, and in a scene
// 「大人と一緒に」 stands behind the child and holds them up (抱っこ), or stands beside and helps.
// Built in cm at the height of settings.adult_figure (a provisional value for the look, not a
// statistic). The front is local +z. The shares below are for the look; nothing reads them.
const SKIN = 0xf3cfb3;
const HAIR = 0x3b2a20;
const TOP = 0x9cc3d5;
const BOTTOM = 0x55607a;
const SOCKS = 0xf2f2f2;

const SHARE = {
  hip: 0.52, knee: 0.28, shoulder: 0.815, shoulderHalf: 0.115, head: 0.915, headRadius: 0.064,
  upperArm: 0.18, forearm: 0.2, thighRadius: 0.042, shinRadius: 0.032, armRadius: 0.026,
  waistHalf: 0.085, chestDepth: 0.06,
};
const SIT_LEAN_BACK = 0.12;
const HOLD_LEAN = 0.12;
const BESIDE_LEAN = 0.25;
const HEAD_DOWN = 0.35;
const EASE_PER_SECOND = 4;
// Watching the child (KO 2026-11-06): the head turns toward them up to the neck's reach, and the
// shoulders take a share of the turn; past that the adult keeps the furthest turn. The head
// follows a moving child at this rate, so it does not snap. Display only.
const NECK_TURN_LIMIT = 1.1;
const TRUNK_TURN_SHARE = 0.3;
const TRUNK_TURN_LIMIT = 0.45;
const NECK_PITCH_LIMIT = 0.7;
const GAZE_PER_SECOND = 3;
// Kneeling on the 土間 to help with the shoes (KO 2026-11-06): upright on both knees, the hands
// on the thighs; reaching in, the body bends forward and the hands go down to the child's foot,
// this high off the floor.
const KNEEL_LEAN = 0.15;
const KNEEL_REACH_LEAN = 0.55;
const KNEEL_FOOT_HEIGHT_CM = 12;

/** The adult figure, standing, feet at y = 0. */
export function makeAdult(heightCm) {
  const H = heightCm;
  const matte = (color, roughness = 0.75) => new THREE.MeshStandardMaterial({ color, roughness });
  const skin = matte(SKIN, 0.55);
  const top = matte(TOP, 0.85);
  const bottom = matte(BOTTOM, 0.85);
  const part = (parent, geometry, material, [x, y, z], scale) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const root = new THREE.Group();
  const hipY = H * SHARE.hip;
  const kneeY = H * SHARE.knee;
  // Legs: a thigh from the hip to the knee, then a shin with a foot.
  const knees = [];
  const legs = [-1, 1].map((side) => {
    const hip = new THREE.Group();
    hip.position.set(side * H * 0.05, hipY, 0);
    const thigh = hipY - kneeY;
    part(hip, new THREE.CapsuleGeometry(H * SHARE.thighRadius, thigh - H * SHARE.thighRadius, 4, 12), bottom, [0, -thigh / 2, 0]);
    const knee = new THREE.Group();
    knee.position.set(0, -thigh, 0);
    hip.add(knee);
    part(knee, new THREE.CapsuleGeometry(H * SHARE.shinRadius, kneeY - H * 0.06, 4, 12), bottom, [0, -kneeY / 2 + H * 0.01, 0]);
    part(knee, new THREE.SphereGeometry(H * 0.03, 14, 10), matte(SOCKS, 0.7), [0, -kneeY + H * 0.016, H * 0.025], [1, 0.55, 1.9]);
    root.add(hip);
    knees.push(knee);
    return hip;
  });
  // The trunk turns at the hips: leaning forward to hold, back on the sofa.
  const trunk = new THREE.Group();
  trunk.position.set(0, hipY, 0);
  root.add(trunk);
  const shoulderY = H * SHARE.shoulder - hipY;
  part(trunk, new THREE.SphereGeometry(1, 20, 14), bottom, [0, H * 0.01, 0], [H * SHARE.waistHalf * 1.15, H * 0.05, H * SHARE.chestDepth]);
  part(trunk, new THREE.CapsuleGeometry(1, 1, 6, 16), top, [0, shoulderY * 0.55, 0], [H * SHARE.shoulderHalf * 0.9, shoulderY * 0.38, H * SHARE.chestDepth]);
  part(trunk, new THREE.CylinderGeometry(H * 0.022, H * 0.026, H * 0.04, 12), skin, [0, shoulderY + H * 0.02, 0]);
  const head = new THREE.Group();
  head.rotation.order = 'YXZ';
  head.position.set(0, H * SHARE.head - hipY, 0);
  trunk.add(head);
  const r = H * SHARE.headRadius;
  part(head, new THREE.SphereGeometry(r, 28, 20), skin, [0, 0, 0], [0.92, 1.08, 1]);
  const hair = part(head, new THREE.SphereGeometry(r * 1.06, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), matte(HAIR, 0.9), [0, r * 0.08, -r * 0.06], [0.95, 1.05, 1.05]);
  hair.rotation.x = -0.35;
  // A bun at the back of the head, and a calm face: two eyes and a smile.
  part(head, new THREE.SphereGeometry(r * 0.42, 16, 12), matte(HAIR, 0.9), [0, r * 0.45, -r * 0.95]);
  const eye = matte(0x2b1a12, 0.3);
  for (const side of [-1, 1]) part(head, new THREE.SphereGeometry(r * 0.09, 10, 8), eye, [side * r * 0.35, r * 0.05, r * 0.9], [1, 1.2, 0.6]);
  const smile = part(head, new THREE.TorusGeometry(r * 0.2, r * 0.035, 6, 12, Math.PI), matte(0xb0504a, 0.5), [0, -r * 0.32, r * 0.9]);
  smile.rotation.z = Math.PI;
  // Arms from the shoulders, bending at the elbow.
  const elbows = [];
  const arms = [-1, 1].map((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * H * SHARE.shoulderHalf, shoulderY, 0);
    const upper = H * SHARE.upperArm;
    part(shoulder, new THREE.CapsuleGeometry(H * SHARE.armRadius * 1.25, upper - H * 0.04, 4, 10), top, [0, -upper / 2, 0]);
    const elbow = new THREE.Group();
    elbow.position.set(0, -upper, 0);
    shoulder.add(elbow);
    const fore = H * SHARE.forearm;
    part(elbow, new THREE.CapsuleGeometry(H * SHARE.armRadius, fore - H * 0.05, 4, 10), skin, [0, -fore / 2 + H * 0.01, 0]);
    part(elbow, new THREE.SphereGeometry(H * 0.028, 12, 10), skin, [0, -fore + H * 0.02, 0], [0.9, 1.1, 0.7]);
    trunk.add(shoulder);
    elbows.push(elbow);
    return shoulder;
  });
  return { root, legs, knees, trunk, head, arms, elbows, heightCm: H, current: null };
}

/**
 * The pose for where the adult is: `sit` on a seat (x, z, yaw, seat height), `hold` (standing
 * behind the child, the hands at holdHeight, holdForward in front) or `beside` (standing, the
 * hands toward the child). Eased over `seconds` so the change is not a jump.
 */
export function poseAdult(adult, target, seconds) {
  const want = shapeFor(adult, target);
  const now = adult.current ?? want;
  const ease = Math.min(1, seconds * EASE_PER_SECOND);
  // A change of place (sofa ↔ the child) jumps; the limbs ease.
  const moved = !adult.current || Math.hypot(want.x - now.x, want.z - now.z) > 1;
  const mix = (a, b) => (moved ? b : a + (b - a) * ease);
  const next = {};
  for (const key of Object.keys(want)) next[key] = Array.isArray(want[key]) ? want[key].map((v, i) => mix(now[key][i], v)) : mix(now[key], want[key]);
  if (moved) Object.assign(next, want);
  adult.current = next;
  adult.root.position.set(next.x, next.rootY, next.z);
  adult.root.rotation.y = next.yaw;
  adult.trunk.rotation.x = next.lean;
  adult.head.rotation.x = next.headDown;
  watch(adult, target.lookAt, seconds, moved);
  adult.legs.forEach((hip, i) => { hip.rotation.x = next.hips[i]; });
  adult.knees.forEach((knee, i) => { knee.rotation.x = next.knees[i]; });
  adult.arms.forEach((shoulder, i) => {
    shoulder.rotation.x = next.shoulders[i];
    shoulder.rotation.z = (i === 0 ? 1 : -1) * next.inward;
  });
  adult.elbows.forEach((elbow, i) => { elbow.rotation.x = next.elbowBend[i]; });
}

/**
 * Turns the head (and a little the shoulders) toward `lookAt` (x, y, z in cm, the child's head),
 * eased so a walking child is followed smoothly. No point: the adult looks ahead.
 */
function watch(adult, lookAt, seconds, jump) {
  let yaw = 0;
  let pitch = null;
  if (lookAt) {
    const { root } = adult;
    const dx = lookAt.x - root.position.x;
    const dz = lookAt.z - root.position.z;
    yaw = Math.atan2(dx, dz) - root.rotation.y;
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    const eyeY = root.position.y + adult.heightCm * SHARE.head;
    pitch = Math.max(-NECK_PITCH_LIMIT, Math.min(NECK_PITCH_LIMIT, Math.atan2(eyeY - lookAt.y, Math.hypot(dx, dz))));
  }
  const trunkWant = Math.max(-TRUNK_TURN_LIMIT, Math.min(TRUNK_TURN_LIMIT, yaw * TRUNK_TURN_SHARE));
  const headWant = Math.max(-NECK_TURN_LIMIT, Math.min(NECK_TURN_LIMIT, yaw - trunkWant));
  const gaze = adult.gaze ?? { head: 0, trunk: 0 };
  const ease = jump ? 1 : Math.min(1, seconds * GAZE_PER_SECOND);
  gaze.head += (headWant - gaze.head) * ease;
  gaze.trunk += (trunkWant - gaze.trunk) * ease;
  adult.gaze = gaze;
  adult.trunk.rotation.order = 'YXZ';
  adult.trunk.rotation.y = gaze.trunk;
  adult.head.rotation.y = gaze.head;
  // Looking down at the child: the pitch replaces the pose's own head tilt, minus the lean.
  if (pitch !== null) adult.head.rotation.x = pitch - adult.trunk.rotation.x;
}

function shapeFor(adult, target) {
  const H = adult.heightCm;
  const hipY = H * SHARE.hip;
  if (target.mode === 'sit') {
    // Thighs forward along the seat, shins down, hands on the lap.
    return {
      x: target.x, z: target.z, yaw: target.yaw, rootY: target.seat - hipY + H * SHARE.thighRadius,
      lean: -SIT_LEAN_BACK, headDown: 0.1, hips: [-Math.PI / 2, -Math.PI / 2], knees: [Math.PI / 2, Math.PI / 2],
      shoulders: [-0.35, -0.35], elbowBend: [-0.9, -0.9], inward: 0.08,
    };
  }
  const shoulderY = H * SHARE.shoulder;
  const reach = H * (SHARE.upperArm + SHARE.forearm);
  if (target.mode === 'kneel') {
    // Thighs straight down, shins back along the floor: the root goes down by the shin.
    const kneeY = H * SHARE.knee;
    const rootY = -kneeY + H * SHARE.shinRadius;
    const out = target.reach ?? 0;
    const lean = KNEEL_LEAN + (KNEEL_REACH_LEAN - KNEEL_LEAN) * out;
    // The arms toward the foot: as in 'hold', from the shoulder as it is with the lean.
    const shoulderUp = shoulderY - hipY;
    const shoulderAt = { y: rootY + hipY + Math.cos(lean) * shoulderUp, z: Math.sin(lean) * shoulderUp };
    const forward = Math.max(1, target.holdForward - shoulderAt.z);
    const drop = Math.max(1, shoulderAt.y - KNEEL_FOOT_HEIGHT_CM);
    const length = Math.min(reach, Math.hypot(forward, drop));
    const bend = Math.acos(Math.min(1, length / reach)) * 2;
    // In the trunk's frame: leaning forward tips an arm that hangs along the body backward by
    // the lean, so the lean is added back.
    const angle = Math.atan2(forward, drop) + bend / 2 + lean;
    // At rest the hands lie on the thighs, a little in front of the body.
    const restAngle = 0.1 + lean;
    const shoulder = restAngle + (angle - restAngle) * out;
    const elbow = 0.9 + (bend - 0.9) * out;
    return {
      x: target.x, z: target.z, yaw: target.yaw, rootY, lean, headDown: HEAD_DOWN,
      hips: [0, 0], knees: [Math.PI / 2, Math.PI / 2], shoulders: [-shoulder, -shoulder], elbowBend: [-elbow, -elbow], inward: 0.12,
    };
  }
  if (target.mode === 'hold') {
    // The arms point down and forward to the child's sides, a little bent, a little inward.
    const lean = HOLD_LEAN;
    const forward = target.holdForward - Math.sin(lean) * (shoulderY - hipY);
    const drop = Math.max(1, shoulderY - target.holdHeight);
    const length = Math.min(reach, Math.hypot(forward, drop));
    const bend = Math.acos(Math.min(1, length / reach)) * 2;
    const angle = Math.atan2(forward, drop) + bend / 2 + lean;
    return {
      x: target.x, z: target.z, yaw: target.yaw, rootY: 0, lean, headDown: HEAD_DOWN,
      hips: [0, 0], knees: [0, 0], shoulders: [-angle, -angle], elbowBend: [-bend, -bend], inward: 0.18,
    };
  }
  // Beside: leaning toward the child, one hand out to help, looking down at them.
  return {
    x: target.x, z: target.z, yaw: target.yaw, rootY: 0, lean: BESIDE_LEAN, headDown: HEAD_DOWN,
    hips: [0, 0], knees: [0.05, 0.05], shoulders: [-0.9, -0.3], elbowBend: [-0.6, -0.4], inward: 0.1,
  };
}
