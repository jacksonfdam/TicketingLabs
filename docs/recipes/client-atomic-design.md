# Recipe: Atomic Design, taken apart on the Order Status screen

Cross-platform: Kotlin Multiplatform, Flutter, React Native.

## Problem

"Build the order screen" is how you end up with a 300-line widget that fetches, formats,
branches on five states, and paints — untestable, unreusable, and impossible to preview.
Components need a taxonomy so that each piece does one thing and every piece has a home.

## Concept

Atoms → molecules → organisms → screens. Atoms hold no business logic (a `Button`, a
`StatusBadge`, a `PriceTag`); organisms compose atoms into a meaningful block (the
`OrderStatusPanel`); screens place organisms in a scaffold and wire them to state. State
flows down as props; events flow up as callbacks. The Order Status screen is the clearest
worked example, because it has a real state machine behind it (`pending → paid | failed |
refunded`).

## Implementation ×3

The same decomposition in each app: a screen that renders a `UiState<Order>`, an
`OrderStatusPanel` organism that maps the order's status to a label, colour and message, and
atoms (`StatusBadge`, money text, `PrimaryButton`) underneath.

**KMP** — `ui/components/Components.kt`, `ui/screens/Screens.kt`

```kotlin
@Composable
fun OrderStatusPanel(order: Order, onDone: () -> Unit) {
    val (label, color, message) = when (order.status) {
        OrderStatus.PENDING -> Triple("Pending", Tokens.warn, "Payment is processing…")
        OrderStatus.PAID -> Triple("Paid", Tokens.ok, "You're all set.")
        OrderStatus.FAILED -> Triple("Failed", Tokens.err, "Payment failed. Try again.")
        OrderStatus.REFUNDED -> Triple("Refunded", Tokens.muted, "This order was refunded.")
    }
    // StatusBadge(label, color) + money + a Done button when settled
}
```

`OrderStatusScreen` is just `UiStateContent(state) { order -> OrderStatusPanel(order, onDone) }`.

**Flutter** — `lib/ui/widgets.dart` (`OrderStatusPanel`), `lib/ui/screens.dart`
(`OrderStatusScreen` wrapping `UiStateView<Order>`). The `switch` on `order.status` returns a
`(label, color, message)` record.

**React Native** — `src/ui/widgets.tsx` (`OrderStatusPanel`), `src/ui/screens.tsx`
(`OrderStatusScreen` with `UiStateView`). A `map[order.status]` object gives the label,
colour and message.

In all three, the panel takes an `Order` and an `onDone` callback — no fetching, no polling,
no knowledge of where the order came from. That is what makes it previewable (see the
previews recipe) and trivially testable.

## Comparison

The taxonomy lands almost identically because Compose, Flutter and React all reward the same
move: small stateless components, state in, events out. The only real difference is how each
expresses the status→(label, colour, message) mapping — a Kotlin `when` returning a `Triple`,
a Dart `switch` returning a record, a TypeScript lookup object — and all three are exhaustive
over the four order states.

## How to see it work

The Order Status panel appears in each app's Gallery in its paid, failed and pending states,
and live at the end of the flow as polling settles the order. Because the panel is a pure
function of an `Order`, the gallery renders all three states with three hard-coded orders.

## Trade-offs

More components means more files and more indirection than one big screen widget. The return
is that the organism is reused by the gallery and the tests unchanged, the atoms are shared
across all seven screens, and "change the paid colour" is a one-line edit in one atom rather
than a search across screens.
