const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let loading = null;

// Loaded on demand rather than in index.html: nobody who never opens an order
// should be paying for a third party script on first render.
export function loadRazorpayCheckout() {
  if (window.Razorpay) {
    return Promise.resolve(window.Razorpay);
  }

  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.onload = () => resolve(window.Razorpay);
      script.onerror = () => {
        loading = null;
        reject(new Error('Razorpay checkout could not be loaded'));
      };
      document.head.appendChild(script);
    });
  }

  return loading;
}
