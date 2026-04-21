import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-x grid place-items-center py-20 text-center">
      <div>
        <div className="text-[120px] font-extrabold leading-none text-smurf-500">404</div>
        <h1 className="h-display text-3xl">No hemos encontrado lo que buscas</h1>
        <p className="mt-2 text-ink/70">Prueba a buscar otra cosa o explora nuestras colecciones.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className="btn-primary">Ir al inicio</Link>
          <Link href="/hombre" className="btn-secondary">Comprar</Link>
        </div>
      </div>
    </div>
  );
}
