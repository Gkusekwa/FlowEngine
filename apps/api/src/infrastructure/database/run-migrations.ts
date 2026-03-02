import dataSource from './data-source';

async function runMigrations() {
  console.log('Initializing database connection...');
  await dataSource.initialize();

  console.log('Running pending migrations...');
  const migrations = await dataSource.runMigrations();

  if (migrations.length === 0) {
    console.log('No pending migrations');
  } else {
    for (const m of migrations) {
      console.log(`  Applied: ${m.name}`);
    }
    console.log(`${migrations.length} migration(s) applied`);
  }

  await dataSource.destroy();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
