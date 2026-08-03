// Контроллер потока: линейная цепочка из восьми экранов без перескоков.
// Держит состояние прохождения, переносит его между экранами, сохраняет
// прогресс и восстанавливает после перезагрузки/обрыва связи.

import content, { flow, createInitialState } from "./data.js";
import * as storage from "./storage.js";
import { screens } from "./screens.js";
import { el } from "./dom.js";

const root = document.getElementById("app");

// Восстановление: если есть сохранённый прогресс — продолжаем оттуда.
const saved = storage.loadProgress();
let state = saved?.state ?? createInitialState();
let screen = saved?.screen ?? flow[0];
let resuming = Boolean(saved) && screen !== flow[0]; // показать баннер один раз

if (!saved) storage.track("game_start", { runId: state.runId });

// Номер шага для индикатора и баннера восстановления.
// step1..step5 → «Шаг 1..5»; вход, финал и анкета — вне нумерации шагов.
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

// Контекст, который получает каждый экран.
const ctx = {
  content,
  state,
  storage,
  next,
  back,
  go,
  restart,
  update, // сохранить изменения состояния из экрана
  get screen() { return screen; }
};

// Экран пишет в состояние и просит сохранить прогресс.
function update() {
  ctx.state = state;
  persist();
}

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
  const where = n ? `шаге ${n}` : "прошлом месте";
  const text = content.system.resumeTemplate
    ? content.system.resumeTemplate.replace("{n}", n ?? "")
    : `Ты остановился на ${where}. Продолжаем оттуда.`;
  return el("div", { class: "resume" }, n ? text : `Продолжаем оттуда, где остановился.`);
}

function render() {
  root.innerHTML = "";
  const view = el("div", { class: "screen", "data-screen": screen });

  if (stepLabel(screen)) view.appendChild(progressBar());
  if (resuming) view.appendChild(resumeBanner());

  const body = screens[screen](ctx);
  view.appendChild(body);
  root.appendChild(view);

  // Наверх при смене экрана.
  window.scrollTo(0, 0);
}

// Автосохранение при уходе со страницы — страховка от обрыва связи.
window.addEventListener("beforeunload", persist);

render();
