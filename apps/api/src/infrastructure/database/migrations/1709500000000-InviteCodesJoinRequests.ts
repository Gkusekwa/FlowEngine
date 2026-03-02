import { MigrationInterface, QueryRunner } from 'typeorm';

export class InviteCodesJoinRequests1709500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create invite_codes table
    await queryRunner.query(`
      CREATE TABLE "invite_codes" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL,
        "tenant_id" uuid NOT NULL,
        "code" varchar(32) NOT NULL,
        "max_uses" int NOT NULL DEFAULT 0,
        "use_count" int NOT NULL DEFAULT 0,
        "expires_at" timestamptz,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invite_codes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_invite_codes_code" UNIQUE ("code"),
        CONSTRAINT "FK_invite_codes_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_invite_codes_tenant" ON "invite_codes" ("tenant_id")`);

    // Create join_requests table
    await queryRunner.query(`
      CREATE TABLE "join_requests" (
        "id" uuid DEFAULT gen_random_uuid() NOT NULL,
        "tenant_id" uuid NOT NULL,
        "email" varchar(255) NOT NULL,
        "name" varchar(255) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "invite_code" varchar(32) NOT NULL,
        "status" varchar(50) NOT NULL DEFAULT 'pending',
        "reviewed_by" uuid,
        "reviewed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_join_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_join_requests_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_join_requests_tenant" ON "join_requests" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_join_requests_status" ON "join_requests" ("status")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_join_requests_pending_unique" ON "join_requests" ("tenant_id", "email") WHERE "status" = 'pending'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "join_requests"`);
    await queryRunner.query(`DROP TABLE "invite_codes"`);
  }
}
