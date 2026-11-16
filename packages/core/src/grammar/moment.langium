grammar Moment

// ============================================================================
// Entry Rules — A .moment file may contain contexts, flows, or both (ADR-027)
// ============================================================================

entry MomentFile:
    (contexts+=ContextDeclaration | flows+=FlowDeclaration | externals+=ExternalDeclaration)+;

// --- External system (ADR-037 §6): not modelled, may be a relationship end or a lane ---
ExternalDeclaration:
    'external' name=ID description=STRING
        gateways+=GatewayDeclaration*;

// --- Gateway (ADR-038 §4): the palette's Gateway tab on a projection, orchestration, policy or external ---
GatewayDeclaration:
    'gateway' name=ID
        'consumes' consumes=ID
        'produces' produces=ID
        ('description' description=STRING)?;

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
    ProjectionDeclaration | QueryDeclaration | RuleDeclaration | ValueObjectDeclaration | TermDeclaration;

// --- Projection (ADR-037 §1, PRD §5.1.1) ---
ProjectionDeclaration:
    'projection' name=ID
        'sources' sources+=ID (',' sources+=ID)*
        ('description' description=STRING)?
        ('field' fields+=FieldDeclaration)*
        gateways+=GatewayDeclaration*;

// --- Rule outside an aggregate (ADR-037 §3): enforced by a declared service or query, or an external enforcer ---
RuleDeclaration:
    'rule' id=ID description=STRING
        'enforced-by' (enforcer=ID | enforcerText=STRING);

// --- Glossary term (ADR-037 §5) ---
TermDeclaration:
    'term' term=STRING definition=STRING;

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
        states+=AggregateStateDeclaration*
        members+=AggregateMember*;

AggregateMember:
    CommandDeclaration | DomainEventDeclaration | ValueObjectDeclaration | InvariantDeclaration |
    AnnotationDeclaration;

// --- Aggregate internal state (ADR-038 §3), right after the identity: one initial state, transitions on
// the aggregate's own commands. Written first, it cannot be read as an event field named `state`. ---
AggregateStateDeclaration:
    'state' (initial?='initial' name=ID | from=ID '->' to=ID 'on' command=ID);

CommandDeclaration:
    'command' name=ID
        ('input' inputs+=InputField (',' inputs+=InputField)*)?
        ('causes' causes+=ID (',' causes+=ID)*)?
        preconditions+=Precondition*
        emits=EmitsClause;

// --- Emits (ADR-041): a command records one or more events. `,` joins the events one transaction records
// together; `|` separates alternative outcomes, of which the aggregate's state decides one. `when` names
// the declared state in which an outcome is recorded. The plain `emits A` is one outcome of one event. ---
EmitsClause:
    'emits' outcomes+=EmitOutcome ('|' outcomes+=EmitOutcome)*;

EmitOutcome:
    events+=ID (',' events+=ID)* ('when' state=ID)?;

// `?` marks an optional input (ADR-049 D1); the type and its attributes are a field's.
InputField:
    name=InputName optional?='?'? ':' type=TypeReference attributes=FieldAttributes?;

Precondition:
    'precondition' name=ID ('cause' causes+=ID (',' causes+=ID)*)? ':' description=STRING;

DomainEventDeclaration:
    'event' name=ID
        fields+=FieldDeclaration*;

// ADR-049: a value object is a record (fields), a scalar (`: Type`, D4; a literal set is a code set, D2),
// or a tagged union (fields common to every variant, then `| Variant` and the variant's fields, D3).
ValueObjectDeclaration:
    'value-object' name=ID
        (':' scalar=TypeReference scalarAttributes=FieldAttributes? |
         fields+=FieldDeclaration* variants+=VariantDeclaration*);

VariantDeclaration:
    '|' name=ID
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

// --- Policy (ADR-038 §1): When one domain event, Then one command ---
// The trigger may carry the condition under which the policy reacts (ADR-045): one equality on a field of
// the trigger event, and/or a cause. `after` is a keyword, escaped in FieldName and LaneName as ADR-043's `outcome` was.
// The field may be a path, `<field>.kind`, the variant of a union field (ADR-050); validation (V56) refuses any
// other path, so the grammar reads every dotted path and the rule names what is wrong.
PolicyDeclaration:
    'policy' name=ID
        'trigger' trigger=ID
        ('when' conditionField=ConditionPath '=' conditionValue=AnnotationValue)?
        ('after' conditionAfter=ID)?
        'action' action=STRING
        'chains-to' chainsTo=ID
        gateways+=GatewayDeclaration*;

// --- Orchestration (ADR-038 §2), the palette's Saga; `saga` is an alias ---
// Invoked by one of its own commands, it issues commands to aggregates and
// externals and advances only on its own commands, each invoked by a relay
// policy on the previous step's event. `on` is a grammar keyword.
SagaDeclaration:
    keyword=('orchestration' | 'saga') name=ID
        commands+=OrchestrationCommand*
        events+=DomainEventDeclaration*
        'invoked-by' invokedBy=ID
        'issues' issues+=IssuedCommand (',' issues+=IssuedCommand)*
        'states' initialState=ID transitions+=SagaTransition*
        compensations+=Compensation+
        'timeout' timeout=SagaTimeout
        gateways+=GatewayDeclaration*;

OrchestrationCommand:
    'command' name=ID
        ('input' inputs+=InputField (',' inputs+=InputField)*)?
        ('causes' causes+=ID (',' causes+=ID)*)?
        preconditions+=Precondition*
        (emits=EmitsClause)?;

IssuedCommand:
    target=ID ('.' operation=ID)?;

SagaTransition:
    '->' target=ID ('on' command=ID)?;

Compensation:
    'compensation' (none?='none' | 'on' command=ID 'issues' undo+=IssuedCommand (',' undo+=IssuedCommand)*);

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
    ('lane' | isBranch?='branch-lane') id=LaneName label=STRING classification=Classification?;

MomentDeclaration:
    'moment' label=STRING isBranch?='[branch]'?
        (nodes+=NodePlacement | whenBlocks+=WhenBlock | notes+=NoteStatement)*;

// --- Note (ADR-040 D3): narration of a step outside the model; never a node ---
// `note <lane>: "text"` speaks for a lane, `note "text"` for no lane. `note: Name` stays a placement on a lane named note.
NoteStatement:
    'note' (laneId=LaneName ':')? text=STRING;

WhenBlock:
    'when' condition=ID ('[' lane=LaneName ']')?
        nodes+=NodePlacement*;

NodePlacement:
    laneId=LaneName ':' nodeName=ID
        multiplicity=Multiplicity?
        modifier=NodeModifier?
        ('cause' cause=ID)?
        crossing=ContextCrossing?
        connections+=Connection*;

// A lane may be named with any word, a keyword included (ADR-051, which generalises the escapes of ADR-040 and ADR-043).
LaneName returns string:
    ID | ReservedWord;

Multiplicity:
    '(' '×' (count=INT | countVar=ID) ')';

NodeModifier:
    '[' type=ModifierType ']';

// `[terminal]` ends the flow at a failure exit; `[outcome]` ends it at a normal outcome (ADR-043).
ModifierType returns string:
    'optional' | 'terminal' | 'outcome';

// --- Connections ---
Connection:
    TriggeredBy | Triggers | ReturnsTo;

ContextCrossing:
    'crosses-to' targetLaneId=LaneName 'via' relationshipType=RelationshipType
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

// `name?: T` is optional (ADR-049 D1). `a: T | b: U` on one line is a group of which exactly one is present (D5).
FieldDeclaration:
    name=FieldName optional?='?'? ':' type=TypeReference attributes=FieldAttributes?
        ('|' alternatives+=FieldAlternative)*;

FieldAlternative:
    name=FieldName optional?='?'? ':' type=TypeReference attributes=FieldAttributes?;

// Written after the type, in any order (ADR-049 D7): `[deprecated "..." -> "..."]`, `[pattern "<regex>"]`, `[encrypted]`.
FieldAttributes:
    (deprecation+=FieldDeprecation | patterns+=FieldPattern | encrypted+='[encrypted]')+;

FieldDeprecation:
    '[' 'deprecated' reason=STRING '->' replacement=STRING ']';

FieldPattern:
    '[' 'pattern' pattern=STRING ']';

// A field or an input may be named with any word, a keyword included (ADR-051). ADR-037, ADR-040, ADR-043,
// ADR-045 and ADR-049 escaped their keywords one at a time; the escape is now the whole reserved set.
InputName returns string:
    FieldName;

FieldName returns string:
    ID | ReservedWord;

// ADR-051: every word the grammar reserves. Each may name a field, an input or a lane: in those places
// the word is followed by `:` or `?:` (by `"label"` after `lane`), which no declaration or clause that
// begins with the word is, so the parser's unbounded lookahead tells the two apart. A keyword added to the
// grammar is added here too; `keyword-names-adr051.spec.ts` reads the grammar's words and fails otherwise.
ReservedWord returns string:
    'AnticorruptionLayer' | 'Conformist' | 'Core' | 'CustomerSupplier' | 'Date' | 'DateTime' |
    'External' | 'Generic' | 'Money' | 'OpenHostService' | 'Partnership' | 'PublishedLanguage' |
    'SeparateWays' | 'Supporting' | 'Terminal' | 'UUID' | 'action' | 'after' | 'aggregate' | 'boolean' |
    'branch-lane' | 'cause' | 'causes' | 'chains-to' | 'command' | 'compensation' | 'consumes' |
    'context' | 'contract' | 'crosses-to' | 'deprecated' | 'description' | 'emits' | 'enforced-by' |
    'event' | 'external' | 'field' | 'flow' | 'gateway' | 'identity' | 'initial' | 'input' |
    'invariant' | 'invoked-by' | 'issues' | 'lane' | 'moment' | 'none' | 'note' | 'number' | 'on' |
    'optional' | 'orchestration' | 'outcome' | 'pattern' | 'policy' | 'precondition' | 'produces' |
    'projection' | 'query' | 'reads' | 'relationship' | 'returns-to' | 'rule' | 'saga' | 'scope' |
    'service' | 'sources' | 'state' | 'states' | 'string' | 'term' | 'terminal' | 'timeout' |
    'trigger' | 'triggered-by' | 'triggers' | 'type' | 'value-object' | 'via' | 'when';

// A field of the trigger event, or a path into it (ADR-050): `decision.kind`. Written back without spaces.
ConditionPath returns string:
    FieldName ('.' FieldName)*;

// A built-in or value object type, or a code set of string literals (ADR-049 D2), then `[]` (array) or
// `{}` / `{key}` (a map from a string key, D6).
TypeReference:
    (typeName=TypeName | literals+=CodeLiteral ('|' literals+=CodeLiteral)*)
        (isArray?='[]' | isMap?='{' mapKey=ID? '}')?;

// `"none"` is a token of its own (an orchestration's `timeout "none"`), so a code set may list it too;
// the IR writes it unquoted like every other code.
CodeLiteral returns string:
    STRING | '"none"';

TypeName returns string:
    'string' | 'number' | 'boolean' | 'UUID' | 'DateTime' | 'Date' | 'Money' | ID;

Classification:
    '[' value=ClassificationValue ']';

ClassificationValue returns string:
    'Core' | 'Supporting' | 'Generic' | 'Terminal' | 'External';

RelationshipType returns string:
    'CustomerSupplier' | 'Partnership' | 'Conformist' |
    'AnticorruptionLayer' | 'OpenHostService' | 'PublishedLanguage' |
    'SeparateWays' | ID;

// ============================================================================
// Terminal Rules
// ============================================================================

terminal ID: /[a-zA-Z_][a-zA-Z0-9_-]*/;
terminal STRING: /"(\\.|[^"\\])*"/;
terminal INT returns number: /[0-9]+/;

// Whitespace and comments
hidden terminal WS: /\s+/;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
