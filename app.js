const STORAGE_KEY = "brosplit_state_v3";

const defaultState = {
  events: [],
  currentEventId: null,
  screen: "events",
  activeTab: "expenses"
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;

const $root = document.getElementById("appRoot");

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function money(n) {
  return Math.round(Number(n || 0)).toLocaleString("ru-RU") + " ₽";
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

function parsePeople(text) {
  return text.split(/[\n,;]+/g).map(x => x.trim()).filter(Boolean);
}

function getCurrentEvent() {
  return state.events.find(e => e.id === state.currentEventId);
}

function goEvents() {
  state.screen = "events";
  state.currentEventId = null;
  save();
  render();
}

function openEvent(id) {
  state.currentEventId = id;
  state.screen = "event";
  state.activeTab = "expenses";
  save();
  render();
}

function createEvent() {
  const title = document.getElementById("eventTitle").value.trim();
  const peopleText = document.getElementById("eventPeople").value.trim();
  if (!title) return alert("Название мероприятия нужно. Иначе это не продукт, а туман.");

  const people = [...new Set(parsePeople(peopleText))];

  const event = {
    id: uid(),
    title,
    people,
    expenses: []
  };

  state.events.unshift(event);
  state.currentEventId = event.id;
  state.screen = "event";
  state.activeTab = "people";
  save();
  render();
}

function deleteEvent(id) {
  if (!confirm("Удалить мероприятие полностью?")) return;
  state.events = state.events.filter(e => e.id !== id);
  if (state.currentEventId === id) state.currentEventId = null;
  state.screen = "events";
  save();
  render();
}

function addPeopleToCurrent() {
  const event = getCurrentEvent();
  const text = document.getElementById("addPeopleText").value;
  const names = parsePeople(text);
  if (!names.length) return alert("Впиши участников");

  for (const name of names) {
    if (!event.people.includes(name)) event.people.push(name);
  }
  document.getElementById("addPeopleText").value = "";
  save();
  render();
}

function removePerson(name) {
  const event = getCurrentEvent();
  const used = event.expenses.some(exp => {
    const payerUsed = Object.keys(exp.payers || {}).includes(name);
    const participantUsed = (exp.participants || []).includes(name);
    return payerUsed || participantUsed;
  });

  if (used) {
    return alert("Участник уже есть в расходах. Чтобы не сломать историю, сначала удали связанные расходы.");
  }

  event.people = event.people.filter(p => p !== name);
  save();
  render();
}

function getCheckedPeople(className) {
  return [...document.querySelectorAll("." + className + ":checked")].map(x => x.value);
}

function getPayers(event) {
  const payers = {};
  for (const person of event.people) {
    const checked = document.querySelector(`[data-payer-check="${CSS.escape(person)}"]`)?.checked;
    const amount = Number(document.querySelector(`[data-paid="${CSS.escape(person)}"]`)?.value || 0);
    if (checked && amount > 0) payers[person] = amount;
  }
  return payers;
}

function getFixedShares(event) {
  const fixed = {};
  for (const person of event.people) {
    const checked = document.querySelector(`[data-fixed-check="${CSS.escape(person)}"]`)?.checked;
    const amount = Number(document.querySelector(`[data-fixed="${CSS.escape(person)}"]`)?.value || 0);
    if (checked && amount >= 0) fixed[person] = amount;
  }
  return fixed;
}

function getCustomShares(event, participants) {
  const shares = {};
  for (const person of participants) {
    const amount = Number(document.querySelector(`[data-custom="${CSS.escape(person)}"]`)?.value || 0);
    shares[person] = amount;
  }
  return shares;
}

function buildShares(event, amount, participants, splitMode) {
  const shares = {};
  if (!participants.length) throw new Error("Выбери участников расхода");

  if (splitMode === "equal") {
    const share = amount / participants.length;
    participants.forEach(p => shares[p] = share);
    return shares;
  }

  if (splitMode === "fixed_rest") {
    const fixed = getFixedShares(event);
    let fixedTotal = 0;

    for (const [person, value] of Object.entries(fixed)) {
      if (!participants.includes(person)) continue;
      shares[person] = value;
      fixedTotal += value;
    }

    if (fixedTotal > amount) throw new Error("Фиксированные суммы больше общего расхода");

    const restPeople = participants.filter(p => !(p in shares));
    if (!restPeople.length && Math.round(fixedTotal) !== Math.round(amount)) {
      throw new Error("Некому делить остаток. Либо добавь людей, либо исправь фиксированные суммы.");
    }

    const rest = amount - fixedTotal;
    const restShare = restPeople.length ? rest / restPeople.length : 0;
    restPeople.forEach(p => shares[p] = restShare);
    return shares;
  }

  if (splitMode === "custom") {
    const custom = getCustomShares(event, participants);
    const total = Object.values(custom).reduce((a,b) => a + Number(b || 0), 0);
    if (Math.round(total) !== Math.round(amount)) {
      throw new Error(`Свои суммы дают ${money(total)}, а расход ${money(amount)}. Не сходится.`);
    }
    return custom;
  }

  return shares;
}

function addExpense() {
  const event = getCurrentEvent();
  const title = document.getElementById("expenseTitle").value.trim();
  const amount = Number(document.getElementById("expenseAmount").value || 0);
  const splitMode = document.querySelector('input[name="splitMode"]:checked')?.value || "equal";
  const participants = getCheckedPeople("participantCheck");
  const payers = getPayers(event);
  const paidTotal = Object.values(payers).reduce((a,b) => a + Number(b || 0), 0);

  if (!title) return alert("Впиши название расхода");
  if (!amount || amount <= 0) return alert("Впиши нормальную сумму");
  if (!Object.keys(payers).length) return alert("Укажи, кто оплатил");
  if (Math.round(paidTotal) !== Math.round(amount)) {
    return alert(`Плательщики внесли ${money(paidTotal)}, а расход ${money(amount)}. Должно совпадать.`);
  }

  let shares;
  try {
    shares = buildShares(event, amount, participants, splitMode);
  } catch (err) {
    return alert(err.message);
  }

  event.expenses.unshift({
    id: uid(),
    title,
    amount,
    payers,
    participants,
    splitMode,
    shares,
    createdAt: new Date().toISOString()
  });

  state.activeTab = "expenses";
  save();
  render();
}

function deleteExpense(id) {
  const event = getCurrentEvent();
  if (!confirm("Удалить расход?")) return;
  event.expenses = event.expenses.filter(e => e.id !== id);
  save();
  render();
}

function calculateBalances(event) {
  const balances = {};
  event.people.forEach(p => balances[p] = 0);

  for (const expense of event.expenses) {
    for (const [person, amount] of Object.entries(expense.payers || {})) {
      balances[person] = (balances[person] || 0) + Number(amount || 0);
    }
    for (const [person, share] of Object.entries(expense.shares || {})) {
      balances[person] = (balances[person] || 0) - Number(share || 0);
    }
  }

  return balances;
}

function calculateSettlements(event) {
  const balances = calculateBalances(event);

  const debtors = [];
  const creditors = [];

  for (const [person, balance] of Object.entries(balances)) {
    const rounded = Math.round(balance);
    if (rounded < 0) debtors.push({ person, amount: -rounded });
    if (rounded > 0) creditors.push({ person, amount: rounded });
  }

  debtors.sort((a,b) => b.amount - a.amount);
  creditors.sort((a,b) => b.amount - a.amount);

  const settlements = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0) {
      settlements.push({
        from: debtors[i].person,
        to: creditors[j].person,
        amount
      });
    }

    debtors[i].amount -= amount;
    creditors[j].amount -= amount;

    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }

  return settlements;
}

function copySummary() {
  const event = getCurrentEvent();
  const settlements = calculateSettlements(event);
  const lines = [
    `Итог по мероприятию: ${event.title}`,
    ""
  ];

  if (!settlements.length) {
    lines.push("Все закрыто, долгов нет.");
  } else {
    settlements.forEach(s => lines.push(`${s.from} должен ${s.to}: ${money(s.amount)}`));
  }

  navigator.clipboard.writeText(lines.join("\n"));
  alert("Скопировано");
}

function setTab(tab) {
  state.activeTab = tab;
  save();
  render();
}

function renderEventsScreen() {
  $root.innerHTML = `
    <section class="card">
      <h2>Новое мероприятие</h2>
      <label>Название</label>
      <input id="eventTitle" placeholder="Пятница, ДР, Грузия, шашлыки..." />
      <label>Участники сразу пачкой</label>
      <textarea id="eventPeople" placeholder="Рома, Паша, Артем&#10;или каждый с новой строки"></textarea>
      <button onclick="createEvent()">Создать мероприятие</button>
    </section>

    <section class="card">
      <h2>Мероприятия</h2>
      <div class="grid">
        ${state.events.length ? state.events.map(e => `
          <div class="event-card">
            <div class="expense-top">
              <div onclick="openEvent('${e.id}')" style="flex:1">
                <strong>${escapeHtml(e.title)}</strong>
                <p>${e.people.length} участников · ${e.expenses.length} расходов</p>
              </div>
              <button class="delete-btn" onclick="event.stopPropagation(); deleteEvent('${e.id}')">Удалить</button>
            </div>
          </div>
        `).join("") : `<div class="empty">Пока мероприятий нет. Создай первое — и бухгалтерский ад начнет отступать.</div>`}
      </div>
    </section>
  `;
}

function renderEventScreen() {
  const event = getCurrentEvent();
  if (!event) return goEvents();

  document.getElementById("subtitle").textContent = event.title;

  $root.innerHTML = `
    <section class="card">
      <div class="row wrap" style="justify-content:space-between">
        <div>
          <h2>${escapeHtml(event.title)}</h2>
          <p>${event.people.length} участников · ${event.expenses.length} расходов</p>
        </div>
        <button class="ghost" onclick="goEvents()">← Мероприятия</button>
      </div>
    </section>

    <div class="tabs">
      <button class="tab ${state.activeTab === "expenses" ? "active" : ""}" onclick="setTab('expenses')">Расходы</button>
      <button class="tab ${state.activeTab === "people" ? "active" : ""}" onclick="setTab('people')">Участники</button>
      <button class="tab ${state.activeTab === "summary" ? "active" : ""}" onclick="setTab('summary')">Итог</button>
    </div>

    ${state.activeTab === "expenses" ? renderExpensesTab(event) : ""}
    ${state.activeTab === "people" ? renderPeopleTab(event) : ""}
    ${state.activeTab === "summary" ? renderSummaryTab(event) : ""}
  `;

  if (state.activeTab === "expenses") {
    attachExpenseFormEvents();
    renderSplitModeFields();
  }
}

function renderPeopleTab(event) {
  return `
    <section class="card">
      <h2>Участники</h2>
      <label>Добавить участников пачкой</label>
      <textarea id="addPeopleText" placeholder="Вова, Ринат, Пряник&#10;или каждый с новой строки"></textarea>
      <button onclick="addPeopleToCurrent()">Добавить</button>

      <div class="chips">
        ${event.people.length ? event.people.map(p => `
          <div class="chip">${escapeHtml(p)} <button onclick="removePerson('${escapeHtml(p)}')">×</button></div>
        `).join("") : `<div class="empty">Пока участников нет.</div>`}
      </div>
    </section>
  `;
}

function renderExpensesTab(event) {
  return `
    <section class="card">
      <h2>Добавить расход</h2>

      ${!event.people.length ? `<div class="notice">Сначала добавь участников во вкладке “Участники”.</div>` : ""}

      <label>Название</label>
      <input id="expenseTitle" placeholder="Мак, ресторан, нос, бензин..." />

      <label>Общая сумма</label>
      <input id="expenseAmount" type="number" placeholder="3500" />

      <h3>Кто платил</h3>
      <p class="muted">Можно несколько человек. Сумма плательщиков должна совпасть с общей суммой.</p>
      <div class="grid" id="payersBox">
        ${event.people.map(p => `
          <label class="money-row">
            <input type="checkbox" data-payer-check="${escapeHtml(p)}">
            <span>${escapeHtml(p)}</span>
            <input type="number" data-paid="${escapeHtml(p)}" placeholder="Заплатил">
          </label>
        `).join("")}
      </div>

      <h3 style="margin-top:16px">Кто участвовал</h3>
      <p class="muted">По умолчанию все. Сними тех, кто не участвовал конкретно в этом расходе.</p>
      <div class="mini-actions">
        <button class="small secondary" id="selectAllParticipants">Выбрать всех</button>
        <button class="small ghost" id="clearAllParticipants">Снять всех</button>
      </div>
      <div class="grid" id="participantsBox">
        ${event.people.map(p => `
          <label class="check-row">
            <input type="checkbox" class="participantCheck" value="${escapeHtml(p)}" checked>
            <span>${escapeHtml(p)}</span>
          </label>
        `).join("")}
      </div>

      <h3 style="margin-top:16px">Как разделить расход?</h3>
      <div class="grid">
        <label class="check-row">
          <input type="radio" name="splitMode" value="equal" checked>
          <span>🟢 Поровну между выбранными</span>
        </label>
        <label class="check-row">
          <input type="radio" name="splitMode" value="fixed_rest">
          <span>🟡 Фиксированные суммы, остаток поровну</span>
        </label>
        <label class="check-row">
          <input type="radio" name="splitMode" value="custom">
          <span>🔵 Своя сумма каждому</span>
        </label>
      </div>

      <div id="splitModeFields"></div>

      <button onclick="addExpense()" style="margin-top:16px">Добавить расход</button>
    </section>

    <section class="card">
      <h2>Операции</h2>
      <div class="grid">
        ${event.expenses.length ? event.expenses.map(exp => renderExpenseCard(exp)).join("") : `<div class="empty">Расходов пока нет. Добавь первый — и пункт “Итог” оживет.</div>`}
      </div>
    </section>
  `;
}

function renderExpenseCard(exp) {
  const payersText = Object.entries(exp.payers || {}).map(([p,a]) => `${escapeHtml(p)}: ${money(a)}`).join(" · ");
  const sharesText = Object.entries(exp.shares || {}).map(([p,a]) => `${escapeHtml(p)}: ${money(a)}`).join(" · ");
  const modeName = {
    equal: "Поровну",
    fixed_rest: "Фиксированные + остаток поровну",
    custom: "Своя сумма каждому"
  }[exp.splitMode] || exp.splitMode;

  return `
    <div class="expense-card">
      <div class="expense-top">
        <div>
          <strong>${escapeHtml(exp.title)} — ${money(exp.amount)}</strong>
          <small>Платили: ${payersText}</small>
          <small>Деление: ${modeName}</small>
          <small>Участники: ${(exp.participants || []).map(escapeHtml).join(", ")}</small>
          <small>Доли: ${sharesText}</small>
        </div>
        <button class="delete-btn" onclick="deleteExpense('${exp.id}')">Удалить</button>
      </div>
    </div>
  `;
}

function renderSummaryTab(event) {
  const balances = calculateBalances(event);
  const settlements = calculateSettlements(event);

  return `
    <section class="card">
      <h2>Кто кому должен</h2>
      <div class="grid">
        ${settlements.length ? settlements.map(s => `
          <div class="settlement">${escapeHtml(s.from)} → ${escapeHtml(s.to)}: ${money(s.amount)}</div>
        `).join("") : `<div class="empty">Пока никто никому не должен.</div>`}
      </div>
      <button class="secondary" style="margin-top:14px" onclick="copySummary()">Скопировать итог в Telegram</button>
    </section>

    <section class="card">
      <h2>Баланс по людям</h2>
      ${Object.entries(balances).map(([person, balance]) => `
        <div class="summary-line">
          <span>${escapeHtml(person)}</span>
          <strong>${money(balance)}</strong>
        </div>
      `).join("")}
      <p style="margin-top:12px">Плюс — человеку должны. Минус — человек должен.</p>
    </section>
  `;
}

function attachExpenseFormEvents() {
  document.querySelectorAll('input[name="splitMode"]').forEach(r => {
    r.addEventListener("change", renderSplitModeFields);
  });

  document.querySelectorAll(".participantCheck").forEach(c => {
    c.addEventListener("change", renderSplitModeFields);
  });

  document.getElementById("selectAllParticipants")?.addEventListener("click", () => {
    document.querySelectorAll(".participantCheck").forEach(c => c.checked = true);
    renderSplitModeFields();
  });

  document.getElementById("clearAllParticipants")?.addEventListener("click", () => {
    document.querySelectorAll(".participantCheck").forEach(c => c.checked = false);
    renderSplitModeFields();
  });
}

function renderSplitModeFields() {
  const event = getCurrentEvent();
  const box = document.getElementById("splitModeFields");
  if (!box || !event) return;

  const mode = document.querySelector('input[name="splitMode"]:checked')?.value || "equal";
  const participants = getCheckedPeople("participantCheck");

  if (mode === "equal") {
    box.innerHTML = `
      <div class="notice">
        Все выбранные участники делят расход поровну.
      </div>
    `;
    return;
  }

  if (mode === "fixed_rest") {
    box.innerHTML = `
      <div class="notice">
        Впиши фиксированные суммы тем, кто ел/участвовал иначе. Остаток автоматически разделится поровну между остальными выбранными.
      </div>
      <div class="grid">
        ${participants.map(p => `
          <label class="fixed-row">
            <input type="checkbox" data-fixed-check="${escapeHtml(p)}">
            <span>${escapeHtml(p)}</span>
            <input type="number" data-fixed="${escapeHtml(p)}" placeholder="Фикс сумма">
          </label>
        `).join("") || `<div class="empty">Выбери участников выше.</div>`}
      </div>
    `;
    return;
  }

  if (mode === "custom") {
    box.innerHTML = `
      <div class="notice">
        Впиши точную сумму каждому. Общая сумма должна совпасть с расходом.
      </div>
      <div class="grid">
        ${participants.map(p => `
          <label class="fixed-row">
            <span></span>
            <span>${escapeHtml(p)}</span>
            <input type="number" data-custom="${escapeHtml(p)}" placeholder="Доля">
          </label>
        `).join("") || `<div class="empty">Выбери участников выше.</div>`}
      </div>
    `;
  }
}

document.getElementById("resetBtn").addEventListener("click", () => {
  if (confirm("Стереть все данные BroSplit v3?")) {
    localStorage.removeItem(STORAGE_KEY);
    state = JSON.parse(JSON.stringify(defaultState));
    render();
  }
});

function render() {
  if (state.screen === "events") {
    document.getElementById("subtitle").textContent = "Анти-Паша-машина v3";
    renderEventsScreen();
  } else {
    renderEventScreen();
  }
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}

render();
