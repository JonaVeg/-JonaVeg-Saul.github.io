// src/views/clients.view.js
import { db, fx } from '../firebase.js';

export default function ClientsView() {
  console.log('[CLIENTS VIEW] render');

  const section = document.createElement('section');
  section.className = 'clients-section';
  section.innerHTML = `
    <h1>Clientes registrados</h1>
    <p class="muted">Lista sincronizada desde Firestore</p>

    <details class="card" id="addBox">
      <summary>➕ Agregar cliente</summary>
      <form id="formAdd" class="grid">
        <input name="name" placeholder="Nombre completo" required />
        <input name="phone" placeholder="Teléfono (10 dígitos)" />
        <input type="email" name="email" placeholder="Correo" />
        <input name="address" placeholder="Dirección (opcional)" />
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
        </tr>
      </thead>
      <tbody id="clientsBody">
        <tr><td colspan="3" style="text-align:center;">Cargando...</td></tr>
      </tbody>
    </table>
  `;

  const tbody = section.querySelector('#clientsBody');
  const btnReload = section.querySelector('#btnReload');
  const formAdd = section.querySelector('#formAdd');
  const addMsg = section.querySelector('#addMsg');

  async function loadClients() {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Cargando...</td></tr>`;
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
          </tr>
        `);
      });
      tbody.innerHTML = rows.length
        ? rows.join('')
        : `<tr><td colspan="3" style="text-align:center;color:#888;">Sin clientes registrados</td></tr>`;

      // filas clicables → detalle
      tbody.querySelectorAll('tr.row-click').forEach(tr => {
        tr.addEventListener('click', () => {
          const id = tr.getAttribute('data-id');
          // usa helper global registrado en main.js
          window.renderClientDetail(id);
        });
      });

      console.log(`[CLIENTS] ${rows.length} registros cargados`);
    } catch (err) {
      console.error('[CLIENTS] Error al leer Firestore', err);
      tbody.innerHTML = `<tr><td colspan="3" style="color:red;">Error al cargar datos</td></tr>`;
    }
  }

  formAdd.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(formAdd);
    const data = {
      name: fd.get('name')?.toString().trim(),
      phone: fd.get('phone')?.toString().trim() || '',
      email: fd.get('email')?.toString().trim() || '',
      address: fd.get('address')?.toString().trim() || '',
      createdAt: fx.serverTimestamp(),
    };
    if (!data.name) return;

    addMsg.textContent = 'Guardando...';
    try {
      await fx.addDoc(fx.collection(db, 'clients'), data);
      addMsg.textContent = '✔ Cliente agregado';
      formAdd.reset();
      await loadClients();
    } catch (err) {
      console.error('[CLIENTS] Error al crear cliente', err);
      addMsg.textContent = '✖ Error al guardar';
    }
  });

  btnReload.addEventListener('click', loadClients);
  loadClients();

  return section;
}
