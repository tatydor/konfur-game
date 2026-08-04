// Изолированный слой хранения и событий.
// Первая версия: пишет в localStorage и консоль, внешнего приёмника нет.
// Экраны знают только про этот интерфейс — позже он переключится на сервер
// без изменения экранов: track(event), saveContact(...), getCounter().

const PROGRESS_KEY = "konfur:progress"; // { screen, state }
const EVENTS_KEY = "konfur:events";     // локальный журнал (когда внешнего приёмника нет)
const QUEUE_KEY = "konfur:queue";       // неотправленные события — ждут связи
const CONTACTS_KEY = "konfur:contacts"; // контакты и свободные тексты — отдельно от аналитики

// Внешний приёмник — веб-приложение Google Apps Script, привязанное к таблице.
// Пока пусто — данные пишутся только локально (заглушка). После публикации скрипта
// вставить сюда адрес и то же секретное слово, что в скрипте, — сбор оживёт.
// Инструкция и код скрипта: docs/analytics-google-sheets.md
const INGEST_URL = "";
const INGEST_TOKEN = "";

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
function readList(key) {
  const raw = safeGet(key);
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

// Отправка на внешний приёмник. Простой POST без предзапроса CORS:
// text/plain + no-cors, поэтому ответ непрозрачный — доставку считаем по факту
// того, что запрос ушёл, а сбой сети ловим в catch и оставляем в очереди.
function postToSink(kind, payload) {
  if (!INGEST_URL || typeof fetch === "undefined") return Promise.reject(new Error("no sink"));
  return fetch(INGEST_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ token: INGEST_TOKEN, kind, ...payload })
  });
}

// Отправка неотправленных событий. Есть внешний приёмник — шлём пачкой и по
// доставке убираем отправленное из очереди; нет — переносим в локальный журнал.
// Офлайн — оставляем в очереди до связи. Одна отправка за раз, без дублей.
let flushing = false;
function flushQueue() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const queue = readList(QUEUE_KEY);
  if (!queue.length) return;
  if (!INGEST_URL) {
    try {
      const sent = readList(EVENTS_KEY);
      sent.push(...queue);
      if (safeSet(EVENTS_KEY, JSON.stringify(sent))) safeRemove(QUEUE_KEY);
    } catch { /* журнал недоступен — очередь остаётся до следующей попытки */ }
    return;
  }
  if (flushing) return;
  flushing = true;
  const batch = queue.slice();
  postToSink("events", { rows: batch })
    .then(() => {
      // Убираем только отправленное; события, добавленные во время отправки, остаются.
      const rest = readList(QUEUE_KEY).slice(batch.length);
      safeSet(QUEUE_KEY, JSON.stringify(rest));
    })
    .catch(() => { /* сеть недоступна — очередь остаётся до следующей попытки */ })
    .finally(() => { flushing = false; if (readList(QUEUE_KEY).length) flushQueue(); });
}

export function track(event, params = {}) {
  let common = {};
  try { common = cfg.context() || {}; } catch { common = {}; }
  const record = { event, ts: Date.now(), version: cfg.version, ...common, ...deviceInfo(), ...params };
  try { if (typeof console !== "undefined") console.debug("[track]", event, record); } catch { /* ничего */ }
  try {
    const queue = readList(QUEUE_KEY);
    queue.push(record);
    safeSet(QUEUE_KEY, JSON.stringify(queue));
  } catch { /* очередь недоступна — молча пропускаем, прохождение не трогаем */ }
  flushQueue();
}

// После восстановления связи очередь уходит без участия игрока.
if (typeof window !== "undefined") window.addEventListener("online", flushQueue);

// ── Контакт и свободный текст задачи: хранятся отдельно от анонимной аналитики.
// В общую аналитику уходит только признак успеха, без самого контакта.
export function saveContact(contact, meta = {}) {
  try {
    const raw = safeGet(CONTACTS_KEY);
    let list = [];
    try { list = raw ? JSON.parse(raw) : []; } catch { list = []; }
    const row = { ts: Date.now(), contact, ...meta };
    list.push(row);
    const ok = safeSet(CONTACTS_KEY, JSON.stringify(list));
    track("contact_submitted", { ok });
    // На внешний приёмник контакт идёт отдельной строкой, в лист «contacts».
    if (ok) postToSink("contact", { row }).catch(() => { /* лучшее усилие */ });
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
