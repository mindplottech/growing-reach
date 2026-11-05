import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// The things of the goals (「やりたいこと」) drawn as small recognizable objects instead of a
// labelled plate: a cup of milk, a picture book with a frog on it, a toy car and a duck, a towel,
// a toothbrush, a toilet roll, a switch, a coat on a hook, a bowl and spoon, a pair of shoes.
// Display only: sizes here are the look of small things and never enter a calculation.
// Local axes: the group stands at the thing's centre, y up, the front toward -z (like furniture).

const CORNER_SEGMENTS = 3;
const GLASS = 0xcfe6f2;
const MILK = 0xfdfaf0;
const FROG = 0x5aa65a;
const FROG_DARK = 0x3d7d3d;
const WHITE = 0xffffff;
const INK = 0x1f2933;
const PAGES = 0xfaf6ea;
const CAR = 0xd9534f;
const CAR_GLASS = 0xbfe0f0;
const TYRE = 0x2b2b2b;
const DUCK = 0xf4c542;
const BEAK = 0xe8832a;
const TOWEL = 0x9fc5e8;
const RAIL = 0xb8bcc2;
const BRUSH = 0x6fb1e0;
const BRISTLE = 0xf5f5f5;
const PAPER = 0xfbfbf7;
const HOLDER = 0xb8bcc2;
const PLATE = 0xf7f7f4;
const ROCKER = 0xe6e6e2;
const COAT = 0x3f6fb5;
const HOOK = 0x8c8f94;
const BOWL = 0xf3e9d8;
const BOWL_RIM = 0xd9c9ae;
const SPOON = 0xc9ccd1;
const SHOE = 0xc94c4c;
const SHOE_SOLE = 0xf1f1ee;
const LEVER = 0xc9ccd1;
const CUSHION = 0xf0b7a4;
const SOAP = 0xd7eadf;
const PUMP = 0xffffff;

const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

function box(group, w, h, d, x, y, z, mat, radius = 0.4) {
  const r = Math.min(radius, w / 2, h / 2, d / 2);
  const mesh = new THREE.Mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, CORNER_SEGMENTS, r) : new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

function cylinder(group, radiusTop, radiusBottom, h, x, y, z, mat, { axis = 'y', segments = 16 } = {}) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, h, segments), mat);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

function sphere(group, r, x, y, z, mat, segments = 12) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, segments, segments), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

/** A clear cup with milk in it. */
function cup(group) {
  const h = 8;
  const r = 3.4;
  cylinder(group, r * 0.75, r * 0.65, h * 0.6, 0, (h * 0.6) / 2 + 0.3, 0, material(MILK, { roughness: 0.9 }));
  const glass = cylinder(group, r, r * 0.85, h, 0, h / 2, 0, material(GLASS, { transparent: true, opacity: 0.35, roughness: 0.2, depthWrite: false }));
  glass.castShadow = false;
  cylinder(group, r * 0.85, r * 0.85, 0.4, 0, 0.2, 0, material(GLASS, { transparent: true, opacity: 0.5 }));
}

/** A picture book standing up with a frog on the cover. */
function frogBook(group) {
  const w = 14;
  const h = 17;
  const t = 1.6;
  box(group, w - 0.6, h - 0.6, t - 0.6, 0, h / 2, 0, material(PAGES), 0.2);
  box(group, w, h, 0.4, 0, h / 2, -t / 2, material(FROG), 0.3);
  box(group, w, h, 0.4, 0, h / 2, t / 2, material(FROG_DARK), 0.3);
  // The frog: a round head, two eyes on top, a wide smile.
  const face = material(FROG_DARK);
  const z = -t / 2 - 0.3;
  const headY = h * 0.5;
  cylinder(group, 4.4, 4.4, 0.4, 0, headY, z, face, { axis: 'z', segments: 20 });
  for (const side of [-1, 1]) {
    cylinder(group, 1.5, 1.5, 0.5, side * 2.6, headY + 3.6, z - 0.05, material(WHITE), { axis: 'z' });
    cylinder(group, 0.7, 0.7, 0.5, side * 2.6, headY + 3.6, z - 0.3, material(INK), { axis: 'z' });
  }
  box(group, 4.6, 0.5, 0.3, 0, headY - 1.6, z - 0.2, material(INK), 0.1);
  for (const side of [-1, 1]) box(group, 0.5, 1.2, 0.3, side * 2.4, headY - 1.1, z - 0.2, material(INK), 0.1);
  // A second book lying beside it, so it reads as a shelf of books.
  box(group, 10, 1.2, 13, w / 2 + 6, 0.6, 0, material(0xf0b86a), 0.2);
  box(group, 10, 1.2, 13, w / 2 + 6.4, 1.8, 0.4, material(0x8ab4e8), 0.2);
}

/** A toy car and a rubber duck. */
function toys(group) {
  // The car, to the left: body, cabin, four wheels.
  const cx = -7;
  box(group, 12, 3.4, 6, cx, 2.6, 0, material(CAR), 0.8);
  box(group, 6, 3, 5, cx - 0.5, 5.6, 0, material(CAR_GLASS, { roughness: 0.3 }), 0.8);
  for (const [dx, dz] of [[-3.8, -3.2], [3.8, -3.2], [-3.8, 3.2], [3.8, 3.2]]) {
    cylinder(group, 1.6, 1.6, 1, cx + dx, 1.6, dz, material(TYRE), { axis: 'z' });
  }
  // The duck, to the right: body, head, beak.
  const dx = 7;
  sphere(group, 3.6, dx, 3.2, 0, material(DUCK));
  sphere(group, 2.4, dx - 0.5, 7.2, -1.6, material(DUCK));
  const beak = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 10), material(BEAK));
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(dx - 0.5, 6.9, -4.4);
  group.add(beak);
  for (const side of [-1, 1]) sphere(group, 0.4, dx - 0.5 + side * 1.3, 7.8, -3.4, material(INK), 6);
  box(group, 2.4, 0.8, 3, dx + 3, 3.6, 0.5, material(DUCK), 0.3);
}

/** A towel over a rail. */
function towel(group) {
  cylinder(group, 1, 1, 30, 0, 0, 0, material(RAIL, { metalness: 0.4, roughness: 0.4 }), { axis: 'x' });
  box(group, 22, 1.4, 4, 0, 0.2, -0.2, material(TOWEL), 0.6);
  box(group, 22, 26, 1.2, 0, -13, -2, material(TOWEL), 0.5);
  box(group, 22, 26, 1.2, 0, -12, 1.8, material(TOWEL), 0.5);
}

/** A toothbrush standing in a small cup. */
function toothbrush(group) {
  cylinder(group, 2.6, 2.2, 7, 0, 3.5, 0, material(WHITE));
  const brush = new THREE.Group();
  box(brush, 1.1, 17, 0.8, 0, 8.5, 0, material(BRUSH), 0.4);
  box(brush, 1.2, 2.8, 1.4, 0, 17.6, -0.4, material(BRISTLE), 0.2);
  brush.rotation.z = 0.18;
  brush.position.set(0.6, 0.5, 0);
  group.add(brush);
}

/** A toilet roll on its holder. */
function paperRoll(group) {
  cylinder(group, 0.8, 0.8, 14, 0, 0, 0, material(HOLDER, { metalness: 0.4, roughness: 0.4 }), { axis: 'x' });
  const roll = cylinder(group, 5.5, 5.5, 11, 0, 0, 0, material(PAPER), { axis: 'x', segments: 20 });
  roll.rotation.z = Math.PI / 2;
  box(group, 11, 10, 0.4, 0, -5, -5.3, material(PAPER), 0.1);
}

/** A light switch: a plate with a rocker. */
function lightSwitch(group) {
  box(group, 7, 12, 0.8, 0, 0, 0, material(PLATE), 0.4);
  box(group, 4.2, 7, 0.8, 0, 0, -0.6, material(ROCKER), 0.3);
}

/** A small coat hanging on a hook. */
function coatOnHook(group) {
  cylinder(group, 0.7, 0.7, 4, 0, 0, 1, material(HOOK, { metalness: 0.4, roughness: 0.4 }), { axis: 'z' });
  box(group, 16, 20, 2.6, 0, -11, -1.2, material(COAT), 1);
  box(group, 5, 14, 2.8, -9, -9, -1.2, material(COAT), 1);
  box(group, 5, 14, 2.8, 9, -9, -1.2, material(COAT), 1);
  box(group, 7, 3, 2.8, 0, -1.2, -1.4, material(0x2e5a99), 0.6);
}

/** A mixing bowl with a spoon, on the counter. */
function bowlAndSpoon(group) {
  cylinder(group, 8, 5.5, 6, 0, 3, 0, material(BOWL), { segments: 24 });
  cylinder(group, 8.2, 8.2, 0.8, 0, 6, 0, material(BOWL_RIM), { segments: 24 });
  const spoon = new THREE.Group();
  box(spoon, 1.2, 0.5, 14, 0, 0, 0, material(SPOON, { metalness: 0.5, roughness: 0.3 }), 0.2);
  sphere(spoon, 1.8, 0, 0, -7, material(SPOON, { metalness: 0.5, roughness: 0.3 }), 10).scale.set(1, 0.4, 1.3);
  spoon.rotation.x = -0.5;
  spoon.position.set(2, 7, 2);
  group.add(spoon);
}

/** A pair of small shoes, side by side, toes to the front. */
function shoes(group) {
  for (const side of [-1, 1]) {
    const x = side * 3.4;
    box(group, 5.2, 1, 13, x, 0.5, 0, material(SHOE_SOLE), 0.4);
    box(group, 4.8, 3, 12, x, 2.3, 0.3, material(SHOE), 1.4);
    box(group, 4.4, 3.2, 5, x, 4.4, 3, material(SHOE), 1.2);
    box(group, 3.2, 0.6, 2, x, 4.2, -1.5, material(WHITE), 0.2);
  }
}

/** The flush lever. */
function flushLever(group) {
  box(group, 6, 5, 1, 0, 0, 0, material(PLATE), 0.4);
  box(group, 1.6, 1.6, 7, 0, 0, -3.4, material(LEVER, { metalness: 0.5, roughness: 0.3 }), 0.6);
}

/** A seat cushion. */
function cushion(group) {
  box(group, 18, 2.2, 18, 0, 1.1, 0, material(CUSHION), 1);
}

/** A soap bottle with a pump. */
function soap(group) {
  box(group, 5, 9, 4, 0, 4.5, 0, material(SOAP, { transparent: true, opacity: 0.85 }), 1);
  cylinder(group, 0.7, 0.7, 3, 0, 10.5, 0, material(PUMP));
  box(group, 3.4, 1.2, 1.6, 0.8, 12.2, 0, material(PUMP), 0.4);
}

/** A box of crayons, three of them lying in front. */
function crayons(group) {
  box(group, 9, 2, 6, 0, 1, 0, material(0xf2c14e), 0.5);
  [0xd9534f, 0x3f6fb5, 0x5aa65a].forEach((color, i) => {
    cylinder(group, 0.5, 0.5, 6, -2.5 + i * 2.5, 2.6, -4.5, material(color), { axis: 'z' });
  });
}

/** Folded clothes: a small stack of a shirt and socks. */
function foldedClothes(group) {
  box(group, 10, 2.2, 8, 0, 1.1, 0, material(0xf6a6b2), 0.8);
  box(group, 9, 2, 7, 0, 3.2, 0, material(0x9fc5e8), 0.8);
  box(group, 3, 1.4, 6, -2, 4.9, 0, material(0xffffff), 0.5);
  box(group, 3, 1.4, 6, 2, 4.9, 0, material(0xffffff), 0.5);
}

/** A basket with blocks going back in. */
function blockBasket(group) {
  box(group, 14, 6, 10, 0, 3, 0, material(0xd8b48a), 1);
  [[0xd9534f, -3], [0xf2c14e, 0], [0x5aa65a, 3]].forEach(([color, x]) => box(group, 3, 3, 3, x, 7, 0, material(color), 0.4));
}

/** A laundry basket with a shirt over its edge. */
function laundryBasket(group) {
  cylinder(group, 13, 11, 18, 0, 9, 0, material(0xe9e4da));
  box(group, 12, 1, 8, 0, 18.5, -2, material(0xf6a6b2), 0.4);
}

const BUILDERS = {
  cup, own_cup: cup, books: frogBook, toys, towel, toothbrush, paper: paperRoll, switch: lightSwitch, toilet_switch: lightSwitch,
  hook: coatOnHook, help_cook: bowlAndSpoon, shoes, flush: flushLever, seat: cushion, wash: soap,
  crayons, clothes: foldedClothes, tidy: blockBasket, laundry: laundryBasket,
};

/** Which goals have a drawn thing (the others keep their plate). */
export const hasGoalShape = (goalId) => Object.hasOwn(BUILDERS, goalId);

/** Where a wall thing hangs from: the plate's centre (true) or sits on its top (false). */
const HANGS = new Set(['towel', 'paper', 'switch', 'toilet_switch', 'hook', 'flush']);
export const hangsOnWall = (goalId) => HANGS.has(goalId);

/** The turn that points the local front (-z) to the facing side. */
function yawFor({ x, z }) {
  if (x > 0) return -Math.PI / 2;
  if (x < 0) return Math.PI / 2;
  return z > 0 ? Math.PI : 0;
}

/** The thing of one goal as a group at its centre, turned to face `facing`; null when there is none. */
export function buildGoalThing(goalId, facing) {
  const build = BUILDERS[goalId];
  if (!build) return null;
  const group = new THREE.Group();
  build(group);
  group.rotation.y = yawFor(facing);
  group.traverse((node) => { node.raycast = () => {}; });
  return group;
}
