# slack-thread-json

Chrome extension that extracts the contents of a Slack thread and copies it as JSON to your clipboard.

## Install

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked** and select the `slack-thread-json` folder
5. The extension icon will appear in your toolbar — pin it for easy access

## Usage

1. Navigate to any Slack workspace
2. Open a thread by clicking a message with replies
3. Click the extension icon — it will scan the full thread (you'll see it scroll through)
4. Click **Copy JSON** to copy the thread to your clipboard

## JSON Format

```json
{
  "thread": {
    "messages": [
      {
        "author": "Jane Doe",
        "timestamp": "2026-02-21T10:30:00.000Z",
        "text": "Plain text content of the message"
      }
    ]
  }
}
```

## Notes

- Slack uses a virtualized list, so the extension scrolls through the thread to capture all messages. This takes a few seconds on longer threads.
- Emoji are converted to their `:shortcode:` format.
- `(edited)` labels are stripped from message text.
- Consecutive messages from the same author (compact messages) are attributed correctly.

## License

This is free and unencumbered software released into the public domain. See [LICENSE](LICENSE) for details.
