// src/views/order-detail.view.js
import { db, fx } from '../firebase.js';

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
      </div>

      <label>Problema / Síntoma <textarea name="symptom" rows="2"></textarea></label>
      <label>Diagnóstico / Causa <textarea name="diagnosis" rows="2"></textarea></label>
      <label>Acciones realizadas <textarea name="actions" rows="2"></textarea></label>

      <div id="msg" class="muted"></div>
      <button>Guardar OST</button>
    </form>
  `;
  app.replaceChildren(el);

  const form = el.querySelector('#form');
  const msg = el.querySelector('#msg');

  // Si es edición, carga los datos
  (async () => {
    if (!isNew) {
      const snap = await fx.getDoc(fx.doc(db, 'orders', orderId));
      const o = snap.data();
      if (o) {
        form.folio.value = o.folio || genFolio();
        form.date.value = o.date?.toDate?.()?.toISOString?.().slice(0, 10) ?? '';
        form.status.value = o.status || 'En revisión';
        form.clientId.value = o.clientId || '';
        form.equipmentId.value = o.equipmentId || '';
        form.symptom.value = o.symptom || '';
        form.diagnosis.value = o.diagnosis || '';
        form.actions.value = o.actions || '';
      }
    } else {
      // default hoy
      form.date.value = new Date().toISOString().slice(0, 10);
    }
  })();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = 'Guardando...';

    const payload = {
      folio: form.folio.value.trim(),
      date: fx.Timestamp.fromDate(new Date(form.date.value)),
      status: form.status.value,
      clientId: form.clientId.value.trim(),
      equipmentId: form.equipmentId.value.trim(),
      symptom: form.symptom.value.trim(),
      diagnosis: form.diagnosis.value.trim(),
      actions: form.actions.value.trim(),
      updatedAt: fx.serverTimestamp()
    };
    if (isNew) payload.createdAt = fx.serverTimestamp();

    try {
      if (isNew) {
        const ref = await fx.addDoc(fx.collection(db, 'orders'), payload);
        orderId = ref.id;
      } else {
        await fx.updateDoc(fx.doc(db, 'orders', orderId), payload);
      }
      msg.textContent = '✔ Guardado';
      alert('OST guardada correctamente');
    } catch (err) {
      console.error('[ORDERS] save error', err);
      msg.textContent = '✖ Error al guardar';
    }
  });
}
