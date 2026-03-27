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

function generateValueObjectInterface(vo: ValueObjectDefinition): string {
  const name = toPascalCase(vo.name);
  let output = `export interface ${name} {\n`;
  for (const field of vo.fields) {
    const fieldType = mapFieldType(field);
    const optional = field.required ? '' : '?';
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
    parts.push(`  ${safePropertyKey(handlerName)}(command: ${cmdName}): ${eventName};`);
  }

  parts.push('}');
  parts.push('');

  return parts.join('\n');
}

function generateContextIndexFile(context: ContextDefinition): string {
  const parts: string[] = [];

  for (const aggregate of context.aggregates) {
    const kebabName = toKebabCase(aggregate.name);
    parts.push(`export * from './${kebabName}.types.js';`);
    parts.push(`export * from './${kebabName}.aggregate.js';`);
  }

  parts.push('');
  return parts.join('\n');
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

export class TypeScriptEmitter {
  emit(ir: IntermediateRepresentation, options: EmitOptions): TypeScriptEmitterOutput {
    const files = new Map<string, string>();
    const filesWritten: string[] = [];

    for (const context of ir.contexts) {
      if (!shouldIncludeContext(context, options.scope)) {
        continue;
      }

      const contextDir = `src/${safePathSegment(toKebabCase(context.name))}`;
      const aggregates = filterAggregates(context, options.scope);

      for (const aggregate of aggregates) {
        const kebabAggregate = toKebabCase(aggregate.name);

        const typesPath = `${contextDir}/${kebabAggregate}.types.ts`;
        const typesContent = generateTypesFile(aggregate);
        files.set(typesPath, typesContent);
        filesWritten.push(typesPath);

        const aggregatePath = `${contextDir}/${kebabAggregate}.aggregate.ts`;
        const aggregateContent = generateAggregateFile(aggregate);
        files.set(aggregatePath, aggregateContent);
        filesWritten.push(aggregatePath);
      }

      if (aggregates.length > 0) {
        const indexPath = `${contextDir}/index.ts`;
        const indexContent = generateContextIndexFile({
          ...context,
          aggregates,
        });
        files.set(indexPath, indexContent);
        filesWritten.push(indexPath);
      }
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
