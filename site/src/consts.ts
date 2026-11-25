import cliPackage from '../../packages/cli/package.json';

export const SITE_URL = 'https://moment.mmmnt.ai';
export const SITE_NAME = 'Moment';
export const SITE_TITLE = 'Moment · The open-source temporal DSL for domain-driven design';
export const SITE_DESCRIPTION =
  'Moment is a specification language and toolchain for domain-driven design that treats time as part of the model. Write contexts and flows in .moment files; Moment checks the model and derives tests, types, simulations, schemas, documents and boards from it.';
export const SITE_KEYWORDS =
  'moment, DSL, DDD, domain-driven design, temporal DDD, event storming, bounded contexts, event-driven, complai, facet, feature, saga, langium, typescript, open source';
export const TWITTER_HANDLE = '@mmmnt';
export const GITHUB_URL = 'https://github.com/mmmnt/mmmnt';
export const GITHUB_WIKI_URL = 'https://github.com/mmmnt/mmmnt/wiki';
export const GITHUB_RELEASES_URL = 'https://github.com/mmmnt/mmmnt/releases';

/** The version of the released @mmmnt packages, read from the CLI at build time. */
export const MOMENT_VERSION: string = cliPackage.version;

export const FACET_URL = 'https://facet.mmmnt.dev';
export const FEATURE_URL = 'https://feature.mmmnt.ai';
export const TICKETWAVE_SPEC_URL = `${GITHUB_URL}/blob/main/examples/ticketwave/spec/ticketwave.moment`;
export const TICKETWAVE_BOARD_URL = 'https://miro.com/app/board/uXjVEKasFkQ=/';
