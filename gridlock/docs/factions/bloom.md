# The Bloom — third faction (first pass)

> *"It did not land. It rained."*

A spore storm came down over the marshes. Whatever it touched, it rewrote: reeds,
frogs, eels, beetles, the dead in their trenches. The Bloom is not an army that
builds; it is a garden that fights. It grows its structures out of the ground,
gestates its soldiers in sacs, and every wound it takes it slowly closes.

Alliance fields steel and crews. The Xenomorphs field machines on an uplink.
The Bloom fields **flesh**: thin-skinned, cheap, fast, and always healing.

## Identity

| | |
|---|---|
| Faction id | `bloom` |
| On screen | **The Bloom** |
| Silhouette | Hunched, many-legged, sac-backed, spined. Nothing has a straight edge. |
| Materials | Wet flesh, bone-ivory chitin plates, dark membrane, glowing amber sacs |
| Tell at a glance | **Amber bioluminescence** (Xenomorph glow green, EU has none) |

### Palette lock (every Bloom sprite)

| Role | Colours |
|---|---|
| Flesh | `#5e2f45` dark · `#8a4a63` mid · `#b7778a` light |
| Chitin / bone | `#3a2a2e` dark · `#8c7a63` mid · `#cdbb98` light |
| Membrane / underbelly | `#24161f` |
| Glow (sacs, eyes, seams, acid) | `#e0701a` deep · `#ffb13b` amber · `#ffe08a` hot |
| Team tint plates | chassis gray `#6e6e68` / `#4a4a46` — a carapace plate on every unit/building |
| Outline | `#1a1410` |

## Faction traits

1. **Regrowth.** Every Bloom unit and structure closes its wounds. After
   `REGROWTH_DELAY_SECONDS` without taking a hit it regains a share of its
   max HP each second (units faster than structures). There is no repair
   truck and no engineer: the Mender is the only thing that speeds it up.
2. **Living glands.** Spines, acid and spores grow back: no Bloom weapon runs
   dry and none needs a truck, pad or pool to rearm (shared with the Xenomorphs'
   endless-ammo rule, without the Xenomorphs' damage penalty).
3. **Soft bodies.** Bloom hulls carry thin plate for their price and leave no
   wreck: a dead beast melts into the soil.
4. **Brood instinct.** Brood infantry take no stance orders and suffer no
   limb hits (limbs regrow); they fight on their feet.

## Roster

Costs and numbers live in `packages/shared/src/catalog.ts`; this table is the intent.

### Base (Structures)

| id | Name | Role (mirrors) | Look |
|---|---|---|---|
| `sporepod` | Spore Pod | HQ on the move (Rig / Seed) | A fat, ribbed seed-pod on six stubby root legs, amber veins, a puckered vent on top |
| `broodheart` | Brood Heart | HQ (Core / Hive Core), 3×3 | A huge beating heart-mound half sunk in the ground, ribs arching over it, glowing ventricles, veins running into the soil |
| `lumenbulb` | Lumen Bulb | Power (Dynamo / Fusion Node), 2×2 | A cluster of three translucent bulbs on stalks, glowing amber, roots knotted at the base |
| `gorger` | Gorger | Scrap (Smelter / Assimilator), 3×3 | A wide maw ringed with teeth over the scrap, a gullet sac swelling behind it |
| `broodnest` | Brood Nest | Infantry producer (Barracks / Cyborg Central), 2.5×2.5 | A mound of leathery egg-sacs under a chitin awning, one sac splitting open |
| `gestator` | Gestator | Beast producer (Machine Shop / Forge), 3×3 | A long ribbed womb-hall, a huge translucent sac with a shape inside, a birthing slit at the front |
| `braincoral` | Brain Coral | Tech + radar (Research / Nexus), 2×2 | A folded brain-coral dome crowned with feeler stalks that glow at the tips |
| `tidewomb` | Tide Womb | Shipyard on water (Marine Base / Spawning Pool), 2.5×2.5 | A ring of fleshy lily-pads around an amber pool, tendrils trailing in the water |
| `roost` | Roost | Airfield, 4 nests (Airfield / Aerie) | A long arching bone spine with four cup-shaped nests of woven sinew beside it |

### Defences

| id | Name | Role | Look |
|---|---|---|---|
| `thornspitter` | Thorn Spitter | Anti-infantry, crewless | A bulb on a thick root with a fan of quills and a puckered mouth that turns |
| `bilelance` | Bile Lance | Anti-armour, crewless (needs Brain Coral) | A tall curled stalk with an acid gland at its tip, like a scorpion tail planted in the ground |
| `puffcap` | Puffcap | Anti-air, crewless | A squat mushroom whose cap bursts spore clouds at planes |
| `eyestalk` | Eye Stalk | Watch post, 2 brood inside see and shoot farther | A tall fleshy stalk with a single huge eye and a hollow pouch under it |
| `husk` | Husk Burrow | Bunker, 5 brood inside | The hollowed carapace of a giant beetle, half buried, with firing slits between plates |

### Brood (Infantry)

| id | Name | Fights | Look |
|---|---|---|---|
| `spawnling` | Spawnling | **Melee** — two hooked claws, very fast, very cheap | Dog-sized, hunched biped, all mouth and claws, amber eye cluster |
| `gobber` | Gobber | Ranged — acid spit, a rifle's job | Lanky, a throat sac that swells before each spit |
| `quillback` | Quillback | Ranged — stream of quills, a gunner's job | Squat and broad, back a porcupine bed of quills, fires from a shoulder hump |
| `bloater` | Bloater | Anti-armour — lobs acid sacs that eat plate | Bloated, waddling, carries glowing acid sacs on its back and hurls them |
| `longspine` | Longspine | Sniper — one long bone spine at great reach | Gaunt, very tall, one elongated arm that is a spine-launcher, many eyes |
| `mender` | Mender | Healer — knits flesh, no weapon | Delicate, translucent, long feelers trailing amber threads |

### Beasts (Tanks)

| id | Name | Fights | Look |
|---|---|---|---|
| `skitter` | Skitter | Fast raider, spine repeater, hunts infantry | Low six-legged tick, a quill pod on its back |
| `goretusk` | Goretusk | **Melee** charger, tusk-gore that staves in plate | Rhino-beetle: a plated head shield and two great tusks, four heavy legs |
| `mantis` | Bile Mantis | Main battle beast, acid cannon (pierce or splash) | Upright mantis torso (the turret) on a six-legged abdomen, acid gland cannon between the forearms |
| `bileworm` | Bile Worm | Acid jet, **burrows** | A segmented worm with a ring-mouth that sprays acid; digs in and vanishes |
| `sporemaw` | Sporemaw | Artillery — lobs spore bombs far | A toad-like beast with a huge swelling back sac that it vents upward |
| `matriarch` | Matriarch | Heavy; acid cannon; **births Spawnlings** as it walks (needs Brain Coral) | Enormous, eight legs, a sagging egg-laden abdomen, a crown of glowing sacs |

### Deep Brood (Naval)

| id | Name | Fights | Look |
|---|---|---|---|
| `driftjelly` | Drift Jelly | Cheap stinger — **melee** sting on boats and swimmers | A floating jellyfish bell, tentacles trailing, amber core |
| `spineback` | Spineback | Fast attack — spine cannon | A finned fish-hull skimming the surface, dorsal quill battery |
| `abyssray` | Abyss Ray | Dives; fires acid eels (torpedoes) (needs Brain Coral) | A wide manta, glowing spots along the wings |
| `leviathan` | Leviathan | Heavy — acid mortar on its back (needs Brain Coral) | A turtle-whale, mossy plated shell, a gland-cannon rising from it |
| `broodbarge` | Brood Barge | Transport | A broad floating lily-raft of flesh with a pouch hold |

### Skybrood (Aircraft)

| id | Name | Fights | Look |
|---|---|---|---|
| `moth` | Watcher Moth | Recon, no weapon | Huge pale moth, eye-spots on its wings that really are eyes |
| `razorwing` | Razorwing | Fighter | A swift-like flyer with bladed membrane wings, quill guns |
| `gasbag` | Gasbag | Bomber — acid bombs | A floating bladder with small flapping fins and a dangling bomb sac |
| `drifter` | Drifter | Hover — drips acid on what it hangs over | A sky-jelly: a glowing bell with long stinging tendrils |
| `harpy` | Harpy | Torpedo bomber — drops an acid eel over water (needs Brain Coral) | A long-necked sea-bird-wyrm with a living eel clutched under it |

## Iteration notes

- Audio falls back to Battle Control / generic cues for now; a Bloom announcer ("the Choir") and creature voices are the obvious next pass.
- Shots draw as the default tracers; amber acid/spore FX are the next client pass.
- Balance is a first guess around the Xenomorphs' price bands.
