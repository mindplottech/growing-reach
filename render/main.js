import { SEX_ANY, individualFromMeasurements } from '../sim/body.js';
import {
  addFurniture, canRemove, createHistory, isWindowPart, moveObject, moveWindow, placeChild, removeObject,
} from '../sim/editor.js';
import { renderEvidence } from './evidence.js';
import { mountGuide } from './guide.js';
import { mountEventLog } from './eventLog.js';
import { mountPanel } from './panel.js';
import { mountPlaybar } from './playbar.js';
import { furnitureCatalog, settings } from '../sim/params.js';
import { selectLayout } from '../sim/room.js';
import { createAutoplay } from './autoplay.js';
import { createSession } from './session.js';

const LEDGER_URL = new URL('../data/values_ledger.json', import.meta.url);
const ROOM_URL = new URL('../data/room_layout.json', import.meta.url);
const iconUrl = (name) => new URL(`../assets/icons/${name}.svg`, import.meta.url).href;
const MESSAGE_MS = 2500;

const HINTS = {
  select: '家具はドラッグで動かせます。クリックで選んで Delete で取り除けます。右ドラッグで向きを変え、ホイールで拡大します。',
  child: '床をクリックすると、そこに子どもを置きます。Esc でやめます。',
  furniture: '床をクリックすると、そこに置きます。Esc でやめます。',
  window: '奥の壁か床をクリックすると、そこへ窓を動かします。Esc でやめます。',
};

const errorBox = document.querySelector('#error');

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function setIcon(button, name) {
  button.querySelector('.icon').style.setProperty('--icon', `url(${iconUrl(name)})`);
}

function messenger() {
  const box = document.querySelector('#canvas-message');
  let timer = null;
  return (text) => {
    box.textContent = text;
    box.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      box.hidden = true;
    }, MESSAGE_MS);
  };
}

/** The toolbar and every edit. Each edit is one step in the history, so it can be undone. */
function mountEditing({ session, history, startRoom, catalog, say, results }) {
  const hint = document.querySelector('#tool-hint');
  const toolButtons = [...document.querySelectorAll('.tool[data-tool]')];
  const furnitureButton = document.querySelector('[data-tool="furniture"]');
  const menu = document.querySelector('#furniture-menu');
  const undoButton = document.querySelector('#undo');
  const play = document.querySelector('#play');
  const helpButton = document.querySelector('#show-hint');
  let tool = { type: 'select' };
  let helpOpen = false;

  // The hint shows when asked for with ？, and while a placing tool waits for a click.
  function showHint() {
    hint.hidden = !(helpOpen || tool.type !== 'select');
    helpButton.setAttribute('aria-pressed', String(helpOpen));
  }
  helpButton.addEventListener('click', () => {
    helpOpen = !helpOpen;
    showHint();
  });
  let view = null;

  // A change by hand waits for 「試し直す」; undo and reset run the hundred children again at once.
  function apply(next, failure, { judgeNow = false } = {}) {
    if (!next) {
      say(failure);
      return false;
    }
    history.push(next);
    undoButton.disabled = !history.canUndo();
    session.setRoom(next);
    if (judgeNow) results.judge(judgeNow);
    else results.markChanged();
    return true;
  }

  function setTool(next) {
    tool = next;
    for (const button of toolButtons) button.setAttribute('aria-pressed', String(button.dataset.tool === next.type));
    for (const item of menu.querySelectorAll('.menu-item')) {
      item.setAttribute('aria-checked', String(next.type === 'furniture' && item.dataset.kind === next.kind));
    }
    hint.textContent = HINTS[next.type];
    showHint();
    view?.setTool(next);
  }

  function closeMenu() {
    menu.hidden = true;
    furnitureButton.setAttribute('aria-expanded', 'false');
  }

  menu.replaceChildren(...catalog.map(({ kind, label, icon }) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'menu-item';
    item.setAttribute('role', 'menuitemradio');
    item.dataset.kind = kind;
    const glyph = document.createElement('span');
    glyph.className = 'icon';
    glyph.style.setProperty('--icon', `url(${iconUrl(icon)})`);
    item.append(glyph, label);
    item.addEventListener('click', () => {
      closeMenu();
      setTool({ type: 'furniture', kind });
    });
    return item;
  }));

  for (const button of toolButtons) {
    button.addEventListener('click', () => {
      if (button === furnitureButton) {
        const open = menu.hidden;
        menu.hidden = !open;
        furnitureButton.setAttribute('aria-expanded', String(open));
        return;
      }
      closeMenu();
      setTool(tool.type === button.dataset.tool ? { type: 'select' } : { type: button.dataset.tool });
    });
  }
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
      setTool({ type: 'select' });
    }
  });
  // 「その他」 holds the tools that are used less: placing the child, the window, undo and the trail.
  const moreButton = document.querySelector('#more-tools');
  const moreMenu = document.querySelector('#more-menu');
  const closeMore = () => {
    moreMenu.hidden = true;
    moreButton.setAttribute('aria-expanded', 'false');
  };
  moreButton.addEventListener('click', () => {
    const open = moreMenu.hidden;
    moreMenu.hidden = !open;
    moreButton.setAttribute('aria-expanded', String(open));
    closeMenu();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.tool-group')) {
      closeMenu();
      closeMore();
    }
  });

  const showPlaying = () => {
    const playing = session.isPlaying();
    setIcon(play, playing ? 'pause' : 'play');
    play.querySelector('.tool-label').textContent = playing ? '一時停止' : '再生';
    play.dataset.tip = playing ? '子どもを止めます' : '子どもを動かします';
  };
  play.addEventListener('click', () => session.setPlaying(!session.isPlaying()));
  session.on('play', showPlaying);
  showPlaying();

  document.querySelector('#reset').addEventListener('click', () => {
    apply(startRoom, null, { judgeNow: 'reset' });
    view?.select(null);
    say('最初の部屋に戻しました');
  });
  undoButton.addEventListener('click', () => {
    session.setRoom(history.undo());
    undoButton.disabled = !history.canUndo();
    results.judge('undo');
    view?.select(null);
  });

  const editing = {
    canMove: () => true,
    canRemove: (id) => canRemove(session.getRoom(), id),
    tryMove: (id, point) => moveObject(session.getRoom(), id, point),
    move: (id, point) => apply(moveObject(session.getRoom(), id, point), 'ほかの物と重なる場所には動かせません'),
    remove(id) {
      if (apply(removeObject(session.getRoom(), id), '窓は取り除けません')) view?.select(null);
    },
    useTool(used, point) {
      const room = session.getRoom();
      if (used.type === 'child') {
        if (apply(placeChild(room, point), '家具の上には置けません。床をクリックしてください')) setTool({ type: 'select' });
      } else if (used.type === 'furniture') {
        const item = catalog.find(({ kind }) => kind === used.kind);
        if (apply(addFurniture(room, item, point), 'ほかの物と重なる場所には置けません')) setTool({ type: 'select' });
      } else if (used.type === 'window') {
        apply(moveWindow(room, point));
        setTool({ type: 'select' });
      }
    },
    missed(used) {
      say(used.type === 'window' ? '奥の壁か床をクリックしてください' : '床をクリックしてください');
    },
    onSelect(id) {
      const object = id && session.getRoom().landmarks.find((landmark) => landmark.id === id);
      if (!object) return;
      hint.textContent = isWindowPart(object)
        ? '窓はドラッグで壁に沿って動かせます'
        : `${object.groupLabel ?? object.label}：ドラッグで動かす／Delete か × で取り除く`;
    },
  };

  setTool({ type: 'select' });
  return {
    editing,
    attachView(next) {
      view = next;
      view.setTool(tool);
    },
  };
}

async function start() {
  const [ledger, roomFile] = await Promise.all([fetchJson(LEDGER_URL), fetchJson(ROOM_URL)]);
  const startRoom = selectLayout(roomFile, roomFile.layouts[0].id);
  const slider = document.querySelector('#months');
  const [minMonths, maxMonths] = ledger._meta.age_range_months;
  slider.min = minMonths;
  slider.max = maxMonths;
  slider.value = settings.start_months;
  // The child in general (no sex, median body) unless 「うちの子に合わせる」 is open; then the sex
  // chosen there and the z worked out from the measurements typed there. Nothing is stored or sent.
  const myChild = document.querySelector('#my-child');
  const measurement = (id) => {
    const value = Number.parseFloat(document.querySelector(id).value);
    return Number.isFinite(value) ? value : null;
  };
  // The measurements belong to the age the slider showed when they were typed; the slider then
  // moves the same child (same z) to other ages.
  const measuredAge = document.querySelector('#my-child-age');
  let measuredMonths = null;
  const showMeasuredAge = () => {
    const shown = measuredMonths ?? Number(slider.value);
    measuredAge.textContent = `${Math.floor(shown / 12)}歳${shown % 12}か月`;
  };
  document.querySelector('#child-height').addEventListener('input', () => {
    measuredMonths = Number(slider.value);
    showMeasuredAge();
  });
  slider.addEventListener('input', () => { if (measuredMonths === null) showMeasuredAge(); });
  showMeasuredAge();
  const getChild = () => {
    const months = Number(slider.value);
    if (!myChild.open) return { months, sex: SEX_ANY, individual: null, measurements: null, measuredMonths: null };
    const sex = document.querySelector('input[name="sex"]:checked')?.value ?? SEX_ANY;
    // Only the height is asked; the climb height is estimated from it by the ledger's formula.
    const measurements = { heightCm: measurement('#child-height'), climbCm: null };
    const given = measurements.heightCm !== null;
    const at = measuredMonths ?? months;
    const { z, notes } = given ? individualFromMeasurements(ledger, { months: at, sex, ...measurements }) : { z: null, notes: [] };
    return { months, sex, individual: z, measurements: { ...measurements, notes }, measuredMonths: given ? at : null };
  };

  const session = createSession({ ledger, settings, room: startRoom, getChild, startSpeed: settings.start_speed });
  const autoplay = createAutoplay({ session });
  const history = createHistory(startRoom);
  // The panel is mounted after the toolbar, so the toolbar reaches it through this.
  const results = { judge: (kind) => panel.judge(kind), markChanged: () => panel.markChanged() };
  const toolbar = mountEditing({
    session, history, startRoom, catalog: furnitureCatalog, say: messenger(), results,
  });
  const panel = mountPanel({ ledger, settings, session, getChild, autoplay });
  // The 3D view loads later; until then a moment is only shown in words.
  let view = null;
  mountEventLog({ list: document.querySelector('#event-log'), session });
  mountPlaybar({
    session, autoplay, getPlays: () => panel.plays(), flashSeconds: settings.event_flash_seconds, getView: () => view,
  });
  // The hundred children are run at once, and the first child starts moving without a click.
  panel.judge();

  renderEvidence(document.querySelector('#evidence-body'), { ledger, roomFile });
  const evidence = document.querySelector('#evidence-dialog');
  document.querySelector('#open-evidence').addEventListener('click', () => evidence.showModal());
  mountGuide({ dialog: document.querySelector('#guide-dialog'), openButton: document.querySelector('#open-guide') });

  // The 3D view is display only: if it cannot load, the results still work.
  try {
    const { mountView3d } = await import('./view3d.js');
    view = mountView3d({
      container: document.querySelector('#stage'),
      chip: document.querySelector('#delete-selected'),
      ledger,
      settings,
      session,
      slider,
      editing: toolbar.editing,
      trailToggle: document.querySelector('#show-trail'),
      followButton: document.querySelector('#follow-child'),
    });
    toolbar.attachView(view);
    panel.attachView(view);
  } catch (error) {
    const hint = document.querySelector('#tool-hint');
    hint.textContent = `3D表示を読み込めませんでした（${error.message}）`;
    hint.hidden = false;
  }
}

start().catch((error) => {
  errorBox.hidden = false;
  errorBox.textContent = `データを読み込めませんでした（${error.message}）`;
});
