const { initializeApp, applicationDefault } = require('./functions/node_modules/firebase-admin/app');
const { getAuth } = require('./functions/node_modules/firebase-admin/auth');

const identifier = process.argv[2];
if (!identifier) {
  console.error('Usage: node grant-admin.js ADMIN_UID_OR_EMAIL');
  process.exit(1);
}

initializeApp({
  credential: applicationDefault(),
  projectId: process.env.GCLOUD_PROJECT || 'eamcet-ace'
});

(async () => {
  const auth = getAuth();
  const user = identifier.includes('@')
    ? await auth.getUserByEmail(identifier.trim().toLowerCase())
    : await auth.getUser(identifier.trim());
  const claims = Object.assign({}, user.customClaims || {}, { admin: true });
  await auth.setCustomUserClaims(user.uid, claims);
  console.log(`Admin claim granted to ${user.uid} (${user.email || 'no email'})`);
  console.log('Sign out and sign back in before opening the admin panel.');
})().catch(error => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
