# ThingsBook Voice Contract v1 (`thingsbook-voice-v1`)

Status: normative for Phase 9. Defines the cross-device wire protocol and packaging format for voice memos, executive briefings, and spoken reminders between AnF and ThingsBook endpoints.

Hosts must not link or point at `_core` (the internal ThingsBook crate). All exchanges must use the versioned wire format defined here.

## 1. Identity & Format

| Field | Rule |
| --- | --- |
| Protocol version | `"thingsbook-voice-v1"` |
| Package extension | `.anfvoice` or `.json` wire envelope |
| Encoding | UTF-8, no BOM |
| Checksum | SHA-256 hex string over serialized item payload |
| Transport | Authenticated local Wi-Fi pairing (`local_link.rs`) or encrypted file envelope |

## 2. Package Envelope

```json
{
  "version": "thingsbook-voice-v1",
  "exportedAt": 1773830000000,
  "deviceId": "anf-windows-01",
  "items": [],
  "briefings": [],
  "reminders": []
}
```

### Top-Level Fields

| Field | Type | Description |
| --- | --- | --- |
| `version` | string | Exact string `"thingsbook-voice-v1"`. Unsupported versions fail with clear error. |
| `exportedAt` | integer | Milliseconds since Unix epoch. Must be positive finite integer. |
| `deviceId` | string | Originating device identifier (≤ 64 characters). |
| `items` | array | Array of `VoiceItem` records. |
| `briefings` | array | Array of `VoiceBriefing` records. |
| `reminders` | array | Array of `VoiceReminder` records. |

## 3. Data Structures

### VoiceItem

Represents a spoken transcript, recorded audio clip, or voice memo.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | Unique ID (UUIDv4 or 64 hex characters). |
| `timestamp` | integer | Yes | Milliseconds since Unix epoch. |
| `durationMs` | integer | Yes | Duration in milliseconds (≥ 0, ≤ 3,600,000). |
| `transcript` | string | Yes | Spoken or transcribed text (≤ 50,000 characters). |
| `audioMime` | string | No | Audio MIME type (`audio/wav`, `audio/ogg`, `audio/webm`). |
| `audioBase64` | string | No | Optional base64-encoded audio payload (≤ 15 MB). |
| `tags` | array | No | Array of category or project tags (strings ≤ 32 chars). |
| `checksum` | string | Yes | SHA-256 hex digest of `id:timestamp:transcript`. |

### VoiceBriefing

Represents an aggregated executive briefing card.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | Unique briefing ID. |
| `date` | string | Yes | ISO date string (`YYYY-MM-DD`). |
| `summary` | string | Yes | Executive briefing summary (≤ 5,000 characters). |
| `chunks` | array | Yes | Array of capability summaries `{ title, text, source }`. |
| `generatedAt` | integer | Yes | Milliseconds since Unix epoch. |

### VoiceReminder

Represents an action trigger or spoken reminder.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | Unique reminder ID. |
| `message` | string | Yes | Spoken reminder text. |
| `triggerAt` | integer | Yes | Target timestamp in milliseconds since epoch. |
| `completed` | boolean | Yes | Whether the reminder has been acknowledged. |
| `createdAt` | integer | Yes | Milliseconds since Unix epoch. |

## 4. Conflict Resolution & Merging

When merging packages from multiple devices:
1. **Voice Items**: Union by `id`. If duplicate `id` exists with different content, newer `timestamp` wins; both versions retained in history if differences exceed whitespace.
2. **Briefings**: Keyed by `date`. Latest `generatedAt` wins for that date.
3. **Reminders**: Union by `id`. If one replica has `completed: true`, status resolves to `completed: true` (monotonically progressive completion).

## 5. Security & Isolation

- Raw audio payloads stay within the local network or encrypted vault files. Zero cloud transmission.
- Deserializer strictly validates types, string lengths, and checksums before ingesting into memory.
- Packages exceeding 25 MB are rejected with an explicit error.
