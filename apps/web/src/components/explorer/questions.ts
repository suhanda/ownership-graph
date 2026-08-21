import { api, type Fetched, type QueryResult } from '@/lib/api';

/**
 * The six signature questions, phrased as a person would ask them. Each one owns its own layout,
 * because the right picture for a chain of ownership is not the right picture for a closed ring.
 *
 * Entity ids come from the seeded scenario — the Northgate Transit Extension case.
 */
export interface Question {
  id: string;
  label: string;
  hint: string;
  title: string;
  subtitle: string;
  /** Narration shown while the query runs, one line per layer of work. */
  tracing: string[];
  run: () => Promise<Fetched<QueryResult>>;
  focusIds: string[];
  empty: { headline: string; detail: string };
}

const BIDDER_A = 'C-SCN-01';
const BIDDER_B = 'C-SCN-02';
const NOMINEE = 'P-SCN-02';
const PARENT_A = 'C-SCN-03';

export const QUESTIONS: Question[] = [
  {
    id: 'owners',
    label: 'Who really owns this?',
    hint: 'beneficial owners · 5 layers',
    title: 'Who really owns Meridian Civic Infrastructure Ltd?',
    subtitle: 'One of two bidders on the Northgate Transit Extension.',
    tracing: [
      'Resolving Meridian Civic Infrastructure',
      'Walking ownership, layer 1',
      'Layer 2 · Cyprus',
      'Layer 3 · Liechtenstein',
      'Layer 4 · natural person',
    ],
    run: () => api.beneficialOwners(BIDDER_A, 5),
    focusIds: [BIDDER_A],
    empty: {
      headline: 'No owner found within five layers',
      detail: 'Ownership never reaches a natural person inside the depth limit.',
    },
  },
  {
    id: 'link',
    label: 'How is it connected to the other bidder?',
    hint: 'hidden link · shortest path',
    title: 'How is Meridian connected to Harbour Line Construction?',
    subtitle: 'Two bidders on the same contract, with no direct relationship.',
    tracing: ['Resolving both companies', 'Searching paths, 2 hops', '3 hops', '4 hops'],
    run: () => api.hiddenLink(BIDDER_A, BIDDER_B, 6),
    focusIds: [BIDDER_A, BIDDER_B],
    empty: {
      headline: 'No connection within six hops',
      detail: 'These two companies share no owner, officer, address or agent at that distance.',
    },
  },
  {
    id: 'cycles',
    label: 'Which companies own each other?',
    hint: 'circular ownership',
    title: 'Does any structure own itself?',
    subtitle: 'Ownership that loops never reaches a person — which is the point of it.',
    tracing: ['Scanning ownership edges', 'Following each chain back', 'Closing the rings'],
    run: () => api.cycles(6),
    focusIds: [],
    empty: {
      headline: 'No circular ownership found',
      detail: 'Every ownership chain in this graph terminates at a natural person.',
    },
  },
  {
    id: 'watchlist',
    label: 'What do sanctioned parties control?',
    hint: 'watchlist control',
    title: 'What do sanctioned parties control?',
    subtitle: 'Every company reached from the OFAC SDN list, at any depth.',
    tracing: ['Reading the watchlist', 'Expanding holdings', 'Rolling up percentages'],
    run: () => api.watchlist(20),
    focusIds: [],
    empty: {
      headline: 'Nobody on the watchlist controls anything here',
      detail: 'No listed party holds a stake above the threshold in this graph.',
    },
  },
  {
    id: 'nominee',
    label: 'Who is the nominee acting for?',
    hint: 'nominee unmasking',
    title: 'Who is Clara Voss really acting for?',
    subtitle: 'The name on the register is not always the person who benefits.',
    tracing: [
      'Finding Clara Voss',
      'Following the nominee relationship',
      'Listing the companies she fronts',
    ],
    run: () => api.nominee(NOMINEE),
    focusIds: [NOMINEE],
    empty: {
      headline: 'This person is not acting as a nominee',
      detail: 'No nominee relationship is recorded against them.',
    },
  },
  {
    id: 'shared',
    label: 'Who else uses this address or agent?',
    hint: 'shared registration',
    title: 'Who else uses Cobalt Estuary’s address and agent?',
    subtitle: 'A mass-registration address is weak evidence. A shared director is not.',
    tracing: ['Reading the registration', 'Counting co-registrants'],
    run: () => api.sharedRegistration(PARENT_A, 8),
    focusIds: [PARENT_A],
    empty: {
      headline: 'This company shares neither an address nor an agent',
      detail: 'It is registered somewhere used by nobody else in this graph.',
    },
  },
];

export const DEFAULT_QUESTION = QUESTIONS[0] as Question;
