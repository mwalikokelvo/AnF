#!/usr/bin/env bash
set -euo pipefail

echo "==> Running Ponytail Debloater..."
npx ponytail-cli refactor --aggressive

echo "==> Running Pstack Simplification Sub-Skills..."
npx pstack-cli run unslop
npx pstack-cli run no-comment
npx pstack-cli run typescript-best-practices

echo "==> Running Thermonuclear Code Quality Review..."
npx thermonuclear-review-cli --verify-minimal-diff

echo "==> Maintaining verification skills..."
npx pstack-cli maintain-verification-skill
