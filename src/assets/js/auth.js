import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Check if user is already logged in
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = "/assets/dashboard.html";
  }
});

// Show Register Form
document.getElementById("show-register-btn").addEventListener("click", () => {
  document.getElementById("login-section").style.display = "none";
  document.getElementById("register-section").style.display = "block";
});

// Show Login Form
document.getElementById("show-login-btn").addEventListener("click", () => {
  document.getElementById("register-section").style.display = "none";
  document.getElementById("login-section").style.display = "block";
});

// LOGIN
document.getElementById("login-btn").addEventListener("click", async () => {
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");

  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "/assets/dashboard.html";
  } catch (error) {
    errorEl.textContent = "Invalid email or password. Please try again!";
  }
});

// REGISTER
document.getElementById("register-btn").addEventListener("click", async () => {
  const name = document.getElementById("register-name").value;
  const email = document.getElementById("register-email").value;
  const password = document.getElementById("register-password").value;
  const errorEl = document.getElementById("register-error");

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Save user info to Firestore
    await setDoc(doc(db, "users", user.uid), {
      name: name,
      email: email,
      createdAt: new Date()
    });

    window.location.href = "/assets/dashboard.html";
  } catch (error) {
    if (error.code === "auth/email-already-in-use") {
      errorEl.textContent = "Email already exists! Try logging in.";
    } else if (error.code === "auth/weak-password") {
      errorEl.textContent = "Password must be at least 6 characters!";
    } else {
      errorEl.textContent = "Something went wrong. Please try again!";
    }
  }
});