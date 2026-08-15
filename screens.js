// Рендер восьми экранов с интеракциями. Каждый экран читает и пишет состояние
// прохождения, ветвление по выбранной задаче подставляет данные в шаблоны,
// каждый экран оставляет игроку промежуточный итог и кнопку дальше.

import { el, tpl } from "./dom.js";
import { resetDependentOnTask, buildHypothesis, buildHypothesisParts, buildShareText } from "./data.js";
import { taskIcons } from "./task-icons.js";

const HYP_MAX = 220;      // предел длины гипотезы
const WATCH_OWN_MAX = 80; // название метрики в свободной ветке — короткое

// Карандаш правки карточки гипотезы.
const PENCIL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

// Иконка копирования — для вторичной кнопки «Скопировать план» на финале.
const COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

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
      class: "choice " + extraClass + (opt.note ? " with-note" : "") + (selected === opt.id ? " selected" : ""),
      "aria-pressed": selected === opt.id ? "true" : "false",
      onclick: () => {
        [...row.children].forEach((c) => { c.classList.remove("selected"); c.setAttribute("aria-pressed", "false"); });
        btn.classList.add("selected");
        btn.setAttribute("aria-pressed", "true");
        onPick(opt.id);
      }
    }, opt.note
      ? el("span", { class: "choice-lines" },
          el("span", { class: "choice-label" }, opt.label),
          el("span", { class: "choice-note" }, opt.note))
      : opt.label);
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
        taskIconEl(task.id),
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
      // Подпись называет показатель одним словом, вторая строка даёт текущее
      // значение: без неё «Время» и «Срок» на кнопках не различить до выбора.
      choiceRow(resultIds.map((id) => ({ id, label: tm[id].label, note: tm[id].chip })), h.resultChoice, (id) => {
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
  const isOwn = state.task === "own";
  const tt = content.taskTools[state.task] || { reco: [], alt: [] };
  const mainIds = [...tt.reco, ...tt.alt];                    // основной экран: рекомендации + альтернативы
  // Агентские фреймворки — основное направление платформы, поэтому они видны сразу
  // после LLM, без раскрытия полного списка. Рекомендованный набор под задачу и
  // бюджет это не меняет: reco остаётся прежним.
  if (!mainIds.includes("agents")) {
    const i = mainIds.indexOf("llm");
    mainIds.splice(i >= 0 ? i + 1 : mainIds.length, 0, "agents");
  }
  const restIds = content.tools.map((x) => x.id).filter((id) => !mainIds.includes(id));
  const wrap = el("div");
  wrap.appendChild(header({ location: t.location, title: t.title, intro: t.intro }));

  // Доработка: пилот уже тестировали, часть бюджета потрачена безвозвратно.
  if (state.refine) wrap.appendChild(el("div", { class: "refine-banner" }, t.refineBanner));

  // Бюджет пилота: строка «осталось», шкала потраченного и подпись. Оформлен как
  // индикатор, а не как карточка инструмента, чтобы не путать с выбором.
  const budgetBar = el("div", { class: "budget" });
  const budgetLeftEl = el("span", { class: "budget-left" });
  const budgetSpentEl = el("span", { class: "budget-spent" });
  const budgetFill = el("div", { class: "budget-fill" });
  budgetBar.append(
    el("div", { class: "budget-row" },
      el("span", { class: "budget-title" }, t.budgetTitle),
      budgetLeftEl
    ),
    el("div", { class: "budget-track" }, budgetFill),
    el("div", { class: "budget-row budget-foot" },
      el("span", { class: "budget-note" }, content.budgetNote),
      budgetSpentEl
    )
  );
  wrap.appendChild(budgetBar);

  const msg = el("div", { class: "error", role: "alert" });
  const chain = el("p", { class: "chain" });
  const list = el("div", { class: "tool-list" });
  const foot = nav(ctx, { nextLabel: state.refine ? t.refineButton : t.button });

  const canAfford = (id) => state.tools.purchased.includes(id) || content.toolCost(id) <= content.budgetLeft(state);

  function refresh() {
    const sel = state.tools.selected;
    const left = content.budgetLeft(state);
    const spent = content.budgetSpent(state);
    budgetLeftEl.textContent = tpl(t.budgetLeftTemplate, { left, total: content.pilotBudget });
    budgetSpentEl.textContent = tpl(t.budgetSpentTemplate, { spent });
    budgetLeftEl.classList.toggle("low", left <= 15);
    budgetFill.style.width = Math.min(100, Math.round((spent / content.pilotBudget) * 100)) + "%";
    budgetFill.classList.toggle("low", left <= 15);
    // Недоступные по остатку карточки: выключаем и подписываем, чего не хватает.
    wrap.querySelectorAll(".tool").forEach((c) => {
      const id = c.getAttribute("data-id");
      const on = sel.includes(id);
      const afford = state.tools.purchased.includes(id) || content.toolCost(id) <= left;
      const blocked = !on && !afford;
      c.classList.toggle("blocked", blocked);
      c.disabled = blocked;
      const need = c.querySelector(".tool-need");
      if (need) need.textContent = blocked ? tpl(t.cantAffordTemplate, { n: content.toolCost(id) - left }) : "";
      const free = c.querySelector(".tool-free");
      if (free) free.style.display = (state.refine && state.tools.purchased.includes(id) && !on) ? "" : "none";
    });
    // Строка сборки: как выбранные инструменты работают вместе.
    chain.textContent = sel.length
      ? sel.map((id) => { const tl = content.toolById[id]; return tl ? `${tl.name} ${tl.role}` : ""; }).filter(Boolean).join(", ") + "."
      : "";
  }

  function toolCard(tool) {
    const on = state.tools.selected.includes(tool.id);
    const card = el("button", {
      type: "button",
      class: "tool selectable" + (on ? " selected" : ""),
      "data-id": tool.id,
      "aria-pressed": on ? "true" : "false"
    },
      el("div", { class: "tool-head" },
        el("span", { class: "tool-name" }, tool.name),
        el("span", { class: "tool-cost" }, String(tool.cost))
      ),
      el("div", { class: "tool-explain" }, tool.explain),
      el("span", { class: "tool-need" }),
      el("span", { class: "tool-free", style: "display:none" }, "уже куплен, включается бесплатно")
    );
    card.addEventListener("click", () => {
      const sel = state.tools.selected;
      const i = sel.indexOf(tool.id);
      let action;
      if (i >= 0) {
        sel.splice(i, 1); action = "removed";
        ctx.storage.track("tool_removed", { tool: tool.id, count: sel.length });
      } else if (!canAfford(tool.id)) {
        msg.textContent = tpl(t.cantAffordTemplate, { n: content.toolCost(tool.id) - content.budgetLeft(state) });
        ctx.storage.track("budget_exhausted", { tool: tool.id, set: [...sel] });
        return;
      } else {
        sel.push(tool.id); action = "added"; msg.textContent = "";
        ctx.storage.track("tool_selected", { tool: tool.id, count: sel.length });
      }
      card.classList.toggle("selected", sel.includes(tool.id));
      card.setAttribute("aria-pressed", sel.includes(tool.id) ? "true" : "false");
      ctx.update(); refresh();
    });
    return card;
  }

  for (const id of mainIds) list.appendChild(toolCard(content.toolById[id]));

  // Остальные инструменты — под раскрытие той же сеткой, что основной список, не
  // удлиняют основной путь. «Свернуть» показываем в конце раскрытого списка, а
  // рядом — явный индикатор полного набора, чтобы игрок хоть раз увидел все десять.
  const moreWrap = el("div", { class: "tool-list more-tools", style: "display:none" });
  for (const id of restIds) moreWrap.appendChild(toolCard(content.toolById[id]));
  const moreToggle = el("button", {
    class: "linklike more-toggle",
    onclick: () => {
      const open = moreWrap.style.display === "";
      moreWrap.style.display = open ? "none" : "";
      moreToggle.textContent = open ? t.allToolsToggle : t.collapseToolsLabel;
      refresh();
    }
  }, t.allToolsToggle);

  // «Подсказать»: мягко подсвечиваем ключевые инструменты. Только для готовых
  // кейсов — свою задачу игра не знает достаточно, чтобы советовать стек.
  const hintNote = el("p", { class: "hint-note", style: "display:none" });
  const hintBtn = isOwn ? null : el("button", {
    class: "ghost small hint-btn",
    type: "button",
    onclick: () => {
      ctx.storage.track("hint_requested", { task: state.task });
      hintNote.style.display = "";
      hintNote.textContent = t.hintText;
      const sc = content.taskScenarios[state.task];
      if (!sc) return;
      wrap.querySelectorAll(".tool").forEach((c) => {
        const rel = sc.toolEffects[c.getAttribute("data-id")]?.relevance;
        c.classList.toggle("hinted", rel === "core");
      });
    }
  }, t.hintButton);

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

  // Пустую цепочку дальше не пускаем — проверять нечего.
  foot.querySelector(".primary").addEventListener("click", (e) => {
    if (state.tools.selected.length === 0) { e.stopImmediatePropagation(); msg.textContent = t.emptyChainError; }
  }, true);

  wrap.append(list, moreWrap, moreToggle);
  if (hintBtn) wrap.append(el("div", { class: "tool-actions" }, hintBtn), hintNote);
  wrap.append(chain, msg, gapsToggle, gapsWrap, foot);
  refresh();
  return wrap;
}

// ── Шаг 3. Сборка и проверка ──────────────────────────────────
function step3(ctx) {
  const { content, state } = ctx;
  const t = content.ui.step3;
  const task = content.taskById[state.task];
  const freeform = state.hypothesis.freeform;   // своя задача и любой свободный ввод — без симуляции
  const wrap = el("div");
  wrap.appendChild(header({ location: t.location, title: t.title, intro: t.intro }));

  // Собранная цепочка из активных инструментов, в порядке выбора.
  const chainRow = el("div", { class: "chain-row" });
  function renderChain() {
    chainRow.innerHTML = "";
    const chainTools = state.tools.selected.map((id) => content.toolById[id]).filter(Boolean);
    chainTools.forEach((tl, i) => {
      // В плашке только название: роль каждого инструмента разбирается текстом
      // до запуска (разбор набора) и после него (роль инструментов).
      // Стрелка лежит в одной ячейке со своей плашкой, поэтому при переносе
      // цепочки на вторую строку она уезжает вместе с ней, а не висит хвостом.
      const node = el("div", { class: "chain-node" },
        el("span", { class: "chain-name" }, tl.chainName || tl.name));
      chainRow.appendChild(i
        ? el("div", { class: "chain-cell" }, el("span", { class: "chain-arrow" }, "→"), node)
        : el("div", { class: "chain-cell" }, node));
    });
  }

  const stage = el("div", { class: "stage" });
  const consequence = el("p", { class: "consequence", "aria-live": "polite" });
  // Главное действие шага живёт внизу, как на остальных шагах: до теста это
  // «Запустить тест», после — переход к шагу 4. Кнопка одна, меняются подпись
  // и действие, поэтому обработчик зовёт текущее через footAction.
  let footAction = () => ctx.next();
  const foot = nav(ctx, { nextLabel: t.buildButton, onNext: () => footAction() });
  const footBtn = foot.querySelector(".primary");
  function setFoot(label, action, disabled) {
    footBtn.textContent = label;
    footBtn.disabled = !!disabled;
    footAction = action;
  }

  const consequenceFor = (id) => task.check?.[id]?.consequence || content.step3Consequence[id];

  // Своя задача: результата в цифрах нет, показываем универсальные роли компонентов
  // и честную формулировку про следующий шаг. Ни бэндов, ни выдуманного эффекта.
  function showCustomResult() {
    stage.innerHTML = "";
    stage.appendChild(el("div", { class: "field" },
      el("div", { class: "legend" }, t.resultLabel),
      el("div", { class: "callout" }, t.customResult)
    ));
    setFoot(t.button, () => ctx.next(), false);
  }

  // Готовый кейс: результат зависит от цепочки. Строим вклад каждого инструмента,
  // называем непокрытые ключевые способности, показываем итог по бэнду.
  function showResult() {
    const active = state.tools.selected;
    const sc = content.taskScenarios[state.task];
    const band = content.outcomeBand(state.task, active);
    const out = sc.outcomes[band];

    stage.innerHTML = "";
    setFoot(t.button, () => ctx.next(), state.step3Choice !== "enough");
    stage.appendChild(el("div", { class: "field" },
      el("div", { class: "legend" }, t.resultLabel),
      el("div", { class: "callout" }, out.testResult)
    ));

    // Вклад каждого выбранного инструмента: релевантные объясняют, что дали;
    // нерелевантные честно помечаются как не повлиявшие.
    const contrib = el("ul", { class: "contrib-list" });
    active.forEach((id) => {
      const e = sc.toolEffects[id];
      if (!e) return;
      const irrelevant = e.relevance === "irrelevant";
      contrib.appendChild(el("li", { class: "contrib" + (irrelevant ? " contrib-idle" : "") },
        el("b", {}, content.toolById[id].name + " — "),
        irrelevant ? e.note : e.contribution
      ));
    });
    // Непокрытые ключевые способности — коротко, чтобы читалась причина итога.
    sc.requiredCapabilities.filter((c) => !active.includes(c.tool))
      .forEach((c) => contrib.appendChild(el("li", { class: "contrib contrib-miss" }, "Не закрыто: " + c.label)));
    stage.appendChild(el("div", { class: "field" },
      el("div", { class: "legend" }, t.contributionsLabel), contrib));

    ctx.storage.track("pilot_test_result", { band, set: [...active] });

    // Доработка доступна один раз (testCount < 2). Когда она потрачена, выбирать
    // не из чего, поэтому результат принимаем сами: нажатие ничего не решало бы.
    if (state.testCount >= 2) {
      if (state.step3Choice !== "enough") {
        state.step3Choice = "enough"; state.refine = false; ctx.update();
        ctx.storage.track("test_decision", { decision: "enough", auto: true });
      }
      consequence.textContent = consequenceFor("refine");
      setFoot(t.button, () => ctx.next(), false);
      return;
    }

    const opts = [{ id: "enough", label: t.enoughLabel }, { id: "refine", label: t.refineLabel }];
    const choice = choiceRow(opts, state.step3Choice === "enough" ? "enough" : null, (id) => {
      if (id === "refine") {
        // Счётчик прогонов растёт только после самого прогона: доработанную
        // цепочку игрок запускает заново и видит новый результат отдельно.
        state.refine = true; state.step3Choice = null; ctx.update();
        ctx.storage.track("pilot_refine_selected", { band });
        ctx.back();   // возврат к инструментам, бюджет уже потрачен
        return;
      }
      state.step3Choice = "enough"; state.refine = false; ctx.update();
      consequence.textContent = consequenceFor("enough");
      footBtn.disabled = false;
      ctx.storage.track("test_decision", { decision: "enough" });
    });
    stage.appendChild(fieldset(t.question, choice));
    if (state.step3Choice === "enough") consequence.textContent = consequenceFor("enough");
  }

  // Анимация сборки: узлы цепочки зажигаются по очереди, затем результат.
  function runBuild() {
    ctx.storage.track("pilot_test_started", { set: [...state.tools.selected], testNo: state.testCount + 1 });
    if (state.testCount === 0) state.tools.purchased = [...state.tools.selected];
    state.testCount = Math.min(state.testCount + 1, 2);
    ctx.update();
    const nodes = [...chainRow.querySelectorAll(".chain-node")];
    const reduce = typeof window !== "undefined" && window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const done = () => (freeform ? showCustomResult() : showResult());
    if (reduce) { nodes.forEach((n) => n.classList.add("lit")); done(); return; }
    stage.innerHTML = "";
    stage.appendChild(el("div", { class: "building" }, el("span", {}, t.buildingText)));
    let i = 0;
    const lit = () => {
      if (i < nodes.length) { nodes[i].classList.add("lit"); i += 1; setTimeout(lit, 340); }
      else setTimeout(done, 300);
    };
    lit();
  }

  // Разбор набора до запуска: пока тест не запускали, ничего не списано, поэтому
  // сменить набор здесь бесплатно и это не тратит единственную доработку. После
  // запуска про те же инструменты говорит уже результат теста, но фактом.
  function showPrecheck() {
    stage.innerHTML = "";
    const pre = freeform ? null : content.precheckSet(state.task, state.tools.selected);
    setFoot(t.buildButton, runBuild, false);

    if (!pre || (!pre.extra.length && !pre.missing.length)) {
      // Своей задаче игра не выносит оценку: нужной архитектуры она не знает.
      if (freeform) stage.appendChild(el("p", { class: "precheck-note" }, t.precheckCustomNote));
      return;
    }

    ctx.storage.track("precheck_shown", {
      extra: pre.extra.map((x) => x.id),
      missing: pre.missing.map((m) => m.tool),
      extraCost: pre.extraCost
    });

    if (pre.extra.length) {
      const list = el("ul", { class: "precheck-list" });
      pre.extra.forEach((x) => list.appendChild(el("li", { class: "precheck-item" },
        el("b", {}, x.name + " — "), x.note)));
      stage.appendChild(el("div", { class: "field precheck" },
        el("div", { class: "legend" }, t.precheckExtraTitle),
        el("p", { class: "precheck-lead" }, t.precheckExtraLead),
        list,
        el("p", { class: "precheck-cost" },
          tpl(pre.extra.length > 1 ? t.precheckExtraCostMany : t.precheckExtraCostOne, { n: pre.extraCost }))
      ));
    }

    if (pre.missing.length) {
      const list = el("ul", { class: "precheck-list" });
      pre.missing.forEach((m) => list.appendChild(el("li", { class: "precheck-item precheck-miss" },
        tpl(t.precheckMissingTemplate, { tool: m.toolName, what: m.label }))));
      stage.appendChild(el("div", { class: "field precheck precheck-warn" },
        el("div", { class: "legend" }, t.precheckMissingTitle), list));
    }

    // Недостающее можно добрать прямо здесь, если хватает остатка бюджета; иначе
    // остаётся возврат к набору, где игрок сам решит, чем пожертвовать.
    const add = pre.missing.find((m) => content.toolCost(m.tool) <= content.budgetLeft(state));
    const actions = el("div", { class: "precheck-actions" });
    if (add) actions.appendChild(el("button", {
      class: "ghost wide",
      onclick: () => {
        state.tools.selected.push(add.tool);
        ctx.update();
        ctx.storage.track("precheck_decision", { decision: "add_tool", tool: add.tool });
        renderChain();
        showPrecheck();
      }
    }, tpl(t.precheckAddTemplate, { tool: add.toolName })));
    if (pre.extra.length || !add) actions.appendChild(el("button", {
      class: "ghost wide",
      onclick: () => {
        ctx.storage.track("precheck_decision", { decision: "change_set" });
        ctx.back();
      }
    }, t.precheckChangeButton));
    stage.appendChild(actions);
    // Запуск как есть — то же главное действие шага, поэтому оно внизу вместе с
    // остальными; в теле остаются только развилки «добрать» и «сменить набор».
    setFoot(t.precheckRunButton, () => {
      ctx.storage.track("precheck_decision", {
        decision: "run_as_is", extra: pre.extra.length, missing: pre.missing.length
      });
      runBuild();
    }, false);
  }

  renderChain();
  // В раунде доработки нужен второй прогон: без него новый результат читался бы
  // как продолжение старого экрана, а не как итог изменённой цепочки.
  const runsDone = state.refine ? 2 : 1;
  if (state.testCount >= runsDone) {
    chainRow.querySelectorAll(".chain-node").forEach((n) => n.classList.add("lit"));
    freeform ? showCustomResult() : showResult();
  } else {
    showPrecheck();
  }

  wrap.append(chainRow, stage, consequence, foot);
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
    ctx.storage.track("publication_selected", { channel: id, fit: content.publicationFitOf(state.task, id) });
    const locEl = head.querySelector(".loc");
    if (locEl) locEl.textContent = locFor();
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

  // Плитки было / стало / проверено. «Стало» теперь зависит от качества цепочки
  // (бэнд) и от того, подошёл ли задаче выбранный канал публикации.
  const tm = content.taskMetrics[state.task];
  const resultId = tm[h.resultChoice] ? h.resultChoice : content.taskResultIds(state.task)[0];
  const m = tm[resultId];
  const goal = m.goals.find((g) => g.id === h.goalChoice) || m.goals[0];
  const chainBand = content.outcomeBand(state.task, state.tools.selected);
  const fit = content.publicationFitOf(state.task, state.publishChannel);
  const effBand = content.effectiveBand(chainBand, fit);
  const stalo = content.observedValue(state.task, resultId, goal.id, effBand);

  wrap.appendChild(el("div", { class: "legend" }, t.metricsLabel));
  // Плитка «Проверено»: крупная цифра, а единица и подпись — одной строкой,
  // иначе под числом стояли две подписи разного кегля.
  const sampleTile = metric(
    (tm.sampleUnitCount || tm.sampleUnit) + " " + t.tileSample.toLowerCase(),
    String(h.sampleSize)
  );
  wrap.appendChild(el("div", { class: "metrics" },
    metric(t.tileWas, m.nowShort),
    metric(t.tileNow, stalo, true),
    sampleTile
  ));
  const goalTpl = effBand === "strong" ? t.goalReachedTemplate : effBand === "weak" ? t.goalFlatTemplate : t.goalLineTemplate;
  wrap.appendChild(el("p", { class: "goal-line" }, tpl(goalTpl, { target: goal.targetShort })));

  // Побочный сигнал зависит от наблюдаемого бэнда; неподходящий канал добавляет
  // отдельную строку. Так итог собирается из цепочки и способа публикации.
  const observation = content.taskScenarios[state.task]?.outcomes[effBand]?.observation;
  const problemText = observation || (state.testCount >= 2 ? (task.problemAfterRefine || task.problem) : task.problem);
  const problemBox = el("div", { class: "callout" }, problemText);
  if (fit === "weak") problemBox.appendChild(el("p", { class: "muted", style: "margin:8px 0 0" }, t.pubWeakNote));
  wrap.appendChild(problemBox);

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
      ctx.storage.track("observation_decision", { decision: id });
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
  const key = state.finalVariant || state.step5Choice || "scale";
  const freeform = state.hypothesis.freeform;   // своя задача и любой свободный ввод — черновик без метрик
  const wrap = el("div", { class: "final" });
  const taskLabel = state.task === "own" ? (state.ownTaskText.trim() || task.title) : task.title;
  const kv = (label, value) => value ? el("div", { class: "kv" }, el("b", {}, label + ": "), value) : null;

  const hero = (headline, sub) => el("div", { class: "final-hero" },
    el("div", { class: "final-badge" }, f.metaBadge),
    el("h1", { class: "final-decision", tabindex: "-1" }, headline),
    el("p", { class: "final-decision-sub" }, sub)
  );

  if (freeform) {
    // ── Своя задача: черновик пилота для разговора со стендистом. Ни выдуманных
    // «было → стало», ни оценки качества стека — только собранный черновик.
    const chainNames = state.tools.selected.map((id) => content.toolById[id]?.name).filter(Boolean);
    const channelName = state.publishChannel ? content.channelById[state.publishChannel]?.name : null;
    wrap.appendChild(hero(f.customHeadline, f.customSub));
    wrap.appendChild(el("div", { class: "final-card" },
      el("div", { class: "final-card-title" }, f.recapLabel),
      kv(f.customTaskLabel, taskLabel),
      kv(f.customHypothesisLabel, content.hypothesisText(state)),
      kv(f.customChainLabel, chainNames.join(" → ")),
      kv(f.customChannelLabel, channelName),
      kv(f.customWatchLabel, content.watchWhat(state))
    ));
    wrap.appendChild(el("p", { class: "final-stand-note" }, f.customStandNote));
  } else {
    // ── Готовый кейс: исход, метрики и recap ролей инструментов в этом кейсе.
    const sc = content.taskScenarios[state.task];
    const h = state.hypothesis;
    const tm = content.taskMetrics[state.task];
    const resultId = tm[h.resultChoice] ? h.resultChoice : content.taskResultIds(state.task)[0];
    const m = tm[resultId];
    const goal = m.goals.find((g) => g.id === h.goalChoice) || m.goals[0];
    const chainBand = content.outcomeBand(state.task, state.tools.selected);
    const fit = content.publicationFitOf(state.task, state.publishChannel);
    const effBand = content.effectiveBand(chainBand, fit);
    const overbuilt = content.isOverbuilt(state.task, state);

    const headline = key === "stop" ? f.outcomeStop : overbuilt ? f.outcomeOverbuilt : sc.outcomes[effBand].headline;
    const sub = key === "stop" ? f.outcomeSubStop : overbuilt ? f.outcomeSubOverbuilt : sc.outcomes[effBand].observation;
    wrap.appendChild(hero(headline, sub));

    // Метрики: было / стало / цель / потраченный бюджет.
    wrap.appendChild(el("div", { class: "final-metrics" },
      metric(f.mWas, m.nowShort),
      metric(f.mNow, content.observedValue(state.task, resultId, goal.id, effBand), true),
      metric(f.mGoal, goal.targetShort),
      metric(f.mBudget, String(content.budgetSpent(state)))
    ));

    // «Твой пилот»: роль каждого выбранного инструмента конкретно в этом кейсе.
    const recap = el("div", { class: "final-card" }, el("div", { class: "final-card-title" }, f.recapLabel));
    const list = el("ul", { class: "recap-list" });
    state.tools.selected.forEach((id) => {
      const e = sc.toolEffects[id]; if (!e) return;
      const idle = e.relevance === "irrelevant";
      list.appendChild(el("li", { class: "recap" + (idle ? " recap-idle" : "") },
        el("b", {}, content.toolById[id].name + " — "),
        idle ? e.note : e.contribution));
    });
    recap.appendChild(list);
    // Сколько из выбранного не пригодилось: так ограничение по бюджету получает смысл.
    const idle = content.idleToolCount(state.task, state.tools.selected);
    if (idle) recap.appendChild(el("p", { class: "recap-idle-note" },
      tpl(idle > 1 ? f.recapIdleMany : f.recapIdleOne, { n: idle, total: state.tools.selected.length })));
    const decisionName = f.cardDecisionNames[key] || f.cardDecisionNames.scale;
    recap.appendChild(el("div", { class: "kv recap-decision" },
      el("b", {}, f.recapDecisionLabel + ": "), decisionName.charAt(0).toLowerCase() + decisionName.slice(1) + " пилот"));
    wrap.appendChild(recap);
  }

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

  // ── Один сценарий контакта после игры: primary на всю ширину открывает модальное
  // окно с полями. На подарок не влияет, повторно не спрашивается, контакт хранится
  // отдельно от прогресса.
  const openContact = el("button", { class: "primary full", type: "button", onclick: openContactModal }, f.contactCta);
  if (state.contactSent) { openContact.textContent = f.contactSent; openContact.disabled = true; }

  function openContactModal() {
    if (state.contactSent) return;
    const overlay = el("div", { class: "modal-overlay" });
    const panel = el("div", { class: "modal-panel", role: "dialog", "aria-modal": "true", "aria-label": f.contactCta });
    const close = () => { document.removeEventListener("keydown", onKey); overlay.remove(); openContact.focus(); };
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } else if (e.key === "Tab") trapTab(e, panel); }
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", onKey);

    const contactInput = el("input", { class: "text-field", type: "text", placeholder: f.contactPlaceholder, "aria-label": f.contactPlaceholder });
    contactInput.value = state.contact || "";
    const nodes = [el("h2", { class: "modal-title" }, f.contactCta), el("p", { class: "modal-intro" }, f.contactExplain), contactInput];

    // Короткое поле задачи — только если её не вводили раньше (не «своя задача»).
    if (state.task !== "own") {
      const taskInput = el("input", { class: "text-field", type: "text", placeholder: f.contactTaskPlaceholder, "aria-label": f.contactTaskPlaceholder });
      taskInput.value = state.ownTaskText || "";
      taskInput.addEventListener("input", () => { state.ownTaskText = taskInput.value; ctx.update(); });
      nodes.push(taskInput);
    }

    const contactMsg = el("div", { class: "contact-msg", role: "status", "aria-live": "polite" });
    const setMsg = (text, kind) => { contactMsg.textContent = text; contactMsg.className = "contact-msg" + (kind ? " " + kind : ""); };
    // Похоже на почту или на ник — иначе объясняем рядом с полем.
    const validFormat = (v) => /^\S+@\S+\.\S+$/.test(v) || /^@?[\wА-Яа-яЁё.\-]{2,}$/.test(v);

    let sending = false;
    const sendBtn = el("button", { class: "primary", type: "button" }, f.contactSend);
    const cancelBtn = el("button", { class: "ghost", type: "button", onclick: close }, f.contactClose);
    function submitContact() {
      if (sending || state.contactSent) return;            // без дублей
      const val = contactInput.value.trim();
      if (!val) { setMsg(f.contactNeedField, "error"); contactInput.focus(); return; }
      if (!validFormat(val)) { setMsg(f.contactBadFormat, "error"); contactInput.focus(); return; }
      sending = true; sendBtn.disabled = true; setMsg(f.contactSending, "");
      state.contact = val; ctx.update();
      ctx.storage.saveContact(val, { sessionId: state.runId, task: state.ownTaskText || task.title })
        .then(() => {
          state.contactSent = true; ctx.update();
          setMsg(f.contactOk, "ok"); sendBtn.textContent = f.contactSent;   // остаётся disabled — без дублей
          openContact.textContent = f.contactSent; openContact.disabled = true;
        })
        .catch(() => {
          ctx.storage.track("network_error", { operation: "save_contact", step: "final" });
          setMsg(content.system.contactError, "error");
          sending = false; sendBtn.disabled = false; sendBtn.textContent = f.contactRetry;
        });
    }
    sendBtn.addEventListener("click", submitContact);

    nodes.push(el("div", { class: "modal-actions" }, cancelBtn, sendBtn), contactMsg);
    nodes.forEach((n) => panel.appendChild(n));
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    contactInput.focus();
  }

  wrap.appendChild(el("div", { class: "final-contact" },
    el("p", { class: "final-contact-prompt" }, f.taskPrompt),
    openContact
  ));

  // ── Повтор входного вопроса: измеряет сдвиг в понимании у всех дошедших, а не
  // только у заполнивших анкету. Одна строка, два ответа, своя строка в форме.
  const shiftRow = el("div", { class: "choices" });
  const shiftDone = el("span", { class: "shift-done", role: "status", "aria-live": "polite" });
  [["yes", f.awarenessYes], ["no", f.awarenessNo]].forEach(([id, label]) => {
    const btn = el("button", {
      class: "choice small" + (state.awarenessAfter === id ? " selected" : ""),
      type: "button",
      "aria-pressed": state.awarenessAfter === id ? "true" : "false"
    }, label);
    btn.addEventListener("click", () => {
      if (state.shiftSent) return;                  // отвечаем один раз
      state.awarenessAfter = id;
      state.shiftSent = true;
      ctx.update();
      ctx.storage.track("knows_after_answered", { value: id, before: state.awarenessBefore });
      ctx.storage.submitForm({
        kind: "shift", sessionId: state.runId, task: state.task,
        answer1: id, payload: JSON.stringify({ before: state.awarenessBefore, after: id })
      }).catch(() => { /* лучшее усилие */ });
      shiftRow.querySelectorAll(".choice").forEach((b) => {
        b.classList.toggle("selected", b === btn);
        b.setAttribute("aria-pressed", b === btn ? "true" : "false");
        b.disabled = true;
      });
      shiftDone.textContent = f.awarenessThanks;
    });
    shiftRow.appendChild(btn);
  });
  if (state.shiftSent) {
    shiftRow.querySelectorAll(".choice").forEach((b) => { b.disabled = true; });
    shiftDone.textContent = f.awarenessThanks;
  }
  wrap.appendChild(el("div", { class: "final-shift" },
    el("p", { class: "shift-question" }, f.awarenessRepeat), shiftRow, shiftDone));

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
      // В форму — только ответы анкеты (kind=survey). Сводка прохождения уже ушла
      // при показе финала, эта строка связывается с ней по sessionId.
      ctx.storage.submitForm({
        kind: "survey", sessionId: state.runId, task: state.task,
        decision: state.finalVariant || state.step5Choice || "",
        answer1: answers[0], answer2: answers[1],
        payload: JSON.stringify({ gaps: gapLabels, answers })
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
