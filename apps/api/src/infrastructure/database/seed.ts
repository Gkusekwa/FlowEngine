import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });
dotenv.config();

const BCRYPT_ROUNDS = 12;

async function seed() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    database: process.env.DATABASE_NAME || 'flowengine',
    username: process.env.DATABASE_USER || 'flowengine',
    password: process.env.DATABASE_PASSWORD || 'flowengine_secret',
  });

  await dataSource.initialize();
  console.log('Connected to database');

  // Check if default tenant already exists
  const existing = await dataSource.query(
    `SELECT id FROM tenants WHERE slug = $1`,
    ['default'],
  );

  if (existing.length > 0) {
    console.log('Default tenant already exists, skipping seed');
    await dataSource.destroy();
    return;
  }

  const tenantId = uuidv4();
  const userId = uuidv4();
  const membershipId = uuidv4();
  const providerId = uuidv4();

  // Default admin credentials
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@flowengine.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin123!';
  const adminName = process.env.SEED_ADMIN_NAME || 'System Admin';
  const tenantName = process.env.SEED_TENANT_NAME || 'Default Organization';

  const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);

  // Insert tenant
  await dataSource.query(
    `INSERT INTO tenants (id, name, slug, settings, subscription_plan, max_users, max_workflows, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [tenantId, tenantName, 'default', '{}', 'enterprise', 100, 500, true],
  );
  console.log(`Created tenant: ${tenantName} (slug: default)`);

  // Insert auth provider (local)
  await dataSource.query(
    `INSERT INTO auth_providers (id, tenant_id, type, name, config, is_default, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [providerId, tenantId, 'local', 'Email & Password', '{}', true, true],
  );
  console.log('Created local auth provider');

  // Insert admin user
  await dataSource.query(
    `INSERT INTO users (id, tenant_id, email, name, password_hash, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, tenantId, adminEmail, adminName, passwordHash, true],
  );
  console.log(`Created admin user: ${adminEmail}`);

  // Insert membership with owner role
  await dataSource.query(
    `INSERT INTO tenant_memberships (id, tenant_id, user_id, role)
     VALUES ($1, $2, $3, $4)`,
    [membershipId, tenantId, userId, 'owner'],
  );
  console.log(`Assigned owner role to ${adminEmail}`);

  console.log('\n--- Seed Complete ---');
  console.log(`Email:    ${adminEmail}`);
  console.log(`Password: ${adminPassword}`);
  console.log(`Tenant:   ${tenantName} (slug: default)`);

  await dataSource.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
