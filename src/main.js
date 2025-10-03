// src/main.js
import { auth, fx } from './firebase.js';
import { startRouter, registerRoute } from './router.js';
import DashboardView from './views/dashboard.view.js';
import ClientsView from './views/clients.view.js';
import OrdersView from './views/orders.view.js';
import LoginView from './views/login.view.js';
import { renderClientDetail } from './views/client-detail.view.js';
import { renderOrderDetail } from './views/order-detail.view.js';

// Ping para verificar carga
window.__ping = 'main.js cargado';

// Espera a que el DOM exista antes de tocar #app o .topbar
window.addEventListener('DOMContentLoaded', () => {
  console.log('[BOOT] DOMContentLoaded');

  // ===== Referencias seguras al DOM =====
  const app = document.getElementById('app');
  if (!app) {
    console.error('[BOOT] No existe #app en tu HTML. Agrega <main id="app"></main>.');
    return;
  }

  const topbar = document.querySelector('.topbar');

  // ===== Router: registro de rutas =====
  registerRoute('#/login', () => {
    console.log('[ROUTE] #/login');
    app.replaceChildren(LoginView()); // LoginView imprime [LOGIN VIEW] render
  });

  registerRoute('#/dashboard', () => app.replaceChildren(DashboardView()));
  registerRoute('#/clients',   () => app.replaceChildren(ClientsView()));
  registerRoute('#/orders',    () => app.replaceChildren(OrdersView()));

  // Rutas detalle (expuestas en window porque se llaman desde href onclick)
  window.renderClientDetail = renderClientDetail;
  window.renderOrderDetail  = renderOrderDetail;

  // ===== Guard de rutas protegidas =====
  function protectRoutes() {
    const protectedPaths = ['#/dashboard', '#/clients', '#/orders'];
    const wants = (location.hash || '#/login').split('?')[0];
    const user  = auth.currentUser;

    console.log('[ROUTER] protectRoutes check', { wants, uid: user?.uid || null });

    if (!user && protectedPaths.includes(wants)) {
      console.warn('[ROUTER] blocked (no auth) → redirect to #/login');
      location.hash = '#/login';
      return true;
    }
    return false;
  }

  window.addEventListener('hashchange', () => {
    console.log('[ROUTER] hashchange →', location.hash);
    protectRoutes();
    refreshTopbar(); // mantener topbar acorde a la ruta
  });

  // ===== Estado de autenticación =====
  fx.onAuthStateChanged(auth, (user) => {
    console.log('[AUTH] onAuthStateChanged', {
      logged: !!user,
      uid: user?.uid || null,
      email: user?.email || null
    });

    // Si inicia sesión en /login (o sin hash), redirige a dashboard
    if (user && (location.hash === '#/login' || !location.hash)) {
      console.log('[AUTH] redirect → #/dashboard');
      location.hash = '#/dashboard';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }

    // Si no hay sesión y se intenta ir a ruta protegida → login
    if (!user) protectRoutes();
  });

  // ===== Arranque del router =====
  startRouter('#/login');

  // ===== Mostrar/ocultar topbar en login =====
  function refreshTopbar() {
    if (!topbar) return;
    topbar.style.display = (location.hash === '#/login') ? 'none' : 'flex';
  }
  refreshTopbar();

  // ===== Soporte de login por formulario directo (si existe en el HTML) =====
  const form  = document.getElementById('loginForm');
  const email = document.getElementById('loginEmail');
  const pass  = document.getElementById('loginPass');
  const btn   = document.getElementById('btnLogin');

  console.log('[BOOT] elementos', {
    hasForm: !!form, hasEmail: !!email, hasPass: !!pass, hasBtn: !!btn
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const em = email.value.trim();
      const pw = pass.value.trim();
      console.log('[LOGIN] submit', { emailMasked: em.replace(/(.).+@/, '$1***@') });

      try {
        const cred = await fx.signInWithEmailAndPassword(auth, em, pw);
        console.log('[LOGIN] success', { uid: cred.user?.uid, email: cred.user?.email });

        location.hash = '#/dashboard';
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (err) {
        console.error('[LOGIN] error', { code: err?.code, message: err?.message, raw: err });
        alert((err?.code || 'Error') + ': ' + (err?.message || 'No se pudo iniciar sesión'));
      }
    });
  }
}); // <-- DOMContentLoaded

// ===== Errores globales =====
window.addEventListener('error', (ev) => {
  console.error('[GLOBAL ERROR]', ev.message, ev.error);
});
window.addEventListener('unhandledrejection', (ev) => {
  console.error('[GLOBAL PROMISE REJECTION]', ev.reason);
});
