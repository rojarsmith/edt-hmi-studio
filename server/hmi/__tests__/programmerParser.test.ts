// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  parseProgrammerStLinkList,
  parseProgrammerUartList,
} from '../programmerParser';

const UART_LIST_OUTPUT = `
      -------------------------------------------------------------------
                       STM32CubeProgrammer v2.23.0
      -------------------------------------------------------------------

=====  UART Interface  =====

Total number of serial ports available: 2

Port: COM1
Location: \\\\.\\COM1
Description: Communications Port
Manufacturer: (Standard port types)

Board Name  : 32F746GDISCOVERY
ST-LINK SN: 066EFF535651727067065821
Port: COM5
Location: \\\\.\\COM5
Description: STM32 STLink
Manufacturer: STMicroelectronics
`;

const STLINK_LIST_OUTPUT = `
===== STLink Interface =====

-------- Connected ST-LINK Probes List --------

ST-Link Probe 0 :
   ST-LINK SN  : 066EFF535651727067065821
   ST-LINK FW  : V2J48M35
   Access Port Number  : -
   Board Name  : 32F746GDISCOVERY
-----------------------------------------------

ST-Link Probe 1 :
   ST-LINK SN  : AABBCCDDEEFF001122334455
   ST-LINK FW  : V3J16M7
   Access Port Number  : 0
   Board Name  : NUCLEO-H743ZI
-----------------------------------------------
`;

describe('parseProgrammerUartList', () => {
  it('parses generic and ST-LINK virtual COM ports', () => {
    expect(parseProgrammerUartList(UART_LIST_OUTPUT)).toEqual([
      {
        path: 'COM1',
        displayName: 'Communications Port',
        location: '\\\\.\\COM1',
        description: 'Communications Port',
        manufacturer: '(Standard port types)',
      },
      {
        path: 'COM5',
        displayName: 'STM32 STLink',
        location: '\\\\.\\COM5',
        description: 'STM32 STLink',
        manufacturer: 'STMicroelectronics',
        boardName: '32F746GDISCOVERY',
        probeSerial: '066EFF535651727067065821',
      },
    ]);
  });

  it('ignores text that does not describe a COM port', () => {
    expect(parseProgrammerUartList('Total number of serial ports available: 0')).toEqual([]);
  });
});

describe('parseProgrammerStLinkList', () => {
  it('parses every connected probe and its board association', () => {
    expect(parseProgrammerStLinkList(STLINK_LIST_OUTPUT)).toEqual([
      {
        index: 0,
        serialNumber: '066EFF535651727067065821',
        firmwareVersion: 'V2J48M35',
        accessPortNumber: '-',
        boardName: '32F746GDISCOVERY',
      },
      {
        index: 1,
        serialNumber: 'AABBCCDDEEFF001122334455',
        firmwareVersion: 'V3J16M7',
        accessPortNumber: '0',
        boardName: 'NUCLEO-H743ZI',
      },
    ]);
  });

  it('returns an empty list when no probes are connected', () => {
    expect(parseProgrammerStLinkList('No ST-LINK detected')).toEqual([]);
  });
});
