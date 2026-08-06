// Контроллер потока: линейная цепочка из восьми экранов без перескоков.
// Держит состояние прохождения, переносит его между экранами, сохраняет
// прогресс и восстанавливает после перезагрузки/обрыва связи.

import content, { flow, createInitialState, SCHEMA_VERSION, GAME_VERSION } from "./data.js";
import * as storage from "./storage.js";
import { screens } from "./screens.js";
import { el, tpl } from "./dom.js";
import { shouldShowIntro, mountIntro } from "./intro.js";

// Версия кеша из index.html должна совпадать с GAME_VERSION. Если забыли
// синхронизировать при релизе — предупреждаем в консоль, игру не ломаем.
if (typeof window !== "undefined" && window.__BUILD_V && window.__BUILD_V !== GAME_VERSION) {
  console.warn(`Версия кеша (${window.__BUILD_V}) ≠ GAME_VERSION (${GAME_VERSION}). Синхронизируйте index.html и data.js.`);
}

const root = document.getElementById("app");
const stepNoMap = { step1: 1, step2: 2, step3: 3, step4: 4, step5: 5 };

// Восстановление: если есть сохранённый прогресс — продолжаем оттуда.
// Несовместимую по версии схемы сессию не восстанавливаем, начинаем заново.
const saved = storage.loadProgress();
const validSaved = saved && saved.state && saved.state.schemaVersion === SCHEMA_VERSION ? saved : null;
if (saved && !validSaved) storage.clearProgress();
let state = validSaved?.state ?? createInitialState();
let screen = validSaved?.screen ?? flow[0];
let resuming = Boolean(validSaved) && screen !== flow[0]; // показать баннер один раз

// Общие параметры к каждому событию: анонимный sessionId, версия, задача, шаг,
// время с начала сессии и время на шаге. Настраиваем до первых событий.
storage.configure({
  version: GAME_VERSION,
  context: () => ({
    sessionId: state.runId,
    task: state.task,
    step: state.currentStep,
    stepNo: stepNoMap[state.currentStep] ?? null,
    sinceStart: Date.now() - (state.createdAt || Date.now()),
    onStep: Date.now() - (state.stepStartedAt || Date.now())
  })
});

// Открытие страницы и, при наличии, источник QR-метки (?src=…).
const qrSource = new URLSearchParams(location.search).get("src");
storage.track("game_opened", qrSource ? { qrSource } : {});
if (resuming) storage.track("session_resumed", { step: screen, status: state.status });

// Номер шага для баннера восстановления.
function stepLabel(id) {
  return stepNoMap[id] ?? null;
}

function persist() {
  const ok = storage.saveProgress({ screen, state });
  if (ok === false) storage.track("network_error", { operation: "save_progress", step: screen });
}

// События входа на экран: шаг, финал или анкета.
function trackEntry(id) {
  if (stepNoMap[id]) storage.track("step_viewed", { step: id, stepNo: stepNoMap[id] });
  else if (id === "final") storage.track("final_viewed", { variant: state.finalVariant || state.step5Choice });
  else if (id === "anketa") storage.track("survey_opened");
}

// Навигация. Только вперёд/назад по flow, без перескоков. dir — направление.
function go(id, dir) {
  if (!screens[id]) return;
  const from = screen;
  const wasNew = state.status === "new";
  // Завершение шага при движении вперёд — фиксируем один раз с длительностью.
  if (dir === "next" && stepNoMap[from]) {
    storage.track("step_completed", { step: from, stepNo: stepNoMap[from], duration: Date.now() - state.stepStartedAt });
  }
  if (dir === "back") storage.track("back_clicked", { from, to: id });

  screen = id;
  state.currentStep = id;
  state.updatedAt = Date.now();
  state.stepStartedAt = Date.now();
  if (id !== flow[0] && state.status === "new") state.status = "started";
  if (from === "step0" && id === "step1" && wasNew) storage.track("game_started", { taskId: state.task });
  if (id === "final") state.status = "finished";
  resuming = false;
  persist();
  trackEntry(id);
  render();
}
function next() {
  const i = flow.indexOf(screen);
  if (i >= 0 && i < flow.length - 1) go(flow[i + 1], "next");
}
function back() {
  const i = flow.indexOf(screen);
  if (i > 0) go(flow[i - 1], "back");
}
function restart() {
  const prevStatus = state.status;
  state = createInitialState();
  screen = flow[0];
  resuming = false;
  storage.clearProgress();
  storage.track("game_restarted", { prevStatus });
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

let hasRendered = false; // первый показ не забирает фокус на заголовок
function render() {
  root.innerHTML = "";
  // Невалидный экран в сохранённой сессии — начинаем с начала, не падаем.
  if (!screens[screen]) { screen = flow[0]; state.currentStep = screen; }
  try {
    const view = el("div", { class: "screen", "data-screen": screen });
    // Карта пути видна на всех пяти шагах. На входном экране её не показываем:
    // это чистый герой с выбором задачи, путь открывается с первого шага.
    if (content.pathMap.some((n) => n.step === screen)) view.appendChild(pathMapEl());
    if (resuming) view.appendChild(resumeBanner());
    view.appendChild(screens[screen](ctx));
    root.appendChild(view);
    window.scrollTo(0, 0);
    // После перехода фокус попадает на заголовок нового шага (для клавиатуры и
    // скринридера). На самом первом показе фокус не ставим, иначе на крупном
    // заголовке входного экрана видно кольцо фокуса как лишнюю рамку.
    const heading = view.querySelector("h1");
    if (heading && hasRendered) heading.focus({ preventScroll: true });
    hasRendered = true;
  } catch (e) {
    // Повреждённое состояние — предлагаем начать заново, а не показываем пустой экран.
    storage.track("network_error", { operation: "render", step: screen });
    root.innerHTML = "";
    root.appendChild(el("div", { class: "screen" },
      el("h1", { tabindex: "-1" }, "Что-то сбилось"),
      el("p", { class: "intro" }, "Прогресс не удалось показать. Начнём заново — это быстро."),
      el("button", { class: "primary", onclick: () => restart() }, "Начать заново")
    ));
  }
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

// На свежем старте показываем заставку-конвейер, а первый экран отдаём по кнопке
// «Начать игру». При возврате с сохранённым прогрессом заставку пропускаем.
if (shouldShowIntro({ screen, state, resuming, firstScreen: flow[0] })) {
  storage.track("intro_shown", {});
  mountIntro(root, {
    content,
    reducedMotion: typeof window !== "undefined" && window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    onStart: () => { storage.track("intro_started", {}); render(); }
  });
} else {
  render();
}
