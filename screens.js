// Рендер восьми экранов с интеракциями. Каждый экран читает и пишет состояние
// прохождения, ветвление по выбранной задаче подставляет данные в шаблоны,
// каждый экран оставляет игроку промежуточный итог и кнопку дальше.

import { el, tpl } from "./dom.js";
import { resetDependentOnTask, buildHypothesis, buildHypothesisParts, buildShareText } from "./data.js";

const HYP_MAX = 220;      // предел длины гипотезы
const WATCH_OWN_MAX = 80; // название метрики в свободной ветке — короткое

// Карандаш правки карточки гипотезы.
const PENCIL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

// Иконка копирования — для вторичной кнопки «Скопировать план» на финале.
const COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

// Небольшой линейный конвейер: собранный объект сходит с ленты вправо. В духе
// игры (обводка currentColor), без bitmap. Декоративный — скрыт от скринридера.
const CONVEYOR_SVG = '<svg viewBox="0 0 132 44" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 33h96"/><circle cx="16" cy="38" r="3.4"/><circle cx="38" cy="38" r="3.4"/><circle cx="60" cy="38" r="3.4"/><circle cx="82" cy="38" r="3.4"/><rect x="98" y="12" width="20" height="18" rx="2"/><path d="M103 21l3.4 3.4L114 17"/><path d="M122 21h6m-4-3 3 3-3 3"/></svg>';

// Элемент с встроенной линейной иконкой и (необязательно) текстовой подписью.
// Иконка живёт в отдельном span (innerHTML), подпись — в span.btn-label, чтобы
// её текст можно было менять после копирования, не затирая иконку.
function elSvg(tag, className, svg, labelText) {
  const node = el(tag, { class: className });
  const icon = el("span", { class: "btn-icon" });
  icon.innerHTML = svg;
  node.appendChild(icon);
  if (labelText != null) node.appendChild(el("span", { class: "btn-label" }, labelText));
  return node;
}

// Замыкание фокуса в модалке: Tab с последнего элемента ведёт на первый и наоборот.
function trapTab(e, container) {
  const f = container.querySelectorAll('button, textarea, input, a[href], [tabindex]:not([tabindex="-1"])');
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

// Универсальное модальное окно с одним текстовым полем: заголовок, подводка,
// необязательное предупреждение, счётчик остатка символов, «Отмена»/«Сохранить».
// onSave получает обрезанный текст; окно закрывается после сохранения. Escape и
// клик вне панели закрывают, фокус замыкается внутри и возвращается на источник.
function openTextModal({ title, intro, warn, value = "", placeholder = "", maxlength = HYP_MAX, counterTemplate, cancelLabel, saveLabel, returnFocusTo, onSave }) {
  const overlay = el("div", { class: "modal-overlay" });
  const panel = el("div", { class: "modal-panel", role: "dialog", "aria-modal": "true", "aria-label": title });
  const ta = el("textarea", { class: "hyp-free modal-field", maxlength, placeholder, "aria-label": title });
  ta.value = value;
  const counter = el("div", { class: "charcount" });
  const updateCounter = () => {
    const left = maxlength - ta.value.length;
    counter.textContent = left <= 40 && counterTemplate ? tpl(counterTemplate, { n: left }) : "";
  };
  ta.addEventListener("input", updateCounter);

  const close = () => { document.removeEventListener("keydown", onKey); overlay.remove(); if (returnFocusTo) returnFocusTo.focus(); };
  const save = () => { onSave(ta.value.trim()); close(); };
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") trapTab(e, panel);
  }
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", onKey);

  // Отсеиваем пустые узлы: нативный append(null) вставил бы текст «null», когда
  // подводки или предупреждения нет (у модалки гипотезы warn отсутствует).
  [
    el("h2", { class: "modal-title" }, title),
    intro ? el("p", { class: "modal-intro" }, intro) : null,
    ta, counter,
    warn ? el("p", { class: "warn" }, warn) : null,
    el("div", { class: "modal-actions" },
      el("button", { class: "ghost", type: "button", onclick: close }, cancelLabel),
      el("button", { class: "primary", type: "button", onclick: save }, saveLabel)
    )
  ].filter(Boolean).forEach((n) => panel.appendChild(n));
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  updateCounter();
  ta.focus(); ta.select();
}

// ── Общие детали ──────────────────────────────────────────────
// Шапка: плашка «Задача: …» (шаги 1 и 5) и бейдж места в одну строку, затем
// заголовок и подводка. Без плашки бейдж рендерится как раньше — одиночный .loc.
function header(cfg) {
  let locNode = null;
  if (cfg.task) {
    const plate = el("span", { class: "loc task-loc", title: "Задача: " + cfg.task }, "Задача: " + cfg.task);
    locNode = el("div", { class: "head-meta" }, plate,
      cfg.location ? el("span", { class: "loc" }, cfg.location) : null);
  } else if (cfg.location) {
    locNode = el("div", { class: "loc" }, cfg.location);
  }
  return el("header", { class: "head" },
    locNode,
    el("h1", { tabindex: "-1" }, cfg.title),   // цель фокуса при переходе на шаг
    cfg.intro ? el("p", { class: "intro" }, cfg.intro) : null
  );
}

function nav(ctx, { nextLabel, disabled, onNext } = {}) {
  const foot = el("footer", { class: "nav" });
  // «Назад» в футере только там, где нет карты пути (финал, анкета). На шагах 1–5
  // кнопка живёт в строке карты пути (app.js), на входном экране её нет.
  const hasPathMap = ctx.content.pathMap.some((n) => n.step === ctx.screen);
  if (ctx.screen !== "step0" && !hasPathMap) {
    foot.appendChild(el("button", { class: "ghost", onclick: () => ctx.back() }, "← Назад"));
  }
  foot.appendChild(el("button", {
    class: "primary",
    disabled: disabled ? true : null,
    onclick: onNext || (() => ctx.next())
  }, nextLabel || "Дальше →"));
  return foot;
}

let fieldSeq = 0;
// Текстовое поле связываем с настоящим label, группу кнопок — role="group"
// с aria-labelledby, чтобы скринридер называл и подпись, и элемент.
function fieldset(legend, control, legendClass = "legend") {
  const tag = control.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") {
    const id = "fld" + (++fieldSeq);
    control.id = id;
    return el("div", { class: "field" }, el("label", { class: legendClass, for: id }, legend), control);
  }
  const id = "grp" + (++fieldSeq);
  control.setAttribute("role", "group");
  control.setAttribute("aria-labelledby", id);
  return el("div", { class: "field" }, el("div", { class: legendClass, id }, legend), control);
}

function choiceRow(options, selected, onPick, extraClass = "") {
  const row = el("div", { class: "choices" });
  for (const opt of options) {
    const btn = el("button", {
      type: "button",
      class: "choice " + extraClass + (selected === opt.id ? " selected" : ""),
      "aria-pressed": selected === opt.id ? "true" : "false",
      onclick: () => {
        [...row.children].forEach((c) => { c.classList.remove("selected"); c.setAttribute("aria-pressed", "false"); });
        btn.classList.add("selected");
        btn.setAttribute("aria-pressed", "true");
        onPick(opt.id);
      }
    }, opt.label);
    row.appendChild(btn);
  }
  return row;
}

function metric(label, value, accent) {
  return el("div", { class: "metric" + (accent ? " metric-accent" : "") },
    el("div", { class: "metric-value" }, value),
    el("div", { class: "metric-label" }, label)
  );
}

// Клиентский одноразовый код. VERIFY:code — формат сверить со стендистом.
function giftCode(runId) {
  let h = 0;
  for (const ch of String(runId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const digits = String(h % 10000).padStart(4, "0");
  const first = (h % 9) + 1;
  return `К${first}-${digits}`;
}

// Линейные иконки задач: встроенный SVG, currentColor, без внешних файлов.
const taskIcons = {
  documents: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h6l4 4v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v4h4"/><path d="M9 12.5h6M9 16h4"/></svg>',
  requests:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a7.5 7.5 0 0 1-10.9 6.7L4 20l1.8-5.3A7.5 7.5 0 1 1 21 11.5Z"/><path d="M9 11h6M9 14h3"/></svg>',
  news:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h12v13H5a1.5 1.5 0 0 1-1.5-1.5Z"/><path d="M16 9h3.5v8.5A1.5 1.5 0 0 1 18 19"/><path d="M7 9.5h6M7 12.5h6M7 15.5h4"/></svg>',
  contract:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.6 12S6 5.8 12 5.8 21.4 12 21.4 12 18 18.2 12 18.2 2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>'
};
function taskIconEl(id) {
  if (!taskIcons[id]) return null;
  const s = el("span", { class: "card-icon", "aria-hidden": "true" });
  s.innerHTML = taskIcons[id];
  return s;
}

// ── Экран 0. Вход, выбор задачи, базовый вопрос ───────────────
function step0(ctx) {
  const { content, state } = ctx;
  const t = content.ui.step0;
  const wrap = el("div", { class: "start" });
  // Метка-плашка над заголовком, затем крупный заголовок и подводка.
  wrap.appendChild(header({ location: t.badge, title: t.title, intro: t.intro }));

  const error = el("div", { class: "error", role: "alert" });

  // Четыре задачи сеткой два на два, своя — пунктирной карточкой во всю ширину.
  // Своя задача описывается в модальном окне; после сохранения карточка
  // показывает заголовок «Моя задача» и введённый текст, с рамкой выбранной.
  const cards = el("div", { class: "cards" });

  function selectTask(taskId) {
    if (state.task && state.task !== taskId) {
      ctx.storage.track("task_changed", { from: state.task, to: taskId });
      resetDependentOnTask(state);
    }
    state.task = taskId;
    ctx.storage.track("task_selected", { taskId });
    ctx.update();
    error.textContent = "";
    renderCards();
  }

  function openOwnModal(returnFocusTo) {
    openTextModal({
      title: t.ownModalTitle, intro: t.ownExplain,
      value: state.ownTaskText || "", placeholder: t.ownFieldPlaceholder, maxlength: 160,
      counterTemplate: content.system.charsLeftTemplate,
      cancelLabel: t.modalCancel, saveLabel: t.modalSave, returnFocusTo,
      onSave: (text) => {
        if (!text) return;   // пустую свою задачу не выбираем
        if (state.task && state.task !== "own") {
          ctx.storage.track("task_changed", { from: state.task, to: "own" });
          resetDependentOnTask(state);
        }
        state.ownTaskText = text;
        state.task = "own";
        ctx.storage.track("task_selected", { taskId: "own" });
        ctx.update();
        error.textContent = "";
        renderCards();
      }
    });
  }

  function renderCards() {
    cards.replaceChildren();
    for (const task of content.tasks) {
      const own = task.id === "own";
      const filled = own && !!state.ownTaskText.trim();
      const selected = state.task === task.id;
      const card = el("button", {
        class: "card" + (own ? " card-own" : "") + (selected ? " selected" : ""),
        "aria-pressed": selected ? "true" : "false",
        onclick: () => (own ? openOwnModal(card) : selectTask(task.id))
      },
        own ? null : taskIconEl(task.id),
        el("div", { class: "card-title" }, own && filled ? t.ownFilledTitle : task.title),
        el("div", { class: "card-desc" }, own && filled ? state.ownTaskText.trim() : task.card)
      );
      cards.appendChild(card);
    }
  }
  renderCards();

  const awareness = choiceRow(
    [{ id: "yes", label: t.awarenessYes }, { id: "no", label: t.awarenessNo }],
    state.awarenessBefore,
    (id) => { state.awarenessBefore = id; ctx.update(); error.textContent = ""; ctx.storage.track("knows_before_answered", { value: id }); },
    "toggle"
  );

  wrap.append(
    el("div", { class: "section-label" }, t.sectionLabel),
    cards,
    fieldset(t.awarenessQuestion, awareness),
    error,
    nav(ctx, {
      nextLabel: t.button,
      onNext: () => {
        if (!state.task) { error.textContent = content.system.emptyRequired; return; }
        if (state.task === "own" && !state.ownTaskText.trim()) {
          error.textContent = content.system.emptyRequired; return;
        }
        if (!state.awarenessBefore) { error.textContent = t.awarenessRequired; return; }
        ctx.next();  // game_started фиксируется при переходе step0 → step1
      }
    })
  );
  return wrap;
}

// ── Шаг 1. Гипотеза: числовой режим и свободная ветка ─────────
// Числовой режим: карточка с подставляемыми числами и три блока выбора
// (результат, цель, выборка). Правка карандашом уводит в свободную ветку, где
// вместо карточки поле ввода. Задача own — всегда свободная.
function step1(ctx) {
  const { content, state } = ctx;
  const t = content.ui.step1;
  const task = content.taskById[state.task];
  const h = state.hypothesis;
  const tm = content.taskMetrics[state.task];
  const wrap = el("div");
  const taskLabel = state.task === "own" ? (state.ownTaskText.trim() || task.title) : task.title;

  // Задача own не имеет чисел — её ветка всегда свободная.
  if (state.task === "own") h.freeform = true;

  // Числовые значения по умолчанию при первом входе (для задач с метриками).
  if (tm) {
    if (!h.resultChoice || !tm[h.resultChoice]) h.resultChoice = content.taskResultIds(state.task)[0];
    if (!h.goalChoice || !tm[h.resultChoice].goals.some((g) => g.id === h.goalChoice)) h.goalChoice = tm[h.resultChoice].goals[0].id;
    if (h.sampleSize == null) h.sampleSize = tm.samples[0];
  }

  const head = header({ task: taskLabel, location: t.location, title: t.title, intro: t.intro });
  const introP = head.querySelector(".intro");
  wrap.appendChild(head);

  const error = el("div", { class: "error", role: "alert" });

  // Числовой блок: карточка + три выбора. Пересобирается целиком при выборе.
  const numericHost = el("div");
  // Свободный блок: поле ввода вместо карточки.
  const freeHost = el("div");
  const freeField = el("textarea", { class: "hyp-free", maxlength: HYP_MAX, placeholder: t.freePlaceholder, "aria-label": "Текст гипотезы" });
  freeField.value = h.customText || "";
  freeField.addEventListener("input", () => { h.customText = freeField.value; h.finalText = freeField.value; ctx.update(); error.textContent = ""; });
  freeHost.append(el("div", { class: "section-label" }, t.cardLabel), freeField);

  const resetLink = el("button", { class: "linklike", onclick: onReset }, t.resetLink);
  // Приглашение приносить гипотезы в канал — отдельной строкой, в обеих ветках.
  const channelInvite = el("p", { class: "channel-invite" }, t.channelLine);

  function maybeTrackBuilt() {
    ctx.storage.track("hypothesis_built", { result: h.resultChoice, goal: h.goalChoice, sample: h.sampleSize });
  }

  // Карточка гипотезы: обычный текст + подсвеченные фрагменты (цель, проверка),
  // которыми игрок управляет. Действие приходит из задачи и остаётся обычным цветом.
  function cardNode(changedSlot) {
    const parts = buildHypothesisParts(state.task, h.resultChoice, h.goalChoice, h.sampleSize, state.ownTaskText.trim());
    h.finalText = `Если ${parts.action}, то ${parts.goal}. ${parts.check}`;
    const goalSlot = el("span", { class: "slot" + (changedSlot === "goal" ? " flash" : "") }, parts.goal);
    const checkSlot = el("span", { class: "slot" + (changedSlot === "check" ? " flash" : "") }, parts.check);
    const card = el("p", { class: "hyp-card" });
    card.appendChild(document.createTextNode(`Если ${parts.action}, то `));
    card.appendChild(goalSlot);
    card.appendChild(document.createTextNode(". "));
    card.appendChild(checkSlot);
    const pencil = el("button", { class: "hyp-edit", type: "button", "aria-label": t.editAria });
    pencil.innerHTML = PENCIL_SVG;
    pencil.addEventListener("click", () => openModal(pencil));
    card.appendChild(pencil);
    return card;
  }

  function paintNumeric(changedSlot) {
    numericHost.innerHTML = "";
    if (!tm) return;
    numericHost.append(el("div", { class: "section-label" }, t.cardLabel), cardNode(changedSlot));
    // Результат: кнопки в порядке ключей taskMetrics. Смена сбрасывает цель на первую.
    const resultIds = content.taskResultIds(state.task);
    numericHost.appendChild(fieldset(t.resultLegend,
      choiceRow(resultIds.map((id) => ({ id, label: tm[id].label })), h.resultChoice, (id) => {
        h.resultChoice = id;
        h.goalChoice = tm[id].goals[0].id;
        ctx.update(); maybeTrackBuilt(); paintNumeric("goal");
      }, "toggle"), "section-label"
    ));
    // Цель: кратность ×N, направление и целевое значение в скобках, одной строкой.
    const goalOpts = tm[h.resultChoice].goals.map((g) => ({
      id: g.id,
      label: `${g.id === "x3" ? "×3" : "×2"} ${g.label.replace(/^\S+\s+/, "")} (${g.targetShort})`
    }));
    numericHost.appendChild(fieldset(tpl(t.goalLegendTemplate, { now: tm[h.resultChoice].now }),
      choiceRow(goalOpts, h.goalChoice, (id) => {
        h.goalChoice = id; ctx.update(); maybeTrackBuilt(); paintNumeric("goal");
      }, "toggle"), "section-label"
    ));
    // Выборка: подпись кнопки — число и единица.
    numericHost.appendChild(fieldset(t.sampleLegend,
      choiceRow(tm.samples.map((n) => ({ id: n, label: `${n} ${tm.sampleUnit}` })), h.sampleSize, (id) => {
        h.sampleSize = id; ctx.update(); maybeTrackBuilt(); paintNumeric("check");
      }, "toggle"), "section-label"
    ));
  }

  function applyMode() {
    const free = h.freeform;
    numericHost.style.display = free ? "none" : "";
    freeHost.style.display = free ? "" : "none";
    resetLink.style.display = free && !!h.customText && state.task !== "own" ? "" : "none";
    introP.textContent = free ? (h.customText ? t.introCustom : t.introFree) : t.intro;
    if (free) freeField.value = h.customText || "";
    else paintNumeric(null);
  }

  // Модальное окно правки: предзаполнено сгенерированной заготовкой, правка уводит
  // в свободную ветку только если текст изменился.
  function openModal(pencilEl) {
    const seed = buildHypothesis(state.task, h.resultChoice, h.goalChoice, h.sampleSize, state.ownTaskText.trim());
    openTextModal({
      title: t.modalTitle, intro: t.modalIntro, value: seed,
      counterTemplate: content.system.charsLeftTemplate,
      cancelLabel: t.modalCancel, saveLabel: t.modalSave, returnFocusTo: pencilEl,
      onSave: (text) => {
        if (!text || text === seed.trim()) return; // не отличается — остаёмся в числовом режиме
        h.customText = text; h.finalText = text; h.freeform = true;
        ctx.update(); ctx.storage.track("hypothesis_custom_saved", {});
        applyMode();
      }
    });
  }

  function onReset() {
    h.freeform = false; h.customText = "";
    ctx.update(); ctx.storage.track("hypothesis_reset", {});
    error.textContent = "";
    applyMode();
  }

  function onNext() {
    if (h.freeform && !(h.customText || "").trim()) { error.textContent = t.emptyError; freeField.focus(); return; }
    ctx.next();
  }

  wrap.append(numericHost, freeHost, resetLink, channelInvite, error, nav(ctx, { nextLabel: t.button, onNext }));
  applyMode();
  return wrap;
}

// ── Шаг 2. Инструменты вокруг бюджета: выбрать до трёх ─────────
function step2(ctx) {
  const { content, state } = ctx;
  const t = content.ui.step2;
  const tt = content.taskTools[state.task] || { reco: [], alt: [] };
  const recoSet = new Set(tt.reco);
  const mainIds = [...tt.reco, ...tt.alt];                    // основной экран: рекомендации + альтернативы
  const restIds = content.tools.map((x) => x.id).filter((id) => !mainIds.includes(id));
  const wrap = el("div");
  wrap.appendChild(header({ location: t.location, title: t.title, intro: t.intro }));

  const counter = el("div", { class: "counter", "aria-live": "polite" });
  const msg = el("div", { class: "error", role: "alert" });
  const chain = el("p", { class: "chain" });
  const list = el("div", { class: "tool-list" });
  const foot = nav(ctx, { nextLabel: t.button, disabled: state.tools.selected.length === 0 });

  function refresh() {
    const sel = state.tools.selected;
    counter.textContent = tpl(t.counterTemplate, { n: sel.length, max: t.maxTools });
    foot.querySelector(".primary").disabled = sel.length === 0;
    // При достижении лимита невыбранные карточки приглушаются.
    wrap.querySelectorAll(".tool").forEach((c) => {
      const id = c.getAttribute("data-id");
      c.classList.toggle("dimmed", sel.length >= t.maxTools && !sel.includes(id));
    });
    // Строка сборки: как выбранные инструменты работают вместе.
    chain.textContent = sel.length
      ? sel.map((id) => { const tl = content.toolById[id]; return tl ? `${tl.name} ${tl.role}` : ""; }).filter(Boolean).join(", ") + "."
      : "";
  }

  function toolCard(tool) {
    const isReco = recoSet.has(tool.id);
    const card = el("button", {
      class: "tool selectable" + (state.tools.selected.includes(tool.id) ? " selected" : "") + (isReco ? " reco" : ""),
      "data-id": tool.id,
      "aria-pressed": state.tools.selected.includes(tool.id) ? "true" : "false"
    },
      el("div", { class: "tool-head" },
        el("span", { class: "tool-name" }, tool.name)
      ),
      el("div", { class: "tool-explain" }, tool.explain),
      isReco ? el("span", { class: "reco-tag" }, "советуем под задачу") : null
    );
    card.addEventListener("click", () => {
      const sel = state.tools.selected;
      const i = sel.indexOf(tool.id);
      let action;
      if (i >= 0) {
        sel.splice(i, 1); card.classList.remove("selected"); card.setAttribute("aria-pressed", "false"); msg.textContent = ""; action = "removed";
      } else if (sel.length >= t.maxTools) {
        msg.textContent = t.fourthAttempt;
        ctx.storage.track("tool_budget_exceeded", { tool: tool.id, set: [...sel] });
        return;
      } else {
        sel.push(tool.id); card.classList.add("selected"); card.setAttribute("aria-pressed", "true"); msg.textContent = ""; action = "added";
      }
      ctx.storage.track("tool_toggled", { tool: tool.id, action, count: sel.length });
      ctx.update(); refresh();
    });
    return card;
  }

  for (const id of mainIds) list.appendChild(toolCard(content.toolById[id]));

  // Остальные инструменты — под раскрытие, не удлиняют основной путь.
  const moreWrap = el("div", { class: "more-tools", style: "display:none" });
  for (const id of restIds) moreWrap.appendChild(toolCard(content.toolById[id]));
  const moreToggle = el("button", {
    class: "linklike",
    onclick: () => {
      const open = moreWrap.style.display === "";
      moreWrap.style.display = open ? "none" : "";
      moreToggle.textContent = open ? t.allToolsToggle : "Свернуть";
      refresh();
    }
  }, t.allToolsToggle);

  // Нехватка — необязательная свёрнутая область, не в основном маршруте.
  const gapsWrap = el("div", { class: "gaps-wrap", style: "display:none" });
  const gapsRow = el("div", { class: "choices" });
  for (const g of content.gapOptions) {
    const chip = el("button", { class: "choice small" + (state.tools.gaps.includes(g.id) ? " selected" : "") }, g.label);
    chip.addEventListener("click", () => {
      const arr = state.tools.gaps;
      const i = arr.indexOf(g.id);
      if (i >= 0) { arr.splice(i, 1); chip.classList.remove("selected"); }
      else { arr.push(g.id); chip.classList.add("selected"); ctx.storage.track("tool_gap_selected", { gap: g.id }); }
      ctx.update();
    });
    gapsRow.appendChild(chip);
  }
  gapsWrap.appendChild(gapsRow);
  const gapsToggle = el("button", {
    class: "linklike",
    onclick: () => { gapsWrap.style.display = gapsWrap.style.display === "" ? "none" : ""; }
  }, t.gapsTitle);

  wrap.append(
    counter, list, moreToggle, moreWrap,
    chain, msg,
    gapsToggle, gapsWrap,
    foot
  );
  refresh();
  return wrap;
}

// ── Шаг 3. Сборка и проверка ──────────────────────────────────
function step3(ctx) {
  const { content, state } = ctx;
  const t = content.ui.step3;
  const task = content.taskById[state.task];
  const wrap = el("div");
  wrap.appendChild(header({ location: t.location, title: t.title, intro: t.intro }));

  // Собранная цепочка: выбранные на шаге 2 инструменты (или подсказка задачи),
  // показана до результата, чтобы читалась последовательность сборки.
  // Пересобирается после обмена инструментов, поэтому вынесена в функцию.
  const chainRow = el("div", { class: "chain-row" });
  function renderChain() {
    chainRow.innerHTML = "";
    const chainTools = (state.tools.selected.length ? state.tools.selected : (content.taskTools[state.task]?.reco || []))
      .map((id) => content.toolById[id]).filter(Boolean);
    chainTools.forEach((tl, i) => {
      if (i) chainRow.appendChild(el("span", { class: "chain-arrow" }, "→"));
      chainRow.appendChild(el("div", { class: "chain-node" },
        el("span", { class: "chain-name" }, tl.name),
        el("span", { class: "chain-role" }, tl.role)
      ));
    });
  }

  const stage = el("div", { class: "stage" });
  const consequence = el("p", { class: "consequence", "aria-live": "polite" });
  const foot = nav(ctx, { nextLabel: t.button, disabled: !state.step3Choice });

  // Последствие учитывает задачу; общий текст остаётся запасным.
  const consequenceFor = (id) => task.check?.[id]?.consequence || content.step3Consequence[id];
  // Какие способности не закрыты выбранной тройкой. Пусто — пилот собран целиком.
  const gaps = () => content.pilotGaps(state.task, state.tools.selected);

  // Пилот собран целиком: результат на реальном случае и выбор «Достаточно/Доработать».
  function showWorkingResult() {
    stage.innerHTML = "";
    stage.appendChild(el("div", { class: "field" },
      el("div", { class: "legend" }, t.resultLabel),
      el("div", { class: "callout" }, task.example)
    ));
    const choice = choiceRow(
      [{ id: "enough", label: t.enoughLabel }, { id: "refine", label: t.refineLabel }],
      state.step3Choice,
      (id) => {
        state.step3Choice = id;
        ctx.update();
        consequence.textContent = consequenceFor(id);
        foot.querySelector(".primary").disabled = false;
        ctx.storage.track("test_decision", { decision: id });
      }
    );
    stage.appendChild(fieldset(t.question, choice));
    if (state.step3Choice) consequence.textContent = consequenceFor(state.step3Choice);
  }

  // Пилот собрался не весь: называем недостающие способности и даём поменять
  // инструмент в том же бюджете, затем собрать заново. Провала нет.
  function showGapResult(missing) {
    if (state.step3Choice) { state.step3Choice = null; ctx.update(); }
    foot.querySelector(".primary").disabled = true;
    consequence.textContent = "";
    stage.innerHTML = "";
    const box = el("div", { class: "field gap" },
      el("div", { class: "legend" }, t.gapResultLabel),
      el("p", { class: "gap-lead" }, t.gapLead)
    );
    const ul = el("ul", { class: "gap-list" });
    for (const a of missing) ul.appendChild(el("li", {}, a.miss));
    box.append(ul, el("p", { class: "gap-hint" }, t.swapHint), toolSwap(),
      el("button", { class: "primary build", onclick: () => { renderChain(); runBuild(); } }, t.rebuildButton));
    stage.appendChild(box);
    ctx.storage.track("pilot_gap", { missing: missing.map((a) => a.need), set: [...state.tools.selected] });
  }

  // Компактный обмен инструментов: тот же источник (state.tools.selected) и тот
  // же бюджет в три, что на шаге 2. Рекомендованные помечены. Нового состояния нет.
  function toolSwap() {
    const reco = new Set((content.taskTools[state.task] || { reco: [] }).reco);
    const max = content.ui.step2.maxTools;
    const grid = el("div", { class: "tool-swap" });
    const note = el("div", { class: "error", role: "alert" });
    content.tools.forEach((tool) => {
      const sel = state.tools.selected;
      const on = () => sel.includes(tool.id);
      const chip = el("button", {
        type: "button",
        class: "swap-chip" + (on() ? " selected" : "") + (reco.has(tool.id) ? " reco" : ""),
        "aria-pressed": on() ? "true" : "false"
      }, tool.name);
      chip.addEventListener("click", () => {
        const i = sel.indexOf(tool.id);
        if (i >= 0) sel.splice(i, 1);
        else if (sel.length >= max) { note.textContent = content.ui.step2.fourthAttempt; return; }
        else sel.push(tool.id);
        note.textContent = "";
        chip.classList.toggle("selected", on());
        chip.setAttribute("aria-pressed", on() ? "true" : "false");
        ctx.update();
      });
      grid.appendChild(chip);
    });
    return el("div", { class: "swap-wrap" }, grid, note);
  }

  function resolveResult() {
    const missing = gaps();
    if (missing.length === 0) {
      ctx.storage.track("pilot_covered", { set: [...state.tools.selected] });
      showWorkingResult();
    } else {
      showGapResult(missing);
    }
  }

  // Короткая анимация сборки: узлы цепочки зажигаются по очереди, затем результат.
  // При prefers-reduced-motion анимацию пропускаем и сразу показываем результат.
  function runBuild() {
    const nodes = [...chainRow.querySelectorAll(".chain-node")];
    const reduce = typeof window !== "undefined" && window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { nodes.forEach((n) => n.classList.add("lit")); resolveResult(); return; }
    stage.innerHTML = "";
    stage.appendChild(el("div", { class: "building" }, el("span", {}, t.buildingText)));
    let i = 0;
    const lit = () => {
      if (i < nodes.length) { nodes[i].classList.add("lit"); i += 1; setTimeout(lit, 340); }
      else setTimeout(resolveResult, 300);
    };
    lit();
  }

  renderChain();
  if (state.step3Choice && gaps().length === 0) {
    // Возврат на шаг: пилот собран, результат показываем сразу.
    chainRow.querySelectorAll(".chain-node").forEach((n) => n.classList.add("lit"));
    showWorkingResult();
  } else {
    // Первый заход, либо тройку поменяли и она больше не покрывает задачу.
    if (state.step3Choice) { state.step3Choice = null; ctx.update(); }
    stage.appendChild(el("button", { class: "ghost build", onclick: runBuild }, t.buildButton));
  }

  wrap.append(el("div", { class: "legend" }, t.chainLabel), chainRow, stage, consequence, foot);
  return wrap;
}

// ── Шаг 4. Публикация: выбор канала под задачу ────────────────
function step4(ctx) {
  const { content, state } = ctx;
  const t = content.ui.step4;
  const tc = content.taskChannels[state.task] || { reco: content.channels.map((c) => c.id), text: "" };
  const recoId = tc.reco[0];
  const wrap = el("div");

  const locFor = () =>
    content.channelById[state.publishChannel]?.loc || content.channelById[recoId]?.loc || t.location;
  const head = header({ location: locFor(), title: t.title, intro: t.intro });
  wrap.appendChild(head);
  wrap.appendChild(el("p", { class: "reco-line" }, tc.text));

  const body = el("div");                       // переключается: рекомендация ↔ полный список
  const reqBox = el("div", { class: "requirements" });
  const msg = el("div", { class: "error", role: "alert" });
  const foot = nav(ctx, {
    nextLabel: t.button,
    onNext: () => { if (!state.publishChannel) { msg.textContent = t.earlyAttempt; return; } ctx.next(); }
  });
  foot.querySelector(".primary").disabled = !state.publishChannel;

  // Канал объясняем пользовательским сценарием, внутренние названия — вторым уровнем.
  // В списке выбора это кнопка (доступна с клавиатуры), в рекомендации — просто карточка.
  function channelCard(ch, selected, interactive) {
    const props = { class: "channel-card" + (selected ? " selected" : ""), "data-id": ch.id };
    if (interactive) { props.type = "button"; props["aria-pressed"] = selected ? "true" : "false"; }
    return el(interactive ? "button" : "div", props,
      el("div", { class: "channel-name" }, ch.name),
      el("div", { class: "channel-scenario" }, ch.scenario),
      el("div", { class: "channel-behind" }, t.behindLabel + ": " + ch.tools)
    );
  }

  // Требования списком, без чекбоксов — не имитируем сделанную разработку.
  function showRequirements(id) {
    const ch = content.channelById[id];
    reqBox.innerHTML = "";
    if (!ch) return;
    reqBox.appendChild(el("div", { class: "legend" }, t.requirementsLabel));
    const ul = el("ul", { class: "req-list" });
    for (const r of ch.requirements) ul.appendChild(el("li", {}, r));
    reqBox.appendChild(ul);
  }

  let expanded = state.publishChannel && state.publishChannel !== recoId;
  function select(id) {
    state.publishChannel = id;
    ctx.update();
    ctx.storage.track("channel_selected", { channel: id, wasRecommended: tc.reco.includes(id) });
    const locEl = head.querySelector(".loc");
    if (locEl) locEl.textContent = locFor();
    foot.querySelector(".primary").disabled = false;
    msg.textContent = "";
    showRequirements(id);
    renderBody();
  }

  function renderBody() {
    body.innerHTML = "";
    if (!expanded) {
      // Рекомендация: предлагаем подходящий канал, игрок принимает одно решение.
      body.appendChild(channelCard(content.channelById[recoId], state.publishChannel === recoId, false));
      body.appendChild(el("div", { class: "channel-actions" },
        el("button", { class: "primary wide", onclick: () => select(recoId) }, t.fits),
        el("button", { class: "ghost wide", onclick: () => { expanded = true; renderBody(); } }, t.chooseOther)
      ));
    } else {
      // Смена канала: открываются четыре варианта.
      body.appendChild(el("div", { class: "legend" }, t.otherLabel));
      const list = el("div", { class: "channel-list" });
      for (const ch of content.channels) {
        const card = channelCard(ch, state.publishChannel === ch.id, true);
        card.classList.add("selectable");
        card.addEventListener("click", () => select(ch.id));
        list.appendChild(card);
      }
      body.appendChild(list);
    }
  }

  renderBody();
  if (state.publishChannel) showRequirements(state.publishChannel);

  wrap.append(body, reqBox, msg, foot);
  return wrap;
}

// ── Шаг 5. Наблюдение и решение ───────────────────────────────
// Ветка выбирается по признаку свободной формулировки: числовая показывает
// плитки и три решения, свободная — выбор наблюдения и строку последствия.
function step5(ctx) {
  const { content, state } = ctx;
  const task = content.taskById[state.task];
  const wrap = el("div");
  const taskLabel = state.task === "own" ? (state.ownTaskText.trim() || task.title) : task.title;
  return state.hypothesis.freeform ? step5Free(ctx, wrap, taskLabel) : step5Numeric(ctx, wrap, taskLabel);
}

function step5Numeric(ctx, wrap, taskLabel) {
  const { content, state } = ctx;
  const t = content.ui.step5;
  const task = content.taskById[state.task];
  const h = state.hypothesis;
  wrap.appendChild(header({ task: taskLabel, location: t.location, title: t.title, intro: t.intro }));

  // Плитки из чисел задачи и выбора шага 1: было / стало / проверено. «Стало» подсвечено.
  const tm = content.taskMetrics[state.task];
  const m = tm[h.resultChoice] || tm[content.taskResultIds(state.task)[0]];
  const goal = m.goals.find((g) => g.id === h.goalChoice) || m.goals[0];

  wrap.appendChild(el("div", { class: "legend" }, t.metricsLabel));
  wrap.appendChild(el("div", { class: "metrics" },
    metric(t.tileWas, m.nowShort),
    metric(t.tileNow, goal.actual, true),
    metric(t.tileSample, `${h.sampleSize} ${tm.sampleUnit}`)
  ));
  wrap.appendChild(el("p", { class: "goal-line" }, tpl(t.goalLineTemplate, { target: goal.targetShort })));

  // После «Доработать» показываем другую по природе поломку, чтобы доработка
  // на шаге 3 не обесценивалась.
  const problemText = state.step3Choice === "refine" ? (task.problemAfterRefine || task.problem) : task.problem;
  wrap.appendChild(el("div", { class: "callout" }, problemText));

  const consequence = el("p", { class: "consequence", "aria-live": "polite" });
  const foot = nav(ctx, { nextLabel: t.button, disabled: !state.step5Choice });
  if (state.step5Choice) consequence.textContent = content.step5Consequence[state.step5Choice];

  const choice = choiceRow(
    [{ id: "fix", label: t.fixLabel }, { id: "scale", label: t.scaleLabel }, { id: "stop", label: t.stopLabel }],
    state.step5Choice,
    (id) => {
      state.step5Choice = id;
      state.finalVariant = id;   // решение определяет вариант финала (раздел 13)
      ctx.update();
      consequence.textContent = content.step5Consequence[id];
      foot.querySelector(".primary").disabled = false;
      ctx.storage.track("monitor_decision", { decision: id });
    }
  );

  const hints = el("ul", { class: "hints" });
  for (const hh of t.hints) hints.appendChild(el("li", {}, hh));

  wrap.append(fieldset(t.question, choice), consequence, hints, foot);
  return wrap;
}

// Свободная ветка: чисел не было. Игрок называет, за чем будет следить; блока
// «что делаешь» и трёх решений нет, финал уходит в вариант watch.
function step5Free(ctx, wrap, taskLabel) {
  const { content, state } = ctx;
  const t = content.ui.step5;
  wrap.appendChild(header({ task: taskLabel, location: t.location, title: t.titleFree, intro: t.introFree }));

  if (!state.step5Watch) state.step5Watch = content.watchOptions[0].id;
  state.finalVariant = "watch";    // свободная ветка всегда ведёт в наблюдение
  state.step5Choice = null;
  ctx.update();

  const consequence = el("p", { class: "consequence", "aria-live": "polite" });
  const ownField = el("input", {
    class: "text-field watch-own", type: "text", maxlength: WATCH_OWN_MAX,
    placeholder: t.watchOwnPlaceholder, "aria-label": t.watchOwnPlaceholder
  });
  ownField.value = state.step5WatchOwn || "";
  const ownWrap = el("div", { class: "watch-own-wrap", style: "display:none" }, ownField);

  const updateConsequence = () => { consequence.textContent = tpl(t.watchConsequenceTemplate, { what: content.watchWhat(state) }); };
  const updateOwn = () => { ownWrap.style.display = state.step5Watch === "own" ? "" : "none"; };
  ownField.addEventListener("input", () => { state.step5WatchOwn = ownField.value; ctx.update(); updateConsequence(); });

  const choice = choiceRow(
    content.watchOptions.map((o) => ({ id: o.id, label: o.short })),
    state.step5Watch,
    (id) => { state.step5Watch = id; ctx.update(); updateOwn(); updateConsequence(); ctx.storage.track("watch_chosen", { watch: id }); }
  );

  const hints = el("ul", { class: "hints" });
  for (const hh of t.hints) hints.appendChild(el("li", {}, hh));

  wrap.append(
    fieldset(t.watchQuestion, choice),
    ownWrap,
    consequence,
    hints,
    nav(ctx, { nextLabel: t.button })   // вариант предвыбран, кнопка активна
  );
  updateOwn();
  updateConsequence();
  return wrap;
}

// ── Экран 6. Финал ────────────────────────────────────────────
function final(ctx) {
  const { content, state } = ctx;
  const f = content.final;
  const task = content.taskById[state.task];
  // Вариант финала определяется решением шага 5.
  const key = state.finalVariant || state.step5Choice || "scale";
  const isWatch = key === "watch";
  const wrap = el("div", { class: "final" });

  // У своей задачи в карточку идёт введённый текст, а не заглушка карточки.
  const taskLabel = state.task === "own" ? (state.ownTaskText.trim() || task.title) : task.title;
  // Строка проверки: в свободной ветке — что игрок наблюдает; в числовой — размер выборки.
  const checkNote = isWatch
    ? `смотрю ${content.watchWhat(state)}, вернусь через две недели`
    : buildHypothesisParts(state.task, state.hypothesis.resultChoice, state.hypothesis.goalChoice, state.hypothesis.sampleSize, state.ownTaskText.trim()).check;

  // ── Герой финала: метка места, крупное решение (главное сообщение экрана),
  // одна фраза-итог. Решение — единственный h1, на него уходит фокус при входе.
  const hero = el("div", { class: "final-hero" },
    el("div", { class: "final-badge" }, f.metaBadge),
    el("div", { class: "final-hero-row" },
      el("h1", { class: "final-decision", tabindex: "-1" }, f.heroTitles[key] || f.heroTitles.scale),
      elSvg("div", "final-conveyor", CONVEYOR_SVG)
    ),
    el("p", { class: "final-decision-sub" }, f.heroSubtitles[key] || f.heroSubtitles.scale)
  );
  wrap.appendChild(hero);

  // ── Карточка «Твой пилот»: компактная сводка в четыре строки. Инструменты,
  // режим и канал остаются в state и в копируемом тексте, но здесь не выводятся.
  const kv = (label, value) =>
    value ? el("div", { class: "kv" }, el("b", {}, label + ": "), value) : null;
  wrap.appendChild(el("div", { class: "final-card" },
    el("div", { class: "final-card-title" }, f.cardTitle),
    kv(f.cardTaskLabel, taskLabel),
    kv(f.cardHypothesisLabel, content.hypothesisText(state)),
    kv(f.cardCheckLabel, checkNote),
    kv(f.cardDecisionLabel, f.cardDecisionNames[key] || f.cardDecisionNames.scale)
  ));

  // ── Скопировать план: вторичное действие с иконкой, не primary. Механика
  // buildShareText и clipboard без изменений. Всё копирование программное; на
  // редкий полный отказ показываем короткую подпись прямо на кнопке.
  const shareText = buildShareText(state);
  const copyBtn = elSvg("button", "ghost copy-plan", COPY_SVG, f.copyButton);
  copyBtn.addEventListener("click", onCopy);
  const copyLabel = copyBtn.querySelector(".btn-label");
  let copyTimer = null;
  function flash(text) {
    copyLabel.textContent = text;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copyLabel.textContent = f.copyButton; }, 2000);
  }
  function tryLegacy() {   // execCommand требует выделения и живёт внутри жеста
    const ta = el("textarea", {
      readonly: true, "aria-hidden": "true",
      style: "position:fixed;top:0;left:0;opacity:0;pointer-events:none"
    });
    ta.value = shareText;
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    let ok = false;
    try { ok = !!(document.execCommand && document.execCommand("copy")); } catch { ok = false; }
    ta.remove();
    return ok;
  }
  function onCopy() {
    // Метрика — доля дошедших, кто нажал копирование: одно событие на сессию.
    if (!state.copied) { state.copied = true; ctx.update(); ctx.storage.track("summary_copied", {}); }
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(shareText).then(() => flash(f.copyDone)).catch(() => flash(tryLegacy() ? f.copyDone : f.copyFail));
    } else {
      flash(tryLegacy() ? f.copyDone : f.copyFail);
    }
  }
  wrap.appendChild(el("div", { class: "copy-block" }, copyBtn));

  // ── Код подарка: самый заметный блок после решения. Значение — из giftCode.
  // Показ финала фиксируется через final_viewed при входе на экран.
  const code = giftCode(state.runId);
  wrap.appendChild(el("div", { class: "code" },
    el("div", { class: "code-top" }, f.codeTop),
    el("div", { class: "code-value" }, code),
    el("div", { class: "code-bottom" }, f.codeBottom)
  ));

  // ── Один сценарий контакта после игры: primary раскрывает форму. На подарок не
  // влияет, повторно не спрашивается. Контакт хранится отдельно от прогресса.
  const contactForm = el("div", { class: "contact-form", style: "display:none" });
  const contactInput = el("input", {
    class: "text-field", type: "text", placeholder: f.contactPlaceholder, "aria-label": f.contactPlaceholder
  });
  contactInput.value = state.contact || "";

  const openContact = el("button", {
    class: "primary wide",
    onclick: () => { contactForm.style.display = ""; openContact.style.display = "none"; contactInput.focus(); }
  }, f.contactCta);

  contactForm.append(el("p", { class: "cta-sub" }, f.contactExplain), contactInput);

  // Короткое поле задачи — только если её не вводили раньше (не «своя задача»).
  if (state.task !== "own") {
    const taskInput = el("input", {
      class: "text-field", type: "text", placeholder: f.contactTaskPlaceholder, "aria-label": f.contactTaskPlaceholder
    });
    taskInput.value = state.ownTaskText || "";
    taskInput.addEventListener("input", () => { state.ownTaskText = taskInput.value; ctx.update(); });
    contactForm.appendChild(taskInput);
  }

  const contactMsg = el("div", { class: "contact-msg", role: "status", "aria-live": "polite" });
  const setMsg = (text, kind) => { contactMsg.textContent = text; contactMsg.className = "contact-msg" + (kind ? " " + kind : ""); };
  // Похоже на почту или на ник — иначе объясняем рядом с полем.
  const validFormat = (v) => /^\S+@\S+\.\S+$/.test(v) || /^@?[\wА-Яа-яЁё.\-]{2,}$/.test(v);

  let sending = false;
  const contactBtn = el("button", { class: "primary wide", onclick: submitContact }, f.contactSend);
  function submitContact() {
    if (sending || state.contactSent) return;            // без дублей
    const val = contactInput.value.trim();
    if (!val) { setMsg(f.contactNeedField, "error"); contactInput.focus(); return; }
    if (!validFormat(val)) { setMsg(f.contactBadFormat, "error"); contactInput.focus(); return; }
    sending = true; contactBtn.disabled = true; setMsg(f.contactSending, "");
    state.contact = val; ctx.update();
    ctx.storage.saveContact(val, { sessionId: state.runId, task: state.ownTaskText || task.title })
      .then(() => {
        state.contactSent = true; ctx.update();
        setMsg(f.contactOk, "ok"); contactBtn.textContent = f.contactSent;   // остаётся disabled — без дублей
      })
      .catch(() => {
        ctx.storage.track("network_error", { operation: "save_contact", step: "final" });
        setMsg(content.system.contactError, "error");
        sending = false; contactBtn.disabled = false; contactBtn.textContent = f.contactRetry;
      });
  }
  contactForm.append(contactBtn, contactMsg);

  // Если контакт уже отправлен, показываем форму раскрытой и завершённой.
  if (state.contactSent) {
    contactForm.style.display = ""; openContact.style.display = "none";
    contactBtn.disabled = true; contactBtn.textContent = f.contactSent; setMsg(f.contactOk, "ok");
  }
  wrap.appendChild(el("div", { class: "final-contact" },
    el("p", { class: "final-contact-prompt" }, f.taskPrompt),
    openContact, contactForm
  ));

  // ── Переход в анкету: вторичное текстовое действие, не primary и без «Назад».
  // Финал остаётся терминальным состоянием игры, поэтому nav() тут не используем.
  wrap.appendChild(el("div", { class: "final-anketa" },
    el("button", { class: "link-action", type: "button", onclick: () => ctx.next() }, f.toAnketa)
  ));
  return wrap;
}

// ── Экран 7. Анкета ───────────────────────────────────────────
function anketa(ctx) {
  const { content, state } = ctx;
  const a = content.anketa;
  const wrap = el("div");
  wrap.appendChild(header({ title: a.title, intro: a.intro }));

  // Вопрос «чего не хватило» предзаполняем тем, что отмечено на шаге 2.
  const gapLabels = state.tools.gaps
    .map((id) => content.gapOptions.find((g) => g.id === id)?.label)
    .filter(Boolean).join(", ");

  const inputs = [];
  a.questions.forEach((q) => {
    const input = el("input", { class: "text-field", type: "text" });
    if (q.prefill === "gaps" && gapLabels) input.value = gapLabels;
    inputs.push(input);
    wrap.appendChild(fieldset(q.text, input));
  });

  const done = el("div", { class: "thanks", style: "display:none", role: "status", "aria-live": "polite" }, a.thanks);
  const restart = el("button", { class: "ghost restart", style: "display:none", onclick: () => ctx.restart() }, "Пройти заново");
  let submitted = false;
  const submitBtn = el("button", {
    class: "primary",
    onclick: () => {
      if (submitted) return;               // повторное нажатие не создаёт дубликаты
      submitted = true; submitBtn.disabled = true;
      const answers = inputs.map((inp) => inp.value.trim());
      // В локальную аналитику — только признаки заполнения, без сырого текста.
      const fields = answers.map((a) => a.length > 0);
      ctx.storage.track("survey_submitted", { fields, filled: fields.filter(Boolean).length });
      // В форму — человекочитаемая сводка прохождения с ответами анкеты (kind=summary).
      const summary = content.buildSummary(state, answers);
      ctx.storage.submitForm({
        kind: "summary", sessionId: state.runId, task: state.task,
        decision: summary.decision, answer1: summary.answer1, answer2: summary.answer2,
        payload: JSON.stringify(summary)
      }).catch(() => { /* лучшее усилие */ });
      done.style.display = "";
      restart.style.display = "";
    }
  }, a.button);
  const foot = el("footer", { class: "nav" },
    el("button", { class: "ghost", onclick: () => ctx.back() }, "← Назад"),
    submitBtn
  );
  wrap.append(foot, done, restart);
  return wrap;
}

export const screens = { step0, step1, step2, step3, step4, step5, final, anketa };
