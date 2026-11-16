# Tanque com bomba e inversor — simulador do canal analógico (Modbus TCP / OPC UA / OPC DA)

1. `INSTALAR.bat` — instala o Node.js se faltar, baixa as dependências e cria o atalho.
2. `INICIAR_SIMULADOR.bat` — abre o simulador em http://127.0.0.1:3050.
3. Na tela, *Conectar ao CLP* → Modbus TCP → IP do CLP → Conectar. Sem CLP: *Ligar CLP de demonstração*.
4. MasterTool em modo Simulação (sem CLP físico): rode `INSTALAR_OPCDA.bat` uma vez e use o modo *OPC DA* na tela de conexão (veja o guia).

Guia completo: `GUIA.md` (ou o botão *Guia passo a passo* na tela). Arquivos do MasterTool em `mastertool/`.
No HUB de simuladores: importe o .zip em *Adicionar e atualizar*.

`TESTAR.bat` roda os 33 testes automáticos e deve terminar com "0 falha(s)".
