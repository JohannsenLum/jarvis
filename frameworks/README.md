# Frameworks

Ways of thinking Jarvis can run with you. Each file says what the framework is, how it works, when to
apply it and how your AI uses it.

| Framework | Kind | In one line |
|---|---|---|
| [168](168.md) | guided | Budget your 168-hour week like money: life first, work gets the rest |
| [AIOO](aioo.md) | decision | Actions × Inputs → Outputs → Outcome: plan backwards, fix purpose when nothing moves |
| [Declarations](declarations.md) | guided | Goals as present-tense states of being ("I am…"), read daily |
| [Deal cards](deal-cards.md) | guided | A card for every live opportunity: context, BANT, next step, tied to a person |

**Guided** frameworks walk you through something and leave a result (a budget, a document, a set of
cards). **Decision** frameworks are lenses Jarvis applies when you're deciding or stuck.

## Where things go

These files are Jarvis's and get replaced wholesale by `jarvis update`. Never edit them. Your results
live in your vault, which updates never touch:

```
.jarvis/frameworks/168.md          the framework (ours)
knowledge/frameworks/168/          your results (yours): map.md, budget.md, weeks/2026-W40.md
```

`catalog.json` lists each framework's result files. Every result page records the framework version it
was made with (`framework_version:` in its frontmatter), so an update never silently changes the meaning
of what you've already written. Your own adaptations ("my 168 has no faith line") go in the result pages
or in `me/`, not here.

Deal cards link to the person's page (`relationships/people/<name>.md`), which stays the one page about
that person. Declarations are private and written only in your words, after you say yes.

Ask Jarvis: "let's do the 168", "run AIOO on this goal", "make a deal card for this", or "what
frameworks do you have?".

## Source

`168.md`, `aioo.md`, `declarations.md` and `deal-cards.md` are copied unchanged from
[twiss-io/lifeos-plugin](https://github.com/twiss-io/lifeos-plugin/tree/main/frameworks) at commit
`2a1806bb97d4dfae47268df3fb8b12b6bf1783d4`, with the author's permission.
