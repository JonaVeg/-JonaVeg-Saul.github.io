// src/views/equipment-history.view.js
import { db, fx } from '../firebase.js';

function fmtDate(any) {
  try {
    if (any?.toDate) return any.toDate().toLocaleDateString();
    if (any instanceof Date) return any.toLocaleDateString();
    if (typeof any === 'string') return new Date(any).toLocaleDateString();
  } catch {}
  return '-';
}

export default function EquipmentHistoryView() {
  const el = document.createElement('section');
  el.innerHTML = `
    <h1>Historial por Número de Serie</h1>
    <div class="card">
      <form id="f" class="grid">
        <input id="serial" placeholder="Ingresa número de serie (exacto)" required />
        <button>Buscar</button>
      </form>
      <div id="msg" class="muted"></div>
    </div>

    <div id="resultEquipo" class="card" style="display:none;"></div>

    <h3>Órdenes (OST) del equipo</h3>
    <table class="clients-table">
      <thead>
        <tr><th>Folio</th><th>Estatus</th><th>Fecha</th><th>Acciones</th></tr>
      </thead>
      <tbody id="tbody"><tr><td colspan="4" style="text-align:center;">Sin resultados</td></tr></tbody>
    </table>
  `;

  const form  = el.querySelector('#f');
  const input = el.querySelector('#serial');
  const msg   = el.querySelector('#msg');
  const card  = el.querySelector('#resultEquipo');
  const body  = el.querySelector('#tbody');

  async function buscar(e) {
    e?.preventDefault?.();
    msg.textContent = 'Buscando...';
    card.style.display = 'none';
    body.innerHTML = `<tr><td colspan="4" style="text-align:center;">Buscando...</td></tr>`;

    const serial = input.value.trim();
    if (!serial) { msg.textContent = 'Ingresa un número de serie.'; return; }

    try {
      // 1) Buscar equipo por serie
      const qEq = fx.query(
        fx.collection(db, 'equipments'),
        fx.where('serial', '==', serial)
      );
      const snapEq = await fx.getDocs(qEq);
      if (snapEq.empty) {
        msg.textContent = 'No se encontró equipo con ese número de serie.';
        body.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#888;">Sin órdenes</td></tr>`;
        return;
      }

      // Si hay varios con la misma serie, tomamos el primero (o podrías listarlos)
      const eqDoc = snapEq.docs[0];
      const eq = eqDoc.data();

      card.style.display = 'block';
      card.innerHTML = `
        <strong>Equipo</strong><br/>
        Serie: ${eq.serial}<br/>
        Marca/Modelo: ${eq.brand ?? ''} ${eq.model ?? ''}<br/>
        ClienteId: ${eq.clientId}
      `;

      // 2) Buscar órdenes del equipo
      const baseQ = fx.query(
        fx.collection(db, 'orders'),
        fx.where('equipmentId', '==', eqDoc.id)
      );

      async function paintFromSnap(snap, note='') {
        const rows = [];
        snap.forEach(d => {
          const o = d.data();
          rows.push(`
            <tr>
              <td>${o.folio || '-'}</td>
              <td>${o.status || '-'}</td>
              <td>${fmtDate(o.createdAt || o.date)}</td>
              <td><button data-open="${d.id}">Abrir</button></td>
            </tr>
          `);
        });
        body.innerHTML = rows.length ? rows.join('') :
          `<tr><td colspan="4" style="text-align:center;color:#888;">Sin órdenes</td></tr>`;
        body.querySelectorAll('[data-open]').forEach(b => {
          b.addEventListener('click', () => window.renderOrderDetail(b.getAttribute('data-open')));
        });
        console.log('[HISTORY] painted', rows.length, note);
      }

      try {
        // Camino rápido: ordenado por fecha
        const q = fx.query(baseQ, fx.orderBy('createdAt', 'desc'));
        const snap = await fx.getDocs(q);
        await paintFromSnap(snap, 'indexed');
      } catch (err) {
        console.warn('[HISTORY] no index, fallback', err?.code, err?.message);
        const snap = await fx.getDocs(baseQ);
        const arr = [];
        snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
        arr.sort((a,b) => {
          const as = a.createdAt?.seconds ?? (a.date?.seconds ?? 0);
          const bs = b.createdAt?.seconds ?? (b.date?.seconds ?? 0);
          return bs - as;
        });
        const fakeSnap = { forEach: (fn) => arr.forEach(x => fn({ id:x.id, data:()=>x })) };
        await paintFromSnap(fakeSnap, 'fallback');
      }

      msg.textContent = '';
    } catch (err) {
      console.error('[HISTORY] error', err);
      msg.textContent = '✖ Error al buscar: ' + (err?.message || err);
    }
  }

  form.addEventListener('submit', buscar);

  return el;
}
