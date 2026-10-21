import { NextResponse } from "next/server";
import { getRecommendedCards } from "@/lib/recommended";

export const dynamic = "force-dynamic";

/** The AI-picked booking codes for the home rail. */
export async function GET() {
  const items = await getRecommendedCards();
  return NextResponse.json({ items });
}
