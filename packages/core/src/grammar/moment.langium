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
    SagaDeclaration | ContextRelationshipDeclaration | AnnotationDeclaration |
    ProjectionDeclaration | QueryDeclaration | RuleDeclaration;

// --- Projection (ADR-037 §1, PRD §5.1.1) ---
ProjectionDeclaration:
    'projection' name=ID
        'sources' sources+=ID (',' sources+=ID)*
        ('description' description=STRING)?
        ('field' fields+=FieldDeclaration)*;

// --- Rule outside an aggregate (ADR-037 §3): enforced by a declared service or query, or an external enforcer ---
RuleDeclaration:
    'rule' id=ID description=STRING
        'enforced-by' (enforcer=ID | enforcerText=STRING);

// --- Query (ADR-037 §2) ---
QueryDeclaration:
    'query' name=ID
        'reads' reads+=ID (',' reads+=ID)*
        ('input' inputs+=InputField (',' inputs+=InputField)*)?
        ('description' description=STRING)?;

// --- Classification Annotations (PRD §5.1.4, Sift ADR-053 D4) ---
// An annotation classifies the NEXT declaration in the member list.
// Values are rendered as-is; enum membership is not validated (SIM-01).
// The name is an ID (not keywords) so 'classification' etc. remain usable
// as field names; the V18 validator restricts the accepted annotation names.
AnnotationDeclaration:
    '@' name=ID '(' value=AnnotationValue ')';

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
    name=InputName ':' type=TypeReference deprecation=FieldDeprecation?;

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
// The state chain is `Initial (-> Target (on Event)?)*`. Each optional
// `on <Event>` names the domain event that fires the transition it follows
// (Held -> Converting on PaymentConfirmed: Held→Converting fires on
// PaymentConfirmed). NOTE: `on` is a grammar keyword — a bare `on` can no
// longer be used as an ID anywhere (longer names like `onboarding` are fine).
SagaDeclaration:
    'saga' name=ID
        'trigger' trigger=ID
        'states' initialState=ID transitions+=SagaTransition*
        'compensation' compensation=STRING
        'timeout' timeout=SagaTimeout;

SagaTransition:
    '->' target=ID ('on' event=ID)?;

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
    name=FieldName ':' type=TypeReference deprecation=FieldDeprecation?;

FieldDeprecation:
    '[' 'deprecated' reason=STRING '->' replacement=STRING ']';

// ADR-037 made new words keywords. A comma-separated input list may use any of them as a name; a field
// list, which a new declaration can follow, may use only those that cannot begin a declaration.
InputName returns string:
    FieldName | 'projection' | 'query' | 'rule';

FieldName returns string:
    ID | 'sources' | 'field' | 'reads' | 'enforced-by';

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
