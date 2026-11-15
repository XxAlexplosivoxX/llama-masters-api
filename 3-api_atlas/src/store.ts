// Where the export files live: R2 on Cloudflare, a local folder under Bun.

export interface StoredFile {
  body: ReadableStream | null; // null when the caller only needs the ETag (not modified)
  etag: string; // quoted, ready for the ETag header
  size: number;
}

export interface Store {
  /** The file at `key`, or null. With `ifNoneMatch` equal to its ETag, the body is omitted. */
  get(key: string, ifNoneMatch?: string | null): Promise<StoredFile | null>;
}

/** Minimal shape of the R2 binding we use, so this file needs no Workers types. */
interface R2ObjectLike {
  httpEtag: string;
  size: number;
  body?: ReadableStream;
}
export interface R2BucketLike {
  get(key: string, options?: { onlyIf?: { etagDoesNotMatch?: string } }): Promise<R2ObjectLike | null>;
}

export class R2Store implements Store {
  constructor(private readonly bucket: R2BucketLike) {}

  async get(key: string, ifNoneMatch?: string | null): Promise<StoredFile | null> {
    const etag = ifNoneMatch?.replace(/^W\//, "").replaceAll('"', "");
    const object = await this.bucket.get(key, etag ? { onlyIf: { etagDoesNotMatch: etag } } : undefined);
    if (!object) return null;
    // R2 returns the object without a body when the onlyIf condition fails (ETag matched)
    return { body: object.body ?? null, etag: object.httpEtag, size: object.size };
  }
}
