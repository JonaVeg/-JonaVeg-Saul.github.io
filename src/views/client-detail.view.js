// src/views/client-detail.view.js
import { db, fx } from '../firebase.js';

export function renderClientDetail(clientId) {
  console.log('[CLIENT DETAIL] open', clientId);
  const app = document.getElementById('app');
  const el = document.createElement('section');
  el.innerHTML = `
    <a href="#/clients">← Volver a clientes</a>
    <h2>Cliente</h2>
    <div id="boxClient" class="card">Cargando...</div>

    <h3>Equipos</h3>
    <details class="card">
      <summary>➕ Agregar equipo</summary>
      <form id="formEq" class="grid">
        <input name="serial" placeholder="Núm. de serie" required />
        <input name="brand"  placeholder="Marca" />
        <input name="model"  placeholder="Modelo" />
        <button>Guardar equipo</button>
      </form>
      <div id="eqMsg" class="muted"></div>
    </details>
    <table class="clients-table">
      <thead><tr><th>Serie</th><th>Marca/Modelo</th><th>Acciones</th></tr></thead>
      <tbody id="eqBody"><tr><td colspan="3" style="text-align:center;">Cargando...</td></tr></tbody>
    </table>

    <h3>Órdenes (OST)</h3>
    <button id="btnNewOrder" class="cta">➕ Nueva OST</button>
    <table class="clients-table" style="margin-top:.5rem;">
      <thead><tr><th>Folio</th><th>Estatus</th><th>Equipo</th><th>Fecha</th><th></th></tr></thead>
      <tbody id="ordBody"><tr><td colspan="5" style="text-align:center;">Cargando...</td></tr></tbody>
    </table>
  `;
  app.replaceChildren(el);

  const boxClient = el.querySelector('#boxClient');
  const eqBody = el.querySelector('#eqBody');
  const ordBody = el.querySelector('#ordBody');
  const formEq = el.querySelector('#formEq');
  const eqMsg = el.querySelector('#eqMsg');
  const btnNewOrder = el.querySelector('#btnNewOrder');

  // Cargar datos del cliente
  (async () => {
    const cSnap = await fx.getDoc(fx.doc(db, 'clients', clientId));
    const c = cSnap.data();
    boxClient.innerHTML = `
      <strong>${c?.name ?? '(Sin nombre)'}</strong><br/>
      ${c?.email ?? '-'} • ${c?.phone ?? '-'}<br/>
      <small>${c?.address ?? ''}</small>
    `;

    // Equipos
    async function loadEquipments() {
      eqBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Cargando...</td></tr>`;
      const q = fx.query(fx.collection(db, 'equipments'), fx.where('clientId', '==', clientId));
      const snap = await fx.getDocs(q);
      const rows = [];
      snap.forEach(d => {
        const e = d.data();
        rows.push(`
          <tr>
            <td>${e.serial}</td>
            <td>${e.brand ?? ''} ${e.model ?? ''}</td>
            <td><button data-new-ost="${d.id}" class="cta">Nueva OST</button></td>
          </tr>
        `);
      });
      eqBody.innerHTML = rows.length ? rows.join('') :
        `<tr><td colspan="3" style="text-align:center;color:#888;">Sin equipos</td></tr>`;

      // Botones "Nueva OST" desde cada equipo
      eqBody.querySelectorAll('[data-new-ost]').forEach(btn => {
        btn.addEventListener('click', () => {
          const equipmentId = btn.getAttribute('data-new-ost');
          window.renderOrderDetail(null, clientId, equipmentId);
        });
      });
    }

    // Órdenes del cliente
    async function loadOrders() {
      ordBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Cargando...</td></tr>`;
      const q = fx.query(
        fx.collection(db, 'orders'),
        fx.where('clientId', '==', clientId),
        fx.orderBy('createdAt', 'desc')
      );
      const snap = await fx.getDocs(q);
      const rows = [];
      snap.forEach(d => {
        const o = d.data();
        const dateStr = o.date?.toDate?.().toLocaleDateString?.() ?? '-';
        rows.push(`
          <tr>
            <td>${o.folio}</td>
            <td>${o.status}</td>
            <td>${o.equipmentId}</td>
            <td>${dateStr}</td>
            <td><button data-open="${d.id}">Abrir</button></td>
          </tr>
        `);
      });
      ordBody.innerHTML = rows.length ? rows.join('') :
        `<tr><td colspan="5" style="text-align:center;color:#888;">Sin órdenes</td></tr>`;

      // Abrir orden
      ordBody.querySelectorAll('[data-open]').forEach(b => {
        b.addEventListener('click', () => window.renderOrderDetail(b.getAttribute('data-open')));
      });
    }

    // Guardar equipo nuevo
    formEq.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(formEq);
      const payload = {
        clientId,
        serial: fd.get('serial')?.toString().trim(),
        brand: fd.get('brand')?.toString().trim() || '',
        model: fd.get('model')?.toString().trim() || '',
        createdAt: fx.serverTimestamp()
      };
      if (!payload.serial) return;
      eqMsg.textContent = 'Guardando...';
      try {
        await fx.addDoc(fx.collection(db, 'equipments'), payload);
        eqMsg.textContent = '✔ Equipo agregado';
        formEq.reset();
        await loadEquipments();
      } catch (err) {
        console.error('[EQUIPMENTS] create error', err);
        eqMsg.textContent = '✖ Error al guardar';
      }
    });

    // Botón Nueva OST general (sin elegir equipo todavía)
    btnNewOrder.addEventListener('click', () => {
      window.renderOrderDetail(null, clientId, null);
    });

    // Inicializar listas
    await Promise.all([loadEquipments(), loadOrders()]);
  })();
}
