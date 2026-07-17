# /docs/api — generated API docs per platform

Each app publishes its generated API documentation here: KDoc for KMP, dartdoc for
Flutter, TSDoc for React Native. Generate it with the tool per platform:

| Platform | Tool | Folder |
|---|---|---|
| KMP | Dokka (KDoc) | [`kmp/`](kmp/) |
| Flutter | `dart doc` (dartdoc) | [`flutter/`](flutter/) |
| React Native | TypeDoc (TSDoc) | [`react-native/`](react-native/) |

The generated output is not committed (it is a build artefact); run the tool in each app to
produce it. The source is fully documented — KDoc, dartdoc and TSDoc comments throughout.
