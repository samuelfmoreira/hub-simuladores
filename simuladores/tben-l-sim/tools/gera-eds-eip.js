/* Gera o EDS do TBEN-L-SIM para EtherNet/IP (CODESYS, Studio 5000, etc.)
 *   node tools/gera-eds-eip.js
 * Cada campo das portas vira um parâmetro com o nome da GVL_TBEN (codesys/), no tipo certo:
 * BYTE → USINT, WORD → UINT. O layout vem de src/eip/mapa-eip.js (fonte única).
 * ATENÇÃO: não é um EDS da Turck. O TBEN-L-SIM tem identidade própria, só para laboratório. */
'use strict';
const fs = require('fs'), path = require('path');
const M = require('../src/eip/mapa-eip');
const id = { vendor: 0x0493, deviceType: 0x0C, productCode: 0x0101, major: 1, minor: 1, name: 'TBEN-L-SIM (simulador)' };
const d = new Date(), dd = (n) => String(n).padStart(2, '0');
const date = `${dd(d.getMonth() + 1)}-${dd(d.getDate())}-${d.getFullYear()}`, time = `${dd(d.getHours())}:${dd(d.getMinutes())}:${dd(d.getSeconds())}`;
const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, '0');
const param = (i, name, help, type, size, mm = ',,0') => `        Param${i} =\n                0,,,0x0000,${type},${size},\n                "${name}","","${help}",\n                ${mm},\n                ,,,,\n                ,,,,\n                0;`;
const ajuda = (it) => it.pqi ? `PQI da porta X${it.porta}: .7 PQ  .6 DevCom  .5 DevErr` : it.reserva ? 'Reservado (alinhamento)' : `Porta X${it.porta}`;
const params = []; let k = 1;
const refs = (lista) => lista.itens.map((it) => {
  params.push(param(k, it.nome, ajuda(it), it.tam === 2 ? '0xC7' : '0xC6', it.tam));
  return `${it.tam * 8},Param${k++}`;
});
const inRefs = refs(M.IN), outRefs = refs(M.OUT);
const rpiP = k; params.push(param(k, 'RPI', 'Requested Packet Interval (us)', '0xC8', 4, '1000,3200000,20000'));
const eds = `$ EDS do SIMULADOR TBEN-L-SIM (nao e um EDS da Turck) - gerado por tools/gera-eds-eip.js
[File]
        DescText = "Simulador didatico TBEN-L-SIM: remoto IO-Link de 8 portas em EtherNet/IP";
        CreateDate = ${date};
        CreateTime = ${time};
        ModDate = ${date};
        ModTime = ${time};
        Revision = 1.0;

[Device]
        VendCode = ${id.vendor};
        VendName = "TBEN-L-SIM (simulador)";
        ProdType = ${id.deviceType};
        ProdTypeStr = "Communications Adapter";
        ProdCode = ${id.productCode};
        MajRev = ${id.major};
        MinRev = ${id.minor};
        ProdName = "${id.name}";
        Catalog = "TBEN-L-SIM-EIP";

[Device Classification]
        Class1 = EtherNetIP;

[Params]
${params.join('\n')}

[Assembly]
        Object_Name = "Assembly Object";
        Object_Class_Code = 0x04;
        Number_Of_Static_Instances = 2;
        Assem100 =
                "Entradas: portas X0 a X7 + PQI (T->O)",
                "",
                ${M.IN.bytes},
                0x0000,
                ,,
                ${inRefs.join(',\n                ')};
        Assem150 =
                "Saidas: portas X0, X2, X4, X6 e X7 (O->T)",
                "",
                ${M.OUT.bytes},
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
                Param${rpiP},${M.OUT.bytes},Assem150,
                Param${rpiP},${M.IN.bytes},Assem100,
                ,,
                0,,
                "Exclusive Owner (${M.IN.bytes} bytes de entrada, ${M.OUT.bytes} de saida)",
                "",
                "20 04 24 01 2C 96 2C 64";

[Capacity]
        MaxIOConnections = 1;
        MaxMsgConnections = 6;
        TSpec1 = TxRx, ${M.IN.bytes}, 1000;
        TSpec2 = TxRx, ${M.OUT.bytes}, 1000;
`;
const nome = `${hex4(id.vendor)}${hex4(id.deviceType)}${hex4(id.productCode)}${dd(id.major)}00_TBEN-L-SIM_EIP.eds`;
const saida = path.join(__dirname, '..', 'docs', nome);
fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, eds.replace(/\n/g, '\r\n'), 'latin1');
console.log('EDS gerado:', saida);
