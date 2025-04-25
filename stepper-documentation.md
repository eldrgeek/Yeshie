# Stepper Documentation

## Overview
Stepper is a powerful browser automation tool that provides a set of commands for interacting with web pages. It supports both direct command execution and command parsing from natural language input.

## Command Types

### Navigation
- `navto <url>`: Navigate to a specified URL
- `scrollto <selector>`: Scroll to a specific element
- `setviewport <width> <height>`: Set the viewport dimensions

### Element Interaction
- `click <selector> ["text"]`: Click an element, optionally matching text content
- `type <selector> "text"`: Type text into an input element
- `sendkeys <selector> "keys"`: Send keyboard events to an element with special keys support
- `hover <selector>`: Hover over an element
- `getattribute <selector> <attribute>`: Get an element's attribute value
- `getcomputedstyle <selector> <property>`: Get computed style of an element

### Page State
- `waitfor <condition> [timeout]`: Wait for a condition to be met
- `waitforelement <selector> [timeout]`: Wait for an element to appear
- `waitforelementgone <selector> [timeout]`: Wait for an element to disappear
- `waitforstable [quiet_time]`: Wait for DOM to be stable (no changes for specified time)
- `waitfornetwork [timeout]`: Wait for network activity to complete
- `changes <action>`: Monitor page changes (on/off/clear/request)

### Advanced Operations
- `executejs <script>`: Execute JavaScript code
- `takescreenshot`: Capture a screenshot
- `handledialog <action>`: Handle browser dialogs (accept/dismiss)
- `message "text"`: Display a message to the user
- `record <action>`: Record user actions (start/stop)
- `recipe <action> "name"`: Save or load interaction patterns

## Usage Examples

### Basic Navigation
```typescript
await Stepper('navto https://example.com');
await Stepper('waitfor quiet');
```

### Form Interaction
```typescript
await Stepper('type #username "myuser"');
await Stepper('type #password "mypass"');
await Stepper('click #submit');
```

### Advanced Waiting and Input
```typescript
// Wait for an element to disappear
await Stepper('waitforelementgone #loading-spinner 10000');

// Wait for page to be stable (no DOM changes for 500ms)
await Stepper('waitforstable 500');

// Send special keys to an element
await Stepper('sendkeys #searchbox "Hello world"');
```

### Element Discovery
```typescript
await Stepper('getattribute #login-form action');
await Stepper('getcomputedstyle #submit-button background-color');
```

### Page Monitoring
```typescript
await Stepper('changes on');
// Perform actions
const changes = await Stepper('changes request');
```

## Best Practices
1. Always use `waitfor` after navigation or significant page changes
2. Use `changes` monitoring for dynamic content
3. Combine commands for complex interactions
4. Use timeouts appropriately for network-dependent operations

## Error Handling
- Invalid commands throw errors with descriptive messages
- Element not found errors include selector information
- Network timeouts can be configured per command

## Integration
Stepper can be used in:
- Browser extensions
- Testing frameworks
- Web automation tools
- User interaction recording 