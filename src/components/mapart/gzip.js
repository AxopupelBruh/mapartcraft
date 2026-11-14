import { gzip as pakoGzip } from "pako";

// Compresses data as gzip.
//
// The native CompressionStream does the compression in the background, so a
// large map does not freeze the interface while it is being written. The pako
// fallback is only used in browsers without CompressionStream.
export async function gzipBytes(data) {
  if (typeof CompressionStream === "undefined" || typeof Response === "undefined") {
    return pakoGzip(data);
  }
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}
