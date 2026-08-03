// Контроллер потока: линейная цепочка из восьми экранов без перескоков.
// Держит состояние прохождения, переносит его между экранами, сохраняет
// прогресс и восстанавливает после перезагрузки/обрыва связи.

import content, { flow, createInitialState } from "./data.js";
import * as storage from "./storage.js";
import { screens } from "./screens.js";
import { el, tpl } from "./dom.js";

const root = document.getElementById("app");

// Восстановление: если есть сохранённый прогресс — продолжаем оттуда.
const saved = storage.loadProgress();
let state = saved?.state ?? createInitialState();
let screen = saved?.screen ?? flow[0];
let resuming = Boolean(saved) && screen !== flow[0]; // показать баннер один раз

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

function progressBar() {
  const n = stepLabel(screen);
  const bar = el("div", { class: "progress" });
  for (let i = 1; i <= 5; i++) {
    bar.appendChild(el("span", { class: "dot" + (n && i <= n ? " done" : "") }));
  }
  return bar;
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
  if (stepLabel(screen)) view.appendChild(progressBar());
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
