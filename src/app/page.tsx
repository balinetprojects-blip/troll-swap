/*eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import dynamic from 'next/dynamic';
import type React from 'react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Image from 'next/image';
import JSBI from 'jsbi';
import {
  Connection,
  PublicKey,
  ParsedAccountData,
  AccountInfo,
} from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { JupiterProvider, useJupiter } from '@jup-ag/react-hook';

/* =========================
   Client-only wallet button
   ========================= */
const WalletButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

/* =========
   ENV VARS
   ========= */
const RPC   = process.env.NEXT_PUBLIC_RPC_URL!;
const WS    = process.env.NEXT_PUBLIC_WS_URL;
const TROLL = process.env.NEXT_PUBLIC_TROLL_MINT!;
const SOL   = process.env.NEXT_PUBLIC_SOL_MINT!; // So1111...
const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'mainnet';
function solscanTxUrl(sig: string) {
  const suffix = CLUSTER === 'mainnet' ? '' : `?cluster=${CLUSTER}`;
  return `https://solscan.io/tx/${sig}${suffix}`;
}

/* ===================
   Helpers & Constants
   =================== */
const SOL_FEE_BUFFER = 0.004;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
function fmt(n: number, dp = 6) {
  return Number.isFinite(n) ? n.toFixed(dp) : '0';
}

/**
 * Read decimals from a parsed mint account without using `any`.
 */
async function getMintDecimals(connection: Connection, mintPk: PublicKey): Promise<number> {
  const info = await connection.getParsedAccountInfo(mintPk);
  const v = info.value as AccountInfo<Buffer | ParsedAccountData> | null;

  if (v && typeof v.data === 'object' && (v.data as ParsedAccountData).parsed) {
    const parsed = (v.data as ParsedAccountData).parsed as any;
    const dec = parsed?.info?.decimals;
    if (typeof dec === 'number') return dec;
  }
  return 9;
}


/* ============
   Global CSS
   ============ */
function GlobalStyles() {
  return (
    <style jsx global>{`
      :root{
        --brand: #29ffc6;
        --brand-strong: #00ffd5;
      }
      @keyframes ripple-kf { to { transform: scale(12); opacity: 0; } }
      .ripple-btn { position: relative; overflow: hidden; isolation: isolate; }
      .ripple-span {
        position: absolute; border-radius: 999px; background: var(--brand);
        opacity: 0.35; transform: scale(0); pointer-events: none; animation: ripple-kf 600ms linear forwards;
      }
      .brand-aura { position: relative; }
      .brand-aura::after {
        content: ""; position: absolute; inset: -10px; border-radius: 24px;
        background:
          radial-gradient(40% 60% at 30% 30%, var(--brand)15%, transparent 60%),
          radial-gradient(50% 60% at 70% 70%, var(--brand-strong)10%, transparent 60%);
        filter: blur(18px); opacity: 0.45; animation: brandPulse 2.6s ease-in-out infinite alternate; z-index: -1;
      }
      @keyframes brandPulse { from { opacity: 0.25; } to { opacity: 0.55; } }

      /* Mobile tweaks */
      @media (max-width: 640px){
        .shell { padding: 14px !important; border-radius: 18px !important; }
        .grid-2 { grid-template-columns: 1fr !important; }
        .action-row { flex-direction: column; }
        .action-row > * { width: 100%; }
        .buy-row { gap: 8px !important; }
      }
    `}</style>
  );
}

/* =========
   Components
   ========= */
function Logo() {
  return (
    <>
      <div className="logoWrap logoAura" style={{ position: 'relative' }}>
        {/* Next/Image with fill, keeps your styles */}
        <Image
          src="/troll.png"
          alt="Troll Logo"
          fill
          style={{ objectFit: 'cover', borderRadius: 14 }}
          onError={(e) => {
            // fallback letter if image missing
            const t = (e.target as any) as HTMLImageElement;
            const parent = t?.parentElement;
            if (parent) {
              parent.innerHTML = '';
              const fb = document.createElement('div');
              fb.textContent = 'T';
              fb.style.cssText = `
                width:100%;height:100%;display:grid;place-items:center;
                color:#9ff;font-weight:900;font-size:20px;border-radius:14px;
                background: radial-gradient(60% 60% at 40% 30%, #2a2a2a, #171717 70%);
                border:1px solid rgba(255,255,255,.12)
              `;
              parent.appendChild(fb);
            }
          }}
          priority
        />
      </div>

      <style jsx>{`
        @keyframes floaty { 0%{transform:translateY(0)} 50%{transform:translateY(-4px)} 100%{transform:translateY(0)} }
        .logoWrap{
          width: 52px; height: 52px; border-radius: 14px; overflow: hidden;
          border: 1px solid rgba(255,255,255,0.12);
          background: radial-gradient(60% 60% at 40% 30%, #2a2a2a, #171717 70%);
          position: relative; animation: floaty 6s ease-in-out infinite;
        }
        .logoAura::after{
          content:""; position:absolute; inset:-6px; border-radius:16px; pointer-events:none;
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow: 0 0 22px var(--brand), 0 0 6px rgba(0,0,0,0.35) inset;
          animation: logoGlow 2.1s ease-in-out infinite alternate;
        }
        @keyframes logoGlow {
          from { box-shadow: 0 0 10px var(--brand), 0 0 2px rgba(0,0,0,0.35) inset }
          to   { box-shadow: 0 0 24px var(--brand-strong), 0 0 6px rgba(0,0,0,0.35) inset }
        }
      `}</style>
    </>
  );
}

type RBProps = React.ButtonHTMLAttributes<HTMLButtonElement>;
function RippleButton({ children, onClick, style, disabled, className, ...rest }: RBProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const doClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = btnRef.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      const span = document.createElement('span');
      span.className = 'ripple-span';
      span.style.width = span.style.height = `${size}px`;
      span.style.left = `${x}px`; span.style.top = `${y}px`;
      btn.appendChild(span);
      span.addEventListener('animationend', () => span.remove());
    }
    onClick?.(e);
  };
  return (
    <button
      ref={btnRef}
      className={`ripple-btn ${className || ''}`}
      onClick={doClick}
      style={style}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}

function Row({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', ...style }}>{children}</div>;
}

function BalanceCard({
  label, value, sub, badge, gradient,
}: {
  label: string; value: string; sub?: string; badge: string; gradient: string;
}) {
  return (
    <div style={{
      borderRadius: 16,
      padding: 14,
      background: 'rgba(0,0,0,0.35)',
      border: '1px solid rgba(255,255,255,0.08)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.35, background: gradient, filter: 'blur(50px)' }} />
      <div style={{ position: 'relative' }}>
        <div style={{ color: '#9ad', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>{label}</span>
          <span style={{
            fontSize: 10, padding: '2px 6px', borderRadius: 999,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)'
          }}>{badge}</span>
        </div>
        <div style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginTop: 4 }}>{value}</div>
        {sub && <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: number; kind: ToastKind; message: string };

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: ToastKind, message: string, ms = 3500) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, kind, message }]);
    if (ms > 0) setTimeout(() => dismiss(id), ms);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  return { toasts, push, dismiss };
}


/* ==============
   Default export
   ============== */
export default function Page() {
  const connection = useMemo(
    () => new Connection(RPC, { wsEndpoint: WS || undefined, commitment: 'processed' }),
    []
  );
  return (
    <>
      <GlobalStyles />
      <JupiterProvider connection={connection}>
        <SwapScreen connection={connection} />
      </JupiterProvider>
    </>
  );
}

/* ==========
   Main view
   ========== */
function SwapScreen({ connection }: { connection: Connection }) {
  const { publicKey, sendTransaction, connected } = useWallet();

  // ---------- UI/SSR ----------
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ---------- Token selection ----------
  const [inMintStr, setInMintStr]   = useState<string>(SOL);
  const [outMintStr, setOutMintStr] = useState<string>(TROLL);
  const inputMint  = useMemo(() => new PublicKey(inMintStr),  [inMintStr]);
  const outputMint = useMemo(() => new PublicKey(outMintStr), [outMintStr]);
  const trollPk    = useMemo(() => new PublicKey(TROLL), []);

  // ---------- Amount / slider ----------
  const [amountStr, setAmountStr] = useState<string>('0.1');
  const [percent, setPercent]     = useState<number>(0);

  // ---------- Decimals + balances ----------
  const [inputDecimals, setInputDecimals] = useState<number>(9);
  const [solBalance, setSolBalance]       = useState<number>(0);
  const [trollBalance, setTrollBalance]   = useState<number>(0);
  const [trollDecimals, setTrollDecimals] = useState<number>(9);

  // ---------- USD prices ----------
  const [solUsd, setSolUsd]       = useState<number | null>(null);
  const [trollUsd, setTrollUsd]   = useState<number | null>(null);

  // ---------- Discovered TROLL token account ----------
  const trollAcctRef = useRef<PublicKey | null>(null);

  // ---------- Buy helpers (Pesapal) ----------
  const [copied, setCopied] = useState(false);
  const addressStr = publicKey?.toBase58() ?? '';
  const pesapalUrl = useMemo(() => {
    const base = 'https://store.pesapal.com/solanapurchase';
    if (!addressStr) return base;
    const u = new URL(base);
    u.searchParams.set('address', addressStr);
    return u.toString();
  }, [addressStr]);

  function copyAddr() {
    if (!addressStr) return;
    navigator.clipboard.writeText(addressStr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  // ---------- Toasts + Modal ----------
  type ToastKind = 'success' | 'error' | 'info';
  type Toast = { id: number; kind: ToastKind; message: string; href?: string };
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(1);

  function pushToast(kind: ToastKind, message: string, href?: string) {
    const id = toastIdRef.current++;
    setToasts((t) => [...t, { id, kind, message, href }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }
  function dismissToast(id: number) {
    setToasts((t) => t.filter((x) => x.id !== id));
  }

  const [showModal, setShowModal] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const solscanUrl = lastTx ? `https://solscan.io/tx/${lastTx}` : null;

  // ---------- Balances refresher (robust) ----------
  const refreshBalances = useCallback(async () => {
    if (!publicKey) {
      setSolBalance(0);
      setTrollBalance(0);
      trollAcctRef.current = null;
      return;
    }
    try {
      // SOL
      const lamports = await connection.getBalance(publicKey, 'processed');
      setSolBalance(lamports / 1e9);

      // TROLL decimals
      const dec = await getMintDecimals(connection, trollPk);
      setTrollDecimals(dec);

      // Any token account for TROLL
      const resp = await connection.getTokenAccountsByOwner(
        publicKey,
        { mint: trollPk },
        { commitment: 'processed' }
      );

      if (resp.value.length > 0) {
        const acct = resp.value[0];
        trollAcctRef.current = acct.pubkey;

        // Safely read parsed tokenAmount.uiAmount without `any`
        const dataUnknown: unknown = acct.account.data;
        let uiAmount: number | null = null;
        if (
          typeof dataUnknown === 'object' &&
          dataUnknown !== null &&
          'parsed' in (dataUnknown as object)
        ) {
          const parsed = (dataUnknown as {
            parsed: { info?: { tokenAmount?: { uiAmount?: unknown } } }
          }).parsed;

          const maybe = parsed?.info?.tokenAmount?.uiAmount;
          if (typeof maybe === 'number') uiAmount = maybe;
        }

        if (uiAmount !== null) {
          setTrollBalance(uiAmount);
        } else {
          const bal = await connection.getTokenAccountBalance(acct.pubkey).catch(() => null);
          setTrollBalance(bal?.value?.uiAmount ?? 0);
        }
      } else {
        trollAcctRef.current = null;
        setTrollBalance(0);
      }
    } catch (e) {
      console.warn('[balance]', e);
    }
  }, [connection, publicKey, trollPk]);

  // ---------- Poll balances ----------
  useEffect(() => {
    refreshBalances();
    const id = setInterval(refreshBalances, 10000);
    return () => clearInterval(id);
  }, [refreshBalances]);

  // ---------- USD prices via Jupiter ----------
  useEffect(() => {
    let stop = false;
    async function loadPrices() {
      try {
        const q = new URLSearchParams({ ids: `SOL,${TROLL}` });
        const r = await fetch(`https://price.jup.ag/v4/price?${q.toString()}`, { cache: 'no-store' });
        const json = (await r.json()) as unknown;
        const getNum = (v: unknown): number | null => (typeof v === 'number' ? v : null);
        const data = (json as { data?: Record<string, { price?: unknown }> }).data ?? {};
        const sol = getNum(data.SOL?.price);
        const troll = getNum(data[TROLL]?.price);
        if (!stop) { setSolUsd(sol); setTrollUsd(troll); }
      } catch {
        if (!stop) { setSolUsd(null); setTrollUsd(null); }
      }
    }
    loadPrices();
    const id = setInterval(loadPrices, 30000);
    return () => { stop = true; clearInterval(id); };
  }, []);

  // ---------- Optional WS subscription with fallback ----------
  const fastPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!WS || !publicKey) return;
    let solSubId: number | null = null;
    let trollSubId: number | null = null;
    let wsFailed = false;

    (async () => {
      try {
        solSubId = await connection.onAccountChange(publicKey, () => { refreshBalances(); }, 'processed');
        if (!trollAcctRef.current) { await refreshBalances(); }
        if (trollAcctRef.current) {
          trollSubId = await connection.onAccountChange(trollAcctRef.current, () => { refreshBalances(); }, 'processed');
        }
      } catch (e) {
        console.warn('[ws]', e);
        wsFailed = true;
      }
      if (wsFailed && fastPollRef.current === null) {
        fastPollRef.current = setInterval(refreshBalances, 3000);
      }
    })();

    return () => {
      if (solSubId !== null) { try { connection.removeAccountChangeListener(solSubId); } catch {} }
      if (trollSubId !== null) { try { connection.removeAccountChangeListener(trollSubId); } catch {} }
      if (fastPollRef.current) { clearInterval(fastPollRef.current); fastPollRef.current = null; }
    };
  }, [connection, publicKey, refreshBalances]);

  // ---------- Keep input decimals in sync ----------
  useEffect(() => {
    (async () => {
      if (inMintStr === SOL) setInputDecimals(9);
      else setInputDecimals(await getMintDecimals(connection, new PublicKey(inMintStr)));
    })();
  }, [connection, inMintStr]);

  // ---------- Immediate refresh on connect / select changes ----------
  useEffect(() => { refreshBalances(); }, [connected, publicKey, refreshBalances]);
  useEffect(() => { refreshBalances(); }, [inMintStr, outMintStr, refreshBalances]);

  // ---------- Slider ⇒ amount ----------
  useEffect(() => {
    if (!connected) return;
    const base = inMintStr === SOL ? Math.max(0, solBalance - SOL_FEE_BUFFER) : trollBalance;
    const val = Math.min(base, Math.max(0, (base * percent) / 100));
    const dp  = Math.min(6, inputDecimals);
    setAmountStr(val > 0 ? String(Number(val.toFixed(dp))) : '0');
  }, [percent, connected, inMintStr, solBalance, trollBalance, inputDecimals]);

  // ---------- UI amount ⇒ atomic ----------
  const amountAtomic = useMemo(() => {
    const n = Number.parseFloat(amountStr || '0');
    const atomic = Math.floor((Number.isFinite(n) && n > 0 ? n : 0) * 10 ** inputDecimals);
    return JSBI.BigInt(atomic.toString());
  }, [amountStr, inputDecimals]);

  // ---------- Jupiter v6 ----------
  const { fetchQuote, quoteResponseMeta, fetchSwapTransaction, refresh, loading, error } = useJupiter({
    amount: amountAtomic,
    inputMint,
    outputMint,
    slippageBps: 50,
  });

  async function doSwap() {
    if (!publicKey) {
      pushToast('error', 'Connect your wallet first.');
      return;
    }
    pushToast('info', 'Building route…');

    const quote = quoteResponseMeta ?? (await fetchQuote());
    if (!quote) {
      pushToast('error', 'No route found for this pair/amount.');
      return;
    }

    const res = await fetchSwapTransaction({
      quoteResponseMeta: quote,
      userPublicKey: publicKey,
      wrapUnwrapSOL: true,
      allowOptimizedWrappedSolTokenAccount: true,
      prioritizationFeeLamports: 0,
    });

    if ('error' in res) {
      console.error(res.error);
      pushToast('error', 'Failed to build swap transaction.');
      return;
    }

    try {
      const txid = await sendTransaction(res.swapTransaction, connection, {
        maxRetries: 3,
        skipPreflight: false,
      });

      setLastTx(txid);
      setShowModal(true);
      pushToast('success', 'Swap sent! View on Solscan ↗', `https://solscan.io/tx/${txid}`);

      await refresh();
      await refreshBalances();
    } catch (e) {
      console.error(e);
      pushToast('error', 'Swap failed to send.');
    }
  }

  function flip() {
    setInMintStr(outMintStr);
    setOutMintStr(inMintStr);
    setPercent(0);
  }

  const swapDisabled =
    loading ||
    !connected ||
    !publicKey ||
    !Number.isFinite(Number(amountStr)) ||
    Number(amountStr) <= 0;

  // ---------- Render ----------
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      background:
        'radial-gradient(1200px 600px at 10% 10%, #0ff2, transparent 60%),' +
        'radial-gradient(1200px 600px at 90% 20%, #f0f2, transparent 60%),' +
        'linear-gradient(135deg,#0b1220,#0f0f17 40%,#0b0b0f)'
    }}>
      <div className="shell" style={{
        width: '100%',
        maxWidth: 760,
        borderRadius: 24,
        padding: 24,
        backdropFilter: 'blur(10px)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Logo />
            <div>
              <div style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>Troll Swap</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>SOL ↔ TROLL</div>
            </div>
          </div>
          <div>{mounted ? <WalletButton /> : null}</div>
        </div>

        {/* Balances */}
        <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <BalanceCard
            label="SOL Balance"
            value={fmt(solBalance, 6)}
            sub={solUsd ? `≈ $${(solBalance * solUsd).toFixed(2)}` : '—'}
            badge="Main"
            gradient="linear-gradient(135deg,#1d2b64,#f8cdda)"
          />
          <BalanceCard
            label="TROLL Balance"
            value={fmt(trollBalance, Math.min(6, trollDecimals))}
            sub={trollUsd ? `≈ $${(trollBalance * trollUsd).toFixed(2)}` : '—'}
            badge="Token"
            gradient="linear-gradient(135deg,#0cebeb,#29ffc6)"
          />
        </div>

        {/* Buying SOL */}
        <div className="buy-row" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          {addressStr ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.06)', color: '#cfe',
              fontSize: 12, maxWidth: '100%'
            }}>
              <span>Copy Your Solana Address First:-</span>
              <span style={{ fontFamily: 'monospace' }}>
                &nbsp;{addressStr.slice(0, 4)}…{addressStr.slice(-4)}
              </span>
              <button onClick={copyAddr} type="button" style={{
                padding: '4px 8px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.08)', color: '#dff', fontWeight: 700, cursor: 'pointer'
              }}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          ) : (
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
              Connect your wallet so we can attach your address to the payment.
            </div>
          )}

          <a href={pesapalUrl} target="_blank" rel="noopener noreferrer">
            <button style={btnGhost}>GET SOLANA HERE</button>
          </a>

          <div style={{ position: 'relative', width: 162, height: 36 }}>
            <Image
              src="/payment_methods.png"
              alt="Payment methods"
              fill
              sizes="162px"
              style={{ objectFit: 'contain', borderRadius: 8 }}
              priority
            />
          </div>
        </div>

        {/* Swap card */}
        <div className="brand-aura">
          <div style={{
            borderRadius: 20,
            padding: 20,
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))'
          }}>
            {/* From */}
            <Row>
              <label style={{ color: '#cfe' }}>From</label>
              <select
                value={inMintStr}
                onChange={(e) => { setInMintStr(e.target.value); setPercent(0); }}
                style={selectStyle}
              >
                <option value={SOL}>SOL</option>
                <option value={TROLL}>TROLL</option>
              </select>
              <span style={hintStyle}>
                Balance:&nbsp;
                {inMintStr === SOL ? fmt(solBalance, 6) : fmt(trollBalance, Math.min(6, trollDecimals))}
              </span>
            </Row>

            {/* Amount + MAX + slider + chips */}
            <Row>
              <input
                value={amountStr}
                onChange={(e) => {
                  const v = parseFloat(e.target.value || '0');
                  const base = inMintStr === SOL ? Math.max(0, solBalance - SOL_FEE_BUFFER) : trollBalance;
                  const p = base > 0 ? Math.min(100, Math.max(0, (v / base) * 100)) : 0;
                  setAmountStr(e.target.value);
                  setPercent(Math.round(p));
                }}
                placeholder="0.1"
                inputMode="decimal"
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => {
                  const base = inMintStr === SOL ? Math.max(0, solBalance - SOL_FEE_BUFFER) : trollBalance;
                  const dp  = Math.min(6, inputDecimals);
                  setAmountStr(base > 0 ? String(Number(base.toFixed(dp))) : '0');
                  setPercent(100);
                }}
                style={btnGhost}
              >
                MAX
              </button>
            </Row>

            {/* USD hint for entered amount */}
            {(() => {
              const n = parseFloat(amountStr || '0');
              const price = inMintStr === SOL ? solUsd : trollUsd;
              const usd = Number.isFinite(n) && price ? (n * price) : null;
              return (
                <div style={{ marginTop: 6, color: '#aee', fontSize: 12 }}>
                  {usd !== null ? `≈ $${usd.toFixed(2)}` : '≈ $—'}
                </div>
              );
            })()}

            <div style={{ marginTop: 8 }}>
              <input
                type="range" min={0} max={100} step={1}
                value={percent}
                onChange={(e) => setPercent(parseInt(e.target.value, 10))}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                {[25, 50, 75, 100].map((p) => (
                  <button key={p} type="button" onClick={() => setPercent(p)} style={chipStyle}>{p}%</button>
                ))}
              </div>
            </div>

            {/* To */}
            <Row style={{ marginTop: 16 }}>
              <label style={{ color: '#cfe' }}>To</label>
              <select value={outMintStr} onChange={(e) => setOutMintStr(e.target.value)} style={selectStyle}>
                <option value={TROLL}>TROLL</option>
                <option value={SOL}>SOL</option>
              </select>
              <button onClick={flip} type="button" style={btnFlip}>⇅</button>
            </Row>

            {/* Actions */}
            <div className="action-row" style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <RippleButton onClick={doSwap} type="button" style={{ ...btnAccent, opacity: swapDisabled ? 0.6 : 1, cursor: swapDisabled ? 'not-allowed' : 'pointer' }} disabled={swapDisabled}>
                {loading ? 'Preparing…' : 'Swap'}
              </RippleButton>
              <button onClick={refreshBalances} type="button" style={btnGhost}>Refresh</button>
            </div>

            {/* Route info */}
            {quoteResponseMeta && (() => {
              const pip = quoteResponseMeta?.quoteResponse?.priceImpactPct
                ? parseFloat(quoteResponseMeta.quoteResponse.priceImpactPct) * 100
                : null;
              const tint =
                pip === null ? 'rgba(255,255,255,0.6)' :
                pip < 1 ? '#8ef7c0' :
                pip < 3 ? '#ffd37a' :
                '#ff9aa2';
              return (
                <div style={{ marginTop: 12, fontSize: 13, color: tint }}>
                  Price impact: {pip !== null ? `${pip.toFixed(2)}%` : '—'}
                </div>
              );
            })()}

            {error && <div style={{ color: '#ff9aa2', marginTop: 8 }}>Error: {String(error)}</div>}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 14, color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
          Powered by <a href="https://balinettechnologies.com" target="_blank" rel="noreferrer">Balinet Technologies Ltd</a>
        </div>
      </div>

      {/* --------- Toasts (bottom-right) --------- */}
      <div style={{
        position: 'fixed', right: 16, bottom: 16, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360
      }}>
        {toasts.map((t) => {
          const bg =
            t.kind === 'success' ? '#062e2a' :
            t.kind === 'error'   ? '#2b0e15' :
                                   '#0b1120';
          const border =
            t.kind === 'success' ? 'rgba(41,255,198,0.35)' :
            t.kind === 'error'   ? 'rgba(255,90,120,0.35)' :
                                   'rgba(255,255,255,0.12)';
          return (
            <div key={t.id} style={{
              borderRadius: 12, padding: '12px 14px', color: '#e6f0ff',
              background: bg, boxShadow: '0 16px 50px rgba(0,0,0,0.6)',
              border: `1px solid ${border}`, display: 'flex', gap: 12, alignItems: 'center'
            }}>
              <span style={{ flex: 1 }}>
                {t.href ? (
                  <a href={t.href} target="_blank" rel="noreferrer" style={{ color: '#29ffc6', textDecoration: 'underline', fontWeight: 700 }}>
                    {t.message}
                  </a>
                ) : t.message}
              </span>
              <button onClick={() => dismissToast(t.id)} style={{
                border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff',
                borderRadius: 8, padding: '4px 8px', cursor: 'pointer'
              }}>Close</button>
            </div>
          );
        })}
      </div>

      {/* --------- Modal: Swap Completed --------- */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'grid', placeItems: 'center', zIndex: 9998, padding: 12
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 460, borderRadius: 16, padding: 20,
              background: '#0b1120',
              border: '1px solid rgba(255,255,255,0.12)', color: '#fff',
              boxShadow: '0 30px 80px rgba(0,0,0,0.65)'
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Swap Completed 🎉</div>
            <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 14 }}>
              Your transaction has been submitted to the network.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {solscanUrl && (
                <a href={solscanUrl} target="_blank" rel="noreferrer">
                  <button style={btnPrimary}>View on Solscan</button>
                </a>
              )}
              <button onClick={() => setShowModal(false)} style={btnGhost}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



/* ======
   Styles
   ====== */
const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'rgba(0,0,0,0.4)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 12,
  padding: '12px 14px',
  fontSize: 16,
  outline: 'none'
};
const selectStyle: React.CSSProperties = {
  flex: 1,
  background: 'rgba(0,0,0,0.4)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 12,
  padding: '10px 12px',
  fontSize: 15,
  outline: 'none'
};
const btnPrimary: React.CSSProperties = {
  flex: 1,
  padding: '12px 16px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'linear-gradient(135deg,#6a11cb,#2575fc)',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer'
};
const btnAccent: React.CSSProperties = {
  flex: 1,
  padding: '12px 16px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'linear-gradient(135deg,#00f260,#0575e6)',
  color: '#0b1120',
  fontWeight: 800,
  cursor: 'pointer'
};
const btnGhost: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.06)',
  color: '#dff',
  fontWeight: 700,
  cursor: 'pointer'
};
const chipStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.05)',
  color: '#cfe',
  fontSize: 12,
  cursor: 'pointer'
};
const btnFlip: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'linear-gradient(135deg,#f7971e,#ffd200)',
  color: '#1b1b1f',
  fontWeight: 900,
  cursor: 'pointer'
};
const hintStyle: React.CSSProperties = {
  marginLeft: 8,
  opacity: 0.7,
  color: 'rgba(255,255,255,0.75)',
  fontSize: 12,
};
