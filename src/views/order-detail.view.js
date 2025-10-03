// src/views/order-detail.view.js
import { db, storage, fx } from '../firebase.js';
import { calcTotals } from '../currency.js';
import { logAction } from '../logging.js';

export function renderOrderDetail(orderId = null, clientId = null, equipmentId = null) {
  const app = document.getElementById('app');
  const S = (v) => (v ?? '');

  const section = document.createElement('section');
  section.innerHTML = `
    <a href="#/orders">← Volver</a>
    <h2>${orderId ? 'Editar OST' : 'Nueva OST'}</h2>
    <form id="form" class="card">
      <div class="grid">
        <label>Folio <input name="folio" required /></label>
        <label>Fecha Reporte <input type="date" name="reportedAt" required /></label>
        <label>Estatus
          <select name="status">
            <option>en_revision</option><option>abierta</option>
            <option>en_proceso</option><option>cerrada</option><option>entregada</option>
          </select>
        </label>
        <label>ClienteId <input name="clientId" required value="${S(clientId)}" /></label>
        <label>EquipoId <input name="equipmentId" required value="${S(equipmentId)}" /></label>
        <label>TécnicoId <input name="technicianId" /></label>
      </div>

      <label>Problema/Síntoma <textarea name="problem" rows="2"></textarea></label>
      <label>Diagnóstico/Causa <textarea name="diagnosis" rows="2"></textarea></label>
      <label>Acciones Realizadas <textarea name="actions" rows="2"></textarea></label>

      <fieldset>
        <legend>Fotos</legend>
        <div class="grid">
          <label>Antes <input type="file" name="before" multiple accept="image/*" /></label>
          <label>Después <input type="file" name="after" multiple accept="image/*" /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Cotizador</legend>
        <label>Tipo de cambio USD→MXN
          <input type="number" step="0.0001" name="usdToMxn" value="18.20" />
        </label>

        <div id="items">
          <h4>Refacciones</h4>
          <button type="button" data-add="part">+ Refacción</button>
          <div data-list="parts"></div>

          <h4>Consumibles</h4>
          <button type="button" data-add="consumable">+ Consumible</button>
          <div data-list="consumables"></div>

          <h4>Mano de Obra</h4>
          <button type="button" data-add="labor">+ Mano de Obra</button>
          <div data-list="labor"></div>

          <label>IVA (%) <input type="number" step="0.01" name="taxRate" value="16" /></label>
        </div>

        <div id="totals" class="card muted"></div>
      </fieldset>

      <button>Guardar OST</button>
    </form>
  `;
  app.replaceChildren(section);

  const form = section.querySelector('#form');
  const totalsBox = section.querySelector('#totals');

  const addRow = (type) => {
    const wrap = section.querySelector(`[data-list="${type}"]`);
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
    row.querySelector('[data-remove]').onclick = () => row.remove();
    wrap.appendChild(row);
    computeTotals();
  };

  section.querySelector('[data-add="part"]').onclick = () => addRow('parts');
  section.querySelector('[data-add="consumable"]').onclick = () => addRow('consumables');
  section.querySelector('[data-add="labor"]').onclick = () => addRow('labor');

  function readItems() {
    const blocks = ['parts', 'consumables', 'labor'];
    const out = { parts: [], consumables: [], labor: [] };
    blocks.forEach(b => {
      section.querySelectorAll(`[data-list="${b}"] .row`).forEach(r => {
        const g = (sel) => r.querySelector(`[data-f="${sel}"]`)?.value || '';
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
    const usdToMxn = parseFloat(form.usdToMxn.value || 18.20);
    const taxRate = (parseFloat(form.taxRate.value || 16) / 100);
    const items = readItems();
    const totals = calcTotals(items, usdToMxn, taxRate);
    totalsBox.innerHTML = `
      <strong>MXN</strong> — Subtotal: ${totals.mx.subtotal.toFixed(2)} | IVA: ${totals.mx.tax.toFixed(2)} | Total: ${totals.mx.total.toFixed(2)}<br/>
      <strong>USD</strong> — Subtotal: ${totals.us.subtotal.toFixed(2)} | Tax: ${totals.us.tax.toFixed(2)} | Total: ${totals.us.total.toFixed(2)}
    `;
    return { totals, usdToMxn, taxRate, items };
  }

  form.oninput = computeTotals;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const { totals, usdToMxn, taxRate, items } = computeTotals();

    // Subir fotos (si hay)
    async function uploadGroup(name, files) {
      const paths = [];
      for (const file of files ?? []) {
        const path = `ost_photos/${orderId ?? 'temp'}/${Date.now()}_${file.name}`;
        const ref = fx.sRef(storage, path);
        await fx.uploadBytes(ref, file);
        paths.push(path);
      }
      return paths;
    }
    const beforePaths = await uploadGroup('before', fd.getAll('before'));
    const afterPaths = await uploadGroup('after', fd.getAll('after'));

    const payload = {
      folio: fd.get('folio'),
      reportedAt: fx.Timestamp.fromDate(new Date(fd.get('reportedAt'))),
      status: fd.get('status'),
      clientId: fd.get('clientId'),
      equipmentId: fd.get('equipmentId'),
      technicianId: fd.get('technicianId'),
      problem: fd.get('problem'),
      diagnosis: fd.get('diagnosis'),
      actions: fd.get('actions'),
      photos: { before: beforePaths, after: afterPaths },
      quote: {
        ...items,
        taxRate,
        exchangeRate: { usdToMxn, setAt: fx.serverTimestamp() },
        totals: {
          subtotalMXN: totals.mx.subtotal, taxMXN: totals.mx.tax, grandTotalMXN: totals.mx.total,
          subtotalUSD: totals.us.subtotal, taxUSD: totals.us.tax, grandTotalUSD: totals.us.total
        }
      },
      updatedAt: fx.serverTimestamp()
    };
    if (!orderId) payload.createdAt = fx.serverTimestamp();

    if (orderId) {
      await fx.updateDoc(fx.doc(db, 'service_orders', orderId), payload);
      await logAction('UPDATE_OST', { type: 'service_order', id: orderId }, { folio: payload.folio });
    } else {
      const ref = await fx.addDoc(fx.collection(db, 'service_orders'), payload);
      await logAction('CREATE_OST', { type: 'service_order', id: ref.id }, { folio: payload.folio });
      orderId = ref.id;
    }

    alert('OST guardada');
  };

  computeTotals();
}
