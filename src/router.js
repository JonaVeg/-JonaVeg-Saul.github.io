// src/router.js
// Mantenemos Map para registro de rutas
const routes = new Map(); // '#/path' -> (ctx) => void

export function registerRoute(path, renderFn) {
  routes.set(path, renderFn);
}

// Util para obtener { path, query } desde el hash actual
function parseHash(hash) {
  const raw = hash || '';
  const [path, qs = ''] = raw.split('?');
  const params = new URLSearchParams(qs);
  const query = {};
  params.forEach((v, k) => (query[k] = v));
  return { path, query };
}

export function startRouter(defaultPath = '#/dashboard') {
  const mount = () => {
    // ¡Ojo! usamos let para poder manipularlo si hace falta
    let fullHash = location.hash || defaultPath; // p.ej. "#/print?id=123"
    const { path, query } = parseHash(fullHash); // "#/print", { id: "123" }

    const render =
      routes.get(path) ||
      routes.get(defaultPath);

    if (typeof render === 'function') {
      render({ path, query, fullHash });
    } else {
      // fallback simple
      const fallback = routes.get('#/dashboard') || routes.get('#/login');
      fallback?.({ path, query, fullHash });
    }
  };

  window.addEventListener('hashchange', mount);
  mount();
}
