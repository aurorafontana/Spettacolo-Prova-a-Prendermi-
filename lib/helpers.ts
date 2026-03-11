import crypto from 'crypto';

export function generateCode(prefix: string) {
  return `${prefix}_${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

export function makeQrPayload(ticketCode: string, orderCode: string) {
  return JSON.stringify({ ticketCode, orderCode });
}
