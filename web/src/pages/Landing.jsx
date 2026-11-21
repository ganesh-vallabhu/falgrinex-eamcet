import { Link } from 'react-router-dom';
import catalog from '../data/catalog.generated.json';

const chapterCount = Object.values(catalog.chapterOrder || {}).reduce(
  (total, groups) => total + Object.values(groups).reduce((sum, chapters) => sum + chapters.length, 0),
  0,
);
const questionCount = Object.values(catalog.counts || {}).reduce((total, count) => total + Number(count || 0), 0);
const questionLabel = `${Math.floor(questionCount / 1000).toLocaleString('en-IN')},000+`;

const features = [
  { title: `${chapterCount} chapters`, text: 'Every Mathematics, Physics and Chemistry chapter from the AP EAMCET syllabus, ready to practise.' },
  { title: `${questionLabel} questions`, text: 'Chapter-wise practice with topic and difficulty filters, plus clear explanations after every answer.' },
  { title: 'Mock & grand tests', text: 'Timed chapter tests, full-length mocks and grand tests that feel like exam day.' },
  { title: 'Daily challenge', text: 'One sharp question a day to keep your fundamentals fresh and your streak going.' },
  { title: 'Live rankings', text: 'Weekly and overall leaderboards show where you stand among fellow aspirants.' },
  { title: 'Real progress', text: 'Accuracy trends, subject-wise breakdowns and weak-topic tracking after every attempt.' },
];

const steps = [
  { title: 'Get your login', text: 'Ask your mentor or institute admin for your student credentials, then sign in.' },
  { title: 'Pick your practice', text: 'Choose a chapter, a timed mock test or the daily challenge that fits your day.' },
  { title: 'Learn and improve', text: 'Review instant explanations, watch your accuracy rise and climb the rankings.' },
];

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none fixed -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-violet-600/20 blur-[120px]" />
      <div className="pointer-events-none fixed -right-40 top-40 h-[26rem] w-[26rem] rounded-full bg-cyan-500/20 blur-[120px]" />

      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <img src="/assets/brand.png" alt="" className="h-10 w-10 shrink-0 rounded-xl object-contain" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-extrabold text-white">Falgrinex EAMCET</span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-400/80">AP EAMCET Prep</span>
            </span>
          </Link>
          <nav className="ml-auto hidden items-center gap-6 md:flex" aria-label="Page sections">
            <button type="button" className="muted text-sm font-semibold transition hover:text-white" onClick={() => scrollToId('features')}>Features</button>
            <button type="button" className="muted text-sm font-semibold transition hover:text-white" onClick={() => scrollToId('how')}>How it works</button>
            <button type="button" className="muted text-sm font-semibold transition hover:text-white" onClick={() => scrollToId('access')}>Free access</button>
          </nav>
          <Link to="/login" className="btn-primary ml-auto px-4 py-2 text-xs md:ml-0">Student login</Link>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <section className="grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="animate-rise">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">
              AP EAMCET 2027 Preparation
            </p>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
              Master <span className="bg-gradient-to-r from-cyan-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">Mathematics, Physics &amp; Chemistry</span>. One smart question at a time.
            </h1>
            <p className="muted mt-5 max-w-xl text-base leading-relaxed">
              A focused, distraction-free practice platform built to help AP EAMCET aspirants prepare smarter and track real progress.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/login" className="btn-primary px-6">Start practising</Link>
              <button type="button" className="btn-ghost px-6" onClick={() => scrollToId('how')}>See how it works</button>
            </div>
            <div className="mt-10 flex flex-wrap gap-8">
              <div>
                <p className="text-2xl font-extrabold text-white">{chapterCount}</p>
                <p className="muted text-[11px] font-semibold uppercase tracking-wider">Chapters</p>
              </div>
              <div>
                <p className="text-2xl font-extrabold text-white">{questionLabel}</p>
                <p className="muted text-[11px] font-semibold uppercase tracking-wider">Practice questions</p>
              </div>
              <div>
                <p className="text-2xl font-extrabold text-white">3</p>
                <p className="muted text-[11px] font-semibold uppercase tracking-wider">Core subjects</p>
              </div>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-lg">
            <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-tr from-cyan-500/20 via-violet-500/20 to-fuchsia-500/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-900/70 p-2 shadow-2xl shadow-black/40">
              <img src="/assets/hero.webp" alt="Falgrinex EAMCET practice dashboard preview" className="h-auto w-full rounded-[1.35rem] object-cover" />
            </div>
            <div className="card absolute -bottom-5 -left-3 hidden items-center gap-3 px-4 py-3 sm:flex">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-sm font-bold text-emerald-300">94</span>
              <span>
                <span className="block text-xs font-semibold text-white">Chapter mastery</span>
                <span className="muted block text-[11px]">Practice with purpose</span>
              </span>
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-24 py-14 sm:py-16">
          <div className="max-w-2xl">
            <p className="badge border-cyan-400/25 text-cyan-300">Why Falgrinex</p>
            <h2 className="page-title mt-4">Everything you need to crack your rank</h2>
            <p className="muted mt-3">A focused practice environment — no distractions, just chapter-wise mastery and exam-day simulation.</p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <article key={feature.title} className="card group transition hover:border-cyan-400/30 hover:bg-slate-900/90">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 text-xs font-bold text-cyan-200">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-4 text-base font-bold text-white">{feature.title}</h3>
                <p className="muted mt-2 text-sm leading-relaxed">{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how" className="scroll-mt-24 py-14 sm:py-16">
          <div className="max-w-2xl">
            <p className="badge border-violet-400/25 text-violet-300">How it works</p>
            <h2 className="page-title mt-4">Three steps to better practice</h2>
            <p className="muted mt-3">Simple enough to start today, deep enough to take you all the way to exam day.</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title} className="card relative pt-6">
                <span className="absolute right-5 top-4 text-3xl font-extrabold text-white/5">0{index + 1}</span>
                <h3 className="text-base font-bold text-white">{step.title}</h3>
                <p className="muted mt-2 text-sm leading-relaxed">{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="access" className="scroll-mt-24 py-14 sm:py-16">
          <div className="card relative overflow-hidden border-cyan-400/20 p-7 sm:p-10">
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-2xl">
                <h2 className="page-title">Your EAMCET rank starts with today's practice.</h2>
                <p className="muted mt-3">The platform is free to use — ask your mentor or institute admin for your login details and start your first quiz in under a minute.</p>
              </div>
              <Link to="/login" className="btn-primary shrink-0 px-6">Login &amp; start practising</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative mt-10 border-t border-white/10 bg-slate-950/50">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2.5">
                <img src="/assets/brand.png" alt="" className="h-9 w-9 rounded-xl object-contain" />
                <span className="text-sm font-extrabold text-white">Falgrinex EAMCET</span>
              </div>
              <p className="muted mt-3 max-w-xs text-sm leading-relaxed">A focused, distraction-free practice platform for AP EAMCET aspirants.</p>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">Platform</h3>
              <div className="mt-3 flex flex-col gap-2">
                <button type="button" className="muted text-left text-sm hover:text-white" onClick={() => scrollToId('features')}>Features</button>
                <button type="button" className="muted text-left text-sm hover:text-white" onClick={() => scrollToId('how')}>How it works</button>
                <Link to="/login" className="muted text-sm hover:text-white">Student login</Link>
              </div>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">Practice</h3>
              <div className="mt-3 flex flex-col gap-2">
                <span className="muted text-sm">Chapter-wise questions</span>
                <span className="muted text-sm">Timed mock tests</span>
                <span className="muted text-sm">Daily challenge</span>
              </div>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">Access</h3>
              <p className="muted mt-3 text-sm leading-relaxed">Free for aspirants. Get your credentials from your mentor or institute.</p>
              <button type="button" className="mt-3 text-sm font-semibold text-cyan-300 hover:text-cyan-200" onClick={() => scrollToId('access')}>Learn more</button>
            </div>
          </div>
          <div className="muted mt-8 flex flex-wrap justify-between gap-2 border-t border-white/10 pt-6 text-xs">
            <span>© 2026 Falgrinex EAMCET. All rights reserved.</span>
            <span>Built for focused, consistent practice.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
