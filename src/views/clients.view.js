// src/views/clients.view.js
import { db, fx } from '../firebase.js';
import { logAction } from '../logging.js';

export default function ClientsView() {
  const container = document.createElement('section');
  container.innerHTML = `
    <h1>Clientes</h1>
    <form id="formClient" class="card">
      <input name="name" placeholder="Nombre / Empresa" required />
      <input name="email" placeholder="Email" type="email" />
      <input name="phone" placeholder="Teléfono" />
      <button>Guardar</button>
    </form>
    <div id="list" class="list"></div>
  `;

  const listEl = container.querySelector('#list');
  const form = container.querySelector('#formClient');

  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const data = {
      name: fd.get('name'),
      contact: { email: fd.get('email'), phone: fd.get('phone') },
      createdAt: fx.serverTimestamp()
    };
    const ref = await fx.addDoc(fx.collection(db, 'clients'), data);
    await logAction('CREATE_CLIENT', { type: 'client', id: ref.id }, { name: data.name });
    form.reset();
    renderList();
  };

  async function renderList() {
    listEl.innerHTML = 'Cargando...';
    const snap = await fx.getDocs(fx.query(fx.collection(db, 'clients'), fx.orderBy('name')));
    listEl.innerHTML = '';
    snap.forEach(docu => {
      const c = docu.data();
      const card = document.createElement('div');
      card.className = 'row';
      card.innerHTML = `
        <div>
          <strong>${c.name}</strong><br/>
          <small>${c.contact?.email ?? ''} • ${c.contact?.phone ?? ''}</small>
        </div>
        <div>
          <a href="#/clients" onclick="renderClientDetail('${docu.id}')">Abrir</a>
        </div>
      `;
      listEl.appendChild(card);
    });
  }

  renderList();
  return container;
}
