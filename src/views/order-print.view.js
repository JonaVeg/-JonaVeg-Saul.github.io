// src/views/order-print.view.js
import { db, fx } from '../firebase.js';

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
    const [cSnap, eSnap] = await Promise.all([
      fx.getDoc(fx.doc(db, 'clients', o.clientId)),
      fx.getDoc(fx.doc(db, 'equipments', o.equipmentId)),
    ]);
    const c = cSnap.data() || {};
    const e = eSnap.data() || {};

    const parts       = o?.quote?.parts || [];
    const consumables = o?.quote?.consumables || [];
    const labor       = o?.quote?.labor || [];
    const t           = o?.quote?.totals || {};
    const rate        = o?.quote?.exchangeRate?.usdToMxn;

    const rows = (arr, isLabor=false) => arr.map(x=>`
      <tr>
        <td>${x.description||''}</td>
        ${isLabor ? `
          <td>${x.hours||0}</td>
          <td>${x.ratePerHour||0}</td>
        ` : `
          <td>${x.partNumber||''}</td>
          <td>${x.qty||0}</td>
          <td>${x.unitPrice||0}</td>
        `}
        <td>${x.currency||'MXN'}</td>
      </tr>
    `).join('');

    // Inyecta estilos globales para ocultar la topbar al imprimir
    const style = document.createElement('style');
    style.textContent = `
      @media print {.topbar, .no-print{ display:none !important; }}
      *{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;}
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
    `;
    document.head.appendChild(style);

    el.innerHTML = `
      <div class="toolbar no-print">
        <button class="btn" id="btnBack">← Volver</button>
        <button class="btn primary" id="btnPrintNow">Imprimir</button>
      </div>

      <h2>Orden de Servicio Técnico (OST)</h2>
      <div class="grid">
        <div class="card">
          <h3>Datos de la OST</h3>
          <div class="small">
            <div><b>Folio:</b> ${o?.folio || id}</div>
            <div><b>Estatus:</b> ${o?.status || '-'}</div>
            <div><b>Fecha:</b> ${fmtDate(o?.date || o?.createdAt)}</div>
          </div>
        </div>
        <div class="card">
          <h3>Cliente</h3>
          <div class="small">
            <div><b>Nombre:</b> ${c?.name || '-'}</div>
            <div><b>Contacto:</b> ${c?.email || '-'} • ${c?.phone || '-'}</div>
            <div><b>Dirección:</b> ${c?.address || '-'}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>Equipo</h3>
        <div class="small">
          <div><b>Serie:</b> ${e?.serial || '-'}</div>
          <div><b>Marca/Modelo:</b> ${e?.brand || ''} ${e?.model || ''}</div>
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
          <tbody>${rows(parts)}</tbody>
        </table>

        <h4>Consumibles</h4>
        <table>
          <thead><tr><th>Descripción</th><th>SKU</th><th>Cant.</th><th>P. Unit</th><th>Moneda</th></tr></thead>
          <tbody>${rows(consumables)}</tbody>
        </table>

        <h4>Mano de obra</h4>
        <table>
          <thead><tr><th>Descripción</th><th>Horas</th><th>Tarifa</th><th>Moneda</th></tr></thead>
          <tbody>${rows(labor,true)}</tbody>
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

      <div class="small muted">Generado: ${new Date().toLocaleString()}</div>
    `;

    // Acciones
    el.querySelector('#btnBack').addEventListener('click', () => history.back());
    el.querySelector('#btnPrintNow').addEventListener('click', () => window.print());

    // Lanza impresión automáticamente al renderizar
    setTimeout(() => window.print(), 300);
  } catch (err) {
    console.error('[PRINT VIEW] error', err);
    el.innerHTML = `<p class="muted">Error al generar la vista de impresión.</p>`;
  }
}
