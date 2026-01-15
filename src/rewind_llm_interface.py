import time
import re
import pyperclip
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import controller
from rewind import getRewind
import monitor

class RewindLLMInterface:
    """High-level interface for LLMs to control Rewind application."""
    
    def __init__(self):
        self.rewind = getRewind()
        self.current_timestamp = None
        self.search_mode = None
        
    def navigate_to_event(self, event_description: str, time_range: Optional[Dict] = None) -> Dict:
        """
        Navigate to a specific event in Rewind based on natural language description.
        
        Args:
            event_description: Natural language description of the event (e.g., "meeting with John about Q4 planning")
            time_range: Optional dict with 'start' and 'end' datetime objects to narrow search
            
        Returns:
            Dict with status and extracted recording information
        """
        result = {
            "status": "searching",
            "event_description": event_description,
            "found_events": [],
            "extracted_recording": None
        }
        
        # Open Rewind
        self.rewind.start()
        time.sleep(2)  # Wait for Rewind to fully open
        
        # If time range specified, navigate to that timeframe first
        if time_range:
            self._navigate_to_timeframe(time_range)
        
        # Search for the event using visual cues and OCR
        # This would require integration with OCR tools to read screen content
        found_events = self._search_for_event(event_description)
        result["found_events"] = found_events
        
        if found_events:
            # Navigate to the most relevant event
            self._select_event(found_events[0])
            result["status"] = "found"
            
            # Extract recording
            recording_info = self._extract_recording()
            result["extracted_recording"] = recording_info
        else:
            result["status"] = "not_found"
            
        return result
    
    def extract_time_period(self, start_time: datetime, end_time: datetime, 
                          output_format: str = "video") -> Dict:
        """
        Extract a recording for a specific time period.
        
        Args:
            start_time: Start datetime for extraction
            end_time: End datetime for extraction
            output_format: Format for extraction (video, audio, transcript)
            
        Returns:
            Dict with extraction status and file path
        """
        self.rewind.start()
        time.sleep(2)
        
        # Navigate to start time
        self._navigate_to_specific_time(start_time)
        
        # Set selection range
        self._set_selection_range(start_time, end_time)
        
        # Extract in requested format
        extraction_result = self._perform_extraction(output_format)
        
        return extraction_result
    
    def search_and_extract(self, search_queries: List[str], 
                          context_minutes: int = 5) -> List[Dict]:
        """
        Search for multiple events and extract recordings with context.
        
        Args:
            search_queries: List of search terms/phrases
            context_minutes: Minutes of context before/after each event
            
        Returns:
            List of extraction results
        """
        results = []
        
        for query in search_queries:
            event_result = self.navigate_to_event(query)
            
            if event_result["status"] == "found":
                # Get timestamp of found event
                timestamp = event_result["found_events"][0]["timestamp"]
                
                # Calculate context window
                start_time = timestamp - timedelta(minutes=context_minutes)
                end_time = timestamp + timedelta(minutes=context_minutes)
                
                # Extract with context
                extraction = self.extract_time_period(start_time, end_time)
                results.append({
                    "query": query,
                    "timestamp": timestamp,
                    "extraction": extraction
                })
            else:
                results.append({
                    "query": query,
                    "status": "not_found"
                })
        
        return results
    
    def _navigate_to_timeframe(self, time_range: Dict):
        """Navigate to a specific timeframe in Rewind."""
        # Implementation would use keyboard shortcuts or click on timeline
        # to navigate to the specified time range
        pass
    
    def _search_for_event(self, description: str) -> List[Dict]:
        """Search for events matching the description."""
        # This would integrate with OCR to read screen content
        # and identify relevant events
        found_events = []
        
        # Placeholder for OCR integration
        # Would scan visible content and match against description
        
        return found_events
    
    def _select_event(self, event: Dict):
        """Select a specific event in Rewind."""
        # Click on the event or use keyboard navigation
        if "coordinates" in event:
            controller.playOne(f"click: left {event['coordinates']}")
    
    def _navigate_to_specific_time(self, target_time: datetime):
        """Navigate to a specific timestamp."""
        # Use timeline navigation or search functionality
        pass
    
    def _set_selection_range(self, start: datetime, end: datetime):
        """Set the selection range for extraction."""
        # Use drag operations on timeline or keyboard shortcuts
        pass
    
    def _perform_extraction(self, format: str) -> Dict:
        """Perform the actual extraction in the specified format."""
        # Click export/save options based on format
        result = {
            "format": format,
            "status": "extracting",
            "file_path": None
        }
        
        # Trigger extraction based on format
        if format == "video":
            # Navigate to export video option
            pass
        elif format == "transcript":
            # Navigate to transcript option
            pass
            
        return result
    
    def _extract_recording(self) -> Dict:
        """Extract recording information from current selection."""
        # Capture moment to get timestamp
        self.rewind._captureMoment()
        
        # Get clipboard content with timestamp
        clipboard_content = pyperclip.paste()
        match = re.search(r"timestamp=(\d+\.\d+)", clipboard_content)
        
        if match:
            timestamp = float(match.group(1))
            return {
                "timestamp": timestamp,
                "clipboard_content": clipboard_content
            }
        
        return None

# Natural Language Command Parser
class RewindCommandParser:
    """Parse natural language commands for Rewind operations."""
    
    def __init__(self, interface: RewindLLMInterface):
        self.interface = interface
        self.command_patterns = {
            "find_event": [
                r"find (?:the )?(.+?)(?:meeting|call|conversation|event)",
                r"search for (.+)",
                r"locate (.+)"
            ],
            "extract_period": [
                r"extract (?:recording )?from (.+) to (.+)",
                r"get (?:recording )?between (.+) and (.+)"
            ],
            "navigate_time": [
                r"go to (.+)",
                r"navigate to (.+)",
                r"jump to (.+)"
            ]
        }
    
    def parse_and_execute(self, command: str) -> Dict:
        """Parse natural language command and execute corresponding action."""
        command_lower = command.lower()
        
        # Check find event patterns
        for pattern in self.command_patterns["find_event"]:
            match = re.search(pattern, command_lower)
            if match:
                event_description = match.group(1)
                return self.interface.navigate_to_event(event_description)
        
        # Check extract period patterns
        for pattern in self.command_patterns["extract_period"]:
            match = re.search(pattern, command_lower)
            if match:
                # Parse time expressions (would need more sophisticated parsing)
                start_str = match.group(1)
                end_str = match.group(2)
                # Convert to datetime objects
                # ... parsing logic ...
                return {"status": "parsing_required", "start": start_str, "end": end_str}
        
        return {"status": "unknown_command", "command": command}

# Example usage functions for LLMs
def llm_find_and_extract_meeting(meeting_description: str) -> Dict:
    """
    High-level function for LLMs to find and extract a meeting recording.
    
    Example:
        result = llm_find_and_extract_meeting("product roadmap discussion with engineering team")
    """
    interface = RewindLLMInterface()
    parser = RewindCommandParser(interface)
    
    # Navigate to the meeting
    result = interface.navigate_to_event(meeting_description)
    
    if result["status"] == "found":
        # Extract with 10 minutes context
        extraction = interface.search_and_extract([meeting_description], context_minutes=10)
        return extraction[0]
    
    return result

def llm_extract_time_range(start_time_str: str, end_time_str: str, format: str = "video") -> Dict:
    """
    Extract recording for a specific time range.
    
    Example:
        result = llm_extract_time_range("2023-12-20 14:00", "2023-12-20 15:30", "video")
    """
    interface = RewindLLMInterface()
    
    # Parse time strings (would need proper parsing)
    start_time = datetime.strptime(start_time_str, "%Y-%m-%d %H:%M")
    end_time = datetime.strptime(end_time_str, "%Y-%m-%d %H:%M")
    
    return interface.extract_time_period(start_time, end_time, format)

def llm_batch_extract_events(event_list: List[str], output_dir: str = "./extractions") -> List[Dict]:
    """
    Extract multiple events in batch.
    
    Example:
        events = [
            "standup meeting Monday morning",
            "code review with Sarah",
            "customer call about bug report"
        ]
        results = llm_batch_extract_events(events)
    """
    interface = RewindLLMInterface()
    results = interface.search_and_extract(event_list, context_minutes=5)
    
    # Save results to output directory
    # ... save logic ...
    
    return results