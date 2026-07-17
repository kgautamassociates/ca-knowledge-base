const { getAuth, clerkClient } = require('@clerk/express');

// Auth now comes from Clerk, not this app's own login form. clerkMiddleware()
// (wired in server.js) reads the session JWT from the Authorization header —
// this app is cross-origin from the hub (portal.internal.kgautam.in), so the
// frontend must send `Authorization: Bearer <token>` on every request; there
// is no shared cookie between the two domains (Clerk satellite domains only
// support Next.js/TanStack Start/Nuxt, not a vanilla Express+HTML app like
// this one — see public/index.html's auth handling).
//
// req.auth is shaped to match what routes/entries.js and routes/data.js
// already expect from the old req.session.user object, so those files
// needed no further changes beyond the req.session.user -> req.auth rename.
async function requireAuth(req, res, next) {
  const auth = getAuth(req);
  if (!auth.isAuthenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const staffOrgId = process.env.CLERK_ORGANIZATION_ID;
  if (auth.orgId !== staffOrgId) {
    return res.status(403).json({ error: 'Not a member of KGA Staff' });
  }

  try {
    const user = await clerkClient.users.getUser(auth.userId);
    req.auth = {
      id: auth.userId,
      username: user.username || user.emailAddresses[0]?.emailAddress || auth.userId,
      role: auth.orgRole === 'org:admin' ? 'admin' : 'viewer',
    };
    next();
  } catch (e) {
    res.status(401).json({ error: 'Not authenticated' });
  }
}

function requireAdmin(req, res, next) {
  if (req.auth && req.auth.role === 'admin') return next();
  res.status(403).json({ error: 'Admin access required' });
}

module.exports = { requireAuth, requireAdmin };
