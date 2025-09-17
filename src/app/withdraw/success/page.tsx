'use client';

import Link from 'next/link';

// Helper to coerce a URL param to string
const qs = (v: string | string[] | undefined, fallback = '') =>
  typeof v === 'string' ? v : Array.isArray(v) ? v[0] ?? fallback : fallback;

type Props = { searchParams: Record<string, string | string[] | undefined> };

export default function WithdrawSuccess({ searchParams }: Props) {
  // Accept both old and new param names for robustness
  const userAddr   = qs(searchParams.addr)   || qs(searchParams.from);         // user's wallet address
  const amountUi   = qs(searchParams.amount) || qs(searchParams.sol_in);       // amount in SOL (UI)
  const swapSig    = qs(searchParams.swap)   || qs(searchParams.swap_tx);      // swap tx (if any)
  const transferSig= qs(searchParams.tx)     || qs(searchParams.transfer_tx);  // final USDT transfer tx

  const waMsg = encodeURIComponent(
`Proof of withdrawal

From wallet: ${userAddr || '—'}
Amount (SOL): ${amountUi || '—'}
Swap tx: ${swapSig ? `https://solscan.io/tx/${swapSig}` : '—'}
Transfer tx: ${transferSig ? `https://solscan.io/tx/${transferSig}` : '—'}

(Screenshot attached)`
  );

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ display:'flex', gap:8, alignItems:'baseline' }}>
      <div style={{ minWidth:120, opacity:.8 }}>{label}</div>
      <div style={{ wordBreak:'break-all' }}>{children}</div>
    </div>
  );

  return (
    <div style={{
      minHeight:'100vh', display:'grid', placeItems:'center', padding:16,
      background:'linear-gradient(135deg,#0b1220,#0f0f17 40%,#0b0b0f)'
    }}>
      <div style={{
        width:'100%', maxWidth:640, borderRadius:20, padding:24,
        background:'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
        border:'1px solid rgba(255,255,255,0.1)', color:'#fff'
      }}>
        <h1 style={{ margin:0, marginBottom:10, fontWeight:800, fontSize:22 }}>Withdrawal Submitted ✅</h1>
        <p style={{ opacity:0.9, marginBottom:14 }}>
          Please take a <strong>screenshot of this page</strong> and send it to our WhatsApp for faster confirmation.
        </p>

        <div style={{
          fontSize:13, lineHeight:1.7, background:'rgba(255,255,255,0.06)',
          border:'1px solid rgba(255,255,255,0.12)', borderRadius:12, padding:12, marginBottom:16
        }}>
          <Row label="Your wallet:">
            <code style={{ fontFamily:'monospace' }}>{userAddr || '—'}</code>
          </Row>
          <Row label="Amount (SOL):">{amountUi || '—'}</Row>
          <Row label="Swap tx:">
            {swapSig
              ? <a href={`https://solscan.io/tx/${swapSig}`} target="_blank" rel="noreferrer">View on Solscan ↗</a>
              : '—'}
          </Row>
          <Row label="Transfer tx:">
            {transferSig
              ? <a href={`https://solscan.io/tx/${transferSig}`} target="_blank" rel="noreferrer">View on Solscan ↗</a>
              : '—'}
          </Row>
        </div>

        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <a
            href={`https://wa.me/256788166333?text=${waMsg}`}
            target="_blank" rel="noreferrer"
            style={{
              padding:'10px 12px', borderRadius:10, fontWeight:800,
              background:'linear-gradient(135deg,#00f260,#0575e6)', color:'#0b1120',
              border:'1px solid rgba(255,255,255,0.15)'
            }}
          >
            Send proof on WhatsApp
          </a>
          <Link
            href="/"
            style={{
              padding:'10px 12px', borderRadius:10, fontWeight:800,
              background:'rgba(255,255,255,0.08)', color:'#dff',
              border:'1px solid rgba(255,255,255,0.15)'
            }}
          >
            Back to app
          </Link>
        </div>
      </div>
    </div>
  );
}
