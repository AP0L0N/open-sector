/** The corner button and Space build the picture only when a map is open, edits are waiting, and a build is not already running. */
export function renderChangesEnabled(open: boolean, pending: boolean, busy: boolean): boolean {
  return open && pending && !busy;
}

/**
 * Multiset difference by content key. Index order is useless once a delete splices
 * the list, so a sketch of what was added or removed has to match items by what they are.
 * One shared key cancels. Leftovers on each side are the edit.
 */
export function diffByKey<T>(before: readonly T[], after: readonly T[], key: (item: T) => string): { added: T[]; removed: T[] } {
  const left = new Map<string, T[]>();
  for (const item of before) {
    const k = key(item);
    const bag = left.get(k);
    if (bag) bag.push(item);
    else left.set(k, [item]);
  }
  const added: T[] = [];
  for (const item of after) {
    const bag = left.get(key(item));
    if (bag && bag.length > 0) bag.pop();
    else added.push(item);
  }
  const removed: T[] = [];
  for (const bag of left.values()) {
    for (const item of bag) removed.push(item);
  }
  return { added, removed };
}
