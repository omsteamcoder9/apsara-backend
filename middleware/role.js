// appfolder/middleware/role.js

/**
 * requireRole(allowedRolesArray)
 * Example: requireRole(['superadmin','admin'])
 */
export const requireRole = (allowed = []) => (req, reply) => {
  const role = req.user?.role;
  if (!role) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }
  if (!allowed.includes(role)) {
    return reply.status(403).send({ message: 'Forbidden: insufficient permissions' });
  }
  return; // Continue to next handler
};