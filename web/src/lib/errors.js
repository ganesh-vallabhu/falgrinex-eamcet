export function isPermissionDenied(error) {
  return error?.code === 'permission-denied' || error?.code === 'auth/permission-denied';
}

export function isRetryable(error) {
  const code = String(error?.code || '').toLowerCase();
  return ['unavailable', 'internal', 'deadline-exceeded', 'aborted', 'network-request-failed', 'resource-exhausted', 'too-many-requests'].some((part) => code.includes(part));
}

export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const code = String(error?.code || '');
  const messages = {
    'auth/invalid-email': 'That email address is not valid.',
    'auth/missing-password': 'Please enter your password.',
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'Wrong email or password.',
    'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
    'auth/network-request-failed': 'Internet issue. Check your connection and try again.',
    'auth/email-already-in-use': 'That email is already in use.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'permission-denied': 'You do not have permission for this action.',
    'failed-precondition': 'This request is not available yet. Please retry shortly.',
  };
  return messages[code] || error?.message || fallback;
}
