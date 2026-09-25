export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="mx-auto w-full max-w-md p-8"><p className="eyebrow">Edelweiss · Marketing atelier</p><h1 className="page-title">Sign in</h1><form action="/api/auth/login" method="post" className="mt-8 grid gap-5"><label htmlFor="password">Dashboard password</label><input className="rounded-xl border bg-white p-3" id="password" name="password" type="password" autoComplete="current-password" required maxLength={256}/>{error && <p role="alert">Unable to sign in. Check your password or contact the administrator.</p>}<button className="rounded-xl bg-[var(--forest)] p-3 text-white" type="submit">Sign in</button></form></main>;
}
