import { useState, useCallback } from 'react';
import type { RazorpayOptions } from '@/types/index.ts';

const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

/**
 * The SDK load in flight, shared by every caller.
 *
 * Cleared when a load fails, and the failed <script> removed with it: waiting
 * on an element whose `error` event has already fired never settles, which left
 * the Pay button spinning for good after one dropped connection. A retry now
 * starts a fresh load.
 */
let sdkLoad: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (sdkLoad) return sdkLoad;

  sdkLoad = new Promise<void>((resolve, reject) => {
    document.querySelectorAll(`script[src="${RAZORPAY_SCRIPT_URL}"]`).forEach((el) => el.remove());

    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.Razorpay) resolve();
      else reject(new Error('Failed to load Razorpay SDK'));
    };
    script.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
    document.body.appendChild(script);
  }).catch((err: unknown) => {
    sdkLoad = null;
    document.querySelectorAll(`script[src="${RAZORPAY_SCRIPT_URL}"]`).forEach((el) => el.remove());
    throw err;
  });

  return sdkLoad;
}

export function useRazorpay() {
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPayment = useCallback(async (options: RazorpayOptions) => {
    setError(null);
    setIsLoading(true);

    try {
      await loadRazorpayScript();
      setIsLoading(false);
      setIsProcessing(true);

      const wrappedOptions: RazorpayOptions = {
        ...options,
        handler: (response) => {
          setIsProcessing(false);
          options.handler(response);
        },
        modal: {
          ...options.modal,
          ondismiss: () => {
            setIsProcessing(false);
            options.modal?.ondismiss?.();
          },
        },
      };

      const rzp = new window.Razorpay(wrappedOptions);
      rzp.on('payment.failed', () => {
        setIsProcessing(false);
        setError('Payment failed. Please try again.');
      });
      rzp.open();
    } catch (err) {
      setIsLoading(false);
      setIsProcessing(false);
      setError(
        err instanceof Error ? err.message : 'Failed to initialize payment',
      );
    }
  }, []);

  return { isLoading, isProcessing, error, openPayment };
}
