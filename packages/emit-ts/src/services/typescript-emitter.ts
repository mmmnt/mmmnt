import type {
  IntermediateRepresentation,
  ContextDefinition,
  AggregateDefinition,
  CommandDefinition,
  EventDefinition,
  ValueObjectDefinition,
  FieldDefinition,
} from '@mmmnt/core';
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

function mapFieldType(field: FieldDefinition): string {
  const typeMap: Record<string, string> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    date: 'Date',
    uuid: 'string',
    int: 'number',
    float: 'number',
    decimal: 'number',
  };
  const mapped = typeMap[field.type.toLowerCase()] ?? toPascalCase(field.type);
  const base = field.isArray ? `readonly ${mapped}[]` : mapped;
  return base;
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

function generateTypesFile(aggregate: AggregateDefinition): string {
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

  return parts.join('\n');
}

function generateAggregateFile(aggregate: AggregateDefinition): string {
  const aggregateName = toPascalCase(aggregate.name);
  const kebabName = toKebabCase(aggregate.name);
  const parts: string[] = [];

  const importNames: string[] = [];
  for (const cmd of aggregate.commands) {
    importNames.push(toPascalCase(cmd.name));
  }
  for (const event of aggregate.events) {
    importNames.push(toPascalCase(event.name));
  }
  for (const vo of aggregate.valueObjects) {
    importNames.push(toPascalCase(vo.name));
  }

  const uniqueImportNames = Array.from(new Set(importNames)).sort();

  if (uniqueImportNames.length > 0) {
    parts.push(`import type { ${uniqueImportNames.join(', ')} } from './${kebabName}.types.js';`);
    parts.push('');
  }

  parts.push(generateJsDoc(`Aggregate root for ${aggregate.name}.`, '').trimEnd());

  parts.push(`export interface ${aggregateName}Aggregate {`);

  const idField = aggregate.identityField;
  parts.push(`  readonly ${safePropertyKey(idField.name)}: ${mapFieldType(idField)};`);

  for (const cmd of aggregate.commands) {
    const cmdName = toPascalCase(cmd.name);
    const handlerName =
      cmd.name.charAt(0).toLowerCase() + cmd.name.slice(1).replace(/[^A-Za-z0-9_$]/g, '');
    const eventName = cmd.emitsEvent ? toPascalCase(cmd.emitsEvent) : 'void';

    const jsdocLines: string[] = [];
    jsdocLines.push(`  /**`);
    jsdocLines.push(`   * Handle ${cmd.name}.`);
    for (const pre of cmd.preconditions) {
      jsdocLines.push(`   * @precondition ${sanitizeJsDoc(pre.description)}`);
    }
    if (cmd.emitsEvent) {
      jsdocLines.push(`   * @emits ${toPascalCase(cmd.emitsEvent)}`);
    }
    jsdocLines.push(`   */`);
    parts.push(jsdocLines.join('\n'));
    parts.push(`  ${safePropertyKey(handlerName)}(command: ${cmdName}): ${eventName};`);
  }

  parts.push('}');
  parts.push('');

  return parts.join('\n');
}

function generateEventUnionType(context: ContextDefinition): string {
  const eventNames: string[] = [];
  for (const aggregate of context.aggregates) {
    for (const event of aggregate.events) {
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
function generateReadModelFile(context: ContextDefinition): string {
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
  return parts.join('\n');
}

function generateContextIndexFile(context: ContextDefinition): string {
  const parts: string[] = [];
  if (hasReadSide(context)) {
    parts.push("export type * from './read-model.types.js';");
  }

  // Collect event names for import statements
  const eventImports = collectEventImports(context);

  for (const aggregate of context.aggregates) {
    const kebabName = toKebabCase(aggregate.name);
    parts.push(`export * from './${kebabName}.types.js';`);
    parts.push(`export * from './${kebabName}.aggregate.js';`);
  }

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

/** Emit one included context's files; returns its directory when it produced an index, for the root barrel. */
function emitContext(
  context: ContextDefinition,
  scope: GenerationScope,
  files: Map<string, string>,
  filesWritten: string[],
): string | undefined {
  const dir = safePathSegment(toKebabCase(context.name));
  const contextDir = `src/${dir}`;
  const write = (path: string, content: string): void => {
    files.set(path, content);
    filesWritten.push(path);
  };
  const aggregates = filterAggregates(context, scope);

  for (const aggregate of aggregates) {
    const kebabAggregate = toKebabCase(aggregate.name);
    write(`${contextDir}/${kebabAggregate}.types.ts`, generateTypesFile(aggregate));
    write(`${contextDir}/${kebabAggregate}.aggregate.ts`, generateAggregateFile(aggregate));
  }

  const readSide = scope.level !== 'aggregate' && hasReadSide(context);
  if (readSide) write(`${contextDir}/read-model.types.ts`, generateReadModelFile(context));

  if (aggregates.length === 0 && !readSide) return undefined;
  write(`${contextDir}/index.ts`, generateContextIndexFile({ ...context, aggregates }));
  return dir;
}

export class TypeScriptEmitter {
  emit(ir: IntermediateRepresentation, options: EmitOptions): TypeScriptEmitterOutput {
    const files = new Map<string, string>();
    const filesWritten: string[] = [];

    const exported = ir.contexts
      .filter((context) => shouldIncludeContext(context, options.scope))
      .map((context) => emitContext(context, options.scope, files, filesWritten))
      .filter((dir): dir is string => dir !== undefined);

    if (exported.length > 0) {
      const rootIndexPath = 'src/index.ts';
      files.set(
        rootIndexPath,
        [...exported.map((dir) => `export * from './${dir}/index.js';`), ''].join('\n'),
      );
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
