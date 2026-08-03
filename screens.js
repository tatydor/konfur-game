// Рендер восьми экранов с интеракциями. Каждый экран читает и пишет состояние
// прохождения, ветвление по выбранной задаче подставляет данные в шаблоны,
// каждый экран оставляет игроку промежуточный итог и кнопку дальше.

import { el, tpl } from "./dom.js";

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
  const ownField = el("textarea", {
    class: "own-field",
    placeholder: t.ownFieldPlaceholder,
    style: state.task === "own" ? "" : "display:none"
  });
  ownField.value = state.ownTaskText || "";
  ownField.addEventListener("input", () => { state.ownTaskText = ownField.value; ctx.update(); });

  const cards = el("div", { class: "cards" });
  for (const task of content.tasks) {
    const card = el("button", {
      class: "card" + (state.task === task.id ? " selected" : ""),
      onclick: () => {
        state.task = task.id;
        ctx.update();
        [...cards.children].forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        ownField.style.display = task.id === "own" ? "" : "none";
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
    (id) => { state.awarenessBefore = id; ctx.update(); }
  );

  const nameInput = el("input", { class: "text-field", type: "text", placeholder: t.nameHint });
  nameInput.value = state.name || "";
  nameInput.addEventListener("input", () => { state.name = nameInput.value; ctx.update(); });

  wrap.append(
    cards,
    ownField,
    fieldset(t.awarenessQuestion, awareness),
    fieldset(t.nameLabel, nameInput),
    error,
    nav(ctx, {
      nextLabel: t.button,
      onNext: () => {
        if (!state.task) { error.textContent = content.system.emptyRequired; return; }
        if (state.task === "own" && !state.ownTaskText.trim()) {
          error.textContent = content.system.emptyRequired; return;
        }
        ctx.storage.track("task_chosen", { runId: state.runId, task: state.task });
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
  const wrap = el("div");
  wrap.appendChild(header({ location: t.location, title: t.title, intro: t.intro }));

  state.hypothesis.seedShown = task.seed;
  if (!state.hypothesis.finalText) state.hypothesis.finalText = task.seed;
  ctx.update();

  wrap.appendChild(el("p", { class: "formula" }, t.formulaPreview));

  const area = el("textarea", { class: "own-field big", maxlength: HYP_MAX });
  area.value = state.hypothesis.finalText;
  const charcount = el("div", { class: "charcount" });
  function onEdit() {
    state.hypothesis.finalText = area.value;
    ctx.update();
    const left = HYP_MAX - area.value.length;
    charcount.textContent = left <= 40 ? tpl(content.system.charsLeftTemplate, { n: left }) : "";
  }
  area.addEventListener("input", onEdit);

  const writeOwn = el("button", { class: "linklike", onclick: () => { area.value = ""; onEdit(); area.focus(); } }, t.writeOwnLink);
  const warn = el("p", { class: "warn" }, t.privacyWarning);

  const result = choiceRow(content.resultOptions, state.hypothesis.resultChoice,
    (id) => { state.hypothesis.resultChoice = id; ctx.update(); });
  const criterion = choiceRow(content.criterionOptions, state.hypothesis.criterionChoice,
    (id) => { state.hypothesis.criterionChoice = id; ctx.update(); });

  wrap.append(
    area, charcount, writeOwn, warn,
    fieldset(t.resultLegend, result),
    fieldset(t.criterionLegend, criterion),
    nav(ctx, { nextLabel: t.button })
  );
  onEdit();
  return wrap;
}

// ── Шаг 2. Инструменты: выбрать до трёх ───────────────────────
function step2(ctx) {
  const { content, state } = ctx;
  const t = content.ui.step2;
  const task = content.taskById[state.task];
  const recommended = new Set(task.tools);
  const wrap = el("div");
  wrap.appendChild(header({ location: t.location, title: t.title, intro: t.intro }));

  const counter = el("div", { class: "counter" });
  const msg = el("div", { class: "error" });
  const foot = nav(ctx, { nextLabel: t.button, disabled: state.tools.selected.length === 0 });
  function refresh() {
    counter.textContent = tpl(t.counterTemplate, { n: state.tools.selected.length, max: t.maxTools });
    foot.querySelector(".primary").disabled = state.tools.selected.length === 0;
  }

  const list = el("div", { class: "tool-list" });
  for (const tool of content.tools) {
    const isReco = recommended.has(tool.id);
    const card = el("button", {
      class: "tool selectable" + (state.tools.selected.includes(tool.id) ? " selected" : "") + (isReco ? " reco" : "")
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
        sel.splice(i, 1);
        card.classList.remove("selected");
        msg.textContent = "";
      } else if (sel.length >= t.maxTools) {
        msg.textContent = t.fourthAttempt;
        return;
      } else {
        sel.push(tool.id);
        card.classList.add("selected");
        msg.textContent = "";
      }
      ctx.update();
      refresh();
    });
    list.appendChild(card);
  }

  const gaps = el("div", { class: "choices" });
  for (const g of content.gapOptions) {
    const chip = el("button", { class: "choice small" + (state.tools.gaps.includes(g.id) ? " selected" : "") }, g.label);
    chip.addEventListener("click", () => {
      const arr = state.tools.gaps;
      const i = arr.indexOf(g.id);
      if (i >= 0) { arr.splice(i, 1); chip.classList.remove("selected"); }
      else { arr.push(g.id); chip.classList.add("selected"); }
      ctx.update();
    });
    gaps.appendChild(chip);
  }

  wrap.append(counter, list, el("p", { class: "hint" }, t.badgeHint), msg,
    fieldset(t.gapsTitle, gaps), foot);
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
