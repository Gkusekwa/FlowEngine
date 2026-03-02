import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkflowDefinitions1709400000000 implements MigrationInterface {
  name = 'WorkflowDefinitions1709400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── workflow_definitions ──
    await queryRunner.query(`
      CREATE TABLE "workflow_definitions" (
        "id"                UUID DEFAULT uuid_generate_v4() NOT NULL,
        "tenant_id"         UUID NOT NULL,
        "name"              VARCHAR(255) NOT NULL,
        "description"       TEXT,
        "version"           INTEGER NOT NULL DEFAULT 1,
        "status"            VARCHAR(50) NOT NULL DEFAULT 'draft',
        "bpmn_xml"          TEXT NOT NULL,
        "parsed_definition" JSONB NOT NULL DEFAULT '{}',
        "created_by"        UUID,
        "published_at"      TIMESTAMPTZ,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_definitions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_workflow_definitions_tenant_name_version" UNIQUE ("tenant_id", "name", "version"),
        CONSTRAINT "FK_workflow_definitions_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_workflow_definitions_creator" FOREIGN KEY ("created_by")
          REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_workflow_definitions_tenant" ON "workflow_definitions" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_workflow_definitions_status" ON "workflow_definitions" ("tenant_id", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_workflow_definitions_name" ON "workflow_definitions" ("tenant_id", "name")`);
    await queryRunner.query(`CREATE INDEX "IDX_workflow_definitions_created" ON "workflow_definitions" ("tenant_id", "created_at" DESC)`);

    // ── activity_definitions ──
    await queryRunner.query(`
      CREATE TABLE "activity_definitions" (
        "id"                       UUID DEFAULT uuid_generate_v4() NOT NULL,
        "workflow_definition_id"   UUID NOT NULL,
        "bpmn_element_id"          VARCHAR(255) NOT NULL,
        "type"                     VARCHAR(100) NOT NULL,
        "name"                     VARCHAR(255),
        "config"                   JSONB DEFAULT '{}',
        "position"                 JSONB DEFAULT '{"x": 0, "y": 0}',
        "created_at"               TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_activity_definitions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_activity_definitions_workflow_element" UNIQUE ("workflow_definition_id", "bpmn_element_id"),
        CONSTRAINT "FK_activity_definitions_workflow" FOREIGN KEY ("workflow_definition_id")
          REFERENCES "workflow_definitions" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_activity_definitions_workflow" ON "activity_definitions" ("workflow_definition_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_activity_definitions_type" ON "activity_definitions" ("type")`);

    // ── transition_definitions ──
    await queryRunner.query(`
      CREATE TABLE "transition_definitions" (
        "id"                       UUID DEFAULT uuid_generate_v4() NOT NULL,
        "workflow_definition_id"   UUID NOT NULL,
        "bpmn_element_id"          VARCHAR(255) NOT NULL,
        "source_activity_id"       UUID NOT NULL,
        "target_activity_id"       UUID NOT NULL,
        "condition_expression"     TEXT,
        "is_default"               BOOLEAN DEFAULT FALSE,
        "created_at"               TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transition_definitions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_transition_definitions_workflow_element" UNIQUE ("workflow_definition_id", "bpmn_element_id"),
        CONSTRAINT "FK_transition_definitions_workflow" FOREIGN KEY ("workflow_definition_id")
          REFERENCES "workflow_definitions" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_transition_definitions_source" FOREIGN KEY ("source_activity_id")
          REFERENCES "activity_definitions" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_transition_definitions_target" FOREIGN KEY ("target_activity_id")
          REFERENCES "activity_definitions" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_transition_definitions_source" ON "transition_definitions" ("source_activity_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_transition_definitions_target" ON "transition_definitions" ("target_activity_id")`);

    // ── sla_definitions ──
    await queryRunner.query(`
      CREATE TABLE "sla_definitions" (
        "id"                          UUID DEFAULT uuid_generate_v4() NOT NULL,
        "activity_definition_id"      UUID NOT NULL,
        "warning_threshold_seconds"   INTEGER,
        "breach_threshold_seconds"    INTEGER NOT NULL,
        "escalation_rules"            JSONB DEFAULT '[]',
        "notification_channels"       JSONB DEFAULT '[]',
        "created_at"                  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"                  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sla_definitions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sla_definitions_activity" UNIQUE ("activity_definition_id"),
        CONSTRAINT "FK_sla_definitions_activity" FOREIGN KEY ("activity_definition_id")
          REFERENCES "activity_definitions" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_sla_definitions_activity" ON "sla_definitions" ("activity_definition_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sla_definitions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transition_definitions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "activity_definitions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_definitions" CASCADE`);
  }
}
