import test from 'node:test';
import assert from 'node:assert/strict';
import { gaitFor } from '../render/gait.js';
import { createPoseTracker } from '../render/childPose.js';
import { ledger, settings } from './helpers.js';

test('the gait for the look comes from the ledger and eases from toddling to walking', () => {
  const toddler = gaitFor(ledger, settings, 15);
  const two = gaitFor(ledger, settings, 29);
  const five = gaitFor(ledger, settings, 60);
  assert.equal(two.stepCm, 34);
  assert.equal(two.cycleSeconds, 0.75);
  assert.equal(two.strideWidthCm, 9);
  assert.ok(toddler.sway > two.sway && two.sway > five.sway);
  assert.equal(toddler.armGuard, 1);
  assert.equal(five.armGuard, 0);
  assert.ok(toddler.headShare > five.headShare && toddler.legShare < five.legShare);
  assert.equal(five.headShare, 1);
});

test('the walk cycle advances with distance on the floor and settles when the child stops', () => {
  const gait = gaitFor(ledger, settings, 36);
  const update = createPoseTracker(settings.display_seconds, gait);
  let pose = update({ x: 0, z: 0, feet: 0, events: [] }, 0.05);
  assert.equal(pose.walk.phase, 0);
  pose = update({ x: gait.stepCm, z: 0, feet: 0, events: [] }, 0.05);
  assert.ok(Math.abs(pose.walk.phase - Math.PI) < 1e-9);
  assert.ok(pose.walk.moving > 0);
  for (let i = 0; i < 20; i += 1) pose = update({ x: gait.stepCm, z: 0, feet: 0, events: [] }, 0.05);
  assert.equal(pose.walk.moving, 0);
  assert.ok(Math.abs(pose.walk.phase - Math.PI) < 1e-9);
});

test('a tracker without a gait keeps the old behaviour', () => {
  const update = createPoseTracker(settings.display_seconds);
  const pose = update({ x: 10, z: 0, feet: 0, events: [] }, 0.05);
  assert.deepEqual(pose.walk, { phase: 0, moving: 0 });
});
