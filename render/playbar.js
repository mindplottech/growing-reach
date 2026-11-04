const MONTHS_PER_YEAR = 12;
const MS_PER_SECOND = 1000;

const iconUrl = (name) => new URL(`../assets/icons/${name}.svg`, import.meta.url).href;
const formatAge = (months) => `${Math.floor(months / MONTHS_PER_YEAR)}歳${months % MONTHS_PER_YEAR}か月`;

/**
 * The strip under the 3D view: two buttons for the scenes of the right-hand condition, play and
 * pause, how far the scene has gone, and who is playing. At the moment of the scene its sentence
 * is shown large over the 3D view for `flashSeconds` (real time) and the thing's tag stands out.
 */
export function mountPlaybar({ session, autoplay, getPlays, flashSeconds, getView }) {
  const touchesButton = document.querySelector('#watch-touches');
  const fallsButton = document.querySelector('#watch-falls');
  const playButton = document.querySelector('#scene-play');
  const progress = document.querySelector('#scene-progress');
  const fill = progress.querySelector('.scene-progress-fill');
  const info = document.querySelector('#scene-info');
  const flash = document.querySelector('#moment-flash');
  let shown = null;
  let flashed = false;
  let flashTimer = null;

  touchesButton.addEventListener('click', () => autoplay.useList('touches', getPlays()?.auto ?? []));
  fallsButton.addEventListener('click', () => autoplay.useList('falls', getPlays()?.falls ?? []));
  playButton.addEventListener('click', () => session.setPlaying(!session.isPlaying()));

  // Pressing anywhere but a number of the table, this strip, the tools or a dialog goes back to
  // the automatic order.
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-play], .playable-name, #playbar, #toolbar, .app-header, dialog')) return;
    autoplay.leave();
  });

  function showPlaying() {
    const playing = session.isPlaying();
    playButton.setAttribute('aria-label', playing ? '一時停止' : '再生');
    playButton.querySelector('.icon').style.setProperty('--icon', `url(${iconUrl(playing ? 'pause' : 'play')})`);
  }
  session.on('play', showPlaying);
  showPlaying();

  function showScene() {
    const scene = autoplay.current();
    const key = autoplay.key();
    touchesButton.setAttribute('aria-pressed', String(key === 'touches'));
    fallsButton.setAttribute('aria-pressed', String(key === 'falls'));
    fallsButton.disabled = (getPlays()?.falls.length ?? 0) === 0;
    touchesButton.disabled = (getPlays()?.auto.length ?? 0) === 0;
    if (!scene) {
      info.textContent = '危険な物に触れた子も、落ちた子もいませんでした';
      return;
    }
    const unit = scene.individual ? '回' : '人';
    const who = scene.count ? `${scene.position}${unit}目／${scene.count}${unit}` : '';
    const body = scene.height ? `・身長${Math.round(scene.height)}cm` : '';
    info.textContent = `${scene.heading}${who ? `：${who}` : ''}（${formatAge(scene.months)}${body}）`;
  }
  autoplay.onChange(showScene);

  function showLarge(text) {
    flash.textContent = text;
    flash.hidden = false;
    flash.classList.remove('moment-flash-in');
    void flash.offsetWidth;
    flash.classList.add('moment-flash-in');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flash.hidden = true;
    }, flashSeconds * MS_PER_SECOND);
  }

  function frame() {
    const scene = session.getScene();
    const simulation = session.getSimulation();
    if (scene !== shown) {
      shown = scene;
      flashed = false;
      flash.hidden = true;
    }
    if (scene) {
      const span = scene.end - scene.start;
      const share = span > 0 ? Math.min(Math.max((simulation.time - scene.start) / span, 0), 1) : 1;
      fill.style.width = `${share * 100}%`;
      progress.setAttribute('aria-valuenow', String(Math.round(share * 100)));
      if (!flashed && scene.moment !== null && simulation.time >= scene.moment) {
        flashed = true;
        showLarge(scene.text);
        if (scene.thing) getView()?.pulse(scene.thing, flashSeconds);
      }
    } else {
      fill.style.width = '0%';
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  showScene();
}
