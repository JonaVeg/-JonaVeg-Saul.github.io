// src/views/order-print.view.js
import { db, fx, rtdb, rfx } from '../firebase.js';

function money(n){ return (Number(n||0)).toLocaleString('es-MX',{style:'currency',currency:'MXN'}); }
function moneyUSD(n){ return (Number(n||0)).toLocaleString('en-US',{style:'currency',currency:'USD'}); }
function fmtDate(ts){
  try {
    const d = ts?.toDate?.() || ts || new Date();
    return new Date(d).toLocaleDateString('es-MX');
  } catch { return '-'; }
}

export default async function OrderPrintView() {
  const app = document.getElementById('app');
  const el = document.createElement('section');
  el.innerHTML = `<div class="muted">Cargando OST para impresión…</div>`;
  app.replaceChildren(el);

  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  const id = params.get('id');
  if (!id) {
    el.innerHTML = `<p class="muted">Falta el id de la orden.</p>`;
    return;
  }

  try {
    const oSnap = await fx.getDoc(fx.doc(db, 'orders', id));
    if (!oSnap.exists()) {
      el.innerHTML = `<p class="muted">No existe la orden ${id}.</p>`;
      return;
    }
    const o = oSnap.data();

    // Traemos cliente/equipo; si no existen, caemos a los snapshots
    let c = {};
    let e = {};
    try {
      if (o.clientId) {
        const cSnap = await fx.getDoc(fx.doc(db, 'clients', o.clientId));
        if (cSnap.exists()) c = cSnap.data();
      }
    } catch {}
    try {
      if (o.equipmentId) {
        const eSnap = await fx.getDoc(fx.doc(db, 'equipments', o.equipmentId));
        if (eSnap.exists()) e = eSnap.data();
      }
    } catch {}

    const parts       = o?.quote?.parts || [];
    const consumables = o?.quote?.consumables || [];
    const labor       = o?.quote?.labor || [];
    const t           = o?.quote?.totals || {};
    const rate        = o?.quote?.exchangeRate?.usdToMxn;

    const style = document.createElement('style');
    style.textContent = `
      @media print {.topbar, .no-print{ display:none !important; }}
      *{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#111;}
      h1,h2,h3{margin:.2rem 0}
      .muted{color:#666}
      .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:.5rem}
      .card{border:1px solid #ddd;border-radius:10px;padding:12px;margin:8px 0}
      table{width:100%;border-collapse:collapse;margin:.3rem 0}
      th,td{border:1px solid #ddd;padding:6px;font-size:12px}
      th{background:#f5f7ff;text-align:left}
      .totals td{font-weight:bold}
      .small{font-size:12px}
      .toolbar{display:flex;gap:.5rem;justify-content:flex-end;margin:.5rem 0}
      .btn{padding:.45rem .8rem;border-radius:8px;border:1px solid #d0d0d0;background:#fff;cursor:pointer}
      .btn.primary{background:#2563eb;color:#fff;border-color:#2563eb}

      .print-header{
        display:flex; align-items:center; gap:16px; margin-bottom:8px;
        border-bottom:2px solid #e5e7eb; padding-bottom:8px;
      }
      .brand-logo{ width:6.5cm; max-height:3.8cm; object-fit:contain; display:block; }
      .brand-meta{display:flex; flex-direction:column; gap:4px}
      .brand-title{font-size:22px; font-weight:800; letter-spacing:.2px}
      .brand-sub{font-size:12px; color:#444}
      .brand-sub a{color:#444; text-decoration:none}

      .photos{display:grid; grid-template-columns:repeat(2,1fr); gap:8px}
      .photos .group{border:1px solid #e5e7eb; border-radius:8px; padding:8px}
      .photos h4{margin:0 0 6px 0}
      .photos-grid{display:grid; grid-template-columns:repeat(3,1fr); gap:6px}
      .photos-grid img{width:100%; height:3.6cm; object-fit:cover; border:1px solid #e5e7eb; border-radius:6px}

      @page{ size: Letter; margin: 12mm; }
    `;
    document.head.appendChild(style);

    async function loadPhotoUrls(group) {
      try {
        if (!group?.path) return [];
        const snap = await rfx.rGet(rfx.rRef(rtdb, group.path));
        const val = snap.val() || {};
        const items = Object.values(val).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
        return items.slice(0,6).map(v => v.dataUrl).filter(Boolean);
      } catch { return []; }
    }
    const beforeUrls = await loadPhotoUrls(o?.photosRTDB?.before);
    const afterUrls  = await loadPhotoUrls(o?.photosRTDB?.after);

    const photosHTML = (beforeUrls.length || afterUrls.length) ? `
      <div class="card">
        <h3>Registro fotográfico</h3>
        <div class="photos">
          <div class="group">
            <h4>Antes</h4>
            <div class="photos-grid">${beforeUrls.map(u => `<img src="${u}" alt="Antes">`).join('')}</div>
          </div>
          <div class="group">
            <h4>Después</h4>
            <div class="photos-grid">${afterUrls.map(u => `<img src="${u}" alt="Después">`).join('')}</div>
          </div>
        </div>
      </div>
    ` : '';

    // Fallbacks de cliente/equipo si no se pudieron leer los docs
    const clientName = c?.name || o?.clientNameSnapshot || '(sin cliente)';
    const clientContact = [(c?.email || ''), (c?.phone || '')].filter(Boolean).join(' • ') ||
                          (o?.clientNameSnapshot ? '' : '');
    const clientAddress = c?.address || '';

    const eqLabel = (e?.brand || '') + (e?.model ? (' ' + e.model) : '');
    const equipmentName = eqLabel.trim() || o?.equipmentSnapshot || '(sin equipo)';
    const equipmentSerial = e?.serial || '';

    el.innerHTML = `
      <div class="toolbar no-print">
        <button class="btn primary" id="btnBack">← Volver</button>
        <button class="btn primary" id="btnPrintNow">Imprimir</button>
      </div>

      <header class="print-header">
        <img class="brand-logo" src="assets/Blancologo.png" alt="Logo EVRepairs">
        <div class="brand-meta">
          <div class="brand-title">EVRepairs</div>
          <div class="brand-sub">nstra sra de la luz, Puebla Pue 72595</div>
          <div class="brand-sub">Tel. 2245489541 • Evrepairs@gmail.com • <a href="https://Repairs.com">Repairs.com</a></div>
        </div>
      </header>

      <h2>Orden de Servicio Técnico (OST)</h2>
      <div class="grid">
        <div class="card">
          <h3>Datos de la OST</h3>
          <div class="small">
            <div><b>Folio:</b> ${o?.folio || id}</div>
            <div><b>Estatus:</b> ${o?.status || '-'}</div>
            <div><b>Fecha:</b> ${fmtDate(o?.date || o?.createdAt)}</div>
            ${o?.technicianName ? `<div><b>Técnico:</b> ${o.technicianName}</div>` : ''}
          </div>
        </div>
        <div class="card">
          <h3>Cliente</h3>
          <div class="small">
            <div><b>Nombre:</b> ${clientName}</div>
            <div><b>Contacto:</b> ${clientContact || '-'}</div>
            <div><b>Dirección:</b> ${clientAddress || '-'}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>Equipo</h3>
        <div class="small">
          <div><b>Equipo:</b> ${equipmentName}</div>
          <div><b>Serie:</b> ${equipmentSerial || '-'}</div>
        </div>
      </div>

      <div class="card">
        <h3>Diagnóstico / Servicio</h3>
        <div class="small"><b>Problema:</b> ${o?.symptom || '-'}</div>
        <div class="small"><b>Diagnóstico:</b> ${o?.diagnosis || '-'}</div>
        <div class="small"><b>Acciones:</b> ${o?.actions || '-'}</div>
      </div>

      <div class="card">
        <h3>Cotización</h3>
        <div class="small">Tipo de cambio USD→MXN: <b>${rate || '-'}</b></div>

        <h4>Refacciones</h4>
        <table>
          <thead><tr><th>Descripción</th><th>SKU</th><th>Cant.</th><th>P. Unit</th><th>Moneda</th></tr></thead>
          <tbody>${parts.map(x=>`
            <tr>
              <td>${x.description||''}</td>
              <td>${x.partNumber||''}</td>
              <td>${x.qty||0}</td>
              <td>${x.unitPrice||0}</td>
              <td>${x.currency||'MXN'}</td>
            </tr>`).join('')}</tbody>
        </table>

        <h4>Consumibles</h4>
        <table>
          <thead><tr><th>Descripción</th><th>SKU</th><th>Cant.</th><th>P. Unit</th><th>Moneda</th></tr></thead>
          <tbody>${consumables.map(x=>`
            <tr>
              <td>${x.description||''}</td>
              <td>${x.partNumber||''}</td>
              <td>${x.qty||0}</td>
              <td>${x.unitPrice||0}</td>
              <td>${x.currency||'MXN'}</td>
            </tr>`).join('')}</tbody>
        </table>

        <h4>Mano de obra</h4>
        <table>
          <thead><tr><th>Descripción</th><th>Horas</th><th>Tarifa</th><th>Moneda</th></tr></thead>
          <tbody>${labor.map(x=>`
            <tr>
              <td>${x.description||''}</td>
              <td>${x.hours||0}</td>
              <td>${x.ratePerHour||0}</td>
              <td>${x.currency||'MXN'}</td>
            </tr>`).join('')}</tbody>
        </table>

        <table class="totals">
          <tbody>
            <tr><td>Subtotal (MXN)</td><td>${money(t.subtotalMXN)}</td></tr>
            <tr><td>IVA (MXN)</td><td>${money(t.taxMXN)}</td></tr>
            <tr><td>Total (MXN)</td><td>${money(t.grandTotalMXN)}</td></tr>
            <tr><td>Subtotal (USD)</td><td>${moneyUSD(t.subtotalUSD)}</td></tr>
            <tr><td>Tax (USD)</td><td>${moneyUSD(t.taxUSD)}</td></tr>
            <tr><td>Total (USD)</td><td>${moneyUSD(t.grandTotalUSD)}</td></tr>
          </tbody>
        </table>
      </div>

      ${photosHTML}

      <div class="small muted">Generado: ${new Date().toLocaleString()}</div>

      <div class="small" style="margin-top:8px">
        <b>Términos y condiciones</b><br/>
        El diagnóstico y la cotización son estimaciones basadas en la revisión del equipo. Los tiempos y costos pueden ajustarse si se detectan fallas adicionales.
        EVRepairs no se hace responsable por pérdida de datos; se recomienda realizar respaldo previo. Al autorizar la reparación, el cliente acepta estos términos.
      </div>
    `;

    el.querySelector('#btnBack').addEventListener('click', () => history.back());
    el.querySelector('#btnPrintNow').addEventListener('click', () => window.print());
    setTimeout(() => window.print(), 300);
  } catch (err) {
    console.error('[PRINT VIEW] error', err);
    el.innerHTML = `<p class="muted">Error al generar la vista de impresión.</p>`;
  }
}
