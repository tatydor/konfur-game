// Рендер восьми экранов с интеракциями. Каждый экран читает и пишет состояние
// прохождения, ветвление по выбранной задаче подставляет данные в шаблоны,
// каждый экран оставляет игроку промежуточный итог и кнопку дальше.

import { el, tpl } from "./dom.js";
import { resetDependentOnTask, buildHypothesis } from "./data.js";

const HYP_MAX = 220; // предел длины гипотезы

// ── Общие детали ──────────────────────────────────────────────
function header(cfg) {
  return el("header", { class: "head" },
    cfg.location ? el("div", { class: "loc" }, cfg.location) : null,
    el("h1", {}, cfg.title),
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

function fieldset(legend, control) {
  return el("div", { class: "field" }, el("div", { class: "legend" }, legend), control);
}

function choiceRow(options, selected, onPick, extraClass = "") {
  const row = el("div", { class: "choices" });
  for (const opt of options) {
    const btn = el("button", {
      class: "choice " + extraClass + (selected === opt.id ? " selected" : ""),
      onclick: () => {
        [...row.children].forEach((c) => c.classList.remove("selected"));
        btn.classList.add("selected");
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

  const error = el("div", { class: "error" });

  // Поле своей задачи с честным объяснением, без обещания адаптации.
  const ownWrap = el("div", { class: "own-wrap", style: state.task === "own" ? "" : "display:none" });
  const ownField = el("textarea", { class: "own-field", placeholder: t.ownFieldPlaceholder });
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
        if (state.task !== task.id) resetDependentOnTask(state);
        state.task = task.id;
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
    (id) => { state.awarenessBefore = id; ctx.update(); error.textContent = ""; }
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
        ctx.storage.track("task_chosen", { runId: state.runId, task: state.task });
        ctx.storage.track("knows_before", { runId: state.runId, value: state.awarenessBefore });
        ctx.next();
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

  if (!h.seedShown) h.seedShown = task.seed;

  // Живое превью гипотезы: собирается из выбора результата и критерия,
  // пока игрок не начал править текст руками (тогда правка ведёт превью).
  const preview = el("p", { class: "formula" });
  const editWrap = el("div", { class: "edit-wrap", style: h.edited ? "" : "display:none" });
  const area = el("textarea", { class: "own-field big", maxlength: HYP_MAX });
  const charcount = el("div", { class: "charcount" });
  const warn = el("p", { class: "warn" }, t.privacyWarning);
  editWrap.append(area, charcount, warn);

  function updateCharcount() {
    const left = HYP_MAX - area.value.length;
    charcount.textContent = left <= 40 ? tpl(content.system.charsLeftTemplate, { n: left }) : "";
  }
  function syncPreview() {
    if (!h.edited) {
      h.finalText = (h.resultChoice || h.criterionChoice)
        ? buildHypothesis(state.task, h.resultChoice, h.criterionChoice)
        : h.seedShown;
      area.value = h.finalText;
    }
    preview.textContent = h.finalText;
    ctx.update();
  }
  area.value = h.finalText || h.seedShown;
  area.addEventListener("input", () => {
    h.finalText = area.value; h.edited = true; ctx.update();
    preview.textContent = h.finalText; updateCharcount();
  });

  function maybeTrackBuilt() {
    if (h.resultChoice && h.criterionChoice)
      ctx.storage.track("hypothesis_built", { runId: state.runId, result: h.resultChoice, criterion: h.criterionChoice });
  }
  const result = choiceRow(content.resultOptions, h.resultChoice,
    (id) => { h.resultChoice = id; syncPreview(); maybeTrackBuilt(); });
  const criterion = choiceRow(content.criterionOptions, h.criterionChoice,
    (id) => { h.criterionChoice = id; syncPreview(); maybeTrackBuilt(); });

  function openEdit(fromScratch) {
    if (fromScratch) { area.value = ""; h.finalText = ""; }
    else { area.value = h.finalText; }
    h.edited = true; ctx.update();
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

  const counter = el("div", { class: "counter" });
  const msg = el("div", { class: "error" });
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
        el("span", { class: "tool-name" }, tool.name),
        el("span", { class: "badge" }, tool.badge)
      ),
      el("div", { class: "tool-explain" }, tool.explain),
      isReco ? el("span", { class: "reco-tag" }, "советуем под задачу") : null
    );
    card.addEventListener("click", () => {
      const sel = state.tools.selected;
      const i = sel.indexOf(tool.id);
      if (i >= 0) {
        sel.splice(i, 1); card.classList.remove("selected"); card.setAttribute("aria-pressed", "false"); msg.textContent = "";
      } else if (sel.length >= t.maxTools) {
        msg.textContent = t.fourthAttempt;
        ctx.storage.track("tool_budget_exceeded", { runId: state.runId, tool: tool.id });
        return;
      } else {
        sel.push(tool.id); card.classList.add("selected"); card.setAttribute("aria-pressed", "true"); msg.textContent = "";
      }
      ctx.storage.track("tool_toggled", { runId: state.runId, tool: tool.id, count: sel.length });
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
      else { arr.push(g.id); chip.classList.add("selected"); ctx.storage.track("tool_gap", { runId: state.runId, gap: g.id }); }
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
    el("p", { class: "hint" }, t.badgeHint),
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

  const stage = el("div", { class: "stage" });
  const consequence = el("p", { class: "consequence" });
  const foot = nav(ctx, { nextLabel: t.button, disabled: !state.step3Choice });

  function showResult() {
    stage.innerHTML = "";
    stage.appendChild(el("div", { class: "callout" }, task.example));
    const choice = choiceRow(
      [{ id: "enough", label: t.enoughLabel }, { id: "refine", label: t.refineLabel }],
      state.step3Choice,
      (id) => {
        state.step3Choice = id;
        ctx.update();
        consequence.textContent = content.step3Consequence[id];
        foot.querySelector(".primary").disabled = false;
        ctx.storage.track("step3_choice", { runId: state.runId, choice: id });
      }
    );
    stage.appendChild(fieldset(t.question, choice));
    if (state.step3Choice) consequence.textContent = content.step3Consequence[state.step3Choice];
  }

  if (state.step3Choice) {
    showResult();
  } else {
    const build = el("button", {
      class: "primary build",
      onclick: () => {
        stage.innerHTML = "";
        stage.appendChild(el("div", { class: "building" },
          el("span", { class: "spinner" }), el("span", {}, t.buildingText)));
        setTimeout(showResult, 1200);
      }
    }, t.buildButton);
    stage.appendChild(build);
  }

  wrap.append(stage, consequence, foot);
  return wrap;
}

// ── Шаг 4. Публикация: интерактивный чек-лист ─────────────────
function step4(ctx) {
  const { content } = ctx;
  const t = content.ui.step4;
  const wrap = el("div");
  wrap.appendChild(header({ location: t.location, title: t.title, intro: t.intro }));

  const checked = new Array(t.checklist.length).fill(false);
  const msg = el("div", { class: "error" });
  const done = el("p", { class: "done", style: "display:none" }, t.doneText);

  const list = el("div", { class: "checklist-i" });
  t.checklist.forEach((item, idx) => {
    const cb = el("input", { type: "checkbox" });
    cb.addEventListener("change", () => {
      checked[idx] = cb.checked;
      msg.textContent = "";
      done.style.display = checked.every(Boolean) ? "" : "none";
    });
    list.appendChild(el("label", { class: "check" }, cb, el("span", {}, item)));
  });

  const foot = nav(ctx, {
    nextLabel: t.button,
    onNext: () => {
      if (!checked.every(Boolean)) { msg.textContent = t.earlyAttempt; return; }
      ctx.next();
    }
  });

  wrap.append(list, done, msg, foot);
  return wrap;
}

// ── Шаг 5. Наблюдение и решение ───────────────────────────────
function step5(ctx) {
  const { content, state } = ctx;
  const t = content.ui.step5;
  const task = content.taskById[state.task];
  const m = content.metricsPanel;
  const wrap = el("div");
  wrap.appendChild(header({ location: t.location, title: t.title, intro: t.intro }));

  wrap.appendChild(el("div", { class: "metrics" },
    metric(t.metricsLabels.users, m.users.toLocaleString("ru-RU")),
    metric(t.metricsLabels.requests, m.requests.toLocaleString("ru-RU")),
    metric(t.metricsLabels.satisfaction, m.satisfaction)
  ));
  wrap.appendChild(el("div", { class: "callout" }, task.problem));

  const consequence = el("p", { class: "consequence" });
  const foot = nav(ctx, { nextLabel: t.button, disabled: !state.step5Choice });
  if (state.step5Choice) consequence.textContent = content.step5Consequence[state.step5Choice];

  const choice = choiceRow(
    [{ id: "fix", label: t.fixLabel }, { id: "scale", label: t.scaleLabel }, { id: "stop", label: t.stopLabel }],
    state.step5Choice,
    (id) => {
      state.step5Choice = id;
      ctx.update();
      consequence.textContent = content.step5Consequence[id];
      foot.querySelector(".primary").disabled = false;
      ctx.storage.track("step5_choice", { runId: state.runId, choice: id });
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
  const wrap = el("div");

  const title = state.name
    ? tpl(f.cardTitleNamedTemplate, { name: state.name, task: task.title })
    : tpl(f.cardTitleTemplate, { task: task.title });

  const toolNames = (state.tools.selected.length ? state.tools.selected : task.tools)
    .map((id) => content.toolById[id]?.name).filter(Boolean);

  wrap.appendChild(el("div", { class: "final-card" },
    el("div", { class: "card-title" }, title),
    el("div", { class: "kv" }, el("b", {}, f.cardHypothesisLabel + ": "), state.hypothesis.finalText || task.seed),
    el("div", { class: "kv" }, el("b", {}, f.cardToolsLabel + ": "), toolNames.join(", ")),
    el("div", { class: "muted" }, f.cardFooter)
  ));

  wrap.appendChild(el("p", { class: "intro" }, f.congrats));

  const code = giftCode(state.runId);
  ctx.storage.track("code_issued", { runId: state.runId, code });
  wrap.appendChild(el("div", { class: "code" },
    el("div", { class: "code-label" }, f.codeLabel),
    el("div", { class: "code-value" }, code),
    el("div", { class: "muted" }, f.codeHint)
  ));

  // Призывы к действию.
  const ctas = el("div", { class: "ctas" });
  for (const c of f.ctas) {
    ctas.appendChild(el("div", { class: "cta" },
      el("div", { class: "cta-title" }, c.title),
      el("div", { class: "cta-sub" }, c.sub)
    ));
  }
  wrap.appendChild(ctas);

  // Добровольный контакт, хранится отдельно от прогресса.
  const contactInput = el("input", { class: "text-field", type: "text", placeholder: f.contactPlaceholder });
  contactInput.value = state.contact || "";
  const contactMsg = el("div", { class: "contact-msg" });
  const contactBtn = el("button", {
    class: "ghost small",
    onclick: () => {
      const v = contactInput.value.trim();
      if (!v) return;
      state.contact = v;
      ctx.update();
      ctx.storage.saveContact(v, { runId: state.runId })
        .then(() => { contactMsg.textContent = "Записали, пришлём."; contactMsg.className = "contact-msg ok"; })
        .catch(() => { contactMsg.textContent = content.system.contactError; contactMsg.className = "contact-msg error"; });
    }
  }, "Отправить");
  wrap.appendChild(el("div", { class: "field" },
    el("div", { class: "legend" }, f.contactPrompt),
    el("div", { class: "contact-row" }, contactInput, contactBtn),
    contactMsg
  ));

  // Повтор базового вопроса — замер сдвига.
  const awareness = choiceRow(
    [{ id: "yes", label: f.awarenessYes }, { id: "no", label: f.awarenessNo }],
    state.awarenessAfter,
    (id) => { state.awarenessAfter = id; ctx.update(); ctx.storage.track("awareness_after", { runId: state.runId, value: id }); }
  );
  wrap.appendChild(fieldset(f.awarenessRepeat, awareness));

  const nextStep = el("input", { class: "text-field", type: "text" });
  nextStep.value = state.nextStepText || "";
  nextStep.addEventListener("input", () => { state.nextStepText = nextStep.value; ctx.update(); });
  wrap.appendChild(fieldset(f.nextStepPrompt, nextStep));

  wrap.appendChild(nav(ctx, { nextLabel: f.toAnketa }));
  return wrap;
}

// ── Экран 7. Анкета ───────────────────────────────────────────
function anketa(ctx) {
  const { content, state } = ctx;
  const a = content.anketa;
  const wrap = el("div");
  wrap.appendChild(header({ title: a.title, intro: a.intro }));

  // Второй вопрос предзаполняем тем, что отмечено на шаге 2.
  const gapLabels = state.tools.gaps
    .map((id) => content.gapOptions.find((g) => g.id === id)?.label)
    .filter(Boolean).join(", ");

  a.questions.forEach((q, idx) => {
    const input = el("input", { class: "text-field", type: "text" });
    if (idx === 1 && gapLabels) input.value = gapLabels;
    wrap.appendChild(fieldset(q, input));
  });

  const done = el("div", { class: "thanks", style: "display:none" }, a.thanks);
  const restart = el("button", { class: "ghost restart", style: "display:none", onclick: () => ctx.restart() }, "Пройти заново");
  const foot = el("footer", { class: "nav" },
    el("button", { class: "ghost", onclick: () => ctx.back() }, "← Назад"),
    el("button", {
      class: "primary",
      onclick: () => {
        ctx.storage.track("anketa_submit", { runId: state.runId });
        done.style.display = "";
        restart.style.display = "";
      }
    }, a.button)
  );
  wrap.append(foot, done, restart);
  return wrap;
}

export const screens = { step0, step1, step2, step3, step4, step5, final, anketa };
