/** Huffman Class */
export default class Huffman {
  /**
   * build huffman table from length list.
   *
   * @param lengths - length list.
   */
  static buildHuffmanTable(lengths: Uint8Array): [Uint32Array, number, number] {
    /** length list size. */
    const listSize: number = lengths.length;
    /** max code length for table size. */
    let maxCodeLength: number = 0;
    /**  min code length for table size. */
    let minCodeLength: number = Number.POSITIVE_INFINITY;

    /**  bit length. */
    let bitLength: number;
    /** huffman code. */
    let code: number;
    /**
     * サイズが 2^maxlength 個のテーブルを埋めるためのスキップ長.
     *  skip length for table filling.
     */
    let skip: number;
    /** reversed code. */
    let reversed: number;
    /**  reverse temp. */
    let rtemp: number;
    /** loop counter. */
    let i: number;
    /**  loop limit. */
    let il: number;
    /**  loop counter. */
    let j: number;
    /**  table value. */
    let value: number;

    // Math.max は遅いので最長の値は for-loop で取得する
    for (i = 0, il = listSize; i < il; ++i) {
      if (lengths[i] > maxCodeLength) {
        maxCodeLength = lengths[i];
      }
      if (lengths[i] < minCodeLength) {
        minCodeLength = lengths[i];
      }
    }

    /**  table size. */
    const size: number = 1 << maxCodeLength;
    /** huffman code table. */
    const table: Uint32Array = new Uint32Array(size);

    // ビット長の短い順からハフマン符号を割り当てる
    for (bitLength = 1, code = 0, skip = 2; bitLength <= maxCodeLength; ) {
      for (i = 0; i < listSize; ++i) {
        if (lengths[i] === bitLength) {
          // ビットオーダーが逆になるためビット長分並びを反転する
          for (reversed = 0, rtemp = code, j = 0; j < bitLength; ++j) {
            reversed = (reversed << 1) | (rtemp & 1);
            rtemp >>= 1;
          }

          // 最大ビット長をもとにテーブルを作るため、
          // 最大ビット長以外では 0 / 1 どちらでも良い箇所ができる
          // そのどちらでも良い場所は同じ値で埋めることで
          // 本来のビット長以上のビット数取得しても問題が起こらないようにする
          value = (bitLength << 16) | i;
          for (j = reversed; j < size; j += skip) {
            table[j] = value;
          }

          ++code;
        }
      }

      // 次のビット長へ
      ++bitLength;
      code <<= 1;
      skip <<= 1;
    }

    return [table, maxCodeLength, minCodeLength];
  }
}
