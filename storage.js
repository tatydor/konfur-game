// Изолированный слой хранения и событий.
// Первая версия: пишет в localStorage и консоль, внешнего приёмника нет.
// Экраны знают только про этот интерфейс — позже он переключится на сервер
// без изменения экранов: track(event), saveContact(...), getCounter().

const PROGRESS_KEY = "konfur:progress"; // { screen, state }
const EVENTS_KEY = "konfur:events";     // журнал событий (заглушка вместо сервера)

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
  safeSet(PROGRESS_KEY, JSON.stringify(data));
}

export function clearProgress() {
  safeRemove(PROGRESS_KEY);
}

// ── События: минимальный набор, каждое с runId и без ничего личного ──
// В первой версии — консоль + локальный журнал. Позже — внешний приёмник.
export function track(event, payload = {}) {
  const record = { event, ts: Date.now(), ...payload };
  if (typeof console !== "undefined") console.debug("[track]", event, payload);
  const raw = safeGet(EVENTS_KEY);
  let list = [];
  try { list = raw ? JSON.parse(raw) : []; } catch { list = []; }
  list.push(record);
  safeSet(EVENTS_KEY, JSON.stringify(list));
}

// ── Контакт: добровольный, хранится отдельно от игрового прогресса ──
// Заглушка: имитирует отправку. Позже — реальный приёмник.
export function saveContact(contact, payload = {}) {
  track("contact_saved", payload);
  if (typeof console !== "undefined") console.debug("[contact]", contact);
  return Promise.resolve({ ok: true });
}

// ── Счётчик дошедших: скрыт, пока нет хранилища (возвращаем null) ──
export function getCounter() {
  return null;
}
