# Bubble Bobble Online

A browser remake of the 1986 Taito arcade platformer, written from scratch in
plain HTML5 canvas + JavaScript. No build step, no dependencies, no assets —
every sprite, tile and sound is generated in code.

**Play it:** https://chloelee0207.github.io/Bubble/

Locally, open `index.html` in a browser. (Any static file server also works:
`npx http-server .`)

## Deploying

`.github/workflows/pages.yml` publishes the repo root to GitHub Pages on every
push to the default branch, and turns Pages on for the repo the first time it
runs. Nothing is built or bundled — the files are uploaded as they are.

## Modes

| Mode | What it is |
| --- | --- |
| **1 Player** | Bub alone. Clear all 12 rounds, then they loop faster and harder. |
| **2 Player Team** | Bub and Bob co-op on the same screen, each with their own lives and EXTEND letters. |
| **2 Player Versus** | Head to head in a symmetric arena. Monsters keep spawning, and you can bubble your rival for 2000 points. Highest score after two minutes wins. |

## Controls

| | Move | Jump | Blow bubble |
| --- | --- | --- | --- |
| Player 1 (Bub) | `←` `→` | `↑` | `Space` (or `Z`) |
| Player 2 (Bob) | `A` `D` | `W` | `S` |

`Enter` select · `P` pause · `M` mute · `Esc` back to title.
On phones and tablets an on-screen D-pad appears automatically.

## Rules

- Trap every monster in a bubble, then **burst the bubble by touching it**.
  A burst monster turns into fruit.
- Bubbles you blow travel a fixed distance, then float upward on the round's
  air current and pop by themselves after about eight seconds.
- **Empty bubbles are platforms.** Fall onto one and you ride it upward — the
  way to reach the top of most rounds.
- A monster left in a bubble too long **escapes and turns angry** (red, roughly
  twice as fast).
- Take too long in a round and **HURRY UP!** flashes: every monster turns
  angry, and ten seconds later an invincible **Skel-Monsta** starts hunting
  you through the walls. It cannot be killed — only outrun.
- Fall off the bottom of the screen and you reappear at the top.

## Scoring

| Event | Points |
| --- | --- |
| Popping *n* trapped monsters at once | `1000 × 2^(n-1)` → 1000, 2000, 4000, 8000, 16000… |
| Fruit | 500, then 1000 → 6000, rising with each monster killed in the round |
| Popping an empty bubble | 10 |
| Water gem / fire gem / lightning gem | 7000 / 5000 / 8000 |
| Power-up item | 100 (rings 1000) |
| Bubbling and bursting your rival (versus) | 2000 to you, −500 to them |

**EXTEND**: popping two or more trapped bubbles at once shakes loose floating
`E X T E N D` letters. Collect all six and you get a free life — the letters
then reset. Progress is shown in the HUD.

## Special bubbles

Water, fire and lightning bubbles drift in from the sides every few seconds.
Pop one and the element fires **away from the direction you are facing**, which
is the original's positioning trick:

- **Water** — pours down and runs along the floor, sweeping monsters away (7000-point gem).
- **Fire** — droplets fall and spread into a burning patch along the ground (5000-point gem).
- **Lightning** — a bolt that rips sideways straight through walls (8000-point gem).

## Power-ups

Monsters occasionally drop an item when burst:

| Item | Effect |
| --- | --- |
| `S` red shoes | Run much faster |
| `Y` yellow candy | Rapid-fire bubbles |
| `B` blue candy | Faster bubbles |
| `P` purple candy | Longer bubble range |
| `R` ring | 100 points for every bubble you blow |

Power-ups last for the rest of the round and are lost when you die.

## The monsters

| Monster | Behaviour |
| --- | --- |
| **Zen-Chan** | Clockwork walker. Turns at ledges, jumps gaps, jumps toward you when you are above it. |
| **Mighta** | Slower walker that stops to hurl boulders along the platform. |
| **Monsta** | Flier. Ignores gravity, moves in straight lines and bounces off blocks. |
| **Banebou** | Hops on a spring, changing direction at random. |
| **Skel-Monsta** | The HURRY UP! hunter. Invincible, flies straight at the nearest player through solid rock. |

## Files

```
index.html        page shell, control legend, touch pad
css/style.css     layout and the on-screen pad
js/gfx.js         constants, 3x5 bitmap font, pixel-art sprite baking, tile themes
js/audio.js       WebAudio chiptune engine (SFX + background loop)
js/levels.js      the 12 round layouts + the versus arena
js/entities.js    physics, players, bubbles, monsters, items, elemental effects
js/game.js        modes, rounds, collision resolution, scoring, HUD, screens
js/main.js        input, fixed 60 Hz timestep loop, screen scaling
```

The playfield is a 20 × 14 grid of 16-pixel tiles (320 × 224) rendered at
integer scale with nearest-neighbour filtering, so it stays crisp at any
window size.

## Notes on accuracy

Mechanics and numbers were taken from arcade/NES documentation: the
`1000 × 2^(n-1)` simultaneous-pop formula, the 500→6000 fruit progression,
EXTEND letters dropping from multi-pops, monsters enraging on escape, the
HURRY UP! timer followed by the Skel-Monsta, elemental bubbles firing opposite
the player's facing, and the fall-off-the-bottom screen wrap. Level layouts and
sprites are original work in the style of the game, not copies of Taito's data.
