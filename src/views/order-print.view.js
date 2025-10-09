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
    const [cSnap, eSnap] = await Promise.all([
      fx.getDoc(fx.doc(db, 'clients', o.clientId)),
      fx.getDoc(fx.doc(db, 'equipments', o.equipmentId)),
    ]);
    const c = cSnap.data() || {};
    const e = eSnap.data() || {};

    // ====== Leer fotos desde RTDB (si existen) ======
    async function fetchPhotosGroupPath(path) {
      try {
        const snap = await rfx.rGet(rfx.rRef(rtdb, path));
        const val = snap.val() || {};
        return Object.values(val).map(v => v?.dataUrl).filter(Boolean);
      } catch (err) {
        console.warn('[PRINT] no se pudo leer fotos RTDB', path, err);
        return [];
      }
    }
    const beforeImgs = o?.photosRTDB?.before?.path ? await fetchPhotosGroupPath(o.photosRTDB.before.path) : [];
    const afterImgs  = o?.photosRTDB?.after?.path  ? await fetchPhotosGroupPath(o.photosRTDB.after.path)  : [];

    const parts       = o?.quote?.parts || [];
    const consumables = o?.quote?.consumables || [];
    const labor       = o?.quote?.labor || [];
    const t           = o?.quote?.totals || {};
    const rate        = o?.quote?.exchangeRate?.usdToMxn;

    // ========== Estilos específicos de impresión ==========
    const style = document.createElement('style');
    style.textContent = `
      /* Tamaño Carta y márgenes amigables */
      @page { size: Letter; margin: 14mm; }
      @media print {.topbar, .no-print{ display:none !important; }}

      :root {
        --ink:#111;
        --muted:#666;
        --line:#e5e7eb;
        --brand:#0d6efd;
        --bg:#ffffff;
      }
      *{ box-sizing:border-box; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Noto Sans", "Apple Color Emoji","Segoe UI Emoji"; color: var(--ink); }
      body { background:#fff; }
      h1,h2,h3,h4 { margin:.25rem 0; }
      .muted { color: var(--muted); }

      .doc { max-width: 900px; margin: 0 auto; }
      .toolbar { display:flex; gap:.5rem; justify-content:flex-end; margin:.5rem 0; }
      .btn{padding:.5rem .85rem;border-radius:8px;border:1px solid #cfd6e4;background:#fff;cursor:pointer}
      .btn.primary{background:var(--brand);color:#fff;border-color:var(--brand)}

      .doc-title {
        display:flex; align-items:center; justify-content:space-between;
        border-bottom: 2px solid #dbe3f3; padding: 6px 2px; margin: 6px 0 8px;
      }
      .doc-title h2 { font-size: 18px; }
      .doc-title .status {
        font-size: 12px; padding: 4px 8px; border-radius: 999px; background: #eef4ff; color: var(--brand); font-weight: 700;
        border: 1px solid #d8e4ff;
      }

      .doc-header {
        display:grid; grid-template-columns: 1.3fr .9fr; gap: 12px; align-items: start; margin-bottom: 8px;
      }
      .h-brand {
        border:1px solid var(--line); border-radius:12px; padding:14px;
      }
      .brand-title { font-size: 22px; font-weight: 800; letter-spacing:.3px; }
      .brand-sub { margin-top:2px; font-size: 12px; color: var(--muted);}
      .brand-list { margin-top:8px; font-size:13px; line-height:1.35; }
      .brand-list div b { display:inline-block; width:84px; color:#333; }

      .h-meta {
        border:1px solid var(--line); border-radius:12px; padding:14px;
      }
      .meta-row { display:grid; grid-template-columns: 1fr 1fr; gap:6px; font-size: 13px; }
      .meta-row div b { color:#333; }

      .card { border:1px solid var(--line); border-radius:12px; padding:12px; margin: 8px 0; background:var(--bg); }
      .grid-2 { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .kv { font-size: 13px; line-height: 1.35; }
      .kv div { margin: 2px 0; }
      .kv b { color:#333; display:inline-block; min-width:110px; }

      table { width:100%; border-collapse: collapse; margin-top:.3rem; }
      th, td { border:1px solid var(--line); padding: 6px 8px; font-size: 12.5px; }
      th { background:#f7f9ff; text-align:left; }
      td.num, th.num { text-align:right; }

      .tbl-title { margin-top: 6px; font-weight:700; }

      .totals {
        width: 100%; max-width: 360px; margin-left:auto; border:1px solid #d9e2f5; border-radius:12px; overflow:hidden;
      }
      .totals .row { display:grid; grid-template-columns: 1fr auto; gap:8px; padding:8px 10px; border-bottom:1px solid #e8eefc; }
      .totals .row:last-child { border-bottom:0; }
      .totals .row.label { background:#f7f9ff; font-weight:700; }
      .totals .val { text-align:right; }

      /* Registro fotográfico */
      .photos { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .photos .group { border:1px solid var(--line); border-radius:12px; padding:10px; }
      .photos .group-title { font-weight:700; margin-bottom:6px; }
      .photos .imgs { display:flex; flex-wrap: wrap; gap: 6px; }
      .photos img {
        max-height: 140px; max-width: 100%;
        border:1px solid #dfe6f5; border-radius: 8px; padding: 2px; background:#fff;
      }

      .signs { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 14px; }
      .sign {
        height: 88px; border:1px dashed #c9d3ea; border-radius: 10px; padding: 10px;
        display:flex; align-items:flex-end; justify-content:space-between; color:#41557a;
        font-size: 12px;
      }
      .sign .label { opacity:.85; }
      .sign .line { flex: 1; border-bottom:1px solid #9fb2d8; margin: 0 8px; }

      .footer-note { margin-top: 10px; font-size: 12px; color: #4b5563; }
      .terms { border:1px solid var(--line); border-radius:12px; padding:10px; margin-top:10px; font-size:12px; color:#4b5563; }

      /* Evitar cortes feos al imprimir */
      .avoid-break, .card, table, .totals, .signs, .photos { page-break-inside: avoid; }

      @media (max-width: 720px) {
        .doc-header { grid-template-columns: 1fr; }
        .grid-2 { grid-template-columns: 1fr; }
        .photos { grid-template-columns: 1fr; }
        .totals { max-width: none; }
      }
    `;
    document.head.appendChild(style);

    const rows = (arr, isLabor=false) => arr.map(x=>`
      <tr>
        <td>${x.description||''}</td>
        ${isLabor ? `
          <td class="num">${x.hours||0}</td>
          <td class="num">${x.ratePerHour||0}</td>
        ` : `
          <td>${x.partNumber||''}</td>
          <td class="num">${x.qty||0}</td>
          <td class="num">${x.unitPrice||0}</td>
        `}
        <td class="num">${x.currency||'MXN'}</td>
      </tr>
    `).join('');

    const photosHTML = `
      <div class="card avoid-break">
        <h3>Registro fotográfico</h3>
        <div class="photos">
          <div class="group">
            <div class="group-title">Antes</div>
            <div class="imgs">
              ${
                beforeImgs.length
                  ? beforeImgs.map(u => `<img src="${u}" alt="Antes">`).join('')
                  : `<div class="muted" style="font-size:12px;">Sin fotos</div>`
              }
            </div>
          </div>
          <div class="group">
            <div class="group-title">Después</div>
            <div class="imgs">
              ${
                afterImgs.length
                  ? afterImgs.map(u => `<img src="${u}" alt="Después">`).join('')
                  : `<div class="muted" style="font-size:12px;">Sin fotos</div>`
              }
            </div>
          </div>
        </div>
      </div>
    `;

    // ========== Render ==========
    el.innerHTML = `
      <div class="toolbar no-print">
        <button class="btn" id="btnBack">← Volver</button>
        <button class="btn primary" id="btnPrintNow">Imprimir</button>
      </div>

      <div class="doc">
        <div class="doc-title">
          <h2>Orden de Servicio Técnico (OST)</h2>
          <span class="status">${o?.status || '-'}</span>
        </div>

        <div class="doc-header">
          <div class="h-brand">
            <div class="brand-title">EVRepairs</div>
            <div class="brand-sub">Gestión y Servicio Técnico</div>
            <div class="brand-list">
              <div><b>Dirección:</b> nstra sra de la luz, Puebla Pue 72595</div>
              <div><b>Teléfono:</b> 2245489541</div>
              <div><b>Correo:</b> Evrepairs@gmail.com</div>
              <div><b>Sitio:</b> Repairs.com</div>
            </div>
          </div>
          <div class="h-meta">
            <div class="meta-row"><div><b>Folio:</b></div><div>${o?.folio || id}</div></div>
            <div class="meta-row"><div><b>Fecha:</b></div><div>${fmtDate(o?.date || o?.createdAt)}</div></div>
            <div class="meta-row"><div><b>Tipo de cambio:</b></div><div>${rate ? `USD→MXN ${rate}` : '-'}</div></div>
          </div>
        </div>

        <div class="grid-2 avoid-break">
          <div class="card">
            <h3>Cliente</h3>
            <div class="kv">
              <div><b>Nombre:</b> ${c?.name || '-'}</div>
              <div><b>Contacto:</b> ${c?.email || '-'} • ${c?.phone || '-'}</div>
              <div><b>Dirección:</b> ${c?.address || '-'}</div>
            </div>
          </div>
          <div class="card">
            <h3>Equipo</h3>
            <div class="kv">
              <div><b>Serie:</b> ${e?.serial || '-'}</div>
              <div><b>Marca/Modelo:</b> ${e?.brand || ''} ${e?.model || ''}</div>
            </div>
          </div>
        </div>

        <div class="card avoid-break">
          <h3>Diagnóstico / Servicio</h3>
          <div class="kv">
            <div><b>Problema / Síntoma:</b> ${o?.symptom || '-'}</div>
            <div><b>Diagnóstico / Causa:</b> ${o?.diagnosis || '-'}</div>
            <div><b>Acciones realizadas:</b> ${o?.actions || '-'}</div>
          </div>
        </div>

        ${photosHTML}

        <div class="card avoid-break">
          <h3>Cotización</h3>

          <div class="tbl-title">Refacciones</div>
          <table>
            <thead><tr><th>Descripción</th><th>SKU</th><th class="num">Cant.</th><th class="num">P. Unit</th><th class="num">Moneda</th></tr></thead>
            <tbody>${rows(parts)}</tbody>
          </table>

          <div class="tbl-title">Consumibles</div>
          <table>
            <thead><tr><th>Descripción</th><th>SKU</th><th class="num">Cant.</th><th class="num">P. Unit</th><th class="num">Moneda</th></tr></thead>
            <tbody>${rows(consumables)}</tbody>
          </table>

          <div class="tbl-title">Mano de obra</div>
          <table>
            <thead><tr><th>Descripción</th><th class="num">Horas</th><th class="num">Tarifa</th><th class="num">Moneda</th></tr></thead>
            <tbody>${rows(labor,true)}</tbody>
          </table>

          <div class="totals" style="margin-top:8px;">
            <div class="row label"><div>Totales (MXN)</div><div class="val"></div></div>
            <div class="row"><div>Subtotal</div><div class="val">${money(t.subtotalMXN)}</div></div>
            <div class="row"><div>IVA</div><div class="val">${money(t.taxMXN)}</div></div>
            <div class="row"><div><b>Total</b></div><div class="val"><b>${money(t.grandTotalMXN)}</b></div></div>

            <div class="row label"><div>Totales (USD)</div><div class="val"></div></div>
            <div class="row"><div>Subtotal</div><div class="val">${moneyUSD(t.subtotalUSD)}</div></div>
            <div class="row"><div>Tax</div><div class="val">${moneyUSD(t.taxUSD)}</div></div>
            <div class="row"><div><b>Total</b></div><div class="val"><b>${moneyUSD(t.grandTotalUSD)}</b></div></div>
          </div>
        </div>

        <div class="signs avoid-break">
          <div class="sign">
            <span class="label">Entregó</span>
            <span class="line"></span>
            <span class="label">Nombre / Firma</span>
          </div>
          <div class="sign">
            <span class="label">Recibió</span>
            <span class="line"></span>
            <span class="label">Nombre / Firma</span>
          </div>
        </div>

        <div class="footer-note">
          EVRepairs — Siempre comprometidos con la calidad y el servicio.
        </div>

        <div class="terms">
          <b>Términos y condiciones:</b>
          El servicio se realiza con base en la información proporcionada por el cliente y la inspección efectuada al equipo.
          Los precios incluyen los conceptos indicados y pueden variar por refacciones/insumos adicionales no contemplados al momento de la revisión inicial.
          El pago total deberá realizarse contra entrega, salvo acuerdo distinto por escrito. La garantía se limita a los componentes y mano de obra especificados,
          y no cubre daños por mal uso, golpes, humedad o intervenciones de terceros. El equipo será almacenado por un máximo de 30 días naturales tras la notificación
          de servicio concluido; después de ese periodo podrán generarse cargos por resguardo.
        </div>

        <div class="muted" style="margin-top:6px;font-size:12px;">
          Generado: ${new Date().toLocaleString('es-MX')}
        </div>
      </div>
    `;

    // Acciones
    el.querySelector('#btnBack').addEventListener('click', () => history.back());
    el.querySelector('#btnPrintNow').addEventListener('click', () => window.print());

    // Mantengo tu impresión automática
    setTimeout(() => window.print(), 300);
  } catch (err) {
    console.error('[PRINT VIEW] error', err);
    el.innerHTML = `<p class="muted">Error al generar la vista de impresión.</p>`;
  }
}
