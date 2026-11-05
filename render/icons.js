// Display only: the pictures that let the panel be read at a glance. Each goal and each of KO's
// 遊び・生活 gets an emoji and a short name; the full words stay in the tooltip and
// 「根拠を見る」. Nothing here is computed with.

export const GOAL_ICONS = {
  seat: '🪑', cup: '🥛', books: '📚', toys: '🧸', switch: '💡', wash: '🚰', toothbrush: '🪥',
  towel: '🤲', sit: '🚽', flush: '💧', paper: '🧻', toilet_switch: '💡', step_up: '👣', shoes: '👟',
  hook: '🧥', help_cook: '🍳', own_cup: '🥤', crayons: '🖍️', clothes: '🧦', tidy: '📦', laundry: '🧺',
};

export const ROOM_ICONS = { all: '🏠', living: '🛋️', washroom: '🫧', toilet: '🚽', entrance: '👟', kitchen: '🍳' };

// KO's words → a picture and a short name. The first keyword found in the phrase wins.
const ACTIVITY_ICONS = [
  ['いないいないばあ', '🙈', 'いないいないばあ'],
  ['動くもの', '🔔', '動くもの・音'],
  ['手遊び', '👐', '手遊び'],
  ['うた', '🎵', 'うた遊び'],
  ['歌', '🎵', '歌'],
  ['ダンス', '💃', 'ダンス'],
  ['絵本', '📖', '絵本'],
  ['なぐり書き', '🖍️', 'なぐり書き'],
  ['さわる', '🤲', 'さわる遊び'],
  ['真似して書く', '⭕', 'まねして書く'],
  ['お絵かき', '🎨', 'お絵かき'],
  ['しりとり', '💬', 'しりとり'],
  ['ジェスチャー', '🤸', 'ジェスチャー'],
  ['感覚遊び', '🫧', '感覚遊び'],
  ['鬼ごっこ', '🏃', '鬼ごっこ'],
  ['友だち', '👫', '友だちと'],
  ['片付けるというルール', '📦', '片付けのルール'],
  ['ルール', '🎲', 'ルールのある遊び'],
  ['トイレの処理', '🧻', 'トイレの始末'],
  ['トイレに行きたい', '🗣️', 'トイレと言える'],
  ['トイレ', '🚽', 'トイレ'],
  ['片付け', '📦', '片付け'],
  ['靴下', '🧦', '靴下'],
  ['指示', '👂', '話を聞く'],
  ['加えて', '➕', 'これまでの遊びも'],
  ['着たり脱いだり', '👕', '服の着脱（手伝い）'],
  ['着脱', '👕', '服の着脱'],
  ['準備', '🎒', '自分で準備'],
  ['履こうとする', '👖', '履こうとする・脱ぐ'],
  ['脱', '👕', '服を脱ぐ'],
  ['履', '👖', '服を履く'],
];

/** A picture and a short name for one of KO's phrases; the phrase itself when nothing matches. */
export function activityIcon(phrase) {
  const found = ACTIVITY_ICONS.find(([keyword]) => phrase.includes(keyword));
  return found ? { icon: found[1], short: found[2] } : { icon: '•', short: phrase };
}
