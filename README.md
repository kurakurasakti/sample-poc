<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/37398e81-e63f-47e0-b909-e65131bcefde

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install --legacy-peer-deps`
2. Copy `firebase-applet-config.example.json` to `firebase-applet-config.json` and fill in your Firebase project settings
3. Set the `GEMINI_API_KEY` in [.env.local](.env.local) if needed for AI features
4. Run the app:
   `npm run dev`
