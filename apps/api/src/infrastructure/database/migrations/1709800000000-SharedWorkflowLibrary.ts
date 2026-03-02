import { MigrationInterface, QueryRunner } from 'typeorm';

export class SharedWorkflowLibrary1709800000000 implements MigrationInterface {
  name = 'SharedWorkflowLibrary1709800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "shared_workflows" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "source_workflow_definition_id" uuid,
        "source_tenant_id" uuid,
        "shared_by_user_id" uuid,
        "name" varchar(255) NOT NULL,
        "description" text,
        "bpmn_xml" text NOT NULL,
        "parsed_definition" jsonb NOT NULL DEFAULT '{}',
        "activity_configs" jsonb NOT NULL DEFAULT '[]',
        "sla_configs" jsonb NOT NULL DEFAULT '[]',
        "category" varchar(100),
        "tags" jsonb NOT NULL DEFAULT '[]',
        "source_version" integer NOT NULL DEFAULT 1,
        "source_tenant_name" varchar(255) NOT NULL,
        "shared_by_user_name" varchar(255) NOT NULL,
        "import_count" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shared_workflows" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "shared_workflow_imports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "shared_workflow_id" uuid NOT NULL,
        "imported_by_tenant_id" uuid NOT NULL,
        "imported_by_user_id" uuid,
        "created_workflow_definition_id" uuid,
        "imported_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shared_workflow_imports" PRIMARY KEY ("id"),
        CONSTRAINT "FK_shared_imports_shared_workflow" FOREIGN KEY ("shared_workflow_id")
          REFERENCES "shared_workflows" ("id") ON DELETE CASCADE
      )
    `);

    // Indexes for shared_workflows
    await queryRunner.query(`CREATE INDEX "idx_shared_workflows_category" ON "shared_workflows" ("category")`);
    await queryRunner.query(`CREATE INDEX "idx_shared_workflows_source_tenant" ON "shared_workflows" ("source_tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_shared_workflows_created_at" ON "shared_workflows" ("created_at" DESC)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_shared_workflows_active_source" ON "shared_workflows" ("source_workflow_definition_id") WHERE "is_active" = true`);
    await queryRunner.query(`CREATE INDEX "idx_shared_workflows_tags" ON "shared_workflows" USING GIN ("tags")`);
    await queryRunner.query(`CREATE INDEX "idx_shared_workflows_search" ON "shared_workflows" USING GIN (to_tsvector('english', coalesce("name", '') || ' ' || coalesce("description", '')))`);

    // Indexes for shared_workflow_imports
    await queryRunner.query(`CREATE INDEX "idx_shared_imports_shared_workflow" ON "shared_workflow_imports" ("shared_workflow_id")`);
    await queryRunner.query(`CREATE INDEX "idx_shared_imports_tenant" ON "shared_workflow_imports" ("imported_by_tenant_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "shared_workflow_imports"`);
    await queryRunner.query(`DROP TABLE "shared_workflows"`);
  }
}
