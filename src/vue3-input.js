// Vue 3 / Vuetify 3 compatible input setter
// To be injected via javascript_tool
// Works by simulating real keypresses through the ClaudeInChrome extension's
// ability to dispatch trusted-ish events in page context

window.__yeshieSetVue3 = async function(inputEl, value) {
  inputEl.focus();
  
  // Clear existing value
  inputEl.select();
  document.execCommand('selectAll');
  
  // Type character by character — Vue listens to individual keystrokes
  for (const char of value) {
    // beforeinput → input → keydown → keyup chain
    inputEl.dispatchEvent(new InputEvent('beforeinput', { 
      data: char, inputType: 'insertText', bubbles: true, cancelable: true 
    }));
    
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(inputEl, inputEl.value + char);
    
    inputEl.dispatchEvent(new InputEvent('input', { 
      data: char, inputType: 'insertText', bubbles: true 
    }));
    inputEl.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
  }
  
  inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  inputEl.blur();
  return inputEl.value;
};
