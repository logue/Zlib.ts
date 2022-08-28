import Adler32 from './Adler32';
import Crc32 from './Crc32';
import Deflate from './Deflate';
import Gunzip from './Gunzip';
import Meta from './Meta';
import Gzip from './Gzip';
import Inflate from './Inflate';
import InflateStream from './InflateStream';
import RawDeflate from './RawDeflate';
import RawInflate from './RawInflate';
import RawInflateStream from './RawInflateStream';
import Zip from './Zip';
import type DeflateOptionInterface from './interfaces/DeflateOptionInterface';
import type InflateOptionInterface from './interfaces/InflateOptionInterface';
import type GzipOptionInterface from './interfaces/GzipOptionInterface';

/**
 * Zlib namespace. Zlib の仕様に準拠した圧縮は Zlib.Deflate で実装
 * されている. これは Inflate との共存を考慮している為.
 */
const Zlib = {
  version: Meta.version,
  build: Meta.date,
  Adler32,
  Crc32,
  Deflate,
  Gunzip,
  Gzip,
  Inflate,
  InflateStream,
  RawDeflate,
  RawInflate,
  RawInflateStream,
  Zip,
} as const;

export default Zlib;

/**
 * deflate async.
 *
 * @param buffer - plain data buffer.
 * @param callback - error calllback function.
 * @param option - option parameters.
 */
export function deflate(
  buffer: Buffer | Uint8Array,
  callback: Function,
  option: DeflateOptionInterface
) {
  process.nextTick(() => {
    let error;
    /** deflated buffer. */
    let deflated: Buffer | Uint8Array | undefined;

    try {
      deflated = deflateSync(buffer, option);
    } catch (e) {
      error = e;
    }

    callback(error, deflated);
  });
}

/**
 * deflate sync.
 *
 * @param  buffer - plain data buffer.
 * @param option - option parameters.
 */
export function deflateSync(
  buffer: Buffer | Uint8Array,
  option: DeflateOptionInterface
): Buffer | Uint8Array {
  /** deflate encoder. */
  const deflate = new Deflate(buffer, option);
  /** deflated buffer. */
  const deflated: Uint8Array = deflate.compress();

  return option.noBuffer ? deflated : Buffer.from(deflated);
}

/**
 * inflate async.
 *
 * @param buffer - deflated buffer.
 * @param callback - error calllback function.
 * @param option - parameters.
 */
export function inflate(
  buffer: Uint8Array,
  callback: Function,
  option: InflateOptionInterface
) {
  process.nextTick(() => {
    /**  error */
    let error;
    /**  inflated plain buffer. */
    let inflated: Buffer | Uint8Array | undefined;

    try {
      inflated = inflateSync(buffer, option);
    } catch (e) {
      error = e;
    }

    callback(error, inflated);
  });
}

/**
 * inflate sync.
 *
 * @param buffer - deflated buffer.
 * @param option - option parameters. buffer.
 */
export function inflateSync(
  buffer: Uint8Array,
  option: InflateOptionInterface
): Buffer | Uint8Array {
  buffer.subarray = buffer.slice;
  /** deflate decoder. */
  const inflate = new Inflate(buffer, option);
  /** inflated plain buffer.  */
  const inflated = inflate.decompress();

  return option.noBuffer ? inflated : Buffer.from(inflated);
}

/**
 * gunzip async.
 *
 * @param  buffer - inflated buffer.
 * @param  callback - error calllback function.
 * @param option - option parameters.
 */
export function gzip(
  buffer: Buffer | Uint8Array,
  callback: Function,
  option: GzipOptionInterface
) {
  process.nextTick(() => {
    /** error */
    let error;
    /** deflated buffer. */
    let deflated: Buffer | Uint8Array | undefined;

    try {
      deflated = gzipSync(buffer, option);
    } catch (e) {
      error = e;
    }

    callback(error, deflated);
  });
}

/**
 * deflate sync.
 *
 * @param buffer - inflated buffer.
 * @param option - option parameters.
 */
export function gzipSync(
  buffer: Uint8Array,
  option: GzipOptionInterface
): Buffer | Uint8Array {
  buffer.subarray = buffer.slice;
  /** deflate compressor. */
  const deflate: Gzip = new Gzip(buffer, option);
  /** deflated buffer. */
  const deflated: Buffer | Uint8Array = deflate.compress();

  return option.noBuffer ? deflated : Buffer.from(deflated);
}

/**
 * gunzip async.
 *
 * @param  buffer - deflated buffer.
 * @param  callback -  error calllback function.
 * @param option - option parameters.
 */
export function gunzip(
  buffer: Uint8Array | Buffer,
  callback: Function,
  option: { noBuffer?: boolean } = {}
) {
  process.nextTick(() => {
    /** error */
    let error;
    /** inflated plain buffer. */
    let inflated: Buffer | Uint8Array | undefined;

    try {
      inflated = gunzipSync(buffer, option);
    } catch (e) {
      error = e;
    }

    callback(error, inflated);
  });
}

/**
 * inflate sync.
 *
 * @param  buffer - deflated buffer.
 * @param option - option parameters.
 */
export function gunzipSync(
  buffer: Uint8Array | Buffer,
  option: { noBuffer?: boolean } = {}
) {
  buffer.subarray = buffer.slice;
  /**  deflate decompressor. */
  const inflate = new Gunzip(buffer);
  /** inflated plain buffer. */
  const inflated: Buffer | Uint8Array = inflate.decompress();

  return option.noBuffer ? inflated : Buffer.from(inflated);
}
