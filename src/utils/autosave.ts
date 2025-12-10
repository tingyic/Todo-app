type GetStateFn<T> = () => T;

type MaybeElectronAPI = {
  saveData?: (name: string, json: unknown) => Promise<unknown>;
  saveDataSync?: (name: string, json: unknown) => unknown;
};

function getElectronAPI(): MaybeElectronAPI | null {
  // avoid direct TS errors about window.electronAPI possibly missing
  const api = (typeof window !== "undefined" ? window.electronAPI : undefined) as MaybeElectronAPI | undefined;
  return api ?? null;
}

export function createAutoSave<T>({
  fileName,
  getState,
  debounceMs = 700,
}: {
  fileName: string;
  getState: GetStateFn<T>;
  debounceMs?: number;
}) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;

  async function doSaveAsync() {
    try {
      const state = getState();
      const api = getElectronAPI();
      if (api && typeof api.saveData === "function") {
        await api.saveData(fileName, state);
      } else {
        // no electron API available (browser/dev env)
        // try localStorage
        try {
          localStorage.setItem(fileName, JSON.stringify(state));
        } catch {
          // ignore
        }
      }
      pending = false;
    } catch (e) {     
      console.error("autosave async failed:", e);
    }
  }

  function scheduleSave() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      pending = true;
      void doSaveAsync();
    }, debounceMs);
  }

  return {
    notifyChange() {
      scheduleSave();
    },

    syncFlush() {
      // cancel pending async timer and write final state synchronously
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      try {
        const state = getState();
        const api = getElectronAPI();
        if (api && typeof api.saveDataSync === "function") {
          // prefer sync IPC if available
          api.saveDataSync(fileName, state);
        } else if (api && typeof api.saveData === "function") {
          // fallback to async save
          void api.saveData(fileName, state);
        } else {
          // final fallback: localStorage in a browser
          try {
            localStorage.setItem(fileName, JSON.stringify(state));
          } catch {
            // ignore
          }
        }
        pending = false;
      } catch (e) {
        console.error("autosave syncFlush failed:", e);
      }
    },

    isPending() {
      return pending || timer !== null;
    },
  };
}
export type AutoSaveHandle = ReturnType<typeof createAutoSave>;
