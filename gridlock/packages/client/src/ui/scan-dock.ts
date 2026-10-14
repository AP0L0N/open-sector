import type { MatchSnapshot } from "@gridlock/shared";
import { el } from "./dom.js";

/**
 * The Xenite Ground Scan dock: one button per scan the hive holds, in the map's top right corner.
 * Each wears its orbital relay's avatar. Press one, then click the map to send that scan there.
 * A placed scan's button runs its "active" sweep; one folding or opening blinks while it moves.
 */

export type ScanDockState = "ready" | "active" | "moving";

export interface ScanDockSlot {
  slot: number;
  state: ScanDockState;
}

/** What each of the viewer's scan buttons shows. Empty for a side with no scans. */
export function scanDockSlots(m: MatchSnapshot): ScanDockSlot[] {
  const slots = m.you.groundScanSlots ?? 0;
  const out: ScanDockSlot[] = [];
  for (let slot = 0; slot < slots; slot++) {
    const s = m.scans?.find((x) => x.ownerId === m.youPlayerId && x.slot === slot);
    out.push({ slot, state: !s ? "ready" : s.dir === 0 && s.open >= 1 ? "active" : "moving" });
  }
  return out;
}

const STATE_LABEL: Record<ScanDockState, string> = { ready: "Ready", active: "Active", moving: "Moving" };

function tipOf(state: ScanDockState): string {
  if (state === "ready") return `Not placed yet. Press, then click anywhere on the map: your side sees that square of ground whole, and at night it is lit as bright as day.`;
  if (state === "moving") return `On its way: folding into its centre, then opening round the new spot.`;
  return `Watching its square. Press, then click the map to move it: it folds into its centre, then opens round the new spot.`;
}

/**
 * The relay's avatar: a scanner in orbit over the curve of the world, its beam falling on a
 * square of ground. Original art, drawn here so it stays sharp at any size.
 */
function avatarSvg(slot: number): string {
  const id = `scanav${slot}`;
  return (
    `<svg class="scan-avatar" viewBox="0 0 48 48" aria-hidden="true">` +
    `<defs>` +
    `<radialGradient id="${id}-sky" cx="50%" cy="30%" r="75%"><stop offset="0" stop-color="#14323a"/><stop offset="1" stop-color="#05090f"/></radialGradient>` +
    `<linearGradient id="${id}-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a0ffd2" stop-opacity="0.75"/><stop offset="1" stop-color="#46e69a" stop-opacity="0.08"/></linearGradient>` +
    `</defs>` +
    `<rect width="48" height="48" fill="url(#${id}-sky)"/>` +
    `<circle cx="9" cy="8" r="0.7" fill="#cfe"/><circle cx="38" cy="6" r="0.6" fill="#cfe"/><circle cx="43" cy="17" r="0.5" fill="#cfe"/><circle cx="5" cy="21" r="0.5" fill="#cfe"/>` +
    `<path d="M-6 50 Q24 28 54 50 Z" fill="#14281e"/><path d="M-6 50 Q24 28 54 50" fill="none" stroke="#46e69a" stroke-opacity="0.45" stroke-width="0.8"/>` +
    `<path class="scan-avatar-beam" d="M21.5 17 L26.5 17 L36 41 L12 41 Z" fill="url(#${id}-beam)"/>` +
    `<path class="scan-avatar-plot" d="M24 36.5 L33 40.5 L24 44.5 L15 40.5 Z" fill="#46e69a" fill-opacity="0.18" stroke="#a0ffd2" stroke-width="0.9"/>` +
    `<line class="scan-avatar-sweep" x1="16" y1="40.5" x2="32" y2="40.5" stroke="#ecfff6" stroke-width="0.8"/>` +
    `<g class="scan-avatar-craft">` +
    `<rect x="9" y="11.5" width="9" height="4" fill="#1c3a44" stroke="#7fd6e8" stroke-width="0.6"/>` +
    `<rect x="30" y="11.5" width="9" height="4" fill="#1c3a44" stroke="#7fd6e8" stroke-width="0.6"/>` +
    `<path d="M9 13.5h9M30 13.5h9" stroke="#7fd6e8" stroke-width="0.4"/>` +
    `<path d="M18 13.5h3M27 13.5h3" stroke="#9fb4b8" stroke-width="0.8"/>` +
    `<path d="M24 8 L28.5 11 L28.5 16 L24 19 L19.5 16 L19.5 11 Z" fill="#26343a" stroke="#c6e8ee" stroke-width="0.7"/>` +
    `<circle class="scan-avatar-eye" cx="24" cy="13.5" r="2" fill="#46e69a"/>` +
    `</g>` +
    `</svg>`
  );
}

/** The dock's element, to sit in the map's frame. Presses go to `onPress` with the slot. */
export function mountScanDock(onPress: (slot: number) => void): HTMLElement {
  const dock = el("div", { class: "scan-dock", attrs: { id: "scan-dock", "aria-label": "Ground Scans" } });
  dock.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-scan]");
    if (!btn || !dock.contains(btn)) return;
    e.preventDefault();
    onPress(Number(btn.dataset.scan));
  });
  dock.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-scan]");
    if (!btn) return;
    e.preventDefault();
    onPress(Number(btn.dataset.scan));
  });
  return dock;
}

/** Bring the dock up to date: a button per slot, its state, and whether it is armed for a click. */
export function paintScanDock(m: MatchSnapshot | null | undefined, armed: number | null): void {
  const dock = document.getElementById("scan-dock");
  if (!dock) return;
  const slots = m ? scanDockSlots(m) : [];
  while (dock.children.length > slots.length) dock.lastElementChild!.remove();
  for (const s of slots) {
    let btn = dock.children[s.slot] as HTMLButtonElement | undefined;
    const n = s.slot + 1;
    if (!btn) {
      btn = el("button", {
        class: "scan-btn",
        attrs: { type: "button", "data-scan": String(s.slot), "data-tip-side": "below", "aria-label": `Ground Scan ${n}` },
        html: avatarSvg(s.slot) + `<span class="scan-num">${n}</span><span class="scan-state"></span><span class="scan-ring"></span>`,
      }) as HTMLButtonElement;
      dock.append(btn);
    }
    if (btn.dataset.state !== s.state) {
      btn.dataset.state = s.state;
      btn.querySelector(".scan-state")!.textContent = STATE_LABEL[s.state];
      btn.dataset.tipTitle = `Ground Scan ${n} · ${STATE_LABEL[s.state]}`;
      btn.dataset.tip = tipOf(s.state);
    }
    btn.classList.toggle("is-armed", armed === s.slot);
    btn.setAttribute("aria-pressed", armed === s.slot ? "true" : "false");
  }
}
