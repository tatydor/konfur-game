// Рендер восьми экранов. Каркас потока: экраны читают и пишут состояние
// прохождения, каждый оставляет игроку промежуточный итог и кнопку дальше.
// Ветвление по выбранной задаче подставляет данные в шаблоны.
//
// В этой версии интеракции минимальные — ровно чтобы пройти поток из конца
// в конец и проверить перенос состояния. Полный копирайт и богатые интеракции
// (редактируемая гипотеза, мультивыбор инструментов с лимитом, чек-лист с
// анимацией) — следующий пункт порядка работ.

import { el, tpl } from "./dom.js";

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

  // Базовый вопрос и имя — намеренно сухие, необязательные.
  const awareness = choiceRow([
    { id: "yes", label: t.awarenessYes },
    { id: "no", label: t.awarenessNo }
  ], state.awarenessBefore, (id) => { state.awarenessBefore = id; ctx.update(); });

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

  // Каркас: показываем заготовку под задачу (ветвление живое).
  // Редактирование и выбор результата/критерия — следующий заход.
  state.hypothesis.seedShown = task.seed;
  if (!state.hypothesis.finalText) state.hypothesis.finalText = task.seed;
  ctx.update();

  wrap.appendChild(el("div", { class: "callout" }, task.seed));
  wrap.appendChild(el("p", { class: "todo" }, "Здесь появятся редактируемая гипотеза, выбор результата и способа проверки."));
  wrap.appendChild(nav(ctx, { nextLabel: t.button }));
  return wrap;
}

// ── Шаг 2. Инструменты ────────────────────────────────────────
function step2(ctx) {
  const { content, state } = ctx;
  const t = content.ui.step2;
  const task = content.taskById[state.task];
  const wrap = el("div");
  wrap.appendChild(header({ location: t.location, title: t.title, intro: t.intro }));

  // Каркас: подсвеченные под задачу инструменты (только показ).
  const list = el("div", { class: "tool-list" });
  for (const id of task.tools) {
    const tool = content.toolById[id];
    list.appendChild(el("div", { class: "tool" },
      el("span", { class: "tool-name" }, tool.name),
      el("span", { class: "badge" }, tool.badge)
    ));
  }
  wrap.append(list, el("p", { class: "todo" }, "Здесь появится выбор до трёх инструментов и блок «чего не хватило»."));
  wrap.appendChild(nav(ctx, { nextLabel: t.button }));
  return wrap;
}

// ── Шаг 3. Сборка и проверка ──────────────────────────────────
function step3(ctx) {
  const { content, state } = ctx;
  const t = content.ui.step3;
  const task = content.taskById[state.task];
  const wrap = el("div");
  wrap.appendChild(header({ location: t.location, title: t.title, intro: t.intro }));

  wrap.appendChild(el("div", { class: "callout" }, task.example));

  const consequence = el("p", { class: "consequence" });
  const foot = nav(ctx, { nextLabel: t.button, disabled: !state.step3Choice });
  if (state.step3Choice) consequence.textContent = content.step3Consequence[state.step3Choice];

  const choice = choiceRow([
    { id: "enough", label: t.enoughLabel },
    { id: "refine", label: t.refineLabel }
  ], state.step3Choice, (id) => {
    state.step3Choice = id; ctx.update();
    consequence.textContent = content.step3Consequence[id];
    foot.querySelector(".primary").disabled = false;
    ctx.storage.track("step3_choice", { runId: state.runId, choice: id });
  });

  wrap.append(fieldset(t.question, choice), consequence, foot);
  return wrap;
}

// ── Шаг 4. Публикация ─────────────────────────────────────────
function step4(ctx) {
  const { content } = ctx;
  const t = content.ui.step4;
  const wrap = el("div");
  wrap.appendChild(header({ location: t.location, title: t.title, intro: t.intro }));

  const list = el("ul", { class: "checklist" });
  for (const item of t.checklist) list.appendChild(el("li", {}, item));
  wrap.append(list, el("p", { class: "todo" }, "Здесь чек-лист станет интерактивным с текстом появления виджета."));
  wrap.appendChild(nav(ctx, { nextLabel: t.button }));
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

  const panel = el("div", { class: "metrics" },
    metric(t.metricsLabels.users, m.users.toLocaleString("ru-RU")),
    metric(t.metricsLabels.requests, m.requests.toLocaleString("ru-RU")),
    metric(t.metricsLabels.satisfaction, m.satisfaction)
  );
  wrap.append(panel, el("div", { class: "callout" }, task.problem));

  const consequence = el("p", { class: "consequence" });
  const foot = nav(ctx, { nextLabel: t.button, disabled: !state.step5Choice });
  if (state.step5Choice) consequence.textContent = content.step5Consequence[state.step5Choice];

  const choice = choiceRow([
    { id: "fix", label: t.fixLabel },
    { id: "scale", label: t.scaleLabel },
    { id: "stop", label: t.stopLabel }
  ], state.step5Choice, (id) => {
    state.step5Choice = id; ctx.update();
    consequence.textContent = content.step5Consequence[id];
    foot.querySelector(".primary").disabled = false;
    ctx.storage.track("step5_choice", { runId: state.runId, choice: id });
  });

  wrap.append(fieldset(t.question, choice), consequence, foot);
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

  const toolNames = state.tools.selected.length
    ? state.tools.selected.map((id) => content.toolById[id]?.name).filter(Boolean)
    : task.tools.map((id) => content.toolById[id]?.name).filter(Boolean);

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

  // Повтор базового вопроса — замер сдвига.
  const awareness = choiceRow([
    { id: "yes", label: f.awarenessYes },
    { id: "no", label: f.awarenessNo }
  ], state.awarenessAfter, (id) => {
    state.awarenessAfter = id; ctx.update();
    ctx.storage.track("awareness_after", { runId: state.runId, value: id });
  });
  wrap.appendChild(fieldset(f.awarenessRepeat, awareness));

  wrap.appendChild(nav(ctx, { nextLabel: f.toAnketa }));
  return wrap;
}

// ── Экран 7. Анкета ───────────────────────────────────────────
function anketa(ctx) {
  const { content } = ctx;
  const a = content.anketa;
  const wrap = el("div");
  wrap.appendChild(header({ title: a.title, intro: a.intro }));

  for (const q of a.questions) {
    wrap.appendChild(fieldset(q, el("input", { class: "text-field", type: "text" })));
  }

  const done = el("div", { class: "thanks", style: "display:none" }, a.thanks);
  const foot = el("footer", { class: "nav" },
    el("button", { class: "ghost", onclick: () => ctx.back() }, "← Назад"),
    el("button", {
      class: "primary",
      onclick: () => {
        ctx.storage.track("anketa_submit", { runId: ctx.state.runId });
        done.style.display = "";
      }
    }, a.button)
  );
  wrap.append(foot, done);
  wrap.appendChild(el("button", { class: "ghost restart", onclick: () => ctx.restart() }, "Пройти заново"));
  return wrap;
}

// ── Мелкие помощники разметки ─────────────────────────────────
function fieldset(legend, control) {
  return el("div", { class: "field" }, el("div", { class: "legend" }, legend), control);
}
function choiceRow(options, selected, onPick) {
  const row = el("div", { class: "choices" });
  for (const opt of options) {
    const btn = el("button", {
      class: "choice" + (selected === opt.id ? " selected" : ""),
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

export const screens = { step0, step1, step2, step3, step4, step5, final, anketa };
