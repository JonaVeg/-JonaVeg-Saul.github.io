// src/views/orders.view.js
import { db, fx } from '../firebase.js';

export default function OrdersView() {
  const section = document.createElement('section');
  section.innerHTML = `
    <h1>Órdenes</h1>
    <div id="list"></div>
  `;
  const list = section.querySelector('#list');

  (async () => {
    list.innerHTML = 'Cargando...';
    const snap = await fx.getDocs(
      fx.query(fx.collection(db, 'service_orders'), fx.orderBy('createdAt', 'desc'))
    );
    list.innerHTML = '';
    snap.forEach(d => {
      const o = d.data();
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div><strong>${o.folio}</strong> — ${o.status} <br>
          <small>${o.clientId} • ${o.equipmentId}</small>
        </div>
        <div><a href="#/orders" onclick="renderOrderDetail('${d.id}')">Abrir</a></div>
      `;
      list.appendChild(row);
    });
  })();

  return section;
}
