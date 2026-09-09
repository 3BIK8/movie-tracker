import os
from pathlib import Path
from google import genai


# ============================================================
# Configuration
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parent

OUTPUT_FILE = PROJECT_ROOT / "refactoring-analysis.md"

MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemini-3.6-flash",
)

# Directories that should never be sent to Gemini.
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

# File types worth analyzing.
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

        # Don't accidentally send secrets.
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
            print(f"Skipping {relative_path}: {error}")
            continue

        line_count = len(content.splitlines())

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
You are a senior software architect performing a repository-wide
code architecture audit.

You have been given the source code of a React + Vite frontend
and Node/Express backend.

There are {file_count} source files.

IMPORTANT:

DO NOT MODIFY ANY FILES.

This is an ANALYSIS ONLY.

The developer wants to refactor the project because some files
have become very large, but line count alone must NOT determine
whether a file should be split.

The primary question is:

"Does each file have a clear, cohesive responsibility?"

A 700-line file can be acceptable if it represents one coherent
responsibility. A 250-line file may need splitting if it contains
several unrelated responsibilities.

Analyze the repository as a SYSTEM, not as isolated files.

============================================================
1. ARCHITECTURE OVERVIEW
============================================================

Explain:

- current frontend architecture
- current backend architecture
- major responsibilities
- important data flows
- dependency relationships
- where business logic currently lives
- where UI logic currently lives
- where API/data-access logic currently lives

Create a concise architecture diagram using text/ASCII.

============================================================
2. RESPONSIBILITY ANALYSIS
============================================================

For EVERY source file, determine:

- primary responsibility
- secondary responsibilities
- whether responsibilities are cohesive
- whether the file should remain as-is
- whether it should be split
- why

Do NOT recommend splitting simply because a file is long.

Look specifically for files combining things such as:

- UI rendering
- API calls
- state management
- business logic
- data transformation
- graph configuration
- event handling
- filtering
- calculations
- formatting
- reusable utilities

============================================================
3. REFACTORING CANDIDATES
============================================================

Create a prioritized table:

| Priority | Current file | Problem | Proposed split | Reason |
|----------|--------------|---------|----------------|--------|

Priority:

P0 = serious architectural problem
P1 = should refactor soon
P2 = useful improvement
P3 = optional cleanup

For every proposed split, show the NEW file structure.

Example:

Current:

Network.jsx

Proposed:

Network.jsx
network/
    useNetworkData.js
    useNetworkGraph.js
    networkInteractions.js
    networkStyles.js
    connectionExplorer.jsx

Explain what belongs in each file.

============================================================
4. COMPONENT ANALYSIS
============================================================

For React components identify:

- components that are doing too much
- components that should become smaller components
- logic that belongs in hooks
- logic that belongs in services
- reusable UI patterns
- duplicated UI patterns

Do not create tiny components for the sake of having more files.

The goal is meaningful separation of responsibility.

============================================================
5. HOOK ANALYSIS
============================================================

Review existing hooks.

Determine:

- whether each hook has one clear responsibility
- whether hooks contain business logic that belongs elsewhere
- whether hooks are too tightly coupled to UI
- whether any logic should become reusable utilities

============================================================
6. BACKEND ANALYSIS
============================================================

Review:

- routes
- services
- utilities
- recommendation logic
- TMDB access
- data transformation

Identify responsibility violations.

For example:

Route
    ↓
Service
    ↓
External API

should generally remain separated where appropriate.

============================================================
7. DUPLICATION
============================================================

Find duplicated:

- functions
- constants
- formatting logic
- API logic
- filtering logic
- UI patterns
- data transformation

For each important duplication explain where the shared
implementation should live.

============================================================
8. DEPENDENCY DIRECTION
============================================================

Look for:

- circular dependencies
- components importing things they shouldn't
- services depending on UI
- utilities depending on application-specific components
- unnecessary coupling

Explain the ideal dependency direction.

============================================================
9. PROPOSED ARCHITECTURE
============================================================

Design a cleaner project structure based on the CURRENT project.

Do not blindly introduce:

- Redux
- Zustand
- Context everywhere
- TypeScript migration
- complex design patterns
- unnecessary abstractions
- dozens of tiny files

Only recommend technologies or patterns when they solve an
actual problem found in this repository.

Show the proposed directory tree.

============================================================
10. REFACTORING ORDER
============================================================

Give a safe incremental migration plan.

For example:

Phase 1
    Extract X

Phase 2
    Extract Y

Phase 3
    Refactor Z

Each phase must be independently testable.

The application should continue working after every phase.

============================================================
11. WHAT NOT TO CHANGE
============================================================

Identify parts of the existing architecture that are already
good and should NOT be refactored unnecessarily.

This is important.

We want better separation of responsibility, not refactoring
for the sake of refactoring.

============================================================
12. FINAL RECOMMENDATION
============================================================

Finish with:

A. Top 10 recommended changes

B. Files that should definitely be split

C. Files that should remain untouched

D. Proposed final directory tree

E. Recommended first refactoring step

Be concrete.

Do not give generic advice such as "use clean code" or
"follow SOLID principles" without connecting it to an actual
file in this repository.

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

    print(f"Found {len(files)} source files.")

    if not files:
        raise RuntimeError(
            "No source files were found."
        )

    print("Building project snapshot...")

    snapshot = build_project_snapshot(files)

    print(f"Sending project to Gemini using {MODEL}...")

    client = genai.Client(api_key=api_key)

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
    print("Analysis complete.")
    print(f"Report saved to:")
    print(OUTPUT_FILE)


if __name__ == "__main__":
    main()