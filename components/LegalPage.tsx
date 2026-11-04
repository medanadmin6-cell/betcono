import { Page } from "@/components/Shell";

/**
 * The shell for the Terms and Privacy pages: a narrow reading column with
 * numbered sections. The copy itself lives in each page.
 */
export function LegalPage({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: { heading: string; body: React.ReactNode }[];
}) {
  return (
    <Page>
      <article className="px-4 py-6 md:mx-auto md:max-w-2xl md:px-5">
        <h1 className="text-[22px] font-black text-[var(--text-bright)]">{title}</h1>
        <p className="mt-1 text-[12px] text-[var(--text-faint)]">Last updated {updated}</p>

        <ol className="mt-6 space-y-6">
          {sections.map((s, i) => (
            <li key={s.heading}>
              <h2 className="text-[15px] font-black text-[var(--text-bright)]">
                {i + 1}. {s.heading}
              </h2>
              <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
                {s.body}
              </div>
            </li>
          ))}
        </ol>
      </article>
    </Page>
  );
}
