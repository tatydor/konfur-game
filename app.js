// Контроллер потока: линейная цепочка из восьми экранов без перескоков.
// Держит состояние прохождения, переносит его между экранами, сохраняет
// прогресс и восстанавливает после перезагрузки/обрыва связи.

import content, { flow, createInitialState, SCHEMA_VERSION } from "./data.js";
import * as storage from "./storage.js";
import { screens } from "./screens.js";
import { el, tpl } from "./dom.js";

const root = document.getElementById("app");

// Восстановление: если есть сохранённый прогресс — продолжаем оттуда.
// Несовместимую по версии схемы сессию не восстанавливаем, начинаем заново.
const saved = storage.loadProgress();
const validSaved = saved && saved.state && saved.state.schemaVersion === SCHEMA_VERSION ? saved : null;
if (saved && !validSaved) storage.clearProgress();
let state = validSaved?.state ?? createInitialState();
let screen = validSaved?.screen ?? flow[0];
let resuming = Boolean(validSaved) && screen !== flow[0]; // показать баннер один раз

if (!saved) storage.track("game_start", { runId: state.runId });

// Номер шага для индикатора и баннера восстановления.
function stepLabel(id) {
  const map = { step1: 1, step2: 2, step3: 3, step4: 4, step5: 5 };
  return map[id] ?? null;
}

function persist() {
  storage.saveProgress({ screen, state });
}

// Навигация. Только вперёд/назад по flow, без перескоков.
function go(id) {
  if (!screens[id]) return;
  screen = id;
  state.currentStep = id;
  state.updatedAt = Date.now();
  state.stepStartedAt = Date.now();
  if (id !== flow[0] && state.status === "new") state.status = "started";
  if (id === "final") state.status = "finished";
  resuming = false;
  persist();
  storage.track("screen", { runId: state.runId, screen });
  render();
}
function next() {
  const i = flow.indexOf(screen);
  if (i >= 0 && i < flow.length - 1) go(flow[i + 1]);
}
function back() {
  const i = flow.indexOf(screen);
  if (i > 0) go(flow[i - 1]);
}
function restart() {
  state = createInitialState();
  screen = flow[0];
  resuming = false;
  storage.clearProgress();
  storage.track("game_start", { runId: state.runId });
  render();
}

// Контекст, который получает каждый экран. state — через геттер,
// чтобы после restart экраны видели новый объект.
const ctx = {
  content,
  storage,
  next,
  back,
  go,
  restart,
  update: persist, // экран изменил состояние — сохранить прогресс
  get state() { return state; },
  get screen() { return screen; }
};

// Карта пути: пять названных узлов, текущий подсвечен, пройденные отмечены.
// Узлы — только указатель, по ним нельзя перескакивать между шагами.
function pathMapEl() {
  const idx = content.pathMap.findIndex((n) => n.step === screen);
  const map = el("div", { class: "pathmap", role: "list", "aria-label": "Карта пути" });
  content.pathMap.forEach((node, i) => {
    const status = i < idx ? "done" : i === idx ? "current" : "upcoming";
    map.appendChild(el("div", {
      class: "node " + status, role: "listitem",
      "aria-current": status === "current" ? "step" : null
    },
      el("span", { class: "node-dot" }, status === "done" ? "✓" : String(i + 1)),
      el("span", { class: "node-label" }, node.label)
    ));
  });
  return map;
}

function resumeBanner() {
  const n = stepLabel(screen);
  const text = n
    ? tpl(content.system.resumeTemplate, { n })
    : "Продолжаем оттуда, где остановился.";
  return el("div", { class: "resume" }, text);
}

function render() {
  root.innerHTML = "";
  const view = el("div", { class: "screen", "data-screen": screen });
  // Карта пути видна на входе (как превью пути) и на всех пяти шагах.
  if (screen === "step0" || content.pathMap.some((n) => n.step === screen)) view.appendChild(pathMapEl());
  if (resuming) view.appendChild(resumeBanner());
  view.appendChild(screens[screen](ctx));
  root.appendChild(view);
  window.scrollTo(0, 0);
}

// Обрыв связи: прогресс уже сохранён локально, показываем спокойный баннер.
const offlineBar = el("div", { class: "offline-bar" }, content.system.offline);
document.body.appendChild(offlineBar);
function updateOnline() {
  offlineBar.classList.toggle("show", typeof navigator !== "undefined" && navigator.onLine === false);
}
window.addEventListener("online", updateOnline);
window.addEventListener("offline", updateOnline);
updateOnline();

// Автосохранение при уходе со страницы — страховка от обрыва.
window.addEventListener("beforeunload", persist);

render();
