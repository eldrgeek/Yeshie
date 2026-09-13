# Stories Needing Manual Download

These 5 stories exist only as Gmail .docx attachments. Gmail's attachment DOM is sandboxed in
iframes — Yeshie cannot click the download button programmatically. Mike needs to manually
download these to ~/Downloads/ (or save to Google Drive).

| Story | Gmail Thread | Attachment Filename | Date Sent |
|-------|-------------|---------------------|-----------|
| Cattle Baron | 19d13b8702593fac | Cattle_Baron_Final.docx | Mar 22, 2026 |
| Keeping Bees | 19da29a292296bc4 | Keeping Bees.docx | Apr 18, 2026 |
| Twins | 19da29b4a663fcc2 | Twins.docx | Apr 18, 2026 |
| Koochie | 19da29aadf3309e2 | Koochie.docx | Apr 18, 2026 |
| Auto Mechanic | 19e0d2f8165c97c4 | Im Just Like an Auto Mechanic.docx | May 9, 2026 |

## How to Download

In Gmail, open each email, hover over the attachment, and click the download arrow.
Or save them to Google Drive and they'll be accessible via the Drive MCP.

## After Downloading

Once files are in ~/Downloads/, run:
```bash
python3 ~/Projects/yeshie/scripts/extract-docx.py ~/Downloads/Cattle_Baron_Final.docx
```

Then create a draft with the markinpc-substack skill.
