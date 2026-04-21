import Image from "next/image";
import Link from "next/link";

export default async function Home() {
  // Fetch products from our backend
  let products = [];
  try {
    const res = await fetch('http://localhost:4000/api/v1/products', { cache: 'no-store' });
    if (res.ok) {
      products = await res.json();
    }
  } catch (error) {
    console.error("Failed to fetch products:", error);
  }

  return (
    <div className="flex flex-col w-full">
      {/* Hero Section */}
      <section className="relative h-[85vh] w-full bg-gray-100 flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Image 
            src="https://images.unsplash.com/photo-1556906781-9a412961c28c?w=1920&q=80" 
            alt="SmurfX Hero" 
            fill 
            className="object-cover object-center brightness-75"
            priority
          />
        </div>
        <div className="z-10 text-center text-white px-4 max-w-4xl flex flex-col items-center">
          <h1 className="text-5xl md:text-8xl font-black uppercase tracking-tighter mb-6 leading-none">
            Move in <span className="text-accent">Blue</span>
          </h1>
          <p className="text-lg md:text-2xl font-medium mb-10 max-w-2xl mx-auto">
            Descubre la nueva colección SmurfAir. Diseñada para romper tus propios límites con tecnología de amortiguación avanzada.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/hombre" className="bg-white text-black px-8 py-4 rounded-full font-bold hover:bg-gray-200 transition-colors text-lg">
              Comprar Hombre
            </Link>
            <Link href="/mujer" className="bg-primary text-white px-8 py-4 rounded-full font-bold hover:bg-primary-dark transition-colors text-lg">
              Comprar Mujer
            </Link>
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-20 px-4 md:px-8 max-w-7xl mx-auto w-full">
        <div className="flex justify-between items-end mb-8">
          <h2 className="text-3xl font-black uppercase tracking-tight">Nuevos Lanzamientos</h2>
          <Link href="/novedades" className="text-sm font-bold border-b border-black pb-1 hover:text-primary hover:border-primary transition-colors">
            Ver todo
          </Link>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.length > 0 ? (
            products.map((product: any) => (
              <Link href={`/producto/${product.slug}`} key={product.id} className="group cursor-pointer block">
                <div className="relative aspect-square bg-gray-100 mb-4 overflow-hidden rounded-lg">
                  <Image 
                    src={product.images?.[0]?.url || "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80"} 
                    alt={product.name} 
                    fill 
                    className="object-cover object-center group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg text-black">{product.name}</h3>
                    <p className="text-gray-500 text-sm">{product.category?.name || 'Zapatillas'}</p>
                  </div>
                  <p className="font-bold text-black">{product.price} €</p>
                </div>
              </Link>
            ))
          ) : (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="group cursor-pointer animate-pulse">
                <div className="relative aspect-square bg-gray-200 mb-4 rounded-lg"></div>
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Categories */}
      <section className="py-12 px-4 md:px-8 max-w-7xl mx-auto w-full">
        <h2 className="text-3xl font-black uppercase tracking-tight mb-8">Explora por Deporte</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { name: 'Running', img: 'https://images.unsplash.com/photo-1530143311094-34d807799e8f?w=800&q=80' },
            { name: 'Training', img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&q=80' },
            { name: 'Lifestyle', img: 'https://images.unsplash.com/photo-1515347619152-1402bf062dfc?w=800&q=80' },
          ].map((cat, i) => (
            <Link href={`/${cat.name.toLowerCase()}`} key={i} className="relative h-96 group overflow-hidden rounded-xl block">
              <Image 
                src={cat.img} 
                alt={cat.name} 
                fill 
                className="object-cover object-center group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors duration-300"></div>
              <div className="absolute bottom-8 left-8">
                <h3 className="text-white text-2xl font-bold mb-4">{cat.name}</h3>
                <span className="bg-white text-black px-6 py-3 rounded-full font-bold text-sm hover:bg-gray-200 transition-colors inline-block">
                  Comprar
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Membership Banner */}
      <section className="bg-primary text-white py-24 px-4 text-center mt-12 w-full">
        <div className="max-w-4xl mx-auto flex flex-col items-center">
          <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-6">Únete a SmurfX Members</h2>
          <p className="text-lg md:text-xl font-medium mb-10 max-w-2xl text-accent">
            Consigue envío gratis, acceso anticipado a lanzamientos exclusivos y recompensas por cada compra.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="bg-white text-primary px-8 py-4 rounded-full font-bold hover:bg-gray-100 transition-colors">
              Regístrate Gratis
            </button>
            <button className="bg-transparent border-2 border-white text-white px-8 py-4 rounded-full font-bold hover:bg-white/10 transition-colors">
              Iniciar Sesión
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
