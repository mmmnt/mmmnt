export interface Feature {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export interface PipelineStage {
  id: string;
  label: string;
  package: string;
  description: string;
  input: string;
  output: string;
}

export interface Example {
  id: string;
  title: string;
  description: string;
  moment: string;
  typescript: string;
  testScaffold: string;
  gherkin: string;
  specDoc: string;
  asyncApi: string;
}

export interface EcosystemTool {
  id: string;
  name: string;
  tagline: string;
  description: string;
  events: string[];
  output: string;
  position: 'upstream' | 'core' | 'downstream';
}

export interface DataFlow {
  from: string;
  to: string;
  channel: string;
  description: string;
}

export interface EnvelopeField {
  name: string;
  type: string;
  description: string;
}

export interface Ecosystem {
  envelope: {
    name: string;
    description: string;
    fields: EnvelopeField[];
  };
  tools: EcosystemTool[];
  dataFlow: DataFlow[];
}
