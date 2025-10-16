// src/views/login.view.js
import { auth, fx } from '../firebase.js';

export default function LoginView() {
  console.log('[LOGIN VIEW] render');

  const el = document.createElement('section');
  el.className = 'auth-hero';
  el.innerHTML = `
    <style>
      .auth-card [hidden]{display:none!important}
      .auth-card .actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem}
      .auth-card .msg{margin-top:.5rem;font-size:.9rem}
      .auth-card .msg.error{color:#b91c1c}
      .auth-card .msg.ok{color:#0c7a2e}
      .auth-card .muted{opacity:.8}
    </style>

    <div class="auth-card">
      <h1>Iniciar sesión</h1>

      <!-- Formulario de login -->
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

      <!-- Tarjeta de verificación (se muestra cuando el correo NO está verificado) -->
      <div id="verifyCard" hidden>
        <p class="muted">
          Hemos enviado un correo de verificación a: <strong id="vEmail"></strong>.
          Abre el enlace en tu correo para continuar. Revisa tu bandeja de entrada o spam.
        </p>
        <div class="actions">
          <button id="btnResend" type="button">Reenviar correo</button>
          <button id="btnBackLogin" type="button" class="muted">Ya verifiqué / Volver a iniciar sesión</button>
        </div>
        <div id="vMsg" class="msg"></div>
      </div>
    </div>
  `;

  // Elementos
  const form        = el.querySelector('#loginForm');
  const msg         = el.querySelector('#loginMsg');
  const btnLogin    = el.querySelector('#btnLogin');

  const verifyCard  = el.querySelector('#verifyCard');
  const vEmailEl    = el.querySelector('#vEmail');
  const btnResend   = el.querySelector('#btnResend');
  const btnBack     = el.querySelector('#btnBackLogin');
  const vMsg        = el.querySelector('#vMsg');

  // Helpers UI
  function showLogin(){
    form.hidden = false;
    verifyCard.hidden = true;
    msg.textContent = '';
    vMsg.textContent = '';
  }
  function showVerify(email){
    form.hidden = true;
    verifyCard.hidden = false;
    vEmailEl.textContent = email || '(desconocido)';
    vMsg.textContent = '';
  }

  // Cooldown local para evitar spam al endpoint de verificación
  const cooldownKey = (email) => `evr:verify_cooldown:${(email||'').toLowerCase()}`;
  const COOLDOWN_SEC = 120; // 2 minutos

  async function trySendVerification(user, email) {
    const key = cooldownKey(email);
    const last = Number(localStorage.getItem(key) || 0);
    const now  = Math.floor(Date.now() / 1000);
    const left = last ? (last + COOLDOWN_SEC - now) : 0;

    if (left > 0) {
      vMsg.classList.remove('error','ok');
      vMsg.textContent = `Debes esperar ${left}s para reenviar el correo.`;
      return false;
    }

    try {
      await fx.sendEmailVerification(user, {
        url: `${location.origin}/public/index2.html#/login?afterVerify=1`,
        handleCodeInApp: true
      });
      localStorage.setItem(key, String(now));
      vMsg.classList.remove('error'); vMsg.classList.add('ok');
      vMsg.textContent = '✔ Correo de verificación enviado. Revisa tu bandeja (o spam).';
      return true;
    } catch (err) {
      console.warn('[AUTH] sendEmailVerification error', err);
      vMsg.classList.remove('ok'); vMsg.classList.add('error');
      const code = err?.code || '';
      if (code.includes('too-many-requests')) {
        vMsg.textContent = 'Demasiados intentos seguidos. Intenta de nuevo más tarde.';
      } else if (code.includes('quota-exceeded')) {
        vMsg.textContent = 'Se alcanzó el límite de envíos. Intenta de nuevo más tarde.';
      } else {
        vMsg.textContent = 'No se pudo enviar el correo de verificación. Intenta más tarde.';
      }
      return false;
    }
  }

  // Envío de formulario
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = el.querySelector('#loginEmail').value.trim();
    const pwd   = el.querySelector('#loginPass').value.trim();

    const emailMasked = email.replace(/(.).+@/, '$1***@');
    console.log('[LOGIN] submit', { emailMasked });

    btnLogin.disabled = true;
    msg.classList.remove('error','ok');
    msg.textContent = 'Ingresando...';

    try {
      const cred = await fx.signInWithEmailAndPassword(auth, email, pwd);
      const user = cred.user;
      console.log('[LOGIN] success', { uid: user?.uid, email: user?.email });

      if (user?.emailVerified) {
        // ✔ Verificado → al dashboard
        msg.textContent = '';
        location.hash = '#/dashboard';
        window.dispatchEvent(new HashChangeEvent('hashchange'));
        return;
      }

      // ❌ No verificado → enviamos correo (respetando cooldown), cerramos sesión y mostramos tarjeta
      const sent = await trySendVerification(user, email);

      // 👇 Aviso tipo alert cuando se envía el correo
      if (sent) {
        alert(`Te enviamos un correo de verificación a:\n\n${email}\n\nAbre el enlace del mensaje para activar tu cuenta. Revisa también la carpeta de SPAM.`);
      }

      try { await fx.signOut(auth); } catch {}
      showVerify(email);
      msg.textContent = '';

    } catch (err) {
      console.error('[LOGIN] error', { code: err?.code, message: err?.message, raw: err });
      btnLogin.disabled = false;
      msg.classList.remove('ok'); msg.classList.add('error');
      msg.textContent = (err?.code || 'Error') + ': ' + (err?.message || 'No se pudo iniciar sesión');
    } finally {
      btnLogin.disabled = false;
    }
  });

  // Reenviar (pedimos que reingrese credenciales para reautenticación limpia y respetar cooldown)
  btnResend.addEventListener('click', () => {
    vMsg.classList.remove('error','ok');
    vMsg.textContent = 'Ingresa de nuevo tu correo y contraseña para reenviar el email.';
    showLogin();
  });

  // “Ya verifiqué” / Volver a iniciar sesión
  btnBack.addEventListener('click', () => {
    vMsg.textContent = '';
    showLogin();
  });

  // Si viene con ?afterVerify=1 (después de hacer clic en el correo), solo mostramos el login
  try {
    const usp = new URLSearchParams(location.hash.split('?')[1] || '');
    if (usp.get('afterVerify') === '1') showLogin();
  } catch {}

  return el;
}
