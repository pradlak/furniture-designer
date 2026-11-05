// Minimalny, obserwowalny magazyn stanu z opcjonalną historią (cofnij / ponów).
// Subskrybenci dostają (state, meta) — meta pozwala np. oznaczyć pełną podmianę projektu.
//
// Historia: zmiany następujące szybko po sobie (pisanie w polu, przeciąganie myszką)
// łączą się w jeden krok cofania.
export function createStore(initialState, { history = false, limit = 100, mergeWithinMs = 600 } = {}) {
  let state = initialState;
  const subscribers = new Set();
  const past = [];
  const future = [];
  let lastChange = 0;

  const notify = (meta) => subscribers.forEach((fn) => fn(state, meta));

  return {
    get: () => state,
    set(updater, meta = {}) {
      const next = typeof updater === 'function' ? updater(state) : updater;
      if (next === state) return;
      if (history) {
        const now = Date.now();
        if (meta.replace || now - lastChange > mergeWithinMs) {
          past.push(state);
          if (past.length > limit) past.shift();
        }
        lastChange = now;
        future.length = 0;
      }
      state = next;
      notify(meta);
    },
    undo() {
      if (!past.length) return;
      future.push(state);
      state = past.pop();
      lastChange = 0;
      notify({ replace: true, undo: true });
    },
    redo() {
      if (!future.length) return;
      past.push(state);
      state = future.pop();
      lastChange = 0;
      notify({ replace: true, undo: true });
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}
