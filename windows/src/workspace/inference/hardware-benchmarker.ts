/**
 * Hardware Micro-Benchmarking Probe (Frontier 1 - Magnitude Architecture)
 * 
 * Executes micro-second synthetic GEMM and memory bandwidth benchmarks
 * to empirically calibrate on-device inference parameters (quantization,
 * batch size, speculative draft steps, and context length).
 */

export interface BenchmarkResult {
  gflops: number;
  memoryBandwidthGBs: number;
  elapsedMs: number;
  concurrency: number;
  recommendations: {
    recommendedQuantization: 'q4_k_m' | 'q8_0' | 'f16';
    optimalBatchSize: number;
    maxContextTokens: number;
    speculativeDraftSteps: number;
  };
}

/**
 * Executes a targeted 10-20ms GEMM (matrix multiplication) probe.
 * Size: 64x64 matrices (Float32Array) repeated N times.
 * Total FLOPs per pass = 2 * N^3 = 2 * 64 * 64 * 64 = 524,288 FLOPs.
 */
export function runMicroGEMM(iterations = 40, size = 64): { gflops: number; elapsedMs: number } {
  const n = size;
  const a = new Float32Array(n * n);
  const b = new Float32Array(n * n);
  const c = new Float32Array(n * n);

  // Initialize with pseudo-random non-zero values
  for (let i = 0; i < n * n; i++) {
    a[i] = (i % 17) * 0.1;
    b[i] = (i % 23) * 0.1;
  }

  const start = performance.now();
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      const iOffset = i * n;
      for (let k = 0; k < n; k++) {
        const aVal = a[iOffset + k];
        const kOffset = k * n;
        for (let j = 0; j < n; j++) {
          c[iOffset + j] += aVal * b[kOffset + j];
        }
      }
    }
  }
  const end = performance.now();
  const elapsedMs = Math.max(0.001, end - start);
  const totalFlops = iterations * 2 * n * n * n;
  const gflops = (totalFlops / (elapsedMs / 1000)) / 1e9;

  return { gflops, elapsedMs };
}

/**
 * Executes a memory throughput streaming AXPY probe: y[i] = a * x[i] + y[i]
 * Measures empirical memory read/write bandwidth in GB/s.
 */
export function runMemoryBandwidthProbe(iterations = 50, bufferElements = 65536): { bandwidthGBs: number; elapsedMs: number } {
  const x = new Float32Array(bufferElements);
  const y = new Float32Array(bufferElements);
  const alpha = 1.05;

  for (let i = 0; i < bufferElements; i++) {
    x[i] = (i % 31) * 0.5;
    y[i] = (i % 19) * 0.2;
  }

  const start = performance.now();
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < bufferElements; i++) {
      y[i] = alpha * x[i] + y[i];
    }
  }
  const end = performance.now();
  const elapsedMs = Math.max(0.001, end - start);

  // Each iteration reads x, reads y, writes y -> 3 * 4 bytes per element
  const bytesTransferred = iterations * bufferElements * 12;
  const bandwidthGBs = (bytesTransferred / (elapsedMs / 1000)) / 1e9;

  return { bandwidthGBs, elapsedMs };
}

/**
 * Calibrates inference settings based on empirical micro-benchmarks.
 */
export function calibrateInferenceHardware(
  gemmGflops: number,
  bandwidthGBs: number,
  concurrency?: number
): BenchmarkResult['recommendations'] {
  const cores = concurrency || 4;

  // 1. Quantization: Memory bandwidth is the primary bottleneck for autoregressive token generation
  let recommendedQuantization: 'q4_k_m' | 'q8_0' | 'f16' = 'q4_k_m';
  if (bandwidthGBs >= 15 && gemmGflops >= 10) {
    recommendedQuantization = 'f16';
  } else if (bandwidthGBs >= 5 && gemmGflops >= 3) {
    recommendedQuantization = 'q8_0';
  }

  // 2. Optimal Batch Size: High compute allows higher batching
  let optimalBatchSize = 1;
  if (gemmGflops > 20 && cores >= 8) {
    optimalBatchSize = 8;
  } else if (gemmGflops > 8 && cores >= 4) {
    optimalBatchSize = 4;
  } else if (gemmGflops > 3) {
    optimalBatchSize = 2;
  }

  // 3. Max Context Tokens
  let maxContextTokens = 4096;
  if (bandwidthGBs > 12) {
    maxContextTokens = 16384;
  } else if (bandwidthGBs > 6) {
    maxContextTokens = 8192;
  }

  // 4. Speculative Draft Steps: Ratio of compute to bandwidth dictates if speculative decoding saves time
  // If memory bandwidth is low relative to compute, drafting 3-4 tokens in memory produces massive speedups
  let speculativeDraftSteps = 1;
  const computeToBandwidthRatio = gemmGflops / Math.max(0.1, bandwidthGBs);
  if (computeToBandwidthRatio > 1.5) {
    speculativeDraftSteps = 4;
  } else if (computeToBandwidthRatio > 0.8) {
    speculativeDraftSteps = 2;
  }

  return {
    recommendedQuantization,
    optimalBatchSize,
    maxContextTokens,
    speculativeDraftSteps,
  };
}

/**
 * Runs the complete synthetic calibration suite in ~15-25ms.
 */
export async function runHardwareCalibration(): Promise<BenchmarkResult> {
  const gemm = runMicroGEMM(30, 64);
  const mem = runMemoryBandwidthProbe(40, 65536);
  const concurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4;

  const recommendations = calibrateInferenceHardware(gemm.gflops, mem.bandwidthGBs, concurrency);

  return {
    gflops: gemm.gflops,
    memoryBandwidthGBs: mem.bandwidthGBs,
    elapsedMs: gemm.elapsedMs + mem.elapsedMs,
    concurrency,
    recommendations,
  };
}
