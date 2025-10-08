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

    <div id="equipos" class="card" style="display:none;"></div>

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
  const boxEq = el.querySelector('#equipos');
  const body  = el.querySelector('#tbody');

  async function buscar(e) {
    e?.preventDefault?.();
    msg.textContent = 'Buscando...';
    body.innerHTML  = `<tr><td colspan="4" style="text-align:center;">Buscando...</td></tr>`;
    boxEq.style.display = 'none';
    boxEq.innerHTML = '';

    const raw = input.value.trim();
    if (!raw) { msg.textContent = 'Ingresa un número de serie.'; return; }

    const serialUpper = raw.toUpperCase();

    try {
      // 1) Buscar por serialUpper
      let q = fx.query(fx.collection(db, 'equipments'), fx.where('serialUpper', '==', serialUpper));
      let snap = await fx.getDocs(q);

      // 2) Si no encuentra, intenta por serial exacto (back-compat)
      if (snap.empty) {
        console.warn('[HISTORY] No hay serialUpper; probando serial exacto');
        q = fx.query(fx.collection(db, 'equipments'), fx.where('serial', '==', raw));
        snap = await fx.getDocs(q);
      }

      if (snap.empty) {
        msg.textContent = 'No se encontró equipo con ese número de serie.';
        body.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#888;">Sin órdenes</td></tr>`;
        return;
      }

      // Si hay varios, listarlos
      const equipos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      boxEq.style.display = 'block';
      boxEq.innerHTML = `
        <strong>Equipo${equipos.length > 1 ? 's' : ''} encontrado${equipos.length > 1 ? 's' : ''}:</strong>
        <ul style="margin:.5rem 0 0 1rem;">
          ${equipos.map(eq => `
            <li>
              <button class="link" data-eq="${eq.id}">
                ${eq.serial} — ${eq.brand ?? ''} ${eq.model ?? ''} (clienteId: ${eq.clientId})
              </button>
            </li>`).join('')}
        </ul>
        <div class="muted">Haz clic en el equipo para cargar su historial.</div>
      `;

      // Cargar órdenes de un equipo concreto
      async function cargarOrdenes(equipmentId) {
        msg.textContent = 'Cargando órdenes...';
        body.innerHTML = `<tr><td colspan="4" style="text-align:center;">Cargando...</td></tr>`;

        const baseQ = fx.query(
          fx.collection(db, 'orders'),
          fx.where('equipmentId', '==', equipmentId)
        );

        const paint = (arr) => {
          const rows = arr.map(o => `
            <tr>
              <td>${o.folio || '-'}</td>
              <td>${o.status || '-'}</td>
              <td>${fmtDate(o.createdAt || o.date)}</td>
              <td><button data-open="${o.__id}">Abrir</button></td>
            </tr>
          `);
          body.innerHTML = rows.length ? rows.join('') :
            `<tr><td colspan="4" style="text-align:center;color:#888;">Sin órdenes</td></tr>`;
          body.querySelectorAll('[data-open]').forEach(b => {
            b.addEventListener('click', () => window.renderOrderDetail(b.getAttribute('data-open')));
          });
        };

        try {
          const q = fx.query(baseQ, fx.orderBy('createdAt', 'desc'));
          const s = await fx.getDocs(q);
          const arr = []; s.forEach(d => arr.push({ __id: d.id, ...d.data() }));
          paint(arr);
        } catch (err) {
          console.warn('[HISTORY] sin índice, fallback', err?.code);
          const s = await fx.getDocs(baseQ);
          const arr = []; s.forEach(d => arr.push({ __id: d.id, ...d.data() }));
          arr.sort((a,b) => {
            const as = a.createdAt?.seconds ?? (a.date?.seconds ?? 0);
            const bs = b.createdAt?.seconds ?? (b.date?.seconds ?? 0);
            return bs - as;
          });
          paint(arr);
        }

        msg.textContent = '';
      }

      // Si solo hay uno, cargar directo; si hay varios, espera click
      if (equipos.length === 1) {
        await cargarOrdenes(equipos[0].id);
      } else {
        boxEq.querySelectorAll('[data-eq]').forEach(btn => {
          btn.addEventListener('click', () => cargarOrdenes(btn.getAttribute('data-eq')));
        });
      }

      msg.textContent = '';
    } catch (err) {
      console.error('[HISTORY] error', err);
      msg.textContent = '✖ Error al buscar: ' + (err?.message || err);
      body.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#d00;">${err?.message || err}</td></tr>`;
    }
  }

  form.addEventListener('submit', buscar);
  return el;
}
