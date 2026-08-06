// Входная анимация «конвейер»: заставка перед первым экраном. Из корпуса станка
// потоком выходят грузы — гипотезы, технологии, интерфейсы и метрики — и едут по
// ленте. Сверху три подписи, снизу одна кнопка «Начать игру». По клику заставка
// гаснет, а поверх проявляется обычный экран выбора задачи (это делает app.js).
//
// Заставку показываем только на свежем старте, до первого шага. Возврат по ссылке
// с сохранённым прогрессом её пропускает — там сразу нужный шаг, а не вступление.

import { el } from "./dom.js";
import { art, icons } from "./intro-assets.js";

export function shouldShowIntro({ screen, state, resuming, firstScreen }) {
  return !resuming && screen === firstScreen && state.status === "new";
}

// Перемешивание Фишера—Йетса: грузы идут в случайном порядке, но без двух
// одинаковых подряд — так поток выглядит живее.
function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function mountIntro(root, { content, reducedMotion = false, onStart }) {
  const t = content.ui.intro;

  const copy = el("div", { class: "intro-copy" },
    el("p", { class: "intro-kicker" }, t.kicker),
    el("h1", { class: "intro-title", tabindex: "-1" }, t.title),
    el("p", { class: "intro-caption" }, t.caption)
  );

  // Слой грузов лежит между лентой и корпусом станка: грузы «выезжают» из-за
  // корпуса и едут по ленте на передний план.
  const cargoLayer = el("div", { class: "intro-cargo-layer", "aria-hidden": "true" });
  const layerImg = (cls, src) => el("img", { class: cls, src, alt: "", draggable: "false" });
  const scene = el("div", {
    class: "intro-scene",
    role: "img",
    "aria-label": "Из корпуса станка выходят иконки и движутся по конвейеру"
  },
    cargoLayer,
    layerImg("intro-layer intro-belt", art.belt),
    layerImg("intro-layer intro-human", art.human),
    layerImg("intro-front-wall", art.frontWall),
    layerImg("intro-machine", art.machine)
  );

  const startBtn = el("button", {
    class: "primary intro-start", type: "button",
    onclick: () => finish()
  }, t.button);

  const overlay = el("div", { class: "intro-overlay" },
    copy,
    scene,
    el("div", { class: "intro-start-wrap" }, startBtn)
  );

  // ── Поток грузов ────────────────────────────────────────────
  // «Мешок» перемешанных грузов: вынимаем по одному, опустевший — набираем
  // заново; следим, чтобы первый в новом мешке не повторил последний выданный.
  let bag = [];
  let lastKey = "";
  let spawnTimer = null;
  let running = false;

  function takeIcon() {
    if (bag.length === 0) {
      bag = shuffle(icons);
      if (lastKey && bag.length > 1 && bag[0].key === lastKey) {
        [bag[0], bag[1]] = [bag[1], bag[0]];
      }
    }
    const icon = bag.shift();
    lastKey = icon.key;
    return icon;
  }

  function spawnIcon() {
    if (!running) return;
    const item = takeIcon();
    const img = el("img", { class: "intro-cargo " + item.key, src: item.src, alt: "" });
    // Небольшой разброс скорости, чтобы поток не выглядел механическим.
    img.style.setProperty("--ride-time", (5.3 + Math.random() * 1.1).toFixed(2) + "s");
    img.addEventListener("animationend", () => img.remove(), { once: true });
    cargoLayer.appendChild(img);
    spawnTimer = window.setTimeout(spawnIcon, 720 + Math.random() * 420);
  }

  function stopStream() {
    running = false;
    window.clearTimeout(spawnTimer);
    spawnTimer = null;
    cargoLayer.replaceChildren();
  }

  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    stopStream();
    overlay.classList.add("is-gone");
    // Даём заставке доиграть исчезновение, затем убираем и отдаём ход игре.
    const swap = () => { overlay.remove(); onStart(); };
    overlay.addEventListener("transitionend", swap, { once: true });
    window.setTimeout(swap, 420); // страховка, если transitionend не придёт
  }

  root.replaceChildren(overlay);

  // При системной настройке «меньше движения» поток не запускаем — показываем
  // статичную сцену и ту же кнопку.
  if (!reducedMotion) {
    running = true;
    spawnIcon();
  }
}
