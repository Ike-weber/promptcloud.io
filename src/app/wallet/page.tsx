"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const TOP_UP_AMOUNTS = [100, 250, 500, 1000, 2000, 5000];

const CRYPTO_WALLETS = [
  {
    id: "usdt_trc20",
    label: "USDT (TRC20)",
    emoji: "💵",
    address: process.env.NEXT_PUBLIC_WALLET_USDT_TRC20 || "",
    network: "Tron (TRC20)",
    note: "Send only USDT on TRC20. Other networks = lost funds.",
  },
  {
    id: "btc",
    label: "Bitcoin (BTC)",
    emoji: "₿",
    address: process.env.NEXT_PUBLIC_WALLET_BTC || "",
    network: "Bitcoin Mainnet",
    note: "Minimum 1 confirmation required.",
  },
];

interface User {
  id: string;
  email: string;
  wallet_balance: number;
  name?: string;
}

export default function WalletPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAmount, setSelectedAmount] = useState<number>(500);
  const [customAmount, setCustomAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"razorpay" | "crypto" | "coinbase">("razorpay");
  const [selectedCrypto, setSelectedCrypto] = useState(CRYPTO_WALLETS[0]);
  const [processing, setProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [txHistory, setTxHistory] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [coinbaseCharge, setCoinbaseCharge] = useState<any>(null);
  const [coinbasePolling, setCoinbasePolling] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

  const getToken = () => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("promptcloud_token") || "";
    }
    return "";
  };

  const fetchUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/user/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch user");
      const data = await res.json();
      setUser(data);
    } catch (e) {
      setError("Session expired. Please login again.");
      localStorage.removeItem("token");
      setTimeout(() => router.push("/login"), 2000);
    } finally {
      setLoading(false);
    }
  }, [API_BASE, router]);

  const fetchHistory = useCallback(async () => {
    const token = getToken();
    if (!token || !user) return;
    try {
      const res = await fetch(`${API_BASE}/api/wallet/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTxHistory(data.transactions || []);
      }
    } catch (e) {
      console.error("Failed to fetch history", e);
    }
  }, [API_BASE, user]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const getFinalAmount = () => {
    if (customAmount) {
      const amt = parseFloat(customAmount);
      return isNaN(amt) ? 0 : amt;
    }
    return selectedAmount;
  };

  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleRazorpayPayment = async () => {
    const amount = getFinalAmount();
    if (amount < 1) {
      setError("Minimum amount is ₹1");
      return;
    }

    setProcessing(true);
    setError("");

    const loaded = await loadRazorpayScript();
    if (!loaded) {
      setError("Failed to load Razorpay. Please try again.");
      setProcessing(false);
      return;
    }

    const token = getToken();
    try {
      // Create order
      const orderRes = await fetch(`${API_BASE}/api/payments/razorpay/order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount }),
      });

      if (!orderRes.ok) {
        const err = await orderRes.json();
        throw new Error(err.error || "Failed to create order");
      }

      const order = await orderRes.json();

      // Open Razorpay checkout
      const options = {
        key: order.keyId,
        amount: Math.round(order.amount * 100),
        currency: order.currency,
        name: "PromptCloud",
        description: `Wallet Top-up ₹${amount}`,
        order_id: order.orderId,
        handler: async (response: any) => {
          // Verify payment
          const verifyRes = await fetch(`${API_BASE}/api/payments/razorpay/verify`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              amount: order.amount,
            }),
          });

          if (verifyRes.ok) {
            setSuccess(`Payment successful! ₹${amount} credited to wallet.`);
            fetchUser();
            fetchHistory();
          } else {
            setError("Payment verification failed. Contact support.");
          }
        },
        prefill: {
          email: user?.email || "",
        },
        theme: {
          color: "#7b2cbf",
        },
        modal: {
          ondismiss: () => {
            setProcessing(false);
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (e: any) {
      setError(e.message || "Payment failed");
    } finally {
      setProcessing(false);
    }
  };

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCryptoPayment = () => {
    const amount = getFinalAmount();
    if (amount < 1) {
      setError("Minimum amount is ₹1");
      return;
    }
    // Crypto is manual — just show the address, user sends crypto
    setSuccess(`Send crypto to the address below. After confirmation, your wallet will be credited.`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-[#e0aaff] text-lg animate-pulse">Loading wallet...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#f0f0ff]">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold gradient-text">Wallet</h1>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 rounded-lg bg-[#1a1a2e] border border-[#7b2cbf]/30 text-sm hover:bg-[#7b2cbf]/20 transition"
          >
            ← Back to Dashboard
          </button>
        </div>

        {/* Balance Card */}
        <div className="glass-card rounded-2xl p-8 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[#a0a0c0] text-sm mb-1">Available Balance</p>
              <p className="text-4xl font-bold text-[#e0aaff]">
                ₹{user?.wallet_balance?.toFixed(2) || "0.00"}
              </p>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7b2cbf]/30 to-[#3c096c]/30 flex items-center justify-center text-3xl">
              💰
            </div>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400">
            {success}
          </div>
        )}

        {/* Top Up Section */}
        <div className="glass-card rounded-2xl p-6 mb-8">
          <h2 className="text-xl font-semibold mb-6">Top Up Wallet</h2>

          {/* Amount Selection */}
          <div className="mb-6">
            <label className="block text-sm text-[#a0a0c0] mb-3">Select Amount (INR)</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-4">
              {TOP_UP_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  onClick={() => {
                    setSelectedAmount(amt);
                    setCustomAmount("");
                  }}
                  className={`py-3 rounded-xl text-sm font-medium transition ${
                    selectedAmount === amt && !customAmount
                      ? "bg-[#7b2cbf] text-white"
                      : "bg-[#1a1a2e] border border-[#7b2cbf]/20 text-[#a0a0c0] hover:border-[#7b2cbf]/50"
                  }`}
                >
                  ₹{amt}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[#a0a0c0] text-sm">Custom:</span>
              <input
                type="number"
                placeholder="Enter amount"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="flex-1 bg-[#1a1a2e] border border-[#7b2cbf]/20 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#7b2cbf]"
              />
            </div>
          </div>

          {/* Payment Method Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setPaymentMethod("razorpay")}
              className={`flex-1 py-3 rounded-xl text-sm font-medium transition ${
                paymentMethod === "razorpay"
                  ? "bg-[#7b2cbf] text-white"
                  : "bg-[#1a1a2e] border border-[#7b2cbf]/20 text-[#a0a0c0]"
              }`}
            >
              💳 Razorpay (UPI/Card)
            </button>
            <button
              onClick={() => setPaymentMethod("crypto")}
              className={`flex-1 py-3 rounded-xl text-sm font-medium transition ${
                paymentMethod === "crypto"
                  ? "bg-[#7b2cbf] text-white"
                  : "bg-[#1a1a2e] border border-[#7b2cbf]/20 text-[#a0a0c0]"
              }`}
            >
              ₿ Crypto
            </button>
          </div>

          {/* Razorpay Payment */}
          {paymentMethod === "razorpay" && (
            <div>
              <p className="text-sm text-[#a0a0c0] mb-4">
                Pay securely via Razorpay. Supports UPI, Cards, Netbanking, Wallets.
              </p>
              <button
                onClick={handleRazorpayPayment}
                disabled={processing}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] text-white font-semibold hover:opacity-90 transition disabled:opacity-50"
              >
                {processing ? "Processing..." : `Pay ₹${getFinalAmount() || 0} via Razorpay`}
              </button>
            </div>
          )}

          {/* Crypto Payment */}
          {paymentMethod === "crypto" && (
            <div>
              <p className="text-sm text-[#a0a0c0] mb-4">
                Send crypto to the address below. After network confirmation, your wallet will be credited.
              </p>

              {/* Crypto Selector */}
              <div className="flex gap-2 mb-4">
                {CRYPTO_WALLETS.filter((w) => w.address).map((wallet) => (
                  <button
                    key={wallet.id}
                    onClick={() => setSelectedCrypto(wallet)}
                    className={`px-4 py-2 rounded-xl text-sm transition ${
                      selectedCrypto.id === wallet.id
                        ? "bg-[#7b2cbf] text-white"
                        : "bg-[#1a1a2e] border border-[#7b2cbf]/20 text-[#a0a0c0]"
                    }`}
                  >
                    {wallet.emoji} {wallet.label}
                  </button>
                ))}
              </div>

              {selectedCrypto.address ? (
                <div className="bg-[#1a1a2e] rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-[#a0a0c0]">{selectedCrypto.network}</span>
                    <button
                      onClick={() => copyAddress(selectedCrypto.address)}
                      className="text-xs px-3 py-1 rounded-lg bg-[#7b2cbf]/20 text-[#e0aaff] hover:bg-[#7b2cbf]/30 transition"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-sm font-mono text-[#e0aaff] break-all">{selectedCrypto.address}</p>
                  <p className="text-xs text-[#606080] mt-2">{selectedCrypto.note}</p>
                </div>
              ) : (
                <div className="bg-[#1a1a2e] rounded-xl p-4 mb-4 text-center text-[#606080]">
                  This crypto wallet is not configured yet.
                </div>
              )}

              <button
                onClick={handleCryptoPayment}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] text-white font-semibold hover:opacity-90 transition"
              >
                I&apos;ve Sent {selectedCrypto.emoji} {selectedCrypto.label}
              </button>
            </div>
          )}
        </div>

        {/* Transaction History */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-xl font-semibold mb-4">Transaction History</h2>
          {txHistory.length === 0 ? (
            <p className="text-[#606080] text-center py-8">No transactions yet</p>
          ) : (
            <div className="space-y-3">
              {txHistory.map((tx: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-4 rounded-xl bg-[#1a1a2e] border border-[#7b2cbf]/10"
                >
                  <div>
                    <p className="text-sm font-medium">{tx.description || "Wallet Top-up"}</p>
                    <p className="text-xs text-[#606080]">{new Date(tx.created_at).toLocaleString()}</p>
                  </div>
                  <div className={`text-sm font-semibold ${tx.amount > 0 ? "text-green-400" : "text-red-400"}`}>
                    {tx.amount > 0 ? "+" : ""}₹{Math.abs(tx.amount).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
