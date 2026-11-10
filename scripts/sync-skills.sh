#!/usr/bin/env bash
set -e
echo "[AnF] Syncing and updating agent skills..."
npm update -g skills || true
skills update -y || true
skills update -g -y || true
echo "[AnF] Agent skills and CLI are up to date."
