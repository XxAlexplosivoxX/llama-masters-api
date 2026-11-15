import { useEffect, useRef, useSyncExternalStore } from "react";

/** The popover the tour is showing; components open while it names them and close when the step ends. */
let current: string | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function setTourDemo(id: string | null) {
  if (id === current) return;
  current = id;
  listeners.forEach((listener) => listener());
}

export function useTourDemo(id: string, setOpen: (open: boolean) => void) {
  const active = useSyncExternalStore(subscribe, () => current === id);
  const was = useRef(false);
  useEffect(() => {
    if (active) setOpen(true);
    else if (was.current) setOpen(false);
    was.current = active;
  }, [active]);
}
