/**
 * Publica uma versão do HUB para a atualização automática.
 *
 * No GitHub Actions (.github/workflows/publicar.yml chama:  node publicar.js --github):
 *   monta o pacote de atualização (zip), assina com a chave privada (secret HUB_CHAVE_PRIVADA),
 *   monta o executável do usuário final (HUB-Simuladores.exe, com o HUB inteiro embutido: baixar e
 *   abrir, ele se instala sozinho) e grava em construir/dist/publicar/ os arquivos do release:
 *       HUB-Simuladores.exe   HUB-Simuladores-<v>-atualizacao.zip   versao.json
 *   O nome do .exe não muda entre versões: o link .../releases/latest/download/HUB-Simuladores.exe
 *   sempre entrega a versão mais recente.
 *   O workflow cria o release v<versão> com eles. Os HUBs instalados leem o versao.json do
 *   release mais recente e se atualizam.
 *
 * Teste local (sem GitHub), gravando numa pasta servida por HTTP:
 *   node construir/publicar.js --local /tmp/registro --url http://localhost:8765 --chave construir/chave-privada.pem [--sem-exe]
 *   (--alvo linux gera o executável para Linux, só para testes)
 *
 * Secrets do GitHub (Settings > Secrets and variables > Actions):
 *   HUB_CHAVE_PRIVADA   obrigatório: conteúdo do chave-privada.pem em base64, gerado por gerar-chaves.js
 *   HUB_TOKEN_LEITURA   só para repositório privado: token fine-grained com Contents: Read-only neste repositório
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const M = require('./montar');

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const tem = (n) => process.argv.includes(`--${n}`);
const passo = (t) => console.log(`\n== ${t} ==`);

function zipar(pasta, nomeBase, destino) {
  const AdmZip = require('adm-zip');
  const z = new AdmZip();
  z.addLocalFolder(pasta, nomeBase);
  z.writeZip(destino);
  return fs.readFileSync(destino);
}

function notasDaVersao(versao) {
  const arq = path.join(M.RAIZ, 'NOVIDADES.md');
  if (!fs.existsSync(arq)) return '';
  const linhas = fs.readFileSync(arq, 'utf8').split(/\r?\n/);
  const i = linhas.findIndex((l) => l.startsWith(`## ${versao}`));
  if (i < 0) return '';
  const fim = linhas.findIndex((l, k) => k > i && l.startsWith('## '));
  return linhas.slice(i + 1, fim < 0 ? undefined : fim).join('\n').trim();
}

function chavePrivada() {
  const arqv = arg('chave');
  let pem = arqv ? fs.readFileSync(arqv, 'utf8') : process.env.HUB_CHAVE_PRIVADA;
  if (!pem) throw new Error('Sem chave privada: defina o secret HUB_CHAVE_PRIVADA no GitHub (veja construir/gerar-chaves.js) ou use --chave.');
  if (!pem.includes('BEGIN')) pem = Buffer.from(pem.trim(), 'base64').toString('utf8');
  return crypto.createPrivateKey(pem);
}

(async () => {
  const versao = M.versaoHub();
  const local = arg('local');
  const github = tem('github') ? process.env.GITHUB_REPOSITORY : null;
  if (!local && !github) throw new Error('Use no GitHub Actions (--github) ou, para teste, --local <pasta> --url <endereço>.');
  const base = local ? arg('url').replace(/\/$/, '') : null;
  const saida = path.join(M.AQUI, 'dist', 'publicar');
  fs.rmSync(saida, { recursive: true, force: true }); fs.mkdirSync(saida, { recursive: true });
  const enviar = local
    ? async (rel, buf) => { const d = path.join(local, rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.writeFileSync(d, buf); }
    : async () => { /* no GitHub, o workflow cria o release com os arquivos de dist/publicar */ };
  console.log(`HUB ${versao} → ${github ? `GitHub ${github}` : base}`);

  // ---- chaves: a privada assina; a pública do repositório precisa ser o par dela
  const priv = chavePrivada();
  const pubRepo = path.join(M.RAIZ, 'hub', 'chave-publica.pem');
  if (!fs.existsSync(pubRepo)) throw new Error('hub/chave-publica.pem não está no repositório. Rode construir/gerar-chaves.js e faça commit dela.');
  const teste = crypto.sign(null, Buffer.from('teste'), priv);
  if (!crypto.verify(null, Buffer.from('teste'), crypto.createPublicKey(fs.readFileSync(pubRepo, 'utf8')), teste)) {
    throw new Error('A chave privada não é o par de hub/chave-publica.pem. Os HUBs instalados recusariam este pacote.');
  }

  // ---- canal.json: diz aos HUBs onde procurar (vai dentro dos pacotes)
  const canal = github ? { github } : { manifesto: `${base}/latest/versao.json` };
  if (github && process.env.HUB_TOKEN_LEITURA) canal.token = process.env.HUB_TOKEN_LEITURA;
  fs.writeFileSync(path.join(M.RAIZ, 'canal.json'), JSON.stringify(canal, null, 2));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-publicar-'));

  passo('Pacote de atualização');
  M.montarPasta(path.join(tmp, 'atu', 'HUB-Simuladores'));
  const nomeAtu = `HUB-Simuladores-${versao}-atualizacao.zip`;
  const bufAtu = zipar(path.join(tmp, 'atu', 'HUB-Simuladores'), 'HUB-Simuladores', path.join(saida, nomeAtu));
  const sha256 = crypto.createHash('sha256').update(bufAtu).digest('hex');
  const assinatura = crypto.sign(null, Buffer.from(`hub-simuladores|${versao}|${sha256}`), priv).toString('base64');
  console.log(`  [OK] ${nomeAtu} (${(bufAtu.length / 1048576).toFixed(1)} MB) sha256 ${sha256.slice(0, 16)}...`);

  let nomeExe = null;
  if (!tem('sem-exe')) {
    passo('Executável do usuário final');
    const linux = arg('alvo') === 'linux';
    const pasta = path.join(tmp, 'exe', 'HUB-Simuladores');
    M.montarPasta(pasta);
    M.instalarDependencias(pasta);
    M.copiarNpm(pasta);
    const pacote = M.empacotar(pasta);
    console.log(`  pacote embutido: ${(pacote.length / 1048576).toFixed(0)} MB`);
    nomeExe = linux ? 'HUB-Simuladores-linux' : 'HUB-Simuladores.exe';
    const baseNode = linux || process.platform === 'win32' ? process.execPath : M.nodeWindows();
    await M.gerarExe(path.join(saida, nomeExe), baseNode, { windows: !linux, versao, pacote });
  }

  passo('Publicação');
  const manifesto = {
    versao, publicadoEm: new Date().toISOString(),
    // no GitHub o pacote fica no mesmo release do versao.json: basta o nome
    pacote: github ? nomeAtu : `${base}/${versao}/${nomeAtu}`, sha256, assinatura,
    instalador: nomeExe ? (github ? `https://github.com/${github}/releases/latest/download/${nomeExe}` : `${base}/${versao}/${nomeExe}`) : null,
    notas: notasDaVersao(versao),
  };
  fs.writeFileSync(path.join(M.AQUI, 'dist', 'NOTAS.md'), manifesto.notas || `HUB de Simuladores ${versao}`);
  await enviar(`${versao}/${nomeAtu}`, bufAtu);
  if (nomeExe) await enviar(`${versao}/${nomeExe}`, fs.readFileSync(path.join(saida, nomeExe)));
  const json = Buffer.from(JSON.stringify(manifesto, null, 2));
  fs.writeFileSync(path.join(saida, 'versao.json'), json);
  await enviar(`${versao}/versao.json`, json);
  await enviar('latest/versao.json', json);   // por último: só agora os HUBs instalados enxergam a versão nova
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(github ? `  [OK] arquivos do release em ${saida}: ${fs.readdirSync(saida).join(', ')}` : `  [OK] gravado em ${local}`);
  console.log(`\nVersão ${versao} pronta.${nomeExe ? `\nLink para o usuário final: ${manifesto.instalador}` : ''}`);
})().catch((e) => { console.error(`\n[ERRO] ${e.message}`); process.exit(1); });
