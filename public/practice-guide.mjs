const WALK_DISTANCE = 70;
const steps = ['walk', 'jump', 'hit', 'throw'];

function frameOf(player, roundTime) {
  if (!player || typeof player.id !== 'string') return null;
  return {
    id: player.id,
    deaths: player.deaths,
    alive: player.dead <= 0 && player.hp > 0,
    x: player.x,
    gaitDistance: player.gaitDistance,
    jumps: player.jumps,
    vy: player.vy,
    jetActive: !!player.jetActive,
    damage: player.damageDealt,
    grenadeCool: player.grenadeCool,
    roundTime
  };
}

function onGround(frame) {
  return frame.jumps === 0 && !frame.jetActive && Math.abs(frame.vy) < 35;
}

// Keep the previous authoritative frame even when the guide is closed. Starting
// again uses the player's current match state as a baseline.
export class PracticeProgress {
  constructor() { this.reset(); }

  reset() {
    this.previous = null;
    this.ended = false;
    this.stop();
  }

  stop() {
    this.state = 'idle';
    this.index = 0;
    this.completed = 0;
    this.walked = 0;
  }

  start() {
    if (this.ended) return;
    this.stop();
    this.state = 'active';
  }

  advance(completed) {
    if (this.state !== 'active') return;
    if (completed) this.completed++;
    this.index++;
    if (this.index === steps.length) this.state = 'finished';
  }

  update(player, { roundTime, ended = false } = {}) {
    if (ended) this.ended = true;
    if (this.ended) return;
    const now = frameOf(player, roundTime);
    if (!now) return;
    const before = this.previous;
    if (before && before.id === now.id && Number.isFinite(before.roundTime) &&
        Number.isFinite(now.roundTime) && now.roundTime >= before.roundTime) return;

    this.previous = now;
    if (!before || this.state !== 'active' || !before.alive || !now.alive ||
        before.id !== now.id || before.deaths !== now.deaths) return;

    switch (steps[this.index]) {
      case 'walk': {
        if (!onGround(before) || !onGround(now)) return;
        const dx = now.x - before.x;
        const gait = now.gaitDistance - before.gaitDistance;
        // A warp or a reset must not count as walking.
        if (!Number.isFinite(dx) || !Number.isFinite(gait) || Math.abs(dx - gait) > 0.5) return;
        this.walked += Math.abs(dx);
        if (this.walked >= WALK_DISTANCE) this.advance(true);
        break;
      }
      case 'jump':
        if (before.jumps === 0 && now.jumps > 0 && now.vy < 0 && !now.jetActive) this.advance(true);
        break;
      case 'hit':
        if (now.damage > before.damage) this.advance(true);
        break;
      case 'throw':
        if (now.grenadeCool > Math.max(0, before.grenadeCool) + 0.1) this.advance(true);
        break;
    }
  }
}

function instruction(step, controls, isTouch) {
  const { left = 'A', right = 'D', jump = 'W', grenade = 'Q' } = controls;
  switch (step) {
    case 'walk':
      return ['Пройдись по арене', isTouch ? 'Удерживай одну из стрелок движения.' : `Удерживай ${left} или ${right}, чтобы пройти немного в любую сторону.`];
    case 'jump':
      return ['Подпрыгни', isTouch ? 'Нажми ↑, стоя на платформе или полу.' : `Нажми ${jump}, стоя на платформе или полу.`];
    case 'hit':
      return ['Попади в мишень', isTouch
        ? 'Нажми ◎ для выстрела по ближайшей мишени. Если мешает платформа, спустись на пол.'
        : 'Прицелься в мишень и нажми левую кнопку мыши. Стреляй с пола, если мешает платформа.'];
    case 'throw':
      return ['Брось гранату', isTouch ? 'Удерживай экранную кнопку гранаты для прицеливания, затем отпусти.' : `Удерживай ${grenade}, чтобы увидеть траекторию, затем отпусти для броска.`];
  }
}

function element(tag, className, label) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (label !== undefined) node.textContent = label;
  return node;
}

function button(label, className) {
  const node = element('button', className, label);
  node.type = 'button';
  return node;
}

export function createPracticeGuide({ mount, getControls = () => ({}) }) {
  const progress = new PracticeProgress();
  let isTouch = false;
  const start = button('Освоить управление', 'secondary practice-guide-start');
  const panel = element('section', 'practice-guide-panel');
  panel.setAttribute('aria-label', 'Подсказки стрельбища');
  const counter = element('p', 'practice-guide-counter');
  const track = element('progress', 'practice-guide-track');
  track.max = steps.length;
  track.setAttribute('aria-hidden', 'true');
  const current = element('div', 'practice-guide-current');
  current.setAttribute('role', 'status');
  current.setAttribute('aria-atomic', 'true');
  const title = element('strong', 'practice-guide-title');
  const hint = element('p', 'practice-guide-hint');
  current.append(title, hint);
  const actions = element('div', 'practice-guide-actions');
  const next = button('Пропустить шаг', 'text-btn');
  const hide = button('Скрыть подсказки', 'text-btn');
  actions.append(next, hide);
  panel.append(counter, track, current, actions);
  mount.replaceChildren(start, panel);

  function render() {
    const { state, index, completed, ended } = progress;
    const panelShown = state !== 'idle';
    const hideStart = state === 'active' || ended;
    const startLabel = state === 'finished' ? 'Начать заново' : 'Освоить управление';
    if (start.hidden !== hideStart) start.hidden = hideStart;
    if (start.textContent !== startLabel) start.textContent = startLabel;
    if (panel.hidden === panelShown) panel.hidden = !panelShown;
    if (!panelShown) return;

    if (track.value !== index) track.value = index;
    const hideNext = state !== 'active' || ended;
    if (next.hidden !== hideNext) next.hidden = hideNext;
    let heading, description;
    if (state === 'finished') {
      heading = completed === steps.length ? 'Все шаги пройдены' : 'Подсказки закончились';
      description = ended ? 'Начни новое занятие, чтобы снова пройти подсказки.' : 'Теперь можешь продолжить в своём темпе.';
    } else if (ended) {
      heading = 'Занятие завершено';
      description = 'Начни новое занятие, чтобы снова пройти подсказки.';
    } else {
      [heading, description] = instruction(steps[index], getControls() ?? {}, isTouch);
    }
    const status = state === 'active' && !ended ? `Шаг ${index + 1} из ${steps.length}` : `Пройдено: ${completed} из ${steps.length}`;
    if (counter.textContent !== status) counter.textContent = status;
    if (title.textContent !== heading) title.textContent = heading;
    if (hint.textContent !== description) hint.textContent = description;
  }

  start.addEventListener('click', () => { progress.start(); render(); });
  next.addEventListener('click', () => { progress.advance(false); render(); });
  hide.addEventListener('click', () => {
    progress.stop();
    render();
    if (!start.hidden) start.focus({ preventScroll: true });
  });
  render();
  return {
    update(player, options = {}) {
      isTouch = !!options.isTouch;
      progress.update(player, options);
      render();
    },
    reset() { progress.reset(); render(); }
  };
}
