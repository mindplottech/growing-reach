import { renderEvidence } from './evidence.js';
import { mountGuide } from './guide.js';
import { mountPanel } from './panel.js';
import { selectLayout } from './room.js';
import { createSession } from './session.js';

const LEDGER_URL = new URL('../data/values_ledger.json', import.meta.url);
const ROOM_URL = new URL('../data/room_layout.json', import.meta.url);
const SETTINGS_URL = new URL('../data/sim_settings.json', import.meta.url);
const ICON_URL = (name) => new URL(`../assets/icons/${name}.svg`, import.meta.url).href;

const errorBox = document.querySelector('#error');

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function setIcon(button, name) {
  button.querySelector('.icon').style.setProperty('--icon', `url(${ICON_URL(name)})`);
}

/** Wires the toolbar; returns the functions the 3D view calls back into. */
function mountToolbar({ session }) {
  const play = document.querySelector('#play');
  const label = play.querySelector('.tool-label');
  const showPlaying = () => {
    const playing = session.isPlaying();
    setIcon(play, playing ? 'pause' : 'play');
    label.textContent = playing ? '一時停止' : '再生';
    play.dataset.tip = playing ? '子どもを止めます' : '子どもを動かします';
  };
  play.addEventListener('click', () => session.setPlaying(!session.isPlaying()));
  session.on('play', showPlaying);
  showPlaying();
}

async function start() {
  const [ledger, roomFile, settings] = await Promise.all([
    fetchJson(LEDGER_URL),
    fetchJson(ROOM_URL),
    fetchJson(SETTINGS_URL),
  ]);
  const startRoom = selectLayout(roomFile, roomFile.layouts[0].id);
  const slider = document.querySelector('#months');
  const [minMonths, maxMonths] = ledger._meta.age_range_months;
  slider.min = minMonths;
  slider.max = maxMonths;
  slider.value = minMonths;
  const getChild = () => ({
    months: Number(slider.value),
    sex: document.querySelector('input[name="sex"]:checked').value,
  });

  const session = createSession({ ledger, settings, room: startRoom, getChild });
  mountToolbar({ session });
  const panel = mountPanel({ ledger, settings, session, getChild });

  renderEvidence(document.querySelector('#evidence-body'), { ledger, roomFile, settings });
  const evidence = document.querySelector('#evidence-dialog');
  document.querySelector('#open-evidence').addEventListener('click', () => evidence.showModal());
  mountGuide({ dialog: document.querySelector('#guide-dialog'), openButton: document.querySelector('#open-guide') });

  // The 3D view is display only: if it cannot load, the results still work.
  try {
    const { mountView3d } = await import('./view3d.js');
    const view = mountView3d({
      container: document.querySelector('#stage'),
      chip: document.querySelector('#delete-selected'),
      ledger,
      settings,
      session,
      slider,
      editing: {
        canMove: () => false,
        canRemove: () => false,
        tryMove: () => null,
        move: () => {},
        remove: () => {},
        useTool: () => {},
        onSelect: () => {},
      },
    });
    panel.attachView(view);
  } catch (error) {
    document.querySelector('#tool-hint').textContent = `3D表示を読み込めませんでした（${error.message}）`;
  }
}

start().catch((error) => {
  errorBox.hidden = false;
  errorBox.textContent = `データを読み込めませんでした（${error.message}）`;
});
