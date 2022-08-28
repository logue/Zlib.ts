import CRC32 from './Crc32';
import type GzipOptionInterface from './interfaces/GzipOptionInterface';
import RawDeflate from './RawDeflate';
import { FlagsMask } from './types/FlagsMask';
import { OperatingSystem } from './types/OperatingSystem';

/**
 * GZIP (RFC1952) 実装.
 */
export default class Gzip {
  /** input buffer. */
  private input: Uint8Array;
  /** input buffer pointer. */
  private ip: number;
  /** output buffer. */
  private output?: Uint8Array;
  /** output buffer pointer. */
  private op: number;
  /** flags option flags. */
  private flags: {
    fname: string;
    fcomment: string;
    fhcrc: number;
  };
  /** filename. */
  private filename: string;
  /** comment. */
  private comment: string;
  /**  deflate options. */
  private deflateOptions: {
    outputBuffer: Uint8Array;
    outputIndex: number;
  };

  private static DefaultBufferSize: number = 0x8000;

  /**
   * Gzip Constructor
   *
   * @param input - input buffer.
   * @param option - option parameters.
   */
  constructor(input: Uint8Array, option: GzipOptionInterface) {
    this.input = input;
    this.ip = 0;
    this.op = 0;

    // option parameters
    this.flags = option.flags;
    this.filename = option.filename;
    this.comment = option.comment;
    this.deflateOptions = option.deflateOptions || {};
  }

  /**
   * encode gzip members.
   */
  compress(): Uint8Array {
    /** flags. */
    let flg: number;

    /**  CRC-16 value for FHCRC flag. */
    let crc16: number;

    /** character code */
    let c: number;
    /**  loop counter. */
    let i: number;
    /** loop limiter. */
    let il: number;
    /** output buffer. */
    let output: Uint8Array = new Uint8Array(Gzip.DefaultBufferSize);
    /**  output buffer pointer. */
    let op: number = 0;

    const input = this.input;
    const ip = this.ip;
    const filename = this.filename;
    const comment = this.comment;

    // check signature
    output[op++] = 0x1f;
    output[op++] = 0x8b;

    // check compression method
    output[op++] = 8; /* XXX: use Zlib const */

    // flags
    flg = 0;
    if (this.flags.fname) flg |= FlagsMask.FNAME;
    if (this.flags.fcomment) flg |= FlagsMask.FCOMMENT;
    if (this.flags.fhcrc) flg |= FlagsMask.FHCRC;
    // XXX: FTEXT
    // XXX: FEXTRA
    output[op++] = flg;

    /**  modification time. */
    const mtime: number = ((Date.now ? Date.now() : +new Date()) / 1000) | 0;
    output[op++] = mtime & 0xff;
    output[op++] = (mtime >>> 8) & 0xff;
    output[op++] = (mtime >>> 16) & 0xff;
    output[op++] = (mtime >>> 24) & 0xff;

    // extra flags
    output[op++] = 0;

    // operating system
    output[op++] = OperatingSystem.UNKNOWN;

    // extra
    /* NOP */

    // fname
    if (this.flags.fname !== void 0) {
      for (i = 0, il = filename.length; i < il; ++i) {
        c = filename.charCodeAt(i);
        if (c > 0xff) {
          output[op++] = (c >>> 8) & 0xff;
        }
        output[op++] = c & 0xff;
      }
      output[op++] = 0; // null termination
    }

    // fcomment
    if (this.flags.fcomment) {
      for (i = 0, il = comment.length; i < il; ++i) {
        c = comment.charCodeAt(i);
        if (c > 0xff) {
          output[op++] = (c >>> 8) & 0xff;
        }
        output[op++] = c & 0xff;
      }
      output[op++] = 0; // null termination
    }

    // fhcrc
    if (this.flags.fhcrc) {
      crc16 = CRC32.calc(output, 0, op) & 0xffff;
      output[op++] = crc16 & 0xff;
      output[op++] = (crc16 >>> 8) & 0xff;
    }

    // add compress option
    this.deflateOptions.outputBuffer = output;
    this.deflateOptions.outputIndex = op;

    /** raw deflate object. */
    const rawdeflate = new RawDeflate(input, this.deflateOptions);
    // compress
    output = rawdeflate.compress();
    op = rawdeflate.op;

    // expand buffer
    if (op + 8 > output.buffer.byteLength) {
      this.output = new Uint8Array(op + 8);
      this.output.set(new Uint8Array(output.buffer));
      output = this.output;
    } else {
      output = new Uint8Array(output.buffer);
    }

    /** CRC-32 value for verification. */
    const crc32 = CRC32.calc(input);
    output[op++] = crc32 & 0xff;
    output[op++] = (crc32 >>> 8) & 0xff;
    output[op++] = (crc32 >>> 16) & 0xff;
    output[op++] = (crc32 >>> 24) & 0xff;

    // input size
    il = input.length;
    output[op++] = il & 0xff;
    output[op++] = (il >>> 8) & 0xff;
    output[op++] = (il >>> 16) & 0xff;
    output[op++] = (il >>> 24) & 0xff;

    this.ip = ip;

    if (op < output.length) {
      this.output = output = output.subarray(0, op);
    }

    return output;
  }
}
