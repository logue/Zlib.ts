import Util from './Util';
/**
 * Adler32 checksum 実装.
 */
export default class Adler32 {
  /**
   * Adler32 ハッシュ値の作成
   *
   * @param array - 算出に使用する byte array.
   */
  static hash(array: Uint8Array | string): number {
    return Adler32.update(
      1,
      typeof array === 'string' ? Util.stringToByteArray(array) : array
    );
  }

  /**
   * Adler32 ハッシュ値の更新
   *
   * @param  adler - 現在のハッシュ値.
   * @param  array - 更新に使用する byte array.
   */
  private static update(adler: number, array: Uint8Array): number {
    let s1: number = adler & 0xffff;
    let s2: number = (adler >>> 16) & 0xffff;
    /** array length */
    let len: number = array.length;
    /** loop length (don't overflow) */
    let tlen: number;
    /** array index */
    let i: number = 0;

    while (len > 0) {
      tlen =
        len > Adler32.OptimizationParameter
          ? Adler32.OptimizationParameter
          : len;
      len -= tlen;
      do {
        s1 += array[i++];
        s2 += s1;
      } while (--tlen);

      s1 %= 65521;
      s2 %= 65521;
    }

    return ((s2 << 16) | s1) >>> 0;
  }

  /**
   * Adler32 最適化パラメータ
   * 現状では 1024 程度が最適.
   *
   * @see {@link http://jsperf.com/adler-32-simple-vs-optimized/3}
   */
  private static readonly OptimizationParameter: number = 1024;
}
