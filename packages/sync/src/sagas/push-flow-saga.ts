import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type PushFlowState =
  | 'Idle'
  | 'Diffing'
  | 'Proposing'
  | 'AwaitingConfirmation'
  | 'Recording'
  | 'Committing'
  | 'Complete'
  | 'Aborted';

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface PushFlowStarted {
  readonly type: 'PushFlowStarted';
  readonly sagaId: string;
  readonly timestamp: string;
}

export interface PushFlowProposalsGenerated {
  readonly type: 'PushFlowProposalsGenerated';
  readonly sagaId: string;
  readonly proposalCount: number;
  readonly timestamp: string;
}

export interface PushFlowConfirmationComplete {
  readonly type: 'PushFlowConfirmationComplete';
  readonly sagaId: string;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly skippedCount: number;
  readonly timestamp: string;
}

export interface PushFlowRecordingComplete {
  readonly type: 'PushFlowRecordingComplete';
  readonly sagaId: string;
  readonly recordedCount: number;
  readonly timestamp: string;
}

export interface PushFlowCommitted {
  readonly type: 'PushFlowCommitted';
  readonly sagaId: string;
  readonly commitRef: string;
  readonly timestamp: string;
}

export interface PushFlowCompleted {
  readonly type: 'PushFlowCompleted';
  readonly sagaId: string;
  readonly timestamp: string;
}

export interface PushFlowAborted {
  readonly type: 'PushFlowAborted';
  readonly sagaId: string;
  readonly reason: string;
  readonly timestamp: string;
}

export type PushFlowEvent =
  | PushFlowStarted
  | PushFlowProposalsGenerated
  | PushFlowConfirmationComplete
  | PushFlowRecordingComplete
  | PushFlowCommitted
  | PushFlowCompleted
  | PushFlowAborted;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

const TERMINAL_STATES: ReadonlySet<PushFlowState> = new Set<PushFlowState>(['Complete', 'Aborted']);

// ---------------------------------------------------------------------------
// Saga — all state transitions go through apply()
// ---------------------------------------------------------------------------

export class PushFlowSaga {
  private state: PushFlowState = 'Idle';
  private readonly sagaId: string;
  private readonly events: PushFlowEvent[] = [];
  private lastAcceptedCount = 0;

  constructor(sagaId?: string) {
    this.sagaId = sagaId ?? randomUUID();
  }

  // -- Commands (create event → apply → return) ---

  start(): PushFlowStarted {
    const event: PushFlowStarted = {
      type: 'PushFlowStarted',
      sagaId: this.sagaId,
      timestamp: now(),
    };
    this.apply(event);
    return event;
  }

  proposalsGenerated(proposalCount: number): PushFlowProposalsGenerated {
    const event: PushFlowProposalsGenerated = {
      type: 'PushFlowProposalsGenerated',
      sagaId: this.sagaId,
      proposalCount,
      timestamp: now(),
    };
    this.apply(event);

    // Zero-proposal shortcut: also emit PushFlowCompleted
    if (proposalCount === 0) {
      const completed: PushFlowCompleted = {
        type: 'PushFlowCompleted',
        sagaId: this.sagaId,
        timestamp: now(),
      };
      this.applyCompleted(completed);
    }

    return event;
  }

  confirmationComplete(
    accepted: number,
    rejected: number,
    skipped: number,
  ): PushFlowConfirmationComplete {
    const event: PushFlowConfirmationComplete = {
      type: 'PushFlowConfirmationComplete',
      sagaId: this.sagaId,
      acceptedCount: accepted,
      rejectedCount: rejected,
      skippedCount: skipped,
      timestamp: now(),
    };
    this.apply(event);
    return event;
  }

  recordingComplete(recordedCount: number): PushFlowRecordingComplete {
    const event: PushFlowRecordingComplete = {
      type: 'PushFlowRecordingComplete',
      sagaId: this.sagaId,
      recordedCount,
      timestamp: now(),
    };
    this.apply(event);
    return event;
  }

  committed(commitRef: string): PushFlowCommitted {
    const event: PushFlowCommitted = {
      type: 'PushFlowCommitted',
      sagaId: this.sagaId,
      commitRef,
      timestamp: now(),
    };
    this.apply(event);
    return event;
  }

  complete(): PushFlowCompleted {
    const event: PushFlowCompleted = {
      type: 'PushFlowCompleted',
      sagaId: this.sagaId,
      timestamp: now(),
    };
    this.apply(event);
    return event;
  }

  abort(reason: string): PushFlowAborted {
    const event: PushFlowAborted = {
      type: 'PushFlowAborted',
      sagaId: this.sagaId,
      reason,
      timestamp: now(),
    };
    this.apply(event);
    return event;
  }

  // -- Queries ---

  getState(): PushFlowState {
    return this.state;
  }

  getSagaId(): string {
    return this.sagaId;
  }

  getEvents(): readonly PushFlowEvent[] {
    return this.events;
  }

  canAdvanceCursor(): boolean {
    return this.state === 'Complete';
  }

  // -- Replay (single source of truth for all state transitions) ---

  apply(event: PushFlowEvent): void {
    this.assertNotTerminal(event.type);

    switch (event.type) {
      case 'PushFlowStarted':
        this.assertState('Idle', event.type);
        this.state = 'Diffing';
        break;

      case 'PushFlowProposalsGenerated':
        this.assertState('Diffing', event.type);
        this.state = event.proposalCount > 0 ? 'Proposing' : 'AwaitingConfirmation';
        break;

      case 'PushFlowConfirmationComplete':
        this.assertOneOf(['Proposing', 'AwaitingConfirmation'], event.type);
        this.lastAcceptedCount = event.acceptedCount;
        this.state = 'Recording';
        break;

      case 'PushFlowRecordingComplete':
        this.assertState('Recording', event.type);
        this.assertIS04(event.recordedCount);
        this.state = 'Committing';
        break;

      case 'PushFlowCommitted':
        this.assertState('Committing', event.type);
        break;

      case 'PushFlowCompleted':
        this.applyCompleted(event);
        return; // applyCompleted pushes the event

      case 'PushFlowAborted':
        this.state = 'Aborted';
        break;

      default: {
        const exhaustive: never = event;
        throw new Error(`Unknown PushFlowEvent type: ${(exhaustive as { type: string }).type}`);
      }
    }
    this.events.push(event);
  }

  // -- Internal ---

  private applyCompleted(event: PushFlowCompleted): void {
    // Complete can come from Committing (normal) or AwaitingConfirmation (zero-proposal)
    if (this.state !== 'Committing' && this.state !== 'AwaitingConfirmation') {
      throw new Error(
        `Invalid transition: cannot apply "PushFlowCompleted" from state "${this.state}"`,
      );
    }
    this.state = 'Complete';
    this.events.push(event);
  }

  private assertNotTerminal(eventType: string): void {
    if (TERMINAL_STATES.has(this.state)) {
      throw new Error(
        `Invalid transition: cannot apply "${eventType}" from terminal state "${this.state}"`,
      );
    }
  }

  private assertState(expected: PushFlowState, eventType: string): void {
    if (this.state !== expected) {
      throw new Error(
        `Invalid transition: cannot apply "${eventType}" from state "${this.state}" (expected "${expected}")`,
      );
    }
  }

  private assertOneOf(expected: readonly PushFlowState[], eventType: string): void {
    if (!expected.includes(this.state)) {
      throw new Error(
        `Invalid transition: cannot apply "${eventType}" from state "${this.state}" (expected one of: ${expected.join(', ')})`,
      );
    }
  }

  private assertIS04(recordedCount: number): void {
    if (recordedCount !== this.lastAcceptedCount) {
      throw new Error(
        `IS-04: recordedCount (${recordedCount}) does not match acceptedCount (${this.lastAcceptedCount})`,
      );
    }
  }
}
