# Recipe: a component and all its states, rendered in isolation

Cross-platform: Kotlin Multiplatform, Flutter, React Native.

## Problem

A component has more states than the happy one: loading, empty, error, disabled, sold-out.
The only way most people ever see the error state is by breaking the backend at the right
moment, so the error state is where the bugs live — misaligned text, a button that does
nothing, a colour that fails contrast. If you cannot render a state on demand, you are not
really testing it.

## Concept

Every atom, molecule and organism is rendered in isolation, across its states, in a catalog
you can open without walking the flow. Two flavours: an IDE **preview** (fast, while you
code) and an on-device **gallery** screen (real rendering, on the actual platform). Both are
just the component fed hard-coded props — no network, no navigation.

## Implementation ×3

**KMP** — unified `@Preview` in commonMain (`ui/Previews.kt`) plus a runnable `Gallery`
(`ui/Gallery.kt`):

```kotlin
@Preview
@Composable
fun ErrorStatesPreview() = PreviewFrame {
    ErrorBanner(AppError.NetworkUnavailable(requestId = "req-1")) {}
    ErrorBanner(AppError.Conflict(backendCode = "inventory_exhausted", requestId = "req-2")) {}
    ErrorBanner(AppError.PaymentUnknown(requestId = "req-3")) {}
}
```

`@Preview` (from `androidx.compose.ui.tooling.preview`) lives in commonMain, so the same
previews light up for Android and iOS.

**Flutter** — a `GalleryScreen` (`lib/ui/gallery.dart`) lays out each widget across states;
Flutter's own `@Preview`/widgetbook tooling renders the same widgets in the IDE.

**React Native** — a `GalleryScreen` (`src/ui/gallery.tsx`) renders atoms and organisms in
their states; Storybook for React Native is the IDE equivalent.

Each gallery is reachable in the running app (a tab), so the states are demonstrable on a real
device, not just in a screenshot.

## Comparison

- **KMP** has the tidiest story: one `@Preview` annotation in shared code covers every target,
  and the gallery reuses the exact same composables.
- **Flutter** and **React Native** lean on a screen you navigate to; their IDE preview stories
  (widgetbook, Storybook) are richer but are extra dependencies, so the always-present
  on-device gallery is the baseline here.

## How to see it work

Open any app, switch to the Gallery tab, and read down: buttons enabled and disabled, badges
in every colour, the countdown in its normal and urgent states, sector rows available and
sold-out, and the error banner for `NetworkUnavailable`, `Conflict` and `PaymentUnknown` — the
states you would otherwise have to provoke.

## Trade-offs

A catalog is more code to keep in step with the components, and it can drift if nobody looks
at it. The payback is that every state has a front door: you build the error state by looking
at it, not by imagining it, and reviewers can see all of them in one scroll.
