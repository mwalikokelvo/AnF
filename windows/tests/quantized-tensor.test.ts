// Tests for TypedArray Quantized Tensor Engine (kimi-k3-in-c / llama.cpp inspired)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fp16ToFp32,
  fp32ToFp16,
  quantizeFp32ToQ8_0,
  quantizeFp32ToQ4_0,
  dequantizeQ4_0,
  vecDotQ4_0_Q8_0,
  swiglu,
  softmaxInplace,
} from '../src/workspace/inference/quantized-tensor.js';

test('Tensor Suite - Float16 Half-Precision Roundtrip', async (t) => {
  await t.test('converts positive and negative numbers accurately', () => {
    const testVals = [0.0, 1.0, -1.0, 0.5, 3.140625, -15.5];
    for (const val of testVals) {
      const h = fp32ToFp16(val);
      const restored = fp16ToFp32(h);
      assert.ok(Math.abs(val - restored) < 0.01, `Failed for ${val}, got ${restored}`);
    }
  });
});

test('Tensor Suite - Q4_0 & Q8_0 Quantization and Dot Product', async (t) => {
  await t.test('quantizes and dequantizes Q4_0 with bounded error', () => {
    const input = new Float32Array(32);
    for (let i = 0; i < 32; i++) {
      input[i] = (i - 16) * 0.1; // -1.6 to +1.5
    }

    const q4 = quantizeFp32ToQ4_0(input);
    assert.equal(q4.length, 18); // 1 block = 18 bytes

    const output = new Float32Array(32);
    dequantizeQ4_0(q4, output);

    for (let i = 0; i < 32; i++) {
      assert.ok(Math.abs(input[i] - output[i]) < 0.15, `Index ${i} error too high: expected ${input[i]}, got ${output[i]}`);
    }
  });

  await t.test('computes vec_dot_q4_0_q8_0 accurately against reference dot product', () => {
    const len = 64; // 2 blocks
    const vecA = new Float32Array(len);
    const vecB = new Float32Array(len);

    let expectedDot = 0;
    for (let i = 0; i < len; i++) {
      vecA[i] = 1.0 + Math.sin(i * 0.2);
      vecB[i] = 1.0 + Math.cos(i * 0.2);
      expectedDot += vecA[i] * vecB[i];
    }

    const q4 = quantizeFp32ToQ4_0(vecA);
    const q8 = quantizeFp32ToQ8_0(vecB);
    const actualDot = vecDotQ4_0_Q8_0(q4, q8, 2);

    // Quantized dot product should be close to floating point dot product
    const relDiff = Math.abs(expectedDot - actualDot) / Math.abs(expectedDot);
    assert.ok(relDiff < 0.08, `Dot product relative error too large: expected ${expectedDot}, got ${actualDot}`);
  });
});

test('Tensor Suite - SwiGLU & Softmax Kernels', async (t) => {
  await t.test('swiglu computes (x * sigmoid(x)) * gate correctly', () => {
    const x = new Float32Array([0.0, 1.0, -1.0]);
    const gate = new Float32Array([2.0, 2.0, 2.0]);
    const out = new Float32Array(3);

    swiglu(x, gate, out);

    // For x=0: 0 * sigmoid(0) * 2 = 0
    assert.equal(out[0], 0);
    // For x=1: 1 / (1 + exp(-1)) * 2 ~ 0.731058 * 2 = 1.4621
    assert.ok(Math.abs(out[1] - 1.462) < 0.01);
  });

  await t.test('softmaxInplace normalizes logits to probability distribution summing to 1', () => {
    const logits = new Float32Array([2.0, 1.0, 0.1]);
    softmaxInplace(logits);

    let sum = 0;
    for (let i = 0; i < logits.length; i++) {
      assert.ok(logits[i] > 0 && logits[i] < 1);
      sum += logits[i];
    }
    assert.ok(Math.abs(sum - 1.0) < 1e-5);
    // logits[0] was largest, should have highest probability
    assert.ok(logits[0] > logits[1] && logits[1] > logits[2]);
  });
});
