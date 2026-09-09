from pathlib import Path
import fnmatch


# Project root = folder containing "tools/"
PROJECT_ROOT = Path(__file__).resolve().parent.parent

OUTPUT_FILE = PROJECT_ROOT / "selected-files.txt"

EXCLUDED_DIRS = {
    "node_modules",
    "dist",
    "build",
    ".git",
    ".next",
    "coverage",
    "__pycache__",
    ".vite",
}

SUPPORTED_EXTENSIONS = {
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".css",
    ".json",
    ".mjs",
    ".cjs",
}


def is_excluded(path: Path) -> bool:
    return any(part in EXCLUDED_DIRS for part in path.parts)


def collect_from_path(input_path: str) -> list[Path]:
    """
    Resolve:
    - exact files
    - directories
    - glob patterns
    """
    input_path = input_path.strip()

    if not input_path:
        return []

    path = Path(input_path)

    # Exact file
    if path.is_file():
        return [path]

    # Exact directory
    if path.is_dir():
        files = []

        for file in path.rglob("*"):
            if (
                file.is_file()
                and file.suffix in SUPPORTED_EXTENSIONS
                and not is_excluded(file)
            ):
                files.append(file)

        return files

    # Glob pattern
    matches = []

    for file in PROJECT_ROOT.glob(input_path):
        if (
            file.is_file()
            and file.suffix in SUPPORTED_EXTENSIONS
            and not is_excluded(file)
        ):
            matches.append(file)

    return matches


def normalize_path(path: Path) -> Path:
    """
    Convert absolute paths to paths relative to the project root.
    """
    return path.resolve().relative_to(PROJECT_ROOT.resolve())


def main():
    print()
    print("=" * 60)
    print(" Movie Tracker - File Collector")
    print("=" * 60)
    print()
    print("Enter files, folders, or glob patterns.")
    print("Examples:")
    print("  client/src/components/MovieCard.jsx")
    print("  client/src/components")
    print("  client/src/components/*.jsx")
    print("  server/services/recommendations/*.js")
    print()
    print("Type 'done' when finished.")
    print()

    selected_files = []
    selected_set = set()

    while True:
        user_input = input("> ").strip()

        if user_input.lower() in {"done", "exit", "quit"}:
            break

        if not user_input:
            continue

        matches = collect_from_path(user_input)

        if not matches:
            print(f"  No matching files found: {user_input}")
            continue

        added = 0

        for file in matches:
            relative_path = normalize_path(file)

            if relative_path not in selected_set:
                selected_set.add(relative_path)
                selected_files.append(relative_path)
                added += 1

        print(f"  Added {added} file(s).")

    if not selected_files:
        print()
        print("No files selected.")
        return

    # Sort for predictable output
    selected_files.sort(key=lambda path: str(path).lower())

    output = []

    for relative_path in selected_files:
        absolute_path = PROJECT_ROOT / relative_path

        try:
            content = absolute_path.read_text(
                encoding="utf-8"
            )
        except UnicodeDecodeError:
            print(f"  Skipped non-UTF8 file: {relative_path}")
            continue
        except OSError as error:
            print(f"  Could not read {relative_path}: {error}")
            continue

        line_count = len(content.splitlines())

        output.append(
            "=" * 60
            + "\n"
            + f"FILE: {relative_path}\n"
            + f"LINES: {line_count}\n"
            + "=" * 60
            + "\n\n"
            + content.rstrip()
            + "\n\n"
        )

    OUTPUT_FILE.write_text(
        "".join(output),
        encoding="utf-8",
    )

    print()
    print("=" * 60)
    print(f"Collected {len(output)} file(s).")
    print(f"Output: {OUTPUT_FILE}")
    print("=" * 60)
    print()


if __name__ == "__main__":
    main()