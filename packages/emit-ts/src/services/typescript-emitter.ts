import type {
  IntermediateRepresentation,
  ContextDefinition,
  SagaDefinition,
  AggregateDefinition,
  CommandDefinition,
  EventDefinition,
  ValueObjectDefinition,
  FieldDefinition,
} from '@mmmnt/core';
import { emitOutcomes, emittedEvents } from '@mmmnt/core';
import type { GenerationScope, GenerationResult } from '../types/index.js';

export interface EmitOptions {
  readonly scope: GenerationScope;
  readonly dryRun?: boolean;
}

export interface TypeScriptEmitterOutput {
  readonly result: GenerationResult;
  readonly files: Map<string, string>;
}

function toKebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function toPascalCase(name: string): string {
  return name
    .replace(/[-_\s]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (_, c: string) => c.toUpperCase())
    .replace(/[^A-Za-z0-9_$]/g, '');
}

function isValidTsIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

function safePropertyKey(name: string): string {
  return isValidTsIdentifier(name) ? name : `'${name.replace(/'/g, "\\'")}'`;
}

function safePathSegment(name: string): string {
  return name.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}

function sanitizeJsDoc(text: string): string {
  return text.replace(/\*\//g, '* /');
}

/**
 * The TypeScript of each built-in type, by lower-case name. `UUID`, `DateTime` and `Money` are
 * written as the type of their recorded value, as `@mmmnt/schema` writes them (ADR-049): a string, an
 * ISO 8601 string and a number. Any other name is a declared type and is imported where it is used.
 */
const BUILT_IN_TYPES: Readonly<Record<string, string>> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  date: 'string',
  datetime: 'string',
  uuid: 'string',
  money: 'number',
  int: 'number',
  float: 'number',
  decimal: 'number',
};

/** The declared type a field names, in PascalCase; undefined for a built-in type or a code set. */
function referencedType(field: FieldDefinition): string | undefined {
  if (field.enum !== undefined || BUILT_IN_TYPES[field.type.toLowerCase()] !== undefined) {
    return undefined;
  }
  return toPascalCase(field.type);
}

function mapFieldType(field: FieldDefinition): string {
  // ADR-049: a code set is a union of string literals; a map is a record keyed by string.
  if (field.enum !== undefined) {
    const literals = field.enum.map((v) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`);
    const union = literals.join(' | ');
    if (field.isArray) return `readonly (${union})[]`;
    if (field.map !== undefined) return `Readonly<Record<string, ${union}>>`;
    return union;
  }
  const mapped = BUILT_IN_TYPES[field.type.toLowerCase()] ?? toPascalCase(field.type);
  if (field.map !== undefined) return `Readonly<Record<string, ${mapped}>>`;
  const base = field.isArray ? `readonly ${mapped}[]` : mapped;
  return base;
}

function fieldLines(fields: readonly FieldDefinition[], indent: string): string {
  let output = '';
  for (const field of fields) {
    const optional = field.required ? '' : '?';
    output += generateDeprecatedJsDoc(field, indent);
    output += `${indent}readonly ${safePropertyKey(field.name)}${optional}: ${mapFieldType(field)};\n`;
  }
  return output;
}

function generateJsDoc(description: string, indent: string): string {
  const safe = sanitizeJsDoc(description);
  return `${indent}/**\n${indent} * ${safe}\n${indent} */\n`;
}

function generateDeprecatedJsDoc(field: FieldDefinition, indent: string): string {
  if (!field.deprecated) return '';
  const reason = field.deprecated.reason.trim()
    ? sanitizeJsDoc(field.deprecated.reason.trim())
    : '';
  const replacement = field.deprecated.replacement.trim()
    ? sanitizeJsDoc(field.deprecated.replacement.trim())
    : '';
  let doc = `${indent}/**\n${indent} * @deprecated`;
  if (reason && replacement) {
    doc += ` ${reason} (use ${replacement} instead)`;
  } else if (reason) {
    doc += ` ${reason}`;
  } else if (replacement) {
    doc += ` Use ${replacement} instead.`;
  }
  doc += `\n${indent} */\n`;
  return doc;
}

function generateValueObjectInterface(vo: ValueObjectDefinition): string {
  const name = toPascalCase(vo.name);
  // ADR-049 D4: a scalar value object is a type alias of its scalar.
  if (vo.scalar !== undefined) return `export type ${name} = ${mapFieldType(vo.scalar)};\n`;
  // ADR-049 D3: a tagged union is a discriminated union on `kind`.
  if (vo.variants !== undefined && vo.variants.length > 0) {
    let union = `export type ${name} =\n`;
    for (const variant of vo.variants) {
      union += `  | {\n      readonly kind: '${variant.name}';\n`;
      union += fieldLines([...vo.fields, ...variant.fields], '      ');
      union += '    }\n';
    }
    return `${union.trimEnd()};\n`;
  }
  let output = `export interface ${name} {\n`;
  for (const field of vo.fields) {
    const fieldType = mapFieldType(field);
    const optional = field.required ? '' : '?';
    output += generateDeprecatedJsDoc(field, '  ');
    output += `  readonly ${safePropertyKey(field.name)}${optional}: ${fieldType};\n`;
  }
  output += '}\n';
  return output;
}

function generateEventInterface(event: EventDefinition): string {
  const name = toPascalCase(event.name);
  let output = `export interface ${name} {\n`;
  for (const field of event.fields) {
    const fieldType = mapFieldType(field);
    const optional = field.required ? '' : '?';
    output += generateDeprecatedJsDoc(field, '  ');
    output += `  readonly ${safePropertyKey(field.name)}${optional}: ${fieldType};\n`;
  }
  output += '}\n';
  return output;
}

function generateCommandInterface(cmd: CommandDefinition): string {
  const name = toPascalCase(cmd.name);
  let output = `export interface ${name} {\n`;
  for (const input of cmd.inputs) {
    const fieldType = mapFieldType(input);
    const optional = input.required ? '' : '?';
    output += generateDeprecatedJsDoc(input, '  ');
    output += `  readonly ${safePropertyKey(input.name)}${optional}: ${fieldType};\n`;
  }
  output += '}\n';
  return output;
}

// ---------------------------------------------------------------------------
// Where each type is declared, so a file can import what it uses from another file.
// ---------------------------------------------------------------------------

function contextDir(context: ContextDefinition): string {
  return `src/${safePathSegment(toKebabCase(context.name))}`;
}

function typesPath(context: ContextDefinition, aggregate: AggregateDefinition): string {
  return `${contextDir(context)}/${toKebabCase(aggregate.name)}.types.ts`;
}

function aggregatePath(context: ContextDefinition, aggregate: AggregateDefinition): string {
  return `${contextDir(context)}/${toKebabCase(aggregate.name)}.aggregate.ts`;
}

function readModelPath(context: ContextDefinition): string {
  return `${contextDir(context)}/read-model.types.ts`;
}

function processPath(context: ContextDefinition, saga: SagaDefinition): string {
  return `${contextDir(context)}/${toKebabCase(saga.name)}.process.types.ts`;
}

/** The names `<aggregate>.types.ts` declares: value objects, commands, events. */
function typesFileNames(aggregate: AggregateDefinition): string[] {
  return [...aggregate.valueObjects, ...aggregate.commands, ...aggregate.events].map((d) =>
    toPascalCase(d.name),
  );
}

/** The names `read-model.types.ts` declares: value objects, projections, queries and their results. */
function readModelNames(context: ContextDefinition): string[] {
  return [
    ...contextLevelValueObjects(context).map((v) => toPascalCase(v.name)),
    ...(context.projections ?? []).map((p) => toPascalCase(p.name)),
    ...(context.queries ?? []).flatMap((q) => [
      `${toPascalCase(q.name)}Query`,
      `${toPascalCase(q.name)}Result`,
    ]),
  ];
}

function processNames(saga: SagaDefinition): string[] {
  return (saga.events ?? []).map((e) => toPascalCase(e.name));
}

/** Every type file of the model and the names it declares, by context, in declaration order. */
interface TypeIndex {
  readonly contexts: readonly { readonly name: string; readonly files: Map<string, Set<string>> }[];
}

function buildTypeIndex(ir: IntermediateRepresentation): TypeIndex {
  return {
    contexts: ir.contexts.map((context) => {
      const files = new Map<string, Set<string>>();
      for (const aggregate of context.aggregates) {
        files.set(typesPath(context, aggregate), new Set(typesFileNames(aggregate)));
      }
      if (hasReadSide(context)) files.set(readModelPath(context), new Set(readModelNames(context)));
      for (const saga of processSagas(context)) {
        files.set(processPath(context, saga), new Set(processNames(saga)));
      }
      return { name: context.name, files };
    }),
  };
}

/**
 * The file that declares a type: the preferred file, then the context's own files, then the other
 * contexts in declaration order. Undefined for a name no type file of the model declares.
 */
function resolveType(
  index: TypeIndex,
  contextName: string,
  name: string,
  preferred?: string,
): string | undefined {
  const own = index.contexts.find((c) => c.name === contextName);
  if (preferred !== undefined && own?.files.get(preferred)?.has(name)) return preferred;
  const ordered = [...(own ? [own] : []), ...index.contexts.filter((c) => c !== own)];
  for (const context of ordered) {
    for (const [path, names] of context.files) {
      if (names.has(name)) return path;
    }
  }
  return undefined;
}

/** The module specifier of one emitted file from another; both sit at `src/<context>/`. */
function relativeModule(from: string, to: string): string {
  const [fromDir] = from.split('/').slice(-2);
  const [toDir, toFile] = to.split('/').slice(-2);
  const specifier = toFile.replace(/\.ts$/, '.js');
  return fromDir === toDir ? `./${specifier}` : `../${toDir}/${specifier}`;
}

/**
 * One `import type` line per file that declares a name the file uses and does not declare itself,
 * sorted by module specifier, each with its names sorted.
 */
function importLines(
  index: TypeIndex,
  context: ContextDefinition,
  from: string,
  used: Iterable<string>,
  declared: ReadonlySet<string>,
  preferred?: string,
): string[] {
  const byPath = new Map<string, Set<string>>();
  for (const name of used) {
    if (declared.has(name)) continue;
    const path = resolveType(index, context.name, name, preferred);
    if (path === undefined || path === from) continue;
    const names = byPath.get(path) ?? new Set<string>();
    names.add(name);
    byPath.set(path, names);
  }
  return [...byPath]
    .map(([path, names]) => ({ specifier: relativeModule(from, path), names: [...names].sort() }))
    .sort((x, y) => (x.specifier < y.specifier ? -1 : 1))
    .map(({ specifier, names }) => `import type { ${names.join(', ')} } from '${specifier}';`);
}

/** The declared types the fields name, in order. */
function usedTypes(fields: readonly FieldDefinition[]): string[] {
  return fields.map(referencedType).filter((n): n is string => n !== undefined);
}

function valueObjectUses(vo: ValueObjectDefinition): string[] {
  return usedTypes([
    ...(vo.scalar !== undefined ? [vo.scalar] : []),
    ...vo.fields,
    ...(vo.variants ?? []).flatMap((v) => v.fields),
  ]);
}

/** A file's imports, a blank line, then its body; the body alone when it imports nothing. */
function withImports(imports: readonly string[], body: string): string {
  return imports.length > 0 ? `${imports.join('\n')}\n\n${body}` : body;
}

function generateTypesFile(
  aggregate: AggregateDefinition,
  context: ContextDefinition,
  index: TypeIndex,
): string {
  const parts: string[] = [];

  parts.push(generateJsDoc(`Types for the ${aggregate.name} aggregate.`, '').trimEnd());
  parts.push('');

  for (const vo of aggregate.valueObjects) {
    parts.push(generateValueObjectInterface(vo));
  }

  for (const cmd of aggregate.commands) {
    parts.push(generateCommandInterface(cmd));
  }

  for (const event of aggregate.events) {
    parts.push(generateEventInterface(event));
  }

  const path = typesPath(context, aggregate);
  const used = [
    ...aggregate.valueObjects.flatMap(valueObjectUses),
    ...aggregate.commands.flatMap((c) => usedTypes(c.inputs)),
    ...aggregate.events.flatMap((e) => usedTypes(e.fields)),
  ];
  const imports = importLines(index, context, path, used, new Set(typesFileNames(aggregate)));
  return withImports(imports, parts.join('\n'));
}

/**
 * ADR-041 D5: `emits A` returns `A`; `emits A, B` returns `readonly [A, B]`; `emits A | B` returns
 * `A | B`; `emits A, B | C` returns `readonly [A, B] | C`. A command that emits nothing returns `void`.
 */
function handlerReturnType(cmd: CommandDefinition): string {
  const members = emitOutcomes(cmd).map((o) => {
    const events = o.events.map(toPascalCase);
    return events.length === 1 ? events[0] : `readonly [${events.join(', ')}]`;
  });
  return members.length === 0 ? 'void' : [...new Set(members)].join(' | ');
}

/** One `@emits` tag per distinct event, then `@outcome <State>: <events>` for each guarded outcome. */
function emitsTags(cmd: CommandDefinition): string[] {
  return [
    ...emittedEvents(cmd).map((e) => `   * @emits ${toPascalCase(e)}`),
    ...emitOutcomes(cmd)
      .filter((o) => o.whenState !== undefined)
      .map((o) => `   * @outcome ${o.whenState ?? ''}: ${o.events.map(toPascalCase).join(', ')}`),
  ];
}

function generateAggregateFile(
  aggregate: AggregateDefinition,
  context: ContextDefinition,
  index: TypeIndex,
): string {
  const aggregateName = toPascalCase(aggregate.name);
  const parts: string[] = [];

  // The aggregate's own types, then any other type its identity or handlers name.
  const used = [
    ...typesFileNames(aggregate),
    ...usedTypes([aggregate.identityField]),
    ...aggregate.commands.flatMap((c) => emittedEvents(c).map(toPascalCase)),
  ];
  const ownTypes = typesPath(context, aggregate);
  const imports = importLines(
    index,
    context,
    aggregatePath(context, aggregate),
    used,
    new Set([`${aggregateName}Aggregate`]),
    ownTypes,
  );
  if (imports.length > 0) parts.push(...imports, '');

  parts.push(generateJsDoc(`Aggregate root for ${aggregate.name}.`, '').trimEnd());

  parts.push(`export interface ${aggregateName}Aggregate {`);

  const idField = aggregate.identityField;
  parts.push(`  readonly ${safePropertyKey(idField.name)}: ${mapFieldType(idField)};`);

  for (const cmd of aggregate.commands) {
    const cmdName = toPascalCase(cmd.name);
    const handlerName =
      cmd.name.charAt(0).toLowerCase() + cmd.name.slice(1).replace(/[^A-Za-z0-9_$]/g, '');
    const returnType = handlerReturnType(cmd);

    const jsdocLines: string[] = [];
    jsdocLines.push(`  /**`);
    jsdocLines.push(`   * Handle ${cmd.name}.`);
    for (const pre of cmd.preconditions) {
      jsdocLines.push(`   * @precondition ${sanitizeJsDoc(pre.description)}`);
    }
    jsdocLines.push(...emitsTags(cmd));
    jsdocLines.push(`   */`);
    parts.push(jsdocLines.join('\n'));
    parts.push(`  ${safePropertyKey(handlerName)}(command: ${cmdName}): ${returnType};`);
  }

  parts.push('}');
  parts.push('');

  return parts.join('\n');
}

/** The orchestrations of a context that declare process events (ADR-040 D1). */
function processSagas(context: ContextDefinition): SagaDefinition[] {
  return context.sagas.filter((s) => (s.events ?? []).length > 0);
}

function generateProcessTypesFile(
  saga: SagaDefinition,
  context: ContextDefinition,
  index: TypeIndex,
): string {
  const parts: string[] = [
    generateJsDoc(`Events the ${saga.name} process records.`, '').trimEnd(),
    '',
  ];
  for (const event of saga.events ?? []) {
    parts.push(generateEventInterface(event));
  }
  const used = (saga.events ?? []).flatMap((e) => usedTypes(e.fields));
  const path = processPath(context, saga);
  const imports = importLines(index, context, path, used, new Set(processNames(saga)));
  return withImports(imports, parts.join('\n'));
}

function generateEventUnionType(context: ContextDefinition): string {
  const eventNames: string[] = [];
  for (const aggregate of context.aggregates) {
    for (const event of aggregate.events) {
      eventNames.push(toPascalCase(event.name));
    }
  }
  for (const saga of processSagas(context)) {
    for (const event of saga.events ?? []) {
      eventNames.push(toPascalCase(event.name));
    }
  }
  if (eventNames.length === 0) {
    return '';
  }
  const unique = Array.from(new Set(eventNames)).sort();
  const contextName = toPascalCase(context.name);
  return `\nexport type ${contextName}Event = ${unique.join(' | ')};\n`;
}

/** Value objects the context declares outside every aggregate (ADR-037 §4). */
function contextLevelValueObjects(context: ContextDefinition): ValueObjectDefinition[] {
  const inAggregates = new Set(
    context.aggregates.flatMap((a) => a.valueObjects.map((v) => v.name)),
  );
  return context.valueObjects.filter((v) => !inAggregates.has(v.name));
}

function hasReadSide(context: ContextDefinition): boolean {
  return (
    contextLevelValueObjects(context).length > 0 ||
    (context.projections ?? []).length > 0 ||
    (context.queries ?? []).length > 0
  );
}

/** ADR-037: a context's value objects, projections and queries, outside its aggregates. */
function generateReadModelFile(context: ContextDefinition, index: TypeIndex): string {
  const parts: string[] = [
    generateJsDoc(`Read side of the ${context.name} context.`, '').trimEnd(),
    '',
  ];
  for (const vo of contextLevelValueObjects(context)) {
    parts.push(generateValueObjectInterface(vo));
  }
  for (const projection of context.projections ?? []) {
    parts.push(
      generateValueObjectInterface({
        id: projection.id,
        name: projection.name,
        fields: projection.fields,
      }),
    );
  }
  for (const query of context.queries ?? []) {
    const name = toPascalCase(query.name);
    parts.push(
      generateValueObjectInterface({ id: query.id, name: `${name}Query`, fields: query.inputs }),
    );
    parts.push(`export type ${name}Result = ${query.reads.map(toPascalCase).join(' | ')};\n`);
  }
  const used = [
    ...contextLevelValueObjects(context).flatMap(valueObjectUses),
    ...(context.projections ?? []).flatMap((p) => usedTypes(p.fields)),
    ...(context.queries ?? []).flatMap((q) => [
      ...usedTypes(q.inputs),
      ...q.reads.map(toPascalCase),
    ]),
  ];
  const path = readModelPath(context);
  const imports = importLines(index, context, path, used, new Set(readModelNames(context)));
  return withImports(imports, parts.join('\n'));
}

interface BarrelModule {
  readonly specifier: string;
  readonly names: readonly string[];
}

/**
 * `export *` of two modules that export the same name exports neither (TS2308). For each such name,
 * an explicit re-export from the first module that declares it, grouped by module.
 */
function disambiguationLines(modules: readonly BarrelModule[], note: string): string[] {
  const first = new Map<string, string>();
  const repeated = new Map<string, Set<string>>();
  for (const module of modules) {
    for (const name of module.names) {
      const owner = first.get(name);
      if (owner === undefined) first.set(name, module.specifier);
      else if (owner !== module.specifier)
        repeated.set(owner, (repeated.get(owner) ?? new Set()).add(name));
    }
  }
  if (repeated.size === 0) return [];
  const lines = modules
    .filter((m) => repeated.has(m.specifier))
    .map(
      (m) =>
        `export type { ${[...(repeated.get(m.specifier) ?? [])].sort().join(', ')} } from '${m.specifier}';`,
    );
  return ['', `// ${note}`, ...lines];
}

/** The modules a context's barrel re-exports, and the names each exports. */
function contextBarrelModules(context: ContextDefinition, readSide: boolean): BarrelModule[] {
  const modules: BarrelModule[] = [];
  if (readSide)
    modules.push({ specifier: './read-model.types.js', names: readModelNames(context) });
  for (const aggregate of context.aggregates) {
    const kebabName = toKebabCase(aggregate.name);
    modules.push({ specifier: `./${kebabName}.types.js`, names: typesFileNames(aggregate) });
    modules.push({
      specifier: `./${kebabName}.aggregate.js`,
      names: [`${toPascalCase(aggregate.name)}Aggregate`],
    });
  }
  for (const saga of processSagas(context)) {
    modules.push({
      specifier: `./${toKebabCase(saga.name)}.process.types.js`,
      names: processNames(saga),
    });
  }
  return modules;
}

function generateContextIndexFile(context: ContextDefinition, readSide: boolean): string {
  const parts: string[] = [];
  const modules = contextBarrelModules(context, readSide);
  for (const module of modules) {
    const exportStar = module.specifier === './read-model.types.js' ? 'export type *' : 'export *';
    parts.push(`${exportStar} from '${module.specifier}';`);
  }
  parts.push(
    ...disambiguationLines(
      modules,
      'Declared in more than one file of the context: exported from the first.',
    ),
  );

  // Collect event names for import statements
  const eventImports = collectEventImports(context);

  if (eventImports.length > 0) {
    parts.push('');
    for (const imp of eventImports) {
      parts.push(`import type { ${imp.names.join(', ')} } from './${imp.module}';`);
    }
  }

  const unionType = generateEventUnionType(context);
  if (unionType) {
    parts.push(unionType);
  }

  parts.push('');
  return parts.join('\n');
}

function collectEventImports(context: ContextDefinition): { module: string; names: string[] }[] {
  const imports: { module: string; names: string[] }[] = [];
  for (const aggregate of context.aggregates) {
    const names = aggregate.events.map((e) => toPascalCase(e.name));
    if (names.length > 0) {
      imports.push({ module: `${toKebabCase(aggregate.name)}.types.js`, names });
    }
  }
  for (const saga of processSagas(context)) {
    const names = (saga.events ?? []).map((e) => toPascalCase(e.name));
    imports.push({ module: `${toKebabCase(saga.name)}.process.types.js`, names });
  }
  return imports;
}

function shouldIncludeContext(context: ContextDefinition, scope: GenerationScope): boolean {
  if (scope.level === 'system') {
    return true;
  }
  if (scope.level === 'context' && scope.targets) {
    return scope.targets.includes(context.name);
  }
  if (scope.level === 'context' && !scope.targets) {
    return true;
  }
  // scope.level === 'aggregate'
  return context.aggregates.some((a) => !scope.targets || scope.targets.includes(a.name));
}

function filterAggregates(
  context: ContextDefinition,
  scope: GenerationScope,
): AggregateDefinition[] {
  if (scope.level === 'aggregate' && scope.targets) {
    return context.aggregates.filter((a) => scope.targets!.includes(a.name));
  }
  return context.aggregates;
}

/** What one context contributes to the root barrel: its directory and the names its index exports. */
interface EmittedContext {
  readonly dir: string;
  readonly names: readonly string[];
}

/** Emit one included context's files; returns its directory and exports when it produced an index. */
function emitContext(
  context: ContextDefinition,
  scope: GenerationScope,
  index: TypeIndex,
  files: Map<string, string>,
  filesWritten: string[],
): EmittedContext | undefined {
  const write = (path: string, content: string): void => {
    files.set(path, content);
    filesWritten.push(path);
  };
  const aggregates = filterAggregates(context, scope);

  for (const aggregate of aggregates) {
    write(typesPath(context, aggregate), generateTypesFile(aggregate, context, index));
    write(aggregatePath(context, aggregate), generateAggregateFile(aggregate, context, index));
  }

  const readSide = scope.level !== 'aggregate' && hasReadSide(context);
  if (readSide) write(readModelPath(context), generateReadModelFile(context, index));

  // Process events belong to the orchestration, not to an aggregate (ADR-040 D1).
  const sagas = scope.level !== 'aggregate' ? processSagas(context) : [];
  for (const saga of sagas) {
    write(processPath(context, saga), generateProcessTypesFile(saga, context, index));
  }

  if (aggregates.length === 0 && !readSide && sagas.length === 0) return undefined;
  const emitted = { ...context, aggregates, sagas };
  write(`${contextDir(context)}/index.ts`, generateContextIndexFile(emitted, readSide));
  const names = contextBarrelModules(emitted, readSide).flatMap((m) => m.names);
  if (generateEventUnionType(emitted)) names.push(`${toPascalCase(context.name)}Event`);
  return { dir: safePathSegment(toKebabCase(context.name)), names };
}

function generateRootIndexFile(contexts: readonly EmittedContext[]): string {
  const modules = contexts.map((c) => ({ specifier: `./${c.dir}/index.js`, names: c.names }));
  return [
    ...modules.map((m) => `export * from '${m.specifier}';`),
    ...disambiguationLines(modules, 'Declared in more than one context: exported from the first.'),
    '',
  ].join('\n');
}

export class TypeScriptEmitter {
  emit(ir: IntermediateRepresentation, options: EmitOptions): TypeScriptEmitterOutput {
    const files = new Map<string, string>();
    const filesWritten: string[] = [];
    const index = buildTypeIndex(ir);

    const exported = ir.contexts
      .filter((context) => shouldIncludeContext(context, options.scope))
      .map((context) => emitContext(context, options.scope, index, files, filesWritten))
      .filter((c): c is EmittedContext => c !== undefined);

    if (exported.length > 0) {
      const rootIndexPath = 'src/index.ts';
      files.set(rootIndexPath, generateRootIndexFile(exported));
      filesWritten.push(rootIndexPath);
    }

    const result: GenerationResult = {
      filesWritten,
      filesUnchanged: [],
      filesRemoved: [],
      dryRun: options.dryRun ?? false,
    };

    return { result, files };
  }
}
