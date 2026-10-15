// Kitepost: the live preview, the form's checks, the sent state and the recent list. Mock data only; nothing is sent.
const $ = (id) => document.getElementById(id);
const form = $("form");
const REQUIRED = ["to", "message", "from"];
const STATUS = { delivered: ["Delivered", "badge-success"], "on-its-way": ["On its way", "badge-info"] };
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" });

const value = (name) => form.elements[name].value.trim();

function updatePreview() {
  $("preview-message").textContent = value("message") || "Your message appears here as you write it.";
  $("preview-to").textContent = value("to") || "someone special";
  $("preview-from").textContent = value("from") || "you";
  $("preview").dataset.stamp = form.elements.stamp.value;
  $("message-count").textContent = String(form.elements.message.value.length);
}

/** Marks each empty field and shows its message; true when nothing is missing. */
function check() {
  let first = null;
  for (const name of REQUIRED) {
    const missing = value(name) === "";
    form.elements[name].setAttribute("aria-invalid", String(missing));
    $(`${name}-error`).hidden = !missing;
    if (missing && !first) first = form.elements[name];
  }
  first?.focus();
  return first === null;
}

function send() {
  $("sent-to").textContent = value("to");
  $("sent-code").textContent = window.MOCK.nextCode;
  $("composer").hidden = true;
  $("sent").hidden = false;
  $("sent").focus();
}

function writeAnother() {
  form.reset();
  for (const name of REQUIRED) {
    form.elements[name].removeAttribute("aria-invalid");
    $(`${name}-error`).hidden = true;
  }
  updatePreview();
  $("sent").hidden = true;
  $("composer").hidden = false;
  form.elements.to.focus();
}

function renderRecent(items) {
  const list = $("recent");
  list.replaceChildren(...items.map((item) => {
    const [label, tone] = STATUS[item.status];
    const row = document.createElement("li");
    row.className = "list-item";
    const text = document.createElement("div");
    text.append(
      Object.assign(document.createElement("p"), { className: "list-item-title", textContent: item.to }),
      Object.assign(document.createElement("p"), { className: "list-item-meta", textContent: `Sent ${dateFormat.format(new Date(item.sent))}` }),
    );
    row.append(text, Object.assign(document.createElement("span"), { className: `badge ${tone}`, textContent: label }));
    return row;
  }));
  list.hidden = items.length === 0;
  $("recent-empty").hidden = items.length > 0;
}

form.addEventListener("input", updatePreview);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (check()) send();
});
$("again").addEventListener("click", writeAnother);

// For state scripts (design/states/): the recent list can be shown with other data.
window.kitepost = { renderRecent };
renderRecent(window.MOCK.recent);
updatePreview();
