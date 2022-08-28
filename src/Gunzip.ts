import CRC32 from './Crc32';
import RawInflate from './RawInflate';
import GunzipMember from './GunzipMember';
import { FlagsMask } from './types/FlagsMask';

/**
 * GZIP (RFC1952) 展開コンテナ実装.
 */
export default class GunZip {
  /** input buffer. */
  private input: Uint8Array;
  /** input buffer pointer. */
  private ip: number;
  /** Gunzip Members */
  private member: GunzipMember[];
  /** Decompressed flag */
  private decompressed: boolean = false;

  /**
   * @param input - input buffer.
   */
  constructor(input: Uint8Array) {
    this.input = input;
    this.ip = 0;
    this.member = [];
    this.decompressed = false;
  }

  /** get Gunzip member */
  getMember(): GunzipMember[] {
    if (!this.decompressed) {
      this.decompress();
    }

    return this.member.slice();
  }

  /**
   * inflate gzip data.
   */
  decompress(): Uint8Array {
    /**  input length. */
    const il: number = this.input.length;

    while (this.ip < il) {
      this.decodeMember();
    }

    this.decompressed = true;

    return this.concatMember();
  }

  /**
   * decode gzip member.
   */
  decodeMember() {
    const member: GunzipMember = new GunzipMember();
    let isize: number;
    /** inflated data. */
    let inflated: Uint8Array;
    /** inflate size */
    let inflen: number = 0;
    /** character code */
    let c: number;
    /** character index in string. */
    let ci: number;
    /**  character array. */
    let str: string[];

    /** CRC32 */
    let crc32: number;

    const input = this.input;
    let ip = this.ip;

    member.id1 = input[ip++];
    member.id2 = input[ip++];

    // check signature
    if (member.id1 !== 0x1f || member.id2 !== 0x8b) {
      throw new Error(
        'invalid file signature:' + member.id1 + ',' + member.id2
      );
    }

    // check compression method
    member.cm = input[ip++];
    switch (member.cm) {
      case 8 /* XXX: use Zlib const */:
        break;
      default:
        throw new Error('unknown compression method: ' + member.cm);
    }

    // flags
    member.flg = input[ip++];

    /** modification time. */
    const mtime: number =
      input[ip++] |
      (input[ip++] << 8) |
      (input[ip++] << 16) |
      (input[ip++] << 24);
    member.mtime = new Date(mtime * 1000);

    // extra flags
    member.xfl = input[ip++];

    // operating system
    member.os = input[ip++];

    // extra
    if ((member.flg & FlagsMask.FEXTRA) > 0) {
      member.xlen = input[ip++] | (input[ip++] << 8);
      ip = this.decodeSubField(ip, member.xlen);
    }

    // fname
    if ((member.flg & FlagsMask.FNAME) > 0) {
      for (str = [], ci = 0; (c = input[ip++]) > 0; ) {
        str[ci++] = String.fromCharCode(c);
      }
      member.name = str.join('');
    }

    // fcomment
    if ((member.flg & FlagsMask.FCOMMENT) > 0) {
      for (str = [], ci = 0; (c = input[ip++]) > 0; ) {
        str[ci++] = String.fromCharCode(c);
      }
      member.comment = str.join('');
    }

    // fhcrc
    if ((member.flg & FlagsMask.FHCRC) > 0) {
      member.crc16 = CRC32.calc(input, 0, ip) & 0xffff;
      if (member.crc16 !== (input[ip++] | (input[ip++] << 8))) {
        throw new Error('invalid header crc16');
      }
    }

    // isize を事前に取得すると展開後のサイズが分かるため、
    // inflate処理のバッファサイズが事前に分かり、高速になる
    isize =
      input[input.length - 4] |
      (input[input.length - 3] << 8) |
      (input[input.length - 2] << 16) |
      (input[input.length - 1] << 24);

    // isize の妥当性チェック
    // ハフマン符号では最小 2-bit のため、最大で 1/4 になる
    // LZ77 符号では 長さと距離 2-Byte で最大 258-Byte を表現できるため、
    // 1/128 になるとする
    // ここから入力バッファの残りが isize の 512 倍以上だったら
    // サイズ指定のバッファ確保は行わない事とする
    if (input.length - ip - /* CRC-32 */ 4 - /* ISIZE */ 4 < isize * 512) {
      inflen = isize;
    }

    // compressed block
    /** RawInflate implementation. */
    const rawinflate: RawInflate = new RawInflate(input, {
      index: ip,
      bufferSize: inflen,
    });
    member.data = inflated = rawinflate.decompress();
    ip = rawinflate.ip;

    // crc32
    member.crc32 = crc32 =
      (input[ip++] |
        (input[ip++] << 8) |
        (input[ip++] << 16) |
        (input[ip++] << 24)) >>>
      0;
    if (CRC32.calc(inflated) !== crc32) {
      throw new Error(
        'invalid CRC-32 checksum: 0x' +
          CRC32.calc(inflated).toString(16) +
          ' / 0x' +
          crc32.toString(16)
      );
    }

    // input size
    member.isize = isize =
      (input[ip++] |
        (input[ip++] << 8) |
        (input[ip++] << 16) |
        (input[ip++] << 24)) >>>
      0;
    if ((inflated.length & 0xffffffff) !== isize) {
      throw new Error(
        'invalid input size: ' + (inflated.length & 0xffffffff) + ' / ' + isize
      );
    }

    this.member.push(member);
    this.ip = ip;
  }

  /**
   * サブフィールドのデコード
   * XXX: 現在は何もせずスキップする
   */
  decodeSubField(ip: number, length: number): number {
    return ip + length;
  }

  /**
   * concat Gunzip member.
   */
  concatMember(): Uint8Array {
    const member: GunzipMember[] = this.member;
    let i: number;
    let il: number;
    let p: number = 0;
    let size: number = 0;

    for (i = 0, il = member.length; i < il; ++i) {
      size += member[i].data.length;
    }

    const buffer: Uint8Array = new Uint8Array(size);
    for (i = 0; i < il; ++i) {
      buffer.set(member[i].data, p);
      p += member[i].data.length;
    }

    return buffer;
  }
}
