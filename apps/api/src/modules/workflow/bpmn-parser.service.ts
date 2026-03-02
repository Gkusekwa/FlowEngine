import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ActivityType } from '@flowengine/shared';

interface ParsedActivity {
  bpmnElementId: string;
  type: ActivityType;
  name: string | null;
  config: Record<string, unknown>;
  position: { x: number; y: number };
  laneName?: string;
}

interface ParsedTransition {
  bpmnElementId: string;
  sourceRef: string;
  targetRef: string;
  conditionExpression: string | null;
  isDefault: boolean;
}

export interface ParsedBpmn {
  activities: ParsedActivity[];
  transitions: ParsedTransition[];
  processId: string;
  processName: string;
}

// Map BPMN element type strings to our ActivityType enum
const BPMN_TYPE_MAP: Record<string, ActivityType> = {
  'bpmn:StartEvent': ActivityType.START_EVENT,
  'bpmn:EndEvent': ActivityType.END_EVENT,
  'bpmn:UserTask': ActivityType.USER_TASK,
  'bpmn:ServiceTask': ActivityType.SERVICE_TASK,
  'bpmn:ScriptTask': ActivityType.SCRIPT_TASK,
  'bpmn:BusinessRuleTask': ActivityType.BUSINESS_RULE_TASK,
  'bpmn:SendTask': ActivityType.SEND_TASK,
  'bpmn:ReceiveTask': ActivityType.RECEIVE_TASK,
  'bpmn:ManualTask': ActivityType.MANUAL_TASK,
  'bpmn:ExclusiveGateway': ActivityType.EXCLUSIVE_GATEWAY,
  'bpmn:ParallelGateway': ActivityType.PARALLEL_GATEWAY,
  'bpmn:InclusiveGateway': ActivityType.INCLUSIVE_GATEWAY,
};

const SUPPORTED_TYPES = new Set(Object.keys(BPMN_TYPE_MAP));

@Injectable()
export class BpmnParserService {
  private readonly logger = new Logger(BpmnParserService.name);

  async parse(bpmnXml: string): Promise<ParsedBpmn> {
    // bpmn-moddle exports { BpmnModdle } as a named export
    const { BpmnModdle } = await import('bpmn-moddle');
    const moddle = new BpmnModdle();

    let definitions: any;
    try {
      const result = await moddle.fromXML(bpmnXml);
      definitions = result.rootElement;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown parse error';
      throw new BadRequestException({
        code: 'WF_INVALID_BPMN',
        message: `Invalid BPMN XML: ${message}`,
      });
    }

    const processes = definitions.rootElements?.filter(
      (el: any) => el.$type === 'bpmn:Process',
    );

    if (!processes || processes.length === 0) {
      throw new BadRequestException({
        code: 'WF_INVALID_BPMN',
        message: 'BPMN XML must contain at least one process',
      });
    }

    const process = processes[0];
    const activities: ParsedActivity[] = [];
    const transitions: ParsedTransition[] = [];

    // Parse flow elements
    const flowElements = process.flowElements || [];
    const diagramElements = this.extractDiagramPositions(definitions);

    // Build lane membership map: flowNodeId -> lane name
    const laneMap = this.extractLaneMembership(process);

    for (const element of flowElements) {
      if (element.$type === 'bpmn:SequenceFlow') {
        transitions.push({
          bpmnElementId: element.id,
          sourceRef: element.sourceRef?.id || element.sourceRef,
          targetRef: element.targetRef?.id || element.targetRef,
          conditionExpression: element.conditionExpression?.body || null,
          isDefault: false,
        });
      } else if (SUPPORTED_TYPES.has(element.$type)) {
        const activityType = BPMN_TYPE_MAP[element.$type];
        const pos = diagramElements.get(element.id) || { x: 0, y: 0 };

        const config: Record<string, unknown> = {};

        // Extract extension elements for config (e.g., form fields, HTTP config)
        if (element.extensionElements?.values) {
          for (const ext of element.extensionElements.values) {
            if (ext.$type === 'flowengine:config') {
              Object.assign(config, ext.$attrs || {});
            }
          }
        }

        const laneName = laneMap.get(element.id);

        // Auto-populate candidateGroup from lane name for tasks (if not explicitly set)
        if (laneName && !config.candidateGroup &&
            (activityType === ActivityType.USER_TASK || activityType === ActivityType.MANUAL_TASK)) {
          config.candidateGroup = laneName;
        }

        activities.push({
          bpmnElementId: element.id,
          type: activityType,
          name: element.name || null,
          config,
          position: pos,
          laneName,
        });
      }
    }

    // Mark default sequence flows on gateways
    for (const element of flowElements) {
      if (element.default) {
        const defaultFlowId = element.default.id || element.default;
        const transition = transitions.find((t) => t.bpmnElementId === defaultFlowId);
        if (transition) {
          transition.isDefault = true;
        }
      }
    }

    // Validate: must have at least one start and one end event
    const hasStart = activities.some((a) => a.type === ActivityType.START_EVENT);
    const hasEnd = activities.some((a) => a.type === ActivityType.END_EVENT);

    if (!hasStart) {
      throw new BadRequestException({
        code: 'WF_INVALID_BPMN',
        message: 'Workflow must have at least one Start Event',
      });
    }

    if (!hasEnd) {
      throw new BadRequestException({
        code: 'WF_INVALID_BPMN',
        message: 'Workflow must have at least one End Event',
      });
    }

    return {
      activities,
      transitions,
      processId: process.id,
      processName: process.name || process.id,
    };
  }

  private extractLaneMembership(process: any): Map<string, string> {
    const laneMap = new Map<string, string>();

    const extractFromLanes = (lanes: any[]) => {
      for (const lane of lanes) {
        const laneName = lane.name || lane.id;
        // Each lane has flowNodeRef pointing to elements inside it
        if (lane.flowNodeRef) {
          for (const nodeRef of lane.flowNodeRef) {
            const nodeId = nodeRef.id || nodeRef;
            laneMap.set(nodeId, laneName);
          }
        }
        // Handle nested lanes (child lane sets)
        if (lane.childLaneSet?.lanes) {
          extractFromLanes(lane.childLaneSet.lanes);
        }
      }
    };

    // Process can have multiple lane sets
    if (process.laneSets) {
      for (const laneSet of process.laneSets) {
        if (laneSet.lanes) {
          extractFromLanes(laneSet.lanes);
        }
      }
    }

    return laneMap;
  }

  private extractDiagramPositions(definitions: any): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();

    const diagrams = definitions.diagrams || [];
    for (const diagram of diagrams) {
      const plane = diagram.plane;
      if (!plane?.planeElement) continue;

      for (const shape of plane.planeElement) {
        if (shape.$type === 'bpmndi:BPMNShape' && shape.bounds) {
          const elementId = shape.bpmnElement?.id || shape.bpmnElement;
          if (elementId) {
            positions.set(elementId, {
              x: shape.bounds.x || 0,
              y: shape.bounds.y || 0,
            });
          }
        }
      }
    }

    return positions;
  }
}
