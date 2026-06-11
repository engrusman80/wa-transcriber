<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/da60db97-d30e-4dd3-ab72-9ed38eaa7772

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. (Optional) Set the `GEMINI_API_KEY` in a `.env.local` file for live Gemini transcription. Without this, the app runs in free demo mode.
3. Run the app:
   `npm run dev`

> **Free Mode:** The app works out-of-the-box without an API key—responses are in demo/free mode. To enable live Gemini AI transcription, add your API key to `.env.local`.

## Deploy to Vercel

1. Install the Vercel CLI if you want local deployment control:
   `npm install -g vercel`
2. (Optional) Set `GEMINI_API_KEY` in your Vercel project Environment Variables. The app will run in free demo mode without it.
3. Deploy with:
   `vercel --prod`

> The Vercel deployment uses the `vercel-build` script to build the frontend and `api/transcribe.ts` as the serverless API route.
>
> Note: Vercel serverless functions have request body size limits, so extremely large multi-GB audio uploads may require a dedicated backend or chunked upload flow.
