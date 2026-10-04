/**
 * Which acknowledgement line a fresh selection speaks. Client-only.
 * A unit only answers when it joins the selection, so deselecting,
 * shift-removing, or clicking the same soldier again stays quiet.
 */
import type { EntityType, EntityView } from "@gridlock/shared";

export type SelectVoice = "rifleman";

const VOICED: ReadonlySet<EntityType> = new Set<EntityType>(["rifleman"]);

type VoiceUnit = Pick<EntityView, "id" | "type" | "kind" | "ownerId" | "wreck">;

export function selectVoice(
  entities: readonly VoiceUnit[],
  prev: ReadonlySet<number>,
  ids: readonly number[],
  youPlayerId: EntityView["ownerId"],
): SelectVoice | null {
  const fresh = new Set(ids.filter((id) => !prev.has(id)));
  if (fresh.size === 0) return null;
  for (const e of entities) {
    if (!fresh.has(e.id) || e.kind !== "unit" || e.wreck || e.ownerId !== youPlayerId) continue;
    if (VOICED.has(e.type)) return e.type as SelectVoice;
  }
  return null;
}
