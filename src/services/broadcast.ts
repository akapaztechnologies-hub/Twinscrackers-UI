/**
 * The season announcement — one WhatsApp template to every customer on file.
 *
 * Backed by /api/admin/customers/broadcast. The server queues the sends through
 * its outbox, so this call returns as soon as they are accepted rather than
 * waiting for twenty round trips to Meta.
 */
import api from '@/lib/api.ts';

export interface BroadcastRecipient {
  name: string;
  phone: string;
  source: 'customer' | 'user';
}

export interface BroadcastRecipients {
  recipients: BroadcastRecipient[];
  skipped: { noNumber: number; samples: number };
}

export interface BroadcastResult {
  queued: number;
  skipped: { noNumber: number; samples: number };
  attachment: string | null;
}

export interface BroadcastInput {
  templateName?: string;
  templateLanguage?: string;
  shopName: string;
  websiteUrl: string;
  documentBase64?: string;
  documentFilename?: string;
}

export async function getBroadcastRecipients(): Promise<BroadcastRecipients> {
  return api.get('/admin/customers/broadcast/recipients');
}

export async function startBroadcast(input: BroadcastInput): Promise<BroadcastResult> {
  return api.post('/admin/customers/broadcast', input);
}

/** A picked file as base64, without the `data:` prefix the API has no use for. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}
