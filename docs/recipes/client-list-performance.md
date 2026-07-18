# Recipe: lists that only render what's on screen

Cross-platform: Kotlin Multiplatform, Flutter, React Native.

## Problem

The events catalogue is a list, and lists are where mobile UIs quietly die. Render every row
eagerly inside a scroll view — a `Column`, a `SingleChildScrollView`, a `ScrollView` with
`.map` — and a hundred events means a hundred cards built, measured and laid out before the
user sees the second one. It scrolls like treacle and the jank is all yours.

## Concept

Use the platform's windowing list: it composes only the rows currently visible (plus a small
buffer) and recycles them as you scroll. Same API shape in each — give it the data and a
per-item builder, and a stable key so reorders and updates don't rebuild the world.

## Implementation ×3

The events screen's success state is a windowed list; the loading / empty / error states are
small and stay in the plain scaffold.

**KMP** — `ui/screens/Screens.kt`

```kotlin
LazyColumn(Modifier.fillMaxSize().padding(Tokens.spaceXl), verticalArrangement = Arrangement.spacedBy(Tokens.spaceMd)) {
    item { ScreenTitle("Events") }
    items(state.data, key = { it.id.value }) { EventCard(it, onOpen) }
}
```

**Flutter** — `lib/ui/screens.dart`

```dart
ListView.builder(
  padding: const EdgeInsets.all(Tokens.spaceXl),
  itemCount: events.length,
  itemBuilder: (_, i) => Padding(
    padding: const EdgeInsets.only(bottom: Tokens.spaceMd),
    child: EventCard(events[i], onOpen: () => onOpen(events[i])),
  ),
)
```

**React Native** — `src/ui/screens.tsx`

```tsx
<FlatList
  data={state.data}
  keyExtractor={(e) => e.id}
  ListHeaderComponent={<Title>Events</Title>}
  renderItem={({ item }) => <EventCard event={item} onOpen={() => onOpen(item)} />}
/>
```

## Comparison

Three names for the same idea: `LazyColumn`/`items` (Compose), `ListView.builder` (Flutter),
`FlatList` (React Native). All three take data + a builder and window the output. Each also
wants a stable key (`key`, `keyExtractor`, or the implicit index in `builder`) so item state
survives scrolling and updates are cheap. React Native's `FlashList` (Shopify) is a drop-in
`FlatList` replacement that recycles more aggressively for very large lists; `FlatList` is the
built-in baseline used here.

## How to see it work

Open the events screen and scroll: with the demo's handful of events there is nothing to see,
which is the point of a benchmark you can't feel — seed a few hundred and only the visible
cards ever appear in a layout inspector. The one deliberate omission: the sector list is
bounded (a venue has a few sectors, not a few thousand), so it stays a simple column — a
windowed list there would be ceremony with no payoff.

## Trade-offs

A windowed list costs a stable key and a slightly more verbose call site than a `for` loop,
and it fights you if you nest it inside another scroll container (don't — give it the screen).
In return the cost of a list stops growing with its length, which is the only property that
matters once real data shows up.
