import { auth, fx } from './firebase.js';
import { startRouter, registerRoute } from './router.js';
import DashboardView from './views/dashboard.view.js';
import ClientsView from './views/clients.view.js';
import OrdersView from './views/orders.view.js';
import LoginView from './views/login.view.js';
import { renderClientDetail } from './views/client-detail.view.js';
import { renderOrderDetail } from './views/order-detail.view.js';
import EquipmentHistoryView from './views/equipment-history.view.js';
import OrderPrintView from './views/order-print.view.js';

// Ping para verificar carga
window.__ping = 'main.js cargado';

window.addEventListener('DOMContentLoaded', () => {
  console.log('[BOOT] DOMContentLoaded');

  // ===== Referencias =====
  const app = document.getElementById('app');
  const topbar = document.querySelector('.topbar');

  if (!app) {
    console.error('[BOOT] No existe #app en tu HTML. Agrega <main id="app"></main>.');
    return;
  }

  // ===== Rutas =====
  registerRoute('#/login', () => app.replaceChildren(LoginView()));
  registerRoute('#/dashboard', () => app.replaceChildren(DashboardView()));
  registerRoute('#/clients',   () => app.replaceChildren(ClientsView()));
  registerRoute('#/orders',    () => app.replaceChildren(OrdersView()));
  registerRoute('#/history',   () => app.replaceChildren(EquipmentHistoryView()));
  registerRoute('#/print',     () => OrderPrintView());

  // Rutas de detalle (globales)
  window.renderClientDetail = renderClientDetail;
  window.renderOrderDetail  = renderOrderDetail;

  // ===== Protección de rutas =====
  function protectRoutes() {
    const protectedPaths = ['#/dashboard', '#/clients', '#/orders', '#/history', '#/print'];
    const wants = (location.hash || '#/login').split('?')[0];
    const user  = auth.currentUser;

    if (!user && protectedPaths.includes(wants)) {
      console.warn('[ROUTER] bloqueado (no auth) → login');
      location.hash = '#/login';
      return true;
    }
    return false;
  }

  // ===== Topbar visible / oculta en login =====
  function refreshTopbar() {
    if (!topbar) return;
    const hide = (location.hash.split('?')[0] === '#/login');
    topbar.style.display = hide ? 'none' : 'flex';
  }

  // ===== Marca activo el link del menú =====
  function markActiveNav() {
    const route = (location.hash || '#/dashboard').split('?')[0];
    document.querySelectorAll('.mainnav a').forEach(a => {
      a.classList.toggle('active', a.getAttribute('data-route') === route);
    });
  }

  // ===== Eventos de hash =====
  window.addEventListener('hashchange', () => {
    console.log('[ROUTER] hashchange →', location.hash);
    protectRoutes();
    refreshTopbar();
    markActiveNav();
  });

  // ===== Estado de autenticación =====
  fx.onAuthStateChanged(auth, (user) => {
    console.log('[AUTH] onAuthStateChanged', {
      logged: !!user,
      uid: user?.uid || null,
      email: user?.email || null
    });

    if (user && (location.hash === '#/login' || !location.hash)) {
      location.hash = '#/dashboard';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }

    if (!user) protectRoutes();
  });

  // ===== Arranque inicial =====
  startRouter('#/login');
  refreshTopbar();
  markActiveNav();

  // ===== Login manual (si el form existe) =====
  const form  = document.getElementById('loginForm');
  const email = document.getElementById('loginEmail');
  const pass  = document.getElementById('loginPass');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const em = email.value.trim();
      const pw = pass.value.trim();

      try {
        const cred = await fx.signInWithEmailAndPassword(auth, em, pw);
        console.log('[LOGIN] success', { uid: cred.user?.uid, email: cred.user?.email });

        location.hash = '#/dashboard';
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (err) {
        console.error('[LOGIN] error', err);
        alert((err?.code || 'Error') + ': ' + (err?.message || 'No se pudo iniciar sesión'));
      }
    });
  }
});

// ===== Errores globales =====
window.addEventListener('error', (ev) => {
  console.error('[GLOBAL ERROR]', ev.message, ev.error);
});
window.addEventListener('unhandledrejection', (ev) => {
  console.error('[GLOBAL PROMISE REJECTION]', ev.reason);
});
