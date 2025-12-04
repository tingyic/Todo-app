export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

export async function subscribeForPush(publicVapidKey: string) {
  if (!("serviceWorker" in navigator)) throw new Error("No service worker");
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
  });
  return sub;
}

type ElectronFetchResultOk = { ok: true; publicKey?: string };
type ElectronFetchResultErr = { ok: false; error: string };
type ElectronFetchResult = ElectronFetchResultOk | ElectronFetchResultErr;

export async function getPushPublicKey(): Promise<string | null> {
  try {
    // Electron path (preload exposes fetchPushPublicKey)
    if (typeof window !== "undefined" && typeof (window as Window & { electronAPI?: unknown }).electronAPI === "object") {
      const maybeAPI = (window as Window & { electronAPI?: unknown }).electronAPI;
      // Narrow: check for fetchPushPublicKey function
      if (maybeAPI && typeof (maybeAPI as { fetchPushPublicKey?: unknown }).fetchPushPublicKey === "function") {
        // typed call
        const fn = (maybeAPI as { fetchPushPublicKey: () => Promise<ElectronFetchResult> }).fetchPushPublicKey;
        const resp = await fn();
        if (resp && resp.ok && typeof resp.publicKey === "string" && resp.publicKey.length > 0) {
          return resp.publicKey;
        }
        console.warn("electron fetchPushPublicKey failed or returned no key", resp);
        return null;
      }
    }

    // Web path: normal fetch (server must allow CORS)
    const r = await fetch("https://todo-app-wxtc.onrender.com/config/push-public-key", { method: "GET" });
    if (!r.ok) {
      console.warn("getPushPublicKey: server responded", r.status);
      return null;
    }
    const json = (await r.json()) as Record<string, unknown>;
    const pk = (json["publicKey"] ?? json["public_key"]) as string | undefined;
    if (typeof pk === "string" && pk.length > 0) return pk;
    console.warn("getPushPublicKey: response missing publicKey", json);
    return null;
  } catch (err) {
    console.warn("getPushPublicKey error", err);
    return null;
  }
}
