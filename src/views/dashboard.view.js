// src/views/dashboard.view.js
import { db, fx } from '../firebase.js';

export default function DashboardView() {
  const el = document.createElement('section');
  el.innerHTML = `
    <h1>Dashboard</h1>
    <div class="card">
      <h3>Buscar historial por Núm. de Serie</h3>
      <input id="sn" placeholder="Ej. ABC001" />
      <button id="btnFind" class="cta">Buscar</button>
      <div id="out" style="margin-top:.75rem;"></div>
    </div>
  `;
  const out = el.querySelector('#out');

  el.querySelector('#btnFind').onclick = async () => {
    const sn = el.querySelector('#sn').value.trim();
    if (!sn) return;
    out.textContent = 'Buscando...';
    try {
      const eqQ = fx.query(fx.collection(db, 'equipments'), fx.where('serial','==', sn));
      const eqSnap = await fx.getDocs(eqQ);
      if (eqSnap.empty) { out.textContent = 'No se encontró equipo.'; return; }
      const items = [];
      for (const eqDoc of eqSnap.docs) {
        const eq = eqDoc.data();
        const ordQ = fx.query(fx.collection(db, 'orders'),
          fx.where('equipmentId', '==', eqDoc.id), fx.orderBy('createdAt','desc'));
        const ordSnap = await fx.getDocs(ordQ);
        items.push({ eqId: eqDoc.id, eq, ordCount: ordSnap.size });
      }
      out.innerHTML = items.map(it => `
        <div class="card">
          <strong>Serie:</strong> ${it.eq.serial} — ${it.eq.brand ?? ''} ${it.eq.model ?? ''}<br/>
          <strong>Historial:</strong> ${it.ordCount} órdenes
        </div>
      `).join('');
    } catch (e) {
      console.error('[DASH] error', e);
      out.textContent = 'Error al buscar';
    }
  };
  return el;
}
