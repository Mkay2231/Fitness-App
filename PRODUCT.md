# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A beginner in Nigeria building muscle, logging on a phone between sets at the gym and cooking meals at home. The product serves the owner first; paying users may come later, so nothing should depend on it being a single-person tool.

## Product Purpose

Rep Ledger replaces a ₦30,000–₦75,000/month coach for the basics: it says what to train today, records sets, reps, weight and effort, logs familiar meals, tracks body weight and measurements, and reviews the week with rule-based suggestions. Success is consistent training with steady progressive overload and a weight trend that matches the chosen gain rate.

## Positioning

Deterministic, explained recommendations that never change the plan without the user's acceptance, with honest handling of missing data and nutrition values traced to cited sources (FAO West African table, USDA, labels), including Nigerian staples.

## Operating Context

- Used one-handed on a phone mid-workout, often with poor or no signal; must log offline and preserve an unfinished session.
- Meals are home-cooked and measured in household units (serving spoon, cooking spoon, cup, wrap) with grams when weighed.
- Weekly review happens at rest, on phone or desktop.

## Capabilities and Constraints

- Mobile-first installable web app (React, Dexie/IndexedDB, service worker), data stored on device; deploy target Netlify.
- Beginner full-body A/B programs (gym and home), double progression, configurable weight increments.
- Food days are complete, partial or not logged; missing data is never shown as zero.
- AI explanations planned but off; costs confirmed with the user before enabling.
- FAO food data is licensed for non-commercial use; a paid version needs FAO permission or another source.

## Brand Commitments

- Name: Rep Ledger (confirmed).
- Voice: supportive, specific and factual; Nigerian foods appear naturally.
- User-provided visual direction (binding): calm, athletic training journal; warm off-white #F6F5F1 background, deep charcoal #202420 text, forest-green #245C45 primary; white surfaces, subtle borders, minimal shadows; Inter or similar readable sans; tabular numerals for numbers.

## Evidence on Hand

No real user data, testimonials or results. Sample data must never be shown as the user's progress.

## Product Principles

1. Fast, correct logging beats features: one clear next action per screen.
2. Explain every recommendation and let the user accept or reject it.
3. Distinguish missing data from zero activity or zero intake.
4. Calculations are deterministic and tested; AI only explains recorded information.
5. Personal measurements and photos stay private.

## Accessibility & Inclusion

44px minimum touch targets, visible field labels, 16px body text, keyboard support, reduced-motion support, verified contrast for all text and interactive states.
