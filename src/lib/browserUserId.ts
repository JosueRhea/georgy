const STORAGE_KEY = "georgy_browser_user_id";

/**
 * Returns a persistent user ID for this browser/device.
 * Stored in localStorage so it survives reloads and is reused when creating sessions and adding orders.
 */
export function getOrCreateBrowserUserId(): string {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id && typeof crypto !== "undefined" && crypto.randomUUID) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    if (!id) {
      id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}
