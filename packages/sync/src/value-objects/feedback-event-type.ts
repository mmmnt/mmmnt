export const FEEDBACK_EVENT_TYPES = [
  'ValueObjectDefined',
  'ValueObjectRemoved',
  'ValueObjectRenamed',
  'ValueObjectFieldAdded',
  'ValueObjectFieldRemoved',
  'ValueObjectFieldRevised',
  'CommandInputRevised',
  'DomainEventPayloadRevised',
] as const;

export type FeedbackEventType = (typeof FEEDBACK_EVENT_TYPES)[number];
