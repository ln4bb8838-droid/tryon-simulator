import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { activeTenant, buildCatalog } from "@/lib/public-api";
import FittingRoom from "@/components/FittingRoom";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tenant = activeTenant(slug);
  return { title: tenant ? `${tenant.name} 試着室` : "試着室" };
}

export default async function FittingRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ outer?: string; bottoms?: string; model?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const tenant = activeTenant(slug);
  if (!tenant) notFound();
  const catalog = buildCatalog(tenant);
  return (
    <FittingRoom
      catalog={catalog}
      initial={{ outerCode: sp.outer ?? null, bottomsCode: sp.bottoms ?? null, modelId: sp.model ?? null }}
    />
  );
}
