import { useEffect } from "react";
import { useBeforeUnload, useBlocker } from "react-router-dom";

export function useUnsavedChangesProtection(when: boolean, message: string) {
  const blocker = useBlocker(when);

  useEffect(() => {
    if (blocker.state !== "blocked") {
      return;
    }

    if (window.confirm(message)) {
      blocker.proceed();
      return;
    }

    blocker.reset();
  }, [blocker, message]);

  useBeforeUnload(
    (event) => {
      if (!when) {
        return;
      }

      event.preventDefault();
      event.returnValue = message;
    },
    { capture: true },
  );

  return {
    confirmDiscardChanges() {
      return !when || window.confirm(message);
    },
  };
}
