import { useEffect, useState } from "react";

type InitialValue<T> = T | (() => T);

function resolveInitialValue<T>(initialValue: InitialValue<T>) {
  return typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
}

export function useLocalStorageState<T>(key: string, initialValue: InitialValue<T>) {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") {
      return resolveInitialValue(initialValue);
    }

    try {
      const stored = window.localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : resolveInitialValue(initialValue);
    } catch {
      return resolveInitialValue(initialValue);
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      return;
    }
  }, [key, state]);

  const clear = () => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      return;
    }
  };

  return [state, setState, clear] as const;
}
