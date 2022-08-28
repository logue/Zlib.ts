import RawInflateStream from './RawInflateStream';
import {
  CompressionMethod,
  type CompressionMethodType,
} from './types/CompressionMethod';
/**
 * Inflate stream.
 */
export default class InflateStream {
  private input: Uint8Array;
  public output: Uint8Array;
  private ip: number;
  private rawinflate: RawInflateStream;
  private method: CompressionMethodType;
  /**
   * @param input - deflated buffer.
   */
  constructor(input: Uint8Array) {
    this.input = input;
    this.ip = 0;
    this.rawinflate = new RawInflateStream(this.input, this.ip);
    this.output = this.rawinflate.output;
    this.method = CompressionMethod.DEFLATE;
  }

  /**
   * decompress.
   */
  decompress(input: Uint8Array): Uint8Array {
    // 新しい入力を入力バッファに結合する
    // XXX Array, Uint8Array のチェックを行うか確認する
    if (input !== void 0) {
      const tmp = new Uint8Array(this.input.length + input.length);
      tmp.set(this.input, 0);
      tmp.set(input, this.input.length);
      this.input = tmp;
    }

    if (this.method === void 0 && !this.readHeader()) {
      return new Uint8Array();
    }
    /** inflated buffer. */
    const buffer: Uint8Array = this.rawinflate.decompress(this.input, this.ip);
    if (this.rawinflate.ip !== 0) {
      this.input = this.input.subarray(this.rawinflate.ip);
      this.ip = 0;
    }

    // verify adler-32
    /*
  if (this.verify) {
    adler32 =
      input[this.ip++] << 24 | input[this.ip++] << 16 |
      input[this.ip++] << 8 | input[this.ip++];

    if (adler32 !== Zlib.Adler32(buffer)) {
      throw new Error('invalid adler-32 checksum');
    }
  }
  */

    return buffer;
  }

  /**
   * Read Header
   */
  readHeader(): boolean {
    let ip = this.ip;
    const input = this.input;

    // Compression Method and Flags
    const cmf = input[ip++];
    const flg = input[ip++];

    if (cmf === void 0 || flg === void 0) {
      return false;
    }

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

    this.ip = ip;
    return true;
  }
}
