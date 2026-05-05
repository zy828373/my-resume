import { useEffect, useState } from "react";
import { useReducedMotion as useFramerReducedMotion } from "framer-motion";

const STORAGE_KEY = "ui:motion";

function readUserPref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "off";
  } catch {
    return false;
  }
}

/**
 * Returns true when motion should be disabled — either because the OS prefers
 * reduced motion, or because the user has toggled motion off via the app's
 * settings (stored as `localStorage['ui:motion'] = 'off'`).
 *
 * Subscribes to storage events so toggling the preference in another tab
 * updates this hook live.
 */
export function useReducedMotion(): boolean {
  const osReduced = useFramerReducedMotion();
  const [userOff, setUserOff] = useState(readUserPref);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setUserOff(readUserPref());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return Boolean(osReduced) || userOff;
}

export function setMotionPreference(enabled: boolean): void {
  try {
    if (enabled) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, "off");
    }
    window.dispatchEvent(
      new StorageEvent("storage", { key: STORAGE_KEY, newValue: enabled ? null : "off" }),
    );
  } catch {
    /* noop */
  }
}
