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
// Saga
// ---------------------------------------------------------------------------

export class PushFlowSaga {
  private state: PushFlowState = 'Idle';
  private readonly sagaId: string;
  private readonly events: PushFlowEvent[] = [];
  private lastAcceptedCount = 0;

  constructor(sagaId?: string) {
    this.sagaId = sagaId ?? randomUUID();
  }

  // -- State transitions ----------------------------------------------------

  start(): PushFlowStarted {
    this.assertState('Idle', 'start');
    const event: PushFlowStarted = {
      type: 'PushFlowStarted',
      sagaId: this.sagaId,
      timestamp: now(),
    };
    this.state = 'Diffing';
    this.events.push(event);
    return event;
  }

  proposalsGenerated(proposalCount: number): PushFlowProposalsGenerated {
    this.assertState('Diffing', 'proposalsGenerated');
    const event: PushFlowProposalsGenerated = {
      type: 'PushFlowProposalsGenerated',
      sagaId: this.sagaId,
      proposalCount,
      timestamp: now(),
    };
    this.state = proposalCount > 0 ? 'Proposing' : 'Complete';
    this.events.push(event);
    return event;
  }

  confirmationComplete(
    accepted: number,
    rejected: number,
    skipped: number,
  ): PushFlowConfirmationComplete {
    this.assertState('Proposing', 'confirmationComplete');
    const event: PushFlowConfirmationComplete = {
      type: 'PushFlowConfirmationComplete',
      sagaId: this.sagaId,
      acceptedCount: accepted,
      rejectedCount: rejected,
      skippedCount: skipped,
      timestamp: now(),
    };
    this.lastAcceptedCount = accepted;
    this.state = 'Recording';
    this.events.push(event);
    return event;
  }

  recordingComplete(recordedCount: number): PushFlowRecordingComplete {
    this.assertState('Recording', 'recordingComplete');
    const event: PushFlowRecordingComplete = {
      type: 'PushFlowRecordingComplete',
      sagaId: this.sagaId,
      recordedCount,
      timestamp: now(),
    };
    this.state = 'Committing';
    this.events.push(event);
    return event;
  }

  committed(commitRef: string): PushFlowCommitted {
    this.assertState('Committing', 'committed');
    const event: PushFlowCommitted = {
      type: 'PushFlowCommitted',
      sagaId: this.sagaId,
      commitRef,
      timestamp: now(),
    };
    // Stay in Committing — caller must call complete() to finalize
    this.events.push(event);
    return event;
  }

  complete(): PushFlowCompleted {
    this.assertState('Committing', 'complete');
    const event: PushFlowCompleted = {
      type: 'PushFlowCompleted',
      sagaId: this.sagaId,
      timestamp: now(),
    };
    this.state = 'Complete';
    this.events.push(event);
    return event;
  }

  abort(reason: string): PushFlowAborted {
    if (TERMINAL_STATES.has(this.state)) {
      throw new Error(`Cannot abort saga in terminal state "${this.state}"`);
    }
    const event: PushFlowAborted = {
      type: 'PushFlowAborted',
      sagaId: this.sagaId,
      reason,
      timestamp: now(),
    };
    this.state = 'Aborted';
    this.events.push(event);
    return event;
  }

  // -- Queries --------------------------------------------------------------

  getState(): PushFlowState {
    return this.state;
  }

  getSagaId(): string {
    return this.sagaId;
  }

  getEvents(): readonly PushFlowEvent[] {
    return this.events;
  }

  /**
   * IS-03: Cursor may only advance after the saga has completed successfully.
   */
  canAdvanceCursor(): boolean {
    return this.state === 'Complete';
  }

  // -- Replay ---------------------------------------------------------------

  apply(event: PushFlowEvent): void {
    switch (event.type) {
      case 'PushFlowStarted':
        this.state = 'Diffing';
        break;
      case 'PushFlowProposalsGenerated':
        this.state = event.proposalCount > 0 ? 'Proposing' : 'Complete';
        break;
      case 'PushFlowConfirmationComplete':
        this.lastAcceptedCount = event.acceptedCount;
        this.state = 'Recording';
        break;
      case 'PushFlowRecordingComplete':
        this.state = 'Committing';
        break;
      case 'PushFlowCommitted':
        // stays Committing
        break;
      case 'PushFlowCompleted':
        this.state = 'Complete';
        break;
      case 'PushFlowAborted':
        this.state = 'Aborted';
        break;
    }
    this.events.push(event);
  }

  // -- Internal -------------------------------------------------------------

  private assertState(expected: PushFlowState, action: string): void {
    if (this.state !== expected) {
      throw new Error(
        `Invalid transition: cannot "${action}" from state "${this.state}" (expected "${expected}")`,
      );
    }
  }
}
