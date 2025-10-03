// src/views/client-detail.view.js
import { db, fx } from '../firebase.js';

export function renderClientDetail(clientId) {
  const app = document.getElementById('app');
  const section = document.createElement('section');
  section.innerHTML = `
    <a href="#/clients">← Volver</a>
    <h2>Cliente</h2>
    <div id="clientBox" class="card">Cargando...</div>

    <h3>Equipos</h3>
    <form id="formEq" class="card">
      <input name="serialNumber" placeholder="Núm. de Serie" required />
      <input name="brand" placeholder="Marca" />
      <input name="model" placeholder="Modelo" />
      <button>Agregar equipo</button>
    </form>
    <div id="eqList"></div>

    <h3>Órdenes (OST)</h3>
    <div id="ordList"></div>
  `;
  app.replaceChildren(section);

  const clientBox = section.querySelector('#clientBox');
  const eqForm = section.querySelector('#formEq');
  const eqList = section.querySelector('#eqList');
  const ordList = section.querySelector('#ordList');

  (async () => {
    const cRef = fx.doc(db, 'clients', clientId);
    const cDoc = await fx.getDoc(cRef);
    const c = cDoc.data();
    clientBox.innerHTML = `<strong>${c.name}</strong><br>
      ${c.contact?.email ?? ''} • ${c.contact?.phone ?? ''}`;

    // Equipos del cliente
    async function loadEquipments() {
      eqList.innerHTML = 'Cargando equipos...';
      const q = fx.query(fx.collection(db, 'equipments'), fx.where('clientId', '==', clientId));
      const snap = await fx.getDocs(q);
      eqList.innerHTML = '';
      snap.forEach(d => {
        const e = d.data();
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `
          <div>
            <strong>${e.serialNumber}</strong> — ${e.brand ?? ''} ${e.model ?? ''}
          </div>
          <div>
            <a href="#/orders" onclick="renderOrderDetail(null,'${clientId}','${d.id}')">Nueva OST</a>
          </div>
        `;
        eqList.appendChild(row);
      });
    }

    // Órdenes del cliente
    async function loadOrders() {
      ordList.innerHTML = 'Cargando órdenes...';
      const q = fx.query(fx.collection(db, 'service_orders'), fx.where('clientId', '==', clientId), fx.orderBy('createdAt', 'desc'));
      const snap = await fx.getDocs(q);
      ordList.innerHTML = '';
      snap.forEach(d => {
        const o = d.data();
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `
          <div>
            <strong>Folio:</strong> ${o.folio} • <em>${o.status}</em><br>
            <small>Equipo: ${o.equipmentId}</small>
          </div>
          <div><a href="#/orders" onclick="renderOrderDetail('${d.id}')">Abrir</a></div>
        `;
        ordList.appendChild(row);
      });
    }

    eqForm.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(eqForm);
      await fx.addDoc(fx.collection(db, 'equipments'), {
        clientId,
        serialNumber: fd.get('serialNumber'),
        brand: fd.get('brand'),
        model: fd.get('model'),
        createdAt: fx.serverTimestamp()
      });
      eqForm.reset();
      loadEquipments();
    };

    loadEquipments();
    loadOrders();
  })();
}
