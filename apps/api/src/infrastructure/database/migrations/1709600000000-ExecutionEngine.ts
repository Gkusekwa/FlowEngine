import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExecutionEngine1709600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create workflow_instances table
    await queryRunner.query(`
      CREATE TABLE "workflow_instances" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL,
        "tenant_id" uuid NOT NULL,
        "workflow_definition_id" uuid NOT NULL,
        "status" varchar(50) NOT NULL DEFAULT 'created',
        "variables" jsonb NOT NULL DEFAULT '{}',
        "started_by" uuid,
        "started_at" timestamptz,
        "completed_at" timestamptz,
        "correlation_id" varchar(255),
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_instances" PRIMARY KEY ("id"),
        CONSTRAINT "FK_workflow_instances_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_workflow_instances_definition" FOREIGN KEY ("workflow_definition_id") REFERENCES "workflow_definitions"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_workflow_instances_tenant_status" ON "workflow_instances" ("tenant_id", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_workflow_instances_tenant_definition" ON "workflow_instances" ("tenant_id", "workflow_definition_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_workflow_instances_correlation" ON "workflow_instances" ("correlation_id")`);

    // Create task_instances table
    await queryRunner.query(`
      CREATE TABLE "task_instances" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL,
        "tenant_id" uuid NOT NULL,
        "workflow_instance_id" uuid NOT NULL,
        "activity_definition_id" uuid NOT NULL,
        "token_id" uuid,
        "status" varchar(50) NOT NULL DEFAULT 'pending',
        "assigned_to" uuid,
        "assigned_group" varchar(255),
        "variables" jsonb NOT NULL DEFAULT '{}',
        "started_at" timestamptz,
        "completed_at" timestamptz,
        "completed_by" uuid,
        "completion_result" jsonb,
        "due_at" timestamptz,
        "retry_count" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_task_instances" PRIMARY KEY ("id"),
        CONSTRAINT "FK_task_instances_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_task_instances_instance" FOREIGN KEY ("workflow_instance_id") REFERENCES "workflow_instances"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_task_instances_activity" FOREIGN KEY ("activity_definition_id") REFERENCES "activity_definitions"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_task_instances_tenant_assigned_status" ON "task_instances" ("tenant_id", "assigned_to", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_task_instances_tenant_group_status" ON "task_instances" ("tenant_id", "assigned_group", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_task_instances_instance_status" ON "task_instances" ("workflow_instance_id", "status")`);

    // Create execution_tokens table (no tenant_id — scoped via workflow_instance)
    await queryRunner.query(`
      CREATE TABLE "execution_tokens" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL,
        "workflow_instance_id" uuid NOT NULL,
        "parent_token_id" uuid,
        "current_activity_id" uuid,
        "status" varchar(50) NOT NULL DEFAULT 'active',
        "fork_gateway_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz,
        CONSTRAINT "PK_execution_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_execution_tokens_instance" FOREIGN KEY ("workflow_instance_id") REFERENCES "workflow_instances"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_execution_tokens_parent" FOREIGN KEY ("parent_token_id") REFERENCES "execution_tokens"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_execution_tokens_instance_status" ON "execution_tokens" ("workflow_instance_id", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_execution_tokens_activity" ON "execution_tokens" ("current_activity_id")`);

    // Create task_state_history table
    await queryRunner.query(`
      CREATE TABLE "task_state_history" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL,
        "task_instance_id" uuid NOT NULL,
        "from_status" varchar(50),
        "to_status" varchar(50) NOT NULL,
        "changed_by" uuid,
        "changed_at" timestamptz NOT NULL DEFAULT now(),
        "reason" varchar(500),
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_task_state_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_task_state_history_task" FOREIGN KEY ("task_instance_id") REFERENCES "task_instances"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_task_state_history_task_changed" ON "task_state_history" ("task_instance_id", "changed_at")`);

    // Enable RLS on new tenant-scoped tables
    await queryRunner.query(`ALTER TABLE "workflow_instances" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "task_instances" ENABLE ROW LEVEL SECURITY`);

    await queryRunner.query(`
      CREATE POLICY "workflow_instances_tenant_isolation" ON "workflow_instances"
      FOR ALL USING ("tenant_id" = current_setting('app.current_tenant', true)::uuid)
    `);

    await queryRunner.query(`
      CREATE POLICY "task_instances_tenant_isolation" ON "task_instances"
      FOR ALL USING ("tenant_id" = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS "task_instances_tenant_isolation" ON "task_instances"`);
    await queryRunner.query(`DROP POLICY IF EXISTS "workflow_instances_tenant_isolation" ON "workflow_instances"`);
    await queryRunner.query(`DROP TABLE "task_state_history"`);
    await queryRunner.query(`DROP TABLE "execution_tokens"`);
    await queryRunner.query(`DROP TABLE "task_instances"`);
    await queryRunner.query(`DROP TABLE "workflow_instances"`);
  }
}
