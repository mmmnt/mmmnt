export type {
  FieldConstraint,
  PayloadValidationStep,
  SetupStep,
  AssertionPoint,
  TestCaseDefinition,
  TestSuiteDefinition,
  TopologyMetadata,
  TestSuiteTopology,
} from './types/index.js';

export { deriveTopology } from './engine/derivation-engine.js';

export {
  generateSimulationScenario,
  generateAllScenarios,
  deriveNegativeScenarios,
  type SimulationScenario,
  type SimulationEvent,
  type ActiveBranch,
  type SimulationOptions,
} from './engine/simulation-scenario-generator.js';

export {
  DeriveOnSpecificationParsed,
  type DeriveOnSpecificationParsedOptions,
  type TopologyDerivedHook,
} from './policies/derive-on-specification-parsed.js';

export {
  generateEventCatalog,
  type EventCatalogEntry,
  type EventCatalog,
} from './engine/event-catalog-generator.js';

export {
  generateImpactAnalysis,
  type ImpactNode,
  type ImpactAnalysis,
} from './engine/impact-analysis-generator.js';

export {
  generateSagaStateMachines,
  type SagaStateMachine,
  type SagaState,
  type SagaTransition,
} from './engine/saga-state-machine-generator.js';
