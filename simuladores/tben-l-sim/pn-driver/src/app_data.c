/*
 * TBEN-L-SIM - driver PROFINET (p-net) <-> servidor Node.js
 *
 * Substitui o app_data.c do exemplo do p-net. A imagem de processo de cada
 * porta IO-Link fica aqui e e trocada com o Node.js por UDP em 127.0.0.1.
 *
 * Protocolo (inteiros em big-endian):
 *   Node -> driver  'I' : 8 x [len][dados+PQI] + 8 x [u16 erro de canal][u32 valor adicional]
 *                   'R' : [len][resposta IOL_CALL]
 *   driver -> Node  'O' : [conectado] + 8 x [valido][len][dados] + 8 x [tem][10 bytes config]
 *                   'Q' : [len][pedido IOL_CALL]
 *
 * Registros PROFINET tratados aqui:
 *   0x0200 em cada porta (slot 1..8): configuracao da porta, enviada pelo CLP na partida
 *   0xB400 em qualquer submodulo: IOL_CALL (escrever pedido, ler resposta)
 */
#include "app_data.h"
#include "app_gsdml.h"
#include "app_log.h"
#include "sampleapp_common.h"

#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

#define NPORTS        APP_TBEN_NUM_PORTS
#define MAX_PD        16
#define IOL_MAX       64
#define CFG_LEN       APP_TBEN_PORT_CFG_LEN
#define SEND_EVERY_MS 4
#define NODE_TIMEOUT_MS 1000

static const uint8_t in_size[NPORTS] = {3, 5, 2, 3, 5, 5, 3, 1};
static const uint8_t out_size[NPORTS] = {2, 0, 1, 0, 4, 0, 2, 1};

static uint8_t in_img[NPORTS][MAX_PD];
static uint8_t out_img[NPORTS][MAX_PD];
static bool out_valid[NPORTS];
static uint16_t diag_want[NPORTS];
static uint32_t diag_add_want[NPORTS];
static uint16_t diag_now[NPORTS];

static uint8_t port_cfg[NPORTS][CFG_LEN];
static bool port_cfg_set[NPORTS];

static uint8_t iol_resp[IOL_MAX];
static uint16_t iol_resp_len;
static bool iol_busy;

static int sock = -1;
static struct sockaddr_in node_addr;
static uint32_t ms_since_send;
static uint32_t ms_since_rx = NODE_TIMEOUT_MS;

static int port_from_submodule (uint32_t submodule_id)
{
   if (submodule_id < APP_TBEN_SUBMOD_ID_BASE)
      return -1;
   uint32_t p = submodule_id - APP_TBEN_SUBMOD_ID_BASE;
   return p < NPORTS ? (int)p : -1;
}

static uint16_t env_port (const char * name, uint16_t def)
{
   const char * v = getenv (name);
   return v ? (uint16_t)atoi (v) : def;
}

static void ipc_open (void)
{
   struct sockaddr_in me = {0};
   sock = socket (AF_INET, SOCK_DGRAM, 0);
   if (sock < 0)
   {
      APP_LOG_ERROR ("TBEN: falha ao criar socket UDP\n");
      return;
   }
   fcntl (sock, F_SETFL, O_NONBLOCK);
   me.sin_family = AF_INET;
   me.sin_addr.s_addr = htonl (INADDR_LOOPBACK);
   me.sin_port = htons (env_port ("TBEN_IPC_DRIVER_PORT", 50101));
   if (bind (sock, (struct sockaddr *)&me, sizeof (me)) < 0)
   {
      APP_LOG_ERROR ("TBEN: porta UDP do driver ocupada (%d)\n", errno);
      close (sock);
      sock = -1;
      return;
   }
   node_addr.sin_family = AF_INET;
   node_addr.sin_addr.s_addr = htonl (INADDR_LOOPBACK);
   node_addr.sin_port = htons (env_port ("TBEN_IPC_NODE_PORT", 50100));
   APP_LOG_INFO (
      "TBEN: IPC UDP pronto (driver %u, node %u)\n",
      ntohs (me.sin_port),
      ntohs (node_addr.sin_port));
}

static void ipc_send (const uint8_t * buf, size_t len)
{
   if (sock >= 0)
      (void)sendto (sock, buf, len, 0, (struct sockaddr *)&node_addr, sizeof (node_addr));
}

static void ipc_receive (void)
{
   uint8_t buf[512];
   ssize_t n;
   while ((n = recv (sock, buf, sizeof (buf), 0)) > 0)
   {
      if (buf[0] == 'I')
      {
         size_t pos = 1;
         for (int p = 0; p < NPORTS; p++)
         {
            if (pos >= (size_t)n)
               return;
            uint8_t len = buf[pos++];
            if (len != in_size[p] || pos + len > (size_t)n)
               return; /* quadro incoerente com o mapa: descarta */
            memcpy (in_img[p], &buf[pos], len);
            pos += len;
         }
         for (int p = 0; p < NPORTS && pos + 5 < (size_t)n; p++, pos += 6)
         {
            diag_want[p] = (uint16_t)((buf[pos] << 8) | buf[pos + 1]);
            diag_add_want[p] = ((uint32_t)buf[pos + 2] << 24) | ((uint32_t)buf[pos + 3] << 16) |
                               ((uint32_t)buf[pos + 4] << 8) | buf[pos + 5];
         }
         ms_since_rx = 0;
      }
      else if (buf[0] == 'R' && n >= 2)
      {
         uint8_t len = buf[1];
         if (len > IOL_MAX || 2 + len > n)
            continue;
         memcpy (iol_resp, &buf[2], len);
         iol_resp_len = len;
         iol_busy = false;
      }
   }
}

static void ipc_send_outputs (bool connected)
{
   uint8_t buf[2 + NPORTS * (2 + MAX_PD) + NPORTS * (1 + CFG_LEN)];
   size_t pos = 0;
   buf[pos++] = 'O';
   buf[pos++] = connected ? 1 : 0;
   for (int p = 0; p < NPORTS; p++)
   {
      buf[pos++] = (connected && out_valid[p]) ? 1 : 0;
      buf[pos++] = out_size[p];
      memcpy (&buf[pos], out_img[p], out_size[p]);
      pos += out_size[p];
   }
   for (int p = 0; p < NPORTS; p++)
   {
      buf[pos++] = port_cfg_set[p] ? 1 : 0;
      memcpy (&buf[pos], port_cfg[p], CFG_LEN);
      pos += CFG_LEN;
   }
   ipc_send (buf, pos);
}

static void update_diag (pnet_t * net)
{
   for (int p = 0; p < NPORTS; p++)
   {
      if (diag_want[p] == diag_now[p])
         continue;
      pnet_diag_source_t src = {
         .api = APP_GSDML_API,
         .slot = (uint16_t)(p + 1),
         .subslot = 1,
         .ch = PNET_CHANNEL_WHOLE_SUBMODULE,
         .ch_grouping = PNET_DIAG_CH_INDIVIDUAL_CHANNEL,
         .ch_direction = PNET_DIAG_CH_PROP_DIR_INPUT};
      if (diag_now[p] != 0)
         (void)pnet_diag_std_remove (net, &src, diag_now[p], 0);
      if (diag_want[p] != 0)
         (void)pnet_diag_std_add (
            net,
            &src,
            PNET_DIAG_CH_PROP_TYPE_UNSPECIFIED,
            PNET_DIAG_CH_PROP_MAINT_FAULT,
            diag_want[p],
            0,
            diag_add_want[p], /* codigo do evento IO-Link */
            0);
      APP_LOG_INFO (
         "TBEN: diagnostico porta X%d: 0x%04x -> 0x%04x (evento IO-Link 0x%04x)\n",
         p,
         diag_now[p],
         diag_want[p],
         (unsigned)diag_add_want[p]);
      diag_now[p] = diag_want[p];
   }
}

void app_data_tick (pnet_t * net, bool connected)
{
   if (sock < 0)
   {
      ipc_open();
      if (sock < 0)
         return;
   }
   ipc_receive();
   if (ms_since_rx < NODE_TIMEOUT_MS)
      ms_since_rx++;
   else
   {
      /* Node parado: entradas zeradas e PQI invalido em todas as portas */
      memset (in_img, 0, sizeof (in_img));
   }
   update_diag (net);
   if (++ms_since_send >= SEND_EVERY_MS)
   {
      ms_since_send = 0;
      ipc_send_outputs (connected);
   }
}

uint8_t * app_data_get_input_data (
   uint16_t slot_nbr,
   uint16_t subslot_nbr,
   uint32_t submodule_id,
   bool button_state,
   uint16_t * size,
   uint8_t * iops)
{
   int p = port_from_submodule (submodule_id);
   (void)slot_nbr;
   (void)subslot_nbr;
   (void)button_state;
   if (p < 0 || size == NULL || iops == NULL)
      return NULL;
   *size = in_size[p];
   *iops = PNET_IOXS_GOOD;
   return in_img[p];
}

int app_data_set_output_data (
   uint16_t slot_nbr,
   uint16_t subslot_nbr,
   uint32_t submodule_id,
   uint8_t * data,
   uint16_t size)
{
   int p = port_from_submodule (submodule_id);
   (void)slot_nbr;
   (void)subslot_nbr;
   if (p < 0 || data == NULL || size != out_size[p])
      return -1;
   memcpy (out_img[p], data, size);
   out_valid[p] = true;
   return 0;
}

int app_data_set_default_outputs (void)
{
   /* Estado seguro: saidas zeradas e marcadas como invalidas */
   memset (out_img, 0, sizeof (out_img));
   memset (out_valid, 0, sizeof (out_valid));
   return 0;
}

int app_data_write_parameter (
   uint16_t slot_nbr,
   uint16_t subslot_nbr,
   uint32_t submodule_id,
   uint32_t index,
   const uint8_t * data,
   uint16_t length)
{
   int p = port_from_submodule (submodule_id);
   (void)slot_nbr;
   (void)subslot_nbr;
   if (sock < 0)
      ipc_open();

   if (index == APP_TBEN_IOL_CALL_IDX)
   {
      uint8_t buf[2 + IOL_MAX];
      if (length < 8 || length > IOL_MAX)
         return -1;
      buf[0] = 'Q';
      buf[1] = (uint8_t)length;
      memcpy (&buf[2], data, length);
      iol_busy = true;
      iol_resp_len = 0;
      ipc_send (buf, 2 + length);
      return 0;
   }
   if (index == APP_TBEN_PORT_CFG_IDX && p >= 0 && length == CFG_LEN)
   {
      memcpy (port_cfg[p], data, CFG_LEN);
      port_cfg_set[p] = true;
      APP_LOG_INFO ("TBEN: configuracao da porta X%d recebida do CLP\n", p);
      return 0;
   }
   return -1;
}

int app_data_read_parameter (
   uint16_t slot_nbr,
   uint16_t subslot_nbr,
   uint32_t submodule_id,
   uint32_t index,
   uint8_t ** data,
   uint16_t * length)
{
   int p = port_from_submodule (submodule_id);
   (void)slot_nbr;
   (void)subslot_nbr;

   if (index == APP_TBEN_IOL_CALL_IDX)
   {
      /* Resposta ainda nao chegou do Node: o CLP deve repetir a leitura */
      if (iol_busy || iol_resp_len == 0 || *length < iol_resp_len)
         return -1;
      *data = iol_resp;
      *length = iol_resp_len;
      return 0;
   }
   if (index == APP_TBEN_PORT_CFG_IDX && p >= 0 && port_cfg_set[p] && *length >= CFG_LEN)
   {
      *data = port_cfg[p];
      *length = CFG_LEN;
      return 0;
   }
   return -1;
}
