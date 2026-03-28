type BridgeEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
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
    if (!parsed.ok || parsed.data === undefined) {
      throw new Error(parsed.error ?? "Unknown desktop bridge error.");
    }

    return parsed.data;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unknown desktop bridge error.";
    throw new Error(message);
  }
}
