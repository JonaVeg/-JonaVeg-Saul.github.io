// src/views/order-detail.view.js
import { db, fx, rtdb, rfx } from '../firebase.js';
import { calcTotals } from '../currency.js';
import { logAction } from '../logging.js';

function genFolio() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const r = Math.floor(Math.random() * 9000 + 1000);
  return `OST-${y}${m}-${r}`;
}

export function renderOrderDetail(orderId = null, clientId = null, equipmentId = null) {
  console.log('[ORDER DETAIL] open', { orderId, clientId, equipmentId });
  const app = document.getElementById('app');
  const isNew = !orderId;

  const el = document.createElement('section');
  el.innerHTML = `
    <a href="#/orders">← Volver a órdenes</a>
    <h2>${isNew ? 'Nueva OST' : 'Editar OST'}</h2>

    <form id="form" class="card">
      <div class="grid">
        <label>Folio <input name="folio" required value="${genFolio()}"/></label>
        <label>Fecha <input type="date" name="date" required /></label>
        <label>Estatus
          <select name="status">
            <option>En revisión</option>
            <option>Abierta</option>
            <option>En proceso</option>
            <option>Finalizada</option>
            <option>Entregada</option>
          </select>
        </label>
        <label>ClienteId <input name="clientId" required value="${clientId ?? ''}"/></label>
        <label>EquipoId  <input name="equipmentId" required value="${equipmentId ?? ''}"/></label>
        <label>TécnicoId <input name="technicianId" /></label>
      </div>

      <label>Problema / Síntoma <textarea name="symptom" rows="2"></textarea></label>
      <label>Diagnóstico / Causa <textarea name="diagnosis" rows="2"></textarea></label>
      <label>Acciones realizadas <textarea name="actions" rows="2"></textarea></label>

      <fieldset>
        <legend>Fotos</legend>
        <div class="grid">
          <label>Antes <input type="file" name="before" multiple accept="image/*" /></label>
          <label>Después <input type="file" name="after" multiple accept="image/*" /></label>
        </div>
        <div id="photosSaved" class="muted" style="margin-top:.5rem"></div>
      </fieldset>

      <fieldset>
        <legend>Cotizador</legend>
        <div class="grid">
          <label>Tipo de cambio USD→MXN
            <input type="number" step="0.0001" name="usdToMxn" value="18.20" />
          </label>
          <label>IVA (%) <input type="number" step="0.01" name="taxRate" value="16" /></label>
        </div>

        <h4>Refacciones</h4>
        <button type="button" data-add="parts">+ Refacción</button>
        <div data-list="parts"></div>

        <h4>Consumibles</h4>
        <button type="button" data-add="consumables">+ Consumible</button>
        <div data-list="consumables"></div>

        <h4>Mano de Obra</h4>
        <button type="button" data-add="labor">+ Mano de Obra</button>
        <div data-list="labor"></div>

        <div id="totals" class="card muted" style="margin-top:.5rem"></div>
      </fieldset>

      <div id="msg" class="muted"></div>
      <button>Guardar OST</button>
      <button type="button" id="btnPrint" class="muted">Imprimir / PDF</button>
    </form>
  `;
  app.replaceChildren(el);

  const form = el.querySelector('#form');
  const msg = el.querySelector('#msg');
  const totalsBox = el.querySelector('#totals');
  const photosSavedBox = el.querySelector('#photosSaved');

  // ===== Helpers cotizador =====
  const addRow = (type) => {
    const wrap = el.querySelector(`[data-list="${type}"]`);
    const row = document.createElement('div');
    row.className = 'row';
    if (type === 'labor') {
      row.innerHTML = `
        <input placeholder="Desc" data-f="description" />
        <input type="number" step="0.25" placeholder="Horas" data-f="hours" />
        <input type="number" step="0.01" placeholder="Tarifa" data-f="ratePerHour" />
        <select data-f="currency"><option>MXN</option><option>USD</option></select>
        <button type="button" data-remove>×</button>`;
    } else {
      row.innerHTML = `
        <input placeholder="Desc" data-f="description" />
        <input placeholder="SKU/Parte" data-f="partNumber" />
        <input type="number" step="1" placeholder="Qty" data-f="qty" />
        <input type="number" step="0.01" placeholder="P. Unit" data-f="unitPrice" />
        <select data-f="currency"><option>MXN</option><option>USD</option></select>
        <button type="button" data-remove>×</button>`;
    }
    row.querySelector('[data-remove]').onclick = () => { row.remove(); computeTotals(); };
    wrap.appendChild(row);
  };
  el.querySelector('[data-add="parts"]').onclick = () => { addRow('parts'); computeTotals(); };
  el.querySelector('[data-add="consumables"]').onclick = () => { addRow('consumables'); computeTotals(); };
  el.querySelector('[data-add="labor"]').onclick = () => { addRow('labor'); computeTotals(); };

  function grabItems() {
    const out = { parts: [], consumables: [], labor: [] };
    ['parts','consumables','labor'].forEach((b) => {
      el.querySelectorAll(`[data-list="${b}"] .row`).forEach(r => {
        const g = (k) => r.querySelector(`[data-f="${k}"]`)?.value || '';
        if (b === 'labor') {
          out.labor.push({
            description: g('description'),
            hours: parseFloat(g('hours') || 0),
            ratePerHour: parseFloat(g('ratePerHour') || 0),
            currency: g('currency') || 'MXN'
          });
        } else {
          out[b].push({
            description: g('description'),
            partNumber: g('partNumber'),
            qty: parseFloat(g('qty') || 0),
            unitPrice: parseFloat(g('unitPrice') || 0),
            currency: g('currency') || 'MXN'
          });
        }
      });
    });
    return out;
  }

  function computeTotals() {
    const usdToMxn = parseFloat(form.usdToMxn.value || 18.2);
    const taxRate = parseFloat(form.taxRate.value || 16) / 100;
    const items = grabItems();
    const totals = calcTotals(items, usdToMxn, taxRate);
    totalsBox.innerHTML = `
      <strong>MXN:</strong> Subtotal ${totals.mx.subtotal.toFixed(2)} | IVA ${totals.mx.tax.toFixed(2)} | Total ${totals.mx.total.toFixed(2)}<br/>
      <strong>USD:</strong> Subtotal ${totals.us.subtotal.toFixed(2)} | Tax ${totals.us.tax.toFixed(2)} | Total ${totals.us.total.toFixed(2)}
    `;
    return { items, totals, usdToMxn, taxRate };
  }
  form.addEventListener('input', computeTotals);

  // ===== Fotos guardadas (RTDB) =====
  async function renderSavedPhotos(photosRTDB) {
    if (!photosRTDB) { photosSavedBox.innerHTML = ''; return; }

    async function renderGroup(group, title) {
      if (!group) return `<div><strong>${title}</strong><div><em>Sin fotos</em></div></div>`;
      const snap = await rfx.rGet(rfx.rRef(rtdb, group.path));
      const val = snap.val() || {};
      const imgs = Object.values(val).map(v =>
        `<img src="${v.dataUrl}" style="max-width:160px;margin:4px;border:1px solid #ddd;border-radius:6px;" />`
      ).join('');
      return `<div><strong>${title}</strong><div>${imgs || '<em>Sin fotos</em>'}</div></div>`;
    }

    const beforeHTML = await renderGroup(photosRTDB.before, 'Antes');
    const afterHTML  = await renderGroup(photosRTDB.after,  'Después');
    photosSavedBox.innerHTML = `<div class="card"><h4>Fotos guardadas</h4>${beforeHTML}${afterHTML}</div>`;
  }

  // ===== Cargar OST si es edición =====
  (async () => {
    if (!isNew) {
      const snap = await fx.getDoc(fx.doc(db, 'orders', orderId));
      const o = snap.data();
      if (o) {
        form.folio.value = o.folio ?? genFolio();
        form.date.value = o.date?.toDate?.()?.toISOString?.().slice(0,10) ?? '';
        form.status.value = o.status ?? 'En revisión';
        form.clientId.value = o.clientId ?? '';
        form.equipmentId.value = o.equipmentId ?? '';
        form.technicianId.value = o.technicianId ?? '';
        form.symptom.value = o.symptom ?? '';
        form.diagnosis.value = o.diagnosis ?? '';
        form.actions.value = o.actions ?? '';

        (o.quote?.parts || []).forEach(()=>addRow('parts'));
        (o.quote?.consumables || []).forEach(()=>addRow('consumables'));
        (o.quote?.labor || []).forEach(()=>addRow('labor'));
        const fill = (list, dataArr) => {
          const rows = el.querySelectorAll(`[data-list="${list}"] .row`);
          dataArr.forEach((it, i) => {
            const r = rows[i];
            if (!r) return;
            Object.entries(it).forEach(([k,v])=>{
              const input = r.querySelector(`[data-f="${k}"]`);
              if (input) input.value = v;
            });
          });
        };
        fill('parts', o.quote?.parts || []);
        fill('consumables', o.quote?.consumables || []);
        fill('labor', o.quote?.labor || []);
        if (o.quote?.exchangeRate?.usdToMxn) form.usdToMxn.value = o.quote.exchangeRate.usdToMxn;
        if (o.quote?.taxRate) form.taxRate.value = o.quote.taxRate * 100;

        await renderSavedPhotos(o.photosRTDB);
      }
    } else {
      form.date.value = new Date().toISOString().slice(0,10);
    }
    computeTotals();
  })();

  // ===== Guardar OST + fotos (RTDB) =====
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = 'Guardando...';

    const { items, totals, usdToMxn, taxRate } = computeTotals();

    const base = {
      folio: form.folio.value.trim(),
      date: fx.Timestamp.fromDate(new Date(form.date.value)),
      status: form.status.value,
      clientId: form.clientId.value.trim(),
      equipmentId: form.equipmentId.value.trim(),
      technicianId: form.technicianId.value.trim(),
      symptom: form.symptom.value.trim(),
      diagnosis: form.diagnosis.value.trim(),
      actions: form.actions.value.trim(),
      updatedAt: fx.serverTimestamp()
    };
    if (!orderId) base.createdAt = fx.serverTimestamp();

    try {
      if (!orderId) {
        const ref = await fx.addDoc(fx.collection(db, 'orders'), base);
        orderId = ref.id;
      } else {
        await fx.updateDoc(fx.doc(db, 'orders', orderId), base);
      }

      const fd = new FormData(form);

      // Compresor robusto (evita [object Event])
      async function fileToDataUrlCompressed(file, maxW = 1280, quality = 0.72) {
        if (!file || !file.type?.startsWith('image/')) {
          throw new Error('Archivo no es una imagen válida');
        }
        const dataURL = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.onerror = () => rej(new Error('No se pudo leer el archivo'));
          fr.readAsDataURL(file);
        });
        const img = await new Promise((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = () => rej(new Error('No se pudo procesar la imagen'));
          im.src = dataURL;
        });
        const scale = Math.min(1, maxW / img.width || 1);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        return canvas.toDataURL('image/jpeg', quality);
      }

      async function uploadGroup(name, fileList) {
        const path = `ost_photos/${orderId}/${name}`;
        const keys = [];
        for (const file of (fileList ?? [])) {
          try {
            const dataUrl = await fileToDataUrlCompressed(file, 1280, 0.72);
            const nodeRef = rfx.rRef(rtdb, path);
            const pushed = rfx.rPush(nodeRef);
            await rfx.rSet(pushed, { dataUrl, createdAt: Date.now() });
            keys.push(pushed.key);
          } catch (imgErr) {
            console.warn(`[PHOTOS] ${name} omitida:`, imgErr?.message || imgErr);
          }
        }
        return { path, keys };
      }

      const upBefore = await uploadGroup('before', fd.getAll('before'));
      const upAfter  = await uploadGroup('after',  fd.getAll('after'));

      const update = {
        quote: {
          ...items,
          taxRate,
          exchangeRate: { usdToMxn, setAt: fx.serverTimestamp() },
          totals: {
            subtotalMXN: totals.mx.subtotal, taxMXN: totals.mx.tax, grandTotalMXN: totals.mx.total,
            subtotalUSD: totals.us.subtotal, taxUSD: totals.us.tax, grandTotalUSD: totals.us.total
          }
        },
        photosRTDB: {
          before: upBefore.keys.length ? upBefore : null,
          after:  upAfter.keys.length  ? upAfter  : null
        },
        updatedAt: fx.serverTimestamp()
      };

      await fx.updateDoc(fx.doc(db, 'orders', orderId), update);

      const action = (!base.createdAt ? 'UPDATE_OST' : 'CREATE_OST');
      await logAction(action, 'order', orderId, { folio: base.folio });

      await renderSavedPhotos(update.photosRTDB);

      msg.textContent = '✔ Guardado';
      alert('OST guardada correctamente');
    } catch (err) {
      console.error('[ORDERS] save error', err);
      msg.textContent = '✖ Error al guardar: ' + (err?.message || String(err));
    }
  });

  // =========================================================
  // =============  IMPRESIÓN / PDF (integrado)  =============
  // =========================================================

  // Helpers locales para la plantilla
  const fmtDate = (any) => {
    try {
      if (any?.toDate) return any.toDate().toLocaleDateString();
      if (any instanceof Date) return any.toLocaleDateString();
      if (typeof any === 'string') return new Date(any).toLocaleDateString();
    } catch {}
    return '-';
  };
  const money    = (n) => (Number(n||0)).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
  const moneyUSD = (n) => (Number(n||0)).toLocaleString('en-US',{style:'currency',currency:'USD'});

  function buildPrintableHtml({ id, o, c, e }) {
    const parts        = o?.quote?.parts || [];
    const consumables  = o?.quote?.consumables || [];
    const labor        = o?.quote?.labor || [];
    const t            = o?.quote?.totals || {};
    const rate         = o?.quote?.exchangeRate?.usdToMxn;

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

    const styles = `
      <style>
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
        @media print {.no-print{display:none}}
      </style>
    `;

    return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8"/>
        <title>OST ${o?.folio||id}</title>
        ${styles}
      </head>
      <body>
        <div class="no-print" style="text-align:right;margin:.5rem 0;">
          <button onclick="window.print()">Imprimir</button>
        </div>

        <h2>Orden de Servicio Técnico (OST)</h2>
        <div class="grid">
          <div class="card">
            <h3>Datos de la OST</h3>
            <div class="small">
              <div><b>Folio:</b> ${o?.folio||id}</div>
              <div><b>Estatus:</b> ${o?.status||'-'}</div>
              <div><b>Fecha:</b> ${fmtDate(o?.date||o?.createdAt)}</div>
            </div>
          </div>
          <div class="card">
            <h3>Cliente</h3>
            <div class="small">
              <div><b>Nombre:</b> ${c?.name||'-'}</div>
              <div><b>Contacto:</b> ${c?.email||'-'} • ${c?.phone||'-'}</div>
              <div><b>Dirección:</b> ${c?.address||'-'}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <h3>Equipo</h3>
          <div class="small">
            <div><b>Serie:</b> ${e?.serial||'-'}</div>
            <div><b>Marca/Modelo:</b> ${e?.brand||''} ${e?.model||''}</div>
          </div>
        </div>

        <div class="card">
          <h3>Diagnóstico / Servicio</h3>
          <div class="small"><b>Problema:</b> ${o?.symptom||'-'}</div>
          <div class="small"><b>Diagnóstico:</b> ${o?.diagnosis||'-'}</div>
          <div class="small"><b>Acciones:</b> ${o?.actions||'-'}</div>
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
      </body>
    </html>
    `;
  }

  // Listener del botón imprimir
  // --- imprimir / PDF: apertura SÍNCRONA ---
// … dentro de renderOrderDetail, después de crear el form …
// dentro de renderOrderDetail…
const btnPrint = el.querySelector('#btnPrint');
btnPrint.addEventListener('click', () => {
  if (!orderId) return alert('Primero guarda la OST para poder imprimir.');
  location.hash = `#/print?id=${orderId}`;
});

}
