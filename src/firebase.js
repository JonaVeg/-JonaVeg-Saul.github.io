// src/firebase.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import {
  getFirestore, serverTimestamp, collection, doc, addDoc, getDoc,
  getDocs, setDoc, updateDoc, query, where, orderBy, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';
import {
  getStorage, ref as sRef, uploadBytes, getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js';

// TODO: pon tus credenciales reales
// src/firebase.js (solo ejemplo — usa tus valores reales)
const firebaseConfig = {
  apiKey: "AIzaSyASCD2RYDE7gur9cC6LoqUmwmklfEasIqo",
  authDomain: "evrepars.firebaseapp.com",
  projectId: "evrepars",
  storageBucket: "evrepars.firebasestorage.app",
  messagingSenderId: "897023578787",
  appId: "1:897023578787:web:3252ec57f86bed8a362516"
};



const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const fx = {
  serverTimestamp, collection, doc, addDoc, getDoc, getDocs,
  setDoc, updateDoc, query, where, orderBy, Timestamp,
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
  sRef, uploadBytes, getDownloadURL
};
