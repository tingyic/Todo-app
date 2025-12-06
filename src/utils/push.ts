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

export async function getPushPublicKey(): Promise<string | null> {
  try {
    type ElectronAPI = {
      fetchPushPublicKey?: () => Promise<{ ok: boolean; publicKey?: string; error?: unknown }>;
    };

    const win = window as unknown as { electronAPI?: ElectronAPI };

    // Electron path
    if (typeof window !== "undefined" && win.electronAPI?.fetchPushPublicKey) {
      const resp = await win.electronAPI.fetchPushPublicKey();
      if (resp.ok) return resp.publicKey ?? null;
      console.warn("electron fetchPushPublicKey failed", resp.error);
      return null;
    }

    // Web path
    const r = await fetch("https://todo-app-wxtc.onrender.com/config/push-public-key", {
      method: "GET",
    });

    if (!r.ok) {
      console.warn("getPushPublicKey: server responded", r.status);
      return null;
    }

    const json: { publicKey?: string } = await r.json();
    return json.publicKey ?? null;
  } catch (err) {
    console.warn("getPushPublicKey error", err);
    return null;
  }
}
