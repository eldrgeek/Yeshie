# React: Import/Export Consistency

## Rule
Maintain strict consistency between how React components are exported from their modules and how they are imported into other modules.

- **Default Exports:** If a component is exported using `export default MyComponent;`, it must be imported as `import MyComponent from './MyComponent';`.
- **Named Exports:** If a component is exported using `export const MyComponent = ...;` or `export { MyComponent };`, it must be imported using `import { MyComponent } from './MyComponent';`.

## Rationale
Mismatches between default and named exports/imports are a common cause of React rendering errors, particularly the "Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined" error. Ensuring consistency prevents these runtime issues. 