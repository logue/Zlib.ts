import RawDeflate from './RawDeflate';
import {
  CompressionType,
  type CompressionTypeType,
} from './types/CompressionTypes';
import {
  CompressionMethod,
  type CompressionMethodType,
} from './types/CompressionMethod';
import Adler32 from './Adler32';
import type DeflateOptionInterface from './interfaces/DeflateOptionInterface';
/**
 * Deflate (RFC1951) 実装.
 * Deflateアルゴリズム本体は RawDeflate で実装されている.
 */
export default class Deflate {
  /** input buffer */
  private input: Uint8Array;
  /** output buffer */
  private output: Uint8Array;
  /** CompressionType */
  private compressionType: CompressionTypeType;
  /** Raw Deflate */
  private rawDeflate: RawDeflate;
  /**
   * Zlib Deflate
   *
   * @param input - 符号化する対象の byte array.
   * @param options - option parameters.
   */
  constructor(input: Uint8Array, options: DeflateOptionInterface) {
    const rawDeflateOption: DeflateOptionInterface = options;
    this.input = input;
    this.output = new Uint8Array(Deflate.DefaultBufferSize);
    this.compressionType = options.compressionType || CompressionType.DYNAMIC;
    // set raw-deflate output buffer
    rawDeflateOption.outputBuffer = this.output;

    this.rawDeflate = new RawDeflate(this.input, rawDeflateOption);
  }

  /**
   * デフォルトバッファサイズ.
   */
  static DefaultBufferSize: number = 0x8000;

  /**
   * 直接圧縮に掛ける.
   *
   * @param  input - target buffer.
   * @param options -  option parameters.
   */
  static compress(
    input: Uint8Array,
    options: DeflateOptionInterface
  ): Uint8Array {
    return new Deflate(input, options).compress();
  }

  /**
   * Deflate Compression.
   */
  compress(): Uint8Array {
    let cinfo: number;
    let flg: number;
    let flevel: number;
    let output: Uint8Array;
    let pos: number = 0;

    output = this.output;

    // Compression Method and Flags
    const cm: CompressionMethodType = CompressionMethod.DEFLATE;
    switch (cm) {
      case CompressionMethod.DEFLATE:
        cinfo = Math.LOG2E * Math.log(RawDeflate.WindowSize) - 8;
        break;
      default:
        throw new Error('invalid compression method');
    }
    const cmf: number = (cinfo << 4) | cm;
    output[pos++] = cmf;

    // Flags
    const fdict: number = 0;
    switch (cm) {
      case CompressionMethod.DEFLATE:
        switch (this.compressionType) {
          case CompressionType.NONE:
            flevel = 0;
            break;
          case CompressionType.FIXED:
            flevel = 1;
            break;
          case CompressionType.DYNAMIC:
            flevel = 2;
            break;
          default:
            throw new Error('unsupported compression type');
        }
        break;
      default:
        throw new Error('invalid compression method');
    }
    flg = (flevel << 6) | (fdict << 5);
    const fcheck: number = 31 - ((cmf * 256 + flg) % 31);
    flg |= fcheck;
    output[pos++] = flg;

    /** Adler-32 checksum */
    const adler: number = Adler32.hash(this.input);

    this.rawDeflate.op = pos;
    output = this.rawDeflate.compress();
    pos = output.length;

    // subarray 分を元にもどす
    output = new Uint8Array(output.buffer);
    // expand buffer
    if (output.length <= pos + 4) {
      this.output = new Uint8Array(output.length + 4);
      this.output.set(output);
      output = this.output;
    }
    output = output.subarray(0, pos + 4);

    // adler32
    output[pos++] = (adler >> 24) & 0xff;
    output[pos++] = (adler >> 16) & 0xff;
    output[pos++] = (adler >> 8) & 0xff;
    output[pos++] = adler & 0xff;

    return output;
  }
}
