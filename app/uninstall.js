'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const {options, layout} = require('./installation');

/** Remove this bridge's known paths, including frontends for browsers removed
 * since installation. Preserve other hosts and all Flatpak permission overrides.
 * The dedicated com.add0n.node application directory is removed recursively.
 */
function uninstall(settings) {
  const paths = layout(settings);
  for (const dir of [...Object.values(paths.hosts), ...Object.values(paths.frontends)]) {
    for (const suffix of ['.json', '-proxy-shim', '.sh']) {
      fs.rmSync(path.join(dir, config.name + suffix), {force: true});
    }
  }
  fs.rmSync(paths.appDir, {recursive: true, force: true});
}

if (require.main === module) {
  try {
    uninstall(options(process.argv.slice(2), process.env.HOME));
    console.log('Hardened host and browser frontends removed. Flatpak overrides were not changed.');
    console.log('Review proxy talk permissions separately if they were only used by this bridge.');
  }
  catch (err) { console.error(`Uninstall failed: ${err.message}`); process.exitCode = 1; }
}
module.exports = {uninstall};
