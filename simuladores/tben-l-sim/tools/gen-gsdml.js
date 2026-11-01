'use strict';
/**
 * Gera o GSDML do TBEN-L-SIM a partir de src/core/portmap.js.
 * O DAP (slot 0) é o mesmo do app de exemplo do p-net v0.2.0, porque o driver
 * usa a pilha e o DAP dele. Cada porta IO-Link vira um módulo fixo no slot n+1.
 *
 * Uso: npm run gsdml   ->   gsdml/GSDML-V2.4-Simulab-TBEN-L-SIM-AAAAMMDD.xml
 */
const fs = require('fs');
const path = require('path');
const { PORTS, DEV, MODULE_ID_BASE, SUBMODULE_ID_BASE, MODELS, IOL_VENDOR_ID, PORT_CFG_INDEX, VDS_TXT } = require('../src/core/portmap');
const VALUE_LISTS = !process.env.GSDML_SEM_LISTAS;  // GSDML_SEM_LISTAS=1 gera sem listas de valores

const VENDOR_ID = '0x0493';  // RT-Labs (dono da pilha p-net). Só para laboratório.
const DEVICE_ID = '0x7B01';  // precisa bater com APP_GSDML_DEVICE_ID em pn-driver/src/app_gsdml.h
const STATION = 'tben-l-sim';
const DATE = process.env.GSDML_DATE || new Date().toISOString().slice(0, 10).replace(/-/g, '');

const texts = [];
const T = (id, value) => { texts.push([id, value]); return id; };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hex8 = v => '0x' + v.toString(16).toUpperCase().padStart(8, '0');

/** Converte a lista de campos de um sentido em DataItems byte a byte */
function dataItems(fields, len, prefix) {
  const out = [];
  for (let b = 0; b < len;) {
    const word = fields.find(f => f.t === 'u16' && f.b === b);
    const byte = fields.find(f => f.t === 'u8' && f.b === b);
    const bits = fields.filter(f => f.t === 'bit' && f.b === b);
    if (word) { out.push(`<DataItem DataType="Unsigned16" TextId="${T(`${prefix}_B${b}`, word.l)}"/>`); b += 2; continue; }
    if (byte) { out.push(`<DataItem DataType="Unsigned8" TextId="${T(`${prefix}_B${b}`, byte.l)}"/>`); b += 1; continue; }
    if (bits.length) {
      const inner = bits.map(f => `<BitDataItem BitOffset="${f.i}" TextId="${T(`${prefix}_B${b}_${f.i}`, f.l)}"/>`).join('\n                              ');
      out.push(`<DataItem DataType="Unsigned8" TextId="${T(`${prefix}_B${b}`, `Byte ${b}`)}" UseAsBits="true">\n                              ${inner}\n                           </DataItem>`);
    } else out.push(`<DataItem DataType="Unsigned8" TextId="${T(`${prefix}_B${b}`, 'Reservado')}"/>`);
    b += 1;
  }
  return out;
}

const PQI_BITS = [[5, 'DevErr: device com erro ou aviso'], [6, 'DevCom: device comunicando'], [7, 'PQ: dados de processo válidos']];

function moduleItem(p) {
  const d = DEV[p.dev];
  const pre = `X${p.n}`;
  const name = T(`${pre}_NAME`, `X${p.n} ${p.tag} ${p.name}`);
  const info = T(`${pre}_INFO`, `Porta IO-Link X${p.n}: ${d.product}. Entrada com ${p.inLen} byte(s) de dados + PQI, saída com ${p.outLen} byte(s).`);
  const inItems = dataItems(d.in, p.inLen, `${pre}_IN`);
  inItems.push(`<DataItem DataType="Unsigned8" TextId="${T(`${pre}_PQI`, 'PQI (Port Qualifier Information)')}" UseAsBits="true">\n                              ${PQI_BITS.map(([o, l]) => `<BitDataItem BitOffset="${o}" TextId="${T(`${pre}_PQI_${o}`, l)}"/>`).join('\n                              ')}\n                           </DataItem>`);
  const outItems = p.outLen ? dataItems(d.out, p.outLen, `${pre}_OUT`) : [];
  const io = [
    `<Input Consistency="All items consistency">\n                           ${inItems.join('\n                           ')}\n                        </Input>`,
    outItems.length ? `<Output Consistency="All items consistency">\n                           ${outItems.join('\n                           ')}\n                        </Output>` : ''
  ].filter(Boolean).join('\n                        ');
  const did = MODELS[p.dev][0].did;
  const vt = id => VALUE_LISTS ? ` ValueItemTarget="${id}"` : '';
  const rec = `<RecordDataList>
                        <ParameterRecordDataItem Index="${PORT_CFG_INDEX}" Length="10">
                           <Name TextId="T_PCFG"/>
                           <Ref DataType="Unsigned8" ByteOffset="0" DefaultValue="1" AllowedValues="0..1" Changeable="true" Visible="true" TextId="T_PCFG_MODE"${vt('VI_MODE')}/>
                           <Ref DataType="Unsigned8" ByteOffset="1" DefaultValue="2" AllowedValues="0..3" Changeable="true" Visible="true" TextId="T_PCFG_VDS"${vt('VI_VDS')}/>
                           <Ref DataType="Unsigned8" ByteOffset="2" DefaultValue="0" AllowedValues="0..100" Changeable="true" Visible="true" TextId="T_PCFG_CYC"/>
                           <Ref DataType="Unsigned8" ByteOffset="3" DefaultValue="0" Changeable="false" Visible="false" TextId="T_PCFG_RES"/>
                           <Ref DataType="Unsigned16" ByteOffset="4" DefaultValue="${IOL_VENDOR_ID}" AllowedValues="0..65535" Changeable="true" Visible="true" TextId="T_PCFG_VID"/>
                           <Ref DataType="Unsigned32" ByteOffset="6" DefaultValue="${did}" AllowedValues="0..16777215" Changeable="true" Visible="true" TextId="T_PCFG_DID"/>
                        </ParameterRecordDataItem>
                     </RecordDataList>`;
  return `            <ModuleItem ID="IDM_${pre}" ModuleIdentNumber="${hex8(MODULE_ID_BASE + p.n)}">
               <ModuleInfo>
                  <Name TextId="${name}"/>
                  <InfoText TextId="${info}"/>
                  <HardwareRelease Value="1.0"/>
                  <SoftwareRelease Value="1.0"/>
               </ModuleInfo>
               <VirtualSubmoduleList>
                  <VirtualSubmoduleItem ID="IDSM_${pre}" SubmoduleIdentNumber="${hex8(SUBMODULE_ID_BASE + p.n)}" MayIssueProcessAlarm="false">
                     <IOData>
                        ${io}
                     </IOData>
                     ${rec}
                     <ModuleInfo>
                        <Name TextId="${name}"/>
                        <InfoText TextId="${info}"/>
                     </ModuleInfo>
                  </VirtualSubmoduleItem>
               </VirtualSubmoduleList>
            </ModuleItem>`;
}

const modules = PORTS.map(moduleItem).join('\n');
const useable = PORTS.map(p => `                  <ModuleItemRef ModuleItemTarget="IDM_X${p.n}" AllowedInSlots="${p.n + 1}" FixedInSlots="${p.n + 1}"/>`).join('\n');
T('T_PCFG', 'Configuração da porta IO-Link');
T('T_PCFG_MODE', 'Modo da porta (0 desativada, 1 IO-Link)');
T('T_PCFG_VDS', 'Validação e Data Storage (0 sem verificação, 1 tipo compatível, 2 compatível com Backup + Restore, 3 compatível com Restore)');
T('T_PCFG_CYC', 'Tempo de ciclo em ms (0 = mínimo do device)');
T('T_PCFG_RES', 'Reservado');
T('T_PCFG_VID', 'Vendor ID esperado (decimal; 1952 = 0x07A0)');
T('T_PCFG_DID', 'Device ID esperado (decimal)');
T('T_MODE_0', 'Desativada'); T('T_MODE_1', 'IO-Link');
VDS_TXT.forEach((t, i) => T(`T_VDS_${i}`, t));
const valueList = VALUE_LISTS ? `         <ValueList>
            <ValueItem ID="VI_MODE">
               <Assignments>
                  <Assign Content="0" TextId="T_MODE_0"/>
                  <Assign Content="1" TextId="T_MODE_1"/>
               </Assignments>
            </ValueItem>
            <ValueItem ID="VI_VDS">
               <Assignments>
${VDS_TXT.map((t, i) => `                  <Assign Content="${i}" TextId="T_VDS_${i}"/>`).join('\n')}
               </Assignments>
            </ValueItem>
         </ValueList>
` : '';
T('IDT_INFO_Device', 'Simulador de remoto IO-Link 8 portas (laboratório) baseado na pilha p-net');
T('IDT_MODULE_NAME_DAP1', 'TBEN-L-SIM 8IOL');
T('IDT_INFO_DAP1', 'Remoto IO-Link virtual com 8 portas para treinamento. Não é um produto Turck.');
T('IDT_NAME_IS', 'X1');
T('IDT_NAME_PS1', 'X1 P1');

const xml = `<?xml version="1.0" encoding="iso-8859-1"?>
<ISO15745Profile xmlns="http://www.profibus.com/GSDML/2003/11/DeviceProfile" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.profibus.com/GSDML/2003/11/DeviceProfile ..\\xsd\\GSDML-DeviceProfile-V2.4.xsd">
   <!-- Gerado por tools/gen-gsdml.js a partir de src/core/portmap.js. Não edite à mão. -->
   <ProfileHeader>
      <ProfileIdentification>PROFINET Device Profile</ProfileIdentification>
      <ProfileRevision>1.00</ProfileRevision>
      <ProfileName>Device Profile for PROFINET Devices</ProfileName>
      <ProfileSource>PROFIBUS Nutzerorganisation e. V. (PNO)</ProfileSource>
      <ProfileClassID>Device</ProfileClassID>
      <ISO15745Reference>
         <ISO15745Part>4</ISO15745Part>
         <ISO15745Edition>1</ISO15745Edition>
         <ProfileTechnology>GSDML</ProfileTechnology>
      </ISO15745Reference>
   </ProfileHeader>
   <ProfileBody>
      <DeviceIdentity VendorID="${VENDOR_ID}" DeviceID="${DEVICE_ID}">
         <InfoText TextId="IDT_INFO_Device"/>
         <VendorName Value="Simulab (p-net)"/>
      </DeviceIdentity>
      <DeviceFunction>
         <Family MainFamily="I/O" ProductFamily="Simulab TBEN-L-SIM"/>
      </DeviceFunction>
      <ApplicationProcess>
         <DeviceAccessPointList>
            <DeviceAccessPointItem ID="IDD_1" PNIO_Version="V2.4" PhysicalSlots="0..8" ModuleIdentNumber="0x00000001" MinDeviceInterval="32" DNS_CompatibleName="${STATION}" FixedInSlots="0" ObjectUUID_LocalIndex="1" DeviceAccessSupported="false" MultipleWriteSupported="true" CheckDeviceID_Allowed="true" NameOfStationNotTransferable="false" LLDP_NoD_Supported="true" ResetToFactoryModes="1..2">
               <ModuleInfo>
                  <Name TextId="IDT_MODULE_NAME_DAP1"/>
                  <InfoText TextId="IDT_INFO_DAP1"/>
                  <VendorName Value="Simulab (p-net)"/>
                  <OrderNumber Value="TBEN-L-SIM-8IOL"/>
                  <HardwareRelease Value="A1.0"/>
                  <SoftwareRelease Value="V0.1.0"/>
               </ModuleInfo>
               <CertificationInfo ConformanceClass="B" ApplicationClass="" NetloadClass="I"/>
               <IOConfigData MaxInputLength="244" MaxOutputLength="244"/>
               <UseableModules>
${useable}
               </UseableModules>
               <VirtualSubmoduleList>
                  <VirtualSubmoduleItem ID="IDS_1" SubmoduleIdentNumber="0x00000001" Writeable_IM_Records="1 2 3" MayIssueProcessAlarm="false">
                     <IOData/>
                     <ModuleInfo>
                        <Name TextId="IDT_MODULE_NAME_DAP1"/>
                        <InfoText TextId="IDT_INFO_DAP1"/>
                     </ModuleInfo>
                  </VirtualSubmoduleItem>
               </VirtualSubmoduleList>
               <SystemDefinedSubmoduleList>
                  <InterfaceSubmoduleItem ID="IDS_I" SubmoduleIdentNumber="0x00008000" SubslotNumber="32768" TextId="IDT_NAME_IS" SupportedRT_Classes="RT_CLASS_1" SupportedProtocols="SNMP;LLDP" NetworkComponentDiagnosisSupported="false" PTP_BoundarySupported="true" DCP_BoundarySupported="true">
                     <ApplicationRelations StartupMode="Advanced">
                        <TimingProperties SendClock="32" ReductionRatio="1 2 4 8 16 32 64 128 256 512"/>
                     </ApplicationRelations>
                  </InterfaceSubmoduleItem>
                  <PortSubmoduleItem ID="IDS_P1" SubmoduleIdentNumber="0x00008001" SubslotNumber="32769" TextId="IDT_NAME_PS1" MaxPortRxDelay="350" MaxPortTxDelay="160">
                     <MAUTypeList>
                        <MAUTypeItem Value="30"/>
                        <MAUTypeItem Value="16"/>
                        <MAUTypeItem Value="5"/>
                     </MAUTypeList>
                  </PortSubmoduleItem>
               </SystemDefinedSubmoduleList>
            </DeviceAccessPointItem>
         </DeviceAccessPointList>
         <ModuleList>
${modules}
         </ModuleList>
${valueList}         <ExternalTextList>
            <PrimaryLanguage>
${texts.map(([id, v]) => `               <Text TextId="${id}" Value="${esc(v)}"/>`).join('\n')}
            </PrimaryLanguage>
         </ExternalTextList>
      </ApplicationProcess>
   </ProfileBody>
</ISO15745Profile>
`;

const dir = path.resolve(__dirname, '../gsdml');
fs.mkdirSync(dir, { recursive: true });
for (const f of fs.readdirSync(dir)) if (f.startsWith('GSDML-V2.4-Simulab-TBEN-L-SIM-')) fs.unlinkSync(path.join(dir, f));
const file = path.join(dir, `GSDML-V2.4-Simulab-TBEN-L-SIM-${DATE}.xml`);
fs.writeFileSync(file, Buffer.from(xml, 'latin1'));
console.log('GSDML gerado:', path.relative(process.cwd(), file));
