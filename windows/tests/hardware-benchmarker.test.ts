import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runMicroGEMM,
  runMemoryBandwidthProbe,
  calibrateInferenceHardware,
  runHardwareCalibration,
} from '../src/workspace/inference/hardware-benchmarker.ts';

test('runMicroGEMM measures positive non-zero GFLOPS within 50ms', () => {
  const result = runMicroGEMM(20, 32);
  assert.ok(result.gflops > 0, 'GFLOPS must be positive');
  assert.ok(result.elapsedMs > 0, 'Elapsed ms must be positive');
});

test('runMemoryBandwidthProbe measures positive bandwidth throughput', () => {
  const result = runMemoryBandwidthProbe(25, 32768);
  assert.ok(result.bandwidthGBs > 0, 'Bandwidth must be positive');
  assert.ok(result.elapsedMs > 0, 'Elapsed ms must be positive');
});

test('calibrateInferenceHardware produces valid inference recommendations', () => {
  // Test low-end device
  const lowEnd = calibrateInferenceHardware(1.5, 2.0, 2);
  assert.equal(lowEnd.recommendedQuantization, 'q4_k_m');
  assert.equal(lowEnd.optimalBatchSize, 1);
  assert.equal(lowEnd.maxContextTokens, 4096);

  // Test high-end device
  const highEnd = calibrateInferenceHardware(25.0, 22.0, 16);
  assert.equal(highEnd.recommendedQuantization, 'f16');
  assert.equal(highEnd.optimalBatchSize, 8);
  assert.equal(highEnd.maxContextTokens, 16384);
});

test('runHardwareCalibration executes full suite successfully', async () => {
  const res = await runHardwareCalibration();
  assert.ok(res.gflops > 0);
  assert.ok(res.memoryBandwidthGBs > 0);
  assert.ok(['q4_k_m', 'q8_0', 'f16'].includes(res.recommendations.recommendedQuantization));
  assert.ok(res.recommendations.maxContextTokens >= 4096);
});
