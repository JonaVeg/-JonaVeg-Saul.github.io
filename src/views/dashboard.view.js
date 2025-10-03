// src/views/dashboard.view.js
import { db, fx } from '../firebase.js';

export default function DashboardView() {
  const el = document.createElement('section');
  el.innerHTML = `
    <h1>Dashboard</h1>
    <input id="sn" placeholder="Buscar por Núm. de Serie" />
    <button id="btnFind">Buscar</button>
    <div id="out"></div>
  `;
  const out = el.querySelector('#out');
  el.querySelector('#btnFind').onclick = async () => {
    const sn = el.querySelector('#sn').value.trim();
    if (!sn) return;
    out.innerHTML = 'Buscando...';
    const q = fx.query(fx.collection(db, 'equipments'), fx.where('serialNumber', '==', sn));
    const snap = await fx.getDocs(q);
    if (snap.empty) { out.textContent = 'No se encontró equipo.'; return; }
    out.innerHTML = '';
    for (const d of snap.docs) {
      const eq = d.data();
      const ordQ = fx.query(fx.collection(db, 'service_orders'), fx.where('equipmentId','==', d.id), fx.orderBy('createdAt','desc'));
      const ordSnap = await fx.getDocs(ordQ);
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `<strong>Equipo:</strong> ${eq.brand ?? ''} ${eq.model ?? ''} (${eq.serialNumber})<br>
        <strong>Historial:</strong> ${ordSnap.size} órdenes`;
      out.appendChild(div);
    }
  };
  return el;
}
