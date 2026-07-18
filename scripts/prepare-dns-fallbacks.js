'use strict';

const path = require('path');
const { config } = require('../lib/config');
const { createLinkUpdater } = require('../lib/link-updater');

async function main() {
  const root = path.resolve(__dirname, '..');
  const knowledge = { reload() {} };
  const updater = createLinkUpdater(root, config, knowledge);
  const report = await updater.run({ write: true });
  console.log(JSON.stringify(report, null, 2));
  if (report.unresolved > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});