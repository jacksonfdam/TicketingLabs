# /shared/tokens — design tokens

`tokens.json` is the single source of colour, spacing, typography, radius and motion.
Three design systems read it so the apps look like siblings rather than three people's
weekend projects. Values are mirrored from the reference frontend's
[`styles.css`](../../frontend/src/styles.css), so the web app and the mobile apps agree
on what "accent blue" means.

## Structure

- `color` — semantic names (`bg`, `surface`, `accent`, `ok`, `warn`, `err`, …), each a
  hex string with a one-line description of where it is used.
- `space` — a six-step scale in dp (`xs`=4 … `xxl`=24).
- `radius` — `sm` (buttons/inputs), `md` (cards), `pill` (badges).
- `typography` — a system font stack plus five roles (`body`, `title`, `heading`,
  `caption`, `micro`) with size/lineHeight/weight.
- `motion` — the few durations that must match across platforms (spinner, skeleton,
  countdown urgency threshold).

The palette is dark-only, matching the reference app. A light theme would add a second
value per colour; it is out of scope until someone actually asks for it.

## How each platform consumes it

| Platform | Approach |
|---|---|
| KMP | Generate a `Tokens` object / Compose `lightColorScheme`-style holder in `commonMain`. |
| Flutter | Generate a `ThemeData` / token class; or read via a build-time codegen step. |
| React Native | Import the JSON directly, or generate a typed `tokens.ts`. |

Whichever route, the JSON is the input and the generated artefact is the output. Nobody
types `#4f8cff` into a widget. That is how two of them end up subtly wrong.
