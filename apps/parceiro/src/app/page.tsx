import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 px-6 text-center font-sans dark:bg-black">
      <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
        GUELA SECO — Painel Parceiro
      </h1>
      <p className="max-w-md text-base text-zinc-600 dark:text-zinc-400">
        Gerencie catálogo, preços e estoque da sua distribuidora.
      </p>
      <Link
        href="/login"
        className="rounded bg-black px-5 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
      >
        Entrar
      </Link>
    </div>
  );
}
