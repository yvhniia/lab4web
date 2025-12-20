/* ============================================================
   ЛР4 — Інтерактивний тест (DOM, події, валідація, DnD, storage)
   ============================================================ */

/* -------------------------
   Допоміжні утиліти
-------------------------- */

/**
 * Перемішування масиву (Fisher-Yates). Повертає НОВИЙ масив.
 * Демонструє роботу з масивами та ітераціями.
 */
function shuffle(arr) {
  const copy = [...arr];                 // копія, щоб не змінювати оригінал
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); // випадковий індекс
    [copy[i], copy[j]] = [copy[j], copy[i]];       // swap
  }
  return copy;
}

/**
 * Нормалізація рядка: trim + зменшити регістр + прибрати зайві пробіли.
 */
function norm(s) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Безпечне читання JSON з localStorage.
 */
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Безпечний запис JSON у localStorage.
 */
function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* -------------------------
   Базовий клас Question
-------------------------- */

/**
 * Базовий клас питання.
 * type: 'radio' | 'checkbox' | 'select' | 'code' | 'fill' | 'debug' | 'dragdrop'
 */
class Question {
  constructor({ id, level, type, title, points = 1, help = "" }) {
    this.id = id;                 // унікальний ID питання
    this.level = level;           // easy/medium/hard
    this.type = type;             // тип питання
    this.title = title;           // текст питання
    this.points = points;         // бали за правильну відповідь
    this.help = help;             // підказка/опис
  }

  /**
   * Рендер питання в DOM.
   * Має повернути кореневий HTML-елемент (container).
   */
  render() {
    throw new Error("render() must be implemented in subclasses");
  }

  /**
   * Отримати відповідь з DOM (у внутрішньому форматі).
   */
  getAnswer() {
    throw new Error("getAnswer() must be implemented in subclasses");
  }

  /**
   * Перевірити відповідь і повернути:
   * { correct: boolean, earned: number, message?: string }
   */
  check(answer) {
    throw new Error("check() must be implemented in subclasses");
  }
}

/* -------------------------
   RadioQuestion
-------------------------- */
class RadioQuestion extends Question {
  constructor({ options, correctIndex, ...rest }) {
    super(rest);
    this.options = options;           // масив рядків
    this.correctIndex = correctIndex; // індекс правильної відповіді (в ОРИГІНАЛЬНОМУ списку)
  }

  render() {
    const root = document.createElement("div");

    // Заголовок
    root.innerHTML = `
      <h3 class="q-title">${this.title}</h3>
      ${this.help ? `<p class="q-help">${this.help}</p>` : ""}
      <div class="option-list"></div>
    `;

    const list = root.querySelector(".option-list");

    // Перемішуємо варіанти (але не губимо правильний)
    const zipped = this.options.map((text, idx) => ({ text, idx })); // idx = оригінальний індекс
    const mixed = shuffle(zipped);

    // збережемо в інстансі відповідність для перевірки
    this._mixed = mixed;

    mixed.forEach((opt, i) => {
      const label = document.createElement("label");
      label.className = "option";
      label.innerHTML = `
        <input type="radio" name="q_${this.id}" value="${i}">
        <span>${opt.text}</span>
      `;
      list.appendChild(label);
    });

    return root;
  }

  getAnswer() {
    const checked = document.querySelector(`input[name="q_${this.id}"]:checked`);
    return checked ? Number(checked.value) : null; // індекс у _mixed
  }

  check(answer) {
    if (answer === null) return { correct: false, earned: 0, message: "Немає відповіді" };
    const chosen = this._mixed[answer];             // обраний елемент
    const ok = chosen.idx === this.correctIndex;    // порівнюємо з оригінальним індексом
    return { correct: ok, earned: ok ? this.points : 0 };
  }
}

/* -------------------------
   CheckboxQuestion
-------------------------- */
class CheckboxQuestion extends Question {
  constructor({ options, correctIndexes, ...rest }) {
    super(rest);
    this.options = options;                 // масив рядків
    this.correctIndexes = correctIndexes;   // масив правильних індексів (в ОРИГІНАЛЬНОМУ списку)
  }

  render() {
    const root = document.createElement("div");
    root.innerHTML = `
      <h3 class="q-title">${this.title}</h3>
      ${this.help ? `<p class="q-help">${this.help}</p>` : ""}
      <div class="option-list"></div>
    `;

    const list = root.querySelector(".option-list");

    const zipped = this.options.map((text, idx) => ({ text, idx }));
    const mixed = shuffle(zipped);
    this._mixed = mixed;

    mixed.forEach((opt, i) => {
      const label = document.createElement("label");
      label.className = "option";
      label.innerHTML = `
        <input type="checkbox" name="q_${this.id}" value="${i}">
        <span>${opt.text}</span>
      `;
      list.appendChild(label);
    });

    return root;
  }

  getAnswer() {
    const checks = [...document.querySelectorAll(`input[name="q_${this.id}"]:checked`)];
    return checks.map(ch => Number(ch.value)); // масив індексів у _mixed
  }

  check(answer) {
    if (!answer || answer.length === 0) return { correct: false, earned: 0, message: "Немає відповіді" };

    // Перетворюємо в множини оригінальних індексів
    const chosenOriginal = new Set(answer.map(i => this._mixed[i].idx));
    const correctOriginal = new Set(this.correctIndexes);

    // Правильно тільки якщо множини однакові
    const sameSize = chosenOriginal.size === correctOriginal.size;
    const allMatch = [...correctOriginal].every(x => chosenOriginal.has(x));
    const ok = sameSize && allMatch;

    return { correct: ok, earned: ok ? this.points : 0 };
  }
}

/* -------------------------
   SelectQuestion
-------------------------- */
class SelectQuestion extends Question {
  constructor({ options, correctValue, ...rest }) {
    super(rest);
    this.options = options;         // масив рядків
    this.correctValue = correctValue; // правильне значення (рядок)
  }

  render() {
    const root = document.createElement("div");
    root.innerHTML = `
      <h3 class="q-title">${this.title}</h3>
      ${this.help ? `<p class="q-help">${this.help}</p>` : ""}
      <div class="field">
        <label>Оберіть відповідь</label>
        <select id="select_${this.id}">
          <option value="">— оберіть —</option>
        </select>
        <small class="muted">Бали за питання: ${this.points}</small>
      </div>
    `;

    const select = root.querySelector(`#select_${this.id}`);

    // Перемішуємо опції
    shuffle(this.options).forEach(opt => {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      select.appendChild(o);
    });

    return root;
  }

  getAnswer() {
    const select = document.getElementById(`select_${this.id}`);
    return select ? select.value : "";
  }

  check(answer) {
    if (!answer) return { correct: false, earned: 0, message: "Немає відповіді" };
    const ok = answer === this.correctValue;
    return { correct: ok, earned: ok ? this.points : 0 };
  }
}

/* -------------------------
   CodeQuestion (textarea + динамічна перевірка)
-------------------------- */
class CodeQuestion extends Question {
  constructor({ placeholder = "", validator, ...rest }) {
    super(rest);
    this.placeholder = placeholder; // текст в textarea
    this.validator = validator;     // функція (text) => boolean
  }

  render() {
    const root = document.createElement("div");
    root.innerHTML = `
      <h3 class="q-title">${this.title}</h3>
      ${this.help ? `<p class="q-help">${this.help}</p>` : ""}
      <div class="field">
        <label>Введіть код</label>
        <textarea id="code_${this.id}" placeholder="${this.placeholder}"></textarea>
        <small id="codeHint_${this.id}" class="muted">Стан перевірки: ще не введено</small>
      </div>
    `;

    const ta = root.querySelector(`#code_${this.id}`);
    const hint = root.querySelector(`#codeHint_${this.id}`);

    // Динамічна перевірка під час введення
    ta.addEventListener("input", () => {
      const text = ta.value;
      const ok = this.validator(text);
      hint.textContent = ok ? "Стан перевірки: виглядає правильно ✅" : "Стан перевірки: є помилки ❌";
    });

    return root;
  }

  getAnswer() {
    const ta = document.getElementById(`code_${this.id}`);
    return ta ? ta.value : "";
  }

  check(answer) {
    const ok = this.validator(answer);
    return { correct: ok, earned: ok ? this.points : 0 };
  }
}

/* -------------------------
   FillBlankQuestion (заповнення пропусків)
-------------------------- */
class FillBlankQuestion extends Question {
  constructor({ template, blanks, ...rest }) {
    super(rest);
    this.template = template; // рядок з маркерами {0}, {1}...
    this.blanks = blanks;     // [{answer: '...', placeholder:'...'}]
  }

  render() {
    const root = document.createElement("div");
    const htmlParts = [];

    // Розбиваємо template на шматки і вставляємо input-и
    // Приклад: "const x = {0};" -> input для {0}
    let html = this.template;
    this.blanks.forEach((b, i) => {
      html = html.replaceAll(`{${i}}`, `<input class="inline" id="blank_${this.id}_${i}" placeholder="${b.placeholder ?? ""}">`);
    });

    root.innerHTML = `
      <h3 class="q-title">${this.title}</h3>
      ${this.help ? `<p class="q-help">${this.help}</p>` : ""}
      <div class="codebox">${html}</div>
      <small class="muted">Вводьте без зайвих пробілів (але перевірка нормалізує регістр/пробіли)</small>
    `;

    return root;
  }

  getAnswer() {
    // Збираємо всі відповіді по інпутам
    return this.blanks.map((_, i) => {
      const el = document.getElementById(`blank_${this.id}_${i}`);
      return el ? el.value : "";
    });
  }

  check(answerArr) {
    if (!answerArr || answerArr.some(v => !String(v).trim())) {
      return { correct: false, earned: 0, message: "Заповніть всі пропуски" };
    }

    const ok = this.blanks.every((b, i) => norm(answerArr[i]) === norm(b.answer));
    return { correct: ok, earned: ok ? this.points : 0 };
  }
}

/* -------------------------
   DebugQuestion (виправлення помилки в коді)
-------------------------- */
class DebugQuestion extends Question {
  constructor({ codeWithBug, expectedContains, ...rest }) {
    super(rest);
    this.codeWithBug = codeWithBug;           // початковий код з помилкою
    this.expectedContains = expectedContains; // масив "має містити" після виправлення
  }

  render() {
    const root = document.createElement("div");
    root.innerHTML = `
      <h3 class="q-title">${this.title}</h3>
      ${this.help ? `<p class="q-help">${this.help}</p>` : ""}
      <div class="field">
        <label>Виправте код</label>
        <textarea id="debug_${this.id}"></textarea>
        <small class="muted">Порада: виправлення оцінюється простими перевірками (contains).</small>
      </div>
    `;

    const ta = root.querySelector(`#debug_${this.id}`);
    ta.value = this.codeWithBug;

    return root;
  }

  getAnswer() {
    const ta = document.getElementById(`debug_${this.id}`);
    return ta ? ta.value : "";
  }

  check(answer) {
    // Проста (але зрозуміла) перевірка: чи містить виправлений код потрібні фрагменти
    const ok = this.expectedContains.every(fragment => answer.includes(fragment));
    return { correct: ok, earned: ok ? this.points : 0 };
  }
}

/* -------------------------
   DragDropQuestion (відповідність)
-------------------------- */
class DragDropQuestion extends Question {
  constructor({ pairs, ...rest }) {
    super(rest);
    this.pairs = pairs; // [{ left: '...', right: '...' }]
    // left — те, що показуємо як "термін"
    // right — правильне "визначення/відповідність"
  }

  render() {
    const root = document.createElement("div");
    root.innerHTML = `
      <h3 class="q-title">${this.title}</h3>
      ${this.help ? `<p class="q-help">${this.help}</p>` : ""}
      <div class="dd-grid">
        <div>
          <h4>Елементи для перетягування</h4>
          <div class="dd-bank" id="bank_${this.id}"></div>
        </div>
        <div>
          <h4>Зони відповідності (скиньте правильний елемент)</h4>
          <div class="dd-targets" id="targets_${this.id}"></div>
        </div>
      </div>
      <small class="muted">DnD: dragstart, dragover, drop використовуються тут.</small>
    `;

    const bank = root.querySelector(`#bank_${this.id}`);
    const targets = root.querySelector(`#targets_${this.id}`);

    // Перемішуємо "праві" значення (те що тягнемо)
    const items = shuffle(this.pairs.map(p => p.right));

    // Створюємо draggable елементи
    items.forEach((text) => {
      const item = document.createElement("div");
      item.className = "dd-item";
      item.textContent = text;
      item.draggable = true;

      item.addEventListener("dragstart", (e) => {
        // dataTransfer — канал передачі даних при DnD
        e.dataTransfer.setData("text/plain", text);
        e.dataTransfer.effectAllowed = "move";
      });

      bank.appendChild(item);
    });

    // Створюємо drop-зони (по left)
    this.pairs.forEach((p) => {
      const drop = document.createElement("div");
      drop.className = "dd-drop";
      drop.innerHTML = `
        <strong>${p.left}</strong>
        <div class="dd-slot" data-left="${p.left}">Скиньте сюди…</div>
      `;

      const slot = drop.querySelector(".dd-slot");

      // dragover — обов'язково preventDefault, щоб дозволити drop
      slot.addEventListener("dragover", (e) => {
        e.preventDefault();
        slot.classList.add("over");
      });

      slot.addEventListener("dragleave", () => slot.classList.remove("over"));

      slot.addEventListener("drop", (e) => {
        e.preventDefault();
        slot.classList.remove("over");

        const payload = e.dataTransfer.getData("text/plain"); // текст, що тягнули
        if (!payload) return;

        slot.textContent = payload; // записуємо відповідь у слот
        slot.dataset.right = payload;

        // За бажанням: прибираємо елемент з банку (щоб не дублювати)
        const bankItems = [...bank.querySelectorAll(".dd-item")];
        const found = bankItems.find(x => x.textContent === payload);
        if (found) found.remove();
      });

      targets.appendChild(drop);
    });

    return root;
  }

  getAnswer() {
    // Зчитуємо зі слотів what user dropped
    const slots = [...document.querySelectorAll(`#targets_${this.id} .dd-slot`)];
    return slots.map(s => ({
      left: s.dataset.left,
      right: s.dataset.right ?? "" // те, що скинули
    }));
  }

  check(answerPairs) {
    if (!answerPairs || answerPairs.some(p => !p.right)) {
      return { correct: false, earned: 0, message: "Заповніть всі відповідності" };
    }

    // Перевірка: для кожного left — чи right відповідає правильній парі
    const map = new Map(this.pairs.map(p => [p.left, p.right]));
    const ok = answerPairs.every(p => map.get(p.left) === p.right);

    return { correct: ok, earned: ok ? this.points : 0 };
  }
}

/* ============================================================
   Клас Quiz (керує тестом)
   - показ 10 випадкових питань з банку рівня
   - навігація
   - підрахунок балів
   - localStorage історія
============================================================ */
class Quiz {
  constructor({ questions, user, level }) {
    this.user = user;                       // {name, group}
    this.level = level;                     // easy/medium/hard
    this.bank = questions.filter(q => q.level === level); // банк рівня
    this.questions = shuffle(this.bank).slice(0, 10);     // 10 випадкових
    this.index = 0;                         // поточне питання
    this.answers = new Map();               // id -> {answer, result}
  }

  current() { return this.questions[this.index]; }

  answerCurrent(answer) {
    const q = this.current();
    const result = q.check(answer);
    this.answers.set(q.id, { answer, result });
    return result;
  }

  calcScore() {
    let sum = 0;
    for (const v of this.answers.values()) sum += v.result.earned;
    return sum;
  }

  maxScore() {
    return this.questions.reduce((a, q) => a + q.points, 0);
  }

  isFinished() {
    return this.answers.size === this.questions.length;
  }
}

/* ============================================================
   Банк питань (мінімум 15 на кожен рівень)
   Тема загальна: JS+DOM+події+форми+DnD+об'єкти/класи
============================================================ */

const QUESTION_BANK = [
  /* ---------------- EASY (15) ---------------- */
  new RadioQuestion({
    id: "e1", level: "easy", type: "radio", points: 1,
    title: "Який метод повертає елемент за унікальним id?",
    options: ["getElementById", "querySelectorAll", "getElementsByTagName", "getElementsByClassName"],
    correctIndex: 0
  }),
  new RadioQuestion({
    id: "e2", level: "easy", type: "radio", points: 1,
    title: "Яка подія спрацьовує при кліку миші?",
    options: ["click", "submit", "input", "keydown"],
    correctIndex: 0
  }),
  new CheckboxQuestion({
    id: "e3", level: "easy", type: "checkbox", points: 1,
    title: "Оберіть типи вузлів DOM (Nodes):",
    options: ["Document", "Element", "Text", "Variable"],
    correctIndexes: [0, 1, 2]
  }),
  new SelectQuestion({
    id: "e4", level: "easy", type: "select", points: 1,
    title: "Що повертає document.querySelector(selector)?",
    options: [
      "Перший елемент, що відповідає селектору",
      "Всі елементи, що відповідають селектору (жива колекція)",
      "Тільки елементи з class",
      "Нічого ніколи не повертає"
    ],
    correctValue: "Перший елемент, що відповідає селектору"
  }),
  new FillBlankQuestion({
    id: "e5", level: "easy", type: "fill", points: 1,
    title: "Заповніть пропуск: щоб скасувати стандартну дію форми, викликають …",
    template: "form.addEventListener('submit', (e) => { e.{0}(); });",
    blanks: [{ answer: "preventDefault", placeholder: "метод" }],
    help: "Підказка: метод об’єкта події."
  }),
  new CodeQuestion({
    id: "e6", level: "easy", type: "code", points: 1,
    title: "Напишіть рядок коду: додати клас 'active' елементу el.",
    placeholder: "Напр.: el.classList.add('active');",
    validator: (text) => /classList\.add\(\s*['"]active['"]\s*\)\s*;?/.test(text)
  }),
  new RadioQuestion({
    id: "e7", level: "easy", type: "radio", points: 1,
    title: "Який із варіантів правильно оголошує змінну, що може змінюватися?",
    options: ["let x = 5;", "const x = 5; (і потім змінювати)", "var x == 5;", "x := 5;"],
    correctIndex: 0
  }),
  new CheckboxQuestion({
    id: "e8", level: "easy", type: "checkbox", points: 1,
    title: "Оберіть методи масиву:",
    options: ["map", "filter", "reduce", "appendChild"],
    correctIndexes: [0, 1, 2]
  }),
  new SelectQuestion({
    id: "e9", level: "easy", type: "select", points: 1,
    title: "Як отримати значення текстового input?",
    options: ["input.value", "input.text", "input.innerHTML", "input.checked"],
    correctValue: "input.value"
  }),
  new RadioQuestion({
    id: "e10", level: "easy", type: "radio", points: 1,
    title: "Що таке DOM?",
    options: [
      "Деревоподібна модель документа у вигляді об'єктів",
      "База даних браузера",
      "Тільки CSS-стилі сторінки",
      "Серверна технологія"
    ],
    correctIndex: 0
  }),
  new DebugQuestion({
    id: "e11", level: "easy", type: "debug", points: 1,
    title: "Виправте помилку: обробник події має бути встановлений правильно.",
    help: "Потрібно використати addEventListener.",
    codeWithBug: "btn.onclick('click', () => console.log('ok'));",
    expectedContains: ["addEventListener", "click"]
  }),
  new FillBlankQuestion({
    id: "e12", level: "easy", type: "fill", points: 1,
    title: "Заповніть пропуск: отримати елемент за селектором класу .box",
    template: "const el = document.{0}('.box');",
    blanks: [{ answer: "querySelector", placeholder: "метод" }]
  }),
  new RadioQuestion({
    id: "e13", level: "easy", type: "radio", points: 1,
    title: "Що повертає document.getElementsByClassName?",
    options: ["HTMLCollection", "Array", "Number", "Promise"],
    correctIndex: 0
  }),
  new CheckboxQuestion({
    id: "e14", level: "easy", type: "checkbox", points: 1,
    title: "Оберіть події форм:",
    options: ["submit", "input", "change", "mousemove"],
    correctIndexes: [0, 1, 2]
  }),
  new DragDropQuestion({
    id: "e15", level: "easy", type: "dragdrop", points: 2,
    title: "Встановіть відповідність (Drag & Drop): DOM метод → що робить",
    help: "Перетягніть правильне визначення до методу.",
    pairs: [
      { left: "getElementById", right: "Повертає елемент за id" },
      { left: "querySelectorAll", right: "Повертає NodeList всіх елементів за селектором" },
      { left: "appendChild", right: "Додає вузол в кінець як child" }
    ]
  }),

  /* ---------------- MEDIUM (15) ---------------- */
  new RadioQuestion({
    id: "m1", level: "medium", type: "radio", points: 2,
    title: "Що таке спливання подій (bubbling)?",
    options: [
      "Подія піднімається від target до батьків аж до document",
      "Подія завжди зупиняється на target",
      "Подія працює тільки на window",
      "Подія передається лише вниз (capturing)"
    ],
    correctIndex: 0
  }),
  new CodeQuestion({
    id: "m2", level: "medium", type: "code", points: 2,
    title: "Напишіть делегування: клік по .btn всередині .container",
    help: "Потрібно: addEventListener + перевірка e.target.matches('.btn')",
    placeholder:
`document.querySelector('.container').addEventListener('click', (e) => {
  // ...
});`,
    validator: (text) => {
      const t = norm(text);
      return t.includes("addeventlistener") && t.includes("click") && t.includes("matches") && t.includes(".btn");
    }
  }),
  new CheckboxQuestion({
    id: "m3", level: "medium", type: "checkbox", points: 2,
    title: "Оберіть правильні твердження про NodeList/HTMLCollection:",
    options: [
      "NodeList з querySelectorAll — статичний (не оновлюється автоматично)",
      "HTMLCollection — жива колекція (може оновлюватися)",
      "NodeList завжди живий",
      "HTMLCollection — це Promise"
    ],
    correctIndexes: [0, 1]
  }),
  new SelectQuestion({
    id: "m4", level: "medium", type: "select", points: 2,
    title: "Щоб дозволити drop у dragover, потрібно:",
    options: [
      "Викликати e.preventDefault() у dragover",
      "Викликати stopPropagation() у drop",
      "Змінити innerHTML у dragstart",
      "Додати setTimeout"
    ],
    correctValue: "Викликати e.preventDefault() у dragover"
  }),
  new FillBlankQuestion({
    id: "m5", level: "medium", type: "fill", points: 2,
    title: "Заповніть пропуск: перетворити FormData у об’єкт",
    template: "const data = Object.{0}(new FormData(form));",
    blanks: [{ answer: "fromEntries", placeholder: "метод" }]
  }),
  new DebugQuestion({
    id: "m6", level: "medium", type: "debug", points: 2,
    title: "Виправте код: обробка submit має скасовувати стандартну дію та читати дані.",
    codeWithBug:
`form.addEventListener('submit', (e) => {
  const fd = new FormData(form);
  console.log(Object.fromEntries(fd));
});`,
    expectedContains: ["preventDefault", "FormData", "fromEntries"]
  }),
  new RadioQuestion({
    id: "m7", level: "medium", type: "radio", points: 2,
    title: "Яка різниця між event.target та event.currentTarget?",
    options: [
      "target — де сталася подія; currentTarget — де висить обробник",
      "Вони завжди однакові",
      "currentTarget — тільки для клавіатури",
      "target — це window завжди"
    ],
    correctIndex: 0
  }),
  new CheckboxQuestion({
    id: "m8", level: "medium", type: "checkbox", points: 2,
    title: "Оберіть способи зупинити небажану поведінку:",
    options: ["event.preventDefault()", "event.stopPropagation()", "event.resume()", "event.cancelBubble() (застаріле)"],
    correctIndexes: [0, 1, 3]
  }),
  new SelectQuestion({
    id: "m9", level: "medium", type: "select", points: 2,
    title: "Який метод встановлює повідомлення про помилку валідності поля?",
    options: ["setCustomValidity", "checkValidity", "getComputedStyle", "appendChild"],
    correctValue: "setCustomValidity"
  }),
  new FillBlankQuestion({
    id: "m10", level: "medium", type: "fill", points: 2,
    title: "Заповніть пропуск: отримати обчислені стилі елемента",
    template: "const styles = {0}(el);",
    blanks: [{ answer: "getComputedStyle", placeholder: "функція" }]
  }),
  new RadioQuestion({
    id: "m11", level: "medium", type: "radio", points: 2,
    title: "Що робить element.classList.toggle('x')?",
    options: [
      "Додає/знімає клас залежно від наявності",
      "Видаляє всі класи",
      "Тільки додає клас",
      "Тільки перевіряє наявність"
    ],
    correctIndex: 0
  }),
  new CodeQuestion({
    id: "m12", level: "medium", type: "code", points: 2,
    title: "Напишіть рядок: зчитати і розпарсити JSON з localStorage за ключем 'results'",
    placeholder: "const data = JSON.parse(localStorage.getItem('results'));",
    validator: (text) => {
      const t = norm(text);
      return t.includes("json.parse") && t.includes("localstorage.getitem") && t.includes("results");
    }
  }),
  new DragDropQuestion({
    id: "m13", level: "medium", type: "dragdrop", points: 3,
    title: "Відповідність (Drag & Drop): подія → коли спрацьовує",
    pairs: [
      { left: "DOMContentLoaded", right: "DOM побудовано, але ресурси можуть ще вантажитись" },
      { left: "input", right: "Зміна значення в полі під час введення" },
      { left: "submit", right: "Надсилання форми" }
    ]
  }),
  new CheckboxQuestion({
    id: "m14", level: "medium", type: "checkbox", points: 2,
    title: "Оберіть правильні твердження про деструктуризацію:",
    options: [
      "const {name} = obj — дістає властивість name",
      "const [a,b] = arr — дістає перші елементи масиву",
      "Деструктуризація працює тільки з числами",
      "Можна задавати значення за замовчуванням"
    ],
    correctIndexes: [0, 1, 3]
  }),
  new SelectQuestion({
    id: "m15", level: "medium", type: "select", points: 2,
    title: "Що повертає Array.prototype.find?",
    options: [
      "Перший елемент, що задовольняє умову",
      "Масив усіх елементів",
      "Кількість елементів",
      "Новий відсортований масив"
    ],
    correctValue: "Перший елемент, що задовольняє умову"
  }),

  /* ---------------- HARD (15) ---------------- */
  new CodeQuestion({
    id: "h1", level: "hard", type: "code", points: 3,
    title: "Напишіть функцію, що повертає суму масиву через reduce (одним рядком).",
    placeholder: "const sum = arr.reduce((acc, x) => acc + x, 0);",
    validator: (text) => /reduce\s*\(\s*\(\s*acc\s*,\s*\w+\s*\)\s*=>\s*acc\s*\+\s*\w+\s*,\s*0\s*\)/.test(text.replace(/\s+/g, " "))
  }),
  new DebugQuestion({
    id: "h2", level: "hard", type: "debug", points: 3,
    title: "Виправте клас: має коректно працювати геттер і сеттер info.",
    codeWithBug:
`class Person {
  constructor(name, age) { this.name = name; this.age = age; }
  get info() { return this.name + ', ' + this.age; }
  set info(v) { [this.name, this.age] = v.split(','); }
}`,
    expectedContains: ["split", "this.name", "this.age"]
  }),
  new FillBlankQuestion({
    id: "h3", level: "hard", type: "fill", points: 3,
    title: "Заповніть пропуск: створити новий елемент div",
    template: "const div = document.{0}('div');",
    blanks: [{ answer: "createElement", placeholder: "метод" }]
  }),
  new RadioQuestion({
    id: "h4", level: "hard", type: "radio", points: 3,
    title: "Чому делегування подій корисне?",
    options: [
      "Один обробник на контейнер замість багатьох (особливо для динамічних елементів)",
      "Тому що події не спливають",
      "Тому що addEventListener заборонений",
      "Тому що target завжди document"
    ],
    correctIndex: 0
  }),
  new CheckboxQuestion({
    id: "h5", level: "hard", type: "checkbox", points: 3,
    title: "Оберіть, що відноситься до ES6+ класів:",
    options: ["constructor", "static methods", "extends/super", "typedef"],
    correctIndexes: [0, 1, 2]
  }),
  new SelectQuestion({
    id: "h6", level: "hard", type: "select", points: 3,
    title: "Яка властивість validity відповідає за невідповідність pattern?",
    options: ["patternMismatch", "typeMismatch", "valueMissing", "rangeUnderflow"],
    correctValue: "patternMismatch"
  }),
  new DragDropQuestion({
    id: "h7", level: "hard", type: "dragdrop", points: 4,
    title: "Drag & Drop: подія → роль у DnD процесі",
    pairs: [
      { left: "dragstart", right: "Початок перетягування, задають dataTransfer" },
      { left: "dragover", right: "Над зоною скидання (потрібен preventDefault)" },
      { left: "drop", right: "Скидання елемента у зону" }
    ]
  }),
  new CodeQuestion({
    id: "h8", level: "hard", type: "code", points: 3,
    title: "Напишіть: створити елемент, встановити data-id='123', додати в parent.",
    help: "Підійде будь-який еквівалент: createElement + setAttribute + appendChild",
    placeholder:
`const el = document.createElement('div');
el.setAttribute('data-id', '123');
parent.appendChild(el);`,
    validator: (text) => {
      const t = norm(text);
      return t.includes("createelement") && t.includes("setattribute") && t.includes("data-id") && t.includes("appendchild");
    }
  }),
  new CheckboxQuestion({
    id: "h9", level: "hard", type: "checkbox", points: 3,
    title: "Оберіть правильні твердження про localStorage:",
    options: [
      "Зберігає дані як рядки",
      "Дані не зникають після перезавантаження сторінки",
      "Потрібен JSON.stringify для обʼєктів",
      "localStorage автоматично шифрує дані"
    ],
    correctIndexes: [0, 1, 2]
  }),
  new SelectQuestion({
    id: "h10", level: "hard", type: "select", points: 3,
    title: "Який метод перевіряє валідність input і повертає boolean?",
    options: ["checkValidity()", "setCustomValidity()", "getAttribute()", "matches()"],
    correctValue: "checkValidity()"
  }),
  new FillBlankQuestion({
    id: "h11", level: "hard", type: "fill", points: 3,
    title: "Заповніть пропуски: деструктуризація з перейменуванням",
    template: "const { name: {0}, age: {1} } = person;",
    blanks: [
      { answer: "userName", placeholder: "нова змінна" },
      { answer: "userAge", placeholder: "нова змінна" }
    ]
  }),
  new DebugQuestion({
    id: "h12", level: "hard", type: "debug", points: 3,
    title: "Виправте помилку: querySelectorAll повертає NodeList, але треба обійти елементи.",
    codeWithBug:
`const items = document.querySelectorAll('.item');
items.map(x => x.textContent);`,
    expectedContains: ["forEach"]
  }),
  new RadioQuestion({
    id: "h13", level: "hard", type: "radio", points: 3,
    title: "Що робить Object.freeze(obj)?",
    options: [
      "Робить об’єкт незмінним (не дає змінювати/додавати властивості)",
      "Видаляє обʼєкт",
      "Сортує ключі обʼєкта",
      "Клонує обʼєкт"
    ],
    correctIndex: 0
  }),
  new CodeQuestion({
    id: "h14", level: "hard", type: "code", points: 3,
    title: "Напишіть: зупинити спливання події в обробнику.",
    placeholder: "event.stopPropagation();",
    validator: (text) => /stopPropagation\s*\(\s*\)\s*;?/.test(text)
  }),
  new RadioQuestion({
    id: "h15", level: "hard", type: "radio", points: 3,
    title: "Яка різниця між innerHTML та textContent?",
    options: [
      "innerHTML парсить HTML, textContent вставляє як текст",
      "textContent вставляє HTML, innerHTML — тільки текст",
      "Вони однакові завжди",
      "innerHTML працює тільки з input"
    ],
    correctIndex: 0
  }),
];

/* ============================================================
   DOM: отримуємо елементи сторінки
============================================================ */
const startScreen = document.getElementById("startScreen");
const quizScreen = document.getElementById("quizScreen");
const resultScreen = document.getElementById("resultScreen");

const startForm = document.getElementById("startForm");
const userNameInput = document.getElementById("userName");
const userGroupInput = document.getElementById("userGroup");
const levelSelect = document.getElementById("level");

const welcomeLine = document.getElementById("welcomeLine");
const quizTitle = document.getElementById("quizTitle");
const qCounter = document.getElementById("qCounter");
const scoreLive = document.getElementById("scoreLive");
const levelLive = document.getElementById("levelLive");

const questionHost = document.getElementById("questionHost");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const finishBtn = document.getElementById("finishBtn");

const resultLine = document.getElementById("resultLine");
const detailsList = document.getElementById("detailsList");
const historyBox = document.getElementById("historyBox");

const restartBtn = document.getElementById("restartBtn");
const backToStartBtn = document.getElementById("backToStartBtn");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

const showHistoryBtn = document.getElementById("showHistoryBtn");
const historyModal = document.getElementById("historyModal");
const closeHistory = document.getElementById("closeHistory");
const modalBackdrop = document.getElementById("modalBackdrop");
const historyModalBody = document.getElementById("historyModalBody");

/* ============================================================
   Стан застосунку
============================================================ */
let quiz = null; // тут буде екземпляр Quiz

/* ============================================================
   Валідація форми (кастомна + HTML5 API)
============================================================ */
function showFieldError(name, msg) {
  const el = document.querySelector(`[data-error-for="${name}"]`);
  if (el) el.textContent = msg || "";
}

function validateStartForm() {
  let ok = true;

  // username
  if (!userNameInput.checkValidity()) {
    ok = false;
    if (userNameInput.validity.valueMissing) showFieldError("userName", "Вкажіть імʼя (мінімум 3 символи).");
    else if (userNameInput.validity.tooShort) showFieldError("userName", "Закоротке імʼя.");
    else showFieldError("userName", "Некоректне імʼя.");
  } else {
    showFieldError("userName", "");
  }

  // group
  if (!userGroupInput.checkValidity()) {
    ok = false;
    if (userGroupInput.validity.valueMissing) showFieldError("userGroup", "Вкажіть групу.");
    else if (userGroupInput.validity.patternMismatch) showFieldError("userGroup", "Формат групи некоректний (напр. ІО-01).");
    else showFieldError("userGroup", "Некоректна група.");
  } else {
    showFieldError("userGroup", "");
  }

  // level
  if (!levelSelect.checkValidity()) {
    ok = false;
    showFieldError("level", "Оберіть рівень.");
  } else {
    showFieldError("level", "");
  }

  return ok;
}

/* ============================================================
   Рендер поточного питання
============================================================ */
function renderCurrentQuestion() {
  const q = quiz.current();

  // Очищаємо host
  questionHost.innerHTML = "";

  // Рендер конкретного питання
  const node = q.render();
  questionHost.appendChild(node);

  // Верхні індикатори
  qCounter.textContent = `${quiz.index + 1}/${quiz.questions.length}`;
  scoreLive.textContent = String(quiz.calcScore());
  levelLive.textContent = quiz.level;

  // Кнопки навігації
  prevBtn.disabled = quiz.index === 0;
  nextBtn.disabled = quiz.index === quiz.questions.length - 1;
}

/* ============================================================
   Завершення тесту + localStorage
============================================================ */
const STORAGE_KEY = "lr4_quiz_history";

function levelLabel(level) {
  if (level === "easy") return "Початковий";
  if (level === "medium") return "Середній";
  return "Складний";
}

function saveResultToStorage(entry) {
  const history = readJSON(STORAGE_KEY, []);
  history.unshift(entry); // додаємо на початок
  writeJSON(STORAGE_KEY, history.slice(0, 30)); // зберігаємо останні 30
}

function renderHistory(container) {
  const history = readJSON(STORAGE_KEY, []);
  if (history.length === 0) {
    container.innerHTML = `<p class="muted">Історія порожня.</p>`;
    return;
  }

  const rows = history.map(h => {
    return `
      <div class="card" style="margin:10px 0;">
        <div><b>${h.user.name}</b> (${h.user.group})</div>
        <div class="muted">${h.date}</div>
        <div>Рівень: <b>${h.level}</b></div>
        <div>Результат: <b>${h.score}/${h.max}</b></div>
      </div>
    `;
  }).join("");

  container.innerHTML = rows;
}

function finishQuiz() {
  const score = quiz.calcScore();
  const max = quiz.maxScore();

  // Формуємо деталі
  detailsList.innerHTML = "";
  quiz.questions.forEach((q, idx) => {
    const rec = quiz.answers.get(q.id);
    const ok = rec?.result?.correct ?? false;
    const earned = rec?.result?.earned ?? 0;

    const li = document.createElement("li");
    li.innerHTML = `<b>${idx + 1}.</b> ${q.title} — ${ok ? "✅" : "❌"} (+${earned})`;
    detailsList.appendChild(li);
  });

  resultLine.textContent = `Ваш результат: ${score} / ${max}`;

  // Збереження у localStorage
  const entry = {
    date: new Date().toLocaleString("uk-UA"),
    user: quiz.user,
    level: levelLabel(quiz.level),
    score,
    max
  };
  saveResultToStorage(entry);

  // Показ історії справа
  renderHistory(historyBox);

  // Показати resultScreen
  quizScreen.classList.add("hidden");
  resultScreen.classList.remove("hidden");
}

/* ============================================================
   Події (Events): submit, click, делегування тощо
============================================================ */

/* submit форми старту */
startForm.addEventListener("submit", (e) => {
  e.preventDefault(); // скасовуємо стандартне відправлення

  if (!validateStartForm()) return;

  const user = { name: userNameInput.value.trim(), group: userGroupInput.value.trim() };
  const level = levelSelect.value;

  // Створюємо новий тест
  quiz = new Quiz({ questions: QUESTION_BANK, user, level });

  // Вітання
  welcomeLine.textContent = `Користувач: ${user.name} (${user.group})`;
  quizTitle.textContent = `Тест — ${levelLabel(level)}`;

  // Перемикаємо екрани
  startScreen.classList.add("hidden");
  quizScreen.classList.remove("hidden");
  resultScreen.classList.add("hidden");

  // Рендеримо перше питання
  renderCurrentQuestion();
});

/* Кнопка "Назад" */
prevBtn.addEventListener("click", () => {
  // Зберігаємо відповідь перед переходом (якщо є)
  const q = quiz.current();
  const ans = q.getAnswer();
  quiz.answerCurrent(ans);

  if (quiz.index > 0) {
    quiz.index--;
    renderCurrentQuestion();
  }
});

/* Кнопка "Далі" */
nextBtn.addEventListener("click", () => {
  const q = quiz.current();
  const ans = q.getAnswer();
  quiz.answerCurrent(ans);

  if (quiz.index < quiz.questions.length - 1) {
    quiz.index++;
    renderCurrentQuestion();
  }
});

/* Кнопка "Завершити" */
finishBtn.addEventListener("click", () => {
  // Перед фінішем теж збережемо поточну відповідь
  const q = quiz.current();
  const ans = q.getAnswer();
  quiz.answerCurrent(ans);

  finishQuiz();
});

/* Перезапуск (ще раз) */
restartBtn.addEventListener("click", () => {
  // Запускаємо заново на тому ж рівні й користувачі
  quiz = new Quiz({ questions: QUESTION_BANK, user: quiz.user, level: quiz.level });

  resultScreen.classList.add("hidden");
  quizScreen.classList.remove("hidden");

  renderCurrentQuestion();
});

/* Назад на старт */
backToStartBtn.addEventListener("click", () => {
  quiz = null;

  // чистимо форму (за бажанням)
  // userNameInput.value = "";
  // userGroupInput.value = "";
  levelSelect.value = "";

  resultScreen.classList.add("hidden");
  quizScreen.classList.add("hidden");
  startScreen.classList.remove("hidden");
});

/* Очистити історію */
clearHistoryBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  renderHistory(historyBox);
});

/* Показ історії в модалці */
showHistoryBtn.addEventListener("click", () => {
  historyModal.classList.remove("hidden");
  historyModal.setAttribute("aria-hidden", "false");
  renderHistory(historyModalBody);
});

/* Закрити модалку */
function closeModal() {
  historyModal.classList.add("hidden");
  historyModal.setAttribute("aria-hidden", "true");
}
closeHistory.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);

/* ESC закриває модалку (подія клавіатури) */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !historyModal.classList.contains("hidden")) {
    closeModal();
  }
});

/* ============================================================
   Дрібні стилі для fill-in-the-blank "inline inputs"
============================================================ */
(function injectTinyStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .codebox {
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(0,0,0,0.18);
      border-radius: 14px;
      padding: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      line-height: 1.6;
      overflow-x: auto;
    }
    .inline {
      width: 140px;
      display: inline-block;
      margin: 0 6px;
      padding: 6px 8px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.06);
      color: #e8eefc;
      outline: none;
    }
  `;
  document.head.appendChild(style);
})();
