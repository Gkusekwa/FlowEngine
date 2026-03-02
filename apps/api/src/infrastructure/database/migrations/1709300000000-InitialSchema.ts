import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1709300000000 implements MigrationInterface {
  name = 'InitialSchema1709300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable uuid-ossp extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ── tenants ──
    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id"                UUID DEFAULT uuid_generate_v4() NOT NULL,
        "name"              VARCHAR(255) NOT NULL,
        "slug"              VARCHAR(100) NOT NULL,
        "settings"          JSONB NOT NULL DEFAULT '{}',
        "subscription_plan" VARCHAR(50) NOT NULL DEFAULT 'free',
        "max_users"         INT NOT NULL DEFAULT 10,
        "max_workflows"     INT NOT NULL DEFAULT 50,
        "is_active"         BOOLEAN NOT NULL DEFAULT true,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenants" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tenants_slug" UNIQUE ("slug")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_tenants_slug" ON "tenants" ("slug")`);

    // ── users ──
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"                    UUID DEFAULT uuid_generate_v4() NOT NULL,
        "tenant_id"             UUID NOT NULL,
        "email"                 VARCHAR(255) NOT NULL,
        "name"                  VARCHAR(255) NOT NULL,
        "password_hash"         VARCHAR(255),
        "auth_provider_id"      UUID,
        "external_id"           VARCHAR(255),
        "avatar_url"            VARCHAR(500),
        "is_active"             BOOLEAN NOT NULL DEFAULT true,
        "failed_login_attempts" INT NOT NULL DEFAULT 0,
        "locked_until"          TIMESTAMPTZ,
        "last_login_at"         TIMESTAMPTZ,
        "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "FK_users_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_users_tenant_email" ON "users" ("tenant_id", "email")`);
    await queryRunner.query(`CREATE INDEX "IDX_users_tenant_id" ON "users" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_users_email" ON "users" ("email")`);

    // ── auth_providers ──
    await queryRunner.query(`
      CREATE TABLE "auth_providers" (
        "id"         UUID DEFAULT uuid_generate_v4() NOT NULL,
        "tenant_id"  UUID NOT NULL,
        "type"       VARCHAR(50) NOT NULL,
        "name"       VARCHAR(255) NOT NULL,
        "config"     JSONB NOT NULL DEFAULT '{}',
        "is_default" BOOLEAN NOT NULL DEFAULT false,
        "is_active"  BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auth_providers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_auth_providers_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_auth_providers_tenant_name" ON "auth_providers" ("tenant_id", "name")`);

    // ── tenant_memberships ──
    await queryRunner.query(`
      CREATE TABLE "tenant_memberships" (
        "id"         UUID DEFAULT uuid_generate_v4() NOT NULL,
        "tenant_id"  UUID NOT NULL,
        "user_id"    UUID NOT NULL,
        "role"       VARCHAR(50) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_memberships" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tenant_memberships_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tenant_memberships_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_tenant_memberships_tenant_user" ON "tenant_memberships" ("tenant_id", "user_id")`);

    // ── user_sessions ──
    await queryRunner.query(`
      CREATE TABLE "user_sessions" (
        "id"                    UUID DEFAULT uuid_generate_v4() NOT NULL,
        "tenant_id"             UUID NOT NULL,
        "user_id"               UUID NOT NULL,
        "refresh_token_hash"    VARCHAR(255) NOT NULL,
        "refresh_token_family"  UUID NOT NULL,
        "expires_at"            TIMESTAMPTZ NOT NULL,
        "ip_address"            VARCHAR(45),
        "user_agent"            VARCHAR(500),
        "is_revoked"            BOOLEAN NOT NULL DEFAULT false,
        "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_sessions_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_user_sessions_refresh_token_hash" ON "user_sessions" ("refresh_token_hash")`);
    await queryRunner.query(`CREATE INDEX "IDX_user_sessions_user_tenant" ON "user_sessions" ("user_id", "tenant_id")`);

    // ── audit_logs ──
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id"            UUID DEFAULT uuid_generate_v4() NOT NULL,
        "tenant_id"     UUID NOT NULL,
        "user_id"       UUID,
        "action"        VARCHAR(100) NOT NULL,
        "resource_type" VARCHAR(100) NOT NULL,
        "resource_id"   UUID,
        "ip_address"    VARCHAR(45),
        "request_id"    VARCHAR(100),
        "old_values"    JSONB,
        "new_values"    JSONB,
        "metadata"      JSONB,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_tenant_created" ON "audit_logs" ("tenant_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_tenant_action" ON "audit_logs" ("tenant_id", "action")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_tenant_resource" ON "audit_logs" ("tenant_id", "resource_type", "resource_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_sessions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_memberships" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "auth_providers" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenants" CASCADE`);
  }
}
