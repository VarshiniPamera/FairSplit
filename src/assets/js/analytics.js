import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  collection, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/assets/login.html"; return; }
  currentUser = user;
  await loadAnalytics();
});

async function loadAnalytics() {
  const q = query(collection(db, "groups"), where("members", "array-contains", currentUser.email));
  const groupsSnap = await getDocs(q);

  let totalExpenses = 0;
  let totalAmount = 0;
  let totalGetBack = 0;
  const groupNames = [];
  const groupAmounts = [];
  const splitTypes = { equal: 0, percentage: 0, shares: 0 };
  const groupSummary = [];

  for (const groupDoc of groupsSnap.docs) {
    const group = groupDoc.data();
    const expSnap = await getDocs(collection(db, "groups", groupDoc.id, "expenses"));

    let groupTotal = 0;
    let groupGetBack = 0;

    expSnap.forEach(e => {
      const exp = e.data();
      totalExpenses++;
      totalAmount += exp.amount;
      groupTotal += exp.amount;
      splitTypes[exp.splitType] = (splitTypes[exp.splitType] || 0) + 1;

      const myShare = exp.splits?.[currentUser.email] || 0;
      if (exp.paidBy === currentUser.email) groupGetBack += (exp.amount - myShare);
      else groupGetBack -= myShare;
    });

    totalGetBack += groupGetBack;
    groupNames.push(group.name);
    groupAmounts.push(groupTotal);

    groupSummary.push({
      name: group.name,
      type: group.type,
      members: group.members.length,
      total: groupTotal,
      getBack: groupGetBack
    });
  }

  // Update stats
  document.getElementById("stat-groups").textContent = groupsSnap.size;
  document.getElementById("stat-expenses").textContent = totalExpenses;
  document.getElementById("stat-amount").textContent = `₹${totalAmount.toFixed(0)}`;
  document.getElementById("stat-settled").textContent = `₹${Math.abs(totalGetBack).toFixed(0)}`;

  // Spending Chart
  if (groupNames.length > 0) {
    new Chart(document.getElementById("spendingChart").getContext("2d"), {
      type: 'bar',
      data: {
        labels: groupNames,
        datasets: [{
          label: 'Total Spent (₹)',
          data: groupAmounts,
          backgroundColor: ['#00c896', '#3b82f6', '#a855f7', '#f59e0b', '#f43f5e'],
          borderRadius: 8,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8896b3', font: { family: 'DM Sans' } } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8896b3', font: { family: 'DM Sans' }, callback: v => `₹${v}` } }
        }
      }
    });

    // Split Type Chart
    new Chart(document.getElementById("splitChart").getContext("2d"), {
      type: 'doughnut',
      data: {
        labels: ['Equal Split', 'Percentage Split', 'Shares Split'],
        datasets: [{
          data: [splitTypes.equal || 0, splitTypes.percentage || 0, splitTypes.shares || 0],
          backgroundColor: ['#00c896', '#3b82f6', '#a855f7'],
          borderColor: '#111827',
          borderWidth: 3,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#8896b3', font: { family: 'DM Sans', size: 12 }, padding: 16, usePointStyle: true }
          }
        }
      }
    });
  }

  // Group Summary
  const container = document.getElementById("groups-summary");
  if (groupSummary.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="icon">👥</div><p>No groups yet!</p></div>`;
    return;
  }

  container.innerHTML = "";
  groupSummary.forEach(g => {
    const item = document.createElement("div");
    item.className = "group-stat-item";
    item.innerHTML = `
      <div class="gsi-left">
        <div class="gsi-icon">${g.type}</div>
        <div>
          <div class="gsi-name">${g.name}</div>
          <div class="gsi-members">${g.members} members</div>
        </div>
      </div>
      <div>
        <div class="gsi-amount">₹${g.total.toFixed(0)}</div>
        <div style="font-size:11px;color:${g.getBack >= 0 ? '#10d98a' : '#f43f5e'};font-weight:600;text-align:right;">
          ${g.getBack >= 0 ? '+' : ''}₹${Math.abs(g.getBack).toFixed(0)}
        </div>
      </div>
    `;
    container.appendChild(item);
  });
}