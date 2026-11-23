/**
 * Agent DAG Org Chart Task Delegation & Compute Budget Throttle Gate
 * 
 * Provides multi-agent Directed Acyclic Graph (DAG) task scheduling, dependency resolution,
 * and hard token/energy budget caps that auto-throttle autonomous execution.
 * 
 * Inspired by paperclipai/paperclip agent hierarchy and budget enforcement.
 */

export type AgentRole = 'director' | 'researcher' | 'synthesizer' | 'critic' | 'worker';

export interface AgentProfile {
  id: string;
  role: AgentRole;
  name: string;
  maxTokensPerTask: number;
}

export type TaskStatus = 'pending' | 'running' | 'completed' | 'blocked' | 'failed';

export interface DagTask {
  id: string;
  title: string;
  assignedAgentRole: AgentRole;
  dependsOn: string[]; // task IDs that must complete first
  status: TaskStatus;
  output?: string;
  tokensConsumed: number;
  energyMwhConsumed: number;
}

export interface BudgetLimits {
  dailyTokenCap: number;
  dailyEnergyMwhCap: number;
}

export class AgentDagScheduler {
  public agents: Map<string, AgentProfile> = new Map();
  public tasks: Map<string, DagTask> = new Map();
  public budget: BudgetLimits;
  public totalTokensUsed = 0;
  public totalEnergyMwhUsed = 0;
  public isThrottled = false;

  constructor(budget: BudgetLimits = { dailyTokenCap: 100000, dailyEnergyMwhCap: 500 }) {
    this.budget = budget;

    // Default Org Chart
    this.registerAgent({ id: 'agent_dir', role: 'director', name: 'Executive Planner', maxTokensPerTask: 4000 });
    this.registerAgent({ id: 'agent_res', role: 'researcher', name: 'Literature Explorer', maxTokensPerTask: 8000 });
    this.registerAgent({ id: 'agent_syn', role: 'synthesizer', name: 'Concept Synthesizer', maxTokensPerTask: 6000 });
    this.registerAgent({ id: 'agent_crt', role: 'critic', name: 'Methodology Auditor', maxTokensPerTask: 4000 });
  }

  public registerAgent(agent: AgentProfile): void {
    this.agents.set(agent.id, agent);
  }

  public addTask(task: {
    id: string;
    title: string;
    assignedAgentRole: AgentRole;
    dependsOn?: string[];
  }): DagTask {
    const dagTask: DagTask = {
      id: task.id,
      title: task.title,
      assignedAgentRole: task.assignedAgentRole,
      dependsOn: task.dependsOn || [],
      status: 'pending',
      tokensConsumed: 0,
      energyMwhConsumed: 0
    };
    this.tasks.set(task.id, dagTask);
    return dagTask;
  }

  /**
   * Returns list of tasks that have all dependencies met and are ready to execute
   */
  public getReadyTasks(): DagTask[] {
    if (this.isThrottled) return [];

    const ready: DagTask[] = [];

    for (const task of this.tasks.values()) {
      if (task.status !== 'pending') continue;

      const allDepsMet = task.dependsOn.every(depId => {
        const dep = this.tasks.get(depId);
        return dep && dep.status === 'completed';
      });

      if (allDepsMet) {
        ready.push(task);
      } else {
        // Check if any dep failed
        const anyDepFailed = task.dependsOn.some(depId => {
          const dep = this.tasks.get(depId);
          return dep && (dep.status === 'failed' || dep.status === 'blocked');
        });
        if (anyDepFailed) {
          task.status = 'blocked';
        }
      }
    }

    return ready;
  }

  /**
   * Records task completion, updates budget expenditures, and triggers throttle gate if limits hit
   */
  public completeTask(taskId: string, output: string, tokens: number, energyMwh: number): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.status = 'completed';
    task.output = output;
    task.tokensConsumed = tokens;
    task.energyMwhConsumed = energyMwh;

    this.totalTokensUsed += tokens;
    this.totalEnergyMwhUsed += energyMwh;

    // Budget Cap Gate Enforcement
    if (this.totalTokensUsed >= this.budget.dailyTokenCap || this.totalEnergyMwhUsed >= this.budget.dailyEnergyMwhCap) {
      this.isThrottled = true;
    }

    return true;
  }

  public resetBudget(budget?: BudgetLimits): void {
    if (budget) this.budget = budget;
    this.totalTokensUsed = 0;
    this.totalEnergyMwhUsed = 0;
    this.isThrottled = false;
  }

  /**
   * Validates if the DAG has circular dependencies
   */
  public hasCycle(): boolean {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (id: string): boolean => {
      visited.add(id);
      recStack.add(id);

      const task = this.tasks.get(id);
      if (task) {
        for (const depId of task.dependsOn) {
          if (!visited.has(depId)) {
            if (dfs(depId)) return true;
          } else if (recStack.has(depId)) {
            return true;
          }
        }
      }

      recStack.delete(id);
      return false;
    };

    for (const id of this.tasks.keys()) {
      if (!visited.has(id)) {
        if (dfs(id)) return true;
      }
    }

    return false;
  }
}
