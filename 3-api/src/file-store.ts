// Local folder store for the Bun server and tests.
import type { StoredFile, Store } from "./store";

export class FileStore implements Store {
  constructor(private readonly root: string) {}

  async get(key: string, ifNoneMatch?: string | null): Promise<StoredFile | null> {
    const file = Bun.file(`${this.root}/${key}`);
    if (!(await file.exists())) return null;
    const etag = `"${file.size.toString(16)}-${Math.floor(file.lastModified).toString(16)}"`;
    const body = ifNoneMatch === etag ? null : file.stream();
    return { body, etag, size: file.size };
  }
}
