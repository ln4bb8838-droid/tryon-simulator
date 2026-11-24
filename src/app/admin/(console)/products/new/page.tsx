import { requireAdmin } from "@/lib/auth";
import ProductForm from "@/components/ProductForm";

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAdmin();
  const { error } = await searchParams;
  return (
    <>
      <h1>商品を登録</h1>
      <p className="lead">アウターまたはパンツを登録します。</p>
      <ProductForm error={error} />
    </>
  );
}
