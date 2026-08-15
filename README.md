# Bubble Bobble Online

A browser remake of the 1986 Taito arcade platformer, rebuilt with modern
artwork. Written from scratch in plain HTML5 canvas + JavaScript — no build
step, no dependencies, no image or audio files. Every character, platform and
sound effect is generated in code.

**Play it:** https://chloelee0207.github.io/Bubble/

Locally, open `index.html` in a browser. (Any static file server also works:
`npx http-server .`)

## Modes

| Mode | What it is |
| --- | --- |
| **Solo** | Mochi alone. Clear all 12 rounds, then they loop faster and harder. |
| **Team Up** | Mochi and Puff co-op on the same screen, each with their own lives and EXTEND letters. |
| **Versus** | Head to head in a symmetric arena. Monsters keep spawning, and you can bubble your rival for 2000 points. Highest score after two minutes wins. |

## Controls

| | Move | Jump | Blow bubble |
| --- | --- | --- | --- |
| Player 1 (Mochi, the cat) | `←` `→` | `↑` | `Space` (or `Z`) |
| Player 2 (Puff, the bunny) | `A` `D` | `W` | `S` |

`Enter` select · `P` pause · `M` mute · `Esc` back to title.
On phones and tablets an on-screen D-pad appears automatically.

## Rules

- Trap every monster in a bubble, then **burst the bubble by touching it**.
  The monster pops into fruit, which arcs out and lands nearby — go get it.
- Bubbles you blow travel a fixed distance, then float upward on the round's
  air current and pop by themselves after about nine seconds.
- **Empty bubbles are platforms.** Drop onto one and you ride it upward — the
  fastest way across a round.
- **Every rung is also reachable on foot.** Platforms sit exactly three rows
  apart and a jump clears three and a half, so bubbles are a shortcut, never a
  requirement.
- A monster left in a bubble too long **escapes and turns angry** (red, roughly
  twice as fast).
- Take too long and **HURRY UP!** flashes: every monster turns angry, and ten
  seconds later an invincible hunter starts chasing you through the walls. It
  cannot be killed — only outrun.
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
| `S` | Run much faster |
| `R` | Rapid-fire bubbles |
| `F` | Faster bubbles |
| `L` | Longer bubble range |
| `+` | 100 points for every bubble you blow |

Power-ups last for the rest of the round and are lost when you die.

## The cast

| Critter | Behaviour |
| --- | --- |
| **Chick** | Cheerful walker. Turns at ledges, jumps gaps, jumps toward you when you are above it. |
| **Ghost** | Slower drifter that stops to throw spinning stars along the platform. |
| **Bat** | Flier. Ignores gravity, moves in straight lines and bounces off blocks. |
| **Frog** | Hops on a spring, changing direction at random. |
| **The Hunter** | The HURRY UP! ghost. Invincible, flies straight at the nearest player through solid rock. |

## Files

```
index.html        page shell, control legend, touch pad
css/style.css     layout and the on-screen pad
js/gfx.js         world metrics, responsive scaling, vector art for every critter,
                  themes, block rendering, backdrops
js/audio.js       WebAudio chiptune engine (SFX + background loop)
js/levels.js      the 12 round layouts + the versus arena
js/entities.js    physics, players, bubbles, monsters, items, elemental effects
js/game.js        modes, rounds, collision resolution, scoring, HUD, screens
js/main.js        input, fixed 60 Hz timestep loop, screen scaling
```

The playfield is a 24 × 16 grid of 16-unit tiles. Everything is drawn as
vectors through a single scale transform, so the canvas is rendered at the
display's real pixel density and fills as much of the window as its aspect
ratio allows — sharp on a phone and on a 4K monitor alike.

### Game feel

- Jump apex is 57 units (3.5 tiles) against a 48-unit rung spacing.
- **Coyote time** (7 frames) lets you jump just after walking off an edge.
- **Jump buffering** (8 frames) fires an early press the moment you land.
- Landing on a platform is forgiving by 4 units, so a jump that barely clears
  a rung still sticks.
- Loot has a short pickup delay so it visibly pops out of a burst instead of
  being collected on the same frame.

## Notes on accuracy

Mechanics and numbers were taken from arcade/NES documentation: the
`1000 × 2^(n-1)` simultaneous-pop formula, the 500→6000 fruit progression,
EXTEND letters dropping from multi-pops, monsters enraging on escape, the
HURRY UP! timer followed by an invincible hunter, elemental bubbles firing
opposite the player's facing, and the fall-off-the-bottom screen wrap. Level
layouts, characters and artwork are original work, not copies of Taito's.

## Deploying

`.github/workflows/pages.yml` publishes the repo root to GitHub Pages on every
push to the default branch. Nothing is built or bundled — the files are
uploaded as they are.

One-time setup, needed because a workflow token is not allowed to create a
Pages site: go to **Settings → Pages → Build and deployment** and set
**Source** to **GitHub Actions**.
