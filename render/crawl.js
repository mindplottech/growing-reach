// Display only: あーちゃん crawling on hands and knees in KO's つかまり立ちのころ (practice_mobility),
// and standing up at the furniture when stopped. Laid over the walking pose with a blend 0..1.
// Angles are the look of a crawling baby; the simulation never reads them.
//
// The figure is built standing, front +z. Crawling turns the body group forward by a quarter turn
// about the feet, lifts it so the hips sit at knee height and moves it back so the hips stay over
// the spot; the legs go down and back to the knees, the arms straight down to the hands, the head
// is lifted to look ahead.

const QUARTER = Math.PI / 2;
export const CRAWL = {
  legBack: 0.84, // radians the legs turn back from straight down (the thigh's slope to the knee)
  armDown: QUARTER, // the arms turned to point at the floor
  headUp: 1.15, // radians the head is lifted to look ahead
  swing: 0.28, // radians each limb swings per step
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
  const { body, legs, arms, lower } = figure;
  // The walking pose never moves the body back or forth: this offset is the crawl's alone.
  body.position.z = 0;
  if (blend <= 0) return;
  const hipHeight = legs[0].position.y * lower.scale.y; // hips above the feet, in figure units
  const knee = Math.sin(CRAWL.legBack);
  body.rotation.x = mix(body.rotation.x, QUARTER, blend);
  body.position.y = mix(body.position.y, hipHeight * knee, blend);
  body.position.z = -hipHeight * blend;
  const swing = Math.sin(phase) * CRAWL.swing;
  legs.forEach((hip, i) => {
    hip.rotation.x = mix(hip.rotation.x, -CRAWL.legBack + (i === 0 ? swing : -swing), blend);
  });
  arms.forEach((shoulder, i) => {
    shoulder.rotation.x = mix(shoulder.rotation.x, -CRAWL.armDown + (i === 0 ? -swing : swing), blend);
    shoulder.rotation.z = mix(shoulder.rotation.z, 0, blend);
  });
}

/** After the head has turned to the viewer: lift it to look ahead, and keep the turn small. */
export function liftHead(figure, blend) {
  if (blend <= 0) return;
  figure.head.rotation.y *= 1 - blend * 0.6;
  figure.head.rotation.x -= blend * CRAWL.headUp;
}
