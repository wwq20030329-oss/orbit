const os = require('os');

const PREFERRED_PREFIXES = ['en0', 'en1', 'bridge'];

function getInterfacePriority(name) {
  const preferredIndex = PREFERRED_PREFIXES.findIndex((prefix) => name.startsWith(prefix));
  if (preferredIndex !== -1) {
    return preferredIndex;
  }
  if (name.startsWith('lo') || name.startsWith('utun')) {
    return 99;
  }
  return 50;
}

function resolveLanIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses ?? []) {
      if (!address || address.internal || address.family !== 'IPv4') {
        continue;
      }

      candidates.push({
        name,
        address: address.address,
        priority: getInterfacePriority(name),
      });
    }
  }

  candidates.sort((left, right) => {
    if (left.priority === right.priority) {
      return left.name.localeCompare(right.name);
    }
    return left.priority - right.priority;
  });

  return candidates[0]?.address ?? null;
}

module.exports = {
  resolveLanIp,
};
