**Rule Name**: `react-functional-setstate`
**Applies to**: TypeScript, React (`.tsx` files using `useState` or `useReducer`)
**Description**: When updating React state that depends on the previous state value, always use the functional update form of the `setState` function (e.g., `setMyState(prevState => prevState + 1)` or `setContext(prevContext => ({ ...prevContext, ...newPart }))`). This ensures that the update is based on the most current state, avoiding potential issues with stale closures, especially within `useEffect`, `useCallback`, or when updates might be batched.

**Good Example**:
```typescript
const [count, setCount] = useState(0);
const [userSettings, setUserSettings] = useState({ theme: 'light', notifications: true });

const increment = () => {
  setCount(prevCount => prevCount + 1); // Correct
};

const toggleNotifications = useCallback(() => {
  setUserSettings(prevSettings => ({ // Correct
    ...prevSettings,
    notifications: !prevSettings.notifications
  }));
}, []);
```

**Bad Example**:
```typescript
const [count, setCount] = useState(0);

const incrementThreeTimes = () => {
  setCount(count + 1); // Potentially stale `count` if called rapidly or batched
  setCount(count + 1); // Still uses the same initial `count` from the render closure
  setCount(count + 1);
};

// If this callback is memoized without count in deps, it will have a stale closure for count
const updateSomething = useCallback(() => {
    // ... some logic
    // setUserSettings({ ...userSettings, lastUpdated: new Date() }); // Stale userSettings
}, [/* other deps, but not userSettings */]);
``` 