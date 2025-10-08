// src/views/orders.view.js
import { db, fx } from '../firebase.js';

function fmtDate(any) {
  try {
    if (any?.toDate) return any.toDate().toLocaleDateString();
    if (any instanceof Date) return any.toLocaleDateString();
    if (typeof any === 'string') return new Date(any).toLocaleDateString();
  } catch {}
  return '-';
}

export default function OrdersView() {
  const el = document.createElement('section');
  el.innerHTML = `
    <h1>Órdenes</h1>
    <div id="msg" class="muted">Cargando...</div>
    <div class="card" style="margin:.5rem 0;">
      <div class="grid">
        <label>Estatus
          <select id="fStatus">
            <option value="">Todos</option>
            <option>En revisión</option>
            <option>Abierta</option>
            <option>En proceso</option>
            <option>Finalizada</option>
            <option>Entregada</option>
          </select>
        </label>
        <button id="btnReload">Recargar</button>
      </div>
    </div>
    <table class="clients-table">
      <thead>
        <tr>
          <th>Folio</th>
          <th>Estatus</th>
          <th>Cliente</th>
          <th>Equipo</th>
          <th>Fecha</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="tbody">
        <tr><td colspan="6" style="text-align:center;">Cargando...</td></tr>
      </tbody>
    </table>
  `;

  const msg   = el.querySelector('#msg');
  const body  = el.querySelector('#tbody');
  const fStat = el.querySelector('#fStatus');
  const btnR  = el.querySelector('#btnReload');

  async function paint(list) {
    const filter = fStat.value;
    const rows = list
      .filter(o => !filter || o.status === filter)
      .map(o => `
        <tr>
          <td>${o.folio || '-'}</td>
          <td>${o.status || '-'}</td>
          <td>${o.clientId || '-'}</td>
          <td>${o.equipmentId || '-'}</td>
          <td>${fmtDate(o.createdAt || o.date)}</td>
          <td><button data-open="${o.__id}">Abrir</button></td>
        </tr>
      `);
    body.innerHTML = rows.length ? rows.join('') :
      `<tr><td colspan="6" style="text-align:center;color:#888;">Sin órdenes</td></tr>`;
    body.querySelectorAll('[data-open]').forEach(b => {
      b.addEventListener('click', () => window.renderOrderDetail(b.getAttribute('data-open')));
    });
  }

  async function load() {
    msg.textContent = 'Cargando...';
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;">Cargando...</td></tr>`;

    const col = fx.collection(db, 'orders');

    try {
      // Camino “bonito”: ordena en servidor
      const q = fx.query(col, fx.orderBy('createdAt', 'desc'));
      const snap = await fx.getDocs(q);
      console.log('[ORDERS] indexed query ok, count=', snap.size);
      const arr = [];
      snap.forEach(d => arr.push({ __id: d.id, ...d.data() }));
      await paint(arr);
      msg.textContent = '';
    } catch (err) {
      console.warn('[ORDERS] indexed query failed → fallback', err?.code, err?.message);

      // Si es permisos, lo decimos claro y salimos
      if (err?.code === 'permission-denied') {
        msg.innerHTML = '✖ Sin permisos para leer <code>orders</code>. Revisa tus Reglas de Firestore.';
        body.innerHTML = `<tr><td colspan="6" style="color:#d00;">Missing or insufficient permissions</td></tr>`;
        return;
      }

      try {
        // Fallback: sin orderBy, ordenamos en memoria
        const snap = await fx.getDocs(col);
        const arr  = [];
        snap.forEach(d => arr.push({ __id: d.id, ...d.data() }));
        arr.sort((a,b) => {
          const as = a.createdAt?.seconds ?? (a.date?.seconds ?? 0);
          const bs = b.createdAt?.seconds ?? (b.date?.seconds ?? 0);
          return bs - as;
        });
        console.log('[ORDERS] fallback ok, count=', arr.length);
        await paint(arr);
        msg.textContent = '';
      } catch (err2) {
        console.error('[ORDERS] fallback failed', err2);
        msg.textContent = '✖ Error al cargar órdenes';
        body.innerHTML = `<tr><td colspan="6" style="color:#d00;">${err2?.message || err2}</td></tr>`;
      }
    }
  }

  btnR.addEventListener('click', load);
  fStat.addEventListener('change', load);

  // Primera carga
  load();

  return el;
}
