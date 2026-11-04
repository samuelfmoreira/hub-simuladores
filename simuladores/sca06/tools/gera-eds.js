/* Gera o arquivo EDS DO SIMULADOR para importar no configurador do mestre (CODESYS, Studio 5000, etc.)
 *   node tools/gera-eds.js
 * Um EDS só, com duas conexões Exclusive Owner para escolher no mestre:
 *   - 4 palavras de entrada e 4 de saída (velocidade e torque, P0202 = 6)
 *   - 8 palavras de entrada e 8 de saída (posição pela Função Posicionador, P0202 = 3, firmware V2.1X)
 * ATENÇÃO: este NÃO é o EDS oficial da WEG. O EDS oficial do SCA06 está em www.weg.net
 * [ETH 8.4]. Estrutura baseada no EDS de exemplo do projeto OpENer (EIPStackGroup). */
'use strict';
const fs = require('fs'), path = require('path');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
const id = cfg.enip.identity;
const nIn = 8, nOut = 8;   // o EDS descreve até 8 palavras; a conexão de 4 usa só as 4 primeiras
const d = new Date(), dd = (n) => String(n).padStart(2, '0');
const date = `${dd(d.getMonth() + 1)}-${dd(d.getDate())}-${d.getFullYear()}`, time = `${dd(d.getHours())}:${dd(d.getMinutes())}:${dd(d.getSeconds())}`;
const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, '0');
const IN_NAMES = ['Palavra de estado', 'Velocidade do motor', 'Corrente de torque', 'Modo de controle atual',
  'P0820 (posicao: fracao de volta P0052)', 'P0821 (posicao: voltas P0053)', 'P0822 (estado do servo P0006)', 'P0823 (erro de lag P0048)'];
const OUT_NAMES = ['Palavra de controle', 'Referencia de velocidade', 'Referencia de torque', 'Modo de controle',
  'P0835 (posicao: habilitacao P0099)', 'P0836 (disparo P01079)', 'P0837 (destino fracao P01171)', 'P0838 (reset de falhas P0219)'];
const param = (i, name, help, type = '0xC3', size = 2, mm = ',,0') => `        Param${i} =
                0,,,0x0000,${type},${size},
                "${name}","","${help}",
                ${mm},
                ,,,,
                ,,,,
                0;`;
const params = [];
let k = 1;
const inRefs = [], outRefs = [];   // referências das 8 palavras; a conexão de 4 usa as 4 primeiras
for (let i = 0; i < nIn; i++) { params.push(param(k, `IN${i + 1} ${IN_NAMES[i] || 'Parametro P0' + (820 + i - 4)}`, i < 4 ? 'Manual Ethernet SCA06 item 6.1' : `Parametro apontado em P0${820 + i - 4}`)); inRefs.push(`16,Param${k}`); k++; }
for (let i = 0; i < nOut; i++) { params.push(param(k, `OUT${i + 1} ${OUT_NAMES[i] || 'Parametro P0' + (835 + i - 4)}`, i < 4 ? 'Manual Ethernet SCA06 item 6.2' : `Parametro apontado em P0${835 + i - 4}`)); outRefs.push(`16,Param${k}`); k++; }
const rpiP = k; params.push(param(k, 'RPI', 'Requested Packet Interval (us)', '0xC8', 4, `${cfg.enip.minRpiUs || 1000},3200000,20000`));

const eds = `$ EDS do SIMULADOR SCA06 + ECO5 (nao e o EDS oficial WEG) - gerado por tools/gera-eds.js
[File]
        DescText = "Simulador didatico SCA06 ECO5 EtherNet/IP (conexoes de 4 ou 8 palavras)";
        CreateDate = ${date};
        CreateTime = ${time};
        ModDate = ${date};
        ModTime = ${time};
        Revision = 1.0;

[Device]
        VendCode = ${id.vendor};
        VendName = "WEG (simulador)";
        ProdType = ${id.deviceType};
        ProdTypeStr = "Generic Device";
        ProdCode = ${id.productCode};
        MajRev = ${id.major};
        MinRev = ${id.minor};
        ProdName = "${id.name}";
        Catalog = "SCA06-ECO5-SIM";

[Device Classification]
        Class1 = EtherNetIP;

[Params]
${params.join('\n')}

[Assembly]
        Object_Name = "Assembly Object";
        Object_Class_Code = 0x04;
        Number_Of_Static_Instances = 4;
        Assem100 =
                "Entrada 4 palavras (T->O)",
                "",
                8,
                0x0000,
                ,,
                ${inRefs.slice(0, 4).join(',\n                ')};
        Assem101 =
                "Entrada 8 palavras (T->O)",
                "",
                16,
                0x0000,
                ,,
                ${inRefs.join(',\n                ')};
        Assem150 =
                "Saida 4 palavras (O->T)",
                "",
                8,
                0x0001,
                ,,
                ${outRefs.slice(0, 4).join(',\n                ')};
        Assem151 =
                "Saida 8 palavras (O->T)",
                "",
                16,
                0x0001,
                ,,
                ${outRefs.join(',\n                ')};

[Connection Manager]
        Revision = 1;
        Object_Name = "Connection Manager Object";
        Object_Class_Code = 0x06;
        MaxInst = 1;
        Number_Of_Static_Instances = 1;
        Max_Number_Of_Dynamic_Instances = 0;
        Connection1 =
                0x84010002,
                0x44640405,
                Param${rpiP},8,Assem150,
                Param${rpiP},8,Assem100,
                ,,
                0,,
                "Exclusive Owner, 4 palavras (velocidade e torque)",
                "",
                "20 04 24 01 2C 96 2C 64";
        Connection2 =
                0x84010002,
                0x44640405,
                Param${rpiP},16,Assem151,
                Param${rpiP},16,Assem101,
                ,,
                0,,
                "Exclusive Owner, 8 palavras (posicao)",
                "",
                "20 04 24 01 2C 96 2C 64";
        Connection3 =
                0x02010002,
                0x44640305,
                Param${rpiP},0,,
                Param${rpiP},8,Assem100,
                ,,
                0,,
                "Input Only, 4 palavras",
                "",
                "20 04 24 01 2C C6 2C 64";
        Connection4 =
                0x01010002,
                0x44240305,
                Param${rpiP},0,,
                Param${rpiP},8,Assem100,
                ,,
                0,,
                "Listen Only, 4 palavras",
                "",
                "20 04 24 01 2C C7 2C 64";

[Capacity]
        MaxIOConnections = 3;
        MaxMsgConnections = 6;
        TSpec1 = TxRx, ${nIn * 2}, 1000;
        TSpec2 = TxRx, ${nOut * 2}, 1000;
`;
const name = `${hex4(id.vendor)}${hex4(id.deviceType)}${hex4(id.productCode)}${dd(id.major)}00_SCA06_SIM.eds`;
const out = path.join(__dirname, '..', 'docs', name);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, eds.replace(/\n/g, '\r\n'), 'latin1');
console.log('EDS gerado:', out);
