import { MigrationInterface, QueryRunner } from 'typeorm';

export class SlaEvents1709700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create sla_events table
    await queryRunner.query(`
      CREATE TABLE "sla_events" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL,
        "task_instance_id" uuid NOT NULL,
        "sla_definition_id" uuid,
        "event_type" varchar(50) NOT NULL,
        "threshold_seconds" int NOT NULL,
        "actual_duration_seconds" int,
        "escalation_level" int NOT NULL DEFAULT 0,
        "notification_sent" boolean NOT NULL DEFAULT false,
        "notification_sent_at" timestamptz,
        "acknowledged" boolean NOT NULL DEFAULT false,
        "acknowledged_by" uuid,
        "acknowledged_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sla_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sla_events_task" FOREIGN KEY ("task_instance_id") REFERENCES "task_instances"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sla_events_sla_definition" FOREIGN KEY ("sla_definition_id") REFERENCES "sla_definitions"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_sla_events_acknowledged_by" FOREIGN KEY ("acknowledged_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_sla_events_task" ON "sla_events" ("task_instance_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_sla_events_type" ON "sla_events" ("event_type")`);
    await queryRunner.query(`CREATE INDEX "IDX_sla_events_created" ON "sla_events" ("created_at" DESC)`);
    await queryRunner.query(`CREATE INDEX "IDX_sla_events_unacknowledged" ON "sla_events" ("acknowledged", "created_at" DESC) WHERE acknowledged = FALSE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "sla_events"`);
  }
}
