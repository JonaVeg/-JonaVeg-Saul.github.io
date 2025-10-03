// src/views/login.view.js
import { auth, fx } from '../firebase.js';

export default function LoginView() {
  console.log('[LOGIN VIEW] render');

  const el = document.createElement('section');
  el.className = 'auth-hero';
  el.innerHTML = `
    <div class="auth-card">
      <h1>Iniciar sesión</h1>
      <form id="loginForm" class="auth-form" novalidate>
        <label>
          <span>Email</span>
          <input id="loginEmail" type="email" placeholder="tucorreo@dominio.com"
                 required autocomplete="username" />
        </label>
        <label>
          <span>Contraseña</span>
          <input id="loginPass" type="password" placeholder="••••••••"
                 required autocomplete="current-password" />
        </label>
        <button id="btnLogin" type="submit" class="cta">Entrar</button>
        <div id="loginMsg" class="msg"></div>
      </form>
    </div>
  `;

  const form = el.querySelector('#loginForm');
  const msg  = el.querySelector('#loginMsg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = el.querySelector('#loginEmail').value.trim();
    const pwd   = el.querySelector('#loginPass').value.trim();

    console.log('[LOGIN] submit', { emailMasked: email.replace(/(.).+@/, '$1***@') });
    msg.textContent = 'Ingresando...';
    msg.classList.remove('error');

    try {
      const cred = await fx.signInWithEmailAndPassword(auth, email, pwd);
      console.log('[LOGIN] success', { uid: cred.user?.uid, email: cred.user?.email });

      // Redirige al dashboard y fuerza evento de router
      location.hash = '#/dashboard';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) {
      console.error('[LOGIN] error', { code: err?.code, message: err?.message, raw: err });
      msg.textContent = (err?.code || 'Error') + ': ' + (err?.message || 'No se pudo iniciar sesión');
      msg.classList.add('error');
    }
  });

  return el;
}
