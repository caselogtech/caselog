const repository = 'https://github.com/caselogtech/caselog';
const docs = import.meta.env.SITE_DOCS_URL || `${repository}/blob/main/apps/docs/README.md`;
const contactEmail = import.meta.env.SITE_CONTACT_EMAIL || 'ivan.pelykh@protonmail.com';
if (!['https:', 'http:'].includes(new URL(docs).protocol)) {
  throw new Error('SITE_DOCS_URL must be an HTTP(S) URL');
}
if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contactEmail)) {
  throw new Error('SITE_CONTACT_EMAIL must be an email address');
}

export const links = {
  repository,
  docs,
  contactEmail,
  issues: `${repository}/issues`,
  security: `${repository}/blob/main/SECURITY.md`,
  releases: `${repository}/blob/main/CHANGELOG.md`,
  install: `${repository}/blob/main/deploy/README.md`,
};
