import neo4j, { int, type Driver } from 'neo4j-driver';
import { loadDotenv } from '../config/load-dotenv';

loadDotenv();

import { loadEnv } from '../config/env';
import { QUERIES } from '../graph/queries';
import { generate } from './generate';
import { applySchema, load, wipe } from './load';

const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

/**
 * Verifies the planted patterns using the real production queries. If any of these come back
 * empty, the demo would come back empty too — so the seed fails loudly rather than silently
 * producing a graph the recording cannot use.
 */
async function verify(
  driver: Driver,
  scenario: ReturnType<typeof generate>['scenario'],
): Promise<boolean> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const bidderA = scenario.bidders[0]!;
  const bidderB = scenario.bidders[1]!;

  try {
    const owners = await session.run(QUERIES.beneficialOwners.cypher, {
      companyId: bidderA.id,
      maxDepth: int(5),
      minPct: 0.01,
    });
    const ultimate = owners.records.find((r) => r.get('id') === scenario.ultimateOwner.id);
    checks.push({
      name: 'beneficial owner of bidder A',
      ok: Boolean(ultimate),
      detail: ultimate
        ? `${ultimate.get('name')} at ${ultimate.get('effectivePct')}% via ${ultimate.get('shortestChain')} hops`
        : 'ultimate owner not reachable',
    });

    const ownersB = await session.run(QUERIES.beneficialOwners.cypher, {
      companyId: bidderB.id,
      maxDepth: int(5),
      minPct: 0.01,
    });
    const ultimateB = ownersB.records.find((r) => r.get('id') === scenario.ultimateOwner.id);
    checks.push({
      name: 'beneficial owner of bidder B',
      ok: Boolean(ultimateB),
      detail: ultimateB
        ? `${ultimateB.get('name')} at ${ultimateB.get('effectivePct')}% via ${ultimateB.get('shortestChain')} hops`
        : 'ultimate owner not reachable',
    });

    const link = await session.run(QUERIES.hiddenLink.cypher, {
      fromId: bidderA.id,
      toId: bidderB.id,
      maxDepth: int(6),
    });
    const viaHub = link.records.some((r) =>
      (r.get('via') as string[]).some((t) => t === 'REGISTERED_IN' || t === 'CITIZEN_OF'),
    );
    checks.push({
      name: 'hidden link between bidders',
      ok: link.records.length > 0 && !viaHub,
      detail: link.records.length
        ? `${link.records.length} path(s), shortest ${link.records[0]!.get('hops')} hops via ${(link.records[0]!.get('via') as string[]).join(' → ')}`
        : 'no path found',
    });

    const cycles = await session.run(QUERIES.ownershipCycles.cypher, { maxDepth: int(6) });
    checks.push({
      name: 'ownership cycle',
      ok: cycles.records.length > 0,
      detail: cycles.records.length
        ? `${cycles.records.length} ring(s); first: ${(cycles.records[0]!.get('ring') as string[]).join(' → ')}`
        : 'no cycle found',
    });

    const control = await session.run(QUERIES.watchlistControl.cypher, {
      watchlistName: 'OFAC SDN',
      maxDepth: int(5),
      minPct: 0.05,
    });
    checks.push({
      name: 'watchlist control',
      ok: control.records.length > 0,
      detail: `${control.records.length} controlled companies`,
    });

    const nominee = await session.run(QUERIES.nomineeUnmasking.cypher, {
      personId: scenario.nominee.id,
    });
    checks.push({
      name: 'nominee unmasking',
      ok: nominee.records.length > 0,
      detail: nominee.records.length
        ? `${nominee.records[0]!.get('nominee')} acts for ${nominee.records[0]!.get('actuallyActingFor')}`
        : 'nominee has no principal',
    });

    const shared = await session.run(QUERIES.resolveEntity.cypher, {
      term: 'Meridian',
      limit: int(5),
    });
    checks.push({
      name: 'full-text entity resolution',
      ok: shared.records.length > 0,
      detail: `${shared.records.length} matches for "Meridian"`,
    });
  } finally {
    await session.close();
  }

  log('\nverifying planted patterns with the production queries');
  for (const check of checks) {
    log(`  ${check.ok ? 'PASS' : 'FAIL'}  ${check.name.padEnd(30)} ${check.detail}`);
  }
  return checks.every((c) => c.ok);
}

async function main(): Promise<void> {
  const env = loadEnv();
  const startedAt = Date.now();

  log('generating dataset (deterministic)');
  const data = generate();
  const nodeCount =
    data.jurisdictions.length +
    data.addresses.length +
    data.intermediaries.length +
    data.watchlists.length +
    data.people.length +
    data.companies.length;
  const edgeCount =
    data.owns.length +
    data.officers.length +
    data.nominees.length +
    data.registeredIn.length +
    data.registeredAt.length +
    data.residesAt.length +
    data.administeredBy.length +
    data.basedAt.length +
    data.citizenOf.length +
    data.listedOn.length;
  log(`  ${nodeCount} nodes, ${edgeCount} relationships\n`);

  const driver = neo4j.driver(
    env.COGNODB_URI,
    neo4j.auth.basic(env.COGNODB_USER, env.COGNODB_PASSWORD),
    { connectionTimeout: 10_000, maxConnectionPoolSize: 10 },
  );

  try {
    const info = await driver.getServerInfo();
    log(`connected to ${info.address} (${info.agent}, Bolt ${String(info.protocolVersion)})`);
    log('\nThis script REPLACES the contents of the database.');
    await wipe(driver, log);
    await applySchema(driver, log);
    await load(driver, data, log);

    const ok = await verify(driver, data.scenario);

    log('\ndemo script — these are the entities to use in the recording');
    log(`  contract        ${data.scenario.contract}`);
    log(`  bidders         ${data.scenario.bidders.map((b) => b.name).join('  |  ')}`);
    log(`  ultimate owner  ${data.scenario.ultimateOwner.name} (sanctioned, OFAC SDN)`);
    log(`  nominee         ${data.scenario.nominee.name}`);
    log(`  shared address  ${data.scenario.sharedAddress}`);
    log(`  shared agent    ${data.scenario.sharedAgent}`);
    log(`  cycle           ${data.scenario.cycle.join(' → ')}`);
    log(`\ndone in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

    if (!ok) {
      log(
        '\nSome planted patterns were not found. The demo would come up empty — fix before recording.',
      );
      process.exitCode = 1;
    }
  } finally {
    await driver.close();
  }
}

main().catch((error: unknown) => {
  log(`\nseed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
