grammar Moment

// ============================================================================
// Entry Rules — A .moment file may contain contexts, flows, or both (ADR-027)
// ============================================================================

entry MomentFile:
    (contexts+=ContextDeclaration | flows+=FlowDeclaration)+;

// ============================================================================
// Part I: Spatial Constructs (context files)
// ============================================================================

ContextDeclaration:
    'context' name=STRING classification=Classification?
        ('description' description=STRING)?
        members+=ContextMember*;

ContextMember:
    AggregateDeclaration | DomainServiceDeclaration | PolicyDeclaration |
    SagaDeclaration | ContextRelationshipDeclaration | AnnotationDeclaration;

// --- Classification Annotations (PRD §5.1.4, Sift ADR-053 D4) ---
// An annotation classifies the NEXT declaration in the member list.
// Values are rendered as-is; enum membership is not validated (SIM-01).
AnnotationDeclaration:
    '@' name=AnnotationName '(' value=AnnotationValue ')';

AnnotationName returns string:
    'classification' | 'retention' | 'encryption';

AnnotationValue returns string:
    ID | STRING;

// --- Aggregate ---
AggregateDeclaration:
    'aggregate' name=STRING
        'identity' identityField=FieldDeclaration
        members+=AggregateMember*;

AggregateMember:
    CommandDeclaration | DomainEventDeclaration | ValueObjectDeclaration | InvariantDeclaration |
    AnnotationDeclaration;

CommandDeclaration:
    'command' name=ID
        ('input' inputs+=InputField (',' inputs+=InputField)*)?
        preconditions+=Precondition*
        'emits' emits=ID;

InputField:
    name=ID ':' type=TypeReference deprecation=FieldDeprecation?;

Precondition:
    'precondition' name=ID ':' description=STRING;

DomainEventDeclaration:
    'event' name=ID
        fields+=FieldDeclaration*;

ValueObjectDeclaration:
    'value-object' name=ID
        fields+=FieldDeclaration*;

InvariantDeclaration:
    'invariant' id=ID description=STRING
        'scope' scope=ID;

// --- Domain Service ---
DomainServiceDeclaration:
    'service' name=ID
        'consumes' consumes=ID
        'produces' produces=ID
        'description' description=STRING;

// --- Policy ---
PolicyDeclaration:
    'policy' name=ID
        'trigger' trigger=PolicyTrigger
        'action' action=STRING
        ('chains-to' chainsTo=ID)?;

PolicyTrigger:
    eventName=ID | fileWatcher='"file-watcher"';

// --- Saga ---
SagaDeclaration:
    'saga' name=ID
        'trigger' trigger=ID
        'states' states+=ID ('->' states+=ID)*
        'compensation' compensation=STRING
        'timeout' timeout=SagaTimeout;

SagaTimeout:
    duration=ID | none='"none"';

// --- Context Relationship ---
ContextRelationshipDeclaration:
    'relationship' source=ID '->' target=ID
        'type' type=RelationshipType
        'contract' contract=STRING;

// ============================================================================
// Part II: Temporal Constructs (flow files)
// ============================================================================

FlowDeclaration:
    'flow' name=STRING
        ('description' description=STRING)?
        lanes+=LaneDeclaration*
        moments+=MomentDeclaration*;

LaneDeclaration:
    ('lane' | isBranch?='branch-lane') id=ID label=STRING classification=Classification?;

MomentDeclaration:
    'moment' label=STRING isBranch?='[branch]'?
        (nodes+=NodePlacement | whenBlocks+=WhenBlock)*;

WhenBlock:
    'when' condition=ID ('[' lane=ID ']')?
        nodes+=NodePlacement*;

NodePlacement:
    laneId=ID ':' nodeName=ID
        multiplicity=Multiplicity?
        modifier=NodeModifier?
        crossing=ContextCrossing?
        connections+=Connection*;

Multiplicity:
    '(' '×' (count=INT | countVar=ID) ')';

NodeModifier:
    '[' type=ModifierType ']';

ModifierType returns string:
    'optional' | 'terminal';

// --- Connections ---
Connection:
    TriggeredBy | Triggers | ReturnsTo;

ContextCrossing:
    'crosses-to' targetLaneId=ID 'via' relationshipType=RelationshipType
        'contract' fields+=ContractField*;

ContractField:
    name=ID ':' type=TypeReference required?='[required]'?;

TriggeredBy:
    'triggered-by' nodeName=ID;

Triggers:
    'triggers' nodeName=ID;

ReturnsTo:
    'returns-to' frameLabel=STRING;

// ============================================================================
// Part III: Shared Rules — Types, Classifications, Relationships
// ============================================================================

FieldDeclaration:
    name=ID ':' type=TypeReference deprecation=FieldDeprecation?;

FieldDeprecation:
    '[' 'deprecated' reason=STRING '->' replacement=STRING ']';

TypeReference:
    typeName=TypeName isArray?='[]'?;

TypeName returns string:
    'string' | 'number' | 'boolean' | 'UUID' | 'DateTime' | 'Date' | 'Money' | ID;

Classification:
    '[' value=ClassificationValue ']';

ClassificationValue returns string:
    'Core' | 'Supporting' | 'Generic' | 'Terminal';

RelationshipType returns string:
    'CustomerSupplier' | 'Partnership' | 'Conformist' |
    'AnticorruptionLayer' | 'OpenHostService' | 'PublishedLanguage' |
    'SeparateWays' | ID;

// ============================================================================
// Terminal Rules
// ============================================================================

terminal ID: /[a-zA-Z_][a-zA-Z0-9_-]*/;
terminal STRING: /"[^"]*"/;
terminal INT returns number: /[0-9]+/;

// Whitespace and comments
hidden terminal WS: /\s+/;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
