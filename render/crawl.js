// Display only: あーちゃん crawling on hands and knees in KO's つかまり立ちのころ (practice_mobility),
// and standing up at the furniture when stopped. Laid over the walking pose with a blend 0..1.
// Angles are the look of a crawling baby; the simulation never reads them.
//
// The figure is built standing, front +z, with a knee in each leg. Crawling turns the body group
// forward by a quarter turn, so the trunk lies level; the thighs hang straight down to the knees
// and the shins lie back along the floor; the arms reach down and a little forward to the hands.
// The trunk is held up at the height of the thighs, never on the floor. The limbs move on the
// diagonal, as babies crawl: the right hand with the left knee, then the left hand with the right
// knee; the hand lifts as it comes forward, the trunk rocks a little from side to side.

const QUARTER = Math.PI / 2;
export const CRAWL = {
  armLength: 0.23, // shoulder to the bottom of the hand, in figure units (childFigure3d)
  thighLength: 0.14, // hip to knee, in figure units (childFigure3d: HIP_Y − KNEE_Y)
  shinRadius: 0.047, // the shin lies on the floor: the knee is this high
  stride: 0.32, // radians each limb swings forward and back
  handLift: 0.035, // how high a hand comes up as it goes forward, in figure units
  rock: 0.09, // radians the trunk rocks from side to side
  bob: 0.012, // how much the trunk rises and falls, in figure units
  rise: 0.3, // radians the trunk rises toward the front: shoulders above the hips, head off the floor
  armStretch: 1.15, // the arms straighten to hold the trunk up (their length, as a share)
  headUp: 1.0, // radians the head is lifted to look ahead
  ease: 6, // how quickly the blend follows, per second (crawl ⇄ stand)
};

/** The blend toward crawling, eased over real time. Crawl while moving in the crawling age. */
export function easeCrawl(shown, { crawlingAge, moving, helped }, seconds) {
  const target = crawlingAge && !helped && moving > 0.2 ? 1 : 0;
  return shown + (target - shown) * (1 - Math.exp(-CRAWL.ease * Math.max(0, seconds)));
}

const mix = (from, to, share) => from + (to - from) * share;

/**
 * Lays the crawl over the figure's current (walking) pose. `blend` 0 leaves it as it is.
 * `phase` is the walking phase, so the limbs move in step with the travel.
 */
export function applyCrawl(figure, blend, phase = 0) {
  const { body, legs, knees, arms, lower } = figure;
  // The walking pose never moves the body back or forth, nor bends a knee: these are the crawl's.
  body.position.z = 0;
  body.rotation.y = 0;
  for (const knee of knees ?? []) knee.rotation.x = 0;
  for (const shoulder of arms) shoulder.scale.y = 1;
  if (blend <= 0) return;
  const share = lower.scale.y; // the age's leg share (shorter legs for the youngest)
  const hipHeight = legs[0].position.y * share; // hips above the feet when standing
  // On hands and knees the trunk is held at the height of the thighs.
  const trunk = CRAWL.thighLength * share + CRAWL.shinRadius;
  const swing = Math.sin(phase);
  const lift = Math.max(0, Math.cos(phase));
  // The trunk leans forward by less than a quarter turn: it rises toward the shoulders.
  const pitch = QUARTER - CRAWL.rise;
  body.rotation.x = mix(body.rotation.x, pitch, blend);
  body.rotation.y = mix(body.rotation.y, CRAWL.rock * swing, blend);
  // Placed so the hips sit at the trunk's height, right over the spot.
  body.position.y = mix(body.position.y, trunk - hipHeight * Math.cos(pitch) + CRAWL.bob * Math.abs(swing), blend);
  body.position.z = -hipHeight * Math.sin(pitch) * blend;
  // Thighs straight down (a quarter turn back from the trunk), the knee bent so the shin lies back
  // along the floor; the knee keeps the shin level as the thigh swings.
  legs.forEach((hip, i) => {
    const step = (i === 0 ? 1 : -1) * CRAWL.stride * swing;
    hip.rotation.x = mix(hip.rotation.x, -pitch + step, blend);
    hip.rotation.z = mix(hip.rotation.z, 0, blend);
    knees[i].rotation.x = mix(0, QUARTER - step, blend);
  });
  // The hands: down and a little forward, so they reach the floor from the trunk's height. The arm
  // that comes forward lifts its hand off the floor (the opposite diagonal to the legs).
  const shoulderHeight = trunk + (arms[0].position.y + figure.torso.position.y - hipHeight) * Math.cos(pitch);
  const armLength = CRAWL.armLength * CRAWL.armStretch;
  const reachForward = Math.acos(Math.min(1, shoulderHeight / armLength));
  arms.forEach((shoulder, i) => {
    shoulder.scale.y = mix(1, CRAWL.armStretch, blend);
    const step = (i === 0 ? -1 : 1) * CRAWL.stride * swing;
    const raised = (i === 0 ? lift : Math.max(0, -Math.cos(phase))) * CRAWL.handLift / CRAWL.armLength;
    shoulder.rotation.x = mix(shoulder.rotation.x, -pitch - reachForward - step - raised, blend);
    shoulder.rotation.z = mix(shoulder.rotation.z, 0, blend);
  });
}

/** After the head has turned to the viewer: lift it to look ahead, and keep the turn small. */
export function liftHead(figure, blend) {
  if (blend <= 0) return;
  figure.head.rotation.y *= 1 - blend * 0.6;
  figure.head.rotation.x -= blend * CRAWL.headUp;
}
