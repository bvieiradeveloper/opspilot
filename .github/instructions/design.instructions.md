---
description: "Use when creating or changing web UI, styles, or components. Covers visual hierarchy, spacing, empty and error states, dark mode, and accessibility."
applyTo: "web/**"
---
# Web Design Guidelines

- Establish a clear visual hierarchy: make the primary task or content most prominent, use consistent heading levels, and keep secondary actions visually subordinate.
- Use the project's existing design tokens and spacing conventions. If none exist, use a consistent 4px-based scale (4, 8, 12, 16, 24, 32, 48px) rather than arbitrary one-off values.
- Design empty states to explain why there is no content and, when useful, offer a clear next step. Design error states to explain what happened in plain language and provide a recovery action when possible.
- Support dark mode using semantic color tokens that adapt to the active theme. Avoid hard-coded light-only colors and check text, borders, controls, and status colors in both themes.
- Build accessibly: use semantic HTML, provide labels and accessible names for controls, support keyboard navigation with a visible focus indicator, and never rely on color alone to convey meaning.
- Maintain readable contrast (at least WCAG AA for text), respect reduced-motion preferences, and use appropriately sized interactive targets.
