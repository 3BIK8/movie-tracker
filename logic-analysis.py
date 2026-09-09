import os
from pathlib import Path

from google import genai


# ============================================================
# Configuration
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parent

OUTPUT_FILE = PROJECT_ROOT / "logic-analysis.md"

MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemini-3.6-flash",
)

IGNORED_DIRECTORIES = {
    "node_modules",
    "dist",
    "build",
    ".git",
    ".next",
    "coverage",
    "__pycache__",
    ".vite",
}

SOURCE_EXTENSIONS = {
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".css",
    ".json",
    ".mjs",
    ".cjs",
}


# ============================================================
# File discovery
# ============================================================

def should_ignore(path: Path) -> bool:
    return any(
        part in IGNORED_DIRECTORIES
        for part in path.parts
    )


def collect_files():
    files = []

    for path in PROJECT_ROOT.rglob("*"):
        if not path.is_file():
            continue

        if should_ignore(path):
            continue

        if path.suffix.lower() not in SOURCE_EXTENSIONS:
            continue

        if path.name in {
            ".env",
            ".env.local",
            ".env.production",
            ".env.development",
        }:
            continue

        files.append(path)

    return sorted(files)


# ============================================================
# Project snapshot
# ============================================================

def build_project_snapshot(files):
    sections = []

    for path in files:
        relative_path = path.relative_to(PROJECT_ROOT)

        try:
            content = path.read_text(
                encoding="utf-8",
                errors="replace",
            )
        except Exception as error:
            print(
                f"Skipping {relative_path}: {error}"
            )
            continue

        line_count = len(
            content.splitlines()
        )

        sections.append(
            f"""
============================================================
FILE: {relative_path}
LINES: {line_count}
============================================================

{content}
"""
        )

    return "\n".join(sections)


# ============================================================
# Gemini prompt
# ============================================================

def build_prompt(snapshot, file_count):
    return f"""
You are a senior software engineer, software architect,
algorithm designer, and code reviewer performing a
repository-wide LOGIC AND CORRECTNESS AUDIT.

You have been given the complete source code of a React + Vite
frontend and Node/Express backend.

There are {file_count} source files.

This is NOT primarily a refactoring audit.

The previous audit already examined file responsibilities,
architecture, separation of concerns, and refactoring
opportunities.

This audit has a different purpose:

Determine whether the application actually behaves correctly,
whether its logic makes sense, whether the algorithms are sound,
and whether the implementation is as good as it reasonably can
be at its current stage.

============================================================
IMPORTANT RULES
============================================================

DO NOT MODIFY ANY FILES.

This is ANALYSIS ONLY.

Do not assume that existing code is correct simply because it
currently works.

Do not assume that previous architectural decisions are correct.

Challenge the implementation.

Look for things that:

- are logically incorrect
- work accidentally
- produce misleading results
- fail under realistic edge cases
- contain hidden assumptions
- lose information
- produce incorrect state
- produce incorrect recommendations
- unnecessarily call external APIs
- scale badly
- create inconsistent data
- behave differently depending on execution order
- silently fail
- hide errors
- create false confidence
- are unnecessarily complicated
- could be significantly simpler
- could be significantly more accurate
- could be significantly more efficient

Distinguish between:

1. Actual bugs
2. Likely bugs
3. Design weaknesses
4. Potential improvements
5. Reasonable current compromises

Do NOT recommend changes merely because another implementation
is theoretically possible.

The question is:

"Is there a concrete reason the current implementation should
change?"

============================================================
1. SYSTEM BEHAVIOR AUDIT
============================================================

Understand the application as a complete system.

Trace the major flows:

User
 ↓
React UI
 ↓
Hooks / services
 ↓
Express API
 ↓
Backend services
 ↓
TMDB
 ↓
Backend transformation
 ↓
Frontend
 ↓
User state

Identify any point where assumptions between layers do not
match.

Look for:

- incorrect data shapes
- inconsistent naming
- missing fields
- unexpected null/undefined behavior
- incorrect defaults
- stale state
- synchronization problems
- incorrect status transitions
- incorrect rating handling
- incorrect type handling
- incorrect movie/TV handling
- incorrect API contracts

============================================================
2. LOGIC CORRECTNESS
============================================================

For every important business rule, determine whether the
implementation actually implements that rule.

Pay particular attention to:

- watch status
- personal ratings
- history updates
- recommendation generation
- candidate filtering
- recommendation scoring
- movie vs TV separation
- network generation
- discovery
- pagination
- caching
- TMDB metadata handling

For every issue explain:

WHAT happens?

WHY does it happen?

WHAT should happen instead?

HOW serious is it?

============================================================
3. RECOMMENDATION ALGORITHM AUDIT
============================================================

This is one of the most important sections.

Reverse-engineer the entire recommendation pipeline.

Current intended conceptual architecture:

Watch history
 ↓
Taste analysis
 ↓
Candidate generation
 ↓
Known-title exclusion
 ↓
Candidate enrichment
 ↓
Candidate scoring
 ↓
Ranking
 ↓
User feedback
 ↓
Future learning

Determine whether the implementation actually follows this
architecture.

Analyze:

- rating interpretation
- positive feedback
- negative feedback
- confidence
- repeated evidence
- connection strength
- actor relationships
- director relationships
- genre relationships
- franchise relationships
- studio relationships
- movie/TV separation
- candidate diversity
- candidate duplication
- candidate coverage
- exploration
- popularity influence
- TMDB rating influence
- known-title exclusion
- unrated watched media
- not_sure
- to_watch
- personal ratings
- sparse history
- small history
- large history

============================================================
4. RECOMMENDATION QUALITY EXPERIMENT
============================================================

There is an important real-world observation:

The first recommendation batch contained 100 recommendations.

The user recognized 27 of those 100 as movies/series they had
actually watched.

Treat this as empirical evidence.

Do NOT automatically interpret 27/100 as a formal accuracy metric.

Explain:

- what this observation tells us
- what it does NOT tell us
- whether it suggests candidate generation is working
- whether it suggests the scoring system is working
- what information is missing
- how this could eventually become a proper evaluation metric

Discuss how we could create a real offline evaluation later.

For example:

Historical replay:

Take older watched titles.

Pretend they were unknown.

Generate recommendations using only earlier history.

Measure whether the system ranks those later-watched titles
highly.

Design a realistic evaluation methodology.

============================================================
5. DATA AND STATE CONSISTENCY
============================================================

Audit all data structures.

Look for:

- duplicate representations
- conflicting field names
- same concept represented differently
- personal rating vs TMDB rating confusion
- movie vs TV naming differences
- null handling
- ID collisions
- status inconsistencies
- stale localStorage state
- event synchronization
- derived state bugs

Pay special attention to:

historyItem.rating

metadata.rating

tmdbRating

status

type

id

title

name

year

releaseDate

poster_path

============================================================
6. ALGORITHM COMPLEXITY
============================================================

Analyze computational complexity.

Identify:

- O(n²) or worse operations
- unnecessary nested loops
- repeated scans
- repeated Set/Map construction
- repeated metadata lookups
- redundant enrichment
- repeated TMDB calls
- sequential API requests that could safely be parallelized
- unnecessary frontend rerenders

For each important case estimate:

Current complexity:
O(...)

Why it matters:

Recommended improvement:

Do not optimize trivial operations.

Focus on things that could matter as the watch history grows.

============================================================
7. TMDB/API USAGE
============================================================

Audit external API usage.

Look for:

- redundant requests
- repeated requests for the same media
- repeated failed requests
- missing caching
- inefficient endpoints
- sequential requests
- unnecessary enrichment
- missing batching opportunities
- rate-limit risks
- error handling problems
- retry problems

Determine whether the current implementation will remain
reasonable with:

100 watched titles

500 watched titles

1,000 watched titles

5,000 watched titles

Explain where it starts becoming problematic.

============================================================
8. CACHING
============================================================

Audit all caching.

Determine:

- what is cached
- what is not cached
- whether cache keys are correct
- whether failed requests are cached
- whether stale data is possible
- whether cache lifetime is appropriate
- whether caching is happening at the correct layer

Explain whether the current in-memory cache is sufficient.

============================================================
9. FRONTEND STATE LOGIC
============================================================

Audit React state management.

Look for:

- stale closures
- unnecessary state
- derived state stored unnecessarily
- synchronization problems
- race conditions
- effects doing too much
- effects missing dependencies
- event listener problems
- component state becoming stale
- incorrect loading states
- incorrect error states
- pagination edge cases
- expansion state problems

Pay particular attention to:

Recommendations.jsx

MovieCard.jsx

ExpandedCard.jsx

useWatchStatus.js

useWatchRating.js

useMediaDetails.js

useDiscoverSearch.js

============================================================
10. BACKEND LOGIC
============================================================

Audit:

- routes
- services
- recommendation services
- metadata normalization
- candidate generation
- candidate filtering
- scoring
- network generation
- error handling

Determine whether responsibilities communicate correctly.

Look for logic that produces valid-looking but incorrect data.

============================================================
11. EDGE CASES
============================================================

Systematically test the logic mentally against cases such as:

- empty history
- one watched movie
- one rated movie
- only S ratings
- only D ratings
- no personal ratings
- only unrated watched media
- only to_watch media
- only not_sure media
- no movies
- no TV
- no franchises
- no actors
- no directors
- missing TMDB metadata
- deleted TMDB media
- duplicate history entries
- duplicate candidates
- candidate already watched
- candidate already in to_watch
- candidate marked not_sure
- missing poster
- missing overview
- missing release date
- missing credits
- TMDB API failure
- TMDB rate limiting
- large history
- very large candidate pool

For each meaningful failure explain the consequence.

============================================================
12. SECURITY AND ROBUSTNESS
============================================================

Look for concrete issues involving:

- untrusted input
- API abuse
- malformed requests
- excessive request sizes
- error leakage
- localStorage corruption
- unsafe assumptions
- missing validation
- denial-of-service risks
- dependency risks

Do not invent vulnerabilities.

Only report issues that are actually plausible from the code.

============================================================
13. PERFORMANCE
============================================================

Analyze both frontend and backend performance.

Consider:

- network requests
- TMDB calls
- React rendering
- Cytoscape rendering
- localStorage operations
- JSON serialization
- recommendation calculation
- metadata enrichment
- caching

Identify bottlenecks that are actually relevant.

============================================================
14. "IS THIS THE BEST WAY?"
============================================================

For every major subsystem ask:

"Is this the best reasonable approach for THIS application?"

Evaluate:

- current approach
- alternative approach
- advantages
- disadvantages
- whether changing is actually worth it

Do NOT recommend technologies merely because they are popular.

Do NOT recommend:

- Redux
- Zustand
- databases
- machine learning
- vector databases
- microservices
- TypeScript migration
- complex recommendation frameworks

unless the current implementation has a concrete problem
that requires them.

The application is intentionally being developed incrementally.

Respect that constraint.

============================================================
15. OVERENGINEERING AUDIT
============================================================

Identify places where the implementation may be more complex
than necessary.

For each one ask:

Can this be simplified without losing capability?

Also identify places where the implementation is TOO simple
and will eventually become a problem.

The goal is the correct level of complexity.

============================================================
16. FUTURE LEARNING SYSTEM
============================================================

The long-term goal is for the recommendation system to learn
from the user's behavior.

Current philosophy:

History
 ↓
Recommendations
 ↓
User interacts with recommendations
 ↓
New history / feedback
 ↓
Improved model

Evaluate whether the current architecture collects enough
information to eventually support learning.

Identify what future information would be valuable, such as:

- recommendation exposure
- clicked recommendations
- watched recommendations
- skipped recommendations
- personal rating after recommendation
- recommendation position
- recommendation source
- matched connections
- timestamp

Explain what should be implemented NOW and what should wait.

Do not build a machine-learning system prematurely.

============================================================
17. POTENTIAL LOGIC BUG TABLE
============================================================

Create:

| Priority | File | Issue | Consequence | Confidence | Fix |
|----------|------|-------|-------------|------------|-----|

Priority:

P0 = critical correctness problem

P1 = important correctness problem

P2 = meaningful improvement

P3 = minor improvement

Confidence:

High
Medium
Low

Only assign P0/P1 when justified.

============================================================
18. ALGORITHM IMPROVEMENT TABLE
============================================================

Create:

| Area | Current behavior | Problem | Better approach | Worth doing now? |
|------|------------------|---------|-----------------|------------------|

Focus especially on the recommendation system.

============================================================
19. WHAT IS ALREADY GOOD
============================================================

Identify logic that should NOT be changed.

This is important.

If something is correct, simple, and appropriate:

Say so.

Do not invent improvements merely to produce a longer report.

============================================================
20. FINAL VERDICT
============================================================

Finish with:

A. Critical bugs

B. Important logic flaws

C. Recommendation algorithm weaknesses

D. Performance problems

E. API/TMDB problems

F. Frontend state problems

G. Things that are already well designed

H. Things that should NOT be changed

I. Things to fix immediately

J. Things to postpone

K. The single most valuable next improvement

L. Overall assessment:

- Poor
- Needs major work
- Functional but immature
- Solid
- Very solid
- Excellent for its current stage

Explain the verdict.

============================================================
21. RECOMMENDED TEST PLAN
============================================================

Create a practical test plan for the logic.

Include:

- unit tests
- integration tests
- recommendation tests
- edge-case tests
- regression tests

Prioritize tests that would catch real bugs found during this
audit.

============================================================
22. EXECUTIVE SUMMARY
============================================================

Start the report with a concise executive summary containing:

- overall assessment
- number of high-confidence issues
- most important flaw
- strongest part of the implementation
- most important next step

Do not bury the important findings.

============================================================
SOURCE CODE
============================================================

{snapshot}
"""


# ============================================================
# Main
# ============================================================

def main():
    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY environment variable is not set."
        )

    print("Scanning project...")

    files = collect_files()

    print(
        f"Found {len(files)} source files."
    )

    if not files:
        raise RuntimeError(
            "No source files were found."
        )

    print(
        "Building project snapshot..."
    )

    snapshot = build_project_snapshot(files)

    print(
        f"Sending project to Gemini using {MODEL}..."
    )

    client = genai.Client(
        api_key=api_key
    )

    response = client.models.generate_content(
        model=MODEL,
        contents=build_prompt(
            snapshot,
            len(files),
        ),
    )

    if not response.text:
        raise RuntimeError(
            "Gemini returned an empty response."
        )

    OUTPUT_FILE.write_text(
        response.text,
        encoding="utf-8",
    )

    print()
    print("Logic analysis complete.")
    print("Report saved to:")
    print(OUTPUT_FILE)


if __name__ == "__main__":
    main()