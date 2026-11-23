import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import * as repo from "@/lib/repo";
import ProductForm from "@/components/ProductForm";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { tenant } = await requireAdmin();
  const { id } = await params;
  const { error } = await searchParams;
  const product = repo.getProduct(tenant.id, id);
  if (!product) notFound();
  return (
    <>
      <h1>商品を編集</h1>
      <p className="lead">保存すると、この商品を含む組み合わせ画像は作り直しの対象になります。</p>
      <ProductForm product={product} error={error} />
    </>
  );
}
