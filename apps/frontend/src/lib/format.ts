const BYTE_UNITS = ['B', 'kB', 'MB', 'GB', 'TB'] as const;
// Decimal units, so `MB` means what it says.
const BYTES_PER_UNIT = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const HERTZ_PER_KILOHERTZ = 1000;
const UNKNOWN_VALUE = '–';

const decimalFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
const integerFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

/** A byte count in the largest unit that keeps it at or above 1, e.g. `4.2 MB`. */
export function formatBytes(bytes: number): string {
  let value = Math.max(bytes, 0);
  let unitIndex = 0;
  while (value >= BYTES_PER_UNIT && unitIndex < BYTE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unitIndex += 1;
  }
  const format = unitIndex === 0 ? integerFormat : decimalFormat;
  return `${format.format(value)} ${BYTE_UNITS[unitIndex]}`;
}

/** An upload speed in bytes per second, e.g. `1.5 MB/s`. */
export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

/** A duration as `m:ss`, or `h:mm:ss` from one hour; `–` when unknown. */
export function formatDuration(totalSeconds: number | undefined): string {
  if (totalSeconds === undefined) {
    return UNKNOWN_VALUE;
  }
  const roundedSeconds = Math.max(Math.round(totalSeconds), 0);
  const hours = Math.floor(roundedSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((roundedSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = String(roundedSeconds % SECONDS_PER_MINUTE).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

export interface AudioQuality {
  bitRate?: number;
  bitDepth?: number;
  sampleRate?: number;
  isVariableBitRate?: boolean;
}

/** The known quality facts, e.g. `16 bit · 44.1 kHz · 1,411 kbps`; `–` when none are known. */
export function formatAudioQuality(quality: AudioQuality): string {
  const parts: string[] = [];
  if (quality.bitDepth !== undefined) {
    parts.push(`${quality.bitDepth} bit`);
  }
  if (quality.sampleRate !== undefined) {
    parts.push(`${decimalFormat.format(quality.sampleRate / HERTZ_PER_KILOHERTZ)} kHz`);
  }
  if (quality.bitRate !== undefined) {
    const variableSuffix = quality.isVariableBitRate === true ? ' VBR' : '';
    parts.push(`${integerFormat.format(quality.bitRate)} kbps${variableSuffix}`);
  }
  return parts.length > 0 ? parts.join(' · ') : UNKNOWN_VALUE;
}
