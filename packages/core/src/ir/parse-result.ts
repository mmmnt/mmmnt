import type { IntermediateRepresentation } from './intermediate-representation.js';

export interface ParseResult {
  ir?: IntermediateRepresentation;
  diagnostics: Diagnostic[];
  success: boolean;
}

export interface ValidationResult {
  valid: boolean;
  diagnostics: Diagnostic[];
}

export interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  source?: SourceLocation;
  ruleId?: string;
}

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}
