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

// —— paginación (estado local)
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export default function OrdersView() {
  const el = document.createElement('section');
  el.className = 'orders-section';
  el.innerHTML = `
    <h1>Órdenes</h1>

    <div class="card" style="margin:.5rem 0; padding-bottom: 0.5rem;">
      <form id="filters">
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
        <div style="display:flex;align-items:flex-end;gap:.5rem; flex-wrap: wrap;">
          <button id="btnApply" type="submit">Aplicar</button>
          <button id="btnClear" type="button" class="muted">Limpiar</button>
          <button id="btnCsv" type="button" class="cta">Exportar CSV</button>
        </div>
      </form>
      <div id="msg" class="muted"></div>
    </div>

    <div class="table-wrap">
      <table class="clients-table">
        <thead>
          <tr>
            <th>Folio</th>
            <th>Estatus</th>
            <th>Cliente</th>
            <th>Equipo</th>
            <th>Fecha</th>
            <th style="width:220px;">Acciones</th>
          </tr>
        </thead>
        <tbody id="tbody">
          <tr><td colspan="6" style="text-align:center;">Cargando...</td></tr>
        </tbody>
      </table>
    </div>

    <div id="pager" class="card" style="display:flex;align-items:center;justify-content:space-between;margin-top:.5rem;gap:.75rem;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;">
        <button id="btnFirst" type="button">« Primera</button>
        <button id="btnPrev"  type="button">‹ Anterior</button>
        <button id="btnNext"  type="button">Siguiente ›</button>
        <button id="btnLast"  type="button">Última »</button>
      </div>
      <div id="pageInfo" class="muted"></div>
      <div>
        <label style="display:flex;align-items:center;gap:.4rem;justify-content:flex-end;">
          <span>Filas por página</span>
          <select id="pageSizeSel">
            ${PAGE_SIZE_OPTIONS.map(n => `<option value="${n}" ${n===20?'selected':''}>${n}</option>`).join('')}
          </select>
        </label>
      </div>
    </div>
  `;

  const msg       = el.querySelector('#msg');
  const body      = el.querySelector('#tbody');
  const form      = el.querySelector('#filters');
  const btnClear  = el.querySelector('#btnClear');
  const btnCsv    = el.querySelector('#btnCsv');

  // pager controls
  const btnFirst  = el.querySelector('#btnFirst');
  const btnPrev   = el.querySelector('#btnPrev');
  const btnNext   = el.querySelector('#btnNext');
  const btnLast   = el.querySelector('#btnLast');
  const pageInfo  = el.querySelector('#pageInfo');
  const pageSizeSel = el.querySelector('#pageSizeSel');

  // estado de paginación
  let page = 1;
  let pageSize = parseInt(pageSizeSel.value, 10) || 20;

  // cache simple
  const clientsById = new Map();

  // dataset completo (último fetch)
  let dataset = [];
  // conjunto filtrado completo (para exportar)
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

  const normalize = (s) => (s || '').toString().trim().toLowerCase();

  function passClientSideFilter(o, q) {
    if (!q) return true;
    const haystack = [
      o.folio || '',
      clientsById.get(o.clientId) || o.clientId || '',
      o.equipmentId || ''
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
        <td style="display:flex;gap:.4rem;flex-wrap:wrap;">
          <button data-open="${rid}">Abrir</button>
          <button data-del="${rid}" class="danger">Eliminar</button>
        </td>
      </tr>
    `;
  }

  // render con paginación local
  function render(list) {
    const q = normalize(form.q.value);
    const filtered = list.filter(o => passClientSideFilter(o, q));

    // guardamos todo el conjunto filtrado para CSV
    lastRendered = filtered;

    // calcular páginas
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;

    const start = (page - 1) * pageSize;
    const end   = start + pageSize;
    const slice = filtered.slice(start, end);

    body.innerHTML = slice.length
      ? slice.map(row).join('')
      : `<tr><td colspan="6" style="text-align:center;color:#888;">Sin resultados</td></tr>`;

    // info del pager
    const fromN = total ? (start + 1) : 0;
    const toN   = total ? Math.min(end, total) : 0;
    pageInfo.textContent = `Mostrando ${fromN}–${toN} de ${total} · Página ${page} de ${totalPages}`;

    // habilitar / deshabilitar botones
    btnFirst.disabled = page <= 1;
    btnPrev.disabled  = page <= 1;
    btnNext.disabled  = page >= totalPages;
    btnLast.disabled  = page >= totalPages;

    // eventos de acciones
    body.querySelectorAll('[data-open]').forEach(b => {
      b.addEventListener('click', () => window.renderOrderDetail(b.getAttribute('data-open')));
    });

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

    body.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del');
        const ok = confirm('¿Eliminar esta OST? Esta acción no se puede deshacer.');
        if (!ok) return;
        btn.disabled = true; btn.textContent = 'Eliminando…';
        try {
          await fx.deleteDoc(fx.doc(db, 'orders', id));
          await logAction('DELETE_OST', 'order', id, {});
          // quitar del dataset y re-render
          dataset = dataset.filter(o => o.__id !== id);
          render(dataset);
        } catch (e) {
          console.error('[ORDERS] delete error', e);
          alert('No se pudo eliminar la OST. Revisa consola.');
        } finally {
          btn.disabled = false; btn.textContent = 'Eliminar';
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

    const withOrder = (...conds) => fx.query(base, ...wh, ...conds);

    async function tryIndexed() {
      const conds = [];
      if (from) conds.push(fx.where('createdAt', '>=', fx.Timestamp.fromDate(from)));
      if (to)   conds.push(fx.where('createdAt', '<=', fx.Timestamp.fromDate(to)));
      conds.push(fx.orderBy('createdAt', 'desc'));
      const iq = withOrder(...conds);
      const snap = await fx.getDocs(iq);
      const arr = [];
      snap.forEach(d => arr.push({ __id: d.id, ...d.data() }));
      return arr;
    }

    async function tryFallback() {
      const q = fx.query(base, ...wh);
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
      return filtered;
    }

    try {
      dataset = await tryIndexed().catch(() => tryFallback());
      // siempre que cambian filtros, volvemos a página 1
      page = 1;
      render(dataset);
      msg.textContent = '';
    } catch (err) {
      console.error('[ORDERS] load error', err);
      msg.textContent = '✖ Error al cargar órdenes';
      body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#d00;">${err?.message || err}</td></tr>`;
    }
  }

  // Exportar CSV del conjunto filtrado (todas las páginas)
  btnCsv.addEventListener('click', () => {
    if (!lastRendered.length) return alert('No hay datos para exportar.');
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

  // UI eventos
  form.addEventListener('submit', (e) => { e.preventDefault(); fetchOrders(); });
  btnClear.addEventListener('click', () => { form.reset(); fetchOrders(); });

  // paginación controles
  btnFirst.addEventListener('click', () => { page = 1; render(dataset); });
  btnPrev .addEventListener('click', () => { page = Math.max(1, page - 1); render(dataset); });
  btnNext .addEventListener('click', () => {
    const total = (lastRendered || []).length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    page = Math.min(totalPages, page + 1);
    render(dataset);
  });
  btnLast .addEventListener('click', () => {
    const total = (lastRendered || []).length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    page = totalPages;
    render(dataset);
  });
  pageSizeSel.addEventListener('change', () => {
    pageSize = parseInt(pageSizeSel.value, 10) || 20;
    page = 1; // reinicia a la primera página al cambiar tamaño
    render(dataset);
  });

  // bootstrap
  (async () => {
    await loadClientsMap();
    await fetchOrders();
  })();

  return el;
}
