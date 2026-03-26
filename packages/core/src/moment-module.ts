import type { Module, LangiumCoreServices } from 'langium';
import { MomentValidator, registerMomentValidationChecks } from './validation/moment-validator.js';
import type { MomentAddedServices } from './validation/moment-validator.js';

export type { MomentAddedServices };

export const MomentModule: Module<LangiumCoreServices & MomentAddedServices, MomentAddedServices> =
  {
    validation: {
      MomentValidator: () => new MomentValidator(),
    },
  };

export { registerMomentValidationChecks };
