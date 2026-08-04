// Изолированный слой хранения и событий.
// Первая версия: пишет в localStorage и консоль, внешнего приёмника нет.
// Экраны знают только про этот интерфейс — позже он переключится на сервер
// без изменения экранов: track(event), saveContact(...), getCounter().

const PROGRESS_KEY = "konfur:progress"; // { screen, state }
const EVENTS_KEY = "konfur:events";     // журнал событий (заглушка вместо сервера)
const CONTACTS_KEY = "konfur:contacts"; // контакты и свободные тексты — отдельно от аналитики

// Общие параметры событий задаёт app.js через configure(): версия игры и
// провайдер контекста (анонимный sessionId, задача, шаг, время сессии и шага).
let cfg = { version: "0", context: () => ({}) };
export function configure(next) { cfg = { ...cfg, ...next }; }

// Тип устройства и размер окна в обобщённом виде.
function deviceInfo() {
  if (typeof window === "undefined") return {};
  const w = window.innerWidth || 0, h = window.innerHeight || 0;
  return { device: w < 640 ? "mobile" : "desktop", w, h };
}

// localStorage может бросать (приватный режим, отключённые куки) — не роняем игру.
function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
function safeRemove(key) {
  try { localStorage.removeItem(key); } catch { /* игнорируем */ }
}

// ── Прогресс: перенос состояния между сессиями, восстановление после обрыва ──
export function loadProgress() {
  const raw = safeGet(PROGRESS_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data && data.screen && data.state) return data;
  } catch { /* повреждённые данные — считаем, что прогресса нет */ }
  return null;
}

export function saveProgress(data) {
  return safeSet(PROGRESS_KEY, JSON.stringify(data));
}

export function clearProgress() {
  safeRemove(PROGRESS_KEY);
}

// ── События: каждое несёт общие параметры и не содержит ничего личного ──
// В первой версии — консоль + локальный журнал. Позже — внешний приёмник.
// Ошибка записи события не роняет игру и не блокирует прохождение.
export function track(event, params = {}) {
  let common = {};
  try { common = cfg.context() || {}; } catch { common = {}; }
  const record = { event, ts: Date.now(), version: cfg.version, ...common, ...deviceInfo(), ...params };
  try { if (typeof console !== "undefined") console.debug("[track]", event, record); } catch { /* ничего */ }
  try {
    const raw = safeGet(EVENTS_KEY);
    let list = [];
    try { list = raw ? JSON.parse(raw) : []; } catch { list = []; }
    list.push(record);
    safeSet(EVENTS_KEY, JSON.stringify(list));
  } catch { /* журнал недоступен — молча пропускаем, прохождение не трогаем */ }
}

// ── Контакт и свободный текст задачи: хранятся отдельно от анонимной аналитики.
// В общую аналитику уходит только признак успеха, без самого контакта.
export function saveContact(contact, meta = {}) {
  try {
    const raw = safeGet(CONTACTS_KEY);
    let list = [];
    try { list = raw ? JSON.parse(raw) : []; } catch { list = []; }
    list.push({ ts: Date.now(), contact, ...meta });
    const ok = safeSet(CONTACTS_KEY, JSON.stringify(list));
    track("contact_submitted", { ok });
    return ok ? Promise.resolve({ ok: true }) : Promise.reject(new Error("storage unavailable"));
  } catch (e) {
    track("contact_submitted", { ok: false });
    return Promise.reject(e);
  }
}

// ── Счётчик дошедших: скрыт, пока нет хранилища (возвращаем null) ──
export function getCounter() {
  return null;
}
