export const en = {
  brand: 'Caselog',
  nav: {
    label: 'Main navigation',
    skip: 'Skip to content',
    product: 'Product',
    docs: 'Documentation',
    contact: 'Contact',
    github: 'GitHub',
    start: 'Get started',
  },
  home: {
    title: 'Caselog — Know what is ready to ship',
    description:
      'Open-source test management and release readiness. Connect test cases, CI results, and evidence to an explainable decision for every release candidate.',
    eyebrow: 'TEST MANAGEMENT. RELEASE READINESS.',
    heading: 'Know what is',
    headingAccent: 'ready to ship.',
    intro:
      'Bring your test cases, runs, and CI evidence into one place. See what passed, what is missing, and what is blocking your next release.',
    secondary: 'See how it works',
    note: 'Open source. Self-hostable. Free to get started.',
    sampleLabel: 'ILLUSTRATIVE RELEASE DECISION',
    sampleProject: 'Checkout / Release 1.4',
    sampleCandidate: 'Candidate RC-03',
    sampleCommit: 'Commit 8f2a6c1',
    sampleStatus: 'Blocked',
    sampleSummary: 'One gate needs attention.',
    sampleGates: [
      {
        label: 'Required test runs',
        detail: 'All runs completed',
        status: 'Passed',
        tone: 'success',
      },
      {
        label: 'Regression results',
        detail: '48 of 48 tests passed',
        status: 'Passed',
        tone: 'success',
      },
      {
        label: 'Security evidence',
        detail: 'Latest observation expired',
        status: 'Stale',
        tone: 'warning',
      },
    ],
    sampleFooter: 'Every decision has a reason. Every reason has evidence.',
    strip: ['Manual + automated testing', 'Immutable release candidates', 'Explainable decisions'],
    problemEyebrow: 'FROM TEST RESULTS TO A RELEASE DECISION',
    problemTitle: 'The tests ran.\nCan we release?',
    problemText:
      'A green pipeline is one part of the picture. Caselog brings manual testing and automated evidence together, so your team can make the next decision with context.',
    steps: [
      {
        number: '01',
        title: 'Organize the work',
        text: 'Write reusable cases, keep their version history, and plan focused test runs for your team.',
      },
      {
        number: '02',
        title: 'Connect the evidence',
        text: 'Record manual results, upload JUnit reports, and link runs to the exact build you want to release.',
      },
      {
        number: '03',
        title: 'Make the call',
        text: 'Evaluate published policies. Inspect missing or stale evidence, blockers, and recorded exceptions.',
      },
    ],
    featuresEyebrow: 'BUILT FOR THE WHOLE WORKFLOW',
    featuresTitle: 'Testing and readiness,\nin the same conversation.',
    features: [
      {
        number: 'A',
        title: 'A home for your test cases',
        text: 'Suites, sections, reusable cases, CSV imports, and version history. Give manual and automated testing a shared starting point.',
      },
      {
        number: 'B',
        title: 'CI is a first-class citizen',
        text: 'Use the public API and CLI to submit results, create candidates, and check readiness directly from your pipeline.',
      },
      {
        number: 'C',
        title: 'History you can explain',
        text: 'Trace a decision to its candidate, policy version, and evidence. New observations produce new decisions while preserving the old ones.',
      },
      {
        number: 'D',
        title: 'Your workspace. Your access.',
        text: 'Keep projects and teams organized with explicit memberships and roles. Each workspace has its own tenant boundary.',
      },
    ],
    openEyebrow: 'OPEN SOURCE, FROM THE START',
    openTitle: 'Run it on your terms.',
    openText:
      'Self-host the complete core product on your infrastructure. No license server, subscription, or Caselog account is required to operate it.',
    openNote:
      'MVP 0.1.0 is ready for evaluation and feedback. Read the release notes and deployment guidance before using it with real data.',
    source: 'Explore the source',
    install: 'Read the installation guide',
    invitationEyebrow: 'HELP SHAPE WHAT COMES NEXT',
    invitationTitle: 'Bring your real release workflow.',
    invitationText:
      'We are looking for teams to try Caselog and share what helps, what gets in the way, and what they need to make a confident release decision.',
    invitationCta: 'Talk to us',
  },
  contact: {
    title: 'Contact — Caselog',
    description:
      'Talk to the Caselog team about evaluating the product, release workflows, feedback, and technical questions.',
    eyebrow: 'LET’S TALK',
    heading: 'Better releases start\nwith a conversation.',
    intro:
      'Trying Caselog with your team? Have a question or a workflow we should understand? We would like to hear from you.',
    emailLabel: 'EMAIL US',
    emailCta: 'Write an email',
    emailSubject: 'Hello Caselog',
    emailHint: 'Opens your email app. You can also copy the address above.',
    contextTitle: 'Tell us a little about your team.',
    contextText:
      'What are you testing, how do you decide to release, and where does that process slow down? A few sentences are enough to get started.',
    contextNote: 'Please leave out passwords, API tokens, and private customer data.',
    routes: [
      {
        title: 'Explore the product',
        text: 'Start with installation and the guides for cases, runs, and release readiness.',
        action: 'Read the documentation',
        kind: 'docs',
      },
      {
        title: 'Report a bug or suggest an improvement',
        text: 'Use a GitHub issue for reproducible problems and public product feedback.',
        action: 'Open GitHub issues',
        kind: 'issues',
      },
      {
        title: 'Report a security issue',
        text: 'Please report vulnerabilities privately using our security reporting instructions.',
        action: 'Read the security policy',
        kind: 'security',
      },
    ],
    faqTitle: 'A few things to know',
    faqs: [
      {
        question: 'Can we try Caselog without paying?',
        answer:
          'Yes. You can self-host the core product without a subscription or license fee. You provide the hosting infrastructure. Our initial hosted offering is also planned to be free; email us if your team would like to participate.',
      },
      {
        question: 'Do we need to move all our testing at once?',
        answer:
          'Start with one project and a small set of cases. Try a run, connect its results to a candidate, and see whether the readiness workflow fits your team.',
      },
      {
        question: 'Is Caselog a stable 1.0 release?',
        answer:
          'Not yet. The current MVP is 0.1.0. It is intended for evaluation and feedback, with known compatibility and operational limits documented in the release notes.',
      },
    ],
  },
  footer: {
    tagline: 'From test evidence to release confidence.',
    license: 'AGPL-3.0-only · CLI under MIT',
    copyright: 'Caselog contributors',
    security: 'Security',
    releases: 'Release notes',
    source: 'Source code',
    fontLicense: 'Font license',
    label: 'Footer navigation',
  },
  missing: {
    title: 'Page not found — Caselog',
    heading: 'This page is missing.',
    text: 'The address may have changed. Head back to the homepage to find your next step.',
    action: 'Back to Caselog',
  },
} as const;
