import ts from 'typescript';
import type { DetectedConsumption } from '../value-objects/index.js';

export interface EventTypeDefinition {
  readonly eventType: string;
  readonly fields: readonly string[];
}

interface ScanResult {
  consumptions: DetectedConsumption[];
  unresolvable: string[];
}

function collectImportedEventTypes(
  sourceFile: ts.SourceFile,
  knownNames: ReadonlySet<string>,
): Map<string, string> {
  // Maps localName → importedName (handles aliases)
  const imported = new Map<string, string>();
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue;
    const bindings = stmt.importClause.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const importedName = (element.propertyName ?? element.name).text;
      const localName = element.name.text;
      if (knownNames.has(importedName)) {
        imported.set(localName, importedName);
      }
    }
  }
  return imported;
}

function collectTypeAnnotationRefs(
  sourceFile: ts.SourceFile,
  knownNames: ReadonlySet<string>,
): Set<string> {
  const refs = new Set<string>();
  function visit(node: ts.Node): void {
    if (ts.isTypeReferenceNode(node)) {
      const typeName = node.typeName;
      if (ts.isIdentifier(typeName) && knownNames.has(typeName.text)) {
        refs.add(typeName.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(sourceFile, visit);
  return refs;
}

function extractTypedParam(
  param: ts.ParameterDeclaration,
  localToEventType: ReadonlyMap<string, string>,
): [string, string] | undefined {
  if (!param.type || !ts.isTypeReferenceNode(param.type)) return undefined;
  const typeName = param.type.typeName;
  if (!ts.isIdentifier(typeName) || !ts.isIdentifier(param.name)) return undefined;
  const eventType = localToEventType.get(typeName.text);
  return eventType ? [param.name.text, eventType] : undefined;
}

function collectFunctionParams(
  node: ts.Node,
  localToEventType: ReadonlyMap<string, string>,
  localVars: Map<string, string>,
): void {
  if (
    !ts.isFunctionDeclaration(node) &&
    !ts.isArrowFunction(node) &&
    !ts.isFunctionExpression(node) &&
    !ts.isMethodDeclaration(node)
  )
    return;
  for (const param of (node as ts.FunctionLikeDeclaration).parameters) {
    const result = extractTypedParam(param, localToEventType);
    if (result) localVars.set(result[0], result[1]);
  }
}

function collectVarDeclaration(
  node: ts.Node,
  localToEventType: ReadonlyMap<string, string>,
  localVars: Map<string, string>,
): void {
  if (!ts.isVariableDeclaration(node) || !node.type || !ts.isTypeReferenceNode(node.type)) return;
  const typeName = node.type.typeName;
  if (!ts.isIdentifier(typeName) || !ts.isIdentifier(node.name)) return;
  const eventType = localToEventType.get(typeName.text);
  if (eventType) localVars.set(node.name.text, eventType);
}

function recordPropertyAccess(
  node: ts.Node,
  localVars: ReadonlyMap<string, string>,
  fieldsByType: ReadonlyMap<string, readonly string[]>,
  accessed: Map<string, Set<string>>,
): void {
  if (!ts.isPropertyAccessExpression(node)) return;
  const expr = node.expression;
  if (!ts.isIdentifier(expr)) return;
  const eventType = localVars.get(expr.text);
  if (!eventType) return;
  const fields = fieldsByType.get(eventType);
  const propName = node.name.text;
  if (fields && fields.includes(propName)) {
    if (!accessed.has(eventType)) accessed.set(eventType, new Set());
    accessed.get(eventType)!.add(propName);
  }
}

function collectPropertyAccesses(
  sourceFile: ts.SourceFile,
  localToEventType: ReadonlyMap<string, string>,
  fieldsByType: ReadonlyMap<string, readonly string[]>,
): Map<string, Set<string>> {
  const accessed = new Map<string, Set<string>>();

  function visitScope(node: ts.Node, scopeVars: Map<string, string>): void {
    const localVars = new Map(scopeVars);
    collectFunctionParams(node, localToEventType, localVars);
    collectVarDeclaration(node, localToEventType, localVars);
    recordPropertyAccess(node, localVars, fieldsByType, accessed);
    ts.forEachChild(node, (child) => visitScope(child, localVars));
  }

  ts.forEachChild(sourceFile, (child) => visitScope(child, new Map()));
  return accessed;
}

function buildFieldReverseIndex(
  fieldsByType: ReadonlyMap<string, readonly string[]>,
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const [eventType, fields] of fieldsByType) {
    for (const field of fields) {
      if (!index.has(field)) {
        index.set(field, new Set());
      }
      index.get(field)!.add(eventType);
    }
  }
  return index;
}

function collectStringLiteralMatches(
  sourceFile: ts.SourceFile,
  fieldReverseIndex: ReadonlyMap<string, Set<string>>,
  alreadyDetected: ReadonlySet<string>,
): Map<string, Set<string>> {
  const matches = new Map<string, Set<string>>();

  function visit(node: ts.Node): void {
    if (ts.isStringLiteral(node)) {
      const eventTypes = fieldReverseIndex.get(node.text);
      if (eventTypes) {
        for (const eventType of eventTypes) {
          if (alreadyDetected.has(eventType)) continue;
          if (!matches.has(eventType)) {
            matches.set(eventType, new Set());
          }
          matches.get(eventType)!.add(node.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return matches;
}

function collectUnresolvable(
  sourceFile: ts.SourceFile,
  knownNames: ReadonlySet<string>,
  detectedTypes: ReadonlySet<string>,
): string[] {
  const unresolvable: string[] = [];
  const seen = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && !knownNames.has(node.text)) {
      const text = node.text;
      if (!seen.has(text) && /Event$|Command$/.test(text) && !detectedTypes.has(text)) {
        seen.add(text);
        unresolvable.push(text);
      }
    }
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return unresolvable;
}

function addStringLiteralConsumptions(
  filePath: string,
  matches: ReadonlyMap<string, Set<string>>,
  detectedTypes: Set<string>,
): DetectedConsumption[] {
  const results: DetectedConsumption[] = [];
  for (const [eventType, fields] of matches) {
    if (detectedTypes.has(eventType)) continue;
    detectedTypes.add(eventType);
    results.push({
      filePath,
      eventType,
      fields: [...fields], // Only matched fields, not all known fields
      confidence: 'low',
    });
  }
  return results;
}

function addHighConfidenceConsumptions(
  filePath: string,
  eventTypes: ReadonlySet<string>,
  fieldsByType: ReadonlyMap<string, readonly string[]>,
  detectedTypes: Set<string>,
): DetectedConsumption[] {
  const results: DetectedConsumption[] = [];
  for (const eventType of eventTypes) {
    if (detectedTypes.has(eventType)) continue;
    detectedTypes.add(eventType);
    results.push({
      filePath,
      eventType,
      fields: [...(fieldsByType.get(eventType) ?? [])],
      confidence: 'high',
    });
  }
  return results;
}

function addPropertyAccessConsumptions(
  filePath: string,
  accesses: ReadonlyMap<string, Set<string>>,
  detectedTypes: Set<string>,
): DetectedConsumption[] {
  const results: DetectedConsumption[] = [];
  for (const [eventType, fields] of accesses) {
    if (detectedTypes.has(eventType)) continue;
    detectedTypes.add(eventType);
    results.push({
      filePath,
      eventType,
      fields: [...fields],
      confidence: 'high',
    });
  }
  return results;
}

export function scanForConsumptions(
  filePath: string,
  sourceText: string,
  knownEventTypes: readonly EventTypeDefinition[],
): ScanResult {
  if (knownEventTypes.length === 0) {
    return { consumptions: [], unresolvable: [] };
  }

  const knownNames = new Set(knownEventTypes.map((e) => e.eventType));
  const fieldsByType = new Map(knownEventTypes.map((e) => [e.eventType, e.fields]));
  const fieldReverseIndex = buildFieldReverseIndex(fieldsByType);
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const detectedTypes = new Set<string>();

  // Build localName → eventType mapping (handles aliased imports)
  const importMap = collectImportedEventTypes(sourceFile, knownNames);
  const localToEventType = new Map<string, string>();
  for (const [localName, importedName] of importMap) {
    localToEventType.set(localName, importedName);
  }
  // Also add direct knownNames for type annotations without imports
  for (const name of knownNames) {
    if (!localToEventType.has(name)) {
      localToEventType.set(name, name);
    }
  }

  const consumptions: DetectedConsumption[] = [
    ...addHighConfidenceConsumptions(
      filePath,
      new Set(importMap.values()),
      fieldsByType,
      detectedTypes,
    ),
    ...addHighConfidenceConsumptions(
      filePath,
      collectTypeAnnotationRefs(sourceFile, knownNames),
      fieldsByType,
      detectedTypes,
    ),
    ...addPropertyAccessConsumptions(
      filePath,
      collectPropertyAccesses(sourceFile, localToEventType, fieldsByType),
      detectedTypes,
    ),
    ...addStringLiteralConsumptions(
      filePath,
      collectStringLiteralMatches(sourceFile, fieldReverseIndex, detectedTypes),
      detectedTypes,
    ),
  ];

  const unresolvable = collectUnresolvable(sourceFile, knownNames, detectedTypes);

  return { consumptions, unresolvable };
}
