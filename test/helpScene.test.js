import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adjustmentsAt, HELP_CLOSER, HELP_LOWER, HELP_STEP, STATUS_CAN, STATUS_HELP, STATUS_NOT_YET } from '../sim/adjustments.js';
import { helpScene } from '../sim/helpScene.js';
import { selectLayout } from '../sim/room.js';
import { createSimulation } from '../sim/simulation.js';
import { settings } from '../sim/params.js';
import { SEX_ANY } from '../sim/body.js';

const ledger = JSON.parse(readFileSync(new URL('../data/values_ledger.json', import.meta.url)));
const layouts = JSON.parse(readFileSync(new URL('../data/room_layout.json', import.meta.url)));
const room = selectLayout(layouts, 'house');

function scenesAt(months) {
  const simulation = createSimulation({ ledger, settings, months, sex: SEX_ANY, seed: 1, room });
  const all = adjustmentsAt({ ledger, room, landmarks: simulation.landmarks, hazards: simulation.hazards, months });
  return all.goals.map((goal) => ({ goal, scene: helpScene({ ledger, room, goal, body: all.body, sizes: settings.help_scene }) }));
}

test('every goal has a scene: the child stands outside the thing and faces it', () => {
  for (const months of [15, 30, 60]) {
    for (const { goal, scene } of scenesAt(months)) {
      assert.ok(scene, goal.id);
      const holder = goal.under ?? { x: goal.x, y: goal.y, w: goal.w, d: goal.d };
      const inside = scene.stand.x > holder.x && scene.stand.x < holder.x + holder.w && scene.stand.y > holder.y && scene.stand.y < holder.y + holder.d;
      assert.equal(inside, false, `${goal.id} stands inside the furniture`);
      assert.ok(scene.stand.x >= 0 && scene.stand.x <= room.width && scene.stand.y >= 0 && scene.stand.y <= room.depth, `${goal.id} off the floor`);
    }
  }
});

test('a step puts the stool under the feet and the hand gets there; without it the hand falls short', () => {
  // From 30 months: before that, the practice offers no step (the adult holds the child up).
  const stepped = scenesAt(33).filter(({ goal }) => goal.status === STATUS_HELP && goal.help === HELP_STEP);
  assert.ok(stepped.length > 0);
  for (const { goal, scene } of stepped) {
    assert.equal(scene.prop.kind, HELP_STEP);
    assert.equal(scene.prop.heightCm, goal.stepCm);
    assert.equal(scene.withHelp.feet, goal.stepCm);
    assert.equal(scene.without.feet, 0);
    assert.equal(scene.without.reaches, false, goal.id);
    assert.equal(scene.withHelp.reaches, true, goal.id);
    // The stool is centred where the child stands.
    assert.ok(Math.abs(scene.prop.x + scene.prop.w / 2 - scene.stand.x) < 1e-9);
  }
});

test('lower and closer move the thing, not the child', () => {
  for (const months of [15, 24, 36]) {
    for (const { goal, scene } of scenesAt(months).filter(({ goal }) => goal.status === STATUS_HELP && goal.help !== HELP_STEP)) {
      assert.equal(scene.withHelp.feet, 0);
      assert.equal(scene.prop.kind, goal.help);
      if (goal.help === HELP_LOWER) {
        assert.equal(scene.thingAfter.height, goal.maxHeightCm);
        assert.equal(scene.withHelp.reaches, true, goal.id);
      }
      if (goal.help === HELP_CLOSER) {
        assert.notDeepEqual([scene.thingAfter.x, scene.thingAfter.y], [scene.thing.x, scene.thing.y], goal.id);
        const under = goal.under;
        assert.ok(scene.thingAfter.x >= under.x && scene.thingAfter.x + scene.thingAfter.w <= under.x + under.w, `${goal.id} off the table`);
      }
    }
  }
});

test('by themselves and not yet have no prop; the hand matches the status', () => {
  for (const { goal, scene } of scenesAt(48)) {
    if (goal.status === STATUS_CAN) {
      assert.equal(scene.prop, null);
      assert.equal(scene.withHelp.reaches, true, goal.id);
    }
    if (goal.status === STATUS_NOT_YET) {
      assert.equal(scene.prop, null);
      assert.equal(scene.withHelp.reaches, false, goal.id);
    }
  }
});

test('the scene is the same for the same inputs (nothing random)', () => {
  const [a] = scenesAt(27);
  const [b] = scenesAt(27);
  assert.deepEqual(a.scene, b.scene);
});

function scenesWithAdult(months) {
  const simulation = createSimulation({ ledger, settings, months, sex: SEX_ANY, seed: 1, room });
  const all = adjustmentsAt({ ledger, room, landmarks: simulation.landmarks, hazards: simulation.hazards, months });
  return new Map(all.goals.map((goal) => [goal.id, helpScene({ ledger, room, goal, body: all.body, sizes: settings.help_scene, adultSizes: settings.adult_figure })]));
}

test('抱っこ (KO 2026-11-06): the adult stands behind the child and holds them up by the step that would be needed', () => {
  const wash = scenesWithAdult(18).get('wash');
  assert.equal(wash.adult.mode, 'hold');
  assert.ok(wash.withHelp.feet > 0);
  // Behind: farther from the vanity than the child.
  const vanity = wash.thing;
  const toThing = (p) => Math.hypot(p.x - (vanity.x + vanity.w / 2), p.y - (vanity.y + vanity.d / 2));
  assert.ok(toThing(wash.adult) > toThing(wash.stand));
  // Clothes with an adult: beside, the child on the floor.
  const clothes = scenesWithAdult(30).get('clothes');
  assert.equal(clothes.adult.mode, 'beside');
  assert.equal(clothes.withHelp.feet, 0);
  // A goal the child does alone has no adult.
  assert.equal(scenesWithAdult(48).get('towel')?.adult ?? null, null);
});

test('toilet (KO 2026-11-06): the child sits on the seat facing out, the stool in front under the feet', () => {
  const sit = scenesWithAdult(48).get('sit');
  assert.equal(sit.prop.kind, HELP_STEP);
  assert.equal(sit.withHelp.seated, sit.thing.height);
  const bowl = room.landmarks.find(({ id }) => id === 'toilet_bowl');
  // The stool reaches out of the bowl's front, on the side the child faces.
  assert.ok(sit.prop.y < bowl.y && sit.prop.y + sit.prop.d > bowl.y);
  assert.ok(sit.withHelp.y > bowl.y && sit.withHelp.y < bowl.y + bowl.d / 2);
});
