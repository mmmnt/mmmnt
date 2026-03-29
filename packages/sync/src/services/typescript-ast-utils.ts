import ts from 'typescript';

export interface TypeSymbol {
  name: string;
  kind: 'interface' | 'type-alias' | 'enum';
  fields: Map<string, string>;
  text: string;
}

export interface TypeDifference {
  symbolName: string;
  differenceType:
    | 'new-interface'
    | 'removed-interface'
    | 'added-field'
    | 'removed-field'
    | 'changed-type'
    | 'renamed-interface'
    | 'unrecognized';
  description: string;
}

function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const modifiers = ts.getModifiers(node);
  if (!modifiers) return false;
  return modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function extractInterface(
  statement: ts.InterfaceDeclaration,
  sourceFile: ts.SourceFile,
): TypeSymbol {
  const fields = new Map<string, string>();
  for (const member of statement.members) {
    if (ts.isPropertySignature(member) && member.name) {
      const name = member.name.getText(sourceFile);
      const typeText = member.type ? member.type.getText(sourceFile) : 'unknown';
      fields.set(name, typeText);
    }
  }
  return {
    name: statement.name.text,
    kind: 'interface',
    fields,
    text: statement.getText(sourceFile),
  };
}

function extractEnum(statement: ts.EnumDeclaration, sourceFile: ts.SourceFile): TypeSymbol {
  const fields = new Map<string, string>();
  for (const member of statement.members) {
    const name = member.name.getText(sourceFile);
    const initializer = member.initializer ? member.initializer.getText(sourceFile) : '';
    fields.set(name, initializer);
  }
  return {
    name: statement.name.text,
    kind: 'enum',
    fields,
    text: statement.getText(sourceFile),
  };
}

export function extractTypeSymbols(sourceText: string, fileName = 'source.ts'): TypeSymbol[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );

  const symbols: TypeSymbol[] = [];

  for (const statement of sourceFile.statements) {
    if (!hasExportModifier(statement)) continue;

    if (ts.isInterfaceDeclaration(statement)) {
      symbols.push(extractInterface(statement, sourceFile));
    } else if (ts.isTypeAliasDeclaration(statement)) {
      symbols.push({
        name: statement.name.text,
        kind: 'type-alias',
        fields: new Map(),
        text: statement.type.getText(sourceFile),
      });
    } else if (ts.isEnumDeclaration(statement)) {
      symbols.push(extractEnum(statement, sourceFile));
    }
  }

  return symbols;
}

function findRemovedSymbols(
  expectedByName: ReadonlyMap<string, TypeSymbol>,
  actualByName: ReadonlyMap<string, TypeSymbol>,
): TypeDifference[] {
  const diffs: TypeDifference[] = [];
  for (const [name, sym] of expectedByName) {
    if (!actualByName.has(name)) {
      diffs.push({
        symbolName: name,
        differenceType: 'removed-interface',
        description: `${sym.kind} '${name}' was removed from implementation`,
      });
    }
  }
  return diffs;
}

function findAddedSymbols(
  expectedByName: ReadonlyMap<string, TypeSymbol>,
  actualByName: ReadonlyMap<string, TypeSymbol>,
): TypeDifference[] {
  const diffs: TypeDifference[] = [];
  for (const [name, sym] of actualByName) {
    if (!expectedByName.has(name)) {
      diffs.push({
        symbolName: name,
        differenceType: 'new-interface',
        description: `${sym.kind} '${name}' was added in implementation`,
      });
    }
  }
  return diffs;
}

function compareFields(
  name: string,
  expected: ReadonlyMap<string, string>,
  actual: ReadonlyMap<string, string>,
  addedLabel: string,
  removedLabel: string,
): TypeDifference[] {
  const diffs: TypeDifference[] = [];

  for (const [fieldName, fieldType] of actual) {
    const expectedType = expected.get(fieldName);
    if (expectedType === undefined) {
      diffs.push({
        symbolName: name,
        differenceType: 'added-field',
        description: `${addedLabel} '${fieldName}' (${fieldType}) was added to '${name}'`,
      });
    } else if (expectedType !== fieldType) {
      diffs.push({
        symbolName: name,
        differenceType: 'changed-type',
        description: `Field '${fieldName}' in '${name}' changed from '${expectedType}' to '${fieldType}'`,
      });
    }
  }

  for (const [fieldName] of expected) {
    if (!actual.has(fieldName)) {
      diffs.push({
        symbolName: name,
        differenceType: 'removed-field',
        description: `${removedLabel} '${fieldName}' was removed from '${name}'`,
      });
    }
  }

  return diffs;
}

function compareSharedSymbol(expected: TypeSymbol, actual: TypeSymbol): TypeDifference[] {
  if (expected.kind !== actual.kind) {
    return [
      {
        symbolName: expected.name,
        differenceType: 'unrecognized',
        description: `Symbol '${expected.name}' changed kind from '${expected.kind}' to '${actual.kind}'`,
      },
    ];
  }

  if (expected.kind === 'interface') {
    return compareFields(expected.name, expected.fields, actual.fields, 'Field', 'Field');
  }

  if (expected.kind === 'enum') {
    return compareFields(
      expected.name,
      expected.fields,
      actual.fields,
      'Enum member',
      'Enum member',
    );
  }

  if (expected.kind === 'type-alias' && expected.text !== actual.text) {
    return [
      {
        symbolName: expected.name,
        differenceType: 'changed-type',
        description: `Type alias '${expected.name}' changed from '${expected.text}' to '${actual.text}'`,
      },
    ];
  }

  return [];
}

export function compareTypeSymbols(expected: TypeSymbol[], actual: TypeSymbol[]): TypeDifference[] {
  const expectedByName = new Map(expected.map((s) => [s.name, s]));
  const actualByName = new Map(actual.map((s) => [s.name, s]));

  const differences: TypeDifference[] = [
    ...findRemovedSymbols(expectedByName, actualByName),
    ...findAddedSymbols(expectedByName, actualByName),
  ];

  for (const [name, expectedSymbol] of expectedByName) {
    const actualSymbol = actualByName.get(name);
    if (!actualSymbol) continue;
    differences.push(...compareSharedSymbol(expectedSymbol, actualSymbol));
  }

  return differences;
}
