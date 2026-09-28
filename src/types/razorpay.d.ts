import type { RazorpayOptions, RazorpayInstance } from './index.ts';

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

export {};
