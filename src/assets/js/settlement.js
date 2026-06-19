import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  collection, getDocs, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let groupId = localStorage.getItem("currentGroupId");
let currentUser = null;
let balanceChartInstance = null;
let expenseChartInstance = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/assets/login.html"; return; }
  currentUser = user;
  await computeSettlements();
});

// Tab switching
window.showTab = function(tab) {
  document.getElementById("settlements-tab").classList.toggle("hidden", tab !== "settlements");
  document.getElementById("charts-tab").classList.toggle("hidden", tab !== "charts");
  document.getElementById("tab-settlements").classList.toggle("active", tab === "settlements");
  document.getElementById("tab-charts").classList.toggle("active", tab === "charts");
};

async function computeSettlements() {
  const list = document.getElementById("settlements-list");

  if (!groupId) {
    list.innerHTML = "<p style='color:#4a5568;text-align:center;padding:40px;'>No group selected! Go back and open a group first.</p>";
    return;
  }

  const expSnapshot = await getDocs(collection(db, "groups", groupId, "expenses"));
  const groupDoc = await getDoc(doc(db, "groups", groupId));
  if (!groupDoc.exists()) return;

  const members = groupDoc.data().members;

  // Calculate net balances
  const balances = {};
  members.forEach(m => balances[m] = 0);

  let totalExpenseAmount = 0;
  const expenseByMember = {};
  members.forEach(m => expenseByMember[m] = 0);

  expSnapshot.forEach(docSnap => {
    const exp = docSnap.data();
    totalExpenseAmount += exp.amount;
    balances[exp.paidBy] = (balances[exp.paidBy] || 0) + exp.amount;
    expenseByMember[exp.paidBy] = (expenseByMember[exp.paidBy] || 0) + exp.amount;
    Object.entries(exp.splits).forEach(([m, v]) => {
      balances[m] = (balances[m] || 0) - v;
    });
  });

  // Min Cash Flow
  const settlements = minCashFlow({ ...balances });
  const naiveCount = Math.max(members.length * (members.length - 1) / 2, settlements.length);
  const saved = naiveCount - settlements.length;

  // Update stats
  document.getElementById("stat-transactions").textContent = settlements.length;
  document.getElementById("stat-saved").textContent = saved;
  document.getElementById("stat-total").textContent = `₹${totalExpenseAmount.toFixed(0)}`;

  // Render settlements
  if (settlements.length === 0) {
    list.innerHTML = `
      <div style="text-align:center;padding:48px 20px;">
        <div style="font-size:56px;margin-bottom:16px;">🎉</div>
        <h3 style="color:#f0f4ff;font-size:20px;font-weight:700;margin-bottom:8px;">All Settled Up!</h3>
        <p style="color:#4a5568;font-weight:500;">No payments needed in this group.</p>
      </div>`;
  } else {
    list.innerHTML = "";
    settlements.forEach((s, i) => {
      const statusKey = `settlement-${groupId}-${i}`;
      const savedStatus = localStorage.getItem(statusKey) || "pending";
      const card = document.createElement("div");
      card.className = "settlement-card";
    card.innerHTML = `
  <div class="settlement-top">
    <div class="settlement-flow">
      <span class="person-chip">${s.from.split('@')[0]}</span>
      <span class="arrow">→</span>
      <span class="person-chip">${s.to.split('@')[0]}</span>
    </div>
    <div class="settlement-amount">₹${s.amount.toFixed(2)}</div>
  </div>
  <div class="settlement-sub">${s.from.split('@')[0]} pays ${s.to.split('@')[0]}</div>

  ${s.from === currentUser.email ? `
  <button onclick="showPaymentOptions('${s.to}', ${s.amount})" style="
    width:100%;padding:12px;
    background:linear-gradient(135deg,#00c896,#00a87d);
    border:none;border-radius:12px;color:#070b14;
    font-size:14px;font-weight:700;font-family:'DM Sans',sans-serif;
    cursor:pointer;margin-bottom:10px;
    box-shadow:0 0 20px rgba(0,200,150,0.25);
  ">💳 Pay Now</button>
  ` : `
  <div style="padding:10px;background:rgba(255,255,255,0.04);border-radius:12px;text-align:center;font-size:12px;color:#4a5568;font-weight:500;margin-bottom:10px;">
    ⏳ Waiting for ${s.from.split('@')[0]} to pay
  </div>
  `}

  <div class="status-row">
    <button class="status-btn pending ${savedStatus === 'pending' ? 'active' : ''}"
      id="btn-pending-${i}">⏳ Pending</button>
    <button class="status-btn paid ${savedStatus === 'paid' ? 'active' : ''}"
      id="btn-paid-${i}">💸 Paid</button>
    <button class="status-btn confirmed ${savedStatus === 'confirmed' ? 'active' : ''}"
      id="btn-confirmed-${i}">✅ Confirmed</button>
  </div>
`;
      list.appendChild(card);
      // Attach button events directly
      const i_copy = i;
      const statusKey_copy = statusKey;
      ['pending', 'paid', 'confirmed'].forEach(status => {
        document.getElementById(`btn-${status}-${i_copy}`).addEventListener('click', function() {
          localStorage.setItem(statusKey_copy, status);
          const row = this.parentElement;
          row.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
          this.classList.add('active');
        });
      });
    });
  }

  // Render Charts
  renderBalanceChart(balances);
  renderExpenseChart(expenseByMember, totalExpenseAmount);
  renderBalanceBars(balances);
}

// Bar Chart — Member Balances
function renderBalanceChart(balances) {
  const ctx = document.getElementById("balanceChart").getContext("2d");

  const labels = Object.keys(balances).map(m => m.split('@')[0]);
  const values = Object.values(balances);
  const colors = values.map(v => v >= 0 ? 'rgba(0,200,150,0.8)' : 'rgba(244,63,94,0.8)');
  const borderColors = values.map(v => v >= 0 ? '#00c896' : '#f43f5e');

  if (balanceChartInstance) balanceChartInstance.destroy();

  balanceChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Balance (₹)',
        data: values,
        backgroundColor: colors,
        borderColor: borderColors,
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `₹${Math.abs(ctx.parsed.y).toFixed(2)} ${ctx.parsed.y >= 0 ? '(gets back)' : '(owes)'}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#8896b3', font: { family: 'DM Sans', size: 12 } }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#8896b3',
            font: { family: 'DM Sans', size: 11 },
            callback: v => `₹${Math.abs(v)}`
          }
        }
      }
    }
  });
}

// Pie Chart — Who paid how much
function renderExpenseChart(expenseByMember, total) {
  const ctx = document.getElementById("expenseChart").getContext("2d");

  const labels = Object.keys(expenseByMember).map(m => m.split('@')[0]);
  const values = Object.values(expenseByMember);
  const colors = ['#00c896', '#3b82f6', '#a855f7', '#f59e0b', '#f43f5e'];

  if (expenseChartInstance) expenseChartInstance.destroy();

  expenseChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.slice(0, labels.length),
        borderColor: '#111827',
        borderWidth: 3,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#8896b3',
            font: { family: 'DM Sans', size: 12 },
            padding: 16,
            usePointStyle: true,
            pointStyleWidth: 8
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => `₹${ctx.parsed.toFixed(2)} (${((ctx.parsed / total) * 100).toFixed(1)}%)`
          }
        }
      }
    }
  });
}

// Custom Balance Bars
function renderBalanceBars(balances) {
  const container = document.getElementById("balance-bars");
  container.innerHTML = "";

  const values = Object.values(balances);
  const maxAbs = Math.max(...values.map(Math.abs), 1);

  Object.entries(balances).forEach(([member, bal]) => {
    const pct = (Math.abs(bal) / maxAbs) * 100;
    const isPositive = bal >= 0;

    const item = document.createElement("div");
    item.className = "balance-bar-item";
    item.innerHTML = `
      <div class="bar-name">${member.split('@')[0]}</div>
      <div class="bar-track">
        <div class="bar-fill ${isPositive ? 'positive' : 'negative'}"
          style="width:${pct}%"></div>
      </div>
      <div class="bar-value ${isPositive ? 'balance-positive' : 'balance-negative'}">
        ${isPositive ? '+' : '-'}₹${Math.abs(bal).toFixed(0)}
      </div>
    `;
    container.appendChild(item);
  });
}

// Min Cash Flow Algorithm
function minCashFlow(balances) {
  const creditors = [];
  const debtors = [];

  Object.entries(balances).forEach(([person, amount]) => {
    if (amount > 0.01) creditors.push({ person, amount });
    else if (amount < -0.01) debtors.push({ person, amount: -amount });
  });

  const settlements = [];

  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    const creditor = creditors[0];
    const debtor = debtors[0];
    const minAmount = Math.min(creditor.amount, debtor.amount);

    settlements.push({ from: debtor.person, to: creditor.person, amount: minAmount });

    creditor.amount -= minAmount;
    debtor.amount -= minAmount;

    if (creditor.amount < 0.01) creditors.shift();
    if (debtor.amount < 0.01) debtors.shift();
  }

  return settlements;
}
// Payment options (same as group.js)
window.showPaymentOptions = function(toEmail, amount) {
  const existing = document.getElementById("payment-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "payment-modal";
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.8); backdrop-filter: blur(12px);
    z-index: 300; display: flex; align-items: flex-end; justify-content: center;
  `;

  modal.innerHTML = `
    <div style="background:#111827;border:1px solid rgba(255,255,255,0.08);border-radius:28px 28px 0 0;padding:12px 24px 40px;width:100%;max-width:500px;">
      <div style="width:36px;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;margin:0 auto 20px;"></div>
      <h3 style="font-size:18px;font-weight:700;color:#f0f4ff;margin-bottom:6px;">💳 Pay ₹${amount.toFixed(2)}</h3>
      <p style="font-size:13px;color:#4a5568;margin-bottom:20px;">to ${toEmail.split('@')[0]}</p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        <button onclick="openPayment('${toEmail}',${amount},'gpay')" style="background:#111827;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:16px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;">
          <span style="font-size:28px;">🟢</span>
          <span style="font-size:14px;font-weight:700;color:#f0f4ff;">Google Pay</span>
        </button>
        <button onclick="openPayment('${toEmail}',${amount},'phonepe')" style="background:#111827;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:16px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;">
          <span style="font-size:28px;">💜</span>
          <span style="font-size:14px;font-weight:700;color:#f0f4ff;">PhonePe</span>
        </button>
        <button onclick="openPayment('${toEmail}',${amount},'paytm')" style="background:#111827;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:16px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;">
          <span style="font-size:28px;">🔵</span>
          <span style="font-size:14px;font-weight:700;color:#f0f4ff;">Paytm</span>
        </button>
        <button onclick="openPayment('${toEmail}',${amount},'upi')" style="background:#111827;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:16px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;">
          <span style="font-size:28px;">💰</span>
          <span style="font-size:14px;font-weight:700;color:#f0f4ff;">Any UPI</span>
        </button>
      </div>

      <p style="color:#4a5568;font-size:12px;text-align:center;margin-bottom:16px;">
        ⚠️ Works on mobile with payment apps installed
      </p>

      <button onclick="document.getElementById('payment-modal').remove()" style="width:100%;padding:13px;background:transparent;border:1px solid rgba(255,255,255,0.08);border-radius:12px;color:#4a5568;font-size:14px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;">
        Cancel
      </button>
    </div>
  `;

  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
};

window.openPayment = function(toEmail, amount, app) {
  const note = encodeURIComponent(`FairSplit - ${localStorage.getItem('currentGroupName')}`);
  const name = encodeURIComponent(toEmail.split('@')[0]);
  const urls = {
    gpay: `tez://upi/pay?pa=${toEmail}&pn=${name}&am=${amount}&cu=INR&tn=${note}`,
    phonepe: `phonepe://pay?pa=${toEmail}&pn=${name}&am=${amount}&cu=INR&tn=${note}`,
    paytm: `paytmmp://pay?pa=${toEmail}&pn=${name}&am=${amount}&cu=INR&tn=${note}`,
    upi: `upi://pay?pa=${toEmail}&pn=${name}&am=${amount}&cu=INR&tn=${note}`
  };
  window.location.href = urls[app];
  setTimeout(() => alert("💡 If the app didn't open, make sure it's installed on your phone!"), 2000);
};

