import { type ButtonHTMLAttributes, type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, CalendarDays,
  Camera, Check, CheckCircle2, ChevronRight, CircleAlert, Clipboard, Clock3,
  HeartPulse, ImagePlus, LockKeyhole, LogOut, MapPin, Mic, MicOff, Plus,
  Shield, ShieldCheck, Stethoscope, X,
} from 'lucide-react';
import {
  getGetDashboardQueryKey, getGetWoundQueryKey, getListWoundUpdatesQueryKey,
  getListWoundsQueryKey, getGetSharedReportQueryKey, useCreateWound,
  useCreateWoundShare, useCreateWoundUpdate, useGetDashboard, useGetSharedReport,
  useGetWound, useListWoundUpdates, useListWounds, useRequestUploadUrl, useRevokeWoundShare,
} from '@workspace/api-client-react';
import type { SymptomLevel, UploadUrlInputContentType, WoundUpdateInput } from '@workspace/api-client-react';
import { Link, Redirect, Route, Switch, useLocation, useRoute, Router as WouterRouter } from 'wouter';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 20_000 } },
});
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#2c6d64', colorForeground: '#203a39', colorMutedForeground: '#687876',
    colorDanger: '#a64239', colorBackground: '#fffdf8', colorInput: '#fffdf8',
    colorInputForeground: '#203a39', colorNeutral: '#d9d4c9', fontFamily: 'DM Sans',
    borderRadius: '0.8rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffdf8] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#203a39] font-bold',
    headerSubtitle: 'text-[#687876]',
    socialButtonsBlockButtonText: 'text-[#203a39] font-semibold',
    formFieldLabel: 'text-[#203a39] font-semibold',
    footerActionLink: 'text-[#2c6d64] font-bold',
    footerActionText: 'text-[#687876]',
    dividerText: 'text-[#687876]',
    identityPreviewEditButton: 'text-[#2c6d64]',
    formFieldSuccessText: 'text-[#276250]',
    alertText: 'text-[#963e37]',
    logoBox: 'mb-3',
    logoImage: 'h-9',
    socialButtonsBlockButton: 'border-[#d9d4c9] bg-[#fffdf8] rounded-xl',
    formButtonPrimary: 'bg-[#2c6d64] hover:bg-[#245c55] rounded-xl',
    formFieldInput: 'border-[#d9d4c9] bg-[#fffdf8] rounded-xl text-[#203a39]',
    footerAction: 'text-[#687876]',
    dividerLine: 'bg-[#e4dfd5]',
    alert: 'rounded-xl',
    otpCodeFieldInput: 'border-[#d9d4c9] rounded-lg',
    formFieldRow: 'mb-4',
    main: 'gap-4',
  },
};

const dateFormat = (value?: string | null) => value
  ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
  : 'Not recorded';
const dateTimeFormat = (value?: string | null) => value
  ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
  : 'Not recorded';
const riskLabel = (risk: string) => ({
  stable: 'No listed prompt', monitor: 'Monitor symptoms',
  clinical_review: 'Consider clinical review', urgent: 'Seek urgent care',
}[risk] ?? 'Review symptoms');
const symptomLabel: Record<SymptomLevel, string> = {
  none: 'None', mild: 'Mild', moderate: 'Moderate', severe: 'Severe', unknown: 'Unsure',
};

type SpeechRecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechRecognitionEventLike = { resultIndex: number; results: ArrayLike<SpeechRecognitionResult> };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function WoundCareGuidance() {
  return <section className="surface p-5 md:p-6" aria-labelledby="wound-care-guidance-title">
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f0eb] text-[#2c6d64]"><Stethoscope size={19} /></span>
      <div>
        <p className="eyebrow">General information</p>
        <h2 id="wound-care-guidance-title" className="display mt-1 text-xl font-bold">Wound care &amp; warning signs</h2>
        <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">For a minor cut or scrape, wash your hands, gently rinse the wound with clean running water and mild soap, apply firm direct pressure with clean gauze if it is bleeding, and cover it with a clean dressing. Follow a clinician’s instructions for larger or deeper wounds.</p>
      </div>
    </div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl bg-[#f4f1e8] p-4">
        <h3 className="text-sm font-bold text-[#203a39]">Contact a healthcare professional</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-[#5f706a]">
          <li>Redness, warmth, swelling, or pain is increasing; there is pus, a red streak, or fever.</li>
          <li>The wound is deep or large, from a bite or puncture, has something embedded, or affects feeling or movement.</li>
          <li>Ask whether tetanus vaccination is up to date, especially after a dirty or puncture wound.</li>
        </ul>
      </div>
      <div className="rounded-xl bg-[#f8f0e2] p-4">
        <h3 className="text-sm font-bold text-[#725c40]">Get urgent or emergency help</h3>
        <p className="mt-2 text-xs leading-relaxed text-[#725c40]">Seek urgent help for severe bleeding that does not stop with firm, direct pressure, rapidly worsening symptoms, loss of feeling or function, or if the person seems seriously unwell. Use your local emergency number when needed.</p>
      </div>
    </div>
    <p className="mt-4 text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">This is general first-aid information, not personalized medical advice. The app cannot examine wounds or confirm that one is safe. <a className="font-semibold text-[hsl(var(--primary))] underline underline-offset-2" href="https://medlineplus.gov/ency/article/000043.htm" target="_blank" rel="noreferrer">Read MedlinePlus: cuts and puncture wounds</a>.</p>
  </section>;
}

function RiskNextStep({ level }: { level: string }) {
  const guidance: Record<string, { title: string; text: string }> = {
    urgent: {
      title: 'Seek urgent medical help now',
      text: 'This combination of reported symptoms needs prompt professional assessment. If you feel seriously unwell or have severe bleeding, contact local emergency services.',
    },
    clinical_review: {
      title: 'Contact a healthcare professional promptly',
      text: 'One or more warning symptoms were recorded. A clinician can assess what is happening and advise you on care.',
    },
    monitor: {
      title: 'Keep tracking changes',
      text: 'A symptom change was recorded. Contact a healthcare professional if it worsens, new warning signs appear, or you are concerned.',
    },
    stable: {
      title: 'No listed warning symptoms were selected',
      text: 'This does not confirm that a wound is safe. Seek professional advice if you have concerns or notice a change.',
    },
  };
  const item = guidance[level] ?? guidance.monitor;
  return <div className={`mt-3 rounded-lg p-3 text-xs leading-relaxed ${level === 'urgent' || level === 'clinical_review' ? 'bg-[#f8e9e5] text-[#803a34]' : 'bg-[#f4f1e8] text-[#5f706a]'}`} role="note">
    <b className="block">{item.title}</b>{item.text}
  </div>;
}

function Brand({ light = false }: { light?: boolean }) {
  return <Link href="/" className={`brand-lockup ${light ? 'brand-light' : ''}`} aria-label="Smart Wound AI home">
    <span className="brand-mark"><HeartPulse size={20} strokeWidth={2.1} /></span>
    <span><b>smart wound</b><small>PRIVATE HEALTH JOURNAL</small></span>
  </Link>;
}

function Button({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`btn ${className}`} {...props}>{children}</button>;
}

function PageFrame({ children, active }: { children: ReactNode; active: string }) {
  const { signOut } = useClerk();
  const navItems = [
    { href: '/dashboard', title: 'Overview', icon: Activity },
    { href: '/wounds', title: 'My wounds', icon: HeartPulse },
    { href: '/find-care', title: 'Find care', icon: MapPin },
  ];
  return <div className="app-shell md:flex">
    <aside className="sidebar desktop-sidebar fixed inset-y-0 left-0 z-20 flex w-[252px] flex-col px-5 py-6">
      <Brand light />
      <div className="mt-12 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-white/45">Your workspace</div>
      <nav className="mt-3 grid gap-1" aria-label="Main navigation">
        {navItems.map(({ href, title, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${active === href ? 'active' : ''}`} data-testid={`nav-${title.toLowerCase().replaceAll(' ', '-')}`}><Icon size={18} />{title}</Link>)}
      </nav>
      <div className="mt-auto rounded-2xl border border-white/10 bg-white/[.06] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole size={16} className="text-[#f1a773]" />Your records stay private</div>
        <p className="mt-2 text-xs leading-relaxed text-white/60">Only you can see your wound journal unless you create a temporary report link.</p>
      </div>
      <button className="mt-4 rounded-lg px-3 py-2 text-left text-sm text-white/60 hover:bg-white/10 hover:text-white" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out">Sign out</button>
    </aside>
    <main className="content-wrap min-h-[100dvh] w-full md:ml-[252px]">
      <header className="flex h-[76px] items-center justify-between border-b border-[hsl(var(--border))] px-5 md:px-10">
        <div className="md:hidden"><Brand /></div>
        <div className="hidden text-sm font-semibold text-[hsl(var(--muted-foreground))] md:block">Your private care journal</div>
        <div className="flex items-center gap-1">
          <button className="btn btn-text min-h-10 text-xs md:hidden" onClick={() => signOut({ redirectUrl: basePath || '/' })} aria-label="Sign out" data-testid="button-sign-out-mobile"><LogOut size={17} /></button>
          <Link href="/wounds/new" className="btn btn-primary min-h-10 px-3 text-xs md:px-4 md:text-sm" data-testid="button-new-update"><Plus size={16} /><span className="hidden sm:inline">Add a wound update</span><span className="sm:hidden">Add update</span></Link>
        </div>
      </header>
      <div className="mx-auto max-w-[1180px] px-5 py-8 md:px-10 md:py-10">{children}</div>
    </main>
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {navItems.map(({ href, title, icon: Icon }) => <Link key={href} href={href} className={active === href ? 'active' : ''}><Icon /><span>{title}</span></Link>)}
    </nav>
  </div>;
}

function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return <div className="grid gap-4" aria-label="Loading">
    {Array.from({ length: rows }).map((_, i) => <div className="surface p-5" key={i}><div className="skeleton h-4 w-1/3" /><div className="skeleton mt-4 h-3 w-2/3" /><div className="skeleton mt-5 h-20 w-full" /></div>)}
  </div>;
}

function QueryError({ retry, title = 'We couldn’t load this just now.' }: { retry: () => void; title?: string }) {
  return <div role="alert" className="surface flex flex-col items-start gap-3 p-6">
    <CircleAlert className="text-[#a64239]" size={22} /><h2 className="font-bold">{title}</h2>
    <p className="max-w-lg text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">Your information has not been changed. Check your connection and try again.</p>
    <Button className="btn-soft" onClick={retry} data-testid="button-retry">Try again</Button>
  </div>;
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="surface flex flex-col items-center px-6 py-12 text-center">
    <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><HeartPulse size={25} /></div>
    <h2 className="display text-2xl font-bold">{title}</h2><p className="mt-2 max-w-md text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{body}</p>
    {action && <div className="mt-6">{action}</div>}
  </div>;
}

function Home() {
  return <div className="min-h-[100dvh] overflow-hidden">
    <header className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-5 md:px-10">
      <Brand />
      <div className="flex items-center gap-2"><Link href="/sign-in" className="btn btn-text">Sign in</Link><Link href="/sign-up" className="btn btn-primary" data-testid="link-create-account">Create account <ArrowRight size={16} /></Link></div>
    </header>
    <main>
      <section className="relative mx-auto grid max-w-[1240px] items-center gap-10 px-5 pb-16 pt-10 md:grid-cols-[1.05fr_.95fr] md:px-10 md:pb-28 md:pt-16">
        <div className="animate-rise relative z-10">
          <p className="eyebrow flex items-center gap-2"><ShieldCheck size={16} />A clearer record, on your terms</p>
          <h1 className="display mt-5 max-w-[690px] text-[clamp(3.25rem,7.3vw,6.6rem)] font-extrabold leading-[.94] text-[#203a39]">Care starts with <span className="text-[#2c6d64]">noticing.</span></h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#586c69]">Keep a private record of changes over time. Share a short-lived, read-only report when you choose to speak with a clinician.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link href="/sign-up" className="btn btn-primary px-5 py-3" data-testid="link-start-journal">Start your journal <ArrowRight size={17} /></Link><a href="#how-it-works" className="btn btn-soft px-5 py-3">How it works</a></div>
          <div className="mt-8 flex items-center gap-3 text-sm text-[#61716e]"><LockKeyhole size={16} className="text-[#2c6d64]" /><span>Your photos and notes are private to your account.</span></div>
        </div>
        <div className="animate-rise animate-delay-1 relative mx-auto w-full max-w-[520px]">
          <div className="absolute -right-8 -top-7 h-36 w-36 rounded-full bg-[#e8b28a]/35 blur-2xl" />
          <div className="relative rounded-[2rem] border border-[#d8d9ce] bg-[#e5eee8] p-4 shadow-[0_25px_70px_rgba(28,68,61,.12)] md:p-6">
            <div className="rounded-[1.45rem] bg-[#fffdf8] p-5 md:p-7">
              <div className="flex items-center justify-between border-b border-[#e6e2d9] pb-4"><div><div className="eyebrow">Wound journal</div><div className="mt-1 font-bold text-[#203a39]">A simple timeline</div></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8f0eb] text-[#2c6d64]"><CalendarDays size={19} /></span></div>
              <div className="relative mt-5 space-y-5 before:absolute before:bottom-2 before:left-[8px] before:top-2 before:w-px before:bg-[#d8e3dc]">
                {[['Today', 'Record what has changed', 'Notes, symptoms, and optional photos'], ['Over time', 'See your entries together', 'A timeline to help you remember'], ['When you choose', 'Share a temporary report', 'Read-only access that expires']].map(([tag, title, sub], i) => <div className="relative flex gap-4" key={tag}><span className={`z-10 mt-1 h-[17px] w-[17px] rounded-full border-[4px] ${i === 0 ? 'border-[#2c6d64] bg-[#e7f1ed]' : 'border-[#d9e5dd] bg-[#fffdf8]'}`} /><div><span className="font-mono text-[10px] uppercase tracking-wider text-[#7b8a85]">{tag}</span><div className="mt-1 text-sm font-bold text-[#203a39]">{title}</div><p className="mt-1 text-xs text-[#77837f]">{sub}</p></div></div>)}
              </div>
              <div className="mt-6 flex items-center gap-2 rounded-xl bg-[#f7f4ed] p-3 text-xs leading-relaxed text-[#66726e]"><Shield size={15} className="shrink-0 text-[#2c6d64]" />Symptom prompts are not a diagnosis and cannot replace care from a clinician.</div>
            </div>
          </div>
          <div className="absolute -bottom-5 -left-4 hidden items-center gap-3 rounded-2xl border border-[#e3dfd5] bg-[#fffdf8] px-4 py-3 shadow-lg sm:flex"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#e8f0eb] text-[#2c6d64]"><LockKeyhole size={17} /></span><span><b className="block text-xs text-[#203a39]">Private by default</b><small className="text-[10px] text-[#71807c]">You control every share</small></span></div>
        </div>
      </section>
      <section id="how-it-works" className="bg-[#e9efea] py-16 md:py-20"><div className="mx-auto max-w-[1160px] px-5 md:px-10">
        <div className="max-w-xl"><p className="eyebrow">A thoughtful record</p><h2 className="display mt-3 text-4xl font-bold md:text-5xl">Useful context. No guesswork.</h2><p className="mt-4 leading-relaxed text-[#61716e]">Smart Wound AI helps organize what you observe. It does not analyze photos, diagnose a condition, or promise an outcome.</p></div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[{ n: '01', icon: Clipboard, title: 'Write it down', body: 'Record pain, visible symptoms, and what you want to remember. Add photos only if you choose.' }, { n: '02', icon: Activity, title: 'Notice the pattern', body: 'Cautious prompts are based on the symptoms you enter—not image analysis or a diagnosis.' }, { n: '03', icon: ShieldCheck, title: 'Share selectively', body: 'Create a read-only report with the details you select. Its access expires on a schedule.' }].map(({ n, icon: Icon, title, body }) => <article className="rounded-2xl border border-[#dce1d9] bg-[#fffdf8] p-6 md:p-7" key={n}><div className="flex items-center justify-between"><span className="font-mono text-xs text-[#9a9d90]">{n} / 03</span><Icon className="text-[#2c6d64]" size={20} /></div><h3 className="display mt-7 text-2xl font-bold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-[#657571]">{body}</p></article>)}
        </div>
      </div></section>
      <section className="mx-auto grid max-w-[1160px] gap-8 px-5 py-16 md:grid-cols-[.8fr_1.2fr] md:items-center md:px-10 md:py-20">
        <div><p className="eyebrow">Your control, always</p><h2 className="display mt-3 text-4xl font-bold">Private until you decide otherwise.</h2></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[[LockKeyhole, 'Private journal', 'Records are tied to your signed-in account.'], [Clock3, 'Temporary links', 'Every clinician report is read-only and time-limited.'], [Camera, 'Optional photos', 'Choose whether photos are part of a report.'], [Stethoscope, 'Care is human', 'Use this journal alongside—not instead of—professional care.']].map(([Icon, title, body]) => {
            const IconComponent = Icon as typeof LockKeyhole;
            return <div className="flex gap-3 rounded-xl bg-[#f0eee5] p-4" key={title as string}><IconComponent className="mt-1 shrink-0 text-[#2c6d64]" size={19} /><div><b className="text-sm">{title as string}</b><p className="mt-1 text-xs leading-relaxed text-[#6d7a75]">{body as string}</p></div></div>;
          })}
        </div>
      </section>
      <section className="px-5 pb-16 md:px-10"><div className="mx-auto flex max-w-[1160px] flex-col gap-5 rounded-[1.5rem] bg-[#285f58] p-7 text-[#f6f3e9] md:flex-row md:items-center md:justify-between md:p-10"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#c3d8ce]">Start with one entry</p><h2 className="display mt-2 text-3xl font-bold md:text-4xl">Your observations matter.</h2></div><Link href="/sign-up" className="btn min-h-12 bg-[#efad7c] px-5 font-bold text-[#3e2a1c] hover:bg-[#f4bd94]" data-testid="link-create-private-journal">Create a private journal <ArrowRight size={17} /></Link></div></section>
    </main>
    <footer className="border-t border-[#e3dfd5] py-6"><div className="mx-auto flex max-w-[1160px] flex-col justify-between gap-3 px-5 text-xs text-[#71807c] md:flex-row md:px-10"><span>Smart Wound AI · A private symptom journal</span><span>Not for emergencies. If you may need urgent help, contact local emergency services.</span></div></footer>
  </div>;
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <div className="min-h-[100dvh] bg-[hsl(var(--background))] p-6"><div className="mx-auto mt-24 max-w-xl"><div className="skeleton h-10 w-48" /><div className="skeleton mt-8 h-24 w-full" /><div className="skeleton mt-3 h-20 w-4/5" /></div></div>;
  return isSignedIn ? <Redirect to="/dashboard" /> : <Home />;
}

function Protected({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <div className="min-h-[100dvh] p-6 md:ml-[252px]"><div className="mx-auto mt-16 max-w-2xl"><div className="skeleton h-8 w-1/3" /><div className="skeleton mt-5 h-20 w-full" /><div className="skeleton mt-4 h-40 w-full" /></div></div>;
  return isSignedIn ? children : <Redirect to="/" />;
}

function DashboardPage() {
  const query = useGetDashboard();
  const dashboard = query.data;
  return <PageFrame active="/dashboard">
    <div className="animate-rise flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow">Your care journal</p><h1 className="display mt-2 text-4xl font-extrabold md:text-5xl">A clearer picture, over time.</h1><p className="mt-3 max-w-xl text-[hsl(var(--muted-foreground))]">Keep your observations together. Your notes can help you prepare for a conversation with a clinician.</p></div><Link href="/wounds/new" className="btn btn-primary shrink-0" data-testid="button-start-record"><Plus size={17} />Record a wound</Link></div>
    <div className="mt-8 grid gap-4 sm:grid-cols-3">
      {[['Wounds tracked', dashboard?.woundCount ?? 0, HeartPulse], ['Journal entries', dashboard?.updateCount ?? 0, Clipboard], ['Most recent entry', dashboard?.latestUpdate ? dateFormat(dashboard.latestUpdate.createdAt) : '—', CalendarDays]].map(([label, value, Icon]) => {
        const IconComponent = Icon as typeof HeartPulse;
        return <div className="surface flex items-center gap-4 p-5" key={label as string}><span className="grid h-11 w-11 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><IconComponent size={20} /></span><div><div className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">{label as string}</div><div className="mt-1 font-mono text-xl font-medium">{value as string | number}</div></div></div>;
      })}
    </div>
    <div className="mt-10 flex items-center justify-between"><div><p className="eyebrow">Your records</p><h2 className="display mt-1 text-2xl font-bold">Wound timeline</h2></div><Link href="/wounds" className="inline-flex items-center gap-1 text-sm font-bold text-[hsl(var(--primary))]">All wounds <ChevronRight size={16} /></Link></div>
    <div className="mt-4">
      {query.isLoading && <LoadingBlock rows={2} />}
      {query.isError && <QueryError retry={() => void query.refetch()} />}
      {query.isSuccess && dashboard?.wounds.length === 0 && <EmptyState title="Your journal starts here." body="Add a wound record when you're ready. You can keep notes over time and choose what, if anything, to share." action={<Link href="/wounds/new" className="btn btn-primary"><Plus size={16} />Add a wound</Link>} />}
      {query.isSuccess && dashboard && dashboard.wounds.length > 0 && <div className="grid gap-3">{dashboard.wounds.slice(0, 4).map(wound => <WoundCard wound={wound} key={wound.id} />)}</div>}
    </div>
    <div className="mt-8 flex gap-3 rounded-2xl border border-[#e6d8c3] bg-[#f8f0e2] p-4 text-sm leading-relaxed text-[#725c40]"><CircleAlert size={18} className="mt-0.5 shrink-0" /><p><b>Important:</b> Symptom prompts are decision-support only, not a diagnosis. Contact a healthcare professional if you have concerns. For a medical emergency, call your local emergency number.</p></div>
     <div className="mt-6"><WoundCareGuidance /></div>
  </PageFrame>;
}

function WoundCard({ wound }: { wound: import('@workspace/api-client-react').Wound }) {
  return <Link href={`/wounds/${wound.id}`} className="surface group flex flex-col gap-3 p-5 no-underline transition hover:-translate-y-0.5 hover:border-[#adc7b9] sm:flex-row sm:items-center sm:justify-between" data-testid={`card-wound-${wound.id}`}>
    <div><div className="flex items-center gap-2"><h3 className="font-bold text-[hsl(var(--foreground))]">{wound.name}</h3>{wound.latestUpdate && <RiskBadge level={wound.latestUpdate.riskLevel} />}</div><p className="mt-1 flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))]"><MapPin size={14} />{wound.bodySite}</p></div>
    <div className="flex items-center justify-between gap-8 text-sm text-[hsl(var(--muted-foreground))] sm:justify-end"><span>{wound.updateCount} {wound.updateCount === 1 ? 'entry' : 'entries'}</span><span>{wound.latestUpdate ? dateFormat(wound.latestUpdate.createdAt) : `Started ${dateFormat(wound.createdAt)}`}</span><ChevronRight className="text-[hsl(var(--primary))] transition group-hover:translate-x-1" size={18} /></div>
  </Link>;
}

function RiskBadge({ level }: { level: string }) {
  const Icon = level === 'urgent' || level === 'clinical_review' ? CircleAlert : level === 'monitor' ? ArrowDownRight : CheckCircle2;
  return <span className={`risk-pill risk-${level}`}><Icon size={13} />{riskLabel(level)}</span>;
}

function WoundsPage() {
  const query = useListWounds();
  return <PageFrame active="/wounds">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow">Your records</p><h1 className="display mt-2 text-4xl font-extrabold">My wounds</h1><p className="mt-2 text-[hsl(var(--muted-foreground))]">Private records you can update as things change.</p></div><Link href="/wounds/new" className="btn btn-primary"><Plus size={17} />Add a wound</Link></div>
    <div className="mt-8">{query.isLoading && <LoadingBlock rows={3} />}{query.isError && <QueryError retry={() => void query.refetch()} />}{query.isSuccess && query.data.length === 0 && <EmptyState title="No wound records yet." body="When you create a record, it will appear here. Your account starts with no sample or pre-filled patient records." action={<Link href="/wounds/new" className="btn btn-primary"><Plus size={16} />Create your first record</Link>} />}{query.isSuccess && query.data.length > 0 && <div className="grid gap-3">{query.data.map(wound => <WoundCard key={wound.id} wound={wound} />)}</div>}</div>
  </PageFrame>;
}

function CreateWoundPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const create = useCreateWound();
  const [name, setName] = useState('');
  const [bodySite, setBodySite] = useState('');
  const [formError, setFormError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); setFormError('');
    if (!name.trim() || !bodySite.trim()) { setFormError('Add a name and body area to continue.'); return; }
    try {
      const wound = await create.mutateAsync({ data: { name: name.trim(), bodySite: bodySite.trim() } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListWoundsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }),
      ]);
      setLocation(`/wounds/${wound.id}`);
    } catch { setFormError('We couldn’t save this record. Please try again.'); }
  }
  return <PageFrame active="/wounds"><Link href="/wounds" className="inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--muted-foreground))]"><ArrowLeft size={16} />Back to wounds</Link><div className="mx-auto mt-6 max-w-[680px]"><p className="eyebrow">New private record</p><h1 className="display mt-2 text-4xl font-extrabold">Start a wound record.</h1><p className="mt-3 leading-relaxed text-[hsl(var(--muted-foreground))]">Give it a name you’ll recognize and note where it is. After creating the record, choose “Add update” to record symptoms, attach private photos, or describe changes by voice.</p>
    <form onSubmit={submit} className="surface mt-7 space-y-5 p-5 md:p-7">
      <div><label className="label" htmlFor="wound-name">Name for this record</label><input id="wound-name" className="field" placeholder="For example, small cut on my hand" maxLength={100} value={name} onChange={e => setName(e.target.value)} required data-testid="input-wound-name" /></div>
      <div><label className="label" htmlFor="body-site">Body area</label><input id="body-site" className="field" placeholder="For example, left forearm" maxLength={100} value={bodySite} onChange={e => setBodySite(e.target.value)} required data-testid="input-body-site" /></div>
      <div className="flex gap-3 rounded-xl bg-[#f4f1e8] p-4 text-xs leading-relaxed text-[#68756e]"><LockKeyhole size={16} className="mt-0.5 shrink-0 text-[hsl(var(--primary))]" />This record is private to your account. A report is only created if you later choose to share one.</div>
      {formError && <p role="alert" className="text-sm font-semibold text-[#a64239]">{formError}</p>}
      <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row"><Link href="/wounds" className="btn btn-soft">Cancel</Link><Button type="submit" className="btn-primary" disabled={create.isPending} data-testid="button-save-wound">{create.isPending ? 'Saving record…' : 'Create record'} <ArrowRight size={16} /></Button></div>
    </form></div></PageFrame>;
}

const symptomOptions: SymptomLevel[] = ['none', 'mild', 'moderate', 'severe', 'unknown'];

function WoundDetailPage() {
  const [, params] = useRoute('/wounds/:id');
  const id = Number(params?.id);
  const woundQuery = useGetWound(id, { query: { queryKey: getGetWoundQueryKey(id), enabled: Number.isFinite(id) && id > 0 } });
  const updatesQuery = useListWoundUpdates(id, { query: { queryKey: getListWoundUpdatesQueryKey(id), enabled: Number.isFinite(id) && id > 0 } });
  const [showUpdate, setShowUpdate] = useState(false);
  const [showShare, setShowShare] = useState(false);
  if (!Number.isFinite(id) || id <= 0) return <Redirect to="/wounds" />;
  return <PageFrame active="/wounds">
    <Link href="/wounds" className="inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--muted-foreground))]"><ArrowLeft size={16} />All wounds</Link>
    {woundQuery.isLoading && <div className="mt-6"><LoadingBlock rows={2} /></div>}
    {woundQuery.isError && <div className="mt-6"><QueryError retry={() => void woundQuery.refetch()} title="We couldn’t open this wound record." /></div>}
    {woundQuery.data && <div className="animate-rise">
      <div className="mt-5 flex flex-col justify-between gap-5 border-b border-[hsl(var(--border))] pb-7 sm:flex-row sm:items-end"><div><p className="eyebrow">Wound record · created {dateFormat(woundQuery.data.createdAt)}</p><h1 className="display mt-2 text-4xl font-extrabold md:text-5xl">{woundQuery.data.name}</h1><p className="mt-2 flex items-center gap-2 text-[hsl(var(--muted-foreground))]"><MapPin size={16} />{woundQuery.data.bodySite}</p></div><div className="flex flex-wrap gap-2"><Button className="btn-soft" onClick={() => setShowShare(v => !v)} data-testid="button-share-report"><Shield size={16} />Share report</Button><Button className="btn-primary" onClick={() => setShowUpdate(v => !v)} data-testid="button-add-update"><Plus size={16} />Add update</Button></div></div>
      {showUpdate && <UpdateForm woundId={id} onClose={() => setShowUpdate(false)} />}
      {showShare && <ShareForm woundId={id} onClose={() => setShowShare(false)} />}
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]"><section><div className="flex items-baseline justify-between"><div><p className="eyebrow">Over time</p><h2 className="display mt-1 text-2xl font-bold">Update history</h2></div><span className="text-xs text-[hsl(var(--muted-foreground))]">{updatesQuery.data?.length ?? 0} entries</span></div>
        <div className="mt-5">{updatesQuery.isLoading && <LoadingBlock rows={2} />}{updatesQuery.isError && <QueryError retry={() => void updatesQuery.refetch()} />}{updatesQuery.isSuccess && updatesQuery.data.length === 0 && <EmptyState title="No updates yet." body="Add what you’re noticing today. Future entries will build your private timeline." action={<Button className="btn-primary" onClick={() => setShowUpdate(true)}><Plus size={16} />Add first update</Button>} />}{updatesQuery.isSuccess && updatesQuery.data.length > 0 && <div className="relative space-y-4 before:absolute before:bottom-8 before:left-[11px] before:top-5 before:w-px before:bg-[#d8e3dc]">{updatesQuery.data.map(update => <UpdateCard update={update} key={update.id} />)}</div>}</div>
      </section><aside className="h-fit"><WoundCareGuidance /></aside></div>
    </div>}
  </PageFrame>;
}

function UpdateCard({ update }: { update: import('@workspace/api-client-react').WoundUpdate }) {
  const flags = [update.fever && 'Fever', update.bleeding && 'Bleeding', update.odor && 'Odor', update.rapidWorsening && 'Rapid worsening'].filter((flag): flag is string => Boolean(flag));
  return <article className="surface relative ml-7 p-5" data-testid={`card-update-${update.id}`}><span className="absolute -left-[34px] top-6 h-[14px] w-[14px] rounded-full border-[3px] border-[#2c6d64] bg-[hsl(var(--background))]" />
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{dateTimeFormat(update.createdAt)}</div><div className="mt-2"><RiskBadge level={update.riskLevel} /><RiskNextStep level={update.riskLevel} /></div></div><div className="text-sm font-semibold">Pain: {update.painLevel}/10</div></div>
    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3"><SymptomItem label="Swelling" value={update.swelling} /><SymptomItem label="Redness" value={update.redness} /><SymptomItem label="Discharge" value={update.discharge} /></div>
    {flags.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{flags.map(flag => <span className="rounded-full bg-[#f6e5e1] px-2.5 py-1 text-xs font-semibold text-[#963e37]" key={flag}>{flag}</span>)}</div>}
    {update.riskReasons.length > 0 && <div className="mt-4 rounded-lg bg-[#f7f4ed] p-3"><p className="text-xs font-bold">Why this prompt appeared</p><ul className="mt-1 list-inside list-disc text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{update.riskReasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul><p className="mt-2 text-[10px] leading-relaxed text-[hsl(var(--muted-foreground))]">This symptom-based prompt is not a medical assessment.</p></div>}
    {update.notes && <p className="mt-4 whitespace-pre-wrap border-t border-[hsl(var(--border))] pt-4 text-sm leading-relaxed">{update.notes}</p>}
    {update.imagePaths.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{update.imagePaths.map(path => <PrivateImage path={path} key={path} />)}</div>}
  </article>;
}

function SymptomItem({ label, value }: { label: string; value: SymptomLevel | null }) {
  return <div><span className="text-[hsl(var(--muted-foreground))]">{label}</span><b className="ml-1.5">{value ? symptomLabel[value] : 'Not shared'}</b></div>;
}

function PrivateImage({ path }: { path: string }) {
  const [unavailable, setUnavailable] = useState(false);
  if (unavailable) return <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-[hsl(var(--muted))] p-2 text-center text-[10px] leading-tight text-[hsl(var(--muted-foreground))]">Photo unavailable</div>;
  return <img src={`/api/storage${path}`} alt="Patient-provided wound photo" className="h-24 w-24 rounded-lg border border-[hsl(var(--border))] object-cover" onError={() => setUnavailable(true)} />;
}

function UpdateForm({ woundId, onClose }: { woundId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const create = useCreateWoundUpdate();
  const requestUpload = useRequestUploadUrl();
  const photoPickerRef = useRef<HTMLInputElement>(null);
  const cameraPickerRef = useRef<HTMLInputElement>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [painLevel, setPainLevel] = useState(0);
  const [swelling, setSwelling] = useState<SymptomLevel>('unknown');
  const [redness, setRedness] = useState<SymptomLevel>('unknown');
  const [discharge, setDischarge] = useState<SymptomLevel>('unknown');
  const [bleeding, setBleeding] = useState(false);
  const [fever, setFever] = useState(false);
  const [odor, setOdor] = useState(false);
  const [rapidWorsening, setRapidWorsening] = useState(false);
  const [notes, setNotes] = useState('');
  const [dictatedText, setDictatedText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<{ file: File; url: string }[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [speechMessage, setSpeechMessage] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const previews = files.map(file => ({ file, url: URL.createObjectURL(file) }));
    setPhotoPreviews(previews);
    return () => previews.forEach(preview => URL.revokeObjectURL(preview.url));
  }, [files]);
  useEffect(() => () => speechRecognitionRef.current?.stop(), []);

  function addPhotos(selected: File[]) {
    if (selected.length === 0) return;
    const remaining = Math.max(0, 3 - files.length);
    setFiles(current => [...current, ...selected].slice(0, 3));
    if (selected.length > remaining) setError('You can attach up to three photos. Extra selections were not added.');
    else if (selected.some(file => file.size > 10 * 1024 * 1024)) setError('Each photo must be 10 MB or smaller.');
    else if (selected.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) setError('Choose a JPEG, PNG, or WebP photo.');
    else setError('');
  }

  function toggleVoiceInput() {
    if (isListening) {
      speechRecognitionRef.current?.stop();
      setIsListening(false);
      setSpeechMessage('Voice input stopped.');
      return;
    }
    const browserWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SpeechRecognitionAPI = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setSpeechMessage('Voice typing is not supported by this browser. You can type in the notes box instead.');
      return;
    }
    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = navigator.language || 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = event => {
        let finalText = '';
        let interimText = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (!result) continue;
          if (result.isFinal) finalText += result[0].transcript;
          else interimText += result[0].transcript;
        }
        const cleanedFinal = finalText.trim();
        const acceptedText = cleanedFinal.slice(0, Math.max(0, 3000 - notes.length));
        if (acceptedText) {
          setNotes(current => `${current.trimEnd()}${current.trim() ? ' ' : ''}${acceptedText}`.slice(0, 3000));
          setDictatedText(current => `${current.trimEnd()}${current.trim() ? ' ' : ''}${acceptedText}`.slice(0, 3000));
        }
        if (interimText.trim()) setSpeechMessage(`Listening: ${interimText.trim()}`);
        else if (acceptedText) setSpeechMessage('Words added to your notes.');
        else if (cleanedFinal) setSpeechMessage('Your notes are full. Remove some text before dictating more.');
      };
      recognition.onerror = event => {
        setIsListening(false);
        const message = event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Microphone access was blocked. Allow microphone access in your browser settings, or type your notes.'
          : event.error === 'no-speech'
            ? 'No speech was detected. Try again or type your notes.'
            : 'Voice input stopped. You can continue typing your notes.';
        setSpeechMessage(message);
      };
      recognition.onend = () => {
        setIsListening(false);
        speechRecognitionRef.current = null;
      };
      speechRecognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
      setSpeechMessage('Listening. Speak clearly, then select Stop voice typing.');
    } catch {
      speechRecognitionRef.current = null;
      setIsListening(false);
      setSpeechMessage('Voice input could not start. Check microphone permission or type your notes.');
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setSaved(false);
    try {
      if (files.length > 3) throw new Error('too-many-files');
      if (files.some(file => file.size > 10 * 1024 * 1024)) throw new Error('file-too-large');
      if (files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) throw new Error('unsupported-file');
      const imagePaths: string[] = [];
      for (const file of files) {
        const contentType = file.type as UploadUrlInputContentType;
        const signed = await requestUpload.mutateAsync({ data: { name: file.name, size: file.size, contentType } });
        const response = await fetch(signed.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!response.ok) throw new Error('upload');
        imagePaths.push(signed.objectPath);
      }
      const payload: WoundUpdateInput = { painLevel, swelling, redness, discharge, bleeding, fever, odor, rapidWorsening, notes: notes.trim() || null, transcription: dictatedText.trim() || null, imagePaths };
      await create.mutateAsync({ id: woundId, data: payload });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListWoundUpdatesQueryKey(woundId) }),
        queryClient.invalidateQueries({ queryKey: getGetWoundQueryKey(woundId) }),
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListWoundsQueryKey() }),
      ]);
      setSaved(true);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : '';
      if (reason === 'too-many-files') setError('Choose no more than three photos.');
      else if (reason === 'file-too-large') setError('Each photo must be 10 MB or smaller.');
      else if (reason === 'unsupported-file') setError('Choose a JPEG, PNG, or WebP photo.');
      else setError('We couldn’t save your update. If a photo upload failed, remove it or try again. Your written answers have not been submitted.');
    }
  }
  const pending = create.isPending || requestUpload.isPending;
  if (saved) return <div role="status" className="surface mt-6 flex flex-col items-start gap-3 border-[#b9d5c6] bg-[#eef5ef] p-5"><CheckCircle2 className="text-[#276250]" /><h2 className="font-bold">Update saved to your private timeline.</h2><p className="text-sm leading-relaxed text-[#5f706a]">Any symptom prompt reflects the information recorded. It is not a diagnosis.</p><Button className="btn-soft" onClick={onClose}><Check size={16} />Done</Button></div>;
  return <form onSubmit={submit} className="surface mt-6 space-y-5 border-[#c9d9cc] p-5 md:p-7">
    <div className="flex items-start justify-between"><div><p className="eyebrow">New timeline entry</p><h2 className="display mt-1 text-2xl font-bold">What are you noticing?</h2><p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">Answer based on what you observe. “Unsure” is always okay.</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" aria-label="Close update form"><X size={19} /></button></div>
    <div><label className="label" htmlFor="pain-level">Pain level <span className="font-normal text-[hsl(var(--muted-foreground))]">(0–10)</span></label><div className="flex items-center gap-3"><input id="pain-level" type="range" min="0" max="10" value={painLevel} onChange={e => setPainLevel(Number(e.target.value))} className="w-full accent-[#2c6d64]" data-testid="input-pain-level" /><span className="grid h-10 w-10 place-items-center rounded-lg bg-[hsl(var(--secondary))] font-mono font-bold">{painLevel}</span></div></div>
    <div className="grid gap-4 sm:grid-cols-3">{[['Swelling', swelling, setSwelling], ['Redness', redness, setRedness], ['Discharge', discharge, setDischarge]].map(([label, value, setter]) => {
      const key = String(label).toLowerCase();
      return <div key={String(label)}><label className="label" htmlFor={`symptom-${key}`}>{String(label)}</label><select id={`symptom-${key}`} className="field" value={value as string} onChange={e => (setter as (v: SymptomLevel) => void)(e.target.value as SymptomLevel)} data-testid={`select-${key}`}>{symptomOptions.map(option => <option value={option} key={option}>{symptomLabel[option]}</option>)}</select></div>;
    })}</div>
    <fieldset><legend className="label">Other changes you’ve noticed</legend><div className="grid gap-2 sm:grid-cols-2">{[['Bleeding', bleeding, setBleeding], ['Fever', fever, setFever], ['Odor', odor, setOdor], ['Rapid worsening', rapidWorsening, setRapidWorsening]].map(([label, checked, setter]) => <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-[hsl(var(--border))] px-3 text-sm" key={String(label)}><input className="h-4 w-4 accent-[#2c6d64]" type="checkbox" checked={checked as boolean} onChange={e => (setter as (v: boolean) => void)(e.target.checked)} data-testid={`check-${String(label).toLowerCase().replaceAll(' ', '-')}`} />{String(label)}</label>)}</div></fieldset>
    <div>
      <div className="flex items-center justify-between gap-3"><label className="label mb-0" htmlFor="update-notes">Notes</label><span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{notes.length}/3000</span></div>
      <textarea id="update-notes" className="field mt-2 min-h-28 resize-y" maxLength={3000} value={notes} onChange={e => { setNotes(e.target.value); setDictatedText(''); }} placeholder="Anything else you’d like to remember?" data-testid="input-update-notes" />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" className={isListening ? 'btn-primary' : 'btn-soft'} onClick={toggleVoiceInput} disabled={pending} aria-pressed={isListening} data-testid="button-voice-notes">
          {isListening ? <MicOff size={16} /> : <Mic size={16} />}{isListening ? 'Stop voice typing' : 'Explain by voice'}
        </Button>
        {dictatedText && <span className="self-center text-xs text-[hsl(var(--muted-foreground))]">Dictated words are editable above.</span>}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">Voice typing depends on browser support and microphone permission. Your browser may process speech using its speech service; this app saves the transcript, not an audio recording.</p>
      {speechMessage && <p className="mt-1 text-xs text-[hsl(var(--primary))]" role="status" aria-live="polite">{speechMessage}</p>}
    </div>
    <div>
      <div><p className="label mb-1">Add wound photos <span className="font-normal text-[hsl(var(--muted-foreground))]">(optional, up to 3)</span></p><p id="photo-help" className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">JPEG, PNG, or WebP. Each image must be 10 MB or smaller. Photos are private and are not analyzed.</p></div>
      <input ref={photoPickerRef} id="update-images" type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" tabIndex={-1} aria-label="Choose wound photos" aria-describedby="photo-help" onChange={e => { addPhotos(Array.from(e.target.files ?? [])); e.currentTarget.value = ''; }} data-testid="input-update-images" />
      <input ref={cameraPickerRef} id="capture-image" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" tabIndex={-1} aria-label="Take a wound photo with your camera" aria-describedby="photo-help" onChange={e => { addPhotos(Array.from(e.target.files ?? [])); e.currentTarget.value = ''; }} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" className="btn-soft" onClick={() => photoPickerRef.current?.click()} aria-controls="update-images" data-testid="button-choose-photos"><ImagePlus size={17} />Choose photos</Button>
        <Button type="button" className="btn-soft" onClick={() => cameraPickerRef.current?.click()} aria-controls="capture-image" data-testid="button-take-photo"><Camera size={17} />Take a photo</Button>
      </div>
      {photoPreviews.length > 0 && <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2" aria-live="polite">{photoPreviews.map(({ file, url }, index) => <div className="flex min-w-0 items-center gap-3 rounded-xl border border-[hsl(var(--border))] p-2" key={`${file.name}-${file.lastModified}-${index}`}><img src={url} alt={`Preview of ${file.name}`} className="h-14 w-14 shrink-0 rounded-lg object-cover" /><span className="min-w-0 flex-1 truncate text-xs font-medium" title={file.name}>{file.name}</span><Button type="button" className="btn-text min-h-9 px-2 text-[#963e37]" onClick={() => setFiles(current => current.filter((_, photoIndex) => photoIndex !== index))} aria-label={`Remove ${file.name}`}><X size={17} /></Button></div>)}</div>}
    </div>
    <div className="rounded-xl bg-[#f7f1e5] p-4 text-xs leading-relaxed text-[#735c3e]"><b>Not medical advice.</b> Symptom prompts are limited decision-support based on your entries and cannot assess a wound or replace professional care.</div>
    {error && <p role="alert" className="text-sm font-semibold text-[#a64239]">{error}</p>}
    <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row"><Button type="button" className="btn-soft" onClick={onClose}>Cancel</Button><Button type="submit" className="btn-primary" disabled={pending} data-testid="button-submit-update">{pending ? 'Saving securely…' : 'Save update'} <ArrowRight size={16} /></Button></div>
  </form>;
}

function ShareForm({ woundId, onClose }: { woundId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const share = useCreateWoundShare();
  const revoke = useRevokeWoundShare();
  const [includeSymptoms, setIncludeSymptoms] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [includeImages, setIncludeImages] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [created, setCreated] = useState<{ id: number; token: string; expiresAt: string } | null>(null);
  const [error, setError] = useState('');
  async function createLink() {
    setError('');
    try {
      const result = await share.mutateAsync({ id: woundId, data: { includeSymptoms, includeNotes, includeImages, expiresInHours: expiresInHours as 1 | 24 | 72 | 168 | 720 } });
      setCreated(result);
      await queryClient.invalidateQueries({ queryKey: getGetWoundQueryKey(woundId) });
    } catch { setError('We couldn’t create a report link. Please try again.'); }
  }
  async function revokeLink() {
    if (!created) return;
    try {
      await revoke.mutateAsync({ id: woundId, shareId: created.id });
      setCreated(null);
      await queryClient.invalidateQueries({ queryKey: getGetWoundQueryKey(woundId) });
    } catch { setError('This link could not be revoked right now. Try again.'); }
  }
  const link = created ? `${window.location.origin}${basePath}/shared/${created.token}` : '';
  return <section className="surface mt-6 border-[#c9d9cc] p-5 md:p-7" aria-label="Create temporary report">
    <div className="flex items-start justify-between"><div><p className="eyebrow">You choose what to share</p><h2 className="display mt-1 text-2xl font-bold">Temporary clinician report</h2></div><button onClick={onClose} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" aria-label="Close share form"><X size={19} /></button></div>
    {!created ? <><p className="mt-2 max-w-xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">Anyone with the link can view this report until it expires. It is read-only; avoid sharing it in public places.</p>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">{[['Symptoms', includeSymptoms, setIncludeSymptoms], ['Your notes', includeNotes, setIncludeNotes], ['Private photos', includeImages, setIncludeImages]].map(([label, checked, setter]) => <label key={String(label)} className="flex cursor-pointer items-center gap-3 rounded-lg border border-[hsl(var(--border))] px-3 py-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#2c6d64]" checked={checked as boolean} onChange={e => (setter as (v: boolean) => void)(e.target.checked)} />{String(label)}</label>)}</div>
      <div className="mt-4 max-w-xs"><label className="label" htmlFor="share-expiry">Link expires after</label><select id="share-expiry" className="field" value={expiresInHours} onChange={e => setExpiresInHours(Number(e.target.value))}>{[[1, '1 hour'], [24, '24 hours'], [72, '3 days'], [168, '7 days'], [720, '30 days']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="mt-4 rounded-xl bg-[#f4f1e8] p-4 text-xs leading-relaxed text-[#68756e]"><LockKeyhole size={14} className="mr-1 inline" />You can revoke access by contacting support if needed. Only include information you intend to share.</div>
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-[#a64239]">{error}</p>}
      <Button className="btn-primary mt-5" onClick={() => void createLink()} disabled={share.isPending} data-testid="button-create-share">{share.isPending ? 'Creating secure link…' : 'Create read-only link'} <ArrowRight size={16} /></Button>
    </> : <div className="mt-5 rounded-xl bg-[#eef5ef] p-4"><div className="flex items-center gap-2 font-bold text-[#276250]"><CheckCircle2 size={18} />Report link created</div><p className="mt-2 text-sm text-[#586c69]">This link expires {dateTimeFormat(created.expiresAt)}.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input readOnly className="field font-mono text-xs" value={link} aria-label="Temporary report link" /><Button className="btn-soft shrink-0" onClick={() => void navigator.clipboard.writeText(link)} data-testid="button-copy-share"><Clipboard size={15} />Copy link</Button></div><p className="mt-3 text-xs leading-relaxed text-[#68756e]">Anyone with this link can view the selected information until it expires. Share it only with the intended clinician.</p><Button className="btn-text mt-3 text-[#963e37]" onClick={() => void revokeLink()} disabled={revoke.isPending} data-testid="button-revoke-share">{revoke.isPending ? 'Revoking…' : 'Revoke this link'}</Button>{error && <p role="alert" className="mt-2 text-sm font-semibold text-[#a64239]">{error}</p>}</div>}
  </section>;
}

function FindCarePage() {
  const [search, setSearch] = useState('');
  const searchPhrase = search.trim() || 'wound care near me';
  return <PageFrame active="/find-care"><p className="eyebrow">Care, in person</p><h1 className="display mt-2 text-4xl font-extrabold">Find care near you.</h1><p className="mt-3 max-w-xl leading-relaxed text-[hsl(var(--muted-foreground))]">Facility search is not configured in this app yet. We won’t show invented clinics or clinicians.</p>
    <div className="surface mt-8 max-w-2xl p-5 md:p-7"><div className="grid h-12 w-12 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><MapPin size={22} /></div><h2 className="display mt-5 text-2xl font-bold">Use a manual map search</h2><p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">Search external listings yourself and confirm services, hours, and insurance directly with the facility. This app has no Google Maps API connection.</p>
      <label className="label mt-5" htmlFor="care-search">Optional search phrase</label><input id="care-search" className="field" value={search} onChange={e => setSearch(e.target.value)} placeholder="wound care near me" data-testid="input-care-search" />
      <a className="btn btn-primary mt-4 w-full sm:w-auto" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchPhrase)}`} target="_blank" rel="noreferrer" data-testid="link-google-maps">Open Google Maps search <ArrowRight size={16} /></a><p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">Google Maps opens in a new tab. No location is collected by Smart Wound AI.</p>
    </div>
    <div className="mt-6 flex max-w-2xl gap-3 rounded-xl border border-[#e6d8c3] bg-[#f8f0e2] p-4 text-sm leading-relaxed text-[#725c40]"><CircleAlert size={17} className="mt-0.5 shrink-0" /><p>If symptoms are rapidly worsening or you may need emergency help, contact local emergency services or an appropriate healthcare professional.</p></div>
  </PageFrame>;
}

function SharedReportPage() {
  const [, params] = useRoute('/shared/:token');
  const token = params?.token ?? '';
  const query = useGetSharedReport(token, { query: { queryKey: getGetSharedReportQueryKey(token), enabled: Boolean(token) } });
  if (query.isLoading) return <div className="mx-auto min-h-[100dvh] max-w-3xl px-5 py-12"><div className="surface p-6"><div className="skeleton h-5 w-1/3" /><div className="skeleton mt-5 h-10 w-2/3" /><div className="skeleton mt-8 h-40 w-full" /></div></div>;
  if (query.isError || !query.data) return <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col justify-center px-5 py-12"><Brand /><div className="surface mt-8 p-7"><div className="grid h-12 w-12 place-items-center rounded-xl bg-[#f6e5e1] text-[#963e37]"><CircleAlert /></div><h1 className="display mt-5 text-3xl font-bold">This report isn’t available.</h1><p className="mt-3 leading-relaxed text-[hsl(var(--muted-foreground))]">The link may have expired, been revoked, or may not be valid. Ask the person who shared it for a current link. No wound details are shown here.</p><a className="btn btn-soft mt-5" href="/">Go to Smart Wound AI</a></div></div>;
  const report = query.data;
  return <main className="min-h-[100dvh] px-4 py-7 md:px-8 md:py-12"><div className="mx-auto max-w-[850px]"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><Brand /><span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#e8f0eb] px-3 py-2 text-xs font-bold text-[#2c6d64]"><LockKeyhole size={14} />Read-only temporary report</span></div>
    <section className="surface mt-7 p-5 md:p-9"><div className="eyebrow">Clinician report</div><h1 className="display mt-2 text-4xl font-extrabold">{report.woundName}</h1><p className="mt-2 flex items-center gap-2 text-[hsl(var(--muted-foreground))]"><MapPin size={16} />{report.bodySite}</p>
      <div className="mt-6 grid gap-3 rounded-xl bg-[#f4f1e8] p-4 text-xs sm:grid-cols-2"><div><span className="text-[hsl(var(--muted-foreground))]">Generated</span><p className="mt-1 font-semibold">{dateTimeFormat(report.generatedAt)}</p></div><div><span className="text-[hsl(var(--muted-foreground))]">Link expires</span><p className="mt-1 font-semibold">{dateTimeFormat(report.expiresAt)}</p></div></div>
      <div className="mt-6 flex flex-wrap gap-2">{report.includeSymptoms && <span className="risk-pill risk-stable">Symptoms included</span>}{report.includeNotes && <span className="risk-pill risk-monitor">Notes included</span>}{report.includeImages && <span className="risk-pill risk-monitor">Photos included</span>}</div>
      <div className="mt-8"><p className="eyebrow">Entries</p><h2 className="display mt-1 text-2xl font-bold">Recorded timeline</h2></div>
      {report.updates.length === 0 ? <p className="mt-5 rounded-xl bg-[hsl(var(--muted))] p-4 text-sm text-[hsl(var(--muted-foreground))]">No entries were included in this report.</p> : <div className="mt-4 space-y-4">{report.updates.map(update => <article className="rounded-xl border border-[hsl(var(--border))] p-4 md:p-5" key={update.id}><div className="flex flex-wrap items-center justify-between gap-3"><span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{dateTimeFormat(update.createdAt)}</span>{report.includeSymptoms && update.riskLevel && <RiskBadge level={update.riskLevel} />}</div>
        {report.includeSymptoms && <><div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><span className="block text-xs text-[hsl(var(--muted-foreground))]">Pain</span><b>{update.painLevel === null ? 'Not shared' : `${update.painLevel}/10`}</b></div><SymptomItem label="Swelling" value={update.swelling} /><SymptomItem label="Redness" value={update.redness} /><SymptomItem label="Discharge" value={update.discharge} /></div><div className="mt-3 flex flex-wrap gap-2 text-xs">{update.fever && <span className="risk-pill risk-monitor">Fever</span>}{update.bleeding && <span className="risk-pill risk-monitor">Bleeding</span>}{update.odor && <span className="risk-pill risk-monitor">Odor</span>}{update.rapidWorsening && <span className="risk-pill risk-clinical_review">Rapid worsening</span>}</div>{update.riskReasons.length > 0 && <p className="mt-3 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{update.riskReasons.join(' · ')}</p>}</>}
        {report.includeNotes && update.notes && <p className="mt-4 whitespace-pre-wrap border-t border-[hsl(var(--border))] pt-4 text-sm leading-relaxed">{update.notes}</p>}
        {report.includeImages && update.imagePaths.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{update.imagePaths.map(path => <PrivateImage path={path} key={path} />)}</div>}
      </article>)}</div>}
      <div className="mt-7 rounded-xl border border-[#e6d8c3] bg-[#f8f0e2] p-4 text-sm leading-relaxed text-[#725c40]"><b>Important context</b><p className="mt-1">{report.riskDisclaimer}</p><p className="mt-2">This report contains patient-entered observations. It is not a diagnosis or a substitute for clinical assessment.</p></div>
    </section><p className="mt-5 text-center text-xs text-[hsl(var(--muted-foreground))]">This private report link is temporary. Close this page when finished.</p></div></main>;
}

function SignInPage() {
  return <div className="clerk-stage"><div className="w-full max-w-[480px]"><div className="mb-5 text-center"><Brand /><p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">Your observations, private and in one place.</p></div><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div></div>;
}

function SignUpPage() {
  return <div className="clerk-stage"><div className="w-full max-w-[480px]"><div className="mb-5 text-center"><Brand /><p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">Create a private place to keep track.</p></div><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div></div>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const next = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== next) client.clear();
      prevUserIdRef.current = next;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}

function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to access your private journal' } },
      signUp: { start: { title: 'Create your private account', subtitle: 'Start recording what you notice' } },
    }}
    routerPush={to => setLocation(stripBase(to))}
    routerReplace={to => setLocation(stripBase(to), { replace: true })}
  >
    <ClerkQueryClientCacheInvalidator />
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/dashboard"><Protected><DashboardPage /></Protected></Route>
      <Route path="/wounds/new"><Protected><CreateWoundPage /></Protected></Route>
      <Route path="/wounds/:id"><Protected><WoundDetailPage /></Protected></Route>
      <Route path="/wounds"><Protected><WoundsPage /></Protected></Route>
      <Route path="/find-care"><Protected><FindCarePage /></Protected></Route>
      <Route path="/shared/:token" component={SharedReportPage} />
      <Route component={NotFound} />
    </Switch>
  </ClerkProvider>;
}

function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  return <QueryClientProvider client={queryClient}><WouterRouter base={basePath}><ClerkRoutes /></WouterRouter></QueryClientProvider>;
}

export default App;
