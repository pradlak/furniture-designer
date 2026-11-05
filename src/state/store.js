// Minimalny, obserwowalny magazyn stanu.
// Subskrybenci dostają (state, meta) — meta pozwala np. oznaczyć pełną podmianę projektu.
export function createStore(initialState) {
  let state = initialState;
  const subscribers = new Set();

  return {
    get: () => state,
    set(updater, meta = {}) {
      state = typeof updater === 'function' ? updater(state) : updater;
      subscribers.forEach((fn) => fn(state, meta));
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}
