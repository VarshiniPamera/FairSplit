import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, getDocs, query, where, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/assets/login.html"; return; }
  currentUser = user;

  // Load user info
  const userDoc = await getDoc(doc(db, "users", user.uid));
  const name = userDoc.exists() ? userDoc.data().name : user.email.split('@')[0];

  document.getElementById("profile-avatar").textContent = name.charAt(0).toUpperCase();
  document.getElementById("profile-name").textContent = name;
  document.getElementById("profile-email").textContent = user.email;
  document.getElementById("menu-email").textContent = user.email;

  // Load stats
  const q = query(collection(db, "groups"), where("members", "array-contains", user.email));
  const groupsSnap = await getDocs(q);
  let totalExpenses = 0;
  let totalAmount = 0;

  for (const groupDoc of groupsSnap.docs) {
    const expSnap = await getDocs(collection(db, "groups", groupDoc.id, "expenses"));
    totalExpenses += expSnap.size;
    expSnap.forEach(e => totalAmount += e.data().amount);
  }

  document.getElementById("p-groups").textContent = groupsSnap.size;
  document.getElementById("p-expenses").textContent = totalExpenses;
  document.getElementById("p-amount").textContent = `₹${totalAmount.toFixed(0)}`;
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "/assets/login.html";
});