import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q?.trim();
  const products = await prisma.product.findMany({
    where: q ? { OR: [{ name: { contains: q } }, { line: { contains: q } }] } : undefined,
    orderBy: { createdAt: "desc" },
    include: { variants: true, images: { take: 1 } }
  });
  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="h-display text-3xl">Productos</h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={q || ""} placeholder="Buscar..." className="input-base w-64" />
          <button className="btn-secondary">Buscar</button>
        </form>
      </div>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-ink/10">
        <table className="w-full text-sm">
          <thead className="bg-ink/5 text-xs uppercase tracking-wider text-ink/60">
            <tr>
              <th className="px-4 py-3 text-left">Producto</th>
              <th className="px-4 py-3 text-left">Línea</th>
              <th className="px-4 py-3 text-left">Género</th>
              <th className="px-4 py-3 text-left">Precio</th>
              <th className="px-4 py-3 text-left">Stock</th>
              <th className="px-4 py-3 text-left">Estado</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const stock = p.variants.reduce((a, v) => a + v.stock, 0);
              return (
                <tr key={p.id} className="border-t border-ink/5">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 overflow-hidden rounded-md bg-smurf-50">
                        {p.images[0] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.images[0].url} alt="" className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div>
                        <Link href={`/producto/${p.slug}`} className="font-bold hover:text-smurf-600">{p.name}</Link>
                        <div className="text-xs text-ink/55">{p.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{p.line}</td>
                  <td className="px-4 py-3 capitalize">{p.gender}</td>
                  <td className="px-4 py-3 font-semibold">{formatPrice(p.salePrice ?? p.basePrice)}</td>
                  <td className="px-4 py-3">{stock}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-smurf-50 px-2 py-0.5 text-xs font-bold uppercase text-smurf-700">{p.status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
