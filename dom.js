// Крошечный помощник для создания DOM без фреймворка.
// el("button", { class: "primary", onclick: fn }, "Дальше") → <button>…

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "class") {
      node.className = value;
    } else if (key === "html") {
      node.innerHTML = value;
    } else {
      node.setAttribute(key, value === true ? "" : value);
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

// Подстановка {ключ} в строку из шаблона.
export function tpl(str, vars = {}) {
  return String(str).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}
