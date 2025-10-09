// src/views/dashboard.view.js
import { db, fx } from '../firebase.js';

function fmtDate(ts) {
  try {
    if (!ts) return '-';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString();
  } catch { return '-'; }
}

export default function DashboardView() {
  const el = document.createElement('section');
  el.className = 'dash';

  el.innerHTML = `
    <div class="dash-hero card">
      <h1>Dashboard</h1>
      <p class="muted">Busca el historial de un equipo por su número de serie.</p>

      <div class="dash-search">
        <input id="sn" placeholder="Ej. ABC001 o ABC123XYZ789" />
        <button id="btnFind" class="cta">Buscar</button>
      </div>

      <small class="muted tip">
        Consejo: ingresa el número de serie exacto para obtener resultados precisos.
      </small>
    </div>

    <div id="results" class="dash-results"></div>
  `;

  const input = el.querySelector('#sn');
  const btn   = el.querySelector('#btnFind');
  const box   = el.querySelector('#results');

  const renderEmpty = (msg = 'Sin resultados') => {
    box.innerHTML = `
      <div class="empty card">
        <div>🔎</div>
        <div>${msg}</div>
      </div>`;
  };

  renderEmpty('Ingresa un número de serie para iniciar la búsqueda.');

  async function handleSearch() {
    const sn = input.value.trim();
    if (!sn) {
      renderEmpty('Escribe un número de serie y presiona “Buscar”.');
      return;
    }

    box.innerHTML = '<div class="loading card">Buscando…</div>';

    try {
      // 1) Buscar equipos por número de serie
      const eqQ = fx.query(
        fx.collection(db, 'equipments'),
        fx.where('serial', '==', sn)
      );
      const eqSnap = await fx.getDocs(eqQ);

      if (eqSnap.empty) {
        renderEmpty('No se encontró ningún equipo con ese número de serie.');
        return;
      }

      // 2) Para cada equipo, cargar cliente y sus últimas órdenes
      const cards = [];
      for (const eqDoc of eqSnap.docs) {
        const eq = eqDoc.data() || {};
        let clientName = '-';

        if (eq.clientId) {
          const cSnap = await fx.getDoc(fx.doc(db, 'clients', eq.clientId));
          clientName = cSnap.exists() ? (cSnap.data().name || '-') : '-';
        }

        const ordQ = fx.query(
          fx.collection(db, 'orders'),
          fx.where('equipmentId', '==', eqDoc.id),
          fx.orderBy('createdAt', 'desc')
        );
        const ordSnap = await fx.getDocs(ordQ);

        const rows = [];
        ordSnap.docs.slice(0, 3).forEach(d => {
          const o = d.data() || {};
          rows.push(`
            <tr>
              <td>${o.folio || d.id}</td>
              <td>${o.status || '-'}</td>
              <td>${fmtDate(o.date || o.createdAt)}</td>
              <td><button class="mini" data-open="${d.id}">Abrir</button></td>
            </tr>
          `);
        });

        cards.push(`
          <div class="result-card card">
            <div class="result-head">
              <div>
                <div class="kicker">Equipo</div>
                <div class="title">
                  <strong>${eq.serial || '(Sin serie)'}</strong>
                </div>
                <div class="sub muted">
                  ${eq.brand || ''} ${eq.model || ''} • Cliente: ${clientName}
                </div>
              </div>
              <div class="badge">${ordSnap.size} ${ordSnap.size === 1 ? 'orden' : 'órdenes'}</div>
            </div>

            <div class="table-wrap">
              <table class="mini-table">
                <thead>
                  <tr><th>Folio</th><th>Estatus</th><th>Fecha</th><th></th></tr>
                </thead>
                <tbody>
                  ${
                    rows.length
                      ? rows.join('')
                      : `<tr><td colspan="4" class="muted" style="text-align:center;">Sin órdenes</td></tr>`
                  }
                </tbody>
              </table>
            </div>
          </div>
        `);
      }

      box.innerHTML = cards.join('');

      // Abrir OST
      box.querySelectorAll('[data-open]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-open');
          window.renderOrderDetail?.(id);
        });
      });
    } catch (err) {
      console.error('[DASH] error', err);
      renderEmpty('Ocurrió un error al buscar. Intenta de nuevo.');
    }
  }

  btn.addEventListener('click', handleSearch);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSearch();
  });

  return el;
}
