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

// Técnicos por defecto (fallback UI si la colección está vacía)
const DEFAULT_TECHS = ['Víctor Juarez', 'Saúl Huerta', 'Eduardo Reyes'];

export function renderOrderDetail(orderId = null, clientId = null, equipmentId = null) {
  console.log('[ORDER DETAIL] open', { orderId, clientId, equipmentId });
  const app = document.getElementById('app');
  const isNew = !orderId;

  const el = document.createElement('section');
  el.innerHTML = `
    <a href="#/orders">← Volver a órdenes</a>
    <h2>${isNew ? 'Nueva OST' : 'Editar OST'}</h2>

    <form id="form" class="card">
      <div class="grid" style="grid-template-columns: repeat(3,minmax(0,1fr)); gap:.6rem;">
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

        <!-- Cliente con buscador -->
        <label class="combo">
          <span>Cliente</span>
          <input id="clientSearch" type="text" placeholder="Buscar cliente..." autocomplete="off" />
          <input id="clientId" name="clientId" type="hidden" />
          <div id="clientList" class="listbox" hidden></div>
        </label>

        <!-- Equipo del cliente -->
        <label>
          <span>Equipo</span>
          <select id="equipmentSelect" name="equipmentId" disabled>
            <option value="">(Sin equipos para este cliente)</option>
          </select>
        </label>

        <!-- Técnico (opción única) -->
        <label>Técnico
          <select name="technicianId" id="technicianId">
            <option value="">Selecciona un técnico...</option>
          </select>
        </label>
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
          <label>Descuento (%)
            <input type="number" step="0.01" name="discountRate" value="0" />
          </label>
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

  const form            = el.querySelector('#form');
  const msg             = el.querySelector('#msg');
  const totalsBox       = el.querySelector('#totals');
  const photosSavedBox  = el.querySelector('#photosSaved');
  const techSelect      = el.querySelector('#technicianId');
  const searchInput     = el.querySelector('#clientSearch');
  const hiddenClientId  = el.querySelector('#clientId');
  const resultsList     = el.querySelector('#clientList');
  const equipmentSelect = el.querySelector('#equipmentSelect');

  // =========================
  //  Técnicos
  // =========================
  async function loadTechnicians(preselectId = '') {
    const sel = techSelect;
    sel.innerHTML = `<option value="">Cargando técnicos...</option>`;
    try {
      const snap = await fx.getDocs(fx.collection(db, 'technicians'));
      const docs = [];
      snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
      const rows = docs
        .filter(t => t.active !== false)
        .sort((a,b) => String(a.name||'').localeCompare(String(b.name||'')));
      sel.innerHTML =
        `<option value="">Selecciona un técnico...</option>` +
        (rows.length
          ? rows.map(t => `<option value="${t.id}">${t.name || t.id}</option>`).join('')
          : DEFAULT_TECHS.map(n => `<option value="${n}">${n}</option>`).join(''));
    } catch (e) {
      console.warn('[TECH] load error:', e);
      sel.innerHTML =
        `<option value="">Selecciona un técnico...</option>` +
        DEFAULT_TECHS.map(n => `<option value="${n}">${n}</option>`).join('');
    }
    if (preselectId) sel.value = preselectId;
  }

  // =========================
  //  Clientes + Equipos (buscador)
  // =========================
  let allClients = [];
  let listIndex = -1;
  const lower = s => (s||'').toString().toLowerCase();

  function rowHTML(c) {
    const sub = [c.email, c.phone].filter(Boolean).join(' • ');
    return `
      <div class="item" data-id="${c.id}" role="option">
        <div class="title">${c.name || '(Sin nombre)'}</div>
        ${sub ? `<div class="sub">${sub}</div>` : ''}
      </div>`;
  }

  function paintList(q='') {
    const needle = lower(q);
    const rows = allClients.filter(c =>
      (lower(c.name)+' '+lower(c.email)+' '+lower(c.phone)).includes(needle)
    );
    resultsList.innerHTML = rows.length ? rows.map(rowHTML).join('') : `<div class="empty">Sin coincidencias</div>`;
    resultsList.hidden = false;
    listIndex = -1;
  }
  function closeList(){ resultsList.hidden = true; listIndex = -1; }

  function chooseClientByElement(elm) {
    const id = elm?.getAttribute('data-id');
    const c  = allClients.find(x => x.id === id);
    if (!c) return;
    hiddenClientId.value = c.id;
    const sub = [c.email, c.phone].filter(Boolean).join(' • ');
    searchInput.value = `${c.name}${sub ? ' — '+sub : ''}`;
    closeList();
    equipmentSelect.disabled = false;
    loadEquipments(c.id);
  }
  function chooseClientByIndex(){
    if (resultsList.hidden) return;
    const items = resultsList.querySelectorAll('.item');
    if (!items.length) return;
    if (listIndex<0 || listIndex>=items.length) return;
    chooseClientByElement(items[listIndex]);
  }
  function highlight(delta){
    if (resultsList.hidden) return;
    const items = resultsList.querySelectorAll('.item');
    if (!items.length) return;
    resultsList.querySelectorAll('.item.active').forEach(n => n.classList.remove('active'));
    listIndex = Math.max(0, Math.min(items.length-1, listIndex + delta));
    items[listIndex].classList.add('active');
    items[listIndex].scrollIntoView({block:'nearest'});
  }

  async function loadClients(preselectId = '', preselectName = '') {
    // listeners solo una vez
    if (!searchInput.__wired) {
      searchInput.__wired = true;
      searchInput.addEventListener('input',  () => paintList(searchInput.value));
      searchInput.addEventListener('focus',  () => paintList(searchInput.value));
      searchInput.addEventListener('blur',   () => setTimeout(closeList, 120));
      searchInput.addEventListener('keydown', ev => {
        if (ev.key==='ArrowDown'){ ev.preventDefault(); highlight(1); }
        if (ev.key==='ArrowUp'){   ev.preventDefault(); highlight(-1); }
        if (ev.key==='Enter'){     ev.preventDefault(); chooseClientByIndex(); }
        if (ev.key==='Escape'){    ev.preventDefault(); closeList(); }
      });
      resultsList.addEventListener('mousedown', (ev) => {
        const item = ev.target.closest('.item');
        if (item){ ev.preventDefault(); chooseClientByElement(item); }
      });
    }

    // lee clientes
    try{
      const snap = await fx.getDocs(fx.collection(db,'clients'));
      allClients = [];
      snap.forEach(d=>{
        const c = d.data();
        allClients.push({
          id:d.id,
          name: c.name||'(Sin nombre)',
          email:c.email||'',
          phone:c.phone||'',
          address:c.address||''
        });
      });
      allClients.sort((a,b)=>a.name.localeCompare(b.name));
    }catch(e){
      console.error('[CLIENTS] load error', e);
      allClients = [];
    }

    // preselección (cuando llegas desde Cliente/Equipo)
    if (preselectId){
      const found = allClients.find(c=>c.id===preselectId);
      hiddenClientId.value = preselectId;
      if (found){
        const sub = [found.email, found.phone].filter(Boolean).join(' • ');
        searchInput.value = `${found.name}${sub ? ' — '+sub : ''}`;
      }else if(preselectName){
        searchInput.value = `${preselectName} — (no listado)`;
      }
      equipmentSelect.disabled = false;
      await loadEquipments(preselectId, equipmentId || '', '');
    }else{
      hiddenClientId.value = '';
      searchInput.value = '';
      equipmentSelect.innerHTML = `<option value="">(Sin equipos para este cliente)</option>`;
      equipmentSelect.disabled = true;
    }

    resultsList.hidden = true;
  }

  async function loadEquipments(clientId, preselectEquipmentId = '', preselectEquipmentLabel = '') {
    const sel = equipmentSelect;
    sel.innerHTML = `<option value="">Cargando equipos...</option>`;
    try{
      const q = fx.query(
        fx.collection(db,'equipments'),
        fx.where('clientId','==', clientId)
      );
      const rows = [];
      const snap = await fx.getDocs(q);
      snap.forEach(d=>rows.push({id:d.id,...d.data()}));

      if (!rows.length){ sel.innerHTML = `<option value="">(Sin equipos para este cliente)</option>`; return; }

      rows.sort((a,b)=> String(a.brand||'').localeCompare(String(b.brand||'')));
      sel.innerHTML =
        `<option value="">Selecciona un equipo...</option>`+
        rows.map(eq=>{
          const label = `${eq.brand||''} ${eq.model||''}`.trim();
          const serie = eq.serial ? ` — ${eq.serial}` : '';
          return `<option value="${eq.id}">${label || '(Equipo)'}${serie}</option>`;
        }).join('');

      if (preselectEquipmentId){
        sel.value = preselectEquipmentId;
        if (sel.value!==preselectEquipmentId && preselectEquipmentLabel){
          const ghost = document.createElement('option');
          ghost.value = preselectEquipmentId;
          ghost.textContent = `${preselectEquipmentLabel} — (no listado)`;
          sel.appendChild(ghost);
          sel.value = preselectEquipmentId;
        }
      }
    }catch(e){
      console.error('[EQUIPMENTS] load error', e);
      sel.innerHTML = `<option value="">(Error al cargar equipos)</option>`;
    }
  }

  // =========================
  //  Cotizador
  // =========================
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
        <input type="number" step="1" placeholder="Cant." data-f="qty" />
        <input type="number" step="0.01" placeholder="P. Unit" data-f="unitPrice" />
        <select data-f="currency"><option>MXN</option><option>USD</option></select>
        <button type="button" data-remove>×</button>`;
    }
    row.querySelector('[data-remove]').onclick = () => { row.remove(); computeTotals(); };
    wrap.appendChild(row);
    return row;
  };

  function fillRows(listName, arr = []) {
    const wrap = el.querySelector(`[data-list="${listName}"]`);
    wrap.innerHTML = '';
    arr.forEach(it => {
      const r = addRow(listName);
      Object.entries(it || {}).forEach(([k, v]) => {
        const inp = r.querySelector(`[data-f="${k}"]`);
        if (!inp) return;
        if (typeof v === 'number') inp.value = Number.isFinite(v) ? v : '';
        else inp.value = (v ?? '').toString();
      });
    });
  }

  el.querySelector('[data-add="parts"]').onclick        = () => { addRow('parts');        computeTotals(); };
  el.querySelector('[data-add="consumables"]').onclick  = () => { addRow('consumables');  computeTotals(); };
  el.querySelector('[data-add="labor"]').onclick        = () => { addRow('labor');        computeTotals(); };

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
    ensureQuoteStyles();

    const usdToMxn     = parseFloat(form.usdToMxn.value || 18.2);
    const discountRate = parseFloat(form.discountRate.value || 0) / 100; // 0..1
    const items        = grabItems();

    // calcTotals debe devolver: { mx: {subtotal, discount, total}, us:{...} }
    const totals = calcTotals(items, usdToMxn, discountRate);

    totalsBox.innerHTML = `
      <div class="quote-summary">
        <div class="quote-card">
          <div class="quote-hdr">MXN</div>
          <div class="qrow"><span>Subtotal</span><span>${money(totals.mx.subtotal,'MXN')}</span></div>
          <div class="qrow"><span>Descuento (${(discountRate*100).toFixed(2)}%)</span><span class="qneg">-${money(totals.mx.discount,'MXN')}</span></div>
          <div class="qsep"></div>
          <div class="qrow qtotal"><span><strong>Total MXN</strong></span><span><strong>${money(totals.mx.total,'MXN')}</strong></span></div>
        </div>
        <div class="quote-card">
          <div class="quote-hdr">USD</div>
          <div class="qrow"><span>Subtotal</span><span>${money(totals.us.subtotal,'USD')}</span></div>
          <div class="qrow"><span>Discount (${(discountRate*100).toFixed(2)}%)</span><span class="qneg">-${money(totals.us.discount,'USD')}</span></div>
          <div class="qsep"></div>
          <div class="qrow qtotal"><span><strong>Total USD</strong></span><span><strong>${money(totals.us.total,'USD')}</strong></span></div>
        </div>
      </div>
      <div class="qmeta">TC: 1 USD = ${usdToMxn.toFixed(4)} MXN</div>
    `;
    return { items, totals, usdToMxn, discountRate };
  }
  form.addEventListener('input', computeTotals);

  // ===== Fotos guardadas (RTDB) =====
  async function renderSavedPhotos(photosRTDB) {
    if (!photosRTDB) { photosSavedBox.innerHTML = ''; return; }
    async function renderGroup(group, title) {
      if (!group) return `<div><strong>${title}</strong><div><em>Sin fotos</em></div></div>`;
      const snap = await rfx.rGet(rfx.rRef(rtdb, group.path));
      const val  = snap.val() || {};
      const imgs = Object.values(val).map(v =>
        `<img src="${v.dataUrl}" style="max-width:160px;margin:4px;border:1px solid #ddd;border-radius:6px;" />`
      ).join('');
      return `<div><strong>${title}</strong><div>${imgs || '<em>Sin fotos</em>'}</div></div>`;
    }
    const beforeHTML = await renderGroup(photosRTDB.before, 'Antes');
    const afterHTML  = await renderGroup(photosRTDB.after,  'Después');
    photosSavedBox.innerHTML = `<div class="card"><h4>Fotos guardadas</h4>${beforeHTML}${afterHTML}</div>`;
  }

  // ===== Cargar datos si es edición / o con preselección =====
  (async () => {
    let preselectTechId = '';
    let preselectClient = clientId || '';
    let preselectClientName = '';
    let preselectEquip  = equipmentId || '';
    let preselectEquipLabel = '';

    if (!isNew) {
      const snap = await fx.getDoc(fx.doc(db, 'orders', orderId));
      const o = snap.data();
      if (o) {
        form.folio.value   = o.folio ?? genFolio();
        form.date.value    = o.date?.toDate?.()?.toISOString?.().slice(0,10) ?? '';
        form.status.value  = o.status ?? 'En revisión';

        preselectClient      = o.clientId ?? preselectClient;
        preselectClientName  = o.clientNameSnapshot || '';
        preselectEquip       = o.equipmentId ?? preselectEquip;
        preselectEquipLabel  = o.equipmentSnapshot || '';

        preselectTechId = o.technicianId ?? '';
        form.symptom.value   = o.symptom ?? '';
        form.diagnosis.value = o.diagnosis ?? '';
        form.actions.value   = o.actions ?? '';

        // —— Rellenar cotizador desde la OST
        const q = o.quote || {};
        if (q.exchangeRate?.usdToMxn) form.usdToMxn.value = q.exchangeRate.usdToMxn;
        if (typeof q.discountPct === 'number') form.discountRate.value = (q.discountPct * 100).toString();
        if (typeof q.discountRate === 'number') form.discountRate.value = (q.discountRate * 100).toString(); // compat

        fillRows('parts',       Array.isArray(q.parts)       ? q.parts       : []);
        fillRows('consumables', Array.isArray(q.consumables) ? q.consumables : []);
        fillRows('labor',       Array.isArray(q.labor)       ? q.labor       : []);

        await renderSavedPhotos(o.photosRTDB);
      }
    } else {
      form.date.value = new Date().toISOString().slice(0,10);
    }

    await loadClients(preselectClient, preselectClientName);
    if (preselectEquip) await loadEquipments(preselectClient, preselectEquip, preselectEquipLabel);
    await loadTechnicians(preselectTechId);

    computeTotals();
  })();

  // ===== Guardar OST + fotos =====
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = 'Guardando...';

    const chosenClientId    = hiddenClientId.value || '';
    const chosenEquipmentId = equipmentSelect.value || '';

    const chosenClient = allClients.find(c => c.id === chosenClientId);
    const clientNameSnapshot = chosenClient ? chosenClient.name : searchInput.value || '';
    const equipmentSnapshot  = equipmentSelect.options[equipmentSelect.selectedIndex]?.text || '';

    const { items, totals, usdToMxn, discountRate } = computeTotals();

    const base = {
      folio: form.folio.value.trim(),
      date: fx.Timestamp.fromDate(new Date(form.date.value)),
      status: form.status.value,
      clientId: chosenClientId,
      equipmentId: chosenEquipmentId,
      clientNameSnapshot,
      equipmentSnapshot,
      technicianId: techSelect.value.trim() || '',
      technicianName: techSelect.options[techSelect.selectedIndex]?.text || '',
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

      async function fileToDataUrlCompressed(file, maxW = 1280, quality = 0.72) {
        if (!file || !file.type?.startsWith('image/')) throw new Error('Archivo no es una imagen válida');
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
      // Convierte cualquier cosa a número válido para Firestore (0 si viene undefined/NaN)
      const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);


      // Guardamos el descuento y los totales ya descontados
const mx = {
  subtotal:  num(totals.mx?.subtotal),
  discount:  num(totals.mx?.discount),
  total:     num(totals.mx?.total),
};
const us = {
  subtotal:  num(totals.us?.subtotal),
  discount:  num(totals.us?.discount),
  total:     num(totals.us?.total),
};
      // Guardamos el descuento y los totales ya descontados

const update = {
  quote: {
    ...items,
    // porcentaje 0..1
    discountRate: num(discountRate),
    exchangeRate: { usdToMxn: num(usdToMxn), setAt: fx.serverTimestamp() },
    totals: {
      subtotalMXN:  mx.subtotal,
      discountMXN:  mx.discount,
      grandTotalMXN: mx.total,
      subtotalUSD:   us.subtotal,
      discountUSD:   us.discount,
      grandTotalUSD: us.total
    }
  },
  photosRTDB: {
    before: upBefore.keys.length ? upBefore : null,
    after:  upAfter.keys.length  ? upAfter  : null
  },
  updatedAt: fx.serverTimestamp()
};


      

      await fx.updateDoc(fx.doc(db, 'orders', orderId), update);
      await logAction(!base.createdAt ? 'UPDATE_OST' : 'CREATE_OST', 'order', orderId, { folio: base.folio });

      await renderSavedPhotos(update.photosRTDB);

      msg.textContent = '✔ Guardado';
      alert('OST guardada correctamente');
    } catch (err) {
      console.error('[ORDERS] save error', err);
      msg.textContent = '✖ Error al guardar: ' + (err?.message || String(err));
    }
  });

  // Imprimir
  const btnPrint = el.querySelector('#btnPrint');
  btnPrint.addEventListener('click', () => {
    if (!orderId) return alert('Primero guarda la OST para poder imprimir.');
    location.hash = `#/print?id=${orderId}`;
  });
}

// —— Estilos para el resumen de cotización (se inyectan una sola vez)
function ensureQuoteStyles() {
  if (document.getElementById('quote-summary-styles')) return;
  const css = `
  .quote-summary{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
  .quote-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:.85rem}
  .quote-hdr{font-weight:600;margin-bottom:.35rem;color:#6b7280;letter-spacing:.02em}
  .qrow{display:flex;justify-content:space-between;gap:.75rem;padding:.25rem 0}
  .qrow span{color:#374151}
  .qsep{height:1px;background:#eee;margin:.35rem 0}
  .qtotal strong{font-size:1.05rem}
  .qneg{color:#b91c1c}
  .qmeta{font-size:.85rem;color:#6b7280;margin-top:.25rem}
  `;
  const style = document.createElement('style');
  style.id = 'quote-summary-styles';
  style.textContent = css;
  document.head.appendChild(style);
}

// Formateador de moneda
const money = (v, c) => new Intl.NumberFormat('es-MX', { style:'currency', currency:c }).format(+v || 0);
