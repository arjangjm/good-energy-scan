import { NextRequest, NextResponse } from 'next/server';
import { resumeClaim } from '@/lib/claim';
import { getChain } from '@/lib/solana/live';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Status poll. It also finishes a payout that was cut off, using the transaction already saved.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await resumeClaim(id, getChain()), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ status: 'pending', claimId: id }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
