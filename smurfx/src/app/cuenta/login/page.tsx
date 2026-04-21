import { LoginForm } from "@/components/auth-forms";
export const metadata = { title: "Iniciar sesión" };
export default function Page({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <div className="container-x grid place-items-center py-16">
      <div className="w-full max-w-md rounded-3xl border border-ink/10 p-8">
        <h1 className="h-display text-3xl">Iniciar sesión</h1>
        <p className="mt-1 text-sm text-ink/60">Bienvenido de nuevo a SMURFX.</p>
        <LoginForm next={searchParams.next || "/cuenta"} />
      </div>
    </div>
  );
}
