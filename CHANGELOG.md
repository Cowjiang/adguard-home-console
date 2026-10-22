# Changelog

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://www.conventionalcommits.org/) for commit guidelines.
## [0.3.0] - 2026-10-22

### Bug Fixes

- *(ios)* Stamp the core version into tauri.conf.json ([66c7b6b](https://github.com/Cowjiang/adguard-home-console/commit/66c7b6bba3f09be9048d76f4222d9a876ad8f7a6))
- *(transition)* Strip stale enter animations from snapshot clones ([21be3ca](https://github.com/Cowjiang/adguard-home-console/commit/21be3ca81af65c8360a3d1c531545a6b5f0f6747))
- *(server)* Repair the escaped newline that broke index.mjs ([22633dd](https://github.com/Cowjiang/adguard-home-console/commit/22633dd356c20d35dd2392204ebf2ccf0ed703f8))
- *(log)* Open the query log analytics view as a mobile subpage ([39d7e8a](https://github.com/Cowjiang/adguard-home-console/commit/39d7e8a90386bc2e1d7a5da1b6eef98ff02e7e94))
- *(log)* Drop the node label from log rows outside the aggregate scope ([97fa71d](https://github.com/Cowjiang/adguard-home-console/commit/97fa71dcfd7b955485a13faffdec81de8506845c))
- *(multi-instance)* Withdraw the cross-instance aggregation views to a branch ([516ee24](https://github.com/Cowjiang/adguard-home-console/commit/516ee243299b3aaac55d7b6046cee85435140b49))
- *(settings)* Use a green badge for the current instance and a neutral manage button ([d3967fb](https://github.com/Cowjiang/adguard-home-console/commit/d3967fb043b50bfa604080dbff60f5292d35156b))
- *(settings)* Draw the manage-mode row actions as icon squares ([efb0cd2](https://github.com/Cowjiang/adguard-home-console/commit/efb0cd252736c5923d4f5e6e8e4787bbf0b2c1c2))
- *(settings)* Size the manage-mode actions as 44pt rounded squares, hide the badge ([cdb8e8c](https://github.com/Cowjiang/adguard-home-console/commit/cdb8e8cee0c55611f8750aa78b5f23871933dcbd))
- *(settings)* Shrink the manage-mode actions so rows keep their height ([dc9dc19](https://github.com/Cowjiang/adguard-home-console/commit/dc9dc193f78b7a0dc05cc0521df32162b544044e))
- *(ui)* Conform batch panels to design tokens and mobile panel rules ([d1384e8](https://github.com/Cowjiang/adguard-home-console/commit/d1384e80125efd25c3516d23a61212e523418d3f))
- *(settings)* Make snapshot notes read-only and explain auto backups ([b985af3](https://github.com/Cowjiang/adguard-home-console/commit/b985af39b758745a65f7c7bc51b9a16786177733))
- *(settings)* Turn the snapshot list into an index into the detail page ([d9e3122](https://github.com/Cowjiang/adguard-home-console/commit/d9e31225c6cf97d145ca39510e1ac71ceb6b9858))
- *(settings)* Center the snapshot card chevron vertically ([bd7dd03](https://github.com/Cowjiang/adguard-home-console/commit/bd7dd03cb3083dd40c4af8f71862048655964738))
- *(snapshot)* Move snapshot actions to the title bar and restyle restore ([c8e76d2](https://github.com/Cowjiang/adguard-home-console/commit/c8e76d2c3ef1ee89124d892eb0bbffeb903f5755))
- *(snapshot)* Tighten the restore row spacing and copy ([3a3a057](https://github.com/Cowjiang/adguard-home-console/commit/3a3a05732a62574cc948a4739a9158504276f09a))
- *(overview)* Stop EN copy from overflowing the mobile cards (#26) ([9bba9b5](https://github.com/Cowjiang/adguard-home-console/commit/9bba9b53f3c209c81f6d27de76b8ab7556b0020a))
- *(filters)* Compact the English relative time so the tiles fit ([9ec2ed0](https://github.com/Cowjiang/adguard-home-console/commit/9ec2ed0fd5454f6dd1dd53af3fbbe2c03b2d7ed7))
- *(overview)* Drop the mobile trend legend and give blocked the danger color (#27) ([77e15d9](https://github.com/Cowjiang/adguard-home-console/commit/77e15d956d985aee14c4a41cf50ce115746c0073))
- *(ios)* Give each native header action its own slot ([3c42b04](https://github.com/Cowjiang/adguard-home-console/commit/3c42b040bf1b1807f531d9e340abf3e7d06d159c))
- *(ui)* Move the sync entry to a bottom row and unify the card radius (#28) ([d14e145](https://github.com/Cowjiang/adguard-home-console/commit/d14e1454f2de7a3c131c2a296a839addc5fccbb5))
- *(layout)* Reserve the desktop page scrollbar so settings tabs stop shifting ([6202880](https://github.com/Cowjiang/adguard-home-console/commit/62028804f6fdea1f588e986b21e8485ac313c0f6))
- *(settings)* Let an unedited draft follow the server copy ([6500dca](https://github.com/Cowjiang/adguard-home-console/commit/6500dca3b7e0864453a8fdcd14eb4e7693a0200b))
- *(release)* Run the Windows job's version stamp under bash ([a0c54ca](https://github.com/Cowjiang/adguard-home-console/commit/a0c54ca5c1c421f9897e4b047430f0b3153f98a8))
- *(icons)* Give the Windows icon a squircle plate and a transparent margin ([fadc790](https://github.com/Cowjiang/adguard-home-console/commit/fadc7907aab86269c828d078a457ae8b941ceafe))
- *(update)* Bypass pnpm minimumReleaseAge for fresh nightlies (#32) ([1468f3a](https://github.com/Cowjiang/adguard-home-console/commit/1468f3ab3319890727049b7847451e85191cd380))
- *(update)* Detect npm-upgrade execution through symlinked package paths (#33) ([dd821e2](https://github.com/Cowjiang/adguard-home-console/commit/dd821e2bb0824e3e3c4c69b86cc5848017168f0f))

### Continuous Integration

- *(npm)* Publish through trusted publishing instead of a token ([7b772c8](https://github.com/Cowjiang/adguard-home-console/commit/7b772c822a5d3f460f12a0cb070bee00dd3b947a))
- *(release)* Build and attach the Windows installers ([657bd6a](https://github.com/Cowjiang/adguard-home-console/commit/657bd6a449531d0f44cc9ad1bafd754d5f4be5f8))
- *(release)* Recreate the nightly release to refresh its publish date ([97eb214](https://github.com/Cowjiang/adguard-home-console/commit/97eb2147af97caca2b639ff260781c4340582b8c))

### Documentation

- Mark Stage 1 and Stage 2 as completed in distribution roadmap ([93e994b](https://github.com/Cowjiang/adguard-home-console/commit/93e994b953c446eaf4b30cd9a24a4bef1ff1bf9f))
- *(bug-fix)* Reject suppressing the browser back swipe, keep the analysis ([1e92b0f](https://github.com/Cowjiang/adguard-home-console/commit/1e92b0f5909dc09710d61c9c076d4b8a017f6781))
- *(release)* Record the Windows job dry run and the PowerShell pitfall ([35ed3a5](https://github.com/Cowjiang/adguard-home-console/commit/35ed3a5f3c9eb3a41ebe24965c803f737c4d54e1))
- *(docker)* Align managed mode storage volume and dual mode documentation (#30) ([02df0d2](https://github.com/Cowjiang/adguard-home-console/commit/02df0d284ad92aea6323ccbd2588002610c124aa))
- *(update)* Mark channel-aware upgrade proposal implemented (#34) ([44f98f0](https://github.com/Cowjiang/adguard-home-console/commit/44f98f0ffed378f6b080b15e9c999405f53b7f79))

### Features

- Implement update check manifest and UI (#22) ([59a21ff](https://github.com/Cowjiang/adguard-home-console/commit/59a21ffecb5ce88993af3a686cd5538675b4dddf))
- Add cli update notifier and server self-upgrade endpoint (#23) ([8cdee7e](https://github.com/Cowjiang/adguard-home-console/commit/8cdee7ebd22c53f82ca472548d7f909c25f99551))
- *(settings)* Switch instances from the list, edit and delete under a manage mode ([35a1af8](https://github.com/Cowjiang/adguard-home-console/commit/35a1af821c262beb057279ee1da4e5f6d78b22f3))
- *(settings)* Implement desktop split layout and mobile dual-mode routing (#24) ([1471718](https://github.com/Cowjiang/adguard-home-console/commit/1471718f75d06d39cb107c46345e56e4b8dcbb33))
- *(settings)* Switch settings content area to single-column layout (#25) ([fbbc809](https://github.com/Cowjiang/adguard-home-console/commit/fbbc80910a7e60506de9db73b5fcb66407376fb7))
- *(tauri)* Open the desktop shell in the desktop layout ([b1b9ac2](https://github.com/Cowjiang/adguard-home-console/commit/b1b9ac2176798df5c48e125c7fb8083e8b21cad6))
- Implement zero-knowledge managed mode and end-to-end testing suite (#29) ([ae2bc5c](https://github.com/Cowjiang/adguard-home-console/commit/ae2bc5c35cff084af107fc7274e2ba673b90b3bd))
- *(update)* Persist update channel and make upgrades channel-aware (#31) ([bffe6e6](https://github.com/Cowjiang/adguard-home-console/commit/bffe6e68a846e0a22daada72c52377e77fb05682))

### Miscellaneous Chores

- *(npm)* Expand keywords for discoverability ([fabf1ef](https://github.com/Cowjiang/adguard-home-console/commit/fabf1efb24f0d1f3596f707f0f0cddf313c7fa5b))
- *(ios)* Sync the tracked Info.plist version with project.yml ([2381817](https://github.com/Cowjiang/adguard-home-console/commit/23818171bf715893d08c268ca3b0c6bce6ccc1c1))

### Other Commits

- Merge branch 'main' into dev ([9c791cb](https://github.com/Cowjiang/adguard-home-console/commit/9c791cb3eccf24be16235e99c1f8895246fca5b4))
- Merge branch 'dev' into main ([3b40d9f](https://github.com/Cowjiang/adguard-home-console/commit/3b40d9f45861add91052187e468253a21b2583b9))
- Merge branch 'dev' into main ([33772aa](https://github.com/Cowjiang/adguard-home-console/commit/33772aad802d91c5aa7bbcc485396e1d8e03ed5e))
- Merge branch 'dev' into main ([dc2d862](https://github.com/Cowjiang/adguard-home-console/commit/dc2d862769c127cbfd187ebdc92b119c5f51a983))
- Merge branch 'dev' into main ([0078ff5](https://github.com/Cowjiang/adguard-home-console/commit/0078ff5e647ea2e9f1989eab840f08366680ac90))

### Testing

- *(mock)* Answer /test_upstream_dns with per-upstream OK ([b36b29a](https://github.com/Cowjiang/adguard-home-console/commit/b36b29a46c9ce72ff51983030340c744a5479ed9))
## [0.2.1] - 2026-10-15

### Bug Fixes

- *(docker)* Ship pnpm-workspace.yaml into the image build ([48fb1f0](https://github.com/Cowjiang/adguard-home-console/commit/48fb1f0e888a215878e1faf3f593d3c569f9511f))
- *(ci)* Make bump-version.mjs usable outside the Linux runner ([8e92b62](https://github.com/Cowjiang/adguard-home-console/commit/8e92b620414f7fdb2d6d63c21687da9e5cf471d6))

### Other Commits

- Merge branch 'dev' into main ([9d2d252](https://github.com/Cowjiang/adguard-home-console/commit/9d2d2528e8911ec0e3c67c94164186218fb9165b))
## [0.2.0] - 2026-10-15

### Bug Fixes

- *(proxy)* Refuse cross-host redirects instead of replaying credentials ([9126fda](https://github.com/Cowjiang/adguard-home-console/commit/9126fda557acfe0dc2f398e2cc9d06fea27f1a8a))
- *(nav)* Inject navigation into the instance switcher ([7388fe8](https://github.com/Cowjiang/adguard-home-console/commit/7388fe8461af5596be539c3788af536a0bef1308))
- *(tauri)* Align the crate with the npm packages and retire the tao patch ([2f55934](https://github.com/Cowjiang/adguard-home-console/commit/2f55934a205a51321497af5a2aaf97df771b332e))
- *(ios)* Run the Xcode pre-build phase from the package root again ([059cd5b](https://github.com/Cowjiang/adguard-home-console/commit/059cd5be571d5f548f3eff03fe70729b765d1fe4))
- *(tauri)* Keep the Swift glue on the unoptimized config so release links ([836560e](https://github.com/Cowjiang/adguard-home-console/commit/836560e735a1eae60e42b8385bf384ce94204e75))
- *(ios)* Read the deploy bundle id off the ipa instead of hardcoding it ([4f24359](https://github.com/Cowjiang/adguard-home-console/commit/4f24359783ca1ca843c6e6042b3fe8de82934f02))
- *(release)* Push images to a fully qualified GHCR reference ([11c9077](https://github.com/Cowjiang/adguard-home-console/commit/11c90770afb56afc6d2fe21d403f73f2fc805b69))
- *(benchmark)* Address review findings on Tauri AbortSignal, rule preservation, and i18n ([b9e91dc](https://github.com/Cowjiang/adguard-home-console/commit/b9e91dcd3d95fd34e807319b72c666be588c6358))
- *(querylog)* Address review findings on pagination, key collision, and drill-down UX ([3ba464d](https://github.com/Cowjiang/adguard-home-console/commit/3ba464d6ff139e9f3f22ecdb3655f2a363f3a332))
- *(settings)* Keep the app name readable in the About row ([d6d295e](https://github.com/Cowjiang/adguard-home-console/commit/d6d295efb844de18d0e74d8c559a3a5c7afc4cf0))
- *(ios)* Create the source dirs xcodegen needs on a fresh clone ([cc986f4](https://github.com/Cowjiang/adguard-home-console/commit/cc986f4200e6b9d3a6595751f019f500f062c5b9))

### Code Refactoring

- *(frontend)* Share top_* normalization and unify the filtering SWR key ([278ba03](https://github.com/Cowjiang/adguard-home-console/commit/278ba03034dbfffbab6bbb7fd47f7c67ec75f5ce))
- *(server)* Extract AGH proxy adapter with kind errors and fixture runner ([e9650ef](https://github.com/Cowjiang/adguard-home-console/commit/e9650ef059672b40a0c4e44271125683b2716ebb))
- *(proxy)* Kind errors and contract runner in the Rust adapter ([86e3870](https://github.com/Cowjiang/adguard-home-console/commit/86e38704db14756a8976e647d7533bb791c2bfa1))
- *(src)* Move components and lib files into domain groups with unified shell detection ([39e4ac9](https://github.com/Cowjiang/adguard-home-console/commit/39e4ac90644fddf227ecb4c1d2e47d24e76c7a94))
- *(ui)* Split the ui grab-bag into sheet/menu/toast/primitives/atoms ([7367aa2](https://github.com/Cowjiang/adguard-home-console/commit/7367aa2f41ef535f4382b6abcb102c42f016ed13))
- *(layout)* Split Layout into layout/ pieces (TopBar/TabBar/Sidebar/InstanceSwitchList/OfflineNotice) ([91050a9](https://github.com/Cowjiang/adguard-home-console/commit/91050a914e62f9dbddbbd7368c1356b984ff6cae))
- *(pages)* Place page-private components into components/ domain dirs ([dcb074b](https://github.com/Cowjiang/adguard-home-console/commit/dcb074b34e1bc5a411d6fbb541e07cd5763628dc))
- *(pages)* Split AdvancedSettings and Settings into pages/settings/ ([7d35fb0](https://github.com/Cowjiang/adguard-home-console/commit/7d35fb00656a0c9147a65539a7894c37077326f9))
- *(mutation)* Converge page mutation orchestration on runMutation ([7582445](https://github.com/Cowjiang/adguard-home-console/commit/758244521c1ba6f5e276c4488845653ed1d3fab5))
- *(session)* Extract the probe engine into lib/session/probe ([aee5342](https://github.com/Cowjiang/adguard-home-console/commit/aee5342b645f79f3c78bd0a86e8f4ba377d05727))
- *(settings)* Converge the four draft forms on useDraftForm ([a9f296d](https://github.com/Cowjiang/adguard-home-console/commit/a9f296ddfc5f371c1ad2568bfae000e2439f6540))
- *(tauri)* Reuse one HTTP client instead of building one per request ([2983750](https://github.com/Cowjiang/adguard-home-console/commit/298375056366f7fa2fcea54513cbac162dbda6cd))

### Continuous Integration

- *(release)* Publish Release, npm and GHCR from one build ([476380e](https://github.com/Cowjiang/adguard-home-console/commit/476380ea5b86aced280810abf486b2ec09294a94))
- *(release)* Move the workflow off the deprecated Node 20 actions ([16e61b7](https://github.com/Cowjiang/adguard-home-console/commit/16e61b78afd6dc917507e8c45ded2a79472fbc17))
- *(release)* Record the node24 action bump and the npm channel state ([5e3f78e](https://github.com/Cowjiang/adguard-home-console/commit/5e3f78ee07d0e661e4217e697d878ef298b3551b))
- *(release)* Keep a single rolling nightly release ([6a6a736](https://github.com/Cowjiang/adguard-home-console/commit/6a6a736028054d69ad786f83b81480f1aca0fd1c))
- *(workflow)* Add automated CI checks for pull requests and core branches ([42180e0](https://github.com/Cowjiang/adguard-home-console/commit/42180e045fb0891d6188aaf13086f7064e5807fa))
- *(release)* Build an unsigned iOS IPA in the release workflow ([09248bd](https://github.com/Cowjiang/adguard-home-console/commit/09248bdfe895761396cdefeb8ea75070df1517f6))

### Documentation

- Add iOS app screenshots to the README ([89991ad](https://github.com/Cowjiang/adguard-home-console/commit/89991ad6be93c6f7cb63d73dfc3f1059eac1a876))
- Multi-instance session, storage and aggregation facts ([7b9d521](https://github.com/Cowjiang/adguard-home-console/commit/7b9d521ebd71caccd1a33d52cfc5ed1da1d037e7))
- Add architecture proposal for proxy contract ownership ([7fe1148](https://github.com/Cowjiang/adguard-home-console/commit/7fe11482810050b1d236f11395f15920ce572e57))
- Record proxy contract ownership across docs and checks ([f14bbec](https://github.com/Cowjiang/adguard-home-console/commit/f14bbec4ac2365f02a58554a6e82d907eca917ec))
- Mark proxy contract ownership implemented ([ea3b3a3](https://github.com/Cowjiang/adguard-home-console/commit/ea3b3a314c4b8144870b0cb73d051e956e02f12a))
- Add simplification proposal for the src page layer ([54ed6ce](https://github.com/Cowjiang/adguard-home-console/commit/54ed6ce0c77f3a290a466c927fd3361ede29f1ec))
- Add component placement rules to the src consolidation proposal ([b90fef8](https://github.com/Cowjiang/adguard-home-console/commit/b90fef8079e7bf5382f1c0cdeb8ad7a59c45c6bd))
- Add lib grouping rules to the src consolidation proposal ([4ea42be](https://github.com/Cowjiang/adguard-home-console/commit/4ea42be8cd80ec6968f46b8808f3d424a8cd9004))
- *(skills)* Add layer-consolidation methodology skill ([00c841f](https://github.com/Cowjiang/adguard-home-console/commit/00c841ffd5d6f3d65d965237156e105b82b19ef7))
- Record the mutation/draft conventions and fix drifted src paths ([1e1eb5c](https://github.com/Cowjiang/adguard-home-console/commit/1e1eb5cf773bf80b5d42d1b52ca14a831eea495d))
- *(proposal)* Mark the src layer consolidation implemented ([fe444d4](https://github.com/Cowjiang/adguard-home-console/commit/fe444d4dc409317e30f58517d6245017501ee32c))
- *(pipelines)* Sync proposal table with src-layer consolidation status ([39168d6](https://github.com/Cowjiang/adguard-home-console/commit/39168d6ea78403f6ddc821e3238af85d13341b0a))
- *(proposal)* Add simplification proposal for the Rust shell and plugin fork ([7bac044](https://github.com/Cowjiang/adguard-home-console/commit/7bac0449a80b9cf4a64d59fd4d72bc209b8cfda6))
- Sync the tauri pages with the fork baseline and the real test command ([332f862](https://github.com/Cowjiang/adguard-home-console/commit/332f862d90857fe428a67549aead2a8121eba645))
- *(proposal)* Mark the rust shell fork consolidation implemented ([3d43a80](https://github.com/Cowjiang/adguard-home-console/commit/3d43a80634e596a0f0d107540f9df6a0193c5bce))
- *(proposal)* Expand the iOS build blocker diagnosis with verified fixes ([bc3efbb](https://github.com/Cowjiang/adguard-home-console/commit/bc3efbb5c5a4ec01aa7d09d39f04e1e11ede98a2))
- *(architecture)* Record the tauri crate/npm same-minor rule ([00c68b9](https://github.com/Cowjiang/adguard-home-console/commit/00c68b998743b797a04c06c3a75fc8d5793aa7b2))
- *(architecture)* Record the iOS release-link constraint and the trust step ([1b2fa02](https://github.com/Cowjiang/adguard-home-console/commit/1b2fa02978c5664b1680fc477ebfef2f9843a980))
- *(proposals)* Register the iOS build-chain fixes as bug-fix proposals ([47ab63b](https://github.com/Cowjiang/adguard-home-console/commit/47ab63be5ec3caf662ac618824df8642add452bb))
- *(proposal)* Lift the fork proposal's build blocker after PRs #11/#12 ([6c70755](https://github.com/Cowjiang/adguard-home-console/commit/6c70755086cc07fa90c279c878a6b28a5c72d3ae))
- *(readme)* Make the Node badge read 24 ([bda0d59](https://github.com/Cowjiang/adguard-home-console/commit/bda0d598aa9391b24ec132229109b3deac527834))
- *(agents)* Document AGENTS.local.md and ignore local backup rules ([e8d6832](https://github.com/Cowjiang/adguard-home-console/commit/e8d6832bd50a417325361d240e49cf4b1e67f0a8))
- *(agents)* Simplify local config note in AGENTS.md ([3af5319](https://github.com/Cowjiang/adguard-home-console/commit/3af531901993644086fd8c09aa99437592516fd7))
- *(readme)* Clarify the AGH Console naming and add npm keywords ([75c35e6](https://github.com/Cowjiang/adguard-home-console/commit/75c35e639bee5d13251e2cf86b70ea8b33396079))
- Record that the repository and the GHCR package are now public ([00490b7](https://github.com/Cowjiang/adguard-home-console/commit/00490b702a461ecf42afb604acd6d868bdcc84c4))
- *(ci)* Drop the AGH_IOS_NIGHTLY switch and document Cut Release ([9f4ce3e](https://github.com/Cowjiang/adguard-home-console/commit/9f4ce3e176d0d4769a41a9a5fffcf71ea351f64a))

### Features

- *(instances)* Multi-instance model, storage v2 and v1 migration ([c693688](https://github.com/Cowjiang/adguard-home-console/commit/c6936883ad1e16b2503cf70d5218c0c96d2db7f5))
- *(auth)* Multi-instance session layer with per-instance probing ([4c17027](https://github.com/Cowjiang/adguard-home-console/commit/4c1702758d843f0dd325f9db1e5b9ce02201e40d))
- *(tauri)* Optional second debug instance for multi-instance acceptance ([ae98f15](https://github.com/Cowjiang/adguard-home-console/commit/ae98f159f5c13e0ebb6edf2842a84bd9c31498fd))
- *(instances)* Management pages and switcher ([534f71c](https://github.com/Cowjiang/adguard-home-console/commit/534f71cbf333c6e2de17fb36e72557ce85390678))
- *(dashboard)* Cross-instance totals and merged leaderboards ([2faedd2](https://github.com/Cowjiang/adguard-home-console/commit/2faedd21783c0722f774a72837a58ad793785825))
- *(api)* Own the proxy contract and localize adapter error kinds ([20630eb](https://github.com/Cowjiang/adguard-home-console/commit/20630eb1bf33409f2962040c9211b31f5441f8ce))
- *(multi-instance)* Add cluster protection concurrency and rule synchronization ([8a1b41d](https://github.com/Cowjiang/adguard-home-console/commit/8a1b41dd3d7eebebb4460573048dbddd29919792))
- *(cluster)* Implement multi-instance filter lists, client sync, and health matrix (P1) ([0b3a46e](https://github.com/Cowjiang/adguard-home-console/commit/0b3a46e2a64464168dc2d6e9af7e166e934a809b))
- *(dns)* Implement upstream DNS concurrent benchmark and multi-instance comparison (P2-1) ([b562fc4](https://github.com/Cowjiang/adguard-home-console/commit/b562fc4b9d9a36a6898bbad8a713fc3515ed200f))
- *(querylog)* Implement multi-instance aggregation and drill-down analytics (P2-2) ([f0b0e19](https://github.com/Cowjiang/adguard-home-console/commit/f0b0e197404a0d78e23b6a2c21b26f29451d055c))
- *(snapshot)* Implement core schemas, capture, storage, diff and restore engines (Part 1) ([966f8a0](https://github.com/Cowjiang/adguard-home-console/commit/966f8a072d017e98afa1e36750357ccf2cfb5f48))
- *(snapshot)* Implement snapshot management UI, diff sheet, sync integration and i18n (Part 2) ([f5c096e](https://github.com/Cowjiang/adguard-home-console/commit/f5c096e61cb736106242596e6268c7a5dc1f9092))
- *(version)* Take the in-app version from the release version ([b1a6a7d](https://github.com/Cowjiang/adguard-home-console/commit/b1a6a7d3b365bff75a546e3e03b0365f8bd07647))
- *(ci)* Implement lefthook, action scripts migration, auto-tagging and changelog system ([1e2a4d3](https://github.com/Cowjiang/adguard-home-console/commit/1e2a4d37926508093ba4d3897963155ad916cfe6))

### Miscellaneous Chores

- *(tooling)* Migrate to pnpm 12 and pin Node 24 ([950fbd8](https://github.com/Cowjiang/adguard-home-console/commit/950fbd8a76e770798e6238daba6cfa64364e7f9c))
- *(tauri)* Record the plugin fork baseline and add a delta script ([4b40b72](https://github.com/Cowjiang/adguard-home-console/commit/4b40b725f9590af7cfb404e3e99f4e31476d4648))
- *(tauri)* Stop tracking plugin build outputs and packaging leftovers ([daddad8](https://github.com/Cowjiang/adguard-home-console/commit/daddad80d8cd6809cb516be90ab78afd3a19b02f))
- *(tauri)* Drop the inert project cargo source override ([9e83c5a](https://github.com/Cowjiang/adguard-home-console/commit/9e83c5a20567387580f804978e89266ab1e94358))
- *(src)* English-only dev warning in the native tab bar bridge ([546fbaf](https://github.com/Cowjiang/adguard-home-console/commit/546fbaf9579744d47cdf95539ad4231c64322760))
- *(ios)* Set the app identifier to com.cowjiang.aghconsole ([f45dff6](https://github.com/Cowjiang/adguard-home-console/commit/f45dff66622ef434200b579d34da6e2431f1bf36))

### Other Commits

- Merge branch 'dev' ([85321a5](https://github.com/Cowjiang/adguard-home-console/commit/85321a539a7ae877b284c5846a8796e265b06c80))
- Merge pull request #7 from Cowjiang/cleanup/pre-multi-instance ([bf2226e](https://github.com/Cowjiang/adguard-home-console/commit/bf2226ee3fab37c00c45b88a870de7021345a6ca))
- Merge pull request #8 from Cowjiang/feat/multi-instance ([c42b423](https://github.com/Cowjiang/adguard-home-console/commit/c42b4236d86eb1bdb05bf5c331683db0b8413871))
- Merge pull request #9 from Cowjiang/refactor/proxy-contract ([047da9b](https://github.com/Cowjiang/adguard-home-console/commit/047da9b04729cc42b9b9b09e8839f6a21f83dd41))
- Merge pull request #10 from Cowjiang/simplification/src-layer ([a1eeb4b](https://github.com/Cowjiang/adguard-home-console/commit/a1eeb4beb31a0cb65b9d4d15e48bdda0b0dcf261))
- Merge pull request #12 from Cowjiang/fix/tauri-build-unblock ([1c88999](https://github.com/Cowjiang/adguard-home-console/commit/1c88999cd12f0f92f3c9ccf6b5abe7a9267b0f95))
- Merge branch 'dev' into simplification/rust-fork ([5a2cf4b](https://github.com/Cowjiang/adguard-home-console/commit/5a2cf4b0cca014d6fba60c013996fa9fbca07f5e))
- Merge pull request #11 from Cowjiang/simplification/rust-fork ([a41bd8e](https://github.com/Cowjiang/adguard-home-console/commit/a41bd8ead775aece847a529b071e0da609a3da90))
- Merge pull request #13 from Cowjiang/dev ([aad0ad7](https://github.com/Cowjiang/adguard-home-console/commit/aad0ad7b6e3d758751d6797540fdac58f6dee54d))
- Merge pull request #14 from Cowjiang/dev ([79225f7](https://github.com/Cowjiang/adguard-home-console/commit/79225f73b5f2d92cfc2f4f7c3655ca602cbee697))
- Merge pull request #15 from Cowjiang/feat/multi-instance-cluster-sync ([5d4f235](https://github.com/Cowjiang/adguard-home-console/commit/5d4f235eedf960e0bd65abdb3ba0013e1a75f72c))
- *(cargo)* Ignore .cargo/ and untrack local cargo config ([1dff0c3](https://github.com/Cowjiang/adguard-home-console/commit/1dff0c3562781aa55c5b4e97df8dc4613e5c75c3))
- Merge pull request #16 from Cowjiang/feat/multi-instance-cluster-operations ([abd9d2c](https://github.com/Cowjiang/adguard-home-console/commit/abd9d2c70f225568827d20204fe56bfc229edb22))
- Merge pull request #17 from Cowjiang/feat/upstream-dns-benchmark ([c038c71](https://github.com/Cowjiang/adguard-home-console/commit/c038c71b6721b3e3b65f7c7a281c79871c7a8899))
- Merge pull request #18 from Cowjiang/feat/query-log-analytics ([1c6b019](https://github.com/Cowjiang/adguard-home-console/commit/1c6b0199d75f89c165cdac78e73cb6b86e265012))
- Merge branch 'dev' into feat/configuration-snapshots-and-rollback ([65da94c](https://github.com/Cowjiang/adguard-home-console/commit/65da94c09b81d3d8953ae0c449c4fb28fd86b0ed))
- Merge pull request #19 from Cowjiang/feat/configuration-snapshots-and-rollback ([61926f5](https://github.com/Cowjiang/adguard-home-console/commit/61926f5d78ee711ab2ac9d88fbe1e864c026e440))
- Merge pull request #20 from Cowjiang/feat/lefthook-changelog-and-auto-tag ([1d63527](https://github.com/Cowjiang/adguard-home-console/commit/1d63527c98ddaa86bdba652bb2d7d40e67b18621))
- Merge pull request #21 from Cowjiang/dev ([3ce0853](https://github.com/Cowjiang/adguard-home-console/commit/3ce08532ce43bb832cf8d7dfd2786c2f2dd3ede1))
- Merge branch 'dev' into main ([0f3a2e6](https://github.com/Cowjiang/adguard-home-console/commit/0f3a2e665ace24ef5b775d89a7fc05f91bb6088c))

### Testing

- *(mock)* Make the mock multi-instance capable and fix the rewrite list ([181d1e2](https://github.com/Cowjiang/adguard-home-console/commit/181d1e2ef392e5cd195090e016cb3487f3fff673))
- Add vitest and cover the KVMap helpers ([0e6d793](https://github.com/Cowjiang/adguard-home-console/commit/0e6d793cb0242a344856c62821b331bd01eabe0e))
- *(contract)* Add shared AGH proxy contract fixture ([b058ba4](https://github.com/Cowjiang/adguard-home-console/commit/b058ba447bd936b9d7b5ad07eea893c3bc6d0119))
## [0.1.0-dev.20261005.d8d0da2] - 2026-10-05

### Bug Fixes

- *(chart)* Mobile touch scroll, long-press preview, ellipse-free hover dots ([60cc848](https://github.com/Cowjiang/adguard-home-console/commit/60cc8480a5540f9a4a5dd49ffb895126a5f5aa96))
- *(ui)* Upstream URL rows no longer stretch dashboard grid on mobile ([4fbfd08](https://github.com/Cowjiang/adguard-home-console/commit/4fbfd089dc24c0e686dd2c86fad329f963549561))
- *(ui)* Skeleton loading state on dashboard without page-in replay ([3dfde0c](https://github.com/Cowjiang/adguard-home-console/commit/3dfde0cb9fc474d67ce02d898eb07a0e85f012ef))
- *(clipboard)* Copy via execCommand fallback in insecure contexts ([f35911f](https://github.com/Cowjiang/adguard-home-console/commit/f35911f4db0d8629fed13825028de864dabeb995))
- *(pickers)* Vendor gate keeps PC device emulation on the custom dropdown ([13b3540](https://github.com/Cowjiang/adguard-home-console/commit/13b354058db97c675347313ff884271233af1eac))
- *(ui)* Upstream URL rows no longer stretch dashboard grid on mobile ([486154a](https://github.com/Cowjiang/adguard-home-console/commit/486154a0b4c6ff87904c32dc45354dc827961d60))
- *(dev)* Serve vite dev server on TAURI_DEV_HOST ([f2e0ba6](https://github.com/Cowjiang/adguard-home-console/commit/f2e0ba652727d3e48fc9e29f61e11e725e089e8f))
- *(ios)* Transition ghosting, blank swipe-back landing, native button anchor, cross-tab swipe ([70cc1e2](https://github.com/Cowjiang/adguard-home-console/commit/70cc1e26df821a7e1e93e393db5a99c63afea03f))
- *(ios)* Native back button at 44pt with appear animation, swipe-back enter latch, consistent transition backdrop ([509806c](https://github.com/Cowjiang/adguard-home-console/commit/509806c1a5e65f496ba8672100b6fbd8c64f60d6))
- *(clients)* Align sort trigger height and use native select on iOS ([efb4a04](https://github.com/Cowjiang/adguard-home-console/commit/efb4a04d23c5150c030c6c305cc811b7cfecf7c9))
- *(ui)* Let dark popovers show glass and repair backdrop-filter prefixing ([5030172](https://github.com/Cowjiang/adguard-home-console/commit/5030172bbc4729cadaea8e8539b095813af46a57))
- *(ios)* Native back button 44pt with appear animation, swipe-back enter latch, transition backdrop ([13800ab](https://github.com/Cowjiang/adguard-home-console/commit/13800ab9456a8edf4f40339abddfd6aee84a096f))
- *(ios)* Own the edge swipe so the revealed page is never blank ([8d97ede](https://github.com/Cowjiang/adguard-home-console/commit/8d97edef248ce8d03dcdfd83d6097dc6a3a269bd))
- *(ios)* Snapshot clones keep their DOM tree; no flash on swipe commit ([045be66](https://github.com/Cowjiang/adguard-home-console/commit/045be660adbbee74e280823b3bd6f4c9512c47d6))
- *(ios)* Treat /clients as second-level on mobile for back button and swipe ([abb4777](https://github.com/Cowjiang/adguard-home-console/commit/abb477781bf4b6f719c1ae630447384360601d6c))
- *(ios)* Unify back semantics so mobile never replaces into a parent list ([6d62535](https://github.com/Cowjiang/adguard-home-console/commit/6d62535739c26cbb67a43f2313e0d469e8ef81a7))
- *(ios)* Clip the native select overlay so option boxes cannot widen the page ([ef870e9](https://github.com/Cowjiang/adguard-home-console/commit/ef870e9f7541511f8c379e84178c5c3b7464e096))
- *(ios)* Make mobile header actions the same height as the back capsule ([1e69acb](https://github.com/Cowjiang/adguard-home-console/commit/1e69acb0eafbb622986d4f7a3a4c32a0f5c3344b))
- *(log)* Keep the log filter and search in sync with the URL ([fb12202](https://github.com/Cowjiang/adguard-home-console/commit/fb12202d9727849c555c0aa0ec39284ede7deff6))
- *(web)* Red filter delete button, unwrapped save button, rule count on rules row ([81c1ab2](https://github.com/Cowjiang/adguard-home-console/commit/81c1ab289e4a855a7d79bb05bddff60d016c2361))
- *(ios)* Verify the generated Xcode project and rebuild it when missing ([252a147](https://github.com/Cowjiang/adguard-home-console/commit/252a1472cc809dab0c5688efcb834a0f0d1c1904))
- *(ios)* Stop copying the Rust static archive into the app bundle ([7098b54](https://github.com/Cowjiang/adguard-home-console/commit/7098b549b79d1309b50f4dabcc90c61232b781c9))
- *(transition)* Keep status pill continuous across push/pop transitions ([5469515](https://github.com/Cowjiang/adguard-home-console/commit/546951591506bcab7db48b9236ea8beee9b8d2d2))
- *(ui)* Remove colored glow from primary and danger buttons ([81025b8](https://github.com/Cowjiang/adguard-home-console/commit/81025b882e283f1e79da6664d8c3efa802dd2441))
- *(filters)* Treat filter update interval as milliseconds ([81c2b96](https://github.com/Cowjiang/adguard-home-console/commit/81c2b9656130efa03473be006f7a06afadf0db5e))
- *(querylog)* Keep log detail action buttons on one line ([7aa52cf](https://github.com/Cowjiang/adguard-home-console/commit/7aa52cfd32a3d4e1016dd9a448266afa51308101))
- *(dhcp)* Parse bare interface map from /dhcp/interfaces ([55d9238](https://github.com/Cowjiang/adguard-home-console/commit/55d9238a0c7587d9d5c25da270bd795ca1960a19))
- *(dhcp)* Address visual acceptance feedback ([9422ee0](https://github.com/Cowjiang/adguard-home-console/commit/9422ee020092b220baf24907fcfc3c8c6b84653c))
- *(dhcp)* Plain-text notices, hide enable warning while enabled ([170aa2f](https://github.com/Cowjiang/adguard-home-console/commit/170aa2fcc0286ecb350b8cf2e8178d59d139a2d2))
- *(dashboard)* Make mobile trend legend wrap symmetric and recover on resize ([e2ad353](https://github.com/Cowjiang/adguard-home-console/commit/e2ad353f36de9b38f7e915daa4ffcdc5da2996ca))

### Code Refactoring

- *(ios)* Load signing from local env, drop generated xcodeproj from git ([cbeb728](https://github.com/Cowjiang/adguard-home-console/commit/cbeb728757e933497198b38c538143ceb30889aa))
- *(ios)* Retire the native SwiftUI line ([b6e8af1](https://github.com/Cowjiang/adguard-home-console/commit/b6e8af10194d79a36244a39f22e9afdb271601f1))
- Translate code comments to English per AGENTS.md rule ([755bb48](https://github.com/Cowjiang/adguard-home-console/commit/755bb48e9db02b34e347345a2c815f1eca4ef1b0))
- *(protection)* Drop redundant status refresh button ([8e3d879](https://github.com/Cowjiang/adguard-home-console/commit/8e3d8794425cbd89ff8f0e749b087607d123c58c))
- *(ui)* Align displayed app name with Tauri shell as AGH Console ([b760f69](https://github.com/Cowjiang/adguard-home-console/commit/b760f695c5835f687eeb3245917af2c53397cd94))
- *(ui)* Shorten document title to AGH Console ([a7ed064](https://github.com/Cowjiang/adguard-home-console/commit/a7ed064751e1a07701f773fdd3d2f93f6e2a33be))

### Continuous Integration

- Auto release on push, server pull deploy script ([eb59b9f](https://github.com/Cowjiang/adguard-home-console/commit/eb59b9f1ea29b92f297360ef5f0ce17b45b1ecfb))
- Release pipeline - dev workflow, docs skip, auto-prune, dev naming ([a6c3bf0](https://github.com/Cowjiang/adguard-home-console/commit/a6c3bf0093f63c32d3b44d91fefb8d2b4a569b3f))
- Exempt .agents/** from release triggers ([dbde940](https://github.com/Cowjiang/adguard-home-console/commit/dbde940b310000e2f3946d9451f30a2a138c4fda))
- *(release)* Scope release notes to the pushed commits and keep all releases ([6bb9818](https://github.com/Cowjiang/adguard-home-console/commit/6bb9818d7e9068ce9944b1f47e3920618dcc27ea))
- Trigger release on semver tags, retire dev-tag auto releases ([41be024](https://github.com/Cowjiang/adguard-home-console/commit/41be024649935c93222e8dd003ade46b93da9e85))

### Documentation

- Picker pitfalls, final dropdown scheme and iOS logs ([238260f](https://github.com/Cowjiang/adguard-home-console/commit/238260ff0352d28b86a43b2a8ce228fadba7576d))
- Record re-tap scroll-to-top decision in tab bar notes ([b0387ad](https://github.com/Cowjiang/adguard-home-console/commit/b0387adc559118fe372c0fdc2f318411c63f7e92))
- *(ios)* Mark the /tmp xcodegen workaround obsolete ([b0413c6](https://github.com/Cowjiang/adguard-home-console/commit/b0413c6520a106690b78ac67ef49577696f46fda))
- *(agents)* Move process artifacts from docs/ to .agents/ ([8e8cd8d](https://github.com/Cowjiang/adguard-home-console/commit/8e8cd8da04c015d4e7a4afd3c22ecd2d4d5b841c))
- *(agents)* Keep screenshots out of git ([2b5812f](https://github.com/Cowjiang/adguard-home-console/commit/2b5812fe65563c3134ea876fe3f1e2535da48d48))
- *(ios)* Record swipe-back research and simulator verification ([5f7d7a5](https://github.com/Cowjiang/adguard-home-console/commit/5f7d7a56c546e4a5add3f445177964a87bd7c66f))
- *(agents)* Drop machine-local notes from the agent docs ([07ed131](https://github.com/Cowjiang/adguard-home-console/commit/07ed131f5651dd49db3f62af42e059a5aa832f21))
- *(memory)* Route transition/native control pitfalls + iOS signing chain gotchas ([82e1ba2](https://github.com/Cowjiang/adguard-home-console/commit/82e1ba2fee6cae7211674dbaa843aed525daa5d8))
- *(agents)* Add proposal pipeline, tracks rule and verifier ([eac148d](https://github.com/Cowjiang/adguard-home-console/commit/eac148d39570d015fbd058f512f9e6e9ccadbaf2))
- *(agents)* Retire the reserved workflows/ directory ([687177d](https://github.com/Cowjiang/adguard-home-console/commit/687177d2ac63b90327dc57b4ba7ccebc9b6e699e))
- *(agents)* Register this session's client-picker and glass fixes as proposals ([d9f6ead](https://github.com/Cowjiang/adguard-home-console/commit/d9f6ead9481c2a4188be0880dc3a52f57168ebb0))
- Separate durable facts from workflow records ([1375432](https://github.com/Cowjiang/adguard-home-console/commit/137543246e69b3e59cf197fc118a1d28f34fdb6a))
- *(agents)* Record the verified end-to-end release run in the proposal ([8bd58c1](https://github.com/Cowjiang/adguard-home-console/commit/8bd58c1de8b3377c401cfca45908959ad6f12a66))
- *(agents)* Add progressive documentation entrypoints ([f21e628](https://github.com/Cowjiang/adguard-home-console/commit/f21e628bdce202d4261c6356e1b8f7ec4f7288b2))
- *(agents)* Add a directory index to the root entry ([89ba80e](https://github.com/Cowjiang/adguard-home-console/commit/89ba80e9d2de4123e47f5027727733e0dc525569))
- *(architecture)* Rebuild architecture facts under docs/architecture/ ([8e1d632](https://github.com/Cowjiang/adguard-home-console/commit/8e1d6325a6d8e55bffc76415369bf5a4e2d34d00))
- Use lowercase page names and add status metadata ([68287e2](https://github.com/Cowjiang/adguard-home-console/commit/68287e2d671d190669585fef69d398a2fd1d4a99))
- Keep the docs index scoped to its own layer ([77d3462](https://github.com/Cowjiang/adguard-home-console/commit/77d3462f17e5a5dd49b918f22aa9d8a958ee931d))
- *(architecture)* Link each delivery line to its page ([b1ab29f](https://github.com/Cowjiang/adguard-home-console/commit/b1ab29f54f35a447c0189b7b04120b162c1bb714))
- Repoint proposal links to archived snapshots ([9edb621](https://github.com/Cowjiang/adguard-home-console/commit/9edb621a9e91af58087cc0c86a50cafe26f3f8aa))
- *(agents)* Add a code standards section to the root entry ([c51125d](https://github.com/Cowjiang/adguard-home-console/commit/c51125db9f062de644785e086ee66edc81411c5f))
- *(agents)* Drop the comment policy and check gates from the root entry ([c8f5e16](https://github.com/Cowjiang/adguard-home-console/commit/c8f5e168f2ddb9482021faeb3f16a24216ab5849))
- *(agents)* Give the checks their own section ([b5a4a88](https://github.com/Cowjiang/adguard-home-console/commit/b5a4a88a9e1fc752b163bfe28bc1965246338de2))
- *(agents)* Register the Swift-line retirement and the iOS generation gate ([5136809](https://github.com/Cowjiang/adguard-home-console/commit/51368095cae3ef613bc186c43519e2637c43b5f7))
- Register refresh-triggers proposal ([acebb5c](https://github.com/Cowjiang/adguard-home-console/commit/acebb5c6e245ef3f6a78011e2328bc6bbabbee88))
- Record refresh and connection recovery facts ([ce7c73a](https://github.com/Cowjiang/adguard-home-console/commit/ce7c73a801c43eadcad86a96cbc98df8f66661ae))
- Record refresh scope and offline feedback decisions ([2d79d19](https://github.com/Cowjiang/adguard-home-console/commit/2d79d19a3f7adfec88bc9198a35d6f336cbe50c6))
- Record status pill transition behavior ([53bf72b](https://github.com/Cowjiang/adguard-home-console/commit/53bf72bded64f4be10bdb859c8ab460fd07e833b))
- *(agents)* Register the UI i18n proposal ([27aa40e](https://github.com/Cowjiang/adguard-home-console/commit/27aa40ee252a411a45bb6969af0734c74d318923))
- *(agents)* Check off the i18n phase-one acceptance ([14fa73a](https://github.com/Cowjiang/adguard-home-console/commit/14fa73a36bea6c3ddb9e319c06a39a2e1f93a783))
- *(agents)* Record the English fallback decision in the i18n proposal ([8cd0b5e](https://github.com/Cowjiang/adguard-home-console/commit/8cd0b5e44b3374a31ae08630d938ba0141887fed))
- *(agents)* Record the iOS simulator i18n walkthrough and close the proposal ([1f80bb8](https://github.com/Cowjiang/adguard-home-console/commit/1f80bb807cddd5262bda15e38d6f09ecda78a65b))
- *(agents)* Close the tap-level verification residual in the i18n proposal ([42ad893](https://github.com/Cowjiang/adguard-home-console/commit/42ad893ed2c243d8cfb97c35e1328cd258d7890a))
- Translate README and AGENTS.md to English ([2856687](https://github.com/Cowjiang/adguard-home-console/commit/2856687b4ff52247f7e544dcdb9fc49a1ef0ea94))
- Add concise English comment rule to AGENTS.md ([5827223](https://github.com/Cowjiang/adguard-home-console/commit/58272233f0371fd72e637c1386138bd05accabef))
- Register webui release and mobile premium proposals ([dd1c57a](https://github.com/Cowjiang/adguard-home-console/commit/dd1c57ae8a02892ae23982faaa052943d638e082))
- Rewrite README for open-source release ([e3bd97b](https://github.com/Cowjiang/adguard-home-console/commit/e3bd97b1b1e617c6dd001838a3d3e274780634c6))
- Add iOS app screenshots to the README ([a5a9fb7](https://github.com/Cowjiang/adguard-home-console/commit/a5a9fb76ac90c66b14b749af994a95304ca7fbce))

### Features

- *(protection)* Optimistic protection switch + Switch loading state ([ab1ee33](https://github.com/Cowjiang/adguard-home-console/commit/ab1ee33ff1ceb04cf37d5b6277c49ecc0529e07a))
- *(settings)* Group settings center, split app settings; encryption page parity ([8003d52](https://github.com/Cowjiang/adguard-home-console/commit/8003d525c204fe8743124f4438a61ae1406a9a70))
- *(dns)* DNS settings page parity with upstream admin UI ([9689c2d](https://github.com/Cowjiang/adguard-home-console/commit/9689c2d555272797501f0badb36dc00b22c93edd))
- *(ios)* IOS support with native Swift app and Tauri build ([1faf1a0](https://github.com/Cowjiang/adguard-home-console/commit/1faf1a0cbe18c52b1d37cee3131e6065fef2bf7b))
- *(ui)* Anchored dropdown pickers on mobile ([ce2a331](https://github.com/Cowjiang/adguard-home-console/commit/ce2a331b20485a9f730eb3a56aa32df247cd31ca))
- *(dns)* Cache size becomes a dropdown select ([fb7274f](https://github.com/Cowjiang/adguard-home-console/commit/fb7274f077187f9fcc893c2418f30771ca382ca1))
- *(ui)* Apple-device native select pickers; in-place interval editing ([f2135b1](https://github.com/Cowjiang/adguard-home-console/commit/f2135b15ec747db24c68cf07e70a20ac5ad06f67))
- *(ui)* Re-tapping the active tab scrolls back to top ([9bbef7d](https://github.com/Cowjiang/adguard-home-console/commit/9bbef7d97c16dc92e9cfbc2084f6d5f22748ba54))
- *(log)* Open entry detail as a page on mobile and center dialogs on desktop ([6b92078](https://github.com/Cowjiang/adguard-home-console/commit/6b92078d6bef2ab345cc6b760805c04efd0bb8bc))
- *(icons)* Solid shield-check app icon matching protection card ([cb15d03](https://github.com/Cowjiang/adguard-home-console/commit/cb15d037ced0b7371c576721814e8652087df79a))
- *(ios)* Re-tapping active native tab scrolls back to top ([db31c54](https://github.com/Cowjiang/adguard-home-console/commit/db31c546fdf03b04114a43fe25ea4e5d95ab9415))
- *(clients)* Show WHOIS country and org for auto clients ([f2a94f6](https://github.com/Cowjiang/adguard-home-console/commit/f2a94f69ae40bef48071ba2754f7441820383d0b))
- *(clients)* Client page overhaul, floating-panel red line, tab animations ([0414c85](https://github.com/Cowjiang/adguard-home-console/commit/0414c857b62f7b52ab4f57ed07cd070f960fce7c))
- *(ios)* Enable WKWebView interactive swipe-back gesture ([6b926db](https://github.com/Cowjiang/adguard-home-console/commit/6b926db6241b6b91d6bb792069230293cb5d7ab9))
- *(web)* Pin liquid-glass nav bar for mobile child pages ([f0e1a01](https://github.com/Cowjiang/adguard-home-console/commit/f0e1a01f24aaabdc2b09076c7a5aef02facdf80c))
- *(ios)* Enable WKWebView swipe-back with a floating capsule back button (CSS fallback) ([af80866](https://github.com/Cowjiang/adguard-home-console/commit/af80866b58fc169ed71757646f956b3cdd4846dd))
- *(scripts)* Npm scripts for iOS device build, clean, and deploy ([4ba5aa3](https://github.com/Cowjiang/adguard-home-console/commit/4ba5aa35317c903069b03cb270ce35b2fa484631))
- *(ios)* Native glass header action buttons ([2a9ed86](https://github.com/Cowjiang/adguard-home-console/commit/2a9ed865942da16660498a0a3ef1f83112ffaa94))
- Add pull-to-refresh, tab-land refresh and offline self-heal ([3ccc274](https://github.com/Cowjiang/adguard-home-console/commit/3ccc2748c54117e85ab667eaddea0cfb9eb3f38d))
- *(refresh)* Scope pull-to-refresh to tab roots and add offline feedback ([87deb88](https://github.com/Cowjiang/adguard-home-console/commit/87deb88292dc35c39099fb90c11894154084a113))
- *(i18n)* Add the i18next infrastructure with zh/en dictionaries ([a01b6c3](https://github.com/Cowjiang/adguard-home-console/commit/a01b6c316b59436879173e0111f60437ce2f8da8))
- *(i18n)* Migrate login, dashboard and the protection card as samples ([35ca7eb](https://github.com/Cowjiang/adguard-home-console/commit/35ca7eb276eed9534c60b60231a363e8fd832bb9))
- *(i18n)* Add the language switcher to appearance settings ([0b1266f](https://github.com/Cowjiang/adguard-home-console/commit/0b1266f990bb51f64c49e8732526b8ac2714007e))
- *(i18n)* Fall back to English when no language matches ([238c20f](https://github.com/Cowjiang/adguard-home-console/commit/238c20f0a9f924c39d18a6da97744b39f572248b))
- *(i18n)* Add the phase-two dictionaries for all domains ([14ef16e](https://github.com/Cowjiang/adguard-home-console/commit/14ef16e7b444f4de07cd7cec3fab033684791350))
- *(i18n)* Migrate the remaining pages, components and shared constants ([ee3712a](https://github.com/Cowjiang/adguard-home-console/commit/ee3712a454286b7ff193fb8421ea6ef843ce807d))
- *(i18n)* Rename the log tab route to /logs ([747870d](https://github.com/Cowjiang/adguard-home-console/commit/747870df049bdccce7c8ec929640f8d32d69b539))
- *(protection)* Show filter lists last update on mobile card ([7771592](https://github.com/Cowjiang/adguard-home-console/commit/77715929a794d8ab8549e687d9b07fa9bc951cc8))
- *(settings)* Add follow-system language option and unify appearance rows ([293de77](https://github.com/Cowjiang/adguard-home-console/commit/293de7791781383b6e1006f7b411c0a6c906a013))
- *(dhcp)* Close feature gap with native AGH DHCP page ([31e09fd](https://github.com/Cowjiang/adguard-home-console/commit/31e09fd1b626e0c23aad48c193287dc2e34d8b76))
- *(settings)* Add ignored-domains config with draft-based header save ([c66bf75](https://github.com/Cowjiang/adguard-home-console/commit/c66bf75766b63997f327b3d3f59ae152491d99b3))
- *(encryption)* Close feature gap with native AGH encryption page ([61c05d5](https://github.com/Cowjiang/adguard-home-console/commit/61c05d57399072e99f9f77eae46fb41ef94320f1))
- *(dashboard)* Merge stats analysis into overview as desktop-only section ([688ff96](https://github.com/Cowjiang/adguard-home-console/commit/688ff96b736c0fff70827a7e47d23c9fca934134))
- *(docker)* Container image with GHCR multi-arch publishing ([78b6180](https://github.com/Cowjiang/adguard-home-console/commit/78b61803be0fa372a6dda9f44bf42601ab988b70))

### Miscellaneous Chores

- Align package-lock version with package.json ([81ce3d4](https://github.com/Cowjiang/adguard-home-console/commit/81ce3d435e146209af2e3100d82a69f17389078f))
- Ignore local .zcodeignore ([4878df5](https://github.com/Cowjiang/adguard-home-console/commit/4878df5345b2ce3ec692e4726b972839ebe2f975))
- Ignore .impeccable local agent artifacts ([f610adc](https://github.com/Cowjiang/adguard-home-console/commit/f610adc6fe92ff041fb519175b83ef1c2d19a1b3))
- Strip pre-release material ahead of open-sourcing ([a0f4a19](https://github.com/Cowjiang/adguard-home-console/commit/a0f4a19206141e525b9a8088b03eb66f9e81fd7b))

### Other Commits

- Initial commit: AdGuard Home Console ([c2f25eb](https://github.com/Cowjiang/adguard-home-console/commit/c2f25eb37d76da8b3962a4e006d38ad1fdc6b8cf))
- Merge branch 'dev' into feat/ios-build ([2202dac](https://github.com/Cowjiang/adguard-home-console/commit/2202dac1912ee51c1fcb19ddcd0da7b1c5160bf5))
- Merge branch 'dev' into feat/ios-build ([977ef4a](https://github.com/Cowjiang/adguard-home-console/commit/977ef4a457e49ea097fad54b544ca4ff4ca82a09))
- Merge branch 'dev' into feat/ios-build ([fdfa457](https://github.com/Cowjiang/adguard-home-console/commit/fdfa4571332618a3fbe2ccd71ab370f005c4d6c9))
- Merge branch 'dev' into feat/ios-build ([14a30d1](https://github.com/Cowjiang/adguard-home-console/commit/14a30d1a16ef0ca848383b43906f2f1ed5966266))
- Merge branch 'feat/ios-build' of https://github.com/Cowjiang/adguard-home-console into feat/ios-build ([17d8bac](https://github.com/Cowjiang/adguard-home-console/commit/17d8bac245c410efeb397f100f336a39a039baaa))
- Merge pull request #1 from Cowjiang/feat/workflow-overhaul ([6e27e63](https://github.com/Cowjiang/adguard-home-console/commit/6e27e63c600f7ac1d1736864f7305d336f0b38bc))
- Merge branch 'dev' into feat/ios-build ([29e8a18](https://github.com/Cowjiang/adguard-home-console/commit/29e8a18f4b3dd053b54d8ba205cce6d40f427267))
- Merge branch 'dev' into feat/ios-swipe-back ([7120db9](https://github.com/Cowjiang/adguard-home-console/commit/7120db9131059d7483c7e912660c7a293c6da826))
- Merge branch 'dev' into feat/ios-swipe-back ([a488c08](https://github.com/Cowjiang/adguard-home-console/commit/a488c087574e9f3df7ca24ed8dd1b5124f230aae))
- Merge branch 'dev' into feat/ios-swipe-back ([bd3576a](https://github.com/Cowjiang/adguard-home-console/commit/bd3576a57c275eda8dafda81a6e4b60c6d995abe))
- Merge branch 'feat/navbar-glass' into feat/ios-swipe-back ([6e81051](https://github.com/Cowjiang/adguard-home-console/commit/6e81051eda6b45150f1482ae98a66024b3bca27b))
- Merge branch 'dev' into feat/ios-swipe-back ([7a12435](https://github.com/Cowjiang/adguard-home-console/commit/7a124357883611bfd3574e9bc3365d5254a1af90))
- Merge branch 'origin/feat/ios-swipe-back' into feat/ios-swipe-back (clients overhaul + signing refactor) ([09297f2](https://github.com/Cowjiang/adguard-home-console/commit/09297f2b001d1062d2b18d6eae67927cad45da35))
- Merge branch 'feat/ios-swipe-back' into feat/ios-build ([8f3e36a](https://github.com/Cowjiang/adguard-home-console/commit/8f3e36ab127c3fa4e3581d52033e1ba08982ad96))
- Merge remote-tracking branch 'origin/dev' into dev ([eff9529](https://github.com/Cowjiang/adguard-home-console/commit/eff9529e3ca21725d2c987d7614a6ae9c8e6de7f))
- Merge remote-tracking branch 'origin/dev' into feat/ios-swipe-back ([c5f5bda](https://github.com/Cowjiang/adguard-home-console/commit/c5f5bda8404cae3914b58e9a58d66b8b41e73797))
- Merge branch 'feat/ios-swipe-back' into feat/ios-build ([111ef79](https://github.com/Cowjiang/adguard-home-console/commit/111ef797544d22d5daa1071c710cd59291aef7bb))
- Merge pull request #2 from Cowjiang/feat/agents-workflow ([e19dcbc](https://github.com/Cowjiang/adguard-home-console/commit/e19dcbc1033f60f7b7ee4ba06e14861a253dee73))
- Merge remote-tracking branch 'origin/dev' into dev ([955dc3a](https://github.com/Cowjiang/adguard-home-console/commit/955dc3a6cab92386f209783d3380b6e6b1b06452))
- Merge branch 'dev' of github.com:Cowjiang/adguard-home-console into dev ([96bbff1](https://github.com/Cowjiang/adguard-home-console/commit/96bbff148fe9ab25c1e83801cfa8eb32c7a8c5f2))
- Merge branch 'fix/ios-back-button' into dev ([238669a](https://github.com/Cowjiang/adguard-home-console/commit/238669accc20b0297935c45271e8124e3a203bef))
- Merge remote-tracking branch 'origin/dev' into dev ([aad8300](https://github.com/Cowjiang/adguard-home-console/commit/aad8300cab85980c595c9363998ec11c20ed9888))
- Merge branch 'fix/clients-back-nav' into dev ([3aadbf8](https://github.com/Cowjiang/adguard-home-console/commit/3aadbf8796778f9f6a344b548b40ee2ba373e827))
- Merge pull request #4 from Cowjiang/docs/progressive-agent-entrypoints ([716efb4](https://github.com/Cowjiang/adguard-home-console/commit/716efb48da51d92cca2d07b13c1b059f4ddb7d54))
- Merge branch 'dev' of github.com:Cowjiang/adguard-home-console into dev ([3f2430c](https://github.com/Cowjiang/adguard-home-console/commit/3f2430c394051aae57df772f4a5565c7dfbcb070))
- Merge branch 'feat/refresh-triggers' into dev ([732ea70](https://github.com/Cowjiang/adguard-home-console/commit/732ea70c62ad37c3f33441d8777d6a85cc7b054a))
- Merge branch 'dev' into main ([41c44ee](https://github.com/Cowjiang/adguard-home-console/commit/41c44ee710fe377c6009fcbda2e562fea5768519))
- Merge branch 'dev' into feat/i18n ([d65371a](https://github.com/Cowjiang/adguard-home-console/commit/d65371a89127b1adabffff06934322c36acc7368))
- Merge pull request #5 from Cowjiang/feat/i18n ([2f00897](https://github.com/Cowjiang/adguard-home-console/commit/2f008975b14d844057fba28200df1de38c7f9700))
- Merge branch 'dev' ([3a02505](https://github.com/Cowjiang/adguard-home-console/commit/3a02505f9a878d39ab8175c702ea935a53f7abb7))
- Merge branch 'dev' ([ede280d](https://github.com/Cowjiang/adguard-home-console/commit/ede280d3ac4ec20e3503b87e508521e1f9c15042))
- Revert "ci: trigger release on semver tags, retire dev-tag auto releases" ([dfebdd1](https://github.com/Cowjiang/adguard-home-console/commit/dfebdd18ecae9d568bb4e0094982f91813bbe346))
- Merge pull request #6 from Cowjiang/docs/ios-screenshots ([d8d0da2](https://github.com/Cowjiang/adguard-home-console/commit/d8d0da2a7c1e691d04a30271839fe7531a6b392d))

