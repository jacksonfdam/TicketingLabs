# /apps — the three clients

The same ticketing client, built three times, so you can compare how each platform
solves the same problems. Same contract, same seven-screen flow, same states. From the
user's side they are indistinguishable. From the developer's side, that is the exhibit.

| App | Stack | Status |
|---|---|---|
| [`kmp/`](kmp/) | Kotlin Multiplatform + Compose Multiplatform | scaffolded (skeleton only) |
| [`flutter/`](flutter/) | Flutter + Dart | scaffolded (skeleton only) |
| [`react-native/`](react-native/) | Expo (managed), New Architecture | scaffolded (skeleton only) |

"Scaffolded (skeleton only)" means the folder and its README exist and the shared
assets are in place; no app code has been written yet. The suggested build order (from
the master spec) is: shared assets → one reference app end to end → error/state coverage
→ payment resilience → design system + previews → the other two apps → docs and recipes.
The shared assets are done. The reference app is next.

Each app is blind to the backend. It receives a base URL and consumes
[`/shared/contract`](../shared/contract/). It shares [tokens](../shared/tokens/),
[scenarios](../shared/scenarios/) and [copy](../shared/copy/) with its siblings and
shares no source code with them. See [`docs/client-architecture.md`](../docs/client-architecture.md).
