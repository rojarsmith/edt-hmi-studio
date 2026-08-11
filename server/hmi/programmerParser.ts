export interface HmiSerialPort {
  path: string;
  displayName: string;
  location?: string;
  description?: string;
  manufacturer?: string;
  boardName?: string;
  probeSerial?: string;
}

export interface StLinkProbe {
  index: number;
  serialNumber: string;
  firmwareVersion?: string;
  accessPortNumber?: string;
  boardName?: string;
}

function normalizeOutput(output: string): string {
  return output.replace(/\r\n?/g, '\n');
}

function parseFields(block: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of block.split('\n')) {
    const match = line.match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/);
    if (!match) {
      continue;
    }
    fields.set(match[1].trim().toLowerCase(), match[2].trim());
  }
  return fields;
}

export function parseProgrammerUartList(output: string): HmiSerialPort[] {
  const blocks = normalizeOutput(output).split(/\n\s*\n/);
  const ports: HmiSerialPort[] = [];

  for (const block of blocks) {
    const fields = parseFields(block);
    const path = fields.get('port');
    if (!path || !/^COM\d+$/i.test(path)) {
      continue;
    }

    const description = fields.get('description');
    const boardName = fields.get('board name');
    ports.push({
      path: path.toUpperCase(),
      displayName: description || boardName || path.toUpperCase(),
      ...(fields.get('location') ? { location: fields.get('location') } : {}),
      ...(description ? { description } : {}),
      ...(fields.get('manufacturer') ? { manufacturer: fields.get('manufacturer') } : {}),
      ...(boardName ? { boardName } : {}),
      ...(fields.get('st-link sn') ? { probeSerial: fields.get('st-link sn')?.toUpperCase() } : {}),
    });
  }

  return ports;
}

/**
 * The MCU identity `STM32_Programmer_CLI` prints once it has connected:
 *
 *   Device ID    : 0x481
 *
 * Normalized to lower case with the `0x` kept, which is how a board definition
 * writes it. Returns null when the output carries no such line, which is what a
 * failed connection looks like.
 */
export function parseProgrammerDeviceId(output: string): string | null {
  const match = /^\s*device\s+id\s*:\s*(0x[0-9a-f]+)\s*$/im.exec(
    normalizeOutput(output),
  );
  return match ? match[1].toLowerCase() : null;
}

export function parseProgrammerStLinkList(output: string): StLinkProbe[] {
  const normalized = normalizeOutput(output);
  const probePattern = /ST-Link Probe\s+(\d+)\s*:/gi;
  const matches = [...normalized.matchAll(probePattern)];
  const probes: StLinkProbe[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? normalized.length;
    const fields = parseFields(normalized.slice(start, end));
    const serialNumber = fields.get('st-link sn');
    if (!serialNumber) {
      continue;
    }

    probes.push({
      index: Number(match[1]),
      serialNumber: serialNumber.toUpperCase(),
      ...(fields.get('st-link fw') ? { firmwareVersion: fields.get('st-link fw') } : {}),
      ...(fields.get('access port number') ? { accessPortNumber: fields.get('access port number') } : {}),
      ...(fields.get('board name') ? { boardName: fields.get('board name') } : {}),
    });
  }

  return probes;
}
