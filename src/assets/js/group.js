import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  collection, addDoc, getDocs, query, doc, getDoc, serverTimestamp, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;
let groupId = localStorage.getItem("currentGroupId");
let groupData = null;
let members = [];

document.getElementById("group-title").textContent = localStorage.getItem("currentGroupName") || "Group";

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/assets/login.html"; return; }
  currentUser = user;
  await loadGroup();
  await loadExpenses();
});

async function loadGroup() {
  const groupDoc = await getDoc(doc(db, "groups", groupId));
  if (!groupDoc.exists()) return;
  groupData = groupDoc.data();
  members = groupData.members;

  const paidBySelect = document.getElementById("expense-paidby");
  paidBySelect.innerHTML = "";
  members.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    paidBySelect.appendChild(opt);
  });
}

// Tabs
window.showTab = function(tab) {
  document.getElementById("expenses-tab").classList.toggle("hidden", tab !== "expenses");
  document.getElementById("balances-tab").classList.toggle("hidden", tab !== "balances");
  document.getElementById("tab-expenses").classList.toggle("active", tab === "expenses");
  document.getElementById("tab-balances").classList.toggle("active", tab === "balances");
  if (tab === "balances") loadBalances();
};

// Modal open/close
document.getElementById("add-expense-btn").addEventListener("click", () => {
  document.getElementById("expense-modal").classList.remove("hidden");
  updateSplitInputs();
});

document.getElementById("close-expense-modal").addEventListener("click", () => {
  document.getElementById("expense-modal").classList.add("hidden");
});

document.getElementById("split-type").addEventListener("change", updateSplitInputs);

function updateSplitInputs() {
  const type = document.getElementById("split-type").value;
  const container = document.getElementById("split-inputs");
  container.innerHTML = "";
  if (type === "equal") return;

  members.forEach(member => {
    const div = document.createElement("div");
    div.className = "input-group";
    div.innerHTML = `
      <label>${member} (${type === "percentage" ? "%" : "shares"})</label>
      <input type="number" id="split-${btoa(member)}" placeholder="${type === "percentage" ? "e.g. 40" : "e.g. 2"}"/>
    `;
    container.appendChild(div);
  });
}

// Add Expense
document.getElementById("add-expense-submit").addEventListener("click", async () => {
  const name = document.getElementById("expense-name").value.trim();
  const amount = parseFloat(document.getElementById("expense-amount").value);
  const paidBy = document.getElementById("expense-paidby").value;
  const splitType = document.getElementById("split-type").value;
  const errorEl = document.getElementById("expense-error");

  if (!name || isNaN(amount) || amount <= 0) {
    errorEl.textContent = "Please enter valid expense details!";
    return;
  }

  let splits = {};

  if (splitType === "equal") {
    const share = amount / members.length;
    members.forEach(m => splits[m] = parseFloat(share.toFixed(2)));

  } else if (splitType === "percentage") {
    let total = 0;
    members.forEach(m => {
      const val = parseFloat(document.getElementById(`split-${btoa(m)}`).value) || 0;
      total += val;
      splits[m] = val;
    });
    if (Math.abs(total - 100) > 0.01) {
      errorEl.textContent = "Percentages must add up to 100!";
      return;
    }
    members.forEach(m => splits[m] = parseFloat(((splits[m] / 100) * amount).toFixed(2)));

  } else if (splitType === "shares") {
    let totalShares = 0;
    members.forEach(m => {
      const val = parseFloat(document.getElementById(`split-${btoa(m)}`).value) || 1;
      splits[m] = val;
      totalShares += val;
    });
    members.forEach(m => splits[m] = parseFloat(((splits[m] / totalShares) * amount).toFixed(2)));
  }

  try {
    await addDoc(collection(db, "groups", groupId, "expenses"), {
      name, amount, paidBy, splitType, splits,
      createdBy: currentUser.email,
      createdAt: serverTimestamp()
    });

    document.getElementById("expense-modal").classList.add("hidden");
    document.getElementById("expense-name").value = "";
    document.getElementById("expense-amount").value = "";
    errorEl.textContent = "";
    await loadExpenses();
  } catch (err) {
    errorEl.textContent = "Error adding expense. Try again!";
  }
});

// Load Expenses
// Real-time expenses listener
let expensesUnsubscribe = null;

async function loadExpenses() {
  const list = document.getElementById("expenses-list");
  list.innerHTML = "<p style='color:rgba(255,255,255,0.4);text-align:center;padding:20px;'>Loading...</p>";

  // Unsubscribe previous listener if exists
  if (expensesUnsubscribe) expensesUnsubscribe();

  const { onSnapshot, query, collection, orderBy } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

  const q = query(
    collection(db, "groups", groupId, "expenses"),
    orderBy("createdAt", "desc")
  );

  // Real-time listener
  expensesUnsubscribe = onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      list.innerHTML = `<div class="empty-state"><div class="icon">💸</div><p>No expenses yet!<br/>Tap + to add one.</p></div>`;
      document.getElementById("net-balance").textContent = "₹0";
      return;
    }

    list.innerHTML = "";
    let netBalance = 0;

   snapshot.forEach(docSnap => {
  const exp = docSnap.data();
  const expId = docSnap.id;
  const myShare = exp.splits[currentUser.email] || 0;
  const iPaid = exp.paidBy === currentUser.email;

  if (iPaid) netBalance += (exp.amount - myShare);
  else netBalance -= myShare;

  const card = document.createElement("div");
  card.className = "expense-card";

  const splitsHtml = Object.entries(exp.splits)
    .map(([m, v]) => `<span class="split-chip">${m.split('@')[0]}: ₹${v}</span>`)
    .join('');

  card.innerHTML = `
    <div class="expense-top">
      <div>
        <div class="expense-name">${exp.name}</div>
        <div class="expense-meta">${exp.splitType} split</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="expense-amount">₹${exp.amount}</div>
        ${exp.createdBy === currentUser.email ? `
          <button onclick="editExpense('${expId}', '${exp.name}', ${exp.amount})" style="background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);border-radius:8px;color:#3b82f6;font-size:11px;font-weight:600;padding:4px 8px;cursor:pointer;font-family:'DM Sans',sans-serif;">✏️</button>
          <button onclick="deleteExpense('${expId}', '${exp.name}')" style="background:rgba(244,63,94,0.15);border:1px solid rgba(244,63,94,0.3);border-radius:8px;color:#f43f5e;font-size:11px;font-weight:600;padding:4px 8px;cursor:pointer;font-family:'DM Sans',sans-serif;">🗑️</button>
        ` : ''}
      </div>
    </div>
    <div class="expense-paid">Paid by: ${exp.paidBy}</div>
    <div class="splits-row">${splitsHtml}</div>
  `;
  list.appendChild(card);
});

    // Update net balance
    const netEl = document.getElementById("net-balance");
    netEl.textContent = `₹${Math.abs(netBalance).toFixed(2)}`;
    netEl.className = "net " + (netBalance > 0 ? "balance-positive" : netBalance < 0 ? "balance-negative" : "balance-zero");
    if (netBalance > 0) netEl.textContent += " (you get back)";
    else if (netBalance < 0) netEl.textContent += " (you owe)";

    // Show real-time indicator
    showSyncIndicator();
  }, (error) => {
    list.innerHTML = "<p style='color:red;text-align:center;'>Error loading expenses!</p>";
  });
}

// Real-time sync indicator
function showSyncIndicator() {
  const existing = document.getElementById("sync-indicator");
  if (existing) existing.remove();

  const indicator = document.createElement("div");
  indicator.id = "sync-indicator";
  indicator.style.cssText = `
    position: fixed; top: 70px; right: 16px;
    background: rgba(0,200,150,0.15);
    border: 1px solid rgba(0,200,150,0.3);
    border-radius: 20px; padding: 6px 12px;
    font-size: 12px; font-weight: 600;
    color: #00c896; z-index: 999;
    display: flex; align-items: center; gap: 6px;
    animation: fadeInOut 2s ease-in-out forwards;
  `;
  indicator.innerHTML = `<span style="width:6px;height:6px;background:#00c896;border-radius:50%;display:inline-block;"></span> Synced`;
  document.body.appendChild(indicator);

  setTimeout(() => indicator.remove(), 2000);
}

// Real-time balances listener
let balancesUnsubscribe = null;
//load balances
async function loadBalances() {
  const list = document.getElementById("balances-list");
  list.innerHTML = "";

  if (balancesUnsubscribe) balancesUnsubscribe();

  const { onSnapshot, collection } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

  balancesUnsubscribe = onSnapshot(
    collection(db, "groups", groupId, "expenses"),
    (snapshot) => {
      const balances = {};
      members.forEach(m => balances[m] = 0);

      snapshot.forEach(docSnap => {
        const exp = docSnap.data();
        balances[exp.paidBy] = (balances[exp.paidBy] || 0) + exp.amount;
        Object.entries(exp.splits).forEach(([m, v]) => {
          balances[m] = (balances[m] || 0) - v;
        });
      });

      list.innerHTML = "";
      members.forEach(member => {
        const bal = balances[member] || 0;
        const card = document.createElement("div");
        card.className = "expense-card";
        card.innerHTML = `
          <div class="expense-top">
            <div class="expense-name">${member.split('@')[0]}</div>
            <div class="${bal >= 0 ? 'balance-positive' : 'balance-negative'}">
              ${bal >= 0 ? '+' : ''}₹${Math.abs(bal).toFixed(2)}
            </div>
          </div>
          <div class="expense-meta">${bal > 0 ? '💰 Gets back money' : bal < 0 ? '📤 Owes money' : '✅ Settled up'}</div>
        `;
        list.appendChild(card);
      });
    }
  );
}
// Toggle group options menu
window.toggleGroupMenu = function() {
  const menu = document.getElementById("group-menu");
  menu.classList.toggle("hidden");
};

// Close menu when clicking outside
document.addEventListener("click", (e) => {
  const menu = document.getElementById("group-menu");
  if (!menu.classList.contains("hidden") &&
      !e.target.closest("#group-menu") &&
      !e.target.closest(".back-btn")) {
    menu.classList.add("hidden");
  }
});

// Show Add Member Modal
window.showAddMemberModal = function() {
  document.getElementById("group-menu").classList.add("hidden");
  document.getElementById("add-member-modal").classList.remove("hidden");
};

// Show Remove Member Modal
window.showRemoveMemberModal = function() {
  document.getElementById("group-menu").classList.add("hidden");
  const select = document.getElementById("remove-member-select");
  select.innerHTML = "";
  members.forEach(m => {
    if (m !== currentUser.email) {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      select.appendChild(opt);
    }
  });
  document.getElementById("remove-member-modal").classList.remove("hidden");
};

// Close modals
document.getElementById("close-add-member").addEventListener("click", () => {
  document.getElementById("add-member-modal").classList.add("hidden");
});

document.getElementById("close-remove-member").addEventListener("click", () => {
  document.getElementById("remove-member-modal").classList.add("hidden");
});

// Add Member
document.getElementById("add-member-submit").addEventListener("click", async () => {
  const email = document.getElementById("new-member-email").value.trim();
  const errorEl = document.getElementById("add-member-error");

  if (!email) { errorEl.textContent = "Please enter an email!"; return; }
  if (members.includes(email)) { errorEl.textContent = "Member already in group!"; return; }

  try {
    const { doc, updateDoc, arrayUnion } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
    await updateDoc(doc(db, "groups", groupId), {
      members: arrayUnion(email)
    });
    members.push(email);
    document.getElementById("add-member-modal").classList.add("hidden");
    document.getElementById("new-member-email").value = "";
    errorEl.textContent = "";

    // Refresh paid by select
    const paidBySelect = document.getElementById("expense-paidby");
    const opt = document.createElement("option");
    opt.value = email;
    opt.textContent = email;
    paidBySelect.appendChild(opt);

    alert(`✅ ${email} added successfully!`);
  } catch(err) {
    errorEl.textContent = "Error adding member. Try again!";
  }
});

// Remove Member
document.getElementById("remove-member-submit").addEventListener("click", async () => {
  const email = document.getElementById("remove-member-select").value;
  const errorEl = document.getElementById("remove-member-error");

  if (!email) { errorEl.textContent = "Please select a member!"; return; }

  try {
    const { doc, updateDoc, arrayRemove } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
    await updateDoc(doc(db, "groups", groupId), {
      members: arrayRemove(email)
    });
    members = members.filter(m => m !== email);
    document.getElementById("remove-member-modal").classList.add("hidden");
    errorEl.textContent = "";
    alert(`✅ ${email} removed successfully!`);
  } catch(err) {
    errorEl.textContent = "Error removing member. Try again!";
  }
});

// Delete Group
window.deleteGroup = async function() {
  const confirm = window.confirm(`Are you sure you want to delete "${localStorage.getItem('currentGroupName')}"? This cannot be undone!`);
  if (!confirm) return;

  try {
    const { doc, deleteDoc, collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

    // Delete all expenses first
    const expSnap = await getDocs(collection(db, "groups", groupId, "expenses"));
    const deletePromises = expSnap.docs.map(d => deleteDoc(doc(db, "groups", groupId, "expenses", d.id)));
    await Promise.all(deletePromises);

    // Delete the group
    await deleteDoc(doc(db, "groups", groupId));

    localStorage.removeItem("currentGroupId");
    localStorage.removeItem("currentGroupName");
    alert("✅ Group deleted successfully!");
    window.location.href = "/assets/dashboard.html";
  } catch(err) {
    alert("Error deleting group. Try again!");
  }
};
// Delete Expense
window.deleteExpense = async function(expId, expName) {
  const confirm = window.confirm(`Delete "${expName}"? This cannot be undone!`);
  if (!confirm) return;

  try {
    const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
    await deleteDoc(doc(db, "groups", groupId, "expenses", expId));
    showToast("✅ Expense deleted!");
  } catch(err) {
    showToast("❌ Error deleting expense!");
  }
};

// Edit Expense
window.editExpense = function(expId, expName, expAmount) {
  // Show edit modal
  document.getElementById("edit-expense-modal").classList.remove("hidden");
  document.getElementById("edit-expense-id").value = expId;
  document.getElementById("edit-expense-name").value = expName;
  document.getElementById("edit-expense-amount").value = expAmount;
};

// Save edited expense
document.getElementById("save-edit-expense").addEventListener("click", async () => {
  const expId = document.getElementById("edit-expense-id").value;
  const name = document.getElementById("edit-expense-name").value.trim();
  const amount = parseFloat(document.getElementById("edit-expense-amount").value);
  const errorEl = document.getElementById("edit-expense-error");

  if (!name || isNaN(amount) || amount <= 0) {
    errorEl.textContent = "Please enter valid details!";
    return;
  }

  try {
    const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

    // Recalculate splits with new amount
    const expDoc = await (await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js")).getDoc(
      doc(db, "groups", groupId, "expenses", expId)
    );

    const expData = expDoc.data();
    const oldAmount = expData.amount;
    const ratio = amount / oldAmount;
    const newSplits = {};
    Object.entries(expData.splits).forEach(([m, v]) => {
      newSplits[m] = parseFloat((v * ratio).toFixed(2));
    });

    await updateDoc(doc(db, "groups", groupId, "expenses", expId), {
      name, amount, splits: newSplits
    });

    document.getElementById("edit-expense-modal").classList.add("hidden");
    errorEl.textContent = "";
    showToast("✅ Expense updated!");
  } catch(err) {
    errorEl.textContent = "Error updating expense!";
  }
});

document.getElementById("close-edit-expense").addEventListener("click", () => {
  document.getElementById("edit-expense-modal").classList.add("hidden");
});

// Toast notification
function showToast(message) {
  const existing = document.getElementById("toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "toast";
  toast.style.cssText = `
    position: fixed; bottom: 100px; left: 50%;
    transform: translateX(-50%);
    background: #111827; border: 1px solid rgba(0,200,150,0.3);
    border-radius: 20px; padding: 10px 20px;
    font-size: 13px; font-weight: 600; color: #f0f4ff;
    z-index: 999; animation: fadeInOut 2.5s ease forwards;
    white-space: nowrap;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}
// Payment redirect
window.openPayment = function(toEmail, amount, app) {
  const upiId = toEmail; // In real app, user would have UPI ID stored
  const note = `FairSplit - ${localStorage.getItem('currentGroupName')}`;
  const encodedNote = encodeURIComponent(note);
  const encodedName = encodeURIComponent(toEmail.split('@')[0]);

  let url = '';

  if (app === 'gpay') {
    url = `tez://upi/pay?pa=${upiId}&pn=${encodedName}&am=${amount}&cu=INR&tn=${encodedNote}`;
  } else if (app === 'phonepe') {
    url = `phonepe://pay?pa=${upiId}&pn=${encodedName}&am=${amount}&cu=INR&tn=${encodedNote}`;
  } else if (app === 'paytm') {
    url = `paytmmp://pay?pa=${upiId}&pn=${encodedName}&am=${amount}&cu=INR&tn=${encodedNote}`;
  } else if (app === 'upi') {
    url = `upi://pay?pa=${upiId}&pn=${encodedName}&am=${amount}&cu=INR&tn=${encodedNote}`;
  }

  // Try to open the app
  window.location.href = url;

  // Fallback after 2 seconds if app not installed
  setTimeout(() => {
    showToast("💡 App not found! Try another payment method.");
  }, 2000);
};

// Show payment options
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
    <div style="background:#111827;border:1px solid rgba(255,255,255,0.08);border-radius:28px 28px 0 0;padding:12px 24px 40px;width:100%;max-width:500px;animation:slideUp 0.3s ease;">
      <div style="width:36px;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;margin:0 auto 20px;"></div>
      <h3 style="font-size:18px;font-weight:700;color:#f0f4ff;margin-bottom:6px;">💳 Pay ₹${amount.toFixed(2)}</h3>
      <p style="font-size:13px;color:#4a5568;font-weight:500;margin-bottom:20px;">to ${toEmail.split('@')[0]}</p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">

        <button onclick="openPayment('${toEmail}', ${amount}, 'gpay')" style="background:#111827;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:16px;cursor:pointer;transition:all 0.25s;display:flex;flex-direction:column;align-items:center;gap:8px;" onmouseover="this.style.borderColor='rgba(0,200,150,0.3)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.08)'">
          <span style="font-size:28px;">🟢</span>
          <span style="font-size:14px;font-weight:700;color:#f0f4ff;">Google Pay</span>
          <span style="font-size:11px;color:#4a5568;font-weight:500;">GPay UPI</span>
        </button>

        <button onclick="openPayment('${toEmail}', ${amount}, 'phonepe')" style="background:#111827;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:16px;cursor:pointer;transition:all 0.25s;display:flex;flex-direction:column;align-items:center;gap:8px;" onmouseover="this.style.borderColor='rgba(0,200,150,0.3)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.08)'">
          <span style="font-size:28px;">💜</span>
          <span style="font-size:14px;font-weight:700;color:#f0f4ff;">PhonePe</span>
          <span style="font-size:11px;color:#4a5568;font-weight:500;">PhonePe UPI</span>
        </button>

        <button onclick="openPayment('${toEmail}', ${amount}, 'paytm')" style="background:#111827;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:16px;cursor:pointer;transition:all 0.25s;display:flex;flex-direction:column;align-items:center;gap:8px;" onmouseover="this.style.borderColor='rgba(0,200,150,0.3)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.08)'">
          <span style="font-size:28px;">🔵</span>
          <span style="font-size:14px;font-weight:700;color:#f0f4ff;">Paytm</span>
          <span style="font-size:11px;color:#4a5568;font-weight:500;">Paytm UPI</span>
        </button>

        <button onclick="openPayment('${toEmail}', ${amount}, 'upi')" style="background:#111827;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:16px;cursor:pointer;transition:all 0.25s;display:flex;flex-direction:column;align-items:center;gap:8px;" onmouseover="this.style.borderColor='rgba(0,200,150,0.3)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.08)'">
          <span style="font-size:28px;">💰</span>
          <span style="font-size:14px;font-weight:700;color:#f0f4ff;">Any UPI</span>
          <span style="font-size:11px;color:#4a5568;font-weight:500;">Generic UPI</span>
        </button>

      </div>

      <p style="color:#4a5568;font-size:12px;font-weight:500;text-align:center;margin-bottom:16px;">
        ⚠️ Works on mobile with payment apps installed
      </p>

      <button onclick="document.getElementById('payment-modal').remove()" style="width:100%;padding:13px;background:transparent;border:1px solid rgba(255,255,255,0.08);border-radius:12px;color:#4a5568;font-size:14px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;">
        Cancel
      </button>
    </div>
  `;

  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
};