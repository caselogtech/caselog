import { RunStatus } from '../../src/generated/prisma/enums';

export const demoId = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

export const DEMO_IDS = {
  organization: demoId(1),
  user: demoId(2),
  project: demoId(3),
  suite: demoId(4),
  sections: {
    authentication: demoId(5),
    checkout: demoId(6),
    orders: demoId(7),
  },
  environments: {
    staging: demoId(401),
    production: demoId(402),
  },
  releases: {
    active: demoId(411),
    released: demoId(412),
    draft: demoId(413),
  },
  candidates: {
    activeRc1: demoId(421),
    activeRc2: demoId(422),
    released: demoId(423),
  },
  policy: demoId(501),
  policyVersion: demoId(511),
  gates: {
    passRate: demoId(521),
    completionRate: demoId(522),
  },
  assignments: {
    active: demoId(531),
    released: demoId(532),
  },
  decisions: {
    active: demoId(541),
    released: demoId(542),
  },
} as const;

export type DemoCase = {
  id: string;
  versionId: string;
  caseNumber: bigint;
  section: keyof typeof DEMO_IDS.sections;
  title: string;
  action: string;
  expected: string;
};

export const DEMO_CASES: readonly DemoCase[] = [
  {
    id: demoId(101),
    versionId: demoId(111),
    caseNumber: 1n,
    section: 'authentication',
    title: 'Sign in with valid credentials',
    action: 'Enter a registered email and valid password, then submit the form',
    expected: 'The project dashboard opens',
  },
  {
    id: demoId(102),
    versionId: demoId(112),
    caseNumber: 2n,
    section: 'authentication',
    title: 'Reject an invalid password',
    action: 'Enter a registered email and an invalid password, then submit the form',
    expected: 'A generic authentication error is shown and no session is created',
  },
  {
    id: demoId(103),
    versionId: demoId(113),
    caseNumber: 3n,
    section: 'authentication',
    title: 'Sign out from the current session',
    action: 'Choose Sign out from the account menu',
    expected: 'The session is revoked and the login page opens',
  },
  {
    id: demoId(104),
    versionId: demoId(114),
    caseNumber: 4n,
    section: 'checkout',
    title: 'Add an available product to the cart',
    action: 'Open an in-stock product and select Add to cart',
    expected: 'The cart contains the product with quantity one and the correct price',
  },
  {
    id: demoId(105),
    versionId: demoId(115),
    caseNumber: 5n,
    section: 'checkout',
    title: 'Apply a valid discount code',
    action: 'Enter the SUMMER20 code in the cart and apply it',
    expected: 'A 20% discount is reflected in the order total',
  },
  {
    id: demoId(106),
    versionId: demoId(116),
    caseNumber: 6n,
    section: 'checkout',
    title: 'Reject an expired discount code',
    action: 'Enter an expired promotion code in the cart',
    expected: 'The code is rejected and the original order total remains unchanged',
  },
  {
    id: demoId(107),
    versionId: demoId(117),
    caseNumber: 7n,
    section: 'checkout',
    title: 'Complete checkout with a saved card',
    action: 'Select a saved card and confirm payment',
    expected: 'Payment succeeds and an order confirmation is displayed',
  },
  {
    id: demoId(108),
    versionId: demoId(118),
    caseNumber: 8n,
    section: 'orders',
    title: 'Open the order confirmation',
    action: 'Open the most recent order from order history',
    expected: 'The confirmation shows the purchased items, totals, and delivery address',
  },
  {
    id: demoId(109),
    versionId: demoId(119),
    caseNumber: 9n,
    section: 'orders',
    title: 'Retry a failed payment',
    action: 'Open an unpaid order and retry payment with a valid card',
    expected: 'The order becomes paid without creating a duplicate order',
  },
  {
    id: demoId(110),
    versionId: demoId(120),
    caseNumber: 10n,
    section: 'orders',
    title: 'Download an invoice',
    action: 'Select Download invoice from a completed order',
    expected: 'A PDF invoice with the correct customer and totals is downloaded',
  },
];

export type DemoRun = {
  id: string;
  name: string;
  status: RunStatus;
  build: string;
  createdAt: Date;
  closedAt: Date | null;
  caseNumbers: readonly number[];
  caseStatuses: readonly string[];
};

export const DEMO_RUNS: readonly DemoRun[] = [
  {
    id: demoId(201),
    name: 'Release 2.4 regression',
    status: RunStatus.ACTIVE,
    build: '2.4.0-rc.2',
    createdAt: new Date('2026-08-25T08:30:00.000Z'),
    closedAt: null,
    caseNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    caseStatuses: [
      'passed',
      'passed',
      'passed',
      'passed',
      'passed',
      'failed',
      'blocked',
      'passed',
      'untested',
      'untested',
    ],
  },
  {
    id: demoId(202),
    name: 'Checkout smoke — production',
    status: RunStatus.COMPLETED,
    build: '2.3.0',
    createdAt: new Date('2026-08-15T07:00:00.000Z'),
    closedAt: new Date('2026-08-15T07:24:00.000Z'),
    caseNumbers: [1, 4, 5, 7, 8],
    caseStatuses: ['passed', 'passed', 'passed', 'passed', 'passed'],
  },
  {
    id: demoId(203),
    name: 'Mobile checkout exploratory',
    status: RunStatus.DRAFT,
    build: '2.5.0-dev.18',
    createdAt: new Date('2026-08-27T09:15:00.000Z'),
    closedAt: null,
    caseNumbers: [4, 7, 9, 10],
    caseStatuses: ['untested', 'untested', 'untested', 'untested'],
  },
];
