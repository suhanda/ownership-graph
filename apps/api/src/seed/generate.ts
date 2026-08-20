import { Rng } from './random';
import {
  CITIES,
  COMPANY_PREFIXES,
  COMPANY_SUFFIX_WORDS,
  FAMILY_NAMES,
  GIVEN_NAMES,
  INTERMEDIARY_NAMES,
  INTERMEDIARY_TYPES,
  JURISDICTIONS,
  NOTABLE_ADDRESSES,
  OFFICER_ROLES,
  SANCTIONS_PROGRAMS,
  SPECIAL_LEGAL_FORMS,
  STREET_NAMES,
  WATCHLISTS,
} from './vocabulary';

export interface PersonRow {
  id: string;
  name: string;
  bornYear: number;
}
export interface CompanyRow {
  id: string;
  name: string;
  legalForm: string;
  incorporatedOn: string;
  status: string;
}
export interface JurisdictionRow {
  code: string;
  name: string;
  secrecyScore: number;
}
export interface AddressRow {
  id: string;
  line1: string;
  city: string;
  countryCode: string;
}
export interface IntermediaryRow {
  id: string;
  name: string;
  type: string;
}
export interface WatchlistRow {
  id: string;
  name: string;
  authority: string;
}

export interface OwnsRow {
  from: string;
  to: string;
  pct: number;
  since: string;
}
export interface OfficerRow {
  person: string;
  company: string;
  role: string;
  from: string;
}
export interface EdgeRow {
  from: string;
  to: string;
}
export interface NomineeRow {
  nominee: string;
  principal: string;
  since: string;
}
export interface ListedRow {
  party: string;
  watchlist: string;
  since: string;
  program: string;
}

export interface Dataset {
  jurisdictions: JurisdictionRow[];
  addresses: AddressRow[];
  intermediaries: IntermediaryRow[];
  watchlists: WatchlistRow[];
  people: PersonRow[];
  companies: CompanyRow[];
  owns: OwnsRow[];
  officers: OfficerRow[];
  nominees: NomineeRow[];
  registeredIn: EdgeRow[];
  registeredAt: EdgeRow[];
  residesAt: EdgeRow[];
  administeredBy: EdgeRow[];
  basedAt: EdgeRow[];
  citizenOf: EdgeRow[];
  listedOn: ListedRow[];
  /** The planted patterns, echoed back so the loader can verify and the README can quote them. */
  scenario: Scenario;
}

export interface Scenario {
  contract: string;
  bidders: { id: string; name: string }[];
  ultimateOwner: { id: string; name: string };
  nominee: { id: string; name: string };
  sharedAddress: string;
  sharedAgent: string;
  cycle: string[];
  deepestChainHops: number;
}

export interface GenerateOptions {
  seed?: number;
  companyCount?: number;
  personCount?: number;
}

const TIERS = 5;

export function generate(options: GenerateOptions = {}): Dataset {
  const rng = new Rng(options.seed ?? 20260820);
  const companyCount = options.companyCount ?? 2000;
  const personCount = options.personCount ?? 1200;

  const jurisdictions: JurisdictionRow[] = JURISDICTIONS.map((j) => ({
    code: j.code,
    name: j.name,
    secrecyScore: j.secrecyScore,
  }));

  // ---- addresses -------------------------------------------------------------------------
  const addresses: AddressRow[] = NOTABLE_ADDRESSES.map((a, i) => ({
    id: `A-MASS-${i + 1}`,
    line1: a.line1,
    city: a.city,
    countryCode: a.countryCode,
  }));
  const massAddressIds = addresses.map((a) => a.id);
  for (let i = 0; i < 340; i++) {
    const [city, cc] = rng.pick(CITIES);
    addresses.push({
      id: `A-${String(i + 1).padStart(4, '0')}`,
      line1: `${rng.int(1, 240)} ${rng.pick(STREET_NAMES)}`,
      city,
      countryCode: cc,
    });
  }

  // ---- intermediaries --------------------------------------------------------------------
  const intermediaries: IntermediaryRow[] = INTERMEDIARY_NAMES.map((name, i) => ({
    id: `I-${String(i + 1).padStart(3, '0')}`,
    name,
    type: rng.pick(INTERMEDIARY_TYPES),
  }));
  const basedAt: EdgeRow[] = intermediaries.map((i, idx) => ({
    from: i.id,
    to: massAddressIds[idx % massAddressIds.length] ?? massAddressIds[0]!,
  }));

  const watchlists: WatchlistRow[] = WATCHLISTS.map((w) => ({ ...w }));

  // ---- people ----------------------------------------------------------------------------
  const people: PersonRow[] = [];
  const usedNames = new Set<string>();
  for (let i = 0; i < personCount; i++) {
    let name = `${rng.pick(GIVEN_NAMES)} ${rng.pick(FAMILY_NAMES)}`;
    let guard = 0;
    while (usedNames.has(name) && guard++ < 12)
      name = `${rng.pick(GIVEN_NAMES)} ${rng.pick(FAMILY_NAMES)}`;
    usedNames.add(name);
    people.push({ id: `P-${String(i + 1).padStart(4, '0')}`, name, bornYear: rng.int(1948, 1992) });
  }

  // ---- companies, assigned to tiers so ownership forms a DAG ------------------------------
  // Tier 0 companies operate and are owned. Higher tiers only ever own lower tiers, which means
  // no accidental cycles — the one cycle in the graph is planted deliberately below.
  const companies: CompanyRow[] = [];
  const tierOf = new Map<string, number>();
  const byTier: string[][] = Array.from({ length: TIERS }, () => []);
  const registeredIn: EdgeRow[] = [];
  const registeredAt: EdgeRow[] = [];
  const administeredBy: EdgeRow[] = [];
  const usedCompanyNames = new Set<string>();

  const companyName = (): string => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = `${rng.pick(COMPANY_PREFIXES)} ${rng.pick(COMPANY_SUFFIX_WORDS)}`;
      if (!usedCompanyNames.has(candidate)) {
        usedCompanyNames.add(candidate);
        return candidate;
      }
    }
    const fallback = `${rng.pick(COMPANY_PREFIXES)} ${rng.pick(COMPANY_SUFFIX_WORDS)} ${usedCompanyNames.size}`;
    usedCompanyNames.add(fallback);
    return fallback;
  };

  for (let i = 0; i < companyCount; i++) {
    const id = `C-${String(i + 1).padStart(4, '0')}`;
    // most companies operate; the pyramid narrows towards the top
    const tier = rng.weighted([
      [0, 55],
      [1, 22],
      [2, 12],
      [3, 7],
      [4, 4],
    ] as const);
    const offshore = tier > 0;
    const jurisdiction = rng.weighted(
      JURISDICTIONS.map((j) => [j, offshore ? j.shellWeight : j.operatingWeight] as const),
    );
    const legalForm =
      tier >= 3 && rng.chance(0.25)
        ? rng.pick(SPECIAL_LEGAL_FORMS)
        : rng.pick(jurisdiction.legalForms);
    // higher tiers were incorporated earlier — a parent cannot postdate its subsidiary
    const incorporatedOn = rng.date(1996 + (TIERS - 1 - tier) * 2, 2006 + (TIERS - 1 - tier) * 3);

    companies.push({
      id,
      name: `${companyName()} ${legalForm}`,
      legalForm,
      incorporatedOn,
      status: rng.chance(0.07) ? 'Struck off' : 'Active',
    });
    tierOf.set(id, tier);
    byTier[tier]?.push(id);
    registeredIn.push({ from: id, to: jurisdiction.code });
    // offshore companies cluster at mass-registration addresses; operating ones do not
    registeredAt.push({
      from: id,
      to: offshore && rng.chance(0.55) ? rng.pick(massAddressIds) : rng.pick(addresses).id,
    });
    if (offshore || rng.chance(0.15)) {
      administeredBy.push({ from: id, to: rng.pick(intermediaries).id });
    }
  }

  const incorporatedOn = new Map(companies.map((c) => [c.id, c.incorporatedOn]));

  // ---- ownership -------------------------------------------------------------------------
  const owns: OwnsRow[] = [];
  const SPLITS: readonly (readonly number[])[] = [
    [1],
    [0.6, 0.4],
    [0.75, 0.25],
    [0.5, 0.3, 0.2],
    [0.9],
    [0.51, 0.49],
    [0.34, 0.33, 0.33],
  ];

  const stakeDate = (ownerId: string, targetId: string): string => {
    const ownerYear = Number((incorporatedOn.get(ownerId) ?? '2000-01-01').slice(0, 4));
    const targetYear = Number((incorporatedOn.get(targetId) ?? '2000-01-01').slice(0, 4));
    const earliest = Math.max(ownerYear, targetYear);
    return rng.date(earliest, Math.max(earliest, 2024));
  };

  for (const company of companies) {
    const tier = tierOf.get(company.id) ?? 0;
    const split = rng.pick(SPLITS);
    for (const pct of split) {
      // owners come from a strictly higher tier, or are natural persons at the top
      const higher = byTier.slice(tier + 1).flat();
      const ownerIsPerson = higher.length === 0 || rng.chance(tier >= 3 ? 0.7 : 0.12);
      const ownerId = ownerIsPerson ? rng.pick(people).id : rng.pick(higher);
      owns.push({
        from: ownerId,
        to: company.id,
        pct,
        since: ownerIsPerson ? rng.date(2004, 2024) : stakeDate(ownerId, company.id),
      });
    }
  }

  // ---- officers, nominees, citizenship, residence -----------------------------------------
  const officers: OfficerRow[] = [];
  for (const company of companies) {
    for (let k = 0; k < rng.int(1, 3); k++) {
      officers.push({
        person: rng.pick(people).id,
        company: company.id,
        role: rng.pick(OFFICER_ROLES),
        from: rng.date(2005, 2024),
      });
    }
  }

  const nominees: NomineeRow[] = [];
  const nomineePool = rng.shuffled(people).slice(0, 40);
  for (const nominee of nomineePool) {
    const principal = rng.pick(people);
    if (principal.id !== nominee.id) {
      nominees.push({ nominee: nominee.id, principal: principal.id, since: rng.date(2008, 2022) });
    }
  }

  const citizenOf: EdgeRow[] = people.map((p) => ({
    from: p.id,
    to: rng.pick(jurisdictions).code,
  }));
  const residesAt: EdgeRow[] = people.map((p) => ({ from: p.id, to: rng.pick(addresses).id }));

  const listedOn: ListedRow[] = rng
    .shuffled(people)
    .slice(0, 22)
    .map((p) => ({
      party: p.id,
      watchlist: rng.pick(watchlists).id,
      since: rng.date(2014, 2024),
      program: rng.pick(SANCTIONS_PROGRAMS),
    }));

  const dataset: Dataset = {
    jurisdictions,
    addresses,
    intermediaries,
    watchlists,
    people,
    companies,
    owns,
    officers,
    nominees,
    registeredIn,
    registeredAt,
    residesAt,
    administeredBy,
    basedAt,
    citizenOf,
    listedOn,
    scenario: {
      contract: '',
      bidders: [],
      ultimateOwner: { id: '', name: '' },
      nominee: { id: '', name: '' },
      sharedAddress: '',
      sharedAgent: '',
      cycle: [],
      deepestChainHops: 0,
    },
  };

  plantScenario(dataset, rng);
  return dataset;
}

/**
 * The planted patterns. Everything the demo and the README claim to find is created here by hand,
 * so a screen recording can never come up empty. Each signature query from ticket 05 has a
 * guaranteed hit, and the entity names below are the ones to type during the demo.
 *
 * The story: two companies bid on the Northgate Transit Extension. They look unrelated. Both are
 * ultimately controlled by the same sanctioned individual, through separate offshore chains that
 * converge four and five layers up.
 */
function plantScenario(data: Dataset, rng: Rng): void {
  const CONTRACT = 'Northgate Transit Extension';
  const SHARED_ADDRESS = 'A-MASS-1'; // PO Box 3151, Road Town
  const SHARED_AGENT = 'I-001'; // Tortola Corporate Services

  const co = (
    id: string,
    name: string,
    legalForm: string,
    incorporatedOn: string,
    jurisdiction: string,
    addressId: string,
    agentId?: string,
    bidOn?: string,
  ): CompanyRow => {
    const row: CompanyRow = { id, name, legalForm, incorporatedOn, status: 'Active' };
    if (bidOn) (row as CompanyRow & { bidOn?: string }).bidOn = bidOn;
    data.companies.push(row);
    data.registeredIn.push({ from: id, to: jurisdiction });
    data.registeredAt.push({ from: id, to: addressId });
    if (agentId) data.administeredBy.push({ from: id, to: agentId });
    return row;
  };

  // --- the two bidders: onshore, ordinary-looking, different addresses ---------------------
  const bidderA = co(
    'C-SCN-01',
    'Meridian Civic Infrastructure Ltd',
    'Ltd',
    '2014-02-11',
    'GB',
    'A-0007',
    undefined,
    CONTRACT,
  );
  const bidderB = co(
    'C-SCN-02',
    'Harbour Line Construction Ltd',
    'Ltd',
    '2015-06-30',
    'GB',
    'A-0019',
    undefined,
    CONTRACT,
  );

  // --- their offshore parents: same address AND same agent — the hidden link --------------
  co(
    'C-SCN-03',
    'Cobalt Estuary Holdings Ltd',
    'Ltd',
    '2012-09-04',
    'VG',
    SHARED_ADDRESS,
    SHARED_AGENT,
  );
  co(
    'C-SCN-04',
    'Sable Quay Investments Ltd',
    'Ltd',
    '2013-01-22',
    'VG',
    SHARED_ADDRESS,
    SHARED_AGENT,
  );

  // --- the layers above, converging on one person -----------------------------------------
  co('C-SCN-05', 'Orinoco Asset Management SA', 'SA', '2010-05-17', 'PA', 'A-MASS-4', 'I-004');
  co('C-SCN-06', 'Halcyon Capital Partners Ltd', 'Ltd', '2008-03-28', 'CY', 'A-MASS-7', 'I-007');
  co(
    'C-SCN-07',
    'Thornbury Family Foundation',
    'Foundation',
    '2006-11-09',
    'LI',
    'A-0044',
    'I-012',
  );

  const belov: PersonRow = { id: 'P-SCN-01', name: 'Konstantin Belov', bornYear: 1961 };
  const voss: PersonRow = { id: 'P-SCN-02', name: 'Clara Voss', bornYear: 1974 };
  data.people.push(belov, voss);
  data.citizenOf.push({ from: belov.id, to: 'CY' }, { from: voss.id, to: 'GB' });
  data.residesAt.push({ from: belov.id, to: 'A-0031' }, { from: voss.id, to: 'A-0052' });

  // chain to bidder A: 4 hops, 1.0 * 0.85 * 0.90 * 1.0 = 76.5%
  // chain to bidder B: 5 hops, 1.0 * 0.85 * 0.60 * 0.70 * 1.0 = 35.7%
  data.owns.push(
    { from: belov.id, to: 'C-SCN-07', pct: 1.0, since: '2006-11-20' },
    { from: 'C-SCN-07', to: 'C-SCN-06', pct: 0.85, since: '2009-04-02' },
    { from: 'C-SCN-06', to: 'C-SCN-03', pct: 0.9, since: '2012-10-15' },
    { from: 'C-SCN-03', to: bidderA.id, pct: 1.0, since: '2014-03-03' },
    { from: 'C-SCN-06', to: 'C-SCN-05', pct: 0.6, since: '2011-02-08' },
    { from: 'C-SCN-05', to: 'C-SCN-04', pct: 0.7, since: '2013-02-19' },
    { from: 'C-SCN-04', to: bidderB.id, pct: 1.0, since: '2015-07-14' },
  );

  // Clara Voss is the registered director of both offshore parents, and a nominee for Belov.
  // She is the visible name on the register; he is the Beneficial owner. (See CONTEXT.md.)
  data.officers.push(
    { person: voss.id, company: 'C-SCN-03', role: 'Director', from: '2012-09-10' },
    { person: voss.id, company: 'C-SCN-04', role: 'Director', from: '2013-01-30' },
    { person: voss.id, company: 'C-SCN-06', role: 'Secretary', from: '2009-05-01' },
  );
  data.nominees.push({ nominee: voss.id, principal: belov.id, since: '2009-04-20' });
  data.listedOn.push({
    party: belov.id,
    watchlist: 'W-OFAC',
    since: '2022-04-06',
    program: 'RUSSIA-EO14024',
  });

  // give the bidders ordinary-looking officers so they do not stand out structurally
  for (const bidder of [bidderA, bidderB]) {
    for (let k = 0; k < 2; k++) {
      data.officers.push({
        person: rng.pick(data.people).id,
        company: bidder.id,
        role: rng.pick(OFFICER_ROLES),
        from: rng.date(2015, 2023),
      });
    }
  }

  // --- a deliberate ownership cycle, separate from the scandal -----------------------------
  const ring = [
    co('C-CYC-01', 'Vesper Holdings Ltd', 'Ltd', '2009-04-14', 'VG', 'A-MASS-2', 'I-002'),
    co('C-CYC-02', 'Kestrel Capital SA', 'SA', '2010-08-03', 'PA', 'A-MASS-4', 'I-005'),
    co('C-CYC-03', 'Larkspur Ventures IBC', 'IBC', '2011-01-27', 'SC', 'A-MASS-6', 'I-006'),
    co('C-CYC-04', 'Ironwood Group Ltd', 'Ltd', '2011-11-08', 'BZ', 'A-MASS-5', 'I-003'),
  ];
  for (let i = 0; i < ring.length; i++) {
    const from = ring[i]!;
    const to = ring[(i + 1) % ring.length]!;
    data.owns.push({
      from: from.id,
      to: to.id,
      pct: [0.6, 0.55, 0.7, 0.45][i]!,
      since: `201${3 + i}-0${i + 2}-12`,
    });
  }

  data.scenario = {
    contract: CONTRACT,
    bidders: [
      { id: bidderA.id, name: bidderA.name },
      { id: bidderB.id, name: bidderB.name },
    ],
    ultimateOwner: { id: belov.id, name: belov.name },
    nominee: { id: voss.id, name: voss.name },
    sharedAddress: 'PO Box 3151, Road Town',
    sharedAgent: 'Tortola Corporate Services',
    cycle: ring.map((c) => c.name),
    deepestChainHops: 5,
  };
}
