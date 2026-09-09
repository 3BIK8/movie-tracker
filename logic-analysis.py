import os
from pathlib import Path

import requests


# ============================================================
# Configuration
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parent

OUTPUT_FILE = PROJECT_ROOT / "logic-analysis.md"

OLLAMA_URL = os.getenv(
    "OLLAMA_URL",
    "http://localhost:11434/api/chat",
)

MODEL = os.getenv(
    "OLLAMA_MODEL",
    "qwen3:8b",
)

# Keep individual requests comfortably below Qwen3's
# 40,960-token context window.
MAX_PASS_CHARS = 90_000

# Maximum amount of synthesized analysis sent to the final
# synthesis pass.
MAX_SYNTHESIS_CHARS = 110_000

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
# File loading
# ============================================================

def read_file(path: Path):
    try:
        return path.read_text(
            encoding="utf-8",
            errors="replace",
        )
    except Exception as error:
        print(
            f"Skipping {path.relative_to(PROJECT_ROOT)}: "
            f"{error}"
        )
        return None


def format_file(path: Path, content: str):
    relative_path = path.relative_to(PROJECT_ROOT)

    line_count = len(content.splitlines())

    return (
        "\n"
        + "=" * 70
        + f"\nFILE: {relative_path}"
        + f"\nLINES: {line_count}"
        + "\n"
        + "=" * 70
        + "\n\n"
        + content
        + "\n"
    )


def load_project_files(files):
    loaded = []

    for path in files:
        content = read_file(path)

        if content is None:
            continue

        loaded.append({
            "path": path,
            "relative": str(
                path.relative_to(PROJECT_ROOT)
            ).replace("\\", "/"),
            "content": content,
        })

    return loaded


# ============================================================
# Analysis groups
# ============================================================

def classify_file(file_info):
    path = file_info["relative"].lower()

    # Recommendation source code only.
    if (
        path.startswith("server/services/recommendations/")
        or path.startswith("server/routes/recommendations")
        or path.startswith("server/services/recommendation")
    ):
        return "recommendations"

    if path.startswith("client/"):
        return "frontend"

    if path.startswith("server/"):
        return "backend"

    if path.endswith(".css"):
        return "frontend"

    if path.endswith(".json"):
        return "data"

    return "integration"
def build_groups(loaded_files):
    groups = {
        "recommendations": [],
        "frontend": [],
        "backend": [],
        "data": [],
        "integration": [],
    }

    for file_info in loaded_files:
        groups[classify_file(file_info)].append(
            file_info
        )

    return groups


def render_group(files):
    return "\n".join(
        format_file(
            item["path"],
            item["content"],
        )
        for item in files
    )


# ============================================================
# Chunking
# ============================================================

def split_large_group(files, max_chars=MAX_PASS_CHARS):
    """
    Split a group without splitting individual files.

    This is important because a file's logic should remain
    intact whenever possible.
    """

    chunks = []
    current = []
    current_size = 0

    for file_info in files:
        rendered = format_file(
            file_info["path"],
            file_info["content"],
        )

        rendered_size = len(rendered)

        if (
            current
            and current_size + rendered_size > max_chars
        ):
            chunks.append(current)
            current = []
            current_size = 0

        current.append(file_info)
        current_size += rendered_size

    if current:
        chunks.append(current)

    return chunks


# ============================================================
# Ollama API
# ============================================================

def analyze_with_ollama(prompt):
    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
        "stream": False,
        "options": {
            "temperature": 0.2,
        },
    }

    response = requests.post(
        OLLAMA_URL,
        json=payload,
        timeout=1800,
    )

    response.raise_for_status()

    data = response.json()

    content = data.get("message", {}).get(
        "content"
    )

    if not content:
        raise RuntimeError(
            "Ollama returned an empty response."
        )

    return content


# ============================================================
# Shared audit instructions
# ============================================================

COMMON_RULES = """
You are performing a LOGIC AND CORRECTNESS AUDIT.

This is analysis only.

Do NOT modify files.

Do NOT assume existing code is correct because it works.

Distinguish between:

1. Actual bugs
2. Likely bugs
3. Design weaknesses
4. Potential improvements
5. Reasonable current compromises

Do not recommend changes merely because another implementation
is theoretically possible.

Only report an issue when there is a concrete reason.

For every important finding explain:

WHAT happens?

WHY does it happen?

WHAT should happen instead?

HOW serious is it?

HOW confident are you?

Use the actual source code as evidence.

Do not invent code that is not present.

Do not assume libraries behave differently from their actual
usage.

The application is being developed incrementally.

Avoid premature recommendations involving:

- databases
- Redux
- Zustand
- TypeScript migration
- machine learning
- vector databases
- microservices
- recommendation frameworks

unless the current code has a concrete problem requiring them.
"""


# ============================================================
# Pass prompts
# ============================================================

def build_recommendation_prompt(snapshot):
    return f"""
{COMMON_RULES}

============================================================
SPECIALIZED PASS: RECOMMENDATION SYSTEM
============================================================

This is the most important specialized audit.

Reverse-engineer the recommendation system from the source.

Trace:

Watch history
 ↓
History analysis
 ↓
Profile construction
 ↓
Candidate generation
 ↓
Candidate filtering
 ↓
Candidate enrichment
 ↓
Candidate scoring
 ↓
Ranking
 ↓
Final recommendations

Determine whether the implementation actually follows that
conceptual architecture.

Audit:

- positive feedback
- negative feedback
- ratings
- unrated watched media
- not_sure
- to_watch
- connection strength
- repeated evidence
- actor connections
- director connections
- genre connections
- franchise connections
- studio connections
- decade
- language
- movie vs TV separation
- known-title exclusion
- candidate duplication
- candidate coverage
- exploration
- diversity
- popularity influence
- TMDB rating influence
- sparse history
- large history

Pay particular attention to whether negative feedback actually
affects scoring.

Determine whether the system can recommend something because it
shares connections with disliked media.

Determine whether repeated connections dominate scoring.

Determine whether one highly connected actor/person can drown
out more meaningful genre/franchise/story signals.

Determine whether movie and TV behavior is appropriately
separated.

The user has observed that a first recommendation batch contained
100 recommendations, of which 27 were titles they recognized as
having actually watched.

Treat this as empirical evidence, NOT as a formal accuracy metric.

Explain what this observation tells us and what it does not tell us.

Design a realistic future offline evaluation method based on
historical replay.

Also evaluate what information the current architecture collects
for future learning:

- recommendation exposure
- recommendation position
- matched connections
- recommendation source
- clicked recommendation
- skipped recommendation
- watched recommendation
- personal rating after recommendation
- timestamp

End with:

1. Actual bugs
2. Important weaknesses
3. Good decisions
4. Immediate fixes
5. Future improvements
6. Recommended tests

SOURCE CODE:

{snapshot}
"""


def build_frontend_prompt(snapshot):
    return f"""
{COMMON_RULES}

============================================================
SPECIALIZED PASS: FRONTEND LOGIC
============================================================

Audit the React/Vite frontend for behavioral correctness.

Focus on:

- state management
- derived state
- effects
- dependencies
- stale closures
- event listeners
- localStorage synchronization
- watch status
- personal ratings
- pagination
- filtering
- sorting
- expansion state
- movie/TV type handling
- loading states
- error states
- API responses
- race conditions
- unnecessary requests
- unnecessary rerenders

Pay particular attention to:

Recommendations
Library
Discover
MovieCard
ExpandedCard
useWatchStatus
useWatchRating
useMediaDetails
useDiscoverSearch
watchlist service

Check whether frontend assumptions match backend/API data.

Look for bugs that produce correct-looking UI while storing
incorrect application state.

End with:

1. Actual bugs
2. Important weaknesses
3. Good decisions
4. Immediate fixes
5. Future improvements
6. Recommended tests

SOURCE CODE:

{snapshot}
"""


def build_backend_prompt(snapshot):
    return f"""
{COMMON_RULES}

============================================================
SPECIALIZED PASS: BACKEND LOGIC
============================================================

Audit the Node/Express backend.

Trace:

Routes
 ↓
Services
 ↓
TMDB
 ↓
Normalization
 ↓
Recommendation/network logic
 ↓
Response

Focus on:

- API contracts
- validation
- error handling
- metadata normalization
- movie/TV differences
- TMDB calls
- caching
- sequential requests
- duplicate requests
- missing metadata
- null handling
- candidate filtering
- graph generation
- network construction
- recommendation calculations

Analyze complexity where meaningful.

Consider histories of:

100 titles
500 titles
1,000 titles
5,000 titles

Determine when the current implementation becomes problematic.

End with:

1. Actual bugs
2. Important weaknesses
3. Good decisions
4. Immediate fixes
5. Future improvements
6. Recommended tests

SOURCE CODE:

{snapshot}
"""


def build_data_prompt(snapshot):
    return f"""
{COMMON_RULES}

============================================================
SPECIALIZED PASS: DATA AND STATE CONSISTENCY
============================================================

Audit how information is represented throughout the application.

Focus on:

- IDs
- type
- title
- name
- dates
- status
- personal ratings
- TMDB ratings
- genres
- actors
- directors
- franchises
- studios
- language
- popularity
- localStorage
- API payloads
- normalized metadata

Pay particular attention to possible confusion between:

historyItem.rating

metadata.rating

TMDB vote_average

status

movie

tv

title

name

release_date

first_air_date

year

Determine whether information is lost between layers.

Determine whether the current localStorage schema is sufficient
for the application's future recommendation goals.

Also audit:

- corrupted localStorage
- duplicate history records
- missing metadata
- stale data
- status transitions
- rating transitions

End with:

1. Actual bugs
2. Important weaknesses
3. Good decisions
4. Immediate fixes
5. Future improvements
6. Recommended tests

SOURCE CODE:

{snapshot}
"""


def build_integration_prompt(snapshot):
    return f"""
{COMMON_RULES}

============================================================
SPECIALIZED PASS: SYSTEM INTEGRATION
============================================================

Audit how the entire application fits together.

Trace important flows across multiple files.

Analyze:

User
 ↓
React
 ↓
hooks/services
 ↓
Express
 ↓
backend services
 ↓
TMDB
 ↓
transformation
 ↓
frontend

Look for mismatched assumptions between subsystems.

Focus on:

- incorrect data shapes
- inconsistent naming
- missing fields
- null handling
- movie/TV differences
- API contracts
- synchronization
- caching
- pagination
- error propagation
- recommendation flow
- network flow
- discover flow
- library flow

Also identify integration issues that would not be visible when
looking at a single file in isolation.

End with:

1. Actual bugs
2. Important weaknesses
3. Good decisions
4. Immediate fixes
5. Future improvements
6. Recommended tests

SOURCE CODE:

{snapshot}
"""


def build_general_prompt(snapshot):
    return f"""
{COMMON_RULES}

============================================================
SPECIALIZED PASS: GENERAL CORRECTNESS / EDGE CASES
============================================================

Audit the supplied code for concrete logic and robustness issues.

Mentally test cases such as:

- empty history
- one watched movie
- one rated movie
- only S ratings
- only D ratings
- no ratings
- only to_watch
- only not_sure
- no movies
- no TV
- no actors
- no directors
- no franchises
- missing poster
- missing overview
- missing release date
- missing credits
- missing TMDB metadata
- TMDB failure
- TMDB rate limiting
- duplicate candidates
- already watched candidates
- large history
- very large candidate pool

Also consider:

- O(n²) operations
- repeated scans
- repeated requests
- unnecessary work
- security/robustness issues
- error leakage
- malformed input
- excessive request sizes

Do not invent vulnerabilities.

End with:

1. Actual bugs
2. Important weaknesses
3. Good decisions
4. Immediate fixes
5. Future improvements
6. Recommended tests

SOURCE CODE:

{snapshot}
"""


# ============================================================
# Pass metadata
# ============================================================

PASS_DEFINITIONS = {
    "recommendations": (
        "Recommendation Algorithm",
        build_recommendation_prompt,
    ),
    "frontend": (
        "Frontend Logic",
        build_frontend_prompt,
    ),
    "backend": (
        "Backend Logic",
        build_backend_prompt,
    ),
    "data": (
        "Data Consistency",
        build_data_prompt,
    ),
    "integration": (
        "System Integration",
        build_integration_prompt,
    ),
}


# ============================================================
# Final synthesis prompt
# ============================================================

def build_synthesis_prompt(reports, file_count):
    reports_text = "\n\n".join(reports)

    return f"""
You are now the lead software architect reviewing the results
of several independent repository audits.

The repository contains {file_count} source files.

The reports below were produced by specialized audits.

Your task is to synthesize them into ONE authoritative final
LOGIC AND CORRECTNESS AUDIT.

{COMMON_RULES}

IMPORTANT:

Do not blindly repeat findings.

Cross-check findings between passes.

If two reports disagree, reason from the evidence.

Do not turn every suggestion into a bug.

Prioritize concrete correctness problems.

============================================================
FINAL REPORT STRUCTURE
============================================================

# Logic and Correctness Audit

## 1. Executive Summary

Start with:

- overall assessment
- number of high-confidence issues
- most important flaw
- strongest part of the implementation
- most important next step

============================================================
2. SYSTEM BEHAVIOR AUDIT
============================================================

Explain whether the major application flows work correctly:

User
 ↓
React
 ↓
hooks/services
 ↓
Express
 ↓
backend
 ↓
TMDB
 ↓
frontend

Highlight mismatched assumptions.

============================================================
3. LOGIC CORRECTNESS
============================================================

Explain the most important business-logic findings.

Cover:

- watch status
- personal ratings
- history
- discovery
- library
- network
- recommendations
- pagination
- movie/TV separation

============================================================
4. RECOMMENDATION ALGORITHM
============================================================

Give a detailed evaluation.

Cover:

- positive feedback
- negative feedback
- rating interpretation
- confidence
- repeated evidence
- connection strength
- candidate generation
- candidate filtering
- known-title exclusion
- scoring
- ranking
- diversity
- exploration
- movie/TV separation
- popularity
- TMDB rating
- sparse history

Explicitly discuss whether the recommendation algorithm is
actually learning from negative feedback.

============================================================
5. RECOMMENDATION QUALITY EXPERIMENT
============================================================

Discuss the observation:

27 recognized watched titles out of 100 recommendations.

Explain:

- what it suggests
- what it does not prove
- what information is missing
- how to build a proper offline evaluation

Include a realistic historical-replay methodology.

============================================================
6. DATA CONSISTENCY
============================================================

Audit:

- status
- type
- ID
- title/name
- dates
- personal rating
- TMDB rating
- genres
- metadata
- localStorage

============================================================
7. COMPLEXITY AND PERFORMANCE
============================================================

Identify meaningful complexity problems.

Use:

Current complexity:
O(...)

Why it matters:

Recommended improvement:

Do not optimize trivial operations.

============================================================
8. TMDB/API USAGE
============================================================

Evaluate:

100 titles

500 titles

1,000 titles

5,000 titles

Discuss:

- request count
- caching
- sequential calls
- failures
- rate limits
- enrichment

============================================================
9. FRONTEND STATE
============================================================

Evaluate React state, effects, synchronization, pagination,
expansion, and localStorage behavior.

============================================================
10. BACKEND
============================================================

Evaluate routes, services, normalization, recommendation
services, graph construction, filtering and scoring.

============================================================
11. EDGE CASES
============================================================

Summarize the meaningful edge cases discovered.

============================================================
12. SECURITY AND ROBUSTNESS
============================================================

Only report concrete plausible issues.

============================================================
13. IS THIS THE BEST REASONABLE APPROACH?
============================================================

For every major subsystem:

Current approach

Alternative

Advantages

Disadvantages

Should we change?

Respect incremental development.

============================================================
14. OVERENGINEERING AUDIT
============================================================

Identify both:

- unnecessary complexity
- dangerous oversimplification

============================================================
15. FUTURE LEARNING SYSTEM
============================================================

Evaluate whether current architecture collects enough information
for future learning.

Discuss:

- exposure
- clicks
- skips
- watches
- ratings
- position
- source
- matched connections
- timestamps

Separate:

Implement now

Implement later

============================================================
16. POTENTIAL LOGIC BUG TABLE
============================================================

Create:

| Priority | File | Issue | Consequence | Confidence | Fix |
|----------|------|-------|-------------|------------|-----|

Priority:

P0 = critical

P1 = important

P2 = meaningful improvement

P3 = minor improvement

============================================================
17. ALGORITHM IMPROVEMENT TABLE
============================================================

Create:

| Area | Current behavior | Problem | Better approach | Worth doing now? |
|------|------------------|---------|-----------------|------------------|

============================================================
18. WHAT IS ALREADY GOOD
============================================================

Explicitly identify things that should NOT be changed.

============================================================
19. FINAL VERDICT
============================================================

Provide:

A. Critical bugs

B. Important logic flaws

C. Recommendation weaknesses

D. Performance problems

E. API/TMDB problems

F. Frontend state problems

G. Things already well designed

H. Things that should NOT be changed

I. Things to fix immediately

J. Things to postpone

K. Single most valuable next improvement

L. Overall assessment:

- Poor
- Needs major work
- Functional but immature
- Solid
- Very solid
- Excellent for its current stage

Explain the verdict.

============================================================
20. RECOMMENDED TEST PLAN
============================================================

Create a practical test plan covering:

- unit tests
- integration tests
- recommendation tests
- edge cases
- regression tests

Prioritize tests that catch real bugs.

============================================================
AUDIT REPORTS
============================================================

{reports_text}
"""


# ============================================================
# Safety helpers
# ============================================================

def trim_for_synthesis(text, max_chars):
    if len(text) <= max_chars:
        return text

    return (
        text[:max_chars]
        + "\n\n[REPORT TRUNCATED FOR FINAL SYNTHESIS]\n"
    )


# ============================================================
# Main
# ============================================================

def main():
    print("Scanning project...")

    files = collect_files()

    print(
        f"Found {len(files)} source files."
    )

    if not files:
        raise RuntimeError(
            "No source files were found."
        )

    print("Reading source files...")

    loaded_files = load_project_files(files)

    print(
        f"Loaded {len(loaded_files)} source files."
    )

    groups = build_groups(loaded_files)

    reports = []

    print()
    print("=" * 70)
    print("STARTING MULTI-PASS ANALYSIS")
    print("=" * 70)

    for group_name, group_files in groups.items():
        if not group_files:
            continue

        title, prompt_builder = PASS_DEFINITIONS[
            group_name
        ]

        chunks = split_large_group(
            group_files
        )

        print()
        print(
            f"[{title}] "
            f"{len(group_files)} files "
            f"across {len(chunks)} pass(es)"
        )

        for index, chunk in enumerate(
            chunks,
            start=1,
        ):
            snapshot = render_group(chunk)

            print(
                f"  Pass {index}/{len(chunks)}: "
                f"{len(snapshot):,} characters"
            )

            if len(snapshot) > MAX_PASS_CHARS:
                raise RuntimeError(
                    f"{title} pass is still too large: "
                    f"{len(snapshot):,} characters."
                )

            prompt = prompt_builder(
                snapshot
            )

            print(
                f"  Sending pass {index} to "
                f"{MODEL}..."
            )

            analysis = analyze_with_ollama(
                prompt
            )

            reports.append(
                f"""
# Specialized Audit: {title}

## Pass {index}

{analysis}
"""
            )

            print(
                f"  Completed pass {index}."
            )

    if not reports:
        raise RuntimeError(
            "No analysis passes were produced."
        )

    print()
    print("=" * 70)
    print("STARTING FINAL SYNTHESIS")
    print("=" * 70)

    synthesis_reports = []

    for report in reports:
        synthesis_reports.append(
            trim_for_synthesis(
                report,
                MAX_SYNTHESIS_CHARS // max(
                    len(reports),
                    1,
                ),
            )
        )

    synthesis_prompt = build_synthesis_prompt(
        synthesis_reports,
        len(loaded_files),
    )

    print(
        f"Synthesis input: "
        f"{len(synthesis_prompt):,} characters"
    )

    print(
        f"Sending synthesis to {MODEL}..."
    )

    final_analysis = analyze_with_ollama(
        synthesis_prompt
    )

    OUTPUT_FILE.write_text(
        final_analysis,
        encoding="utf-8",
    )

    print()
    print("=" * 70)
    print("LOGIC ANALYSIS COMPLETE")
    print("=" * 70)
    print()
    print("Final report saved to:")
    print(OUTPUT_FILE)


if __name__ == "__main__":
    main()
