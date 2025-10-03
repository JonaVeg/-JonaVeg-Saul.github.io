// src/router.js
const routes = new Map(); // '#/path' -> render()

export function registerRoute(path, renderFn) {
  routes.set(path, renderFn);
}

export function startRouter(defaultPath = '#/dashboard') {
  const mount = () => {
    const path = location.hash || defaultPath;
    const render = routes.get(path.split('?')[0]) || routes.get(defaultPath);
    render?.();
  };
  window.addEventListener('hashchange', mount);
  mount();
}
