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
): Set<string> {
  const imported = new Set<string>();
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue;
    const bindings = stmt.importClause.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const name = element.name.text;
      if (knownNames.has(name)) {
        imported.add(name);
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

function collectPropertyAccesses(
  sourceFile: ts.SourceFile,
  knownNames: ReadonlySet<string>,
  fieldsByType: ReadonlyMap<string, readonly string[]>,
): Map<string, Set<string>> {
  const typedVars = new Map<string, string>();
  const accessed = new Map<string, Set<string>>();

  function visitForTypedVars(node: ts.Node): void {
    if (ts.isParameter(node) || ts.isVariableDeclaration(node)) {
      const typeAnnotation = node.type;
      if (typeAnnotation && ts.isTypeReferenceNode(typeAnnotation)) {
        const typeName = typeAnnotation.typeName;
        if (ts.isIdentifier(typeName) && knownNames.has(typeName.text)) {
          const varName = node.name;
          if (ts.isIdentifier(varName)) {
            typedVars.set(varName.text, typeName.text);
          }
        }
      }
    }
    ts.forEachChild(node, visitForTypedVars);
  }

  function visitForAccesses(node: ts.Node): void {
    if (ts.isPropertyAccessExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr)) {
        const eventType = typedVars.get(expr.text);
        if (eventType) {
          const fields = fieldsByType.get(eventType);
          const propName = node.name.text;
          if (fields && fields.includes(propName)) {
            if (!accessed.has(eventType)) {
              accessed.set(eventType, new Set());
            }
            accessed.get(eventType)!.add(propName);
          }
        }
      }
    }
    ts.forEachChild(node, visitForAccesses);
  }

  ts.forEachChild(sourceFile, visitForTypedVars);
  ts.forEachChild(sourceFile, visitForAccesses);
  return accessed;
}

function collectStringLiteralMatches(
  sourceFile: ts.SourceFile,
  fieldsByType: ReadonlyMap<string, readonly string[]>,
  alreadyDetected: ReadonlySet<string>,
): Map<string, Set<string>> {
  const matches = new Map<string, Set<string>>();

  function visit(node: ts.Node): void {
    if (ts.isStringLiteral(node)) {
      const text = node.text;
      for (const [eventType, fields] of fieldsByType) {
        if (alreadyDetected.has(eventType)) continue;
        if (fields.includes(text)) {
          if (!matches.has(eventType)) {
            matches.set(eventType, new Set());
          }
          matches.get(eventType)!.add(text);
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

function addConsumptions(
  filePath: string,
  eventTypes: ReadonlySet<string>,
  fieldsByType: ReadonlyMap<string, readonly string[]>,
  detectedTypes: Set<string>,
  confidence: 'high' | 'medium' | 'low',
): DetectedConsumption[] {
  const results: DetectedConsumption[] = [];
  for (const eventType of eventTypes) {
    if (detectedTypes.has(eventType)) continue;
    detectedTypes.add(eventType);
    results.push({
      filePath,
      eventType,
      fields: [...(fieldsByType.get(eventType) ?? [])],
      confidence,
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
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const detectedTypes = new Set<string>();

  const consumptions: DetectedConsumption[] = [
    ...addConsumptions(
      filePath,
      collectImportedEventTypes(sourceFile, knownNames),
      fieldsByType,
      detectedTypes,
      'high',
    ),
    ...addConsumptions(
      filePath,
      collectTypeAnnotationRefs(sourceFile, knownNames),
      fieldsByType,
      detectedTypes,
      'high',
    ),
    ...addPropertyAccessConsumptions(
      filePath,
      collectPropertyAccesses(sourceFile, knownNames, fieldsByType),
      detectedTypes,
    ),
    ...addConsumptions(
      filePath,
      new Set(collectStringLiteralMatches(sourceFile, fieldsByType, detectedTypes).keys()),
      fieldsByType,
      detectedTypes,
      'low',
    ),
  ];

  const unresolvable = collectUnresolvable(sourceFile, knownNames, detectedTypes);

  return { consumptions, unresolvable };
}
