import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC7_xevCU5oTe4jpcEi3MNMI9YPcS8n4SQ",
  authDomain: "fairsplit-be27a.firebaseapp.com",
  projectId: "fairsplit-be27a",
  storageBucket: "fairsplit-be27a.firebasestorage.app",
  messagingSenderId: "567291062993",
  appId: "1:567291062993:web:c7b9f2402f75914719b3f0"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);