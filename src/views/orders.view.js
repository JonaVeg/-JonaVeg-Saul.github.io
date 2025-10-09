import { db, fx } from '../firebase.js';
import { logAction } from '../logging.js';

function fmtDate(any) {
  try {
    if (any?.toDate) return any.toDate().toLocaleDateString();
    if (any instanceof Date) return any.toLocaleDateString();
    if (typeof any === 'string') return new Date(any).toLocaleDateString();
  } catch {}
  return '-';
}

const STATUSES = ['En revisión', 'Abierta', 'En proceso', 'Finalizada', 'Entregada'];

export default function OrdersView() {
  // ✅ añadimos clase general para estilos CSS modernos
  const el = document.createElement('section');
  el.className = 'orders-section';
  el.innerHTML = `
    <h1>Órdenes</h1>

    <div class="card" style="margin:.5rem 0;">
      <form id="filters" class="grid" style="grid-template-columns: repeat(6, minmax(0,1fr)); gap:.5rem;">
        <label>Estatus
          <select name="status">
            <option value="">Todos</option>
            ${STATUSES.map(s => `<option>${s}</option>`).join('')}
          </select>
        </label>
        <label>Desde
          <input type="date" name="from" />
        </label>
        <label>Hasta
          <input type="date" name="to" />
        </label>
        <label style="grid-column: span 2;">Buscar (folio / cliente / equipo)
          <input name="q" placeholder="Texto libre" />
        </label>
        <div style="display:flex;align-items:flex-end;gap:.5rem;">
          <button id="btnApply" type="submit">Aplicar</button>
          <button id="btnClear" type="button" class="muted">Limpiar</button>
          <button id="btnCsv" type="button" class="cta">Exportar CSV</button>
        </div>
      </form>
      <div id="msg" class="muted"></div>
    </div>

    <table class="clients-table">
      <thead>
        <tr>
          <th>Folio</th>
          <th>Estatus</th>
          <th>Cliente</th>
          <th>Equipo</th>
          <th>Fecha</th>
          <th style="width:170px;">Acciones</th>
        </tr>
      </thead>
      <tbody id="tbody">
        <tr><td colspan="6" style="text-align:center;">Cargando...</td></tr>
      </tbody>
    </table>
  `;

  const msg   = el.querySelector('#msg');
  const body  = el.querySelector('#tbody');
  const form  = el.querySelector('#filters');
  const btnClear = el.querySelector('#btnClear');
  const btnCsv   = el.querySelector('#btnCsv');

  // cache simple de clientes para mostrar nombre
  const clientsById = new Map();

  // almacenamos el último resultado para exportarlo
  let lastRendered = [];

  async function loadClientsMap() {
    try {
      const snap = await fx.getDocs(fx.collection(db, 'clients'));
      snap.forEach(d => {
        const c = d.data();
        clientsById.set(d.id, c?.name || d.id);
      });
    } catch (e) {
      console.warn('[ORDERS] no se pudo precargar clients', e);
    }
  }

  function normalize(s) {
    return (s || '').toString().trim().toLowerCase();
  }

  function passClientSideFilter(o, q) {
    if (!q) return true;
    const haystack = [
      o.folio,
      clientsById.get(o.clientId) || o.clientId,
      o.equipmentId
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  }

  function row(o) {
    const clientName = clientsById.get(o.clientId) || o.clientId || '-';
    const when = o.createdAt || o.date;
    const rid = o.__id;
    return `
      <tr data-id="${rid}">
        <td>${o.folio || '-'}</td>
        <td>
          <select class="status" data-id="${rid}">
            ${STATUSES.map(s => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
        <td>${clientName}</td>
        <td>${o.equipmentId || '-'}</td>
        <td>${fmtDate(when)}</td>
        <td>
          <button data-open="${rid}">Abrir</button>
        </td>
      </tr>
    `;
  }

  function render(list) {
    const q = normalize(form.q.value);
    const filtered = list.filter(o => passClientSideFilter(o, q));
    body.innerHTML = filtered.length
      ? filtered.map(row).join('')
      : `<tr><td colspan="6" style="text-align:center;color:#888;">Sin resultados</td></tr>`;

    // guardar en memoria para exportación
    lastRendered = filtered;

    // abrir detalle
    body.querySelectorAll('[data-open]').forEach(b => {
      b.addEventListener('click', () => window.renderOrderDetail(b.getAttribute('data-open')));
    });

    // cambiar estatus
    body.querySelectorAll('select.status').forEach(sel => {
      sel.addEventListener('change', async () => {
        const orderId = sel.getAttribute('data-id');
        const newStatus = sel.value;
        try {
          await fx.updateDoc(fx.doc(db, 'orders', orderId), {
            status: newStatus,
            updatedAt: fx.serverTimestamp()
          });
          await logAction('CHANGE_STATUS', 'order', orderId, { status: newStatus });
        } catch (err) {
          console.error('[ORDERS] change status error', err);
          alert('No se pudo cambiar el estatus');
        }
      });
    });
  }

  async function fetchOrders() {
    msg.textContent = 'Cargando...';
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;">Cargando...</td></tr>`;

    const status = form.status.value;
    const from = form.from.value ? new Date(form.from.value + 'T00:00:00') : null;
    const to   = form.to.value   ? new Date(form.to.value   + 'T23:59:59') : null;

    let base = fx.collection(db, 'orders');
    const wh = [];
    if (status) wh.push(fx.where('status', '==', status));

    let q = fx.query(base, ...wh);
    const withOrder = (...conds) => fx.query(base, ...wh, ...conds);

    async function tryIndexed() {
      const conds = [];
      if (from) conds.push(fx.where('createdAt', '>=', fx.Timestamp.fromDate(from)));
      if (to)   conds.push(fx.where('createdAt', '<=', fx.Timestamp.fromDate(to)));
      conds.push(fx.orderBy('createdAt', 'desc'));
      const iq = withOrder(...conds);
      const snap = await fx.getDocs(iq);
      console.log('[ORDERS] indexed query ok, count=', snap.size);
      const arr = [];
      snap.forEach(d => arr.push({ __id: d.id, ...d.data() }));
      return arr;
    }

    async function tryFallback() {
      const snap = await fx.getDocs(q);
      const arr = [];
      snap.forEach(d => arr.push({ __id: d.id, ...d.data() }));

      const fromSec = from ? from.getTime() / 1000 : null;
      const toSec   = to   ? to.getTime()   / 1000 : null;
      const inRange = (o) => {
        const ts = o.createdAt?.seconds ?? (o.date?.seconds ?? null);
        if (fromSec && ts !== null && ts < fromSec) return false;
        if (toSec   && ts !== null && ts > toSec)   return false;
        return true;
      };
      const filtered = arr.filter(inRange);
      filtered.sort((a,b) => {
        const as = a.createdAt?.seconds ?? (a.date?.seconds ?? 0);
        const bs = b.createdAt?.seconds ?? (b.date?.seconds ?? 0);
        return bs - as;
      });
      console.log('[ORDERS] fallback result count=', filtered.length);
      return filtered;
    }

    try {
      const data = await tryIndexed().catch(err => {
        console.warn('[ORDERS] indexed failed → fallback', err?.code, err?.message);
        return tryFallback();
      });
      render(data);
      msg.textContent = '';
    } catch (err) {
      console.error('[ORDERS] load error', err);
      msg.textContent = '✖ Error al cargar órdenes';
      body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#d00;">${err?.message || err}</td></tr>`;
    }
  }

  // Exportar CSV del conjunto filtrado
  btnCsv.addEventListener('click', () => {
    if (!lastRendered.length) {
      alert('No hay datos para exportar.');
      return;
    }
    const headers = ['Folio','Estatus','Cliente','Equipo','Fecha','OrderId'];
    const rows = lastRendered.map(o => ([
      o.folio || '',
      o.status || '',
      (clientsById.get(o.clientId) || o.clientId || ''),
      o.equipmentId || '',
      fmtDate(o.createdAt || o.date),
      o.__id
    ]));

    const escape = (s) => `"${String(s).replaceAll('"','""')}"`;
    const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ordenes_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // eventos UI
  form.addEventListener('submit', (e) => { e.preventDefault(); fetchOrders(); });
  btnClear.addEventListener('click', () => { form.reset(); fetchOrders(); });

  // bootstrap
  (async () => {
    await loadClientsMap();
    await fetchOrders();
  })();

  return el;
}
