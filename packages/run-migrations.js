import { PgSessionCatalogProvider } from 'pilotswarm-sdk';

const cms = await PgSessionCatalogProvider.create(process.env.DATABASE_URL);
await cms.initialize();
console.log('✅ Migrations completed');
