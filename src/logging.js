// src/logging.js
import { auth, db, fx } from './firebase.js';

export async function logAction(action, target, meta = {}) {
  const userId = auth.currentUser?.uid || 'anon';
  await fx.addDoc(fx.collection(db, 'activity_logs'), {
    userId, action, target, meta,
    timestamp: fx.serverTimestamp()
  });
}
