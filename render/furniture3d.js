import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Display only: the look of each piece, made of plain boxes, cylinders and spheres inside the
// footprint from the layout and up to the heights from the ledger. Thicknesses and colours here
// are for the eye; the simulation never reads them.
const WOOD = 0xd8b48a;
const WOOD_DARK = 0xb8915f;
const FABRIC = 0x8197ab;
const FABRIC_DARK = 0x6c8297;
const SHELF = 0xf0e8da;
const SHELF_INSIDE = 0x9c8667;
const CARDBOARD = 0xc29766;
const TAPE = 0xe8d6a6;
const WAIST_WALL = 0xf4efe4;
const FRAME_WHITE = 0xfbfbf8;
const GLASS = 0xbfe2f3;
const CURTAIN = 0xe7d3b8;
const METAL = 0x9aa4ad;
const MATTRESS = 0xf7f4ee;
const PASTELS = [0xf2d4cc, 0xcfe5d9, 0xd2ddef, 0xf1e4bf, 0xe0d6ee, 0xf1d6e2, 0xd0e8eb];

const TABLE_TOP_CM = 3;
const LOW_TABLE_TOP_CM = 2;
const LEG_CM = 5;
const LOW_LEG_CM = 4;
const CHAIR_LEG_CM = 3.5;
const CHAIR_SEAT_CM = 3;
const CHAIR_BACK_PANEL_CM = 14;
const CHAIR_BACK_THICK_CM = 2.5;
const LEG_INSET_CM = 4;
const SOFA_ARM_SHARE = 0.09;
const SOFA_ARM_MAX_CM = 16;
const SOFA_BACK_SHARE = 0.25;
const SOFA_BACK_MAX_CM = 18;
const CUSHION_CM = 10;
const CUSHION_GAP_CM = 1.6;
const WIDE_SOFA_CM = 140;
const SHELF_BOARD_CM = 2;
const SHELF_KICK_CM = 4;
const TALL_SHELF_CM = 50;
const BED_BASE_CM = 25;
const PILLOW = { w: 0.45, h: 9, d: 30 };
const TAPE_WIDTH_CM = 5;
const TAPE_THICK_CM = 0.4;
const SILL_CM = 3;
const SILL_OVERHANG_CM = 4;
const FRAME_CM = 5;
const FRAME_DEPTH_CM = 4;
const MULLION_CM = 3;
const RAIL_CM = 1.2;
const RAIL_GAP_CM = 8;
const CURTAIN_PLEATS = 4;
const CURTAIN_BELOW_SILL_CM = 12;
const LOCK_PLATE_CM = 2;
const LOCK_LEVER = { w: 0.5, h: 0.4, d: 4 };
const SKIRTING = { height: 6, thick: 1.5, colour: 0xece4d6 };
const CORNER_SEGMENTS = 3;

const noRaycast = () => {};

/** The turn that points the local front (-z) to the facing side. */
function yawFor({ x, z }) {
  if (x > 0) return -Math.PI / 2;
  if (x < 0) return Math.PI / 2;
  return z > 0 ? Math.PI : 0;
}

/**
 * One piece of furniture as a group standing on the floor at the centre of its footprint, turned
 * so its front faces `object.facing`. Returns the group and every material, for highlighting.
 */
export function buildFurniture(object, model, index) {
  const group = new THREE.Group();
  const materials = [];
  const material = (colour, extra = {}) => {
    const made = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.8, ...extra });
    materials.push(made);
    return made;
  };
  const box = (w, h, d, x, y, z, used, round = 0) => {
    const radius = Math.min(round, w / 2, h / 2, d / 2);
    const geometry = radius > 0 ? new RoundedBoxGeometry(w, h, d, CORNER_SEGMENTS, radius) : new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geometry, used);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const cylinder = (radius, h, x, y, z, used) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, h, 12), used);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };

  const alongZ = object.facing.x === 0;
  const W = alongZ ? object.w : object.d;
  const D = alongZ ? object.d : object.w;
  const H = object.top - object.bottom;
  const legs = (size, height, inset) => {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        box(size, height, size, sx * (W / 2 - inset - size / 2), height / 2, sz * (D / 2 - inset - size / 2), wood);
      }
    }
  };
  const wood = material(WOOD);

  switch (object.shape) {
    case 'table': {
      box(W, TABLE_TOP_CM, D, 0, H - TABLE_TOP_CM / 2, 0, wood, 1);
      legs(LEG_CM, H - TABLE_TOP_CM, LEG_INSET_CM);
      break;
    }
    case 'low_table': {
      box(W, LOW_TABLE_TOP_CM, D, 0, H - LOW_TABLE_TOP_CM / 2, 0, wood, 0.8);
      legs(LOW_LEG_CM, H - LOW_TABLE_TOP_CM, LEG_INSET_CM);
      break;
    }
    case 'chair': {
      box(W, CHAIR_SEAT_CM, D, 0, H - CHAIR_SEAT_CM / 2, 0, wood, 1);
      legs(CHAIR_LEG_CM, H - CHAIR_SEAT_CM, 1);
      // The back rises from the far edge, away from the table.
      const back = object.look.back;
      const post = back - H;
      const z = D / 2 - CHAIR_LEG_CM / 2 - 1;
      for (const sx of [-1, 1]) box(CHAIR_LEG_CM, post, CHAIR_LEG_CM, sx * (W / 2 - CHAIR_LEG_CM / 2 - 1), H + post / 2, z, wood);
      box(W - 2, CHAIR_BACK_PANEL_CM, CHAIR_BACK_THICK_CM, 0, back - CHAIR_BACK_PANEL_CM / 2, z, wood, 1);
      break;
    }
    case 'sofa': {
      const fabric = material(FABRIC);
      const frame = material(FABRIC_DARK);
      const arm = Math.min(SOFA_ARM_MAX_CM, W * SOFA_ARM_SHARE);
      const backDepth = object.look.back ? Math.min(SOFA_BACK_MAX_CM, D * SOFA_BACK_SHARE) : 0;
      const seatDepth = D - backDepth;
      const seatZ = -backDepth / 2;
      // A darker base under the cushions: the gaps between them read as split lines.
      box(W - 2 * arm, H - CUSHION_CM, seatDepth, 0, (H - CUSHION_CM) / 2, seatZ, frame);
      const inner = W - 2 * arm;
      const count = inner > WIDE_SOFA_CM ? 3 : 2;
      const each = inner / count;
      for (let i = 0; i < count; i += 1) {
        box(each - CUSHION_GAP_CM, CUSHION_CM, seatDepth - CUSHION_GAP_CM, -inner / 2 + each * (i + 0.5), H - CUSHION_CM / 2, seatZ, fabric, 3);
      }
      for (const sx of [-1, 1]) box(arm, object.look.arm, D, sx * (W / 2 - arm / 2), object.look.arm / 2, 0, fabric, 4);
      if (object.look.back) box(inner, object.look.back, backDepth, 0, object.look.back / 2, D / 2 - backDepth / 2, fabric, 4);
      break;
    }
    case 'sofa_back': {
      box(W, H, D, 0, H / 2, 0, material(FABRIC), 4);
      break;
    }
    case 'shelf': {
      const panel = material(SHELF);
      const inside = material(SHELF_INSIDE);
      const t = SHELF_BOARD_CM;
      box(W, t, D, 0, H - t / 2, 0, panel, 0.5);
      // Inside surfaces are darker, so the open front reads as an opening from above.
      box(W, SHELF_KICK_CM, D, 0, SHELF_KICK_CM / 2, 0, inside);
      for (const sx of [-1, 1]) box(t, H, D, sx * (W / 2 - t / 2), H / 2, 0, panel);
      box(W - 2 * t, H - t - SHELF_KICK_CM, 1, 0, (H - t + SHELF_KICK_CM) / 2, D / 2 - 0.5, inside);
      const boards = H > TALL_SHELF_CM ? 2 : 1;
      for (let i = 1; i <= boards; i += 1) {
        const y = SHELF_KICK_CM + ((H - t - SHELF_KICK_CM) * i) / (boards + 1);
        box(W - 2 * t, t, D - 1, 0, y, -0.5, inside);
      }
      break;
    }
    case 'bed': {
      box(W, BED_BASE_CM, D, 0, BED_BASE_CM / 2, 0, wood, 1);
      box(W - 4, H - BED_BASE_CM, D - 4, 0, BED_BASE_CM + (H - BED_BASE_CM) / 2, 0, material(MATTRESS), 4);
      box(W * PILLOW.w, PILLOW.h, PILLOW.d, 0, H + PILLOW.h / 2, D / 2 - PILLOW.d / 2 - 6, material(0xffffff), 4);
      break;
    }
    case 'box': {
      const card = material(CARDBOARD);
      box(W, H, D, 0, H / 2, 0, card, 0.8);
      // Packing tape over the seam of the flaps.
      box(TAPE_WIDTH_CM, TAPE_THICK_CM, D + 0.2, 0, H + TAPE_THICK_CM / 2, 0, material(TAPE));
      box(TAPE_WIDTH_CM, H * 0.3, 0.2, 0, H - H * 0.15, -D / 2 - 0.1, material(TAPE));
      break;
    }
    case 'window': {
      // The wall below the window, the sill on it, the frame and glass up to the ledger inner
      // height, and a short curtain beside it. The pane sits close to the wall.
      box(W, H, D, 0, H / 2, 0, material(WAIST_WALL));
      box(W + 2 * FRAME_CM + 2 * SILL_OVERHANG_CM, SILL_CM, D + SILL_OVERHANG_CM, 0, H - SILL_CM / 2, -SILL_OVERHANG_CM / 2, material(FRAME_WHITE), 0.8);
      const pane = model.pane;
      const paneHeight = pane.top - pane.bottom;
      const wallZ = D / 2;
      const frameZ = wallZ - FRAME_DEPTH_CM / 2;
      const white = material(FRAME_WHITE);
      box(W + 2 * FRAME_CM, FRAME_CM, FRAME_DEPTH_CM, 0, pane.top + FRAME_CM / 2, frameZ, white);
      box(W + 2 * FRAME_CM, FRAME_CM, FRAME_DEPTH_CM, 0, pane.bottom + FRAME_CM / 2, frameZ, white);
      // The stile on the lock's side is widened to carry the lock, which stays where the layout puts it.
      const lock = model.objects.find(({ kind }) => kind === 'window_lock');
      const centreX = object.x + object.w / 2;
      const lockFrom = lock ? lock.x - centreX : 0;
      const lockTo = lock ? lock.x + lock.w - centreX : 0;
      for (const sx of [-1, 1]) {
        const inner = W / 2;
        const reach = sx > 0 ? Math.max(FRAME_CM, lockTo - inner) : Math.max(FRAME_CM, -lockFrom - inner);
        const width = lock && reach <= W ? reach : FRAME_CM;
        box(width, paneHeight + FRAME_CM, FRAME_DEPTH_CM, sx * (inner + width / 2), pane.bottom + (paneHeight + FRAME_CM) / 2, frameZ, white);
      }
      box(MULLION_CM, paneHeight, FRAME_DEPTH_CM, 0, pane.bottom + paneHeight / 2, frameZ, white);
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(W, paneHeight),
        material(GLASS, { transparent: true, opacity: 0.45, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
      );
      glass.position.set(0, pane.bottom + paneHeight / 2, wallZ - 1);
      group.add(glass);
      if (model.curtain) {
        const cloth = material(CURTAIN, { roughness: 0.95 });
        const left = model.curtain.x - centreX;
        const top = pane.top + RAIL_GAP_CM;
        const bottom = pane.bottom - CURTAIN_BELOW_SILL_CM;
        const fold = model.curtain.w / CURTAIN_PLEATS;
        for (let i = 0; i < CURTAIN_PLEATS; i += 1) {
          cylinder(fold * 0.6, top - bottom, left + fold * (i + 0.5), (top + bottom) / 2, wallZ - fold * 0.8 - (i % 2) * 1.5, cloth);
        }
        const railFrom = Math.min(left, -W / 2 - FRAME_CM);
        const railTo = Math.max(left + model.curtain.w, W / 2 + FRAME_CM);
        const rail = cylinder(RAIL_CM, railTo - railFrom, (railFrom + railTo) / 2, top + RAIL_CM, wallZ - fold, white);
        rail.rotation.z = Math.PI / 2;
      }
      break;
    }
    case 'window_lock': {
      // A metal catch on the frame, at the layout position and the ledger height.
      const metal = material(METAL, { metalness: 0.6, roughness: 0.35 });
      box(W, H * 2, LOCK_PLATE_CM, 0, object.bottom + H / 2, D / 2 - LOCK_PLATE_CM / 2 - FRAME_DEPTH_CM, metal, 0.5);
      box(W * LOCK_LEVER.w, H * LOCK_LEVER.h, LOCK_LEVER.d, 0, object.bottom + H / 2, D / 2 - FRAME_DEPTH_CM - LOCK_PLATE_CM - LOCK_LEVER.d / 2, metal, 0.6);
      break;
    }
    default: {
      box(W, H, D, 0, H / 2, 0, material(PASTELS[index % PASTELS.length]), 3);
    }
  }
  group.rotation.y = yawFor(object.facing);
  group.position.x = object.x + object.w / 2;
  group.position.z = object.z + object.d / 2;
  return { group, materials };
}

/** Low white boards where the floor meets the two walls. */
export function buildSkirting(model) {
  const group = new THREE.Group();
  const used = new THREE.MeshStandardMaterial({ color: SKIRTING.colour, roughness: 0.9 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(model.width, SKIRTING.height, SKIRTING.thick), used);
  back.position.set(model.width / 2, SKIRTING.height / 2, model.depth - SKIRTING.thick / 2);
  const side = new THREE.Mesh(new THREE.BoxGeometry(SKIRTING.thick, SKIRTING.height, model.depth), used);
  side.position.set(SKIRTING.thick / 2, SKIRTING.height / 2, model.depth / 2);
  for (const mesh of [back, side]) {
    mesh.receiveShadow = true;
    mesh.raycast = noRaycast;
    group.add(mesh);
  }
  return group;
}
