/** The corner button and Space build the picture only when a map is open, edits are waiting, and a build is not already running. */
export function renderChangesEnabled(open: boolean, pending: boolean, busy: boolean): boolean {
  return open && pending && !busy;
}
