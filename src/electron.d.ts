export {};

declare global {
  type SaveResult = { ok: true; path: string } | { ok: false; error: string };
  type ReadResult = { ok: true; data: unknown; path?: string } | { ok: false; error: string };

  interface AutoSaveHandle {
    notifyChange: () => void;
    syncFlush: () => void;
    isPending?: () => boolean;
  }

  interface Window {
    electronAPI?: {
      saveData?: (name: string, json: unknown) => Promise<SaveResult>;
      readData?: (name: string) => Promise<ReadResult>;
      getUserDataPath?: () => Promise<string>;
      removeData?: (name: string) => Promise<void>;
      invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>;
      saveDataSync?: (name: string, json: unknown) => unknown;
    };

    __APP_AUTOSAVE_HANDLE?: AutoSaveHandle;
  }
}