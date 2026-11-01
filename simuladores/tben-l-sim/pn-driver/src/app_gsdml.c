/*********************************************************************
 *        _       _         _
 *  _ __ | |_  _ | |  __ _ | |__   ___
 * | '__|| __|(_)| | / _` || '_ \ / __|
 * | |   | |_  _ | || (_| || |_) |\__ \
 * |_|    \__|(_)|_| \__,_||_.__/ |___/
 *
 * www.rt-labs.com
 * Copyright 2021 rt-labs AB, Sweden.
 *
 * This software is dual-licensed under GPLv3 and a commercial
 * license. See the file LICENSE.md distributed with this software for
 * full license information.
 ********************************************************************/

#include "sampleapp_common.h"
#include "app_utils.h"
#include "app_gsdml.h"
#include "app_log.h"
#include "osal.h"
#include "pnal.h"
#include <pnet_api.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/******************* Supported modules ***************************/

static const app_gsdml_module_t dap_1 = {
   .id = PNET_MOD_DAP_IDENT,
   .name = "DAP 1",
   .submodules = {
      PNET_SUBMOD_DAP_IDENT,
      PNET_SUBMOD_DAP_INTERFACE_1_PORT_1_IDENT,
      PNET_SUBMOD_DAP_INTERFACE_1_PORT_2_IDENT,
      PNET_SUBMOD_DAP_INTERFACE_1_PORT_3_IDENT,
      PNET_SUBMOD_DAP_INTERFACE_1_PORT_4_IDENT,
      0}};

static const app_gsdml_module_t module_port_0 = {
   .id = APP_TBEN_MOD_ID_BASE + 0,
   .name = "X0 C1 Controlador MDR",
   .submodules = {APP_TBEN_SUBMOD_ID_BASE + 0, 0}};

static const app_gsdml_module_t module_port_1 = {
   .id = APP_TBEN_MOD_ID_BASE + 1,
   .name = "X1 B1 Laser altura caixa",
   .submodules = {APP_TBEN_SUBMOD_ID_BASE + 1, 0}};

static const app_gsdml_module_t module_port_2 = {
   .id = APP_TBEN_MOD_ID_BASE + 2,
   .name = "X2 Y1 Terminal valvulas",
   .submodules = {APP_TBEN_SUBMOD_ID_BASE + 2, 0}};

static const app_gsdml_module_t module_port_3 = {
   .id = APP_TBEN_MOD_ID_BASE + 3,
   .name = "X3 K1 Hub DI16",
   .submodules = {APP_TBEN_SUBMOD_ID_BASE + 3, 0}};

static const app_gsdml_module_t module_port_4 = {
   .id = APP_TBEN_MOD_ID_BASE + 4,
   .name = "X4 M1 Inversor elevador",
   .submodules = {APP_TBEN_SUBMOD_ID_BASE + 4, 0}};

static const app_gsdml_module_t module_port_5 = {
   .id = APP_TBEN_MOD_ID_BASE + 5,
   .name = "X5 B2 Laser posicao elevador",
   .submodules = {APP_TBEN_SUBMOD_ID_BASE + 5, 0}};

static const app_gsdml_module_t module_port_6 = {
   .id = APP_TBEN_MOD_ID_BASE + 6,
   .name = "X6 C2 Controlador MDR",
   .submodules = {APP_TBEN_SUBMOD_ID_BASE + 6, 0}};

static const app_gsdml_module_t module_port_7 = {
   .id = APP_TBEN_MOD_ID_BASE + 7,
   .name = "X7 H1 Torre sinaleira",
   .submodules = {APP_TBEN_SUBMOD_ID_BASE + 7, 0}};

static const app_gsdml_submodule_t dap_indentity_1 = {
   .name = "DAP Identity 1",
   .api = APP_GSDML_API,
   .id = PNET_SUBMOD_DAP_IDENT,
   .data_dir = PNET_DIR_NO_IO,
   .insize = 0,
   .outsize = 0,
   .parameters = {0}};

static const app_gsdml_submodule_t dap_interface_1 = {
   .name = "DAP Interface 1",
   .api = APP_GSDML_API,
   .id = PNET_SUBMOD_DAP_INTERFACE_1_IDENT,
   .data_dir = PNET_DIR_NO_IO,
   .insize = 0,
   .outsize = 0,
   .parameters = {0}};

static const app_gsdml_submodule_t dap_port_1 = {
   .name = "DAP Port 1",
   .api = APP_GSDML_API,
   .id = PNET_SUBMOD_DAP_INTERFACE_1_PORT_1_IDENT,
   .data_dir = PNET_DIR_NO_IO,
   .insize = 0,
   .outsize = 0,
   .parameters = {0}};

static const app_gsdml_submodule_t dap_port_2 = {
   .name = "DAP Port 2",
   .api = APP_GSDML_API,
   .id = PNET_SUBMOD_DAP_INTERFACE_1_PORT_2_IDENT,
   .data_dir = PNET_DIR_NO_IO,
   .insize = 0,
   .outsize = 0,
   .parameters = {0}};

static const app_gsdml_submodule_t dap_port_3 = {
   .name = "DAP Port 3",
   .api = APP_GSDML_API,
   .id = PNET_SUBMOD_DAP_INTERFACE_1_PORT_3_IDENT,
   .data_dir = PNET_DIR_NO_IO,
   .insize = 0,
   .outsize = 0,
   .parameters = {0}};

static const app_gsdml_submodule_t dap_port_4 = {
   .name = "DAP Port 4",
   .api = APP_GSDML_API,
   .id = PNET_SUBMOD_DAP_INTERFACE_1_PORT_4_IDENT,
   .data_dir = PNET_DIR_NO_IO,
   .insize = 0,
   .outsize = 0,
   .parameters = {0}};

static const app_gsdml_submodule_t submod_port_0 = {
   .id = APP_TBEN_SUBMOD_ID_BASE + 0,
   .name = "X0 C1 Controlador MDR",
   .api = APP_GSDML_API,
   .data_dir = PNET_DIR_IO,
   .insize = 3, /* dados de processo + 1 byte PQI */
   .outsize = 2,
   .parameters = {0}};

static const app_gsdml_submodule_t submod_port_1 = {
   .id = APP_TBEN_SUBMOD_ID_BASE + 1,
   .name = "X1 B1 Laser altura caixa",
   .api = APP_GSDML_API,
   .data_dir = PNET_DIR_INPUT,
   .insize = 5, /* dados de processo + 1 byte PQI */
   .outsize = 0,
   .parameters = {0}};

static const app_gsdml_submodule_t submod_port_2 = {
   .id = APP_TBEN_SUBMOD_ID_BASE + 2,
   .name = "X2 Y1 Terminal valvulas",
   .api = APP_GSDML_API,
   .data_dir = PNET_DIR_IO,
   .insize = 2, /* dados de processo + 1 byte PQI */
   .outsize = 1,
   .parameters = {0}};

static const app_gsdml_submodule_t submod_port_3 = {
   .id = APP_TBEN_SUBMOD_ID_BASE + 3,
   .name = "X3 K1 Hub DI16",
   .api = APP_GSDML_API,
   .data_dir = PNET_DIR_INPUT,
   .insize = 3, /* dados de processo + 1 byte PQI */
   .outsize = 0,
   .parameters = {0}};

static const app_gsdml_submodule_t submod_port_4 = {
   .id = APP_TBEN_SUBMOD_ID_BASE + 4,
   .name = "X4 M1 Inversor elevador",
   .api = APP_GSDML_API,
   .data_dir = PNET_DIR_IO,
   .insize = 5, /* dados de processo + 1 byte PQI */
   .outsize = 4,
   .parameters = {0}};

static const app_gsdml_submodule_t submod_port_5 = {
   .id = APP_TBEN_SUBMOD_ID_BASE + 5,
   .name = "X5 B2 Laser posicao elevador",
   .api = APP_GSDML_API,
   .data_dir = PNET_DIR_INPUT,
   .insize = 5, /* dados de processo + 1 byte PQI */
   .outsize = 0,
   .parameters = {0}};

static const app_gsdml_submodule_t submod_port_6 = {
   .id = APP_TBEN_SUBMOD_ID_BASE + 6,
   .name = "X6 C2 Controlador MDR",
   .api = APP_GSDML_API,
   .data_dir = PNET_DIR_IO,
   .insize = 3, /* dados de processo + 1 byte PQI */
   .outsize = 2,
   .parameters = {0}};

static const app_gsdml_submodule_t submod_port_7 = {
   .id = APP_TBEN_SUBMOD_ID_BASE + 7,
   .name = "X7 H1 Torre sinaleira",
   .api = APP_GSDML_API,
   .data_dir = PNET_DIR_IO,
   .insize = 1, /* dados de processo + 1 byte PQI */
   .outsize = 1,
   .parameters = {0}};

/** Modulos suportados: DAP + uma porta IO-Link por slot */
static const app_gsdml_module_t * app_gsdml_modules[] = {
   &dap_1,
   &module_port_0,
   &module_port_1,
   &module_port_2,
   &module_port_3,
   &module_port_4,
   &module_port_5,
   &module_port_6,
   &module_port_7,
};

/** Submodulos suportados */
static const app_gsdml_submodule_t * app_gsdml_submodules[] = {
   &dap_indentity_1,
   &dap_interface_1,
   &dap_port_1,
   &dap_port_2,
   &dap_port_3,
   &dap_port_4,
   &submod_port_0,
   &submod_port_1,
   &submod_port_2,
   &submod_port_3,
   &submod_port_4,
   &submod_port_5,
   &submod_port_6,
   &submod_port_7,
};

/* List of supported parameters.
 * Note that parameters are submodule attributes.
 * This list contain all parameters while each
 * submodule list its supported parameters using
 * their indexes.
 */
static app_gsdml_param_t app_gsdml_parameters[] = {
   {
      .index = APP_GSDML_PARAMETER_1_IDX,
      .name = "Demo 1",
      .length = APP_GSDML_PARAMETER_LENGTH,
   },
   {
      .index = APP_GSDML_PARAMETER_2_IDX,
      .name = "Demo 2",
      .length = APP_GSDML_PARAMETER_LENGTH,
   },
   {
      .index = APP_GSDML_PARAMETER_ECHO_IDX,
      .name = "Echo gain setting",
      .length = APP_GSDML_PARAMETER_LENGTH,
   }};

const app_gsdml_module_t * app_gsdml_get_module_cfg (uint32_t id)
{
   uint32_t i;
   for (i = 0; i < NELEMENTS (app_gsdml_modules); i++)
   {
      if (app_gsdml_modules[i]->id == id)
      {
         return app_gsdml_modules[i];
      }
   }
   return NULL;
}

const app_gsdml_submodule_t * app_gsdml_get_submodule_cfg (uint32_t id)
{
   uint32_t i;
   for (i = 0; i < NELEMENTS (app_gsdml_submodules); i++)
   {
      if (app_gsdml_submodules[i]->id == id)
      {
         return app_gsdml_submodules[i];
      }
   }
   return NULL;
}

const app_gsdml_param_t * app_gsdml_get_parameter_cfg (
   uint32_t submodule_id,
   uint32_t index)
{
   uint16_t i;
   uint16_t j;

   const app_gsdml_submodule_t * submodule_cfg =
      app_gsdml_get_submodule_cfg (submodule_id);

   if (submodule_cfg == NULL)
   {
      /* Unsupported submodule id */
      return NULL;
   }

   /* Search for parameter index in submodule configuration */
   for (i = 0; submodule_cfg->parameters[i] != 0; i++)
   {
      if (submodule_cfg->parameters[i] == index)
      {
         /* Find parameter configuration */
         for (j = 0; j < NELEMENTS (app_gsdml_parameters); j++)
         {
            if (app_gsdml_parameters[j].index == index)
            {
               return &app_gsdml_parameters[j];
            }
         }
      }
   }

   return NULL;
}
