/**
 * Gera o par de chaves da atualização automática. Rode UMA vez, no seu PC:
 *   node construir/gerar-chaves.js
 *
 *   hub/chave-publica.pem        vai para o repositório (commit): os HUBs instalados usam para conferir
 *   construir/chave-privada.pem  fica SÓ com você (está no .gitignore). Guarde uma cópia em lugar seguro.
 *
 * No GitHub: Settings > Secrets and variables > Actions > HUB_CHAVE_PRIVADA = o texto em base64 mostrado no final
 * (secret do repositório).
 *
 * Se a chave privada for perdida ou vazar: gere outro par e distribua um instalador novo,
 * porque os HUBs já instalados só aceitam pacotes assinados pela chave antiga.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PUB = path.join(__dirname, '..', 'hub', 'chave-publica.pem');
const PRIV = path.join(__dirname, 'chave-privada.pem');
if ((fs.existsSync(PUB) || fs.existsSync(PRIV)) && !process.argv.includes('--substituir')) {
  console.error('Já existe um par de chaves. Trocar a chave quebra a atualização dos HUBs instalados.');
  console.error('Se é isso mesmo que você quer, rode com --substituir.');
  process.exit(1);
}
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
fs.writeFileSync(PUB, publicKey.export({ type: 'spki', format: 'pem' }));
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
fs.writeFileSync(PRIV, pem, { mode: 0o600 });
console.log('Chaves geradas.');
console.log(`  pública: ${PUB}   (faça commit)`);
console.log(`  privada: ${PRIV}  (NÃO faça commit; guarde uma cópia)`);
console.log('\nValor do secret HUB_CHAVE_PRIVADA no GitHub (Settings > Secrets and variables > Actions):\n');
console.log(Buffer.from(pem).toString('base64'));
