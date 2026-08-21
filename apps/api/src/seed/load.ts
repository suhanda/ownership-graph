import neo4j, { type Driver, int } from 'neo4j-driver';
import type { Dataset } from './generate';

const BATCH = 500;

/** Ids are prefixed by kind, which is what lets the loader pick the right label to MATCH on. */
const isPerson = (id: string): boolean => id.startsWith('P-');

export interface LoadLogger {
  (message: string): void;
}

/** Writes in parameterised batches. A burstable 0.5 vCPU instance will not tolerate one write per row. */
async function batched(
  driver: Driver,
  label: string,
  cypher: string,
  rows: readonly unknown[],
  log: LoadLogger,
): Promise<void> {
  if (rows.length === 0) return;
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    for (let offset = 0; offset < rows.length; offset += BATCH) {
      await session.run(cypher, { rows: rows.slice(offset, offset + BATCH) });
    }
    log(`  ${label.padEnd(22)} ${rows.length}`);
  } finally {
    await session.close();
  }
}

export async function wipe(driver: Driver, log: LoadLogger): Promise<void> {
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    let removed = 0;
    for (;;) {
      const result = await session.run(
        'MATCH (n) WITH n LIMIT $batch DETACH DELETE n RETURN count(n) AS deleted',
        { batch: int(2000) },
      );
      const deleted = result.records[0]?.get('deleted')?.toNumber() ?? 0;
      removed += deleted;
      if (deleted === 0) break;
    }
    log(`  wiped                  ${removed} existing nodes`);
  } finally {
    await session.close();
  }
}

export async function applySchema(driver: Driver, log: LoadLogger): Promise<void> {
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    const statements = [
      'CREATE CONSTRAINT uniq_person IF NOT EXISTS FOR (n:Person) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT uniq_company IF NOT EXISTS FOR (n:Company) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT uniq_jurisdiction IF NOT EXISTS FOR (n:Jurisdiction) REQUIRE n.code IS UNIQUE',
      'CREATE CONSTRAINT uniq_address IF NOT EXISTS FOR (n:Address) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT uniq_intermediary IF NOT EXISTS FOR (n:Intermediary) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT uniq_watchlist IF NOT EXISTS FOR (n:Watchlist) REQUIRE n.id IS UNIQUE',
      'CREATE FULLTEXT INDEX entity_search IF NOT EXISTS FOR (n:Person|Company|Intermediary) ON EACH [n.name]',
    ];
    for (const statement of statements) await session.run(statement);
    log(`  schema                 ${statements.length} constraints and indexes`);
  } finally {
    await session.close();
  }
}

export async function load(driver: Driver, data: Dataset, log: LoadLogger): Promise<void> {
  log('nodes');
  await batched(
    driver,
    'Jurisdiction',
    `UNWIND $rows AS r MERGE (n:Jurisdiction {code: r.code})
    SET n.name = r.name, n.secrecyScore = r.secrecyScore`,
    data.jurisdictions,
    log,
  );
  await batched(
    driver,
    'Address',
    `UNWIND $rows AS r MERGE (n:Address {id: r.id})
    SET n.line1 = r.line1, n.city = r.city, n.countryCode = r.countryCode`,
    data.addresses,
    log,
  );
  await batched(
    driver,
    'Intermediary',
    `UNWIND $rows AS r MERGE (n:Intermediary {id: r.id})
    SET n.name = r.name, n.type = r.type`,
    data.intermediaries,
    log,
  );
  await batched(
    driver,
    'Watchlist',
    `UNWIND $rows AS r MERGE (n:Watchlist {id: r.id})
    SET n.name = r.name, n.authority = r.authority`,
    data.watchlists,
    log,
  );
  await batched(
    driver,
    'Person',
    `UNWIND $rows AS r MERGE (n:Person {id: r.id})
    SET n.name = r.name, n.bornYear = r.bornYear`,
    data.people,
    log,
  );
  await batched(
    driver,
    'Company',
    `UNWIND $rows AS r MERGE (n:Company {id: r.id})
    SET n.name = r.name, n.legalForm = r.legalForm, n.incorporatedOn = date(r.incorporatedOn),
        n.status = r.status, n.bidOn = r.bidOn`,
    data.companies,
    log,
  );

  log('relationships');
  // Split by owner label. A label-less MATCH (a {id: ...}) cannot use the unique-constraint index,
  // so it scans every node once per row — 500 rows against 10,000 nodes is five million scans per
  // batch, which exceeded the server's deadline. With a label it is an index lookup.
  await batched(
    driver,
    'OWNS (person)',
    `UNWIND $rows AS r
    MATCH (a:Person {id: r.from}) MATCH (b:Company {id: r.to})
    MERGE (a)-[e:OWNS]->(b) SET e.pct = r.pct, e.since = date(r.since)`,
    data.owns.filter((r) => isPerson(r.from)),
    log,
  );
  await batched(
    driver,
    'OWNS (company)',
    `UNWIND $rows AS r
    MATCH (a:Company {id: r.from}) MATCH (b:Company {id: r.to})
    MERGE (a)-[e:OWNS]->(b) SET e.pct = r.pct, e.since = date(r.since)`,
    data.owns.filter((r) => !isPerson(r.from)),
    log,
  );
  await batched(
    driver,
    'OFFICER_OF',
    `UNWIND $rows AS r
    MATCH (p:Person {id: r.person}) MATCH (c:Company {id: r.company})
    MERGE (p)-[e:OFFICER_OF {role: r.role}]->(c) SET e.from = date(r.from)`,
    data.officers,
    log,
  );
  await batched(
    driver,
    'NOMINEE_FOR (person)',
    `UNWIND $rows AS r
    MATCH (n:Person {id: r.nominee}) MATCH (p:Person {id: r.principal})
    MERGE (n)-[e:NOMINEE_FOR]->(p) SET e.since = date(r.since)`,
    data.nominees.filter((r) => isPerson(r.principal)),
    log,
  );
  await batched(
    driver,
    'NOMINEE_FOR (company)',
    `UNWIND $rows AS r
    MATCH (n:Person {id: r.nominee}) MATCH (p:Company {id: r.principal})
    MERGE (n)-[e:NOMINEE_FOR]->(p) SET e.since = date(r.since)`,
    data.nominees.filter((r) => !isPerson(r.principal)),
    log,
  );
  await batched(
    driver,
    'REGISTERED_IN',
    `UNWIND $rows AS r
    MATCH (c:Company {id: r.from}) MATCH (j:Jurisdiction {code: r.to})
    MERGE (c)-[:REGISTERED_IN]->(j)`,
    data.registeredIn,
    log,
  );
  await batched(
    driver,
    'REGISTERED_AT',
    `UNWIND $rows AS r
    MATCH (c:Company {id: r.from}) MATCH (a:Address {id: r.to})
    MERGE (c)-[:REGISTERED_AT]->(a)`,
    data.registeredAt,
    log,
  );
  await batched(
    driver,
    'RESIDES_AT',
    `UNWIND $rows AS r
    MATCH (p:Person {id: r.from}) MATCH (a:Address {id: r.to})
    MERGE (p)-[:RESIDES_AT]->(a)`,
    data.residesAt,
    log,
  );
  await batched(
    driver,
    'ADMINISTERED_BY',
    `UNWIND $rows AS r
    MATCH (c:Company {id: r.from}) MATCH (i:Intermediary {id: r.to})
    MERGE (c)-[:ADMINISTERED_BY]->(i)`,
    data.administeredBy,
    log,
  );
  await batched(
    driver,
    'BASED_AT',
    `UNWIND $rows AS r
    MATCH (i:Intermediary {id: r.from}) MATCH (a:Address {id: r.to})
    MERGE (i)-[:BASED_AT]->(a)`,
    data.basedAt,
    log,
  );
  await batched(
    driver,
    'CITIZEN_OF',
    `UNWIND $rows AS r
    MATCH (p:Person {id: r.from}) MATCH (j:Jurisdiction {code: r.to})
    MERGE (p)-[:CITIZEN_OF]->(j)`,
    data.citizenOf,
    log,
  );
  await batched(
    driver,
    'LISTED_ON (person)',
    `UNWIND $rows AS r
    MATCH (p:Person {id: r.party}) MATCH (w:Watchlist {id: r.watchlist})
    MERGE (p)-[e:LISTED_ON]->(w) SET e.since = date(r.since), e.program = r.program`,
    data.listedOn.filter((r) => isPerson(r.party)),
    log,
  );
  await batched(
    driver,
    'LISTED_ON (company)',
    `UNWIND $rows AS r
    MATCH (p:Company {id: r.party}) MATCH (w:Watchlist {id: r.watchlist})
    MERGE (p)-[e:LISTED_ON]->(w) SET e.since = date(r.since), e.program = r.program`,
    data.listedOn.filter((r) => !isPerson(r.party)),
    log,
  );
}
