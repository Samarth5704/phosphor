# Phosphor — specification

An original fixed-shooter arcade game for the browser. The rules are modelled on
Taito's 1978 arcade machine; every byte in this repository is original.

Working title: **Phosphor**. Repo: `phosphor`.

---

## 1. The idea

The entire display is a single phosphor persistence buffer, and its decay rate is
a function of exactly one quantity: **aliens alive**.

Nothing is drawn as a hard sprite onto black. Each simulation step the intensity
buffer is multiplied down toward zero and the new frame is written on top. With
55 aliens the march is slow and the persistence is long, so the cannon drags a
tail and shots leave streaks and the whole field smears. With 8 aliens the march
is fast and the persistence is short, so the trails snap tight and the screen
goes crisp. By the last alien the display is nearly hard-edged and twitching.

This is not decoration. The 1978 machine's famous acceleration was an accident of
its draw budget — the hardware could redraw one alien per screen refresh, so
fewer aliens meant a faster wave. The smear on a real CRT was an artifact of the
same hardware generation. Binding the two together, so that screen persistence is
literally a readout of the counter that drives the tempo, is the whole point of
the project. One scalar feeds both.

The visual is redundant by construction: position, tempo, wave number and alien
count are all readable without the trails, so `prefers-reduced-motion` can pin
the decay to a short fixed constant and lose nothing but the smear.

---

## 2. Stack — hard constraints

Allowed:

- HTML, CSS, JavaScript as native ES modules (`<script type="module">`)
- Canvas 2D
- Web Audio API, synthesised from oscillators and generated noise buffers
- `node --test` from Node 24 for the test suite
- GitHub Actions for CI and Pages

Forbidden, and CI fails the build on any of these:

- **Any build step.** No bundler, no transpiler, no Vite, Rollup, esbuild,
  webpack, Parcel. The files served are the files in the repo.
- **Any runtime or dev dependency.** `package.json` carries no `dependencies` and
  no `devDependencies`. Zero `node_modules`.
- **TypeScript.** The domain here is small integers and small enums. Types would
  not pay for the build step they require.
- **Any framework or game engine.** No React, Vue, Svelte, Phaser, Kaboom,
  melonJS, PixiJS.
- **Any audio or graphics library.** No Tone.js, Howler, GSAP. The synthesis is
  roughly forty lines and it is the part worth showing.
- **WebGL.** The persistence buffer is 224×256 = 57,344 cells. Canvas 2D with a
  typed array is faster to reason about and fast enough by a wide margin.
- **Asset files of any kind.** No `.png`, `.jpg`, `.gif`, `.wav`, `.mp3`,
  `.ogg`, `.ttf`, `.woff`, `.woff2`, `.svg`. Sprites are 1-bit bitmaps declared
  in source as arrays of strings, which is how the original stored them. Glyphs
  for the HUD are either system fonts or hand-declared bitmaps.
- **Third-party fonts,** including Google Fonts links. No network requests at
  runtime at all.

Node 24 is the active LTS line as of mid-2026; `node:test` has been stable since
Node 20 and carries mocking, coverage and watch mode. Pin CI to Node 24.

---

## 3. Attribution — state this honestly

The README must say, in its own section, and without softening:

- Phosphor is an original game. All code, sprite bitmaps and audio synthesis in
  this repository are original work.
- Its rules are modelled on the 1978 Taito arcade game. Where a behaviour is
  taken from the original it is cited against
  `computerarcheology.com/Arcade/SpaceInvaders/` (commented disassembly) or
  `shmups.wiki/library/Space_Invaders` (mechanics tables).
- No Taito asset — sprite, sound, font, ROM or name — is used or reproduced.
  "Space Invaders" is a Taito trademark and appears in this repository only
  descriptively, when explaining what the rules are modelled on.
- Section 4.2 below distinguishes behaviours that are documented properties of
  the original from numbers we chose ourselves. The README must not claim
  authenticity for anything in the second list.

---

## 4. The rules

### 4.1 Authentic, cited, non-negotiable

These come from the documented behaviour of the original and are hard
requirements. Deviating from one means changing this spec first.

| Rule | Detail |
|---|---|
| Rack shape | 11 columns × 5 rows = 55 aliens, three types by row |
| Emergent speed | Exactly **one alien is updated per simulation step**. The wave's apparent speed is therefore inversely proportional to the number alive, and accelerates as they die. This is not a difficulty table. |
| Reference alien | The bottom-left alien is the rack origin; all others are positioned relative to it. It continues to define the origin after it is killed. |
| Step size | The reference alien moves 2px horizontally per rack cycle |
| Reversal | On touching a margin the rack drops one row and reverses |
| Player shot | **At most one player shot on screen at a time** |
| Object budget | Five moving objects: cannon, player shot, three invader shots, one slot per shot type. **The UFO shares the squiggly shot's slot specifically**: a squiggly cannot be fired while a UFO is on screen, and a UFO cannot appear while a squiggly is in flight. Rolling and plunger shots are unaffected by the UFO. |
| Shot types | Three: *rolling* (aimed at the cannon), *plunger*, *squiggly*. Only rolling aims. Each type owns one slot and fires only on its own turn of the round robin; a type that cannot fire (slot busy, no living column, disabled) fires nothing that turn — there is no fall-through to another type. |
| Plunger disabled | **The plunger shot is disabled entirely while exactly one alien remains.** Rolling and squiggly stay active. |
| Plunger columns | `1, 7, 1, 1, 1, 4, 11, 1, 6, 3, 1, 1, 11, 9, 2, 8` — cycled, 1-indexed |
| Squiggly columns | `11, 1, 6, 3, 1, 1, 11, 9, 2, 8, 2, 11, 4, 7, 10` — cycled, 1-indexed |
| Dead column | If the scheduled column has no living alien, it is skipped and the next table entry is used |
| Explosion freeze | An exploding alien freezes rack movement and firing for exactly 16 steps |
| Scores | Bottom two rows 10, middle two 20, top row 30 |
| Extra cannon | Awarded once, at 1500 points |
| UFO score | Indexed by the player's **fired shot count** through the 15-value cycle `50, 50, 100, 150, 100, 100, 50, 300, 100, 100, 100, 50, 150, 100, 100`: award = `cycle[(shotsFired − 1) mod 15]`. **The 8th, 23rd, 38th and every 15th shot thereafter award 300.** The sources' "23rd shot" framing holds only because the UFO does not appear early enough in a wave for the 8th shot to reach one; lowering our UFO interval would make the 8th-shot award reachable. It is not random. |
| Shot vs missile | When the player's shot and an invader missile overlap, **the player's shot is always destroyed**. The missile survives with a per-type probability drawn from the seeded rng: the squiggly almost always survives, the rolling and plunger usually do not. The asymmetry is documented; the probabilities are ours (§4.2). |
| Shields | Four destructible shields, eroded by player fire, by invader fire, **and by the descending rack**: an alien whose box overlaps a shield erases every overlapping cell. Rack erosion awards no score. |
| Wave heights | Waves 2 through 9 start progressively lower than wave 1; **wave 10 reverts to wave 1's starting height** and the cycle repeats. The distance per wave is ours (§4.2). |
| Loss | All cannons lost, **or** any alien reaching the cannon row, ends the game immediately |

#### 4.1.1 Recorded readings

Where the sources leave a choice, the reading below is the one the simulation
implements and the one Phase 2 hashes. Changing one changes `SIM_VERSION`.

- **Explosion freeze timing.** The freeze is 16 steps of no rack movement and
  no invader firing **after** the step on which the kill resolved. The rack has
  already taken its move on the kill step; it is frozen for the next 16 steps
  and moves again on the 17th step after the kill.
- **FIRE is edge-triggered** on the `down` phase. Holding FIRE does not
  auto-fire; a new shot requires a new `down` after the slot is free. A `down`
  that arrives while a shot is live is discarded and does not count as a fired
  shot.

### 4.2 Our tuning — not claimed as authentic

Everything below is a number we chose. It is tunable and the README must not
present it as a reproduction. Put these in one exported constants object so a
reviewer can find them in one place.

- Row drop distance on reversal
- Cannon movement speed, shot speeds (player and invader)
- UFO appearance interval and traversal speed
- Shield bitmap layout and erosion mask shape
- Wave 1 starting rack height and the per-wave drop distance within the
  documented 9-wave cycle (the cycle itself is §4.1). **These are coupled to
  `SHIELD_Y`:** the wave-9 rack starts at `RACK_START_Y + 8 ×
  RACK_DESCENT_PER_WAVE`, and its bottom row's lower edge, `+ ALIEN_H`, must
  not exceed `SHIELD_Y`, or a fresh wave-9 rack erases shield cells on its
  first pass. With the current numbers the two are equal (192): the rack
  touches the shield top without overlapping it. Changing any one of the four
  constants means re-checking the other three; `tests/rack.test.js` pins the
  inequality.
- Alien hitbox widths per type (the three types are §4.1; our boxes are
  12, 11 and 8 px, centred in a 12 px cell)
- Missile survival probabilities when the player's shot meets an invader
  missile (the asymmetry is §4.1; our numbers are rolling 20%, plunger 20%,
  squiggly 95%)
- Phosphor decay curve: the mapping from aliens-alive to decay constant
- Audio frequencies, envelopes and durations

---

## 5. Non-negotiable technical rules

These are the hazards specific to this project. Each has produced a real bug in
the reference implementations surveyed.

**5.1 Fixed timestep, integer positions.** The simulation advances in fixed
steps of 1/60s. Nothing in the simulation may scale by a frame delta. All
positions are integers in a 224×256 logical space. A rendered frame may
interpolate for display; the simulation may not.

**5.2 Clamp the accumulator.** `requestAnimationFrame` stops in a backgrounded
tab. On return the elapsed time can be minutes. The accumulator must clamp
elapsed time to a maximum of 250ms (15 steps) per frame, or the catch-up loop
hangs the page. Name the constant `MAX_CATCHUP_MS`.

**5.3 Collision is overlap, not containment.** The classic failure is testing
whether the shot's box is *inside* the target's box, which makes edge hits pass
straight through. Every test is axis-aligned overlap:
`a.x < b.x + b.w && a.x + a.w > b.x && ...`.

**5.4 Sweep the shot path.** Shots move several pixels per step and shields are
eroded per-pixel. A shot must be tested against every cell its path crosses
during a step, not only its end position, or it tunnels through thin geometry.

**5.5 The core is pure.** `src/core/` has no DOM access, no `Date`, no
`performance`, no `Math.random`, no globals, no `localStorage`. Every function
takes its inputs explicitly. Randomness arrives as a seeded generator passed in.
CI enforces this with a source scan that fails the build on those identifiers
appearing under `src/core/`.

**5.6 Every input is a recorded action.** Input reaches the simulation only as
`{step, action, phase}` records appended to a queue. Nothing reads the keyboard
inside the simulation. This is what makes replay possible and it is a phase 1
structural constraint, not a later feature.

**5.7 One store owns all state.** Views subscribe. Derived values — aliens
alive, current decay constant, march period — are computed, never stored as
mutable fields.

**5.8 Persisted data is versioned from day one** with a `migrate()` function.
Loading validates; corrupt data falls back to defaults; a payload whose version
is higher than the current one is left untouched and the session runs read-only
rather than overwriting it.

**5.9 Never re-render a list with `innerHTML`.** The rebinding list reconciles
keyed nodes.

**5.10 The phosphor buffer is logic, not a canvas trick.** It is a
`Float32Array(224*256)` of intensities decayed by multiplication, mapped to
`ImageData` at render time. Do not implement the fade by filling black at low
alpha with `destination-out`: alpha quantises to 1/255 and leaves permanent
residue that never clears. Because the buffer is a typed array, decay is a pure
function and is unit tested.

---

## 6. Accessibility — inline, per phase, not a final pass

- **The HUD is DOM, not canvas.** Score, lives, wave and messages live in real
  elements over the canvas. This makes them readable by a screen reader and
  gives their contrast a static, computable value against a fixed backdrop
  rather than against the moving phosphor field.
- **Nothing conveys meaning by colour alone.** Alien types differ by silhouette;
  lives are a count with a number beside the icons; damaged shields are visibly
  eroded, not tinted.
- **Contrast is computed and reported,** not eyeballed. Where text sits over the
  play field, the backdrop is opaque so the ratio is a single number. Any ratio
  reported is the computed one, printed by the test.
- **The canvas carries a text equivalent.** A visually hidden element states the
  current situation in one plain sentence — wave, aliens remaining, cannons
  remaining — updated on discrete events.
- **No `aria-live` on the score.** It changes many times per second. The live
  region announces only discrete events: wave start, cannon lost, game over.
- **Input is actions, not keys.** Gameplay code references `MOVE_LEFT`, `FIRE`,
  `PAUSE`; bindings are data, remappable, conflict-validated, and on-screen
  prompts read the current binding rather than hardcoding a key name. Remapping
  is the single most requested accessibility feature in games and it is
  structurally impossible to retrofit, which is why it is in phase 4 and not in
  stretch.
- **Dialogs trap focus, close on Escape, restore focus to the trigger.** After
  game over, focus moves deliberately to the restart control, never to `<body>`.
- **`prefers-reduced-motion` removes motion, never information.** It pins the
  decay constant to the short value; the tempo, positions and all state remain
  exactly as they were.
- **Touch targets 44px minimum. No horizontal scroll at 320px.**
- **The game is fully playable from the keyboard alone,** including starting,
  pausing, restarting and reaching every control. No pointer-only affordance.

---

## 7. Phases

Logic and tests come before anything visible. Phase 1 produces a game you cannot
see. That is the phase that matters most.

Each phase ends at an explicit stop point: commit, push, and hand the report
back before starting the next.

### Phase 1 — Core simulation, headless

`src/core/` only. No canvas, no DOM, no audio. A function that takes a state and
an action queue and returns the next state.

Build: the rack with the one-alien-per-step cursor and the reference-alien
origin; margin reversal and row drop; the player cannon and its single shot; the
three invader shot types with the column tables; shields as 1-bit grids with
per-pixel erosion; the UFO with its score cycle; scoring, extra cannon, loss
conditions; the seeded PRNG as an injected dependency.

Tests, written first:

- a rack of 55 aliens advances the reference alien 2px after 55 steps, not after 1
- the reference alien still defines the rack origin after it has been killed
- a rack whose rightmost living column is 7 reverses when column 7 reaches the margin, not when the dead column 11 would have
- an exploding alien freezes the rack for exactly 16 steps and it moves on the 17th
- a plunger shot whose scheduled column is entirely dead skips to the next table entry within the same step
- the plunger table wraps from index 15 back to index 0
- firing while a player shot is already live is a no-op **and does not increment the shot counter**, so it cannot advance the UFO cycle
- the UFO award on the player's 23rd fired shot is 300, and on the 38th is 300
- with a UFO on screen, a fourth invader shot cannot spawn while three exist, and only two may exist alongside it
- a shot overlapping an alien by 1px at its left edge registers a hit
- a shot travelling 4px per step across a 1px shield row erodes that row instead of passing through it
- an alien reaching the cannon row ends the game while three cannons remain
- the extra cannon is awarded when score crosses 1500 and is not awarded again at 3000
- a shot that leaves the top of the field frees the player's shot slot on the same step

**Stop.** Report the test count and any behaviour that could not be tested.

### Phase 2 — Determinism, replay, CI

Record `{simVersion, seed, steps, actions[]}`, where `actions` holds one
`{step, action, phase}` per action that occurred and nothing for silent steps.
Replay it through the core and hash the final state. Commit a fixture. Add the
GitHub Actions workflow that runs the suite, the zero-test guard, the replay
gate, and the purity scan, all failing the build.

**The hash input is a canonical encoding, not `JSON.stringify`.**
`src/core/serialise.js` sorts object keys, encodes `Uint8Array` length and
bytes directly, gives `undefined` its own marker so it differs from a deleted
field, gives `-0` its own marker so it differs from `0`, and rejects any
non-integer number, because a float in the state would make the hash
platform-sensitive. `src/core/hash.js` is FNV-1a in plain integer arithmetic,
no `node:crypto`, so the same code runs in the browser for stretch item 2.

**`SIM_VERSION` policy.** From the Phase 2 commit on, any change to simulation
behaviour — anything that alters how a recorded action log replays, including
a tuning number in `constants.js`, a §4.1.1 reading, or the rng's draw order —
bumps `SIM_VERSION` in `src/core/state.js` and re-records
`tests/fixtures/seed42-3000.js` **in the same commit**. The replayer refuses a
fixture whose `simVersion` differs from the current one and says so, rather
than replaying and failing on the hash or, worse, passing. There is no
regenerate mode, `--update` flag or environment variable that rewrites the
expected hash: a changed hash is a human decision, made by editing the fixture
deliberately.

Tests:

- replaying a 3,000-step recorded log against seed 42 reproduces the hash committed in the fixture as a literal
- two runs with the same seed and an empty action log produce identical UFO appearance steps
- a fixture recorded against an older `SIM_VERSION` fails loudly rather than replaying and silently passing
- the purity scan fails when `Math.random` is introduced anywhere under `src/core/`
- a state containing a non-integer number fails the serialiser
- a state field set to `undefined` hashes differently from the same state with that field deleted
- two states differing only in the order their keys were assigned hash identically
- a state differing only in the rng draw counter hashes differently

**Stop.** Report the workflow run URL and the hash.

### Phase 3a — Design tokens only

One file. Colour ramp for the phosphor field, HUD colours, spacing scale, type
scale, the decay curve constants, the timing constants. Nothing consumes it yet.

Plus the contrast test: every HUD foreground/background pair prints its computed
ratio and fails below 4.5:1.

**Stop, and this is a review checkpoint.** Reviewing a token file takes a
minute; reskinning finished components takes an evening. Do not start 3b until
the tokens are approved.

### Phase 3b — The phosphor renderer

`Float32Array` intensity buffer, decay by multiplication, geometry written as
intensity, mapped through the ramp into `ImageData`, `putImageData` to a 224×256
backing canvas, then `drawImage` to the display canvas at an integer scale with
`imageSmoothingEnabled = false` and `image-rendering: pixelated` in CSS.
Letterbox the remainder in field black.

Tests:

- a pixel lit to 1.0 decays to exactly 0, not to a residual epsilon, and the buffer is verifiably clear
- the decay constant is monotonic in aliens-alive and takes its documented values at 55 and at 1
- under `prefers-reduced-motion` the decay is the fixed short constant while rack positions, tempo and score are unchanged
- the upscale factor is an integer and the canvas offset is a whole number of pixels at 320×568, 375×812 and 1920×1080

**Stop.**

### Phase 4 — Input actions, rebinding, audio

Actions bound to `event.code`, not `key` or `keyCode`. Bindings stored as data,
validated for conflicts, remappable through a keyboard-reachable list. Audio:
one `AudioContext`, created lazily inside the first gesture handler, `resume()`
called synchronously in the same tick as the gesture with no `await` before it.
Five voices: march, shoot, alien explode, cannon explode, UFO warble. The march
is driven by the rack cursor, so its tempo accelerates from the same source as
the wave.

Tests:

- holding left, then pressing and releasing right, leaves left still active
- a `blur` event releases every held action
- a `keydown` with `repeat: true` does not re-trigger FIRE
- binding FIRE to a key already bound to PAUSE is rejected and names the conflict
- a bound key's default action is prevented, so Space does not scroll the page
- the audio module exposes no path that constructs an `AudioContext` outside a gesture handler

**Stop.** Report whether audio was verified with sound actually audible, or only
structurally. Those are different claims.

### Phase 5 — Shell, persistence, accessibility surface

Waves, cannons, pause, game over, restart, high score in versioned storage, the
live region, the hidden text equivalent, the rebinding UI wired up.

Tests:

- a stored payload with `version: 2` loaded by a v1 build leaves storage untouched and runs with defaults
- corrupt JSON in storage falls back to defaults without throwing
- `migrate()` from the v0 shape preserves the high score into v1
- the pause dialog traps focus, closes on Escape and returns focus to the pause control
- after game over, focus lands on the restart control and not on `<body>`
- the live region receives wave and cannon-lost announcements and never receives the score

**Stop.**

### Phase 6 — Delivery

Publish allowlist that fails the build on an unclassified file, Pages via the
GitHub Actions source, README with the Design notes section, the attribution
section from §3, and the replay fixture documented.

Tests:

- adding an unclassified file to the repo root fails the publish job
- the deployed page makes zero network requests after load

**Stop.**

---

## 8. Do not build

- Two-player alternating play. It is the arcade's coin model and it doubles the
  store's shape for nothing.
- Boss waves, power-ups, weapon upgrades, shields that regenerate. They dilute
  the one idea.
- Initials entry for the high score. It is an input-mode problem that eats an
  evening.
- A settings screen for difficulty.
- Any asset file, for any reason, including a favicon that is not inline SVG
  declared in the HTML. (An inline `data:` favicon is fine; a `.ico` is not.)
- Scanline overlays, bloom, CRT curvature or any other filter that is not
  derived from game state. The decay is the effect. A second decorative effect
  on top is the thing this project is arguing against.
- A service worker, a PWA manifest, offline support, analytics, a leaderboard.
- Any indicator that conveys its meaning by colour alone.
- `innerHTML` anywhere that a list is re-rendered.

---

## 9. Stretch, in order

1. **Touch controls.** Portrait is the natural orientation and a phone is the
   natural device. Thumb zones, 44px minimum, no on-screen control overlapping
   the play field's bottom rows.
2. **Attract mode.** A recorded replay plays itself on the title screen. This
   falls out of phase 2 almost free and is the most satisfying payoff of having
   built determinism first.
3. **Gamepad API**, verified against current support before starting.
4. **Shareable replays**: seed plus compressed action log in the URL fragment.
