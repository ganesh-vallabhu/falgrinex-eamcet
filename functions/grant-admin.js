const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const identifier = process.argv[2];
if (!identifier) {
  console.error('Usage: node grant-admin.js ADMIN_UID_OR_EMAIL');
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT || 'eamcet-ace' });

(async () => {
  const auth = getAuth();
  const user = identifier.includes('@')
    ? await auth.getUserByEmail(identifier.trim().toLowerCase())
    : await auth.getUser(identifier.trim());
  const claims = Object.assign({}, user.customClaims || {}, { admin: true });
  await auth.setCustomUserClaims(user.uid, claims);
  console.log(`Admin claim granted to ${user.uid} (${user.email || 'no email'})`);
  console.log('Sign out and sign back in (or force a token refresh) before opening the admin panel.');
})().catch(error => {
  const code = String((error && error.code) || '');
  if (code === 'auth/user-not-found') console.error('No Firebase Authentication user was found for that UID/email. Create the admin user in Firebase Authentication first.');
  else if (code.includes('permission') || /iam\.serviceAccounts|signBlob/i.test(String(error && error.message))) console.error('Application Default Credentials cannot set custom claims. Run "gcloud auth application-default login" with a project owner/editor account, or use a service account with the Firebase Authentication Admin role.');
  else console.error(error);
  process.exit(1);
});
