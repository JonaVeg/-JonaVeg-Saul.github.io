// src/views/dashboard.view.js
import { auth, db, fx } from '../firebase.js';

const C = { ORDERS:'orders', MESSAGES:'messages', NOTIFS:'notifications' };

/** ========= SWITCHES =========
 * Pon USE_DATE_FILTERS = false mientras NO tengas índices compuestos.
 * Cuando ya los crees, cambia a true y, si quieres, también a true APPLY_DATE_ON_STATUS.
 */
const USE_DATE_FILTERS = false;     // ← temporal para que no pida índices
const APPLY_DATE_ON_STATUS = false; // ← evita índice en conteos por status+fecha
const KPI_DAYS = 30;

/* ---------- Helpers generales ---------- */
function toMillis(ts){ if(typeof ts==='number') return ts; if(ts?.seconds) return ts.seconds*1000; return Date.now(); }
function isIndexError(err){ const m=String(err?.message||'').toLowerCase(); return err?.code==='failed-precondition'||m.includes('requires an index')||m.includes('failed_precondition'); }
function indexHelpMessage(){ return 'Falta crear un índice compuesto en Firestore (ver enlace en la consola).'; }
function permHelpMessage(){ return 'Sin permisos (revisa reglas de Firestore).'; }

/** Filtro de fecha (para createdAt >= cutoff). */
function createdAtFilter(days){
  if(!USE_DATE_FILTERS) return [];
  const cutoffMs = Date.now() - days*24*60*60*1000;
  // Si createdAt es NUMBER (ms), cambia la línea de abajo por "cutoffMs"
  const cutoff = fx.Timestamp.fromMillis(cutoffMs);
  return [ fx.where('createdAt','>=', cutoff) ];
}

/* ---------- Mapeo EXACTO de tus estatus en BD (para consultas) ---------- */
const STATUS_DB = {
  NUEVA:    ['Abierta'],
  PROGRESO: ['En revisión', 'En proceso'],
  HECHA:    ['Finalizada', 'Entregada']
};

/* ---------- Mapeo normalizado (solo para UI/badges) ---------- */
const STATUS_GROUPS = {
  NUEVA:    ['abierta','abierto'],
  PROGRESO: ['en revision','en revisión','en proceso','en progreso'],
  HECHA:    ['finalizada','finalizado','entregada','entregado','cerrada','cerrado']
};
function norm(str=''){
  return String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
}
function groupOf(status=''){
  const s = norm(status);
  if (STATUS_GROUPS.NUEVA.some(v => norm(v) === s))    return 'NUEVA';
  if (STATUS_GROUPS.PROGRESO.some(v => norm(v) === s)) return 'PROGRESO';
  if (STATUS_GROUPS.HECHA.some(v => norm(v) === s))    return 'HECHA';
  return 'OTRO';
}

/** Suma conteos con literales EXACTOS en BD (usa == o in). */
async function countForStatuses(colRef, statuses, dateFilter = []) {
  if (!statuses || statuses.length === 0) return 0;

  // Un solo valor → ==
  if (statuses.length === 1) {
    const snap = await fx.getCountFromServer(
      fx.query(colRef, fx.where('status','==', statuses[0]), ...dateFilter)
    );
    return snap.data().count || 0;
  }

  // Varios valores → IN (máx 10)
  const snap = await fx.getCountFromServer(
    fx.query(colRef, fx.where('status','in', statuses), ...dateFilter)
  );
  return snap.data().count || 0;
}

export default function DashboardView(){
  const $el = document.createElement('section');
  $el.className = 'dash';

  $el.innerHTML = `
    <style>
      .dash-hero{display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;}
      .dash-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem;}
      @media(max-width:960px){.dash-grid{grid-template-columns:1fr;}}
    </style>

    <div class="dash-hero">
      <h1>Panel Principal</h1>
      <button id="btnRefresh" class="cta">Actualizar</button>
    </div>

    <!-- KPIs -->
    <section class="kpi-cards">
      <article class="kpi-card">
        <div class="kpi-icon">📈</div>
        <div class="kpi-body">
          <h3>Total de órdenes (${USE_DATE_FILTERS?`${KPI_DAYS} días`:'histórico'})</h3>
          <p class="kpi-num" id="kpiTotal">—</p>
          <small id="kpiTotalSub" class="muted">Cargando...</small>
        </div>
      </article>
      <article class="kpi-card">
        <div class="kpi-icon">✅</div>
        <div class="kpi-body">
          <h3>Completadas</h3>
          <p class="kpi-num" id="kpiDone">—</p>
          <small id="kpiDoneSub" class="muted">Cargando...</small>
        </div>
      </article>
      <article class="kpi-card">
        <div class="kpi-icon">🕒</div>
        <div class="kpi-body">
          <h3>Pendientes</h3>
          <p class="kpi-num" id="kpiPending">—</p>
          <small id="kpiPendingSub" class="muted">Cargando...</small>
        </div>
      </article>
      <article class="kpi-card">
        <div class="kpi-icon">💬</div>
        <div class="kpi-body">
          <h3>Mensajes nuevos</h3>
          <p class="kpi-num" id="kpiMsgs">—</p>
          <small id="kpiMsgsSub" class="muted">Cargando...</small>
        </div>
      </article>
    </section>

    <!-- Resumen por estatus -->
    <section class="card panel-status">
      <div class="result-head">
        <div>
          <div class="kicker">Resumen</div>
          <div class="title">Órdenes por estatus (histórico)</div>
          <div class="sub muted">Conteo rápido</div>
        </div>
      </div>
      <ul class="status-summary" id="statusSummary">
        <li><span class="dot dot-new"></span> Nuevas <strong id="stNew">—</strong></li>
        <li><span class="dot dot-wip"></span> En progreso <strong id="stWip">—</strong></li>
        <li><span class="dot dot-done"></span> Completadas <strong id="stDone">—</strong></li>
      </ul>
    </section>

    <!-- Tendencia 14 días -->
    <section class="card panel-trend">
      <div class="result-head">
        <div>
          <div class="kicker">Tendencia</div>
          <div class="title">Órdenes creadas — últimas 2 semanas</div>
          <div class="sub muted" id="trendSubtitle">Cargando…</div>
        </div>
      </div>
      <div class="trend-wrap">
        <svg id="trendSvg" viewBox="0 0 600 120" preserveAspectRatio="none" class="trend-svg"></svg>
        <div class="trend-legend" id="trendLegend"></div>
      </div>
    </section>

    <!-- Resultados -->
    <section class="dash-grid">
      <!-- Actividad Reciente -->
      <article class="card result-card">
        <div class="result-head">
          <div>
            <div class="kicker">Actividad</div>
            <div class="title">Últimos movimientos</div>
            <div class="sub muted">Órdenes recientes</div>
          </div>
          <span class="badge">Reciente</span>
        </div>
        <div class="table-wrap">
          <table class="mini-table">
            <thead>
              <tr><th>Folio</th><th>Cliente</th><th>Estatus</th><th>Fecha</th></tr>
            </thead>
            <tbody id="tbodyActivity">
              <tr><td colspan="4" class="muted">Cargando…</td></tr>
            </tbody>
          </table>
        </div>
      </article>

      <!-- Notificaciones (si las usas) -->
      <article class="card result-card">
        <div class="result-head">
          <div>
            <div class="kicker">Notificaciones</div>
            <div class="title">Para ti</div>
            <div class="sub muted">Últimas 10</div>
          </div>
          <button id="btnMarkAll" class="mini">Marcar todo leído</button>
        </div>
        <ul class="list" id="listNotifs" style="margin-top:.5rem"></ul>
      </article>
    </section>

    <!-- Vencidas -->
    <section class="card panel-overdue" id="overduePanel" style="display:none">
      <div class="result-head">
        <div>
          <div class="kicker">Atención</div>
          <div class="title">Órdenes vencidas</div>
          <div class="sub muted">promisedAt &lt; ahora y status != done</div>
        </div>
      </div>
      <ul class="list" id="overdueList"></ul>
    </section>
  `;

  $el.querySelector('#btnRefresh')?.addEventListener('click',()=>refreshAll($el));
  $el.querySelector('#btnMarkAll')?.addEventListener('click',()=>markAllAsRead($el));
  refreshAll($el);
  return $el;
}

/* ====== Data loaders ====== */
async function refreshAll(root){
  const user = auth.currentUser; if(!user) return;
  await Promise.all([
    loadKPIs(root,user),
    loadActivity(root),
    loadNotifs(root,user),
    loadStatusSummary(root), // nuevo
    loadTrend14d(root),      // nuevo
    loadOverdue(root)        // nuevo (solo si hay promisedAt)
  ]);
}

/* KPIs usando TUS etiquetas exactas en BD */
async function loadKPIs(root,user){
  try{
    const ordersCol = fx.collection(db, C.ORDERS);
    const dateFilter = createdAtFilter(KPI_DAYS); // [] si USE_DATE_FILTERS=false

    // Total (con o sin fecha)
    const totalSnap = await fx.getCountFromServer(fx.query(ordersCol, ...dateFilter));
    const total = totalSnap.data().count || 0;

    // Completadas = Finalizada + Entregada
    const done = await countForStatuses(
      ordersCol,
      STATUS_DB.HECHA,
      APPLY_DATE_ON_STATUS ? dateFilter : []
    );

    // Pendientes = Abierta + (En revisión/En proceso)
    const pending = await countForStatuses(
      ordersCol,
      [...STATUS_DB.NUEVA, ...STATUS_DB.PROGRESO],
      APPLY_DATE_ON_STATUS ? dateFilter : []
    );

    root.querySelector('#kpiTotal').textContent   = total;
    root.querySelector('#kpiDone').textContent    = done;
    root.querySelector('#kpiPending').textContent = pending;

    root.querySelector('#kpiTotalSub').textContent = USE_DATE_FILTERS
      ? `Últimos ${KPI_DAYS} días`
      : 'Total histórico';

    root.querySelector('#kpiDoneSub').textContent =
      total ? `Tasa: ${Math.round((done/Math.max(total,1))*100)}%` : 'Sin datos';

    root.querySelector('#kpiPendingSub').textContent =
      pending ? 'Atención requerida' : 'Todo al día';

    // Mensajes no leídos
    const qUnread = fx.query(
      fx.collection(db,C.MESSAGES),
      fx.where('toUid','==',user.uid),
      fx.where('read','==',false)
    );
    const unreadAgg = await fx.getCountFromServer(qUnread);
    const unread = unreadAgg.data().count||0;
    root.querySelector('#kpiMsgs').textContent = unread;
    root.querySelector('#kpiMsgsSub').textContent = unread?'Tienes mensajes':'Sin nuevos mensajes';
  }catch(err){
    console.error('[DASH] loadKPIs error:', err);
    const msg = isIndexError(err)? indexHelpMessage()
              : (err?.code==='permission-denied'? permHelpMessage() : 'Error al cargar');
    ['#kpiTotalSub','#kpiDoneSub','#kpiPendingSub','#kpiMsgsSub'].forEach(sel=>{
      const el = document.querySelector(sel); if(el) el.textContent = msg;
    });
  }
}

async function loadActivity(root){
  const tbody = root.querySelector('#tbodyActivity');
  tbody.innerHTML = `<tr><td colspan="4" class="muted">Cargando…</td></tr>`;
  try{
    const q = fx.query(
      fx.collection(db,C.ORDERS),
      fx.orderBy('createdAt','desc'),
      fx.limit(10)
    );
    const snap = await fx.getDocs(q);
    if(snap.empty){
      tbody.innerHTML = `<tr><td colspan="4" class="muted">Sin actividad reciente.</td></tr>`;
      return;
    }
    const rows=[]; snap.forEach(d=>{
      const data=d.data(); const ms=toMillis(data?.createdAt);
      rows.push(`<tr class="row-click" title="Abrir orden" data-id="${d.id}">
        <td>${escapeHtml(data?.folio||d.id.slice(0,6))}</td>
        <td>${escapeHtml(data?.clientNameSnapshot||'N/A')}</td>
        <td>${badgeStatus(data?.status)}</td>
        <td>${new Date(ms).toLocaleDateString()}</td>
      </tr>`);
    });
    tbody.innerHTML = rows.join('');
  }catch(err){
    console.error('[DASH] loadActivity error:', err);
    const msg = isIndexError(err)? indexHelpMessage()
              : (err?.code==='permission-denied'? permHelpMessage() : 'Error al cargar actividad.');
    tbody.innerHTML = `<tr><td colspan="4" class="muted">${msg}</td></tr>`;
  } finally {
    // Evento para abrir detalle de orden
    tbody.querySelectorAll('tr[data-id]').forEach(row => {
      row.addEventListener('click', () => window.renderOrderDetail(row.dataset.id));
    });
  }
}

async function loadNotifs(root,user){
  const ul = root.querySelector('#listNotifs'); ul.innerHTML = `<li class="muted">Cargando…</li>`;
  try{
    const q = fx.query(
      fx.collection(db,C.NOTIFS),
      fx.where('uid','==',user.uid),
      fx.orderBy('createdAt','desc'),
      fx.limit(10)
    );
    const snap = await fx.getDocs(q);
    if(snap.empty){ ul.innerHTML = `<li class="muted">No tienes notificaciones.</li>`; return; }
    const items=[]; snap.forEach(d=>{
      const n=d.data(); const ms=toMillis(n?.createdAt);
      items.push(`<li class="row" data-id="${d.id}">
        <div><strong>${escapeHtml(n?.title||'Notificación')}</strong>
        <div class="muted">${new Date(ms).toLocaleString()} — ${n?.read?'Leída':'No leída'}</div></div>
        <button class="mini" data-mark="1" ${n?.read?'disabled':''}>${n?.read?'Leída':'Marcar leído'}</button></li>`);
    });
    ul.innerHTML = items.join('');
    ul.querySelectorAll('button[data-mark]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const li = btn.closest('li'); const id = li.getAttribute('data-id');
        await fx.updateDoc(fx.doc(db,C.NOTIFS,id), {read:true});
        await loadNotifs(root,user); await loadKPIs(root,user);
      });
    });
  }catch(err){
    console.error('[DASH] loadNotifs error:', err);
    const msg = isIndexError(err)? indexHelpMessage()
              : (err?.code==='permission-denied'? permHelpMessage() : 'Error al cargar notificaciones.');
    ul.innerHTML = `<li class="muted">• ${msg}</li>`;
  }
}

/* ====== NUEVOS BLOQUES ====== */

// 1) Resumen por estatus (histórico) usando valores exactos
async function loadStatusSummary(root){
  try{
    const col = fx.collection(db, C.ORDERS);
    const [countNew, countWip, countDone] = await Promise.all([
      countForStatuses(col, STATUS_DB.NUEVA),
      countForStatuses(col, STATUS_DB.PROGRESO),
      countForStatuses(col, STATUS_DB.HECHA)
    ]);

    root.querySelector('#stNew').textContent  = countNew || 0;
    root.querySelector('#stWip').textContent  = countWip || 0;
    root.querySelector('#stDone').textContent = countDone || 0;
  }catch(err){
    console.error('[DASH] loadStatusSummary error:', err);
    ['#stNew','#stWip','#stDone'].forEach(sel=>{
      const el = root.querySelector(sel); if(el) el.textContent = '—';
    });
  }
}

// 2) Tendencia 14 días (where+orderBy mismo campo → sin índice compuesto)
async function loadTrend14d(root){
  try{
    const days = 14;
    const sinceMs = Date.now() - days*24*60*60*1000;
    // Si createdAt es NUMBER, cambia a "sinceMs"
    const sinceTs = fx.Timestamp.fromMillis(sinceMs);

    const q = fx.query(
      fx.collection(db, C.ORDERS),
      fx.where('createdAt','>=', sinceTs),
      fx.orderBy('createdAt','asc')
    );
    const snap = await fx.getDocs(q);

    // Agregación por día
    const byDay = new Map();
    for(let i=0;i<days;i++){
      const d = new Date(sinceMs + i*86400000);
      byDay.set(d.toISOString().slice(0,10), 0);
    }
    snap.forEach(docSnap=>{
      const ms = toMillis(docSnap.data()?.createdAt);
      const key = new Date(ms).toISOString().slice(0,10);
      if(byDay.has(key)) byDay.set(key, byDay.get(key)+1);
    });

    const labels = [...byDay.keys()];
    const values = [...byDay.values()];
    root.querySelector('#trendSubtitle').textContent =
      `${values.reduce((a,b)=>a+b,0)} órdenes en ${days} días`;

    renderSparkline('#trendSvg', values);
    renderLegend('#trendLegend', labels, values);
  }catch(err){
    console.error('[DASH] loadTrend14d error:', err);
    root.querySelector('#trendSubtitle').textContent = 'No se pudo cargar la tendencia';
  }
}

function renderSparkline(svgSel, values){
  const svg = document.querySelector(svgSel);
  if(!svg) return;
  const W=600, H=120, pad=10;
  const n = values.length || 1;
  const max = Math.max(1, ...values);
  const step = (W - pad*2) / Math.max(1, n-1);

  const pts = values.map((v,i)=>{
    const x = pad + i*step;
    const y = H - pad - (v/max)*(H - pad*2);
    return [x,y];
  });

  const d = pts.map((p,i)=> (i?'L':'M') + p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  svg.innerHTML = `
    <path d="${d}" fill="none" stroke="currentColor" stroke-width="2"></path>
    <line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}" stroke="#e5e7eb"></line>
    <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H-pad}" stroke="#e5e7eb"></line>
  `;
  svg.style.color = '#2563eb';
}

function renderLegend(containerSel, labels, values){
  const el = document.querySelector(containerSel);
  if(!el) return;
  const last = values.at(-1) ?? 0;
  const max = Math.max(...values,0);
  el.innerHTML = `<div class="muted">Último día: <strong>${last}</strong> · Pico: <strong>${max}</strong></div>`;
}

// 3) Vencidas (si existe promisedAt; usa '!=' o IN según tus reglas)
async function loadOverdue(root){
  try{
    const now = Date.now();
    // Si promisedAt es NUMBER, cambia fromMillis(now) → now
    const q = fx.query(
      fx.collection(db, C.ORDERS),
      fx.where('status','!=','Finalizada'), // si tus reglas no permiten '!=', usa IN con pendientes
      fx.where('promisedAt','<', fx.Timestamp.fromMillis(now)),
      fx.limit(10)
    );
    const snap = await fx.getDocs(q);
    if(snap.empty){ root.querySelector('#overduePanel').style.display='none'; return; }

    const ul = root.querySelector('#overdueList');
    const items = [];
    snap.forEach(s=>{
      const d = s.data();
      const when = new Date(toMillis(d?.promisedAt)).toLocaleDateString();
      items.push(`<li class="row">
        <div><strong>${escapeHtml(d?.title || s.id)}</strong>
        <div class="muted">Compromiso: ${when}</div></div>
        <span class="badge" title="Estatus">${escapeHtml(d?.status || '—')}</span></li>`);
    });
    ul.innerHTML = items.join('');
    root.querySelector('#overduePanel').style.display='';
  }catch(err){
    // Alternativa si '!=' falla por reglas:
    // const q = fx.query(
    //   fx.collection(db, C.ORDERS),
    //   fx.where('status','in',['Abierta','En revisión','En proceso']),
    //   fx.where('promisedAt','<', fx.Timestamp.fromMillis(now)),
    //   fx.limit(10)
    // );
    console.warn('[DASH] loadOverdue warning:', err?.code || err?.message);
    root.querySelector('#overduePanel').style.display='none';
  }
}

/* ---------- util UI ---------- */
function badgeStatus(status){
  const g = groupOf(status);
  const MAP_HTML = {
    NUEVA:    '<span class="badge" style="background:#fff3cd;color:#975a06;">Abierta</span>',
    PROGRESO: '<span class="badge" style="background:#e7f5ff;color:#0b5ed7;">En progreso</span>',
    HECHA:    '<span class="badge">Completada</span>',
    OTRO:     '<span class="badge" style="background:#eee;color:#333;">—</span>'
  };
  return MAP_HTML[g] || MAP_HTML.OTRO;
}
function escapeHtml(str=''){ return str.replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
