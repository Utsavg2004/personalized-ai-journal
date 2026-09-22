/**
 * Minimal pub-sub toast bus.
 * Plain modules (like services/api.js) aren't React components and can't use
 * context/hooks, so this lets them fire a toast without prop-drilling a
 * notify function through every caller.
 */
let idCounter = 0;
const listeners = new Set();

export const subscribeToToasts = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const showToast = (message, type = 'info', duration = 4500) => {
  if (!message) return;
  const toast = { id: ++idCounter, message, type, duration };
  listeners.forEach((listener) => listener(toast));
  return toast.id;
};
