/**
 * Heap Sort 実装. ハフマン符号化で使用する.
 */
export default class Heap {
  buffer: Uint16Array;
  length: number;
  /**
   * カスタムハフマン符号で使用するヒープ実装
   *
   * @param length - ヒープサイズ.
   */
  constructor(length: number) {
    this.buffer = new Uint16Array(length * 2);
    this.length = 0;
  }

  /**
   * 親ノードの index 取得
   *
   * @param  index - 子ノードの index.
   */
  getParent(index: number): number {
    return (((index - 2) / 4) | 0) * 2;
  }

  /**
   * 子ノードの index 取得
   *
   * @param  index - 親ノードの index.
   */
  getChild(index: number): number {
    return 2 * index + 2;
  }

  /**
   * Heap に値を追加する
   *
   * @param  index - キー index.
   * @param  value - 値.
   */
  push(index: number, value: number): number {
    let current: number;
    let parent: number;
    const heap = this.buffer;
    let swap: number;

    current = this.length;
    heap[this.length++] = value;
    heap[this.length++] = index;

    // ルートノードにたどり着くまで入れ替えを試みる
    while (current > 0) {
      parent = this.getParent(current);

      // 親ノードと比較して親の方が小さければ入れ替える
      if (heap[current] > heap[parent]) {
        swap = heap[current];
        heap[current] = heap[parent];
        heap[parent] = swap;

        swap = heap[current + 1];
        heap[current + 1] = heap[parent + 1];
        heap[parent + 1] = swap;

        current = parent;
        // 入れ替えが必要なくなったらそこで抜ける
      } else {
        break;
      }
    }

    return this.length;
  }

  /**
   * Heapから一番大きい値を返す
   *
   * @returns {index: キーindex, value: 値, length: ヒープ長} の Object.
   */
  pop(): { index: number; value: number; length: number } {
    const heap = this.buffer;
    let swap: number;
    let current: number;
    let parent: number;

    const value: number = heap[0];
    const index: number = heap[1];

    // 後ろから値を取る
    this.length -= 2;
    heap[0] = heap[this.length];
    heap[1] = heap[this.length + 1];

    parent = 0;
    // ルートノードから下がっていく
    // eslint-disable-next-line no-constant-condition
    while (true) {
      current = this.getChild(parent);

      // 範囲チェック
      if (current >= this.length) {
        break;
      }

      // 隣のノードと比較して、隣の方が値が大きければ隣を現在ノードとして選択
      if (current + 2 < this.length && heap[current + 2] > heap[current]) {
        current += 2;
      }

      // 親ノードと比較して親の方が小さい場合は入れ替える
      if (heap[current] > heap[parent]) {
        swap = heap[parent];
        heap[parent] = heap[current];
        heap[current] = swap;

        swap = heap[parent + 1];
        heap[parent + 1] = heap[current + 1];
        heap[current + 1] = swap;
      } else {
        break;
      }

      parent = current;
    }

    return { index: index, value: value, length: this.length };
  }
}
