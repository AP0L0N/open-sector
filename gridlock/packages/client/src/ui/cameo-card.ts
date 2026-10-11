import {
  armorLabel,
  BUILD_REQUIRES,
  canBurrow,
  canCloak,
  canLunge,
  canQueueStructure,
  catalog,
  costFor,
  endlessAmmo,
  energyDomeOf,
  energyOf,
  energyShieldOf,
  energySupplyOf,
  energyWallOf,
  factionDamage,
  factionOf,
  hasForceField,
  isDefenceStructure,
  isFenceLine,
  isInfantryType,
  isOneAtATime,
  isRadarStation,
  isTrainType,
  isTransportType,
  isYardField,
  plasmaCellOf,
  primaryInfantryGun,
  producerType,
  rocketAmmoOf,
  rocketRackOf,
  rocketsOf,
  airRackOf,
  SHELL_TYPES,
  techNeeds,
  TILE_SUBDIV,
  usesHiveEnergy,
  type BuildingType,
  type EntityType,
  type Faction,
} from "@gridlock/shared";
import { CARD_ROLE } from "./card-roles.js";
import { el } from "./dom.js";

/** One figure on the card: a short label over its value. */
export interface CardStat {
  label: string;
  value: string;
  /** Small unit after the value ("s", "/s", "cells"). */
  unit?: string;
  /** Takes two cells of the grid: a long value like the armour faces or a shell rack. */
  wide?: boolean;
}

/** Everything a sidebar card's tooltip shows about a unit or building, before any live state. */
export interface CameoCard {
  name: string;
  /** "Infantry", "Vehicle", "Aircraft", "Defence"... */
  kind: string;
  /** One line: what it is for. */
  role: string;
  /** The catalog's own description. */
  blurb: string;
  /** The headline price: scrap, hive energy taken, hive energy added, or free. */
  price: { value: string; unit: string; note?: string; tone: "scrap" | "energy" | "supply" | "free" };
  /** Build time and power, beside the price. */
  meta: CardStat[];
  /** Toughness and movement. */
  body: CardStat[];
  /** The weapon, when it has one. */
  weapon: { name: string; stats: CardStat[] } | null;
  /** Special abilities, one short tag each. */
  traits: string[];
  /** Buildings that must stand first, and where a unit is trained. */
  needs: string[];
  from: string | null;
}

/** Whole numbers grouped by thousands, the rest to one decimal place. */
export function fmtNum(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? r.toLocaleString("en-US") : r.toFixed(1);
}

/** Sub-tiles to the map cells a player sees. */
function cells(subTiles: number): string {
  return fmtNum(subTiles / TILE_SUBDIV);
}

function kindOf(type: EntityType): string {
  const c = catalog(type);
  if (c.kind === "building") {
    if (isYardField(type) || isFenceLine(type)) return "Line";
    return isDefenceStructure(type) ? "Defence" : "Structure";
  }
  if (isInfantryType(type)) return "Infantry";
  if (c.drone) return "Drone";
  if (c.aircraft || c.hovers) return "Aircraft";
  if (c.naval) return "Ship";
  const f = factionOf(type);
  return f === "bloom" ? "Beast" : f === "xeno" ? "War machine" : "Vehicle";
}

function priceOf(type: EntityType, faction: Faction): CameoCard["price"] {
  const piece = isYardField(type) || isFenceLine(type) ? "per piece" : undefined;
  if (usesHiveEnergy(faction)) {
    const supply = energySupplyOf(type);
    if (supply > 0) return { value: `+${fmtNum(supply)}`, unit: "ENERGY", note: "added to the hive", tone: "supply" };
    const take = energyOf(type);
    if (take > 0) {
      const note = type === "laserfence" ? "per post, plus each link" : "taken while it stands";
      return { value: fmtNum(take), unit: "ENERGY", note, tone: "energy" };
    }
    return { value: "FREE", unit: "", tone: "free" };
  }
  const cost = costFor(type, faction);
  if (cost <= 0) return { value: "FREE", unit: "", tone: "free" };
  return { value: fmtNum(cost), unit: "SCRAP", note: piece, tone: "scrap" };
}

function weaponOf(type: EntityType): CameoCard["weapon"] {
  const c = catalog(type);
  const gun = isInfantryType(type) ? primaryInfantryGun(type) : null;
  const stats: CardStat[] = [];
  let name: string;
  if (gun && gun.damage > 0) {
    name = gun.name;
    const shots = gun.shotsPerTick ?? 1;
    stats.push({ label: "Damage", value: fmtNum(factionDamage(type, gun.damage)) + (shots > 1 ? ` ×${shots}` : "") });
    stats.push(rateStat(gun.cooldown, shots));
    stats.push({ label: "Range", value: cells(gun.rangeTiles ?? c.rangeTiles), unit: "cells" });
    stats.push({ label: "Pierce", value: pierce(gun.penetration) });
  } else if (c.damage > 0) {
    name = c.torpedoes || c.airTorpedo ? "Torpedo" : c.bite ? "Jaws" : c.ammo ? "Main gun" : "Guns";
    const shots = (c.shotsPerTick ?? 1) * (c.twinGuns ? 2 : 1);
    stats.push({ label: "Damage", value: fmtNum(factionDamage(type, c.damage)) + (shots > 1 ? ` ×${shots}` : "") });
    if (c.cooldown > 0) stats.push(rateStat(c.cooldown, c.shotsPerTick ?? 1));
    if (c.rangeTiles > 0) stats.push({ label: "Range", value: cells(c.rangeTiles), unit: "cells" });
    stats.push({ label: "Pierce", value: pierce(c.penetration) });
  } else if (rocketsOf(type)) {
    const rack = rocketRackOf(type);
    name = airRackOf(type) ? "Rocket racks" : "Rockets";
    stats.push({ label: "Damage", value: fmtNum(factionDamage(type, rack.damage)) + (rack.salvo > 1 ? ` ×${rack.salvo}` : "") });
    stats.push({ label: "Salvo every", value: fmtNum(rack.reload + rack.interval * Math.max(0, rack.salvo - 1)), unit: "s" });
    if (c.rangeTiles > 0) stats.push({ label: "Range", value: cells(c.rangeTiles), unit: "cells" });
    stats.push({ label: "Pierce", value: pierce(rack.penetration) });
  } else {
    return null;
  }
  const ammo = ammoLine(type, gun?.clip, gun?.reload);
  if (ammo) stats.push(ammo);
  const cell = plasmaCellOf(type);
  if (cell) stats.push({ label: "Energy cell", value: `${cell.shots} shots`, unit: `+1 every ${fmtNum(cell.rechargeSeconds)}s`, wide: true });
  return { name, stats };
}

function rateStat(cooldown: number, shots: number): CardStat {
  if (cooldown <= 0) return { label: "Rate", value: "—" };
  if (cooldown < 1) return { label: "Rate", value: fmtNum(shots / cooldown), unit: "/s" };
  return { label: "Reload", value: fmtNum(cooldown), unit: "s" };
}

function pierce(p: number): string {
  return p >= 999 ? "MAX" : fmtNum(p);
}

/** What the weapon carries: endless for the hive and the Bloom, else the rack, belt, or magazine. */
function ammoLine(type: EntityType, clip?: number, reload?: number): CardStat | null {
  const c = catalog(type);
  if (endlessAmmo(type)) return { label: "Ammo", value: "Endless" };
  if (c.ammo) {
    const rack = SHELL_TYPES.filter((s) => (c.ammo?.[s] ?? 0) > 0).map((s) => `${s.toUpperCase()} ${c.ammo![s]}`);
    return { label: "Ammo", value: rack.join(" · "), wide: rack.length > 1 };
  }
  if (clip && clip > 1) return { label: "Magazine", value: fmtNum(clip), unit: reload ? `${fmtNum(reload)}s reload` : undefined };
  if (c.belt) return { label: "Belt", value: fmtNum(c.belt) };
  const rockets = rocketAmmoOf(type);
  if (rockets > 0) return { label: "Rockets", value: fmtNum(rockets) };
  return null;
}

function traitsOf(type: EntityType): string[] {
  const c = catalog(type);
  const out: string[] = [];
  const add = (on: unknown, tag: string) => {
    if (on) out.push(tag);
  };
  add(c.special === "deploy" && c.bracedHpMul, "Braces in place");
  add(c.special === "deploy" && !c.bracedHpMul, "Deploys");
  add(c.hovers, "Hovers");
  add(c.aircraft && !c.hovers, "Flies");
  add(c.fighter, "Hunts planes");
  add(c.recon, "Recon");
  add(c.drone, "Remote drone");
  add(c.naval, "Water only");
  add(c.submerges, "Dives");
  add(c.neverSurfaces, "Always submerged");
  add(c.sonar, "Sonar");
  add(c.wades && c.fightsWading, "Fights in water");
  add(c.wades && !c.fightsWading, "Wades");
  add(c.airOnly, "Anti-air only");
  add(!c.airOnly && (c.antiAir || (isInfantryType(type) && primaryInfantryGun(type)?.antiAir)), "Hits aircraft");
  add(c.radarLaid, "Shoots down rockets");
  add(rocketsOf(type) && c.damage > 0, "Rocket pods");
  add(airRackOf(type), "Air or ground racks");
  add(c.roofCiws, "Roof CIWS");
  add(c.twinCiws, "Twin CIWS");
  add(c.hullFlamer, "Bow flamer");
  add(c.hasScout, "Hatch scout");
  add(c.tankDeck, "Carries vehicles");
  add((c.garrisonCap ?? 0) > 0 && !c.crewGun && !c.lampCrew, isTransportType(type) || c.garrisonDiesWithHost ? `Carries ${c.garrisonCap}` : `Garrison ${c.garrisonCap}`);
  add(c.crewGun || c.lampCrew, "Needs a crew");
  add(c.poweredGun, "No crew needed");
  add(c.armorFirst, "Picks armour first");
  add(c.shellResist, "Shrugs off big guns");
  add(energyShieldOf(type), "Energy shield");
  add(energyDomeOf(type), "Energy dome");
  add(energyWallOf(type), "Energy curtain");
  add(canBurrow(type), "Burrows");
  add(canCloak(type), "Cloaks");
  add(canLunge(type), "Lunges");
  add(hasForceField(type), "Force field");
  add(isRadarStation(type), "Lights the radar");
  add(isOneAtATime(type), "One at a time");
  add(canQueueStructure(type), "Queues up");
  return out;
}

/** The card for `type` as a player of `faction` sees it in the sidebar. */
export function cameoCard(type: EntityType, faction: Faction): CameoCard {
  const c = catalog(type);
  const meta: CardStat[] = [];
  if (c.buildSeconds > 0) meta.push({ label: "Build", value: fmtNum(c.buildSeconds), unit: "s" });
  if (!usesHiveEnergy(faction) && c.power !== 0) meta.push({ label: "Power", value: c.power > 0 ? `+${c.power}` : `−${-c.power}` });

  const body: CardStat[] = [{ label: "HP", value: fmtNum(c.hp) }];
  if (c.bracedHpMul) body.push({ label: "Braced HP", value: fmtNum(Math.round(c.hp * c.bracedHpMul)) });
  const armor = armorLabel(type);
  if (armor) body.push({ label: "Armour", value: armor, wide: true });
  if (c.moveTilesPerSec > 0) body.push({ label: "Speed", value: cells(c.moveTilesPerSec), unit: "cells/s" });
  if (c.sightTiles > 0) body.push({ label: "Sight", value: cells(c.sightTiles + (c.sightBonusTiles ?? 0)), unit: "cells" });

  const train = isTrainType(type);
  const from = train ? producerType(type) : null;
  // The producer is named once, as where it is trained.
  const needs = (train ? techNeeds(type) : BUILD_REQUIRES[type as BuildingType] ?? []).filter((t) => t !== from).map((t) => catalog(t).name);
  return {
    name: c.name,
    kind: kindOf(type),
    role: CARD_ROLE[type] ?? "",
    blurb: c.blurb ?? "",
    price: priceOf(type, faction),
    meta,
    body,
    weapon: weaponOf(type),
    traits: traitsOf(type),
    needs,
    from: from ? catalog(from).name : null,
  };
}

/** The cameo art: the last image layer of the button's own background. */
function artOf(btn: HTMLElement): string | null {
  const bg = getComputedStyle(btn).backgroundImage;
  const urls = [...bg.matchAll(/url\((['"]?)(.*?)\1\)/g)];
  return urls.at(-1)?.[2] ?? null;
}

function statGrid(stats: CardStat[], cls: string): HTMLElement {
  const grid = el("div", { class: cls });
  for (const s of stats) {
    const cell = el("div", { class: s.wide ? "card-stat is-wide" : "card-stat" });
    const value = el("span", { class: "card-stat-value", text: s.value });
    if (s.unit) value.append(el("small", { text: " " + s.unit }));
    cell.append(el("span", { class: "card-stat-label", text: s.label }), value);
    grid.append(cell);
  }
  return grid;
}

/** The card's contents: art and price up top, then figures, weapon, traits, the description, and live state. */
export function renderCameoCard(card: CameoCard, btn: HTMLElement): HTMLElement[] {
  const head = el("div", { class: "card-head" });
  const art = el("div", { class: "card-art" });
  const url = artOf(btn);
  if (url) art.style.backgroundImage = `url("${url}"), radial-gradient(circle at 50% 60%, rgba(232, 184, 74, 0.14), transparent 70%)`;
  else art.textContent = card.name.slice(0, 1);
  const title = el("div", { class: "card-title" });
  title.append(el("span", { class: "card-kind", text: card.kind }), el("span", { class: "card-name", text: card.name }));
  if (card.role) title.append(el("span", { class: "card-role", text: card.role }));
  const price = el("div", { class: `card-price is-${card.price.tone}` });
  const amount = el("span", { class: "card-price-value", text: card.price.value });
  if (card.price.unit) amount.append(el("small", { text: " " + card.price.unit }));
  price.append(amount);
  if (card.price.note) price.append(el("span", { class: "card-price-note", text: card.price.note }));
  if (card.meta.length) price.append(statGrid(card.meta, "card-meta"));
  title.append(price);
  head.append(art, title);

  const parts: HTMLElement[] = [head, statGrid(card.body, "card-stats")];
  if (card.weapon) {
    const w = el("div", { class: "card-weapon" });
    w.append(el("div", { class: "card-section", text: card.weapon.name }), statGrid(card.weapon.stats, "card-stats"));
    parts.push(w);
  }
  if (card.traits.length) {
    const tags = el("div", { class: "card-traits" });
    for (const t of card.traits) tags.append(el("span", { class: "card-trait", text: t }));
    parts.push(tags);
  }
  if (card.blurb) parts.push(el("p", { class: "card-blurb", text: card.blurb }));
  const reqs: string[] = [];
  // A live "Needs a ..." note already names what is missing.
  const note = btn.dataset.cardNote ?? "";
  if (card.from && !note.includes(card.from)) reqs.push(`Trained at ${card.from}`);
  if (card.needs.length && !note.startsWith("Needs")) reqs.push(`Needs ${card.needs.join(" + ")}`);
  if (reqs.length) parts.push(el("div", { class: "card-reqs", text: reqs.join("  ·  ") }));
  if (btn.dataset.cardNote) parts.push(el("div", { class: "card-note", text: btn.dataset.cardNote }));
  if (btn.dataset.cardHint) parts.push(el("div", { class: "card-hint", text: btn.dataset.cardHint }));
  return parts;
}

/** Hover this long before the card opens, like a native tooltip. Moving to the next cameo swaps at once. */
export const CARD_DELAY_MS = 550;

let cardAnchor: HTMLElement | null = null;
let cardTimer: ReturnType<typeof setTimeout> | null = null;
let cardBox: HTMLElement | null = null;
let cardFaction: () => Faction = () => "alliance";

/** One card box for the whole sidebar; it opens beside whichever cameo is hovered. */
export function bindCameoCards(sidebar: HTMLElement, host: HTMLElement, faction: () => Faction): void {
  hideCameoCard();
  cardFaction = faction;
  cardBox = el("div", { class: "cameo-card", attrs: { id: "cameo-card", role: "tooltip" } });
  host.append(cardBox);
  sidebar.addEventListener("pointerover", (e) => {
    const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>(".cameo");
    if (!btn || !sidebar.contains(btn) || btn === cardAnchor) return;
    const open = cardBox?.classList.contains("is-shown");
    cardAnchor = btn;
    if (cardTimer) clearTimeout(cardTimer);
    cardTimer = null;
    if (open) showCameoCard(btn);
    else cardTimer = setTimeout(() => showCameoCard(btn), CARD_DELAY_MS);
  });
  sidebar.addEventListener("pointerout", (e) => {
    if (!cardAnchor) return;
    const to = e.relatedTarget as Node | null;
    if (to && cardAnchor.contains(to)) return;
    if (to instanceof HTMLElement && to.closest(".cameo") && sidebar.contains(to)) return;
    hideCameoCard();
  });
  sidebar.addEventListener("pointerdown", () => hideCameoCard(), { capture: true });
  sidebar.addEventListener("scroll", () => hideCameoCard(), { passive: true });
}

function showCameoCard(btn: HTMLElement): void {
  cardTimer = null;
  const box = cardBox;
  const type = btn.dataset.cardType as EntityType | undefined;
  if (!box || !type || !btn.isConnected) return;
  cardAnchor = btn;
  box.replaceChildren(...renderCameoCard(cameoCard(type, cardFaction()), btn));
  box.classList.add("is-shown");
  const at = btn.getBoundingClientRect();
  const side = btn.closest(".sidebar")?.getBoundingClientRect() ?? at;
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  const left = Math.max(8, side.left - w - 10);
  const top = Math.max(8, Math.min(window.innerHeight - h - 8, at.top + at.height / 2 - h / 2));
  box.style.left = `${Math.round(left)}px`;
  box.style.top = `${Math.round(top)}px`;
}

export function hideCameoCard(): void {
  if (cardTimer) clearTimeout(cardTimer);
  cardTimer = null;
  cardAnchor = null;
  cardBox?.classList.remove("is-shown");
}

/** Live state on a cameo changed (needs a building, pads full...): repaint the card if it is open on it. */
export function setCameoCardState(btn: HTMLElement, note: string, hint: string): void {
  if ((btn.dataset.cardNote ?? "") === note && (btn.dataset.cardHint ?? "") === hint) return;
  btn.dataset.cardNote = note;
  btn.dataset.cardHint = hint;
  if (cardAnchor === btn && cardBox?.classList.contains("is-shown")) showCameoCard(btn);
}
