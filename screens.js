// Рендер восьми экранов с интеракциями. Каждый экран читает и пишет состояние
// прохождения, ветвление по выбранной задаче подставляет данные в шаблоны,
// каждый экран оставляет игроку промежуточный итог и кнопку дальше.

import { el, tpl } from "./dom.js";
import { resetDependentOnTask, buildHypothesis, buildShareText } from "./data.js";

const HYP_MAX = 220; // предел длины гипотезы

// Заготовка гипотезы одним генератором: buildHypothesis с дефолтными значениями
// задачи. Второго источника (поля seed) больше нет — превью, заготовка и итог
// собираются этим же кодом. У своей задачи в действие подставляется введённый
// текст (state.ownTaskText непустой — этого требует переход с входного экрана).
function defaultHypothesis(state, task) {
  return buildHypothesis(task.id, task.defaultResult, task.defaultCriterion, state.ownTaskText.trim());
}

// ── Общие детали ──────────────────────────────────────────────
function header(cfg) {
  return el("header", { class: "head" },
    cfg.location ? el("div", { class: "loc" }, cfg.location) : null,
    el("h1", { tabindex: "-1" }, cfg.title),   // цель фокуса при переходе на шаг
    cfg.intro ? el("p", { class: "intro" }, cfg.intro) : null
  );
}

function nav(ctx, { nextLabel, disabled, onNext } = {}) {
  const foot = el("footer", { class: "nav" });
  if (ctx.screen !== "step0") {
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
function fieldset(legend, control) {
  const tag = control.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") {
    const id = "fld" + (++fieldSeq);
    control.id = id;
    return el("div", { class: "field" }, el("label", { class: "legend", for: id }, legend), control);
  }
  const id = "grp" + (++fieldSeq);
  control.setAttribute("role", "group");
  control.setAttribute("aria-labelledby", id);
  return el("div", { class: "field" }, el("div", { class: "legend", id }, legend), control);
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

function metric(label, value) {
  return el("div", { class: "metric" },
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

// ── Экран 0. Вход, выбор задачи, базовый вопрос ───────────────
function step0(ctx) {
  const { content, state } = ctx;
  const t = content.ui.step0;
  const wrap = el("div");
  wrap.appendChild(header({ title: t.title, intro: t.intro }));

  const error = el("div", { class: "error", role: "alert" });

  // Поле своей задачи с честным объяснением, без обещания адаптации.
  const ownWrap = el("div", { class: "own-wrap", style: state.task === "own" ? "" : "display:none" });
  const ownField = el("textarea", { class: "own-field", placeholder: t.ownFieldPlaceholder, "aria-label": t.ownFieldLabel });
  ownField.value = state.ownTaskText || "";
  ownField.addEventListener("input", () => { state.ownTaskText = ownField.value; ctx.update(); });
  ownWrap.append(el("p", { class: "own-explain" }, t.ownExplain), ownField);

  const cards = el("div", { class: "cards" });
  for (const task of content.tasks) {
    const card = el("button", {
      class: "card" + (state.task === task.id ? " selected" : ""),
      "aria-pressed": state.task === task.id ? "true" : "false",
      onclick: () => {
        // Смена задачи сбрасывает зависимые данные старой ветки.
        if (state.task && state.task !== task.id) {
          ctx.storage.track("task_changed", { from: state.task, to: task.id });
          resetDependentOnTask(state);
        }
        state.task = task.id;
        ctx.storage.track("task_selected", { taskId: task.id });
        ctx.update();
        [...cards.children].forEach((c) => { c.classList.remove("selected"); c.setAttribute("aria-pressed", "false"); });
        card.classList.add("selected");
        card.setAttribute("aria-pressed", "true");
        ownWrap.style.display = task.id === "own" ? "" : "none";
        error.textContent = "";
      }
    },
      el("div", { class: "card-title" }, task.title),
      el("div", { class: "card-desc" }, task.card)
    );
    cards.appendChild(card);
  }

  const awareness = choiceRow(
    [{ id: "yes", label: t.awarenessYes }, { id: "no", label: t.awarenessNo }],
    state.awarenessBefore,
    (id) => { state.awarenessBefore = id; ctx.update(); error.textContent = ""; ctx.storage.track("knows_before_answered", { value: id }); }
  );

  wrap.append(
    cards,
    ownWrap,
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

// ── Шаг 1. Гипотеза-заготовка ─────────────────────────────────
function step1(ctx) {
  const { content, state } = ctx;
  const t = content.ui.step1;
  const task = content.taskById[state.task];
  const h = state.hypothesis;
  const wrap = el("div");
  wrap.appendChild(header({ location: t.location, title: t.title, intro: t.intro }));

  // Предвыбираем дефолтные результат и способ проверки задачи, чтобы заготовка,
  // превью и итоговая гипотеза собирались одним buildHypothesis.
  if (!h.resultChoice) h.resultChoice = task.defaultResult;
  if (!h.criterionChoice) h.criterionChoice = task.defaultCriterion;

  // Живое превью гипотезы: собирается из выбора результата и критерия,
  // пока игрок не начал править текст руками (тогда правка ведёт превью).
  const preview = el("p", { class: "formula" });
  const editWrap = el("div", { class: "edit-wrap", style: h.edited ? "" : "display:none" });
  const area = el("textarea", { class: "own-field big", maxlength: HYP_MAX, "aria-label": "Текст гипотезы" });
  const charcount = el("div", { class: "charcount" });
  const warn = el("p", { class: "warn" }, t.privacyWarning);
  editWrap.append(area, charcount, warn);

  function updateCharcount() {
    const left = HYP_MAX - area.value.length;
    charcount.textContent = left <= 40 ? tpl(content.system.charsLeftTemplate, { n: left }) : "";
  }
  function syncPreview() {
    if (!h.edited) {
      h.finalText = buildHypothesis(state.task, h.resultChoice, h.criterionChoice, state.ownTaskText.trim());
      area.value = h.finalText;
    }
    preview.textContent = h.finalText;
    ctx.update();
  }
  // Признак правки текста фиксируем один раз, без самого текста в аналитике.
  let editedTracked = false;
  const trackEdited = () => { if (!editedTracked) { editedTracked = true; ctx.storage.track("hypothesis_edited", {}); } };

  area.value = h.finalText || defaultHypothesis(state, task);
  area.addEventListener("input", () => {
    h.finalText = area.value; h.edited = true; ctx.update();
    preview.textContent = h.finalText; updateCharcount(); trackEdited();
  });

  function maybeTrackBuilt() {
    if (h.resultChoice && h.criterionChoice)
      ctx.storage.track("hypothesis_built", { result: h.resultChoice, criterion: h.criterionChoice });
  }
  const result = choiceRow(content.resultOptions, h.resultChoice,
    (id) => { h.resultChoice = id; syncPreview(); maybeTrackBuilt(); });
  const criterion = choiceRow(content.criterionOptions, h.criterionChoice,
    (id) => { h.criterionChoice = id; syncPreview(); maybeTrackBuilt(); });

  function openEdit(fromScratch) {
    if (fromScratch) { area.value = ""; h.finalText = ""; }
    else { area.value = h.finalText; }
    h.edited = true; ctx.update(); trackEdited();
    editWrap.style.display = "";
    preview.textContent = h.finalText;
    updateCharcount();
    area.focus();
  }
  const refine = el("button", { class: "linklike", onclick: () => openEdit(false) }, t.refineLink);
  const writeOwn = el("button", { class: "linklike", onclick: () => openEdit(true) }, t.writeOwnLink);

  wrap.append(
    preview,
    fieldset(t.resultLegend, result),
    fieldset(t.criterionLegend, criterion),
    el("div", { class: "edit-actions" }, refine, writeOwn),
    editWrap,
    nav(ctx, { nextLabel: t.button })
  );
  syncPreview();
  updateCharcount();
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
  const chainTools = (state.tools.selected.length ? state.tools.selected : (content.taskTools[state.task]?.reco || []))
    .map((id) => content.toolById[id]).filter(Boolean);
  const chainRow = el("div", { class: "chain-row" });
  chainTools.forEach((tl, i) => {
    if (i) chainRow.appendChild(el("span", { class: "chain-arrow" }, "→"));
    chainRow.appendChild(el("div", { class: "chain-node" },
      el("span", { class: "chain-name" }, tl.name),
      el("span", { class: "chain-role" }, tl.role)
    ));
  });

  const stage = el("div", { class: "stage" });
  const consequence = el("p", { class: "consequence", "aria-live": "polite" });
  const foot = nav(ctx, { nextLabel: t.button, disabled: !state.step3Choice });

  // Последствие учитывает задачу; общий текст остаётся запасным.
  const consequenceFor = (id) => task.check?.[id]?.consequence || content.step3Consequence[id];

  function showResult() {
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

  // Короткая анимация сборки: узлы цепочки зажигаются по очереди, затем результат.
  // При prefers-reduced-motion анимацию пропускаем и сразу показываем результат.
  function runBuild() {
    const nodes = [...chainRow.querySelectorAll(".chain-node")];
    const reduce = typeof window !== "undefined" && window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { nodes.forEach((n) => n.classList.add("lit")); showResult(); return; }
    stage.innerHTML = "";
    stage.appendChild(el("div", { class: "building" }, el("span", {}, t.buildingText)));
    let i = 0;
    const lit = () => {
      if (i < nodes.length) { nodes[i].classList.add("lit"); i += 1; setTimeout(lit, 340); }
      else setTimeout(showResult, 300);
    };
    lit();
  }

  if (state.step3Choice) {
    // Возврат на шаг: цепочка уже собрана, результат показываем сразу.
    chainRow.querySelectorAll(".chain-node").forEach((n) => n.classList.add("lit"));
    showResult();
  } else {
    stage.appendChild(el("button", { class: "primary build", onclick: runBuild }, t.buildButton));
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
function step5(ctx) {
  const { content, state } = ctx;
  const t = content.ui.step5;
  const task = content.taskById[state.task];
  const wrap = el("div");
  wrap.appendChild(header({ location: t.location, title: t.title, intro: t.intro }));

  // Показатели связаны со способом проверки, выбранным на шаге 1.
  const critId = state.hypothesis.criterionChoice;
  const crit = content.criterionOptions.find((c) => c.id === critId);
  if (crit) {
    wrap.appendChild(el("div", { class: "field" },
      el("div", { class: "legend" }, t.criterionCaption),
      el("p", { class: "reco-line" }, crit.phrase)
    ));
  }

  const tiles = content.criterionMetrics[critId] || content.criterionMetrics.errors2w;
  const metricsBox = el("div", { class: "metrics" });
  metricsBox.style.gridTemplateColumns = `repeat(${tiles.length}, 1fr)`;
  for (const tile of tiles) metricsBox.appendChild(metric(tile.label, tile.value));
  wrap.appendChild(metricsBox);

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
  for (const h of t.hints) hints.appendChild(el("li", {}, h));

  wrap.append(fieldset(t.question, choice), consequence, hints, foot);
  return wrap;
}

// ── Экран 6. Финал ────────────────────────────────────────────
function final(ctx) {
  const { content, state } = ctx;
  const f = content.final;
  const task = content.taskById[state.task];
  // Вариант финала определяется решением шага 5.
  const key = state.finalVariant || state.step5Choice || "scale";
  const v = f.variants[key] || f.variants.scale;
  const wrap = el("div");

  // У своей задачи в заголовок идёт введённый текст, а не заглушка карточки.
  const taskLabel = state.task === "own" ? (state.ownTaskText.trim() || task.title) : task.title;
  const title = state.name
    ? tpl(v.cardTitleNamedTemplate, { name: state.name, task: taskLabel })
    : tpl(v.cardTitleTemplate, { task: taskLabel });

  const toolNames = (state.tools.selected.length ? state.tools.selected : (content.taskTools[state.task]?.reco || []))
    .map((id) => content.toolById[id]?.name).filter(Boolean);
  const launchNote = state.step3Choice ? task.check?.[state.step3Choice]?.launch : null;
  const channelName = state.publishChannel ? content.channelById[state.publishChannel]?.name : null;
  const crit = content.criterionOptions.find((c) => c.id === state.hypothesis.criterionChoice);
  const decisionLabel = f.decisionLabels[key];
  // Подпись карточки ветвится по приоритету: остановка → есть «чего не хватило» → обычная.
  const cardFooterText = state.step5Choice === "stop" ? f.cardFooterStop
    : (state.tools.gaps.length ? f.cardFooterGaps : f.cardFooter);

  // Итоговая карточка: весь путь одним взглядом, для игрока и стендиста.
  const kv = (label, value) =>
    value ? el("div", { class: "kv" }, el("b", {}, label + ": "), value) : null;
  wrap.appendChild(el("div", { class: "final-card" },
    el("h1", { class: "card-title", tabindex: "-1" }, title),
    kv(f.cardHypothesisLabel, state.hypothesis.finalText || defaultHypothesis(state, task)),
    kv(f.cardToolsLabel, toolNames.join(", ")),
    kv(f.cardLaunchLabel, launchNote),
    kv(f.cardChannelLabel, channelName),
    kv(f.cardCheckLabel, crit ? crit.phrase : null),
    kv(f.cardResultLabel, v.resultShort),
    kv(f.cardDecisionLabel, decisionLabel),
    el("div", { class: "muted" }, cardFooterText)
  ));

  wrap.appendChild(el("p", { class: "intro" }, v.congrats));

  // Передача стендисту и код завершения (для всех вариантов).
  // Показ финала фиксируется через final_viewed при входе на экран.
  wrap.appendChild(el("p", { class: "stand-handoff" }, f.standHandoff));
  const code = giftCode(state.runId);
  wrap.appendChild(el("div", { class: "code" },
    el("div", { class: "code-label" }, f.codeLabel),
    el("div", { class: "code-value" }, code),
    el("div", { class: "muted" }, f.codeHint)
  ));

  // Забрать итог с собой: копирование собранной карточки в буфер. Ниже кода,
  // выше ссылок. Запасной путь — поле с выделенным текстом при отказе clipboard.
  const shareText = buildShareText(state);
  const copyBtn = el("button", { class: "primary wide", onclick: onCopy }, f.copyButton);
  const copyHint = el("div", { class: "muted", style: "display:none" }, f.copyFallbackHint);
  const copyField = el("textarea", {
    class: "copy-fallback", readonly: true, rows: "9", "aria-label": f.copyFallbackHint, style: "display:none"
  });
  copyField.value = shareText;
  let copyTimer = null;
  function flashDone() {
    copyBtn.textContent = f.copyDone;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copyBtn.textContent = f.copyButton; }, 2000);
  }
  function revealField() {
    copyField.style.display = ""; copyHint.style.display = "";
    copyField.focus(); copyField.select();
  }
  function tryLegacy() {   // execCommand требует выделения и живёт внутри жеста
    copyField.style.display = ""; copyField.focus(); copyField.select();
    try { return !!(document.execCommand && document.execCommand("copy")); } catch { return false; }
  }
  function onCopy() {
    // Метрика — доля дошедших, кто нажал копирование: одно событие на сессию.
    if (!state.copied) { state.copied = true; ctx.update(); ctx.storage.track("summary_copied", {}); }
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(shareText).then(() => { copyField.style.display = "none"; copyHint.style.display = "none"; flashDone(); }).catch(revealField);
    } else if (tryLegacy()) {
      copyField.style.display = "none"; copyHint.style.display = "none"; flashDone();
    } else {
      revealField();
    }
  }
  wrap.appendChild(el("div", { class: "copy-block" }, copyBtn, copyHint, copyField));

  // Рабочие призывы к действию: семантические ссылки, новая вкладка, учёт нажатий.
  const ctas = el("div", { class: "ctas" });
  for (const c of f.ctas) {
    const isUrl = /^https?:\/\//.test(c.href || "");
    ctas.appendChild(el("a", {
      class: "cta",
      href: c.href || "#",
      target: isUrl ? "_blank" : null,
      rel: isUrl ? "noopener noreferrer" : null,
      onclick: (e) => {
        if (!isUrl) e.preventDefault();   // адрес пока заглушка, VERIFY:url
        ctx.storage.track("cta_clicked", { cta: c.id });
      }
    },
      el("div", { class: "cta-title" }, c.title),
      el("div", { class: "cta-sub" }, c.sub)
    ));
  }
  wrap.appendChild(ctas);

  // Один добровольный сценарий контакта: раскрывается по нажатию, на подарок не
  // влияет, повторно не спрашивается. Хранится отдельно от прогресса.
  const contactForm = el("div", { class: "contact-form", style: "display:none" });
  const contactInput = el("input", {
    class: "text-field", type: "text", placeholder: f.contactPlaceholder, "aria-label": f.contactPlaceholder
  });
  contactInput.value = state.contact || "";

  const openContact = el("button", {
    class: "ghost wide",
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
  wrap.appendChild(el("div", { class: "field" }, openContact, contactForm));

  // Повтор базового вопроса — замер сдвига уходит в аналитику, игроку не показываем.
  const awareness = choiceRow(
    [{ id: "yes", label: f.awarenessYes }, { id: "no", label: f.awarenessNo }],
    state.awarenessAfter,
    (id) => {
      state.awarenessAfter = id; ctx.update();
      ctx.storage.track("knows_after_answered", { value: id });
    }
  );
  wrap.appendChild(fieldset(f.awarenessRepeat, awareness));

  // Следующий шаг: подсказки под вариант, можно выбрать или вписать свой.
  const ownNext = el("input", { class: "text-field", type: "text", placeholder: f.nextStepOwnPlaceholder, "aria-label": f.nextStepPrompt });
  ownNext.value = v.nextSteps.includes(state.nextStepText) ? "" : (state.nextStepText || "");
  const chips = el("div", { class: "choices" });
  v.nextSteps.forEach((s, i) => {
    const chip = el("button", { class: "choice small" + (state.nextStepText === s ? " selected" : "") }, s);
    chip.addEventListener("click", () => {
      [...chips.children].forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
      state.nextStepText = s; ownNext.value = ""; ctx.update();
      // В аналитику — только индекс предложенного шага, без сырого текста.
      ctx.storage.track("next_step_chosen", { preset: true, index: i });
    });
    chips.appendChild(chip);
  });
  ownNext.addEventListener("input", () => {
    [...chips.children].forEach((c) => c.classList.remove("selected"));
    state.nextStepText = ownNext.value; ctx.update();
  });
  wrap.appendChild(el("div", { class: "field" },
    el("div", { class: "legend" }, f.nextStepPrompt), chips, ownNext
  ));

  wrap.appendChild(el("p", { class: "intro" }, f.toAnketaCaption));
  wrap.appendChild(nav(ctx, { nextLabel: f.toAnketa }));
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
