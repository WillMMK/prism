---
description: Best practices for refactoring large files and avoiding common editing pitfalls.
---

# Safe Refactoring & Large File Editing Workflow

Follow these steps when performing complex code refactors or editing large files to minimize errors and ensuring recoverability.

## 1. Verify "Source of Truth" First
**Goal:** Prevent type mismatch errors.
- Before using a custom type, enum, or configuration object, **read the definition file** directly.
- **Do not assume** values based on common patterns (e.g., assuming `MM/DD` instead of verifying `MM/DD/YYYY`).
- Copy-paste exact string literals or keys from the source definition.

## 2. Execute Smaller, Atomic Edits
**Goal:** Limit the "blast radius" of errors and make debugging easier.
- **Avoid** refactoring an entire file in a single tool call.
- **Execute in stages:**
    1.  **Imports & Helpers:** Add new imports and utility functions at the top/bottom.
    2.  **Logic & State:** Add hook initialization, state variables, and handlers.
    3.  **UI/JSX:** Inject the new visual components.
- This ensures that if the UI injection fails, the logic and imports remain intact.

## 3. Match Context Unambiguously
**Goal:** Prevent accidental code duplication or nested insertions.
- When finding a target for replacement, **use at least 3-5 lines of context**.
- Ensure the target block is **unique** in the file.
- If replacing a large block, verify the **exact start and end lines** using `view_file` immediately before the write operation.

## 4. Recover with Git
**Goal:** Fix massive corruption quickly.
- If a file becomes massively corrupted (e.g., double-pasted content, broken syntax), **do not try to "patch the patch"**.
- Use `git restore <filename>` to reset to the last known good state.
- It is faster and safer to start over from a clean state than to surgically remove hundreds of lines of bad code.
