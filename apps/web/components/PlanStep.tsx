"use client";

import { useMemo, useState } from "react";
import { GapNote } from "@/components/plan/GapNote";
import { getCountry } from "@/lib/countries";
import { DEFAULT_COUNTRY, getCountryProfile } from "@/lib/countryProfile";
import { DESTINATIONS } from "@/lib/data";
import { buildItinerary, type ScheduledItem, type TripInput } from "@/lib/itinerary";
import { kindEmoji, SEASONS, SLOT_META, travelEmoji } from "@/lib/meta";
import { buildPackingList } from "@/lib/packing";
import type { Destination } from "@/lib/types";

interface PlanStepProps {
  input: TripInput;
  /** Catalog-derived destinations resolved via /api/destinations/resolve. */
  extraDestinations: Destination[];
}

export function PlanStep({ input, extraDestinations }: PlanStepProps) {
  const allDestinations = useMemo(
    () => [...DESTINATIONS, ...extraDestinations],
    [extraDestinations]
  );
  const destinations = useMemo(
    () =>
      input.destinationIds
        .map((id) => allDestinations.find((d) => d.id === id))
        .filter((d): d is Destination => Boolean(d)),
    [input.destinationIds, allDestinations]
  );
  const plan = useMemo(() => buildItinerary(input, allDestinations), [input, allDestinations]);
  const packing = useMemo(() => buildPackingList(input, destinations), [input, destinations]);
  /**
   * Resolved here, at render, and deliberately NOT read off `plan`.
   *
   * `plan.tips` is snapshotted into the trip when it is created, which is right
   * for advice a traveller acted on. The gap note is the opposite kind of
   * statement — it is about what *we* currently know, so it has to shrink as
   * coverage improves rather than be frozen with the trip. `input.country ??
   * DEFAULT_COUNTRY` is the same resolution `buildItinerary` and
   * `buildPackingList` use, so the note can never disagree with the tips it
   * disclaims.
   */
  const profile = useMemo(
    () => getCountryProfile(input.country ?? DEFAULT_COUNTRY),
    [input.country]
  );
  const gapNote = profile.gapNote;
  /**
   * The hop glyph, off the same profile.
   *
   * `KIND_EMOJI.travel` used to be `🚄` for every country, so a Peruvian hop
   * titled "Travel to Cusco" was drawn with a Chinese high-speed train. The
   * glyph is a claim about a rail network and `railKmh` is where this repo
   * makes or withholds that claim — see `travelEmoji`.
   */
  const hopEmoji = travelEmoji(profile.transport.railKmh);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());

  const seasonMeta = SEASONS.find((s) => s.id === input.season);
  const travellers = input.adults + input.kids;
  /**
   * The chop is the country's, not China's — same fix as TripView.tsx's
   * hero: `Country.mark` only carries a glyph for countries that have earned
   * one, so a country without a mark gets no chop rather than China's 启程.
   */
  const country = getCountry(input.country ?? DEFAULT_COUNTRY);
  /**
   * The headline's name comes off the PROFILE, not off `country` above.
   *
   * `getCountry(code).name` used to fall back to the bare code — lib/countries.ts
   * curated 24 of 249 — so the headline read "Your PE itinerary". Both resolvers
   * now answer "Peru": `INGESTED_NAMES` gives the leaf a checked-in copy of the
   * artifact's names, so `getCountry` and `getCountryName` apply the same
   * hand-tuned-first order and cannot call one country two things.
   *
   * The profile stays the source here anyway. It is where every other sentence
   * on this surface gets its country name — the gap note, the packing lines,
   * the money copy — and reading the headline off a second resolver would be a
   * second thing to keep in step for no gain.
   *
   * `getCountry` is still the right source for `mark`: a chop is curated or it
   * does not exist, and there is no ingested equivalent to fall back to.
   *
   * Blank means the code is not a country at all, and the name is dropped
   * rather than replaced — "Your itinerary" says less, but nothing false.
   */
  const headline = profile.name ? `Your ${profile.name} itinerary` : "Your itinerary";

  const toggleChecked = (item: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });

  return (
    <section>
      <div className="relative overflow-hidden rounded-2xl bg-[color-mix(in_oklab,var(--accent-ink)_85%,var(--ink-0))] p-6 text-[var(--paper)] sm:p-8">
        {country.mark && (
          <span aria-hidden className="seal-round absolute right-6 top-6 hidden border-[var(--paper)]/80 text-[var(--paper)]/90 sm:inline-flex">
            {country.mark}
          </span>
        )}
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--line-1)]">Boarding pass</p>
        <h2 className="mt-2 font-display text-3xl font-bold">{headline}</h2>
        <p className="mt-3 font-mono text-sm tracking-wider text-[var(--line-1)]">
          {destinations.map((d) => d.name.toUpperCase()).join(" → ")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-white/15 px-3 py-1">
            {seasonMeta?.emoji} {seasonMeta?.label}
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1">📅 {input.days} days</span>
          <span className="rounded-full bg-white/15 px-3 py-1">
            🧳 {input.adults} adult{input.adults > 1 ? "s" : ""}
            {input.kids > 0 ? ` + ${input.kids} kid${input.kids > 1 ? "s" : ""}` : ""}
          </span>
        </div>
        {/*
          The face is `--paper`, not `white`. Its label is `--accent-ink`, which
          inverts with the ramp — dark at oklch(50%) in light, light at oklch(80%)
          in dark — so a literal white face reads 5.75:1 in light and 1.79:1 in
          dark for the same pairing. `--paper` inverts with it and is `#ffffff`
          in the light ramp, so this is unchanged in light and 9.65:1 in dark.
          The `--line-1` hover already followed the ramp and needed no change.
        */}
        <button
          type="button"
          onClick={() => window.print()}
          className="mt-5 rounded-lg bg-[var(--paper)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--line-1)] print:hidden"
        >
          🖨️ Print / save as PDF
        </button>
      </div>

      {/*
        Where the shared-trip card was. Creating a trip needs the store and
        sign-in, both retired while the app is rebuilt (phase 1, slice A), so
        this step makes no request at all. Not `role="note"`: that is the gap
        note's, below, and a screen reader should hear one disclaimer there.
        Hidden in print like the card was, since it says nothing about the trip.
      */}
      <div className="mt-6 rounded-xl border-2 border-dashed border-[var(--accent-ink)]/40 bg-[var(--paper)] p-5 print:hidden">
        <h3 className="font-display text-lg font-semibold">Shared trips are being rebuilt</h3>
        <p className="mt-1 text-sm text-[var(--ink-2)]">
          You can&apos;t save or share this plan yet. It stays on this page until the rebuilt app
          can keep it.
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-3 print:block">
        <div className="space-y-5 lg:col-span-2">
          <h3 className="font-display text-xl font-bold">Day by day</h3>
          {plan.days.map((day) => (
            <article
              key={day.day}
              className="overflow-visible rounded-xl border border-[var(--line-1)] bg-[var(--paper)] shadow-sm"
            >
              <header className="flex items-baseline justify-between px-5 pt-4">
                <p className="font-mono text-sm font-semibold uppercase tracking-widest text-[var(--accent-ink)]">
                  Day {String(day.day).padStart(2, "0")}
                </p>
                <p className="text-sm font-medium text-[var(--ink-2)]">{day.destinationName}</p>
              </header>
              <div className="relative mx-5 mt-3 border-t-2 border-dashed border-[var(--line-1)]">
                <span aria-hidden className="absolute -left-[30px] -top-2 h-4 w-4 rounded-full bg-[var(--surf-1)]" />
                <span aria-hidden className="absolute -right-[30px] -top-2 h-4 w-4 rounded-full bg-[var(--surf-1)]" />
              </div>
              <ul className="space-y-3 px-5 py-4">
                {day.items.map((item, idx) => (
                  <PlanItem key={`${day.day}-${idx}`} item={item} travelEmoji={hopEmoji} />
                ))}
              </ul>
            </article>
          ))}
        </div>

        <aside className="space-y-8">
          <div>
            <h3 className="font-display text-xl font-bold">Packing list</h3>
            <div className="mt-3 space-y-4">
              {packing.map((group) => (
                <div key={group.title} className="rounded-xl border border-[var(--line-1)] bg-[var(--paper)] p-4">
                  <p className="font-semibold">
                    <span aria-hidden>{group.emoji}</span> {group.title}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {group.items.map((item) => (
                      <li key={item}>
                        <label className="flex cursor-pointer items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked.has(item)}
                            onChange={() => toggleChecked(item)}
                            className="mt-0.5 h-4 w-4 accent-[var(--accent-ink)] print:hidden"
                          />
                          <span className={checked.has(item) ? "text-[var(--ink-2)] line-through" : ""}>
                            {item}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-display text-xl font-bold">Eat your way through</h3>
            <div className="mt-3 space-y-3">
              {destinations.map((d) => (
                <div key={d.id} className="rounded-xl border border-[var(--line-1)] bg-[var(--paper)] p-4">
                  <p className="font-semibold">
                    {d.emoji} {d.name}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {d.foods.map((f) => (
                      <span key={f} className="rounded-full bg-[var(--line-1)]/60 px-2.5 py-0.5 text-xs">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-display text-xl font-bold">Good to know</h3>
            <div className="mt-3 rounded-xl border border-[var(--line-1)] bg-[var(--paper)] p-4 text-sm">
              {plan.tips.length > 0 && (
                <ul className="space-y-2">
                  {plan.tips.map((tip) => (
                    <li key={tip} className="flex gap-2">
                      <span aria-hidden className="text-[var(--seal)]">※</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              )}
              {/* Sibling of the list, never a row in it — see GapNote's docblock. */}
              <GapNote lines={gapNote} />
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function PlanItem({ item, travelEmoji }: { item: ScheduledItem; travelEmoji: string }) {
  const slot = SLOT_META[item.slot];
  const isFiller = item.kind === "free";
  const transitEmoji = kindEmoji(item.kind, travelEmoji);
  return (
    <li className="flex gap-3">
      <span
        className="w-24 shrink-0 pt-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-2)]"
        title={slot.label}
      >
        {slot.emoji} {item.fullDay ? "All day" : slot.label}
      </span>
      <div className="min-w-0">
        <p className={isFiller ? "text-sm italic text-[var(--ink-2)]" : "text-sm font-medium"}>
          {transitEmoji && <span aria-hidden>{transitEmoji} </span>}
          {item.title}
        </p>
        {item.note && <p className="mt-0.5 text-xs text-[var(--ink-2)]">{item.note}</p>}
      </div>
    </li>
  );
}
