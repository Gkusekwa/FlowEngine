import { IsIn } from 'class-validator';

export class ImportWorkflowDto {
  @IsIn(['use', 'customize'])
  mode: 'use' | 'customize';
}
