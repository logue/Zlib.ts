import Adler32 from './Adler32';
import type InflateOptionInterface from './interfaces/InflateOptionInterface';
import RawInflate from './RawInflate';
import {
  CompressionMethod,
  type CompressionMethodType,
} from './types/CompressionMethod';

/** Inflate class */
export default class Inflate {
  private input: Uint8Array;
  private ip: number;
  private rawinflate: RawInflate;
  /** verify flag. */
  private verify?: boolean;
  private method: CompressionMethodType;

  /**
   * @param input - deflated buffer.
   * @param option - option parameters.
   *
   * opt_params は以下のプロパティを指定する事ができます。
   *   - index: input buffer の deflate コンテナの開始位置.
   *   - blockSize: バッファのブロックサイズ.
   *   - verify: 伸張が終わった後 adler-32 checksum の検証を行うか.
   *   - bufferType: Zlib.Inflate.BufferType の値によってバッファの管理方法を指定する.
   *       Zlib.Inflate.BufferType は Zlib.RawInflate.BufferType のエイリアス.
   */
  constructor(input: Uint8Array, option: InflateOptionInterface) {
    this.input = input;
    this.ip = 0;
    this.verify = false;
    this.method = CompressionMethod.UNDEFINED;

    // option parameters
    if (option.index) {
      this.ip = option.index;
    }
    if (option.verify) {
      this.verify = option.verify;
    }

    // Compression Method and Flags
    const cmf: number = input[this.ip++];
    const flg: number = input[this.ip++];

    // compression method
    switch (cmf & 0x0f) {
      case CompressionMethod.DEFLATE:
        this.method = CompressionMethod.DEFLATE;
        break;
      default:
        throw new Error('unsupported compression method');
    }

    // fcheck
    if (((cmf << 8) + flg) % 31 !== 0) {
      throw new Error('invalid fcheck flag:' + (((cmf << 8) + flg) % 31));
    }

    // fdict (not supported)
    if (flg & 0x20) {
      throw new Error('fdict flag is not supported');
    }

    // RawInflate
    this.rawinflate = new RawInflate(input, {
      index: this.ip,
      bufferSize: option.bufferSize,
      bufferType: option.bufferType,
      resize: option.resize,
    });
  }

  /**
   * decompress.
   */
  decompress(): Uint8Array {
    /**  input buffer. */
    const input: Uint8Array = this.input;
    /** inflated buffer. */
    const buffer: Uint8Array = this.rawinflate.decompress();
    /** adler-32 checksum */
    let adler32: number;

    this.ip = this.rawinflate.ip;

    // verify adler-32
    if (this.verify) {
      adler32 =
        ((input[this.ip++] << 24) |
          (input[this.ip++] << 16) |
          (input[this.ip++] << 8) |
          input[this.ip++]) >>>
        0;

      if (adler32 !== Adler32.hash(buffer)) {
        throw new Error('invalid adler-32 checksum');
      }
    }

    return buffer;
  }
}
