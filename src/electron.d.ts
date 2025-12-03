export {};

declare global {
  type SaveResult = { ok: true; path: string } | { ok: false; error: string };
  type ReadResult = { ok: true; data: unknown; path?: string } | { ok: false; error: string };

  interface Window {
    electronAPI?: {
      saveData?: (name: string, json: unknown) => Promise<SaveResult>;
      readData?: (name: string) => Promise<ReadResult>;
      getUserDataPath?: () => Promise<string>;
      removeData?: (name: string) => Promise<void>;
      invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>;
    };
  }
}