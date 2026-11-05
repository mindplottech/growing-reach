import test from 'node:test';
import assert from 'node:assert/strict';
import { lookAngles, easeLook, LOOK } from '../render/look.js';

test('the head turns toward a viewer in front, up to the limit', () => {
  assert.equal(lookAngles({ x: 0, y: 0, z: 5 }).yaw, 0);
  assert.ok(lookAngles({ x: 1, y: 0, z: 5 }).yaw > 0);
  assert.ok(lookAngles({ x: -1, y: 0, z: 5 }).yaw < 0);
  assert.equal(lookAngles({ x: 5, y: 0, z: 0.01 }).yaw, LOOK.yaw);
});

test('a viewer behind: the child looks ahead, with no flip from one shoulder to the other', () => {
  assert.equal(lookAngles({ x: 0.01, y: 0, z: -5 }).yaw, 0);
  const left = lookAngles({ x: 0.3, y: 0, z: -5 }).yaw;
  const right = lookAngles({ x: -0.3, y: 0, z: -5 }).yaw;
  assert.ok(Math.abs(left) < 0.05 && Math.abs(right) < 0.05);
});

test('looking up at a viewer above is limited, and reaching cuts the turn', () => {
  const up = lookAngles({ x: 0, y: 10, z: 1 });
  assert.equal(up.pitch, -LOOK.pitch);
  const turned = lookAngles({ x: 5, y: 0, z: 0.01 }, 1).yaw;
  assert.ok(Math.abs(turned - LOOK.yaw * (1 - LOOK.reachShare)) < 1e-9);
});

test('the head eases toward the target and does not overshoot', () => {
  const next = easeLook({ yaw: 0, pitch: 0 }, { yaw: 1, pitch: -0.3 }, 0.1);
  assert.ok(next.yaw > 0 && next.yaw < 1);
  assert.ok(next.pitch < 0 && next.pitch > -0.3);
  assert.deepEqual(easeLook({ yaw: 0.4, pitch: 0 }, { yaw: 1, pitch: 0 }, 0), { yaw: 0.4, pitch: 0 });
});
