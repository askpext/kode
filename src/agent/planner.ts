import SessionDB, { Todo } from '../db/sessions.js';

export interface PlanStep {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

export interface Plan {
  steps: PlanStep[];
  currentStep?: PlanStep;
  isComplete: boolean;
}

export class Planner {
  private db: SessionDB;
  private sessionId: string;

  constructor(db: SessionDB, sessionId: string) {
    this.db = db;
    this.sessionId = sessionId;
  }

  async createPlan(steps: string[]): Promise<Plan> {
    const todos = steps.map((step, index) => ({
      content: step,
      status: index === 0 ? ('in_progress' as const) : ('pending' as const),
    }));

    const savedTodos = this.db.setTodos(this.sessionId, todos);

    return {
      steps: savedTodos.map((t) => ({
        id: t.id,
        content: t.content,
        status: t.status,
      })),
      currentStep: savedTodos.find((t) => t.status === 'in_progress'),
      isComplete: false,
    };
  }

  async getCurrentPlan(): Promise<Plan | null> {
    const todos = this.db.getTodos(this.sessionId);

    if (todos.length === 0) {
      return null;
    }

    const steps = todos.map((t) => ({
      id: t.id,
      content: t.content,
      status: t.status,
    }));

    const currentStep = steps.find((s) => s.status === 'in_progress');
    const allComplete = steps.every((s) => s.status === 'completed' || s.status === 'cancelled');

    return {
      steps,
      currentStep,
      isComplete: allComplete,
    };
  }

  async markStepComplete(stepId: string): Promise<void> {
    this.db.updateTodoStatus(this.sessionId, stepId, 'completed');

    // Mark next pending step as in_progress
    const plan = await this.getCurrentPlan();
    if (plan) {
      const nextPending = plan.steps.find((s) => s.status === 'pending');
      if (nextPending) {
        this.db.updateTodoStatus(this.sessionId, nextPending.id, 'in_progress');
      }
    }
  }

  async markStepInProgress(stepId: string): Promise<void> {
    this.db.updateTodoStatus(this.sessionId, stepId, 'in_progress');
  }

  async markStepCancelled(stepId: string): Promise<void> {
    this.db.updateTodoStatus(this.sessionId, stepId, 'cancelled');
  }

  async addStep(content: string, position?: number): Promise<PlanStep> {
    const plan = await this.getCurrentPlan();
    const todos = this.db.getTodos(this.sessionId);

    const newTodo = {
      content,
      status: 'pending' as const,
    };

    if (position !== undefined && position < todos.length) {
      todos.splice(position, 0, newTodo);
    } else {
      todos.push(newTodo);
    }

    const savedTodos = this.db.setTodos(this.sessionId, todos);
    const newStep = savedTodos.find((t) => t.content === content);

    if (!newStep) {
      throw new Error('Failed to create new step');
    }

    return {
      id: newStep.id,
      content: newStep.content,
      status: newStep.status,
    };
  }

  async updatePlan(steps: Array<{ id?: string; content: string; status: Todo['status'] }>): Promise<Plan> {
    const savedTodos = this.db.setTodos(this.sessionId, steps);

    const planSteps = savedTodos.map((t) => ({
      id: t.id,
      content: t.content,
      status: t.status,
    }));

    const currentStep = planSteps.find((s) => s.status === 'in_progress');
    const allComplete = planSteps.every((s) => s.status === 'completed' || s.status === 'cancelled');

    return {
      steps: planSteps,
      currentStep,
      isComplete: allComplete,
    };
  }

  async clearPlan(): Promise<void> {
    this.db.setTodos(this.sessionId, []);
  }
}
