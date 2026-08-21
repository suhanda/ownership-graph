import neo4j, { int, type Driver, type Session } from 'neo4j-driver';
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
type Row = Record<string, unknown>;

/** Drawable queries return a single record holding `rows`, `nodes` and `links`. */
async function rowsOf(
  session: Session,
  cypher: string,
  params: Record<string, unknown>,
): Promise<Row[]> {
  const result = await session.run(cypher, params);
  const first = result.records[0];
  if (!first) return [];
  if (first.keys.includes('rows')) return (first.get('rows') as Row[] | null) ?? [];
  return result.records.map((record) => record.toObject() as Row);
}

const asNumber = (value: unknown): number =>
  typeof value === 'number'
    ? value
    : Number((value as { toNumber?: () => number })?.toNumber?.() ?? 0);

/**
 * Verifies the planted patterns using the real production queries. If any of these come back empty
 * the demo would come back empty too, so the seed fails loudly rather than quietly producing a graph
 * the recording cannot use.
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
    for (const [label, bidder] of [
      ['beneficial owner of bidder A', bidderA],
      ['beneficial owner of bidder B', bidderB],
    ] as const) {
      const rows = await rowsOf(session, QUERIES.beneficialOwners.cypher, {
        companyId: bidder.id,
        maxDepth: int(5),
        minPct: 0.01,
      });
      const ultimate = rows.find((r) => r['id'] === scenario.ultimateOwner.id);
      checks.push({
        name: label,
        ok: Boolean(ultimate),
        detail: ultimate
          ? `${String(ultimate['name'])} at ${asNumber(ultimate['effectivePct'])}% via ${asNumber(ultimate['shortestChain'])} hops`
          : 'ultimate owner not reachable',
      });
    }

    const links = await rowsOf(session, QUERIES.hiddenLink.cypher, {
      fromId: bidderA.id,
      toId: bidderB.id,
      maxDepth: int(6),
    });
    const viaHub = links.some((r) =>
      ((r['via'] as string[] | undefined) ?? []).some(
        (t) => t === 'REGISTERED_IN' || t === 'CITIZEN_OF',
      ),
    );
    checks.push({
      name: 'hidden link between bidders',
      ok: links.length > 0 && !viaHub,
      detail: links[0]
        ? `${links.length} path(s), shortest ${asNumber(links[0]['hops'])} hops via ${((links[0]['via'] as string[]) ?? []).join(' → ')}`
        : 'no path found',
    });

    const cycles = await rowsOf(session, QUERIES.ownershipCycles.cypher, { maxDepth: int(6) });
    checks.push({
      name: 'ownership cycle',
      ok: cycles.length > 0,
      detail: cycles[0]
        ? `${cycles.length} ring(s); first: ${((cycles[0]['ring'] as string[]) ?? []).join(' → ')}`
        : 'no cycle found',
    });

    const control = await rowsOf(session, QUERIES.watchlistControl.cypher, {
      watchlistName: 'OFAC SDN',
      maxDepth: int(5),
      minPct: 0.05,
      limit: int(25),
    });
    checks.push({
      name: 'watchlist control',
      ok: control.length > 0,
      detail: `${control.length} controlled companies`,
    });

    const nominee = await rowsOf(session, QUERIES.nomineeUnmasking.cypher, {
      personId: scenario.nominee.id,
    });
    const principal = nominee.find((r) => r['relation'] === 'NOMINEE_FOR');
    checks.push({
      name: 'nominee unmasking',
      ok: Boolean(principal),
      detail: principal
        ? `${String(principal['nominee'])} acts for ${String(principal['other'])}`
        : 'nominee has no principal',
    });

    const found = await rowsOf(session, QUERIES.resolveEntity.cypher, {
      term: 'Meridian',
      limit: int(5),
    });
    checks.push({
      name: 'full-text entity resolution',
      ok: found.length > 0,
      detail: `${found.length} matches for "Meridian"`,
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

  // Scale is configurable so the graph can be grown without editing the generator. The free tier is
  // 0.5 vCPU, and the ownership queries are variable-length traversals, so query time grows with
  // path count rather than node count — measure after changing this, do not assume.
  const companyCount = Number(process.env['SEED_COMPANIES'] ?? 2000);
  const personCount = Number(process.env['SEED_PEOPLE'] ?? 1200);

  log(`generating dataset (deterministic · ${companyCount} companies, ${personCount} people)`);
  const data = generate({ companyCount, personCount });
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
