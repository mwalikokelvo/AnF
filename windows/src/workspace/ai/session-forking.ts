/**
 * Session Forking & Compute Energy Ledger
 * 
 * Provides tree-structured conversational branching, session forking at arbitrary
 * message checkpoints, and detailed compute/energy expenditure accounting (mWh, tokens,
 * latency, and hardware power models).
 * 
 * Inspired by Twigpine/openclaude session forking and paperclipai/paperclip compute accounting.
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface BranchNode {
  id: string;
  parentId: string | null;
  label: string;
  createdAt: number;
  messages: ChatMessage[];
  childrenIds: string[];
}

export interface InferenceMetrics {
  callId: string;
  timestamp: number;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  hardwareDevice: 'cpu' | 'directml' | 'cuda' | 'mps' | 'cloud';
  estimatedPowerWatts: number;
  energyMwh: number;
  estimatedCostUsd: number;
  branchId?: string;
}

export interface LedgerSummary {
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalLatencyMs: number;
  totalEnergyMwh: number;
  totalCostUsd: number;
  tokensPerSecond: number;
}

/**
 * Default hardware thermal design power (TDP) estimates under active inference
 */
export const HARDWARE_POWER_WATTS: Record<InferenceMetrics['hardwareDevice'], number> = {
  cpu: 28.0,       // standard laptop CPU package under AVX/matmul load
  directml: 65.0,  // mid-range integrated or discrete GPU via DirectML
  cuda: 120.0,     // discrete NVIDIA GPU
  mps: 35.0,       // Apple Silicon unified memory SOC
  cloud: 0.0       // client-side energy negligible (handled server-side)
};

/**
 * Approximate pricing per 1M tokens for cost accounting
 */
export const MODEL_PRICING_PER_M: Record<string, { prompt: number; completion: number }> = {
  'minimind-sub100m': { prompt: 0.0, completion: 0.0 }, // local on-device
  'local-q4': { prompt: 0.0, completion: 0.0 },         // local quantized
  'claude-3-5-sonnet': { prompt: 3.0, completion: 15.0 },
  'gpt-4o': { prompt: 2.5, completion: 10.0 },
  'deepseek-chat': { prompt: 0.14, completion: 0.28 }
};

/**
 * Tree-structured conversational branch manager for exploring alternate reasoning paths
 */
export class SessionTreeManager {
  public rootId: string;
  public activeNodeId: string;
  public nodes: Map<string, BranchNode>;

  constructor(initialTitle = 'Main Thread') {
    this.rootId = 'root_' + Math.random().toString(36).substring(2, 9);
    this.activeNodeId = this.rootId;
    this.nodes = new Map();

    const rootNode: BranchNode = {
      id: this.rootId,
      parentId: null,
      label: initialTitle,
      createdAt: Date.now(),
      messages: [],
      childrenIds: []
    };

    this.nodes.set(this.rootId, rootNode);
  }

  public getActiveNode(): BranchNode {
    return this.nodes.get(this.activeNodeId) || this.nodes.get(this.rootId)!;
  }

  public appendMessage(role: 'user' | 'assistant' | 'system', content: string, metadata?: Record<string, unknown>): ChatMessage {
    const node = this.getActiveNode();
    const msg: ChatMessage = {
      id: 'msg_' + Math.random().toString(36).substring(2, 9),
      role,
      content,
      timestamp: Date.now(),
      metadata
    };
    node.messages.push(msg);
    return msg;
  }

  /**
   * Forks a new conversational branch at a specific message index
   */
  public forkAt(messageIndex: number, newBranchLabel: string): BranchNode {
    const currentNode = this.getActiveNode();
    const targetIndex = Math.max(0, Math.min(messageIndex, currentNode.messages.length - 1));
    const prefixMessages = currentNode.messages.slice(0, targetIndex + 1);

    const newBranchId = 'branch_' + Math.random().toString(36).substring(2, 9);
    const newBranch: BranchNode = {
      id: newBranchId,
      parentId: currentNode.id,
      label: newBranchLabel,
      createdAt: Date.now(),
      messages: prefixMessages.map(m => ({ ...m })),
      childrenIds: []
    };

    currentNode.childrenIds.push(newBranchId);
    this.nodes.set(newBranchId, newBranch);
    this.activeNodeId = newBranchId;

    return newBranch;
  }

  /**
   * Switches the active focus to a different branch node
   */
  public switchToBranch(branchId: string): boolean {
    if (this.nodes.has(branchId)) {
      this.activeNodeId = branchId;
      return true;
    }
    return false;
  }

  /**
   * Returns complete linear history of messages for the active node
   */
  public getLinearHistory(): ChatMessage[] {
    return this.getActiveNode().messages;
  }

  /**
   * Exports an ASCII or Markdown visual representation of the branch tree
   */
  public exportTreeOutline(): string {
    const lines: string[] = [];

    const traverse = (nodeId: string, depth: number) => {
      const node = this.nodes.get(nodeId);
      if (!node) return;
      const prefix = '  '.repeat(depth) + (nodeId === this.activeNodeId ? '* ' : '- ');
      lines.push(`${prefix}[${node.label}] (${node.messages.length} msgs) [${node.id}]`);
      for (const childId of node.childrenIds) {
        traverse(childId, depth + 1);
      }
    };

    traverse(this.rootId, 0);
    return lines.join('\n');
  }
}

/**
 * Compute & Energy Accounting Ledger
 */
export class ComputeEnergyLedger {
  private records: InferenceMetrics[] = [];

  /**
   * Records a completed inference operation and computes energy / financial metrics
   */
  public recordInference(params: {
    model: string;
    provider: string;
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
    hardwareDevice?: InferenceMetrics['hardwareDevice'];
    branchId?: string;
  }): InferenceMetrics {
    const hardware = params.hardwareDevice || 'cpu';
    const powerWatts = HARDWARE_POWER_WATTS[hardware] ?? 25.0;
    const hours = Math.max(0.0001, params.latencyMs / 3600000);
    // Energy in milliwatt-hours: Watts * hours * 1000
    const energyMwh = Math.round(powerWatts * hours * 1000 * 100) / 100;

    const pricing = MODEL_PRICING_PER_M[params.model] || { prompt: 1.0, completion: 3.0 };
    const promptCost = (params.promptTokens / 1000000) * pricing.prompt;
    const compCost = (params.completionTokens / 1000000) * pricing.completion;
    const totalCostUsd = Math.round((promptCost + compCost) * 100000) / 100000;

    const metric: InferenceMetrics = {
      callId: 'inf_' + Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      model: params.model,
      provider: params.provider,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      totalTokens: params.promptTokens + params.completionTokens,
      latencyMs: params.latencyMs,
      hardwareDevice: hardware,
      estimatedPowerWatts: powerWatts,
      energyMwh,
      estimatedCostUsd: totalCostUsd,
      branchId: params.branchId
    };

    this.records.push(metric);
    return metric;
  }

  public getSummary(filterBranchId?: string): LedgerSummary {
    const list = filterBranchId
      ? this.records.filter(r => r.branchId === filterBranchId)
      : this.records;

    let totalPrompt = 0;
    let totalCompletion = 0;
    let totalLatency = 0;
    let totalEnergy = 0;
    let totalCost = 0;

    for (const r of list) {
      totalPrompt += r.promptTokens;
      totalCompletion += r.completionTokens;
      totalLatency += r.latencyMs;
      totalEnergy += r.energyMwh;
      totalCost += r.estimatedCostUsd;
    }

    const totalTokens = totalPrompt + totalCompletion;
    const seconds = totalLatency / 1000;
    const tokensPerSecond = seconds > 0 ? Math.round((totalCompletion / seconds) * 10) / 10 : 0;

    return {
      totalCalls: list.length,
      totalPromptTokens: totalPrompt,
      totalCompletionTokens: totalCompletion,
      totalTokens,
      totalLatencyMs: totalLatency,
      totalEnergyMwh: Math.round(totalEnergy * 100) / 100,
      totalCostUsd: Math.round(totalCost * 10000) / 10000,
      tokensPerSecond
    };
  }

  public getRecords(): InferenceMetrics[] {
    return [...this.records];
  }

  public clear(): void {
    this.records = [];
  }
}
