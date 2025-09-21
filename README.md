
# Meet App

A real-time video meeting application built with **Next.js**, **React**, and **Mux Real-Time API**.  
This project allows users to create and join video spaces, providing a smooth and scalable video meeting experience.

---

## Features

- Create and join real-time video meeting spaces
- Limit the number of active spaces
- Environment-based configuration for tokens and space duration
- Mux integration for video streaming and real-time communication
- Webhook support for monitoring space events
- Clean and responsive UI

---

## Tech Stack

- **Frontend:** React, Next.js, Tailwind CSS  
- **Backend:** Next.js API Routes, Axios  
- **Video & Streaming:** Mux Real-Time API  
- **State Management:** React Query  
- **Environment Variables:** `.env.local` for sensitive credentials

---

## Installation

1. Clone the repository:

```bash
https://github.com/BalaprakashS/Bala-Mama-Meet
cd your-repo
````

2. Install dependencies:

```bash
npm install
# or
yarn install
```

3. Create a `.env.local` file in the root directory and add your credentials:

```env
MUX_TOKEN_ID=your_mux_token_id
MUX_TOKEN_SECRET=your_mux_token_secret
MUX_SIGNING_KEY=your_mux_signing_key
MUX_PRIVATE_KEY="your_mux_private_key"
WEBHOOK_SECRET=your_webhook_secret
ACTIVE_SPACE_LIMIT=3
SPACE_DURATION_SECONDS=7200
```

4. Run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Usage

* Click **Create Space** to start a new meeting room
* Share the space link with participants to join
* Spaces automatically expire based on `SPACE_DURATION_SECONDS`

---

## Contributing

Contributions are welcome!

1. Fork the repository
2. Create a new branch: `git checkout -b feature-name`
3. Make your changes
4. Commit: `git commit -m "Add new feature"`
5. Push: `git push origin feature-name`
6. Open a pull request

---
nt me to do that next?
```
