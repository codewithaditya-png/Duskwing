# Duskwing

Duskwing is a one-button browser arcade game. Guide a firebird through floating crystal gates over a twilight mountain range. Each gate earns one point. The game speeds up, the gaps narrow, and your browser remembers your best score.

## Play locally

Open `index.html` in a modern browser. The game uses plain HTML, CSS and JavaScript with Canvas and Web Audio.

| Action | Control |
| --- | --- |
| Start, flap or retry | Space, ↑, or tap the sky |
| Pause or resume | P, Escape, or the toolbar button |
| Toggle sound | Sound button |

## Publish on GitHub Pages

1. Create a public GitHub repository named `duskwing`.
2. Upload the contents of this project to the repository root, so `index.html` is at the top level of the `main` branch.
3. In the repository, open **Settings → Pages** and choose **Deploy from a branch**.
4. Select **main** and **/(root)**, then save. Once deployed, the Pages settings show the live game URL.

## Project files

- `index.html` defines the scoreboard, game canvas and controls.
- `styles.css` handles layout and responsive styling.
- `game.js` handles drawing, gameplay, keyboard and touch input, sound and saved scores.
