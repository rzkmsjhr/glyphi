# Glyphi Design Direction

## Identity & Personality
- **Product**: Glyphi: System-wide AI Writing, Grammar, and Translation Assistant
- **Character**: Focused, quiet, precise, responsive. It stays invisible until summoned, then delivers clear, immediate feedback.
- **Audience**: Writers, developers, researchers, and polyglots who need immediate editing and translation without leaving their active application.

## Color Palette
- **Neutrals**:
  - Dark Mode (Default for system overlay):
    - Background: `#111215`
    - Elevated Surface: `#181a20`
    - Input & Card Border: `#262933`
    - Primary Text: `#f3f4f6` (WCAG AAA contrast against surface)
    - Secondary Text: `#9ca3af` (WCAG AA contrast)
    - Subdued/Muted Text: `#6b7280`
  - Light Mode:
    - Background: `#f8f9fa`
    - Elevated Surface: `#ffffff`
    - Input & Card Border: `#e5e7eb`
    - Primary Text: `#111827`
    - Secondary Text: `#4b5563`
    - Subdued/Muted Text: `#9ca3af`
- **Deliberate Accent**:
  - Primary Accent: Amber Gold (`#d97706` light / `#f59e0b` dark) for action focus.
  - Diff Additions: Clean Forest/Emerald (`#10b981`).
  - Diff Removals: Muted Coral/Rose (`#f43f5e`).

## Typography
- **Stack**: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Scale**:
  - Headings: 15px - 16px, semi-bold (600), tight tracking.
  - Body & Preview: 13px - 14px, regular (400), line height 1.5.
  - Controls, Badges & Labels: 11px - 12px, medium (500).

## Hierarchy & Surfaces
- **Floating Pill**: Compact floating bar (40px height) with subtle shadow (`0 4px 16px rgba(0,0,0,0.2)`).
- **Preview Card**: Focused 420px card comparing original vs. corrected text, with clear side-by-side or diff highlights.
- **Settings Dashboard**: Clean, two-column layout with grouped preferences (AI Providers, Triggers, Hotkeys, Prompts).

## Dials
- **ENERGY**: 2 (Restrained, functional feedback)
- **RHYTHM**: 2 (Clear visual grouping, distinct preview section)
- **MOTION**: 1 (Immediate responses, short 150ms opacity transitions, no looping animations)
