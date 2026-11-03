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
