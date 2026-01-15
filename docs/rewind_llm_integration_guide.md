# Rewind LLM Integration Guide

## Overview
This guide explains how to enable LLMs to navigate and extract recordings from the Rewind application using the YeshieHead automation framework.

## Architecture

### Core Components

1. **rewind.py** - Original low-level Rewind control module
2. **rewind_llm_interface.py** - High-level LLM-friendly API
3. **rewind_navigator.py** - Advanced navigation with OCR and visual detection
4. **controller.py** - Native macOS event injection

## Usage Examples

### Basic Commands for LLMs

```python
from rewind_navigator import RewindLLMCommands

commands = RewindLLMCommands()

# Open Rewind
commands.open_rewind()

# Search for content
results = commands.find_content("meeting with Sarah about API design")

# Navigate to specific time
commands.go_to_time("December 19, 2023 3:00 PM")

# Extract a recording
commands.extract_meeting("sprint planning session", "sprint_planning.mp4")

# Extract last hour
commands.extract_last_hour("recent_work.mp4")

# Close Rewind
commands.close_rewind()
```

### Natural Language Processing

```python
from rewind_llm_interface import RewindCommandParser, RewindLLMInterface

interface = RewindLLMInterface()
parser = RewindCommandParser(interface)

# Parse natural language commands
result = parser.parse_and_execute("find the meeting with John about Q4 planning")
result = parser.parse_and_execute("extract recording from 2pm to 3pm yesterday")
```

### Advanced Navigation

```python
from rewind_navigator import RewindNavigator, RewindRecordingExtractor

navigator = RewindNavigator()
extractor = RewindRecordingExtractor(navigator)

# Detect UI elements dynamically
ui_elements = navigator.detect_ui_elements()

# Search with OCR parsing
search_results = navigator.search_in_rewind("code review session")

# Extract specific time range
from datetime import datetime
start = datetime(2023, 12, 19, 14, 0)  # 2:00 PM
end = datetime(2023, 12, 19, 15, 30)   # 3:30 PM
extractor.extract_time_range(start, end, "afternoon_session.mp4")
```

## LLM Prompt Examples

### Finding Specific Events

```
"I need to find and extract the recording of the product roadmap meeting from last Tuesday where we discussed the Q1 features."

Steps:
1. Open Rewind
2. Search for "product roadmap Q1 features"
3. Look through results for Tuesday's date
4. Extract the recording
```

### Time-Based Extraction

```
"Extract everything from my workday yesterday between 9 AM and 12 PM."

Steps:
1. Calculate yesterday's date
2. Navigate to 9 AM yesterday
3. Set extraction range to 9 AM - 12 PM
4. Export as video
```

### Batch Processing

```
"Find and extract all my one-on-one meetings from this week."

Steps:
1. Search for "one-on-one" or "1:1"
2. Filter results by this week's dates
3. Extract each meeting with 5 minutes context
```

## Integration with LLM Tools

### As an MCP Server Tool

```python
def rewind_extract_recording(query: str, output_format: str = "video") -> dict:
    """
    MCP server tool for Rewind recording extraction.
    
    Args:
        query: Natural language description of what to extract
        output_format: Format for extraction (video, audio, transcript)
    
    Returns:
        Extraction result with file path
    """
    commands = RewindLLMCommands()
    
    # Parse query to determine action
    if "last hour" in query.lower():
        return commands.extract_last_hour()
    elif "meeting" in query.lower():
        # Extract meeting name from query
        meeting_name = extract_meeting_name(query)
        return commands.extract_meeting(meeting_name)
    else:
        # Search and extract
        results = commands.find_content(query)
        if results:
            return commands.extract_meeting(query)
    
    return {"status": "not_found", "query": query}
```

### With Claude Desktop or Other LLM Interfaces

```python
# In your LLM's tool configuration
tools = [
    {
        "name": "rewind_navigate",
        "description": "Navigate Rewind to find and extract recordings",
        "parameters": {
            "action": {
                "type": "string",
                "enum": ["search", "go_to_time", "extract_current", "extract_meeting"]
            },
            "query": {
                "type": "string",
                "description": "Search query or time specification"
            },
            "output_file": {
                "type": "string",
                "description": "Output filename for extractions"
            }
        }
    }
]
```

## Error Handling

```python
def safe_rewind_operation(operation_func, *args, **kwargs):
    """Wrapper for safe Rewind operations with error recovery."""
    try:
        result = operation_func(*args, **kwargs)
        return result
    except Exception as e:
        # Try to recover
        controller.playOne("press: esc")  # Exit any dialogs
        time.sleep(1)
        
        # Retry once
        try:
            result = operation_func(*args, **kwargs)
            return result
        except:
            # Close Rewind and report error
            controller.playOne("press: esc")
            return {
                "status": "error",
                "error": str(e),
                "recovery_attempted": True
            }
```

## Best Practices

1. **Always Open Rewind First**: Ensure Rewind is open before attempting operations
2. **Use Time Delays**: Add appropriate delays after actions for UI responsiveness
3. **Verify Actions**: Use OCR to verify that actions completed successfully
4. **Handle Failures Gracefully**: Implement retry logic and error recovery
5. **Clean Up**: Always close Rewind or return to a known state after operations

## Limitations and Considerations

1. **Screen Resolution**: UI element positions may vary with screen resolution
2. **Rewind Version**: Different Rewind versions may have different UI layouts
3. **Performance**: OCR operations can be CPU-intensive
4. **Privacy**: Be mindful of extracting sensitive content

## Future Enhancements

1. **Machine Learning**: Train models to better identify UI elements
2. **Voice Commands**: Integrate with speech recognition for voice control
3. **Scheduled Extraction**: Automate regular extraction tasks
4. **Cloud Integration**: Upload extracted recordings to cloud storage
5. **Transcript Processing**: Parse and analyze extracted transcripts

## Example LLM Workflow Script

```python
# Complete workflow for LLM-driven Rewind automation
def llm_rewind_workflow(task_description: str):
    """
    Complete workflow for processing a Rewind task.
    
    Example task: "Find yesterday's design review meeting and create a 
                   highlight reel of the key decisions"
    """
    commands = RewindLLMCommands()
    
    # Step 1: Open Rewind
    print("Opening Rewind...")
    commands.open_rewind()
    
    # Step 2: Parse the task
    if "yesterday" in task_description:
        # Navigate to yesterday
        from datetime import datetime, timedelta
        yesterday = datetime.now() - timedelta(days=1)
        commands.go_to_time(yesterday.strftime("%B %d, %Y 9:00 AM"))
    
    # Step 3: Search for content
    search_terms = extract_search_terms(task_description)
    all_results = []
    
    for term in search_terms:
        results = commands.find_content(term)
        all_results.extend(results)
    
    # Step 4: Process results
    if all_results:
        # Extract relevant segments
        for i, result in enumerate(all_results):
            output_file = f"segment_{i}_{result['timestamp']}.mp4"
            commands.extract_meeting(result['text'], output_file)
    
    # Step 5: Clean up
    commands.close_rewind()
    
    return {
        "task": task_description,
        "results_found": len(all_results),
        "segments_extracted": len(all_results)
    }
```