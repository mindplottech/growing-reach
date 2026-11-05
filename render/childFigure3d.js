import * as THREE from 'three';

// Display only: あーちゃん, a figure one unit tall, scaled to the child's height from the ledger.
// A toddler's look: a big round head on no neck, a round body, chubby arms and legs, big shiny
// eyes, pink cheeks and a tuft of hair. These shares are for the look; the simulation never
// reads them. The front is local +z.
const SKIN = 0xffdcc0;
const HAIR = 0x6b4426;
const SHIRT = 0xffc94d;
const COLLAR = 0xffffff;
const PANTS = 0x4fa3a5;
const SHOES = 0xf06a5a;
const SOLES = 0xffffff;
const EYES = 0x2b1a12;
const SHINE = 0xffffff;
const CHEEKS = 0xff9e9e;
const MOUTH = 0xc0504a;
const OPEN_MOUTH = 0x7a2f2a;

const HEAD = { radius: 0.165, y: 0.765 };
const EYE = { radius: 0.024, x: 0.062, up: -0.008, tall: 1.3 };
const CHEEK = { radius: 0.03, x: 0.1, down: 0.05 };
const MOUTH_SHAPE = { radius: 0.017, tube: 0.0055, down: 0.068 };
const SHOULDER = { x: 0.13, y: 0.57 };
const HIP_Y = 0.27;
// The knee: the leg bends here, for crawling. Height above the floor, in figure units.
const KNEE_Y = 0.13;
const DIAPER = 0xffffff;
const DIAPER_TAB = 0xa8d8f0;

/** The figure, with the body group that leans and the two shoulder groups that raise the arms. */
export function makeChild() {
  const matte = (color, roughness = 0.7) => new THREE.MeshStandardMaterial({ color, roughness });
  const skin = matte(SKIN, 0.55);
  const shirt = matte(SHIRT, 0.8);
  const pants = matte(PANTS, 0.8);
  const body = new THREE.Group();
  const part = (parent, geometry, material, [x, y, z], scale) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Legs and feet, each hanging from a hip that swings when walking. The hips sit on the
  // `lower` group, which the proportions can shorten; the body rides on top of it.
  const lower = new THREE.Group();
  body.add(lower);
  // What the outfit switches: the toddler's clothes, or the baby's diaper and bare skin.
  const outfit = { toddler: [], baby: [], chubby: [] };
  const knees = [];
  // Each foot's shoe (sole and upper) and bare foot, for the shoe scene to take off and put on.
  const feet = [];
  const legs = [-1, 1].map((side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.06, HIP_Y, 0);
    // The thigh (in the trouser leg), then the knee with the shin and the foot below it.
    outfit.toddler.push(part(hip, new THREE.CapsuleGeometry(0.058, 0.07, 4, 12), pants, [0, 0.215 - HIP_Y, 0]));
    outfit.chubby.push(part(hip, new THREE.CapsuleGeometry(0.05, 0.08, 4, 12), skin, [0, -(HIP_Y - KNEE_Y) / 2, 0]));
    const knee = new THREE.Group();
    knee.position.set(0, KNEE_Y - HIP_Y, 0);
    hip.add(knee);
    outfit.chubby.push(part(knee, new THREE.CapsuleGeometry(0.047, 0.07, 4, 12), skin, [0, -0.065, 0]));
    // A round shoe with a white sole; bare, a round little foot.
    const sole = part(knee, new THREE.SphereGeometry(0.052, 16, 12), matte(SOLES, 0.6), [0, 0.018 - KNEE_Y, 0.02], [1, 0.32, 1.45]);
    const shoe = part(knee, new THREE.SphereGeometry(0.05, 16, 12), matte(SHOES, 0.55), [0, 0.04 - KNEE_Y, 0.018], [1, 0.75, 1.4]);
    const bare = part(knee, new THREE.SphereGeometry(0.046, 16, 12), skin, [0, 0.03 - KNEE_Y, 0.02], [1, 0.7, 1.35]);
    outfit.toddler.push(sole, shoe);
    outfit.baby.push(bare);
    feet.push({ shoe: [sole, shoe], bare });
    lower.add(hip);
    knees.push(knee);
    return hip;
  });

  // A round body: trousers below, a T-shirt with a white collar over a round belly. No neck.
  const torso = new THREE.Group();
  body.add(torso);
  outfit.toddler.push(part(torso, new THREE.SphereGeometry(0.135, 22, 16), pants, [0, 0.31, 0], [1, 0.62, 0.86]));
  const chest = part(torso, new THREE.SphereGeometry(0.14, 24, 18), shirt, [0, 0.46, 0], [1, 1.12, 0.86]);
  const belly = part(torso, new THREE.SphereGeometry(0.1, 20, 16), shirt, [0, 0.42, 0.03], [1, 0.9, 0.95]);
  const collar = part(torso, new THREE.TorusGeometry(0.068, 0.014, 8, 24), matte(COLLAR, 0.6), [0, 0.598, 0.0], [1, 1, 1]);
  collar.rotation.x = Math.PI / 2;
  outfit.toddler.push(collar);
  // The baby's diaper: puffed up at the bottom, with two blue tabs at the front.
  const diaperMaterial = matte(DIAPER, 0.85);
  outfit.baby.push(part(torso, new THREE.SphereGeometry(0.15, 22, 16), diaperMaterial, [0, 0.29, -0.02], [1.08, 0.72, 1.12]));
  outfit.baby.push(part(torso, new THREE.SphereGeometry(0.1, 18, 14), diaperMaterial, [0, 0.3, -0.1], [1.25, 0.9, 0.95]));
  for (const side of [-1, 1]) outfit.baby.push(part(torso, new THREE.BoxGeometry(0.04, 0.03, 0.01), matte(DIAPER_TAB, 0.7), [side * 0.08, 0.33, 0.13]));

  // The head: big and round, with ears, hair over the top, and a tuft.
  const head = new THREE.Group();
  head.position.set(0, HEAD.y, 0);
  torso.add(head);
  part(head, new THREE.SphereGeometry(HEAD.radius, 32, 24), skin, [0, 0, 0], [1.04, 0.97, 1]);
  for (const side of [-1, 1]) part(head, new THREE.SphereGeometry(0.035, 14, 10), skin, [side * HEAD.radius * 1.01, -0.01, 0], [0.55, 1, 0.8]);
  const hairMaterial = matte(HAIR, 0.85);
  const cap = part(head, new THREE.SphereGeometry(HEAD.radius * 1.05, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.52), hairMaterial, [0, 0.008, -0.006], [1.04, 1, 1]);
  cap.rotation.x = -0.22;
  // The tuft on top: a little curl.
  const tuft = part(head, new THREE.TorusGeometry(0.026, 0.009, 8, 16, Math.PI * 1.4), hairMaterial, [0.008, HEAD.radius * 1.06, 0.01]);
  tuft.rotation.set(0, Math.PI / 2, 0.4);

  // The face: big shiny eyes (each a group, so a blink squeezes the eye and its shine together),
  // pink cheeks, a small nose and a small smile.
  const onFace = (x, y) => Math.sqrt(Math.max(0, HEAD.radius ** 2 - x ** 2 - y ** 2));
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: EYES, roughness: 0.2, metalness: 0.1 });
  const shineMaterial = new THREE.MeshBasicMaterial({ color: SHINE });
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Group();
    eye.position.set(side * EYE.x, EYE.up, onFace(EYE.x, EYE.up) - EYE.radius * 0.35);
    head.add(eye);
    part(eye, new THREE.SphereGeometry(EYE.radius, 18, 14), eyeMaterial, [0, 0, 0], [1, EYE.tall, 0.7]);
    part(eye, new THREE.SphereGeometry(EYE.radius * 0.36, 10, 8), shineMaterial, [EYE.radius * 0.35, EYE.radius * 0.5, EYE.radius * 0.6]);
    part(eye, new THREE.SphereGeometry(EYE.radius * 0.16, 8, 6), shineMaterial, [-EYE.radius * 0.35, -EYE.radius * 0.45, EYE.radius * 0.62]);
    return eye;
  });
  const cheekMaterial = new THREE.MeshStandardMaterial({ color: CHEEKS, roughness: 0.9, transparent: true, opacity: 0.85 });
  for (const side of [-1, 1]) {
    const cheek = part(head, new THREE.SphereGeometry(CHEEK.radius, 14, 10), cheekMaterial, [side * CHEEK.x, -CHEEK.down, onFace(CHEEK.x, -CHEEK.down) - 0.006], [1.2, 0.75, 0.35]);
    cheek.castShadow = false;
  }
  part(head, new THREE.SphereGeometry(0.011, 10, 8), matte(0xf5bfa0, 0.6), [0, -0.035, onFace(0, -0.035) + 0.002], [1.2, 0.9, 0.8]);
  const mouth = part(head, new THREE.TorusGeometry(MOUTH_SHAPE.radius, MOUTH_SHAPE.tube, 6, 14, Math.PI), matte(MOUTH, 0.5), [0, -MOUTH_SHAPE.down + MOUTH_SHAPE.radius, onFace(0, -MOUTH_SHAPE.down) - 0.003]);
  mouth.rotation.z = Math.PI;
  // The open mouth for a yawn: a small dark oval, hidden until it is needed.
  const openMouth = part(head, new THREE.SphereGeometry(1, 14, 10), matte(OPEN_MOUTH, 0.8), [0, -MOUTH_SHAPE.down, onFace(0, -MOUTH_SHAPE.down) - 0.006], [0.015, 0.02, 0.012]);
  openMouth.visible = false;

  // Arms: a puffed sleeve, a chubby arm and a round hand, hanging from a shoulder that turns.
  const sleeves = [];
  const arms = [-1, 1].map((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * SHOULDER.x, SHOULDER.y, 0);
    const sleeve = part(shoulder, new THREE.SphereGeometry(0.05, 14, 12), shirt, [0, -0.025, 0], [1, 1.1, 1]);
    sleeves.push(sleeve);
    part(shoulder, new THREE.CapsuleGeometry(0.036, 0.1, 4, 12), skin, [0, -0.115, 0]);
    part(shoulder, new THREE.SphereGeometry(0.042, 14, 12), skin, [0, -0.19, 0]);
    torso.add(shoulder);
    return shoulder;
  });

  const root = new THREE.Group();
  root.add(body);
  for (const mesh of outfit.baby) mesh.visible = false;
  return {
    root, body, arms, legs, knees, lower, torso, head, belly, eyes, mouth, openMouth, feet,
    outfit: { ...outfit, covered: [chest, belly, ...sleeves], shirt, skin },
  };
}

const BELLY_BASE = [1, 0.9, 0.95];

/**
 * Builds the figure for an age: a bigger head, a rounder belly and shorter legs for the
 * youngest, easing to the five-year-old's shape (shares of 1). Display only: the figure's total
 * height is still the ledger's, set by the root scale.
 */
export function applyProportions(figure, { headShare, bellyShare, legShare }) {
  figure.head.scale.setScalar(headShare);
  figure.belly.scale.set(BELLY_BASE[0] * bellyShare, BELLY_BASE[1] * bellyShare, BELLY_BASE[2] * bellyShare);
  // Shorter legs: the lower group shrinks from the floor, and the body comes down to meet it.
  figure.lower.scale.y = legShare;
  figure.torso.position.y = -HIP_Y * (1 - legShare);
  // The top of the head in figure units, so the root scale can keep the ledger's height.
  return { unitHeight: HEAD.y + HEAD.radius * 0.97 * headShare - HIP_Y * (1 - legShare) };
}

/** The hip joint and the thigh's thickness, in figure units: for sitting on a seat. */
export const SEATED = { hipY: HIP_Y, thighRadius: 0.058 };

/** A loose shoe like the figure's (sole and upper), one figure unit tall at scale 1: for the shoe scene. */
export function makeLooseShoe() {
  const group = new THREE.Group();
  const add = (color, roughness, y, scale) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({ color, roughness }));
    mesh.position.y = y;
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    group.add(mesh);
  };
  add(SOLES, 0.6, -0.022, [0.052, 0.052 * 0.32, 0.052 * 1.45]);
  add(SHOES, 0.55, 0, [0.05, 0.05 * 0.75, 0.05 * 1.4]);
  return group;
}

/** The hand at the end of an arm, in the arm's own frame (figure units). */
export const HAND_IN_ARM = { y: -0.19 };
/** The shoe's middle on a foot, in the knee's own frame (figure units). */
export const SHOE_ON_KNEE = { y: 0.04 - KNEE_Y, z: 0.018 };

/** The top of the head of the base figure, in figure units. */
export const BASE_UNIT_HEIGHT = HEAD.y + HEAD.radius * 0.97;

/**
 * The clothes for the age (display only): the toddler's T-shirt and trousers and shoes, or in the
 * つかまり立ちのころ a baby's puffed-up diaper, bare chubby body and bare feet.
 */
export function applyOutfit(figure, baby) {
  const { toddler, baby: babyParts, chubby, covered, shirt, skin } = figure.outfit;
  for (const mesh of toddler) mesh.visible = !baby;
  for (const mesh of babyParts) mesh.visible = baby;
  for (const mesh of covered) mesh.material = baby ? skin : shirt;
  // Chubby arms and legs, a rounder chest for the baby.
  const plump = baby ? 1.18 : 1;
  for (const mesh of chubby) mesh.scale.set(plump, 1, plump);
  covered[0].scale.set(plump, 1.12, 0.86 * plump);
}
