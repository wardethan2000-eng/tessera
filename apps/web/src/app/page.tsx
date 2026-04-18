export default function Home() {
  return (
    <main className="flex min-h-screen bg-stone-100 px-6 py-16 text-stone-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-16">
        <section className="max-w-3xl space-y-6">
          <p className="text-sm uppercase tracking-[0.24em] text-stone-500">
            FamilyTree
          </p>
          <h1 className="text-5xl leading-tight font-semibold text-stone-950">
            A private family archive, built to last.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-stone-700">
            The initial foundation is in place: a Next.js frontend, a Fastify
            API, shared workspace configuration, and a self-hosted VM layout for
            the app and data services.
          </p>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Web",
              body: "Quiet, content-first frontend surface for the archive.",
            },
            {
              title: "API",
              body: "Fastify service with a typed TypeScript foundation and health endpoint.",
            },
            {
              title: "Infra",
              body: "Separate app and data VMs, with Postgres and MinIO planned on the data host.",
            },
          ].map((item) => (
            <article
              key={item.title}
              className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-semibold text-stone-950">{item.title}</h2>
              <p className="mt-3 text-sm leading-7 text-stone-600">{item.body}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
