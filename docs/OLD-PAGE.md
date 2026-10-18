# The old front page, kept for the record

This is what `index.html` at linkedm.org said before the board was built. The page was a dark marketing page with a price list,
an "AI grant writer" demo and a "compliance gauge". None of it is on the new site, by the founder's direction
(2026-10-18): the board is free, there is no AI on it, and nothing on it speaks about taxes or a score.

**For the founder.** Whether a paid tier ever comes back is the founder's decision, and it is a **lawyer's question first**: a
Washington nonprofit that charges ministries for services has to ask counsel how that sits with its purpose and with the
501(c)(3) application before any price is shown. Until then the board stays free and shows no price, no package and no
"buy" button.

The whole old page is still in git history (`git show 67ff627:index.html`). The text below is copied from it exactly,
character for character, so nothing is lost.

## Pricing and packages (the "Platform Package Estimator" section, verbatim)

```html
<section id="pricing" class="py-16 relative border-t border-obsidian-border">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="text-center max-w-2xl mx-auto mb-12">
                    <h2 class="text-3xl font-bold text-white">Platform Package Estimator</h2>
                    <p class="text-slate-400 text-sm mt-2">Transparent pricing designed for non-profit and ministry budgets.</p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="glass-panel p-6 rounded-2xl border border-white/10 flex flex-col justify-between">
                        <div>
                            <div class="text-xs font-mono text-slate-400">STARTER</div>
                            <div class="text-2xl font-bold text-white mt-1">$499</div>
                            <p class="text-xs text-slate-400 mt-3 leading-relaxed">Essential website with online tithing setup and basic 501(c)(3) legal footer.</p>
                        </div>
                        <button onclick="openOnboardingModal()" class="w-full mt-6 py-2.5 rounded-xl text-xs font-semibold glass-panel hover:bg-white/10 border border-white/10 text-white">Select Starter</button>
                    </div>

                    <div class="glass-panel p-6 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 flex flex-col justify-between relative">
                        <div class="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full bg-emerald-500 text-[9px] font-mono font-bold text-obsidian">POPULAR</div>
                        <div>
                            <div class="text-xs font-mono text-emerald-400">PRO PLATFORM</div>
                            <div class="text-2xl font-bold text-white mt-1">$999</div>
                            <p class="text-xs text-slate-300 mt-3 leading-relaxed">Full media portal, AI grant writer access, and DisciplesAuthority.org cross-linking.</p>
                        </div>
                        <button onclick="openOnboardingModal()" class="w-full mt-6 py-2.5 rounded-xl text-xs font-semibold bg-emerald-400 text-obsidian hover:bg-emerald-300">Select Pro Platform</button>
                    </div>

                    <div class="glass-panel p-6 rounded-2xl border border-white/10 flex flex-col justify-between">
                        <div>
                            <div class="text-xs font-mono text-slate-400">ENTERPRISE ECOSYSTEM</div>
                            <div class="text-2xl font-bold text-white mt-1">$1,899</div>
                            <p class="text-xs text-slate-400 mt-3 leading-relaxed">Multi-site architecture, full $10k/mo Google grant application, and custom AI integrations.</p>
                        </div>
                        <button onclick="openOnboardingModal()" class="w-full mt-6 py-2.5 rounded-xl text-xs font-semibold glass-panel hover:bg-white/10 border border-white/10 text-white">Select Enterprise</button>
                    </div>
                </div>
            </div>
        </section>
```

## The 501(c)(3) "Tax Audit Gauge" section and its checklist (verbatim)

```html
<section id="compliance" class="py-16 relative border-t border-obsidian-border">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="text-center max-w-2xl mx-auto mb-12">
                    <div class="inline-flex items-center gap-2 text-xs font-mono text-cyan-400 mb-2 uppercase tracking-wider">
                        <i data-lucide="shield-check" class="w-4 h-4"></i> Non-Profit Verification
                    </div>
                    <h2 class="text-3xl sm:text-4xl font-bold text-white tracking-tight">501(c)(3) Tax Audit Gauge</h2>
                    <p class="text-slate-400 mt-2 text-sm">Ensure your organization passes all compliance checks required for corporate giving.</p>
                </div>

                <div class="max-w-3xl mx-auto glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 space-y-6">
                    <div class="flex items-center justify-between pb-4 border-b border-white/10">
                        <div>
                            <h3 class="text-lg font-bold text-white">Compliance Score</h3>
                            <p class="text-xs text-slate-400">Toggle active compliance items below</p>
                        </div>
                        <div class="text-right">
                            <span class="text-3xl font-mono font-extrabold text-gradient-emerald" id="audit-score-display">0%</span>
                        </div>
                    </div>

                    <div class="w-full bg-slate-800 rounded-full h-3 overflow-hidden p-0.5">
                        <div id="audit-progress-bar" class="bg-gradient-to-r from-amber-400 to-emerald-400 h-full rounded-full transition-all duration-500 w-0"></div>
                    </div>

                    <div class="space-y-3" id="audit-checklist-container"></div>
                </div>
            </div>
        </section>
```

```js
const auditItems = [
            { id: 'irs1023', text: 'Active IRS 501(c)(3) Determination Letter', weight: 30 },
            { id: 'form990', text: 'Public Form 990 Disclosures in Website Footer', weight: 25 },
            { id: 'techsoup', text: 'TechSoup Non-Profit Verification Token', weight: 20 },
            { id: 'pci', text: 'PCI-Compliant Tithing Gateway', weight: 15 },
            { id: 'disciples', text: 'DisciplesAuthority.org Platform Cross-Link', weight: 10 }
        ];
```

## The opening claim under the headline (verbatim)

```html
<p class="text-base sm:text-lg text-slate-400 max-w-3xl mx-auto mb-10 leading-relaxed">
                    Linked Ministries powers compliant web architecture, AI-driven grant writing, and direct integration into kingdom platforms like <a href="https://www.disciplesauthority.org" target="_blank" class="text-gold-400 underline font-semibold hover:text-gold-300">Disciples' Authority</a>.
                </p>
```

Other lines on the old page: the page title was "Linked Ministries | 501(c)(3) Web Infrastructure & Grant Portal"; the
headline was "Digital Infrastructure for 501(c)(3) Faith Organizations"; the grant demo section was "AI Non-Profit Grant
Proposal Generator" with the line "Instantly write structured grant applications for corporate donors, TechSoup, and Google
$10k/mo Ad Grants." and the footer line "Turnkey Non-Profit Web Infrastructure".
