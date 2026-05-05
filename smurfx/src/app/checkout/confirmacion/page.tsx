import Link from "next/link";

export const metadata = { title: "Pedido confirmado" };

export default function Page({ searchParams }: { searchParams: { n?: string } }) {
  const n = searchParams.n || "";
  return (
    <div className="container-x py-20 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-smurf-500 text-white">✓</div>
      <h1 className="h-display mt-6 text-4xl">¡Gracias por tu pedido!</h1>
      <p className="mt-3 text-ink/70">
        Hemos recibido tu pedido. Te enviaremos un email con la confirmación.
      </p>
      {n && (
        <p className="mt-2 text-sm">
          Número de pedido: <span className="font-bold">{n}</span>
        </p>
      )}
      <div className="mt-8 flex justify-center gap-3">
        <Link href={`/cuenta/pedidos/${n}`} className="btn-primary">
          Ver pedido
        </Link>
        <Link href="/" className="btn-secondary">
          Volver a la tienda
        </Link>
      </div>
    </div>
  );
}
