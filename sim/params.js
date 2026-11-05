// The one entrance to every value the simulation uses.
// Body values are not written here: they stay in data/values_ledger.json, which is external data
// with its own categories and sources, and are read from it. This file holds only the values the
// ledger does not have. All of them are provisional: chosen by the designer, with no source.
// The candidates and reasons were proposed by Claude Code and chosen by KO (see docs/dev-log.md).

const PROVISIONAL = 'provisional';

function provisional(label, value, reason, unit = '') {
  return { label, value, unit, reason, category: PROVISIONAL, source: null };
}

/** How the child behaves and how the runs are set up. */
const SETTINGS = {
  climb_probability: provisional('家具のそばに着いたとき登る確率', 0.5, '「やるか」側の値。半々を基準にした'),
  chain_probability: provisional('隣の足場へ乗り継ぐ確率', 0.3, '「やるか」側の値。登るより少なめにした'),
  foothold_stay_seconds: provisional('足場の上にいる時間', [3, 10], '台帳の立ち止まる時間（2〜7秒）と同じくらいにした', '秒'),
  after_fall_seconds: provisional('転んだあと止まっている時間', 10, '起き上がって次へ向かうまでの間として置いた', '秒'),
  step_length_cm: provisional('歩幅', 30, '台帳のつまずき率（1歩あたり）を、歩いた距離あたりに直すために使う', 'cm'),
  climb_seconds_base: provisional('登るのにかかる時間（段差によらない分）', 0.5, '手をかけて体を持ち上げ始めるまで。段差0でもかかる時間として置いた', '秒'),
  climb_seconds_per_cm: provisional('登るのにかかる時間（段差1cmあたり）', 0.02, '段差が高いほど長くかかる。登れる高さ60cmの段差で1.7秒になる', '秒'),
  climb_failure_k: provisional('登るときの失敗しやすさの係数 k', 0.1, '台帳の climb_failure の式にある k。台帳に値がない。登れる高さの6割の段差で失敗が約2%になる'),
  interest_default: provisional('物の興味の強さ（物ごとの選ばれやすさ）', 1.0, '根拠がないので、どの物にも差を付けない。物ごとに interest を持たせると上書きできる'),
  focus_outside_interest: provisional('部屋を選んだとき、ほかの部屋の物の選ばれやすさ（倍）', 0.05, '右の欄で部屋を選ぶと、あーちゃんはその部屋から動き出し、その部屋の物を主に回る。ほかの部屋へ行くこともゼロにはしない（KO 2026-11-05 の依頼。値は設計者の判断）', '倍'),
  play_seconds: provisional('触って遊ぶ時間', [5, 15], '台帳の眺める時間（2〜7秒）より長く、10分の中で何か所も回れる長さ', '秒'),
  play_probability: provisional('眺めたあと触って遊ぶ確率', 0.5, '「やるか」側の値。半々を基準にした。手が届く物だけで遊ぶ'),
  path_grid_cm: provisional('経路の格子の細かさ', 10, '20cmだと椅子とテーブルの隙間（15cm）を通れず、5cmだと100回の計算が重い', 'cm'),
  path_clearance_cm: provisional('経路で家具からあける間隔', 10, '子どもの体の半分ほど。格子1マスに合わせた', 'cm'),
  start_months: provisional('最初に表示する月齢', 15, '範囲の下限（1歳3か月）。まだ届かない所から始めて、月齢を上げると届くようになるのを見せるため。KO が決めた（2026-11-04、以前は48）', 'か月'),
  start_speed: provisional('再生の速さ（表示のみ）', 2, '表示のみ・計算に使わない。場面だけを見せるので、15秒の場面が7.5秒で見られる2倍に KO が固定した', '倍'),
  scene_before_seconds: provisional('場面を出来事の何秒前から見せるか（表示のみ）', 10, '表示のみ・計算に使わない。足場に登って届いた場面の約95%で、床から登り始めるところが入る長さとして KO が決めた（5秒では約85%）', '秒'),
  scene_after_seconds: provisional('場面を出来事の何秒後まで見せるか（表示のみ）', 5, '表示のみ・計算に使わない。届いた・落ちたあとの様子が分かる長さとして KO が決めた', '秒'),
  event_flash_seconds: provisional('届いた物の札を目立たせる長さ（表示のみ）', 2, '表示のみ・計算に使わない。再生の速さによらず目で追える長さとして KO が決めた（実時間）。出来事の文を大きく出すのはやめ、札だけに使う', '秒'),
  trial_seconds: provisional('試行時間（2分）', 120, '設計者の判断。1人分を最初から最後まで画面で見られる長さとして、KO が10分から2分に変えた', '秒'),
  trial_count: provisional('試行の回数', 100, 'シード1〜100の子どもで比べる'),
  countermeasure_step_cm: provisional('対策で物を動かす刻み', 10, '家具を動かす現実的な単位', 'cm'),
  noise_band: provisional('偶然の範囲とみなす回数の差', 10, '100回の二項ばらつきは50%付近で標準偏差約5。その2倍。表示の言葉だけに使い、数えた値は変えない'),
  countermeasure_limit_cm: provisional('対策で物を動かす上限', 200, '部屋の幅の半分ほど', 'cm'),
  gait_figure: provisional('歩き方と体つきの見た目（表示だけ）', {
    sway_rad: [[15, 0.14], [24, 0.08], [36, 0.03], [60, 0.02]],
    arm_guard: [[15, 1], [24, 0.2], [30, 0]],
    leg_swing_rad: [[15, 0.35], [36, 0.5], [60, 0.55]],
    head_share: [[15, 1.18], [36, 1.05], [60, 1.0]],
    belly_share: [[15, 1.15], [36, 1.08], [60, 1.0]],
    leg_share: [[15, 0.85], [36, 0.95], [60, 1.0]],
  }, '月齢ごとの点で、間は直線補間。1歳台はよちよち（左右に揺れ、腕を肩の高さに構える）、2歳で揺れが減り、3歳以降は腕を振って歩く。頭は大きめ・お腹は出て・脚は短めから、5歳の図形（1.0）へ。揺れ幅・腕の高さ・体の比率は実測がなく設計者の判断。歩幅・周期・足の開きは台帳 gait_display', '比'),
  idle_figure: provisional('止まっているときの小さな動き（表示だけ）', {
    blink_interval_s: [2, 5],
    blink_s: 0.13,
    breath_period_s: 2.7,
    breath_share: 0.03,
    head_tilt_rad: 0.07,
    head_tilt_period_s: 5,
    yawn_interval_s: [7, 16],
    yawn_s: 2.4,
    yawn_hazard_gap_s: 2,
    seed: 7,
  }, '表示のみ・計算に使わない。まばたきは2〜5秒ごとに0.13秒。止まっている間は呼吸でお腹が3%ふくらみ（周期2.7秒）、頭がゆっくり左右にかしぐ。止まった時間が続くと7〜16秒に1回、2.4秒のあくび（歩く・登る・降りる・落ちた直後と、危険な物に触れる前後2秒はしない）。タイミングは表示専用の乱数（seed）で、計算の乱数とは別', '秒'),
  display_seconds: provisional('動きの秒数（表示だけ）', {
    climb: 0.9,
    step_down: 0.4,
    backward_down: 0.9,
    jump_down: 0.4,
    fall: 0.25,
    fall_hold: 0.8,
    reach_gesture: 1.2,
  }, '画面の動きだけに使い、記録の時刻には使わない', '秒'),
  help_scene: provisional('助けを置いて見せる場面の寸法（表示だけ）', {
    stand_distance_cm: 20,
    step_width_cm: 40,
    step_depth_cm: 30,
  }, '表示のみ・計算に使わない。子どもが物の縁から立つ距離は、踏み台の奥行き30cmの半分に5cm足した。踏み台は市販の子ども用（幅40cm前後・奥行き30cm前後）に合わせた仮値で、高さは adjustments.js が月齢ごとに計算する', 'cm'),
};

/** Sizes and distances of the room that are not measurements. */
const ROOM = {
  neighbor_gap: provisional('「隣の足場」とみなす隙間', 20, '足場どうしの隙間がこの距離以内なら乗り継げる', 'cm'),
  window_side_gap: provisional('「窓ぎわ」とみなす隙間', 30, '窓や錠との隙間がこの距離以内なら窓ぎわ', 'cm'),
  cardboard_box: provisional('段ボール箱', { label: '段ボール箱', height: 30, w: 40, d: 30, approach_gap: 20 }, '子どもが持ち運べる大きさの箱として置いた。approach_gap は子どもが物のそばに立つ位置までの距離', 'cm'),
  wall_height: provisional('壁の高さ（表示だけ）', 240, '3D表示の壁の高さ', 'cm'),
  lock_display_size_cm: provisional('窓の錠を描く大きさ（表示だけ）', 8, '3D表示で錠が見える大きさ', 'cm'),
};

/** What "家具を置く" can add. Widths and depths are provisional; heights point to the ledger. */
const FURNITURE = provisional('置ける家具の幅と奥行き', [
  {
    kind: 'sofa',
    label: 'ソファ',
    icon: 'sofa',
    groupLabel: 'ソファ',
    parts: [
      { key: 'seat', label: 'ソファの座面', heightOf: ['furniture_heights', 'sofa_seat'], dx: 0, dy: 0, w: 180, d: 60 },
      { key: 'back', label: 'ソファの背もたれ', heightOf: ['furniture_heights', 'sofa_back'], dx: 0, dy: 60, w: 180, d: 20 },
    ],
  },
  { kind: 'bed', label: 'ベッド', icon: 'bed-single', parts: [{ label: 'ベッド', heightOf: ['furniture_heights', 'adult_bed_mattress'], w: 100, d: 200 }] },
  { kind: 'chair', label: '椅子', icon: 'armchair', parts: [{ label: '椅子', heightOf: ['furniture_heights', 'dining_chair_seat'], w: 40, d: 40 }] },
  { kind: 'table', label: 'テーブル', icon: 'utensils', parts: [{ label: 'テーブル', heightOf: ['furniture_heights', 'dining_table_top'], w: 140, d: 90 }] },
  { kind: 'shelf', label: '棚', icon: 'library', parts: [{ label: '棚', heightOf: ['furniture_heights', 'low_shelf_top'], w: 130, d: 35 }] },
  { kind: 'box', label: '段ボール箱', icon: 'package', parts: [{ box: true }] },
], 'よくある家具の大きさとして置いた。高さは values_ledger.json の項目を使う', 'cm');

const valuesOf = (entries) => Object.fromEntries(Object.entries(entries).map(([key, { value }]) => [key, value]));

/** Settings for createSimulation and the trials, as plain values. */
export const settings = valuesOf(SETTINGS);

/** The furniture that can be added. */
export const furnitureCatalog = FURNITURE.value;

/**
 * Room values in the shape the simulation reads: `{ value }` for single numbers, and the box as
 * its own object. Merged into every layout by selectLayout.
 */
export const roomParams = {
  neighbor_gap: { value: ROOM.neighbor_gap.value },
  window_side_gap: { value: ROOM.window_side_gap.value },
  cardboard_box: ROOM.cardboard_box.value,
  wall_height: { value: ROOM.wall_height.value },
  lock_display_size_cm: ROOM.lock_display_size_cm.value,
};

/** Every provisional value with its label, reason and category, for the "使っている値と根拠" table. */
export function provisionalRows() {
  return [
    ...Object.entries(SETTINGS),
    ...Object.entries(ROOM),
    ['furniture_catalog', FURNITURE],
  ].map(([key, entry]) => ({ key, ...entry }));
}

/** Every ledger item with its category label and source text, for the same table. */
export function ledgerRows(ledger) {
  const { categories, sources } = ledger._meta;
  return ledger.items.map((item) => ({
    key: item.id,
    label: item.label,
    unit: item.unit,
    category: item.category,
    categoryLabel: categories[item.category] ?? item.category,
    source: item.source ? sources[item.source] ?? item.source : null,
    item,
  }));
}
