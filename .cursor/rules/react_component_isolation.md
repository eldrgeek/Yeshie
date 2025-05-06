# Debugging React: Component Isolation Technique

## Rule
When encountering UI rendering errors in React (e.g., 'type is invalid -- expected a string... but got: undefined' warnings), systematically isolate components to find the source.

- Comment out the usage of imported components one by one within the parent component's JSX.
- After each component is commented out, reload the extension and check the browser console for the error.
- If the error disappears, the last component commented out (or its import/export) is likely the cause.

## Rationale
This systematic approach helps quickly pinpoint problematic components in a React application, especially when dealing with import/export issues or incorrect component definitions that lead to runtime rendering errors. 