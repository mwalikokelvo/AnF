// GGML / kimi-k3-in-c / llama.cpp-grade TypedArray Quantized Tensor Engine.
// Implements Q4_0 and Q8_0 block quantization, vector dot products, SwiGLU, and Softmax.

export const QK4_0 = 32;
export const QK8_0 = 32;

/**
 * Converts 16-bit float (IEEE 754 half-precision) to 32-bit float.
 */
export function fp16ToFp32(h: number): number {
  const s = (h >> 15) & 0x0001;
  const e = (h >> 10) & 0x001f;
  const f = h & 0x03ff;

  if (e === 0) {
    return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
  } else if (e === 0x1f) {
    return f ? NaN : (s ? -Infinity : Infinity);
  }
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}

/**
 * Converts 32-bit float to 16-bit float (half-precision).
 */
export function fp32ToFp16(val: number): number {
  const f32 = new Float32Array([val]);
  const u32 = new Uint32Array(f32.buffer)[0];
  const sign = (u32 >> 16) & 0x8000;
  const mantissa = u32 & 0x007fffff;
  const exp = (u32 >> 23) & 0xff;

  if (exp >= 143) {
    return sign | 0x7c00; // overflow to infinity
  } else if (exp <= 112) {
    return sign; // underflow to 0
  }
  const newExp = exp - 112;
  return sign | (newExp << 10) | (mantissa >> 13);
}

/**
 * Quantizes an array of Float32Array values (length must be multiple of 32) into Q8_0 format.
 * Each block: 2 bytes fp16 delta scale + 32 int8 quantized weights = 34 bytes.
 */
export function quantizeFp32ToQ8_0(input: Float32Array): Uint8Array {
  const n = input.length;
  if (n % QK8_0 !== 0) {
    throw new Error(`Length must be multiple of ${QK8_0}, got ${n}`);
  }
  const numBlocks = n / QK8_0;
  const out = new Uint8Array(numBlocks * 34);
  const view = new DataView(out.buffer);

  for (let b = 0; b < numBlocks; b++) {
    const offset = b * QK8_0;
    let amax = 0;
    for (let i = 0; i < QK8_0; i++) {
      const v = Math.abs(input[offset + i]);
      if (v > amax) amax = v;
    }

    const d = amax / 127;
    const id = d !== 0 ? 1.0 / d : 0;
    const fp16Delta = fp32ToFp16(d);
    view.setUint16(b * 34, fp16Delta, true);

    for (let i = 0; i < QK8_0; i++) {
      const val = input[offset + i];
      const q = Math.max(-128, Math.min(127, Math.round(val * id)));
      view.setInt8(b * 34 + 2 + i, q);
    }
  }

  return out;
}

/**
 * Quantizes Float32Array values into Q4_0 format.
 * Each block: 2 bytes fp16 delta scale + 16 bytes (32 nibbles) = 18 bytes.
 */
export function quantizeFp32ToQ4_0(input: Float32Array): Uint8Array {
  const n = input.length;
  if (n % QK4_0 !== 0) {
    throw new Error(`Length must be multiple of ${QK4_0}, got ${n}`);
  }
  const numBlocks = n / QK4_0;
  const out = new Uint8Array(numBlocks * 18);
  const view = new DataView(out.buffer);

  for (let b = 0; b < numBlocks; b++) {
    const offset = b * QK4_0;
    let amax = 0;
    for (let i = 0; i < QK4_0; i++) {
      const v = Math.abs(input[offset + i]);
      if (v > amax) amax = v;
    }

    const d = amax !== 0 ? amax / 7.0 : 1.0;
    const id = 1.0 / d;
    view.setUint16(b * 18, fp32ToFp16(d), true);

    for (let i = 0; i < 16; i++) {
      const v0 = input[offset + i];
      const v1 = input[offset + i + 16];
      const q0 = Math.max(-8, Math.min(7, Math.round(v0 * id))) + 8;
      const q1 = Math.max(-8, Math.min(7, Math.round(v1 * id))) + 8;
      out[b * 18 + 2 + i] = (q0 & 0x0f) | ((q1 & 0x0f) << 4);
    }
  }

  return out;
}

/**
 * Dequantizes Q4_0 blocks back into Float32Array.
 */
export function dequantizeQ4_0(q4Bytes: Uint8Array, outFp32: Float32Array): void {
  const numBlocks = q4Bytes.byteLength / 18;
  const view = new DataView(q4Bytes.buffer, q4Bytes.byteOffset, q4Bytes.byteLength);

  for (let b = 0; b < numBlocks; b++) {
    const d = fp16ToFp32(view.getUint16(b * 18, true));
    const blockOffset = b * 18 + 2;
    const outOffset = b * QK4_0;

    for (let i = 0; i < 16; i++) {
      const byte = q4Bytes[blockOffset + i];
      const q0 = (byte & 0x0f) - 8;
      const q1 = ((byte >> 4) & 0x0f) - 8;
      outFp32[outOffset + i] = q0 * d;
      outFp32[outOffset + i + 16] = q1 * d;
    }
  }
}

/**
 * Fast Q4_0 x Q8_0 dot-product (simulating GGML vec_dot_q4_0_q8_0).
 */
export function vecDotQ4_0_Q8_0(q4Bytes: Uint8Array, q8Bytes: Uint8Array, numBlocks: number): number {
  const q4View = new DataView(q4Bytes.buffer, q4Bytes.byteOffset, q4Bytes.byteLength);
  const q8View = new DataView(q8Bytes.buffer, q8Bytes.byteOffset, q8Bytes.byteLength);
  let totalSum = 0;

  for (let b = 0; b < numBlocks; b++) {
    const d4 = fp16ToFp32(q4View.getUint16(b * 18, true));
    const d8 = fp16ToFp32(q8View.getUint16(b * 34, true));

    let blockSum = 0;
    const q4Base = b * 18 + 2;
    const q8Base = b * 34 + 2;

    for (let i = 0; i < 16; i++) {
      const byte = q4Bytes[q4Base + i];
      const q4_0 = (byte & 0x0f) - 8;
      const q4_1 = ((byte >> 4) & 0x0f) - 8;

      const q8_0 = q8View.getInt8(q8Base + i);
      const q8_1 = q8View.getInt8(q8Base + i + 16);

      blockSum += q4_0 * q8_0 + q4_1 * q8_1;
    }

    totalSum += blockSum * (d4 * d8);
  }

  return totalSum;
}

/**
 * SwiGLU activation kernel: swish(x) * gate = (x / (1 + exp(-x))) * gate.
 */
export function swiglu(x: Float32Array, gate: Float32Array, out: Float32Array): void {
  const n = x.length;
  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const swish = xi / (1.0 + Math.exp(-xi));
    out[i] = swish * gate[i];
  }
}

/**
 * In-place Softmax kernel with numerical stability subtraction.
 */
export function softmaxInplace(logits: Float32Array): void {
  const n = logits.length;
  let maxVal = -Infinity;
  for (let i = 0; i < n; i++) {
    if (logits[i] > maxVal) maxVal = logits[i];
  }

  let sumExp = 0;
  for (let i = 0; i < n; i++) {
    const expVal = Math.exp(logits[i] - maxVal);
    logits[i] = expVal;
    sumExp += expVal;
  }

  const invSum = sumExp !== 0 ? 1.0 / sumExp : 0;
  for (let i = 0; i < n; i++) {
    logits[i] *= invSum;
  }
}
