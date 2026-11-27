# Yeshie privacy policy

_Effective 2026-11-17. Applies to the Yeshie extension for Chrome, version 1.0.0 and later, published by SoMA Studios. Written by Claude Opus 5.5 for Mike Wolf, who owns the extension and approves this text._

## In one paragraph

Yeshie runs web tasks in your Chrome for an AI assistant or script that runs **on your own computer**. It talks only to a companion program on your computer (the Yeshie relay, at `http://localhost:3333`). It has no server of its own, sends nothing to SoMA Studios or anyone else, shows no ads, and sells nothing.

## What Yeshie reads, and where it goes

| Data | When | Where it goes |
| --- | --- | --- |
| The address and title of your open tabs | While Yeshie is connected to the relay | The relay on your computer, so it can pick the tab a task should run in |
| Page content a task reads (for example the text of a confirmation message) | Only while a task you or your assistant started is running, and only the parts the task names | The relay on your computer, as the task's result |
| Your Chrome account's email address | When Yeshie connects to the relay | The relay on your computer, so it can tell your Chrome profiles apart |
| Clicks and typing on the page, with the field's label | Only while you are recording (the red **● REC** badge shows on the page; ⌃⇧R or Ctrl+Shift+Y starts and stops it). Password fields are never recorded | The relay on your computer, and a recorder on your computer if one is running, to turn your steps into a reusable guide |
| Messages you type in Yeshie's side panel | When you send one | The relay on your computer, which passes it to the assistant you run there |

The relay and any assistant you connect to it are programs you install and run yourself. What they do with this data is set by those programs and the services you choose for them. If you connect an assistant that uses an online AI service, that service's own privacy policy applies to what you send it.

## What Yeshie stores in Chrome

A random ID for this Chrome profile, an optional profile name you set, the logo you chose for Yeshie (including a picture you uploaded), and the state of a running task or guide, kept in Chrome's extension storage on your computer. Removing the extension deletes them.

## What Yeshie never does

- It sends nothing to any server on the internet. Every connection it makes is to your own computer.
- It does not use your data for advertising, sell it, or transfer it to anyone.
- It does not use your data to decide credit or lending.
- It does not run code downloaded from the internet. Tasks are data (which button to click, what to type) carried out by code that ships inside the extension.

The logo picker has a link to a SOMA web page where you can vote for a favourite logo or send one you made. Yeshie does not send anything there; the page sends only what you choose on it, in your browser like any other website.

## Permissions

Yeshie asks to read and change data on all websites, and to use Chrome's debugger, because the tasks it runs can be on any site, and some sites accept only real keystrokes and clicks, which Chrome provides through its debugger. Chrome shows a bar saying Yeshie is debugging the tab while it types or clicks that way.

## Contact

Questions or requests: open an issue at <https://github.com/eldrgeek/Yeshie/issues>. Changes to this policy are dated here and recorded in the repository's history.
