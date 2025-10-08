// src/logging.js
import { auth, db, fx } from './firebase.js';

export async function logAction(action, targetType, targetId, meta = {}) {
  const userEmail = auth.currentUser?.email || 'anon';
  await fx.addDoc(fx.collection(db, 'users_log'), {
    userEmail, action, targetType, targetId, meta, timestamp: fx.serverTimestamp()
  });
}
