// Модель данных игры «Пилот за пять шагов» (Конфур).
// Ядро сборки по спецификации: массив задач + общий контент + состояние прохождения.
// Источник значений — «Игра — тексты экранов.md». Поля названы как в спецификации.
//
// Помечено на сверку до сборки (раздел «Что проверить до сборки»):
//   VERIFY:highlight — подсветка инструментов под задачи (сверяем на коридорном тесте)
//   VERIFY:channels — состав и названия каналов (согласуем после коридорного теста)
//   VERIFY:metrics  — цифры на панели метрик (правдоподобные, но выдуманные)
//   VERIFY:code     — формат одноразового кода (логика принята, доработка визуальная)
// Поле badge у инструментов больше не показывается (пометки зрелости убраны).

// ─────────────────────────────────────────────────────────────
// 1. Массив задач: строка на задачу, экраны — шаблоны с подстановкой.
//    id → task.id в состоянии прохождения. Порядок = порядок карточек на входе.
// ─────────────────────────────────────────────────────────────
export const tasks = [
  {
    id: "documents",
    title: "Гора документов",
    card: "Счета и акты: данные из них переносишь вручную",
    defaultResult: "time",
    defaultCriterion: "time20",
    example: "Из счёта извлечено 11 полей из 12. Дату распознало как 20.02.2062.",
    problem: "В 18% случаев решение путает дату и номер счёта. Все ошибки на сканах одного формата.",
    problemAfterRefine: "В 12% документов часть полей пустая. Все они пришли фотографиями с телефона, а не сканами.",
    check: {
      enough: {
        consequence: "Фиксируем режим с ручной проверкой даты: оператор подтверждает её перед проводкой. Годится для ограниченного пилота, пока формат сканов один.",
        launch: "запуск с ручной проверкой даты"
      },
      refine: {
        consequence: "Добавили примеры проблемного формата и правило проверки даты. Повторный тест распознал дату верно, поле из двенадцатого стало двенадцатым из двенадцати.",
        launch: "запуск после доводки распознавания даты"
      }
    }
  },
  {
    id: "requests",
    title: "Поток заявок",
    card: "Двести обращений в день: каждое разбираешь вручную",
    defaultResult: "more",
    defaultCriterion: "nohuman",
    example: "Разобрано 47 писем из 50. Три ушли не в ту очередь: там жалоба, а не заявка.",
    problem: "В 18% случаев ассистент отвечает «не знаю», и почти все эти вопросы про одно и то же.",
    problemAfterRefine: "В 14% обращений ассистент отвечает «не знаю». Почти все эти вопросы про новый тариф, которого нет в базе.",
    check: {
      enough: {
        consequence: "Фиксируем режим с ручной досортировкой спорных писем: жалобы разбирает человек. Подходит, пока их доля мала.",
        launch: "запуск с ручной досортировкой жалоб"
      },
      refine: {
        consequence: "Добавили правило отделять жалобу от заявки и примеры спорных писем. Повторный тест развёл их точнее: все пятьдесят ушли по адресу.",
        launch: "запуск после доводки сортировки жалоб"
      }
    }
  },
  {
    id: "news",
    title: "Опять поменяли закон",
    card: "Законы, конкуренты и обзоры: читаешь за всю команду",
    defaultResult: "time",
    defaultCriterion: "time20",
    example: "За сутки собрано 6 материалов. Один дублируется, один про однофамильца.",
    problem: "Каждая пятая новость в подборке нерелевантна. Все они из двух источников.",
    problemAfterRefine: "Каждая пятая новость приходит с суточной задержкой. Два источника отдают ленту раз в день.",
    check: {
      enough: {
        consequence: "Фиксируем режим с ручной вычиткой подборки: дубли и однофамильцев снимает редактор. Годится для короткого пилота.",
        launch: "запуск с ручной вычиткой подборки"
      },
      refine: {
        consequence: "Добавили отсев дублей и проверку по фамилии с уточнением. Повторный сбор дал чище подборку: из шести осталось четыре по делу.",
        launch: "запуск после доводки отсева дублей"
      }
    }
  },
  {
    id: "contract",
    title: "Договор на сверку",
    card: "Правки к типовому договору: отличия прячутся в пункте 7.4",
    defaultResult: "errors",
    defaultCriterion: "errors2w",
    example: "Найдено 4 отличия от типовой формы. Одно из них оказалось лишним пробелом.",
    problem: "Каждое пятое найденное отличие оказывается форматированием, а не смыслом.",
    problemAfterRefine: "В 15% договоров отличие найдено, но не объяснено. Юрист всё равно открывает оба файла.",
    check: {
      enough: {
        consequence: "Фиксируем режим с пометкой форматных отличий: пробелы и переносы юрист пропускает глазами. Подходит для пилота на типовой форме.",
        launch: "запуск с ручной отбраковкой форматных отличий"
      },
      refine: {
        consequence: "Добавили правило игнорировать форматирование и примеры пустых отличий. Повторная сверка показала три смысловые правки вместо четырёх с пробелом.",
        launch: "запуск после доводки сверки по смыслу"
      }
    }
  },
  {
    id: "own",
    title: "Своя задача",
    card: "Опиши в двух словах, а на стенде поможем разобраться",
    defaultResult: "time",
    defaultCriterion: "time20",
    example: "Решение отработало на первом случае. Часть результата придётся проверить руками.",
    problem: "В 18% случаев результат приходится проверять руками, и это всегда один и тот же тип случая.",
    problemAfterRefine: "В 12% случаев решение отвечает уверенно и неверно. Ошибку замечают не сразу.",
    check: {
      enough: {
        consequence: "Фиксируем режим с ручной проверкой спорной части результата. Рабочий вариант для ограниченного пилота, пока случаев немного.",
        launch: "запуск с ручной проверкой части результата"
      },
      refine: {
        consequence: "Добавили примеры проблемного типа случаев и правило проверки. Повторный прогон прошёл точнее, руками осталось перепроверять реже.",
        launch: "запуск после доводки на проблемных случаях"
      }
    }
  }
];

// ─────────────────────────────────────────────────────────────
// 2. Общий контент: не привязан к задаче, лежит рядом.
// ─────────────────────────────────────────────────────────────

// Шаг 1: ожидаемый результат (выбор одного) — resultChoice
export const resultOptions = [
  { id: "time",    label: "Освободим время людей",                   phrase: "освободим время людей на рутине" },
  { id: "errors",  label: "Снизим число ошибок",                     phrase: "снизим число ошибок" },
  { id: "more",    label: "Будем успевать больше без роста команды", phrase: "будем успевать больше без роста команды" },
  { id: "faster",  label: "Ускорим ответ клиенту",                   phrase: "ускорим ответ клиенту" }
];

// Свободная ветка (шаг 5): за чем игрок будет следить, если пишет гипотезу
// своими словами. Раньше это был criterionOptions (способ проверки в гипотезе),
// теперь числа задаёт числовой режим, а этот список нужен только свободной ветке.
export const watchOptions = [
  { id: "time20",   short: "Время на случай",     watchPhrase: "время на один случай" },
  { id: "errors2w", short: "Доля ошибок",         watchPhrase: "долю ошибок" },
  { id: "nohuman",  short: "Случаи без человека", watchPhrase: "долю случаев без человека" },
  { id: "ask",      short: "Отзывы команды",      watchPhrase: "оценку команды" },
  { id: "own",      short: "Своё",                watchPhrase: "" }
];

// Шаг 1: действие в гипотезе «Если [действие задачи], то [цель]. [проверка].»
export const taskAction = {
  documents: "автоматизируем извлечение полей из документов",
  requests:  "поставим ассистента на разбор заявок",
  news:      "поставим сбор и отсев по источникам",
  contract:  "включим сверку договоров с эталоном",
  own:       "внедрим решение под задачу «{ownTaskText}»"
};

// Шаг 1 (числовой режим): у каждой задачи свои результаты, у результата свои цели
// с текущим значением, целью и фактом пилота. Порядок ключей задаёт порядок кнопок,
// первый ключ выбран по умолчанию. Факт всегда хуже цели намеренно: иначе выбор
// «исправить/масштабировать» на шаге 5 стал бы очевиден. У задачи own записи нет —
// её ветка всегда свободная. Числа черновые, копирайт проверяет дизайнер. VERIFY:metrics
export const taskMetrics = {
  documents: {
    time: {
      label: "Сократим время", now: "9 минут на документ", nowShort: "9 мин",
      phrase: "сократим обработку документа с 9 до {target}",
      goals: [
        { id: "x2", label: "Вдвое быстрее", target: "5 минут", targetShort: "5 мин", actual: "6 мин" },
        { id: "x3", label: "Втрое быстрее", target: "3 минуты", targetShort: "3 мин", actual: "5 мин" }
      ]
    },
    errors: {
      label: "Снизим ошибки", now: "18% документов с ошибкой", nowShort: "18%",
      phrase: "снизим долю ошибок с 18% до {target}",
      goals: [
        { id: "x2", label: "Вдвое меньше", target: "9%", targetShort: "9%", actual: "11%" },
        { id: "x3", label: "Втрое меньше", target: "6%", targetShort: "6%", actual: "9%" }
      ]
    },
    more: {
      label: "Успеем больше", now: "60 документов в день", nowShort: "60",
      phrase: "поднимем выработку с 60 до {target} в день",
      goals: [
        { id: "x2", label: "Вдвое больше", target: "120 документов", targetShort: "120", actual: "95" },
        { id: "x3", label: "Втрое больше", target: "180 документов", targetShort: "180", actual: "130" }
      ]
    },
    samples: [20, 60, 120], sampleUnit: "документах", sampleUnitCount: "документов"
  },
  requests: {
    more: {
      label: "Успеем больше", now: "200 обращений в день", nowShort: "200",
      phrase: "поднимем разбор с 200 до {target} в день",
      goals: [
        { id: "x2", label: "Вдвое больше", target: "400 обращений", targetShort: "400", actual: "320" },
        { id: "x3", label: "Втрое больше", target: "600 обращений", targetShort: "600", actual: "430" }
      ]
    },
    time: {
      label: "Сократим время", now: "6 минут на обращение", nowShort: "6 мин",
      phrase: "сократим разбор обращения с 6 до {target}",
      goals: [
        { id: "x2", label: "Вдвое быстрее", target: "3 минуты", targetShort: "3 мин", actual: "4 мин" },
        { id: "x3", label: "Втрое быстрее", target: "2 минуты", targetShort: "2 мин", actual: "3 мин" }
      ]
    },
    faster: {
      label: "Ответим быстрее", now: "ответ за 4 часа", nowShort: "4 ч",
      phrase: "ускорим ответ с 4 часов до {target}",
      goals: [
        { id: "x2", label: "Вдвое быстрее", target: "2 часа", targetShort: "2 ч", actual: "3 ч" },
        { id: "x3", label: "Втрое быстрее", target: "1 час", targetShort: "1 ч", actual: "2 ч" }
      ]
    },
    samples: [50, 150, 300], sampleUnit: "обращениях", sampleUnitCount: "обращений"
  },
  news: {
    time: {
      label: "Сократим время", now: "3 часа в неделю на чтение", nowShort: "3 ч",
      phrase: "сократим чтение с 3 часов в неделю до {target}",
      goals: [
        { id: "x2", label: "Вдвое быстрее", target: "1,5 часа", targetShort: "1,5 ч", actual: "2 ч" },
        { id: "x3", label: "Втрое быстрее", target: "1 час", targetShort: "1 ч", actual: "1,5 ч" }
      ]
    },
    more: {
      label: "Успеем больше", now: "30 источников", nowShort: "30",
      phrase: "расширим охват с 30 до {target}",
      goals: [
        { id: "x2", label: "Вдвое больше", target: "60 источников", targetShort: "60", actual: "48" },
        { id: "x3", label: "Втрое больше", target: "90 источников", targetShort: "90", actual: "65" }
      ]
    },
    faster: {
      label: "Узнаем раньше", now: "узнаём об изменении за 5 дней", nowShort: "5 дней",
      phrase: "сократим задержку с 5 дней до {target}",
      goals: [
        { id: "x2", label: "Вдвое быстрее", target: "2 дня", targetShort: "2 дня", actual: "3 дня" },
        { id: "x3", label: "Втрое быстрее", target: "1 день", targetShort: "1 день", actual: "2 дня" }
      ]
    },
    samples: [10, 30, 60], sampleUnit: "материалах", sampleUnitCount: "материалов"
  },
  contract: {
    errors: {
      label: "Снизим ошибки", now: "12% расхождений пропускаем", nowShort: "12%",
      phrase: "снизим пропуски с 12% до {target}",
      goals: [
        { id: "x2", label: "Вдвое меньше", target: "6%", targetShort: "6%", actual: "8%" },
        { id: "x3", label: "Втрое меньше", target: "4%", targetShort: "4%", actual: "6%" }
      ]
    },
    time: {
      label: "Сократим время", now: "40 минут на договор", nowShort: "40 мин",
      phrase: "сократим сверку договора с 40 до {target}",
      goals: [
        { id: "x2", label: "Вдвое быстрее", target: "20 минут", targetShort: "20 мин", actual: "26 мин" },
        { id: "x3", label: "Втрое быстрее", target: "13 минут", targetShort: "13 мин", actual: "19 мин" }
      ]
    },
    faster: {
      label: "Проверим быстрее", now: "проверка за 2 дня", nowShort: "2 дня",
      phrase: "ускорим проверку с 2 дней до {target}",
      goals: [
        { id: "x2", label: "Вдвое быстрее", target: "1 день", targetShort: "1 день", actual: "1,5 дня" },
        { id: "x3", label: "Втрое быстрее", target: "4 часа", targetShort: "4 ч", actual: "1 день" }
      ]
    },
    samples: [10, 30, 60], sampleUnit: "договорах", sampleUnitCount: "договоров"
  }
};

// Список результатов задачи в порядке кнопок. Результат узнаём по структуре (у него
// есть goals), а не по чёрному списку служебных имён: перечисление имён уже дало
// пустую четвёртую кнопку, когда рядом появился sampleUnitCount.
export function taskResultIds(taskId) {
  const tm = taskMetrics[taskId] || {};
  return Object.keys(tm).filter((k) => Array.isArray(tm[k]?.goals));
}

// Числовые значения по умолчанию: первый результат, первая цель, первая выборка.
export function metricDefaults(taskId) {
  const tm = taskMetrics[taskId];
  if (!tm) return null;
  const resultId = taskResultIds(taskId)[0];
  return { resultId, goalId: tm[resultId].goals[0].id, sampleSize: tm.samples[0] };
}

// Части гипотезы, чтобы экран мог подсветить подставляемые фрагменты.
export function buildHypothesisParts(taskId, resultId, goalId, sampleSize, ownTaskText = "") {
  const action = (taskAction[taskId] || "внедрим решение").replace("{ownTaskText}", ownTaskText);
  const m = taskMetrics[taskId]?.[resultId];
  const goal = m?.goals.find((g) => g.id === goalId) || m?.goals[0];
  const unit = taskMetrics[taskId]?.sampleUnit || "случаях";
  return {
    action,
    goal: m ? m.phrase.replace("{target}", goal.target) : "получим измеримый результат",
    check: `Проверим на ${sampleSize} ${unit}.`
  };
}

export function buildHypothesis(taskId, resultId, goalId, sampleSize, ownTaskText = "") {
  const p = buildHypothesisParts(taskId, resultId, goalId, sampleSize, ownTaskText);
  return `Если ${p.action}, то ${p.goal}. ${p.check}`;
}

// Шаг 2: десять инструментов платформы. Выбрать можно три.
// badge оставлен в данных, но в интерфейсе не показывается (пометки зрелости убраны)
// cost — игровой показатель сложности внедрения (не цена сервиса), тратится из
// бюджета пилота (pilotBudget). Значения — из ТЗ «инструменты как механика».
export const tools = [
  { id: "llm",      name: "LLM",                  explain: "Большие языковые модели: пишут, переписывают, отвечают, разбирают текст.", cost: 25, badge: "Зрелый",        role: "разберёт и сформулирует текст" },
  { id: "rag",      name: "RAG",                  explain: "Ответы по твоим базам и документам, со ссылкой на источник.",             cost: 25, badge: "Зрелый",        role: "найдёт ответ в твоей базе" },
  { id: "ocr",      name: "OCR",                  explain: "Распознавание текста на сканах и фотографиях.",                          cost: 15, badge: "Зрелый",        role: "распознает текст на сканах" },
  { id: "ner",      name: "NER",                  explain: "Находит в тексте сущности: суммы, даты, названия, реквизиты.",           cost: 15, badge: "Зрелый",        role: "выделит нужные поля" },
  { id: "asr_tts",  name: "ASR и TTS",            explain: "Речь в текст и обратно.",                                                cost: 20, badge: "Зрелый",        role: "переведёт речь в текст" },
  { id: "dify",     name: "Dify",                 explain: "Конструктор агентов и ассистентов, собирается мышкой.",                  cost: 20, badge: "Без кода",      role: "соберёт всё в процесс" },
  { id: "mcp",      name: "MCP",                  explain: "Интеграции с вики, YouTrack и другими источниками.",                     cost: 20, badge: "Новый",         role: "подтянет данные из систем" },
  { id: "cargo",    name: "Cargo",                explain: "Поиск и сбор новостей по источникам.",                                   cost: 20, badge: "Новый",         role: "соберёт новости по источникам" },
  { id: "imagegen", name: "Image Gen API",        explain: "Генерация и обработка изображений.",                                     cost: 25, badge: "Новый",         role: "сделает изображение" },
  { id: "agents",   name: "Агентские фреймворки", explain: "Автономные системы с памятью, состоянием и своими инструментами.",       cost: 30, badge: "В начале пути", role: "выполнит шаги сам" }
];

// Бюджет пилота — заменяет прежний лимит «выбрать три». Единицы условные:
// показывают сложность/ресурс внедрения, не стоимость сервисов.
export const pilotBudget = 100;
export const budgetNote = "условная сложность пилота, не стоимость сервисов";
export const toolCost = (id) => toolById[id]?.cost || 0;
// Сколько уже потрачено: купленные на первом тесте инструменты (sunk) плюс
// добавленные сверх них в активной цепочке. Купленное не возвращается.
export function budgetSpent(state) {
  const sunk = state.tools.purchased || [];
  const active = state.tools.selected || [];
  const extra = active.filter((id) => !sunk.includes(id));
  return [...sunk, ...extra].reduce((s, id) => s + toolCost(id), 0);
}
export const budgetLeft = (state) => pilotBudget - budgetSpent(state);

// Шаг 2: рекомендованные (в бюджет) и альтернативные инструменты под задачу. VERIFY:highlight
export const taskTools = {
  documents: { reco: ["ocr", "ner", "dify"], alt: ["llm", "rag"] },
  requests:  { reco: ["llm", "dify", "mcp"], alt: ["ner", "rag"] },
  news:      { reco: ["cargo", "llm", "dify"], alt: ["ner", "mcp"] },
  contract:  { reco: ["ocr", "llm", "rag"], alt: ["dify", "mcp"] },
  own:       { reco: ["llm", "rag", "dify"], alt: ["ner", "ocr"] }
};

// Шаг 2: блок «чего не хватило» — tools.gaps
export const gapOptions = [
  { id: "no_model",       label: "Нужной модели нет в списке" },
  { id: "no_integration", label: "Нет интеграции с нашей системой" },
  { id: "price",          label: "Непонятно, сколько это стоит" },
  { id: "no_builder",     label: "Некому это собрать" },
  { id: "security",       label: "Не хватает ясности про безопасность данных" }
];

// Шаг 3: последствия выбора качества — step3Choice
export const step3Consequence = {
  enough: "Оставляем как есть. Правильное решение, если ошибку ловит человек на следующем шаге. Опасное, если не ловит никто.",
  refine: "Поправили промт и добавили примеров, стало точнее. Так уходит большая часть времени в пилоте: не на сборку, а на доводку."
};

// Шаг 3: три необходимые способности под каждую задачу. Каждую закрывает один
// инструмент из рекомендованных (taskTools[].reco). Если в выбранной тройке
// нужного инструмента нет, пилот собирается не весь: игрок меняет инструмент в
// бюджете и собирает заново. Провала нет, это мягкая связка бюджета с проверкой.
export const taskAbilities = {
  documents: [
    { need: "ocr",  label: "прочитать сканы",   miss: "Часть документов приходит фотографиями и сканами, а распознать их нечем. До полей дело не доходит." },
    { need: "ner",  label: "выделить поля",     miss: "Текст со страницы получили, а находить в нём суммы, даты и реквизиты приходится вручную." },
    { need: "dify", label: "собрать в процесс", miss: "Инструменты работают по отдельности, единого процесса нет, каждый документ ведёшь руками." }
  ],
  requests: [
    { need: "llm",  label: "разобрать обращение", miss: "Прочитать письмо и понять, о чём оно, нечем. Заявки остаются неразобранными." },
    { need: "dify", label: "собрать в процесс",   miss: "Отдельные шаги есть, а собрать их в один поток нечем, каждое обращение ведёшь вручную." },
    { need: "mcp",  label: "дотянуться до систем", miss: "Ответить можно, а подтянуть данные из вики и трекера нечем, ассистент отвечает вслепую." }
  ],
  news: [
    { need: "cargo", label: "собрать новости",    miss: "Искать и собирать материалы по источникам нечем, лента не наполняется." },
    { need: "llm",   label: "разобрать и отсеять", miss: "Материалы собрали, а понять, что из них по делу, нечем." },
    { need: "dify",  label: "собрать в процесс",  miss: "Куски есть, а регулярной сборки подборки нет, всё приходится запускать руками." }
  ],
  contract: [
    { need: "ocr", label: "прочитать договор",  miss: "Договор пришёл сканом, а распознать его нечем." },
    { need: "llm", label: "понять правки",      miss: "Текст есть, а сопоставить формулировки и понять смысл правок нечем." },
    { need: "rag", label: "сверить с эталоном", miss: "Сравнивать не с чем: типовую форму и прежние версии подтянуть нечем." }
  ],
  own: [
    { need: "llm",  label: "разобрать текст",    miss: "Понять и сформулировать по задаче нечем." },
    { need: "rag",  label: "опереться на базу",  miss: "Опереться на твои документы и базы нечем, ответы висят в воздухе." },
    { need: "dify", label: "собрать в процесс",  miss: "Собрать шаги в единый процесс нечем, каждый прогон запускаешь руками." }
  ]
};

// Какие способности не закрыты выбранной тройкой. Пусто — пилот собран целиком.
export function pilotGaps(taskId, selected = []) {
  const abilities = taskAbilities[taskId] || [];
  return abilities.filter((a) => !selected.includes(a.need));
}

// ─────────────────────────────────────────────────────────────
// Матрица инструментов как игровая механика (ТЗ «инструменты платформы»).
// Только для четырёх готовых кейсов. Своя задача (freeform) сюда не заходит:
// для неизвестной задачи игра не считает покрытие и не выдумывает эффект.
//
//   requiredCapabilities — 2–3 ключевые способности, каждую закрывает один core-
//     инструмент. Покрытие определяет бэнд результата (strong/partial/weak).
//   toolEffects[id] — релевантность (core|useful|context|irrelevant) и короткая
//     строка вклада (что инструмент дал) или пометка, почему не повлиял.
//   publicationFit[channel] — насколько канал подходит задаче (good|acceptable|weak).
//   outcomes[band] — заголовок исхода, строка теста и побочный показатель.
// ─────────────────────────────────────────────────────────────
export const taskScenarios = {
  documents: {
    requiredCapabilities: [
      { id: "read",    label: "прочитать сканы", tool: "ocr" },
      { id: "extract", label: "выделить поля",   tool: "ner" }
    ],
    toolEffects: {
      ocr:  { relevance: "core",       contribution: "распознал текст на сканах и фотографиях." },
      ner:  { relevance: "core",       contribution: "выделил суммы, даты и реквизиты." },
      dify: { relevance: "useful",     contribution: "собрал распознавание и извлечение в один процесс." },
      llm:  { relevance: "useful",     contribution: "привёл разнородные подписи полей к единому виду." },
      mcp:  { relevance: "useful",     contribution: "положил извлечённые поля прямо в учётную систему." },
      rag:  { relevance: "context",    contribution: "подсказал заполнение поля по справочнику." },
      agents: { relevance: "context",  contribution: "тут избыточен: процесс уже собран в Dify." },
      asr_tts:  { relevance: "irrelevant", note: "не нужны: в документах нет речи." },
      cargo:    { relevance: "irrelevant", note: "собирает новости, а не разбирает документы." },
      imagegen: { relevance: "irrelevant", note: "в разборе документов не участвует." }
    },
    publicationFit: { api: "good", background: "good", chat: "acceptable", widget: "weak" },
    outcomes: {
      strong:  { headline: "Цель достигнута",                 testResult: "Из счёта извлечено 11 полей из 12, дата распознана верно.", observation: "Сканы одного формата иногда требуют проверки даты." },
      partial: { headline: "Ускорили только часть процесса",  testResult: "Часть шага автоматизирована, часть осталась руками.",       observation: "Один из ключевых шагов пока делается вручную." },
      weak:    { headline: "Пилот почти не сдвинул цифру",    testResult: "Ни распознать сканы, ни выделить поля пока нечем.",         observation: "Данные по-прежнему переносишь руками." }
    }
  },
  requests: {
    requiredCapabilities: [
      { id: "understand", label: "разобрать обращение",  tool: "llm" },
      { id: "assemble",   label: "собрать шаги в процесс", tool: "dify" },
      { id: "integrate",  label: "дотянуться до систем", tool: "mcp" }
    ],
    toolEffects: {
      llm:  { relevance: "core",    contribution: "определила тип обращения." },
      dify: { relevance: "core",    contribution: "провёл обращения через собранный сценарий." },
      mcp:  { relevance: "core",    contribution: "забрал обращения из рабочей системы и вернул ответы." },
      ner:  { relevance: "useful",  contribution: "выделил в письмах номера договоров и суммы." },
      rag:  { relevance: "useful",  contribution: "подсказал связанные инструкции по вопросу." },
      agents: { relevance: "context", contribution: "избыточен: сценарий уже собран в Dify." },
      ocr:      { relevance: "irrelevant", note: "не повлиял: обращения приходят текстом." },
      asr_tts:  { relevance: "irrelevant", note: "не нужны: заявки текстовые." },
      cargo:    { relevance: "irrelevant", note: "собирает новости, а не разбирает заявки." },
      imagegen: { relevance: "irrelevant", note: "в разборе заявок не участвует." }
    },
    publicationFit: { widget: "good", chat: "good", api: "acceptable", background: "weak" },
    outcomes: {
      strong:  { headline: "Цель достигнута",                testResult: "Разобрано 47 писем из 50, три ушли не в ту очередь.", observation: "В 6% случаев нужна помощь человека." },
      partial: { headline: "Пилот работает, до цели не дотянули", testResult: "Письма прочитаны, но развести их по очередям нечем.", observation: "Узкое место — ручная передача результата между системами." },
      weak:    { headline: "Ускорили только часть процесса", testResult: "Понять содержание письма пока нечем.",                observation: "Каждое обращение всё равно разбираешь вручную." }
    }
  },
  news: {
    requiredCapabilities: [
      { id: "collect", label: "собрать новости",   tool: "cargo" },
      { id: "filter",  label: "разобрать и отсеять материалы", tool: "llm" }
    ],
    toolEffects: {
      cargo: { relevance: "core",   contribution: "собрал материалы по источникам." },
      llm:   { relevance: "core",   contribution: "отсеяла дубли и нерелевантное." },
      dify:  { relevance: "useful", contribution: "собрал сбор и разбор в регулярный процесс." },
      mcp:   { relevance: "useful", contribution: "подтянул источники из внутренних систем." },
      ner:   { relevance: "useful", contribution: "выделил в новостях компании и даты." },
      rag:   { relevance: "useful", contribution: "связал новость с внутренними документами." },
      asr_tts: { relevance: "context", contribution: "пригодился бы, будь среди источников подкасты и видео." },
      agents:  { relevance: "context", contribution: "для регулярной подборки избыточен." },
      ocr:      { relevance: "irrelevant", note: "не повлиял: материалы приходят текстом." },
      imagegen: { relevance: "irrelevant", note: "в сборе новостей не участвует." }
    },
    publicationFit: { background: "good", chat: "acceptable", api: "acceptable", widget: "weak" },
    outcomes: {
      strong:  { headline: "Цель достигнута",                testResult: "За сутки собрано 6 материалов, лишнее отсеяно.", observation: "Пара источников иногда дублирует новости." },
      partial: { headline: "Ускорили только часть процесса", testResult: "Лента наполняется, но чистит её человек.",       observation: "Один из ключевых шагов пока делается вручную." },
      weak:    { headline: "Пилот почти не сдвинул цифру",   testResult: "Ни собрать материалы, ни отсеять лишнее пока нечем.", observation: "Ленту по-прежнему читаешь вручную." }
    }
  },
  contract: {
    requiredCapabilities: [
      { id: "understand", label: "понять правки",     tool: "llm" },
      { id: "compare",    label: "сверить договор с эталоном", tool: "rag" }
    ],
    toolEffects: {
      llm:  { relevance: "core",    contribution: "сопоставила формулировки и объяснила смысл правок." },
      rag:  { relevance: "core",    contribution: "сверил договор с типовой формой и прежними версиями." },
      ner:  { relevance: "useful",  contribution: "выделил номера пунктов, суммы и даты." },
      dify: { relevance: "useful",  contribution: "собрал сверку в повторяемый процесс." },
      mcp:  { relevance: "useful",  contribution: "подтянул типовые формы из хранилища." },
      ocr:    { relevance: "context", contribution: "понадобился бы, приди договор сканом." },
      agents: { relevance: "context", contribution: "для сверки избыточен." },
      asr_tts:  { relevance: "irrelevant", note: "не нужны: договор текстовый." },
      cargo:    { relevance: "irrelevant", note: "собирает новости, а не сверяет договоры." },
      imagegen: { relevance: "irrelevant", note: "в сверке договоров не участвует." }
    },
    publicationFit: { api: "good", chat: "good", widget: "acceptable", background: "weak" },
    outcomes: {
      strong:  { headline: "Цель достигнута",                testResult: "Найдено 3 смысловых отличия от типовой формы.", observation: "Форматные отличия иногда попадают в список." },
      partial: { headline: "Ускорили только часть процесса", testResult: "Правки находит, а сверить с эталоном нечем.",     observation: "Один из ключевых шагов пока делается вручную." },
      weak:    { headline: "Пилот почти не сдвинул цифру",   testResult: "Ни понять правки, ни сверить с формой пока нечем.", observation: "Договоры по-прежнему сверяешь глазами." }
    }
  }
};

// Порядок релевантности и понятная подпись для интерфейса.
export const relevanceRank = { core: 3, useful: 2, context: 1, irrelevant: 0 };

// Бэнд результата по покрытию ключевых способностей активной цепочкой.
// Все ключевые закрыты — strong, ни одной — weak, иначе partial.
export function outcomeBand(taskId, activeIds = []) {
  const sc = taskScenarios[taskId];
  if (!sc) return null;
  const caps = sc.requiredCapabilities;
  const covered = caps.filter((c) => activeIds.includes(c.tool)).length;
  if (covered === caps.length) return "strong";
  if (covered === 0) return "weak";
  return "partial";
}

// Наблюдаемый бэнд с поправкой на канал публикации: неподходящий канал (weak)
// снижает результат на ступень, подходящий оставляет как есть.
export function effectiveBand(band, fit) {
  const order = ["weak", "partial", "strong"];
  const i = order.indexOf(band);
  if (i < 0) return band;
  if (fit === "weak") return order[Math.max(0, i - 1)];
  return band;
}

// Пилот собран сложнее необходимого: цель достигнута, но в активной цепочке есть
// нерелевантные инструменты или потрачена почти вся смета.
export function isOverbuilt(taskId, state) {
  const sc = taskScenarios[taskId];
  if (!sc || outcomeBand(taskId, state.tools.selected) !== "strong") return false;
  const hasIrrelevant = state.tools.selected.some((id) => sc.toolEffects[id]?.relevance === "irrelevant");
  return hasIrrelevant || budgetSpent(state) >= 85;
}

// Разбор набора до запуска теста (шаг 3): что можно убрать и чего не хватает.
// Лишним считаем только нерелевантное: useful и context дают реальный вклад, и
// записывать их в бесполезные было бы неправдой. Для своей задачи возвращаем null —
// нужной архитектуры игра не знает и оценку не выносит.
export function precheckSet(taskId, selected = []) {
  const sc = taskScenarios[taskId];
  if (!sc) return null;
  const extra = selected
    .filter((id) => sc.toolEffects[id]?.relevance === "irrelevant")
    .map((id) => ({ id, name: toolById[id]?.name || id, note: sc.toolEffects[id].note, cost: toolCost(id) }));
  const missing = sc.requiredCapabilities
    .filter((c) => !selected.includes(c.tool))
    .map((c) => ({ ...c, toolName: toolById[c.tool]?.name || c.tool }));
  return { extra, extraCost: extra.reduce((sum, t) => sum + t.cost, 0), missing };
}

// Сколько выбранных инструментов не участвовало в решении — строка на финале.
export function idleToolCount(taskId, selected = []) {
  const sc = taskScenarios[taskId];
  if (!sc) return 0;
  return selected.filter((id) => sc.toolEffects[id]?.relevance === "irrelevant").length;
}

// Соответствие выбранного канала задаче (для готовых кейсов).
export function publicationFitOf(taskId, channelId) {
  return taskScenarios[taskId]?.publicationFit?.[channelId] || null;
}

// «Стало» на шаге 5 по наблюдаемому бэнду: strong — цель достигнута, partial —
// промежуточное значение (actual), weak — почти как было.
export function observedValue(taskId, resultId, goalId, band) {
  const m = taskMetrics[taskId]?.[resultId];
  if (!m) return "";
  const goal = m.goals.find((g) => g.id === goalId) || m.goals[0];
  if (band === "strong") return goal.targetShort;
  if (band === "weak") return m.nowShort;
  return goal.actual;
}

// Шаг 4: каналы публикации. name — пользовательский сценарий, tools — внутренние
// названия вторым уровнем, requirements — список без чекбоксов. VERIFY:channels
export const channels = [
  {
    id: "widget",
    name: "Виджет в своём сервисе",
    scenario: "Чат-ассистент прямо в твоём сервисе, пользователь общается с ним на странице.",
    tools: "Виджет ассистентов",
    loc: "виджет ассистентов",
    requirements: ["Документация платформы виджетов", "Модуль виджета", "Вызов через API виджета", "Встраивание в страницу"]
  },
  {
    id: "api",
    name: "Встроить в процесс по API",
    scenario: "Решение вызывается из существующего процесса или продукта, отдельного интерфейса пользователь не видит.",
    tools: "LiteLLM и MCP",
    loc: "LiteLLM и MCP",
    requirements: ["Ключ доступа", "Лимиты и гардрейлы", "Вызов из своего кода"]
  },
  {
    id: "chat",
    name: "Отдельный чат",
    scenario: "Своего сервиса нет, решение живёт в общем чате, куда приходит команда.",
    tools: "AICON или KonturGPT",
    loc: "AICON, KonturGPT",
    requirements: ["Опубликовать решение", "Выдать доступ команде"]
  },
  {
    id: "background",
    name: "Фоновый процесс или сводка",
    scenario: "Пакетная обработка или регулярная рассылка: работает в фоне, замечают по результату.",
    tools: "пайплайн и расписание",
    loc: "пайплайн по расписанию",
    requirements: ["Расписание или триггер", "Куда складывать результат"]
  }
];

// Шаг 4: рекомендация под задачу. reco[0] — предлагаемый канал, text — подводка.
export const taskChannels = {
  documents: { reco: ["api", "background"], text: "Для горы документов чаще подходит API или фоновый процесс: отдельный интерфейс пользователю может не понадобиться." },
  requests:  { reco: ["widget", "chat"],   text: "Для потока заявок обычно подходит виджет в сервисе или отдельный чат: ответ нужен человеку прямо в переписке." },
  news:      { reco: ["background"],        text: "Для новостей подходит фоновый процесс со сводкой: материалы собираются сами и приходят готовым дайджестом." },
  contract:  { reco: ["api", "chat"],       text: "Для сверки договоров подходит вызов по API или отдельный чат: юрист запускает проверку из своего процесса." },
  own:       { reco: ["widget", "api", "chat", "background"], text: "Под такую задачу подойдёт любой из каналов, выбирай по тому, где решение встретит пользователя." }
};

// Шаг 5: последствия решения — step5Choice. Каждое опирается на показанный сигнал.
export const step5Consequence = {
  fix:   "Дорабатываем проблемный тип из сигнала выше, и доля падает. Через две недели повторяем ту же проверку и сравниваем цифры.",
  scale: "Данных на выбранной проверке хватает, результат держится. Расширяем на соседний отдел и следим за одним риском: их специфику ещё никто не размечал.",
  stop:  "Останавливаем пилот и записываем условия в вики. Проверка показала, где решение спотыкается, и команда решила пока не разворачивать его дальше, сохранив ресурсы. Остановка после проверки тоже результат, и он экономит деньги."
};

// Копирайт экранов: заголовки, подводки, кнопки, микротексты по шагам.
export const ui = {
  // Входная заставка-конвейер перед первым экраном. Только три подписи и кнопка,
  // сама анимация — в intro.js, ассеты — в intro-assets.js.
  intro: {
    kicker: "Пилот за пять шагов",
    title: "Собери решение на конвейере",
    caption: "Выбери рабочую задачу, соберём для неё первый ИИ-пилот. Пять шагов, три минуты, ноль созвонов.",
    button: "Начать игру →"
  },
  step0: {
    badge: "ИИ-платформа",
    title: "Выбери задачу для пилота",
    intro: "На её примере соберёшь решение из инструментов ИИ-платформы и увидишь, как они работают вместе.",
    sectionLabel: "Выбери задачу",
    ownFieldLabel: "Что за задача",
    ownFieldPlaceholder: "Например, свести данные из трёх систем в один отчёт",
    ownExplain: "В игре пройдёшь общий маршрут, а на стенде сможешь разобрать детали с командой.",
    ownModalTitle: "Опиши свою задачу",
    ownFilledTitle: "Моя задача",
    modalCancel: "Отмена",
    modalSave: "Сохранить",
    awarenessQuestion: "Знаешь, с чего начать такой пилот?",
    awarenessYes: "Да",
    awarenessNo: "Нет",
    awarenessRequired: "Ответь на вопрос, чтобы начать",
    counterTemplate: "До финала дошли {n} человек", // показываем, если появится хранилище
    button: "Собрать пилот →"
  },
  step1: {
    location: "ии-в-бизнесе",
    title: "Сформулируй гипотезу",
    intro: "Используй заготовку или напиши своими словами",
    introFree: "Запиши гипотезу своими словами. На стенде поможем её уточнить.",
    introCustom: "Разберём твою формулировку на стенде.",
    cardLabel: "Гипотеза",
    channelLine: "Обсуди гипотезу в ~ии-в-бизнесе",
    resultLegend: "Ожидаемый результат",
    goalLegendTemplate: "Цель: сейчас {now}",
    sampleLegend: "Проверим на",
    editAria: "Написать свою формулировку",
    resetLink: "Вернуть заготовку",
    freePlaceholder: "Если внедрим решение под мою задачу, то ... . Проверим ...",
    modalTitle: "Своя формулировка",
    modalIntro: "Если заготовка не про твой случай, перепиши её целиком.",
    modalCancel: "Отмена",
    modalSave: "Сохранить",
    emptyError: "Напиши гипотезу, хотя бы одной строкой",
    button: "Выбрать инструменты →"
  },
  step2: {
    location: "ИИ Платформа, ai.kontur.host",
    title: "Выбери инструменты",
    intro: "Собери решение из инструментов платформы и уложись в бюджет. Баллы показывают сложность внедрения",
    budgetTitle: "Бюджет пилота",
    budgetLeftTemplate: "Осталось {left} из {total}",
    budgetSpentTemplate: "Использовано {spent}",
    cantAffordTemplate: "Не хватает {n}",
    costTemplate: "{cost}",
    hintButton: "Подсказать",
    hintText: "Для этой задачи обычно подходят подсвеченные инструменты.",
    hintOwnText: "Свою задачу игра не знает достаточно, чтобы советовать стек. Смотри на роль каждого инструмента и собирай сам.",
    allToolsToggle: "Показать все 10 инструментов",
    collapseToolsLabel: "Свернуть инструменты",
    emptyChainError: "Собери хотя бы один инструмент, иначе проверять нечего.",
    gapsTitle: "Не нашёлся нужный инструмент? Отметь, чего не хватает",
    refineBanner: "Доработка пилота. Поменяй цепочку в рамках остатка бюджета: потраченное не вернётся, уже купленное включается бесплатно.",
    refineButton: "Проверить снова →",
    button: "Проверить решение →"
  },
  step3: {
    location: "Dify или твой код",
    title: "Проверь решение",
    intro: "Запусти собранную цепочку на реальном примере и посмотри, как она работает",
    chainLabel: "Как работает решение",
    buildButton: "Запустить тест",
    buildingText: "Прогоняем на реальном случае",
    resultLabel: "Результат теста",
    contributionsLabel: "Роль инструментов",
    customResult: "Цепочка собрана. Следующий шаг — проверить её на реальных случаях из твоей задачи и сравнить результат с гипотезой.",
    question: "Что делать с результатом?",
    enoughLabel: "Принять",
    refineLabel: "Доработать",
    refineDoneNote: "Одну доработку уже сделали, второй раунд в игре не проходим.",
    // Разбор набора до запуска: пока ничего не потрачено, менять его бесплатно.
    precheckExtraTitle: "Что можно убрать",
    precheckExtraLead: "Эти инструменты не помогают проверить твою гипотезу:",
    precheckExtraCostOne: "Он расходует {n} баллов бюджета и не влияет на результат пилота.",
    precheckExtraCostMany: "Они расходуют {n} баллов бюджета и не влияют на результат пилота.",
    precheckMissingTitle: "Чего не хватает",
    precheckMissingTemplate: "Без {tool} решение не сможет {what}.",
    precheckChangeButton: "Изменить набор",
    precheckRunButton: "Запустить как есть",
    precheckAddTemplate: "Добавить {tool}",
    precheckCustomNote: "Проверь, какую роль выполняет каждый инструмент. Спорные разбери со стендистом.",
    button: "Выбрать способ запуска →"
  },
  step4: {
    location: "куда вывести решение",
    title: "Выбери способ запуска",
    intro: "Выбери, где будет работать решение: в твоём сервисе, отдельном чате или в фоне",
    fits: "Выбрать этот способ",
    chooseOther: "Посмотреть другие способы",
    behindLabel: "Основа",
    otherLabel: "Способ запуска",
    requirementsLabel: "Что понадобится",
    earlyAttempt: "Реши, как решение дойдёт до людей. Без этого пилот остаётся у тебя в тестовом окне.",
    button: "Запустить пилот →"
  },
  step5: {
    location: "LangFuse",
    title: "Оцени результат пилота",
    intro: "Прошло две недели. Сравни результат с целью и выбери следующий шаг",
    titleFree: "За чем будешь следить",
    introFree: "Пилот работает. Через две недели ты вернёшься к нему с этой цифрой.",
    metricsLabel: "Результат за две недели",
    tileWas: "Было",
    tileNow: "Стало",
    tileSample: "Проверено",
    goalLineTemplate: "Цель была {target}, до неё не дотянули.",
    goalReachedTemplate: "Цель достигнута: {target}.",
    goalFlatTemplate: "Цель была {target}, но цифра почти не сдвинулась.",
    pubWeakNote: "Канал публикации не подошёл задаче: часть пользователей до решения не дошла.",
    watchQuestion: "Числа мы не собирали: критерий ты описал словами. Назови, за чем будешь следить.",
    watchOwnPlaceholder: "например, сколько заявок прошло без правок",
    watchConsequenceTemplate: "Через две недели сравниваешь {what} до и после. Без этой цифры пилот нельзя ни закрыть, ни продлить: спорить будете мнениями.",
    question: "Что делать дальше?",
    fixLabel: "Доработать",
    scaleLabel: "Масштабировать",
    stopLabel: "Остановить",
    hints: [
      "Трассировки и метрики смотри в LangFuse, данные в Redash.",
      "Дорабатывай решение в Dify.",
      "Если инструментов не хватило, приходи в srs_support."
    ],
    button: "Получить приз →"
  }
};

// Экран 6: финал. Три варианта по решению шага 5 (finalVariant): масштабировать,
// исправить, остановить. После остановки нельзя писать «пилот запущен» или
// «прекрасно себя показал».
//
// Заголовок и подстрочник финала строятся не отсюда, а из уровня результата
// (taskScenarios.outcomes) в screens.js: финал показывает, что игрок собрал, а
// не то, что он выбрал. Здесь остаётся только короткая форма итога для
// копируемого плана.
export const final = {
  variants: {
    scale: { resultShort: "первая проверка пройдена" },
    fix:   { resultShort: "нашли, что доработать" },
    stop:  { resultShort: "решили не разворачивать" },
    // Свободная ветка: гипотеза словами, чисел ещё нет — пилот ушёл в наблюдение.
    watch: { resultShort: "пилот в наблюдении" }
  },
  decisionLabels: { fix: "Доработать", scale: "Масштабировать", stop: "Остановить", watch: "наблюдаю за цифрой" },
  // Верхний герой финала: метка места, крупное решение и одна фраза-итог.
  metaBadge: "5 из 5 · Пилот завершён",
  cardWatchLabel: "Смотрю",
  cardTaskLabel: "Задача",
  cardHypothesisLabel: "Гипотеза",
  cardToolsLabel: "Инструменты",
  cardLaunchLabel: "Режим запуска",
  cardChannelLabel: "Канал",
  cardCheckLabel: "Проверка",
  cardResultLabel: "Итог проверки",
  cardDecisionLabel: "Следующий шаг",
  // Человекочитаемое решение для карточки финала (не трогает decisionLabels,
  // который остаётся форматом строки для копируемого текста и совместимости).
  cardDecisionNames: { scale: "Масштабировать", fix: "Доработать", stop: "Остановить", watch: "Наблюдать" },
  // Расширенный финал готового кейса: заголовок-исход, метрики и recap цепочки.
  outcomeStop: "Пилот остановлен вовремя",
  outcomeOverbuilt: "Решение получилось сложнее необходимого",
  outcomeSubStop: "Проверка показала ограничения решения и помогла не тратить ресурсы на масштабирование.",
  outcomeSubOverbuilt: "Цель достигнута, но часть инструментов почти не повлияла на результат.",
  metricsLabel: "Что показал пилот",
  mWas: "Было",
  mNow: "Стало",
  mGoal: "Цель",
  mBudget: "Бюджет",
  recapLabel: "Собранное решение",
  recapDecisionLabel: "Следующий шаг",
  // Итог бюджетного урока: сложное решение можно упростить без потери результата.
  recapIdleOne: "1 из {total} инструментов не участвовал в решении.",
  recapIdleMany: "{n} из {total} инструментов не участвовали в решении.",
  // Финал своей задачи: черновик пилота для разговора со стендистом, без выдуманных метрик.
  customHeadline: "Черновик пилота собран",
  customSub: "Проверишь его на своих случаях и обсудишь со стендистом.",
  customTaskLabel: "Твоя задача",
  customHypothesisLabel: "Гипотеза",
  customChainLabel: "Черновик цепочки",
  customChannelLabel: "Канал",
  customWatchLabel: "Будем смотреть",
  customStandNote: "Покажи этот план стендисту — вместе проверите цепочку и следующий шаг.",
  cardFooter: "Под каждый шаг в Контуре уже был готовый инструмент.",
  cardFooterStop: "Все пять шагов прошли на готовых инструментах Контура.",
  cardFooterGaps: "Под большинство шагов инструмент в Контуре уже был. Чего не хватило, мы записали.",
  // Код подарка: самый заметный блок после решения. Значение — из giftCode(runId).
  codeTop: "Покажи этот код стендисту",
  codeBottom: "Забери подарок",
  // Забрать план с собой: кнопка копирует собранную карточку пилота в буфер.
  copyButton: "Скопировать план",
  copyDone: "Скопировано",
  copyFail: "Не удалось скопировать",
  // Ник дежурного статичный, как в блоке ссылок. Держим одним значением.
  dutyNick: "@srs_aiplatform_duty",
  shareTitleTemplate: "Пилот под задачу «{task}»",
  shareNextStep: "С чего начать: написать дежурному по ИИ-платформе {duty} или в канал ии-в-бизнесе.",
  shareToolsLine: "Инструменты платформы: wiki.skbkontur.ru, страница «Инструменты ИИ-платформы».",
  // Рабочие ссылки на реальные адреса Контура. Канала новостей платформы нет,
  // поэтому третья ссылка ведёт в srs_support к дежурному по платформе.
  ctas: [
    { id: "bring",  title: "Принести свою гипотезу", sub: "Канал ии-в-бизнесе, там сидят те, кто это собирает",     href: "https://chat.skbkontur.ru/kontur/channels/ii-v-biznese" },
    { id: "tools",  title: "Посмотреть инструменты", sub: "Страница «Инструменты ИИ-платформы» в вики",             href: "https://wiki.skbkontur.ru/pages/viewpage.action?pageId=1083406188" },
    { id: "help",   title: "Спросить платформу",     sub: "Канал srs_support, дежурный @srs_aiplatform_duty",       href: "https://chat.skbkontur.ru/kontur/channels/srs_support" }
  ],
  // Единственный добровольный сценарий контакта (раздел 14). На подарок не влияет.
  taskPrompt: "Есть задача, которую хочется запустить по-настоящему?",
  contactCta: "Разобрать задачу с командой",
  contactExplain: "Оставь почту или ник в ММ. Команда платформы посмотрит задачу и позовёт на разбор.",
  contactPlaceholder: "почта или ник в ММ",
  contactTaskPlaceholder: "какую задачу хочешь разобрать",
  contactSend: "Отправить",
  contactClose: "Закрыть",
  contactSending: "Отправляем…",
  contactSent: "Отправлено",
  contactRetry: "Попробовать ещё раз",
  contactOk: "Записали, свяжемся по этому контакту.",
  contactNeedField: "Впиши почту или ник, чтобы отправить.",
  contactBadFormat: "Похоже на опечатку. Впиши почту или ник в ММ.",
  awarenessRepeat: "Теперь знаешь, с чего начать такой пилот?",
  awarenessYes: "Да",
  awarenessNo: "Нет",
  nextStepPrompt: "Какой шаг сделаешь первым?",
  nextStepOwnPlaceholder: "или впиши свой",
  toAnketaCaption: "Два вопроса, и мы поймём, что строить дальше",
  toAnketa: "Ответить на два вопроса →"
};

// Экран 7: анкета. Вопрос о контакте убран (он один на финале), осталось два
// содержательных вопроса, оба необязательные.
export const anketa = {
  title: "Два коротких вопроса",
  intro: "Отвечать необязательно, подарок уже твой.",
  questions: [
    { text: "Каких возможностей не хватило среди инструментов?", prefill: "gaps" }, // предзаполняем отмеченным на шаге 2
    { text: "Что мешает твоей команде начать?" }
  ],
  button: "Отправить",
  thanks: "Спасибо. Прочитаем всё, включая то, что написано в сердцах."
};

// Системные состояния.
export const system = {
  loading: "Секунду",
  emptyRequired: "Выбери задачу, чтобы начать",
  charsLeftTemplate: "Осталось {n} символов",
  offline: "Связь пропала. Прогресс сохранён, попробуй ещё раз.",
  contactError: "Не отправилось. Код подарка уже у тебя, он работает без этого."
};

// ─────────────────────────────────────────────────────────────
// 3. Состояние прохождения: что игра несёт от экрана к экрану.
//    Признак корзины гипотезы (нетронутая / поправленная / своя)
//    отдельно не хранится, а выводится из признака edited и finalText.
// ─────────────────────────────────────────────────────────────
// Версия структуры состояния. При несовпадении старое сохранение не восстанавливаем.
export const SCHEMA_VERSION = 4;

// Версия игры — уходит в каждое событие аналитики.
export const GAME_VERSION = "0.9.7";

export function createInitialState() {
  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    runId: newRunId(),   // анонимный идентификатор прохождения
    status: "new",       // new | started | finished
    currentStep: "step0",
    task: null,          // id выбранной задачи
    ownTaskText: "",     // если выбрана «своя»
    awarenessBefore: null, // ответ базового вопроса на входе: "yes" | "no"
    name: "",            // не используется в интерфейсе, оставлено для совместимости
    hypothesis: {
      finalText: "",       // итоговый текст гипотезы
      freeform: false,     // свободная формулировка: числа не используются
      customText: "",      // текст, написанный руками (пусто в числовом режиме)
      resultChoice: null,  // id результата из taskMetrics[task] (предвыбран первый)
      goalChoice: null,    // "x2" | "x3" (предвыбрана первая цель результата)
      sampleSize: null     // число из samples задачи (предвыбрана первая)
    },
    tools: {
      selected: [],      // активная цепочка (activeToolIds) — id из tools
      gaps: [],          // id из gapOptions
      purchased: []      // купленные к первому тесту (sunk-бюджет), не возвращаются
    },
    testCount: 0,        // сколько раз запускали проверку: 0 | 1 | 2 (макс одна доработка)
    refine: false,       // идёт доработка после первого теста (возврат к инструментам)
    step3Choice: null,   // "enough" | "refine"
    publishChannel: null, // выбранный канал публикации (шаг 4)
    step5Choice: null,   // "fix" | "scale" | "stop" (в свободной ветке не заполняется)
    step5Watch: null,    // id из watchOptions — обязательное в свободной ветке
    step5WatchOwn: "",   // текст, если выбрано "own"
    finalVariant: null,  // вычисляется из step5Choice, в свободной ветке "watch"
    awarenessAfter: null, // ответ на финале: "yes" | "no"
    nextStepText: "",    // необязательно
    contact: "",         // необязательно
    contactSent: false,  // контакт уже отправлен — не спрашиваем повторно
    copied: false,       // нажал ли «Скопировать итог» на финале (для сводки/метрики)
    createdAt: now,
    updatedAt: now,
    stepStartedAt: now
  };
}

// Сброс данных, зависящих от выбранной задачи. Вызывается при смене задачи,
// чтобы новая ветка не наследовала гипотезу, инструменты и решения старой.
export function resetDependentOnTask(state) {
  state.hypothesis = { finalText: "", freeform: false, customText: "", resultChoice: null, goalChoice: null, sampleSize: null };
  state.tools = { selected: [], gaps: [], purchased: [] };
  state.testCount = 0;
  state.refine = false;
  state.step3Choice = null;
  state.publishChannel = null;
  state.step5Choice = null;
  state.step5Watch = null;
  state.step5WatchOwn = "";
  state.finalVariant = null;
  state.awarenessAfter = null;
  state.nextStepText = "";
  state.copied = false;
}

// Анонимный идентификатор прохождения. Ничего личного, только для связи событий.
function newRunId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "run-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

// Порядок экранов: линейная цепочка без перескоков.
export const flow = ["step0", "step1", "step2", "step3", "step4", "step5", "final", "anketa"];

// Карта пути: пять узлов над экранами шагов. Названия совпадают с постером
// и финальной карточкой. Узлы — указатель, перескакивать по ним нельзя.
export const pathMap = [
  { step: "step1", label: "Гипотеза" },
  { step: "step2", label: "Инструменты" },
  { step: "step3", label: "Проверка" },
  { step: "step4", label: "Запуск" },
  { step: "step5", label: "Результат" }
];

// Короткая сводка прохождения для формы: человекочитаемые названия выборов и
// ответы анкеты. Контакт сюда не кладём — он идёт отдельной строкой (kind=contact).
export function buildSummary(state, answers = []) {
  const h = state.hypothesis;
  const toolNames = (state.tools.selected.length ? state.tools.selected : [])
    .map((id) => toolById[id]?.name).filter(Boolean);
  const gaps = state.tools.gaps
    .map((id) => gapOptions.find((g) => g.id === id)?.label).filter(Boolean);
  // Критерий: в свободной ветке — что игрок назвал для наблюдения; в числовой — цель и выборка.
  let criterion = "";
  if (h.freeform) {
    criterion = state.step5Watch === "own"
      ? (state.step5WatchOwn || "").trim()
      : (watchOptions.find((w) => w.id === state.step5Watch)?.short || "");
  } else {
    const m = taskMetrics[state.task]?.[h.resultChoice];
    const goal = m?.goals.find((g) => g.id === h.goalChoice);
    if (goal) criterion = `${goal.targetShort} на ${h.sampleSize} ${taskMetrics[state.task]?.sampleUnit || "случаях"}`;
  }
  return {
    sessionId: state.runId,
    task: state.task,
    decision: state.finalVariant || state.step5Choice || "",
    awarenessBefore: state.awarenessBefore || "",
    awarenessAfter: state.awarenessAfter || "",
    tools: toolNames.join(", "),
    channel: state.publishChannel ? (channelById[state.publishChannel]?.name || "") : "",
    criterion,
    gaps: gaps.join(", "),
    answer1: answers[0] || "",
    answer2: answers[1] || "",
    copied: state.copied ? "yes" : "no",   // нажал ли «Скопировать итог» на финале
    ts: Date.now()
  };
}

// Человекочитаемое название задачи: у своей — введённый текст, не заглушка карточки.
function taskLabelOf(state, task) {
  return state.task === "own" ? (state.ownTaskText.trim() || task.title) : task.title;
}

// Первая буква строчной — для вставки значения в середину строки после «Канал: ».
function lowerFirst(s) {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

// Итоговый текст гипотезы: в свободной ветке — свой текст, в числовом режиме —
// собирается из выбранных результата, цели и выборки (с дефолтами, если пусто).
export function hypothesisText(state) {
  const h = state.hypothesis;
  if (h.freeform) return (h.customText || h.finalText || "").trim();
  if (!taskById[state.task]) return h.finalText || "";
  const d = metricDefaults(state.task);
  return buildHypothesis(
    state.task,
    h.resultChoice || d?.resultId,
    h.goalChoice || d?.goalId,
    h.sampleSize ?? d?.sampleSize,
    state.ownTaskText.trim()
  );
}

// За чем игрок будет следить в свободной ветке: фраза для строки последствия и карточки.
export function watchWhat(state) {
  if (state.step5Watch === "own") return (state.step5WatchOwn || "").trim() || "то, что ты назвал";
  return watchOptions.find((w) => w.id === state.step5Watch)?.watchPhrase || "то, что ты назвал";
}

// Собранная карточка пилота для буфера обмена (правка «Унести гипотезу с собой»).
// Только из имеющегося состояния. Имя игрока не включаем: текст человек отправляет
// себе или руководителю. Ник дежурного и ссылки — из final.
export function buildShareText(state) {
  const task = taskById[state.task];
  if (!task) return "";
  const label = taskLabelOf(state, task);
  const hyp = hypothesisText(state);
  const toolNames = (state.tools.selected.length ? state.tools.selected : (taskTools[state.task]?.reco || []))
    .map((id) => toolById[id]?.name).filter(Boolean);
  const channel = state.publishChannel ? channelById[state.publishChannel]?.name : null;
  const key = state.finalVariant || state.step5Choice;
  const isWatch = key === "watch";
  const resultShort = key ? final.variants[key]?.resultShort : null;
  const decision = key ? final.decisionLabels[key] : null;

  const lines = [final.shareTitleTemplate.replace("{task}", label), ""];
  lines.push(`${final.cardHypothesisLabel}: ${hyp}`, "");
  if (toolNames.length) lines.push(`${final.cardToolsLabel}: ${toolNames.join(", ")}`);
  if (channel) lines.push(`${final.cardChannelLabel}: ${lowerFirst(channel)}`);
  // В свободной ветке итога и решения ещё нет — вместо них строка наблюдения.
  if (isWatch) {
    lines.push(`${final.cardWatchLabel}: ${watchWhat(state)}, вернусь через две недели`);
  } else {
    if (resultShort) lines.push(`${final.cardResultLabel}: ${resultShort}`);
    if (decision) lines.push(`${final.cardDecisionLabel}: ${lowerFirst(decision)} пилот`);
  }
  lines.push("", final.shareNextStep.replace("{duty}", final.dutyNick), final.shareToolsLine);
  return lines.join("\n");
}

// Удобный доступ к задаче по id.
export const taskById = Object.fromEntries(tasks.map((t) => [t.id, t]));
export const toolById = Object.fromEntries(tools.map((t) => [t.id, t]));
export const channelById = Object.fromEntries(channels.map((c) => [c.id, c]));

// Единый объект контента, если удобнее импортировать одним куском.
export const content = {
  tasks, taskById,
  resultOptions, watchOptions, taskAction, taskMetrics, taskResultIds, metricDefaults,
  buildHypothesis, buildHypothesisParts, buildSummary, buildShareText, hypothesisText, watchWhat,
  tools, toolById, taskTools, gapOptions,
  pilotBudget, budgetNote, toolCost, budgetSpent, budgetLeft,
  taskScenarios, relevanceRank, outcomeBand, effectiveBand, isOverbuilt, publicationFitOf, observedValue,
  precheckSet, idleToolCount,
  channels, channelById, taskChannels,
  step3Consequence, taskAbilities, pilotGaps, step5Consequence,
  ui, final, anketa, system, flow, pathMap
};

export default content;
