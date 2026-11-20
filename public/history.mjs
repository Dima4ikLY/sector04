import {maps} from './maps.mjs';

const mapNames = new Map(maps.map(({id, name}) => [id, name]));
const modeLabels = new Map([
  ['train', 'С ботами'], ['online', 'Онлайн'],
  ['1v1', 'Дуэль 1 × 1'], ['2v2', 'Командный 2 × 2'], ['3v3', 'Командный 3 × 3']
]);
const historyLimit = 20;
const storagePrefix = 'sector-match-history:';
const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
});
const numberFormat = new Intl.NumberFormat('ru-RU');

function normalizeLogin(value) {
  if (typeof value !== 'string') return '';
  const login = value.trim().normalize('NFKC').toLowerCase();
  return login.length <= 80 ? login : '';
}

function validateEntry(value) {
  if (!value || typeof value !== 'object') return null;
  const {id, mapId, mode, playedAt, place, total, kills, deaths, damage, rating, coins} = value;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return null;
  if (!mapNames.has(mapId) || !modeLabels.has(mode)) return null;
  if (![playedAt, place, total, kills, deaths, damage, rating, coins].every(n => Number.isSafeInteger(n) && n >= 0)) return null;
  const capacity = mode === '1v1' ? 2 : mode === '2v2' ? 4 : 6;
  if (playedAt > 8_640_000_000_000_000 || place < 1 || place > total || total > capacity) return null;
  if (mode === '1v1' && total !== capacity) return null;
  return {id, mapId, mode, playedAt, place, total, kills, deaths, damage, rating, coins};
}

function recent(entries) {
  const seen = new Set();
  return entries
    .toSorted((a, b) => b.playedAt - a.playedAt)
    .filter(entry => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .slice(0, historyLimit);
}

function browserStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function createHistoryStore(storage = browserStorage()) {
  const unsaved = new Map();

  function load(login) {
    let raw;
    try {
      if (!storage) return {entries: [], warning: 'unavailable'};
      raw = storage.getItem(storagePrefix + login);
    } catch {
      return {entries: [], warning: 'unavailable'};
    }
    if (raw === null) return {entries: [], warning: ''};

    try {
      const records = JSON.parse(raw);
      if (!Array.isArray(records)) return {entries: [], warning: 'invalid'};
      const validated = records.map(validateEntry);
      return {
        entries: recent(validated.filter(Boolean)),
        warning: validated.some(entry => !entry) ? 'invalid' : ''
      };
    } catch {
      return {entries: [], warning: 'invalid'};
    }
  }

  function read(value) {
    const login = normalizeLogin(value);
    if (!login) return {entries: [], warning: ''};
    const saved = load(login);
    const pending = unsaved.get(login) || [];
    if (!pending.length) return saved;
    return {entries: recent([...pending, ...saved.entries]), warning: 'unsaved'};
  }

  function record(value, candidate) {
    const login = normalizeLogin(value);
    const entry = validateEntry(candidate);
    if (!login || !entry) return false;
    const saved = load(login);
    const previous = [...(unsaved.get(login) || []), ...saved.entries];
    if (previous.some(row => row.id === entry.id)) return false;

    const entries = recent([entry, ...previous]);
    if (saved.warning !== 'unavailable') {
      try {
        storage.setItem(storagePrefix + login, JSON.stringify(entries));
        unsaved.delete(login);
        return true;
      } catch {
        // Keep the new result visible when browser storage is full or disabled.
      }
    }
    unsaved.set(login, entries);
    return true;
  }

  return {read, record};
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function historyRow(entry) {
  const row = element('li', 'history-row');
  const heading = element('div', 'history-row-heading');
  const title = element('div');
  const date = element('time', 'history-date', dateFormat.format(entry.playedAt));
  date.dateTime = new Date(entry.playedAt).toISOString();
  title.append(element('h3', '', mapNames.get(entry.mapId)),
    element('span', 'history-mode', modeLabels.get(entry.mode)));
  heading.append(title, date);

  const stats = element('dl', 'history-stats');
  const values = [
    ['Место', `${entry.place} из ${entry.total}`],
    ['Фраги / смерти', `${entry.kills} / ${entry.deaths}`],
    ['Урон', numberFormat.format(entry.damage)],
    ['Рейтинг', `+${numberFormat.format(entry.rating)} RP`],
    ['Кредиты', `+${numberFormat.format(entry.coins)} CR`]
  ];
  for (const [name, value] of values) {
    const stat = element('div');
    stat.append(element('dt', '', name), element('dd', '', value));
    stats.append(stat);
  }
  row.append(heading, stats);
  return row;
}

const warningText = {
  unavailable: 'Хранилище браузера недоступно.',
  invalid: 'Не удалось прочитать часть истории.',
  unsaved: 'Браузер не сохранил последние записи. Они доступны до перезагрузки страницы.'
};

export function createMatchHistory({mount}) {
  const store = createHistoryStore();
  const button = element('button', 'text-btn history-open', 'История боёв');
  const dialog = element('dialog', 'history-dialog');
  const header = element('header', 'history-header');
  const heading = element('h2', '', 'История боёв');
  const close = element('button', 'icon-btn history-close', '×');
  const body = element('div', 'history-body');
  const hint = element('p', 'history-hint', 'Последние 20 завершённых боёв этого профиля в браузере.');
  const notice = element('p', 'history-notice');
  const list = element('ol', 'history-list');
  let login = '';

  button.type = close.type = 'button';
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('data-open-history', '');
  dialog.id = 'matchHistoryDialog';
  heading.id = 'matchHistoryTitle';
  button.setAttribute('aria-controls', dialog.id);
  dialog.setAttribute('aria-labelledby', heading.id);
  close.setAttribute('aria-label', 'Закрыть историю боёв');
  notice.setAttribute('role', 'status');
  list.setAttribute('aria-label', 'Завершённые бои');
  header.append(heading, close);
  body.append(hint, notice, list);
  dialog.append(header, body);
  mount.append(button);
  document.body.append(dialog);

  function render() {
    const {entries, warning} = store.read(login);
    list.replaceChildren(...entries.map(historyRow));
    list.hidden = entries.length === 0;
    notice.textContent = warningText[warning] || (entries.length
      ? ''
      : login ? 'Заверши матч, чтобы здесь появилась первая запись.' : 'Войди в профиль, чтобы увидеть историю.');
    notice.hidden = !notice.textContent;
  }

  button.addEventListener('click', () => {
    render();
    if (!dialog.open) dialog.showModal();
  });
  close.addEventListener('click', () => dialog.close());

  return {
    setProfile(value) {
      const next = normalizeLogin(value);
      if (login === next) return;
      login = next;
      if (dialog.open) render();
    },
    record(entry) {
      const recorded = store.record(login, entry);
      if (recorded && dialog.open) render();
      return recorded;
    }
  };
}
