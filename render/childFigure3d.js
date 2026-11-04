import * as THREE from 'three';

// Display only: a figure one unit tall, scaled to the child's height from the ledger. The head
// is about a fifth of the height, the legs are short and the belly sticks out a little. These
// shares are for the look; the simulation never reads them. The front is local +z.
const SKIN = 0xfcd5ae;
const HAIR = 0x4a3426;
const SHIRT = 0xe8835c;
const SHORTS = 0x3f5a7a;
const SHOES = 0x5a4a42;
const EYES = 0x222222;
const MOUTH = 0x9a4a3c;

const HEAD = { radius: 0.1, y: 0.875 };
const HAIR_TILT = -0.35;
const EYE = { radius: 0.014, x: 0.036, up: 0.012 };
const MOUTH_SHAPE = { radius: 0.024, tube: 0.006, down: 0.03 };
const SHOULDER = { x: 0.122, y: 0.68 };
const HIP_Y = 0.33;

/** The figure, with the body group that leans and the two shoulder groups that raise the arms. */
export function makeChild() {
  const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 });
  const shirt = new THREE.MeshStandardMaterial({ color: SHIRT, roughness: 0.75 });
  const shorts = new THREE.MeshStandardMaterial({ color: SHORTS, roughness: 0.75 });
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
  // `lower` group, which the proportions can shorten; the torso rides on top of it.
  const lower = new THREE.Group();
  body.add(lower);
  const legs = [-1, 1].map((side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.055, HIP_Y, 0);
    part(hip, new THREE.BoxGeometry(0.075, 0.04, 0.115), new THREE.MeshStandardMaterial({ color: SHOES, roughness: 0.7 }), [0, 0.02 - HIP_Y, 0.015]);
    part(hip, new THREE.CapsuleGeometry(0.042, 0.17, 4, 10), skin, [0, 0.165 - HIP_Y, 0]);
    part(hip, new THREE.CylinderGeometry(0.058, 0.058, 0.07, 14), shorts, [0, 0.285 - HIP_Y, 0]);
    lower.add(hip);
    return hip;
  });
  // Shorts, then the T-shirt over a round belly.
  const torso = new THREE.Group();
  body.add(torso);
  part(torso, new THREE.CylinderGeometry(0.118, 0.122, 0.1, 18), shorts, [0, 0.345, 0]);
  part(torso, new THREE.SphereGeometry(0.13, 22, 16), shirt, [0, 0.54, 0], [1, 1.3, 0.85]);
  const belly = part(torso, new THREE.SphereGeometry(0.1, 18, 14), shirt, [0, 0.47, 0.035], [1, 0.9, 0.95]);
  part(torso, new THREE.CylinderGeometry(0.035, 0.04, 0.06, 12), skin, [0, 0.765, 0]);

  // Head with hair over the top half, two eyes and a smile.
  const head = new THREE.Group();
  head.position.set(0, HEAD.y, 0);
  torso.add(head);
  part(head, new THREE.SphereGeometry(HEAD.radius, 24, 18), skin, [0, 0, 0]);
  const hair = part(head, new THREE.SphereGeometry(HEAD.radius * 1.06, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.9 }), [0, 0.004, -0.004]);
  hair.rotation.x = HAIR_TILT;
  const onFace = (x, y) => Math.sqrt(HEAD.radius ** 2 - x ** 2 - y ** 2);
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: EYES, roughness: 0.3 });
  for (const side of [-1, 1]) {
    part(head, new THREE.SphereGeometry(EYE.radius, 10, 8), eyeMaterial, [side * EYE.x, EYE.up, onFace(EYE.x, EYE.up) - EYE.radius * 0.4]);
  }
  const mouth = part(head, new THREE.TorusGeometry(MOUTH_SHAPE.radius, MOUTH_SHAPE.tube, 6, 14, Math.PI), new THREE.MeshStandardMaterial({ color: MOUTH }), [0, -MOUTH_SHAPE.down + MOUTH_SHAPE.radius, onFace(0, -MOUTH_SHAPE.down) - 0.004]);
  mouth.rotation.z = Math.PI;

  // Arms: a short sleeve, the arm and a hand, hanging from a shoulder that turns.
  const arms = [-1, 1].map((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * SHOULDER.x, SHOULDER.y, 0);
    part(shoulder, new THREE.SphereGeometry(0.042, 12, 10), shirt, [0, -0.015, 0]);
    part(shoulder, new THREE.CylinderGeometry(0.043, 0.04, 0.07, 12), shirt, [0, -0.05, 0]);
    part(shoulder, new THREE.CapsuleGeometry(0.034, 0.12, 4, 10), skin, [0, -0.13, 0]);
    part(shoulder, new THREE.SphereGeometry(0.04, 12, 10), skin, [0, -0.215, 0]);
    torso.add(shoulder);
    return shoulder;
  });

  const root = new THREE.Group();
  root.add(body);
  return { root, body, arms, legs, lower, torso, head, belly };
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
  // Shorter legs: the lower group shrinks from the floor, and the torso comes down to meet it.
  figure.lower.scale.y = legShare;
  figure.torso.position.y = -HIP_Y * (1 - legShare);
  // The top of the head in figure units, so the root scale can keep the ledger's height.
  return { unitHeight: HEAD.y + HEAD.radius * headShare - HIP_Y * (1 - legShare) };
}

/** The top of the head of the base figure, in figure units. */
export const BASE_UNIT_HEIGHT = HEAD.y + HEAD.radius;
