const state = JSON.parse(localStorage.getItem("brosplit_state_v2")) || {
  people: [],
  expenses: []
};

const $ = (id) => document.getElementById(id);

function save() {
  localStorage.setItem("brosplit_state_v2", JSON.stringify(state));
}

function money(n) {
  return Math.round(n).toLocaleString("ru-RU") + " ₽";
}

function parsePeople(text) {
  return text
    .split(/[\n,;]+/g)
    .map(x => x.trim())
    .filter(Boolean);
}

function addPeople(text) {
  const names = parsePeople(text);
  if (!names.length) return alert("Впиши хотя бы одного участника");

  let added = 0;
  for (const name of names) {
    if (!state.people.includes(name)) {
      state.people.push(name);
      added++;
    }
  }

  $("peopleInput").value = "";
  save();
  render();

  if (!added) alert("Новых участников нет — все уже добавлены");
}

function removePerson(name) {
  state.people = state.people.filter(p => p !== name);
  state.expenses = state.expenses.filter(e => {
    const payerNames = Object.keys(e.payers || {});
    return !payerNames.includes(name) && !e.participants.includes(name);
  });
  save();
  render();
}

function getSelectedParticipants() {
  return [...document.querySelectorAll(".participantCheck:checked")].map(i => i.value);
}

function getPayers() {
  const payers = {};
  const rows = [...document.querySelectorAll(".payerCheck:checked")];

  for (const checkbox of rows) {
    const person = checkbox.value;
    const input = document.querySelector(`[data-paid="${CSS.escape(person)}"]`);
    const amount = Number(input?.value || 0);
    if (amount > 0) payers[person] = amount;
  }

  return payers;
}

function addExpense() {
  const title = $("expenseTitle").value.trim();
  const amount = Number($("expenseAmount").value);
  const splitType = $("splitType").value;
  const participants = getSelectedParticipants();
  const payers = getPayers();
  const paidTotal = Object.values(payers).reduce((a, b) => a + b, 0);

  if (!title) return alert("Название расхода забыли. Бухгалтер грустит.");
  if (!amount || amount <= 0) return alert("Сумма должна быть больше нуля");
  if (!Object.keys(payers).length) return alert("Выбери, кто оплатил, и впиши суммы");
  if (Math.round(paidTotal) !== Math.round(amount)) {
    return alert(`Плательщики внесли ${money(paidTotal)}, а расход ${money(amount)}. Суммы должны совпадать.`);
  }
  if (!participants.length) return alert("Выбери участников расхода");

  let shares = {};

  if (splitType === "equal") {
    const share = amount / participants.length;
    participants.forEach(p => shares[p] = share);
  } else {
    let total = 0;
    participants.forEach(p => {
      const input = document.querySelector(`[data-share="${CSS.escape(p)}"]`);
      const val = Number(input?.value || 0);
      shares[p] = val;
      total += val;
    });

    if (Math.round(total) !== Math.round(amount)) {
      return alert(`Доли участников дают ${money(total)}, а расход ${money(amount)}. Не сходится.`);
    }
  }

  state.expenses.push({
    id: Date.now(),
    title,
    amount,
    payers,
    participants,
    shares,
    splitType
  });

  $("expenseTitle").value = "";
  $("expenseAmount").value = "";
  save();
  render();
}

function deleteExpense(id) {
  state.expenses = state.expenses.filter(e => e.id !== id);
  save();
  render();
}

function calculateDebts() {
  const balances = {};
  state.people.forEach(p => balances[p] = 0);

  for (const e of state.expenses) {
    for (const [person, paid] of Object.entries(e.payers || {})) {
      balances[person] = (balances[person] || 0) + paid;
    }
    for (const [person, share] of Object.entries(e.shares || {})) {
      balances[person] = (balances[person] || 0) - share;
    }
  }

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
      settlements.push({ from: debtors[i].person, to: creditors[j].person, amount });
    }

    debtors[i].amount -= amount;
    creditors[j].amount -= amount;

    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }

  return settlements;
}

function renderPeople() {
  $("peopleList").innerHTML = state.people.length
    ? state.people.map(p => `<div class="chip">${p}<button class="danger" onclick="removePerson('${escapeHtml(p)}')">×</button></div>`).join("")
    : `<div class="empty">Пока никого нет. Впиши всех пачкой через запятую или с новой строки.</div>`;

  $("payersBox").innerHTML = state.people.length
    ? state.people.map(p => `
      <label class="money-row">
        <input type="checkbox" class="payerCheck" value="${escapeHtml(p)}">
        <span>${escapeHtml(p)}</span>
        <input type="number" data-paid="${escapeHtml(p)}" placeholder="Сколько заплатил">
      </label>
    `).join("")
    : `<div class="empty">Сначала добавь участников.</div>`;

  $("participantsBox").innerHTML = state.people.length
    ? state.people.map(p => `
      <label class="check">
        <input type="checkbox" class="participantCheck" value="${escapeHtml(p)}" checked onchange="renderCustomShares()">
        ${escapeHtml(p)}
      </label>
    `).join("")
    : `<div class="empty">Сначала добавь участников.</div>`;

  renderCustomShares();
}

function renderCustomShares() {
  const splitType = $("splitType").value;
  const selected = getSelectedParticipants();
  const box = $("customShares");

  if (splitType !== "custom") {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }

  box.classList.remove("hidden");
  box.innerHTML = `
    <label>Сколько должен каждый участник</label>
    ${selected.map(p => `
      <div class="custom-row">
        <span>${escapeHtml(p)}</span>
        <input type="number" data-share="${escapeHtml(p)}" placeholder="0">
      </div>
    `).join("")}
  `;
}

function renderExpenses() {
  $("expensesList").innerHTML = state.expenses.length
    ? state.expenses.map(e => {
      const payersText = Object.entries(e.payers || {}).map(([p, a]) => `${escapeHtml(p)}: ${money(a)}`).join(" · ");
      const sharesText = Object.entries(e.shares || {}).map(([p, s]) => `${escapeHtml(p)}: ${money(s)}`).join(" · ");
      return `
        <div class="expense">
          <div class="expense-top">
            <div>
              <strong>${escapeHtml(e.title)} — ${money(e.amount)}</strong>
              <small>Платили: ${payersText}</small>
              <small>Участники: ${e.participants.map(escapeHtml).join(", ")}</small>
              <small>Доли: ${sharesText}</small>
            </div>
            <button class="danger" onclick="deleteExpense(${e.id})">Удалить</button>
          </div>
        </div>
      `;
    }).join("")
    : `<div class="empty">Операций пока нет.</div>`;
}

function renderSettlements() {
  const settlements = calculateDebts();
  $("settlementsList").innerHTML = settlements.length
    ? settlements.map(s => `<div class="settlement">${escapeHtml(s.from)} → ${escapeHtml(s.to)}: ${money(s.amount)}</div>`).join("")
    : `<div class="empty">Пока никто никому не должен. Редкий мирный момент.</div>`;
}

function copySummary() {
  const settlements = calculateDebts();
  const text = settlements.length
    ? "Итог по долгам:\n\n" + settlements.map(s => `${s.from} должен ${s.to}: ${money(s.amount)}`).join("\n")
    : "Все закрыто, долгов нет.";

  navigator.clipboard.writeText(text);
  alert("Скопировано");
}

function selectAllParticipants(checked) {
  document.querySelectorAll(".participantCheck").forEach(i => i.checked = checked);
  renderCustomShares();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

function render() {
  renderPeople();
  renderExpenses();
  renderSettlements();
}

$("addPeopleBtn").onclick = () => addPeople($("peopleInput").value);
$("peopleInput").addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    addPeople($("peopleInput").value);
  }
});
$("addExpenseBtn").onclick = addExpense;
$("copyBtn").onclick = copySummary;
$("splitType").onchange = renderCustomShares;
$("selectAllBtn").onclick = () => selectAllParticipants(true);
$("clearAllBtn").onclick = () => selectAllParticipants(false);
$("resetBtn").onclick = () => {
  if (confirm("Точно все стереть?")) {
    localStorage.removeItem("brosplit_state_v2");
    location.reload();
  }
};

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}

render();
