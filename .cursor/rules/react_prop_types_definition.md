**Rule Name**: `react-prop-types-definition`
**Applies to**: TypeScript, React (`.tsx` files)
**Description**: For React component props, especially for function handlers or complex object shapes, define types or interfaces separately rather than using inline anonymous type definitions. This improves code readability, type reusability, and can help prevent common errors and unnecessary re-renders.

**Good Example**:
```typescript
// Define the type for the report
type ReportData = {
  type: "bug" | "feature";
  title: string;
  description: string;
};

// Define props for the component
interface ReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (report: ReportData) => void;
}

const ReportDialog: React.FC<ReportDialogProps> = ({ isOpen, onClose, onSubmit }) => { /* ... */ };

// In Yeshie.tsx
const handleReportSubmit = async (report: ReportData) => { /* ... */ };
<ReportDialog onSubmit={handleReportSubmit} /* ...other props... */ />
```

**Bad Example**:
```typescript
// Inline type definition in the component consuming ReportDialog
<ReportDialog
  isOpen={showReportDialog}
  onClose={() => setShowReportDialog(false)}
  onSubmit={(report: { type: "bug" | "feature"; title: string; description: string; }) => {
    // logic for handling report
  }}
/>

// Or, inline prop type definition within ReportDialog component
const ReportDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (report: { type: "bug" | "feature"; title: string; description: string; }) => void;
}> = ({ /* ... */ }) => { /* ... */ };
``` 