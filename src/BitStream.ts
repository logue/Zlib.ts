/**
 * bit 単位での書き込み実装.
 */
export default class BitStream {
  /** buffer index. */
  private index: number;
  /** bit index. */
  private bitindex: number;
  /** bit-stream output buffer. */
  public buffer: Uint8Array;
  /**
   * ビットストリーム
   *
   * @param buffer - output buffer.
   * @param bufferPosition - start buffer pointer.
   */
  constructor(buffer?: Uint8Array, bufferPosition: number = 0) {
    this.index = bufferPosition;
    this.bitindex = 0;
    this.buffer =
      buffer instanceof Uint8Array
        ? buffer
        : new Uint8Array(BitStream.DefaultBlockSize);

    // 入力された index が足りなかったら拡張するが、倍にしてもダメなら不正とする
    if (this.buffer.length * 2 <= this.index) {
      throw new Error('invalid index');
    } else if (this.buffer.length <= this.index) {
      this.expandBuffer();
    }
  }

  /**
   * デフォルトブロックサイズ.
   */
  static readonly DefaultBlockSize: number = 0x8000;

  /**
   * expand buffer.
   */
  expandBuffer(): Uint8Array {
    /**  old buffer. */
    const oldbuf: Uint8Array = this.buffer;
    /** loop limiter. */
    const il: number = oldbuf.length;
    /** new buffer. */
    const buffer: Uint8Array = new Uint8Array(il << 1);

    // copy buffer
    buffer.set(oldbuf);
    this.buffer = buffer;

    return buffer;
  }

  /**
   * 数値をビットで指定した数だけ書き込む.
   *
   * @param number - 書き込む数値.
   * @param n - 書き込むビット数.
   * @param  reverse - 逆順に書き込むならば true.
   */
  writeBits(number: number, n: number, reverse: boolean = false) {
    let buffer = this.buffer;
    let index = this.index;
    let bitindex = this.bitindex;

    /** urrent octet. */
    let current: number = buffer[index];
    /** loop counter. */
    let i: number;

    /**
     * 32-bit 整数のビット順を逆にする
     *
     * @param int - 32-bit integer.
     */
    function rev32_(int: number): number {
      return (
        (BitStream.ReverseTable[int & 0xff] << 24) |
        (BitStream.ReverseTable[(int >>> 8) & 0xff] << 16) |
        (BitStream.ReverseTable[(int >>> 16) & 0xff] << 8) |
        BitStream.ReverseTable[(int >>> 24) & 0xff]
      );
    }

    if (reverse && n > 1) {
      number =
        n > 8
          ? rev32_(number) >> (32 - n)
          : BitStream.ReverseTable[number] >> (8 - n);
    }

    // Byte 境界を超えないとき
    if (n + bitindex < 8) {
      current = (current << n) | number;
      bitindex += n;
      // Byte 境界を超えるとき
    } else {
      for (i = 0; i < n; ++i) {
        current = (current << 1) | ((number >> (n - i - 1)) & 1);

        // next byte
        if (++bitindex === 8) {
          bitindex = 0;
          buffer[index++] = BitStream.ReverseTable[current];
          current = 0;

          // expand
          if (index === buffer.length) {
            buffer = this.expandBuffer();
          }
        }
      }
    }
    buffer[index] = current;

    this.buffer = buffer;
    this.bitindex = bitindex;
    this.index = index;
  }

  /**
   * ストリームの終端処理を行う
   */
  finish(): Uint8Array {
    const buffer = this.buffer;
    let index = this.index;

    // bitindex が 0 の時は余分に index が進んでいる状態
    if (this.bitindex > 0) {
      buffer[index] <<= 8 - this.bitindex;
      buffer[index] = BitStream.ReverseTable[buffer[index]];
      index++;
    }

    // array truncation
    return buffer.subarray(0, index);
  }

  /**
   * 0-255 のビット順を反転したテーブル
   */
  static ReverseTable: Uint8Array = ((table: Uint8Array) => {
    return table;
  })(
    (() => {
      /** reverse table. */
      const table: Uint8Array = new Uint8Array(256);
      /**  loop counter. */
      let i: number;

      // generate
      for (i = 0; i < 256; ++i) {
        table[i] = (function (n) {
          let r = n;
          let s = 7;

          for (n >>>= 1; n; n >>>= 1) {
            r <<= 1;
            r |= n & 1;
            --s;
          }

          return ((r << s) & 0xff) >>> 0;
        })(i);
      }

      return table;
    })()
  );
}
