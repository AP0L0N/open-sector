import { el } from "./dom.js";

/**
 * A yes/no warning over the battlefield before an order that cannot be taken back
 * (Delete scraps the selection, Sell sells structures). Enter confirms, Esc backs out.
 * The fight keeps running behind it; while it is up, map hotkeys and the pause key wait.
 */
export interface ConfirmOpts {
  title: string;
  body: string;
  yes: string;
  onYes: () => void;
}

let open: { back: HTMLElement; onKey: (e: KeyboardEvent) => void } | null = null;

export function confirmOpen(): boolean {
  return open != null;
}

export function closeConfirm(): void {
  if (!open) return;
  document.removeEventListener("keydown", open.onKey, true);
  open.back.remove();
  open = null;
}

export function showConfirm(opts: ConfirmOpts): void {
  closeConfirm();
  const back = el("div", { class: "confirm-back" });
  const modal = el("div", { class: "panel modal" });
  modal.append(el("h2", { text: opts.title }));
  modal.append(el("p", { class: "tiny", text: opts.body }));
  const row = el("div", { class: "btn-row" });
  const no = el("button", { class: "btn", text: "Cancel", attrs: { type: "button" } });
  const yes = el("button", { class: "btn btn-primary", text: opts.yes, attrs: { type: "button" } });
  const accept = (): void => {
    closeConfirm();
    opts.onYes();
  };
  no.addEventListener("click", closeConfirm);
  yes.addEventListener("click", accept);
  back.addEventListener("pointerdown", (e) => {
    if (e.target === back) closeConfirm();
  });
  row.append(no, yes);
  modal.append(row);
  back.append(modal);
  // Document capture runs after the map's window-capture hotkeys (which stand down while this is open)
  // and stops the key before the pause menu's Esc sees it.
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeConfirm();
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      accept();
    }
  };
  document.addEventListener("keydown", onKey, true);
  open = { back, onKey };
  document.body.append(back);
  yes.focus();
}
