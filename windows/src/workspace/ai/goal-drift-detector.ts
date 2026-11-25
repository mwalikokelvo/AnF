/**
 * Autonomous Goal Drift Detector & Executive Safety Gate
 * 
 * Tracks alignment between evolving agent reasoning/subtasks and the root objective,
 * detecting hallucinations, topic derailment, or runaway autonomous loops.
 * 
 * Inspired by paperclipai/paperclip goal checkpointing and safety gates.
 */

import { generateDenseVector, computeCosineSimilarity } from '../storage/vector-search';

export interface DriftCheckpoint {
  step: number;
  taskDescription: string;
  similarityScore: number;
  driftIndex: number; // 0.0 (aligned) to 1.0 (completely derailed)
  isDrifting: boolean;
  timestamp: number;
}

export interface DriftReport {
  rootGoal: string;
  currentDriftIndex: number;
  isDriftAlertTriggered: boolean;
  checkpoints: DriftCheckpoint[];
  recommendation: 'proceed' | 'recalibrate' | 'halt';
}

export class GoalDriftDetector {
  private rootGoal: string;
  private rootVector: Float32Array;
  private driftThreshold: number;
  private checkpoints: DriftCheckpoint[] = [];

  constructor(rootGoal: string, driftThreshold = 0.65) {
    this.rootGoal = rootGoal;
    this.rootVector = generateDenseVector(rootGoal);
    this.driftThreshold = driftThreshold;
  }

  /**
   * Evaluates a candidate subtask or step output against the original root goal
   */
  public evaluateStep(taskDescription: string): DriftCheckpoint {
    const taskVector = generateDenseVector(taskDescription);
    const sim = computeCosineSimilarity(this.rootVector, taskVector);
    // Cosine similarity is typically 0.0 to 1.0 for these vectors
    const boundedSim = Math.max(0, Math.min(1, sim));
    const driftIndex = Math.round((1.0 - boundedSim) * 100) / 100;
    const isDrifting = driftIndex >= this.driftThreshold;

    const checkpoint: DriftCheckpoint = {
      step: this.checkpoints.length + 1,
      taskDescription,
      similarityScore: Math.round(boundedSim * 100) / 100,
      driftIndex,
      isDrifting,
      timestamp: Date.now()
    };

    this.checkpoints.push(checkpoint);
    return checkpoint;
  }

  /**
   * Generates a comprehensive safety report
   */
  public getReport(): DriftReport {
    const latest = this.checkpoints[this.checkpoints.length - 1];
    const currentDrift = latest ? latest.driftIndex : 0.0;
    const isAlert = latest ? latest.isDrifting : false;

    let recommendation: DriftReport['recommendation'] = 'proceed';
    if (currentDrift >= 0.85) {
      recommendation = 'halt';
    } else if (currentDrift >= this.driftThreshold) {
      recommendation = 'recalibrate';
    }

    return {
      rootGoal: this.rootGoal,
      currentDriftIndex: currentDrift,
      isDriftAlertTriggered: isAlert,
      checkpoints: [...this.checkpoints],
      recommendation
    };
  }

  public reset(newRootGoal?: string): void {
    if (newRootGoal) {
      this.rootGoal = newRootGoal;
      this.rootVector = generateDenseVector(newRootGoal);
    }
    this.checkpoints = [];
  }
}
