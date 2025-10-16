// src/firebase.js
// Importa desde CDN (sin bundler)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';

// Auth
import {
  getAuth, onAuthStateChanged,
  signInWithEmailAndPassword, signOut,
  sendEmailVerification
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';

// Firestore
import {
  getFirestore, collection, doc, addDoc, getDoc, getDocs, updateDoc, setDoc,
  serverTimestamp, query, where, orderBy, limit, writeBatch, deleteDoc, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';

// Realtime Database (RTDB)
import {
  getDatabase, ref as rRef, push as rPush, set as rSet,
  get as rGet, child, onValue
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js';

// ---------- TU CONFIG ----------
const firebaseConfig = {
  apiKey: "AIzaSyASCD2RYDE7gur9cC6LoqUmwmklfEasIqo",
  authDomain: "evrepars.firebaseapp.com",
  projectId: "evrepars",
  storageBucket: "evrepars.firebasestorage.app",
  messagingSenderId: "897023578787",
  appId: "1:897023578787:web:3252ec57f86bed8a362516"
};

// ⚠️ Inicializa primero y luego usa `app`
export const app = initializeApp(firebaseConfig);

// Servicios
export const auth  = getAuth(app);
export const db    = getFirestore(app);
export const rtdb  = getDatabase(app);

// Helpers estilo “SDK re-export”
export const fx = {
  // firestore
  collection, doc, addDoc, getDoc, getDocs, updateDoc, setDoc,
  serverTimestamp, query, where, orderBy, limit,
  writeBatch, deleteDoc, Timestamp,
  // auth
  onAuthStateChanged, signInWithEmailAndPassword, signOut, sendEmailVerification
};

export const rfx = {
  rRef, rPush, rSet, rGet, child, onValue
};

// console.log('[FIREBASE] listo', app.options?.projectId);
