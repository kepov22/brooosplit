const state = JSON.parse(localStorage.getItem("brosplit_state")) || {
  people: [],
  expenses: []
};

const $ = (id) => document.getElementById(id);

function save() {
  localStorage.setItem("brosplit_state", JSON.stringify(state));
}

function money(n) {
  return Math.round(n).toLocaleString("ru-RU") + " ₽";
}

function addPerson(name) {
  const clean = name.trim();
  if (!clean) return;
  if (state.people.includes(clean)) return alert("Такой участник уже есть");
  state.people.push(clean);
  save();
  render();
}

function removePerson(name) {
  state.people = state.people.filter(p => p !== name);
  state.expenses = state.expenses.filter(e => e.payer !== name && !e.participants.includes(name));
  save();
  render();
}

function addExpense() {
  const title = $("expenseTitle").value.trim();
  const amount = Number($("expenseAmount").value);
  const payer = $("payerSelect").value;
  const splitType = $("splitType").value;

  const participants = [...document.querySelectorAll(".participantCheck:checked")].map(i => i.value);

  if (!title) return alert("Название расхода забыли. Бухгалтер грустит.");
  if (!amount || amount <= 0) return alert("Сумма должна быть больше нуля");
  if (!payer) return alert("Выбери, кто оплатил");
  if (!participants.length) return alert("Выбери участников расхода");

  let shares = {};

  if (splitType === "equal") {
    const share = amount / participants.length;
    participants.forEach(p => shares[p] = share);
  } else {
    let total = 0;
    participants.forEach(p => {
      const val = Number(document.querySelector(`[data-share="${p}"]`)?.value || 0);
      shares[p] = val;
      total += val;
    });

    if (Math.round(total) !== Math.round(amount)) {
      return alert(`Суммы по людям дают ${money(total)}, а расход ${money(amount)}. Не сходится.`);
    }
  }

  state.expenses.push({
    id: Date.now(),
    title,
    amount,
    payer,
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
    balances[e.payer] += e.amount;
    for (const [person, share] of Object.entries(e.shares)) {
      balances[person] -= share;
    }
  }

  const debtors = [];
  const creditors = [];

  for (const [person, balance] of Object.entries(balances)) {
    const rounded = Math.round(balance);
    if (rounded < 0) debtors.push({ person, amount: -rounded });
    if (rounded > 0) creditors.push({ person, amount: rounded });
  }

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

function renderPeople() {
  $("peopleList").innerHTML = state.people.length
    ? state.people.map(p => `<div class="chip">${p}<button class="danger" onclick="removePerson('${p}')">×</button></div>`).join("")
    : `<div class="empty">Пока никого нет. Добавь участников.</div>`;

  $("payerSelect").innerHTML = state.people.map(p => `<option value="${p}">${p}</option>`).join("");

  $("participantsBox").innerHTML = state.people.map(p => `
    <label class="check">
      <input type="checkbox" class="participantCheck" value="${p}" checked onchange="renderCustomShares()">
      ${p}
    </label>
  `).join("");

  renderCustomShares();
}

function renderCustomShares() {
  const splitType = $("splitType").value;
  const selected = [...document.querySelectorAll(".participantCheck:checked")].map(i => i.value);
  const box = $("customShares");

  if (splitType !== "custom") {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }

  box.classList.remove("hidden");
  box.innerHTML = selected.map(p => `
    <div class="custom-row">
      <span>${p}</span>
      <input type="number" data-share="${p}" placeholder="0">
    </div>
  `).join("");
}

function renderExpenses() {
  $("expensesList").innerHTML = state.expenses.length
    ? state.expenses.map(e => `
      <div class="expense">
        <div class="expense-top">
          <div>
            <strong>${e.title} — ${money(e.amount)}</strong>
            <small>Платил: ${e.payer}</small>
            <small>Участники: ${e.participants.join(", ")}</small>
            <small>${Object.entries(e.shares).map(([p, s]) => `${p}: ${money(s)}`).join(" · ")}</small>
          </div>
          <button class="danger" onclick="deleteExpense(${e.id})">Удалить</button>
        </div>
      </div>
    `).join("")
    : `<div class="empty">Операций пока нет.</div>`;
}

function renderSettlements() {
  const settlements = calculateDebts();
  $("settlementsList").innerHTML = settlements.length
    ? settlements.map(s => `<div class="settlement">${s.from} → ${s.to}: ${money(s.amount)}</div>`).join("")
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

function render() {
  renderPeople();
  renderExpenses();
  renderSettlements();
}

$("addPersonBtn").onclick = () => addPerson($("personInput").value);
$("personInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    addPerson($("personInput").value);
    $("personInput").value = "";
  }
});
$("addExpenseBtn").onclick = addExpense;
$("copyBtn").onclick = copySummary;
$("splitType").onchange = renderCustomShares;
$("resetBtn").onclick = () => {
  if (confirm("Точно все стереть?")) {
    localStorage.removeItem("brosplit_state");
    location.reload();
  }
};

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}

render();
