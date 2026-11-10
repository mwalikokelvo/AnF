---
name: appflowy
description: Open-source, local-first workspace and knowledge management platform (Notion alternative). Use when architecting local-first data storage, document editors, kanban boards, grid databases, or syncing structured offline workspaces.
metadata:
  homepage: https://github.com/appflowy-io/appflowy
---

# AppFlowy — Local-First Open Workspace

AppFlowy is an open-source, local-first alternative to Notion built with Flutter and Rust. It emphasizes user data privacy, native performance, and offline-first database synchronization.

## Core Capabilities

1. **Local-First Architecture**
   - Offline-native SQLite and CRDT-based storage engines.
   - Zero vendor lock-in: files stored in accessible open formats (JSON, SQLite, Markdown).
   - End-to-end encrypted peer-to-peer or self-hosted sync (AppFlowy Cloud / Supabase).

2. **Document & Database Modeling**
   - Block-based document editor supporting headings, code blocks, tables, callouts, and math.
   - Relational grid views, Kanban boards, calendar views, and database filters/sorts.
   - Extensible plugins and custom field attributes.

3. **Application in AnF & Desktop Platforms**
   - Reference implementation for cross-platform Flutter/Rust desktop integration.
   - Clean separation of UI rendering from native Rust data engines via FFI.
