declare module 'bpmn-moddle' {
  interface BpmnModdle {
    fromXML(xml: string): Promise<{ rootElement: any; warnings: any[] }>;
    toXML(element: any, options?: any): Promise<{ xml: string }>;
  }

  interface BpmnModdleConstructor {
    new (packages?: any): BpmnModdle;
  }

  export const BpmnModdle: BpmnModdleConstructor;
}
