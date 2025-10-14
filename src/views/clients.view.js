// src/views/clients.view.js
import { db, fx } from '../firebase.js';

export default function ClientsView() {
  console.log('[CLIENTS VIEW] render');

  const section = document.createElement('section');
  section.className = 'clients-section';
  section.innerHTML = `
    <h1>Clientes registrados</h1>
    <p class="muted">Lista sincronizada desde Firestore</p>

    <details class="card" id="addBox" open>
      <summary>➕ Agregar cliente</summary>
      <form id="formAdd" class="grid">
        <!-- Datos del cliente -->
        <input name="name" placeholder="Nombre completo" required />
        <input name="phone" placeholder="Teléfono (10 dígitos)" />
        <input type="email" name="email" placeholder="Correo" />
        <input name="address" placeholder="Dirección (opcional)" />

        <!-- Datos (opcionales) del primer equipo -->
        <hr style="grid-column:1/-1;opacity:.15">
        <div class="muted" style="grid-column:1/-1;margin-top:-.5rem">Primer equipo del cliente (opcional)</div>
        <input name="eqBrand" placeholder="Marca del equipo (opcional)" />
        <input name="eqModel" placeholder="Modelo del equipo (opcional)" />
        <input name="eqSerial" placeholder="Número de serie (opcional)" />

        <button>Guardar</button>
      </form>
      <div id="addMsg" class="muted"></div>
    </details>

    <button id="btnReload" class="cta">🔄 Recargar</button>

    <table class="clients-table">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Teléfono</th>
          <th>Correo</th>
          <th style="width:140px;">Acciones</th>
        </tr>
      </thead>
      <tbody id="clientsBody">
        <tr><td colspan="4" style="text-align:center;">Cargando...</td></tr>
      </tbody>
    </table>
  `;

  const tbody = section.querySelector('#clientsBody');
  const btnReload = section.querySelector('#btnReload');
  const formAdd = section.querySelector('#formAdd');
  const addMsg = section.querySelector('#addMsg');

  async function loadClients() {
    tbody.innerHTML = `<tr><td colspan="4" class="loading" style="text-align:center;">Cargando...</td></tr>`;
    try {
      const snap = await fx.getDocs(fx.collection(db, 'clients'));
      const rows = [];
      snap.forEach((docu) => {
        const id = docu.id;
        const c = docu.data();
        rows.push(`
          <tr data-id="${id}" class="row-click">
            <td>${c.name || '(Sin nombre)'}</td>
            <td>${c.phone || '-'}</td>
            <td>${c.email || '-'}</td>
            <td style="width:170px;">
              <button class="mini" data-open>Abrir</button>
              <button class="mini danger" data-del>Eliminar</button>
            </td>
          </tr>
        `);
      });
      
      tbody.innerHTML = rows.length
        ? rows.join('')
        : `<tr><td colspan="4" style="text-align:center;color:#888;">Sin clientes registrados</td></tr>`;

      // abrir detalle
      tbody.querySelectorAll('button[data-open]').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const id = btn.getAttribute('data-open');
          window.renderClientDetail(id);
        });
      });

      // eliminar
      tbody.querySelectorAll('button[data-del]').forEach(btn => {
        btn.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const id = btn.getAttribute('data-del');
          await deleteClientWithEquipments(id, btn);
        });
      });

      // click en fila también abre (excepto si fue un botón)
      tbody.querySelectorAll('tr.row-click').forEach(tr => {
  const id = tr.getAttribute('data-id');

  tr.querySelector('[data-open]').addEventListener('click', () => {
    window.renderClientDetail(id);
  });

  tr.querySelector('[data-del]').addEventListener('click', () => {
    deleteClientWithEquipments(id, tr);
  });
});

      console.log(`[CLIENTS] ${rows.length} registros cargados`);
    } catch (err) {
      console.error('[CLIENTS] Error al leer Firestore', err);
      tbody.innerHTML = `<tr><td colspan="4" style="color:red;">Error al cargar datos</td></tr>`;
    }
  }

  // === NUEVO: borrar cliente + equipos con batch ===
async function deleteClientWithEquipments(clientId, rowEl) {
  if (!confirm('¿Eliminar este cliente y sus equipos asociados? Esta acción no se puede deshacer.')) return;

  const btn = rowEl.querySelector('button[data-del]');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Eliminando...';

  try {
    // 1) Cargar equipos del cliente
    const eqQ = fx.query(
      fx.collection(db, 'equipments'),
      fx.where('clientId', '==', clientId)
    );
    const eqSnap = await fx.getDocs(eqQ);

    // 2) Borrado en batch (borra todos los equipos y el cliente)
    const batch = fx.writeBatch(db);
    eqSnap.forEach(d => batch.delete(fx.doc(db, 'equipments', d.id)));
    batch.delete(fx.doc(db, 'clients', clientId));

    await batch.commit();

    // 3) Quitar la fila de la tabla
    rowEl.remove();
  } catch (err) {
    console.error('[CLIENTS] delete error', err);
    alert('No se pudo eliminar el cliente. Revisa la consola para más detalle.');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}


  formAdd.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(formAdd);

  // Cliente
  const dataClient = {
    name: fd.get('name')?.toString().trim(),
    phone: fd.get('phone')?.toString().trim() || '',
    email: fd.get('email')?.toString().trim() || '',
    address: fd.get('address')?.toString().trim() || '',
    createdAt: fx.serverTimestamp(),
  };
  if (!dataClient.name) return;

  // Equipo (opcional)
  const eqBrand = fd.get('eqBrand')?.toString().trim() || '';
  const eqModel = fd.get('eqModel')?.toString().trim() || '';
  const eqSerial = fd.get('eqSerial')?.toString().trim() || '';

  addMsg.textContent = 'Guardando...';
  try {
    // 1) crear cliente
    const refClient = await fx.addDoc(fx.collection(db, 'clients'), dataClient);

    // 2) si hay número de serie, crear equipo vinculado
    if (eqSerial) {
      const equipmentPayload = {
        clientId: refClient.id,
        brand: eqBrand,
        model: eqModel,
        serial: eqSerial,
        serialUpper: eqSerial.toUpperCase(),
        createdAt: fx.serverTimestamp(),
      };
      await fx.addDoc(fx.collection(db, 'equipments'), equipmentPayload);
      console.log('[EQUIPMENTS] equipo creado y vinculado', equipmentPayload);
    }

    addMsg.textContent = '✔ Cliente agregado';
    addMsg.classList.add('show');
    setTimeout(() => addMsg.classList.remove('show'), 3000);
    formAdd.reset();
    await loadClients();
  } catch (err) {
    console.error('[CLIENTS] Error al crear cliente/equipo', err);
    addMsg.textContent = '✖ Error al guardar';
    addMsg.classList.add('show');
    setTimeout(() => addMsg.classList.remove('show'), 3000);
  }
});

  btnReload.addEventListener('click', loadClients);
  loadClients();

  return section;
}
