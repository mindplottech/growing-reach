export const EVENT = {
  CLIMBED: 'climbed',
  DESCENDED: 'descended',
  FELL: 'fell',
  TRIPPED: 'tripped',
  TOUCHED_HIGH: 'touched_high',
  STOOD_AT_WINDOW: 'stood_at_window',
  REACHED_LOCK: 'reached_lock',
  TOUCHED_HAZARD: 'touched_hazard',
};

export const EVENT_LABELS = {
  [EVENT.CLIMBED]: '登った',
  [EVENT.DESCENDED]: '降りた',
  [EVENT.FELL]: '落ちた',
  [EVENT.TRIPPED]: '転んだ',
  [EVENT.TOUCHED_HIGH]: '高い所の物に触った',
  [EVENT.STOOD_AT_WINDOW]: '窓台に立った',
  [EVENT.REACHED_LOCK]: '窓の錠に届いた',
  [EVENT.TOUCHED_HAZARD]: '危険な物に届いた',
};

const DESCENT_WORDS = { step_down: '一歩で降りた', backward: '後ろ向きで降りた', climb_down: '跳び降りた' };
const cm = (value) => `${Math.round(value)}cm`;
const via = (chain) => chain.map(({ label, height }) => `${label}（${cm(height)}）`).join('→');
const reachedFrom = ({ chain, level }) => {
  const how = level === 'tiptoe' ? '背伸びで' : '';
  return chain.length > 0 ? `${via(chain)}から${how}` : `床から${how}`;
};

/** One event in a fixed sentence, made only from what the record holds. */
export function describeEvent(event) {
  switch (event.kind) {
    case EVENT.CLIMBED: return `${event.footholdLabel}（${cm(event.height)}）に登った`;
    case EVENT.DESCENDED: return `${event.footholdLabel}（${cm(event.fromHeight)}）から${DESCENT_WORDS[event.mode]}`;
    case EVENT.FELL:
      return event.reason === 'climb_failure'
        ? `${event.footholdLabel}に登る途中で落ちた（${event.startHeight === 0 ? '床' : cm(event.startHeight)}から）`
        : `${event.footholdLabel}（${cm(event.fromHeight)}）から落ちた`;
    case EVENT.TRIPPED: return '床で転んだ';
    case EVENT.TOUCHED_HIGH: return `${event.targetLabel}に手が届いた（${reachedFrom(event)}）`;
    case EVENT.STOOD_AT_WINDOW: return `窓台に立った（${via(event.chain)}）`;
    case EVENT.REACHED_LOCK: return `窓の錠に手が届いた（${reachedFrom(event)}）`;
    case EVENT.TOUCHED_HAZARD: return `${event.hazardLabel}に手が届いた（${reachedFrom(event)}）`;
    default: return EVENT_LABELS[event.kind] ?? event.kind;
  }
}

/** Seconds since the start as m:ss. */
export function formatClock(seconds) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
