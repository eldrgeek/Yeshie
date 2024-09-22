// Define the Stepper function
import html2canvas from "html2canvas";
const Stepper = (step: string) => {


  const performCommand = (command: string) => {

    const regex = /^\s*(\w+)\s*[:]?\s*"?([^",]+)"?\s*(?:,\s*"?(.*?)\s*"?)?$/;
    let match = command.match(regex);
    if (!match) {
      if (command != 'screenshot') {
        const err = `Command format is incorrect ${command}`
        console.error(err);
        return err;
      } else {
        match = ["screenshot"]
      }
    }

    const action = match[1];
    let selector = match[2];
    let value = match[3] || '';

    const getElement = (selector, value) => {
      if (!value) {
        return document.querySelector(selector)
      }



      let elements = document.querySelectorAll(selector);
      let targetElement = Array.from(elements).find(el => el.textContent.trim() === value);
      return (targetElement)
    }

    // Strip surrounding quotes from selector and value
    selector = selector.replace(/^["']|["']$/g, '');
    value = value.replace(/^["']|["']$/g, '');

    console.log("ASV", action, selector, value);

    switch (action.toLowerCase()) {
      case 'navto':
        window.location.href = selector;
        break;
      case 'click':
        const clickable = getElement(selector, value) as HTMLElement;
        clickable?.click();
        break;
      case 'select':
        const selectable = document.querySelector(selector) as HTMLElement;
        selectable?.focus();
        break;
      case 'setvalue':
        const inputElement = document.querySelector(selector) as HTMLInputElement;
        inputElement.value = value;
        break;
      case 'enable':
        const buttonElement = document.querySelector(selector) as HTMLButtonElement;
        buttonElement.disabled = false;
        break;
      case 'screenshot':
        console.log("screenshot")
     
        console.log(html2canvas)
        // html2canvas(document.querySelector("body"))
        //   .then(canvas => {
        //     console.log("got it!!")
        //     let xyc = canvas
        //     document.body.appendChild(canvas)
        //   })
        //   .catch((e) => { console.log("error", e) });
        chrome.runtime.sendMessage({ action: "screenshot" }, (response) => {
          console.log(response);
        });
        return "captured"
      default:
        return (`Action ${action} is not recognized.`);
    }
  };

  // Execute the command
  console.log("STEP", step)
  return performCommand(step);
};

export { Stepper };
