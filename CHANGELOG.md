## [1.14.2](https://github.com/dallascrilley/vaultkeep/compare/v1.14.1...v1.14.2) (2026-01-28)


### Bug Fixes

* use service account token in whoami command ([5a2c71a](https://github.com/dallascrilley/vaultkeep/commit/5a2c71ad8c49b54814ddcf70c815549757a53a4f))

## [1.14.1](https://github.com/dallascrilley/vaultkeep/compare/v1.14.0...v1.14.1) (2026-01-28)


### Bug Fixes

* register update in op-compat and fix spinner usage ([c08821f](https://github.com/dallascrilley/vaultkeep/commit/c08821f59eecfe3b642e2b8fd7b1bbbb8c1332c0))

# [1.14.0](https://github.com/dallascrilley/vaultkeep/compare/v1.13.0...v1.14.0) (2026-01-28)


### Features

* add update command for self-updating ops ([5344fef](https://github.com/dallascrilley/vaultkeep/commit/5344fef0fdf25df66c7492696683aa4cd984b1b9))

# [1.13.0](https://github.com/dallascrilley/vaultkeep/compare/v1.12.2...v1.13.0) (2026-01-28)


### Bug Fixes

* avoid misrouting option values ([b4baaed](https://github.com/dallascrilley/vaultkeep/commit/b4baaed3bdf79c0adfbcc599357f2fa77030986c))
* route leading flags to op ([95fd408](https://github.com/dallascrilley/vaultkeep/commit/95fd408ce730df8b210734068844f97df62a7bb0))


### Features

* add op CLI passthrough ([cca1a17](https://github.com/dallascrilley/vaultkeep/commit/cca1a17b8bb613a9a8d803ecf8fcb0c5dd951370))

## [1.12.2](https://github.com/dallascrilley/vaultkeep/compare/v1.12.1...v1.12.2) (2026-01-19)


### Bug Fixes

* add missing picomatch dependency for export command ([a1ec3b6](https://github.com/dallascrilley/vaultkeep/commit/a1ec3b678dab31e7ae9af7bfdad4546b11854fa7))

## [1.12.1](https://github.com/dallascrilley/vaultkeep/compare/v1.12.0...v1.12.1) (2026-01-18)


### Bug Fixes

* re-detect field for fuzzy-matched item selection ([4814582](https://github.com/dallascrilley/vaultkeep/commit/4814582bf97f6b0d1a232a03cd589b7eb2b60ba2))

# [1.12.0](https://github.com/dallascrilley/vaultkeep/compare/v1.11.1...v1.12.0) (2026-01-18)


### Bug Fixes

* add missing findSimilarItemsWithScore mock in test ([cf633a4](https://github.com/dallascrilley/vaultkeep/commit/cf633a44da5acd32f3022606c0c1316b727280fe))


### Features

* add interactive fuzzy matching for secret names ([9ca116a](https://github.com/dallascrilley/vaultkeep/commit/9ca116ac4367b9052335f19589525959fefa58cc))

## [1.11.1](https://github.com/dallascrilley/vaultkeep/compare/v1.11.0...v1.11.1) (2026-01-18)


### Bug Fixes

* export filter now matches env var names, not raw titles ([63b11d7](https://github.com/dallascrilley/vaultkeep/commit/63b11d7bae51039f5e924d43a4e4a2107a529b18))

# [1.11.0](https://github.com/dallascrilley/vaultkeep/compare/v1.10.0...v1.11.0) (2026-01-18)


### Features

* add UX improvements for developer productivity ([58f52ca](https://github.com/dallascrilley/vaultkeep/commit/58f52cada865415c0d4696fb70e47e5d7579bad8))

# [1.10.0](https://github.com/dallascrilley/vaultkeep/compare/v1.9.1...v1.10.0) (2026-01-18)


### Features

* **set:** support KEY=VALUE inline format ([2a9125d](https://github.com/dallascrilley/vaultkeep/commit/2a9125d96b81eae27916328629c3f4142fbbc088))

## [1.9.1](https://github.com/dallascrilley/vaultkeep/compare/v1.9.0...v1.9.1) (2026-01-17)


### Bug Fixes

* address security and performance audit findings ([ae7fcd2](https://github.com/dallascrilley/vaultkeep/commit/ae7fcd2092ccc247b95072ac173e103fadfc9156))

# [1.9.0](https://github.com/dallascrilley/vaultkeep/compare/v1.8.0...v1.9.0) (2026-01-17)


### Features

* add secret templates ([5c07638](https://github.com/dallascrilley/vaultkeep/commit/5c07638616c6a41933c4a905042699a3fd6cecf3))

# [1.8.0](https://github.com/dallascrilley/vaultkeep/compare/v1.7.0...v1.8.0) (2026-01-17)


### Features

* add interactive fuzzy finder mode ([1d49bbb](https://github.com/dallascrilley/vaultkeep/commit/1d49bbbb4ab89e7224630af016fdc077bc650e8d))

# [1.7.0](https://github.com/dallascrilley/vaultkeep/compare/v1.6.0...v1.7.0) (2026-01-17)


### Features

* add config, session cache, and env schema validation ([55bae57](https://github.com/dallascrilley/vaultkeep/commit/55bae5787c32c3614d4bbd15ab20ac390b37faca))

# [1.6.0](https://github.com/dallascrilley/vaultkeep/compare/v1.5.0...v1.6.0) (2026-01-17)


### Features

* **cli:** add get-many command for batch secret retrieval ([337fa66](https://github.com/dallascrilley/vaultkeep/commit/337fa66ddd9f0fc3e794b0853a4afe2d7daef165)), closes [#15](https://github.com/dallascrilley/vaultkeep/issues/15)

# [1.5.0](https://github.com/dallascrilley/vaultkeep/compare/v1.4.1...v1.5.0) (2026-01-17)


### Features

* **retry:** add retry logic with exponential backoff ([1042cc9](https://github.com/dallascrilley/vaultkeep/commit/1042cc98832484c728a7321829ddff5d130fe01d)), closes [#14](https://github.com/dallascrilley/vaultkeep/issues/14)

## [1.4.1](https://github.com/dallascrilley/vaultkeep/compare/v1.4.0...v1.4.1) (2026-01-17)


### Bug Fixes

* **ci:** use simple glob patterns for cross-platform test compatibility ([d5a9d8b](https://github.com/dallascrilley/vaultkeep/commit/d5a9d8b120785f922f72382aad493dabd790757e))

# [1.4.0](https://github.com/dallascrilley/vaultkeep/compare/v1.3.0...v1.4.0) (2026-01-17)


### Features

* add similar item suggestions to copy and inspect commands ([e5f58ca](https://github.com/dallascrilley/vaultkeep/commit/e5f58ca7ededd673a0221b6249c9ddc5531333ad))

# [1.3.0](https://github.com/dallascrilley/vaultkeep/compare/v1.2.0...v1.3.0) (2026-01-17)


### Features

* add integration test suite with test vault support ([ddea971](https://github.com/dallascrilley/vaultkeep/commit/ddea9717199893685ffaa75bcab947e53e4a1bf1)), closes [#10](https://github.com/dallascrilley/vaultkeep/issues/10)

# [1.2.0](https://github.com/dallascrilley/vaultkeep/compare/v1.1.3...v1.2.0) (2026-01-17)


### Features

* add shell completion for bash, zsh, and fish ([06b7b4f](https://github.com/dallascrilley/vaultkeep/commit/06b7b4f69feadb0b4b3f9203cd5017a92360a95b))

## [1.1.3](https://github.com/dallascrilley/vaultkeep/compare/v1.1.2...v1.1.3) (2026-01-17)


### Bug Fixes

* repair dev mode and dependency installation ([0be291f](https://github.com/dallascrilley/vaultkeep/commit/0be291f6d99885cc4cfbcfeb7cfbc231e3b28277))

## [1.1.2](https://github.com/dallascrilley/vaultkeep/compare/v1.1.1...v1.1.2) (2026-01-16)


### Bug Fixes

* **cli:** read version dynamically from package.json ([5458a80](https://github.com/dallascrilley/vaultkeep/commit/5458a80a4f1c5772e305ce679a00344a4145ce99))

## [1.1.1](https://github.com/dallascrilley/vaultkeep/compare/v1.1.0...v1.1.1) (2026-01-16)


### Bug Fixes

* **ci:** use Node 22 for semantic-release compatibility ([e3fc1e2](https://github.com/dallascrilley/vaultkeep/commit/e3fc1e27d57ce82261c4acfa2cab82f4f67d2a46))
* **test:** add missing mocks to prevent real API calls ([c824f34](https://github.com/dallascrilley/vaultkeep/commit/c824f34a280c43481acfd1524c24476cc11d2fa0))
