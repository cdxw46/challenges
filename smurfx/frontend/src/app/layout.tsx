import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "SMURFX | Move in blue",
  description: "Zapatillas y ropa deportiva premium. Vuela, Domina, Sin límites.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased min-h-screen flex flex-col">
        <Header />
        
        <main className="flex-1">
          {children}
        </main>

        <footer className="bg-black text-white pt-16 pb-8">
          <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            <div>
              <h3 className="font-bold text-lg mb-4 tracking-tight">SMURFX</h3>
              <p className="text-gray-400 text-sm">Move in blue.</p>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-sm uppercase">Ayuda</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white">Estado del pedido</a></li>
                <li><a href="#" className="hover:text-white">Envíos y entregas</a></li>
                <li><a href="#" className="hover:text-white">Devoluciones</a></li>
                <li><a href="#" className="hover:text-white">Opciones de pago</a></li>
                <li><a href="#" className="hover:text-white">Contacto</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-sm uppercase">Acerca de SmurfX</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white">Noticias</a></li>
                <li><a href="#" className="hover:text-white">Empleo</a></li>
                <li><a href="#" className="hover:text-white">Inversores</a></li>
                <li><a href="#" className="hover:text-white">Sostenibilidad</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-sm uppercase">Únete a nosotros</h4>
              <p className="text-sm text-gray-400 mb-4">Regístrate para recibir noticias, ofertas y acceso anticipado a lanzamientos.</p>
              <div className="flex">
                <input type="email" placeholder="Tu email" className="px-4 py-2 w-full text-black focus:outline-none" />
                <button className="bg-primary hover:bg-primary-dark px-4 py-2 font-medium transition-colors">Unirse</button>
              </div>
            </div>
          </div>
          <div className="container mx-auto px-4 border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center text-xs text-gray-500">
            <p>&copy; 2026 SMURFX, Inc. Todos los derechos reservados.</p>
            <div className="flex gap-4 mt-4 md:mt-0">
              <a href="#" className="hover:text-white">Guías</a>
              <a href="#" className="hover:text-white">Términos de venta</a>
              <a href="#" className="hover:text-white">Términos de uso</a>
              <a href="#" className="hover:text-white">Política de privacidad</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
