const adminsEnv = process.env.ADMIN_USERS || '';

const admins = adminsEnv
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

module.exports = admins;

