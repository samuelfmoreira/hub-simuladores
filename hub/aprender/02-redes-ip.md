# Redes IP para automação

> O mínimo de rede para entender por que o CLP enxerga (ou não) o equipamento: IP, máscara, porta, TCP e UDP.

## Endereço IP e máscara

Cada placa de rede tem um ou mais endereços IP, quatro números de 0 a 255. A **máscara** diz quantos bits iniciais formam o endereço da rede. Com máscara de 24 bits (255.255.255.0), os três primeiros números precisam ser iguais para dois equipamentos conversarem diretamente.

| Equipamento | IP | Mesma rede que o CLP 192.168.100.10/24? |
|---|---|---|
| CFW500 | 192.168.100.20 | Sim |
| CLP de outra célula | 192.168.1.20 | Não: precisaria de roteador |

:::widget sub-rede

## Porta, TCP e UDP

O IP leva o pacote até o PC; a **porta** leva até o programa certo dentro dele. Cada protocolo industrial tem portas conhecidas:

| Porta | Transporte | Uso |
|---|---|---|
| 502 | TCP | Modbus TCP |
| 44818 | TCP | EtherNet/IP: sessão e mensagens explícitas |
| 44818 | UDP | EtherNet/IP: descoberta (ListIdentity) |
| 2222 | UDP | EtherNet/IP: I/O cíclico |

**TCP** garante entrega e ordem: bom para pedidos e respostas (ler um parâmetro, abrir conexão). **UDP** não espera confirmação: bom para dados cíclicos, em que o pacote atrasado já não interessa porque outro mais novo vem logo atrás.

Duas aplicações não podem escutar a mesma porta no mesmo IP. Esse é o motivo da rede virtual: com um IP para cada simulador, três equipamentos EtherNet/IP usam a porta 44818 ao mesmo tempo no mesmo PC, cada um no seu endereço.

## A placa virtual

O Windows tem uma placa de rede que não precisa de cabo: o **Microsoft KM-TEST Loopback Adapter**. O HUB instala uma, chamada **SIM-HUB**, e coloca nela:

- o IP do CLP (192.168.100.10), que o Windows pode usar como **origem** dos pacotes;
- um IP por simulador, marcado como **SkipAsSource**: o Windows nunca sai por ele. Assim, quando o CODESYS manda um pacote, a origem é sempre o IP do CLP, e não o de uma câmera.

> **Atenção:** no CODESYS, desmarque *Ajustar configurações do sistema operacional* no dispositivo Ethernet. Se ficar marcado, o CODESYS reescreve a placa e apaga os IPs dos simuladores.

## Firewall

O Windows bloqueia conexões de entrada por padrão. O HUB cria um grupo de regras chamado *Simulador HUB* liberando TCP 44818, UDP 44818/2222/2223, TCP 502/5020 e as portas das telas. Se um CLP real em outro PC não alcança o simulador, o firewall é o primeiro suspeito.

## Multicast

No EtherNet/IP, o equipamento pode mandar as entradas (T→O) em **multicast**: um pacote para vários CLPs ao mesmo tempo. Uma placa de loopback não entrega multicast. Na bancada, configure sempre **ponto a ponto** (unicast).

Próxima aula: [Modbus TCP](#/aprender/modbus-tcp).
