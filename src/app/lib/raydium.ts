import type { PublicKey } from '@solana/web3.js';

export const RAYDIUM_BASE_HOST = 'https://api-v3.raydium.io';
export const RAYDIUM_SWAP_HOST = 'https://transaction-v1.raydium.io';

export type RaydiumSwapRoutePlan = {
  poolId: string;
  inputMint: string;
  outputMint: string;
  feeMint: string;
  feeRate: number;
  feeAmount: string;
  remainingAccounts: unknown[];
};

export type RaydiumSwapCompute = {
  swapType: 'BaseIn' | 'BaseOut';
  inputMint: string;
  inputAmount: string;
  outputMint: string;
  outputAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  priceImpactPct: number;
  referrerAmount: string;
  routePlan: RaydiumSwapRoutePlan[];
};

export type RaydiumQuoteResponse = {
  id: string;
  success: boolean;
  version: string;
  data: RaydiumSwapCompute;
};

export type RaydiumTransactionResponse = {
  id: string;
  success: boolean;
  version: string;
  msg?: string;
  data?: { transaction: string }[];
};

export type PriorityFeeResponse = {
  id: string;
  success: boolean;
  data: { default: Record<'vh' | 'h' | 'm', number> };
};

export async function fetchRaydiumQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
  txVersion?: 'LEGACY' | 'V0';
  swapMode?: 'swap-base-in' | 'swap-base-out';
}): Promise<RaydiumQuoteResponse> {
  const {
    inputMint,
    outputMint,
    amount,
    slippageBps,
    txVersion = 'LEGACY',
    swapMode = 'swap-base-in',
  } = params;

  const url = new URL(`${RAYDIUM_SWAP_HOST}/compute/${swapMode}`);
  url.searchParams.set('inputMint', inputMint);
  url.searchParams.set('outputMint', outputMint);
  url.searchParams.set('amount', amount);
  url.searchParams.set('slippageBps', String(slippageBps));
  url.searchParams.set('txVersion', txVersion);

  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Raydium quote failed with ${res.status}`);
  }
  return res.json() as Promise<RaydiumQuoteResponse>;
}

export async function fetchRaydiumPriorityFee(): Promise<PriorityFeeResponse> {
  const res = await fetch(`${RAYDIUM_BASE_HOST}/main/auto-fee`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Raydium priority fee failed with ${res.status}`);
  }
  return res.json() as Promise<PriorityFeeResponse>;
}

export async function fetchRaydiumSwapTransactions(params: {
  swapResponse: RaydiumQuoteResponse;
  wallet: PublicKey;
  txVersion: 'LEGACY' | 'V0';
  computeUnitPriceMicroLamports: string;
  wrapSol: boolean;
  unwrapSol: boolean;
  inputAccount?: string;
  outputAccount?: string;
}): Promise<RaydiumTransactionResponse> {
  const {
    swapResponse,
    wallet,
    txVersion,
    computeUnitPriceMicroLamports,
    wrapSol,
    unwrapSol,
    inputAccount,
    outputAccount,
  } = params;

  const payload = {
    txVersion,
    wrapSol,
    unwrapSol,
    computeUnitPriceMicroLamports,
    wallet: wallet.toBase58(),
    inputAccount,
    outputAccount,
    swapResponse,
  };

  const res = await fetch(`${RAYDIUM_SWAP_HOST}/transaction/swap-base-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Raydium transaction build failed with ${res.status}`);
  }
  return res.json() as Promise<RaydiumTransactionResponse>;
}
