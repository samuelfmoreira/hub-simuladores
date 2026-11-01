/* Gera o arquivo EDS DO SIMULADOR para importar no configurador do mestre (CODESYS, Studio 5000, etc.)
 *   node tools/gera-eds.js [palavras_entrada] [palavras_saida]     (padrão 4 4)
 * ATENÇÃO: este NÃO é o EDS oficial da WEG. O EDS oficial do SCA06 está em www.weg.net
 * [ETH 8.4]. Estrutura baseada no EDS de exemplo do projeto OpENer (EIPStackGroup). */
'use strict';
const fs = require('fs'), path = require('path');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
const id = cfg.enip.identity;
const nIn = Math.max(4, Math.min(16, +process.argv[2] || 4)), nOut = Math.max(4, Math.min(16, +process.argv[3] || 4));
const d = new Date(), dd = (n) => String(n).padStart(2, '0');
const date = `${dd(d.getMonth() + 1)}-${dd(d.getDate())}-${d.getFullYear()}`, time = `${dd(d.getHours())}:${dd(d.getMinutes())}:${dd(d.getSeconds())}`;
const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, '0');
const IN_NAMES = ['Palavra de estado', 'Velocidade do motor', 'Corrente de torque', 'Modo de controle atual'];
const OUT_NAMES = ['Palavra de controle', 'Referencia de velocidade', 'Referencia de torque', 'Modo de controle'];
const param = (i, name, help, type = '0xC3', size = 2, mm = ',,0') => `        Param${i} =
                0,,,0x0000,${type},${size},
                "${name}","","${help}",
                ${mm},
                ,,,,
                ,,,,
                0;`;
const params = [];
let k = 1;
const inRefs = [], outRefs = [];
for (let i = 0; i < nIn; i++) { params.push(param(k, `IN${i + 1} ${IN_NAMES[i] || 'Parametro P0' + (820 + i - 4)}`, i < 4 ? 'Manual Ethernet SCA06 item 6.1' : `Parametro apontado em P0${820 + i - 4}`)); inRefs.push(`16,Param${k}`); k++; }
for (let i = 0; i < nOut; i++) { params.push(param(k, `OUT${i + 1} ${OUT_NAMES[i] || 'Parametro P0' + (835 + i - 4)}`, i < 4 ? 'Manual Ethernet SCA06 item 6.2' : `Parametro apontado em P0${835 + i - 4}`)); outRefs.push(`16,Param${k}`); k++; }
const rpiP = k; params.push(param(k, 'RPI', 'Requested Packet Interval (us)', '0xC8', 4, `${cfg.enip.minRpiUs || 1000},3200000,20000`));

const eds = `$ EDS do SIMULADOR SCA06 + ECO5 (nao e o EDS oficial WEG) - gerado por tools/gera-eds.js
[File]
        DescText = "Simulador didatico SCA06 ECO5 EtherNet/IP (${nIn} palavras de entrada, ${nOut} de saida)";
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
        Number_Of_Static_Instances = 2;
        Assem100 =
                "Entrada (T->O)",
                "",
                ${nIn * 2},
                0x0000,
                ,,
                ${inRefs.join(',\n                ')};
        Assem150 =
                "Saida (O->T)",
                "",
                ${nOut * 2},
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
                Param${rpiP},${nOut * 2},Assem150,
                Param${rpiP},${nIn * 2},Assem100,
                ,,
                0,,
                "Exclusive Owner",
                "",
                "20 04 24 01 2C 96 2C 64";
        Connection2 =
                0x02010002,
                0x44640305,
                Param${rpiP},0,,
                Param${rpiP},${nIn * 2},Assem100,
                ,,
                0,,
                "Input Only",
                "",
                "20 04 24 01 2C C6 2C 64";
        Connection3 =
                0x01010002,
                0x44240305,
                Param${rpiP},0,,
                Param${rpiP},${nIn * 2},Assem100,
                ,,
                0,,
                "Listen Only",
                "",
                "20 04 24 01 2C C7 2C 64";

[Capacity]
        MaxIOConnections = 3;
        MaxMsgConnections = 6;
        TSpec1 = TxRx, ${nIn * 2}, 1000;
        TSpec2 = TxRx, ${nOut * 2}, 1000;
`;
const name = `${hex4(id.vendor)}${hex4(id.deviceType)}${hex4(id.productCode)}${dd(id.major)}00_SCA06_SIM_${nIn}x${nOut}.eds`;
const out = path.join(__dirname, '..', 'docs', name);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, eds.replace(/\n/g, '\r\n'), 'latin1');
console.log('EDS gerado:', out);
