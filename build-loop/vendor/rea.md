# rea (bundled skills)

Source: https://github.com/morluto/rea at commit `8250bf2`, path `.agents/skills/reverse-engineer-anything/`. Licence: MIT (see `vendor/LICENSES.md`).
8 files bundled unchanged. Read one with `python3 scripts/vendor.py rea <path>`; restore them with `python3 scripts/vendor.py --export <dir> --source rea`.

<!-- vendor-file: reverse-engineer-anything/SKILL.md -->
---
name: reverse-engineer-anything
description: Reverse engineer native, managed, Electron/JavaScript, packaged, firmware, and browser targets with REA, and build agent environments (AgentEnv bundles) of web applications from a live instance or a capture. Use shipped-artifact or requested runtime evidence to explain features, compare versions, decompile code, or guide a reconstruction. Skip REA for ordinary source-repository architecture analysis.
metadata:
  version: "59"
---

# REA

Use REA when a claim depends on a shipped binary or package, decompilation,
requested runtime evidence, or comparison with
behavior not established by available source. For ordinary analysis of a
complete source repository, use normal repository tools and do not run REA
readiness or provider commands.

## Connect only when needed

Installing this skill supplies instructions; it does not register the REA MCP
server, install analysis engines, or add tools to an already-running agent.
The exception is a Claude Code or Codex plugin install: the plugin bundles
this skill and registers its own `rea` server, outside the state that
`rea setup` and `rea doctor` manage.

If REA tools are available and their registration is not known to be stale,
proceed directly to the target. Do not run diagnostics or setup before every
investigation. Use the connected server's actual tool list and input schemas;
a skill installed from repository main may describe capabilities absent from
an older npm release. Keep complete inline Evidence when that server does not
advertise retained references.

If tools are absent, a call is blocked by the client, or a required provider is
unavailable, read [connection and recovery](references/connection-and-recovery.md).
Diagnose the observed blocker, continue useful supported work, and resume the
original task after repair. Client approval, shell PATH, registration and engine
availability have different remedies; avoid repeating setup for all of them.
If the host times out without a REA result, do not repeat the unchanged call or
assume work stopped. Read the recovery guide's deadline distinction before retrying.
If the MCP connection drops, retry that call once only when it is safe to
repeat or known not to have started. If it may already have changed the
target, or it fails again, tell the user and ask them to restart the MCP
client. If REA could not start its connection, retry once, then tell the user
and ask them to restart the MCP client. Do not retry a startup failure that
returns the same unchanged result. For plugin installs, follow
[plugin recovery](references/connection-and-recovery.md#rea-installed-as-a-client-plugin).
For setup-owned registrations, run `rea doctor` when REA could not start
or tools stay missing after that restart. For `cleanup_incomplete`, a retryable
capacity limit, or `configuration_invalid`, follow the recovery guide's ladder
before asking for a restart. Read that guide before a second repair attempt.

Choose the installation owner before repairing registration. Plugin installs use
[plugin recovery](references/connection-and-recovery.md#rea-installed-as-a-client-plugin);
only setup-owned registrations use the guide's
[registration repair plan](references/connection-and-recovery.md#repair-registration-when-needed).
A plugin-only doctor result of `missing` does not call for `rea setup`.

REA setup never installs or upgrades Node.js, npm, Homebrew, Java, Ghidra, IDA,
JADX, Kuna, Binwalk, or Unblob. Use existing prerequisites; do not install unrelated
software to repair MCP registration. For an unsupported client, use manual stdio
registration with an existing installation’s absolute runtime and entry script, or continue through the CLI.

A concrete CLI fallback for an operator-supplied JavaScript tree or ASAR is:

```bash
npx -y rea-agents@latest analyze-javascript-application /absolute/path/to/app --json
```

No MCP registration or native engine is required. Read the returned Evidence,
graph, limitations, and unknowns with the same care as an MCP result; the CLI
returns the Evidence record directly. This fallback does not establish that
MCP is configured. Native CLI tasks still require their selected engine.
Prefer an existing `rea` CLI. When none is installed and REA package acquisition
is within the authorized scope, use `npx -y rea-agents@latest` in its place from a
trusted directory outside the target project, with absolute target paths. Managed
setup binds the current installation directly; retain its runtime and package
cache entry, or restore that installation before repairing its registration.
For setup-owned registration, configuration repair starts with a read-only setup plan; show paths, backups and
skill replacement before applying authorized changes. Preserve existing approval
and target-execution boundaries.

## Route the target first

Choose the first tool from the target the user supplied. Use `open_binary` for
active-target native or archive workflows; target-free tools take their own
explicit path or endpoint and do not need it.

- ASAR or extracted JavaScript/Electron tree:
  `analyze_javascript_application`.
- Archive/package member inventory (ZIP/APK/IPA/MSIX/AppX, DMG, or a PyInstaller
  executable): `open_binary` with the supplied local path; use `inspect_artifact`
  when its graph and findings help answer the question. A PyInstaller CArchive
  is the application layer; the bootloader is only the native prefix. Start with
  `detail: "summary"` for large inventories, then use retained inventory views
  for selected member fields/pages. A complete small inventory can cost less
  than extra calls and schemas. Runtime options are metadata, not files.
  Compact delivery still inventories and hashes members. See the
  [Python packaged applications guide](https://github.com/morluto/rea/blob/main/docs/python-packaged-applications.md).
- Bun `--compile` executable: `open_binary`, then `inspect_artifact`; the Bun
  module graph is the application layer. Extract stored modules and analyze the
  JavaScript. See [Bun standalone executables](https://github.com/morluto/rea/blob/main/docs/bun-standalone.md).
- Apple app plist, Interface Builder, asset catalog, or keyed archive resources:
  `open_bundle_resources`, then the selected resource tool. This does not
  require `CFBundleExecutable` or a deep provider. Resource sessions have no
  executable digest or binary snapshot; use `open_binary` for native code.
- Android APK code, classes, methods, or incoming references:
  `inspect_android_package`, then focused Android tools when advertised.
  Archive member inventory still uses the archive route above.
- Managed PE/CLI assembly: `inspect_managed_artifact`.
- Firmware image: `inspect_firmware_regions` when advertised. Use
  `extract_firmware` when extraction is requested, with a caller-selected new
  absolute output directory. These tools use caller-supplied Binwalk/Unblob on
  Linux; see the [firmware guide](https://github.com/morluto/rea/blob/main/docs/firmware-analysis.md).
- ESP32-family app or bootloader image (`0xE9` magic): `inspect_artifact`
  without a provider; see the ESP section of `references/native-and-artifacts.md`.
- .NET NativeAOT PE/ELF: native Ghidra analysis. Native code can yield pseudocode;
  consult the NativeAOT workflow in `references/native-and-artifacts.md` for
  optional metadata recovery and its supported host/layout boundary.
- Native program behavior, live calls, instrumentation, or command-run effects:
  choose the matching [native runtime workflow](references/runtime-observation.md#native-runtime-questions).
  `open_binary` and `trace_native_values` establish static facts; they do not
  observe execution. Runtime tools have distinct launch, attach, mutation and
  cleanup effects, and do not require a preliminary static session unless their
  own contract says so.
- User-owned browser page already open: `list_browser_targets`.
- Browser action the agent must perform (click, type, navigate):
  `capture_browser_scenario` with declared actions. See
  [runtime observation](references/runtime-observation.md) for connect/launch
  and the focused follow-up browser tools.
- Agent environment (AgentEnv bundle) of a web application: read
  [environments](references/environments.md) before recording; it records with
  `capture_browser_scenario` and writes the bundle with `export_environment_bundle`.
- Fiddler Everywhere traffic or a native `.saz` capture: read the
  [Fiddler workflow](references/runtime-observation.md#fiddler-everywhere-traffic-debugging).
  Inspect saved SAZ with `inspect_web_network_capture` and `format: "saz"`;
  connect Everywhere's separate MCP server for live traffic.
- Retained HAR/SAZ/native mitmproxy/aioquic qlog capture: `inspect_web_network_capture`. Select
  original record ordinals when useful; inspect producer fields and byte/number
  sidecars without fetching recorded URLs or claiming live attribution. HAR/SAZ/qlog
  old-generation heap is `REA_CAPTURE_DECODER_OLD_GENERATION_MIB` (default 192 MiB,
  floor 8, maximum 16384), set where REA starts. Host memory and `NODE_OPTIONS` do not
  raise it. See
  [historical captures](https://github.com/morluto/rea/blob/main/docs/web-network-captures.md) for the exact upstream
  profile and credential exclusions. Qlog support starts with aioquic 1.5.0
  JSON 0.3; stream coverage and endpoint loss declarations do not recover bodies
  or establish network loss. Prefer detail summary, then kind qlog trace/stream
  pages; select one trace, stream ID and direction for contribution/range pages.
  Facts retain all-recorded-events-before-selection scope. Other qlog layouts
  and PCAP correlation are unsupported.
- User-owned Electron runtime already open: `list_electron_targets`. Before an electron-main Inspector attempt, check packaged fuses with `inspect_electron_fuses`; disabled `EnableNodeCliInspectArguments` means the app ignores `--inspect`.
- Packet-field discovery: `inspect_packet_fields` searches installed protocols
  and field names/types before choosing fields for `inspect_packet_capture`.
  Query/page the relevant records; registrations do not establish observed traffic.
- Recorded packet captures: `inspect_packet_capture` with selected TShark fields,
  display filters and decode-as rules. Requires Linux, util-linux prlimit and
  TShark 4.x on an absolute `PATH` entry or via the optional absolute
  `REA_TSHARK_COMMAND` override; see
  [capture guide](https://github.com/morluto/rea/blob/main/docs/packet-captures.md).
  Packet limits count input packets before filtering. Output defaults to 50 matching
  frames; use `match_offset` / `match_limit` for later pages, or explicit null
  limit for complete matching output. Preserve the source digest across pages.
  This does not perform live capture.
  For address/DNS/SNI/protocol summaries use `inspect_pcap_capture` with MCP
  detail summary, then retained kind pcap pages. Requires Wireshark 4.x tshark
  and capinfos, with Linux prlimit or Windows Job Objects; see
  [packet summaries](https://github.com/morluto/rea/blob/main/docs/pcap-analysis.md).
  Select an exact DNS question for address pages; page exhaustion does not prove
  network completeness. This reads recordings and does not acquire traffic.
- Decoder discovery: `inspect_signal_decoders` searches installed decoder IDs
  or selected decoder help, including channels and options. Query and page the
  relevant details before choosing settings; this does not scan hardware.
- Recorded logic/signal traces: `decode_signal_recording` with explicit decoder,
  channel and protocol settings. On Linux with util-linux prlimit, supply sigrok-cli 0.7.2 through
  `REA_SIGROK_COMMAND`; see [recording guide](https://github.com/morluto/rea/blob/main/docs/signal-recordings.md).
  Output defaults to 50 literal lines; select annotation classes and page with
  `line_offset` / `line_limit`, or explicit null for all remaining output.
  Window counts are display lines, not annotations or samples. Preserve source digests across pages.
  This reads existing files; it does not acquire hardware signals.
- Explicit local WebAssembly artifact: `inspect_wasm_artifact`. Supply WABT 1.0.42
  through `REA_WABT_BIN_DIRECTORY`; retain exact byte/tool identity and decoded WAT.
  Select JavaScript glue and candidate paths explicitly and preserve URL/path
  ambiguity. No implicit fetch or target execution; WAT is not original source.
  See the [WASM guide](https://github.com/morluto/rea/blob/main/docs/wasm-artifacts.md).
- Explicit local Android APK (or ZIP/AAB) signing: `inspect_apk_signature`.
  Prefer its summary or selected signer/digest/lineage page; retain complete
  Evidence and use `inspect_analysis_view` kind `apk-signature` for follow-ups.
  Reports which schemes are present (v1 JAR, v2, v3, v3.1), each signer's
  certificate SHA-256 fingerprint (v1 included, from its PKCS#7 block), v3 key-rotation lineage, source stamp, and
  whether each signed digest still matches the bytes (self-consistency). This
  is identity and integrity, not a trust or authenticity verdict.
  See the [APK signature guide](https://github.com/morluto/rea/blob/main/docs/apk-signature.md).
- Explicit local EVM bytecode carrier: `inspect_evm_interface` with caller-selected
  `raw` or `hex` encoding. The owned worker deadline is `timeout_ms` (default
  30000 ms, range 1..2147483647, next call). It does not raise the fixed byte,
  address-space, or CPU allowances. Preserve carrier/decoded digests and treat selectors,
  argument strings and mutability as inferred candidates; this performs no chain
  lookup or target execution. For the complete inferred interface without hex or
  duplicate stdout, discover support and select `detail: "summary"`; complete
  Evidence stays retained under its original identity. Use the returned
  `parent_evidence_id` for exact function or `bytecode_hex`/stdout/stderr pages.
  Candidate coverage does not establish interface completeness. See the
  [EVM bytecode guide](https://github.com/morluto/rea/blob/main/docs/evm-bytecode.md).
- Embedded Go compiler, module or build-setting metadata: `inspect_go_binary`
  with the explicit local file. This built-in target-free inspection requires no
  Go installation or disassembler. Preserve raw module bytes and source ranges;
  absent metadata does not prove a binary is not Go, and unparsed text records
  remain explicit. See the
  [Go binary guide](https://github.com/morluto/rea/blob/main/docs/go-binaries.md).
- Embedded CUDA/HIP code objects: `inspect_gpu_code_objects`; inventory targets
  first, then decode selected payloads and query retained GPU Evidence.
- Bundled GGUF or safetensors model declarations: `inspect_model_artifact`
  with the explicit local file. Default header hashing leaves full-file identity
  unknown; `hash: "full"` additionally reads all weights for SHA-256. MCP returns
  retained summaries; optional `view` selects one page in the initial call. Use
  `inspect_analysis_view` kind `model-artifact` for
  batched metadata keys, tensor names or type totals, selected fields and pages.
  Preserve header-scoped indices and array preview omissions; do not infer model
  behavior from declared architecture or tensor types. See the
  [model file guide](https://github.com/morluto/rea/blob/main/docs/model-artifacts.md).
- Unity IL2CPP names, member owners and string literals from `global-metadata.dat`:
  `inspect_il2cpp_metadata` with the explicit local file; MCP defaults to compact
  counts. Query sections, images, types, methods, fields, properties, events,
  parameters or string_literals through `inspect_analysis_view`
  with the returned `parent_evidence_id`, using exact filters, batch indices and
  selected fields. Parameters accept `method_indices`, avoiding a scan of all
  parameter pages. Missing collections in historical Evidence remain unknown.
  Versions 24, 27, 29, 31 and 39; no Unity, IL2CPP
  binary or disassembler is run. Unrecognized magic (possibly encrypted) and
  other versions are unsupported. Optional matching `binary_path` enables static native addresses and type references; query `method_addresses` with indices or addresses/states, preserving every shared-body method and both artifact identities. Without a linked binary native counts remain unknown. Byte-pattern fallback is inferred; no runtime behavior or same-build pairing is proved. See the
  [IL2CPP metadata guide](https://github.com/morluto/rea/blob/main/docs/il2cpp-metadata.md).
- Embedded cargo-auditable Rust dependency metadata: `inspect_rust_binary`
  with the explicit local ELF, PE, or thin Mach-O file. This built-in
  target-free inspection requires no Rust installation or disassembler. Preserve
  package order, dependency indices, and the section file range. A missing
  `.dep-v0` section is null metadata, not proof the binary has no dependencies.
  A rustc commit hash is an inference from a read-only `/rustc/<40-hex>/` path.
  For selected crates, use `view: {collection: "packages", names: [...],
  fields: ["name", "version", "source"]}` on the first call; explicitly include
  `dependencies` for direct index references. Use `detail: "summary"` for counts
  and ranges, or retained `inspect_analysis_view` Rust package/edge pages for
  subsequent filters. Keep the complete parent Evidence accessible; CLI compact
  delivery requires `--evidence_output`.
  See the
  [Rust binary guide](https://github.com/morluto/rea/blob/main/docs/rust-binaries.md).
- PE Authenticode certificate table: `inspect_pe_certificates` with the explicit
  local PE32/PE32+ file. This built-in target-free inspection requires no
  Windows SDK. Preserve WIN_CERTIFICATE ranges, types, payload SHA-256, and
  PKCS#7 signer/X.509 identity fields, including `subject_key_identifier_hex`
  when the signer uses that form. A missing security directory is observed
  absence of that table, not proof the image is unsigned in every catalog sense.
  Signatures are not verified. See the
  [PE certificate guide](https://github.com/morluto/rea/blob/main/docs/pe-certificates.md).
- PE import and delay-load tables: `inspect_pe_imports` with the explicit
  local PE32/PE32+ file. This built-in target-free inspection requires no
  Windows SDK. Preserve DLL names, named and ordinal functions, ILT/IAT RVAs,
  delay-load descriptors, and the pefile import hash of the standard import
  table. A missing import directory is observed absence of that table, not
  proof the image never imported APIs through another table. Bound snapshots
  and loaded IAT contents remain unobserved. See the
  [PE import guide](https://github.com/morluto/rea/blob/main/docs/pe-imports.md).
- PE TLS callbacks and load configuration: `inspect_pe_load_config` with the
  explicit local PE32/PE32+ file. This built-in target-free inspection requires
  no Windows SDK. Preserve callback VAs as strings with their RVA, file offset
  and section, and the size-covered security cookie, SafeSEH, CFG,
  EH-continuation and XFG fields. Guard-flag mitigation claims are inferred
  linker declarations, not proof of enforcement. A missing directory is observed
  absence of that declaration. See the
  [PE load configuration guide](https://github.com/morluto/rea/blob/main/docs/pe-load-config.md).
- ELF note tables: `inspect_elf_notes` with the explicit local ELF32/ELF64
  file. This built-in target-free inspection requires no disassembler. Preserve
  PT_NOTE and SHT_NOTE ranges, owners, types, descriptor SHA-256, and GNU
  build-id or ABI-tag fields. A missing table is observed absence of those
  declarations, not proof the image never carried notes. See the
  [ELF notes guide](https://github.com/morluto/rea/blob/main/docs/elf-notes.md).
- Apple `.ips` crash reports: `inspect_apple_ips` with the explicit local
  file. This built-in target-free inspection requires no Xcode, atos, or
  pwntools. Preserve first-line metadata, `bug_type` as a string, process and
  exception facts, lossless integer registers, usedImages UUIDs, and
  documented classification matches. Only `bug_type` `"309"` yields a crash
  body; other types, including `"288"` stackshots, return no crash result.
  Opened Mach-O and dSYM UUID joins remain unobserved. See the
  [Apple IPS guide](https://github.com/morluto/rea/blob/main/docs/apple-ips.md).
- Linux kernel module metadata: `inspect_kernel_module` with the explicit local
  ELF32/ELF64 relocatable file. This built-in target-free inspection requires
  no Linux host or `modinfo`. Preserve `.modinfo` key order and duplicate keys,
  `__versions` CRC hex, section file ranges, and the appended signature
  trailer's PKCS#7 SHA-256. A missing section is observed absence when section
  names are known, not proof the module never carried that metadata.
  `struct module` is not decoded. The signature is not validated. gzip, xz, and
  zstd containers are unsupported; decompress into a separate file with an
  external codec utility, then inspect the decompressed `ET_REL` image. See the
  [kernel module guide](https://github.com/morluto/rea/blob/main/docs/kernel-modules.md).
- CPython 3.7–3.13 `.pyc` header, nested marshal code objects and bytecode
  identity: `inspect_python_pyc` with the explicit local file. This built-in
  target-free inspection requires no Python installation. Preserve magic,
  PEP 552 hash or mtime/size, nested names, and bytecode SHA-256. Bytecode is
  not decompiled, and a decoded header does not prove the matching `.py` is
  present. See the
  [CPython pyc guide](https://github.com/morluto/rea/blob/main/docs/python-pyc.md).
- Erlang BEAM IFF container: `inspect_erlang_beam` with the explicit local
  `.beam` file. This built-in target-free inspection requires no Erlang
  installation. Preserve chunk names, atom order, export/import/lambda tables,
  and the Code header. For selected facts, prefer `detail: "summary"` plus a
  `beam` view (collection, names/indices, fields and paging), retaining the full
  Evidence. CLI summary requires `--evidence_output`. Missing table counts stay
  null; decoded empty tables count zero. Bytecode is not executed. See the
  [Erlang BEAM guide](https://github.com/morluto/rea/blob/main/docs/erlang-beam.md).

- Explicit local SQLite database snapshot: `inspect_sqlite_database`. Inspect
  with Node.js 24.x >=24.15 or 26+ providing native SQLite limits. Read schema
  first (compact inventory by default), or select an exact ordinary table
  and `columns` when rows are needed. Defaults are selected-table schema and
  20 rows; request `schema_scope: "database"` for the complete stored schema. Preserve both database and existing sibling WAL identity; row samples
  report truncation and have unspecified order. Use a quiescent snapshot rather
  than assuming a live database/WAL pair was copied atomically. See the
  [SQLite guide](https://github.com/morluto/rea/blob/main/docs/sqlite-databases.md).
- Explicit Linux ELF file for offline layout, symbols, relocations or static
  mitigation evidence: `inspect_binary_layout`. This target-free operation uses
  caller-supplied pwntools without opening a disassembler database. Preserve its
  raw locations and inference/coverage limits; see the
  [offline binary guide](https://github.com/morluto/rea/blob/main/docs/binary-diagnostics.md).
- Supplied Linux x86-64 ELF core: `inspect_recorded_crash`. Read every recorded
  thread, raw note and source-bound register without opening a live target.
  Historical PIDs do not select live processes. Request `include_debugger_context`
  only when core-only mapping candidates help; see the
  [recorded crash guide](https://github.com/morluto/rea/blob/main/docs/recorded-crashes.md).
- PE resource type/name/language trees and static icon group references:
  `inspect_pe_resources` with an explicit path. This portable operation requires
  no active target or engine; opaque payloads retain file ranges and SHA-256.
- PE export directories and ELF dynamic-symbol exports: `inspect_native_exports`
  with an explicit path; portable, no active target or engine.
- Native executable, library, or analysis database: `open_binary`, then
  use focused analysis tools directly; call `binary_overview` when metadata or
  inventory context is useful and available from the selected provider.

For an existing IDA MCP configuration, use `open_binary` with the original
input binary and `provider_id: "ida"`; do not pass an `.idb` or `.i64` database.
The legacy attached profile binds the already-open GUI input by SHA-256 and
leaves its database open. The modern headless profile creates and closes an
owned private database without saving. Installation and registration reuse
[mrexodia/ida-pro-mcp](https://github.com/mrexodia/ida-pro-mcp); see the
[IDA provider guide](https://github.com/morluto/rea/blob/main/docs/ida-provider.md).
For migration to the separate native IDA MCP plugin, follow the guide's
[legacy attached migration](https://github.com/morluto/rea/blob/main/docs/ida-provider.md#migrate-a-legacy-attached-registration).
Replace the upstream registration explicitly; modern mrexodia tools are not the
native profile. Native attachment preserves the database but does not provide
direct callers; check session availability and the guide's verification limits.
Proceed directly to `analyze_function`, pseudocode, or function/string searches
after opening; IDA does not supply `binary_overview`. Consult session availability
when composing broader workflows. Modern direct callers and unsupported dossier
facets remain unknown; live IDA results are not replayed from snapshots.

With `REA_KUNA_COMMAND` configured, `provider_id: "kuna"` answers procedure
lists, lookups, pseudocode, assembly and `analyze_function` from Kuna's cached
whole-program export. Callers/callees use a separate body-free graph shared by
the session; `xrefs` returns exact-address incoming sites and filters forwarding
aliases. These queries and inventory lookups do not trigger a C export. Indirect
targets remain unknown and can make relationship coverage partial. Reference
caches expire on close; a fresh CLI process repeats the native reference walk.
Typed references, CFG, raw-memory tools and annotations remain unsupported. A cold first
answer can come from a single-function run (its limitations say so); assembly
waits for the export. For pseudocode and assembly, `raw_result.source` names the
cached `.c`/`.asm` file and byte span, which you may search directly instead of
calling per function. See the
[Kuna provider guide](https://github.com/morluto/rea/blob/main/docs/kuna-provider.md).

If the user says only "my app" without a name, path, or target already selected
for this task, ask which app before searching for artifacts. Paths in unrelated
saved reports and nearby test fixtures do not select the user's target. Resolve
an actual human-readable app name to one clear installed artifact when possible;
ask when matches are ambiguous. Never choose an example app on the user's behalf.

In a target-free session, use `open_binary` to bind any archive/package or
native target whose analysis tool operates on the active target. Do not call an
unadvertised tool; inspect `binary_session` with `{}` and its
`result.tool_availability` for availability reasons and remediation. Expand each
group's `names` into entries, inheriting the inventory-level client requirements
unless the group overrides them. The grouped name union is the complete tool
inventory; use `tools/list` for canonical tool schemas. The default summary keeps
each provider candidate's availability and target-support status, code and
reason; `omitted_fields` lists what it leaves out. Request `{"detail": "complete"}`
only when you need an unavailable candidate's remediation, provider
diagnostics, candidate capability sets, or tool surface, effect and annotation
flags; in those closed flag vocabularies, listed
flags are true and omitted known flags are false. Provider candidate facts
describe possible providers, while top-level session capabilities describe the
current route and `analysis_provider_binding` names the selected provider. Do
not treat those scopes as interchangeable.

For a Ghidra startup timeout on a large native target, follow
[deadline recovery](references/native-and-artifacts.md#ghidra-startup-deadline-recovery)
before abandoning deep analysis or repeating the same cold import. The default
330 seconds can be changed for new startup attempts through
`update_analysis_settings` using `ghidra.startup_timeout_ms`. Changing the
server's launch environment instead requires a new REA process.

## Work summary-first

Start with the default result and use its inline Evidence and graph context.
For a JavaScript application or ELF layout whose size is unknown or large,
call `analyze_javascript_application` or `inspect_binary_layout` with
`"detail": "summary"`, then inspect the retained `parent_evidence_id` with
`inspect_analysis_view`. Over MCP, `analyze_function` is summary-first without
a flag: its default reply is the summary, and the complete dossier stays
retained under `parent_evidence_id` for facet paging. Pass that ID as a
`retained-evidence` reference to `compare_functions`, or inside
`match_native_functions` `left_observations`/`right_observations` or
`build_call_path.functions`; request `"detail": "complete"` only when the
dossier must travel inline.
Use the same exact-reference form in other advertised logical Evidence inputs,
including optional sources, arrays and nested sources across domains. Each
source can independently be inline or retained; preserve its source identity,
coverage, partial facts and unknowns. A summary or inspection page has its own
Evidence ID: use `normalized_result.parent_evidence_id` when the consumer needs
the complete source. For portable CLI follow-ups, commands advertising
`--evidence-bundle` resolve references from that selected exported bundle.
See [Evidence composition](references/evidence-workflows.md) for scope and
recovery; file selectors are supported only where explicitly advertised.
Page module identities and select the returned `node_id` before requesting an
item; a single file path can represent several graph roles. Do not repeat an
identical analysis or rejected call without a changed input or resolved blocker.
Recheck session state when a lifecycle change makes that status useful.
Make a focused follow-up only when the
returned result leaves a specific question unanswered.

If MCP reports `resource_constraint` with `details.resource: "transport"`, call
`inspect_analysis_view` with its reported same-session Evidence reference for a
summary, one section/module, or a stable page. Use `trace_application_feature`
once a seed is known, or call `export_evidence_bundle` to write the complete
session to a selected path. The analysis remains complete in the ledger; avoid
repeating it merely to request the same oversized response. Complete CLI JSON
output also streams without a single MCP frame.

When the retained parent ID is unknown, use `get_evidence_bundle` with
`detail: "summary"` and exact filters for operation, target SHA-256,
analysis-profile digest or canonical procedure address. Select its returned
Evidence ID for the next view instead of requesting the complete bundle. When
that record has no supported view (for example an annotation), read it with
`detail: "records"` and an `evidence_id` filter; `missing_evidence_links`
names linked sources this session does not retain.
`retention: "complete-record"` means the whole record is stored; native
value-flow truncation and unknown metadata remain separate. For an exported
portable bundle, use `rea inspect-evidence-bundle` with JSON containing `path`,
`detail: "summary"` and the same `filters`. Reading that file still requires
validating its full contents within the local memory budget.

A client can also truncate a successful tool result without a REA transport
error. Treat that preview as incomplete; use the retained parent ID for smaller
views or export when the full record is needed. Do not parse the preview as
canonical JSON or repeat the producer. For JavaScript, read the
[module-view and trace recipes](references/javascript-applications.md) before
drilling into a large graph; a broad bidirectional trace can expand unrelated
containment relationships even after summary analysis.

Every conclusion must distinguish observations, inferences, and unknowns. Cite
Evidence IDs, preserve limitations and incomplete coverage, and never imply
that static analysis observed execution. Runtime requests execute the declared
target and lifecycle; do not broaden the target or action beyond those fields.

Within the user's requested investigation, call available analysis tools
directly. REA does not require permission grants or per-call approval flags.
The agent client can independently require approval. Follow the declared request
scope and the host's actual access requirements; use the recovery guide for an
observed client-policy rejection.

## Plan broader investigations

For requests that span multiple features or subsystems, use a staged workflow:

1. Turn the request into a checklist of questions and the evidence each answer
   needs. Resolve target identity and constraints from the conversation and
   workspace before asking for information again.
2. Inspect the current REA session, artifact identity, saved analysis database,
   bookmarks, and prior evidence. Reuse matching state; do not open duplicate
   sessions or repeat identical analysis.
3. Start with the smallest useful overview or inventory. Follow each question
   from its entry point through relevant data and state changes to its result.
   Batch related operations around a specific hypothesis, then expand only when
   the returned evidence leaves a concrete gap.
4. Inspect relevant packaged resources and configuration alongside code when
   they affect the question. Use format-aware inventory and parsers; do not
   infer behavior from filenames, strings, or layout alone.
5. Corroborate a conclusion with the evidence type it requires. Use runtime
   observation only when static evidence cannot answer the question and the
   required host runtime and OS access are available. For JavaScript behavior,
   run probes against the actual app through the available browser, Electron,
   or process capture workflow.
6. Decompose work into independent questions. When parallel workers are
   available and the questions do not depend on one another, assign distinct
   scopes, point workers to existing evidence, and ask them to return sources,
   conclusions, and unresolved gaps. Otherwise, work sequentially.
7. Keep a concise finding ledger linking each conclusion to Evidence IDs,
   confidence/evidence type, search boundary, and remaining unknowns. Update
   the shared index or investigation report so later passes can reuse results.

Before finishing, revisit the original checklist. Mark each question as
answered, partially answered, or unresolved based on its evidence; keep
bounded negative searches bounded, and do not describe a broad investigation
as complete while required questions remain open.

## Read only the relevant guide

- Native binaries, managed assemblies, archives, and extraction:
  [references/native-and-artifacts.md](references/native-and-artifacts.md)
- ASARs, extracted JavaScript, feature tracing, and version comparison:
  [references/javascript-applications.md](references/javascript-applications.md)
- Android APK declarations, classes, methods, and static references:
  [references/android-applications.md](references/android-applications.md)
- Native instrumentation, debugger and process capture; browser/Electron
  observation; static/runtime comparison:
  [references/runtime-observation.md](references/runtime-observation.md)
- Evidence paging, comparisons, residual unknowns, and verification:
  [references/evidence-workflows.md](references/evidence-workflows.md)
- Agent environments (AgentEnv bundles) of a web application, recorded from
  a live instance or a HAR:
  [references/environments.md](references/environments.md)

## Finish the task

Explain findings in plain language and tie them to returned evidence. When the
user asks to build something, use normal coding tools and separate observed
behavior from design choices. Close an opened native session with
`close_binary` when its engine is no longer needed. Evidence references and Unknown
history remain in memory on the same MCP connection. End the investigation with
`reset_investigation`; supply `save_path` to checkpoint the complete bundle before
clearing. Import the saved bundle to restore original references and Unknown
history in a new process. Retention is bounded and is not automatic persistence.

<!-- /vendor-file -->

<!-- vendor-file: reverse-engineer-anything/references/android-applications.md -->
# Android application artifacts

Use the connected server's advertised Android tools. Repository main and npm
4.1.0 include this family. A skill installation alone cannot add it to an
older server.

Start with `inspect_android_package` on the caller's APK path for package
identity, manifest declarations, coverage, and inline Evidence. Use
`search_android_classes` to find candidates, `inspect_android_class` for one
class's members, `inspect_android_method` for decompilation, and
`trace_android_references` for incoming static references. Each call takes its
own APK path and explicit selectors; do not open a native session first.
Choose an `overload_index` from the class inventory when methods are ambiguous
instead of guessing.

For JNI implementations, discover `inspect_android_jni_bindings`. Select raw
DEX class/method identities and optional descriptors, ABI or logical library
paths. Prefer `detail: "summary"`; complete Evidence remains retained and
`android-jni` views page declarations, libraries, candidates or binding rows
with exact fields. Global native-pair ambiguity survives class selection.
Preserve slot/relocation provenance and source coverage: matched means observed
candidate presence; partial scans do not establish uniqueness or absence.
This reads DEX/ELF bytes without loading the APK into the decompiler or executing
target code. Runtime registration and loading remain unknown. See the
[JNI guide](https://github.com/morluto/rea/blob/main/docs/android-analysis.md#link-native-declarations-to-jni-candidates).

For an R8/ProGuard release build with its `mapping.txt`, pass the absolute
`mapping_path` to `inspect_android_class` or `inspect_android_method`. Prefer
`detail: "summary"` to receive normalized symbols or the selected body without
duplicate raw class metadata. Complete Evidence stays retained under the linked
parent ID and can be exported; CLI summary delivery requires `--evidence_output`.
Omitted or complete detail preserves the full inline response. Keep
selecting by observed names; the separate `mapping` block reports each symbol
as `mapped`, `ambiguous` or `unmapped` after checking DEX types and prototypes.
REA does not verify that the mapping belongs to the APK build.

The provider requires a separately supplied headless JADX MCP JAR 0.7.1 and
Java 17 or newer. `REA_JADX_MCP_JAR` selects the absolute JAR path; `JAVA_HOME`
can select Java. Use `rea doctor --provider jadx --json` to check the JADX
configuration and obtain remediation for missing prerequisites. Java and the
headless JADX MCP JAR remain caller-supplied; REA setup does not install or
configure them. Configuration readiness does not establish successful analysis
of a particular APK.

Linux and macOS use the POSIX owned-process boundary. Windows x64 requires the
matching bundled native controls and uses an owned Job Object with bidirectional
stdio. A full JDK, including `jdk.compiler`, is required on every host; Windows
`JAVA_HOME` selects `bin\java.exe`. Consult the Android guide for actual host
verification coverage. Calls use one worker and provider deadlines; optional
`REA_JADX_HEAP_MIB` selects the JVM heap and `REA_JADX_OPERATION_TIMEOUT_MS`
the per-operation deadline (integer milliseconds from 1 to 2147483647, default
120000). To change that deadline on a running MCP server, set
`jadx.operation_timeout_ms` through `update_analysis_settings`, then retry after
work and cleanup settle. Newly accepted operations use the override; accepted
work keeps its budget. Changing the launch environment requires a new process.
The MCP client's tool timeout must also allow the selected deadline. The APK is never launched,
and no emulator is required.

Manifest entries and decompiled text are static observations, not execution or
policy enforcement. Incoming references are recovered static relationships;
reflection, dynamic loading, and unresolved calls remain unknown. Preserve
artifact digests, locations, diagnostics, and incomplete coverage. For archive
members rather than code analysis, use `open_binary` and `inspect_artifact`.

<!-- /vendor-file -->

<!-- vendor-file: reverse-engineer-anything/references/connection-and-recovery.md -->
# Connection and task recovery

Read this guide only for an observed connection, command, approval or provider
blocker. Keep the user's target and question in view. Explain what prevented the
operation and the next useful step; after repair, continue the investigation.

Commands below use an installed `rea`. If none is available, use the package
invocation in `SKILL.md` when acquiring REA is authorized. Follow the connected
server's schemas and the installed CLI's help rather than assuming repository
main and an older release expose the same arguments. Tool-name prefixes belong
to the client: find the canonical REA operation in its actual tool listing and
server association before concluding that it is absent. A shared prefix alone
does not establish which server an approval wildcard covers. See
[client tool names and discovery](https://github.com/morluto/rea/blob/main/docs/client-configuration.md#client-tool-names-and-discovery).

## Choose the remedy from the observed failure

| Observation                                                     | Meaning and next step                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No REA tools in the active session                              | If REA was installed as a client plugin, follow the plugin section below. Otherwise inspect registration with `rea doctor --client codex --json`. A skill installation alone does not register MCP.                                                                                                                                                                                                                                                                                                                                                                                     |
| Missing, malformed or stale registration                        | Prepare a scoped setup plan; apply only authorized changes with backups.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Aligned registration, but no connected tools                    | Restart/reconnect the client. Doctor checks registration; it cannot establish the current agent's connection. Inspect the client's launch error if reconnection fails.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| MCP connection dropped or REA could not start                   | If the connection drops, retry that call once only when it is safe to repeat or known not to have started. If it may already have changed the target, or the same failure returns, tell the user REA's connection failed and ask them to restart the MCP client. If REA could not start its connection, retry once, then tell the user and ask them to restart the MCP client. Do not retry a startup failure that returns the same unchanged result. Run `rea doctor` when REA could not start or tools stay missing after restart. Doctor cannot restore a live connection by itself. |
| `MCP tool call requires approval, but approval policy is never` | Codex rejected the call before REA executed it. Do not install an engine or repeat setup to solve this client-policy decision. See the approval section below.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| REA returns `provider_unavailable` or an unavailable tool entry | Read that operation's provider diagnostics or `binary_session.result.tool_availability`. Expand each group's tool names and inherit the shared client requirements unless overridden. Use the operation's availability, reason, and remediation; a complete tool catalog does not imply every operation is available. Request `{"detail": "complete"}` only for provider diagnostics.                                                                                                                                                                                                   |
| `rea` is missing in a child shell, or Node is incompatible      | Inspect the actual shell PATH and launcher/runtime. A prefix installation may be absent from a login shell's PATH; this does not establish a broken MCP registration.                                                                                                                                                                                                                                                                                                                                                                                                                   |

If the client cannot launch its shell/sandbox helper or read the installed skill,
inspect its launch diagnostic. For example, Codex can refuse helper aliases when
CODEX_HOME is under `/tmp`; use an authorized profile outside the OS temporary
directory. REA setup cannot repair the client's executor. Preserve the sandbox
instead of silently disabling it to make an analysis command work.

Static JavaScript and ordinary ZIP inventory need neither Hopper nor Ghidra.
HAR inspection is offline and does not require a live browser. Native
decompilation, Android analysis and firmware extraction have their own
bring-your-own prerequisites. Use supported inventory/static evidence when it
answers part of the question, and name the unavailable evidence separately.
Do not substitute another target. Label observations from ordinary shell tools
as such; only actual REA output supplies REA Evidence.

## Distinguish client and server deadlines

A host message such as `timed out awaiting tools/call` with no REA result means
the client's deadline expired before a result arrived. It does not establish
that REA finished, canceled successfully, or released all resources. Do not
repeat the unchanged analysis. Inspect available session/provider state and
retained Evidence only when useful; an idle `binary_session` is not proof that
every target-free operation stopped. Never invent a missing Evidence reference.

Allow the host tool deadline to cover execution, cancellation/cleanup, and
response delivery. In Codex, the setting is
`mcp_servers.<server-id>.tool_timeout_sec` in **seconds**, not
`startup_timeout_sec`. Select a value for the actual operation budget and
headroom, not a universal timeout. See the
[official MCP configuration reference](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
Apply configuration changes only within the authorized scope, preserving
unrelated entries and backups; reconnect/restart as required by the host.
When configuration is not editable, report the setting needed or use an
authorized CLI fallback. Do not silently broaden permissions or switch targets.

A returned REA `provider_timeout` instead means the **server/provider** reached
its deadline. Follow its `remediation.action`, reuse accessible partial Evidence,
and resolve reported incomplete cleanup before retrying. Change a request
field or a `REA_*` setting only when the returned remediation explicitly
recommends that change. Restart REA when that text says the value is read at
startup. A mention that a control does not raise the deadline is not a
recommendation to change it. Do not invent a setting the remediation does not
name. Raising only the client deadline does not change
this server budget. For static JavaScript,
`analysis_timeout_ms` (CLI `rea analyze-javascript-application <path>
--analysis-timeout-ms <milliseconds>`) controls each source's
startup, analysis and transfer deadline in **milliseconds**. Increase that
budget or reduce semantic work / select exact inventoried `source_paths` when
the task permits. Omit `source_paths` for all sources; `[]` is invalid.
`detail: "summary"` reduces delivery, not analysis work. A per-source budget
does not bound the elapsed time for an entire multi-source application.
Partial-Evidence inspection can avoid recomputation; an unavailable reader is
not itself a reason to block a corrected static-analysis retry.
The shorthand `rea analyze <path>` does not expose this timeout flag; use the
explicit JavaScript command when changing that budget.

For invalid arguments, use the connected tool's current input schema, or the
installed CLI's command help. Refresh the catalog if stale; do not guess fields
from an older skill or return the entire catalog to repair one field. Correct
all reported fields before retrying.

## Recovery ladder

Follow the returned remediation. Change a request field or a `REA_*` setting
only when that text explicitly recommends the change. Restart REA when it says
the value is read at startup. A mention that a control does not raise a limit
is not a recommendation to change it. Do not invent a setting. Host memory and
`NODE_OPTIONS` do not raise a REA admission unless that remediation says so.

- MCP connection dropped: retry that call once only when it is safe to repeat
  or known not to have started. If it may already have changed the target, or
  it fails again, tell the user REA's connection failed and ask them to restart
  the MCP client. Do not run `rea doctor` for the drop itself.
- REA could not start its connection: retry once, then tell the user and ask
  them to restart the MCP client. Run `rea doctor` when REA could not start or
  tools stay missing after that restart. Do not retry a startup failure that
  returns the same unchanged result.
- `cleanup_incomplete`, or retained cleanup owners in the error details: retry
  that exact cleanup owner. Do not start new work that needs those resources
  until that owner confirms release. Repeating the original call is not that
  retry.
- Capacity, when the result is `resource_constraint` and `retryable` is true:
  wait for the active admission to finish, then retry within the reported
  limits. Do not restart REA to free the slot.
- `configuration_invalid`: correct the named setting in the environment that
  starts REA (the shell or the MCP registration), then restart REA. Run
  `rea doctor` to see the `runtime-configuration:` check. Re-run `rea setup`
  for that client when the registration must carry the new setting, then
  reconnect.
- `invalid_request`: correct the reported fields from the current schema. Do
  not repeat the unchanged call.

## REA installed as a client plugin

A Claude Code or Codex plugin owns its `rea` server and this skill. Doctor's
`--client` and `--skill` checks and `rea setup` read and write only
setup-owned state, so for a plugin-only install they report `missing`, and
applying setup would add a second `rea` server. If this skill was loaded from
a plugin, or the client lists a `rea` plugin, do not prepare a setup plan for
missing tools. Instead:

- Check that the plugin is installed and enabled with the client's own
  listing: `claude plugin list` and `/mcp` in Claude Code, `codex plugin list`
  in Codex.
- Restart or reconnect the client, then read its launch error for the `rea`
  server if tools are still absent. The plugin starts its bundled runtime; a missing build or version mismatch
  requires a reinstall, or a fresh build when developing from source.
- Check analysis engines through the connected server's
  `binary_session.result.tool_availability`. `rea doctor --provider <id> --json`
  from a shell reports that shell's environment, which can differ from the
  environment the client gave the plugin server. If you still run it through
  the package runner, use the version pinned in the plugin manifest's server
  entry (`rea-agents@<version>`), not `@latest`, so it matches the server the
  plugin starts.

Use the setup repair below only when the user wants a setup-owned registration
instead of the plugin, and remove or disable the plugin first.

## Repair registration when needed

For Codex:

```bash
rea doctor --client codex --json
rea setup --client codex --dry-run --json
```

Use the current supported client's ID: `claude_code`, `claude_desktop`, `codex`,
`cursor`, `gemini_cli`, `windsurf`, `devin`, `opencode`, `antigravity`,
`copilot_cli`, `commandcode`, `qwen_code`, `vscode`, `trae`, `grok_build`, `omp`, `pi`,
`hermes`, `qoder`, `droid`, `zcode`, `dsh`, `freebuff`, or `grok_bot`. If unknown, inspect `doctor --json` before choosing a
scope. `grok_bot` uses a chat registration step rather than local `mcp.json`.
For unsupported clients, use manual stdio registration with the selected
installation’s absolute runtime and entry script, or continue through the CLI.
Acquire packages from a trusted directory outside the target project. Keep a
package-runner installation and its runtime available while registrations use it.

Show the plan's exact paths, backups, changes and bundled-skill replacement.
Obtain approval for writes when that concrete scope is not already authorized,
then apply the same scope with `rea setup --client codex --yes`. Add
`--install-hopper` only when separately needed and explicitly approved. Do not
install or upgrade unrelated prerequisites. Restart/reconnect, verify tools
actually appear, and resume the original task. If they remain absent, inspect
the launch failure rather than looping through setup.

## Codex tool approval is separate from REA readiness

REA tools have no permission-grant handshake. Codex can still require approval
because an operation creates owned resources, launches a helper or has cleanup
effects. An advertised tool or successful doctor result does not override that
client policy. `workspace-write` alone does not resolve an MCP approval
rejection, and `approval_policy = "never"` does not mean every MCP tool is
preapproved.

When interactive approval is available, use the client's approval flow for the
requested operation. In an unattended run, continue through an authorized CLI
workflow if the execution environment permits it, or report the blocked
operation and the approval needed to proceed. Do not retry the same rejected
call, silently broaden approvals, or rewrite MCP effects as read-only.

For an operator who explicitly wants to preapprove named operations in a
disposable Codex profile, current Codex supports per-tool configuration. For
example, opening and closing an analysis session can be scoped independently:

```toml
[mcp_servers.rea.tools.open_binary]
approval_mode = "approve"

[mcp_servers.rea.tools.close_binary]
approval_mode = "approve"
```

Use the actual server ID and only the operations whose effects were approved;
this example does not approve inspection, extraction or runtime execution.
Show the proposed config edit and preserve unrelated entries and backups before
writing. Managed policy can constrain client settings. Consult the
[Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
for the installed client's supported settings. This is an optional recovery
choice, not a prerequisite for every REA task.

## Repair an editable REA limit

If `details.limit` names an editable setting and its bounds, call
`update_analysis_settings` directly with a `changes` entry containing `setting`,
`action: "set"` and `value`. `inspect_analysis_settings` is optional when those
facts are already present. Retry the same input after work and cleanup settle.
Runtime defaults affect new work only; explicit per-call arguments take
precedence and must be corrected directly when selected. Reset restores launch
values. Updates survive target close/open but disappear on REA restart. They do
not edit host deadlines, response buffers, registrations or fixed limits.

## Continue through an installed CLI

Check the command environment only if the launcher fails:

```bash
command -v rea
command -v node
node --version
rea --version
```

Use the public launcher at its known installation path with a supported existing
Node on PATH when the child shell loses a prefix installation. Avoid internal
`dist/cli.js` entrypoints or global toolchain changes. MCP may have its own valid
launcher even when a shell cannot resolve `rea`.

For a user-supplied JavaScript tree or ASAR, select output files in the authorized
workspace and save complete Evidence before reading a view:

```bash
rea analyze-javascript-application /absolute/path/to/app --json > app-evidence.json
jq -c '{source: {kind: "inline", evidence: .}, view: {kind: "summary"}}' app-evidence.json > app-view.json
rea inspect-analysis-view app-view.json
```

These commands do not register MCP or install an analysis engine. CLI JavaScript
JSON is complete and can be very large; redirect it rather than loading it into
context. Use an existing JSON processor if `jq` is absent, without installing
one just for this recipe. Inspect a module page or item using the same inline
source and the [JavaScript recipes](javascript-applications.md). Preserve graph
coverage, limitations and unknowns. Native CLI analysis still requires its
selected engine, and all CLI operations retain the host's execution permissions.

<!-- /vendor-file -->

<!-- vendor-file: reverse-engineer-anything/references/environments.md -->
# Agent environments from a live application

Use this when the user asks for an agent environment (an AgentEnv bundle) of a
web application: a folder `agent-env` deploys, whose MCP tools answer from what
one recording of the application observed and serve the writes that recording
confirmed. The workflow records the application once with
`capture_browser_scenario`, checks what the environment would serve, records
again if a hint names a gap, then writes the bundle with
`export_environment_bundle`. For a HAR the user already has, skip to
[export](#export-and-hand-off) through `inspect_web_network_capture`, or use
`rea environment-build <capture.har> <dir>`.

## Before recording

- Record only against an instance the user says is disposable or seeded for
  this purpose: every write step creates, edits or deletes its data. If the
  user has not said so, ask before any scenario that writes. REA does not
  start, seed or reset applications.
- Credentials come from environment variables the user names. Declare each as a
  scenario secret, `{secret_id, environment_variable}`; the variable must be set
  in the environment REA's MCP server started with. Never ask for a password in
  chat. Declared secrets are redacted as the capture records.
- Map the application first with `inspect_web_page` (and `capture_web_screenshot`
  when layout matters): the login form's locators, and the API calls behind the
  pages that list and edit the entities the user asked about.
- `inspect_web_page` cannot sign in. To see pages behind sign-in, run a short
  `capture_browser_scenario` that signs in and opens them, with
  `"capture": {"after_each_step": ["accessibility"]}` (`"dom"` for markup).
  Read a step's tree with `inspect_analysis_view`, `view: {kind:
  "browser-scenario", collection: "text", step_index, artifact:
  "accessibility", offset: 0, limit: 2048}`, paging with `offset`. Capture
  options are only `after_each_step`, `at_end`, `events`, `network` and
  `limits`.

## Record a session an environment can learn writes from

One `capture_browser_scenario` records the whole session. Start from this
shape, with the application's own locators, paths and headers:

```json
{
  "browser": { "mode": "launch", "executable_path": "/usr/bin/chromium" },
  "start_url": { "url": "http://127.0.0.1:3000/login" },
  "secrets": [
    { "secret_id": "admin_password", "environment_variable": "APP_PASSWORD" }
  ],
  "capture": {
    "network": {
      "request_body": true,
      "response_body": true,
      "header_values": true
    }
  },
  "actions": [
    {
      "step_id": "user",
      "action": "fill",
      "timeout_ms": 15000,
      "locator": { "kind": "css", "selector": "input[name=username]" },
      "value": { "source": "literal", "value": "admin" }
    },
    {
      "step_id": "password",
      "action": "fill",
      "timeout_ms": 15000,
      "locator": { "kind": "css", "selector": "input[name=password]" },
      "value": { "source": "secret", "secret_id": "admin_password" }
    },
    {
      "step_id": "sign-in",
      "action": "press",
      "timeout_ms": 15000,
      "locator": { "kind": "css", "selector": "input[name=password]" },
      "key": "Enter"
    },
    {
      "step_id": "signed-in",
      "action": "wait_for",
      "timeout_ms": 15000,
      "locator": { "kind": "css", "selector": "nav a[href='/settings']" },
      "state": "visible"
    },
    {
      "step_id": "folders-1",
      "action": "request",
      "timeout_ms": 15000,
      "method": "GET",
      "path": "/api/folders",
      "expected_status": [200]
    },
    {
      "step_id": "new-folder-1",
      "action": "click",
      "timeout_ms": 15000,
      "locator": { "kind": "role", "role": "button", "name": "New folder" }
    },
    {
      "step_id": "folder-title-1",
      "action": "fill",
      "timeout_ms": 15000,
      "locator": { "kind": "css", "selector": "input[name=title]" },
      "value": { "source": "literal", "value": "Scratch folder 1" }
    },
    {
      "step_id": "create-folder-1",
      "action": "click",
      "timeout_ms": 15000,
      "locator": { "kind": "role", "role": "button", "name": "Create" },
      "save_response": {
        "method": "POST",
        "path": "/api/folders",
        "save": [{ "name": "folder_1", "json_pointer": "/id" }]
      }
    },
    {
      "step_id": "read-folder-1",
      "action": "request",
      "timeout_ms": 15000,
      "method": "GET",
      "path": "/api/folders/{saved:folder_1}",
      "expected_status": [200]
    }
  ]
}
```

Give each step that accepts `timeout_ms` a deadline. Without one, a step waits
until it completes or the scenario is cancelled, so a locator that never
matches hangs the capture and the client with it. The `wait_for_timeout` pause
instead uses `duration_ms` and does not accept `timeout_ms`. Match `wait_for`
locators to exactly one element.

1. Sign in through the UI: `fill` the user and password fields (the password
   as a secret reference), submit, then `wait_for` an element only a signed-in
   user sees.
2. Read with `request` steps: each collection the environment needs, twice
   before any write, so fields that change on their own show up; then each
   object a list shows by id, up to ten per collection. An object known only
   from a list that leaves out fields its own read shows cannot be read by id
   or updated in the environment.
3. Write the way the application's UI does: fill its forms and click its
   buttons, so each request carries the fields the UI sends, including ones
   the server would otherwise derive. Give the click or key press that submits
   a create `save_response` to keep the new object's ID, then `goto` its page
   (`/items/{saved:item_1}`) or read it with a `request` step. Never guess an
   ID, and never create a probe object to learn the next one. Write with
   `request` steps instead only when the UI cannot reach the operation (an
   API-only resource, or a UI that does not call the JSON API), or when coverage
   withholds the UI-shaped write as `unexplained-change` or `contradicted`;
   that counts as one of the two re-recordings. A `request` step write that
   coverage withholds that way usually lacks fields the UI sends: record it
   through the UI instead. If a journey cannot be scripted, leave the write
   unserved and report the limitation.
   Record two numbered scratch objects per write type,
   with varied free text. After each write, and before the next one, read the
   object back by id and then its list: create 1, read 1, list, create 2,
   read 2, list; never several writes before their reads.
4. Leave more than a second between two creates and between a create and its
   first edit (`wait_for_timeout` with `duration_ms: 1100`), so lists sorted
   by creation time show them in order.
5. Update both objects and read each back, changing the fields a person
   would change (a name, an email address, a status, a due date) rather than
   only a description: a served update accepts only the members a recorded
   update stored. Run an action that turns something on or off (star,
   bookmark, archive) twice in a row on one object, reading it back after
   each: the second call shows whether it sets or flips the field, and the
   environment serves the action only once a call has shown it. Delete both
   and read each back (expect 404, or the object marked deleted) and the list.
6. Vary what the two creates send, however you write them: the first every
   field the application takes, the second only what a person must give (its
   title or name), with the other fields left out or empty. A served create
   requires each member both creates filled in and lets a caller leave out one
   a create left out or sent empty, so an agent that names only a title is not
   refused for fields it had no reason to set.

About `request` steps:

- `path` is on the start URL's origin; the page must be on that origin.
- Header values are literals, declared secrets, a cookie the browser holds
  (`{source: "cookie", name}`), a local storage entry
  (`{source: "local_storage", key, json_pointer}`), a saved value
  (`{source: "saved", name}`), or Basic credentials
  (`{source: "basic_credentials", parts: [username, password]}`, sent as the
  base64 of `username:password` and redacted), with an optional `prefix` such as
  `"Bearer "` or `"Basic "`. Each credential part is a literal, secret, saved
  value, cookie or local storage entry, so a header the frontend builds from a
  login token (the username and the token) can be copied too; the password is
  a secret or saved value, never a literal. Copy the
  headers the application's own requests send (a CSRF header such as
  `X-CSRFToken` from the `csrftoken` cookie, a bearer token). Values read from the page are redacted from records made after they
  are read, not from the login response that returned them, and values
  shorter than 8 characters are not redacted at all.
- `save: [{name, json_pointer, secret}]` keeps a string or number from the
  step's JSON response, such as the created object's `/id`, for later steps;
  `secret: true` redacts it, as for a token the API returns, so mark every
  saved token, key or session value secret. This also protects the selected
  source response before its body or headers are retained. Compressed or
  unknown-size UI responses cannot supply saved values. On a `click` or `press`,
  `save_response: {method, path, save}` keeps values from the response to the
  new request observed while the step waits (`{*}` in `path` matches one segment).
  Matching does not prove UI causality: choose a path distinct from polling;
  multiple observed matches fail as ambiguous. The step
  fails unless a 2xx JSON response arrives before its `timeout_ms`. Later
  steps send a saved value as `{saved:name}` in a request `path` (and its
  query) or a `goto` URL; in the `json` body, where a string that is only
  `{saved:name}` keeps the saved JSON type; or as `{source: "saved", name}` in
  a header or credential part.
- Reading a page value makes later bodies costlier to keep: after a CSRF
  token, bodies over about 47 KiB are kept as `unavailable`. When the API
  returns larger responses, raise `capture.limits`
  (`max_network_body_allocation_bytes`, `max_total_event_allocation_bytes`).
- Request steps follow no redirects: a redirect fails the step, and
  `expected_status` cannot name a 3xx status. Use the path the redirect names,
  such as the one with the trailing slash.
- Set `expected_status` on every step, so a refused call fails its step and
  the later steps report not having run, instead of recording read-backs of
  nothing.

Keep it to about 60 to 160 requests. A scenario with no `request` step is
recorded exactly as before.

The capture returns its whole Evidence, every recorded body included, which is
often more than a client shows inline. Before checking coverage, confirm that
every entry of `normalized_result.steps` has `status: "completed"`; if the
client saved the result to a file, search it for `"status":"failed"` and read
that step's `error`. A failed sign-in or write cancels every step after it.
Use the result's `evidence_id` for coverage and export; do not paste the
Evidence back into another tool.

## Check coverage

`inspect_analysis_view` with `source: {kind: "retained-evidence",
evidence_id}` (the capture's id) and `view: {kind: "environment-coverage",
template_rules: ["after-uid-literal", "opaque-token", "sibling-variance",
"prefix-variance"]}`. It reports read tools
answered from the state or replayed (`reads.recorded_reasons`), the served write
tools, and each withheld write with its `reason` and `hint`. It does not apply
the serve-time catalog and state size checks; the export reports those.

Re-record a withheld write at most twice, and only for a recording gap. Stop at
once when the reason is application behaviour, and report the write as
withheld with its hint:

| Reason                | What to do                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `no-state-target`     | Check the path template and recorded views; record missing reads. The route form may not be supported as a mutation target. |
| `no-observation`      | Re-record: read the entity back by id after the write; read it first for an update or delete.                               |
| `unconfirmed`         | Re-record: read the entity and its list after the write.                                                                    |
| `incomplete-entities` | Re-record: read the entity through every view that lists it.                                                                |
| `unexplained-change`  | Re-record once with a second, different call of the same write.                                                             |
| `no-call`             | Re-record once with a write that succeeds.                                                                                  |
| `side-effect`         | Stop: the application changes other entities.                                                                               |
| `contradicted`        | Stop: a later read disagrees with the modelled effect.                                                                      |
| `body-unusable`       | Re-record a UI write once with `request` steps (its body was not exposed); else stop.                                       |

Use new scratch names on each attempt, and delete what an earlier attempt
created before recording again (through the UI, or a `request` step with the
id that capture shows): the environment starts from what the recording first
reads, so a leftover object becomes seeded data that write tasks then find.
New browser scenario captures include request times, so a fully timed capture
can learn a write clock and serve updates that stamp modification times. Older
captures or ones missing a request start keep record order and learn no clock.
When coverage reports that limitation, record again with the current version
before concluding that the timestamp change cannot be served.

## Export and hand off

`export_environment_bundle` with `source: {kind: "retained-evidence",
evidence_id}` (or `{kind: "evidence-file", path}`), an absolute
`output_directory` that does not exist yet and whose parent does, and a `name`
(required when the application runs on `localhost` or an IP address). It returns
the coverage again, `tool_count`, the written files and warnings; `dry_run:
true` reports without writing. The bundle installs `rea-agents` of this REA's
version from the registry; when the user runs an unreleased REA build, pass the
`package_tarball` they give you (a packed `rea-agents` tarball) instead.

Tell the user how many tools answer from the state, which writes are served and
which are withheld and why, and the run command (`agent-env run <folder>`). Say
that the bundle ships the recorded responses and the capture's local paths
(for a browser scenario, the browser executable's path), and
list any `credential-named-members` warning pointers for review. Never publish
or share the bundle yourself.

See
[agent environments](https://github.com/morluto/rea/blob/main/docs/agent-environments.md)
for what the state, replay and the bundle establish, and
[evidence workflows](evidence-workflows.md) for the manifest and state views.

<!-- /vendor-file -->

<!-- vendor-file: reverse-engineer-anything/references/evidence-workflows.md -->
# Evidence, comparison, and verification workflows

Evidence-producing tools return the complete Evidence record directly in MCP
`structuredContent` and CLI JSON. Read `normalized_result` for operation data,
and cite `evidence_id` when another tool or your explanation needs a stable
reference. Preserve authority, limitations, coverage, and residual unknowns. If a result
is incomplete or paginated, continue only when the remaining data matters to
the task; do not fetch a bundle or resource merely to read a result already
returned inline. When complete `inspect_binary_layout` or
`analyze_javascript_application` Evidence is already retained, call
`inspect_analysis_view` for a summary, one section/symbol/module, or a stable
page instead of repeating the producer.

For any logical Evidence source that advertises retained references, pass
`{kind: "retained-evidence", evidence_id}` instead of copying the complete
record back into a call. The same contract covers individual, optional, array
and nested sources across native, process, JavaScript, managed, mobile and WASM
workflows. Sources can independently mix inline records and exact references.
Resolution preserves the source's identity, provenance, coverage, partial facts
and unknowns; it neither reruns analysis nor makes incomplete facts complete.
Keep domain role and identity requirements: a native dossier cannot substitute
for a managed member observation, for example.

When starting from a summary or inspection page, use its
`normalized_result.parent_evidence_id` to reference the complete source.
The view's own `evidence_id` names
only that view. `compare_artifacts` explicitly supports artifact summary inputs
and resolves their parents; do not assume every consumer does. When a workflow
follows source links, keep those linked records available too.

MCP references belong to the current connection's ledger. If the ID is known,
pass it directly; no discovery call or provider setup is needed. If it is missing,
import the exported bundle or supply complete inline Evidence. Do not retry an
unchanged reference or rerun a producer merely to move an existing record.
Export before closing the session when the source must survive it. For CLI JSON
workflows that advertise `--evidence-bundle`, the same reference JSON resolves
against one explicitly selected authenticated bundle:

```bash
rea trace-application-feature request.json --evidence-bundle /absolute/path/evidence.json --json
```

This includes JavaScript traces/comparisons and runtime reconciliation, managed
reconstruction/native verification/graph projection, Android/Apple/Harmony graph
projection, WASM interface comparison and retained analysis views. The managed
member comparison CLI still takes two assembly paths; process comparison takes
two capture Evidence JSON paths. Check command help for the installed version.
An input bundle grants no implicit file lookup: `evidence-file` and historical
graph file selectors are accepted only by contracts advertising them. See the
[CLI reuse guide](https://github.com/morluto/rea/blob/main/docs/cli.md#import-export-and-compare-evidence).

Completed `inspect_artifact` inventory also supports a summary and
`view: {kind: "inventory", collection: "occurrences", logical_paths: ["package.json", "main.js"]}`.
Omit `logical_paths` to page all available occurrences; `[]` selects none.
Other inventory collections are `nodes`, `edges` and
`integrity_contradictions`. Keep `source_complete` separate from page exhaustion:
a missing match in partial source Evidence does not establish absence. Use the
returned parent Evidence ID for subsequent views and export before closing the
session when the source must survive it.
When `tools/list` advertises `inspect_artifact.detail`, request `"summary"` to
retain its complete source and receive that view immediately. Without that
advertised choice, keep the existing complete call. CLI inspection returns
portable complete Evidence; save it before projecting a selected inline view.

For native procedure/name/string inventories, select `detail: "summary"` when
the connected tool advertises it and the task needs counts or selected rows.
Use its parent Evidence ID with
`view: {kind: "native-inventory", offset: 0, limit: 32, fields: ["value"]}`.
Search tools retain the existing pattern/mode/case/document selection. Omit
`fields` for complete records; `record.address` and `source_index` remain on
selected rows. Selecting `value` keeps its string/decoding qualifications.
Parent Evidence ID plus source index preserves same-address
alternatives. Follow `coverage.next_offset` only as far as the question needs;
exhausting retained rows does not establish complete program discovery.

Use `record_unknown` to track unresolved questions in the user's investigation
and name the authority or environment still required. Supply supporting and
contradicting evidence IDs. It updates the session registry directly.
Use `update_unknown` with the current revision; reread after a stale revision
instead of retrying blindly. Only qualifying observed evidence can verify a
resolution.

Use comparisons with complete, compatible page sets when claiming equivalence
or absence:

- `compare_artifacts` compares inventory pages by occurrence path, content,
  metadata, and graph relations. Name each side as
  `{kind: "retained-evidence", evidence_id}` (an `inspect_artifact` result,
  its nested inventory or its summary) or
  `{kind: "evidence-file", path, evidence_id?}` instead of resending Evidence.
- `compare_functions` compares explicit function Evidence, not fuzzy
  whole-binary matches. It rejects an `analyze_function` summary reply; pass
  the summary's `parent_evidence_id` as a `retained-evidence` reference or
  the complete dossier.
- `compare_bundles` compares canonical bundle membership and unknown history.
- `find_changed_behavior` combines existing comparisons; static differences
  remain candidates, not causal proof. Its `comparisons` accept exact references.
- `build_call_path` needs explicit function dossiers from one artifact/provider;
  pass complete parent IDs in `functions`. An incomplete frontier makes absence
  unknown.
- `correlate_static_and_runtime` uses explicit mappings; matching patterns are
  hypotheses, not causality. Both comparison arrays accept exact references.
- `verify_reconstruction` evaluates a finite typed specification. A pass covers
  only declared comparable claims, not global equivalence.

Process captures are opt-in behavioral evidence, not a security sandbox. V3
captures cannot be upgraded to V4; rerun the original scenario. Distinguish root
exit from descendant settlement and require freshness when the task needs it.
A timed-out target that must write a final report needs `finalization_ms`: REA
sends SIGTERM to the captured root, keeps observing, and sends SIGKILL once
only if the target has not exited by the end of the interval.
`exit.finalization.signals` lists each attempt with its delivery result; the
observed exit signal stays in `exit.signal`, `exit.code` is null for every
deadline exit, and the code of a finalizer that exited on its own is in
`exit.finalization.exit_code` (null on a signal exit or when no exit was
observed).

Use `inspect_analysis_view` with `view: {kind: "api-surface"}` on retained
`inspect_web_network_capture` HAR Evidence to group observed request lines by
method, origin and path template. Format matches are inferences, not handler
identity or schemas. Group pages cite parent record ordinals; consult record
coverage and exclusions before claiming completeness. No requests are replayed.
When the connected schema advertises `include_query_parameter_names`, select
it in the view for distinct observed names with original record ordinals. Query
values are omitted; the names establish neither required parameters nor a
complete server schema. Keep the original parent Evidence for exact URLs.

Use `inspect_analysis_view` with `view: {kind: "environment-manifest"}` on the
same retained HAR Evidence to project the primary origin's request lines into
named tools with path templates, parameters, observed query names, value-free
body shapes and record pointers for an agent environment. Opt into
`template_rules` only when recorded identifiers need them; every template,
parameter and merged sibling is an inference, no header, cookie or body value is
copied, and the three stated unknowns stay unresolved.

Use `view: {kind: "environment-state"}` with the manifest's `template_rules` to
extract the data those reads observed instead: entity types and identity
fields, entities with recorded values, documents, and per-tool render plans
checked against the recordings. The state comes only from reads before the
first related write; types, identity and list membership are inferences. The
view also gives each state-changing tool a write plan, served only when a later
recorded read confirms its effect and none contradicts it.
`rea environment-serve manifest.json --evidence capture.json` derives that
state at startup, answers read tools from it, serves the write tools whose plan
is served, each applying its effect to that state, and serves `data/reset`,
`data/add` and `data/get` on `/agentenv`; other write tools are not served, and
each plan states why in its `reason`. It replays the capture instead with
`--replay-only` or when the state is unavailable (not derivable, or a catalog
over the discovery budget), and its stopped document's `state` says which
applied.
Use `view: {kind: "environment-coverage"}` with the same rules to see what an
environment built from a capture would serve: read tools answered from the
state or replayed with their reason, and each write tool served or withheld
with a hint about what to record next; it does not apply the serve-time
catalog and state size checks. `rea environment-build <capture.har> <dir>`
inspects, projects and exports in one step and prints the same coverage, or
`null` when the bundle serves replay.

For a PE/ELF export question, `inspect_native_exports` accepts `detail: "summary"`
and retains the complete table. Query `inspect_analysis_view` with
`view: {kind: "native-exports", collection: "exports", names: ["selected_name"],
fields: ["name"], offset: 0, limit: 32}` and the reported parent Evidence ID.
All same-name versions and aliases survive; use `source_index` with the parent ID
for stable identity. `collection: "issues"` pages interpretation failures. Page
coverage describes selected retained rows; `summary.coverage` or `exports.coverage`
still describes the source table, so an empty partial page does not prove absence.
CLI `inspect-native-exports --detail summary --evidence_output PATH` saves the
complete bundle for later `inspect-analysis-view --evidence-bundle PATH` requests.

<!-- /vendor-file -->

<!-- vendor-file: reverse-engineer-anything/references/javascript-applications.md -->
# JavaScript and Electron application artifacts

For captured or bundled JavaScript that needs readable source recovery, use
`recover_javascript_sources` with an absolute `path` and absent
`output_directory`. Supply related runtime/shared/lazy files in
`additional_paths` when advertised, then analyze the returned `analysis_input`
directory together. Each input retains its own snapshot, digest and byte-range
provenance; inputs and recovered code are never executed. Recovery requires a
caller-supplied Wakaru on Linux x64; see [the recovery guide](https://github.com/morluto/rea/blob/main/docs/javascript-recovery.md).

Use `analyze_javascript_application` directly on the operator-supplied ASAR or
extracted tree. When the question concerns known source paths and the connected
schema advertises `source_paths`, select exact inventoried paths such as
`["package.json", "main.js", "preload.js"]`. Include supporting manifests or
source maps explicitly; dependencies are not implicitly analyzed. REA retains
the complete artifact inventory and identity but reads source text and analyzes
only selected files. The result and summary record `source_selection`; files
outside scope and their relationships remain unknown, so partial application
coverage does not mean the selected source failed. Use repeated `--source-path`
on either static application CLI route, or `--source-paths-json` with a JSON
file for selections too long for one command line. Omit the selection when the
question requires complete application analysis; `source_paths: []` is invalid,
not an unfiltered request. `detail: "summary"` reduces delivery
and does not by itself reduce analysis work.

ASAR header/index admission defaults to 16 MiB / 16777216 bytes;
an admission error names `asar.max_header_bytes` and its bounds (at most
256 MiB). Call `update_analysis_settings` with that setting, `action: "set"`
and enough bytes, then retry the same full-archive request. No inspection or
REA restart is required. `REA_ASAR_MAX_HEADER_BYTES` seeds future REA processes.
`source_paths`, `detail`, and `max_heap_mb` do not bypass or raise header admission.
Runtime JavaScript timeout/heap defaults are also editable; explicit per-call
`analysis_timeout_ms` and `max_heap_mb` take precedence.

Exact `#alias` specifiers resolve through the importer's
enclosing package `imports` map to package-local files; nested `node_modules`
packages use their own map. Wildcard, recursive, and external-package import
targets stay unresolved with that limitation. When size is unknown or large and the connected schema advertises
`detail`, request `detail: "summary"`. This returns an `inspect_analysis_view`
Evidence record with a distinct ID and a `normalized_result.parent_evidence_id`
for the complete retained application analysis. Source-map contents are part of
that static analysis. Read findings, coverage, limitations and unknowns, then
follow a specific unanswered question. Older servers without `detail` return
the complete application Evidence inline when it fits.

When the connected schema advertises `max_heap_mb` and `analysis_timeout_ms`,
these select the isolated source analyzer's old-space heap and per-source
deadline. Defaults are 1024 MiB and 300000 ms. They do not change the MCP
process heap or the client's tool deadline. For a host timeout without REA
output, use the [deadline recovery guide](connection-and-recovery.md#distinguish-client-and-server-deadlines)
instead of raising the server budget. A Bun-hosted REA does not enforce the heap choice; on Windows it
instead limits the analyzer's committed memory to that choice plus a 512 MiB
runtime reserve.
Resource-limited analyses preserve completed static facts and
report partial semantic coverage with specific unknown scopes; this does not
mean the source is malformed. Inspect those limits before retrying a source.
When expanded relationships exceed the parent's available memory, inspect the
file's modules item view for retained `static_analysis` and
`semantic_module_analysis`. Their facts remain available even when graph links
are unknown. Cumulative result exhaustion can stop analysis before every file
is examined; the inventory and remaining unknown scopes distinguish that case.
Timeout or cancellation after source analysis begins retains partial Evidence
in the same session. A returned `error.details.partial_observation` reference
can be supplied directly to `inspect_analysis_view`. If the SDK cancels locally, retrieve its recorded ID from
the Evidence bundle before inspecting the partial analysis.

## Inventory route candidates without returning the application graph

When the advertised schema supports `view`, use `detail: "summary"` with
`view: {kind: "javascript-routes", collection: "routes", fields: ["path", "confidence"], limit: 20}`.
The same view works with `analyze_web_bundle` on already selected captured sources.
The complete source Evidence is retained; use its `parent_evidence_id` with
`inspect_analysis_view` for `summary`, `routes`, `occurrences`, `sources`, or
`unknowns`. Filter and batch IDs before requesting more fields, and follow
`coverage.next_offset`. CLI selections require `--evidence_output` to keep the
complete record. Static patterns, inferred deployment bases, heuristic system
classification, and unavailable sources never establish route reachability or
the complete application route denominator. See the
[route inventory guide](https://github.com/morluto/rea/blob/main/docs/javascript-route-inventory.md).

For captured endpoint observations and inference facts, `analyze_web_bundle`
also accepts `view: {kind: "web-bundle", collection: "endpoints", limit: 32}`
with `detail: "summary"`. Read later `endpoints`, `inferences`, or `summary`
pages from the retained parent. Filter before requesting detail; retain
`source_index` together with parent ID and collection, and request `location`
or `basis` when tracing sources. Page exhaustion does not mean producer
completeness: check `completeness`, structured `source_unknowns`, and limitations.
Endpoint candidates remain inferences rather than confirmed network behavior.

## Read a module without repeating analysis

Use the actual returned parent ID, on the same connection, as `source.evidence_id`.
The following IDs are placeholders to replace with returned values. When the
module's node ID is not already known, page identities before selecting an item.
Pages return only node IDs, paths and roles; choose a useful page size and follow
`coverage.next_offset` when another page matters:

```json
{
  "source": {
    "kind": "retained-evidence",
    "evidence_id": "ev_ACTUAL_PARENT_ID"
  },
  "view": { "kind": "page", "collection": "modules", "offset": 0, "limit": 16 }
}
```

Select the relevant page entry by its exact `node_id` and recorded role:

```json
{
  "source": {
    "kind": "retained-evidence",
    "evidence_id": "ev_ACTUAL_PARENT_ID"
  },
  "view": {
    "kind": "item",
    "collection": "modules",
    "selector": { "node_id": "jag_node_ACTUAL_NODE_ID" }
  }
}
```

Module pages include asset, bundled and source module roles, so one path can
identify several entries. Use `selector.path` only when uniqueness is established;
the returned node ID avoids needing a complete inventory to prove uniqueness. On ambiguity,
select the matching node ID from the page or the error's candidates. Follow
`next_offset` when another page matters. An item exposes that module node's
recorded observations, identity, hashes, exports and source ranges; it does not
include every child syntax observation, related edge or original source file.
An absent item fact is not evidence of absence from the whole application.

For canonical identities and retained source-range counts, use a typed reference
page instead of reading every full item:

```json
{
  "source": {
    "kind": "retained-evidence",
    "evidence_id": "ev_ACTUAL_PARENT_ID"
  },
  "view": {
    "kind": "javascript",
    "collection": "modules",
    "projection": "references",
    "where": { "path": "main.js", "kind": "javascript-module" },
    "offset": 0,
    "limit": 16
  }
}
```

Filters match exact retained strings; omit a filter to include all values, use
`path: null` for unavailable paths, and `path: ""` for a recorded empty path.
Rows preserve canonical `identity` and distinct observation support states in
`basis`. `retained_source_range_count` counts retained source-range observations,
not runtime imports or unique reference sites. Use a row's `node_id` with the item
view above for exact locations and full supporting observations. Follow
`coverage.next_offset`; page exhaustion describes matching retained rows only.
Check `source_coverage` for source selection, partial/unknown graph coverage and
unknown counts before drawing a negative conclusion.

## Trace only the remaining question

Use `trace_application_feature` on the parent application Evidence for one
literal node ID, route, string, API, IPC channel, module, or native export.
Select `incoming` for relationships leading to the seed, `outgoing` for those
leaving it, and `both` when the question needs both. Trace traversal includes
containment relationships, so even a narrow seed can expand many nodes; a
bidirectional trace can reach unrelated sibling modules. A module item or page
is preferable when its observations already answer the question. Do not treat
all reached nodes as participants in the feature. For a broad trace, pass
`view: {"kind": "feature-trace", "collection": "paths"}` (or `summary`) to
retain the complete trace and read terminal paths first; page `nodes` or `edges`
with exact `where.node_ids` through `inspect_analysis_view` as needed.

Reuse retained parent Evidence when the server advertises it, or supply complete
Evidence inline. Include Hopper or Ghidra Evidence only when its artifact digest
matches exactly.

## Recover an oversized display

An oversized response reports `resource_constraint` and
`details.resource: "transport"`. Reuse
`details.reported_limits.evidence_reference` with `inspect_analysis_view` for a
summary, one module, or a stable page of module identities.
`export_evidence_bundle` writes the complete canonical session to a
caller-selected file. These workflows keep the original Evidence and coverage;
a broad follow-up can also exceed framing.

A client can truncate a successful result inside its text envelope without a
REA `resource_constraint`. Treat a truncation notice or incomplete JSON as a
display limitation; do not claim the full record was examined. Reuse the known
parent ID for smaller views, or export complete Evidence to a selected file
while the session remains open. If the parent ID was lost from the preview,
use the prior analysis summary or explicit ledger entries to recover it; do
not invent an ID or rerun analysis just to reproduce the same display.

BrowserWindow preferences, preload and contextBridge surfaces, IPC
registrations, utility processes, and native binding requests are static syntax
observations. Only a unique exact literal IPC channel match supports an inferred
pairing. Dynamic or ambiguous channels remain unresolved. A requested `.node`
member is not a verified native export. Never claim runtime reachability,
registration, defaults, or policy enforcement from static analysis.

For version comparison, analyze each version once, then call
`compare_application_versions`. Accept only its digest, source-map, structural
fingerprint, or non-module semantic matches. Module ordinals and minified names
are not persistent identity. Report added or removed only with complete
opposite-side coverage; otherwise report unknown.

When the question asks how one exact exported callable's returned object shape
changed, analyze each version once and then call
`compare_javascript_export_shapes` with explicit module paths and export names.
Use the returned IDs on the same connection, or complete inline Evidence
records, from both analysis calls. Accept variant
pairing only through the tool's unique exact literal discriminant. Read
`property_inventories` and each change's `presence` before treating `unknown` as
"the name was not observed": inventories list observed property names even when
values stay unknown, with a `source_range` for each paired or unpaired variant.
Array holes and mutation-invalidated slots are not observed properties.
Complete parent coverage reports presence-only
`added`/`removed` independently of unresolved values. Cite the
comparison Evidence and report JSON Pointer changes; dynamic values, ambiguous
variants, and incomplete parent-property coverage stay unknown. This is static
inference, not runtime behavior. When runtime semantics are needed, run
behavioral probes against the relevant application versions and capture them
through the available browser, Electron, or process workflows.

## Reusing application Evidence

When advertised by the connected server, application trace and compare tools
accept complete inline Evidence or
`{"kind":"retained-evidence","evidence_id":"ev_<64 lowercase hex characters>"}`
for their application input (`application`, or `left`/`right`). `inspect_analysis_view`
uses the same retained-reference form in `source`, or portable inline Evidence,
to project a summary, module page, or one module with its recorded observations.
This notation is
a template: replace it with the actual returned ID. Versions before 4.1.0 accept only full
inline Evidence. Use the exact ID
returned by the producer on the same MCP connection. Resolution does not run
analysis or select a provider; findings remain inline. For summary or inspection
replies, select the complete `normalized_result.parent_evidence_id`. Native
observation arrays and runtime reconciliation's `static_layers[].analysis` and
`runtime_observations[]` also accept exact references where advertised. Each
source can independently be inline or retained, preserving identity, coverage
and unknowns. CLI workflows advertising `--evidence-bundle` resolve these inputs
from the explicitly selected bundle. `close_binary` releases the engine while
retaining references and complete Unknown history on the same MCP connection.
`reset_investigation` explicitly clears them; optional `save_path` checkpoints the
complete bundle before clearing. Import that bundle in another connection to
restore its original references. Retention is bounded, in-memory and never silently
evicted; `binary_session.investigation` reports the budget. A missing reference
includes its ID and recovery guidance.

For exact file/native metadata or processing gaps, use
`view: {kind: "javascript-facts", where: {paths: ["package.json"]}, property_keys: ["name", "operation", "analysis_status"], limit: 32}`.
Rows retain canonical node/observation identity and original Evidence. Paths
match Evidence artifact-path/source-range locations; missing properties remain
omitted and source coverage stays separate from page exhaustion. Batch paths and
select only needed property keys; complete Evidence remains accessible by export.
If names are unknown, opt into `include_available_property_keys: true`; it lists
the original keys per returned observation without unselected values. Keep each
row's node/observation identity paired when composing facts.
These rows select application-graph observations; semantic relationships and
semantic unknown records remain in the complete parent Evidence and trace tools.

<!-- /vendor-file -->

<!-- vendor-file: reverse-engineer-anything/references/native-and-artifacts.md -->
# Native, managed, and packaged artifacts

For release comparisons on one MCP connection, retain `list_procedures` Evidence
from each target and reuse its exact IDs after target switches or `close_binary`.
For a handoff or new process, export the complete bundle and import it there,
including its source closure. `reset_investigation` explicitly clears retained
records; optional `save_path` checkpoints them before clearing.
`match_native_functions` pairs unique exact names and, when supplied,
complete observed body bytes. Reuse optional same-context `list_names`,
`procedure_info`, `read_bytes` and existing `analyze_function` dossiers as
`left_observations`/`right_observations`; an MCP `analyze_function` summary
reply contributes its `parent_evidence_id` as a `retained-evidence` reference,
not the summary itself. Avoid decompiling every function merely to match it. Its summary retains a parent for
`inspect_analysis_view` `function-matches` collections `matches` and `functions`.
Select columns, batch IDs and page individual facts; aliases remain unresolved.
Unpaired observations do not prove additions/removals. Existing matched dossier
pairs include inputs for `compare_functions`; otherwise analyze just chosen pairs.

Aggregate completed comparisons with `find_changed_behavior`, selecting each
comparison's exact `retained-evidence` ID instead of resending full records.
Inline comparison Evidence remains accepted. References belong to the current
server: after handoff, import the original bundle including its source closure.
Do not substitute dossier IDs or summary views. Static differences remain
behavior candidates, with runtime behavior unknown unless separately observed.

For a matching representation refusal, inspect `details.limit` and raise
`native.matching_representation_bytes` with `update_analysis_settings` before
retrying the unchanged MCP request. CLI launch seed:
`REA_NATIVE_MATCHING_REPRESENTATION_BYTES`. The default is 96 MiB; the policy
range is 1 byte to 1 GiB and does not bound process RSS. Keep the complete
inventories: splitting them changes global name/body uniqueness.

## Apple app resources

Use `open_bundle_resources` with the selected app path, then `inspect_plist`,
`decode_interface_builder`, `inspect_asset_catalog`, or `inspect_keyed_archive`.
The resource session reads the app without resolving `CFBundleExecutable` or
starting a deep provider. Preserve `resource_root` provenance, per-resource
hashes where reported, and null executable identity; a directory path is not
an executable digest. Export retained Evidence before closing or switching
roots. Binary analysis snapshots do not apply. Use `open_binary` to switch to
executable analysis, and `close_binary` to release either session kind.

The four matching CLI commands accept the app path directly. For an archive
inside the app, use `inspect-keyed-archive APP_PATH RELATIVE_ARCHIVE_PATH`.
Host requirements for plist and compiled asset/Interface Builder tooling still
apply; a resource-only session does not establish provider availability.

## Desktop installation directories

When an installation directory is supplied and its runtime is unknown, use
`inspect_desktop_application` with its absolute path. Default MCP summary
delivery retains complete Evidence. Read `files`, `omissions`, `candidates`, `components` or
`next_probes` with `inspect_analysis_view` kind `desktop-application`, selecting
exact paths, batched file/omission IDs or families and only needed fields and pages.
Summary `probe_issues` retains counts and bounded previews. Select files with
`has_issues: true` and fields `path`, `read_status`, `issues` to retrieve exact
failures directly; preview text is display data, while `file_id` selects full facts. Preserve source
coverage, read-range identity and unknowns; directory snapshot identity is not
a digest of every file's contents. Component path markers do not establish
runtime presence. For compact CLI output, use
`inspect-desktop-application PATH --detail summary --evidence_output BUNDLE`.
See [desktop installations](https://github.com/morluto/rea/blob/main/docs/desktop-applications.md).

## Go build metadata

Use `inspect_go_binary` for an explicit local ELF, PE or Mach-O (universal
files need `architecture`) when the
question concerns the embedded compiler version, module/dependency versions,
local replacements or build settings. No `open_binary`, Go installation or
target execution is required. The CLI equivalent is `inspect-go-binary PATH`.
Preserve artifact SHA-256, original file ranges, framed module bytes and every
unparsed module-text line. A missing record is an unknown, not proof of a
non-Go binary; observed metadata does not authenticate its claims. Function,
source and type recovery remain a separate native-analysis question.

## Model files

Use `inspect_model_artifact` (`inspect-model-artifact PATH`) for local GGUF v2/v3
and safetensors declarations without a model runtime. Header-only mode does not
read weights or establish full-file identity. `hash: "full"` explicitly streams
all bytes. Retained `model-artifact` views page `metadata`, `tensors` and derived
`types`, with exact batch filters and selected fields. Arrays retain typed counts
and eight-element previews; omitted values, unknown types and runtime behavior
stay explicit. See [model files](https://github.com/morluto/rea/blob/main/docs/model-artifacts.md).

## IL2CPP metadata

Use `inspect_il2cpp_metadata` for an explicit local Unity `global-metadata.dat`
(versions 24, 27, 29, 31 and 39) when the question concerns assembly images,
names, member owners, string literals, namespaces or index ranges. No `open_binary`, Unity installation or target
execution is required. The CLI equivalent is `inspect-il2cpp-metadata PATH`.
MCP defaults to counts with complete retained Evidence. Query `sections`,
`images`, `types`, `methods`, `fields`, `properties`, `events`, `parameters` or
`string_literals` through `inspect_analysis_view`; use exact names,
batch indices and selected fields. Row indices are scoped by artifact SHA-256
and collection; page offsets count filtered matches. Parameters support batch
`method_indices` to read one method's parameters directly. Historical reports
without member collections retain unknown counts rather than empty inventories. Preserve
artifact SHA-256 and index widths. Unrecognized magic may mean encryption and
is unsupported, not decrypted. Linking names to `GameAssembly` or
`UnityFramework` code addresses remains a separate native-analysis question.
See [IL2CPP metadata](https://github.com/morluto/rea/blob/main/docs/il2cpp-metadata.md).

## Rust dependency metadata

Use `inspect_rust_binary` for an explicit local ELF, PE, or Mach-O (universal
files need `architecture`) when
the question concerns the cargo-auditable crate list embedded in `.dep-v0`
(Mach-O: `__DATA,.dep-v0`). No `open_binary`, Rust installation, or target
execution is required. The CLI equivalent is `inspect-rust-binary PATH`.
Preserve artifact SHA-256, package order, dependency indices, and the section
file range. A missing section is null metadata, not proof the binary has no
dependencies. An omitted package kind stays null. A rustc commit hash is
inferred from a read-only `/rustc/<40-hex>/` path and does not by itself
identify the compiler. See [Rust binaries](https://github.com/morluto/rea/blob/main/docs/rust-binaries.md).

## PE Authenticode certificate tables

Use `inspect_pe_certificates` for an explicit local PE32/PE32+ image when the
question concerns the Authenticode certificate table, WIN_CERTIFICATE types, or
embedded PKCS#7 signer and X.509 identity fields. No `open_binary`, Windows SDK,
or target execution is required. The CLI equivalent is
`inspect-pe-certificates PATH`. Preserve artifact SHA-256, table file ranges,
payload hashes, original validity-time spellings, and
`subject_key_identifier_hex` when the signer uses that form. A missing
`IMAGE_DIRECTORY_ENTRY_SECURITY` directory is observed absence of that table,
not proof the image is unsigned in every catalog or overlay sense. Signatures,
chains, timestamps, and Authenticode digest coverage remain unobserved. See
[PE Authenticode certificate tables](https://github.com/morluto/rea/blob/main/docs/pe-certificates.md).

## PE import and delay-load tables

Use `inspect_pe_imports` for an explicit local PE32/PE32+ image when the
question concerns imported DLL and function names, ordinals, delay-load
descriptors, or the pefile import hash. No `open_binary`, Windows SDK, or
target execution is required. The CLI equivalent is `inspect-pe-imports PATH`.
Preserve artifact SHA-256, directory file ranges, original DLL spellings, and
ILT/IAT RVAs. A missing `IMAGE_DIRECTORY_ENTRY_IMPORT` directory is observed
absence of that table, not proof the image never imported APIs through another
table or overlay. Bound snapshots, loaded IAT contents, and export-forward
resolution remain unobserved. See
[PE import and delay-load tables](https://github.com/morluto/rea/blob/main/docs/pe-imports.md).

## PE TLS callbacks and load configuration

Use `inspect_pe_load_config` for an explicit local PE32/PE32+ image when the
question concerns code that runs before the entry point through TLS callbacks,
or the security cookie, SafeSEH, CFG, EH-continuation and XFG declarations in
the load configuration. No `open_binary`, Windows SDK, or target execution is
required. The CLI equivalent is `inspect-pe-load-config PATH`. Preserve artifact
SHA-256, directory and callback-array file ranges, and callback VAs as
hexadecimal strings. Fields outside the declared `Size` are `null`. Guard-flag
mitigations carry `evidence_kind: "inferred"`; enforcement remains unobserved.
See
[PE TLS callbacks and load configuration](https://github.com/morluto/rea/blob/main/docs/pe-load-config.md).

## ELF note tables

Use `inspect_elf_notes` for an explicit local ELF32/ELF64 image when the
question concerns PT_NOTE/SHT_NOTE owners, GNU build-id, or GNU ABI-tag
fields. No `open_binary` or target execution is required. The CLI equivalent
is `inspect-elf-notes PATH`. Preserve artifact SHA-256, table file ranges,
descriptor hashes, and original owner spellings. A missing table is observed
absence of those declarations, not proof the image never carried notes in
another container. See
[ELF note tables](https://github.com/morluto/rea/blob/main/docs/elf-notes.md).

## Apple IPS crash reports

Use `inspect_apple_ips` for an explicit local Apple `.ips` file when the
question concerns crash metadata, exception and termination facts, threads,
usedImages, lossless registers, or documented crash classes. No `open_binary`,
Xcode, atos, or target execution is required. The CLI equivalent is
`inspect-apple-ips PATH`. Preserve artifact SHA-256, `bug_type` as a string,
uppercase image UUIDs, and integer literals that exceed IEEE-754 range. Only
`bug_type` `"309"` yields a crash body; other DiagnosticReports types return
no crash result. Opened Mach-O and dSYM UUID joins remain unobserved. See
[Apple IPS crash reports](https://github.com/morluto/rea/blob/main/docs/apple-ips.md).

## Linux kernel modules

Use `inspect_kernel_module` for an explicit local ELF32/ELF64 relocatable
object when the question concerns `.modinfo` license, vermagic, alias,
depends, or parm strings, the `__versions` symbol CRCs, or an appended module
signature trailer. No `open_binary`, Linux host, or `modinfo` program is
required. The CLI equivalent is `inspect-kernel-module PATH`. Preserve
artifact SHA-256, key order, duplicate keys, CRC hex, and section file ranges.
A missing section is observed absence when section names are known, not proof
the module never carried that metadata. `.gnu.linkonce.this_module` is reported
as present or absent; `struct module` stays unknown because its layout changes
with the kernel version. `__ksymtab` records are not decoded. The PKCS#7 range
and its SHA-256 are observed; certificate, signer, and digest coverage remain
unvalidated. An absent trailer is not proof the module is unsigned in another
container. gzip, xz, and zstd whole-file containers are unsupported and name
`external_decompression` as the next probe: use an external codec utility to
decompress into a separate file, then call `inspect_kernel_module` on that file. See
[Linux kernel modules](https://github.com/morluto/rea/blob/main/docs/kernel-modules.md).

## CPython pyc files

Use `inspect_python_pyc` for an explicit local CPython 3.7–3.13 `.pyc` when the
question concerns the header magic, PEP 552 source hash or timestamp, nested
code-object names, or bytecode identity. No `open_binary`, Python installation,
or target execution is required. The CLI equivalent is `inspect-python-pyc PATH`.
Preserve artifact SHA-256, the 16-byte header fields, nested code names, and
bytecode SHA-256. Bytecode is not decompiled. A decoded header does not prove
the matching `.py` is present. See [CPython pyc inspection](https://github.com/morluto/rea/blob/main/docs/python-pyc.md).

## Erlang BEAM files

Use `inspect_erlang_beam` for an explicit local `FOR1`/`BEAM` file when the
question concerns IFF chunks, atom names, exports, imports, lambdas, or the
Code header. No `open_binary`, Erlang installation, or bytecode execution is
required. The CLI equivalent is `inspect-erlang-beam PATH`. Preserve artifact
SHA-256, chunk file ranges, 1-based atom indices, and original atom spellings.
Missing optional tables stay null. For a few facts, use `detail: "summary"` with
a `beam` view selecting a collection, exact names/indices and fields; read later
pages from `parent_evidence_id` or the complete Evidence bundle. Same-name
exports retain every arity and original atom index. CLI summary delivery requires
`--evidence_output`. Null table counts remain distinct from decoded empty tables. See
[Erlang BEAM files](https://github.com/morluto/rea/blob/main/docs/erlang-beam.md).

## SQLite snapshots

Use `inspect_sqlite_database` with an explicit local database snapshot for its
schema and optional rows from one exact ordinary table. It requires Node.js
24.x >=24.15 or 26+ with the native `DatabaseSync.limits` API. It also consumes the
existing sibling `-wal`; retain both original digests when citing its result.
Default output is a compact inventory; a selected table expands only its own
schema and samples 20 rows. Select `columns` to avoid irrelevant or large cells,
and request `schema_scope: "database"` only for complete schema details.
Choose `row_limit` when a finite sample is useful and keep truncation and
unspecified row order explicit. Virtual tables, shadow tables and views are
schema facts, not row-read targets. REA inspects private copies and leaves
the source files untouched; obtain a coherent quiescent database/WAL snapshot
before inspection. See [SQLite snapshots](https://github.com/morluto/rea/blob/main/docs/sqlite-databases.md).

## Recorded Linux crashes

Use `inspect_recorded_crash` with an explicit Linux x86-64 ELF core path to
inspect historical thread registers, signals, raw notes and original file
ranges. It is independent of the active disassembler target. Source-bound
register values and note bytes are observations; missing notes, signal-thread
association and current executable/library identity remain unknown. PIDs are
historical metadata and never authorize live attach or control.

The optional `include_debugger_context` facet adds mapping candidates through
caller-supplied GDB/pwndbg in an owned core-only session. Display names do not
establish current file identity; zero reported flags leave permissions unknown.
Requested unavailable context fails with setup guidance. See
[recorded crashes](https://github.com/morluto/rea/blob/main/docs/recorded-crashes.md)
for exact upstream profiles, bounds and verification coverage.

## Offline ELF layout

Use `inspect_binary_layout` with an explicit local ELF path for file-backed
sections, symbols, relocations, linkage names, and static mitigation inferences
without opening a disassembler target. When that complete record is already
retained, call `inspect_analysis_view` for a summary, mitigations or linkage
facet, one section or symbol, or a stable page. Do not re-run the decoder to
read a single object.

## Offline WASM

Use `inspect_wasm_artifact` with caller-supplied WABT for selected local bytes.
For counts, validation and WAT identity, select `detail: "summary"` on the first
MCP call. The complete original Evidence stays retained; use
`normalized_result.parent_evidence_id` for exact exports or text pages. Omitted
or complete detail keeps the existing complete result.
For a completed result, use `inspect_analysis_view` with its reported retained
reference for a summary or `view: {kind: "wasm", facet: "exports", offset: 0, limit: 32}`.
Facets also include sections, imports, candidates, glue, WAT, headers, details
and tool profile. Text offsets count UTF-16 code units; follow `next_offset`.
The complete source remains retained after an oversized MCP reply. No target
execution or network acquisition is implied, and WAT is decoded representation.

## Offline APK signatures

Use `inspect_apk_signature` for a selected local APK/ZIP/AAB. Default MCP summaries
retain complete Evidence. Select `view.collection: signers/digests/lineage`,
with scheme or ID batches, fields and paging; use `inspect_analysis_view` kind
`apk-signature` for retained reads after deletion. IDs retain artifact/scheme
scope and signer links; `fields: []` keeps identity links. Empty pages preserve
partial decoding reasons and unknown authenticity. CLI compact delivery needs
`--evidence_output` to preserve the complete parent.
It reads the APK
Signing Block (v2/v3/v3.1) and v1 `META-INF` signing without executing anything,
and reports each signer's certificate facts (for v1, the certificate the PKCS#7
block's SignerInfo names), the declared v3 rotation lineage,
the declared source-stamp certificate and, for SHA-256/SHA-512 digests, whether
the declared content digest matches the current bytes. That match is not a
signature verification: anyone who changes the bytes can recompute the digest.
`posture` summarises v1-only signing (which cannot tell a v1-only APK from one
whose v2/v3 block was removed), observed signer agreement across schemes,
whether the v1 signer equals the block-scheme signer (`false` is notable),
whether every differing signer appears in a declared (unverified) rotation
lineage, and the strongest scheme.
It never claims authenticity: no signature or lineage is cryptographically
verified.

## Native targets

After `open_binary`, use focused search, procedure, or function tools directly.
Use `binary_overview` when target metadata or inventory context helps answer the
question. Prefer literal search, names, decompilation, callers, callees, and
cross-references. Addresses and recovered pseudocode are analysis observations,
not original source. Provider unavailability and unsupported metadata remain
unknown rather than false.

For a completed `analyze_function` dossier, use `inspect_analysis_view` with
`view: {kind: "native", facet: "value_flow_operations", offset: 0, limit: 32}`
and the exact retained Evidence ID to read selected facts without reanalysis.
The default MCP reply is already a summary of that dossier: its
`normalized_result.parent_evidence_id` is the retained ID to page, and its
null counts mark facets the provider did not record or declared unavailable.
Native facets also include procedure, pseudocode, assembly, basic blocks,
comments, callers/callees, references, unresolved calls, referenced strings and
names, the native API record, and value-flow summaries. Pseudocode offsets and limits count UTF-16
code units; use the returned `next_offset` for continuation. Provider limitations
and unavailable facts remain explicit; the complete parent Evidence is retained.

`inspect_macho` on a large framework returns megabytes of imports and exports.
Select `detail: "summary"` for slice identity, UUID and per-collection counts,
then page rows with `view: {kind: "macho", facet: "exports", offset: 0, limit: 64}`
and `normalized_result.parent_evidence_id`. Facets are entrypoints,
architectures, build_metadata, load_commands, dependencies, imports, exports,
segments and provenance. `source_exhaustive: false` means unreturned symbols
may exist.

To see which functions or Objective-C methods a Mach-O actually calls in one
run, use `observe_native_calls` with explicit breakpoints and a bounded
`duration_ms`/`max_events`. It launches a new process under LLDB, so the target
runs and may change files or use the network. Hardened-runtime targets need the
`get-task-allow` entitlement.
Function breakpoints use exact LLDB runtime names: pass an `inspect_macho` export
or import `runtime_name` (`main`), not its symbol-table `name` (`_main`). REA does
not translate breakpoint names. Set `module` to the image
file name when selecting that image only; otherwise loaded system images also
match. Inspect retained locations and module paths before attributing a call.

Use `binary_session` with no arguments to check the open target, selected
provider, and alignment. Its default summary `result.tool_availability` carries
the complete tool inventory grouped by current status. Expand each group's
`names` and inherit the inventory-level client requirements unless a group
overrides them; availability, reasons, remediation, and modes remain inline.
Provider candidates keep availability and target-support status, code, and
reason. `omitted_fields` names what the summary leaves out; `{"detail":
"complete"}` adds each unavailable candidate's `remediation`, provider
diagnostics, candidate capability sets, and tool surface, `effects`, and
`annotations`. Those arrays name true flags from fixed
vocabularies, so an omitted known flag is false. `tools/list` remains the
canonical source for full tool schemas when target or provider state changes.

Provider capability groups carry provider identity and ordered limitations.
Prepend each set's `shared_limitations` to a group's `limitations` to recover the
operation's full ordered list. Candidate capabilities, returned with complete
detail, describe possible providers. Top-level session capabilities describe the current route, and
`analysis_provider_binding` identifies the selected provider.

## Reuse caller-selected Ghidra analysis

When the caller supplies an expanded project, configure `REA_GHIDRA_PROJECT_PATH`
(the `.gpr` marker) and optionally `REA_GHIDRA_PROGRAM_NAME` (one root program),
then restart/reconnect before `open_binary`. CLI uses the same configuration.
REA opens only a fingerprint-bound owned copy with `-process -noanalysis -readOnly`;
original project files are not opened by the engine or saved. Database edits,
import overrides and repair scripts are unavailable in this mode. Treat original
analysis completeness/settings as unknown and prior edits as caller-project state.
The program's recorded import digest must match the target; changed project content
requires reopening for a fresh profile. See the
[setup and preparation guide](https://github.com/morluto/rea/blob/main/docs/installation.md#reuse-an-existing-ghidra-project).

## Ghidra startup deadline recovery

`provider_timeout` during the first Ghidra query can cover import, auto-analysis,
bridge startup, and readiness. The default 330,000 ms is configurable through
`REA_GHIDRA_STARTUP_TIMEOUT_MS`; a smaller query still needs the same cold import.

When the error names `ghidra.startup_timeout_ms`, call
`update_analysis_settings` with `action: "set"` and a larger value within the
reported bounds. Resolve retained cleanup before the next startup attempt.
No REA restart is needed; an already accepted startup keeps its original
budget. A new attempt repeats import. Preserve useful Evidence before closing
and reopening the target when remediation requires that lifecycle step.

For a per-function timeout, update `ghidra.decompile_timeout_seconds` and retry
the same function on the existing Program. Explicit `null` removes that
per-function deadline. Inspection is optional when the error supplies the
setting and bounds. Runtime updates disappear when REA exits; environment
changes only seed future REA processes.

The client's tool-call deadline must allow startup plus the requested query;
server settings and progress notifications cannot override it. CLI analysis
avoids the MCP client deadline, but retains the provider deadline. For example:

```sh
REA_GHIDRA_STARTUP_TIMEOUT_MS=1800000 rea analyze /absolute/path/to/app.exe --provider ghidra --json
```

Thirty minutes is an example budget, not a completion guarantee. Keep host CPU
and memory controls in place. Disable specific expensive analyzers only when
their missing coverage is acceptable and retain the resulting limitations.
Exported C and embedded resources remain useful independent evidence, but a
timeout does not establish complete analysis or absence of code. See the
[deadline and client guide](https://github.com/morluto/rea/blob/main/docs/mcp-contracts.md#ghidra-first-query-deadlines-and-recovery).

## Bridge request ceiling

Hopper and Cutter share `REA_BRIDGE_MAX_REQUEST_BYTES`. Unset, both sides use
16777216 bytes. The payload budget excludes the terminating LF. A decimal
integer from 7464 to 536870887 raises or lowers that ceiling. The floor fits
the largest bounded symbol-name command. A tight Cutter status still returns
its session id and up to 64 completion receipts. Its path is included when it
fits, and is unknown when it does not, so an older descriptor path is not
paired with the new generation. The maximum is the encoded payload, one byte under Node's string ceiling so
the framing LF still fits. Cutter measures, signs, and writes a fitting
response in bounded chunks. The bridge searches only the newly read bytes
for the framing LF. The client unescapes each socket chunk into one response
string before parsing it, so this ceiling does not keep the paged wire frame
and another concatenated copy. Invalid values are configuration errors and do not fall back to 16777216. Set the variable in the environment that starts REA, restart REA,
and start Hopper or Cutter from that same environment. An out-of-band bridge
without the setting stays at 16777216 bytes. The client reports that mismatch
during discovery only after the hello proves a live authenticated bridge, and
does not send a status request or the command. A stale descriptor is ignored.
Discovery fails if any such live ceiling differs, even when another live
session matches. A command response discarded for that ceiling stays an
unknown execution with `output_truncated`. A hello
that never sends its authenticated frame does not hold the accept loop.
At most 8 connection threads run; a further accept is closed, and a failure
to start a thread does not stop the listener. `completed_connection` is the
longest prefix of connections that have terminated. Dense scalar replies are
encoded in bounded batches.
The 25000 ms Cutter request deadline and the 256-candidate discovery budget
still have no runtime override.

## Selected native facts and call graphs

For a large `get_call_graph`, or repeated `procedure_address`,
`procedure_callees`, `procedure_callers` and `resolve_containing_procedure`
queries, select `detail: "summary"` when the first 64 recorded observations
suffice. Read further `native-observation` pages from the returned parent Evidence
ID. Graph message IDs index that page's exact-text dictionary; keep level,
source index, failed nodes, and partial/unknown relationship coverage.
Read referenced source context through `native-context` facets `overview`,
`analysis-profile`, `limitations` and `result-limitations`. Reuse inspected
context/profile values only for the same digest; until caveats are read,
interpretation beyond the returned facts remains unknown. Complete Evidence
remains retained and exportable. Small complete replies can cost fewer tokens
than additional context/page calls; count the completed task and discovery.

## Static memory and original file bytes

For Ghidra, `read_bytes` reads initialized analysis memory, including loader
fixups; it does not read a running process. Check `returned_bytes` and `complete`
before decoding a table. An incomplete read is missing coverage, not a zero-filled
tail. Use `list_segments` to inspect the selected block's initialization and address-space
facts, and retain unavailable facts as unknown.

Use `address_to_file_offset` to anchor one observed address to original file
bytes. A mapping for the first address does not establish a contiguous mapping
for an entire table, and loader fixups can make analysis bytes differ from source
bytes. Keep source ranges and analysis-memory observations separate.

A pointer table can refer to writable slots populated by a constructor rather
than directly to immutable resources. An uninitialized block or an observed zero
does not establish the slot's later runtime value. Follow `xrefs` and the relevant
writer's assembly or pseudocode; distinguish recorded assignments from inferred
execution order. Do not replace unreadable bytes with zeros or conclude that a
resource is absent without the necessary initialization evidence.

## DOS MZ with Ghidra

For an admitted DOS MZ target, use `inspect_native_load_image` to check measured
loaded bytes, file mappings, relocations and the entry against the immutable
snapshot. Keep `mismatch` and `unsupported` explicit. Verified import covers the
reported static image, not runtime DOS or PC-98 hardware behavior.

For a large load-image report, select `detail: "summary"` and query its
`parent_evidence_id` with `inspect_analysis_view` kind `native-load-image`.
Choose a collection such as `relocations` or `mappings`, select only needed
fields, and page with offset/limit. Original indices preserve same-address
alternatives. Null collections remain unrecorded or inapplicable; paging does
not upgrade unsupported verification. CLI requires `--evidence_output` for
summary delivery so complete source Evidence remains accessible.

For Ghidra decompilation, `procedure_pseudo_code` also accepts `procedure: "file-offset:0x..."`; CLI `rea decompile <path> --file-offset=0x... --provider ghidra` resolves the source byte offset internally. An unresolved 0x-prefixed numeric procedure selector also falls back to a unique file mapping. Existing symbols and analysis addresses win; multiple mappings fail as ambiguous. Preserve the returned file-offset and address locations and raw selection observations. ELF virtual addresses are distinct from file offsets; never assume an arbitrary offset plus image base is an analysis address.

Complete function body ranges use inclusive ends and can contain gaps. Do not
treat the enclosing span as code.
For packed targets, retain the original and separately derived artifact identities;
decompiling an unpacking stub does not recover the unpacked program.

When reading Objective-C dispatch metadata, distinguish class implementation
methods from protocol requirements: class methods report null requirement
flags, while decoded protocol declarations retain required and optional facts.
Property attributes remain raw name/value tokens; use the property's
`atomicity` field for the decoded `N` marker or the default atomic behavior.
Null class/meta flags, ivar counts, atomicity, or read-only values mean the
selected provider did not establish that fact. Symbol names alone do not prove
that a class is a root class or has no ivars.

## Managed PE/CLI

Start with `inspect_managed_artifact`. REA's canonical managed inspection is
execution-free: do not claim it loaded, reflected, executed, or resolved the
assembly. Keep managed/native boundaries and unavailable reconstruction facts
explicit. A bring-your-own reconstruction oracle is separate from the canonical
parser and must not become an implicit setup dependency.

For identity/classification questions, `inspect_managed_artifact` can explicitly
select `detail: "summary"` on the first MCP call. It retains complete metadata
and returns a linked overview with full classification/evidence, nullable
module/MVID, frameworks, metadata coverage/issues/limitations and returned-row
counts. Default complete requests remain unchanged. Read original rows with
`inspect_analysis_view`, source `normalized_result.parent_evidence_id`, and
`view: {kind: "managed", collection: "attributes", offset: 0, limit: 16}`.
Collections are `references`, `resources` and `attributes`. Paging does not
repeat parsing. Returned-row exhaustion
does not prove complete metadata or absence under partial/unavailable coverage;
preserve build-local tokens and their artifact/MVID scope.

`inspect_managed_members` always returns the assembly-wide `member_refs`, even
for one selected type. For questions about a selected type, select
`detail: "summary"` with `type_names`; it returns the selection (with unmatched
names), coverage and per-collection counts. Page rows with
`view: {kind: "managed-members", collection: "call_edges", offset: 0, limit: 64}`
over `types`, `exported_types`, `fields`, `methods`, `member_refs`, `call_edges`,
`field_accesses` or `user_strings`.
Use exact `names` and `declaring_types` filters before paging supported
collections. For a compact method lookup, request `fields: ["name",
"declaring_type", "signature"]`; omit `body` to avoid anchors. Identity tokens,
original `source_index`, module/MVID and source coverage remain. Check
`unresolved_filter_rows` before interpreting an empty match as absence.

### .NET NativeAOT

NativeAOT binaries contain native machine code, so ordinary CIL decompilers
cannot recover the original method bodies. When managed metadata/CIL is absent,
classify that as a native-analysis route rather than claiming source recovery.
Open the native image with the selected deep provider and inspect functions,
strings, calls, and references; describe decompiler output as pseudocode and
inference.

NativeAOT images can be PE/COFF, ELF, or Mach-O executables and shared
libraries. Use file bytes and loader metadata rather than suffixes to identify
them. For packaged apps, inventory/extract with REA's artifact tools and retain
the exact contained image identity. PDB, ELF debug, or dSYM sidecars are
additional evidence only when the provider accepts and matches them.

REA has a built-in read-only snapshot parser for x64 PE targets with .NET 8 RTR
9.1 metadata. An optional headless Ghidra adapter adds database annotations and
broader metadata recovery on Linux; it requires an explicitly configured
NativeAOT JAR. These are separate routes. The built-in parser also runs on
Windows Ghidra P0; read frozen literals from its report, because
`search_strings` does not include them. See the
[NativeAOT guide](https://github.com/morluto/rea/blob/main/docs/ghidra-nativeaot.md)
for setup, supported layouts, and host restrictions. Preserve binary identity
and distinguish derived metadata from Ghidra database observations. Recovered
types and native pseudocode are not original C# source. Windows Ghidra P0 has
no database mutation authority.

## Packages and extraction

Use `inspect_artifact` for application bundles, archives, ZIP/APK/IPA/MSIX/AppX,
ASAR, or DMG inputs when the artifact graph and findings help answer the
question. It returns the complete artifact graph inline. Cite graph manifest
IDs when using them.

For an IPA or a macOS `.app`, ZIP, or DMG, pass the inventory Evidence to
`project_apple_application_graph`. It reports application roots and nested
bundles by path convention: app extensions, XPC services, frameworks, login
items, system and driver extensions, and plug-ins. It also lists privileged
helpers, launchd plists, symlinks, and each bundle's `info_plist_path` and
executable candidates. Roles are path conventions, not parsed plists; read the
listed plists with `inspect_plist`.

After `open_binary` on a `.app` or Mach-O, use `trace_dylib_resolution` to see
which file each `@rpath`, `@loader_path` and `@executable_path` load reaches for
every executable in the bundle. It also lists missing or weak loads and earlier
`@rpath` candidates that are absent. Narrow large bundles with `roots` or
`architecture`. System paths stay undetermined because the dyld shared cache
provides them.

Use `extract_artifact` when materialized files from a supported format are needed.
It extracts the active target and accepts optional `integrity_policy`; see the [MCP contracts](https://github.com/morluto/rea/blob/main/docs/mcp-contracts.md).
It materializes all regular files into a fresh temporary directory chosen by
REA. Symlinks and encrypted entries are inventory facts, not extractable files.
The result reports the materialized directory; callers do not choose the
destination. No separate permission grant is needed.

For classic iNES cartridges, `open_binary` recognizes the byte signature without
an executable architecture. `inspect_artifact` retains header facts and each
PRG/CHR file unit's offset, length and SHA-256; its nested inventory's
`ines.reconstruction` verifies the actual ordered region bytes against the
whole-file digest. Extraction includes the original header, optional trainer
and uninterpreted trailing bytes. These file units are not mapper/CPU bank
maps. NES 2.0, UNIF, dirty legacy headers and truncated payloads are explicitly
refused. No emulator or 6502 analysis is performed. See the
[iNES guide](https://github.com/morluto/rea/blob/main/docs/ines-containers.md).

Native DMG traversal automatically uses a read-only mount on supported macOS
hosts, with an owned temporary mount directory and cleanup. It needs no approval
flag. Unsupported hosts or mount failures remain explicit limitations; do not
claim child inventory when only root identity is available. DMG extraction is
unavailable through `extract_artifact`. To access DMG files on macOS, create a
read-only mount with your own tools, select files from that mount for analysis,
and detach the mount you created when finished. REA's inspection mount is
temporary, not a retained export of the image's contents.

For headerless DOS COM, explicitly open with `format: "dos-com"` (CLI
`--target-format dos-com`). Inspect the load image before trusting function
analysis: the entry is `0x10100`, file offset zero, with imposed real-mode segment
context. PSP/stack/device state remains unmodeled. See [DOS guide](https://github.com/morluto/rea/blob/main/docs/ghidra-dos.md).

Use `inspect_byte_entropy` to triage high- and low-entropy ranges before extraction.

For other headerless images (embedded firmware without ELF/Mach-O/PE/MZ
headers), open with `format: "raw-binary"`, `architecture` (`x86`, `x86_64`,
`arm`, `arm64`, `6502`, or `m68k`), and `entry_point` (`0x` hex). File offset 0 is mapped at
that address. Hopper and IDA refuse this interpretation; Ghidra uses
`BinaryLoader` with a generic language: big-endian for `m68k`, little-endian
otherwise. Big-endian ARM, Thumb-only, and Cortex-M variants are unsupported.
`6502` selects NMOS 6502; the entry and complete file mapping must fit within
`0x0000..0xffff`. 65C02, 65816, cartridge containers, bank switching, and mapper
semantics are unsupported. `m68k` requires an even entry and decodes the 68040
superset of the 68000 family; Amiga/Atari containers and vector-table entry
discovery are unsupported. Windows Ghidra P0 admits raw images only for `6502`. See [raw binary guide](https://github.com/morluto/rea/blob/main/docs/raw-binary.md).

Intel HEX, S-record, UF2 and DfuSe files are containers, not raw images:
`inspect_artifact` lists address regions (UF2 per familyID, DfuSe per element
with its alternate setting), and `extract_artifact` writes each region. Open an
extracted region as `raw-binary` with its start address as `entry_point`. UF2
numbering gaps leave coverage unknown; a DfuSe suffix CRC mismatch follows
`integrity_policy`. See [UF2 and DfuSe](https://github.com/morluto/rea/blob/main/docs/uf2-dfuse.md).

### Function annotations in Ghidra

Fresh-import sessions admit annotations; existing-project reuse is read-only.
Use `annotate_native_function` for one function name and/or entry comments, with at least one explicit change. Review its annotation readback and refreshed dossier inline. Changes are atomic and session-scoped; empty comments clear them, omitted fields preserve them. Later MCP calls observe edits until close. CLI `annotate-native-function` returns the updated analysis before discarding the session. Original executable bytes are unchanged; edits invalidate immutable snapshots. Windows P0 does not admit database mutations. For naming only, `set_address_name` / `set_addresses_names` also work with Ghidra: they name function entries or data addresses (primary labels) and return compact per-address success booleans instead of a dossier. Ghidra rejects batch addresses that request the same name or a name another selected address holds; `raw_result.failures` gives each failure's reason.

For `compare_functions`, obtain `analyze_function` Evidence before and after the
edit while the MCP session is open; annotation Evidence is not a comparison
input. Export the needed Evidence before close if comparison will happen later.
Authenticated same-artifact coordinates preserve renamed entries as
`matched / same-entry`, with the canonical `entry_address` inline; name and
exact-text changes remain separate dimensions. This requires compatible
architecture, provider-owned mapping and selected-image commitments. Equal
numeric addresses alone cannot establish correspondence; inspect retained
source Evidence and coverage when the match remains ambiguous.

## Offline PE resource inventory

Use `inspect_pe_resources` with an absolute `path`, or
`rea inspect-pe-resources ./selected.exe --json`, for portable PE32/PE32+
resource inspection without opening a native target. Preserve returned Evidence:
type/name/language IDs and UTF-16 names, original directory/data/payload ranges,
code pages, payload hashes and static icon-group references. Same-language icon
resolution is explicit; missing references and size mismatch remain visible.
Other payloads are opaque, and this operation does not decode images or simulate
Windows resource loading. Consult the budgets and supported tree profile in
[offline binary diagnostics](https://github.com/morluto/rea/blob/main/docs/binary-diagnostics.md).

## Offline PE and ELF export tables

Use `inspect_native_exports` with an absolute `path`, or
`rea inspect-native-exports ./libexample.so --json`, to read a PE export
directory or ELF dynamic symbol table on any host without opening a native
target. Ordinal-only, forwarded and hidden-version exports stay distinct;
partial or unsupported coverage means the inventory is incomplete, not that
exports are absent. Use `inspect_macho` for Mach-O. See
[offline binary diagnostics](https://github.com/morluto/rea/blob/main/docs/binary-diagnostics.md).

For exact core-module import/export differences, use `compare_wasm_interfaces`
with two complete inspection Evidence records (or current-session retained
references) and explicit scope. Preserve unknown types/duplicate names; static
interface equality is not runtime compatibility. CLI accepts complete inline
Evidence in `rea compare-wasm-interfaces input.json --json`, or exact references
with `--evidence-bundle /absolute/path/evidence.json`. Use the complete parent
ID when the inspection returned a summary.

## Godot PCK

For a standalone PCK, `open_binary` then `inspect_artifact` with
`detail: "summary"` retains the complete static inventory. Use the returned
`parent_evidence_id` with `inspect_analysis_view` inventory occurrences filtered
by exact `logical_paths` or `occurrence_ids`, and join `artifact_id` to nodes
filtered by `artifact_ids`. Select only needed fields; identity links remain.
Prefer `inspect-artifact --detail summary --evidence_output PATH` for CLI tasks;
the same CLI discovers embedded packs via their EOF trailer without opening a
native analysis provider. Normal native opening remains unchanged.

Distinguish declared MD5 from observed SHA-256 and graph/page completeness from
`source_coverage`. Encrypted directories and sparse bundles have unknown entry
coverage; encrypted members have unknown content identity. An empty filtered
page cannot prove absence in unknown coverage. Retained views are historical,
not fresh filesystem checks. No decryption, Godot resource decoding, GDScript
decompilation or target execution is provided. See
[Godot PCK](https://github.com/morluto/rea/blob/main/docs/godot-pck.md).

UnityFS AssetBundle containers (`.bundle`, `.ab`, YooAsset packages and other
byte-identified files) list `CAB-*` SerializedFiles and `.resS` members with
header and node facts; none/LZ4/LZ4HC member blocks stream on demand. Bundles
declaring asset-bundle encryption keep header facts with unknown directory
coverage; LZMA member bytes retain named occurrences with unavailable hashes.
Virtual member offsets are not physical carrier locations. Format 6–8 readers
cache one decoded block and support retained filtered/paged views. No
decryption or SerializedFile object decoding is provided. See
[UnityFS](https://github.com/morluto/rea/blob/main/docs/unityfs.md).

U-Boot legacy uImages use the same inspection/extraction workflows. Prefer a
retained summary and selected inventory views for header facts or component
IDs. Header addresses/CPU/OS are declarations; payloads remain as stored.
Multi-file components retain their aligned physical ranges; the full payload
is also materialized. Unknown name text retains its original 32 bytes. See
[U-Boot uImage](https://github.com/morluto/rea/blob/main/docs/uimage.md).

## ESP images

For an ESP32-family app or bootloader image, `open_binary` then
`inspect_artifact` with `detail: "summary"`. `root_format_metadata` holds the
observed `header` and `descriptor` (its `kind` is the app or bootloader role)
and the derived `chip`, `checksum`, `appended_sha256` and
`undescribed_trailing` ranges. Segment rows (`segment-NN.bin`) carry
`load_addr`, `classification` (`mapped`, `loaded`, `not-loaded` or `unknown`,
per ESP-IDF `should_map`/`should_load`; RAM ranges are not checked) and
`source_location`; select them with `inspect_analysis_view` and
`logical_paths`. Signature blocks are `unverified`; `public_key_sha256`
matches eFuse key digests.

Unknown `source_coverage` means truncation or undescribed trailing bytes, such
as the flash segments of a `--ram-only-header` image; do not infer absence
from it. Erased flash is described. Integrity mismatches are facts, not
refusals. ESP8266 images are refused, and flash-encrypted images are not
recognized. Segments are not disassembled, and RISC-V or Xtensa segments
cannot be opened as raw-binary. See
[ESP images](https://github.com/morluto/rea/blob/main/docs/esp-image.md).

## ESP flash images

A whole-flash dump opens as `esp-flash-image`. `root_format_metadata` holds
`partition_table` (its `method`: `default`, `caller` or a derived
`scan`), `bootloader` and `apps` ESP image facts, the `otadata` records,
`partitions_outside_dump` and `boot_selection`. Every table has a
`boot_selection`: its `basis` names the bootloader's branch (`no-otadata`
without otadata, `none` when the bootloader rejects the table, `unknown`
when a record is missing), and it lists its `assumptions`;
`running_partition` is always `unknown`. Each image names its entry
`path`. With `detail: "summary"` the root kind is `esp-flash-image-summary`
and each image is a compact `summary` (chip, entry point, segment count,
classified load ranges, signature block count, descriptor identity,
integrity); complete detail keeps every segment. Partition rows
(`partitions/<label>.bin`) carry the declared `type`, `subtype`, names,
`flash_address`, `size` and flags; `encrypted` is a storage flag, not
proof of ciphertext. `written_offset`/`written_end` bound the bytes that
are not erased: an app slot whose facts say `erased` can still hold an older
image, and a limitation says so. For a dump read from another flash address, call
`open_binary` with `format: "esp-flash-image"` and `flash_offset`; an
`esp-image` whose `flash_dump` is set names that offset in a next probe; a
relocated table can be named with `partition_table_offset`. No table found
means unknown, often flash encryption. Extraction writes `nvs_keys` as
ordinary data. See
[ESP flash images](https://github.com/morluto/rea/blob/main/docs/esp-flash-image.md).

## Bun standalone executables

A `bun build --compile` executable stores its module graph in Mach-O
`__BUN,__bun`, a PE or ELF `.bun` section, or an appended trailer.
`open_binary` then `inspect_artifact` reports root format `bun-standalone` with
the carrier, structural layout, module count, entry point, raw flags and
compile exec-argv; each module keeps its `/$bunfs/...` source name, loader,
encoding, sizes and SHA-256, with sourcemap, bytecode and module-info regions as
separate children. Use summary root metadata `entry_point_logical_path` as the
exact inventory `logical_paths` selector, then read the selected content node by
its artifact ID; the reader owns virtual-name normalization and indexed fallback. `extract-artifact` writes stored contents through the safe
output tree; route extracted JavaScript to `analyze_javascript_application`.
Layout labels describe record shapes, not a detected compiler version; unknown
or ambiguous layouts are unsupported. Bytecode is retained, not decoded, and the
executable is never run. See
[Bun standalone executables](https://github.com/morluto/rea/blob/main/docs/bun-standalone.md).

<!-- /vendor-file -->

<!-- vendor-file: reverse-engineer-anything/references/runtime-observation.md -->
# Runtime observation

## Native runtime questions

Start from the requested observation. State the selected target, input, expected
result, failure signal and stopping condition before a run. Reuse static Evidence
to choose a function or hypothesis; `trace_native_values` follows recovered
static value dependencies and does not measure runtime values. Prefer static
inspection or existing capture comparison when it already answers the question.

| Question                                                                               | Existing workflow                                                                                                                            | Host and effects                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which selected native entry is reached, with which integer argument registers?         | `observe_native_calls` on the active Mach-O, with exact function/Objective-C breakpoints and a duration/event bound                          | macOS with LLDB and required debugger access. Launches a new owned process, stops at entries, records and continues; target execution may write files, show UI or use the network. It never attaches to an existing process. Inspect termination and partial coverage after the run.                                                                  |
| What does caller-authored instrumentation observe?                                     | `list_frida_devices` / `list_frida_processes` when discovery is needed; `start_frida_session`, `load_frida_script`, then status/unload/close | Requires compatible installed Frida bindings and selected device access; the real REA verifier covers Linux. Attach selects an existing PID; spawn selects a program and starts it paused until `resume_frida_session`. Scripts execute in the target and can change memory, files, network activity and behavior. This is not passive inspection.    |
| Which debugger state or controlled execution explains the behavior?                    | `start_gdb_session` and `gdb_console`, or `start_rizin_debug_session` and `rizin_debug_command`                                              | Persistent debugger workflows are Linux-only. GDB starts a debugger; console commands choose/load/attach/run targets. Rizin debug start launches the selected target and requires a durable `inferior_tty`. Both consoles are unrestricted and can change target memory/registers, run shell commands, write files and use the network.               |
| How do terminal output, process lifetime and selected files differ between runs?       | `capture_process_scenario`, then `compare_process_captures` with compatible recorded inputs                                                  | New captures require Linux or macOS and a working native PTY backend; macOS also needs `xcrun`/Swift for ownership inspection. Capture launches an owned command with ordinary user permissions. Observation paths select snapshots, not a filesystem sandbox. Comparing retained captures does not execute targets and is also available on Windows. |
| What does an existing desktop window show, or what changes after a declared UI action? | `observe_native_ui`; use `capture_native_ui_scenario` only for requested actions                                                             | macOS 14+ with required Screen Recording/Accessibility access. Select an existing PID/window. Observation does not launch or own the app; scenario actions can change its data or trigger network activity, and leave its state as-is.                                                                                                                |

Close each persistent session with its matching tool. `close_frida_session`
unloads scripts and detaches; it does not kill the target. A still-paused spawn
is resumed only after instrumentation cleanup is confirmed. GDB and Rizin close
can detach a live inferior and let it continue only after verifying its durable
output terminal. When disposition or cleanup is unresolved, preserve the owned
session and reported recovery; do not assume that closing the debugger terminated
the target. Process capture and LLDB call observation instead own their launched
processes and report their termination/cleanup outcome. Cancellation is not proof
that cleanup completed.

Unrestricted GDB/Rizin commands and relevant start/close operations retire an
active binary-analysis session in the same MCP server. Close an active Ghidra
session explicitly first; after target effects settle, reopen the artifact before
new static analysis. A Cutter bridge command is likewise unrestricted and may
affect its GUI/target; it is not a passive native observation substitute.

To test a static hypothesis across two builds, retain compatible static
comparison Evidence and `compare_process_captures` Evidence. Supply explicit
finding/dimension mappings to `correlate_static_and_runtime`. It does not ingest
arbitrary Frida, LLDB or debugger traces, auto-match names, or prove causality
from cochange. Preserve those traces as their own Evidence and leave unobserved
behavior unknown. Record truncation, unmatched breakpoints, changed target
identity and cleanup uncertainty as limitations, rather than treating no retained
event as proof that the behavior never occurs.

Detailed contracts and prerequisites: [Frida](https://github.com/morluto/rea/blob/main/docs/frida-instrumentation.md),
[GDB/Rizin/Cutter](https://github.com/morluto/rea/blob/main/docs/reverse-engineering-tools.md),
[process capture](https://github.com/morluto/rea/blob/main/docs/process-capture.md),
and [native calls/UI](https://github.com/morluto/rea/blob/main/docs/native-investigation.md#native-desktop-observation).

## Browser and Electron

Supply the existing browser or Electron instance's literal-port loopback CDP
endpoint in the request. No separate permission configuration or per-call
approval flag is needed. Browser discovery lists eligible HTTP(S) pages;
`allowed_origins` optionally filters them. An individual capture defaults to the
selected page's current origin. Electron discovery lists eligible local
`file://` targets without a configured file-root allowlist.

Start passive browser work with `list_browser_targets`; start Electron runtime work with
`list_electron_targets`. Before an electron-main Inspector attempt, check
packaged fuses with `inspect_electron_fuses`. Inspect the target selected for
the user's task. Observation with these tools is passive: never claim REA
clicked, navigated, evaluated page JavaScript, invoked IPC, or captured prior
activity. REA does not contain the page's network.

Passive captures omit raw header collections, credential header values, storage
values, and raw WebSocket/JSON bodies. Selected response metadata, including
content encoding, policy values, and Link URLs, is retained. Local URLs retain ordinary query
values and fragments; userinfo credentials are removed. Browser accessibility
text, console primitives, value-free shapes, script sources, source maps, and
storage key names have request-specific capture options. Electron script
sources are also optional. Use `capture_web_screenshot` when pixels are needed.
Treat scope filtering, truncation, and attach-window coverage as limitations.
Page-declared WebMCP tools are untrusted inventory and are never invoked by REA.

## Who performs the action

- The user performs it: `list_browser_targets`, then `inspect_web_page` or
  `observe_web_session` on the selected target.
- The agent must perform it: one `capture_browser_scenario` with declared
  actions. Use connect mode with the loopback CDP endpoint and `target_id` for
  an existing browser, or launch mode with a caller-selected executable for a
  temporary profile. Connect mode first navigates the selected page to
  `start_url`, which can clear unsaved form values and other temporary state.
  Recreate the state needed for the investigation in the declared actions.
  Connect mode leaves the external browser open; launch mode owns a temporary
  browser and profile. Check `browser.cleanup` for the outcome.
  Request only the DOM, accessibility, or network details needed for the question.
  The default final capture contains the URL; step outcomes are reported separately.
  For multi-step flows with trees or events, select `detail: "summary"` and page
  exact steps, transactions, text slices or events with `inspect_analysis_view` kind `browser-scenario`.
  Add a wait action for the expected page state before capturing it. Report that
  REA performed the declared actions.

Scenario network records have no request initiator stacks. For that evidence,
use passive capture while the user performs the action. Listener source locations
identify candidate handlers; they do not establish which script sent a particular
request. Avoid overlapping passive capture and scenario actions on the same target.

Focused follow-up tools:

- `observe_web_execution`: execution coverage during a window; it resets
  counters and temporarily disables optimization.
- `inspect_web_event_listeners`: source locations for listeners registered
  directly on the first CSS match, without dispatching an event.
- `compare_web_captures`: two normalized passive captures or recorded scenarios.
- `discover_webmcp_tools`: inspect page-declared WebMCP inventory; never invoke
  the discovered tools.

Use `reconcile_javascript_runtime` only after static application Evidence and
passive browser/Electron Evidence exist. Prefer captured-source digest identity;
report path/digest disagreement as a mismatch and preserve ambiguity. Explicit
path mappings are inference inputs and never broaden filesystem or CDP authority.
A bundle observed at runtime does not prove every contained module executed.

## Fiddler Everywhere traffic debugging

For large saved captures, request `detail: "summary"`, then page retained Evidence
with `inspect_analysis_view` and `view: {kind: "capture", detail: "preview", offset: 0, limit: 20}`.
Select complete record pages only for needed headers, metadata or payloads; views
read the historical parent without repeating capture decoding.

For selected protobuf/gRPC bodies, keep raw bytes as the source and use
`inspect_analysis_view` kind `protobuf`, collection `bodies`, `frames` or
`fields`. Batch exact record ordinals and field numbers/IDs, and select
`schema_value` or `text` only when needed. Supply a local descriptor set and
message type for schema interpretation; compressed payloads remain unknown.

Inspect native `.saz` snapshots with `inspect_web_network_capture` and
`format: "saz"`; encrypted archives are unsupported. For live
traffic analysis, connect Everywhere's separate MCP server and use its
advertised session tools with an explicit `sessionsSource` (`LiveTraffic` or
`AgentCalls`). Preserve existing sessions and filters when inspecting a
recorded run. See the [capture and MCP guide](https://github.com/morluto/rea/blob/main/docs/web-network-captures.md)
for the workflow and Telerik's public setup and traffic-debugging skills.

<!-- /vendor-file -->

