# OmniRoute connection

AnF 0.1.33 adds an optional managed local gateway on Windows. The
bundled offline AI remains the default and needs no provider API key. A separate
external gateway connection remains available for your own services.

## Managed local gateway (Windows preview)

1. Download and extract the separately supplied
   `AnF-OmniRoute-3.8.51-Windows-x64.zip`. Keep its folders together.
2. Open Settings → Connected services → AI gateway · OmniRoute → Managed
   OmniRoute. Choose the extracted `component/component.json`, then choose
   **Install optional component**. AnF verifies the pinned manifest and every
   runtime file before installing its own private copy. The first installation
   can take several minutes; progress and cancellation remain available.
3. Choose **Start managed gateway**. Startup verifies the installed files again,
   then starts a private loopback service. No global Node installation, provider
   account or user-entered API key is needed. AnF creates its service credentials
   locally and reuses the bundled Fast model rather than downloading another one.
4. Choose **Use managed local AI in Chat**, enter a question and choose
   **Ask selected AI**. A running status means the route is configured; an actual
   answer verifies generation. This managed profile currently offers local Fast
   inference, with a 768-token output limit. Use Continue for a longer answer.
5. **Stop managed gateway** stops the owned service. Closing AnF also terminates
   it. A stopped route reports an error rather than silently changing providers.

Your saved external gateway connection is preserved. Installing or starting the
managed service does not select it automatically, change external credentials,
or enable cloud models. Component replacement/update and Android managed-runtime
support remain future work. The component archive includes upstream notices and
corresponding source archives; private recordings and voice models are excluded.

## Local setup

1. Install Node.js 24 LTS. Review the [official setup](https://github.com/diegosouzapw/OmniRoute#-quick-start).
   The tested gateway version is **3.8.51**: `npm install -g omniroute@3.8.51`.
   That installation downloads its own dependency set; it is not part of AnF's installer.
2. In PowerShell, set `$env:OMNIROUTE_SERVER_HOST='127.0.0.1'`, then run
   `omniroute serve --no-open --no-tray`. Open its dashboard at
   `http://127.0.0.1:20128` and complete its authentication setup.
3. Add an authorized provider in OmniRoute. For a local model, add a custom
   OpenAI-compatible provider with a distinct prefix, Chat Completions API type
   and the model server's `/v1` base URL. Test the provider connection and discover
   or add its models there. Even a keyless local server needs a provider connection
   record in OmniRoute; follow its dashboard flow. AnF's bundled model is managed
   by AnF for its offline mode, and is not exposed automatically as a gateway server.
4. Create an OmniRoute gateway API key. In AnF Settings → Connected services →
   AI gateway · OmniRoute, enter `http://127.0.0.1:20128/v1` and that gateway key,
   enable and save. Provider account credentials belong in OmniRoute, not AnF.
5. Choose **Discover gateway models**, select an explicit provider/model and save
   again. The saved route is shown alongside the origin and credential status.
   A catalog check proves connectivity/authentication, not successful generation.
6. Optionally choose **Run gateway generation check**. It sends only a small fixed
   prompt, with a 256-token completion budget, and reports the actual selected
   model and origin. Cloud providers can charge for this request. No document or
   conversation content is included, and there is no automatic retry.
7. In Chat, select **Configured AI gateway** and choose **Ask selected AI**.
   Only then does AnF send the question and selected context to the saved gateway.

Cloud free tiers are controlled by their providers and can require accounts,
credentials, eligibility or payment. OmniRoute does not grant unlimited or
key-free access to commercial models. Explicit `auto` or combo IDs can cause
gateway-side provider changes; use a provider/model ID to pin the requested route.
AnF never silently chooses `auto`, retries a failed request or falls back to cloud.

## Bounds and errors

Discovery uses `/v1/models`, a 15-second deadline and a 2 MB response limit.
Up to 2,000 catalog entries are accepted; at most 200 distinct valid model IDs
are displayed in sorted order. Oversized or malformed catalogs fail visibly.
IDs are bounded to 160 ASCII identifier characters and rendered as text.
Models beyond the display limit can be entered explicitly, or the gateway's
exported catalog can be narrowed. Catalogs may include non-chat models: a model
listing alone does not prove Chat Completions support or available credentials.

Generation uses a 180-second deadline and a 4,096-token completion budget for
Chat. Time or context limits can end an answer; use Continue where appropriate.
Cancel drops the in-flight HTTP request. The gateway/provider may already have
performed billable work. Authentication, permission, rate-limit and redirect
errors fail visibly; response error bodies and saved secrets are not exposed.
Changing the connection origin requires a new secret or explicit credential clear.

## Verification recorded 2026-10-19

Pinned npm package integrity:
`sha512-VwwSt+bP9lJiPJXFJMz0nNGGuoewPZU3nFe1SLuO11ADgdSwTegGCxhg8Ov75+31m/cocPxHiO63zygn1XQ0MQ==`.
The test runtime used its own DATA_DIR, generated credentials and loopback ports;
it did not read user provider accounts, installed instances or AnF's saved keys.
An actual OmniRoute custom provider routed `anflocal/anf-local-fast` to the
existing bundled `model-fast.gguf` through a separately launched llama-server.
The native AnF live adapter test discovered that model and generated a new answer
in 9.90 seconds. Thirteen focused native tests passed, covering message retention,
catalog validation, authentication, 429 handling, cancellation and existing adapters.

The browser live-flow test serves the actual workspace UI and exercises discovery,
model selection, saving and Chat against that real gateway. Its IPC persistence
is an isolated in-memory fixture; native HTTP behavior is verified separately.
It must not be described as an installed native UI test.

Run `scripts/app-qa/omniroute-live.mjs` with `ANF_UI_URL` pointing to a local
workspace dev server and `ANF_LIVE_GATEWAY_URL`, `ANF_LIVE_GATEWAY_MODEL`,
`ANF_LIVE_GATEWAY_KEY` referring only to an isolated authorized test instance.
The ignored Rust `connections::tests::live_omniroute_selected_model_generates`
test uses the same three gateway variables. Never run it against user instances.

Upstream references: [OpenAI compatibility](https://github.com/diegosouzapw/OmniRoute/wiki/Openai-Compatibility),
[3.8.51 provider-node API](https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.51/src/app/api/provider-nodes/route.ts),
[3.8.51 environment contract](https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.51/.env.example).

## Repair the reviewed local component (Windows 0.1.36)

Stop the managed gateway in Settings. Extract the same published optional 3.8.51 component ZIP into a separate folder, choose its component.json, then select Repair installed component. Keep that extracted source separate from AnF's private managed directory. Repair verifies the complete payload and can take several minutes; wait for the repaired/stopped status before starting it. It does not accept arbitrary runtime versions or change your external gateway connections.

Startup or a new import/repair recovers a pending transaction while stopped. Unexpected links, ambiguous copies and failed accepted verification are preserved for inspection. Keep those files when reporting a failure; do not manually delete a pending transaction or the only installed copy. If a crashed owned gateway still causes a stop-before-repair message, quit AnF completely and reopen it before retrying. Explicit stale-process-state controls remain a follow-up. Component version upgrades remain a separate reviewed release task.
