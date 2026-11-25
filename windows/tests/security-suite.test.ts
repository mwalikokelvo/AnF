// Tests for Security & Audit Suite (Secret scanner, Code auditor, CSP auditor, Dependency auditor)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scanTextForSecrets,
  redactSecrets,
  calculateShannonEntropy,
} from '../src/workspace/security/secret-scanner.js';
import { auditSourceCode } from '../src/workspace/security/code-security-auditor.js';
import { auditCspDirectives, parseCspString } from '../src/workspace/security/csp-origin-auditor.js';
import { auditDependencies } from '../src/workspace/security/dependency-auditor.js';

test('Security Suite - Gitleaks-grade Secret Scanner & Shannon Entropy', async (t) => {
  await t.test('calculates Shannon entropy correctly', () => {
    assert.equal(calculateShannonEntropy(''), 0);
    assert.equal(calculateShannonEntropy('aaaaa'), 0);
    // High entropy random string should be > 4.0
    const highEntropy = calculateShannonEntropy('g8K9!vL2#mP0$xQ4&wZ7*jR1^tY5');
    assert.ok(highEntropy > 4.2);
  });

  await t.test('detects Anthropic API key and redacts cleanly', () => {
    const rawKey = 'sk-ant-api03-1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqr';
    const text = `User prompt config with key: ${rawKey} in header`;
    const findings = scanTextForSecrets(text);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].type, 'Anthropic API Key');
    assert.equal(findings[0].severity, 'critical');

    const redacted = redactSecrets(text);
    assert.ok(!redacted.includes(rawKey));
    assert.ok(redacted.includes('[REDACTED_ANTHROPIC_API_KEY]'));
  });

  await t.test('detects OpenAI, GitHub, and AWS credentials', () => {
    const text = [
      'OPENAI_KEY=sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWX',
      'GH_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwx',
      'AWS_ID=AKIAIOSFODNN7EXAMPLE',
    ].join('\n');

    const findings = scanTextForSecrets(text);
    assert.equal(findings.length, 3);
    const types = findings.map(f => f.type);
    assert.ok(types.includes('OpenAI API Key'));
    assert.ok(types.includes('GitHub Token'));
    assert.ok(types.includes('AWS Access Key ID'));
  });
});

test('Security Suite - Semgrep-style Desktop Code Security Auditor', async (t) => {
  await t.test('detects dangerous innerHTML and eval calls', () => {
    const sampleCode = `
      function renderUserCard(name) {
        // Safe comment
        document.getElementById('card').innerHTML = name + '<b>active</b>';
        const fn = eval('2 + 2');
        return fn;
      }
    `;
    const report = auditSourceCode('renderer.js', sampleCode);
    assert.equal(report.passed, false);
    assert.equal(report.issues.length, 2);
    assert.equal(report.issues[0].category, 'xss');
    assert.equal(report.issues[1].category, 'unsafe_eval');
    assert.ok(report.score < 70);
  });

  await t.test('passes clean sanitized code without false positives', () => {
    const cleanCode = `
      function safeSetText(el, text) {
        el.textContent = text;
        const normalized = path.normalize(safePath);
      }
    `;
    const report = auditSourceCode('clean.js', cleanCode);
    assert.equal(report.passed, true);
    assert.equal(report.issues.length, 0);
    assert.equal(report.score, 100);
  });
});

test('Security Suite - Cloudflare-grade CSP & Origin Auditor', async (t) => {
  await t.test('flags unsafe-eval, unsafe-inline, and wildcard connect-src', () => {
    const dangerousCsp = "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; connect-src *";
    const report = auditCspDirectives(dangerousCsp);
    assert.equal(report.valid, false);
    assert.ok(report.findings.length >= 3);
    assert.ok(report.score < 50);
  });

  await t.test('passes strict locked-down CSP', () => {
    const strictCsp = "default-src 'self'; script-src 'self'; object-src 'none'; connect-src 'self' https://api.adviceslip.com";
    const report = auditCspDirectives(strictCsp);
    assert.equal(report.valid, true);
    assert.equal(report.findings.length, 0);
    assert.equal(report.score, 100);
  });
});

test('Security Suite - Trivy-grade Dependency & SBOM Auditor', async (t) => {
  await t.test('flags known vulnerable dependencies and builds SBOM', () => {
    const manifest = {
      dependencies: {
        'lodash': '4.17.15',
        'event-stream': '3.3.6',
        'express': '4.18.2',
      },
      devDependencies: {
        'typescript': '5.4.2',
      },
    };
    const report = auditDependencies(manifest);
    assert.equal(report.totalDependencies, 4);
    assert.equal(report.vulnerableCount, 2);
    assert.equal(report.compliancePass, false); // event-stream is critical

    const sbom = report.sbom;
    assert.equal(sbom.length, 4);
    assert.ok(sbom.some(s => s.name === 'lodash'));
  });
});
