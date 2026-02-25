interface HeapItem<T> {
  item: T;
  score: number;
}

function siftUp<T>(heap: HeapItem<T>[], index: number): void {
  let current = index;
  while (current > 0) {
    const parent = Math.floor((current - 1) / 2);
    if ((heap[parent]?.score ?? 0) <= (heap[current]?.score ?? 0)) {
      break;
    }

    const parentItem = heap[parent];
    heap[parent] = heap[current] as HeapItem<T>;
    heap[current] = parentItem as HeapItem<T>;
    current = parent;
  }
}

function siftDown<T>(heap: HeapItem<T>[], index: number): void {
  let current = index;

  while (true) {
    const left = current * 2 + 1;
    const right = current * 2 + 2;
    let smallest = current;

    if ((heap[left]?.score ?? Number.POSITIVE_INFINITY) < (heap[smallest]?.score ?? Number.POSITIVE_INFINITY)) {
      smallest = left;
    }

    if ((heap[right]?.score ?? Number.POSITIVE_INFINITY) < (heap[smallest]?.score ?? Number.POSITIVE_INFINITY)) {
      smallest = right;
    }

    if (smallest === current) {
      return;
    }

    const currentItem = heap[current];
    heap[current] = heap[smallest] as HeapItem<T>;
    heap[smallest] = currentItem as HeapItem<T>;
    current = smallest;
  }
}

export function selectTopKByScore<T>(
  items: readonly T[],
  limit: number,
  score: (item: T) => number,
): T[] {
  if (limit <= 0 || items.length === 0) {
    return [];
  }

  const heap: HeapItem<T>[] = [];

  for (const item of items) {
    const nextScore = score(item);
    if (heap.length < limit) {
      heap.push({ item, score: nextScore });
      siftUp(heap, heap.length - 1);
      continue;
    }

    if (nextScore <= (heap[0]?.score ?? Number.NEGATIVE_INFINITY)) {
      continue;
    }

    heap[0] = { item, score: nextScore };
    siftDown(heap, 0);
  }

  return heap.sort((a, b) => b.score - a.score).map((entry) => entry.item);
}
