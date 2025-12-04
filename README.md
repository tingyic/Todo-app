# todo or not todo?

Well, we are all humans (well if you're a clanker this doesn't apply to you...for now). And as a human, we have a whole lotta tasks, and some of them have deadlines, and some may even recur periodically. 

Pretty sure you want to finish all of them asap (I hope you're that optimistic...if not, do try!), but no human is perfect, so we may have to sacrifice some tasks...**todo, or not todo?**

But how to choose? By <ins>priority</ins>, of course. High priority tasks like ***TURN OFF THE STOVE WITHIN 30 MINUTES*** surely cannot be ignored (please don't 🥺), but tasks like *clean your room* can (but ew! Please don't either!) 

Oh, you noticed the time? Yes, <ins>deadlines</ins> are important, and so are the <ins>reminders</ins> for them, so that you won't forget, and end up with a burnt kitchen...

And with that said, welcome to the app, I guess? I hope you enjoyed your stay here. Available on both [computer](https://github.com/tingyic/Todo-app/releases) or mobile [browsers](https://todo-app-fa41a.web.app/)! And as of v2.0, we are now available as a [desktop app (.exe)](https://github.com/tingyic/Todo-app/releases) too! There's something for everyone eh?

Regardless of where you're using from, we have shortcuts/ease of access for both mobile and desktop. Mobile users get to enjoy swipe functions and haptic feedbacks, and PC users get to have keyboard access (swipes are still available though, just not as significant than on phones hmm)

> [!TIP]
> Alright, fun intro's over, now time for more serious stuff



### Development setup (web)
```bash
npm install
npm run dev # to start the dev server

# on another terminal
cd server
node index.js # to start the backend
```

### Development setup (Electron)
```bash
npm run build # to build frontend first
npm run electron-dev # to start the Electron dev 
```

### Build desktop release
```bash
npm run dist
```

### Tech stack
```bash
Frontend: React, TypeScript, Vite
State Management: React hooks
Backend (Web): Express server on Render
Desktop: Electron
Build Tools: Electron Builder, Vite
```

