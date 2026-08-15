// Изолированный слой хранения и отправки.
// В localStorage живёт только прогресс прохождения: он нужен, чтобы вернуть
// человека на тот же шаг. Строки прохождения уходят в Google Форму, мелкие
// события остаются в консоли и никуда не записываются.
// Экраны знают только про этот интерфейс: sendRow(kind, fields), track(event),
// saveContact(...).

const PROGRESS_KEY = "konfur:progress"; // { screen, state }

// Ключи прежних версий: локальный журнал событий, очередь к нему и список
// контактов. Журнал никто не читал и рос без предела, контакты копились на
// устройстве стенда. Чистим их один раз при загрузке, чтобы на планшетах,
// где игра уже работала, не оставалось ни почт участников, ни мегабайтов
// мёртвых записей.
const LEGACY_KEYS = ["konfur:events", "konfur:queue", "konfur:contacts"];

// Внешний приёмник — Google Форма (ответы копятся в связанной таблице).
// Типы строк, все связаны идентификатором сессии: start (начал играть),
// summary (дошёл до финала), drop (ушёл раньше), shift (ответ про сдвиг),
// survey (анкета), contact (запрос на разбор), copy (скопировал итог).
// Поток мелких событий остаётся локальным.
const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSeLUg_LiEYvZInkQw-tCBHvyJiCfZza4peXwEqo9nVpa82Seg/formResponse";
// id полей формы (entry.XXXXXX). Схема плоская: каждому полю данных свой вопрос,
// поэтому таблица читается без разбора JSON. Поле с пустым id просто не уходит,
// игра при этом работает, поэтому расширение формы можно катить постепенно.
const ENTRY = {
  // Поля, которые были в форме с самого начала.
  kind: "entry.1700049977",
  sessionId: "entry.1240554086",
  contact: "entry.1135647981",
  task: "entry.1424964298",
  decision: "entry.1271929800",
  answer1: "entry.2057593413",
  answer2: "entry.1928953258",
  payload: "entry.1535032346",
  // Поля плоской схемы, заведены 15.08.2026.
  version: "entry.1679129709",
  step: "entry.1662851955",
  sinceStart: "entry.11666232",
  tools: "entry.2046969967",
  channel: "entry.1312724623",
  metric: "entry.2008094919",
  goal: "entry.188764951",
  sampleSize: "entry.533013769",
  gaps: "entry.874789817",
  awarenessBefore: "entry.298316769",
  awarenessAfter: "entry.1051964296",
  ownTask: "entry.555579793"
};

// Непустая заглушка для пустых полей. Google Форма отклоняет всю запись целиком,
// если хотя бы один обязательный вопрос пуст, а строки у нас разной природы
// (контакт без ответов анкеты, сводка без контакта). Поэтому каждому вопросу
// всегда отдаём непустое значение — запись уходит независимо от «обязательности».
const FORM_EMPTY = "—";

// Весь копирайт проходит типографскую обработку и приклеивает короткие предлоги
// неразрывным пробелом (см. fixHangingWords в data.js). На экране это правильно,
// а в таблице один и тот же ответ превращался в два разных значения, поэтому
// перед отправкой возвращаем обычный пробел.
function forSheet(value) {
  return String(value).replace(/ /g, " ").trim();
}

// Строка формы: каждому вопросу непустое значение (см. FORM_EMPTY выше).
function formParams(fields) {
  const params = new URLSearchParams();
  for (const [key, entryId] of Object.entries(ENTRY)) {
    if (!entryId) continue;
    const raw = fields[key];
    const val = (raw == null || forSheet(raw) === "") ? FORM_EMPTY : forSheet(raw);
    params.append(entryId, val);
  }
  return params;
}

// Отправка одной строки в Google Форму. Кодировка формы — «простой» запрос,
// поэтому предзапроса CORS нет; ответ непрозрачный (no-cors), сбой сети ловим.
function submitForm(fields) {
  if (!FORM_URL || typeof fetch === "undefined") return Promise.reject(new Error("no form"));
  return fetch(FORM_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: formParams(fields).toString()
  });
}

// Отправка на выходе со страницы: обычный запрос браузер успевает отменить,
// поэтому здесь sendBeacon — он переживает закрытие вкладки. URLSearchParams
// уходит с тем же типом содержимого, что и обычная отправка формы.
function submitFormBeacon(fields) {
  if (!FORM_URL) return false;
  const params = formParams(fields);
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    try { return navigator.sendBeacon(FORM_URL, params); } catch { /* падаем на fetch */ }
  }
  try { submitForm(fields).catch(() => {}); return true; } catch { return false; }
}

// Общие параметры событий задаёт app.js через configure(): версия игры и
// провайдер контекста (анонимный sessionId, задача, шаг, время сессии и шага).
let cfg = { version: "0", context: () => ({}) };
export function configure(next) { cfg = { ...cfg, ...next }; }

// Единственная точка отправки строки в форму. Общие поля (тип строки, сессия,
// версия сборки, задача, шаг, время с начала) подставляются сами, поэтому все
// строки сопоставимы между собой и версию сборки несёт каждая, а не только уход.
// Время отдаём в секундах: в таблице его читают глазами, миллисекунды мешают.
// strict: вернуть ошибку отправки вызывающему. Нужно там, где человеку показывают
// результат отправки (контакт на финале); остальные строки уходят «лучшим усилием».
export function sendRow(kind, fields = {}, { beacon = false, strict = false } = {}) {
  let common = {};
  try { common = cfg.context() || {}; } catch { common = {}; }
  const row = {
    kind,
    sessionId: common.sessionId || "",
    version: cfg.version,
    task: common.task || "",
    step: common.step || "",
    sinceStart: common.sinceStart != null ? Math.round(common.sinceStart / 1000) : "",
    ...fields
  };
  // Поле, для которого в форме ещё нет своего вопроса, уходит внутрь payload.
  // Так расширение формы можно катить постепенно и ничего не терять по дороге:
  // без этого строка ушла бы с пустыми колонками.
  const pending = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "payload" || ENTRY[key]) continue;
    if (value !== "" && value != null) pending[key] = value;
  }
  if (Object.keys(pending).length) {
    let base = {};
    try { base = row.payload ? JSON.parse(row.payload) : {}; } catch { base = { payload: row.payload }; }
    row.payload = JSON.stringify({ ...base, ...pending });
  }
  if (beacon) return submitFormBeacon(row);
  const sending = submitForm(row);
  if (strict) return sending;
  return sending.catch(() => { /* лучшее усилие, прохождение не блокируем */ });
}

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

// ── Мелкие события: только консоль ──────────────────────────────────────────
// Раньше поток событий копился в localStorage двумя массивами, которые никто не
// читал и не отправлял: за прохождение набегало около шести килобайт, а на
// устройстве стенда это со временем упиралось в квоту и ломало сохранение
// прогресса. Всё, что нужно для разбора прохождения, уходит строками в форму,
// поэтому событию достаточно консоли: она помогает на отладке и ничего не копит.
export function track(event, params = {}) {
  let common = {};
  try { common = cfg.context() || {}; } catch { common = {}; }
  const record = { event, ts: Date.now(), version: cfg.version, ...common, ...deviceInfo(), ...params };
  try { if (typeof console !== "undefined") console.debug("[track]", event, record); } catch { /* ничего */ }
}

// ── Контакт: запрос на разбор задачи после игры ──────────────────────────────
// На устройстве не остаётся ничего: почту и ник в браузере не храним, потому что
// игра живёт на общем планшете стенда. Ответ обещаем только после того, как
// запрос ушёл: подтверждение по факту записи в браузер обманывало человека при
// оборванной связи. Прочитать статус ответа формы нельзя (запрос уходит в режиме
// no-cors), поэтому успехом считаем сам факт отправки, а сбой сети виден.
export function saveContact(contact, meta = {}) {
  return sendRow("contact", {
    contact,
    ownTask: meta.ownTask || "",
    payload: JSON.stringify({ ts: Date.now() })
  }, { strict: true }).then(
    () => { track("contact_submitted", { ok: true }); return { ok: true }; },
    (e) => { track("contact_submitted", { ok: false }); throw e; }
  );
}

// Разовая уборка ключей прежних версий (см. LEGACY_KEYS).
LEGACY_KEYS.forEach(safeRemove);
