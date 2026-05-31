```markdown
# flightguard-mpp Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches you the core development patterns and conventions found in the `flightguard-mpp` TypeScript codebase. You'll learn how to structure files, write imports and exports, follow commit conventions, and understand the project's approach to testing. This guide is ideal for contributors looking to quickly align with the project's established practices.

## Coding Conventions

### File Naming
- Use **camelCase** for file names.
  - Example: `flightGuardService.ts`, `userProfileManager.ts`

### Import Style
- Both default and named imports are used; be consistent within a file.
  - Example (named import):
    ```typescript
    import { fetchFlightData } from './flightDataService';
    ```
  - Example (default import):
    ```typescript
    import flightUtils from './flightUtils';
    ```

### Export Style
- Prefer **named exports**.
  - Example:
    ```typescript
    // flightGuardService.ts
    export function validateFlight(flight) { ... }
    export const FLIGHT_STATUS = { ... };
    ```

### Commit Patterns
- Commits are of mixed types, but often use the `fix` prefix for bug fixes.
- Commit messages average around 51 characters.
  - Example:
    ```
    fix: resolve timezone issue in flight validation
    ```

## Workflows

### Code Contribution
**Trigger:** When adding new features, fixing bugs, or making improvements  
**Command:** `/contribute`

1. Create a new branch from `main`.
2. Make your changes following the coding conventions.
3. Write or update tests as needed (see Testing Patterns).
4. Commit changes with a descriptive message, using prefixes like `fix` if appropriate.
5. Open a pull request for review.

### Testing
**Trigger:** Before submitting code or verifying functionality  
**Command:** `/test`

1. Identify or create test files matching the `*.test.*` pattern.
2. Write tests for new or modified code.
3. Run the test suite using the project's test runner (framework unknown; check project scripts or documentation).
4. Ensure all tests pass before committing.

## Testing Patterns

- Test files follow the `*.test.*` naming convention.
  - Example: `flightGuardService.test.ts`
- The specific testing framework is not detected; check existing test files for syntax (e.g., Jest, Mocha).
- Place tests alongside the files they cover or in a dedicated `tests` directory if present.

  Example test file structure:
  ```typescript
  // flightGuardService.test.ts
  import { validateFlight } from './flightGuardService';

  describe('validateFlight', () => {
    it('should return true for valid flights', () => {
      // test implementation
    });
  });
  ```

## Commands
| Command      | Purpose                                         |
|--------------|-------------------------------------------------|
| /contribute  | Start the code contribution workflow            |
| /test        | Run or write tests for the codebase             |
```
