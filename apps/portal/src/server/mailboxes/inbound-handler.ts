import { defineEmail } from 'void/email';
import { MAX_INBOUND_BYTES } from './inbox-types.ts';
import type { IngestResult, RawDelivery } from './ingest';

export class InboundSizeError extends Error {
  readonly name = 'InboundSizeError';
}

export async function readInboundBytes(stream: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
  const reader = stream.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_INBOUND_BYTES) {
        await reader.cancel();
        throw new InboundSizeError();
      }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}

export function inboundHandler(ingest: (delivery: RawDelivery, ctx: ExecutionContext) => Promise<IngestResult>) {
  return defineEmail(async (message, _env, ctx) => {
    if (message.rawSize > MAX_INBOUND_BYTES) { message.setReject('Message exceeds 25 MiB'); return; }
    try {
      const result = await ingest({ from: message.from, to: message.to, raw: await readInboundBytes(message.raw) }, ctx);
      if (result.state === 'rejected') message.setReject(result.reason);
    } catch (error) {
      if (error instanceof InboundSizeError) { message.setReject('Message exceeds 25 MiB'); return; }
      throw error; // Storage failures surface to the transport, never silently accepted.
    }
  });
}
