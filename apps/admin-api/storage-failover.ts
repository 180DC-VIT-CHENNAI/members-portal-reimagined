import { AwsClient } from 'aws4fetch';

/**
 * R2 with Backblaze B2 (S3-compatible API) as live failover.
 *
 * - Writes go to R2; the stored bytes are mirrored to B2 in the background.
 * - If an R2 write throws (outage), the write goes to B2 so it is not lost.
 * - Reads/lists fall back to B2 only when a read key is configured
 *   (B2_READ_KEY_ID/B2_READ_APPLICATION_KEY); the write key cannot read.
 *   With it, a missing R2 object is also looked up in B2, so files written
 *   during an outage stay readable after R2 recovers.
 * - Deletes require R2 (a B2-only delete would let the R2 copy resurface).
 *
 * B2 layout: one bucket, objects stored under `r2/<binding-lowercase>/<key>`,
 * the same layout the scheduled rclone copy uses.
 */

type B2Credentials = { keyId: string; applicationKey: string };

export type B2Config = {
  endpoint: string;
  bucket: string;
  write: B2Credentials;
  read: B2Credentials | null;
};

type WaitUntil = (promise: Promise<unknown>) => void;

const META_HEADER = 'x-amz-meta-r2-custom';

export function b2ConfigFromEnv(env: any): B2Config | null {
  const { B2_S3_ENDPOINT, B2_BUCKET, B2_KEY_ID, B2_APPLICATION_KEY, B2_READ_KEY_ID, B2_READ_APPLICATION_KEY } = env ?? {};
  if (!B2_S3_ENDPOINT || !B2_BUCKET || !B2_KEY_ID || !B2_APPLICATION_KEY) return null;
  return {
    endpoint: String(B2_S3_ENDPOINT).replace(/\/+$/, ''),
    bucket: B2_BUCKET,
    write: { keyId: B2_KEY_ID, applicationKey: B2_APPLICATION_KEY },
    read: B2_READ_KEY_ID && B2_READ_APPLICATION_KEY ? { keyId: B2_READ_KEY_ID, applicationKey: B2_READ_APPLICATION_KEY } : null,
  };
}

function regionOf(endpoint: string): string {
  return new URL(endpoint).hostname.match(/^s3\.([^.]+)\./)?.[1] ?? 'us-east-1';
}

async function toBytes(value: any): Promise<ArrayBuffer | string | null> {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  return new Response(value).arrayBuffer();
}

function b2Object(key: string, res: Response, withBody: boolean): any {
  const headers = res.headers;
  let customMetadata: Record<string, string> = {};
  try {
    customMetadata = JSON.parse(decodeURIComponent(headers.get(META_HEADER) || '%7B%7D'));
  } catch {
    customMetadata = {};
  }
  const contentType = headers.get('content-type') || undefined;
  const etag = (headers.get('etag') || '').replace(/"/g, '');
  const object: any = {
    key,
    size: Number(headers.get('content-length') || 0),
    etag,
    httpEtag: `"${etag}"`,
    uploaded: new Date(headers.get('last-modified') || Date.now()),
    httpMetadata: contentType ? { contentType } : {},
    customMetadata,
    writeHttpMetadata(target: Headers) { if (contentType) target.set('content-type', contentType); },
  };
  if (withBody) {
    object.body = res.body;
    object.bodyUsed = false;
    object.arrayBuffer = () => res.arrayBuffer();
    object.text = () => res.text();
    object.json = () => res.json();
    object.blob = () => res.blob();
  }
  return object;
}

function xmlValues(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1]);
}

function xmlDecode(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

export class FailoverBucket {
  private readonly writer: AwsClient;
  private readonly reader: AwsClient | null;
  private readonly r2: any;
  private readonly r2Name: string;
  private readonly b2: B2Config;
  private readonly waitUntil: WaitUntil;
  private readonly fetcher: typeof fetch;

  constructor(r2: any, r2Name: string, b2: B2Config, waitUntil: WaitUntil, fetcher: typeof fetch = fetch) {
    this.r2 = r2;
    this.r2Name = r2Name;
    this.b2 = b2;
    this.waitUntil = waitUntil;
    this.fetcher = fetcher;
    const client = (c: B2Credentials) => new AwsClient({ accessKeyId: c.keyId, secretAccessKey: c.applicationKey, service: 's3', region: regionOf(b2.endpoint) });
    this.writer = client(b2.write);
    this.reader = b2.read ? client(b2.read) : null;
  }

  private url(key = ''): string {
    const path = `r2/${this.r2Name}/${key}`.split('/').map(encodeURIComponent).join('/');
    return `${this.b2.endpoint}/${encodeURIComponent(this.b2.bucket)}/${path}`;
  }

  private async b2Send(client: AwsClient, url: string, init: RequestInit = {}): Promise<Response> {
    const signed = await client.sign(url, init);
    return this.fetcher(signed);
  }

  private async b2Put(key: string, bytes: ArrayBuffer | string, options: any = {}): Promise<void> {
    const headers: Record<string, string> = {};
    const contentType = options.httpMetadata?.contentType;
    if (contentType) headers['content-type'] = contentType;
    if (options.customMetadata && Object.keys(options.customMetadata).length) {
      headers[META_HEADER] = encodeURIComponent(JSON.stringify(options.customMetadata));
    }
    const res = await this.b2Send(this.writer, this.url(key), { method: 'PUT', headers, body: bytes });
    if (!res.ok) throw new Error(`B2 PUT ${res.status}`);
  }

  private mirror(task: () => Promise<unknown>, what: string): void {
    this.waitUntil(task().catch((e) => console.error(`[b2-mirror] ${what} failed: ${e?.message || e}`)));
  }

  async put(key: string, value: any, options: any = {}): Promise<any> {
    const bytes = await toBytes(value);
    try {
      const stored = await this.r2.put(key, bytes, options);
      if (bytes !== null) this.mirror(() => this.b2Put(key, bytes, options), `put ${this.r2Name}/${key}`);
      return stored;
    } catch (e) {
      if (bytes === null) throw e;
      console.error(`[r2-failover] put ${this.r2Name}/${key} -> B2: ${(e as any)?.message || e}`);
      await this.b2Put(key, bytes, options);
      return { key, size: typeof bytes === 'string' ? bytes.length : bytes.byteLength, customMetadata: options.customMetadata || {}, httpMetadata: options.httpMetadata || {} };
    }
  }

  private async b2Fetch(reader: AwsClient, key: string, method: 'GET' | 'HEAD'): Promise<any> {
    const res = await this.b2Send(reader, this.url(key), { method });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`B2 ${method} ${res.status}`);
    return b2Object(key, res, method === 'GET');
  }

  private async read(key: string, method: 'GET' | 'HEAD', primary: () => Promise<any>): Promise<any> {
    const reader = this.reader;
    if (!reader) return primary();
    let found: any;
    try {
      found = await primary();
    } catch (e) {
      console.error(`[r2-failover] ${method} ${this.r2Name}/${key} -> B2: ${(e as any)?.message || e}`);
      return this.b2Fetch(reader, key, method);
    }
    if (found) return found;
    try {
      return await this.b2Fetch(reader, key, method); // written to B2 during an R2 outage
    } catch {
      return null; // R2 is healthy and authoritative; B2 errors must not break a 404
    }
  }

  get(key: string, options?: any): Promise<any> {
    return this.read(key, 'GET', () => this.r2.get(key, options));
  }

  head(key: string): Promise<any> {
    return this.read(key, 'HEAD', () => this.r2.head(key));
  }

  async delete(keys: string | string[]): Promise<void> {
    await this.r2.delete(keys);
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      this.mirror(async () => {
        const res = await this.b2Send(this.writer, this.url(key), { method: 'DELETE' });
        if (!res.ok && res.status !== 404) throw new Error(`B2 DELETE ${res.status}`);
      }, `delete ${this.r2Name}/${key}`);
    }
  }

  async list(options: any = {}): Promise<any> {
    const reader = this.reader;
    if (!reader) return this.r2.list(options);
    try {
      return await this.r2.list(options);
    } catch (e) {
      console.error(`[r2-failover] list ${this.r2Name} -> B2: ${(e as any)?.message || e}`);
      return this.b2List(reader, options);
    }
  }

  private async b2List(reader: AwsClient, options: any): Promise<any> {
    const base = `r2/${this.r2Name}/`;
    const url = new URL(`${this.b2.endpoint}/${encodeURIComponent(this.b2.bucket)}`);
    url.searchParams.set('list-type', '2');
    url.searchParams.set('prefix', base + (options.prefix || ''));
    if (options.delimiter) url.searchParams.set('delimiter', options.delimiter);
    if (options.cursor) url.searchParams.set('continuation-token', options.cursor);
    if (options.limit) url.searchParams.set('max-keys', String(options.limit));
    const res = await this.b2Send(reader, url.toString(), { method: 'GET' });
    if (!res.ok) throw new Error(`B2 LIST ${res.status}`);
    const xml = await res.text();
    const objects = xmlValues(xml, 'Contents').map((entry) => ({
      key: xmlDecode(xmlValues(entry, 'Key')[0] || '').slice(base.length),
      size: Number(xmlValues(entry, 'Size')[0] || 0),
      etag: (xmlValues(entry, 'ETag')[0] || '').replace(/&quot;|"/g, ''),
      uploaded: new Date(xmlValues(entry, 'LastModified')[0] || 0),
      httpMetadata: {},
      customMetadata: {},
    }));
    const truncated = xmlValues(xml, 'IsTruncated')[0] === 'true';
    const cursor = truncated ? xmlDecode(xmlValues(xml, 'NextContinuationToken')[0] || '') : undefined;
    const delimitedPrefixes = xmlValues(xml, 'CommonPrefixes')
      .map((p) => xmlDecode(xmlValues(p, 'Prefix')[0] || '').slice(base.length));
    return { objects, truncated, ...(cursor ? { cursor } : {}), delimitedPrefixes };
  }
}

const R2_BINDINGS = ['CLUB_FILES', 'BLOG_IMAGES', 'CASE_STUDIES', 'GALLERY_CDN'] as const;

export function withStorageFailover(env: any, waitUntil: WaitUntil, fetcher: typeof fetch = fetch): any {
  const b2 = b2ConfigFromEnv(env);
  if (!b2) return env;
  const wrapped = { ...env };
  for (const binding of R2_BINDINGS) {
    if (!env[binding]) continue;
    wrapped[binding] = new FailoverBucket(env[binding], binding.toLowerCase(), b2, waitUntil, fetcher);
  }
  return wrapped;
}
