type BridgeErrorPayload = {
  message: string;
  code?: string;
  command?: string;
  details?: unknown;
};

type BridgeEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: string | BridgeErrorPayload;
};

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function getBridgeErrorMessage(error: BridgeEnvelope<unknown>["error"]) {
  if (!error) {
    return "Unknown desktop bridge error.";
  }

  if (typeof error === "string") {
    return error;
  }

  return error.message || "Unknown desktop bridge error.";
}

function getThrownErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    try {
      const parsed = JSON.parse(error) as BridgeEnvelope<unknown>;
      return getBridgeErrorMessage(parsed.error);
    } catch {
      return error;
    }
  }

  return "Unknown desktop bridge error.";
}

export async function invokeBridge<T>(
  command: string,
  payload: unknown,
  fallback: () => T,
): Promise<T> {
  if (!isTauriRuntime()) {
    return fallback();
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const response = await invoke<string>("desktop_bridge", {
      command,
      payload: payload ? JSON.stringify(payload) : null,
    });
    const parsed = JSON.parse(response) as BridgeEnvelope<T>;
    if (!parsed.ok) {
      throw new Error(getBridgeErrorMessage(parsed.error));
    }

    return parsed.data as T;
  } catch (error) {
    throw new Error(getThrownErrorMessage(error));
  }
}
