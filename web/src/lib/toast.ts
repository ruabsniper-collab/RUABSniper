// Minimal pub/sub toast store. No context provider needed -- there's only
// ever one <ToastHost/>, mounted once in App.tsx -- so any lib or component
// anywhere in the tree can call showToast() directly, the same way they'd
// call haptic() from lib/haptics.ts.
export type Toast = { id: number; message: string; kind: "default" | "success" };

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(toasts);
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => listeners.delete(listener);
}

export function showToast(message: string, kind: Toast["kind"] = "default") {
  const id = nextId++;
  toasts = [...toasts, { id, message, kind }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 2400);
}
