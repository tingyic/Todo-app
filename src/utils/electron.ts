export type SaveResult = { ok: boolean; path?: string; error?: string };
export type ReadResult = { ok: boolean; data?: unknown; path?: string; error?: string };

export async function saveToDisk(name: string, json: unknown): Promise<SaveResult> {
  if (!window.electronAPI?.saveData) return { ok: false, error: 'no-electron-api' };
  try {
    return await window.electronAPI.saveData(name, json) as unknown as SaveResult;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function readFromDisk(name: string): Promise<ReadResult> {
  if (!window.electronAPI?.readData) return { ok: false, error: 'no-electron-api' };
  try {
    return await window.electronAPI.readData(name) as unknown as ReadResult;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function getUserDataPath(): Promise<string | null> {
  if (!window.electronAPI?.getUserDataPath) return null;
  try {
    return await window.electronAPI.getUserDataPath();
  } catch {
    return null;
  }
}