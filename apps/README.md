# /apps — the three clients

The same ticketing client, built three times, so you can compare how each platform
solves the same problems. Same contract, same seven-screen flow, same states. From the
user's side they are indistinguishable. From the developer's side, that is the exhibit.

| App | Stack | Status |
|---|---|---|
| [`kmp/`](kmp/) | Kotlin Multiplatform + Compose Multiplatform | reference app — core + tests done, verified; UI next |
| [`flutter/`](flutter/) | Flutter + Dart | skeleton only |
| [`react-native/`](react-native/) | Expo (managed), New Architecture | skeleton only |

The suggested build order (from the master spec) is: shared assets → one reference app
end to end → error/state coverage → payment resilience → design system + previews → the
other two apps → docs and recipes. The shared assets are done. KMP is the reference app;
its framework-free core (result type, error taxonomy, state model, domain, ports, first
use cases) is implemented and verified — see [`kmp/README.md`](kmp/README.md) for exactly
what is verified and what is pending. The Compose UI and data adapter are next.

Each app is blind to the backend. It receives a base URL and consumes
[`/shared/contract`](../shared/contract/). It shares [tokens](../shared/tokens/),
[scenarios](../shared/scenarios/) and [copy](../shared/copy/) with its siblings and
shares no source code with them. See [`docs/client-architecture.md`](../docs/client-architecture.md).
