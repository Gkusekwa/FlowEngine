import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { InitialSchema1709300000000 } from './migrations/1709300000000-InitialSchema';
import { WorkflowDefinitions1709400000000 } from './migrations/1709400000000-WorkflowDefinitions';
import { InviteCodesJoinRequests1709500000000 } from './migrations/1709500000000-InviteCodesJoinRequests';
import { ExecutionEngine1709600000000 } from './migrations/1709600000000-ExecutionEngine';
import { SharedWorkflowLibrary1709800000000 } from './migrations/1709800000000-SharedWorkflowLibrary';

dotenv.config({ path: '../../.env' });
dotenv.config();

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  database: process.env.DATABASE_NAME || 'flowengine',
  username: process.env.DATABASE_USER || 'flowengine',
  password: process.env.DATABASE_PASSWORD || 'flowengine_secret',
  entities: [__dirname + '/entities/*{.ts,.js}'],
  migrations: [InitialSchema1709300000000, WorkflowDefinitions1709400000000, InviteCodesJoinRequests1709500000000, ExecutionEngine1709600000000, SharedWorkflowLibrary1709800000000],
  synchronize: false,
});
