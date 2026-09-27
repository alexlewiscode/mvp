import type { Metadata } from "next";
import { InstallPill } from "@/components/install-pill";

export const metadata: Metadata = {
  title: "About",
  description:
    "AI can write the code. MVP is where developers put their own skills to the test—no AI, just pure talent.",
  alternates: { canonical: "/about" },
};

const steps = [
  {
    number: "01",
    title: "Get in the terminal",
    description: "Install MVP and jump straight into a challenge.",
  },
  {
    number: "02",
    title: "Bring your own brain",
    description: "Think fast, trust your instincts, and take it on yourself.",
  },
  {
    number: "03",
    title: "See where you rank",
    description: "Put your score on the board alongside developers everywhere.",
  },
] as const;

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  const id = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return (
    <section className="flex flex-col gap-3" aria-labelledby={id}>
      <p className="text-xs tracking-widest text-primary uppercase">
        {eyebrow}
      </p>
      <h2 id={id} className="text-2xl font-medium text-foreground sm:text-3xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function AboutPage() {
  return (
    <main id="main-content">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-20 px-4 py-16 sm:px-6 sm:py-24">
        <header className="flex max-w-3xl flex-col gap-6">
          <p className="text-xs tracking-widest text-primary uppercase">
            About MVP
          </p>
          <h1 className="font-pixelify text-5xl leading-tight text-foreground sm:text-7xl">
            AI can write the code.
            <br />
            Can you still out-code everyone?
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            AI makes it easier than ever to build software. MVP is where you put
            your own developer instincts to the test: step into the terminal,
            take on a challenge yourself, and see how your skills stack up.
          </p>
          <div className="mt-2 flex flex-col items-start gap-3">
            <InstallPill id="install-hero" />
            <span className="text-xs text-muted-foreground">
              Requires a recent stable Rust toolchain.
            </span>
          </div>
        </header>

        <Section
          eyebrow="The point"
          title="No AI doing the thinking. Just you."
        >
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            AI is part of how developers work now. But your judgment,
            creativity, and problem-solving are still yours. MVP gives you a
            place to use them—no generated answers, no autopilot, just your own
            skills in the moment.
          </p>
        </Section>

        <Section eyebrow="How it works" title="Play. Post your score. Rise up.">
          <ol className="mt-3 grid gap-6 border-t border-border pt-6 sm:grid-cols-3 sm:gap-8">
            {steps.map((step) => (
              <li key={step.number} className="flex flex-col gap-3">
                <span className="text-xs text-primary">{step.number}</span>
                <h3 className="text-lg font-medium text-foreground">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </Section>

        <Section
          eyebrow="The competition"
          title="Most Valued Programmer isn’t given. It’s earned."
        >
          <div className="flex max-w-2xl flex-col gap-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            <p>
              Take on the daily code puzzle, then queue for a live 1v1 against a
              similarly skilled developer. First correct fix wins 100 public
              match points; your private ELO quietly finds fair opponents.
            </p>
            <p>
              The no-AI rule is an honor system: bring your own brain, solve the
              challenge yourself, and let your result speak for you.
            </p>
          </div>
        </Section>

        <Section
          eyebrow="Compete as a team"
          title="The strongest team isn’t just the biggest."
        >
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Verify your company email from your profile and represent your team.
            Company standings use average match points per active verified
            member over the last 30 days, and teams need at least three active
            players to rank.
          </p>
        </Section>

        <section
          className="flex flex-col items-center gap-6 border-t border-border pt-16 text-center"
          aria-labelledby="install-title"
        >
          <p className="text-xs tracking-widest text-primary uppercase">
            Your move
          </p>
          <h2
            id="install-title"
            className="font-pixelify text-3xl text-foreground sm:text-5xl"
          >
            Think you&apos;ve still got it?
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
            Fire up MVP, test your skills, and claim your place on the board.
          </p>
          <InstallPill id="install-footer" />
        </section>
      </div>
    </main>
  );
}
