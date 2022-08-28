/**
 * 雑多な関数群をまとめたモジュール実装.
 */
export default class Util {
  /**
   * Byte String から Byte Array に変換.
   *
   * @param str - byte string.
   */
  static stringToByteArray(str: string): Uint8Array {
    const tmp: string[] = str.split('');
    let i: number;
    let il: number;
    const ret: Uint8Array = new Uint8Array(tmp.length);

    for (i = 0, il = tmp.length; i < il; i++) {
      ret[i] = (tmp[i].charCodeAt(0) & 0xff) >>> 0;
    }

    return ret;
  }
}
