'use strict';
// Escolhe o inversor: adaptador do modelo real do HUB (server/drive/cfw500-real.js,
// escrito no M1b a partir de simuladores/cfw500/src/drive/cfw500.js) ou o stub.
const fs = require('fs');
const path = require('path');

function createDrive(opts = {}) {
  const real = path.join(__dirname, 'cfw500-real.js');
  if (!opts.forcarStub && fs.existsSync(real)) {
    return require(real).createCFW500(opts);
  }
  return require('./cfw500-stub').createCFW500Stub(opts);
}

module.exports = { createDrive };
