import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Building2, CircleCheck, ClipboardList, FileText, ShieldCheck, WalletCards } from "lucide-react";
import { LandingWorkspaceLink } from "@/components/landing/LandingWorkspaceLink";

export const metadata: Metadata = {
  title: "Villeto for Vendors | See your business clearly",
  description: "See your orders, invoice reviews, payment progress, and buyer relationships in one Villeto vendor workspace.",
};

const insights = [
  { icon: ClipboardList, title: "Active purchase orders", description: "See the work in motion and open the orders that need your attention." },
  { icon: FileText, title: "Invoices under review", description: "Know which invoices are still awaiting a decision." },
  { icon: WalletCards, title: "Payments in progress", description: "Follow payment status without losing the related invoice." },
  { icon: CircleCheck, title: "Total paid", description: "Keep completed payments visible alongside your current work." },
];

const steps = [
  { title: "Connect", description: "Accept an invitation from a buying organization." },
  { title: "Coordinate", description: "Review orders and keep the conversation in context." },
  { title: "Invoice", description: "Submit invoices and follow their review." },
  { title: "Stay informed", description: "See updates and payment progress as work moves forward." },
];

function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" aria-label="Villeto home" className="inline-flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6ee0d5]">
      {light ? (
        <>
          <Image
            src="/images/villeto-mark.svg"
            alt=""
            width={38}
            height={38}
            priority
            className="h-[38px] w-[38px] object-contain"
          />
          <span className="text-[1.55rem] font-semibold tracking-[-0.055em] text-white">Villeto</span>
        </>
      ) : (
        <Image src="/images/logo.png" alt="Villeto" width={128} height={56} className="h-14 w-32 object-cover" />
      )}
    </Link>
  );
}

export default function RootPage() {
  return (
    <div className="overflow-hidden bg-[#f7fbfa] text-[#153744]">
      <main>
      <div className="relative bg-[#102d3a] text-white">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true"><div className="absolute -right-32 -top-56 h-[680px] w-[680px] rounded-full bg-[#1fb9ae]/12 blur-[90px]" /><div className="absolute right-[-7rem] top-[-12rem] hidden select-none text-[38rem] font-bold leading-none tracking-[-0.15em] text-white/[0.035] lg:block">V</div><div className="absolute bottom-0 left-0 h-72 w-full bg-[linear-gradient(to_right,rgba(68,176,174,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(68,176,174,0.08)_1px,transparent_1px)] bg-[size:46px_46px] [mask-image:linear-gradient(to_top,black,transparent)]" /></div>
        <header className="relative z-10 mx-auto flex w-full max-w-[1240px] items-center justify-between gap-6 px-5 py-5 sm:px-8 lg:px-10">
          <Brand light />
          <nav aria-label="Main navigation" className="hidden items-center gap-8 text-sm font-medium text-white/70 md:flex"><Link href="#insights" className="transition hover:text-white">Vendor insights</Link><Link href="#how-it-works" className="transition hover:text-white">How it works</Link><Link href="#for-buyers" className="transition hover:text-white">For buyers</Link></nav>
          <LandingWorkspaceLink variant="header" />
        </header>
          <section className="relative mx-auto max-w-[1240px] px-5 pb-28 pt-20 sm:px-8 lg:px-10 lg:pb-36 lg:pt-28" aria-labelledby="hero-title">
            <div className="relative z-10 max-w-[900px]">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#5ed8ce]/25 bg-[#2fc2b6]/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#83e2d9]"><span className="h-1.5 w-1.5 rounded-full bg-[#57d9cc]" />Built around your business</div>
              <h1 id="hero-title" className="text-[clamp(3rem,5.25vw,5.4rem)] font-semibold leading-[1.04] tracking-[-0.065em]">See your business clearly.{" "}<span className="text-[#66d9cf]">Keep work moving.</span></h1>
              <p className="mt-7 max-w-[640px] text-base leading-8 text-[#c3d5d8] sm:text-lg">See active orders, invoice reviews, and payment progress in one place. Switch between your buyers while keeping each relationship and its work in view.</p>
              <div className="mt-9 flex flex-wrap items-center gap-4"><LandingWorkspaceLink variant="primary" /><Link href="#how-it-works" className="inline-flex min-h-12 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-white transition hover:text-[#81e3d9]">See how it works <ArrowUpRight className="h-4 w-4" /></Link></div>
              <p className="mt-6 flex items-center gap-2 text-xs text-[#9eb7bc]"><ShieldCheck className="h-4 w-4 shrink-0 text-[#5ed3c8]" /> Join through an invitation from your buying organization.</p>
            </div>
          </section>
      </div>

      <section id="insights" className="scroll-mt-10 px-5 py-24 sm:px-8 lg:px-10 lg:py-32" aria-labelledby="insights-title">
        <div className="mx-auto max-w-[1160px]">
          <div className="max-w-[760px]"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#138b86]">Vendor insights</p><h2 id="insights-title" className="mt-5 text-[clamp(2.25rem,4vw,3.7rem)] font-semibold leading-[1.13] tracking-[-0.055em]">Know what needs attention. Know what has moved forward.</h2><p className="mt-5 max-w-[620px] text-base leading-8 text-[#5c7880]">Your dashboard brings the most useful signals for your selected buyer relationship into one view, so you can decide what to do next.</p></div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{insights.map(({ icon: Icon, title, description }) => <article key={title} className="rounded-[1.4rem] border border-[#dfece9] bg-white p-7 shadow-[0_10px_35px_rgba(18,60,65,0.035)]"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#e7f6f2] text-[#168f88]"><Icon className="h-6 w-6" strokeWidth={1.8} /></span><h3 className="mt-8 text-lg font-semibold tracking-[-0.035em]">{title}</h3><p className="mt-3 text-sm leading-7 text-[#607d83]">{description}</p></article>)}</div>
          <p className="mt-7 flex items-start gap-2 text-sm text-[#537278]"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[#168f88]" aria-hidden="true" />Work with more than one buyer? Switch organizations to see the right orders, invoices, and payment details for each one.</p>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-10 bg-white px-5 py-24 sm:px-8 lg:px-10 lg:py-32" aria-labelledby="workflow-title">
        <div className="mx-auto grid max-w-[1160px] gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-24">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#138b86]">One connected flow</p><h2 id="workflow-title" className="mt-5 text-[clamp(2.25rem,4vw,3.7rem)] font-semibold leading-[1.13] tracking-[-0.055em]">From the first order to the next update.</h2><p className="mt-5 max-w-[430px] text-base leading-8 text-[#5c7880]">A shared workspace makes it easier to see where work stands and what needs your attention.</p><Link href="#get-started" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[#138b86] hover:text-[#0f6864]">Getting started <ArrowRight className="h-4 w-4" /></Link></div>
          <div className="rounded-[1.8rem] border border-[#dceae7] bg-[#edf7f4] p-5 sm:p-8 lg:p-10"><ol className="space-y-1">{steps.map((step, index) => <li key={step.title} className={`flex gap-5 rounded-2xl px-3 py-4 sm:gap-7 sm:px-5 ${index === 1 ? "bg-white shadow-[0_10px_25px_rgba(18,60,65,0.06)]" : ""}`}><span className="pt-0.5 text-xs font-bold tracking-[0.12em] text-[#17988e]">0{index + 1}</span><div><h3 className="text-base font-semibold">{step.title}</h3><p className="mt-1 text-sm leading-6 text-[#668087]">{step.description}</p></div>{index === 1 && <CircleCheck className="ml-auto hidden h-5 w-5 shrink-0 text-[#1ca69e] sm:block" aria-hidden="true" />}</li>)}</ol></div>
        </div>
      </section>

      <section id="for-buyers" className="scroll-mt-10 bg-[#e7f3f0] px-5 py-20 sm:px-8 lg:px-10 lg:py-24" aria-labelledby="buyers-title"><div className="mx-auto grid max-w-[1160px] gap-10 lg:grid-cols-2 lg:items-center lg:gap-24"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#138b86]">A stronger ecosystem</p><h2 id="buyers-title" className="mt-5 text-[clamp(2.25rem,4vw,3.7rem)] font-semibold leading-[1.13] tracking-[-0.055em]">Clearer collaboration with every buyer.</h2></div><div className="space-y-5 text-base leading-8 text-[#4c6b72]"><p>Keep order questions and invoice conversations close to the work they concern. Buyers can share orders and follow progress while you keep a clear view of your own business.</p></div></div></section>

      <section id="get-started" className="scroll-mt-10 px-5 py-24 sm:px-8 lg:px-10 lg:py-32" aria-labelledby="start-title"><div className="relative mx-auto max-w-[1160px] overflow-hidden rounded-[2rem] bg-[#123947] px-7 py-14 text-white sm:px-14 lg:px-20 lg:py-20"><div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full border-[80px] border-[#41c5b9]/10" aria-hidden="true" /><div className="relative z-10 max-w-[700px]"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#74dcd1]">Start with an invitation</p><h2 id="start-title" className="mt-5 text-[clamp(2.25rem,4.2vw,4rem)] font-semibold leading-[1.12] tracking-[-0.055em]">Ready for a clearer way to work together?</h2><p className="mt-5 max-w-[600px] text-base leading-8 text-[#c3d9db]">If you already have a Villeto account, sign in to your workspace. New vendors can ask their buying organization for an invitation to join.</p><div className="mt-8 flex flex-wrap items-center gap-5"><LandingWorkspaceLink variant="primary" /><span className="text-sm text-[#bad2d5]">New here? Ask your buyer for an invite.</span></div></div></div></section>
      </main>

      <footer className="border-t border-[#dce9e6] px-5 py-7 sm:px-8 lg:px-10"><div className="mx-auto flex max-w-[1160px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><Brand /><p className="text-xs text-[#6b858b]">A connected space for buyers and vendors.</p><Link href="#get-started" className="inline-flex items-center gap-1 text-sm font-semibold text-[#177e7a] hover:text-[#0f6864]">Get started <ArrowUpRight className="h-4 w-4" /></Link></div></footer>
    </div>
  );
}
