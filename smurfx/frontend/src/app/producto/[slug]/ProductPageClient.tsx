"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useCartStore } from "@/store/cartStore";

export default function ProductPageClient({ product }: { product: any }) {
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [selectedColor, setSelectedColor] = useState<string>("");
  const addItem = useCartStore((state) => state.addItem);

  const sizes = Array.from(new Set(product.variants?.map((v: any) => v.size) || [])) as string[];
  const colors = Array.from(new Set(product.variants?.map((v: any) => v.color) || [])) as string[];

  useEffect(() => {
    if (sizes.length > 0) setSelectedSize(sizes[0]);
    if (colors.length > 0) setSelectedColor(colors[0]);
  }, [product]);

  const handleAddToCart = () => {
    if (!selectedSize || !selectedColor) {
      alert("Por favor selecciona talla y color");
      return;
    }
    
    addItem({
      id: product.id,
      name: product.name,
      price: parseFloat(product.price),
      image: product.images?.[0]?.url || "",
      size: selectedSize,
      color: selectedColor,
      quantity: 1,
    });
    
    alert("Producto añadido al carrito");
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 w-full">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-8 flex gap-2">
        <Link href="/" className="hover:text-primary">Inicio</Link>
        <span>/</span>
        <Link href={`/${product.category?.slug || 'categoria'}`} className="hover:text-primary">
          {product.category?.name || 'Categoría'}
        </Link>
        <span>/</span>
        <span className="text-black font-medium">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Images Gallery */}
        <div className="flex flex-col gap-4">
          <div className="relative aspect-square bg-gray-100 rounded-xl overflow-hidden">
            <Image 
              src={product.images?.[0]?.url || "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80"} 
              alt={product.name} 
              fill 
              className="object-cover object-center"
              priority
            />
          </div>
        </div>

        {/* Product Info */}
        <div className="flex flex-col">
          <h1 className="text-4xl font-black uppercase tracking-tight mb-2">{product.name}</h1>
          <p className="text-lg text-gray-600 mb-4">{product.shortDesc || product.category?.name}</p>
          <p className="text-2xl font-bold mb-8">{product.price} €</p>

          {/* Color Selector */}
          {colors.length > 0 && (
            <div className="mb-8">
              <h3 className="font-bold mb-3">Color: <span className="font-normal text-gray-600">{selectedColor}</span></h3>
              <div className="flex gap-3">
                {colors.map((color: string, i: number) => (
                  <button 
                    key={i} 
                    onClick={() => setSelectedColor(color)}
                    className={`w-12 h-12 rounded-full border-2 ${selectedColor === color ? 'border-primary' : 'border-transparent'} bg-gray-200 focus:outline-none`}
                  >
                    <span className="sr-only">{color}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Size Selector */}
          {sizes.length > 0 && (
            <div className="mb-10">
              <div className="flex justify-between items-end mb-3">
                <h3 className="font-bold">Selecciona tu talla</h3>
                <button className="text-sm text-gray-500 underline hover:text-primary">Guía de tallas</button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {sizes.map((size: string, i: number) => (
                  <button 
                    key={i} 
                    onClick={() => setSelectedSize(size)}
                    className={`border rounded-md py-3 text-center transition-all ${selectedSize === size ? 'border-black bg-black text-white' : 'border-gray-300 hover:border-black'}`}
                  >
                    EU {size}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-4 mb-12">
            <button 
              onClick={handleAddToCart}
              className="w-full bg-black text-white py-5 rounded-full font-bold text-lg hover:bg-gray-800 transition-colors"
            >
              Añadir al carrito
            </button>
            <Link href="/carrito" className="w-full bg-primary text-white py-5 rounded-full font-bold text-lg hover:bg-primary-dark transition-colors text-center">
              Comprar ahora
            </Link>
          </div>

          {/* Description */}
          <div className="prose prose-sm sm:prose-base text-gray-700 max-w-none">
            <p>{product.description}</p>
            <ul className="mt-4 space-y-2">
              <li><strong>SKU:</strong> {product.sku}</li>
              <li>Envío estándar gratuito para miembros.</li>
              <li>Devoluciones gratuitas en un plazo de 30 días.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
