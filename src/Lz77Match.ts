/** Lz77 Match */
export default class Lz77Match {
  /**  match length. */
  public length: number;
  /** backward distance. */
  private backwardDistance: number;

  /**
   * マッチ情報
   *
   * @param length - マッチした長さ.
   * @param backwardDistance - マッチ位置との距離.
   */
  constructor(length: number, backwardDistance: number) {
    this.length = length;
    this.backwardDistance = backwardDistance;
  }

  /**
   * 長さ符号テーブル.
   * [コード, 拡張ビット, 拡張ビット長] の配列となっている.
   */
  static LengthCodeTable = ((table: Uint32Array) => {
    return new Uint32Array(table);
  })(
    (() => {
      const table: Uint32Array = new Uint32Array();
      let i: number;
      let c: number[];

      for (i = 3; i <= 258; i++) {
        c = code(i);
        table[i] = (c[2] << 24) | (c[1] << 16) | c[0];
      }

      /**
       * lz77 codes.
       *
       * @param length - lz77 length.
       */
      function code(length: number): number[] {
        switch (true) {
          case length === 3:
            return [257, length - 3, 0];
          case length === 4:
            return [258, length - 4, 0];
          case length === 5:
            return [259, length - 5, 0];
          case length === 6:
            return [260, length - 6, 0];
          case length === 7:
            return [261, length - 7, 0];
          case length === 8:
            return [262, length - 8, 0];
          case length === 9:
            return [263, length - 9, 0];
          case length === 10:
            return [264, length - 10, 0];
          case length <= 12:
            return [265, length - 11, 1];
          case length <= 14:
            return [266, length - 13, 1];
          case length <= 16:
            return [267, length - 15, 1];
          case length <= 18:
            return [268, length - 17, 1];
          case length <= 22:
            return [269, length - 19, 2];
          case length <= 26:
            return [270, length - 23, 2];
          case length <= 30:
            return [271, length - 27, 2];
          case length <= 34:
            return [272, length - 31, 2];
          case length <= 42:
            return [273, length - 35, 3];
          case length <= 50:
            return [274, length - 43, 3];
          case length <= 58:
            return [275, length - 51, 3];
          case length <= 66:
            return [276, length - 59, 3];
          case length <= 82:
            return [277, length - 67, 4];
          case length <= 98:
            return [278, length - 83, 4];
          case length <= 114:
            return [279, length - 99, 4];
          case length <= 130:
            return [280, length - 115, 4];
          case length <= 162:
            return [281, length - 131, 5];
          case length <= 194:
            return [282, length - 163, 5];
          case length <= 226:
            return [283, length - 195, 5];
          case length <= 257:
            return [284, length - 227, 5];
          case length === 258:
            return [285, length - 258, 0];
          default:
            throw new Error('invalid length: ' + length);
        }
      }

      return table;
    })()
  );

  /**
   * 距離符号テーブル
   *
   * @param dist - 距離.
   */
  private getDistanceCode_(dist: number): number[] {
    /** distance code table. */
    let r: number[];

    switch (true) {
      case dist === 1:
        r = [0, dist - 1, 0];
        break;
      case dist === 2:
        r = [1, dist - 2, 0];
        break;
      case dist === 3:
        r = [2, dist - 3, 0];
        break;
      case dist === 4:
        r = [3, dist - 4, 0];
        break;
      case dist <= 6:
        r = [4, dist - 5, 1];
        break;
      case dist <= 8:
        r = [5, dist - 7, 1];
        break;
      case dist <= 12:
        r = [6, dist - 9, 2];
        break;
      case dist <= 16:
        r = [7, dist - 13, 2];
        break;
      case dist <= 24:
        r = [8, dist - 17, 3];
        break;
      case dist <= 32:
        r = [9, dist - 25, 3];
        break;
      case dist <= 48:
        r = [10, dist - 33, 4];
        break;
      case dist <= 64:
        r = [11, dist - 49, 4];
        break;
      case dist <= 96:
        r = [12, dist - 65, 5];
        break;
      case dist <= 128:
        r = [13, dist - 97, 5];
        break;
      case dist <= 192:
        r = [14, dist - 129, 6];
        break;
      case dist <= 256:
        r = [15, dist - 193, 6];
        break;
      case dist <= 384:
        r = [16, dist - 257, 7];
        break;
      case dist <= 512:
        r = [17, dist - 385, 7];
        break;
      case dist <= 768:
        r = [18, dist - 513, 8];
        break;
      case dist <= 1024:
        r = [19, dist - 769, 8];
        break;
      case dist <= 1536:
        r = [20, dist - 1025, 9];
        break;
      case dist <= 2048:
        r = [21, dist - 1537, 9];
        break;
      case dist <= 3072:
        r = [22, dist - 2049, 10];
        break;
      case dist <= 4096:
        r = [23, dist - 3073, 10];
        break;
      case dist <= 6144:
        r = [24, dist - 4097, 11];
        break;
      case dist <= 8192:
        r = [25, dist - 6145, 11];
        break;
      case dist <= 12288:
        r = [26, dist - 8193, 12];
        break;
      case dist <= 16384:
        r = [27, dist - 12289, 12];
        break;
      case dist <= 24576:
        r = [28, dist - 16385, 13];
        break;
      case dist <= 32768:
        r = [29, dist - 24577, 13];
        break;
      default:
        throw new Error('invalid distance');
    }

    return r;
  }

  /**
   * マッチ情報を LZ77 符号化配列で返す.
   * なお、ここでは以下の内部仕様で符号化している
   * [ CODE, EXTRA-BIT-LEN, EXTRA, CODE, EXTRA-BIT-LEN, EXTRA ]
   */
  toLz77Array(): number[] {
    const length: number = this.length;
    const dist: number = this.backwardDistance;
    const codeArray: number[] = [];
    let pos: number = 0;

    /** length */
    const code = Lz77Match.LengthCodeTable[length];
    codeArray[pos++] = code & 0xffff;
    codeArray[pos++] = (code >> 16) & 0xff;
    codeArray[pos++] = code >> 24;

    /** distance */
    const codes: number[] = this.getDistanceCode_(dist);
    codeArray[pos++] = codes[0];
    codeArray[pos++] = codes[1];
    codeArray[pos++] = codes[2];

    return codeArray;
  }
}
