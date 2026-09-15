# CLAUDE.md — Phosphor

Read `docs/spec.md` before doing anything. It is the source of truth. If an
instruction here and the spec disagree, stop and say so rather than picking one.

## What this is

An original browser fixed-shooter whose entire display is a phosphor persistence
buffer, where the decay rate is a function of aliens alive. The rules are
modelled on the 1978 Taito arcade machine; every byte here is original.

## Hard stack constraints

- HTML, CSS, JavaScript as native ES modules. Canvas 2D. Web Audio.
- **No build step.** No bundler, transpiler, Vite, Rollup, esbuild, webpack.
  The files served are the files in the repo.
- **No dependencies at all.** `package.json` has no `dependencies` and no
  `devDependencies`. If you find yourself wanting one, stop and say why.
- **No TypeScript.** No frameworks. No game engines. No audio or animation
  libraries.
- **No WebGL.**
- **No asset files.** No `.png`, `.jpg`, `.gif`, `.wav`, `.mp3`, `.ogg`, `.ttf`,
  `.woff`, `.woff2`, `.svg` files. Sprites are 1-bit bitmaps declared in source
  as arrays of strings. Audio is synthesised from oscillators and generated
  noise. Fonts are system fonts or hand-declared bitmaps.
- **No network requests at runtime.** No Google Fonts, no CDNs.
- Tests are `node --test` on Node 24. Nothing else.

## Hard architecture rules

1. **`src/core/` is pure.** No DOM, no `Date`, no `performance`, no
   `Math.random`, no `localStorage`, no globals. Every function takes its inputs
   explicitly, including randomness (a seeded generator, passed in) and the
   current step number. CI scans for these identifiers and fails the build.
2. **Fixed timestep of 1/60s. Integer positions** in a 224×256 logical space.
   Nothing in the simulation scales by a frame delta.
3. **Clamp the accumulator to `MAX_CATCHUP_MS = 250`.** `requestAnimationFrame`
   stops in a background tab; an unclamped catch-up loop hangs the page.
4. **Collision is axis-aligned overlap, never containment.** Testing whether one
   box is inside another makes edge hits pass through. This is the single most
   common bug in this genre.
5. **Sweep shot paths.** Test every cell a shot crosses during a step, not only
   its end position, or it tunnels through shields.
6. **All input enters the simulation as recorded actions** — `{step, action,
   phase}` appended to a queue. Nothing reads the keyboard inside the core.
   This is what makes replay work; it is structural, not a feature.
7. **One store owns all state.** Views subscribe. Derived values (aliens alive,
   march period) are computed, never stored. Phosphor decay is a **render
   concern**: its sole source is `src/tokens.js`, the renderer derives it from
   aliens alive, and it must never enter the hashed simulation state — a
   decay value in state would tie the replay fixture to visual tuning.
8. **Persisted data is versioned with `migrate()`.** Validate on load; corrupt
   data falls back to defaults; a higher version than the current one is left
   untouched and the session runs read-only.
9. **Never re-render a list with `innerHTML`.** Reconcile keyed nodes.
10. **The phosphor buffer is a `Float32Array`, decayed by multiplication.** Do
    not fade with `destination-out` at low alpha — alpha quantises to 1/255 and
    leaves permanent residue.

## Authentic rules that must not be changed

One alien updated per simulation step, so wave speed is emergent. Bottom-left
reference alien that keeps defining the origin after death. One player shot on
screen at a time. Five moving objects, one slot per invader shot type; the UFO
shares the **squiggly's** slot specifically, so the two are never on screen
together. Each type fires only on its own round-robin turn — no fall-through.
The plunger is disabled while exactly one alien remains. Plunger columns
`1,7,1,1,1,4,11,1,6,3,1,1,11,9,2,8`; squiggly columns
`11,1,6,3,1,1,11,9,2,8,2,11,4,7,10`; dead columns skipped. 16-step freeze on an
alien exploding. Scores 10/20/30 by row, extra cannon once at 1500. UFO award
cycles `50,50,100,150,100,100,50,300,100,100,100,50,150,100,100` as
`cycle[(shotsFired − 1) mod 15]`, so the 8th, 23rd, 38th… shots award 300.
Player shot meeting an invader missile: the player's shot always dies, the
missile survives by a per-type chance (squiggly nearly always). Four
destructible shields eroded by player fire, invader fire and the descending
rack. Wave start heights descend through wave 9 and wave 10 reverts to wave 1.

The readings in `docs/spec.md` §4.1.1 (freeze counted after the kill step;
FIRE edge-triggered) are decisions, not defaults. Changing one bumps
`SIM_VERSION`.

**`SIM_VERSION` policy.** Any change to simulation behaviour — a rule, a §4.1.1
reading, a tuning number, the rng's draw order, anything that alters how a
recorded action log replays — bumps `SIM_VERSION` in `src/core/state.js` and
re-records `tests/fixtures/clears-wave-one.js` in the **same commit**. A fixture
whose `simVersion` does not match fails loudly instead of replaying. There is
no regenerate mode, no `--update` flag, no environment variable that rewrites
the expected hash: if the replay gate fails, a human decides whether the change
was intended. Never edit `expectedHash` to make the gate pass.

**The state hash is a canonical encoding, never `JSON.stringify`.**
`src/core/serialise.js` sorts keys, encodes `Uint8Array` bytes directly,
distinguishes `undefined` from deleted and `-0` from `0`, and rejects
non-integers. Every simulation field is an integer; if you need a float in the
state, stop and say why.

Everything else — drop distance, speeds, UFO interval, shield shape, hitbox
widths, missile survival percentages, audio frequencies — is our tuning and
lives in one exported constants object, `TUNING` in `src/core/constants.js`.
The phosphor decay curve is also ours but is **not** in that object: it is a
half-life in steps whose sole source is `src/tokens.js`, and no module under
`src/core/` may define a decay, half-life or colour constant of its own.
Never describe our tuning as authentic.

## Accessibility, which is a requirement and not a polish pass

- HUD is DOM, not canvas. Score, lives, wave and messages are real elements.
- Nothing conveys meaning by colour alone.
- Contrast is computed and the actual ratio reported by a test, never eyeballed.
- A visually hidden element states wave, aliens remaining and cannons remaining
  in one plain sentence, updated on discrete events.
- **No `aria-live` on the score.** The live region announces only wave start,
  cannon lost and game over.
- Gameplay code references actions (`FIRE`), never physical keys. Bindings are
  data, remappable, conflict-validated. Prompts read the current binding.
- Dialogs trap focus, close on Escape, restore focus to the trigger. After game
  over, focus goes to the restart control, never `<body>`.
- `prefers-reduced-motion` pins the decay constant short. It removes motion and
  never information.
- Touch targets 44px minimum. No horizontal scroll at 320px.
- Fully playable from the keyboard alone.

## Testing

- Tests are named edge cases, not categories. `test('a shot overlapping an alien
  by 1px at its left edge registers a hit')`, not `test('collision works')`.
- Write them before the implementation for anything with real logic.
- Never delete or weaken a test to make a change pass. Say the test is wrong and
  why, and wait.
- **Every bug you find and fix during a session gets a regression test in the
  same commit, named after the bug.** Subtle ones revert silently otherwise.

## Working rules

- Stay inside the phase's scope. If you need to touch a file the phase did not
  name, stop and say so before doing it.
- If you change a decision the spec records, update `docs/spec.md` and this file
  in the same commit, or the next session reads a contradiction.
- Report numbers, not reassurance. "Handled", "ensured" and "should be fine" are
  not verification. If you could not verify something, say which thing and why —
  that is useful; a confident summary of unverified work is not.
- One commit per phase, with a real message.
- Ask before adding any file to the repo root.
