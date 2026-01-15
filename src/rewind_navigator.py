import time
import pyautogui
import pytesseract
from PIL import Image
import numpy as np
from typing import List, Dict, Tuple, Optional
import controller
from rewind import getRewind
import re
from datetime import datetime, timedelta

class RewindNavigator:
    """Advanced navigation system for Rewind with OCR and visual detection."""
    
    def __init__(self):
        self.rewind = getRewind()
        self.screen_width, self.screen_height = pyautogui.size()
        self.timeline_region = None  # Will be detected dynamically
        
    def detect_ui_elements(self) -> Dict[str, Tuple[int, int]]:
        """Detect UI elements using screenshot and OCR."""
        # Take screenshot
        screenshot = pyautogui.screenshot()
        
        # Convert to format suitable for OCR
        screenshot_np = np.array(screenshot)
        
        # Detect common UI elements
        elements = {
            "timeline": self._find_timeline(screenshot_np),
            "search_box": self._find_search_box(screenshot_np),
            "playback_controls": self._find_playback_controls(screenshot_np),
            "export_button": self._find_export_button(screenshot_np)
        }
        
        return elements
    
    def search_in_rewind(self, search_term: str) -> List[Dict]:
        """Use Rewind's search functionality to find content."""
        # Find and click search box
        elements = self.detect_ui_elements()
        
        if elements["search_box"]:
            # Click search box
            controller.playOne(f"click: left {elements['search_box']}")
            time.sleep(0.5)
            
            # Clear existing search
            controller.playOne("press: cmd-a")
            controller.playOne("press: backspace")
            
            # Type search term
            controller.playOne(f"type: {search_term}")
            time.sleep(0.5)
            
            # Press enter to search
            controller.playOne("press: enter")
            time.sleep(2)  # Wait for results
            
            # Capture and parse results
            results = self._capture_search_results()
            return results
        
        return []
    
    def navigate_to_date(self, target_date: datetime):
        """Navigate to a specific date/time in Rewind."""
        # Use keyboard shortcuts or timeline navigation
        # Rewind might support date navigation shortcuts
        
        # Try using search with date
        date_str = target_date.strftime("%B %d, %Y")
        self.search_in_rewind(date_str)
    
    def scrub_timeline(self, direction: str, duration_seconds: float):
        """Scrub through timeline in specified direction."""
        if direction == "forward":
            # Hold right arrow for duration
            pyautogui.keyDown('right')
            time.sleep(duration_seconds)
            pyautogui.keyUp('right')
        elif direction == "backward":
            # Hold left arrow for duration
            pyautogui.keyDown('left')
            time.sleep(duration_seconds)
            pyautogui.keyUp('left')
    
    def set_playback_speed(self, speed: float):
        """Set playback speed (1x, 2x, etc)."""
        # Map speed to number of up/down presses
        current_speed = 1.0
        target_presses = int((speed - current_speed) * 2)  # Assuming 0.5x increments
        
        if target_presses > 0:
            for _ in range(target_presses):
                controller.playOne("press: up")
                time.sleep(0.2)
        else:
            for _ in range(abs(target_presses)):
                controller.playOne("press: down")
                time.sleep(0.2)
    
    def _find_timeline(self, screenshot: np.ndarray) -> Optional[Tuple[int, int]]:
        """Find timeline element in screenshot."""
        # Look for timeline at bottom of screen
        # This is a simplified version - would need actual visual detection
        timeline_y = self.screen_height - 100  # Approximate
        timeline_x = self.screen_width // 2
        return (timeline_x, timeline_y)
    
    def _find_search_box(self, screenshot: np.ndarray) -> Optional[Tuple[int, int]]:
        """Find search box using OCR or visual patterns."""
        # Use OCR to find search icon or text
        # This is placeholder - would need actual implementation
        return None
    
    def _find_playback_controls(self, screenshot: np.ndarray) -> Optional[Tuple[int, int]]:
        """Find playback control buttons."""
        # Look for play/pause button patterns
        return None
    
    def _find_export_button(self, screenshot: np.ndarray) -> Optional[Tuple[int, int]]:
        """Find export/save button."""
        # Look for export button or three dots menu
        return (1454, 852)  # From the UI actions file
    
    def _capture_search_results(self) -> List[Dict]:
        """Capture and parse search results using OCR."""
        # Take screenshot of results area
        results_region = (100, 200, self.screen_width - 200, self.screen_height - 300)
        screenshot = pyautogui.screenshot(region=results_region)
        
        # OCR the results
        text = pytesseract.image_to_string(screenshot)
        
        # Parse results into structured format
        results = []
        lines = text.split('\n')
        
        for i, line in enumerate(lines):
            if line.strip():
                # Look for timestamp patterns
                timestamp_match = re.search(r'(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)', line)
                if timestamp_match:
                    results.append({
                        "text": line.strip(),
                        "timestamp": timestamp_match.group(1),
                        "line_number": i,
                        "y_position": 200 + (i * 30)  # Approximate
                    })
        
        return results

class RewindRecordingExtractor:
    """Handle extraction of recordings from Rewind."""
    
    def __init__(self, navigator: RewindNavigator):
        self.navigator = navigator
        self.rewind = getRewind()
    
    def extract_current_view(self, output_path: str, format: str = "video") -> Dict:
        """Extract the current view as video/audio/transcript."""
        result = {
            "status": "starting_extraction",
            "format": format,
            "output_path": output_path
        }
        
        # Open export menu
        controller.playOne("click: left (1454.9921875, 852.53125)")  # Three dots
        time.sleep(0.5)
        
        # Select export option based on format
        if format == "video":
            # Look for video export option
            self._select_export_option("Export Video")
        elif format == "audio":
            self._select_export_option("Export Audio")
        elif format == "transcript":
            self._select_export_option("Export Transcript")
        
        # Handle save dialog
        time.sleep(1)
        controller.playOne(f"type: {output_path}")
        time.sleep(0.5)
        controller.playOne("press: enter")
        
        result["status"] = "extraction_initiated"
        return result
    
    def extract_time_range(self, start_time: datetime, end_time: datetime, 
                          output_path: str, format: str = "video") -> Dict:
        """Extract a specific time range."""
        # Navigate to start time
        self.navigator.navigate_to_date(start_time)
        time.sleep(2)
        
        # Set selection start
        self._set_selection_start()
        
        # Navigate to end time
        duration = (end_time - start_time).total_seconds()
        self.navigator.scrub_timeline("forward", duration / 60)  # Rough approximation
        
        # Set selection end
        self._set_selection_end()
        
        # Extract selection
        return self.extract_current_view(output_path, format)
    
    def _select_export_option(self, option_text: str):
        """Select an export option from menu using OCR."""
        # Take screenshot of menu area
        menu_screenshot = pyautogui.screenshot(region=(1200, 600, 400, 400))
        
        # OCR to find option
        text = pytesseract.image_to_string(menu_screenshot)
        
        # Find option and click it
        # This is simplified - would need actual position detection
        if option_text.lower() in text.lower():
            # Click approximate position
            controller.playOne("click: left (1350, 700)")
    
    def _set_selection_start(self):
        """Mark the start of a selection."""
        # This might involve clicking on timeline or using keyboard shortcut
        controller.playOne("press: i")  # Hypothetical shortcut for "in point"
    
    def _set_selection_end(self):
        """Mark the end of a selection."""
        controller.playOne("press: o")  # Hypothetical shortcut for "out point"

# LLM-friendly wrapper functions
class RewindLLMCommands:
    """Simple commands for LLMs to use."""
    
    def __init__(self):
        self.navigator = RewindNavigator()
        self.extractor = RewindRecordingExtractor(self.navigator)
        self.rewind = getRewind()
    
    def open_rewind(self):
        """Open Rewind application."""
        self.rewind.start()
        time.sleep(2)
        return "Rewind opened"
    
    def close_rewind(self):
        """Close Rewind application."""
        controller.playOne("press: esc")
        return "Rewind closed"
    
    def find_content(self, search_term: str) -> List[Dict]:
        """
        Find content in Rewind by searching.
        
        Example: find_content("meeting with John about Q4")
        """
        self.open_rewind()
        results = self.navigator.search_in_rewind(search_term)
        return results
    
    def go_to_time(self, time_str: str):
        """
        Navigate to a specific time.
        
        Example: go_to_time("December 20, 2023 2:30 PM")
        """
        target_time = datetime.strptime(time_str, "%B %d, %Y %I:%M %p")
        self.navigator.navigate_to_date(target_time)
        return f"Navigated to {time_str}"
    
    def extract_last_hour(self, output_file: str = "last_hour_recording.mp4"):
        """Extract the last hour of recording."""
        end_time = datetime.now()
        start_time = end_time - timedelta(hours=1)
        
        self.open_rewind()
        result = self.extractor.extract_time_range(
            start_time, end_time, output_file, "video"
        )
        return result
    
    def extract_meeting(self, meeting_name: str, output_file: str = None):
        """
        Find and extract a specific meeting.
        
        Example: extract_meeting("Product roadmap discussion")
        """
        if not output_file:
            output_file = f"{meeting_name.replace(' ', '_')}.mp4"
        
        # Find the meeting
        results = self.find_content(meeting_name)
        
        if results:
            # Click on first result
            first_result = results[0]
            controller.playOne(f"click: left (400, {first_result['y_position']})")
            time.sleep(1)
            
            # Extract it
            return self.extractor.extract_current_view(output_file)
        
        return {"status": "not_found", "search_term": meeting_name}
    
    def quick_capture_moment(self) -> str:
        """Quickly capture the current moment's timestamp."""
        self.rewind._captureMoment()
        clipboard = pyperclip.paste()
        return f"Captured moment: {clipboard}"

# Example usage for LLMs
def example_llm_workflow():
    """Example of how an LLM would use these tools."""
    commands = RewindLLMCommands()
    
    # Example 1: Find and extract a meeting
    print("Finding product meeting...")
    results = commands.find_content("product roadmap meeting with engineering")
    print(f"Found {len(results)} results")
    
    if results:
        print("Extracting first result...")
        extraction = commands.extract_meeting("product roadmap meeting", "product_meeting.mp4")
        print(f"Extraction status: {extraction['status']}")
    
    # Example 2: Extract a specific time range
    print("Extracting last 2 hours...")
    commands.go_to_time("December 20, 2023 2:00 PM")
    time.sleep(2)
    
    # Example 3: Quick moment capture
    moment = commands.quick_capture_moment()
    print(f"Captured: {moment}")
    
    # Close when done
    commands.close_rewind()

if __name__ == "__main__":
    # Test the navigation system
    example_llm_workflow()