// server.js — Unified Express backend for PromptCloud
// Runs alongside the Telegram bot (index.js) and shares store.js in memory.
// Serves the wired HTML dashboard at / and provides JSON API for the Next.js app.

require('dotenv').config();
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const store = require('./utils/store');
const mailer = require('./utils/mailer');
const payments = require('./payments');

// Coinbase Commerce client
const { Client, Webhook } = require('coinbase-commerce-node');
let coinbaseClient = null;
if (process.env.COINBASE_API_KEY) {
  Client.init(process.env.COINBASE_API_KEY);
  coinbaseClient = Client;
  console.log('✅ Coinbase Commerce initialized');
}

const app = express();

// CORS — allow Next.js dev server
const cors = require('cors');
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3002',
  credentials: true
}));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ Missing JWT_SECRET in .env');
  process.exit(1);
}

// ── JWT middleware ─────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match) return res.status(401).json({ error: 'Unauthorized — missing token' });
  const token = match[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized — invalid token' });
  }
}

// ── Helpers ────────────────────────────────────────────────
function generateTxnRef() {
  return 'TXN-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function syntheticTidFromEmail(email) {
  return 'web-' + crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);
}

// ── Static HTML (legacy wired dashboard) ───────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'promptcloud_fixed.html'));
});

// ── Auth routes ────────────────────────────────────────────

// POST /api/auth/register-send-otp
// Body: { email }
// Sends OTP to email for registration (user doesn't need to exist yet)
app.post('/api/auth/register-send-otp', async (req, res) => {
  const { email } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  // Check if email already registered
  const existing = await store.getUserByEmail(email);
  if (existing) return res.status(400).json({ error: 'Email already registered' });

  const code = mailer.generateOTP();
  const syntheticTid = syntheticTidFromEmail(email);
  store.storeOTP(email.toLowerCase(), code, syntheticTid);

  try {
    await mailer.sendOTP(email, code);
    res.json({ ok: true, message: 'OTP sent to email' });
  } catch (e) {
    console.error('register-send-otp error:', e.message);
    res.status(500).json({ error: 'Failed to send OTP email' });
  }
});

// POST /api/auth/register-verify
// Body: { email, otp, name, password, phone?, company_name? }
// Verifies OTP and creates user account
app.post('/api/auth/register-verify', async (req, res) => {
  const { email, otp, name, password, phone, company_name } = req.body || {};
  if (!email || !otp || !name || !password) {
    return res.status(400).json({ error: 'email, otp, name, and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const result = store.verifyOTP(email.toLowerCase(), otp);
  if (!result.ok) {
    return res.status(400).json({ error: result.reason });
  }

  // Check again if email already registered
  const existing = await store.getUserByEmail(email);
  if (existing) return res.status(400).json({ error: 'Email already registered' });

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await store.createUser({
    id: uuidv4(),
    email: email.toLowerCase(),
    password: hashedPassword,
    name,
    company_name: company_name || null,
    phone: phone || null,
    is_verified: 1,
  });

  const syntheticTid = syntheticTidFromEmail(user.email);
  store.setSession(syntheticTid, {
    userId: user.id,
    email: user.email,
    name: user.name,
    verified: true,
    balance: 0,
    txHistory: [],
  });

  const token = jwt.sign(
    { tid: syntheticTid, email: user.email, userId: user.id },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    success: true,
    token,
    userId: user.id,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      company_name: user.company_name,
      wallet_balance: user.wallet_balance,
      wallet_balance_xdc: user.wallet_balance_xdc,
    },
  });
});

// POST /api/auth/send-otp
// Body: { email }
app.post('/api/auth/send-otp', async (req, res) => {
  const { email } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  const user = await store.getUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const code = mailer.generateOTP();
  const syntheticTid = syntheticTidFromEmail(email);
  store.storeOTP(email.toLowerCase(), code, syntheticTid);

  try {
    await mailer.sendOTP(email, code);
    res.json({ ok: true, message: 'OTP sent to email' });
  } catch (e) {
    console.error('send-otp error:', e.message);
    res.status(500).json({ error: 'Failed to send OTP email' });
  }
});

// POST /api/auth/verify-otp
// Body: { email, otp }
app.post('/api/auth/verify-otp', async (req, res) => {
  const { email, otp } = req.body || {};
  if (!email || !otp) {
    return res.status(400).json({ error: 'email and otp are required' });
  }

  const result = store.verifyOTP(email.toLowerCase(), otp);
  if (!result.ok) {
    return res.status(400).json({ error: result.reason });
  }

  const syntheticTid = result.telegramId;
  const user = await store.getUserByEmail(email);
  if (user) {
    await store.updateUser(user.id, { is_verified: 1 });
  }

  const existing = store.getSession(syntheticTid);
  if (!existing) {
    const name = user?.name || email.split('@')[0];
    store.setSession(syntheticTid, {
      userId: user?.id || null,
      email: email.toLowerCase(),
      name,
      verified: true,
      balance: user?.wallet_balance || 0,
      txHistory: [],
    });
  } else {
    store.setSession(syntheticTid, { verified: true });
  }

  const token = jwt.sign(
    { tid: syntheticTid, email: email.toLowerCase(), userId: user?.id || null },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    ok: true,
    token,
    userId: user?.id || null,
    user: user
      ? {
          id: user.id,
          email: user.email,
          name: user.name,
          company_name: user.company_name,
          wallet_balance: user.wallet_balance,
          wallet_balance_xdc: user.wallet_balance_xdc,
        }
      : null,
  });
});

// POST /api/auth/login
// Body: { email, password }
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const user = await store.getUserByEmail(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  if (!user.is_verified) {
    return res.status(403).json({
      error: 'Account not verified. Please verify OTP first.',
      requires_otp: true,
      email: user.email,
    });
  }

  const syntheticTid = syntheticTidFromEmail(user.email);
  store.setSession(syntheticTid, {
    userId: user.id,
    email: user.email,
    name: user.name,
    verified: true,
    balance: user.wallet_balance || 0,
    txHistory: [],
  });

  const token = jwt.sign(
    { tid: syntheticTid, email: user.email, userId: user.id },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    userId: user.id,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      company_name: user.company_name,
      wallet_balance: user.wallet_balance,
      wallet_balance_xdc: user.wallet_balance_xdc,
    },
  });
});

// GET /api/auth/profile
app.get('/api/auth/profile', authMiddleware, async (req, res) => {
  if (req.user.userId) {
    const user = await store.getUserById(req.user.userId);
    if (user) {
      return res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        company_name: user.company_name,
        phone: user.phone,
        telegram_username: user.telegram_username,
        wallet_balance: user.wallet_balance,
        wallet_balance_xdc: user.wallet_balance_xdc,
        is_verified: user.is_verified,
        created_at: user.created_at,
      });
    }
  }
  // Fallback for web-only sessions not yet linked to DB
  res.json({
    id: req.user.tid,
    email: req.user.email,
    name: req.user.name || req.user.email?.split('@')[0],
  });
});

// ── User routes ────────────────────────────────────────────

// GET /api/user/cloudstack-keys
app.get('/api/user/cloudstack-keys', authMiddleware, (req, res) => {
  res.json({
    apiKey: process.env.CLOUDSTACK_API_KEY || null,
    secretKey: process.env.CLOUDSTACK_SECRET_KEY || null,
  });
});

// ── Wallet routes ──────────────────────────────────────────

// GET /api/wallet
app.get('/api/wallet', authMiddleware, async (req, res) => {
  if (req.user.userId) {
    const bal = await store.getWalletBalance(req.user.userId);
    return res.json({ ...bal, currency: 'INR' });
  }
  const bal = store.getBalance(req.user.tid);
  res.json({ inr: bal, xdc: 0, currency: 'INR' });
});

// GET /api/wallet/balance (legacy route used by HTML dashboard)
app.get('/api/wallet/balance', authMiddleware, async (req, res) => {
  if (req.user.userId) {
    const bal = await store.getWalletBalance(req.user.userId);
    return res.json({ balance: bal.inr });
  }
  const bal = store.getBalance(req.user.tid);
  res.json({ balance: bal });
});

// GET /api/wallet/transactions
app.get('/api/wallet/transactions', authMiddleware, async (req, res) => {
  if (req.user.userId) {
    const rows = await store.getTransactions(req.user.userId);
    return res.json(rows);
  }
  const rows = store.getTxHistory(req.user.tid);
  res.json(rows);
});

// POST /api/wallet/deposit
app.post('/api/wallet/deposit', authMiddleware, async (req, res) => {
  const { amount, currency, method } = req.body || {};
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt < 1) {
    return res.status(400).json({ error: 'Valid amount >= 1 is required' });
  }
  if (!req.user.userId) {
    return res.status(400).json({ error: 'Deposit requires a registered account' });
  }
  const txId = await store.addWalletBalance(
    req.user.userId,
    amt,
    currency || 'INR',
    `Deposit ${amt} ${currency || 'INR'} via ${method || 'manual'}`
  );
  const bal = await store.getWalletBalance(req.user.userId);
  res.json({ txId, status: 'completed', amount: amt, currency: currency || 'INR', balance: bal });
});

// ── Payments routes ────────────────────────────────────────

// ── Razorpay Integration ─────────────────────────────────
const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// POST /api/payments/razorpay/order
app.post('/api/payments/razorpay/order', authMiddleware, async (req, res) => {
  const { amount } = req.body || {};
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt < 1) {
    return res.status(400).json({ error: 'Valid amount >= 1 is required' });
  }

  try {
    const order = await razorpay.orders.create({
      amount: Math.round(amt * 100), // Razorpay expects paise
      currency: 'INR',
      receipt: generateTxnRef(),
      notes: {
        userId: req.user.userId || req.user.tid,
        email: req.user.email || '',
      },
    });

    res.json({
      orderId: order.id,
      amount: amt,
      currency: 'INR',
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (e) {
    console.error('[RAZORPAY] Order creation failed:', e.message);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
});

// POST /api/payments/razorpay/verify
app.post('/api/payments/razorpay/verify', authMiddleware, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body || {};

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification fields' });
  }

  // Verify signature
  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ error: 'Invalid payment signature' });
  }

  // Payment verified — credit wallet
  const amt = parseFloat(amount);
  if (req.user.userId) {
    await store.addWalletBalance(req.user.userId, amt, 'INR', `Razorpay payment ${razorpay_payment_id}`);
  } else {
    store.addBalance(req.user.tid, amt);
  }

  res.json({ ok: true, paymentId: razorpay_payment_id, amount: amt });
});

// POST /api/payments/upi/initiate
app.post('/api/payments/upi/initiate', authMiddleware, (req, res) => {
  const { amount } = req.body || {};
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt < 1) {
    return res.status(400).json({ error: 'Valid amount >= 1 is required' });
  }
  const upi = payments.getUPIDetails(amt);
  const txnRef = generateTxnRef();
  res.json({
    upiId: upi.upiId,
    upiLink: upi.deepLink,
    txnRef,
  });
});

// POST /api/payments/upi/confirm
app.post('/api/payments/upi/confirm', authMiddleware, async (req, res) => {
  const { txnRef, amount } = req.body || {};
  const amt = parseFloat(amount);
  if (!txnRef || isNaN(amt) || amt < 1) {
    return res.status(400).json({ error: 'txnRef and valid amount are required' });
  }
  if (req.user.userId) {
    await store.addWalletBalance(req.user.userId, amt, 'INR', `UPI top-up ${txnRef}`);
  } else {
    store.addBalance(req.user.tid, amt);
  }
  res.json({ ok: true, status: 'pending_review', txnRef, amount: amt });
});

// GET /api/payments/crypto/address?coin=usdt_trc20
app.get('/api/payments/crypto/address', authMiddleware, (req, res) => {
  const coin = req.query.coin;
  if (!coin) return res.status(400).json({ error: 'coin query param is required' });
  const wallet = payments.getWallet(coin);
  if (!wallet || !wallet.address) {
    return res.status(404).json({ error: 'Wallet not configured for this coin' });
  }
  res.json({
    coin: wallet.id,
    label: wallet.label,
    address: wallet.address,
    network: wallet.network,
    note: wallet.note,
  });
});

// POST /api/payments/crypto/notify
app.post('/api/payments/crypto/notify', authMiddleware, async (req, res) => {
  const { coin, amount, txnHash } = req.body || {};
  const amt = parseFloat(amount);
  if (!coin || isNaN(amt) || amt < 1) {
    return res.status(400).json({ error: 'coin and valid amount are required' });
  }
  const wallet = payments.getWallet(coin);
  if (!wallet || !wallet.address) {
    return res.status(404).json({ error: 'Wallet not configured for this coin' });
  }
  if (req.user.userId) {
    await store.addWalletBalance(req.user.userId, amt, 'INR', `Crypto ${wallet.id} ${txnHash || ''}`);
  } else {
    store.addBalance(req.user.userId, amt);
  }
  res.json({
    ok: true,
    status: 'pending_review',
    coin: wallet.id,
    label: wallet.label,
    amount: amt,
    txnHash: txnHash || null,
    message: 'Crypto payment logged for manual review. Balance will be confirmed within 30 minutes.',
  });
});

// ── Coinbase Commerce routes ─────────────────────────────

// POST /api/payments/coinbase/create — Create a Coinbase Commerce charge
app.post('/api/payments/coinbase/create', authMiddleware, async (req, res) => {
  if (!coinbaseClient) {
    return res.status(503).json({ error: 'Coinbase Commerce not configured' });
  }
  const { amount, currency = 'INR', cryptoCurrency = 'XDC' } = req.body || {};
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt < 1) {
    return res.status(400).json({ error: 'Valid amount required' });
  }

  try {
    const { Charge } = require('coinbase-commerce-node');
    const charge = await Charge.create({
      name: 'PromptCloud Wallet Top-up',
      description: `Top-up ₹${amt} via ${cryptoCurrency}`,
      local_price: { amount: amt.toString(), currency: currency },
      pricing_type: 'fixed_price',
      metadata: {
        user_id: req.user.userId,
        email: req.user.email,
        amount_inr: amt,
        requested_crypto: cryptoCurrency,
      },
    });

    // Store pending charge
    store.createPendingPayment({
      user_id: req.user.userId,
      charge_id: charge.id,
      amount: amt,
      currency: 'INR',
      status: 'pending',
      method: 'coinbase',
    });

    res.json({
      ok: true,
      chargeId: charge.id,
      hostedUrl: charge.hosted_url,
      qrCode: charge.code,
      expiresAt: charge.expires_at,
      pricing: charge.pricing,
      addresses: charge.addresses,
    });
  } catch (e) {
    console.error('Coinbase charge error:', e);
    res.status(500).json({ error: 'Failed to create charge', details: e.message });
  }
});

// GET /api/payments/coinbase/charge/:id — Check charge status
app.get('/api/payments/coinbase/charge/:id', authMiddleware, async (req, res) => {
  if (!coinbaseClient) {
    return res.status(503).json({ error: 'Coinbase Commerce not configured' });
  }
  try {
    const { Charge } = require('coinbase-commerce-node');
    const charge = await Charge.retrieve(req.params.id);
    res.json({
      id: charge.id,
      status: charge.status,
      pricing: charge.pricing,
      payments: charge.payments,
      hostedUrl: charge.hosted_url,
      expiresAt: charge.expires_at,
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to retrieve charge' });
  }
});

// POST /api/payments/coinbase/webhook — Coinbase webhook (no auth, uses signature)
app.post('/api/payments/coinbase/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-cc-webhook-signature'];
  if (!signature || !process.env.COINBASE_WEBHOOK_SECRET) {
    return res.status(400).json({ error: 'Missing signature or webhook secret' });
  }

  try {
    const event = Webhook.verifyEventBody(req.body, signature, process.env.COINBASE_WEBHOOK_SECRET);
    
    if (event.type === 'charge:confirmed') {
      const charge = event.data;
      const { user_id, amount_inr } = charge.metadata || {};
      if (user_id && amount_inr) {
        await store.addWalletBalance(user_id, parseFloat(amount_inr), 'INR', `Coinbase ${charge.id}`);
        console.log(`✅ Credited ₹${amount_inr} to user ${user_id} via Coinbase`);
      }
    }
    
    res.json({ received: true });
  } catch (e) {
    console.error('Webhook verification failed:', e);
    res.status(400).json({ error: 'Invalid signature' });
  }
});

// ── Instance / Deployment routes ───────────────────────────

// GET /api/instances
app.get('/api/instances', (req, res) => {
  const instances = [
    {
      id: 'vm-ubuntu',
      type: 'vm',
      name: 'Ubuntu Server',
      os: 'Ubuntu 22.04 LTS',
      cpu: { min: 1, max: 16, price: 0.05 },
      ram: { min: 512, max: 65536, price: 0.02 },
      storage: { min: 10, max: 1000, price: 0.01 },
      description: 'General purpose Ubuntu virtual machine',
    },
    {
      id: 'vm-debian',
      type: 'vm',
      name: 'Debian Server',
      os: 'Debian 12',
      cpu: { min: 1, max: 16, price: 0.05 },
      ram: { min: 512, max: 65536, price: 0.02 },
      storage: { min: 10, max: 1000, price: 0.01 },
      description: 'Stable Debian virtual machine',
    },
    {
      id: 'lxc-ubuntu',
      type: 'lxc',
      name: 'Ubuntu Container',
      os: 'Ubuntu 22.04 LTS',
      cpu: { min: 1, max: 8, price: 0.03 },
      ram: { min: 256, max: 32768, price: 0.015 },
      storage: { min: 5, max: 500, price: 0.008 },
      description: 'Lightweight Ubuntu LXC container',
    },
    {
      id: 'lxc-alpine',
      type: 'lxc',
      name: 'Alpine Container',
      os: 'Alpine Linux',
      cpu: { min: 1, max: 8, price: 0.03 },
      ram: { min: 128, max: 32768, price: 0.015 },
      storage: { min: 5, max: 500, price: 0.008 },
      description: 'Ultra-lightweight Alpine container',
    },
  ];
  res.json(instances);
});

// POST /api/instances/price
app.post('/api/instances/price', (req, res) => {
  const { instance_id, cpu, ram, storage, hours } = req.body || {};
  const instances = [
    { id: 'vm-ubuntu', cpu_price: 0.05, ram_price: 0.02, storage_price: 0.01 },
    { id: 'vm-debian', cpu_price: 0.05, ram_price: 0.02, storage_price: 0.01 },
    { id: 'lxc-ubuntu', cpu_price: 0.03, ram_price: 0.015, storage_price: 0.008 },
    { id: 'lxc-alpine', cpu_price: 0.03, ram_price: 0.015, storage_price: 0.008 },
  ];
  const instance = instances.find((i) => i.id === instance_id);
  if (!instance) return res.status(400).json({ error: 'Invalid instance type' });

  const hourly = cpu * instance.cpu_price + (ram / 1024) * instance.ram_price + storage * instance.storage_price;
  const total = hourly * (hours || 1);
  res.json({ hourly, total, hours: hours || 1, breakdown: { cpu: cpu * instance.cpu_price, ram: (ram / 1024) * instance.ram_price, storage: storage * instance.storage_price } });
});

// POST /api/instances/book
app.post('/api/instances/book', authMiddleware, async (req, res) => {
  const { instance_id, name, cpu, ram, storage, hours, os } = req.body || {};
  if (!req.user.userId) {
    return res.status(400).json({ error: 'Booking requires a registered account' });
  }

  const instances = [
    { id: 'vm-ubuntu', cpu_price: 0.05, ram_price: 0.02, storage_price: 0.01 },
    { id: 'vm-debian', cpu_price: 0.05, ram_price: 0.02, storage_price: 0.01 },
    { id: 'lxc-ubuntu', cpu_price: 0.03, ram_price: 0.015, storage_price: 0.008 },
    { id: 'lxc-alpine', cpu_price: 0.03, ram_price: 0.015, storage_price: 0.008 },
  ];
  const instance = instances.find((i) => i.id === instance_id);
  if (!instance) return res.status(400).json({ error: 'Invalid instance type' });

  const hourlyCost = cpu * instance.cpu_price + (ram / 1024) * instance.ram_price + storage * instance.storage_price;
  const totalCost = hourlyCost * (hours || 1);

  const user = await store.getUserById(req.user.userId);
  if (!user) return res.status(500).json({ error: 'User not found' });
  if ((user.wallet_balance || 0) < totalCost) {
    return res.status(400).json({ error: 'Insufficient balance', required: totalCost, current: user.wallet_balance });
  }

  const deduct = await store.deductWalletBalance(req.user.userId, totalCost, 'INR', `Booked ${name} (${instance_id})`);
  if (!deduct.ok) return res.status(400).json({ error: deduct.error });

  const deployment = await store.createDeployment({
    user_id: req.user.userId,
    vm_id: Math.floor(Math.random() * 9000) + 100,
    type: instance_id.startsWith('vm') ? 'vm' : 'lxc',
    name,
    status: 'provisioning',
    cpu_cores: cpu,
    ram_mb: ram,
    storage_gb: storage,
    os,
    cost_per_hour: hourlyCost,
    started_at: new Date().toISOString(),
    total_cost: totalCost,
  });

  res.json({
    deploymentId: deployment.id,
    vmId: deployment.vm_id,
    status: deployment.status,
    cost: totalCost,
    hourlyCost,
    message: 'Instance booked successfully. Deployment in progress.',
  });
});

// GET /api/deployments
app.get('/api/deployments', authMiddleware, async (req, res) => {
  if (!req.user.userId) return res.json([]);
  const rows = await store.getDeployments(req.user.userId);
  res.json(rows);
});

// GET /api/deployments/:id
app.get('/api/deployments/:id', authMiddleware, async (req, res) => {
  const deployment = await store.getDeploymentById(req.params.id);
  if (!deployment) return res.status(404).json({ error: 'Deployment not found' });
  if (deployment.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });
  res.json(deployment);
});

// DELETE /api/deployments/:id
app.delete('/api/deployments/:id', authMiddleware, async (req, res) => {
  const deployment = await store.getDeploymentById(req.params.id);
  if (!deployment) return res.status(404).json({ error: 'Deployment not found' });
  if (deployment.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });

  const startTime = new Date(deployment.started_at);
  const now = new Date();
  const usedHours = (now - startTime) / (1000 * 60 * 60);
  const usedCost = usedHours * (deployment.cost_per_hour || 0);
  const totalPaid = deployment.total_cost || usedCost;
  const refund = Math.max(0, totalPaid - usedCost);

  await store.updateDeployment(req.params.id, { status: 'deleted', stopped_at: new Date().toISOString() });

  if (refund > 0) {
    await store.addWalletBalance(req.user.userId, refund, 'INR', `Refund for ${deployment.name}`);
  }

  res.json({ status: 'deleted', refund, usedHours: usedHours.toFixed(2), usedCost: usedCost.toFixed(2) });
});

// ── Health ─────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'PromptCloud Unified API',
    version: '2.1.0',
    features: ['auth', 'wallet', 'payments', 'instances', 'deployments', 'telegram', 'cloudstack'],
    timestamp: new Date().toISOString(),
  });
});

// ── CloudStack proxy (server-side HMAC signing, keeps secret safe) ──
app.get('/api/cloudstack-proxy', authMiddleware, async (req, res) => {
  const { apiKey, secretKey, command, response, ...rest } = req.query;
  if (!apiKey || !secretKey || !command) {
    return res.status(400).json({ error: 'Missing apiKey, secretKey, or command' });
  }

  // Build params WITHOUT secretKey (CloudStack doesn't expect it)
  const params = { apiKey, command, response: response || 'json' };
  Object.keys(rest).forEach(k => {
    if (k !== 'secretKey') params[k] = rest[k];
  });

  const sorted = Object.keys(params).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const qs = sorted.map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
  const toSign = qs.toLowerCase();

  try {
    const sig = crypto.createHmac('sha1', secretKey).update(toSign).digest('base64');
    const finalUrl = `https://qa.cloudstack.cloud/client/api?${qs}&signature=${encodeURIComponent(sig)}`;
    const csRes = await fetch(finalUrl);
    const data = await csRes.json();
    res.json(data);
  } catch (err) {
    console.error('CloudStack proxy error:', err.message);
    res.status(502).json({ error: 'CloudStack request failed', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ PromptCloud API server running on http://localhost:${PORT}`);
});

module.exports = app;
