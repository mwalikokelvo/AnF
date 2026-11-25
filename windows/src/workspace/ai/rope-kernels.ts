/**
 * Rotary Positional Embeddings (RoPE) & RMSNorm Math Kernels
 * 
 * Provides pure Float32Array implementations of foundational transformer kernels:
 * Root Mean Square Normalization (RMSNorm), Rotary Positional Embeddings (RoPE),
 * and Scaled Dot-Product Attention with Softmax.
 * 
 * Inspired by jingyaogong/minimind pure micro-transformer architectures.
 */

export class NanoTransformerKernels {
  /**
   * Root Mean Square Normalization (RMSNorm)
   */
  public static rmsNorm(
    x: Float32Array,
    gamma: Float32Array,
    eps = 1e-6
  ): Float32Array {
    const d = x.length;
    let sumSq = 0;
    for (let i = 0; i < d; i++) {
      sumSq += x[i] * x[i];
    }
    const rms = Math.sqrt((sumSq / d) + eps);
    const out = new Float32Array(d);
    for (let i = 0; i < d; i++) {
      out[i] = (x[i] / rms) * gamma[i];
    }
    return out;
  }

  /**
   * Applies Rotary Positional Embeddings (RoPE) to a query or key vector at position `pos`
   */
  public static applyRoPE(
    vector: Float32Array,
    pos: number,
    base = 10000.0
  ): Float32Array {
    const d = vector.length;
    const out = new Float32Array(d);

    // RoPE operates on consecutive coordinate pairs (2i, 2i+1)
    for (let i = 0; i < d / 2; i++) {
      const theta = Math.pow(base, -2 * i / d);
      const angle = pos * theta;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const x0 = vector[2 * i];
      const x1 = vector[2 * i + 1];

      // 2D Givens rotation matrix: [cos, -sin; sin, cos]
      out[2 * i] = x0 * cosA - x1 * sinA;
      out[2 * i + 1] = x0 * sinA + x1 * cosA;
    }

    return out;
  }

  /**
   * Numerically stable Softmax across an array of logits
   */
  public static softmax(logits: Float32Array): Float32Array {
    const n = logits.length;
    let maxVal = -Infinity;
    for (let i = 0; i < n; i++) {
      if (logits[i] > maxVal) maxVal = logits[i];
    }

    const expVals = new Float32Array(n);
    let sumExp = 0;
    for (let i = 0; i < n; i++) {
      const e = Math.exp(logits[i] - maxVal);
      expVals[i] = e;
      sumExp += e;
    }

    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = expVals[i] / (sumExp || 1);
    }
    return out;
  }

  /**
   * Scaled Dot-Product Attention for a single Query against multiple Keys and Values
   */
  public static scaledDotProductAttention(
    q: Float32Array,
    keys: Float32Array[],
    values: Float32Array[]
  ): Float32Array {
    const numKeys = keys.length;
    const dK = q.length;
    const scale = 1.0 / Math.sqrt(dK);

    const logits = new Float32Array(numKeys);
    for (let i = 0; i < numKeys; i++) {
      const k = keys[i];
      let dot = 0;
      for (let j = 0; j < dK; j++) {
        dot += q[j] * k[j];
      }
      logits[i] = dot * scale;
    }

    const weights = this.softmax(logits);
    const dV = values[0].length;
    const out = new Float32Array(dV);

    for (let i = 0; i < numKeys; i++) {
      const w = weights[i];
      const v = values[i];
      for (let j = 0; j < dV; j++) {
        out[j] += w * v[j];
      }
    }

    return out;
  }
}
