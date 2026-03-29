export type FeedbackEventType =
  | 'ValueObjectDefined'
  | 'ValueObjectRemoved'
  | 'ValueObjectRenamed'
  | 'ValueObjectFieldAdded'
  | 'ValueObjectFieldRemoved'
  | 'ValueObjectFieldRevised'
  | 'CommandInputRevised'
  | 'DomainEventPayloadRevised';
