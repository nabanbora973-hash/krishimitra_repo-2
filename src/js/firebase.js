// Firebase init + auth helpers (v10 modular CDN, matches the deck's stack).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
         onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, serverTimestamp }
         from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

export const signup = (e, p) => createUserWithEmailAndPassword(auth, e, p);
export const login  = (e, p) => signInWithEmailAndPassword(auth, e, p);
export const logout = ()    => signOut(auth);

export { onAuthStateChanged, doc, getDoc, setDoc, addDoc, collection, serverTimestamp };
