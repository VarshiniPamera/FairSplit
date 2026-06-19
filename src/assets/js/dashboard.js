import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  collection, addDoc, getDocs, query, where, doc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/assets/login.html"; return; }
  currentUser = user;

  // Set email immediately
  document.getElementById("user-email").textContent = user.email;

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      const name = userDoc.data().name;
      document.getElementById("user-name").textContent = name;
      document.getElementById("user-avatar").textContent = name.charAt(0).toUpperCase();
    } else {
      // Use email as fallback
      const emailName = user.email.split('@')[0];
      document.getElementById("user-name").textContent = emailName;
      document.getElementById("user-avatar").textContent = emailName.charAt(0).toUpperCase();
    }
  } catch(e) {
    document.getElementById("user-name").textContent = user.email.split('@')[0];
  }

  loadGroups();
});

// Open modal from all buttons
["create-group-btn", "create-group-btn2", "create-group-btn3"].forEach(id => {
  const el = document.getElementById(id);
  if(el) el.addEventListener("click", () => {
    document.getElementById("group-modal").classList.remove("hidden");
  });
});

document.getElementById("close-group-modal").addEventListener("click", () => {
  document.getElementById("group-modal").classList.add("hidden");
});

// Logout
document.getElementById("logout-btn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "/assets/login.html";
});

// Settle Up button
document.querySelector('.quick-action:nth-child(3)').addEventListener("click", () => {
  if(localStorage.getItem("currentGroupId")) {
    window.location.href = "/assets/settlement.html";
  } else {
    alert("Please open a group first to settle up!");
  }
});

// Create Group
document.getElementById("create-group-submit").addEventListener("click", async () => {
  const name = document.getElementById("group-name").value.trim();
  const type = document.getElementById("group-type").value;
  const membersInput = document.getElementById("group-members").value.trim();
  const errorEl = document.getElementById("group-error");

  if (!name) { errorEl.textContent = "Please enter a group name!"; return; }

  const members = [currentUser.email];
  if (membersInput) {
    membersInput.split(",").forEach(m => {
      const email = m.trim();
      if (email && email !== currentUser.email) members.push(email);
    });
  }

  try {
    await addDoc(collection(db, "groups"), {
      name, type, members,
      createdBy: currentUser.uid,
      createdAt: serverTimestamp()
    });
    document.getElementById("group-modal").classList.add("hidden");
    document.getElementById("group-name").value = "";
    document.getElementById("group-members").value = "";
    errorEl.textContent = "";
    loadGroups();
  } catch (err) {
    errorEl.textContent = "Error creating group. Try again!";
  }
});

const colors = ["color1", "color2", "color3", "color4", "color5"];

// Real-time groups listener
let groupsUnsubscribe = null;

async function loadGroups() {
  const groupsList = document.getElementById("groups-list");
  groupsList.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;

  if (groupsUnsubscribe) groupsUnsubscribe();

  const { onSnapshot, query, where, collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

  const q = query(
    collection(db, "groups"),
    where("members", "array-contains", currentUser.email)
  );

  groupsUnsubscribe = onSnapshot(q, async (snapshot) => {
    document.getElementById("total-groups").textContent = snapshot.size;

    if (snapshot.empty) {
      groupsList.innerHTML = `
        <div class="empty-state">
          <div class="es-icon">👥</div>
          <h3>No groups yet!</h3>
          <p>Create your first group and start splitting expenses.</p>
        </div>`;
      return;
    }

    groupsList.innerHTML = "";
    let totalOwed = 0, totalGet = 0;
    let colorIndex = 0;
    const colors = ["color1", "color2", "color3", "color4", "color5"];

    for (const docSnap of snapshot.docs) {
      const group = docSnap.data();
      const memberCount = group.members.length;
      const colorClass = colors[colorIndex % colors.length];
      colorIndex++;

      const expSnap = await getDocs(collection(db, "groups", docSnap.id, "expenses"));
      const expCount = expSnap.size;

      let groupOwed = 0, groupGet = 0;
      expSnap.forEach(e => {
        const exp = e.data();
        const myShare = exp.splits?.[currentUser.email] || 0;
        if (exp.paidBy === currentUser.email) groupGet += (exp.amount - myShare);
        else groupOwed += myShare;
      });

      totalOwed += groupOwed;
      totalGet += groupGet;

      const card = document.createElement("div");
      card.className = "group-card";
      card.innerHTML = `
        <div class="group-top">
          <div class="group-icon ${colorClass}">${group.type}</div>
          <div class="group-details">
            <div class="group-name">${group.name}</div>
            <div class="group-members">${memberCount} member${memberCount > 1 ? 's' : ''} · ${expCount} expense${expCount !== 1 ? 's' : ''}</div>
          </div>
          <div class="group-arrow">→</div>
        </div>
        <div class="group-bottom">
          <div class="group-stat">
            <div class="gs-value" style="color:#f43f5e;">₹${groupOwed.toFixed(0)}</div>
            <div class="gs-label">You Owe</div>
          </div>
          <div class="divider-dot">·</div>
          <div class="group-stat">
            <div class="gs-value" style="color:#10d98a;">₹${groupGet.toFixed(0)}</div>
            <div class="gs-label">You Get</div>
          </div>
          <div class="divider-dot">·</div>
          <div class="group-stat">
            <div class="gs-value" style="color:rgba(255,255,255,0.7);">${memberCount}</div>
            <div class="gs-label">Members</div>
          </div>
        </div>
      `;

      card.addEventListener("click", () => {
        localStorage.setItem("currentGroupId", docSnap.id);
        localStorage.setItem("currentGroupName", group.name);
        window.location.href = "/assets/group.html";
      });

      groupsList.appendChild(card);
    }

    // Update hero card
    document.getElementById("total-owed").textContent = `₹${totalOwed.toFixed(0)}`;
    document.getElementById("total-get").textContent = `₹${totalGet.toFixed(0)}`;
    const net = totalGet - totalOwed;
    document.getElementById("hero-amount").textContent = `₹${Math.abs(net).toFixed(0)}`;
    document.getElementById("hero-sub").textContent = net > 0
      ? `You'll receive ₹${net.toFixed(0)} overall 💰`
      : net < 0
      ? `You owe ₹${Math.abs(net).toFixed(0)} overall 📤`
      : `You're all settled up! 🎉`;
  });
}